import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileText, BarChart2, RefreshCw, Building2, Scale, TrendingUp, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { InlineAIReport } from "@/components/InlineAIReport";

const fmt = (n: unknown, dec = 0) =>
  typeof n === "number" || (typeof n === "string" && !isNaN(Number(n)))
    ? Number(n).toLocaleString("en-ZA", { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : "—";

const MATURITY_ORDER = [
  "Less than 1 year", "1 to 2 years", "2 to 3 years",
  "3 to 4 years", "4 to 5 years", "More than 5 years",
];

export default function DisclosurePack() {
  const today = new Date();
  const [periodEnd, setPeriodEnd] = useState(`${today.getFullYear()}-12-31`);
  const [periodStart, setPeriodStart] = useState(`${today.getFullYear() - 1}-01-01`);
  const [enabled, setEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState("balance-sheet");
  const [selectedLeaseId, setSelectedLeaseId] = useState("all");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const selectedContractId = selectedLeaseId !== "all" ? Number(selectedLeaseId) : undefined;
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 500 });
  const leases = leasesData?.rows ?? [];
  const selectedLease = leases.find((lease: any) => Number(lease.contract_id) === selectedContractId);
  const selectedLeaseLabel = selectedLease
    ? `${selectedLease.contract_ref} — ${selectedLease.asset_description ?? selectedLease.asset_type ?? ""}`
    : "All Leases";

  const { data, isLoading, refetch } = trpc.accounting.disclosurePack.generate.useQuery(
    { periodEnd, periodStart, contractId: selectedContractId },
    { enabled, retry: false }
  );
  const latestReport = trpc.reportEngine.getLatestReport.useQuery(
    { reportType: "disclosure_pack" as any, contractId: selectedContractId, section: `disclosure:${activeTab}` },
    { enabled: true }
  );
  const generateAIMut = trpc.reportEngine.generateReport.useMutation({
    onSuccess: () => {
      setIsGeneratingAI(false);
      latestReport.refetch();
      toast.success("AI disclosure report generated");
    },
    onError: (err) => {
      setIsGeneratingAI(false);
      toast.error(`Report generation failed: ${err.message}`);
    },
  });

  const summary    = (data?.summary ?? {}) as Record<string, unknown>;
  const balSheet   = (data?.balanceSheet ?? []) as Record<string, unknown>[];
  const incomeStmt = (data?.incomeStmt ?? []) as Record<string, unknown>[];
  const rouRoll    = (data?.rouRollFwd ?? []) as Record<string, unknown>[];
  const liabRoll   = (data?.liabRollFwd ?? []) as Record<string, unknown>[];
  const maturity   = (data?.maturity ?? []) as Record<string, unknown>[];
  const exemptions = (data?.exemptions ?? []) as Record<string, unknown>[];

  const sortedMaturity = [...maturity].sort(
    (a, b) => MATURITY_ORDER.indexOf(a.maturity_band as string) - MATURITY_ORDER.indexOf(b.maturity_band as string)
  );

  const handleGenerate = () => {
    setEnabled(true);
    refetch();
    toast.info("Generating Disclosure Pack…");
  };

  const handlePrint = () => {
    if (!data) { toast.error("Generate the pack first"); return; }
    window.print();
  };

  const handleGenerateAIReport = () => {
    setIsGeneratingAI(true);
    generateAIMut.mutate({
      reportType: "disclosure_pack" as any,
      startDate: periodStart,
      endDate: periodEnd,
      contractId: selectedContractId,
      contractRef: selectedLease?.contract_ref ?? "All Leases",
      section: `disclosure:${activeTab}`,
    });
  };

  const handleExportCSV = () => {
    if (!data) { toast.error("Generate the pack first"); return; }
    const lines: string[] = [
      "Section,Account/Item,Amount",
      ...balSheet.map((r: any) => `Balance Sheet,${r.account_name},${r.balance}`),
      ...incomeStmt.map((r: any) => `Income Statement,${r.account_name},${r.amount}`),
      ...sortedMaturity.map((r: any) => `Maturity,${r.maturity_band},${r.undiscounted_cashflow}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `disclosure-pack-${periodEnd}.csv`; a.click();
    toast.success("CSV exported");
  };

  return (
    <DashboardLayout>
      <ScreenHeader
        screenId="VFLDSCPK0001P001"
        title="IFRS 16 Disclosure Pack"
        subtitle="Auditor-ready disclosure pack — Balance Sheet, Income Statement, Roll-Forwards, Maturity Ladder, Exemptions"
        screenType="disclosure_pack"
      />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <Label className="text-xs text-muted-foreground">Period Start</Label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="w-40 mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Period End</Label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="w-40 mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Lease Number</Label>
              <Select value={selectedLeaseId} onValueChange={setSelectedLeaseId}>
                <SelectTrigger className="w-72 mt-1">
                  <SelectValue placeholder="Select lease number" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Leases</SelectItem>
                  {leases.map((lease: any) => (
                    <SelectItem key={lease.contract_id} value={String(lease.contract_id)}>
                      {lease.contract_ref} — {lease.asset_description ?? lease.asset_type ?? ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGenerate} disabled={isLoading} className="gap-2">
              {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {isLoading ? "Generating…" : "Generate Pack"}
            </Button>
            {data && (
              <>
                <Button variant="outline" onClick={handlePrint} className="gap-2">
                  <Download className="h-4 w-4" /> Print / PDF
                </Button>
                <Button variant="outline" onClick={handleExportCSV} className="gap-2">
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
              </>
            )}
            <Button onClick={handleGenerateAIReport} disabled={isGeneratingAI} className="gap-2">
              {isGeneratingAI ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {!data && !isLoading && (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
          <FileText className="h-12 w-12 opacity-30" />
          <p className="text-sm">Select a period and click <strong>Generate Pack</strong> to produce the IFRS 16 Disclosure Pack.</p>
        </div>
      )}

      {data && (
        <div ref={printRef} className="space-y-4">
          {/* Cover KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Leases",        value: fmt(summary.total_leases as number, 0),    icon: Building2 },
              { label: "Total ROU Assets",    value: `QAR ${fmt(summary.total_rou_asset as number)}`, icon: BarChart2 },
              { label: "Total Lease Liab.",   value: `QAR ${fmt(summary.total_lease_liability as number)}`, icon: Scale },
              { label: "Annual Lease Exp.",   value: `QAR ${fmt(summary.annual_lease_expense as number)}`, icon: TrendingUp },
            ].map(kpi => (
              <Card key={kpi.label}>
                <CardContent className="pt-4 flex items-start gap-3">
                  <kpi.icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-lg font-bold font-mono">{kpi.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
              <TabsTrigger value="income-stmt">Income Statement</TabsTrigger>
              <TabsTrigger value="rou-roll">ROU Roll-Forward</TabsTrigger>
              <TabsTrigger value="liab-roll">Liability Roll-Forward</TabsTrigger>
              <TabsTrigger value="maturity">Maturity Analysis</TabsTrigger>
              <TabsTrigger value="exemptions">Exemptions</TabsTrigger>
            </TabsList>

            {/* Balance Sheet */}
            <TabsContent value="balance-sheet">
              <Card>
                <CardHeader><CardTitle className="text-sm">Balance Sheet — Lease-Related Lines</CardTitle></CardHeader>
                <CardContent>
                  {balSheet.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No GL postings found for this period.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Section</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Balance (QAR)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {balSheet.map((r: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell><Badge variant="outline">{r.section}</Badge></TableCell>
                            <TableCell className="text-sm">{r.account_name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(r.balance, 2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Income Statement */}
            <TabsContent value="income-stmt">
              <Card>
                <CardHeader><CardTitle className="text-sm">Income Statement — Lease-Related Lines</CardTitle></CardHeader>
                <CardContent>
                  {incomeStmt.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No GL postings found for this period.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Amount (QAR)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {incomeStmt.map((r: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{r.account_name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(r.amount, 2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ROU Roll-Forward */}
            <TabsContent value="rou-roll">
              <Card>
                <CardHeader><CardTitle className="text-sm">ROU Asset Roll-Forward</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contract Ref</TableHead>
                        <TableHead>Asset</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Gross ROU (QAR)</TableHead>
                        <TableHead className="text-right">Opening Acc. Dep.</TableHead>
                        <TableHead className="text-right">Period Dep.</TableHead>
                        <TableHead className="text-right">Closing NBV</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rouRoll.map((r: any, i: number) => {
                        const nbv = Number(r.gross_rou_asset ?? 0) - Number(r.opening_accumulated_dep ?? 0) - Number(r.period_depreciation ?? 0);
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{r.contract_ref}</TableCell>
                            <TableCell className="text-sm">{r.asset_description}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{r.asset_type}</Badge></TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(r.gross_rou_asset, 2)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">({fmt(r.opening_accumulated_dep, 2)})</TableCell>
                            <TableCell className="text-right font-mono text-sm text-amber-600">({fmt(r.period_depreciation, 2)})</TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">{fmt(nbv, 2)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Liability Roll-Forward */}
            <TabsContent value="liab-roll">
              <Card>
                <CardHeader><CardTitle className="text-sm">Lease Liability Roll-Forward</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contract Ref</TableHead>
                        <TableHead>Asset</TableHead>
                        <TableHead className="text-right">Opening Liab.</TableHead>
                        <TableHead className="text-right">Interest (Period)</TableHead>
                        <TableHead className="text-right">Payments (Period)</TableHead>
                        <TableHead className="text-right">Closing Liab.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {liabRoll.map((r: any, i: number) => {
                        const closing = Number(r.opening_liability ?? 0) + Number(r.period_interest ?? 0) - Number(r.period_payments ?? 0);
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{r.contract_ref}</TableCell>
                            <TableCell className="text-sm">{r.asset_description}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(r.opening_liability, 2)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-blue-600">+{fmt(r.period_interest, 2)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-red-500">({fmt(r.period_payments, 2)})</TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">{fmt(closing, 2)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Maturity Analysis */}
            <TabsContent value="maturity">
              <Card>
                <CardHeader><CardTitle className="text-sm">Maturity Analysis — Undiscounted Cash Flows (IFRS 16 Para 58)</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Maturity Band</TableHead>
                        <TableHead className="text-right">Principal (QAR)</TableHead>
                        <TableHead className="text-right">Interest (QAR)</TableHead>
                        <TableHead className="text-right">Undiscounted Total (QAR)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedMaturity.map((r: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm font-medium">{r.maturity_band}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(r.principal, 2)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-blue-600">{fmt(r.interest, 2)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{fmt(r.undiscounted_cashflow, 2)}</TableCell>
                        </TableRow>
                      ))}
                      {sortedMaturity.length > 0 && (
                        <TableRow className="border-t-2 font-bold bg-muted/30">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right font-mono">{fmt(sortedMaturity.reduce((s, r: any) => s + Number(r.principal ?? 0), 0), 2)}</TableCell>
                          <TableCell className="text-right font-mono text-blue-600">{fmt(sortedMaturity.reduce((s, r: any) => s + Number(r.interest ?? 0), 0), 2)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(sortedMaturity.reduce((s, r: any) => s + Number(r.undiscounted_cashflow ?? 0), 0), 2)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Exemptions */}
            <TabsContent value="exemptions">
              <Card>
                <CardHeader><CardTitle className="text-sm">Short-term & Low-value Exemption Register (IFRS 16 Para 5)</CardTitle></CardHeader>
                <CardContent>
                  {exemptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No exemptions recorded.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Contract Ref</TableHead>
                          <TableHead>Asset</TableHead>
                          <TableHead>Lessor</TableHead>
                          <TableHead>Exemption Type</TableHead>
                          <TableHead className="text-right">Monthly Payment</TableHead>
                          <TableHead>Commencement</TableHead>
                          <TableHead>Expiry</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exemptions.map((r: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{r.contract_ref}</TableCell>
                            <TableCell className="text-sm">{r.asset_description}</TableCell>
                            <TableCell className="text-sm">{r.lessor_name}</TableCell>
                            <TableCell><Badge className={`text-xs ${r.exemption_type === "Short-term" ? "bg-amber-500" : "bg-purple-500"}`}>{r.exemption_type}</Badge></TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(r.monthly_payment, 2)}</TableCell>
                            <TableCell className="text-sm">{r.commencement_date?.slice(0, 10)}</TableCell>
                            <TableCell className="text-sm">{r.expiry_date?.slice(0, 10)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <InlineAIReport
            title="IFRS 16 Disclosure Pack AI Report"
            leaseLabel={selectedLeaseLabel}
            content={generateAIMut.data?.content ?? latestReport.data?.content_markdown}
            generatedAt={latestReport.data?.generated_at}
            generatedBy={latestReport.data?.generated_by}
            isGenerating={isGeneratingAI}
            onGenerate={handleGenerateAIReport}
          />
        </div>
      )}
    </DashboardLayout>
  );
}
