/**
 * VodaLease Enterprise — Staff Master
 * Screen ID: VFLSHRSTR0001P001
 *
 * Full CRUD for HR staff records:
 * - Paginated list with search / entity / status filters
 * - Right-side detail panel (view) + inline Add/Edit form
 * - Delete confirmation inline
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Search, User, Pencil, Trash2, Phone, Mail, MapPin,
  Building2, RefreshCw, ChevronRight, CheckCircle2, XCircle,
  AlertTriangle, Briefcase, Hash, X, Save, Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────
const ENTITIES = [
  "Vodafone Qatar P.Q.S.C.",
  "Vodafone Qatar Subsidiary",
  "Vodafone International",
  "Other",
] as const;

const DEPARTMENTS = [
  "Corporate Real Estate", "Fleet & Logistics", "Finance", "IT",
  "HR & Admin", "Legal", "Operations", "Commercial", "Technology",
  "Procurement", "Compliance", "Other",
] as const;

const GRADES = ["E1","E2","E3","M1","M2","M3","D1","D2","VP","SVP","C-Suite"] as const;

const STATUSES = ["Active", "Inactive", "On Leave"] as const;

const STATUS_BADGE: Record<string, string> = {
  Active:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Inactive:  "bg-muted/60 text-muted-foreground border-border",
  "On Leave":"bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const BLANK: StaffForm = {
  staffId:     undefined,
  staffNumber: "",
  fullName:    "",
  designation: "",
  department:  "",
  grade:       "",
  position:    "",
  placeOfWork: "",
  email:       "",
  phone:       "",
  entity:      "",
  status:      "Active",
};

interface StaffForm {
  staffId?:    number;
  staffNumber: string;
  fullName:    string;
  designation: string;
  department:  string;
  grade:       string;
  position:    string;
  placeOfWork: string;
  email:       string;
  phone:       string;
  entity:      string;
  status:      string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function StaffMaster() {
  const utils = trpc.useUtils();

  // ── Filter state ────────────────────────────────────────────────────────────
  const [search,   setSearch]   = useState("");
  const [entity,   setEntity]   = useState("all");
  const [status,   setStatus]   = useState("all");
  const [page,     setPage]     = useState(1);
  const PAGE_SIZE = 50;

  // ── Panel state ─────────────────────────────────────────────────────────────
  type Panel = "none" | "view" | "form" | "delete";
  const [panel,      setPanel]      = useState<Panel>("none");
  const [selected,   setSelected]   = useState<any>(null);
  const [draft,      setDraft]      = useState<StaffForm>(BLANK);
  const [deleteId,   setDeleteId]   = useState<number | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = trpc.staff.list.useQuery({
    pageNumber: page,
    pageSize:   PAGE_SIZE,
    searchTerm: search || undefined,
    entity:     entity !== "all" ? entity : undefined,
    status:     status !== "all" ? status : undefined,
  });

  const rows  = data?.rows ?? [];
  const total = data?.total ?? 0;

  // ── Mutations ────────────────────────────────────────────────────────────────
  const upsertMutation = trpc.staff.upsert.useMutation({
    onSuccess: () => {
      toast.success(draft.staffId ? "Staff record updated" : "Staff record created");
      utils.staff.list.invalidate();
      setPanel("none");
      setDraft(BLANK);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.staff.delete.useMutation({
    onSuccess: () => {
      toast.success("Staff record deleted");
      utils.staff.list.invalidate();
      setPanel("none");
      setDeleteId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function openAdd() {
    setDraft(BLANK);
    setPanel("form");
  }

  function openEdit(row: any) {
    setDraft({
      staffId:     row.staffId,
      staffNumber: row.staffNumber,
      fullName:    row.fullName,
      designation: row.designation,
      department:  row.department,
      grade:       row.grade,
      position:    row.position,
      placeOfWork: row.placeOfWork,
      email:       row.email,
      phone:       row.phone,
      entity:      row.entity,
      status:      row.status,
    });
    setPanel("form");
  }

  function openView(row: any) {
    setSelected(row);
    setPanel("view");
  }

  function openDelete(row: any) {
    setDeleteId(row.staffId);
    setPanel("delete");
  }

  function handleSave() {
    if (!draft.staffNumber.trim()) { toast.error("Staff Number is required"); return; }
    if (!draft.fullName.trim())    { toast.error("Full Name is required"); return; }
    upsertMutation.mutate({
      staffId:     draft.staffId,
      staffNumber: draft.staffNumber.trim(),
      fullName:    draft.fullName.trim(),
      designation: draft.designation || undefined,
      department:  draft.department  || undefined,
      grade:       draft.grade       || undefined,
      position:    draft.position    || undefined,
      placeOfWork: draft.placeOfWork || undefined,
      email:       draft.email       || undefined,
      phone:       draft.phone       || undefined,
      entity:      draft.entity      || undefined,
      status:      draft.status as any,
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <ScreenHeader
          screenId="VFLSHRSTR0001P001" screenType="staff_master"
          title="Staff Master"
          subtitle="HR staff directory — manage employee records for lease assignments"
        />

        <div className="flex flex-1 gap-4 p-4 overflow-hidden">
          {/* ── Left: list ─────────────────────────────────────────────────── */}
          <div className="flex flex-col flex-1 min-w-0 gap-3">
            {/* Toolbar */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-xs"
                  placeholder="Search name, number, department…"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={entity} onValueChange={v => { setEntity(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-44">
                  <SelectValue placeholder="All Entities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  {ENTITIES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => refetch()}>
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={openAdd}>
                <Plus className="w-3.5 h-3.5" /> Add Staff
              </Button>
            </div>

            {/* Count */}
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Loading…" : `${total} record${total !== 1 ? "s" : ""}`}
            </p>

            {/* Table */}
            <Card className="flex-1 overflow-hidden">
              <CardContent className="p-0 h-full overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b border-border z-10">
                    <tr>
                      {["Staff No.", "Full Name", "Designation", "Department", "Grade", "Entity", "Status", ""].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {Array.from({ length: 8 }).map((_, j) => (
                            <td key={j} className="px-3 py-2"><Skeleton className="h-3 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                          No staff records found
                        </td>
                      </tr>
                    ) : rows.map(row => (
                      <tr
                        key={row.staffId}
                        className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => openView(row)}
                      >
                        <td className="px-3 py-2 font-mono text-[#e60000]">{row.staffNumber}</td>
                        <td className="px-3 py-2 font-medium">{row.fullName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.designation || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.department || "—"}</td>
                        <td className="px-3 py-2">
                          {row.grade ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{row.grade}</Badge>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{row.entity || "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[row.status] ?? ""}`}>
                            {row.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(row)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-300" onClick={() => openDelete(row)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Page {page} of {totalPages}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: panel ───────────────────────────────────────────────── */}
          {panel !== "none" && (
            <div className="w-[380px] flex-shrink-0 flex flex-col gap-3 overflow-y-auto transition-all duration-200 ease-in-out">

              {/* ── View panel ─────────────────────────────────────────────── */}
              {panel === "view" && selected && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <User className="w-4 h-4 text-[#e60000]" />
                      Staff Profile
                    </h4>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => openEdit(selected)}>
                        <Pencil className="w-3 h-3" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setPanel("none")}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-lg font-semibold">{selected.fullName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{selected.staffNumber}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[selected.status] ?? ""}`}>
                      {selected.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      { label: "Designation",   value: selected.designation,  icon: <Briefcase className="w-3 h-3" /> },
                      { label: "Department",    value: selected.department,   icon: <Building2 className="w-3 h-3" /> },
                      { label: "Grade",         value: selected.grade,        icon: <Hash className="w-3 h-3" /> },
                      { label: "Position",      value: selected.position,     icon: <Briefcase className="w-3 h-3" /> },
                      { label: "Place of Work", value: selected.placeOfWork,  icon: <MapPin className="w-3 h-3" /> },
                      { label: "Entity",        value: selected.entity,       icon: <Building2 className="w-3 h-3" /> },
                    ].map(({ label, value, icon }) => (
                      <div key={label}>
                        <p className="text-muted-foreground flex items-center gap-1">{icon} {label}</p>
                        <p className="font-medium truncate">{value || "—"}</p>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-border pt-3 space-y-2 text-xs">
                    {selected.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <a href={`mailto:${selected.email}`} className="text-blue-400 hover:underline truncate">{selected.email}</a>
                      </div>
                    )}
                    {selected.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span>{selected.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Add / Edit form panel ───────────────────────────────────── */}
              {panel === "form" && (
                <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <User className="w-4 h-4 text-[#e60000]" />
                      {draft.staffId ? "Edit Staff" : "Add Staff"}
                    </h4>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setPanel("none")}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs">Staff Number *</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        placeholder="e.g. VQ-EMP-00101"
                        value={draft.staffNumber}
                        onChange={e => setDraft(d => ({ ...d, staffNumber: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Full Name *</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        placeholder="e.g. Mohammed Al-Thani"
                        value={draft.fullName}
                        onChange={e => setDraft(d => ({ ...d, fullName: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Designation</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        placeholder="e.g. Senior Manager — Real Estate"
                        value={draft.designation}
                        onChange={e => setDraft(d => ({ ...d, designation: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Department</Label>
                      <Select value={draft.department || "other"} onValueChange={v => setDraft(d => ({ ...d, department: v === "other" ? "" : v }))}>
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEPARTMENTS.map(dep => <SelectItem key={dep} value={dep}>{dep}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Grade</Label>
                      <Select value={draft.grade || "none"} onValueChange={v => setDraft(d => ({ ...d, grade: v === "none" ? "" : v }))}>
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Position / Job Title</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        placeholder="e.g. Fleet Manager"
                        value={draft.position}
                        onChange={e => setDraft(d => ({ ...d, position: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Place of Work</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        placeholder="e.g. Vodafone Qatar HQ, West Bay, Doha"
                        value={draft.placeOfWork}
                        onChange={e => setDraft(d => ({ ...d, placeOfWork: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        type="email"
                        placeholder="name@vodafone.qa"
                        value={draft.email}
                        onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Phone</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        placeholder="+974 5511 xxxx"
                        value={draft.phone}
                        onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Entity</Label>
                      <Select value={draft.entity || "none"} onValueChange={v => setDraft(d => ({ ...d, entity: v === "none" ? "" : v }))}>
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue placeholder="Select entity…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ENTITIES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Status</Label>
                      <Select value={draft.status} onValueChange={v => setDraft(d => ({ ...d, status: v }))}>
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs bg-[#e60000] hover:bg-[#cc0000] text-white gap-1.5"
                      onClick={handleSave}
                      disabled={upsertMutation.isPending}
                    >
                      {upsertMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      {draft.staffId ? "Update" : "Create"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPanel("none")}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Delete confirmation panel ───────────────────────────────── */}
              {panel === "delete" && deleteId !== null && (
                <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-4 h-4" />
                      Confirm Delete
                    </h4>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setPanel("none")}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This will permanently remove the staff record. This action cannot be undone.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1 h-8 text-xs gap-1.5"
                      onClick={() => deleteMutation.mutate({ staffId: deleteId })}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPanel("none")}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
