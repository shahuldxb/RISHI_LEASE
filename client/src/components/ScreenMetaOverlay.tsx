/**
 * ScreenMetaOverlay — Global Alt+1/2/3/4 keyboard shortcut overlay
 *
 * Alt+1 → Stored Procedures & DB Tables involved in this screen
 * Alt+2 → Accounting Standards applicable to this screen
 * Alt+3 → Computation Techniques used by this screen
 * Alt+4 → Business Rules & Methodology (AI-generated, stored in DB)
 *
 * Usage: Mount <ScreenMetaOverlay screenId="VFLSENEWLS0001P001" screenTitle="Lease Register" /> inside any page.
 * The overlay listens globally and shows a floating panel when triggered.
 * Alt+4 shows a full-screen overlay with business rules.
 */
import { useEffect, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, BookOpen, Calculator, X, Keyboard, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Mode = 1 | 2 | 3 | 4 | null;

interface Props {
  screenId: string;
  screenTitle?: string;
  /** If provided, the overlay opens in this mode externally */
  externalMode?: Mode;
  onExternalClose?: () => void;
  /** Callback to change the external mode (for tab switching) */
  onExternalModeChange?: (mode: Mode) => void;
}

const MODE_CONFIG = {
  1: {
    icon: Database,
    title: "Stored Procedures & Tables",
    subtitle: "Database objects powering this screen",
    color: "text-blue-400",
    bgColor: "border-blue-500/40 bg-blue-950/80",
    key: "Alt+1",
  },
  2: {
    icon: BookOpen,
    title: "Accounting Standards",
    subtitle: "Applicable standards for this screen",
    color: "text-emerald-400",
    bgColor: "border-emerald-500/40 bg-emerald-950/80",
    key: "Alt+2",
  },
  3: {
    icon: Calculator,
    title: "Computation Techniques",
    subtitle: "Algorithms and methods used",
    color: "text-amber-400",
    bgColor: "border-amber-500/40 bg-amber-950/80",
    key: "Alt+3",
  },
  4: {
    icon: Sparkles,
    title: "Business Rules & Methodology",
    subtitle: "AI-generated IFRS 16 rules, formulas & JV patterns",
    color: "text-yellow-400",
    bgColor: "border-yellow-500/40 bg-yellow-950/80",
    key: "Alt+4",
  },
} as const;

export function ScreenMetaOverlay({ screenId, screenTitle, externalMode, onExternalClose, onExternalModeChange }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);

  // Use externalMode directly as the source of truth
  const mode = externalMode ?? null;
  const setMode = (newMode: Mode | ((prev: Mode) => Mode)) => {
    const resolved = typeof newMode === 'function' ? newMode(mode) : newMode;
    if (onExternalModeChange) {
      onExternalModeChange(resolved);
    }
  };

  const { data: meta } = trpc.screenMeta.get.useQuery(
    { screenId },
    { enabled: !!screenId, staleTime: 60_000 }
  );

  // Business rules query (only for Alt+4)
  const { data: rulesData, refetch: refetchRules } = trpc.genai.getBusinessRules.useQuery(
    { screenId },
    { enabled: !!screenId, staleTime: 60_000 }
  );

  const generateMutation = trpc.genai.generateBusinessRules.useMutation({
    onSuccess: () => {
      refetchRules();
      toast.success("Business rules generated and stored successfully");
    },
    onError: (err: any) => {
      toast.error(`Failed to generate business rules: ${err.message}`);
    },
  });

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!e.altKey) return;
    if (e.key === "1") { e.preventDefault(); setMode(m => m === 1 ? null : 1); }
    if (e.key === "2") { e.preventDefault(); setMode(m => m === 2 ? null : 2); }
    if (e.key === "3") { e.preventDefault(); setMode(m => m === 3 ? null : 3); }
    if (e.key === "4") { e.preventDefault(); setMode(m => m === 4 ? null : 4); }
    if (e.key === "Escape") { setMode(null); onExternalClose?.(); }
  }, [onExternalClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const closeOverlay = useCallback(() => {
    if (onExternalModeChange) onExternalModeChange(null);
    onExternalClose?.();
  }, [onExternalClose, onExternalModeChange]);

  // Handle Alt+4 first-time generation
  const handleGenerateRules = useCallback(async () => {
    setIsGenerating(true);
    try {
      await generateMutation.mutateAsync({ screenId, screenTitle: screenTitle || screenId });
    } finally {
      setIsGenerating(false);
    }
  }, [screenId, screenTitle, generateMutation]);

  if (!mode) return null;

  const cfg = MODE_CONFIG[mode];
  const Icon = cfg.icon;

  // ── Alt+4: Full-screen Business Rules overlay ──────────────────────────────
  if (mode === 4) {
    const rules = rulesData?.rules;

    return (
      <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-yellow-500/20 bg-gradient-to-r from-yellow-950/40 to-black shrink-0">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            <div>
              <h2 className="text-lg font-semibold text-yellow-100">
                Business Rules & Methodology
              </h2>
              <p className="text-xs text-yellow-400/70">
                {screenTitle || screenId} — {screenId}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode switcher */}
            <div className="flex gap-1 mr-2">
              {([1, 2, 3, 4] as const).map(n => (
                <span
                  key={n}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); if (onExternalModeChange) onExternalModeChange(mode === n ? null : n); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); if (onExternalModeChange) onExternalModeChange(mode === n ? null : n); } }}
                  className={`text-xs px-2 py-0.5 rounded font-mono border transition-colors cursor-pointer select-none ${
                    mode === n
                      ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-300"
                      : "bg-white/5 border-white/10 text-white/40 hover:text-white/70"
                  }`}
                >
                  Alt+{n}
                </span>
              ))}
            </div>
            {rules && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateRules}
                disabled={isGenerating}
                className="gap-1.5 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 text-xs"
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Regenerate
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={closeOverlay}
              className="text-muted-foreground hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {!rules ? (
            /* No rules yet — show generate prompt */
            <div className="max-w-lg mx-auto text-center py-20">
              <Sparkles className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-yellow-100 mb-2">
                No Business Rules Generated Yet
              </h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Click below to use Azure OpenAI to extract the IFRS 16 business rules,
                calculation methodology, journal entry patterns, and validation rules
                for this screen. This is a one-time operation — rules will be stored
                in the database for future use.
              </p>
              <Button
                onClick={handleGenerateRules}
                disabled={isGenerating}
                className="gap-2 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-semibold px-6"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {isGenerating ? "Generating Business Rules…" : "Generate Business Rules from AI"}
              </Button>
              {isGenerating && (
                <p className="text-xs text-yellow-400/60 mt-3 animate-pulse">
                  Analyzing screen context and extracting IFRS 16 methodology…
                </p>
              )}
            </div>
          ) : (
            /* Rules exist — show them */
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Summary */}
              {rules.summary && (
                <div className="bg-yellow-950/20 border border-yellow-500/20 rounded-lg p-4">
                  <p className="text-yellow-200 text-sm leading-relaxed">{rules.summary}</p>
                </div>
              )}

              {/* Applicable Standards */}
              {rules.standards && rules.standards.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                    Applicable Standards
                  </h3>
                  <div className="grid gap-2">
                    {rules.standards.map((s: any, i: number) => (
                      <div key={i} className="bg-[#1a1a1a] border border-border/50 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <span className="text-yellow-400 font-mono text-xs shrink-0 mt-0.5">{s.reference}</span>
                          <p className="text-sm text-foreground/90">{s.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Business Rules */}
              {rules.businessRules && rules.businessRules.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    Business Rules
                  </h3>
                  <div className="grid gap-2">
                    {rules.businessRules.map((r: any, i: number) => (
                      <div key={i} className="bg-[#1a1a1a] border border-border/50 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <span className="text-emerald-400 font-mono text-xs shrink-0 mt-0.5">R{i + 1}</span>
                          <div>
                            <p className="text-sm font-medium text-foreground/90">{r.rule}</p>
                            {r.explanation && (
                              <p className="text-xs text-muted-foreground mt-1">{r.explanation}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Calculation Methodology */}
              {rules.calculationSteps && rules.calculationSteps.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                    Calculation Methodology
                  </h3>
                  <div className="grid gap-2">
                    {rules.calculationSteps.map((step: any, i: number) => (
                      <div key={i} className="bg-[#1a1a1a] border border-border/50 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <span className="text-blue-400 font-mono text-xs shrink-0 mt-0.5 bg-blue-500/10 rounded px-1.5 py-0.5">
                            Step {i + 1}
                          </span>
                          <div>
                            <p className="text-sm text-foreground/90">{step.step}</p>
                            {step.formula && (
                              <code className="block mt-1 text-xs text-blue-300 bg-blue-950/30 px-2 py-1 rounded font-mono">
                                {step.formula}
                              </code>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Validation Rules */}
              {rules.validationRules && rules.validationRules.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-violet-400 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                    Validation Rules
                  </h3>
                  <div className="grid gap-2">
                    {rules.validationRules.map((v: any, i: number) => (
                      <div key={i} className="bg-[#1a1a1a] border border-border/50 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <span className="text-violet-400 font-mono text-xs shrink-0 mt-0.5">V{i + 1}</span>
                          <p className="text-sm text-foreground/90">{v}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Journal Entry Pattern */}
              {rules.journalEntryPattern && (
                <section>
                  <h3 className="text-sm font-semibold text-orange-400 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full" />
                    Journal Entry Pattern
                  </h3>
                  <div className="bg-[#1a1a1a] border border-border/50 rounded-lg p-4">
                    <pre className="text-xs text-orange-200 font-mono whitespace-pre-wrap">
                      {typeof rules.journalEntryPattern === 'string'
                        ? rules.journalEntryPattern
                        : JSON.stringify(rules.journalEntryPattern, null, 2)}
                    </pre>
                  </div>
                </section>
              )}

              {/* Generated timestamp */}
              <div className="text-center pt-4 border-t border-border/30">
                <p className="text-xs text-muted-foreground">
                  Generated by Azure OpenAI (GPT-4o) · {rulesData?.generatedAt ? new Date(rulesData.generatedAt).toLocaleString() : "Unknown"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-2 border-t border-yellow-500/10 bg-black/50 shrink-0">
          <div className="flex items-center gap-1 text-xs text-white/30">
            <Keyboard className="h-3 w-3" />
            <span>Alt+1 SPs/Tables · Alt+2 Standards · Alt+3 Techniques · Alt+4 Business Rules · Esc to close</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Alt+1/2/3: Floating card overlay ───────────────────────────────────────
  const getContent = () => {
    if (!meta) return <p className="text-sm text-muted-foreground">No metadata registered for this screen.</p>;

    if (mode === 1) {
      const sps = (meta.stored_procedures as string | null)?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
      const tables = (meta.db_tables as string | null)?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
      return (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Stored Procedures</p>
            <div className="flex flex-wrap gap-2">
              {sps.length > 0 ? sps.map(sp => (
                <Badge key={sp} variant="outline" className="font-mono text-xs text-blue-300 border-blue-500/40 bg-blue-950/50">
                  {sp}
                </Badge>
              )) : <span className="text-sm text-muted-foreground">None registered</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Database Tables</p>
            <div className="flex flex-wrap gap-2">
              {tables.length > 0 ? tables.map(t => (
                <Badge key={t} variant="outline" className="font-mono text-xs text-cyan-300 border-cyan-500/40 bg-cyan-950/50">
                  {t}
                </Badge>
              )) : <span className="text-sm text-muted-foreground">None registered</span>}
            </div>
          </div>
          <div className="pt-2 border-t border-white/10">
            <p className="text-xs text-muted-foreground">
              Screen ID: <span className="font-mono text-white/70">{meta.screen_id as string}</span>
              {" · "}Module: <span className="text-white/70">{meta.module as string}</span>
              {" · "}Sub-module: <span className="text-white/70">{meta.sub_module as string}</span>
            </p>
          </div>
        </div>
      );
    }

    if (mode === 2) {
      const standards = (meta.accounting_standards as string | null)?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
      const STD_COLORS: Record<string, string> = {
        "IFRS 16": "text-emerald-300 border-emerald-500/40 bg-emerald-950/50",
        "ASC 842": "text-blue-300 border-blue-500/40 bg-blue-950/50",
        "IPSAS 43": "text-purple-300 border-purple-500/40 bg-purple-950/50",
        "IAS 1": "text-amber-300 border-amber-500/40 bg-amber-950/50",
        "IAS 7": "text-orange-300 border-orange-500/40 bg-orange-950/50",
        "IAS 16": "text-pink-300 border-pink-500/40 bg-pink-950/50",
      };
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {standards.length > 0 ? standards.map(std => {
              const colorKey = Object.keys(STD_COLORS).find(k => std.startsWith(k));
              const cls = colorKey ? STD_COLORS[colorKey] : "text-white/70 border-white/20 bg-white/5";
              return (
                <Badge key={std} variant="outline" className={`text-sm font-semibold px-3 py-1 ${cls}`}>
                  {std}
                </Badge>
              );
            }) : <span className="text-sm text-muted-foreground">No standards registered</span>}
          </div>
          <div className="pt-2 border-t border-white/10 text-xs text-muted-foreground space-y-1">
            <p><span className="text-emerald-400 font-semibold">IFRS 16</span> — International Financial Reporting Standard for Leases (IASB)</p>
            <p><span className="text-blue-400 font-semibold">ASC 842</span> — US GAAP Lease Accounting Standard (FASB)</p>
            <p><span className="text-purple-400 font-semibold">IPSAS 43</span> — Public Sector Lease Standard (IPSASB, effective 2025)</p>
          </div>
        </div>
      );
    }

    if (mode === 3) {
      const techniques = (meta.computation_techniques as string | null)?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            {techniques.length > 0 ? techniques.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-amber-400 font-mono text-xs mt-0.5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-sm text-white/80">{t}</p>
              </div>
            )) : <span className="text-sm text-muted-foreground">No techniques registered</span>}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-[480px] max-w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-4 duration-200">
      <Card className={`border ${cfg.bgColor} backdrop-blur-md shadow-2xl`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 min-w-0">
              <Icon className={`h-5 w-5 shrink-0 ${cfg.color}`} />
              <div className="min-w-0">
                <CardTitle className={`text-sm ${cfg.color}`}>{cfg.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{cfg.subtitle}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 ml-2" onClick={closeOverlay}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex gap-1 mt-2">
            {([1, 2, 3, 4] as const).map(n => (
              <span
                key={n}
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); if (onExternalModeChange) onExternalModeChange(mode === n ? null : n); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); if (onExternalModeChange) onExternalModeChange(mode === n ? null : n); } }}
                className={`text-xs px-2 py-1 rounded font-mono border transition-colors cursor-pointer select-none ${
                  mode === n
                    ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-300"
                    : "bg-white/5 border-white/10 text-white/40 hover:text-white/70 hover:bg-white/10"
                }`}
              >
                Alt+{n}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {getContent()}
          <div className="mt-3 pt-2 border-t border-white/10 flex items-center gap-1 text-xs text-white/30">
            <Keyboard className="h-3 w-3" />
            <span>Alt+1 SPs/Tables · Alt+2 Standards · Alt+3 Techniques · Alt+4 Business Rules · Esc to close</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
