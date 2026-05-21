/**
 * Feature 15 — Multi-Standard Parallel Computation
 * Side-by-side comparison of a lease under IFRS 16, ASC 842, and IPSAS 43
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const fmt = (v: unknown) =>
  v == null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtPct = (v: unknown) =>
  v == null ? "—" : `${Number(v).toFixed(4)}%`;

const STANDARD_NOTES = [
  {
    standard: "IFRS 16",
    color: "bg-blue-600",
    model: "Single model — all leases on balance sheet",
    plMethod: "Interest expense + Depreciation (front-loaded)",
    balanceSheet: "ROU Asset + Lease Liability recognised for ALL leases",
    keyRef: "IFRS 16 Para 22–49",
  },
  {
    standard: "ASC 842",
    color: "bg-purple-600",
    model: "Dual model — finance vs. operating distinction retained",
    plMethod: "Finance: Interest + Depr (front-loaded). Operating: Straight-line single lease cost",
    balanceSheet: "Both types on balance sheet; operating leases show ROU + liability but P&L is straight-line",
    keyRef: "ASC 842-20-25, 842-20-45",
  },
  {
    standard: "IPSAS 43",
    color: "bg-green-600",
    model: "Single model — aligned with IFRS 16 from 2025",
    plMethod: "Interest expense + Depreciation (same as IFRS 16)",
    balanceSheet: "ROU Asset + Lease Liability for ALL leases (public sector entities)",
    keyRef: "IPSAS 43 Para 22–48",
  },
];

export default function MultiStandardComparison() {
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [activeTab, setActiveTab] = useState("portfolio");

  // Fetch all active leases for selector
  const { data: leases } = trpc.lease.getLeaseRegister.useQuery({ status: "active" });

  // Portfolio summary (all leases)
  const { data: portfolio, isLoading: portfolioLoading } = trpc.accounting.multiStandard.portfolioSummary.useQuery({
    periodStart: periodStart || undefined,
    periodEnd: periodEnd || undefined,
  });

  // Per-lease comparison
  const compareInput = useMemo(() => ({
    contractId: selectedContractId ?? 0,
    periodStart: periodStart || undefined,
    periodEnd: periodEnd || undefined,
  }), [selectedContractId, periodStart, periodEnd]);

  const { data: comparison, isLoading: compareLoading } = trpc.accounting.multiStandard.compare.useQuery(
    compareInput,
    { enabled: !!selectedContractId }
  );

  const portfolioRows = (portfolio?.rows ?? []) as Array<Record<string, unknown>>;
  const compareRows = (comparison?.rows ?? []) as Array<Record<string, unknown>>;
  const summary = (comparison?.summary ?? {}) as Record<string, unknown>;

  // Chart data for portfolio: grouped by contract
  const portfolioChartData = portfolioRows.slice(0, 15).map((r) => ({
    name: String(r.contract_ref ?? ""),
    "IFRS 16": Number(r.ifrs16_total_pl ?? 0),
    "ASC 842": Number(r.asc842_total_pl ?? 0),
    "IPSAS 43": Number(r.ipsas43_total_pl ?? 0),
  }));

  // Chart data for per-lease: monthly P&L comparison
  const compareChartData = compareRows.slice(0, 36).map((r) => ({
    name: String(r.period_date ?? "").slice(0, 7),
    "IFRS 16": Number(r.ifrs16_pl_charge ?? 0),
    "ASC 842": Number(r.asc842_pl_charge ?? 0),
    "IPSAS 43": Number(r.ipsas43_pl_charge ?? 0),
  }));

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
      <ScreenHeader
        screenId="VFLMULSTD0001P001" screenType="multi_standard_comparison"
        title="Multi-Standard Comparison"
        subtitle="IFRS 16 | ASC 842 | IPSAS 43 — parallel computation"
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Period Start</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm bg-background"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Period End</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm bg-background"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[260px]">
              <label className="text-xs text-muted-foreground font-medium">Lease (for per-lease tab)</label>
              <Select
                value={selectedContractId?.toString() ?? ""}
                onValueChange={(v) => setSelectedContractId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a lease…" />
                </SelectTrigger>
                <SelectContent>
                  {((leases as any)?.rows ?? leases ?? []).map((l: Record<string, unknown>) => (
                    <SelectItem key={String(l.contract_id)} value={String(l.contract_id)}>
                      {String(l.contract_ref)} — {String(l.asset_description ?? "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Standard Notes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STANDARD_NOTES.map((s) => (
          <Card key={s.standard} className="border-l-4" style={{ borderLeftColor: s.standard === "IFRS 16" ? "#2563eb" : s.standard === "ASC 842" ? "#9333ea" : "#16a34a" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge className={`${s.color} text-white text-xs`}>{s.standard}</Badge>
                {s.model}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p><span className="font-semibold text-foreground">P&L:</span> {s.plMethod}</p>
              <p><span className="font-semibold text-foreground">Balance Sheet:</span> {s.balanceSheet}</p>
              <p className="text-blue-400">{s.keyRef}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="portfolio">Portfolio Summary</TabsTrigger>
          <TabsTrigger value="lease">Per-Lease Detail</TabsTrigger>
          <TabsTrigger value="chart">Chart View</TabsTrigger>
        </TabsList>

        {/* Portfolio Summary Tab */}
        <TabsContent value="portfolio">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Portfolio — Total P&L Charge by Standard</CardTitle>
            </CardHeader>
            <CardContent>
              {portfolioLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading…</div>
              ) : portfolioRows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No data available for the selected period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 px-3">Contract</th>
                        <th className="text-left py-2 px-3">Asset</th>
                        <th className="text-left py-2 px-3">Type</th>
                        <th className="text-left py-2 px-3">ASC 842 Class</th>
                        <th className="text-right py-2 px-3 text-blue-400">IFRS 16 P&L</th>
                        <th className="text-right py-2 px-3 text-purple-400">ASC 842 P&L</th>
                        <th className="text-right py-2 px-3 text-green-400">IPSAS 43 P&L</th>
                        <th className="text-right py-2 px-3 text-orange-400">IFRS vs ASC Diff</th>
                        <th className="text-right py-2 px-3">Peak ROU (IFRS)</th>
                        <th className="text-right py-2 px-3">Peak Liab (IFRS)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioRows.map((r, i) => {
                        const diff = Number(r.ifrs16_vs_asc842_pl_diff ?? 0);
                        return (
                          <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-3 font-mono text-xs">{String(r.contract_ref ?? "")}</td>
                            <td className="py-2 px-3">{String(r.asset_description ?? "")}</td>
                            <td className="py-2 px-3 capitalize">{String(r.asset_type ?? "")}</td>
                            <td className="py-2 px-3">
                              <Badge variant={r.asc842_classification === "operating" ? "secondary" : "default"} className="text-xs capitalize">
                                {String(r.asc842_classification ?? "finance")}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-right text-blue-400 font-mono">{fmt(r.ifrs16_total_pl)}</td>
                            <td className="py-2 px-3 text-right text-purple-400 font-mono">{fmt(r.asc842_total_pl)}</td>
                            <td className="py-2 px-3 text-right text-green-400 font-mono">{fmt(r.ipsas43_total_pl)}</td>
                            <td className={`py-2 px-3 text-right font-mono font-semibold ${diff > 0 ? "text-red-400" : diff < 0 ? "text-green-400" : "text-muted-foreground"}`}>
                              {diff === 0 ? "—" : fmt(diff)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-muted-foreground">{fmt(r.ifrs16_peak_rou)}</td>
                            <td className="py-2 px-3 text-right font-mono text-muted-foreground">{fmt(r.ifrs16_peak_liability)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Per-Lease Detail Tab */}
        <TabsContent value="lease">
          {!selectedContractId ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a lease from the filter above to view per-period multi-standard detail.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Summary KPIs */}
              {Object.keys(summary).length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "IFRS 16 Total P&L", value: fmt(summary.ifrs16_total_pl), color: "text-blue-400" },
                    { label: "ASC 842 Total P&L", value: fmt(summary.asc842_total_pl), color: "text-purple-400" },
                    { label: "IPSAS 43 Total P&L", value: fmt(summary.ipsas43_total_pl), color: "text-green-400" },
                    { label: "IFRS vs ASC Diff", value: fmt(summary.ifrs16_vs_asc842_total_pl_diff), color: Number(summary.ifrs16_vs_asc842_total_pl_diff ?? 0) > 0 ? "text-red-400" : "text-green-400" },
                  ].map((kpi) => (
                    <Card key={kpi.label}>
                      <CardContent className="pt-4">
                        <p className="text-xs text-muted-foreground">{kpi.label}</p>
                        <p className={`text-xl font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Period Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Monthly Period Detail</CardTitle>
                </CardHeader>
                <CardContent>
                  {compareLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Computing…</div>
                  ) : compareRows.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">No amortisation data for this lease in the selected period.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2 px-2">Period</th>
                            <th className="text-right py-2 px-2 text-blue-400">IFRS16 Liab</th>
                            <th className="text-right py-2 px-2 text-blue-400">IFRS16 Int</th>
                            <th className="text-right py-2 px-2 text-blue-400">IFRS16 Depr</th>
                            <th className="text-right py-2 px-2 text-blue-400">IFRS16 P&L</th>
                            <th className="text-right py-2 px-2 text-purple-400">ASC842 Liab</th>
                            <th className="text-right py-2 px-2 text-purple-400">ASC842 P&L</th>
                            <th className="text-right py-2 px-2 text-green-400">IPSAS43 P&L</th>
                            <th className="text-right py-2 px-2 text-orange-400">Diff</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compareRows.map((r, i) => {
                            const diff = Number(r.ifrs16_vs_asc842_pl_diff ?? 0);
                            return (
                              <tr key={i} className="border-b hover:bg-muted/30">
                                <td className="py-1.5 px-2 font-mono">{String(r.period_date ?? "").slice(0, 10)}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-blue-400">{fmt(r.ifrs16_closing_liability)}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-blue-400">{fmt(r.ifrs16_interest_expense)}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-blue-400">{fmt(r.ifrs16_depreciation)}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-blue-400 font-semibold">{fmt(r.ifrs16_pl_charge)}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-purple-400">{fmt(r.asc842_closing_liability)}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-purple-400 font-semibold">{fmt(r.asc842_pl_charge)}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-green-400 font-semibold">{fmt(r.ipsas43_pl_charge)}</td>
                                <td className={`py-1.5 px-2 text-right font-mono font-semibold ${diff > 0 ? "text-red-400" : diff < 0 ? "text-green-400" : "text-muted-foreground"}`}>
                                  {diff === 0 ? "—" : fmt(diff)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Chart Tab */}
        <TabsContent value="chart">
          <div className="grid grid-cols-1 gap-6">
            {/* Portfolio chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Portfolio — Total P&L by Standard (per lease)</CardTitle>
              </CardHeader>
              <CardContent>
                {portfolioChartData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={portfolioChartData} margin={{ top: 5, right: 20, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval={0} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend />
                      <Bar dataKey="IFRS 16" fill="#2563eb" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="ASC 842" fill="#9333ea" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="IPSAS 43" fill="#16a34a" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Per-lease monthly chart */}
            {selectedContractId && compareChartData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Per-Lease — Monthly P&L Charge by Standard</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={compareChartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend />
                      <Bar dataKey="IFRS 16" fill="#2563eb" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="ASC 842" fill="#9333ea" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="IPSAS 43" fill="#16a34a" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </DashboardLayout>
  );
}
