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

export default function ChequeInventory() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ bankAccountId: "", signatory1Id: "", payeeName: "", amount: "", currency: "QAR", issueDate: "", remarks: "" });
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

  const { data: cheques = [], refetch } = trpc.cheque.getSummary.useQuery();
  const { data: accounts = [] } = trpc.cheque.getBankAccounts.useQuery({ isActive: true });
  const { data: signatories = [] } = trpc.cheque.getSignatories.useQuery({ isActive: true });
  const issueMutation = trpc.cheque.issueCheque.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); toast.success("Cheque issued successfully"); },
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
              <h2 className="font-semibold text-lg">Issue Cheque</h2>
              <p className="text-sm text-muted-foreground">Issue a new cheque from the inventory</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="cheque_inventory"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          chequeNumber: data.chequeNumber ?? f.chequeNumber,
                          amount: data.amount ?? f.amount,
                          payee: data.payee ?? f.payee,
                          issueDate: data.issueDate ?? f.issueDate,
                          notes: data.notes ?? f.notes,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div><Label>Bank Account</Label>
                <Select value={form.bankAccountId} onValueChange={v => setForm((f: any) => ({ ...f, bankAccountId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select bank account" /></SelectTrigger>
                  <SelectContent>{(accounts as any[]).map((a: any) => <SelectItem key={a.account_id} value={String(a.account_id)}>{a.bank_name} — {a.account_number}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Signatory</Label>
                <Select value={form.signatoryId} onValueChange={v => setForm((f: any) => ({ ...f, signatory1Id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select signatory" /></SelectTrigger>
                  <SelectContent>{(signatories as any[]).map((s: any) => <SelectItem key={s.signatory_id} value={String(s.signatory_id)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Payee *</Label><Input className="mt-1" value={form.payee} onChange={e => setForm((f: any) => ({ ...f, payeeName: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Amount *</Label><Input className="mt-1" type="number" value={form.amount} onChange={e => setForm((f: any) => ({ ...f, amount: e.target.value }))} /></div>
                <div><Label>Currency</Label>
                  <Select value={form.currency} onValueChange={v => setForm((f: any) => ({ ...f, currency: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["QAR","USD","EUR","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Cheque Date *</Label><Input className="mt-1" type="date" value={form.chequeDate} onChange={e => setForm((f: any) => ({ ...f, issueDate: e.target.value }))} /></div>
              <div><Label>Memo</Label><Input className="mt-1" value={form.memo} onChange={e => setForm((f: any) => ({ ...f, remarks: e.target.value }))} /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={issueMutation.isPending}
                  onClick={() => issueMutation.mutate({ chequeBookId: 1, chequeNumber: form.chequeNumber || String(Date.now()).slice(-6), bankAccountId: Number(form.bankAccountId), signatory1Id: Number(form.signatoryId), payeeName: form.payee, amount: Number(form.amount), currency: form.currency, issueDate: form.chequeDate || new Date().toISOString().split('T')[0], remarks: form.memo })}>
                  {issueMutation.isPending ? "Issuing..." : "Issue Cheque"}
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
          screenId="VFLCHQINV0001P001"
          title="Cheque Inventory"
          subtitle="Cheque book management and issuance tracking"
          screenType="cheque_inventory"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={() => setShowForm(true)} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Cheque #</TableHead><TableHead>Payee</TableHead><TableHead>Amount</TableHead><TableHead>Currency</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(cheques as any[]).map((c: any) => (
                <TableRow key={c.cheque_id}>
                  <TableCell>{c.cheque_number}</TableCell>
                  <TableCell>{c.payee}</TableCell>
                  <TableCell>{Number(c.amount).toLocaleString()}</TableCell>
                  <TableCell>{c.currency}</TableCell>
                  <TableCell>{c.cheque_date ? new Date(c.cheque_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell><Badge className={c.status === "Issued" ? "bg-blue-500/20 text-blue-400" : c.status === "Cleared" ? "bg-green-500/20 text-green-400" : c.status === "Bounced" ? "bg-red-500/20 text-red-400" : "bg-gray-500/20 text-gray-400"}>{c.status}</Badge></TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setForm({ bankAccountId: String(c.bank_account_id ?? ''), signatoryId: String(c.signatory1_id ?? ''), payee: c.payee, amount: String(c.amount), currency: c.currency, chequeDate: c.cheque_date ? new Date(c.cheque_date).toISOString().split('T')[0] : '', memo: c.remarks ?? '' }); setShowForm(true); }}><Pencil className="w-4 h-4 text-blue-400" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => toast.success(`Cheque ${c.cheque_number} voided`)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {(cheques as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No cheques in inventory</TableCell></TableRow>}
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
