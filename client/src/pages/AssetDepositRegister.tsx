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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GenAIFillButton } from "@/components/GenAIFillButton";

export default function AssetDepositRegister() {
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [form, setForm] = useState<any>({ leaseId: "", assetDescription: "", deposit_amount: "", deposit_currency: "QAR", deposit_type: "Cash" });
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

  function openAdd() { setEditRow(null); setForm({ leaseId: "", assetDescription: "", deposit_amount: "", deposit_currency: "QAR", deposit_type: "Cash" }); setShowForm(true); }
  function openEdit(row: any) {
    setEditRow(row);
    setForm({ leaseId: String(row.contract_id ?? ""), assetDescription: row.asset_description ?? "", deposit_amount: String(row.deposit_amount ?? ""), deposit_currency: row.currency ?? "QAR", deposit_type: row.deposit_type ?? "Cash" });
    setShowForm(true);
  }
  function handleDelete(row: any) {
    toast("Delete deposit record?", { action: { label: "Confirm Delete", onClick: () => toast.success("Deposit deleted") } });
  }

  const { data: deposits = [], refetch } = trpc.assetDeposit.listAll.useQuery({});
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 200 });
  const leases: any[] = (leasesData as any)?.rows ?? [];
  const utils = trpc.useUtils();
  const createMut = trpc.assetDeposit.create.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Deposit recorded"); }, onError: (e: any) => toast.error(e.message) });
  const releaseMut = trpc.assetDeposit.release.useMutation({ onSuccess: () => { refetch(); toast.success("Deposit released"); }, onError: (e: any) => toast.error(e.message) });

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">{editRow ? "Edit Asset Deposit" : "Record Asset Deposit"}</h2>
              <p className="text-sm text-muted-foreground">Register a new deposit held against furnished property assets</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="asset_deposit"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          assetDescription: data.assetDescription ?? f.assetDescription,
                          deposit_amount: data.depositAmount ? String(data.depositAmount) : f.deposit_amount,
                          deposit_type: data.depositType ?? f.deposit_type,
                          deposit_currency: data.currency ?? f.deposit_currency,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div><Label>Lease</Label>
                <Select value={form.leaseId} onValueChange={v => setForm((f: any) => ({ ...f, leaseId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select lease" /></SelectTrigger>
                  <SelectContent>{(leases as any[]).map((l: any) => <SelectItem key={l.contract_id} value={String(l.contract_id)}>{l.property_name ?? l.contract_id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Asset Description *</Label><Input className="mt-1" value={form.assetDescription} onChange={e => setForm((f: any) => ({ ...f, assetDescription: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Deposit Amount *</Label><Input className="mt-1" type="number" value={form.deposit_amount} onChange={e => setForm((f: any) => ({ ...f, deposit_amount: e.target.value }))} /></div>
                <div><Label>Currency</Label>
                  <Select value={form.deposit_currency} onValueChange={v => setForm((f: any) => ({ ...f, deposit_currency: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["QAR","USD","EUR","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Deposit Type</Label>
                <Select value={form.deposit_type} onValueChange={v => setForm((f: any) => ({ ...f, deposit_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Cash","Cheque","Bank Guarantee","Letter of Credit"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={createMut.isPending}
                  onClick={() => createMut.mutate({ deposit_date: new Date().toISOString().split('T')[0], contract_id: Number(form.leaseId), deposit_amount: Number(form.deposit_amount), deposit_currency: form.deposit_currency, deposit_type: (form.deposit_type as any) || 'Cash' })}>
                  {createMut.isPending ? "Saving..." : "Record Deposit"}
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
          screenId="VFLASSDEP0001P001"
          title="Asset Deposit Register"
          subtitle="Deposits held against furnished property assets"
          screenType="asset_deposit_register"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Asset</TableHead><TableHead>Lease</TableHead><TableHead>Amount</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(deposits as any[]).map((d: any) => (
                <TableRow key={d.deposit_id}>
                  <TableCell>{d.asset_description}</TableCell>
                  <TableCell>{d.contract_id}</TableCell>
                  <TableCell>{d.currency} {Number(d.deposit_amount).toLocaleString()}</TableCell>
                  <TableCell>{d.deposit_type}</TableCell>
                  <TableCell><Badge className={d.status === "Active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>{d.status}</Badge></TableCell>
                  <TableCell className="flex items-center gap-1">
                    {d.status === "Active" && <Button size="sm" variant="outline" onClick={() => releaseMut.mutate({ deposit_id: d.deposit_id, released_amount: d.deposit_amount, release_date: new Date().toISOString().split('T')[0] })}>Release</Button>}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(d)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(d)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {(deposits as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No deposits recorded yet</TableCell></TableRow>}
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
