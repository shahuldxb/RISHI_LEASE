import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, TrendingUp, TrendingDown, Pencil, Trash2 } from "lucide-react";
import { GenAIFillButton } from "@/components/GenAIFillButton";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const year = new Date().getFullYear();
const INIT = { contract_id: 0, budget_year: year, budget_month: new Date().getMonth() + 1, budgeted_amount: 0, actual_amount: 0, cost_centre: "", notes: "" };

export default function BudgetVariance() {
  const [bvOpen, setBvOpen] = useState(false);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ ...INIT });
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setBvOpen(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const { data: rows = [], refetch } = trpc.budgetVariance.list.useQuery({ year });
  const save = trpc.budgetVariance.upsert.useMutation({ onSuccess: () => { refetch(); setBvOpen(false); toast.success("Budget variance saved"); }, onError: (e) => toast.error(e.message) });
  const displayRows = aiRows.length > 0 ? aiRows : (rows as any[]);
  const totalBudget = displayRows.reduce((s: number, r: any) => s + Number(r.budgeted_amount ?? 0), 0);
  const totalActual = displayRows.reduce((s: number, r: any) => s + Number(r.actual_amount ?? 0), 0);
  const totalVariance = totalActual - totalBudget;

  return (
    <DashboardLayout>
      {bvOpen ? (
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setBvOpen(false)}><ArrowLeft className="w-5 h-5" /></Button>
              <div><h2 className="text-lg font-semibold">New Budget Variance Entry</h2><p className="text-xs text-muted-foreground">Log budgeted vs actual amounts for a lease</p></div>
            </div>
            <div className="flex gap-2">
              <GenAIFillButton formType="budget_variance" onFill={(data) => setForm(f => ({
                ...f,
                cost_centre: data.costCentre ? String(data.costCentre) : f.cost_centre,
                budgeted_amount: data.budgetedAmount ? Number(data.budgetedAmount) : f.budgeted_amount,
                actual_amount: data.actualAmount ? Number(data.actualAmount) : f.actual_amount,
                notes: data.notes ? String(data.notes) : f.notes,
              }))} />
              <Button variant="outline" onClick={() => setBvOpen(false)}>Cancel</Button>
              <Button disabled={save.isPending} onClick={() => save.mutate(form as any)}>{save.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-xl mx-auto grid grid-cols-2 gap-5">
              <div><Label className="text-xs text-muted-foreground">Contract ID</Label><Input type="number" className="mt-1" value={form.contract_id} onChange={e => setForm(f => ({ ...f, contract_id: Number(e.target.value) }))} /></div>
              <div><Label className="text-xs text-muted-foreground">Budget Year</Label><Input type="number" className="mt-1" value={form.budget_year} onChange={e => setForm(f => ({ ...f, budget_year: Number(e.target.value) }))} /></div>
              <div><Label className="text-xs text-muted-foreground">Month (1-12)</Label><Input type="number" min={1} max={12} className="mt-1" value={form.budget_month} onChange={e => setForm(f => ({ ...f, budget_month: Number(e.target.value) }))} /></div>
              <div><Label className="text-xs text-muted-foreground">Cost Centre</Label><Input className="mt-1" value={form.cost_centre} onChange={e => setForm(f => ({ ...f, cost_centre: e.target.value }))} /></div>
              <div><Label className="text-xs text-muted-foreground">Budgeted Amount (QAR)</Label><Input type="number" step="0.01" className="mt-1" value={form.budgeted_amount} onChange={e => setForm(f => ({ ...f, budgeted_amount: Number(e.target.value) }))} /></div>
              <div><Label className="text-xs text-muted-foreground">Actual Amount (QAR)</Label><Input type="number" step="0.01" className="mt-1" value={form.actual_amount} onChange={e => setForm(f => ({ ...f, actual_amount: Number(e.target.value) }))} /></div>
              <div className="col-span-2"><Label className="text-xs text-muted-foreground">Notes</Label><Input className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          <ScreenHeader screenId="VFLBUDVAR0001P001" title="Budget Variance" subtitle={`Budgeted vs actual lease costs — ${year}`}
            screenType="budget_variance" onAIData={(rows) => setAiRows(rows)}
            actions={<Button size="sm" onClick={() => { setForm({ ...INIT }); setBvOpen(true); }}><Plus className="w-4 h-4 mr-1" />Add Entry</Button>} />
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Budget", value: `QAR ${totalBudget.toLocaleString()}`, color: "text-blue-600" },
              { label: "Total Actual", value: `QAR ${totalActual.toLocaleString()}`, color: "text-foreground" },
              { label: "Variance", value: `QAR ${Math.abs(totalVariance).toLocaleString()}`, color: totalVariance > 0 ? "text-red-600" : "text-emerald-600", icon: totalVariance > 0 ? <TrendingUp className="w-4 h-4 text-red-500" /> : <TrendingDown className="w-4 h-4 text-emerald-500" /> },
            ].map(k => (
              <Card key={k.label}><CardContent className="pt-4 flex items-center gap-3">
                {k.icon}<div><p className="text-xs text-muted-foreground">{k.label}</p><p className={`text-xl font-bold ${k.color}`}>{k.value}</p></div>
              </CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="p-0"><Table>
            <TableHeader><TableRow><TableHead>Contract</TableHead><TableHead>Period</TableHead><TableHead>Cost Centre</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right">Variance</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {displayRows.map((r: any, i: number) => {
                const v = Number(r.actual_amount ?? 0) - Number(r.budgeted_amount ?? 0);
                return (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.contract_ref ?? r.contract_id}</TableCell>
                    <TableCell className="text-sm">{r.budget_month}/{r.budget_year}</TableCell>
                    <TableCell>{r.cost_centre}</TableCell>
                    <TableCell className="text-right font-mono">{Number(r.budgeted_amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{Number(r.actual_amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${v > 0 ? "text-red-600" : "text-emerald-600"}`}>{v > 0 ? "+" : ""}{v.toLocaleString()}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setForm({ contract_id: r.contract_id ?? 0, budget_year: r.budget_year ?? year, budget_month: r.budget_month ?? 1, budgeted_amount: r.budgeted_amount ?? 0, actual_amount: r.actual_amount ?? 0, cost_centre: r.cost_centre ?? '', notes: r.notes ?? '' }); setBvOpen(true); }}><Pencil className="w-4 h-4 text-blue-400" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => toast.success('Budget entry deleted')}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {displayRows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No budget variance data. Click Add Entry to get started.</TableCell></TableRow>}
            </TableBody>
          </Table></CardContent></Card>
        </div>
      )}
    
      {showSample && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg p-4 shadow-xl max-w-sm">
          <p className="text-xs font-semibold text-primary mb-2">Qatar Sample Data</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Company: Vodafone Qatar Q.P.S.C.</p>
            <p>Location: West Bay, Doha, Qatar</p>
            <p>Currency: QAR | Country: QA</p>
            <p>Contact: +974 4412 0000</p>
            <p>Bank: Qatar National Bank (QNB)</p>
          </div>
          <button className="mt-2 text-xs text-primary hover:underline" onClick={() => setShowSample(false)}>Close</button>
        </div>
      )}
    </DashboardLayout>
  );
}
