/**
 * VodaLease Enterprise — Vendor Management
 * Screen ID: VFLVENDORMA0001P001
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Plus, Search, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GenAIFillButton } from "@/components/GenAIFillButton";

const INIT_FORM = { name: "", category: "", contact_email: "", contact_phone: "", trn: "", status: "", notes: "" };

export default function VendorManagement() {
  const [search, setSearch] = useState("");
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [form, setForm] = useState<any>({ ...INIT_FORM });
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setShowForm(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.vendor.list.useQuery({} as any);

  const createMut = trpc.vendor.create.useMutation({
    onSuccess: () => { utils.vendor.list.invalidate(); toast.success("Record created"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.vendor.update.useMutation({
    onSuccess: () => { utils.vendor.list.invalidate(); toast.success("Updated"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.vendor.delete.useMutation({
    onSuccess: () => { utils.vendor.list.invalidate(); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const displayRows = aiRows.length > 0 ? aiRows : (rows as any[]);
  const filtered = displayRows.filter((r: any) =>
    !search || Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
  );

  function openAdd() { setEditRow(null); setForm({ ...INIT_FORM }); setShowForm(true); }
  function openEdit(row: any) {
    setEditRow(row);
    setForm({ name: row.name ?? "", category: row.category ?? "", contact_email: row.contact_email ?? "", contact_phone: row.contact_phone ?? "", trn: row.trn ?? "", status: row.status ?? "", notes: row.notes ?? "" });
    setShowForm(true);
  }
  function handleSubmit() {
    const payload = { name: form.name, category: form.category, contact_email: form.contact_email, contact_phone: form.contact_phone, trn: form.trn, status: form.status, notes: form.notes };
    if (editRow) { updateMut.mutate({ vendor_id: editRow.vendor_id, ...payload } as any); }
    else { createMut.mutate(payload as any); }
  }

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[#161616] shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><ArrowLeft className="w-5 h-5" /></Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{editRow ? "Edit Vendor" : "Add New Vendor"}</h2>
              <p className="text-xs text-muted-foreground">Fill in the vendor details below</p>
            </div>
            <GenAIFillButton formType="vendor" onFill={(data) => setForm((f: any) => ({
              ...f,
              name: data.vendorName ? String(data.vendorName) : f.name,
              category: data.category ? String(data.category) : f.category,
              contact_email: data.email ? String(data.email) : f.contact_email,
              contact_phone: data.phone ? String(data.phone) : f.contact_phone,
              trn: data.taxRegistration ? String(data.taxRegistration) : f.trn,
              notes: data.notes ? String(data.notes) : f.notes,
            }))} />
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              <div><Label>Name</Label><Input className="mt-1" value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Category</Label><Input className="mt-1" value={form.category} onChange={e => setForm((f: any) => ({ ...f, category: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Contact Email</Label><Input type="email" className="mt-1" value={form.contact_email} onChange={e => setForm((f: any) => ({ ...f, contact_email: e.target.value }))} /></div>
                <div><Label>Contact Phone</Label><Input className="mt-1" value={form.contact_phone} onChange={e => setForm((f: any) => ({ ...f, contact_phone: e.target.value }))} /></div>
              </div>
              <div><Label>TRN</Label><Input className="mt-1" value={form.trn} onChange={e => setForm((f: any) => ({ ...f, trn: e.target.value }))} /></div>
              <div>
                <Label>Status</Label>
                <Select value={String(form.status ?? "")} onValueChange={v => setForm((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED">APPROVED</SelectItem>
                    <SelectItem value="PENDING">PENDING</SelectItem>
                    <SelectItem value="BLACKLISTED">BLACKLISTED</SelectItem>
                    <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Textarea className="mt-1" value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={3} /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
                  {createMut.isPending || updateMut.isPending ? "Saving..." : editRow ? "Update" : "Create"}
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
          screenId="VFLVENDORMA0001P001"
          title="Vendor Management"
          subtitle="Manage vendor management records"
          screenType="vendor"
          onAIData={(r) => setAiRows(r)}
          actions={<Button size="sm" onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2"><Plus className="w-4 h-4" />Add New</Button>}
        />
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs">Vendor Code</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Contact Email</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && aiRows.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No records found. <button className="text-primary underline" onClick={openAdd}>Add the first one.</button></TableCell></TableRow>
                  ) : (
                    filtered.map((row: any, i: number) => (
                      <TableRow key={row.vendor_id ?? i} className="hover:bg-muted/20">
                        <TableCell>{row.vendor_code ?? "—"}</TableCell>
                        <TableCell>{row.name ?? "—"}</TableCell>
                        <TableCell>{row.category ?? "—"}</TableCell>
                        <TableCell>{row.contact_email ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline">{row.status ?? "—"}</Badge></TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(row)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteMut.mutate({ vendor_id: row.vendor_id })}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
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
