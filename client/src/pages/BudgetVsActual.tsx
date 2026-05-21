import { useState, useMemo } from "react";
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download, Plus, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: unknown, dec = 0) =>
  typeof n === "number" || (typeof n === "string" && !isNaN(Number(n)))
    ? Number(n).toLocaleString("en-ZA", { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : "—";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const RAG_CONFIG: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  GREEN: { label: "On Track",  className: "bg-emerald-500 text-white", icon: CheckCircle2 },
  AMBER: { label: "Watch",     className: "bg-amber-500 text-white",   icon: AlertTriangle },
  RED:   { label: "Over",      className: "bg-red-500 text-white",     icon: TrendingUp },
  GREY:  { label: "No Budget", className: "bg-slate-400 text-white",   icon: TrendingDown },
};

const INIT_FORM = {
  contractId: 0, periodYear: new Date().getFullYear(), periodMonth: new Date().getMonth() + 1,
  budgetedPayment: 0, budgetedDepreciation: 0, budgetedInterest: 0, costCentre: "", notes: "",
};

export default function BudgetVsActual() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...INIT_FORM });

  const { data, isLoading, refetch } = trpc.accounting.budgetVsActual.getVariance.useQuery(
    { periodYear: year, periodMonth: month },
    { retry: false }
  );
  const { data: summaryChart = [] } = trpc.accounting.budgetVsActual.getSummary.useQuery(
    { periodYear: year },
    { retry: false }
  );

  const upsert = trpc.accounting.budgetVsActual.upsertLine.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); toast.success("Budget line saved"); },
    onError: (e) => toast.error(e.message),
  });

  const rows    = (data?.rows ?? []) as Record<string, unknown>[];
  const summary = (data?.summary ?? {}) as Record<string, unknown>;

  const chartData = useMemo(() =>
    (summaryChart as any[]).map((r: any) => ({
      month: MONTHS[(r.period_month ?? 1) - 1],
      Budget: Number(r.total_budget ?? 0),
      Actual: Number(r.total_actual ?? 0),
      Variance: Number(r.variance ?? 0),
    })),
    [summaryChart]
  );

  const handleExport = () => {
    const lines = [
      "Contract Ref,Asset,Lessor,Month,Budget,Actual,Variance,Variance%,RAG",
      ...rows.map((r: any) =>
        `"${r.contract_ref}","${r.asset_description}","${r.lessor_name ?? ""}",${r.period_month},${r.budgeted_payment},${r.actual_payment},${r.payment_variance},${Number(r.payment_variance_pct ?? 0).toFixed(2)},${r.rag_status}`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `budget-vs-actual-${year}.csv`; a.click();
    toast.success("CSV exported");
  };

  return (
    <DashboardLayout>
      <div className="flex h-full">
        {/* ── Main content ────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-4">
          <ScreenHeader
            screenId="VFLBDGVAR0001P001"
            title="Budget vs Actual Variance"
            subtitle="Lease payment variance analysis with RAG status — powered by sp_GetBudgetVsActual"
            screenType="budget_variance"
          />

          {/* Controls */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <Label className="text-xs text-muted-foreground">Year</Label>
                  <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-24 mt-1" min={2020} max={2035} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Month (optional)</Label>
                  <Select value={month?.toString() ?? "all"} onValueChange={v => setMonth(v === "all" ? undefined : Number(v))}>
                    <SelectTrigger className="w-32 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Months</SelectItem>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={handleExport} className="gap-2">
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
                <Button onClick={() => { setForm({ ...INIT_FORM, periodYear: year }); setShowForm(true); }} className="gap-2">
                  <Plus className="h-4 w-4" /> Add Budget Line
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* KPI Summary */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Budget",    value: `QAR ${fmt(summary.total_budgeted_payment as number)}` },
                { label: "Total Actual",    value: `QAR ${fmt(summary.total_actual_payment as number)}` },
                { label: "Total Variance",  value: `QAR ${fmt(summary.total_payment_variance as number)}`, highlight: true },
                { label: "Variance %",      value: `${Number(summary.total_variance_pct ?? 0).toFixed(2)}%` },
              ].map(kpi => (
                <Card key={kpi.label}>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono ${kpi.highlight && Number(summary.total_payment_variance ?? 0) > 0 ? "text-red-500" : kpi.highlight ? "text-emerald-600" : ""}`}>{kpi.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* RAG Summary Badges */}
          {summary && (
            <div className="flex gap-3 flex-wrap">
              <Badge className="bg-emerald-500 text-white gap-1"><CheckCircle2 className="h-3 w-3" /> {fmt(summary.green_count as number, 0)} On Track</Badge>
              <Badge className="bg-amber-500 text-white gap-1"><AlertTriangle className="h-3 w-3" /> {fmt(summary.amber_count as number, 0)} Watch</Badge>
              <Badge className="bg-red-500 text-white gap-1"><TrendingUp className="h-3 w-3" /> {fmt(summary.red_count as number, 0)} Over Budget</Badge>
            </div>
          )}

          {/* Monthly Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Monthly Budget vs Actual — {year}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => `QAR ${fmt(v, 0)}`} />
                    <Legend />
                    <Bar dataKey="Budget" fill="#6366f1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Actual" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Detail Table */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Variance Detail — {rows.length} lines</CardTitle></CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <TrendingDown className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No budget lines found for {year}. Add budget lines to start tracking.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Budget</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead className="text-right">Var %</TableHead>
                      <TableHead>RAG</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r: any, i: number) => {
                      const rag = RAG_CONFIG[r.rag_status] ?? RAG_CONFIG.GREY;
                      const RagIcon = rag.icon;
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{r.contract_ref}</TableCell>
                          <TableCell className="text-sm max-w-[160px] truncate">{r.asset_description}</TableCell>
                          <TableCell className="text-sm">{MONTHS[(r.period_month ?? 1) - 1]}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(r.budgeted_payment, 0)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(r.actual_payment, 0)}</TableCell>
                          <TableCell className={`text-right font-mono text-sm font-semibold ${Number(r.payment_variance ?? 0) > 0 ? "text-red-500" : "text-emerald-600"}`}>
                            {Number(r.payment_variance ?? 0) > 0 ? "+" : ""}{fmt(r.payment_variance, 0)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {r.payment_variance_pct != null ? `${Number(r.payment_variance_pct).toFixed(1)}%` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs gap-1 ${rag.className}`}>
                              <RagIcon className="h-3 w-3" /> {rag.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right Panel: Add / Update Budget Line ───────────────────────── */}
        {showForm && (
          <div className="w-96 border-l bg-card flex flex-col shrink-0">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-sm">Add / Update Budget Line</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowForm(false)}>
                <span className="text-lg leading-none">×</span>
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <Label className="text-xs">Contract ID</Label>
                <Input type="number" value={form.contractId} onChange={e => setForm(f => ({ ...f, contractId: Number(e.target.value) }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Year</Label><Input type="number" value={form.periodYear} onChange={e => setForm(f => ({ ...f, periodYear: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs">Month (1-12)</Label><Input type="number" value={form.periodMonth} onChange={e => setForm(f => ({ ...f, periodMonth: Number(e.target.value) }))} min={1} max={12} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Budgeted Payment</Label><Input type="number" value={form.budgetedPayment} onChange={e => setForm(f => ({ ...f, budgetedPayment: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs">Budgeted Dep.</Label><Input type="number" value={form.budgetedDepreciation} onChange={e => setForm(f => ({ ...f, budgetedDepreciation: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs">Budgeted Interest</Label><Input type="number" value={form.budgetedInterest} onChange={e => setForm(f => ({ ...f, budgetedInterest: Number(e.target.value) }))} /></div>
              </div>
              <div><Label className="text-xs">Cost Centre</Label><Input value={form.costCentre} onChange={e => setForm(f => ({ ...f, costCentre: e.target.value }))} placeholder="e.g. CC-OPEX-001" /></div>
              <div><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <div className="px-5 py-4 border-t flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" disabled={upsert.isPending || form.contractId === 0}
                onClick={() => upsert.mutate({
                  contractId: form.contractId, periodYear: form.periodYear, periodMonth: form.periodMonth,
                  budgetedPayment: form.budgetedPayment, budgetedDepreciation: form.budgetedDepreciation,
                  budgetedInterest: form.budgetedInterest,
                  costCentre: form.costCentre || undefined, notes: form.notes || undefined,
                })}>
                {upsert.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
