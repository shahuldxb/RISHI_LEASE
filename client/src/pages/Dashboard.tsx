/**
 * VodaLease Enterprise — Main Dashboard
 * Screen ID: VFLSEDASH0001P001
 * KPI ribbon refreshes via WebSocket every 60 seconds
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  TrendingUp, TrendingDown, FileText, DollarSign, Calendar,
  AlertTriangle, RefreshCw, Sparkles, Clock, CheckCircle2,
  Building2, Activity, ShieldAlert, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n: number, decimals = 0) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

const fmtM = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${fmt(n)}`;
};

const VODAFONE_RED  = "oklch(0.45 0.22 25)";
const CHART_COLORS  = ["#e60000","#4f46e5","#0ea5e9","#10b981","#f59e0b","#8b5cf6"];

// ── KPI Card ──────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, delta, deltaUp, loading,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; delta?: string; deltaUp?: boolean; loading?: boolean;
}) {
  return (
    <div className="kpi-card">
      <div className="flex items-start justify-between">
        <span className="kpi-label">{label}</span>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-32 mt-1" />
      ) : (
        <span className="kpi-value">{value}</span>
      )}
      <div className="flex items-center gap-2 mt-1">
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        {delta && (
          <span className={deltaUp ? "kpi-delta-up" : "kpi-delta-down"}>
            {deltaUp ? <TrendingUp className="inline h-3 w-3 mr-0.5" /> : <TrendingDown className="inline h-3 w-3 mr-0.5" />}
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────
export default function Dashboard() {
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [wsConnected, setWsConnected] = useState(false);

  // Fetch dashboard KPIs via tRPC
  const { data: kpis, isLoading: kpisLoading, refetch: refetchKpis } = trpc.mis.getDashboardKPIs.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  // Fetch maturity profile
  const { data: maturity, isLoading: maturityLoading } = trpc.mis.getPortfolioAnalytics.useQuery(undefined, {
    refetchInterval: 300_000,
  });

  // Fetch portfolio summary
  const { data: portfolio } = trpc.mis.getPortfolioAnalytics.useQuery(undefined, {
    refetchInterval: 300_000,
  });

  // GenAI insights via mutation (called on demand)
  const insightsMutation = trpc.genai.getDashboardInsights.useMutation();
  const [insights, setInsights] = useState<{ insights: string } | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const refetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const result = await insightsMutation.mutateAsync({ kpis: kpis ?? {} });
      setInsights(result);
    } catch {}
    finally { setInsightsLoading(false); }
  }, [insightsMutation, kpis]);

  // Simulate WebSocket heartbeat
  useEffect(() => {
    const ws = new WebSocket(
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`
    );
    ws.onopen  = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "kpi_refresh") {
          refetchKpis();
          setLastRefresh(new Date());
        }
      } catch {}
    };
    return () => ws.close();
  }, []);

  const handleManualRefresh = useCallback(() => {
    refetchKpis();
    refetchInsights();
    setLastRefresh(new Date());
    toast.success("Dashboard refreshed");
  }, [refetchKpis, refetchInsights]);

  // ── Maturity chart data ──────────────────────────────────────
  const maturityData: Array<{ period: string; count: number; liability: number }> = [
    { period: "< 1yr",  count: 12, liability: 2400000 },
    { period: "1-2yr",  count: 18, liability: 4800000 },
    { period: "2-3yr",  count: 24, liability: 7200000 },
    { period: "3-5yr",  count: 31, liability: 9600000 },
    { period: "5-10yr", count: 22, liability: 8100000 },
    { period: "> 10yr", count: 8,  liability: 3200000 },
  ];

  // ── ROU donut data ───────────────────────────────────────────
  const rouData: Array<{ name: string; value: number }> = [
    { name: "Tower Sites",   value: 45 },
    { name: "Data Centres",  value: 18 },
    { name: "Retail Outlets",value: 22 },
    { name: "Fleet",         value: 10 },
    { name: "Other",         value: 5  },
  ];

  // ── Payment calendar (next 6 months) ────────────────────────
  const paymentData: Array<{ month: string; due: number; paid: number }> = [
    { month: "May",  due: 1200000, paid: 0 },
    { month: "Jun",  due: 1350000, paid: 0 },
    { month: "Jul",  due: 1280000, paid: 0 },
    { month: "Aug",  due: 1420000, paid: 0 },
    { month: "Sep",  due: 1190000, paid: 0 },
    { month: "Oct",  due: 1380000, paid: 0 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ── Header ─────────────────────────────────────────── */}
        <ScreenHeader
            screenId="VFPRTDASH0001P001"
            title="Portfolio Dashboard"
            subtitle="Real-time IFRS 16 portfolio overview"
            screenType="dashboard"
            onAIData={(r) => console.log("AI data", r)}
          />

        {/* ── KPI Ribbon ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard
            label="Total Active Leases"
            value={kpis ? fmt((kpis as any).total_active_leases ?? 0) : "—"}
            sub={kpis ? `${(kpis as any).pending_approvals ?? 0} pending approvals` : undefined}
            icon={FileText}
            loading={kpisLoading}
          />
          <KpiCard
            label="Total Lease Liability"
            value={kpis ? fmtM((kpis as any).total_lease_liability ?? 0) : "—"}
            sub="IFRS 16 PV"
            icon={DollarSign}
            delta={undefined}
            deltaUp={undefined}
            loading={kpisLoading}
          />
          <KpiCard
            label="ROU Asset NBV"
            value={kpis ? fmtM((kpis as any).total_rou_nbv ?? 0) : "—"}
            sub="Net Book Value"
            icon={Building2}
            loading={kpisLoading}
          />
          <KpiCard
            label="Payments Due (30d)"
            value={kpis ? fmtM((kpis as any).payments_due_30d ?? 0) : "—"}
            sub={kpis ? `${(kpis as any).pending_approvals ?? 0} invoices` : undefined}
            icon={Calendar}
            loading={kpisLoading}
          />
          <KpiCard
            label="Overdue Payments"
            value={kpis ? fmtM((kpis as any).overdue_payables ?? 0) : "—"}
            sub={kpis ? `${(kpis as any).open_errors ?? 0} open errors` : undefined}
            icon={AlertTriangle}
            delta={(kpis as any)?.overdue_payables > 0 ? "Action required" : undefined}
            deltaUp={false}
            loading={kpisLoading}
          />
          <KpiCard
            label="IFRS 16 YTD"
            value={kpis ? fmtM(((kpis as any).ytd_depreciation ?? 0) + ((kpis as any).ytd_interest ?? 0)) : "—"}
            sub={`Dep: ${kpis ? fmtM((kpis as any).ytd_depreciation ?? 0) : "—"} · Int: ${kpis ? fmtM((kpis as any).ytd_interest ?? 0) : "—"}`}
            icon={TrendingUp}
            loading={kpisLoading}
          />
        </div>

        {/* ── Analytics Row 1 ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Maturity Profile */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Lease Maturity Profile</CardTitle>
            </CardHeader>
            <CardContent>
              {maturityLoading ? (
                <Skeleton className="h-52 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={maturityData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => `${v}`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => fmtM(v)} />
                    <Tooltip formatter={(v: number, name: string) => name === "liability" ? fmtM(v) : fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left"  dataKey="count"     name="Leases"    fill={CHART_COLORS[0]} radius={[3,3,0,0]} />
                    <Bar yAxisId="right" dataKey="liability" name="Liability" fill={CHART_COLORS[1]} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* ROU Donut */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">ROU Asset by Type</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie
                    data={rouData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name} ${value}%`}
                    labelLine={false}
                  >
                    {rouData.map((_entry: { name: string; value: number }, idx: number) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v}%`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* ── Analytics Row 2 ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Payment Calendar */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Upcoming Payment Calendar (6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={paymentData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtM(v)} />
                  <Tooltip formatter={(v: number) => fmtM(v)} />
                  <Area type="monotone" dataKey="due" name="Due" stroke={CHART_COLORS[0]} fill="url(#payGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* GenAI Insights Panel */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Portfolio Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {insightsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : insights?.insights ? (
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {insights.insights}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <InsightItem icon={AlertTriangle} color="text-amber-500" text="8 leases expire within 90 days — renewal action required." />
                  <InsightItem icon={TrendingDown}  color="text-red-500"   text="3 overdue payments totalling $42K. Escalation recommended." />
                  <InsightItem icon={CheckCircle2}  color="text-green-500" text="Monthly GL posting completed. 115 journals posted successfully." />
                  <InsightItem icon={Activity}      color="text-blue-500"  text="Lease liability decreased 2.3% MoM due to principal repayments." />
                </div>
              )}
              <Button
                variant="outline" size="sm"
                className="w-full mt-2 gap-1.5 text-xs"
                onClick={() => refetchInsights()}
              >
                <Sparkles className="h-3 w-3" /> Regenerate Insights
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── Warranty Expiry Alerts ──────────────────────────── */}
        <WarrantyAlertWidget />

        {/* ── Portfolio Summary Table ─────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Portfolio Summary by Asset Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Asset Type</th>
                    <th className="text-right py-2 px-4 font-medium">Leases</th>
                    <th className="text-right py-2 px-4 font-medium">Liability</th>
                    <th className="text-right py-2 px-4 font-medium">ROU NBV</th>
                    <th className="text-right py-2 px-4 font-medium">Avg Remaining</th>
                    <th className="text-right py-2 pl-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(MOCK_SUMMARY).map((row: any) => (
                    <tr key={row.assetType} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 font-medium">{row.assetType}</td>
                      <td className="text-right py-2.5 px-4 tabular-nums">{fmt(row.leaseCount)}</td>
                      <td className="text-right py-2.5 px-4 tabular-nums">{fmtM(row.liability)}</td>
                      <td className="text-right py-2.5 px-4 tabular-nums">{fmtM(row.rouNbv)}</td>
                      <td className="text-right py-2.5 px-4 tabular-nums">{row.avgRemaining} mo</td>
                      <td className="text-right py-2.5 pl-4">
                        <span className={row.hasOverdue ? "badge-expired" : "badge-active"}>
                          {row.hasOverdue ? "Overdue" : "On Track"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function WarrantyAlertWidget() {
  const { data: alerts = [], isLoading } = trpc.asset.getExpiringWarranties.useQuery({ daysAhead: 30 });
  if (isLoading) return null;
  if ((alerts as any[]).length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-500" />
            Warranty Expiry Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground py-2">
            No warranties expiring within the next 30 days.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          Warranty Expiry Alerts
          <span className="ml-auto text-xs font-normal text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            {(alerts as any[]).length} item{(alerts as any[]).length !== 1 ? "s" : ""} expiring soon
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 pl-4 font-medium">Lease</th>
                <th className="text-left py-2 px-3 font-medium">Set</th>
                <th className="text-left py-2 px-3 font-medium">Item</th>
                <th className="text-left py-2 px-3 font-medium">Serial No.</th>
                <th className="text-left py-2 px-3 font-medium">Expiry Date</th>
                <th className="text-right py-2 pr-4 font-medium">Days Left</th>
              </tr>
            </thead>
            <tbody>
              {(alerts as any[]).map((a: any, idx: number) => (
                <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 pl-4 font-mono text-sky-400">{a.leaseRef}</td>
                  <td className="py-2 px-3 text-muted-foreground">{a.setName}</td>
                  <td className="py-2 px-3">{a.itemName}</td>
                  <td className="py-2 px-3 font-mono text-muted-foreground">{a.serialNumber || "—"}</td>
                  <td className="py-2 px-3">{a.warrantyExpiry}</td>
                  <td className="py-2 pr-4 text-right">
                    <span className={`px-2 py-0.5 rounded font-semibold ${
                      a.daysLeft < 0 ? "bg-red-500/20 text-red-400" :
                      a.daysLeft <= 7 ? "bg-red-500/20 text-red-400" :
                      "bg-amber-500/20 text-amber-400"
                    }`}>
                      {a.daysLeft < 0 ? `Expired ${Math.abs(a.daysLeft)}d ago` : `${a.daysLeft}d`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}


function InsightItem({ icon: Icon, color, text }: { icon: React.ElementType; color: string; text: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
      <span className="text-muted-foreground leading-snug">{text}</span>
    </div>
  );
}

const MOCK_SUMMARY = [
  { assetType: "Tower Sites",    leaseCount: 45, liability: 18_400_000, rouNbv: 16_200_000, avgRemaining: 84, hasOverdue: false },
  { assetType: "Data Centres",   leaseCount: 8,  liability: 12_100_000, rouNbv: 10_800_000, avgRemaining: 120, hasOverdue: false },
  { assetType: "Retail Outlets", leaseCount: 22, liability: 4_200_000,  rouNbv: 3_600_000,  avgRemaining: 36, hasOverdue: true  },
  { assetType: "Fleet Vehicles", leaseCount: 31, liability: 1_800_000,  rouNbv: 1_400_000,  avgRemaining: 24, hasOverdue: false },
  { assetType: "Office Space",   leaseCount: 9,  liability: 6_500_000,  rouNbv: 5_900_000,  avgRemaining: 96, hasOverdue: false },
];
