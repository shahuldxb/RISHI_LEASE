import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Plus, Pencil, Trash2, Boxes, CheckCircle2, Loader2, X } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { GenAIFillButton } from "@/components/GenAIFillButton";


// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  name: string;
  category: string;
  brand?: string;
  model?: string;
  spec?: string;
  serialNumber?: string;
  condition: string;
  notes: string;
  fromSubAsset?: boolean;
}

function parseSubAssetItems(tagsWithSerials?: string | null): ChecklistItem[] {
  if (!tagsWithSerials) return [];
  try {
    const items = JSON.parse(tagsWithSerials) as Array<{
      name: string; category: string; subCategory?: string;
      brand?: string; model?: string; spec?: string;
      qty: number; serialNumbers: string[];
    }>;
    const rows: ChecklistItem[] = [];
    for (const item of items) {
      for (let i = 0; i < item.qty; i++) {
        rows.push({
          name: item.name,
          category: item.category + (item.subCategory ? ` / ${item.subCategory}` : ""),
          brand: item.brand,
          model: item.model,
          spec: item.spec,
          serialNumber: item.serialNumbers[i] ?? "",
          condition: "GOOD",
          notes: "",
          fromSubAsset: true,
        });
      }
    }
    return rows;
  } catch { return []; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HandoverChecklist() {
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [form, setForm] = useState<any>({
    contractId: "", handoverType: "Move-In", handoverDate: "", notes: "", items: [] as ChecklistItem[],
  });
  const [aiRows, setAiRows] = useState<any[]>([]);
  const [showSample, setShowSample] = useState(false);

  // Sub-asset import dialog
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setShowForm(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: checklists = [], isLoading, refetch } = trpc.handoverChecklist.listByLease.useQuery({ contract_id: 0 });
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 200 });
  const leases = (leasesData as any)?.rows ?? [];

  // Sub-asset sets for the selected lease (using getLeaseInventoryForExport)
  const selectedLeaseId = form.contractId ? String(form.contractId) : "";
  const { data: leaseInventory = [], isLoading: loadingInventory } =
    trpc.asset.getLeaseInventoryForExport.useQuery(
      { leaseId: selectedLeaseId },
      { enabled: !!selectedLeaseId && importOpen }
    );

  // Flat list of all items from all active sets on this lease
  const subAssetItems = useMemo(() => {
    const active = (leaseInventory as any[]).filter((r: any) => r.status === "Active");
    const rows: ChecklistItem[] = [];
    for (const set of active) {
      rows.push(...parseSubAssetItems(set.tagsWithSerials));
    }
    return rows;
  }, [leaseInventory]);

  // Auto-select first lease when data loads
  useEffect(() => {
    if (leases.length > 0 && !form.contractId) {
      setForm((f: any) => ({ ...f, contractId: String(leases[0].contract_id) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leases.length]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMut = trpc.handoverChecklist.create.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); toast.success("Checklist created"); },
    onError: (e: any) => toast.error(e.message),
  });
  const signOffMut = trpc.handoverChecklist.signOff.useMutation({
    onSuccess: () => { refetch(); toast.success("Checklist signed off"); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  function openAdd() {
    setEditRow(null);
    setForm({
      contractId: leases[0] ? String(leases[0].contract_id) : "",
      handoverType: "Move-In",
      handoverDate: "",
      notes: "",
      items: [] as ChecklistItem[],
    });
    setShowForm(true);
  }

  function openEdit(row: any) {
    setEditRow(row);
    setForm({
      contractId: String(row.contract_id ?? ""),
      handoverType: row.handover_type ?? "Move-In",
      handoverDate: row.handover_date ? new Date(row.handover_date).toISOString().slice(0, 10) : "",
      notes: row.notes ?? "",
      items: [] as ChecklistItem[],
    });
    setShowForm(true);
  }

  function handleDelete(row: any) {
    toast("Delete this checklist?", {
      action: { label: "Confirm Delete", onClick: () => toast.success("Checklist deleted") },
    });
  }

  function importFromSubAssets() {
    if (subAssetItems.length === 0) {
      toast.info("No active sub-asset sets found for this lease.");
      return;
    }
    // Merge: avoid duplicates by serial number
    const existing = new Set(form.items.map((i: ChecklistItem) => i.serialNumber).filter(Boolean));
    const newItems = subAssetItems.filter(i => !i.serialNumber || !existing.has(i.serialNumber));
    setForm((f: any) => ({ ...f, items: [...f.items, ...newItems] }));
    setImportOpen(false);
    toast.success(`Imported ${newItems.length} item(s) from sub-asset registry.`);
  }

  function removeItem(idx: number) {
    setForm((f: any) => ({ ...f, items: f.items.filter((_: any, i: number) => i !== idx) }));
  }

  function updateItemField(idx: number, field: keyof ChecklistItem, val: string) {
    setForm((f: any) => ({
      ...f,
      items: f.items.map((it: ChecklistItem, i: number) =>
        i === idx ? { ...it, [field]: val } : it
      ),
    }));
  }

  function addManualItem() {
    setForm((f: any) => ({
      ...f,
      items: [...f.items, { name: "", category: "", serialNumber: "", condition: "GOOD", notes: "", fromSubAsset: false }],
    }));
  }

  // ─── Form view ─────────────────────────────────────────────────────────────
  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          {/* Form header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">
                {editRow ? "Edit Handover Checklist" : "New Handover Checklist"}
              </h2>
              <p className="text-sm text-muted-foreground">Create a property handover inspection checklist</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <GenAIFillButton
                formType="maintenance_ticket"
                onFill={(data) => setForm((f: any) => ({
                  ...f,
                  notes: data.notes ?? f.notes,
                }))}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto space-y-5">
              {/* Basic fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Lease Contract</Label>
                  <Select
                    value={form.contractId}
                    onValueChange={v => setForm((f: any) => ({ ...f, contractId: v, items: [] }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select contract" /></SelectTrigger>
                    <SelectContent>
                      {leases.map((l: any) => (
                        <SelectItem key={l.contract_id} value={String(l.contract_id)}>
                          {l.property_name ?? l.contract_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Handover Type</Label>
                  <Select value={form.handoverType} onValueChange={v => setForm((f: any) => ({ ...f, handoverType: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Move-In", "Move-Out", "Inspection", "Maintenance"].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Handover Date <span className="text-red-500">*</span></Label>
                  <Input className="mt-1" type="date" value={form.handoverDate}
                    onChange={e => setForm((f: any) => ({ ...f, handoverDate: e.target.value }))} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input className="mt-1" value={form.notes}
                    onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>

              {/* Items section */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
                  <span className="text-sm font-semibold">Checklist Items ({form.items.length})</span>
                  <div className="flex items-center gap-2">
                    {form.contractId && (
                      <Button size="sm" variant="outline"
                        className="gap-1.5 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 h-7 text-xs"
                        onClick={() => setImportOpen(true)}>
                        <Boxes className="h-3.5 w-3.5" /> Import from Sub-Asset Registry
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                      onClick={addManualItem}>
                      <Plus className="h-3.5 w-3.5" /> Add Item
                    </Button>
                  </div>
                </div>

                {form.items.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    <Boxes className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    No items yet. Import from Sub-Asset Registry or add manually.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Serial No.</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(form.items as ChecklistItem[]).map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            {item.fromSubAsset ? (
                              <div>
                                <div className="text-xs font-medium">{item.name}</div>
                                {item.brand && <div className="text-[10px] text-muted-foreground">{item.brand} {item.model}</div>}
                              </div>
                            ) : (
                              <Input value={item.name} onChange={e => updateItemField(idx, "name", e.target.value)}
                                className="h-7 text-xs" placeholder="Item name" />
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{item.category || "—"}</span>
                          </TableCell>
                          <TableCell>
                            <Input value={item.serialNumber ?? ""}
                              onChange={e => updateItemField(idx, "serialNumber", e.target.value)}
                              className="h-7 text-xs font-mono w-32"
                              placeholder="Serial #" />
                          </TableCell>
                          <TableCell>
                            <Select value={item.condition}
                              onValueChange={v => updateItemField(idx, "condition", v)}>
                              <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "MISSING", "DAMAGED"].map(c => (
                                  <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input value={item.notes}
                              onChange={e => updateItemField(idx, "notes", e.target.value)}
                              className="h-7 text-xs" placeholder="Damage / notes" />
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                              onClick={() => removeItem(idx)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white"
                  disabled={createMut.isPending}
                  onClick={() => createMut.mutate({
                    contract_id: Number(form.contractId),
                    checklist_type: (form.handoverType === "Move-Out" ? "RETURN" : "HANDOVER") as "HANDOVER" | "RETURN",
                    conducted_date: form.handoverDate || new Date().toISOString().split("T")[0],
                    notes: form.notes,
                  })}>
                  {createMut.isPending ? "Creating…" : "Create Checklist"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Import from Sub-Asset Registry — inline panel ── */}
        {importOpen && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Boxes className="h-4 w-4 text-amber-500" /> Import Items from Sub-Asset Registry
              </h4>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setImportOpen(false)}><X className="w-3.5 h-3.5" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Active sub-asset sets attached to this lease. Items will be imported with serial numbers pre-filled.
            </p>
            {loadingInventory ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading sub-asset inventory…
              </div>
            ) : subAssetItems.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Boxes className="h-8 w-8 mx-auto mb-2 opacity-20" />
                No active sub-asset sets found for this lease.
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Brand / Model</TableHead>
                      <TableHead>Serial Number</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subAssetItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-xs font-medium">{item.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.category}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.brand ?? "—"} {item.model ?? ""}</TableCell>
                        <TableCell className="text-xs font-mono text-sky-600">{item.serialNumber || <span className="text-muted-foreground">—</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(false)}>Cancel</Button>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5"
                disabled={subAssetItems.length === 0} onClick={importFromSubAssets}>
                <CheckCircle2 className="h-4 w-4" /> Import {subAssetItems.length} Item(s)
              </Button>
            </div>
          </div>
        )}
      </DashboardLayout>
    );
  }

  // ─── List view ─────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFLHNDCHK0001P001"
          title="Handover Checklist"
          subtitle="Property handover inspection and sign-off management"
          screenType="handover_checklist"
          onAIData={(rows) => setAiRows(rows)}
          actions={
            <Button onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg">
              <Plus className="w-4 h-4" /> Add
            </Button>
          }
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              )}
              {!isLoading && (checklists as any[]).map((c: any) => (
                <TableRow key={c.checklist_id}>
                  <TableCell>{c.contract_id}</TableCell>
                  <TableCell>{c.handover_type}</TableCell>
                  <TableCell>{c.handover_date ? new Date(c.handover_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{c.item_count ?? 0}</TableCell>
                  <TableCell>
                    <Badge className={c.status === "Signed Off"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-amber-500/20 text-amber-400"}>
                      {c.status ?? "Pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex items-center gap-1">
                    {c.status !== "Signed Off" && (
                      <Button size="sm" variant="outline"
                        onClick={() => signOffMut.mutate({ checklist_id: c.checklist_id })}>
                        Sign Off
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => openEdit(c)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(c)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && (checklists as any[]).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No checklists found
                  </TableCell>
                </TableRow>
              )}
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
