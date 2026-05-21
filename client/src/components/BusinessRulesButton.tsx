import { useState, useCallback } from "react";
import { Sparkles, Loader2, X, BookOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface BusinessRulesButtonProps {
  screenId: string;
  screenTitle: string;
}

/**
 * BusinessRulesButton — Yellow "Gen AI" button that:
 * 1. First click: Calls Azure OpenAI to extract business rules/methodology for the screen
 * 2. Stores rules in DB (one-time AI call per screen)
 * 3. Subsequent clicks: Shows stored business rules in full-screen overlay
 */
export function BusinessRulesButton({ screenId, screenTitle }: BusinessRulesButtonProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Query for existing rules
  const { data: rulesData, refetch } = trpc.genai.getBusinessRules.useQuery(
    { screenId },
    { refetchOnWindowFocus: false }
  );

  const generateMutation = trpc.genai.generateBusinessRules.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Business rules generated and stored successfully");
    },
    onError: (err) => {
      toast.error(`Failed to generate business rules: ${err.message}`);
    },
  });

  const handleClick = useCallback(async () => {
    if (rulesData?.rules) {
      // Rules exist — show overlay
      setShowOverlay(true);
    } else {
      // No rules yet — generate from AI
      setIsGenerating(true);
      try {
        await generateMutation.mutateAsync({ screenId, screenTitle });
        setShowOverlay(true);
      } finally {
        setIsGenerating(false);
      }
    }
  }, [rulesData, screenId, screenTitle, generateMutation]);

  const handleRegenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      await generateMutation.mutateAsync({ screenId, screenTitle });
    } finally {
      setIsGenerating(false);
    }
  }, [screenId, screenTitle, generateMutation]);

  const rules = rulesData?.rules;

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={isGenerating}
        size="sm"
        className="gap-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black border-0 text-xs h-7 px-3 font-semibold shadow-md shadow-amber-900/30"
        title={rules ? "View business rules & methodology" : "Generate business rules from AI (one-time)"}
      >
        {isGenerating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {isGenerating ? "Generating…" : "Gen AI"}
      </Button>

      {/* Full-screen overlay showing business rules */}
      {showOverlay && rules && (
        <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-amber-500/20 bg-gradient-to-r from-amber-950/40 to-black shrink-0">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <div>
                <h2 className="text-lg font-semibold text-amber-100">
                  Business Rules & Methodology
                </h2>
                <p className="text-xs text-amber-400/70">
                  {screenTitle} — {screenId}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={isGenerating}
                className="gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs"
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Regenerate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOverlay(false)}
                className="text-muted-foreground hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Summary */}
              {rules.summary && (
                <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-4">
                  <p className="text-amber-200 text-sm leading-relaxed">{rules.summary}</p>
                </div>
              )}

              {/* Applicable Standards */}
              {rules.standards && rules.standards.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                    Applicable Standards
                  </h3>
                  <div className="grid gap-2">
                    {rules.standards.map((s: any, i: number) => (
                      <div key={i} className="bg-[#1a1a1a] border border-border/50 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <span className="text-amber-400 font-mono text-xs shrink-0 mt-0.5">{s.reference}</span>
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
          </div>
        </div>
      )}
    </>
  );
}
