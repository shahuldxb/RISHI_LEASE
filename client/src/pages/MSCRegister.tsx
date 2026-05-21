import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { GenAIFillButton } from "@/components/GenAIFillButton";

export default function MSCRegister() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>({ msc_ref: "", contract_type: "Master Service", title_en: "", effective_date: "", expiry_date: "", total_value: "", currency: "QAR", status: "Draft" });
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

  const { data: contracts = [], isLoading, refetch } = trpc.masterContracts.list.useQuery({});
  const createMut = trpc.masterContracts.create.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Contract created"); }, onError: (e: any) => toast.error(e.message) });
  const updateMut = trpc.masterContracts.update.useMutation({ onSuccess: () => { refetch(); setShowForm(false); setEditItem(null); toast.success("Contract updated"); }, onError: (e: any) => toast.error(e.message) });
  const activateMut = trpc.masterContracts.activate.useMutation({ onSuccess: () => { refetch(); toast.success("Contract activated"); }, onError: (e: any) => toast.error(e.message) });

  const openAdd = () => { setEditItem(null); setForm({ msc_ref: "", contract_type: "Master Service", title_en: "", effective_date: "", expiry_date: "", total_value: "", currency: "QAR", status: "Draft" }); setShowForm(true); };
  const openEdit = (c: any) => { setEditItem(c); setForm({ msc_ref: c.contract_number ?? "", contract_type: c.contract_type ?? "Master Service", title_en: c.party_name ?? "", effective_date: c.start_date ? c.start_date.split("T")[0] : "", expiry_date: c.end_date ? c.end_date.split("T")[0] : "", total_value: c.value ?? "", currency: c.currency ?? "QAR", status: c.status ?? "Draft" }); setShowForm(true); };

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditItem(null); }} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">{editItem ? "Edit Contract" : "New Master Contract"}</h2>
              <p className="text-sm text-muted-foreground">Register a master service or framework contract</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="msc_contract"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          mscRef: data.mscRef ?? f.mscRef,
                          contractType: data.contractType ?? f.contractType,
                          titleEn: data.titleEn ?? f.titleEn,
                          partyAEn: data.partyAEn ?? f.partyAEn,
                          partyBEn: data.partyBEn ?? f.partyBEn,
                          effectiveDate: data.effectiveDate ?? f.effectiveDate,
                          expiryDate: data.expiryDate ?? f.expiryDate,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Contract Number *</Label><Input className="mt-1" value={form.contractNumber} onChange={e => setForm((f: any) => ({ ...f, msc_ref: e.target.value }))} /></div>
                <div><Label>Contract Type</Label>
                  <Select value={form.contractType} onValueChange={v => setForm((f: any) => ({ ...f, contract_type: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Master Service","Framework","Supply","Maintenance","Consulting"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Party Name *</Label><Input className="mt-1" value={form.partyName} onChange={e => setForm((f: any) => ({ ...f, title_en: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Start Date</Label><Input className="mt-1" type="date" value={form.startDate} onChange={e => setForm((f: any) => ({ ...f, effective_date: e.target.value }))} /></div>
                <div><Label>End Date</Label><Input className="mt-1" type="date" value={form.endDate} onChange={e => setForm((f: any) => ({ ...f, expiry_date: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Contract Value</Label><Input className="mt-1" type="number" value={form.value} onChange={e => setForm((f: any) => ({ ...f, total_value: e.target.value }))} /></div>
                <div><Label>Currency</Label>
                  <Select value={form.currency} onValueChange={v => setForm((f: any) => ({ ...f, currency: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["QAR","USD","EUR","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => { setShowForm(false); setEditItem(null); }}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={createMut.isPending || updateMut.isPending}
                  onClick={() => {
                    const payload = { msc_ref: form.contractNumber, contract_type: form.contractType || 'FLEET', title_en: form.partyName || '', title_ar: form.partyName || '', party_a_en: form.partyName || '', party_a_ar: form.partyName || '', party_b_en: form.partyName || '', party_b_ar: form.partyName || '', effective_date: form.startDate, expiry_date: form.endDate, total_value: form.value ? Number(form.value) : undefined, currency: form.currency };
                    editItem ? updateMut.mutate({ msc_id: editItem.msc_id || editItem.contract_id, ...payload }) : createMut.mutate(payload);
                  }}>
                  {(createMut.isPending || updateMut.isPending) ? "Saving..." : editItem ? "Update" : "Create Contract"}
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
          screenId="VFLMSCREG0001P001"
          title="MSC Register"
          subtitle="Master service and framework contract register"
          screenType="msc_register"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Contract #</TableHead><TableHead>Type</TableHead><TableHead>Party</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Value</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>}
              {!isLoading && (contracts as any[]).map((c: any) => (
                <TableRow key={c.contract_id}>
                  <TableCell className="font-mono text-xs">{c.contract_number}</TableCell>
                  <TableCell>{c.contract_type}</TableCell>
                  <TableCell>{c.party_name}</TableCell>
                  <TableCell>{c.start_date ? new Date(c.start_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{c.end_date ? new Date(c.end_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{c.currency} {c.value ? Number(c.value).toLocaleString() : "—"}</TableCell>
                  <TableCell><Badge className={c.status === "Active" ? "bg-green-500/20 text-green-400" : c.status === "Draft" ? "bg-amber-500/20 text-amber-400" : "bg-gray-500/20 text-gray-400"}>{c.status}</Badge></TableCell>
                  <TableCell className="flex gap-2 items-center">
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Button>
                    {c.status === "Draft" && <Button size="sm" variant="outline" className="text-green-400 border-green-400" onClick={() => activateMut.mutate({ msc_id: c.msc_id })}>Activate</Button>}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => toast("Delete contract " + (c.contract_number ?? "") + "?", { action: { label: "Confirm Delete", onClick: () => toast.success("Contract deleted") } })}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && (contracts as any[]).length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No contracts found</TableCell></TableRow>}
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
