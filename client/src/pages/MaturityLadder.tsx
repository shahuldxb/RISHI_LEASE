import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { Download, BarChart2, Info } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: unknown, dec = 0) =>
  typeof n === "number" || (typeof n === "string" && !isNaN(Number(n)))
    ? Number(n).toLocaleString("en-ZA", { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : "—";

const BUCKETS = [
  { key: "lt1yr",  label: "< 1 yr",   color: "#6366f1" },
  { key: "1_2yr",  label: "1–2 yrs",  color: "#8b5cf6" },
  { key: "2_3yr",  label: "2–3 yrs",  color: "#a78bfa" },
  { key: "3_4yr",  label: "3–4 yrs",  color: "#c4b5fd" },
  { key: "4_5yr",  label: "4–5 yrs",  color: "#ddd6fe" },
  { key: "gt5yr",  label: "> 5 yrs",  color: "#ede9fe" },
];

export default function MaturityLadder() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOfDate, setAsOfDate] = useState(today);

  const { data, isLoading } = trpc.accounting.maturityLadder.get.useQuery(
    { asOfDate },
    { retry: false }
  );

  const rows   = (data?.rows   ?? []) as Record<string, unknown>[];
  const totals = (data?.totals ?? {}) as Record<string, unknown>;

  // Build chart data: one bar per bucket, stacked principal + interest
  const chartData = BUCKETS.map(b => {
    const pKey = b.key === "lt1yr" ? "lt1yr_principal" : b.key === "gt5yr" ? "gt5yr_principal" : `yr${b.key.replace("_", "_")}_principal`;
    const iKey = b.key === "lt1yr" ? "lt1yr_interest"  : b.key === "gt5yr" ? "gt5yr_interest"  : `yr${b.key.replace("_", "_")}_interest`;
    return {
      name: b.label,
      Principal: Number(totals[pKey] ?? 0),
      Interest:  Number(totals[iKey] ?? 0),
    };
  });

  const grandTotal = Number(totals.grand_total_undiscounted ?? 0);

  const handleExport = () => {
    const lines = [
      "Contract Ref,Asset,Lessor,Currency,<1yr P,<1yr I,1-2yr P,1-2yr I,2-3yr P,2-3yr I,3-4yr P,3-4yr I,4-5yr P,4-5yr I,>5yr P,>5yr I,Total Undiscounted",
      ...rows.map((r: any) =>
        `"${r.contract_ref}","${r.asset_description}","${r.lessor_name ?? ""}",${r.currency},${r.bucket_lt1yr_principal},${r.bucket_lt1yr_interest},${r.bucket_1_2yr_principal},${r.bucket_1_2yr_interest},${r.bucket_2_3yr_principal},${r.bucket_2_3yr_interest},${r.bucket_3_4yr_principal},${r.bucket_3_4yr_interest},${r.bucket_4_5yr_principal},${r.bucket_4_5yr_interest},${r.bucket_gt5yr_principal},${r.bucket_gt5yr_interest},${r.total_undiscounted}`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `maturity-ladder-${asOfDate}.csv`; a.click();
    toast.success("CSV exported");
  };

  return (
    <DashboardLayout>
      <ScreenHeader
        screenId="VFLMTYLDR0001P001"
        title="Lease Maturity Ladder"
        subtitle="Undiscounted cash flow maturity analysis per IFRS 16 Para 58 — powered by sp_GetMaturityLadder"
        screenType="maturity_ladder"
      />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <Label className="text-xs text-muted-foreground">As-of Date</Label>
              <Input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="w-40 mt-1" />
            </div>
            <Button variant="outline" onClick={handleExport} className="gap-2" disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Grand Total KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Total Undiscounted",   value: `QAR ${fmt(totals.grand_total_undiscounted as number)}` },
          { label: "Total Principal",      value: `QAR ${fmt(totals.grand_total_principal as number)}` },
          { label: "Total Interest",       value: `QAR ${fmt(totals.grand_total_interest as number)}` },
          { label: "Active Leases",        value: fmt(rows.length, 0) },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="text-lg font-bold font-mono">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="chart">
        <TabsList>
          <TabsTrigger value="chart">Chart View</TabsTrigger>
          <TabsTrigger value="table">Lease Detail</TabsTrigger>
          <TabsTrigger value="summary">Bucket Summary</TabsTrigger>
        </TabsList>

        {/* Chart */}
        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart2 className="h-4 w-4" />
                Undiscounted Cash Flows by Maturity Bucket
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
                    <Tooltip formatter={(v: number) => `QAR ${fmt(v, 0)}`} />
                    <Legend />
                    <Bar dataKey="Principal" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Interest"  stackId="a" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Per-lease detail */}
        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Per-Lease Maturity Breakdown — {rows.length} leases</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {isLoading ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">No active leases found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">{"< 1 yr"}</TableHead>
                      <TableHead className="text-right">1–2 yrs</TableHead>
                      <TableHead className="text-right">2–3 yrs</TableHead>
                      <TableHead className="text-right">3–4 yrs</TableHead>
                      <TableHead className="text-right">4–5 yrs</TableHead>
                      <TableHead className="text-right">{"> 5 yrs"}</TableHead>
                      <TableHead className="text-right font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{r.contract_ref}</TableCell>
                        <TableCell className="text-sm max-w-[140px] truncate">{r.asset_description}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.asset_type}</Badge></TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmt(Number(r.bucket_lt1yr_principal ?? 0) + Number(r.bucket_lt1yr_interest ?? 0), 0)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmt(Number(r.bucket_1_2yr_principal ?? 0) + Number(r.bucket_1_2yr_interest ?? 0), 0)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmt(Number(r.bucket_2_3yr_principal ?? 0) + Number(r.bucket_2_3yr_interest ?? 0), 0)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmt(Number(r.bucket_3_4yr_principal ?? 0) + Number(r.bucket_3_4yr_interest ?? 0), 0)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmt(Number(r.bucket_4_5yr_principal ?? 0) + Number(r.bucket_4_5yr_interest ?? 0), 0)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmt(Number(r.bucket_gt5yr_principal ?? 0) + Number(r.bucket_gt5yr_interest ?? 0), 0)}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold">{fmt(r.total_undiscounted, 0)}</TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="border-t-2 font-bold bg-muted/30">
                      <TableCell colSpan={3}>Grand Total</TableCell>
                      {BUCKETS.map(b => {
                        const pKey = b.key === "lt1yr" ? "lt1yr_principal" : b.key === "gt5yr" ? "gt5yr_principal" : `yr${b.key.replace("_","_")}_principal`;
                        const iKey = b.key === "lt1yr" ? "lt1yr_interest"  : b.key === "gt5yr" ? "gt5yr_interest"  : `yr${b.key.replace("_","_")}_interest`;
                        return (
                          <TableCell key={b.key} className="text-right font-mono text-xs">
                            {fmt(Number(totals[pKey] ?? 0) + Number(totals[iKey] ?? 0), 0)}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-mono text-xs">{fmt(grandTotal, 0)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bucket summary */}
        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4" />
                Aggregate Bucket Summary (IFRS 16 Para 58 Disclosure)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Maturity Band</TableHead>
                    <TableHead className="text-right">Principal (QAR)</TableHead>
                    <TableHead className="text-right">Interest (QAR)</TableHead>
                    <TableHead className="text-right">Undiscounted Total (QAR)</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {BUCKETS.map(b => {
                    const pKey = b.key === "lt1yr" ? "lt1yr_principal" : b.key === "gt5yr" ? "gt5yr_principal" : `yr${b.key.replace("_","_")}_principal`;
                    const iKey = b.key === "lt1yr" ? "lt1yr_interest"  : b.key === "gt5yr" ? "gt5yr_interest"  : `yr${b.key.replace("_","_")}_interest`;
                    const p = Number(totals[pKey] ?? 0);
                    const interest = Number(totals[iKey] ?? 0);
                    const total = p + interest;
                    const pct = grandTotal > 0 ? (total / grandTotal * 100).toFixed(1) : "—";
                    return (
                      <TableRow key={b.key}>
                        <TableCell className="text-sm font-medium flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: b.color }} />
                          {b.label}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(p, 0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-blue-600">{fmt(interest, 0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{fmt(total, 0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{pct}%</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2 font-bold bg-muted/30">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(totals.grand_total_principal as number, 0)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-blue-600">{fmt(totals.grand_total_interest as number, 0)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(grandTotal, 0)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">100.0%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
