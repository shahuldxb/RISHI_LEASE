/**
 * VodaLease Enterprise — Lease Register
 * Screen ID: VFLSEREGLS0001P001
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Download, RefreshCw, Eye, Edit, MoreHorizontal, FileText, Trash2, User,
  BarChart2, RefreshCcw,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_COLORS: Record<string, string> = {
  Active:    "badge-active",
  Draft:     "badge-draft",
  Pending:   "badge-pending",
  Expired:   "badge-expired",
  Terminated:"badge-expired",
  Renewed:   "badge-matched",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export default function LeaseRegister() {
  const [, setLocation] = useLocation();
  const [search, setSearch]       = useState("");
  const [status, setStatus]       = useState("all");
  const [assetType, setAssetType] = useState("all");
  const [page, setPage]           = useState(1);
  const [aiLeases, setAiLeases]   = useState<Record<string, unknown>[]>([]);

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ contractId: number; contractRef: string } | null>(null);

  const PAGE_SIZE = 50;

  const { data, isLoading, refetch } = trpc.lease.getLeaseRegister.useQuery({
    page,
    pageSize: PAGE_SIZE,
    search:    search || undefined,
    status:    status !== "all" ? status : undefined,
    assetType: assetType !== "all" ? assetType : undefined,
    sortColumn: "created_at",
    sortDirection: "DESC",
  });

  const utils = trpc.useUtils();

  const submitMut = trpc.lease.submitForApproval.useMutation({
    onSuccess: () => { utils.lease.getLeaseRegister.invalidate(); toast.success("Submitted for approval"); },
    onError: (e) => toast.error(e.message),
  });

  const approveRejectMut = trpc.lease.approveRejectLease.useMutation({
    onSuccess: () => { utils.lease.getLeaseRegister.invalidate(); toast.success("Decision recorded"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.lease.hardDeleteLease.useMutation({
    onSuccess: (result) => {
      utils.lease.getLeaseRegister.invalidate();
      toast.success(`Lease ${result?.deleted_contract_ref ?? deleteTarget?.contractRef} and all associated JVs permanently deleted`);
      setDeleteTarget(null);
    },
    onError: (e) => {
      toast.error(`Delete failed: ${e.message}`);
      setDeleteTarget(null);
    },
  });

  // Merge AI-generated rows with real data (AI rows take precedence when present)
  const leases     = aiLeases.length > 0 ? aiLeases as any[] : (data?.rows ?? []);
  const totalCount = aiLeases.length > 0 ? aiLeases.length : (data?.totalCount ?? 0);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <ScreenHeader
          screenId="VFLSEREGLS0001P001"
          title="Lease Register"
          subtitle={`IFRS 16 active lease portfolio · ${totalCount} leases`}
          icon={<FileText className="w-6 h-6 text-[#e60000]" />}
          screenType="lease_register"
          onAIData={(rows) => setAiLeases(rows)}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { refetch(); setAiLeases([]); }} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </div>
          }
        />

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search lease ref, lessor, asset..."
                  className="pl-8 h-9"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
              <Select value={assetType} onValueChange={v => { setAssetType(v); setPage(1); }}>
                <SelectTrigger className="w-44 h-9">
                  <SelectValue placeholder="Asset Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Asset Types</SelectItem>
                  <SelectItem value="Tower Site">Tower Site</SelectItem>
                  <SelectItem value="Data Centre">Data Centre</SelectItem>
                  <SelectItem value="Retail Outlet">Retail Outlet</SelectItem>
                  <SelectItem value="Fleet Vehicle">Fleet Vehicle</SelectItem>
                  <SelectItem value="Office Space">Office Space</SelectItem>
                  <SelectItem value="Network Equipment">Network Equipment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Lease Ref</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Lessor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Lessee</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Asset Type</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Monthly Pmt</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Commencement</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Expiry</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && aiLeases.length === 0 ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 9 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : leases.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        No leases found. <button className="text-primary underline" onClick={() => setLocation("/leases/new")}>Create the first lease.</button>
                      </td>
                    </tr>
                  ) : (
                    leases.map((lease: any, idx: number) => (
                      <tr key={lease.contract_id ?? idx} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{lease.contract_ref}</td>
                        <td className="px-4 py-3 truncate max-w-36">{lease.lessor_name}</td>
                        <td className="px-4 py-3 max-w-36">
                          {lease.lessee_name ? (
                            <div className="flex items-center gap-1.5">
                              <User className="h-3 w-3 text-amber-400 shrink-0" />
                              <span className="truncate text-xs">{lease.lessee_name}</span>
                              {lease.lessee_type && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium shrink-0">
                                  {lease.lessee_type}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{lease.asset_type}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{lease.monthly_payment ? fmt(Number(lease.monthly_payment)) : "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{lease.commencement_date ? new Date(lease.commencement_date).toLocaleDateString() : "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{lease.expiry_date ? new Date(lease.expiry_date).toLocaleDateString() : "—"}</td>
                        <td className="px-4 py-3">
                          <Badge className={STATUS_COLORS[lease.status] ?? "badge-draft"}>{lease.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {/* View Details — opens the dedicated read-only detail view */}
                              <DropdownMenuItem onClick={() => setLocation(`/leases/detail?id=${lease.contract_id}&mode=view`)}>
                                <Eye className="mr-2 h-4 w-4" /> View Details
                              </DropdownMenuItem>
                              {/* Modify Lease — opens the unified detail page for in-place editing */}
                              <DropdownMenuItem onClick={() => setLocation(`/leases/detail?id=${lease.contract_id}&mode=edit`)}>
                                <Edit className="mr-2 h-4 w-4" /> Modify Lease
                              </DropdownMenuItem>
                              {/* View Amortisation — opens the lease detail amortisation tab */}
                              <DropdownMenuItem onClick={() => setLocation(`/leases/detail?id=${lease.contract_id}#amortisation`)}>
                                <BarChart2 className="mr-2 h-4 w-4" /> View Amortisation
                              </DropdownMenuItem>
                              {/* Initiate Renewal — opens full-screen renewal wizard */}
                              <DropdownMenuItem onClick={() => setLocation(`/leases/renewal?id=${lease.contract_id}`)}>
                                <RefreshCcw className="mr-2 h-4 w-4" /> Initiate Renewal
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {/* Delete Lease — soft delete with confirmation */}
                              <DropdownMenuItem
                                className="text-red-400 focus:text-red-400"
                                onClick={() => setDeleteTarget({ contractId: lease.contract_id, contractRef: lease.contract_ref })}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete Lease
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {totalCount} total
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inline Delete Confirmation Banner */}
      {deleteTarget && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4">
          <div className="bg-card border border-destructive/40 rounded-xl px-5 py-4 flex items-start gap-4 shadow-2xl">
            <div className="mt-0.5 p-2 rounded-lg bg-destructive/10">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Confirm Delete Lease</p>
              <p className="text-xs text-muted-foreground mt-1">
                Permanently delete <span className="font-mono font-semibold text-foreground">{deleteTarget.contractRef}</span>?
                This will remove the lease, all associated Journal Vouchers, amortisation schedules, invoices, and child records. <strong>This action cannot be undone.</strong>
              </p>
            </div>
            <div className="flex gap-2 shrink-0 mt-0.5">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}>Cancel</Button>
              <Button variant="destructive" size="sm"
                onClick={() => { if (deleteTarget) deleteMut.mutate({ contractId: deleteTarget.contractId }); }}
                disabled={deleteMut.isPending}>
                {deleteMut.isPending ? "Deleting…" : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
