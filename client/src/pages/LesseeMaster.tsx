/**
 * VodaLease Enterprise — Lessee Master
 * Screen ID: VFLSSMSTR0001P001
 *
 * Full CRUD for lessee entities:
 * - Paginated list with search / status / entity-type filters
 * - Right-side detail panel with tabs: Profile | Bank Accounts | Signatories
 * - Gen AI fill (UI only, no DB insert)
 * - Add / Edit / Soft-delete
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Search, Building2, Pencil, Trash2, CreditCard, Users, Phone, Mail, Globe, MapPin, Sparkles, RefreshCw, ChevronRight, CheckCircle2, XCircle, AlertTriangle, Star, X } from "lucide-react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TYPES = ["Real Estate", "Car Fleet", "Company", "Subsidiary", "Branch", "JV", "Individual"] as const;
const STATUSES     = ["Active", "Inactive", "Suspended"] as const;
const CURRENCIES   = ["QAR", "USD", "EUR", "GBP", "AED", "SAR"] as const;

const STATUS_BADGE: Record<string, string> = {
  Active:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Inactive:  "bg-muted/60 text-muted-foreground border-border",
  Suspended: "bg-red-500/15 text-red-400 border-red-500/30",
};

const ENTITY_BADGE: Record<string, string> = {
  "Real Estate": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Car Fleet":   "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Company:       "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Subsidiary:    "bg-purple-500/15 text-purple-400 border-purple-500/30",
  Branch:        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  JV:            "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  Individual:    "bg-pink-500/15 text-pink-400 border-pink-500/30",
};

// ─── Blank form state ─────────────────────────────────────────────────────────

const BLANK_LESSEE = {
  lesseeId:       undefined as number | undefined,
  lesseeCode:     "",
  lesseeName:     "",
  tradeName:      "",
  entityType:     "Company" as typeof ENTITY_TYPES[number],
  parentCompany:  "",
  registrationNo: "",
  taxVatNo:       "",
  industrySector: "",
  creditRating:   "",
  country:        "Qatar",
  city:           "",
  address:        "",
  poBox:          "",
  contactPerson:  "",
  contactEmail:   "",
  contactPhone:   "",
  website:        "",
  status:         "Active" as typeof STATUSES[number],
  notes:          "",
};

const BLANK_BANK = {
  bankAccountId:  undefined as number | undefined,
  bankName:       "",
  accountName:    "",
  accountNumber:  "",
  iban:           "",
  swiftBic:       "",
  currency:       "QAR" as string,
  branch:         "",
  isPrimary:      false,
};

const BLANK_SIG = {
  signatoryId:    undefined as number | undefined,
  fullName:       "",
  designation:    "",
  email:          "",
  phone:          "",
  authorityLimit: "" as string,
  isActive:       true,
};

// ─── AI sample data ───────────────────────────────────────────────────────────

const AI_SAMPLE = {
  lesseeCode:     "LSE-RE-AI-001",
  lesseeName:     "Barwa Real Estate Company Q.P.S.C.",
  tradeName:      "Barwa Real Estate",
  entityType:     "Real Estate" as typeof ENTITY_TYPES[number],
  parentCompany:  "Barwa Group",
  registrationNo: "QA-CR-2007-00234",
  taxVatNo:       "QA-TAX-BRE-001",
  industrySector: "Real Estate",
  creditRating:   "A",
  country:        "Qatar",
  city:           "Doha",
  address:        "Barwa Tower, West Bay, Doha, Qatar",
  poBox:          "P.O. Box 22178",
  contactPerson:  "Ahmed Al-Sulaiti",
  contactEmail:   "ahmed.sulaiti@barwa.com.qa",
  contactPhone:   "+974 4455 6677",
  website:        "https://www.barwa.com.qa",
  status:         "Active" as typeof STATUSES[number],
  notes:          "Major real estate developer and property management company in Qatar.",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function LesseeMaster() {
  const utils = trpc.useUtils();

  // List state
  const [search,     setSearch]     = useState("");
  const [statusFilt, setStatusFilt] = useState("all");
  const [entityFilt, setEntityFilt] = useState("all");
  const [page,       setPage]       = useState(1);
  const PAGE_SIZE = 50;

  // Gen AI preview rows (not saved to DB)
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);

  // Stable query input
  const queryInput = useMemo(() => ({
    page,
    pageSize: PAGE_SIZE,
    search:     search     || undefined,
    status:     statusFilt !== "all" ? statusFilt : undefined,
    entityType: entityFilt !== "all" ? entityFilt : undefined,
  }), [page, search, statusFilt, entityFilt]);

  const { data, isLoading } = trpc.lessee.getLessees.useQuery(queryInput);
  const lessees    = aiRows.length > 0 ? aiRows : (data?.rows ?? []);
  const totalCount = aiRows.length > 0 ? aiRows.length : (data?.totalCount ?? 0);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Selected lessee for detail panel
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail, isLoading: loadingDetail, refetch: refetchDetail } =
    trpc.lessee.getLesseeById.useQuery(
      { lesseeId: selectedId! },
      { enabled: selectedId !== null }
    );

  // Form state
  const [formOpen,  setFormOpen]  = useState(false);
  const [formDraft, setFormDraft] = useState({ ...BLANK_LESSEE });
  const [deleteId,  setDeleteId]  = useState<number | null>(null);

  // Bank account dialog
  const [bankOpen,  setBankOpen]  = useState(false);
  const [bankDraft, setBankDraft] = useState({ ...BLANK_BANK });
  const [deleteBankId, setDeleteBankId] = useState<number | null>(null);

  // Signatory dialog
  const [sigOpen,   setSigOpen]   = useState(false);
  const [sigDraft,  setSigDraft]  = useState({ ...BLANK_SIG });
  const [deleteSigId, setDeleteSigId] = useState<number | null>(null);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const upsertLessee = trpc.lessee.upsertLessee.useMutation({
    onSuccess: (res) => {
      utils.lessee.getLessees.invalidate();
      toast.success(formDraft.lesseeId ? "Lessee updated" : "Lessee created");
      setFormOpen(false);
      if (res.lesseeId) setSelectedId(res.lesseeId);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLessee = trpc.lessee.deleteLessee.useMutation({
    onSuccess: () => {
      utils.lessee.getLessees.invalidate();
      toast.success("Lessee deactivated");
      setDeleteId(null);
      if (selectedId === deleteId) setSelectedId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const upsertBank = trpc.lessee.upsertBankAccount.useMutation({
    onSuccess: () => { refetchDetail(); toast.success("Bank account saved"); setBankOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const deleteBank = trpc.lessee.deleteBankAccount.useMutation({
    onSuccess: () => { refetchDetail(); toast.success("Bank account removed"); setDeleteBankId(null); },
    onError: (e) => toast.error(e.message),
  });

  const upsertSig = trpc.lessee.upsertSignatory.useMutation({
    onSuccess: () => { refetchDetail(); toast.success("Signatory saved"); setSigOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const deleteSig = trpc.lessee.deleteSignatory.useMutation({
    onSuccess: () => { refetchDetail(); toast.success("Signatory removed"); setDeleteSigId(null); },
    onError: (e) => toast.error(e.message),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function openCreate() {
    setFormDraft({ ...BLANK_LESSEE });
    setFormOpen(true);
  }

  function openEdit(row: any) {
    setFormDraft({
      lesseeId:       row.lessee_id,
      lesseeCode:     row.lessee_code     ?? "",
      lesseeName:     row.lessee_name     ?? "",
      tradeName:      row.trade_name      ?? "",
      entityType:     row.entity_type     ?? "Company",
      parentCompany:  row.parent_company  ?? "",
      registrationNo: row.registration_no ?? "",
      taxVatNo:       row.tax_vat_no      ?? "",
      industrySector: row.industry_sector ?? "",
      creditRating:   row.credit_rating   ?? "",
      country:        row.country         ?? "Qatar",
      city:           row.city            ?? "",
      address:        row.address         ?? "",
      poBox:          row.po_box          ?? "",
      contactPerson:  row.contact_person  ?? "",
      contactEmail:   row.contact_email   ?? "",
      contactPhone:   row.contact_phone   ?? "",
      website:        row.website         ?? "",
      status:         row.status          ?? "Active",
      notes:          row.notes           ?? "",
    });
    setFormOpen(true);
  }

  function fillWithAI() {
    setFormDraft(d => ({ ...d, ...AI_SAMPLE, lesseeId: d.lesseeId }));
    toast.success("Gen AI filled the form with sample Vodafone Digital data");
  }

  function submitForm() {
    if (!formDraft.lesseeCode.trim()) { toast.error("Lessee Code is required"); return; }
    if (!formDraft.lesseeName.trim()) { toast.error("Lessee Name is required"); return; }
    upsertLessee.mutate({
      ...formDraft,
      tradeName:      formDraft.tradeName      || undefined,
      parentCompany:  formDraft.parentCompany  || undefined,
      registrationNo: formDraft.registrationNo || undefined,
      taxVatNo:       formDraft.taxVatNo        || undefined,
      industrySector: formDraft.industrySector  || undefined,
      creditRating:   formDraft.creditRating    || undefined,
      city:           formDraft.city            || undefined,
      address:        formDraft.address         || undefined,
      poBox:          formDraft.poBox           || undefined,
      contactPerson:  formDraft.contactPerson   || undefined,
      contactEmail:   formDraft.contactEmail    || undefined,
      contactPhone:   formDraft.contactPhone    || undefined,
      website:        formDraft.website         || undefined,
      notes:          formDraft.notes           || undefined,
    });
  }

  function openAddBank() {
    setBankDraft({ ...BLANK_BANK });
    setBankOpen(true);
  }
  function openEditBank(b: any) {
    setBankDraft({
      bankAccountId: b.bank_account_id,
      bankName:      b.bank_name      ?? "",
      accountName:   b.account_name   ?? "",
      accountNumber: b.account_number ?? "",
      iban:          b.iban           ?? "",
      swiftBic:      b.swift_bic      ?? "",
      currency:      b.currency       ?? "QAR",
      branch:        b.branch         ?? "",
      isPrimary:     !!b.is_primary,
    });
    setBankOpen(true);
  }
  function submitBank() {
    if (!bankDraft.bankName.trim())      { toast.error("Bank name required"); return; }
    if (!bankDraft.accountNumber.trim()) { toast.error("Account number required"); return; }
    upsertBank.mutate({
      ...bankDraft,
      lesseeId:      selectedId!,
      iban:          bankDraft.iban     || undefined,
      swiftBic:      bankDraft.swiftBic || undefined,
      branch:        bankDraft.branch   || undefined,
    });
  }

  function openAddSig() {
    setSigDraft({ ...BLANK_SIG });
    setSigOpen(true);
  }
  function openEditSig(s: any) {
    setSigDraft({
      signatoryId:    s.signatory_id,
      fullName:       s.full_name        ?? "",
      designation:    s.designation      ?? "",
      email:          s.email            ?? "",
      phone:          s.phone            ?? "",
      authorityLimit: s.authority_limit != null ? String(s.authority_limit) : "",
      isActive:       s.is_active !== false,
    });
    setSigOpen(true);
  }
  function submitSig() {
    if (!sigDraft.fullName.trim()) { toast.error("Full name required"); return; }
    upsertSig.mutate({
      ...sigDraft,
      lesseeId:       selectedId!,
      designation:    sigDraft.designation    || undefined,
      email:          sigDraft.email          || undefined,
      phone:          sigDraft.phone          || undefined,
      authorityLimit: sigDraft.authorityLimit ? parseFloat(sigDraft.authorityLimit) : undefined,
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <ScreenHeader
          screenId="VFLSSMSTR0001P001"
          title="Lessee Master"
          subtitle="Tenants & customers who lease from Vodafone — Real Estate companies and Car Fleet operators (IFRS 16 Lessee)"
          screenType="lessee_master"
          onAIData={(rows) => { setAiRows(rows); setPage(1); }}
        />

        {/* Filters + Actions */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search name, code, trade name…" className="pl-8 h-9"
                  value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <Select value={statusFilt} onValueChange={v => { setStatusFilt(v); setPage(1); }}>
                <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={entityFilt} onValueChange={v => { setEntityFilt(v); setPage(1); }}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Entity Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={openCreate} className="ml-auto">
                <Plus className="h-4 w-4 mr-1" /> Add Lessee
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main split layout */}
        <div className="flex gap-4 min-h-[600px]">

          {/* ── Left: Lessee List ── */}
          <Card className="flex-1 min-w-0">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      {["Code", "Name / Trade Name", "Type", "Country", "Contact", "Status", ""].map((h, i) => (
                        <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 7 }).map((_, j) => (
                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    ) : !lessees.length ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">No lessees found.</p>
                        </td>
                      </tr>
                    ) : (
                      (lessees as any[]).map((l: any, idx: number) => (
                        <tr key={l.lessee_id ?? idx}
                          className={`border-b last:border-0 cursor-pointer transition-colors ${selectedId === l.lessee_id ? "bg-primary/10" : "hover:bg-muted/20"}`}
                          onClick={() => setSelectedId(l.lessee_id)}>
                          <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{l.lessee_code}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium truncate max-w-48">{l.lessee_name}</div>
                            {l.trade_name && <div className="text-xs text-muted-foreground truncate max-w-48">{l.trade_name}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs ${ENTITY_BADGE[l.entity_type] ?? ""}`}>
                              {l.entity_type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{l.country}</td>
                          <td className="px-4 py-3">
                            {l.contact_person && <div className="text-xs truncate max-w-32">{l.contact_person}</div>}
                            {l.contact_email  && <div className="text-xs text-muted-foreground truncate max-w-32">{l.contact_email}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs ${STATUS_BADGE[l.status] ?? ""}`}>
                              {l.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight className={`h-4 w-4 transition-colors ${selectedId === l.lessee_id ? "text-primary" : "text-muted-foreground"}`} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
                  <span>{totalCount} lessees</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                    <span className="px-2 py-1">Page {page} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Right: Detail Panel ── */}
          {selectedId && (
            <Card className="w-[480px] shrink-0 overflow-y-auto">
              <CardContent className="p-0">
                {loadingDetail ? (
                  <div className="p-6 space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
                  </div>
                ) : !detail?.lessee ? (
                  <div className="p-6 text-center text-muted-foreground">Lessee not found.</div>
                ) : (
                  <>
                    {/* Header */}
                    <div className="px-6 pt-5 pb-4 border-b bg-muted/20">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-mono text-xs text-primary">{detail.lessee.lessee_code}</span>
                            <Badge variant="outline" className={`text-xs ${STATUS_BADGE[detail.lessee.status] ?? ""}`}>
                              {detail.lessee.status}
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-base leading-tight">{detail.lessee.lessee_name}</h3>
                          {detail.lessee.trade_name && (
                            <p className="text-xs text-muted-foreground mt-0.5">{detail.lessee.trade_name}</p>
                          )}
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline" className={`text-xs ${ENTITY_BADGE[detail.lessee.entity_type] ?? ""}`}>
                              {detail.lessee.entity_type}
                            </Badge>
                            {detail.lessee.parent_company && (
                              <span className="text-xs text-muted-foreground">↳ {detail.lessee.parent_company}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(detail.lessee)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(detail.lessee.lessee_id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Tabs */}
                    <Tabs defaultValue="profile" className="w-full">
                      <TabsList className="w-full rounded-none border-b bg-transparent h-10 px-4 justify-start gap-1">
                        <TabsTrigger value="profile" className="text-xs h-8">
                          <Building2 className="h-3.5 w-3.5 mr-1" />Profile
                        </TabsTrigger>
                        <TabsTrigger value="banks" className="text-xs h-8">
                          <CreditCard className="h-3.5 w-3.5 mr-1" />Banks
                          {(detail.bankAccounts?.length ?? 0) > 0 && (
                            <span className="ml-1 bg-primary/20 text-primary text-xs rounded-full px-1.5">{detail.bankAccounts.length}</span>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="signatories" className="text-xs h-8">
                          <Users className="h-3.5 w-3.5 mr-1" />Signatories
                          {(detail.signatories?.length ?? 0) > 0 && (
                            <span className="ml-1 bg-primary/20 text-primary text-xs rounded-full px-1.5">{detail.signatories.length}</span>
                          )}
                        </TabsTrigger>
                      </TabsList>

                      {/* ── Profile Tab ── */}
                      <TabsContent value="profile" className="px-6 py-4 space-y-4">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {[
                            ["Registration No.", detail.lessee.registration_no],
                            ["Tax / VAT No.",    detail.lessee.tax_vat_no],
                            ["Industry Sector",  detail.lessee.industry_sector],
                            ["Credit Rating",    detail.lessee.credit_rating],
                          ].map(([label, val]) => val ? (
                            <div key={label as string}>
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className="font-medium">{val}</p>
                            </div>
                          ) : null)}
                        </div>

                        <div className="border-t pt-3 space-y-2 text-sm">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</p>
                          {detail.lessee.address && (
                            <div className="flex gap-2">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                              <span>{detail.lessee.address}</span>
                            </div>
                          )}
                          {detail.lessee.po_box && <p className="text-xs text-muted-foreground pl-5">{detail.lessee.po_box}</p>}
                          <p className="text-xs text-muted-foreground pl-5">{[detail.lessee.city, detail.lessee.country].filter(Boolean).join(", ")}</p>
                        </div>

                        <div className="border-t pt-3 space-y-2 text-sm">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</p>
                          {detail.lessee.contact_person && <p className="font-medium">{detail.lessee.contact_person}</p>}
                          {detail.lessee.contact_email && (
                            <div className="flex gap-2 items-center">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                              <a href={`mailto:${detail.lessee.contact_email}`} className="text-primary hover:underline text-xs">{detail.lessee.contact_email}</a>
                            </div>
                          )}
                          {detail.lessee.contact_phone && (
                            <div className="flex gap-2 items-center">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs">{detail.lessee.contact_phone}</span>
                            </div>
                          )}
                          {detail.lessee.website && (
                            <div className="flex gap-2 items-center">
                              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                              <a href={detail.lessee.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate">{detail.lessee.website}</a>
                            </div>
                          )}
                        </div>

                        {detail.lessee.notes && (
                          <div className="border-t pt-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                            <p className="text-sm text-muted-foreground">{detail.lessee.notes}</p>
                          </div>
                        )}
                      </TabsContent>

                      {/* ── Bank Accounts Tab ── */}
                      <TabsContent value="banks" className="px-6 py-4 space-y-3">
                        <div className="flex justify-end">
                          <Button size="sm" variant="outline" onClick={openAddBank}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Bank Account
                          </Button>
                        </div>
                        {!(detail.bankAccounts?.length) ? (
                          <div className="text-center py-10 text-muted-foreground">
                            <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No bank accounts yet.</p>
                          </div>
                        ) : (
                          (detail.bankAccounts as any[]).map((b: any) => (
                            <div key={b.bank_account_id} className="border rounded-lg p-3 space-y-1.5 relative">
                              {b.is_primary && (
                                <span className="absolute top-2 right-2 flex items-center gap-1 text-xs text-amber-400">
                                  <Star className="h-3 w-3 fill-amber-400" /> Primary
                                </span>
                              )}
                              <div className="flex items-center justify-between pr-16">
                                <p className="font-medium text-sm">{b.bank_name}</p>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditBank(b)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={() => setDeleteBankId(b.bank_account_id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">{b.account_name}</p>
                              <p className="font-mono text-xs">{b.account_number}</p>
                              {b.iban     && <p className="text-xs text-muted-foreground">IBAN: {b.iban}</p>}
                              {b.swift_bic && <p className="text-xs text-muted-foreground">SWIFT: {b.swift_bic}</p>}
                              <div className="flex gap-2 text-xs text-muted-foreground">
                                <span>{b.currency}</span>
                                {b.branch && <span>· {b.branch}</span>}
                              </div>
                            </div>
                          ))
                        )}
                      </TabsContent>

                      {/* ── Signatories Tab ── */}
                      <TabsContent value="signatories" className="px-6 py-4 space-y-3">
                        <div className="flex justify-end">
                          <Button size="sm" variant="outline" onClick={openAddSig}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Signatory
                          </Button>
                        </div>
                        {!(detail.signatories?.length) ? (
                          <div className="text-center py-10 text-muted-foreground">
                            <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No signatories yet.</p>
                          </div>
                        ) : (
                          (detail.signatories as any[]).map((s: any) => (
                            <div key={s.signatory_id} className="border rounded-lg p-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{s.full_name}</p>
                                  {s.is_active
                                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                    : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                                </div>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditSig(s)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={() => setDeleteSigId(s.signatory_id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              {s.designation && <p className="text-xs text-muted-foreground">{s.designation}</p>}
                              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                {s.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</span>}
                                {s.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</span>}
                                {s.authority_limit != null && (
                                  <span className="flex items-center gap-1 text-amber-400">
                                    <AlertTriangle className="h-3 w-3" />
                                    Limit: {Number(s.authority_limit).toLocaleString()} QAR
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </TabsContent>
                    </Tabs>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          Add / Edit Lessee Dialog
      ══════════════════════════════════════════════════════════ */}
      {formOpen && (
        <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {formDraft.lesseeId ? "Edit Lessee" : "New Lessee"}
            </h4>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setFormOpen(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>

          <div className="space-y-5 py-2">
            {/* Gen AI button */}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={fillWithAI} className="gap-1.5 text-purple-400 border-purple-500/40 hover:bg-purple-500/10">
                <Sparkles className="h-3.5 w-3.5" /> Gen AI Fill
              </Button>
            </div>

            {/* Row 1: Code, Name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Lessee Code <span className="text-red-400">*</span></Label>
                <Input placeholder="e.g. VF-QA-001" value={formDraft.lesseeCode}
                  onChange={e => setFormDraft(d => ({ ...d, lesseeCode: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Legal Name <span className="text-red-400">*</span></Label>
                <Input placeholder="Full legal entity name" value={formDraft.lesseeName}
                  onChange={e => setFormDraft(d => ({ ...d, lesseeName: e.target.value }))} />
              </div>
            </div>

            {/* Row 2: Trade Name, Entity Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Trade / Brand Name</Label>
                <Input placeholder="Operating name" value={formDraft.tradeName}
                  onChange={e => setFormDraft(d => ({ ...d, tradeName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Entity Type <span className="text-red-400">*</span></Label>
                <Select value={formDraft.entityType} onValueChange={v => setFormDraft(d => ({ ...d, entityType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Parent Company, Industry */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Parent Company</Label>
                <Input placeholder="e.g. Vodafone Group Plc" value={formDraft.parentCompany}
                  onChange={e => setFormDraft(d => ({ ...d, parentCompany: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Industry Sector</Label>
                <Input placeholder="e.g. Telecommunications" value={formDraft.industrySector}
                  onChange={e => setFormDraft(d => ({ ...d, industrySector: e.target.value }))} />
              </div>
            </div>

            {/* Row 4: Reg No, Tax/VAT, Credit Rating */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Registration No.</Label>
                <Input placeholder="CR-00034567" value={formDraft.registrationNo}
                  onChange={e => setFormDraft(d => ({ ...d, registrationNo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tax / VAT No.</Label>
                <Input placeholder="VAT-10023456789" value={formDraft.taxVatNo}
                  onChange={e => setFormDraft(d => ({ ...d, taxVatNo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Credit Rating</Label>
                <Input placeholder="e.g. AA, A+, BBB" value={formDraft.creditRating}
                  onChange={e => setFormDraft(d => ({ ...d, creditRating: e.target.value }))} />
              </div>
            </div>

            {/* Row 5: Country, City, PO Box */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Country <span className="text-red-400">*</span></Label>
                <Input placeholder="Qatar" value={formDraft.country}
                  onChange={e => setFormDraft(d => ({ ...d, country: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input placeholder="Doha" value={formDraft.city}
                  onChange={e => setFormDraft(d => ({ ...d, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>P.O. Box</Label>
                <Input placeholder="P.O. Box 24444" value={formDraft.poBox}
                  onChange={e => setFormDraft(d => ({ ...d, poBox: e.target.value }))} />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <Label>Registered Address</Label>
              <Textarea rows={2} placeholder="Full street address" value={formDraft.address}
                onChange={e => setFormDraft(d => ({ ...d, address: e.target.value }))} />
            </div>

            {/* Row 6: Contact Person, Email, Phone */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input placeholder="Full name" value={formDraft.contactPerson}
                  onChange={e => setFormDraft(d => ({ ...d, contactPerson: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Email</Label>
                <Input type="email" placeholder="name@company.com" value={formDraft.contactEmail}
                  onChange={e => setFormDraft(d => ({ ...d, contactEmail: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Phone</Label>
                <Input placeholder="+974 4444 0000" value={formDraft.contactPhone}
                  onChange={e => setFormDraft(d => ({ ...d, contactPhone: e.target.value }))} />
              </div>
            </div>

            {/* Row 7: Website, Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input placeholder="https://www.company.com" value={formDraft.website}
                  onChange={e => setFormDraft(d => ({ ...d, website: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Status <span className="text-red-400">*</span></Label>
                <Select value={formDraft.status} onValueChange={v => setFormDraft(d => ({ ...d, status: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Any additional notes…" value={formDraft.notes}
                onChange={e => setFormDraft(d => ({ ...d, notes: e.target.value }))} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitForm} disabled={upsertLessee.isPending}>
              {upsertLessee.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
              {formDraft.lesseeId ? "Save Changes" : "Create Lessee"}
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          Bank Account Dialog
      ══════════════════════════════════════════════════════════ */}
      {bankOpen && (
        <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">{bankDraft.bankAccountId ? "Edit Bank Account" : "Add Bank Account"}</h4>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setBankOpen(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Bank Name <span className="text-red-400">*</span></Label>
                <Input placeholder="Qatar National Bank" value={bankDraft.bankName}
                  onChange={e => setBankDraft(d => ({ ...d, bankName: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Account Name <span className="text-red-400">*</span></Label>
                <Input placeholder="Legal entity name on account" value={bankDraft.accountName}
                  onChange={e => setBankDraft(d => ({ ...d, accountName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Account Number <span className="text-red-400">*</span></Label>
                <Input placeholder="0012345678901" value={bankDraft.accountNumber}
                  onChange={e => setBankDraft(d => ({ ...d, accountNumber: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={bankDraft.currency} onValueChange={v => setBankDraft(d => ({ ...d, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>IBAN</Label>
                <Input placeholder="QA58QNBA000000012345678901" value={bankDraft.iban}
                  onChange={e => setBankDraft(d => ({ ...d, iban: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>SWIFT / BIC</Label>
                <Input placeholder="QNBAQAQA" value={bankDraft.swiftBic}
                  onChange={e => setBankDraft(d => ({ ...d, swiftBic: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Input placeholder="West Bay Branch" value={bankDraft.branch}
                  onChange={e => setBankDraft(d => ({ ...d, branch: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <input type="checkbox" id="isPrimary" checked={bankDraft.isPrimary}
                  onChange={e => setBankDraft(d => ({ ...d, isPrimary: e.target.checked }))} className="h-4 w-4" />
                <Label htmlFor="isPrimary" className="cursor-pointer">Set as primary account</Label>
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setBankOpen(false)}>Cancel</Button>
            <Button onClick={submitBank} disabled={upsertBank.isPending}>
              {upsertBank.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Account
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          Signatory Dialog
      ══════════════════════════════════════════════════════════ */}
      {sigOpen && (
        <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">{sigDraft.signatoryId ? "Edit Signatory" : "Add Signatory"}</h4>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSigOpen(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-red-400">*</span></Label>
              <Input placeholder="Sheikh Hamad Al-Thani" value={sigDraft.fullName}
                onChange={e => setSigDraft(d => ({ ...d, fullName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input placeholder="Chief Executive Officer" value={sigDraft.designation}
                onChange={e => setSigDraft(d => ({ ...d, designation: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" placeholder="ceo@company.com" value={sigDraft.email}
                  onChange={e => setSigDraft(d => ({ ...d, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input placeholder="+974 5555 0001" value={sigDraft.phone}
                  onChange={e => setSigDraft(d => ({ ...d, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Authority Limit (QAR)</Label>
              <Input type="number" placeholder="50000000" value={sigDraft.authorityLimit}
                onChange={e => setSigDraft(d => ({ ...d, authorityLimit: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={sigDraft.isActive}
                onChange={e => setSigDraft(d => ({ ...d, isActive: e.target.checked }))} className="h-4 w-4" />
              <Label htmlFor="isActive" className="cursor-pointer">Active signatory</Label>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setSigOpen(false)}>Cancel</Button>
            <Button onClick={submitSig} disabled={upsertSig.isPending}>
              {upsertSig.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Signatory
            </Button>
          </div>
        </div>
      )}

      {/* ── Delete Lessee Confirm ── */}
      {deleteId !== null && (
        <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">Deactivate Lessee?</h4>
            <p className="text-xs text-muted-foreground">
              This will set the lessee status to Inactive. Existing lease linkages are preserved. You can reactivate by editing the record.
            </p>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDeleteId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline">Cancel</Button>
            <Button className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId && deleteLessee.mutate({ lesseeId: deleteId })}>
              Deactivate
            </Button>
          </div>
        </div>
      )}

      {/* ── Delete Bank Account Confirm ── */}
      {deleteBankId !== null && (
        <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">Remove Bank Account?</h4>
            <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDeleteBankId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline">Cancel</Button>
            <Button className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteBankId && deleteBank.mutate({ bankAccountId: deleteBankId })}>
              Remove
            </Button>
          </div>
        </div>
      )}

      {/* ── Delete Signatory Confirm ── */}
      {deleteSigId !== null && (
        <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">Remove Signatory?</h4>
            <p className="text-xs text-muted-foreground">The signatory will be marked inactive.</p>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDeleteSigId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline">Cancel</Button>
            <Button className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteSigId && deleteSig.mutate({ signatoryId: deleteSigId })}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
