import { useState, useCallback, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  ClipboardList, AlertCircle, Clock, User, Monitor, CheckCircle2,
  XCircle, Info, Sparkles, Loader2, Timer, Layers,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ScreenMetaOverlay } from "@/components/ScreenMetaOverlay";
import { toast } from "sonner";
import { useScreenAudit } from "@/hooks/useScreenAudit";
// BusinessRulesButton is now integrated into ScreenMetaOverlay as Alt+4

// ── Types ─────────────────────────────────────────────────────────────────────

interface ErrorEntry {
  id: number;
  message: string;
  code?: string;
  user: string;
  timestamp: string;
  stack?: string;
  resolved: boolean;
}

interface ScreenHeaderProps {
  /** Unique screen identifier, e.g. "VFLSENEWLS0001P001" */
  screenId: string;
  /** Human-readable screen title */
  title: string;
  /** Optional subtitle / description */
  subtitle?: string;
  /** Optional icon to show next to the title */
  icon?: ReactNode;
  /** Optional extra actions to show in the header toolbar */
  actions?: ReactNode;
  /**
   * FORM FILL MODE — for wizard/form pages.
   * Provide formType + onAIFormFill.
   */
  formType?: string;
  onAIFormFill?: (data: Record<string, string>) => void;
  /**
   * LIST/SCREEN MODE — for table/list pages.
   * Provide screenType + onAIData.
   */
  screenType?: string;
  onAIData?: (rows: Record<string, unknown>[]) => void;

}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatElapsed(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1_000)}s`;
}

const ACTION_ICON: Record<string, ReactNode> = {
  SCREEN_ENTER: <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />,
  SCREEN_EXIT:  <Timer className="w-3.5 h-3.5 text-violet-400 shrink-0" />,
  default:      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
};

// ── AuditLogDrawer — wired to real tRPC ───────────────────────────────────────

function AuditLogDrawer({ screenId }: { screenId: string }) {
  const { data, isLoading } = trpc.compliance.getAuditLog.useQuery(
    { screenId, pageSize: 50 },
    { refetchOnWindowFocus: false }
  );
  const rows: any[] = data?.rows ?? [];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-border text-muted-foreground hover:text-foreground text-xs h-7 px-2"
          title="View audit log for this screen"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          Audit Log
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[440px] bg-[#111] border-l border-border p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b border-border bg-[#161616] shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="w-4 h-4 text-[#e60000]" />
            Audit Log — {screenId}
          </SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            All user actions on this screen, newest first
          </p>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-3">
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading audit log…
              </div>
            )}
            {!isLoading && rows.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                <ClipboardList className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                No audit entries recorded for this screen yet
              </div>
            )}
            {rows.map((row: any, i: number) => {
              // Compute elapsed time from process_start_time / process_end_time or after_state
              let elapsedLabel: string | null = null;
              if (row.process_start_time && row.process_end_time) {
                const ms = new Date(row.process_end_time).getTime() - new Date(row.process_start_time).getTime();
                if (ms >= 0) elapsedLabel = formatElapsed(ms);
              } else if (row.after_state) {
                try {
                  const parsed = typeof row.after_state === 'string' ? JSON.parse(row.after_state) : row.after_state;
                  if (parsed?.elapsedMs != null) elapsedLabel = formatElapsed(parsed.elapsedMs);
                } catch { /* ignore */ }
              }

              const actionType: string = row.action_type ?? 'default';
              const icon = ACTION_ICON[actionType] ?? ACTION_ICON['default'];
              const ts = row.created_at ?? row.timestamp_utc ?? '';

              return (
                <div key={row.audit_id ?? i}>
                  <div className="flex items-start gap-2.5">
                    {icon}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {actionType === 'SCREEN_ENTER' ? 'Screen entered'
                            : actionType === 'SCREEN_EXIT' ? 'Screen exited'
                            : (row.action_type ?? 'Action')}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {ts ? relativeTime(ts) : '—'}
                        </span>
                      </div>

                      {/* Record reference */}
                      {row.record_id && row.record_table && (
                        <span className="text-xs text-[#e60000] font-mono">
                          {row.record_table} · {row.record_id}
                        </span>
                      )}

                      {/* Elapsed time badge */}
                      {elapsedLabel && (
                        <span className="inline-flex items-center gap-1 text-xs text-violet-400 mt-0.5">
                          <Timer className="w-3 h-3" />
                          {elapsedLabel}
                        </span>
                      )}

                      {/* Outcome */}
                      {row.outcome && row.outcome !== 'Success' && (
                        <p className="text-xs text-amber-400 mt-0.5">{row.outcome}</p>
                      )}

                      <div className="flex items-center gap-1 mt-1">
                        <User className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{row.username ?? '—'}</span>
                        {ts && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(ts).toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {i < rows.length - 1 && <Separator className="mt-3 bg-border/50" />}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── ErrorLogDrawer ────────────────────────────────────────────────────────────

function ErrorLogDrawer({ screenId }: { screenId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.compliance.getErrorLog.useQuery(
    { screenId, pageSize: 50 },
    { refetchOnWindowFocus: false }
  );
  const resolveMutation = trpc.compliance.resolveError.useMutation({
    onSuccess: () => utils.compliance.getErrorLog.invalidate({ screenId }),
  });
  const entries: any[] = data?.rows ?? [];
  const unresolvedCount = entries.filter((e: any) => e.resolution_status !== 'Resolved').length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 text-xs h-7 px-2 ${
            unresolvedCount > 0
              ? "border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
          title="View error log for this screen"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          Errors
          {unresolvedCount > 0 && (
            <Badge className="ml-0.5 h-4 min-w-4 px-1 text-[10px] bg-red-500 text-white border-0">
              {unresolvedCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[440px] bg-[#111] border-l border-border p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b border-border bg-[#161616] shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="w-4 h-4 text-red-400" />
            Error Log — {screenId}
          </SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {unresolvedCount} unresolved · {entries.length} total
          </p>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-3">
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading error log...
              </div>
            )}
            {!isLoading && entries.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                No errors recorded for this screen
              </div>
            )}
            {entries.map((e: any, i: number) => {
              const resolved = e.resolution_status === 'Resolved';
              const userCtx = e.user_context ? (() => { try { return JSON.parse(e.user_context); } catch { return {}; } })() : {};
              return (
                <div key={e.error_id ?? i}>
                  <div className="flex items-start gap-2.5">
                    {resolved
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-sm font-medium ${resolved ? "text-muted-foreground" : "text-foreground"}`}>
                          {e.message}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{relativeTime(e.timestamp_utc)}
                        </span>
                      </div>
                      {e.error_code && (
                        <span className="text-xs font-mono text-amber-400">{e.error_code}</span>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <User className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{userCtx.username || userCtx.user || e.module}</span>
                        <Badge
                          className={`text-[10px] h-4 px-1.5 border-0 ${
                            resolved ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {resolved ? "Resolved" : "Open"}
                        </Badge>
                        {!resolved && (
                          <button
                            onClick={() => resolveMutation.mutate({ errorId: e.error_id })}
                            disabled={resolveMutation.isPending}
                            className="text-[10px] text-emerald-400 hover:text-emerald-300 underline ml-1 disabled:opacity-50"
                          >
                            {resolveMutation.isPending ? 'Resolving...' : 'Mark resolved'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {i < entries.length - 1 && <Separator className="mt-3 bg-border/50" />}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── GenAIButton — unified: form fill mode OR screen data mode ─────────────────

function GenAIButton({
  formType,
  onAIFormFill,
  screenType,
  onAIData,
}: {
  formType?: string;
  onAIFormFill?: (data: Record<string, string>) => void;
  screenType?: string;
  onAIData?: (rows: Record<string, unknown>[]) => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const fillFormMutation = trpc.aiFill.fillForm.useMutation();
  const generateScreenMutation = trpc.aiFill.generateScreenData.useMutation();
  const { data: aiHealth } = trpc.system.aiHealth.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const handleClick = async () => {
    setIsGenerating(true);
    try {
      if (aiHealth && !aiHealth.ok) {
        toast.error("Azure OpenAI is not ready", {
          description: aiHealth.missing?.length
            ? `Missing: ${aiHealth.missing.join(", ")}`
            : "Check Azure OpenAI configuration.",
        });
        return;
      }

      if (formType && onAIFormFill) {
        const result = await fillFormMutation.mutateAsync({ formType });
        onAIFormFill(result as Record<string, string>);
        toast.success("Gen AI filled the form with realistic data", {
          description: "Review the data and click Save when ready — nothing is stored yet.",
          duration: 5000,
        });
      } else if (screenType && onAIData) {
        const result = await generateScreenMutation.mutateAsync({ screenType });
        if (result.rows && result.rows.length > 0) {
          onAIData(result.rows as Record<string, unknown>[]);
          toast.success(`Gen AI generated ${result.rows.length} sample records`, {
            description: "Showing temporary demo data — not saved to database.",
            duration: 4000,
          });
        } else {
          toast.info("Gen AI returned no data for this screen type");
        }
      }
    } catch (err) {
      toast.error("Gen AI failed to generate data", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const isConfigured = (formType && onAIFormFill) || (screenType && onAIData);
  if (!isConfigured) return null;

  return (
    <Button
      onClick={handleClick}
      disabled={isGenerating || aiHealth?.ok === false}
      size="sm"
      className="gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 text-xs h-7 px-3 font-semibold shadow-md shadow-violet-900/30"
      title={
        aiHealth?.ok === false
          ? `Azure OpenAI not ready: ${aiHealth.missing?.join(", ") || "configuration missing"}`
          : formType ? "Fill this form with realistic AI-generated data" : "Generate realistic sample data for this screen"
      }
    >
      {isGenerating ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Sparkles className="w-3.5 h-3.5" />
      )}
      {isGenerating ? "Generating…" : "Gen AI"}
    </Button>
  );
}

// ── ScreenHeader (main export) ────────────────────────────────────────────────

/**
 * ScreenHeader — a standardised page header for every screen in VodaLease Enterprise.
 *
 * Features:
 * - Screen ID badge (e.g. VFLSENEWLS0001P001)
 * - Page title + optional icon and subtitle
 * - **Gen AI button** — generates realistic temporary sample data for the screen
 * - Audit Log drawer (real tRPC data, with elapsed time per visit)
 * - Error Log drawer (API/form errors with unresolved count badge)
 * - Optional extra action buttons
 * - Automatic screen visit logging via useScreenAudit hook
 *
 * Usage:
 *   <ScreenHeader
 *     screenId="VFLSENEWLS0001P001"
 *     title="Lease Register"
 *     subtitle="IFRS 16 active lease portfolio"
 *     icon={<FileText className="w-6 h-6 text-[#e60000]" />}
 *     screenType="lease_register"
 *     onAIData={(rows) => setLeases(rows)}
 *     actions={<Button>Export</Button>}
 *   />
 */
export function ScreenHeader({
  screenId,
  title,
  subtitle,
  icon,
  actions,
  formType,
  onAIFormFill,
  screenType,
  onAIData,
}: ScreenHeaderProps) {
  // Automatic visit logging — ENTER on mount, EXIT with elapsed ms on unmount
  useScreenAudit(screenId, title);

  // Alt Sequences button state (Alt+1 through Alt+4)
  const [altMode, setAltMode] = useState<1 | 2 | 3 | 4 | null>(null);
  const cycleAltMode = useCallback(() => {
    setAltMode(m => m === null ? 1 : m === 1 ? 2 : m === 2 ? 3 : m === 3 ? 4 : null);
  }, []);

  return (
    <div className="flex items-center justify-between gap-3 mb-2 py-1.5 px-0">
      {/* Left: title block */}
      <div className="flex items-center gap-2 min-w-0">
        {icon && (
          <div className="shrink-0 text-muted-foreground [&>svg]:w-4 [&>svg]:h-4">{icon}</div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="text-sm font-semibold text-foreground leading-tight">{title}</h1>
            <Badge
              variant="outline"
              className="font-mono text-[9px] px-1 py-0 h-4 border-border text-muted-foreground bg-muted/30 shrink-0"
            >
              <Monitor className="w-2 h-2 mr-0.5" />
              {screenId}
            </Badge>
          </div>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: toolbar */}
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        <GenAIButton formType={formType} onAIFormFill={onAIFormFill} screenType={screenType} onAIData={onAIData} />
        <AuditLogDrawer screenId={screenId} />
        <ErrorLogDrawer screenId={screenId} />
        {/* Alt Sequences button — shows SP/Tables, Standards, Techniques */}
        <Button
          variant="outline"
          size="sm"
          onClick={cycleAltMode}
          className={`gap-1.5 text-xs h-7 px-2 ${
            altMode
              ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 bg-amber-500/5"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
          title="View SPs/Tables, Standards, Techniques & Business Rules (Alt+1/2/3/4)"
        >
          <Layers className="w-3.5 h-3.5" />
          Alt Seq
        </Button>
        {actions}
      </div>
      <ScreenMetaOverlay screenId={screenId} screenTitle={title} externalMode={altMode} onExternalClose={() => setAltMode(null)} onExternalModeChange={(m) => setAltMode(m)} />
    </div>
  );
}

export default ScreenHeader;
