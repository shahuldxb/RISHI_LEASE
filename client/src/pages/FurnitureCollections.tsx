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
import { useLocation } from "wouter";
import { GenAIFillButton } from "@/components/GenAIFillButton";

export default function FurnitureCollections() {
  const [, setLocation] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>({ collectionName: "", description: "", status: "Active" });
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

  const { data: collections = [], isLoading, refetch } = trpc.furnitureCollections.list.useQuery({});
  const createMut = trpc.furnitureCollections.create.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Collection created"); }, onError: (e: any) => toast.error(e.message) });
  const updateMut = trpc.furnitureCollections.update.useMutation({ onSuccess: () => { refetch(); setShowForm(false); setEditItem(null); toast.success("Collection updated"); }, onError: (e: any) => toast.error(e.message) });
  const deleteMut = trpc.furnitureCollections.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Collection deleted"); }, onError: (e: any) => toast.error(e.message) });

  const openAdd = () => { setEditItem(null); setForm({ collectionName: "", description: "", status: "Active" }); setShowForm(true); };
  const openEdit = (c: any) => { setEditItem(c); setForm({ collectionName: c.collection_name ?? "", description: c.description ?? "", status: c.status ?? "Active" }); setShowForm(true); };

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditItem(null); }} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">{editItem ? "Edit Collection" : "New Collection"}</h2>
              <p className="text-sm text-muted-foreground">Create or update a furniture collection</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="furnished_asset"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          name: data.assetName ?? f.name,
                          description: data.notes ?? f.description,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div><Label>Collection Name *</Label><Input className="mt-1" value={form.collectionName} onChange={e => setForm((f: any) => ({ ...f, collectionName: e.target.value }))} /></div>
              <div><Label>Description</Label><Input className="mt-1" value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Active","Inactive","Archived"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => { setShowForm(false); setEditItem(null); }}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={createMut.isPending || updateMut.isPending}
                  onClick={() => {
                    editItem ? updateMut.mutate({ collection_id: editItem.collection_id, ...form }) : createMut.mutate(form);
                  }}>
                  {(createMut.isPending || updateMut.isPending) ? "Saving..." : editItem ? "Update" : "Create Collection"}
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
          screenId="VFLFRNCLC0001P001"
          title="Furniture Collections"
          subtitle="Furniture collection management and item tracking"
          screenType="furniture_collections"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Collection Name</TableHead><TableHead>Description</TableHead><TableHead>Items</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>}
              {!isLoading && (collections as any[]).map((c: any) => (
                <TableRow key={c.collection_id}>
                  <TableCell className="font-medium cursor-pointer hover:text-primary" onClick={() => setLocation(`/furniture-collection/${c.collection_id}`)}>{c.collection_name}</TableCell>
                  <TableCell>{c.description ?? "—"}</TableCell>
                  <TableCell>{c.item_count ?? 0}</TableCell>
                  <TableCell><Badge className={c.status === "Active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>{c.status}</Badge></TableCell>
                  <TableCell className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Button>
                    <Button size="sm" variant="outline" className="text-red-400 border-red-400" onClick={() => deleteMut.mutate({ collection_id: c.collection_id })}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && (collections as any[]).length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No collections found</TableCell></TableRow>}
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
