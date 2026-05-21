/**
 * VodaLease Enterprise — Lease Renewals
 * Screen ID: VFLLEASEREN0001P001
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

const INIT_FORM = {
  contract_id: "" as string | number,
  renewal_type: "",
  new_expiry_date: "",
  new_monthly_payment: "" as string | number,
  new_ibr: "" as string | number,
  status: "",
  notes: ""
};

export default function LeaseRenewals() {
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
  const { data: rows = [], isLoading } = trpc.leaseRenewal.list.useQuery({} as any);

  const createMut = trpc.leaseRenewal.create.useMutation({
    onSuccess: () => { utils.leaseRenewal.list.invalidate(); toast.success("Record created"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.leaseRenewal.update.useMutation({
    onSuccess: () => { utils.leaseRenewal.list.invalidate(); toast.success("Updated"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.leaseRenewal.delete.useMutation({
    onSuccess: () => { utils.leaseRenewal.list.invalidate(); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });


  const displayRows = aiRows.length > 0 ? aiRows : (rows as any[]);
  const filtered = displayRows.filter((r: any) =>
    !search || Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
  );

  function openAdd() {
    setEditRow(null);
    setForm({ ...INIT_FORM });
    setShowForm(true);
  }
  function openEdit(row: any) {
    setEditRow(row);
    setForm({
      contract_id: row.contract_id ?? "",
      renewal_type: row.renewal_type ?? "",
      new_expiry_date: row.new_expiry_date ?? "",
      new_monthly_payment: row.new_monthly_payment ?? "",
      new_ibr: row.new_ibr ?? "",
      status: row.status ?? "",
      notes: row.notes ?? ""
      });
    setShowForm(true);
  }
  function handleSubmit() {
    const payload = {
      contract_id: form.contract_id ? Number(form.contract_id) : undefined,
      renewal_type: form.renewal_type as any,
      new_expiry_date: form.new_expiry_date as any,
      new_monthly_payment: form.new_monthly_payment ? Number(form.new_monthly_payment) : undefined,
      new_ibr: form.new_ibr ? Number(form.new_ibr) : undefined,
      status: form.status as any,
      notes: form.notes as any
      };
    if (editRow) {
            updateMut.mutate({ renewal_id: editRow.renewal_id, ...payload } as any);
    } else {
      createMut.mutate(payload as any);
    }
  }


  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[#161616] shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><ArrowLeft className="w-5 h-5" /></Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{editRow ? "Edit Record" : "Add New Record"}</h2>
              <p className="text-xs text-muted-foreground">Fill in the details below</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="space-y-4">
          <div>
            <Label>Contract Id</Label>
            <Input type="number" value={form.contract_id ?? ""} onChange={e => setForm((f: any) => ({...f, contract_id: e.target.value}))} />
          </div>
          <div>
            <Label>Renewal Type</Label>
            <Select value={String(form.renewal_type ?? "")} onValueChange={v => setForm((f: any) => ({...f, renewal_type: v}))} >
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                  <SelectItem value="EXTENSION">EXTENSION</SelectItem>
                  <SelectItem value="RENEGOTIATION">RENEGOTIATION</SelectItem>
                  <SelectItem value="HOLDOVER">HOLDOVER</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>New Expiry Date</Label>
            <Input type="date" value={form.new_expiry_date ?? ""} onChange={e => setForm((f: any) => ({...f, new_expiry_date: e.target.value}))} />
          </div>
          <div>
            <Label>New Monthly Payment</Label>
            <Input type="number" value={form.new_monthly_payment ?? ""} onChange={e => setForm((f: any) => ({...f, new_monthly_payment: e.target.value}))} />
          </div>
          <div>
            <Label>New Ibr</Label>
            <Input type="number" value={form.new_ibr ?? ""} onChange={e => setForm((f: any) => ({...f, new_ibr: e.target.value}))} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={String(form.status ?? "")} onValueChange={v => setForm((f: any) => ({...f, status: v}))} >
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                  <SelectItem value="DRAFT">DRAFT</SelectItem>
                  <SelectItem value="SUBMITTED">SUBMITTED</SelectItem>
                  <SelectItem value="APPROVED">APPROVED</SelectItem>
                  <SelectItem value="REJECTED">REJECTED</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={e => setForm((f: any) => ({...f, notes: e.target.value}))} rows={3} />
          </div>
        </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending}>
              {createMut.isPending ? "Saving…" : editRow ? "Update" : "Create"}
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
          screenId="VFLLEASEREN0001P001"
          title="Lease Renewals"
          subtitle="Manage lease renewals records"
          screenType="leaseRenewal"
          onAIData={(r) => setAiRows(r)}
          actions={<Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add New</Button>}
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
                <TableHead className="text-xs">Renewal Ref</TableHead>
                <TableHead className="text-xs">Contract Ref</TableHead>
                <TableHead className="text-xs">Lessor Name</TableHead>
                <TableHead className="text-xs">Renewal Type</TableHead>
                <TableHead className="text-xs">New Expiry Date</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && aiRows.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">No records found. <button className="text-primary underline" onClick={openAdd}>Add the first one.</button></TableCell></TableRow>
                  ) : (
                    filtered.map((row: any, i: number) => (
                      <TableRow key={row.renewal_id ?? i} className="hover:bg-muted/20">
                    <TableCell>{row.renewal_ref ?? "—"}</TableCell>
                    <TableCell>{row.contract_ref ?? "—"}</TableCell>
                    <TableCell>{row.lessor_name ?? "—"}</TableCell>
                    <TableCell>{row.renewal_type ?? "—"}</TableCell>
                    <TableCell>{row.new_expiry_date ?? "—"}</TableCell>
                    <TableCell>{row.status ?? "—"}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(row)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteMut.mutate({ renewal_id: row.renewal_id })}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
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
