/**
 * VodaLease Enterprise — Contract Modifications
 * Screen ID: VFCMPMOD0001P001
 *
 * Full maker-checker modification workflow:
 * Draft → Submit → Approve/Reject → Apply
 * With IFRS 16 impact tracking and GL journal reference.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FileEdit, PlusCircle, CheckCircle2, XCircle, Send, Zap, Search, RefreshCw, ChevronDown, ChevronRight, Clock, AlertTriangle, X } from "lucide-react";

const SCREEN_ID = "VFCMPMOD0001P001";

const MOD_TYPES = [
  "Rent Change", "Term Extension", "Term Reduction", "Scope Change",
  "Remeasurement", "Lease Commencement Change", "Variable Lease Payment",
  "Index Rate Change", "Residual Value Guarantee Change", "Other",
];

const STATUS_COLORS: Record<string, string> = {
  Draft:    "bg-slate-500/20 text-slate-300 border-slate-500/30",
  Pending:  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Rejected: "bg-red-500/20 text-red-300 border-red-500/30",
  Applied:  "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  Draft:    <Clock className="w-3 h-3 mr-1" />,
  Pending:  <AlertTriangle className="w-3 h-3 mr-1" />,
  Approved: <CheckCircle2 className="w-3 h-3 mr-1" />,
  Rejected: <XCircle className="w-3 h-3 mr-1" />,
  Applied:  <Zap className="w-3 h-3 mr-1" />,
};

interface ModDraft {
  contractId: string;
  modificationType: string;
  effectiveDate: string;
  modificationReason: string;
  liabilityAdj: string;
  rouAdjustment: string;
  oldTermsJson: string;
  newTermsJson: string;
  notes: string;
}
const EMPTY_DRAFT: ModDraft = {
  contractId: "", modificationType: "", effectiveDate: "",
  modificationReason: "", liabilityAdj: "", rouAdjustment: "",
  oldTermsJson: "", newTermsJson: "", notes: "",
};

export default function ContractModifications() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterContract, setFilterContract] = useState("all");

  // Dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<ModDraft>(EMPTY_DRAFT);
  const [selectedMod, setSelectedMod] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [approveNotes, setApproveNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [glJournalId, setGlJournalId] = useState("");
  const [submitNotes, setSubmitNotes] = useState("");
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(false);

  // Data
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 500 });
  const leases = (leasesData?.rows ?? []) as any[];

  const { data: mods = [], isLoading, refetch } = trpc.contractDms.listModifications.useQuery(
    {
      contractId: filterContract !== "all" ? parseInt(filterContract) : undefined,
      status: filterStatus !== "all" ? filterStatus : undefined,
    },
    { keepPreviousData: true } as any
  );

  const { data: modDetailRaw } = trpc.contractDms.getModification.useQuery(
    { modificationId: selectedMod?.modification_id ?? 0 },
    { enabled: !!selectedMod && showDetail }
  );
  const modDetail = modDetailRaw as any;

  // Mutations
  const createMod = trpc.contractDms.createModification.useMutation({
    onSuccess: (r) => {
      toast.success(`Modification created: ${r.modRef}`);
      utils.contractDms.listModifications.invalidate();
      setShowCreate(false);
      setDraft(EMPTY_DRAFT);
    },
    onError: (e) => toast.error(e.message),
  });

  const submitMod = trpc.contractDms.submitModification.useMutation({
    onSuccess: () => {
      toast.success("Submitted for approval");
      utils.contractDms.listModifications.invalidate();
      setShowSubmit(false);
      setSubmitNotes("");
      if (showDetail) utils.contractDms.getModification.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const approveMod = trpc.contractDms.approveModification.useMutation({
    onSuccess: () => {
      toast.success("Modification approved");
      utils.contractDms.listModifications.invalidate();
      setShowApprove(false);
      setApproveNotes("");
      if (showDetail) utils.contractDms.getModification.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMod = trpc.contractDms.rejectModification.useMutation({
    onSuccess: () => {
      toast.success("Modification rejected");
      utils.contractDms.listModifications.invalidate();
      setShowReject(false);
      setRejectReason("");
      if (showDetail) utils.contractDms.getModification.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const applyMod = trpc.contractDms.applyModification.useMutation({
    onSuccess: () => {
      toast.success("Modification applied to lease");
      utils.contractDms.listModifications.invalidate();
      setShowApply(false);
      setGlJournalId("");
      if (showDetail) utils.contractDms.getModification.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const allMods = (mods as any[]).filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      m.mod_ref?.toLowerCase().includes(s) ||
      m.modification_type?.toLowerCase().includes(s) ||
      m.modification_reason?.toLowerCase().includes(s) ||
      m.maker_name?.toLowerCase().includes(s)
    );
  });

  function handleCreate() {
    if (!draft.contractId) { toast.error("Select a contract"); return; }
    if (!draft.modificationType) { toast.error("Select modification type"); return; }
    if (!draft.effectiveDate) { toast.error("Enter effective date"); return; }
    createMod.mutate({
      contractId: parseInt(draft.contractId),
      modificationType: draft.modificationType,
      effectiveDate: draft.effectiveDate,
      modificationReason: draft.modificationReason || undefined,
      liabilityAdj: draft.liabilityAdj ? parseFloat(draft.liabilityAdj) : undefined,
      rouAdjustment: draft.rouAdjustment ? parseFloat(draft.rouAdjustment) : undefined,
      oldTermsJson: draft.oldTermsJson || undefined,
      newTermsJson: draft.newTermsJson || undefined,
      notes: draft.notes || undefined,
    });
  }

  const setField = (k: keyof ModDraft, v: string) => setDraft(p => ({ ...p, [k]: v }));

  // Stats
  const totalMods = (mods as any[]).length;
  const pendingMods = (mods as any[]).filter(m => m.status === "Pending").length;
  const approvedMods = (mods as any[]).filter(m => m.status === "Approved").length;
  const appliedMods = (mods as any[]).filter(m => m.status === "Applied").length;

  function openDetail(m: any) {
    setSelectedMod(m);
    setShowDetail(true);
    setExpandedHistory(false);
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <ScreenHeader
          screenId={SCREEN_ID} screenType="contract_modifications"
          title="Contract Modifications"
          subtitle="IFRS 16 / ASC 842 compliant modification workflow with maker-checker approval"
          icon={<FileEdit className="w-5 h-5" />}
          actions={
            <Button size="sm" onClick={() => { setDraft(EMPTY_DRAFT); setShowCreate(true); }}>
              <PlusCircle className="w-4 h-4 mr-2" /> New Modification
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 px-4 py-3 border-b border-border bg-muted/20">
          {[
            { label: "Total", value: totalMods, color: "text-foreground" },
            { label: "Pending Approval", value: pendingMods, color: "text-amber-400" },
            { label: "Approved", value: approvedMods, color: "text-emerald-400" },
            { label: "Applied", value: appliedMods, color: "text-blue-400" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-lg px-3 py-2 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-4 py-2 border-b border-border bg-muted/10 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search modifications..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
          </div>
          <Select value={filterContract} onValueChange={setFilterContract}>
            <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue placeholder="All Contracts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Contracts</SelectItem>
              {leases.map((l: any) => <SelectItem key={l.contract_id} value={String(l.contract_id)}>{l.contract_ref ?? l.contract_id}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["Draft", "Pending", "Approved", "Rejected", "Applied"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-8" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading modifications...</div>
          ) : allMods.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <FileEdit className="w-8 h-8 opacity-30" />
              <p className="text-sm">No modifications found</p>
              <Button variant="outline" size="sm" onClick={() => { setDraft(EMPTY_DRAFT); setShowCreate(true); }}>
                <PlusCircle className="w-4 h-4 mr-2" /> Create First Modification
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <tr className="border-b border-border">
                  {["Mod Ref", "Contract", "Type", "Effective Date", "Liability Adj", "ROU Adj", "Status", "Maker", "Actions"].map(h => (
                    <th key={h} className={`text-left px-4 py-2 text-xs font-medium text-muted-foreground ${h === "Actions" ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allMods.map((m: any) => (
                  <tr key={m.modification_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2">
                      <button className="text-xs font-mono text-primary hover:underline" onClick={() => openDetail(m)}>{m.mod_ref}</button>
                    </td>
                    <td className="px-4 py-2 text-xs">{m.contract_id}</td>
                    <td className="px-4 py-2 text-xs font-medium">{m.modification_type}</td>
                    <td className="px-4 py-2 text-xs">{m.effective_date ? new Date(m.effective_date).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2 text-xs text-right">
                      {m.liability_adjustment != null ? (
                        <span className={m.liability_adjustment >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {m.liability_adjustment >= 0 ? "+" : ""}{Number(m.liability_adjustment).toLocaleString()}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-right">
                      {m.rou_adjustment != null ? (
                        <span className={m.rou_adjustment >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {m.rou_adjustment >= 0 ? "+" : ""}{Number(m.rou_adjustment).toLocaleString()}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[m.status] ?? ""}`}>
                        {STATUS_ICONS[m.status]}
                        {m.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{m.maker_name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1 justify-end">
                        {m.status === "Draft" && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" title="Submit for Approval"
                            onClick={() => { setSelectedMod(m); setSubmitNotes(""); setShowSubmit(true); }}>
                            <Send className="w-3.5 h-3.5 mr-1" /> Submit
                          </Button>
                        )}
                        {m.status === "Pending" && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-400"
                              onClick={() => { setSelectedMod(m); setApproveNotes(""); setShowApprove(true); }}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400"
                              onClick={() => { setSelectedMod(m); setRejectReason(""); setShowReject(true); }}>
                              <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {m.status === "Approved" && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-400"
                            onClick={() => { setSelectedMod(m); setGlJournalId(""); setShowApply(true); }}>
                            <Zap className="w-3.5 h-3.5 mr-1" /> Apply
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openDetail(m)}>
                          Details
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create Modification Dialog */}
      {showCreate && (
        <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
          
            <div className="flex items-center justify-between"><h4 className="text-sm font-semibold flex items-center gap-2">New Contract Modification</h4><Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowCreate(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
            <Tabs defaultValue="basic">
              <TabsList className="mb-3">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="ifrs16">IFRS 16 Impact</TabsTrigger>
                <TabsTrigger value="terms">Terms JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="basic">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Contract *</Label>
                    <Select value={draft.contractId} onValueChange={v => setField("contractId", v)}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select contract..." /></SelectTrigger>
                      <SelectContent>
                        {leases.map((l: any) => (
                          <SelectItem key={l.contract_id} value={String(l.contract_id)}>
                            {l.contract_ref ?? l.contract_id} — {l.asset_description ?? l.asset_type ?? ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Modification Type *</Label>
                    <Select value={draft.modificationType} onValueChange={v => setField("modificationType", v)}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
                      <SelectContent>{MOD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Effective Date *</Label>
                    <Input type="date" value={draft.effectiveDate} onChange={e => setField("effectiveDate", e.target.value)} className="h-8 text-xs mt-1" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Modification Reason</Label>
                    <Textarea value={draft.modificationReason} onChange={e => setField("modificationReason", e.target.value)} className="text-xs mt-1 resize-none" rows={2} placeholder="Describe the reason for this modification..." />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Notes</Label>
                    <Textarea value={draft.notes} onChange={e => setField("notes", e.target.value)} className="text-xs mt-1 resize-none" rows={2} placeholder="Additional notes..." />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="ifrs16">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Lease Liability Adjustment</Label>
                    <Input type="number" step="0.01" value={draft.liabilityAdj} onChange={e => setField("liabilityAdj", e.target.value)} className="h-8 text-xs mt-1" placeholder="e.g. -50000 or +25000" />
                    <p className="text-xs text-muted-foreground mt-1">Positive = increase, Negative = decrease</p>
                  </div>
                  <div>
                    <Label className="text-xs">ROU Asset Adjustment</Label>
                    <Input type="number" step="0.01" value={draft.rouAdjustment} onChange={e => setField("rouAdjustment", e.target.value)} className="h-8 text-xs mt-1" placeholder="e.g. -50000 or +25000" />
                    <p className="text-xs text-muted-foreground mt-1">Positive = increase, Negative = decrease</p>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="terms">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Old Terms (JSON)</Label>
                    <Textarea value={draft.oldTermsJson} onChange={e => setField("oldTermsJson", e.target.value)} className="text-xs mt-1 resize-none font-mono" rows={4} placeholder='{"rent": 10000, "term_months": 24}' />
                  </div>
                  <div>
                    <Label className="text-xs">New Terms (JSON)</Label>
                    <Textarea value={draft.newTermsJson} onChange={e => setField("newTermsJson", e.target.value)} className="text-xs mt-1 resize-none font-mono" rows={4} placeholder='{"rent": 12000, "term_months": 36}' />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); setDraft(EMPTY_DRAFT); }}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={createMod.isPending}>
                {createMod.isPending ? "Creating..." : "Create Modification"}
              </Button>
            </div>
        </div>
      )}

        {/* Detail Dialog */}
        {showDetail && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
          
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <span>{selectedMod?.mod_ref}</span>
                {selectedMod && (
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[selectedMod.status] ?? ""}`}>
                    {STATUS_ICONS[selectedMod.status]}{selectedMod.status}
                  </Badge>
                )}
              </h4>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowDetail(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
            {modDetail && (modDetail as any) && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  {[
                    { label: "Contract ID", value: modDetail.contract_id },
                    { label: "Type", value: modDetail.modification_type },
                    { label: "Effective Date", value: modDetail.effective_date ? new Date(modDetail.effective_date).toLocaleDateString() : "—" },
                    { label: "Liability Adj", value: modDetail.liability_adjustment != null ? Number(modDetail.liability_adjustment).toLocaleString() : "—" },
                    { label: "ROU Adj", value: modDetail.rou_adjustment != null ? Number(modDetail.rou_adjustment).toLocaleString() : "—" },
                    { label: "Maker", value: modDetail.maker_name ?? "—" },
                    { label: "Checker", value: modDetail.checker_name ?? "—" },
                    { label: "Reason", value: modDetail.modification_reason ?? "—" },
                    { label: "GL Journal", value: modDetail.gl_journal_id ?? "—" },
                    { label: "Created", value: modDetail.created_at ? new Date(modDetail.created_at).toLocaleString() : "—" },
                  ].map(row => (
                    <div key={row.label} className="flex gap-2">
                      <span className="text-muted-foreground w-[110px] shrink-0">{row.label}:</span>
                      <span className="text-foreground">{String(row.value)}</span>
                    </div>
                  ))}
                </div>

                {/* History */}
                <div>
                  <button
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setExpandedHistory(h => !h)}
                  >
                    {expandedHistory ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    Modification History ({(modDetail as any).history?.length ?? 0} events)
                  </button>
                  {expandedHistory && (
                    <div className="mt-2 space-y-1.5 pl-4 border-l-2 border-border">
                      {((modDetail as any).history ?? []).map((h: any) => (
                        <div key={h.history_id} className="text-xs">
                          <span className="text-primary font-medium">{h.event_type.replace(/_/g, " ")}</span>
                          <span className="text-muted-foreground ml-2">by {h.changed_by_name ?? "System"}</span>
                          <span className="text-muted-foreground ml-2">{h.event_date ? new Date(h.event_date).toLocaleString() : ""}</span>
                          {h.notes && <p className="text-muted-foreground mt-0.5 ml-2">{h.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-2 border-t border-border">
                  {selectedMod?.status === "Draft" && (
                    <Button size="sm" onClick={() => { setSubmitNotes(""); setShowSubmit(true); }}>
                      <Send className="w-3.5 h-3.5 mr-2" /> Submit for Approval
                    </Button>
                  )}
                  {selectedMod?.status === "Pending" && (
                    <>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setApproveNotes(""); setShowApprove(true); }}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-500 text-red-400 hover:bg-red-500/10" onClick={() => { setRejectReason(""); setShowReject(true); }}>
                        <XCircle className="w-3.5 h-3.5 mr-2" /> Reject
                      </Button>
                    </>
                  )}
                  {selectedMod?.status === "Approved" && (
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => { setGlJournalId(""); setShowApply(true); }}>
                      <Zap className="w-3.5 h-3.5 mr-2" /> Apply to Lease
                    </Button>
                  )}
                </div>
              </div>
            )}
        </div>
      )}

        {/* Submit Dialog */}
        {showSubmit && (
        <div className="rounded-xl border border-blue-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
          
            <div className="flex items-center justify-between"><h4 className="text-sm font-semibold flex items-center gap-2">Submit for Approval</h4><Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowSubmit(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
            <div className="py-2">
              <p className="text-xs text-muted-foreground mb-2">Submit <span className="font-mono text-primary">{selectedMod?.mod_ref}</span> for checker approval.</p>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={submitNotes} onChange={e => setSubmitNotes(e.target.value)} className="text-xs mt-1 resize-none" rows={3} placeholder="Add submission notes..." />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowSubmit(false)}>Cancel</Button>
              <Button size="sm" onClick={() => submitMod.mutate({ modificationId: selectedMod!.modification_id, notes: submitNotes || undefined })} disabled={submitMod.isPending}>
                {submitMod.isPending ? "Submitting..." : "Submit"}
              </Button>
            </div>
        </div>
      )}

        {/* Approve Dialog */}
        {showApprove && (
        <div className="rounded-xl border border-emerald-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
          
            <div className="flex items-center justify-between"><h4 className="text-sm font-semibold flex items-center gap-2">Approve Modification</h4><Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowApprove(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
            <div className="py-2">
              <p className="text-xs text-muted-foreground mb-2">Approve <span className="font-mono text-primary">{selectedMod?.mod_ref}</span>?</p>
              <Label className="text-xs">Approval Notes (optional)</Label>
              <Textarea value={approveNotes} onChange={e => setApproveNotes(e.target.value)} className="text-xs mt-1 resize-none" rows={3} placeholder="Add approval notes..." />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowApprove(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approveMod.mutate({ modificationId: selectedMod!.modification_id, notes: approveNotes || undefined })} disabled={approveMod.isPending}>
                {approveMod.isPending ? "Approving..." : "Approve"}
              </Button>
            </div>
        </div>
      )}

        {/* Reject Dialog */}
        {showReject && (
        <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
          
            <div className="flex items-center justify-between"><h4 className="text-sm font-semibold flex items-center gap-2">Reject Modification</h4><Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowReject(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
            <div className="py-2">
              <p className="text-xs text-muted-foreground mb-2">Reject <span className="font-mono text-primary">{selectedMod?.mod_ref}</span>?</p>
              <Label className="text-xs">Rejection Reason *</Label>
              <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="text-xs mt-1 resize-none" rows={3} placeholder="Reason for rejection (required)..." />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowReject(false)}>Cancel</Button>
              <Button size="sm" variant="outline" className="border-red-500 text-red-400 hover:bg-red-500/10" onClick={() => { if (!rejectReason.trim()) { toast.error("Rejection reason is required"); return; } rejectMod.mutate({ modificationId: selectedMod!.modification_id, reason: rejectReason }); }} disabled={rejectMod.isPending}>
                {rejectMod.isPending ? "Rejecting..." : "Reject"}
              </Button>
            </div>
        </div>
      )}

        {/* Apply Dialog */}
        {showApply && (
        <div className="rounded-xl border border-purple-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
          
            <div className="flex items-center justify-between"><h4 className="text-sm font-semibold flex items-center gap-2">Apply Modification to Lease</h4><Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowApply(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
            <div className="py-2">
              <p className="text-xs text-muted-foreground mb-2">Apply <span className="font-mono text-primary">{selectedMod?.mod_ref}</span> to the lease. This will update the lease liability and ROU asset.</p>
              <Label className="text-xs">GL Journal ID (optional)</Label>
              <Input value={glJournalId} onChange={e => setGlJournalId(e.target.value)} className="h-8 text-xs mt-1" placeholder="e.g. JNL-2025-0042" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowApply(false)}>Cancel</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => applyMod.mutate({ modificationId: selectedMod!.modification_id, glJournalId: glJournalId || undefined })} disabled={applyMod.isPending}>
                {applyMod.isPending ? "Applying..." : "Apply to Lease"}
              </Button>
            </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
