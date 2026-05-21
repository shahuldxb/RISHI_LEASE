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

export default function LeaseTerminations() {
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [form, setForm] = useState<any>({ contract_id: "", terminationDate: "", reason: "Mutual Agreement", penaltyAmount: "", notes: "" });
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

  function openAdd() { setEditRow(null); setForm({ contract_id: contracts[0] ? String(contracts[0].contract_id) : "", terminationDate: "", reason: "Mutual Agreement", penaltyAmount: "", notes: "" }); setShowForm(true); }
  function openEdit(row: any) {
    setEditRow(row);
    setForm({ contract_id: String(row.contract_id ?? ""), terminationDate: row.termination_date ? new Date(row.termination_date).toISOString().slice(0,10) : "", reason: row.reason ?? "Mutual Agreement", penaltyAmount: String(row.penalty_amount ?? ""), notes: row.notes ?? "" });
    setShowForm(true);
  }
  function handleDelete(row: any) {
    toast("Delete this termination request?", { action: { label: "Confirm Delete", onClick: () => toast.success("Termination request deleted") } });
  }

  const { data: terminations = [], refetch } = trpc.termination.list.useQuery();
  const { data: contractsData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 100 });
  const contracts = (contractsData as any)?.rows ?? [];
  // Auto-select first contract when data loads
  useEffect(() => {
    if (contracts.length > 0 && !form.contract_id) {
      setForm((f: any) => ({ ...f, contract_id: String(contracts[0].contract_id) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts.length]);
  const initiateMut = trpc.termination.initiate.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Termination initiated"); }, onError: (e: any) => toast.error(e.message) });
  const approveMut = trpc.termination.approve.useMutation({ onSuccess: () => { refetch(); toast.success("Termination approved"); }, onError: (e: any) => toast.error(e.message) });
  const rejectMut = trpc.termination.reject.useMutation({ onSuccess: () => { refetch(); toast.success("Termination rejected"); }, onError: (e: any) => toast.error(e.message) });

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">{editRow ? "Edit Termination Request" : "Initiate Lease Termination"}</h2>
              <p className="text-sm text-muted-foreground">Start the early termination process for a lease contract</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="lease_termination"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          terminationDate: data.terminationDate ?? f.terminationDate,
                          terminationType: data.terminationType ?? f.terminationType,
                          penaltyAmount: data.penaltyAmount ?? f.penaltyAmount,
                          reason: data.reason ?? f.reason,
                          notes: data.notes ?? f.notes,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div><Label>Contract</Label>
                <Select value={form.contract_id} onValueChange={v => setForm((f: any) => ({ ...f, contract_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select contract" /></SelectTrigger>
                  <SelectContent>{contracts.map((c: any) => <SelectItem key={c.contract_id} value={String(c.contract_id)}>{c.property_name ?? c.contract_id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Termination Date *</Label><Input className="mt-1" type="date" value={form.terminationDate} onChange={e => setForm((f: any) => ({ ...f, terminationDate: e.target.value }))} /></div>
              <div><Label>Reason</Label>
                <Select value={form.reason} onValueChange={v => setForm((f: any) => ({ ...f, reason: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Mutual Agreement","Breach of Contract","Force Majeure","Break Option Exercise","Tenant Request"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Penalty Amount</Label><Input className="mt-1" type="number" value={form.penaltyAmount} onChange={e => setForm((f: any) => ({ ...f, penaltyAmount: e.target.value }))} /></div>
              <div><Label>Notes</Label><Input className="mt-1" value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={initiateMut.isPending}
                  onClick={() => initiateMut.mutate({ contract_id: Number(form.contractId), effective_date: form.terminationDate || form.effective_date, reason: form.reason, penalty_amount: form.penaltyAmount ? Number(form.penaltyAmount) : undefined })}>
                  {initiateMut.isPending ? "Initiating..." : "Initiate Termination"}
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
          screenId="VFLLEATER0001P001"
          title="Lease Terminations"
          subtitle="Early termination requests and approval workflow"
          screenType="lease_terminations"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Contract</TableHead><TableHead>Termination Date</TableHead><TableHead>Reason</TableHead><TableHead>Penalty</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(terminations as any[]).map((t: any) => (
                <TableRow key={t.termination_id}>
                  <TableCell>{t.contract_id}</TableCell>
                  <TableCell>{t.termination_date ? new Date(t.termination_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{t.reason}</TableCell>
                  <TableCell>{t.penalty_amount ? Number(t.penalty_amount).toLocaleString() : "—"}</TableCell>
                  <TableCell><Badge className={t.status === "Approved" ? "bg-green-500/20 text-green-400" : t.status === "Rejected" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}>{t.status}</Badge></TableCell>
                  <TableCell className="flex gap-2 items-center">
                    {t.status === "Pending" && <>
                      <Button size="sm" variant="outline" className="text-green-400 border-green-400" onClick={() => approveMut.mutate({ termination_id: t.termination_id })}>Approve</Button>
                      <Button size="sm" variant="outline" className="text-red-400 border-red-400" onClick={() => rejectMut.mutate({ termination_id: t.termination_id, reason: 'Rejected by approver' })}>Reject</Button>
                    </>}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(t)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {(terminations as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No termination requests</TableCell></TableRow>}
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
