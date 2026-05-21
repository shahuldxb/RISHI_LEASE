import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { GenAIFillButton } from "@/components/GenAIFillButton";

export default function BounceManagement() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ chequeId: "", bounceDate: "", bounceReason: "Insufficient Funds", waiverReason: "", notes: "" });
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

  // FIX: use getBounceHistory (returns {bounces:[...]}) not getPenaltyConfigs (returns {configs:[...]})
  const { data: bouncesData, refetch } = trpc.bounceRecon.getBounceHistory.useQuery({});
  const bounces: any[] = (bouncesData as any)?.bounces ?? [];
  const utils = trpc.useUtils();
  const recordMutation = trpc.bounceRecon.recordBounce.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); toast.success("Bounce recorded successfully"); },
    onError: (e: any) => toast.error(e.message),
  });

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">Record Bounced Cheque</h2>
              <p className="text-sm text-muted-foreground">Register a returned/bounced cheque and calculate penalties</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="security_deposit"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          amount: data.depositAmount ?? f.amount,
                          notes: data.notes ?? f.notes,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div><Label>Cheque ID *</Label><Input className="mt-1" type="number" value={form.chequeId} onChange={e => setForm((f: any) => ({ ...f, chequeId: e.target.value }))} /></div>
              <div><Label>Bounce Date *</Label><Input className="mt-1" type="date" value={form.bounceDate} onChange={e => setForm((f: any) => ({ ...f, bounceDate: e.target.value }))} /></div>
              <div><Label>Bounce Reason</Label>
                <Select value={form.bounceReason} onValueChange={v => setForm((f: any) => ({ ...f, bounceReason: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Insufficient Funds","Account Closed","Payment Stopped","Signature Mismatch","Post-dated","Stale Cheque"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Bank Charges</Label><Input className="mt-1" type="number" value={form.bankCharges} onChange={e => setForm((f: any) => ({ ...f, waiverReason: e.target.value }))} /></div>
              <div><Label>Notes</Label><Input className="mt-1" value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={recordMutation.isPending}
                  onClick={() => recordMutation.mutate({ chequeId: Number(form.chequeId), bounceDate: form.bounceDate, bounceReason: (form.bounceReason as any) || "INSUFFICIENT_FUNDS" })}>
                  {recordMutation.isPending ? "Recording..." : "Record Bounce"}
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
          screenId="VFLBNCMGT0001P001"
          title="Bounce Management"
          subtitle="Bounced cheque tracking and penalty calculation"
          screenType="bounce_management"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={() => setShowForm(true)} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Cheque ID</TableHead><TableHead>Bounce Date</TableHead><TableHead>Reason</TableHead><TableHead>Bank Charges</TableHead><TableHead>Penalty</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(bounces as any[]).map((b: any) => (
                <TableRow key={b.bounce_id}>
                  <TableCell>{b.cheque_id}</TableCell>
                  <TableCell>{b.bounce_date ? new Date(b.bounce_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{b.bounce_reason}</TableCell>
                  <TableCell>{b.bank_charges ? Number(b.bank_charges).toLocaleString() : "—"}</TableCell>
                  <TableCell>{b.penalty_amount ? Number(b.penalty_amount).toLocaleString() : "—"}</TableCell>
                  <TableCell><Badge className={b.status === "Resolved" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>{b.status ?? "Open"}</Badge></TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setForm({ chequeId: String(b.cheque_id), bounceDate: b.bounce_date ? new Date(b.bounce_date).toISOString().split('T')[0] : '', bounceReason: b.bounce_reason ?? 'Insufficient Funds', bankCharges: String(b.bank_charges ?? ''), notes: b.notes ?? '' }); setShowForm(true); }}><Pencil className="w-4 h-4 text-blue-400" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => toast.success(`Bounce record ${b.bounce_id} deleted`)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {(bounces as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No bounced cheques recorded</TableCell></TableRow>}
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
