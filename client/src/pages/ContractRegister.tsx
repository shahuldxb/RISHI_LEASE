/**
 * VodaLease Enterprise — Contract Register (DMS)
 * Screen ID: VFCNTREGLS0001P001
 *
 * Full Document Management System:
 * - Contract list with search/filter
 * - Per-contract detail drawer with tabs:
 *   1. Documents   — multi-file upload, type tagging, version notes, expiry
 *   2. Metadata    — template-driven custom fields
 *   3. Milestones  — contractual obligations timeline
 *   4. Version History — document version log
 *   5. Create Lease — pre-fills New Lease form from contract data
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Plus, Search, FileText, Pencil, Trash2, Upload, Download, Calendar, CheckCircle2, Clock, AlertTriangle, ExternalLink, FolderOpen, Tag, GitBranch, Milestone, ArrowRight, Eye, MoreHorizontal, RefreshCw, Sparkles, Bell, X } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Active:      "badge-active",
  Draft:       "badge-draft",
  UnderReview: "badge-pending",
  Expired:     "badge-expired",
  Terminated:  "badge-expired",
  Superseded:  "badge-closed",
};

const DOC_TYPES = [
  "Original Contract", "Addendum / Amendment", "Floor Plan",
  "Insurance Certificate", "Handover Report", "Termination Notice",
  "Correspondence", "Registration Document", "Stamp Duty Receipt", "Other",
];

const MILESTONE_TYPES = [
  "Rent Free End", "Fit-Out Deadline", "Break Clause Notice",
  "Renewal Decision", "Registration Deadline", "Insurance Renewal",
  "Inspection Due", "Stamp Duty Deadline", "Custom",
];

const MILESTONE_STATUS_ICON: Record<string, React.ReactNode> = {
  Pending:   <Clock className="h-4 w-4 text-yellow-400" />,
  Completed: <CheckCircle2 className="h-4 w-4 text-green-400" />,
  Overdue:   <AlertTriangle className="h-4 w-4 text-red-400" />,
  Dismissed: <Clock className="h-4 w-4 text-muted-foreground opacity-40" />,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function daysUntil(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ContractRegister() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // List state
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage]     = useState(1);
  const PAGE_SIZE = 50;

  const { data, isLoading } = trpc.lease.getLeaseRegister.useQuery({
    page, pageSize: PAGE_SIZE,
    search: search || undefined,
    status: status !== "all" ? status : undefined,
    sortColumn: "created_at", sortDirection: "DESC",
  });

  const contracts  = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Selected contract for detail drawer
  const [selected, setSelected] = useState<any | null>(null);
  const [drawerTab, setDrawerTab] = useState("documents");

  // ── Documents ──────────────────────────────────────────────────────────
  const { data: documents, isLoading: loadingDocs, refetch: refetchDocs } =
    trpc.contractDms.listDocuments.useQuery(
      { leaseId: selected?.contract_id ?? selected?.lease_id },
      { enabled: !!(selected?.contract_id ?? selected?.lease_id) }
    );

  const [docDialog, setDocDialog] = useState(false);
  const [docDraft, setDocDraft] = useState({
    docType: "Original Contract", docName: "", versionNumber: 1,
    versionNotes: "", signatoryName: "", signedDate: "", expiryDate: "",
    fileBase64: "", mimeType: "application/pdf", fileSize: 0,
  });
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadDoc = trpc.contractDms.uploadDocument.useMutation({
    onSuccess: () => {
      refetchDocs();
      toast.success("Document uploaded");
      setDocDialog(false);
      setDocDraft({ docType: "Original Contract", docName: "", versionNumber: 1, versionNotes: "", signatoryName: "", signedDate: "", expiryDate: "", fileBase64: "", mimeType: "application/pdf", fileSize: 0 });
    },
    onError: e => toast.error(e.message),
  });
  const deleteDoc = trpc.contractDms.deleteDocument.useMutation({
    onSuccess: () => { refetchDocs(); toast.success("Document removed"); setDeleteDocId(null); },
    onError: e => toast.error(e.message),
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { toast.error("File must be under 16 MB"); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = (ev.target?.result as string).split(",")[1];
      setDocDraft(d => ({ ...d, fileBase64: b64, mimeType: file.type, fileSize: file.size, docName: d.docName || file.name }));
    };
    reader.readAsDataURL(file);
  }

  function submitDoc() {
    if (!docDraft.fileBase64) { toast.error("Please select a file"); return; }
    if (!docDraft.docName.trim()) { toast.error("Document name is required"); return; }
    uploadDoc.mutate({
      contractId: selected.contract_id ?? selected.lease_id,
      documentType: docDraft.docType,
      documentName: docDraft.docName,
      fileBase64: docDraft.fileBase64,
      mimeType: docDraft.mimeType,
      versionNotes: docDraft.versionNotes || undefined,
      signatoryName: docDraft.signatoryName || undefined,
      signedDate: docDraft.signedDate || undefined,
      expiryDate: docDraft.expiryDate || undefined,
    });
  }

  // ── Metadata ────────────────────────────────────────────────────────────
  const { data: templates } = trpc.contractDms.listTemplates.useQuery();
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const { data: templateDetail } = trpc.contractDms.getTemplate.useQuery(
    { templateId: selectedTemplateId! },
    { enabled: selectedTemplateId !== null }
  );
  const { data: metaValues, refetch: refetchMeta } = trpc.contractDms.getMetadataValues.useQuery(
    { leaseId: selected?.contract_id ?? selected?.lease_id },
    { enabled: !!(selected?.contract_id ?? selected?.lease_id) }
  );
  const [metaDraft, setMetaDraft] = useState<Record<number, string>>({});
  const [metaSaving, setMetaSaving] = useState(false);

  const upsertMeta = trpc.contractDms.upsertMetadataValues.useMutation({
    onSuccess: () => { refetchMeta(); toast.success("Metadata saved"); setMetaSaving(false); },
    onError: e => { toast.error(e.message); setMetaSaving(false); },
  });

  function saveMeta() {
    if (!selectedTemplateId || !templateDetail) return;
    setMetaSaving(true);
    upsertMeta.mutate({
      leaseId: selected.lease_id,
      templateId: selectedTemplateId,
      values: (templateDetail.fields as any[]).map((f: any) => ({
        fieldId: f.field_id,
        fieldValue: metaDraft[f.field_id] ?? null,
      })),
    });
  }

  // Pre-fill metaDraft when metaValues loads
  function initMetaDraft(values: any[]) {
    const d: Record<number, string> = {};
    for (const v of values) d[v.field_id] = v.field_value ?? "";
    setMetaDraft(d);
  }

  // ── Milestones ──────────────────────────────────────────────────────────
  const { data: milestones, refetch: refetchMilestones } = trpc.contractDms.listMilestones.useQuery(
    { contractId: selected?.contract_id ?? selected?.lease_id },
    { enabled: !!(selected?.contract_id ?? selected?.lease_id) }
  );
  const [msDialog, setMsDialog] = useState(false);
  const [msDraft, setMsDraft] = useState({
    milestoneId: undefined as number | undefined,
    milestoneType: "Custom", title: "", dueDate: "",
    description: "", alertDaysBefore: 30,
  });
  const [deleteMsId, setDeleteMsId] = useState<number | null>(null);

  const upsertMs = trpc.contractDms.upsertMilestone.useMutation({
    onSuccess: () => { refetchMilestones(); toast.success("Milestone saved"); setMsDialog(false); },
    onError: e => toast.error(e.message),
  });
  const completeMs = trpc.contractDms.completeMilestone.useMutation({
    onSuccess: () => { refetchMilestones(); toast.success("Milestone completed"); },
    onError: e => toast.error(e.message),
  });
  const dismissMs = trpc.contractDms.dismissMilestone.useMutation({
    onSuccess: () => { refetchMilestones(); toast.success("Milestone dismissed"); },
    onError: e => toast.error(e.message),
  });
  const deleteMs = trpc.contractDms.deleteMilestone.useMutation({
    onSuccess: () => { refetchMilestones(); toast.success("Milestone deleted"); setDeleteMsId(null); },
    onError: e => toast.error(e.message),
  });

  function openAddMilestone() {
    setMsDraft({ milestoneId: undefined, milestoneType: "Custom", title: "", dueDate: "", description: "", alertDaysBefore: 30 });
    setMsDialog(true);
  }
  function openEditMilestone(m: any) {
    setMsDraft({
      milestoneId: m.milestone_id, milestoneType: m.milestone_type,
      title: m.title, dueDate: m.due_date?.slice(0, 10) ?? "",
      description: m.description ?? "", alertDaysBefore: m.alert_days_before ?? 30,
    });
    setMsDialog(true);
  }

  // ── AI Extraction ────────────────────────────────────────────────────────
  const [aiExtracting, setAiExtracting] = useState(false);
  const extractMeta = trpc.contractDms.extractMetadata.useMutation({
    onSuccess: (result) => {
      setAiExtracting(false);
      const extracted = result.extracted as Record<string, string>;
      // Auto-fill metaDraft: match extracted keys to field labels
      if (templateDetail?.fields) {
        const newDraft = { ...metaDraft };
        for (const field of templateDetail.fields as any[]) {
          const label = field.field_label?.toLowerCase().replace(/[^a-z0-9]/g, '_');
          for (const [key, val] of Object.entries(extracted)) {
            const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (normKey === label || normKey.includes(label) || label.includes(normKey)) {
              newDraft[field.field_id] = String(val ?? '');
              break;
            }
          }
        }
        setMetaDraft(newDraft);
      }
      // Switch to metadata tab
      setDrawerTab('metadata');
      toast.success(`AI extracted ${Object.keys(extracted).length} fields${result.source === 'generated' ? ' (demo data)' : ''}. Review and save.`);
    },
    onError: (e) => { setAiExtracting(false); toast.error(e.message); },
  });

  function handleExtractWithAI() {
    const docs = (documents as any[]) ?? [];
    if (!docs.length) { toast.error('Upload a document first'); return; }
    const firstDoc = docs[0];
    setAiExtracting(true);
    extractMeta.mutate({
      contractId: selected.contract_id ?? selected.lease_id,
      fileUrl: firstDoc.file_url,
    });
  }

  // ── Sync Milestone to Alert ──────────────────────────────────────────────
  const syncAlert = trpc.contractDms.syncMilestoneToAlert.useMutation({
    onSuccess: () => toast.success('Milestone synced to Alert Rules'),
    onError: (e) => toast.error(e.message),
  });

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <ScreenHeader
          screenId="VFCNTREGLS0001P001"
          title="Contract Register"
          subtitle="Document Management System — contracts, documents, metadata, milestones"
          screenType="contract_register"
          onAIData={() => {}}
        />

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search contract ref, lessor, asset..." className="pl-8 h-9"
                  value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="UnderReview">Under Review</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Contract Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {["Contract Ref", "Lessor", "Asset", "Commencement", "Expiry", "Value", "Docs", "Status", ""].map((h, i) => (
                      <th key={i} className={`px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide ${i >= 5 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 9 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : contracts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No contracts found.
                      </td>
                    </tr>
                  ) : (
                    (contracts as any[]).map((c: any, idx: number) => (
                      <tr key={c.contract_id ?? c.lease_id ?? idx} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer"
                        onClick={() => { setSelected(c); setDrawerTab("documents"); }}>
                        <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{c.contract_ref}</td>
                        <td className="px-4 py-3 truncate max-w-36">{c.lessor_name}</td>
                        <td className="px-4 py-3 truncate max-w-36">{c.asset_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.commencement_date ? new Date(c.commencement_date).toLocaleDateString() : "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.expiry_date ? new Date(c.expiry_date).toLocaleDateString() : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.lease_liability ? `QAR ${(c.lease_liability / 1000).toFixed(0)}K` : "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" />—
                          </span>
                        </td>
                        <td className="px-4 py-3"><span className={STATUS_COLORS[c.status] ?? "badge-draft"}>{c.status}</span></td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setSelected(c); setDrawerTab("documents"); }}>
                                <Eye className="mr-2 h-4 w-4" /> Open DMS
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelected(c); setDrawerTab("create-lease"); }}>
                                <ArrowRight className="mr-2 h-4 w-4" /> Create Lease
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setLocation(`/lease/${c.lease_id}/edit`)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit Contract
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

      {/* ── DMS Detail Drawer ── */}
      <Sheet open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0" side="right">
          {selected && (
            <>
              <SheetHeader className="px-6 pt-6 pb-4 border-b bg-muted/20">
                <SheetTitle className="flex items-center gap-3">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-semibold">{selected.contract_ref}</div>
                    <div className="text-xs text-muted-foreground font-normal mt-0.5">
                      {selected.lessor_name} · {selected.asset_name}
                    </div>
                  </div>
                  <span className={`ml-auto ${STATUS_COLORS[selected.status] ?? "badge-draft"}`}>{selected.status}</span>
                </SheetTitle>
              </SheetHeader>

              <Tabs value={drawerTab} onValueChange={setDrawerTab} className="flex flex-col h-full">
                <TabsList className="grid grid-cols-5 mx-6 mt-4 mb-0 h-9">
                  <TabsTrigger value="documents" className="text-xs"><FileText className="h-3.5 w-3.5 mr-1" />Docs</TabsTrigger>
                  <TabsTrigger value="metadata" className="text-xs"><Tag className="h-3.5 w-3.5 mr-1" />Metadata</TabsTrigger>
                  <TabsTrigger value="milestones" className="text-xs"><Milestone className="h-3.5 w-3.5 mr-1" />Milestones</TabsTrigger>
                  <TabsTrigger value="versions" className="text-xs"><GitBranch className="h-3.5 w-3.5 mr-1" />Versions</TabsTrigger>
                  <TabsTrigger value="create-lease" className="text-xs"><ArrowRight className="h-3.5 w-3.5 mr-1" />Create Lease</TabsTrigger>
                </TabsList>

                {/* ── Documents Tab ── */}
                <TabsContent value="documents" className="px-6 py-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Contract Documents</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={handleExtractWithAI} disabled={aiExtracting}>
                        {aiExtracting ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                        {aiExtracting ? 'Extracting...' : 'Extract with AI'}
                      </Button>
                      <Button size="sm" onClick={() => setDocDialog(true)}>
                        <Upload className="h-4 w-4 mr-1.5" /> Upload Document
                      </Button>
                    </div>
                  </div>
                  {loadingDocs ? (
                    <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                  ) : !(documents as any[])?.length ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No documents yet. Upload the signed contract to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Group by doc_type */}
                      {Array.from(new Set((documents as any[]).map((d: any) => d.doc_type))).map(type => (
                        <div key={type as string}>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{type as string}</p>
                          {(documents as any[]).filter((d: any) => d.doc_type === type).map((doc: any) => (
                            <div key={doc.doc_id} className="flex items-start gap-3 p-3 rounded-md border bg-background hover:border-primary/30 group mb-1.5">
                              <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{doc.doc_name}</span>
                                  <Badge variant="outline" className="text-xs shrink-0">v{doc.version_number}</Badge>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                                  <span>{formatBytes(doc.file_size)}</span>
                                  {doc.signatory_name && <span>Signed by: {doc.signatory_name}</span>}
                                  {doc.signed_date && <span>Signed: {new Date(doc.signed_date).toLocaleDateString()}</span>}
                                  {doc.expiry_date && (
                                    <span className={daysUntil(doc.expiry_date) < 30 ? "text-red-400" : ""}>
                                      Expires: {new Date(doc.expiry_date).toLocaleDateString()}
                                      {daysUntil(doc.expiry_date) < 30 && ` (${daysUntil(doc.expiry_date)}d)`}
                                    </span>
                                  )}
                                  {doc.version_notes && <span className="italic">{doc.version_notes}</span>}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  Uploaded {new Date(doc.uploaded_at).toLocaleDateString()} by {doc.uploaded_by_name ?? "—"}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                  <a href={doc.file_url} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /></a>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteDocId(doc.doc_id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* ── Metadata Tab ── */}
                <TabsContent value="metadata" className="px-6 py-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Contract Metadata</span>
                    <Button size="sm" variant="outline" onClick={() => setLocation("/contracts/metadata-templates")}>
                      <Tag className="h-4 w-4 mr-1.5" /> Manage Templates
                    </Button>
                  </div>
                  {!(templates as any[])?.length ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Tag className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No metadata templates defined yet.</p>
                      <Button size="sm" className="mt-3" onClick={() => setLocation("/contracts/metadata-templates")}>
                        Create Template
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Select Template</Label>
                        <Select
                          value={selectedTemplateId?.toString() ?? ""}
                          onValueChange={v => {
                            const id = +v;
                            setSelectedTemplateId(id);
                            // Pre-fill from existing values
                            if (metaValues) initMetaDraft(metaValues as any[]);
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Choose a metadata template..." /></SelectTrigger>
                          <SelectContent>
                            {(templates as any[]).map((t: any) => (
                              <SelectItem key={t.template_id} value={t.template_id.toString()}>
                                {t.template_name} <span className="text-muted-foreground ml-1">({t.contract_type})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedTemplateId && templateDetail && (
                        <div className="space-y-3">
                          {(templateDetail.fields as any[]).map((f: any) => (
                            <div key={f.field_id} className="space-y-1.5">
                              <Label>
                                {f.field_label}
                                {f.is_required && <span className="text-red-400 ml-1">*</span>}
                                {f.help_text && <span className="text-muted-foreground font-normal ml-2 text-xs">— {f.help_text}</span>}
                              </Label>
                              {f.field_type === "textarea" ? (
                                <Textarea rows={2} placeholder={f.placeholder ?? ""}
                                  value={metaDraft[f.field_id] ?? ""}
                                  onChange={e => setMetaDraft(d => ({ ...d, [f.field_id]: e.target.value }))} />
                              ) : f.field_type === "dropdown" ? (
                                <Select value={metaDraft[f.field_id] ?? ""}
                                  onValueChange={v => setMetaDraft(d => ({ ...d, [f.field_id]: v }))}>
                                  <SelectTrigger><SelectValue placeholder={f.placeholder ?? "Select..."} /></SelectTrigger>
                                  <SelectContent>
                                    {(JSON.parse(f.dropdown_options ?? "[]") as string[]).map((opt: string) => (
                                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : f.field_type === "boolean" ? (
                                <Select value={metaDraft[f.field_id] ?? ""}
                                  onValueChange={v => setMetaDraft(d => ({ ...d, [f.field_id]: v }))}>
                                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Yes">Yes</SelectItem>
                                    <SelectItem value="No">No</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  type={f.field_type === "date" ? "date" : f.field_type === "number" || f.field_type === "currency" ? "number" : "text"}
                                  placeholder={f.placeholder ?? ""}
                                  value={metaDraft[f.field_id] ?? ""}
                                  onChange={e => setMetaDraft(d => ({ ...d, [f.field_id]: e.target.value }))}
                                />
                              )}
                            </div>
                          ))}
                          <Button className="w-full mt-2" onClick={saveMeta} disabled={metaSaving}>
                            {metaSaving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Save Metadata
                          </Button>
                        </div>
                      )}

                      {/* Show existing saved values if no template selected */}
                      {!selectedTemplateId && (metaValues as any[])?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">Saved metadata values:</p>
                          {(metaValues as any[]).map((v: any) => (
                            <div key={v.value_id} className="flex justify-between text-sm py-1 border-b last:border-0">
                              <span className="text-muted-foreground">{v.field_label}</span>
                              <span className="font-medium">{v.field_value ?? "—"}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* ── Milestones Tab ── */}
                <TabsContent value="milestones" className="px-6 py-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Contractual Milestones</span>
                    <Button size="sm" onClick={openAddMilestone}>
                      <Plus className="h-4 w-4 mr-1.5" /> Add Milestone
                    </Button>
                  </div>
                  {!(milestones as any[])?.length ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Milestone className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No milestones yet. Add contractual obligations like rent-free end, fit-out deadlines, or break clause notice dates.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(milestones as any[]).map((m: any) => {
                        const days = daysUntil(m.due_date);
                        return (
                          <div key={m.milestone_id} className={`flex items-start gap-3 p-3 rounded-md border bg-background group ${m.status === "Overdue" ? "border-red-500/30" : m.status === "Completed" ? "opacity-60" : days <= 30 ? "border-yellow-500/30" : ""}`}>
                            <div className="mt-0.5">{MILESTONE_STATUS_ICON[m.status]}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{m.title}</span>
                                <Badge variant="outline" className="text-xs">{m.milestone_type}</Badge>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(m.due_date).toLocaleDateString()}
                                </span>
                                {m.status === "Pending" && (
                                  <span className={days < 0 ? "text-red-400" : days <= 30 ? "text-yellow-400" : ""}>
                                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                                  </span>
                                )}
                                {m.description && <span className="italic">{m.description}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              {m.status === "Pending" && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-400 hover:text-green-300"
                                    onClick={() => completeMs.mutate({ milestoneId: m.milestone_id })}>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditMilestone(m)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                                    onClick={() => dismissMs.mutate({ milestoneId: m.milestone_id })}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              {m.status === "Pending" && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-400 hover:text-blue-300"
                                  title="Sync to Alert Rules"
                                  onClick={() => syncAlert.mutate({
                                    milestoneId: m.milestone_id,
                                  })}>
                                  <Bell className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeleteMsId(m.milestone_id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* ── Version History Tab ── */}
                <TabsContent value="versions" className="px-6 py-4 space-y-4">
                  <span className="text-sm font-medium">Document Version History</span>
                  {loadingDocs ? (
                    <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : !(documents as any[])?.length ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No documents uploaded yet.</p>
                    </div>
                  ) : (
                    <div className="relative pl-4 border-l-2 border-border space-y-4">
                      {[...(documents as any[])].sort((a: any, b: any) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()).map((doc: any) => (
                        <div key={doc.doc_id} className="relative">
                          <div className="absolute -left-[1.35rem] top-1 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                          <div className="pl-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{doc.doc_name}</span>
                              <Badge variant="outline" className="text-xs">v{doc.version_number}</Badge>
                              <Badge variant="secondary" className="text-xs">{doc.doc_type}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {new Date(doc.uploaded_at).toLocaleString()} · {doc.uploaded_by_name ?? "—"} · {formatBytes(doc.file_size)}
                            </div>
                            {doc.version_notes && <p className="text-xs italic text-muted-foreground mt-0.5">{doc.version_notes}</p>}
                            <Button variant="link" size="sm" className="h-6 px-0 text-xs mt-0.5" asChild>
                              <a href={doc.file_url} target="_blank" rel="noreferrer">
                                <Download className="h-3 w-3 mr-1" /> Download
                              </a>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* ── Create Lease Tab ── */}
                <TabsContent value="create-lease" className="px-6 py-4 space-y-4">
                  <div className="rounded-lg border bg-primary/5 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-primary">
                      <ArrowRight className="h-5 w-5" />
                      <span className="font-semibold">Create Lease from Contract</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The following contract details will be pre-filled into the New Lease form. Review them, then click <strong>Open New Lease Form</strong> to create the accounting record.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {[
                      ["Contract Reference", selected.contract_ref],
                      ["Lessor", selected.lessor_name],
                      ["Asset / Property", selected.asset_name],
                      ["Commencement Date", selected.commencement_date ? new Date(selected.commencement_date).toLocaleDateString() : "—"],
                      ["Expiry Date", selected.expiry_date ? new Date(selected.expiry_date).toLocaleDateString() : "—"],
                      ["Lease Value (Liability)", selected.lease_liability ? `QAR ${Number(selected.lease_liability).toLocaleString()}` : "—"],
                      ["Currency", selected.currency ?? "QAR"],
                      ["Status", selected.status],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between py-2 border-b last:border-0 text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Show saved metadata values as additional pre-fill info */}
                  {(metaValues as any[])?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Additional Metadata</p>
                      {(metaValues as any[]).map((v: any) => (
                        <div key={v.value_id} className="flex justify-between py-1.5 border-b last:border-0 text-sm">
                          <span className="text-muted-foreground">{v.field_label}</span>
                          <span className="font-medium">{v.field_value ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button className="w-full" size="lg"
                    onClick={() => {
                      const params = new URLSearchParams({
                        from_contract: selected.lease_id,
                        contract_ref: selected.contract_ref ?? "",
                        lessor_id: selected.lessor_id ?? "",
                        asset_name: selected.asset_name ?? "",
                        commencement: selected.commencement_date?.slice(0, 10) ?? "",
                        expiry: selected.expiry_date?.slice(0, 10) ?? "",
                        currency: selected.currency ?? "QAR",
                      });
                      setSelected(null);
                      setLocation(`/leases/new?${params.toString()}`);
                    }}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open New Lease Form (Pre-filled)
                  </Button>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Upload Document Dialog ── */}
      {docDialog && (
        <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between"><h4 className="text-sm font-semibold flex items-center gap-2">Upload Document</h4><Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDocDialog(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-4 py-2">
            {/* File picker */}
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              {docDraft.fileBase64 ? (
                <p className="text-sm text-green-400">File selected · {formatBytes(docDraft.fileSize)}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Click to select a file (max 16 MB)</p>
              )}
              <input ref={fileInputRef} type="file" className="hidden"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.xls"
                onChange={handleFileSelect} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Document Type</Label>
                <Select value={docDraft.docType} onValueChange={v => setDocDraft(d => ({ ...d, docType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Version Number</Label>
                <Input type="number" min={1} value={docDraft.versionNumber}
                  onChange={e => setDocDraft(d => ({ ...d, versionNumber: +e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Document Name <span className="text-red-400">*</span></Label>
              <Input placeholder="e.g. Signed Lease Agreement v2" value={docDraft.docName}
                onChange={e => setDocDraft(d => ({ ...d, docName: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Signatory Name</Label>
                <Input placeholder="Who signed this?" value={docDraft.signatoryName}
                  onChange={e => setDocDraft(d => ({ ...d, signatoryName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Signed Date</Label>
                <Input type="date" value={docDraft.signedDate}
                  onChange={e => setDocDraft(d => ({ ...d, signedDate: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input type="date" value={docDraft.expiryDate}
                  onChange={e => setDocDraft(d => ({ ...d, expiryDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Version Notes</Label>
                <Input placeholder="e.g. Addendum 2 — rent increase" value={docDraft.versionNotes}
                  onChange={e => setDocDraft(d => ({ ...d, versionNotes: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setDocDialog(false)}>Cancel</Button>
            <Button onClick={submitDoc} disabled={uploadDoc.isPending}>
              {uploadDoc.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload
            </Button>
          </div>
        </div>
      )}

      {/* ── Add/Edit Milestone Dialog ── */}
      {msDialog && (
        <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between"><h4 className="text-sm font-semibold flex items-center gap-2">{msDraft.milestoneId ? "Edit Milestone" : "Add Milestone"}</h4><Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setMsDialog(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={msDraft.milestoneType} onValueChange={v => setMsDraft(d => ({ ...d, milestoneType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MILESTONE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due Date <span className="text-red-400">*</span></Label>
                <Input type="date" value={msDraft.dueDate} onChange={e => setMsDraft(d => ({ ...d, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Title <span className="text-red-400">*</span></Label>
              <Input placeholder="e.g. Rent-free period ends" value={msDraft.title}
                onChange={e => setMsDraft(d => ({ ...d, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} placeholder="Optional notes..." value={msDraft.description}
                onChange={e => setMsDraft(d => ({ ...d, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Alert X days before due date</Label>
              <Input type="number" min={1} max={365} value={msDraft.alertDaysBefore}
                onChange={e => setMsDraft(d => ({ ...d, alertDaysBefore: +e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setMsDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!msDraft.title.trim() || !msDraft.dueDate) { toast.error("Title and due date are required"); return; }
              upsertMs.mutate({ milestoneId: msDraft.milestoneId, milestoneType: msDraft.milestoneType, milestoneDate: msDraft.dueDate, description: msDraft.description, contractId: selected.contract_id ?? selected.lease_id });
            }} disabled={upsertMs.isPending}>Save Milestone</Button>
          </div>
        </div>
      )}

      {/* ── Delete Document Confirm ── */}
      {deleteDocId !== null && (
        <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">Delete Document?</h4>
            <p className="text-xs text-muted-foreground">This will permanently remove the document record. The file in storage will no longer be accessible.</p>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDeleteDocId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline">Cancel</Button>
            <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteDoc.mutate({ documentId: deleteDocId! })}>Delete</Button>
          </div>
        </div>
      )}

      {/* ── Delete Milestone Confirm ── */}
      {deleteMsId !== null && (
        <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">Delete Milestone?</h4>
            <p className="text-xs text-muted-foreground">This milestone will be permanently removed.</p>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDeleteMsId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline">Cancel</Button>
            <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMs.mutate({ milestoneId: deleteMsId! })}>Delete</Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
