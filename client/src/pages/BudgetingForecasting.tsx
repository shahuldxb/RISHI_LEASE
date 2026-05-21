import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Download, RefreshCw, Target } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const BUDGET_DATA = [
  { entity: "VF-Qatar", category: "Office Leases", budget_annual: 18500000, actual_ytd: 6120000, forecast_annual: 18360000, variance: -140000 },
  { entity: "VF-Qatar", category: "Network Sites", budget_annual: 42000000, actual_ytd: 14350000, forecast_annual: 43050000, variance: 1050000 },
  { entity: "VF-Qatar", category: "Retail Stores", budget_annual: 8200000, actual_ytd: 2680000, forecast_annual: 8040000, variance: -160000 },
  { entity: "VF-DXB", category: "Office Leases", budget_annual: 9400000, actual_ytd: 3100000, forecast_annual: 9300000, variance: -100000 },
  { entity: "VF-DXB", category: "Data Centres", budget_annual: 15600000, actual_ytd: 5250000, forecast_annual: 15750000, variance: 150000 },
  { entity: "VF-AUH", category: "Office Leases", budget_annual: 5800000, actual_ytd: 1920000, forecast_annual: 5760000, variance: -40000 },
];

const CASHFLOW_MONTHLY = [
  { month: "Jan 26", principal: 1820000, interest: 380000, total: 2200000, cumulative: 2200000 },
  { month: "Feb 26", principal: 1835000, interest: 365000, total: 2200000, cumulative: 4400000 },
  { month: "Mar 26", principal: 1851000, interest: 349000, total: 2200000, cumulative: 6600000 },
  { month: "Apr 26", principal: 1867000, interest: 333000, total: 2200000, cumulative: 8800000 },
  { month: "May 26", principal: 1883000, interest: 317000, total: 2200000, cumulative: 11000000 },
  { month: "Jun 26", principal: 1899000, interest: 301000, total: 2200000, cumulative: 13200000 },
  { month: "Jul 26", principal: 1915000, interest: 285000, total: 2200000, cumulative: 15400000 },
  { month: "Aug 26", principal: 1931000, interest: 269000, total: 2200000, cumulative: 17600000 },
  { month: "Sep 26", principal: 1947000, interest: 253000, total: 2200000, cumulative: 19800000 },
  { month: "Oct 26", principal: 1963000, interest: 237000, total: 2200000, cumulative: 22000000 },
  { month: "Nov 26", principal: 1979000, interest: 221000, total: 2200000, cumulative: 24200000 },
  { month: "Dec 26", principal: 1996000, interest: 204000, total: 2200000, cumulative: 26400000 },
];

const SCENARIO_RESULTS = [
  { scenario: "Base Case", assumption: "No new leases, no terminations", rou_asset_2027: 198400000, liability_2027: 187200000, annual_payment: 26400000 },
  { scenario: "Expansion (+15 leases)", assumption: "15 new network sites at QAR 85K/month avg", rou_asset_2027: 231600000, liability_2027: 218900000, annual_payment: 31700000 },
  { scenario: "Contraction (10 terminations)", assumption: "10 office leases terminated at renewal", rou_asset_2027: 165200000, liability_2027: 156100000, annual_payment: 21900000 },
  { scenario: "Rate Shock (+200bps IBR)", assumption: "IBR increases by 200bps across all leases", rou_asset_2027: 193100000, liability_2027: 182400000, annual_payment: 26400000 },
];

export default function BudgetingForecasting() {
  const utils = trpc.useUtils();
  const actionMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Action completed successfully"),
    onError: (e: any) => toast.error(e.message),
  });
  const [tab, setTab] = useState("budget");
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [year, setYear] = useState("2026");
  const [entity, setEntity] = useState("ALL");

  const filteredBudget = entity === "ALL" ? BUDGET_DATA : BUDGET_DATA.filter(b => b.entity === entity);
  const totalBudget = filteredBudget.reduce((s, b) => s + b.budget_annual, 0);
  const totalActual = filteredBudget.reduce((s, b) => s + b.actual_ytd, 0);
  const totalForecast = filteredBudget.reduce((s, b) => s + b.forecast_annual, 0);
  const totalVariance = filteredBudget.reduce((s, b) => s + b.variance, 0);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
  screenId="VFLBDGFRC0001P001"
          screenType="budgeting"
          onAIData={(rows) => setAiRows(rows)}
  title="Budgeting & Cash Flow Forecasting"
  subtitle="Annual budget planning and cash flow projection"
