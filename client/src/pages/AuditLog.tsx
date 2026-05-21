/**
 * VodaLease Enterprise — Audit Log
 * Screen ID: VFCMPAUDIT0001P001
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Download, Shield, Clock, Monitor, User, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

function formatElapsed(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function elapsedColor(ms: number | null | undefined): string {
  if (!ms) return "text-muted-foreground";
  if (ms < 500) return "text-green-400";
  if (ms < 2000) return "text-amber-400";
  return "text-red-400";
}

function elapsedBg(ms: number | null | undefined): string {
  if (!ms) return "";
  if (ms < 500) return "bg-green-500/10 border border-green-500/20";
  if (ms < 2000) return "bg-amber-500/10 border border-amber-500/20";
  return "bg-red-500/10 border border-red-500/20";
}

export default function AuditLog() {
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [module, setModule]           = useState("all");
  const [actionType, setActionType]   = useState("all");
  const [screenIdFilter, setScreenIdFilter] = useState("");
  const [usernameFilter, setUsernameFilter] = useState("");
  const [page, setPage]               = useState(1);
  const PAGE_SIZE = 100;

  const { data, isLoading, refetch } = trpc.compliance.getAuditLog.useQuery({
    module:     module !== "all" ? module : undefined,
    actionType: actionType !== "all" ? actionType : undefined,
    screenId:   screenIdFilter.trim() || undefined,
    page,
    pageSize:   PAGE_SIZE,
  });

  const rows       = (data?.rows ?? []) as any[];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Client-side username filter
  const filteredRows = usernameFilter.trim()
    ? rows.filter(r => (r.username ?? "").toLowerCase().includes(usernameFilter.trim().toLowerCase()))
    : rows;

  // KPI summary
  const screenVisits = filteredRows.filter(r => r.action_type === 'SCREEN_ENTER' || r.action_type === 'SCREEN_EXIT').length;
  const dataActions  = filteredRows.filter(r => !['SCREEN_ENTER','SCREEN_EXIT'].includes(r.action_type)).length;
  const elapsedRows  = filteredRows.filter(r => r.elapsed_ms != null);
  const avgElapsed   = elapsedRows.length > 0
    ? elapsedRows.reduce((s: number, r: any) => s + Number(r.elapsed_ms || 0), 0) / elapsedRows.length
    : null;
  const slowRows     = elapsedRows.filter((r: any) => Number(r.elapsed_ms) > 2000).length;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <ScreenHeader
          screenId="VFCMPAUDIT0001P001"
          title="Audit Log"
          subtitle="Complete audit trail — screen ID, user, elapsed time, module, action"
          icon={<Shield className="h-6 w-6 text-blue-400" />}
          screenType="audit_log"
          onAIData={(r) => setAiRows(r)}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { refetch(); toast.info("Refreshed"); }}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast.info("Export coming soon")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </div>
          }
        />

        {/* KPI Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Entries",   value: totalCount,   icon: Activity, color: "text-blue-400",    bg: "bg-blue-500/10" },
            { label: "Screen Visits",   value: screenVisits, icon: Monitor,  color: "text-purple-400",  bg: "bg-purple-500/10" },
            { label: "Data Actions",    value: dataActions,  icon: Shield,   color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "Slow (>2s)",      value: slowRows,     icon: Clock,    color: "text-red-400",     bg: "bg-red-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className={`border-border/40 ${bg}`}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <div className={`text-xl font-bold ${color}`}>{value ?? "—"}</div>
                {label === "Slow (>2s)" && avgElapsed != null && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">avg {formatElapsed(avgElapsed)}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative">
                <Monitor className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Screen ID…"
                  value={screenIdFilter}
                  onChange={e => { setScreenIdFilter(e.target.value); setPage(1); }}
                  className="pl-8 h-9 w-52 font-mono text-xs"
                />
              </div>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Username…"
                  value={usernameFilter}
                  onChange={e => setUsernameFilter(e.target.value)}
                  className="pl-8 h-9 w-44 text-xs"
                />
              </div>
              <Select value={module} onValueChange={v => { setModule(v); setPage(1); }}>
                <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  <SelectItem value="Screen Navigation">Screen Navigation</SelectItem>
                  <SelectItem value="Lease">Lease</SelectItem>
                  <SelectItem value="Payables">Payables</SelectItem>
                  <SelectItem value="Workflow">Workflow</SelectItem>
                  <SelectItem value="Contract">Contract</SelectItem>
                  <SelectItem value="BankRecon">Bank Recon</SelectItem>
                  <SelectItem value="Frontend">Frontend</SelectItem>
                </SelectContent>
              </Select>
              <Select value={actionType} onValueChange={v => { setActionType(v); setPage(1); }}>
                <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Action Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="SCREEN_ENTER">Screen Enter</SelectItem>
                  <SelectItem value="SCREEN_EXIT">Screen Exit</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                  <SelectItem value="APPROVE">Approve</SelectItem>
                  <SelectItem value="REJECT">Reject</SelectItem>
                  <SelectItem value="POST_GL">Post GL</SelectItem>
                </SelectContent>
              </Select>
              {(screenIdFilter || usernameFilter || module !== "all" || actionType !== "all") && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setScreenIdFilter(""); setUsernameFilter(""); setModule("all"); setActionType("all"); setPage(1);
                }} className="text-muted-foreground h-9">
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Audit No</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Timestamp</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"><span className="flex items-center gap-1"><User className="h-3 w-3" /> User</span></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"><span className="flex items-center gap-1"><Monitor className="h-3 w-3" /> Screen ID</span></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Module</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Action</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Record</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Elapsed</span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No audit entries found.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row: any) => {
                      let elapsedMs = row.elapsed_ms;
                      if (elapsedMs == null && row.after_state) {
                        try {
                          const parsed = typeof row.after_state === 'string' ? JSON.parse(row.after_state) : row.after_state;
                          if (parsed?.elapsedMs != null) elapsedMs = parsed.elapsedMs;
                        } catch {}
                      }
                      if (elapsedMs == null && row.process_start_time && row.process_end_time) {
                        const ms = new Date(row.process_end_time).getTime() - new Date(row.process_start_time).getTime();
                        if (ms >= 0) elapsedMs = ms;
                      }
                      const isScreenNav = row.action_type === 'SCREEN_ENTER' || row.action_type === 'SCREEN_EXIT';
                      return (
                        <tr key={row.audit_id ?? row.log_id} className={`border-b last:border-0 hover:bg-muted/20 ${isScreenNav ? 'opacity-75' : ''}`}>
                          <td className="px-4 py-3 font-mono text-xs text-primary whitespace-nowrap">{row.audit_no ?? `AUD-${row.log_id ?? row.audit_id}`}</td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            <div className="font-medium">{row.timestamp_local ? new Date(row.timestamp_local).toLocaleString() : row.timestamp_utc ? new Date(row.timestamp_utc).toLocaleString() : row.created_at ? new Date(row.created_at).toLocaleString() : "—"}</div>
                            {row.timestamp_utc && <div className="text-muted-foreground text-[10px]">UTC {new Date(row.timestamp_utc).toISOString().replace('T',' ').slice(0,19)}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div className="font-medium">{row.username ?? "—"}</div>
                            {row.user_id && <div className="text-muted-foreground text-[10px]">ID: {row.user_id}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{row.user_role ?? "—"}</td>
                          <td className="px-4 py-3">
                            {row.screen_id ? (
                              <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5 text-amber-400 border-amber-500/30 bg-amber-500/10 cursor-pointer"
                                onClick={() => { setScreenIdFilter(row.screen_id); setPage(1); }}>
                                {row.screen_id}
                              </Badge>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3"><span className="badge-draft text-xs">{row.module}</span></td>
                          <td className="px-4 py-3 font-mono text-xs">
                            <span className={isScreenNav ? "text-purple-400" : "text-foreground"}>{row.action_type}</span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-32">{row.record_table ? `${row.record_table} #${row.record_id}` : "—"}</td>
                          <td className="px-4 py-3">
                            {elapsedMs != null ? (
                              <span className={`inline-flex items-center gap-1 font-mono text-xs font-semibold px-1.5 py-0.5 rounded ${elapsedBg(elapsedMs)} ${elapsedColor(elapsedMs)}`}>
                                <Clock className="h-2.5 w-2.5" />
                                {formatElapsed(elapsedMs)}
                              </span>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={row.outcome === "Success" ? "badge-active" : "badge-expired"}>{row.outcome}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages} · {totalCount.toLocaleString()} total entries</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
