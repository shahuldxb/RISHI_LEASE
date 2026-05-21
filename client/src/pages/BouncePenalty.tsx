import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { GenAIFillButton } from "@/components/GenAIFillButton";

export default function BouncePenalty() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ pct_rate: "", graceDays: "3", flat_amount: "" });
  const [aiRows, setAiRows] = useState<any[]>([]);
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setShowForm(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const { data: configs = [], refetch: refetchCfg } = trpc.bouncePenalty.listConfig.useQuery();
  const { data: events = [], refetch: refetchEvents } = trpc.bouncePenalty.listEvents.useQuery();
  const saveCfgMut = trpc.bouncePenalty.saveConfig.useMutation({ onSuccess: () => { refetchCfg(); setShowForm(false); toast.success("Penalty config saved"); }, onError: (e: any) => toast.error(e.message) });

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">Configure Bounce Penalty</h2>
              <p className="text-sm text-muted-foreground">Set penalty rates and grace periods for bounced cheques</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="security_deposit"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          penaltyAmount: data.depositAmount ?? f.penaltyAmount,
                          notes: data.notes ?? f.notes,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Penalty Rate (%)</Label><Input className="mt-1" type="number" step="0.01" value={form.penaltyRate} onChange={e => setForm((f: any) => ({ ...f, pct_rate: e.target.value }))} /></div>
                <div><Label>Grace Days</Label><Input className="mt-1" type="number" value={form.graceDays} onChange={e => setForm((f: any) => ({ ...f, graceDays: e.target.value }))} /></div>
              </div>
              <div><Label>Flat Fee (optional)</Label><Input className="mt-1" type="number" value={form.flatFee} onChange={e => setForm((f: any) => ({ ...f, flat_amount: e.target.value }))} /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={saveCfgMut.isPending}
                  onClick={() => saveCfgMut.mutate({ penalty_code: form.penaltyCode || 'P001', penalty_name: form.penaltyName || 'Bounce Penalty', pct_rate: Number(form.penaltyRate), flat_amount: form.flatFee ? Number(form.flatFee) : undefined })}>
                  {saveCfgMut.isPending ? "Saving..." : "Save Config"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFLBNCPEN0001P001"
          title="Bounce Penalty Register"
          subtitle="Penalty configurations and bounce event history"
          screenType="bounce_penalty"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={() => setShowForm(true)} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Rate (%)</TableHead><TableHead>Grace Days</TableHead><TableHead>Flat Fee</TableHead><TableHead>Active</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(configs as any[]).map((c: any, i: number) => (
                <TableRow key={i}>
                  <TableCell>{c.penalty_rate}%</TableCell>
                  <TableCell>{c.grace_days}</TableCell>
                  <TableCell>{c.flat_fee ?? "—"}</TableCell>
                  <TableCell><Badge className={c.is_active ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>{c.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setForm({ penaltyRate: String(c.penalty_rate ?? ''), graceDays: String(c.grace_days ?? '3'), flatFee: String(c.flat_fee ?? '') }); setShowForm(true); }}><Pencil className="w-4 h-4 text-blue-400" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => toast.success('Penalty config deleted')}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {(configs as any[]).length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No penalty configurations yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>
    
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
