/**
 * VodaLease Enterprise — Bank Reconciliation Workspace
 * Screen ID: VFBNKRECONWS0001P001
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Zap, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  ArrowLeftRight, Lock, ChevronRight, Info
} from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

const MATCH_TYPE_COLORS: Record<string, string> = {
  ExactAmount:  "badge-active",
  RefMatch:     "badge-matched",
  Tolerance:    "badge-pending",
  Aggregated:   "badge-pending",
  Split:        "badge-pending",
  AIAssisted:   "badge-matched",
  Manual:       "badge-draft",
};

export default function BankReconWorkspace() {
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [matchFilter, setMatchFilter] = useState<"all" | "Matched" | "Unmatched" | "Disputed">("all");

  // Accounts list
  const { data: accountsData } = trpc.bankRecon.listAccounts.useQuery({ status: "Active" });
  const accounts = accountsData?.accounts ?? [];

  // Session data
  const { data: sessionData, isLoading: sessionLoading, refetch: refetchSession } = trpc.bankRecon.getSession.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId }
  );

  // Matches
  const { data: matchesData, isLoading: matchesLoading, refetch: refetchMatches } = trpc.bankRecon.getMatches.useQuery(
    { sessionId: sessionId!, status: matchFilter === "all" ? undefined : matchFilter },
    { enabled: !!sessionId }
  );

  // Unmatched items
  const { data: unmatchedData } = trpc.bankRecon.getUnmatchedItems.useQuery(
    { sessionId: sessionId!, itemType: "Both" },
    { enabled: !!sessionId }
  );

  // Auto-match mutation
  const autoMatch = trpc.bankRecon.runAutoMatch.useMutation({
    onSuccess: (result) => {
      toast.success(`Auto-match complete: ${result?.newly_matched ?? 0} new matches found`);
      refetchSession();
      refetchMatches();
    },
    onError: (err) => toast.error(`Auto-match failed: ${err.message}`),
  });

  // Close session mutation
  const closeSession = trpc.bankRecon.closeSession.useMutation({
    onSuccess: () => {
      toast.success("Reconciliation session closed successfully");
      refetchSession();
    },
    onError: (err) => toast.error(`Failed to close session: ${err.message}`),
  });

  const session   = sessionData?.session;
  const matches   = matchesData?.matches ?? [];
  const bankItems = unmatchedData?.bankItems ?? [];
  const glItems   = unmatchedData?.glItems ?? [];

  const matchedCount   = session?.matched_count ?? 0;
  const unmatchedCount = session?.unmatched_count ?? 0;
  const totalItems     = matchedCount + unmatchedCount;
  const matchPct       = totalItems > 0 ? Math.round((matchedCount / totalItems) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <ScreenHeader
            screenId="VFBNKRECONWS0001P001"
            title="Reconciliation Workspace"
            subtitle="Bank reconciliation and transaction matching"
            screenType="bank_recon"
            onAIData={(r) => setAiRows(r)}
          />

        {/* Account Selector */}
        {!sessionId && (
          <Card>
            <CardContent className="pt-6 pb-6">
              <div className="max-w-md mx-auto text-center space-y-4">
                <ArrowLeftRight className="h-10 w-10 text-muted-foreground mx-auto" />
                <h3 className="font-semibold">Select a Bank Account to Reconcile</h3>
                <p className="text-sm text-muted-foreground">Choose an account and import a bank statement to begin the reconciliation process.</p>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select bank account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc: any) => (
                      <SelectItem key={acc.account_id} value={String(acc.account_id)}>
                        {acc.bank_name} — {acc.account_name} ({acc.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="w-full"
                  disabled={!selectedAccount}
                  onClick={() => toast.info("Import statement screen — coming soon")}
                >
                  Import Statement & Start Reconciliation
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {sessionId && (
          <>
            {/* Session Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="kpi-card">
                <span className="kpi-label">Match Rate</span>
                <span className="kpi-value">{matchPct}%</span>
                <Progress value={matchPct} className="h-1.5 mt-2" />
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Matched Items</span>
                <span className="kpi-value text-green-600">{matchedCount}</span>
                <span className="text-xs text-muted-foreground">of {totalItems} total</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Unmatched</span>
                <span className={`kpi-value ${unmatchedCount > 0 ? "text-red-500" : "text-green-600"}`}>{unmatchedCount}</span>
                <span className="text-xs text-muted-foreground">items pending</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Session Status</span>
                <span className="kpi-value text-base mt-1">
                  <span className={session?.status === "Closed" ? "badge-closed" : session?.status === "InProgress" ? "badge-pending" : "badge-draft"}>
                    {session?.status ?? "—"}
                  </span>
                </span>
              </div>
            </div>

            {/* Main Workspace Tabs */}
            <Tabs defaultValue="matches">
              <TabsList>
                <TabsTrigger value="matches">Matched Items ({matchedCount})</TabsTrigger>
                <TabsTrigger value="bank">Bank Unmatched ({bankItems.length})</TabsTrigger>
                <TabsTrigger value="gl">GL Unmatched ({glItems.length})</TabsTrigger>
              </TabsList>

              {/* Matched Items Tab */}
              <TabsContent value="matches">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 border-b">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Match Ref</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Bank Amount</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">GL Amount</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Difference</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Confidence</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matchesLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                              <tr key={i} className="border-b">
                                {Array.from({ length: 7 }).map((__, j) => (
                                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                ))}
                              </tr>
                            ))
                          ) : matches.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                                No matches yet. Run Auto-Match to begin.
                              </td>
                            </tr>
                          ) : (
                            matches.map((m: any) => (
                              <tr key={m.match_id} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-4 py-3 font-mono text-xs">{m.match_ref}</td>
                                <td className="px-4 py-3">
                                  <span className={MATCH_TYPE_COLORS[m.match_type] ?? "badge-draft"}>{m.match_type}</span>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">{fmt(m.bank_amount)}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{fmt(m.gl_amount)}</td>
                                <td className={`px-4 py-3 text-right tabular-nums ${Math.abs(m.difference) > 0 ? "text-amber-600" : "text-green-600"}`}>
                                  {fmt(m.difference)}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 bg-muted rounded-full h-1.5">
                                      <div
                                        className={`h-1.5 rounded-full ${m.confidence_score >= 90 ? "confidence-high" : m.confidence_score >= 70 ? "confidence-medium" : "confidence-low"}`}
                                        style={{ width: `${m.confidence_score}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-muted-foreground">{m.confidence_score}%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={m.status === "Confirmed" ? "badge-active" : m.status === "Disputed" ? "badge-expired" : "badge-pending"}>
                                    {m.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Bank Unmatched Tab */}
              <TabsContent value="bank">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 border-b">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Narrative</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Reference</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {bankItems.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                                All bank transactions matched!
                              </td>
                            </tr>
                          ) : (
                            bankItems.map((item: any) => (
                              <tr key={item.txn_id} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-4 py-3 text-muted-foreground">{new Date(item.txn_date).toLocaleDateString()}</td>
                                <td className="px-4 py-3 truncate max-w-48">{item.narrative}</td>
                                <td className="px-4 py-3 font-mono text-xs">{item.reference}</td>
                                <td className={`px-4 py-3 text-right tabular-nums font-medium ${item.txn_type === "C" ? "text-green-600" : "text-red-500"}`}>
                                  {item.txn_type === "D" ? "-" : "+"}{fmt(item.amount)}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={item.txn_type === "C" ? "badge-active" : "badge-expired"}>{item.txn_type === "C" ? "Credit" : "Debit"}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => toast.info("Manual match dialog — coming soon")}>
                                    Match <ChevronRight className="h-3 w-3" />
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* GL Unmatched Tab */}
              <TabsContent value="gl">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 border-b">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">GL Date</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">GL Account</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {glItems.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                                All GL entries matched!
                              </td>
                            </tr>
                          ) : (
                            glItems.map((item: any) => (
                              <tr key={item.entry_id} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-4 py-3 text-muted-foreground">{new Date(item.gl_date).toLocaleDateString()}</td>
                                <td className="px-4 py-3 truncate max-w-48">{item.description}</td>
                                <td className="px-4 py-3 font-mono text-xs">{item.gl_account}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{fmt(item.amount)}</td>
                                <td className="px-4 py-3">
                                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => toast.info("Manual match dialog — coming soon")}>
                                    Match <ChevronRight className="h-3 w-3" />
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
