/**
 * IFRS 16 Reports Centre — AI-Powered Report Engine
 * Screen ID: RPT-001
 * Consolidates: Portfolio Summary, ROU Roll-Forward, Liability Roll-Forward,
 *               Maturity Analysis, Interest/Depreciation Expense, Lease Expiry, Cash Forecast
 *
 * Each tab shows raw data tables AND an AI-generated narrative report.
 * Click "Generate Report" to create a new AI narrative; stored reports show automatically.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2, TrendingUp, TrendingDown, Banknote, Calendar, AlertTriangle,
  DollarSign, RefreshCw, Download, BarChart3, PieChart, Sparkles, FileText,
  Loader2, Clock, X, Eye
} from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { InlineAIReport } from "@/components/InlineAIReport";

const fmt = (n: unknown) =>
  n != null && !isNaN(Number(n))
    ? Number(n).toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : "—";

const fmtDec = (n: unknown) =>
  n != null && !isNaN(Number(n))
    ? Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const fmtDate = (d: unknown) => {
  if (!d) return "—";
  const dt = new Date(String(d));
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

// Map tab values to report engine types
const TAB_TO_REPORT_TYPE: Record<string, string> = {
  portfolio: "portfolio_summary",
  rou: "rou_roll_forward",
  liability: "liability_roll_forward",
  maturity: "maturity_analysis",
  expense: "interest_depreciation",
  expiry: "lease_expiry",
  cash: "cash_forecast",
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  portfolio_summary: "Portfolio Summary",
  rou_roll_forward: "ROU Asset Roll-Forward",
  liability_roll_forward: "Lease Liability Roll-Forward",
  maturity_analysis: "Maturity Analysis",
  interest_depreciation: "Interest & Depreciation Expense",
  lease_expiry: "Lease Expiry & Renewal Action",
  cash_forecast: "Cash Payment Forecast",
};

export default function IFRS16Reports() {
  const [activeTab, setActiveTab] = useState("portfolio");
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [currency, setCurrency] = useState<string>("all");
  const [granularity, setGranularity] = useState<"Monthly" | "Quarterly">("Monthly");
  const [daysAhead, setDaysAhead] = useState(365);
  const [months, setMonths] = useState(12);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedLeaseId, setSelectedLeaseId] = useState("all");
  const [generatedScopeKey, setGeneratedScopeKey] = useState<string | null>(null);
  const setShowAIReport = (_open: boolean) => {};

  const currencyFilter = currency === "all" ? undefined : currency;
  const currentReportType = TAB_TO_REPORT_TYPE[activeTab] as any;
  const selectedContractId = selectedLeaseId !== "all" ? Number(selectedLeaseId) : undefined;
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 500 });
  const leases = leasesData?.rows ?? [];
  const selectedLease = leases.find((lease: any) => Number(lease.contract_id) === selectedContractId);
  const selectedLeaseLabel = selectedLease
    ? `${selectedLease.contract_ref} — ${selectedLease.asset_description ?? selectedLease.asset_type ?? ""}`
    : "All Leases";
  const currentSection = `ifrs16:${activeTab}`;
  const currentScopeKey = `${currentReportType}:${selectedContractId ?? "all"}:${currentSection}:${startDate || ""}:${endDate || ""}:${currencyFilter || "all"}`;

  // ── Data Queries ─────────────────────────────────────────
  const portfolio = trpc.lease.reportPortfolioSummary.useQuery(
    selectedContractId ? { contractId: selectedContractId } : undefined,
    { enabled: activeTab === "portfolio" }
  );
  const rou = trpc.lease.reportROURollForward.useQuery(
    { startDate, endDate, currency: currencyFilter, contractId: selectedContractId },
    { enabled: activeTab === "rou" }
  );
  const liability = trpc.lease.reportLiabilityRollForward.useQuery(
    { startDate, endDate, currency: currencyFilter, contractId: selectedContractId },
    { enabled: activeTab === "liability" }
  );
  const maturity = trpc.lease.reportMaturityAnalysis.useQuery(
    { asOfDate: endDate, currency: currencyFilter, contractId: selectedContractId },
    { enabled: activeTab === "maturity" }
  );
  const expense = trpc.lease.reportInterestExpense.useQuery(
    { startDate, endDate, currency: currencyFilter, granularity, contractId: selectedContractId },
    { enabled: activeTab === "expense" }
  );
  const expiry = trpc.lease.reportLeaseExpiry.useQuery(
    { daysAhead, currency: currencyFilter, contractId: selectedContractId },
    { enabled: activeTab === "expiry" }
  );
  const cashForecast = trpc.lease.reportCashForecast.useQuery(
    { months, currency: currencyFilter, contractId: selectedContractId },
    { enabled: activeTab === "cash" }
  );

  // ── AI Report Engine Queries ─────────────────────────────
  const latestReport = trpc.reportEngine.getLatestReport.useQuery(
    { reportType: currentReportType, contractId: selectedContractId, section: currentSection },
    { enabled: !!currentReportType }
  );

  const generateMut = trpc.reportEngine.generateReport.useMutation({
    onSuccess: (data) => {
      setIsGenerating(false);
      latestReport.refetch();
      toast.success("AI Report generated successfully");
    },
    onError: (err) => {
      setIsGenerating(false);
      toast.error(`Report generation failed: ${err.message}`);
    },
  });

  const handleGenerateReport = () => {
    const scopeKey = currentScopeKey;
    setIsGenerating(true);
    setGeneratedScopeKey(scopeKey);
    generateMut.mutate({
      reportType: currentReportType,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      currency: currencyFilter || undefined,
      contractId: selectedContractId,
      contractRef: selectedLease?.contract_ref ?? "All Leases",
      section: currentSection,
    });
  };

  // ── Computed Totals ──────────────────────────────────────
  const rouTotals = useMemo(() => {
    if (!rou.data || !Array.isArray(rou.data)) return null;
    const rows = rou.data as Array<Record<string, unknown>>;
    return {
      opening: rows.reduce((s, r) => s + Number(r.opening_nbv || 0), 0),
      additions: rows.reduce((s, r) => s + Number(r.additions || 0), 0),
      depreciation: rows.reduce((s, r) => s + Number(r.depreciation_period || 0), 0),
      modifications: rows.reduce((s, r) => s + Number(r.modifications || 0), 0),
      closing: rows.reduce((s, r) => s + Number(r.closing_nbv || 0), 0),
    };
  }, [rou.data]);

  const liabTotals = useMemo(() => {
    if (!liability.data || !Array.isArray(liability.data)) return null;
    const rows = liability.data as Array<Record<string, unknown>>;
    return {
      opening: rows.reduce((s, r) => s + Number(r.opening_liability || 0), 0),
      interest: rows.reduce((s, r) => s + Number(r.interest_accretion || 0), 0),
      payments: rows.reduce((s, r) => s + Number(r.payments || 0), 0),
      modifications: rows.reduce((s, r) => s + Number(r.modifications || 0), 0),
      closing: rows.reduce((s, r) => s + Number(r.closing_liability || 0), 0),
    };
  }, [liability.data]);

  const matTotals = useMemo(() => {
    if (!maturity.data || !Array.isArray(maturity.data)) return null;
    const rows = maturity.data as Array<Record<string, unknown>>;
    return {
      lt1: rows.reduce((s, r) => s + Number(r.band_lt_1yr || 0), 0),
      y12: rows.reduce((s, r) => s + Number(r.band_1_2yr || 0), 0),
      y25: rows.reduce((s, r) => s + Number(r.band_2_5yr || 0), 0),
      gt5: rows.reduce((s, r) => s + Number(r.band_gt_5yr || 0), 0),
      total: rows.reduce((s, r) => s + Number(r.total_undiscounted || 0), 0),
    };
  }, [maturity.data]);

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4">
        <ScreenHeader screenId="RPT-001" title="IFRS 16 Reports Centre" />

        {/* Filters Bar */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From Date</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40 h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To Date</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40 h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Lease Number</Label>
                <Select value={selectedLeaseId} onValueChange={setSelectedLeaseId}>
                  <SelectTrigger className="w-72 h-9">
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
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="QAR">QAR</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {activeTab === "expense" && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Granularity</Label>
                  <Select value={granularity} onValueChange={v => setGranularity(v as "Monthly" | "Quarterly")}>
                    <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Monthly">Monthly</SelectItem>
                      <SelectItem value="Quarterly">Quarterly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {activeTab === "expiry" && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Days Ahead</Label>
                  <Input type="number" value={daysAhead} onChange={e => setDaysAhead(Number(e.target.value))} className="w-28 h-9" />
                </div>
              )}
              {activeTab === "cash" && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Months</Label>
                  <Input type="number" value={months} onChange={e => setMonths(Number(e.target.value))} className="w-24 h-9" />
                </div>
              )}

              {/* AI Report Engine Buttons */}
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleGenerateReport}
                  disabled={isGenerating}
                  className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white"
                >
                  {isGenerating ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Generating...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-1" />Generate AI Report</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-7 w-full h-10">
            <TabsTrigger value="portfolio" className="text-xs"><PieChart className="h-3 w-3 mr-1" />Portfolio</TabsTrigger>
            <TabsTrigger value="rou" className="text-xs"><Building2 className="h-3 w-3 mr-1" />ROU Roll-Forward</TabsTrigger>
            <TabsTrigger value="liability" className="text-xs"><Banknote className="h-3 w-3 mr-1" />Liability Roll-Forward</TabsTrigger>
            <TabsTrigger value="maturity" className="text-xs"><BarChart3 className="h-3 w-3 mr-1" />Maturity</TabsTrigger>
            <TabsTrigger value="expense" className="text-xs"><TrendingDown className="h-3 w-3 mr-1" />Expense</TabsTrigger>
            <TabsTrigger value="expiry" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Expiry</TabsTrigger>
            <TabsTrigger value="cash" className="text-xs"><DollarSign className="h-3 w-3 mr-1" />Cash Forecast</TabsTrigger>
          </TabsList>

          {/* ══════ PORTFOLIO SUMMARY ══════ */}
          <TabsContent value="portfolio" className="mt-4">
            {portfolio.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading portfolio summary...</div>
            ) : portfolio.data ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard title="Total Leases" value={String(portfolio.data.total_leases ?? 0)} icon={<Building2 className="h-5 w-5" />} />
                <SummaryCard title="Total ROU (Original)" value={fmt(portfolio.data.total_rou_original)} icon={<TrendingUp className="h-5 w-5 text-green-500" />} />
                <SummaryCard title="Total Liability (Original)" value={fmt(portfolio.data.total_liability_original)} icon={<Banknote className="h-5 w-5 text-red-500" />} />
                <SummaryCard title="Current Liability" value={fmt(portfolio.data.current_total_liability)} icon={<TrendingDown className="h-5 w-5 text-orange-500" />} />
                <SummaryCard title="Monthly Payment" value={fmt(portfolio.data.total_monthly_payment)} icon={<DollarSign className="h-5 w-5 text-blue-500" />} />
                <SummaryCard title="Office Leases" value={String(portfolio.data.office_count ?? 0)} />
                <SummaryCard title="Vehicle Leases" value={String(portfolio.data.vehicle_count ?? 0)} />
                <SummaryCard title="Equipment Leases" value={String(portfolio.data.equipment_count ?? 0)} />
              </div>
            ) : null}
          </TabsContent>

          {/* ══════ ROU ROLL-FORWARD ══════ */}
          <TabsContent value="rou" className="mt-4">
            {rou.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading ROU roll-forward...</div>
            ) : (
              <div className="space-y-4">
                {rouTotals && (
                  <div className="grid grid-cols-5 gap-3">
                    <MiniCard label="Opening NBV" value={fmt(rouTotals.opening)} color="blue" />
                    <MiniCard label="Additions" value={fmt(rouTotals.additions)} color="green" />
                    <MiniCard label="Depreciation" value={`(${fmt(rouTotals.depreciation)})`} color="red" />
                    <MiniCard label="Modifications" value={fmt(rouTotals.modifications)} color="yellow" />
                    <MiniCard label="Closing NBV" value={fmt(rouTotals.closing)} color="purple" />
                  </div>
                )}
                <div className="rounded border overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Contract</TableHead>
                        <TableHead>Asset Type</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead className="text-right">Opening NBV</TableHead>
                        <TableHead className="text-right">Additions</TableHead>
                        <TableHead className="text-right">Depreciation</TableHead>
                        <TableHead className="text-right">Modifications</TableHead>
                        <TableHead className="text-right">Closing NBV</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(rou.data as Array<Record<string, unknown>> || []).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{String(row.contract_ref ?? "")}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{String(row.asset_type ?? "")}</Badge></TableCell>
                          <TableCell className="text-xs">{String(row.currency ?? "")}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.opening_nbv)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-green-600">{fmt(row.additions)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-red-500">({fmt(row.depreciation_period)})</TableCell>
                          <TableCell className="text-right font-mono text-xs text-yellow-600">{fmt(row.modifications)}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{fmt(row.closing_nbv)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ══════ LIABILITY ROLL-FORWARD ══════ */}
          <TabsContent value="liability" className="mt-4">
            {liability.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading liability roll-forward...</div>
            ) : (
              <div className="space-y-4">
                {liabTotals && (
                  <div className="grid grid-cols-5 gap-3">
                    <MiniCard label="Opening Liability" value={fmt(liabTotals.opening)} color="blue" />
                    <MiniCard label="Interest Accretion" value={fmt(liabTotals.interest)} color="orange" />
                    <MiniCard label="Payments" value={`(${fmt(liabTotals.payments)})`} color="green" />
                    <MiniCard label="Modifications" value={fmt(liabTotals.modifications)} color="yellow" />
                    <MiniCard label="Closing Liability" value={fmt(liabTotals.closing)} color="red" />
                  </div>
                )}
                <div className="rounded border overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Contract</TableHead>
                        <TableHead>Asset Type</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">Interest</TableHead>
                        <TableHead className="text-right">Payments</TableHead>
                        <TableHead className="text-right">Modifications</TableHead>
                        <TableHead className="text-right">Closing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(liability.data as Array<Record<string, unknown>> || []).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{String(row.contract_ref ?? "")}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{String(row.asset_type ?? "")}</Badge></TableCell>
                          <TableCell className="text-xs">{String(row.currency ?? "")}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.opening_liability)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-orange-500">{fmt(row.interest_accretion)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-green-600">({fmt(row.payments)})</TableCell>
                          <TableCell className="text-right font-mono text-xs text-yellow-600">{fmt(row.modifications)}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{fmt(row.closing_liability)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ══════ MATURITY ANALYSIS ══════ */}
          <TabsContent value="maturity" className="mt-4">
            {maturity.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading maturity analysis...</div>
            ) : (
              <div className="space-y-4">
                {matTotals && (
                  <div className="grid grid-cols-5 gap-3">
                    <MiniCard label="< 1 Year" value={fmt(matTotals.lt1)} color="green" />
                    <MiniCard label="1-2 Years" value={fmt(matTotals.y12)} color="blue" />
                    <MiniCard label="2-5 Years" value={fmt(matTotals.y25)} color="orange" />
                    <MiniCard label="> 5 Years" value={fmt(matTotals.gt5)} color="red" />
                    <MiniCard label="Total Undiscounted" value={fmt(matTotals.total)} color="purple" />
                  </div>
                )}
                <div className="rounded border overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Contract</TableHead>
                        <TableHead>Asset Type</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead className="text-right">Monthly</TableHead>
                        <TableHead className="text-right">&lt; 1 Year</TableHead>
                        <TableHead className="text-right">1-2 Years</TableHead>
                        <TableHead className="text-right">2-5 Years</TableHead>
                        <TableHead className="text-right">&gt; 5 Years</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(maturity.data as Array<Record<string, unknown>> || []).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{String(row.contract_ref ?? "")}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{String(row.asset_type ?? "")}</Badge></TableCell>
                          <TableCell className="text-xs">{String(row.currency ?? "")}</TableCell>
                          <TableCell className="text-xs">{fmtDate(row.expiry_date)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.monthly_payment)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.band_lt_1yr)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.band_1_2yr)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.band_2_5yr)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.band_gt_5yr)}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{fmt(row.total_undiscounted)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ══════ INTEREST & DEPRECIATION EXPENSE ══════ */}
          <TabsContent value="expense" className="mt-4">
            {expense.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading expense report...</div>
            ) : (
              <div className="space-y-4">
                <div className="rounded border overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead className="text-right">Interest Expense</TableHead>
                        <TableHead className="text-right">Depreciation</TableHead>
                        <TableHead className="text-right">Total P&L Impact</TableHead>
                        <TableHead className="text-right">Total Payment</TableHead>
                        <TableHead className="text-right">Lease Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(expense.data as Array<Record<string, unknown>> || []).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{String(row.period_label ?? "")}</TableCell>
                          <TableCell className="text-xs">{String(row.currency ?? "")}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-orange-500">{fmt(row.total_interest)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-red-500">{fmt(row.total_depreciation)}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold text-red-600">
                            {fmt(Number(row.total_interest || 0) + Number(row.total_depreciation || 0))}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.total_payment)}</TableCell>
                          <TableCell className="text-right text-xs">{String(row.lease_count ?? "")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ══════ LEASE EXPIRY ══════ */}
          <TabsContent value="expiry" className="mt-4">
            {expiry.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading lease expiry report...</div>
            ) : (
              <div className="space-y-4">
                <div className="rounded border overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Contract</TableHead>
                        <TableHead>Asset</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Days Left</TableHead>
                        <TableHead>Urgency</TableHead>
                        <TableHead>Renewal Option</TableHead>
                        <TableHead className="text-right">Monthly Payment</TableHead>
                        <TableHead className="text-right">Current Liability</TableHead>
                        <TableHead className="text-right">ROU NBV</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(expiry.data as Array<Record<string, unknown>> || []).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{String(row.contract_ref ?? "")}</TableCell>
                          <TableCell className="text-xs">{String(row.asset_description ?? "").substring(0, 30)}</TableCell>
                          <TableCell className="text-xs">{fmtDate(row.expiry_date)}</TableCell>
                          <TableCell className="text-xs font-semibold">{String(row.days_remaining ?? "")}</TableCell>
                          <TableCell>
                            <Badge variant={
                              row.urgency === "Critical" ? "destructive" :
                              row.urgency === "Urgent" ? "destructive" :
                              row.urgency === "Attention" ? "secondary" : "outline"
                            } className="text-xs">
                              {String(row.urgency ?? "")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.renewal_option ? (row.renewal_certain ? "✓ Certain" : "○ Optional") : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.monthly_payment)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.current_liability)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.current_rou_nbv)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ══════ CASH PAYMENT FORECAST ══════ */}
          <TabsContent value="cash" className="mt-4">
            {cashForecast.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading cash forecast...</div>
            ) : (
              <div className="space-y-4">
                <div className="rounded border overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead className="text-right">Total Payment</TableHead>
                        <TableHead className="text-right">Interest Portion</TableHead>
                        <TableHead className="text-right">Principal Portion</TableHead>
                        <TableHead className="text-right">Lease Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(cashForecast.data as Array<Record<string, unknown>> || []).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{String(row.period_label ?? "")}</TableCell>
                          <TableCell className="text-xs">{String(row.currency ?? "")}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{fmt(row.total_payment)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-orange-500">{fmt(row.interest_portion)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-green-600">{fmt(row.principal_portion)}</TableCell>
                          <TableCell className="text-right text-xs">{String(row.lease_count ?? "")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
        <InlineAIReport
          title={`${REPORT_TYPE_LABELS[currentReportType] || "IFRS 16"} AI Report`}
          leaseLabel={selectedLeaseLabel}
          content={(generatedScopeKey === currentScopeKey ? generateMut.data?.content : undefined) ?? latestReport.data?.content_markdown}
          generatedAt={latestReport.data?.generated_at}
          generatedBy={latestReport.data?.generated_by}
          isGenerating={isGenerating}
          onGenerate={handleGenerateReport}
        />
      </div>

      {/* ══════ AI REPORT OVERLAY ══════ */}
      {false && (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm overflow-auto">
          <div className="max-w-5xl mx-auto p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {REPORT_TYPE_LABELS[currentReportType] || "AI Report"}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {latestReport.data?.generated_at
                      ? `Generated: ${fmtDate(latestReport.data.generated_at)} by ${latestReport.data.generated_by || "System"}`
                      : "No report generated yet"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateReport}
                  disabled={isGenerating}
                  className="border-amber-500/50 text-amber-400 hover:bg-amber-950/50"
                >
                  {isGenerating ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Regenerating...</>
                  ) : (
                    <><RefreshCw className="h-3.5 w-3.5 mr-1" />Regenerate</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAIReport(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Report Content */}
            <div className="bg-gray-900/80 border border-gray-700/50 rounded-xl p-8">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Loader2 className="h-10 w-10 text-amber-500 animate-spin" />
                  <p className="text-gray-400">Generating AI report from live data...</p>
                  <p className="text-xs text-gray-500">This may take 15-30 seconds</p>
                </div>
              ) : latestReport.data?.content_markdown ? (
                <div className="prose prose-invert prose-sm max-w-none
                  prose-headings:text-amber-300 prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                  prose-strong:text-white prose-a:text-blue-400
                  prose-table:border-gray-600 prose-th:bg-gray-800/50 prose-th:text-gray-200
                  prose-td:border-gray-700 prose-th:border-gray-700
                  prose-li:text-gray-300 prose-p:text-gray-300
                  prose-code:text-emerald-400 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded
                ">
                  <Streamdown>{latestReport.data.content_markdown}</Streamdown>
                </div>
              ) : generateMut.data?.content ? (
                <div className="prose prose-invert prose-sm max-w-none
                  prose-headings:text-amber-300 prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                  prose-strong:text-white prose-a:text-blue-400
                  prose-table:border-gray-600 prose-th:bg-gray-800/50 prose-th:text-gray-200
                  prose-td:border-gray-700 prose-th:border-gray-700
                  prose-li:text-gray-300 prose-p:text-gray-300
                  prose-code:text-emerald-400 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded
                ">
                  <Streamdown>{generateMut.data?.content ?? ""}</Streamdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Sparkles className="h-10 w-10 text-gray-600" />
                  <p className="text-gray-400">No report generated yet for this tab.</p>
                  <p className="text-xs text-gray-500">Click "Generate AI Report" to create one from live data.</p>
                  <Button
                    size="sm"
                    onClick={handleGenerateReport}
                    className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white mt-2"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />Generate Now
                  </Button>
                </div>
              )}
            </div>

            {/* Footer */}
            {latestReport.data && (
              <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  <span>Report ID: #{latestReport.data.id}</span>
                  <span>|</span>
                  <span>Period: {latestReport.data.from_date ? fmtDate(latestReport.data.from_date) : "Inception"} — {latestReport.data.to_date ? fmtDate(latestReport.data.to_date) : "Today"}</span>
                  <span>|</span>
                  <span>Currency: {latestReport.data.currency || "All"}</span>
                </div>
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/50">
                  {latestReport.data.status}
                </Badge>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function SummaryCard({ title, value, icon }: { title: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4 flex items-center gap-3">
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "border-l-blue-500",
    green: "border-l-green-500",
    red: "border-l-red-500",
    orange: "border-l-orange-500",
    yellow: "border-l-yellow-500",
    purple: "border-l-purple-500",
  };
  return (
    <Card className={`border-l-4 ${colorMap[color] || "border-l-gray-500"}`}>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-bold font-mono">{value}</p>
      </CardContent>
    </Card>
  );
}