/>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: `${year} Budget (QAR)`, value: `${(totalBudget / 1000000).toFixed(1)}M`, icon: Target, color: "text-blue-400" },
            { label: "Actual YTD (QAR)", value: `${(totalActual / 1000000).toFixed(1)}M`, icon: DollarSign, color: "text-green-400" },
            { label: "Full-Year Forecast", value: `${(totalForecast / 1000000).toFixed(1)}M`, icon: BarChart3, color: "text-yellow-400" },
            { label: "Variance (QAR)", value: `${totalVariance >= 0 ? "+" : ""}${(totalVariance / 1000000).toFixed(1)}M`, icon: totalVariance >= 0 ? TrendingUp : TrendingDown, color: totalVariance >= 0 ? "text-red-400" : "text-green-400" },
          ].map((kpi) => (
            <Card key={kpi.label} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <kpi.icon className={`w-8 h-8 ${kpi.color}`} />
                  <div>
                    <p className="text-xl font-bold">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-muted/30">
            <TabsTrigger value="budget">Budget vs Actual</TabsTrigger>
            <TabsTrigger value="cashflow">Monthly Cash Flow</TabsTrigger>
            <TabsTrigger value="scenarios">Scenario Analysis</TabsTrigger>
            <TabsTrigger value="heatmap">Payment Heatmap</TabsTrigger>
          </TabsList>

          <TabsContent value="budget" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Budget vs Actual vs Forecast — {year}</CardTitle>
                  <Select value={entity} onValueChange={setEntity}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Entities</SelectItem>
                      <SelectItem value="VF-Qatar">VF-Qatar</SelectItem>
                      <SelectItem value="VF-DXB">VF-DXB</SelectItem>
                      <SelectItem value="VF-AUH">VF-AUH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Entity</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs text-right">Annual Budget</TableHead>
                      <TableHead className="text-xs text-right">Actual YTD (Q1)</TableHead>
                      <TableHead className="text-xs text-right">Full-Year Forecast</TableHead>
                      <TableHead className="text-xs text-right">Variance</TableHead>
                      <TableHead className="text-xs">Trend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBudget.map((b, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs font-semibold">{b.entity}</TableCell>
                        <TableCell className="text-sm">{b.category}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(b.budget_annual / 1000000).toFixed(2)}M</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(b.actual_ytd / 1000000).toFixed(2)}M</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(b.forecast_annual / 1000000).toFixed(2)}M</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${b.variance > 0 ? "text-red-400" : "text-green-400"}`}>
                          {b.variance > 0 ? "+" : ""}{(b.variance / 1000).toFixed(0)}K
                        </TableCell>
                        <TableCell>
                          {b.variance > 0
                            ? <TrendingUp className="w-4 h-4 text-red-400" />
                            : <TrendingDown className="w-4 h-4 text-green-400" />}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell colSpan={2} className="text-sm">TOTAL</TableCell>
                      <TableCell className="text-right font-mono text-sm">{(totalBudget / 1000000).toFixed(2)}M</TableCell>
                      <TableCell className="text-right font-mono text-sm">{(totalActual / 1000000).toFixed(2)}M</TableCell>
                      <TableCell className="text-right font-mono text-sm">{(totalForecast / 1000000).toFixed(2)}M</TableCell>
                      <TableCell className={`text-right font-mono text-sm ${totalVariance > 0 ? "text-red-400" : "text-green-400"}`}>
                        {totalVariance > 0 ? "+" : ""}{(totalVariance / 1000).toFixed(0)}K
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cashflow" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm">Monthly Lease Payment Schedule — {year}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Month</TableHead>
                      <TableHead className="text-xs text-right">Principal (QAR)</TableHead>
                      <TableHead className="text-xs text-right">Interest (QAR)</TableHead>
                      <TableHead className="text-xs text-right">Total Payment</TableHead>
                      <TableHead className="text-xs text-right">Cumulative YTD</TableHead>
                      <TableHead className="text-xs">Bar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CASHFLOW_MONTHLY.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm font-medium">{row.month}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(row.principal / 1000000).toFixed(2)}M</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{(row.interest / 1000000).toFixed(2)}M</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{(row.total / 1000000).toFixed(2)}M</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{(row.cumulative / 1000000).toFixed(1)}M</TableCell>
                        <TableCell>
                          <div className="w-24 h-3 bg-muted/30 rounded overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${(row.principal / row.total) * 100}%`, background: "linear-gradient(90deg, #e60000 0%, #ff6666 100%)" }} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell className="text-sm">TOTAL {year}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{(CASHFLOW_MONTHLY.reduce((s, r) => s + r.principal, 0) / 1000000).toFixed(2)}M</TableCell>
                      <TableCell className="text-right font-mono text-sm">{(CASHFLOW_MONTHLY.reduce((s, r) => s + r.interest, 0) / 1000000).toFixed(2)}M</TableCell>
                      <TableCell className="text-right font-mono text-sm">{(CASHFLOW_MONTHLY.reduce((s, r) => s + r.total, 0) / 1000000).toFixed(2)}M</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scenarios" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SCENARIO_RESULTS.map((s, i) => (
                <Card key={i} className={`bg-card border-border ${i === 0 ? "border-blue-500/30" : ""}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{s.scenario}</CardTitle>
                      {i === 0 && <Badge className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">Base</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{s.assumption}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded bg-muted/20">
                        <p className="text-sm font-bold">{(s.rou_asset_2027 / 1000000).toFixed(0)}M</p>
                        <p className="text-xs text-muted-foreground">ROU Asset 2027</p>
                      </div>
                      <div className="p-2 rounded bg-muted/20">
                        <p className="text-sm font-bold">{(s.liability_2027 / 1000000).toFixed(0)}M</p>
                        <p className="text-xs text-muted-foreground">Liability 2027</p>
                      </div>
                      <div className="p-2 rounded bg-muted/20">
                        <p className="text-sm font-bold">{(s.annual_payment / 1000000).toFixed(1)}M</p>
                        <p className="text-xs text-muted-foreground">Annual Payment</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="heatmap" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm">Monthly Payment Heatmap — {year} (QAR M)</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-12 gap-1">
                  {MONTHS.map((m, i) => {
                    const val = CASHFLOW_MONTHLY[i]?.total || 0;
                    const intensity = Math.min(1, val / 3000000);
                    return (
                      <div key={m} className="text-center">
                        <div className="h-16 rounded flex items-center justify-center text-xs font-mono font-bold"
                          style={{ backgroundColor: `rgba(230,0,0,${0.1 + intensity * 0.7})`, color: intensity > 0.5 ? "#fff" : "#e60000" }}>
                          {(val / 1000000).toFixed(1)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{m}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 mt-4 justify-end">
                  <span className="text-xs text-muted-foreground">Low</span>
                  <div className="flex gap-0.5">
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
                      <div key={v} className="w-6 h-4 rounded" style={{ backgroundColor: `rgba(230,0,0,${v})` }} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">High</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
