import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, PlusCircle, CheckCircle2, XCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GenAIFillButton } from "@/components/GenAIFillButton";

const statusColor: Record<string, string> = {
  Pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Approved: "bg-green-500/20 text-green-400 border-green-500/30",
  Paid: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  Overdue: "bg-red-600/20 text-red-500 border-red-600/30",
};

const INIT = { leaseId: "", invoiceNo: "", invoiceDate: "", dueDate: "", amount: "", currency: "QAR", description: "" };


const SAMPLE_QATAR: Record<string, unknown> = {
  invoice_ref: "INV-2025-00142", lease_ref: "LSE-QA-0031",
  lessor_name: "Barwa Real Estate Company", invoice_date: "2025-04-01",
  due_date: "2025-04-30", total_amount: 48000, currency: "QAR",
  status: "Pending", period_month: 4, period_year: 2025,
};

export default function InvoiceRegister() {
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  // Alt+1 → table view | Alt+F2 → sample form view
  const handleAltKeys = useCallback((e: KeyboardEvent) => {
    if (e.altKey && e.key === "1") { e.preventDefault(); setAiRecord(null); }
    if (e.altKey && e.key === "F2") { e.preventDefault(); setAiRecord(SAMPLE_QATAR); }
  }, []);
  useEffect(() => {
    window.addEventListener("keydown", handleAltKeys);
    return () => window.removeEventListener("keydown", handleAltKeys);
  }, [handleAltKeys]);

  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState(INIT);

  const { data: invoicesData, refetch } = trpc.payables.getInvoiceRegister.useQuery({ page: 1, pageSize: 50 });
  const invoices: any[] = (invoicesData as any)?.rows ?? [];
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 200 });
  const leases: any[] = (leasesData as any)?.rows ?? [];

  const createMutation = trpc.payables.createInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice created"); setShowForm(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const approveMutation = trpc.payables.approveInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice approved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  function openEdit(inv: any) {
    setEditRow(inv);
    setForm({
      leaseId: String(inv.contract_id ?? ""),
      invoiceNo: inv.invoice_number ?? "",
      invoiceDate: inv.invoice_date ? new Date(inv.invoice_date).toISOString().slice(0,10) : "",
      dueDate: inv.due_date ? new Date(inv.due_date).toISOString().slice(0,10) : "",
      amount: String(inv.gross_amount ?? inv.amount ?? ""),
      currency: inv.currency ?? "QAR",
      description: inv.description ?? "",
    });
    setShowForm(true);
  }
  function handleDelete(inv: any) {
    toast("Delete invoice " + inv.invoice_number + "?", {
      action: { label: "Confirm Delete", onClick: () => toast.info("Invoice deletion requires admin approval") },
    });
  }
  function handleCreate() {
    if (!form.leaseId || !form.invoiceNo || !form.amount) { toast.error("Fill required fields"); return; }
    const d = new Date(form.invoiceDate || new Date());
    createMutation.mutate({
      lessorId: 1,
      contractId: Number(form.leaseId),
      invoiceNumber: form.invoiceNo,
      invoiceDate: form.invoiceDate || new Date().toISOString().slice(0,10),
      dueDate: form.dueDate || new Date().toISOString().slice(0,10),
      periodMonth: d.getMonth() + 1,
      periodYear: d.getFullYear(),
      total: Number(form.amount),
      rentAmount: Number(form.amount),
      currency: form.currency,
    });
  }

  const rows: any[] = invoices;

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[#161616] shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><ArrowLeft className="w-5 h-5" /></Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{editRow ? "Edit Invoice" : "New Invoice"}</h2>
              <p className="text-xs text-muted-foreground">{editRow ? "Update invoice details" : "Create a new lease payment invoice"}</p>
            </div>
            <GenAIFillButton formType="payables" onFill={(data) => setForm(f => ({
              ...f,
              invoiceNo: data.invoiceNumber ? String(data.invoiceNumber) : f.invoiceNo,
              amount: data.amount ? String(data.amount) : f.amount,
              currency: data.currency ? String(data.currency) : f.currency,
              dueDate: data.dueDate ? String(data.dueDate) : f.dueDate,
              description: data.description ? String(data.description) : f.description,
            }))} />
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <Label>Lease *</Label>
                <Select value={form.leaseId} onValueChange={v => setForm(f => ({ ...f, leaseId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select lease..." /></SelectTrigger>
                  <SelectContent>
                    {leases.map((l: any) => (
                      <SelectItem key={l.contract_id} value={String(l.contract_id)}>{l.contract_ref} — {l.asset_description}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Invoice No *</Label><Input className="mt-1" value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} /></div>
                <div><Label>Currency</Label>
                  <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["QAR","QAR","USD","EUR","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Invoice Date</Label><Input type="date" className="mt-1" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} /></div>
                <div><Label>Due Date</Label><Input type="date" className="mt-1" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                <div className="col-span-2"><Label>Amount *</Label><Input type="number" className="mt-1" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
                <div className="col-span-2"><Label>Description</Label><Input className="mt-1" placeholder="Invoice description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Invoice"}
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
          screenId="VFLINVREG0001P001"
          title="Invoice Register"
          subtitle="Lease payment invoices and approval queue"
          screenType="payables"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button size="sm" onClick={() => { setForm(INIT); setShowForm(true); }} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2"><PlusCircle className="w-4 h-4" />New Invoice</Button>}
        />
        {aiRecord && (
          <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Sample Record (Qatar)</h3>
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setAiRecord(null)}>✕ Close</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {Object.entries(aiRecord).map(([k, v]) => (
                <div key={k} className="space-y-0.5">
                  <p className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</p>
                  <p className="font-medium text-xs">{String(v)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Invoice No</TableHead>
                <TableHead className="text-xs">Lease Ref</TableHead>
                <TableHead className="text-xs">Lessor</TableHead>
                <TableHead className="text-xs">Invoice Date</TableHead>
                <TableHead className="text-xs">Due Date</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(aiRows.length > 0 ? aiRows : rows).map((inv: any, i: number) => (
                <TableRow key={inv.invoice_id ?? i} className="text-sm hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                  <TableCell className="font-mono text-xs">{inv.contract_ref}</TableCell>
                  <TableCell>{inv.lessor_name}</TableCell>
                  <TableCell>{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{inv.currency} {Number(inv.gross_amount ?? inv.amount ?? 0).toLocaleString()}</TableCell>
                  <TableCell><Badge className={statusColor[inv.status] ?? ""}>{inv.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {inv.status === "Pending" && (
                        <>
                          <Button size="sm" variant="ghost" className="text-green-400 h-7 px-2" onClick={() => approveMutation.mutate({ invoiceId: inv.invoice_id, outcome: "Approved" })}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-400 h-7 px-2" onClick={() => approveMutation.mutate({ invoiceId: inv.invoice_id, outcome: "Rejected" })}>
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(inv)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(inv)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && aiRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No invoices found.{" "}
                    <button className="text-primary underline" onClick={() => { setForm(INIT); setShowForm(true); }}>Create the first invoice.</button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
