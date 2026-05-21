import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { GenAIFillButton } from "@/components/GenAIFillButton";

export default function FurnishedAssets() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>({ contractId: "", itemName: "", itemType: "Furniture", quantity: "1", condition: "Good", serialNumber: "", notes: "" });
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

  const { data: assets = [], isLoading, refetch } = trpc.furnishedAssets.listByLease.useQuery({ contract_id: 0 });
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 200 });
  const leases = (leasesData as any)?.rows ?? [];
  // Auto-select first lease when data loads
  useEffect(() => {
    if (leases.length > 0 && !form.contractId) {
      setForm((f: any) => ({ ...f, contractId: String(leases[0].contract_id) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leases.length]);
  const createMut = trpc.furnishedAssets.create.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Furnished asset added"); }, onError: (e: any) => toast.error(e.message) });
  const updateMut = trpc.furnishedAssets.update.useMutation({ onSuccess: () => { refetch(); setShowForm(false); setEditItem(null); toast.success("Asset updated"); }, onError: (e: any) => toast.error(e.message) });
  const deleteMut = trpc.furnishedAssets.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Asset removed"); }, onError: (e: any) => toast.error(e.message) });

  const openAdd = () => { setEditItem(null); setForm({ contractId: leases[0] ? String(leases[0].contract_id) : "", itemName: "", itemType: "Furniture", quantity: "1", condition: "Good", serialNumber: "", notes: "" }); setShowForm(true); };
  const openEdit = (a: any) => { setEditItem(a); setForm({ contractId: String(a.contract_id ?? ""), itemName: a.item_name ?? "", itemType: a.item_type ?? "Furniture", quantity: String(a.quantity ?? 1), condition: a.condition ?? "Good", serialNumber: a.serial_number ?? "", notes: a.notes ?? "" }); setShowForm(true); };

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditItem(null); }} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">{editItem ? "Edit Furnished Asset" : "Add Furnished Asset"}</h2>
              <p className="text-sm text-muted-foreground">Record furniture and fittings provided with a lease</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="furnished_asset"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          itemName: data.assetName ?? f.itemName,
                          itemType: data.assetCategory ?? f.itemType,
                          serialNumber: data.serialNumber ?? f.serialNumber,
                          condition: data.conditionAtHandover ?? f.condition,
                          notes: data.notes ?? f.notes,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div><Label>Lease Contract</Label>
                <Select value={form.contractId} onValueChange={v => setForm((f: any) => ({ ...f, contractId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select contract" /></SelectTrigger>
                  <SelectContent>{leases.map((l: any) => <SelectItem key={l.contract_id} value={String(l.contract_id)}>{l.property_name ?? l.contract_id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Item Name *</Label><Input className="mt-1" value={form.itemName} onChange={e => setForm((f: any) => ({ ...f, itemName: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Item Type</Label>
                  <Select value={form.itemType} onValueChange={v => setForm((f: any) => ({ ...f, itemType: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Furniture","Appliance","Fixture","Electronics","Other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Quantity</Label><Input className="mt-1" type="number" min="1" value={form.quantity} onChange={e => setForm((f: any) => ({ ...f, quantity: e.target.value }))} /></div>
              </div>
              <div><Label>Condition</Label>
                <Select value={form.condition} onValueChange={v => setForm((f: any) => ({ ...f, condition: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Excellent","Good","Fair","Poor"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Serial Number</Label><Input className="mt-1" value={form.serialNumber} onChange={e => setForm((f: any) => ({ ...f, serialNumber: e.target.value }))} /></div>
              <div><Label>Notes</Label><Input className="mt-1" value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => { setShowForm(false); setEditItem(null); }}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={createMut.isPending || updateMut.isPending}
                  onClick={() => {
                    const payload = { contract_id: Number(form.contractId), asset_name: form.itemName, asset_category: form.itemType || "FURNITURE", quantity: Number(form.quantity), condition_at_handover: form.condition, serial_number: form.serialNumber, notes: form.notes };
                    editItem ? updateMut.mutate({ asset_id: editItem.id, ...payload }) : createMut.mutate(payload);
                  }}>
                  {(createMut.isPending || updateMut.isPending) ? "Saving..." : editItem ? "Update" : "Add Asset"}
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
          screenId="VFLFRNAST0001P001"
          title="Furnished Assets"
          subtitle="Furniture and fittings inventory per lease contract"
          screenType="furnished_assets"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Contract</TableHead><TableHead>Item</TableHead><TableHead>Type</TableHead><TableHead>Qty</TableHead><TableHead>Condition</TableHead><TableHead>Serial #</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>}
              {!isLoading && (assets as any[]).map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell>{a.contract_id}</TableCell>
                  <TableCell>{a.item_name}</TableCell>
                  <TableCell>{a.item_type}</TableCell>
                  <TableCell>{a.quantity}</TableCell>
                  <TableCell><Badge className={a.condition === "Excellent" || a.condition === "Good" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}>{a.condition}</Badge></TableCell>
                  <TableCell>{a.serial_number ?? "—"}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(a)}>Edit</Button>
                    <Button size="sm" variant="outline" className="text-red-400 border-red-400" onClick={() => deleteMut.mutate({ asset_id: a.id })}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && (assets as any[]).length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No furnished assets recorded</TableCell></TableRow>}
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
