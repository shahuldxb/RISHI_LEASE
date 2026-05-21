import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CheckCircle2, XCircle, MoreHorizontal, Eye, Search, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const SAMPLE_QATAR: Record<string, unknown> = {
  invoice_ref: "INV-2025-00142",
  lease_ref: "LSE-QA-0031",
  lessor_name: "Barwa Real Estate Company",
  invoice_date: "2025-04-01",
  due_date: "2025-04-30",
  total_amount: 48000,
  currency: "QAR",
  status: "Pending",
  period_month: 4,
  period_year: 2025,
};

const STATUS_COLOR: Record<string, string> = {
  Pending: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  Approved: "bg-green-500/20 text-green-400 border border-green-500/30",
  Rejected: "bg-red-500/20 text-red-400 border border-red-500/30",
  Paid: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
};

export default function PayablesApprovals() {
  const [view, setView] = useState<"table" | "form">("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; invoice: any }>({ open: false, invoice: null });
  const [rejectReason, setRejectReason] = useState("");
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; invoice: any }>({ open: false, invoice: null });
  const [sampleRecord, setSampleRecord] = useState<Record<string, unknown> | null>(null);

  const { data: invoicesData, refetch, isLoading } = trpc.payables.getInvoiceRegister.useQuery({
    page: 1, pageSize: 100, status: statusFilter === "all" ? undefined : statusFilter,
  });
  const invoices: any[] = (invoicesData as any)?.rows ?? [];
  const filtered = invoices.filter(inv =>
    !search ||
    (inv.invoice_ref ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (inv.lease_ref ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (inv.lessor_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const approveMutation = trpc.payables.approveInvoice.useMutation({
    onSuccess: (d: any) => { toast.success(`Invoice ${d?.new_status ?? "Approved"}`); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const rejectMutation = trpc.payables.approveInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice Rejected"); setRejectDialog({ open: false, invoice: null }); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.altKey && e.key === "1") { e.preventDefault(); setView("table"); }
    if (e.altKey && e.key === "F2") { e.preventDefault(); setSampleRecord(SAMPLE_QATAR); setView("form"); }
  }, []);
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const fmt = (n: number) => `QAR ${Number(n).toLocaleString("en-QA", { minimumFractionDigits: 2 })}`;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <ScreenHeader
          screenId="VFLPAYAPP0001P001"
          title="Payables Approvals"
          subtitle="Invoice approval queue — maker/checker workflow"
          screenType="payables_approvals"
          onAIData={(rows) => { setSampleRecord(rows[0] ?? SAMPLE_QATAR); setView("form"); }}
        />

        <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-4">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search invoice, lease, lessor…" className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
        </div>

        {view === "form" && sampleRecord && (
          <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Sample Invoice Record (Qatar)</h3>
              <Button variant="ghost" size="sm" onClick={() => setView("table")}>Back to Table</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {Object.entries(sampleRecord).map(([k, v]) => (
                <div key={k} className="space-y-1">
                  <p className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</p>
                  <p className="font-medium">{String(v)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Invoice Ref</TableHead>
                <TableHead className="text-xs">Lease Ref</TableHead>
                <TableHead className="text-xs">Lessor</TableHead>
                <TableHead className="text-xs">Invoice Date</TableHead>
                <TableHead className="text-xs">Due Date</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs">Period</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Loading approvals…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No invoices found for the selected filter.</TableCell></TableRow>
              )}
              {!isLoading && filtered.map((inv: any) => (
                <TableRow key={inv.invoice_id} className="text-xs hover:bg-muted/20">
                  <TableCell className="font-mono font-medium text-primary">{inv.invoice_ref ?? "—"}</TableCell>
                  <TableCell className="font-mono">{inv.lease_ref ?? "—"}</TableCell>
                  <TableCell className="max-w-36 truncate">{inv.lessor_name ?? "—"}</TableCell>
                  <TableCell>{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmt(inv.total_amount ?? 0)}</TableCell>
                  <TableCell>{inv.period_month ? `${inv.period_month}/${inv.period_year}` : "—"}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[inv.status] ?? "bg-muted text-muted-foreground"}`}>
                      {inv.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailDialog({ open: true, invoice: inv })}>
                          <Eye className="mr-2 h-4 w-4" /> View Detail
                        </DropdownMenuItem>
                        {inv.status === "Pending" && (
                          <>
                            <DropdownMenuItem onClick={() => approveMutation.mutate({ invoiceId: inv.invoice_id, outcome: "Approved" })}>
                              <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setRejectDialog({ open: true, invoice: inv }); setRejectReason(""); }}>
                              <XCircle className="mr-2 h-4 w-4 text-red-500" /> Reject
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-4 py-2 border-t text-xs text-muted-foreground">
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {rejectDialog.open && rejectDialog.invoice && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-red-400">Reject Invoice {rejectDialog.invoice.invoice_ref}</h4>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setRejectDialog({ open: false, invoice: null })}><X className="w-3.5 h-3.5" /></Button>
            </div>
            <p className="text-sm text-muted-foreground">Please provide a reason for rejection.</p>
            <Input placeholder="Rejection reason…" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={() => setRejectDialog({ open: false, invoice: null })}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={() => {
                if (!rejectReason.trim()) { toast.error("Please enter a rejection reason"); return; }
                rejectMutation.mutate({ invoiceId: rejectDialog.invoice!.invoice_id, outcome: "Rejected", reason: rejectReason });
              }}>Confirm Reject</Button>
            </div>
          </div>
        )}

        {detailDialog.open && detailDialog.invoice && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3 transition-all duration-200 ease-in-out">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Invoice Detail — {detailDialog.invoice.invoice_ref}</h4>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDetailDialog({ open: false, invoice: null })}><X className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Lease Ref", detailDialog.invoice.lease_ref],
                ["Lessor", detailDialog.invoice.lessor_name],
                ["Invoice Date", detailDialog.invoice.invoice_date ? new Date(detailDialog.invoice.invoice_date).toLocaleDateString() : "—"],
                ["Due Date", detailDialog.invoice.due_date ? new Date(detailDialog.invoice.due_date).toLocaleDateString() : "—"],
                ["Rent Amount", fmt(detailDialog.invoice.rent_amount ?? 0)],
                ["Service Charge", fmt(detailDialog.invoice.service_charge ?? 0)],
                ["VAT", fmt(detailDialog.invoice.vat_amount ?? 0)],
                ["Total", fmt(detailDialog.invoice.total_amount ?? 0)],
                ["Currency", detailDialog.invoice.currency ?? "QAR"],
                ["GL Account", detailDialog.invoice.gl_account ?? "—"],
                ["Cost Centre", detailDialog.invoice.cost_centre ?? "—"],
                ["Status", detailDialog.invoice.status],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-medium">{value}</p>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setDetailDialog({ open: false, invoice: null })}>Close</Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
