import { useState, useEffect } from "react";
import { useRoute } from "wouter";
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
import { useLocation } from "wouter";
import { GenAIFillButton } from "@/components/GenAIFillButton";

export default function FurnitureCollectionDetail() {
  const [, params] = useRoute("/furniture-collection/:id");
  const [, setLocation] = useLocation();
  const collectionId = params?.id ? Number(params.id) : 0;
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>({ itemName: "", itemType: "Chair", quantity: "1", condition: "Good", serialNumber: "" });
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setShowForm(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const { data, refetch, isLoading } = trpc.furnitureCollections.getWithItems.useQuery({ collection_id: Number(collectionId) }, { enabled: !!collectionId });
  const collection = (data as any)?.collection;
  const items = (data as any)?.items ?? [];
  const addItemMut = trpc.furnitureCollections.addItem.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Item added"); }, onError: (e: any) => toast.error(e.message) });
  const updateItemMut = trpc.furnitureCollections.updateItem.useMutation({ onSuccess: () => { refetch(); setShowForm(false); setEditItem(null); toast.success("Item updated"); }, onError: (e: any) => toast.error(e.message) });
  const deleteItemMut = trpc.furnitureCollections.deleteItem.useMutation({ onSuccess: () => { refetch(); toast.success("Item deleted"); }, onError: (e: any) => toast.error(e.message) });

  const openAdd = () => { setEditItem(null); setForm({ itemName: "", itemType: "Chair", quantity: "1", condition: "Good", serialNumber: "" }); setShowForm(true); };
  const openEdit = (item: any) => { setEditItem(item); setForm({ itemName: item.item_name ?? "", itemType: item.item_type ?? "Chair", quantity: String(item.quantity ?? 1), condition: item.condition ?? "Good", serialNumber: item.serial_number ?? "" }); setShowForm(true); };

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditItem(null); }} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">{editItem ? "Edit Item" : "Add Item"}</h2>
              <p className="text-sm text-muted-foreground">Collection: {collection?.collection_name}</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="furnished_asset"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          assetName: data.assetName ?? f.assetName,
                          assetCategory: data.assetCategory ?? f.assetCategory,
                          brand: data.brand ?? f.brand,
                          model: data.model ?? f.model,
                          serialNumber: data.serialNumber ?? f.serialNumber,
                          conditionAtHandover: data.conditionAtHandover ?? f.conditionAtHandover,
                          estimatedValue: data.estimatedValue ?? f.estimatedValue,
                          notes: data.notes ?? f.notes,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div><Label>Item Name *</Label><Input className="mt-1" value={form.itemName} onChange={e => setForm((f: any) => ({ ...f, itemName: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Item Type</Label>
                  <Select value={form.itemType} onValueChange={v => setForm((f: any) => ({ ...f, itemType: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Chair","Table","Sofa","Bed","Wardrobe","Appliance","Electronics","Other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
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
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => { setShowForm(false); setEditItem(null); }}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={addItemMut.isPending || updateItemMut.isPending}
                  onClick={() => {
                    const payload = { collection_id: collectionId, name: form.itemName, category: form.itemType || "FURNITURE", quantity: Number(form.quantity), condition: form.condition, serial_number: form.serialNumber };
                    editItem ? updateItemMut.mutate({ item_id: editItem.item_id, ...payload }) : addItemMut.mutate(payload);
                  }}>
                  {(addItemMut.isPending || updateItemMut.isPending) ? "Saving..." : editItem ? "Update" : "Add Item"}
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
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/furniture-collections")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />Back to Collections
          </Button>
        </div>
        <ScreenHeader
          screenId="VFLFRNDET0001P001"
          title={collection?.collection_name ?? "Collection Detail"}
          subtitle="Items in this furniture collection"
          screenType="furniture_collection_detail"
          onAIData={() => {}}
          actions={<Button onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Item Name</TableHead><TableHead>Type</TableHead><TableHead>Qty</TableHead><TableHead>Condition</TableHead><TableHead>Serial #</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>}
              {!isLoading && items.map((item: any) => (
                <TableRow key={item.item_id}>
                  <TableCell>{item.item_name}</TableCell>
                  <TableCell>{item.item_type}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell><Badge className={item.condition === "Good" || item.condition === "Excellent" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}>{item.condition}</Badge></TableCell>
                  <TableCell>{item.serial_number ?? "—"}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button>
                    <Button size="sm" variant="outline" className="text-red-400 border-red-400" onClick={() => deleteItemMut.mutate({ item_id: item.item_id })}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No items in this collection</TableCell></TableRow>}
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
