import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download, BarChart2 } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const fmt = (n: any) => n != null ? `QAR ${Number(n).toLocaleString("en-AE", { maximumFractionDigits: 0 })}` : "—";

export default function MaturityAnalysis() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const [leaseType, setLeaseType] = useState("ALL");

  const { data, isLoading, refetch } = trpc.accounting.reporting.maturityAnalysis.useQuery();

  const utils = trpc.useUtils();
  const notifyMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Maturity analysis sent to owner"),
    onError: (e) => toast.error(e.message),
  });
  const rows: any[] = (data as any)?.rows ?? [];
  const summary: any = (data as any)?.summary ?? {};

  const chartData = rows.map((r: any) => ({
    band: r.maturity_band,
    "Undiscounted CF": Number(r.undiscounted_cashflows ?? 0),
    "Discounted PV": Number(r.present_value ?? 0),
    "Finance Cost": Number(r.finance_cost ?? 0),
  }));

  const handleExport = () => {
    const csv = ["Band,Leases,Undiscounted CFs,Finance Cost,Present Value",
      ...rows.map((r: any) => `"${r.maturity_band}",${r.lease_count},${r.undiscounted_cashflows},${r.finance_cost},${r.present_value}`)
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `maturity-analysis-${asOf}.csv`; a.click();
    toast.success("Maturity analysis exported");
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
  screenId="VFLMATALY0001P001"
  title="Maturity Analysis"
  subtitle="Lease maturity profile and concentration analysis"

          screenType="maturity_analysis"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />

        {/* Summary KPIs */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Undiscounted CFs", value: fmt(summary.total_undiscounted), color: "text-violet-600" },
            { label: "Total Finance Cost", value: fmt(summary.total_finance_cost), color: "text-orange-600" },
            { label: "Total Present Value", value: fmt(summary.total_pv), color: "text-emerald-600" },
            { label: "Active Leases", value: summary.total_leases ?? "—", color: "text-blue-600" },
          ].map(k => (
            <Card key={k.label}><CardContent className="pt-4"><p className="text-sm text-muted-foreground">{k.label}</p><p className={`text-2xl font-bold ${k.color}`}>{k.value}</p></CardContent></Card>
          ))}
        </div>

        {/* Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">Cash Flow Profile by Maturity Band</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="band" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmt(v)} />
                <Legend />
                <Bar dataKey="Undiscounted CF" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Finance Cost" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Discounted PV" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader><CardTitle className="text-base">Maturity Band Detail</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Maturity Band</TableHead>
                  <TableHead className="text-right">Leases</TableHead>
                  <TableHead className="text-right">Undiscounted CFs</TableHead>
                  <TableHead className="text-right">Finance Cost</TableHead>
                  <TableHead className="text-right">Present Value</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : rows.map((r: any) => (
                  <TableRow key={r.maturity_band}>
                    <TableCell className="font-medium">{r.maturity_band}</TableCell>
                    <TableCell className="text-right">{r.lease_count}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.undiscounted_cashflows)}</TableCell>
                    <TableCell className="text-right font-mono text-orange-600">{fmt(r.finance_cost)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">{fmt(r.present_value)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-muted rounded-full h-1.5">
                          <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (r.undiscounted_cashflows / (summary.total_undiscounted || 1)) * 100)}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{summary.total_undiscounted ? ((r.undiscounted_cashflows / summary.total_undiscounted) * 100).toFixed(1) : 0}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No data for selected period</TableCell></TableRow>
                )}
                {rows.length > 0 && (
                  <TableRow className="font-bold bg-muted/50">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{summary.total_leases}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(summary.total_undiscounted)}</TableCell>
                    <TableCell className="text-right font-mono text-orange-600">{fmt(summary.total_finance_cost)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">{fmt(summary.total_pv)}</TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
