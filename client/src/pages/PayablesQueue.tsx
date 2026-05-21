/**
 * VodaLease Enterprise — Payables Queue
 * Screen ID: VFPAYQUEUEP0001P001
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, Download, Eye, CheckCircle2, XCircle, MoreHorizontal, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_COLORS: Record<string, string> = {
  Pending:   "badge-pending",
  Approved:  "badge-active",
  Rejected:  "badge-expired",
  Paid:      "badge-matched",
  Overdue:   "badge-expired",
  OnHold:    "badge-draft",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);


const SAMPLE_QATAR: Record<string, unknown> = {
  invoice_ref: "INV-2025-00142", lease_ref: "LSE-QA-0031",
  lessor_name: "Barwa Real Estate Company", invoice_date: "2025-04-01",
  due_date: "2025-04-30", total_amount: 48000, currency: "QAR",
  status: "Pending", period_month: 4, period_year: 2025,
};

export default function PayablesQueue() {
  const [search, setSearch]   = useState("");
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

  const [status, setStatus]   = useState("all");
  const [page, setPage]       = useState(1);
  const PAGE_SIZE = 50;

  const { data, isLoading, refetch } = trpc.payables.getInvoiceRegister.useQuery({
    page, pageSize: PAGE_SIZE,
    status: status !== "all" ? status : undefined,
  });

  const invoices   = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const approveInvoice = trpc.payables.approveInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice approved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="page-header">
          <div>
            <ScreenHeader
  screenId="VFLPAYQUE0001P001"
  title="Payables Queue"
  subtitle="Outstanding payables and payment scheduling"

          screenType="payables_queue"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />

        {aiRecord && (
          <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-3 mx-6">
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

          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Export</Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search invoice ref, lessor..." className="pl-8 h-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                  <SelectItem value="Overdue">Overdue</SelectItem>
                  <SelectItem value="OnHold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoice Ref</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Lease Ref</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Lessor</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Due Date</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Principal</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Interest</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 9 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : invoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        No invoices found.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv: any) => (
                      <tr key={inv.invoice_id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{inv.invoice_ref}</td>
                        <td className="px-4 py-3 font-mono text-xs">{inv.lease_ref}</td>
                        <td className="px-4 py-3 truncate max-w-36">{inv.lessor_name}</td>
                        <td className={`px-4 py-3 ${inv.is_overdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                          {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
                          {inv.is_overdue && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(inv.total_amount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmt(inv.principal_amount ?? 0)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmt(inv.interest_amount ?? 0)}</td>
                        <td className="px-4 py-3"><span className={STATUS_COLORS[inv.status] ?? "badge-draft"}>{inv.status}</span></td>
                        <td className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => toast.info("Invoice detail — coming soon")}>
                                <Eye className="mr-2 h-4 w-4" /> View Invoice
                              </DropdownMenuItem>
                              {inv.status === "Pending" && (
                                <DropdownMenuItem onClick={() => approveInvoice.mutate({ invoiceId: inv.invoice_id, outcome: "Approved" })}>
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Approve
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => toast.info("Reject dialog — coming soon")}>
                                <XCircle className="mr-2 h-4 w-4 text-red-500" /> Reject
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages} · {totalCount} total</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
