import { useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  FileText, Upload, Search, Eye, Trash2, Sparkles,
  Calendar, Shield, Globe, Building2, User, FileCheck,
  ChevronRight, Clock, RefreshCw, Tag, Layers, Lock, Archive, MapPin
} from "lucide-react";

const SCREEN_ID = "VFCDMS0001P001";

const DOC_TYPES = [
  "Lease Agreement","Addendum","Amendment","Renewal Notice",
  "Termination Notice","Handover Certificate","Inspection Report",
  "Insurance Certificate","Bank Guarantee","Security Deposit Receipt",
  "Correspondence","Legal Opinion","Valuation Report","Other"
];
const DOC_CATEGORIES = ["Legal","Financial","Operational","Compliance","Insurance","Technical"];
const CONFIDENTIALITY = ["Public","Internal","Confidential","Strictly Confidential"];
const LANGUAGES = [
  { code:"en", label:"English" },{ code:"ar", label:"Arabic" },
  { code:"fr", label:"French" },{ code:"de", label:"German" },
];
const STATUS_OPTIONS = ["Draft","Under Review","Approved","Executed","Superseded","Expired"];

const statusColor: Record<string,string> = {
  Draft:"bg-slate-500/20 text-slate-300",
  "Under Review":"bg-amber-500/20 text-amber-300",
  Approved:"bg-emerald-500/20 text-emerald-300",
  Executed:"bg-blue-500/20 text-blue-300",
  Superseded:"bg-orange-500/20 text-orange-300",
  Expired:"bg-red-500/20 text-red-300",
};
const confColor: Record<string,string> = {
  Public:"bg-emerald-500/20 text-emerald-300",
  Internal:"bg-blue-500/20 text-blue-300",
  Confidential:"bg-amber-500/20 text-amber-300",
  "Strictly Confidential":"bg-red-500/20 text-red-300",
};

function fmtKb(kb: number) {
  if (!kb) return "—";
  return kb < 1024 ? `${kb} KB` : `${(kb/1024).toFixed(1)} MB`;
}

interface UF {
  contractId:string; documentType:string; documentName:string;
  docCategory:string; docSubCategory:string; docStatus:string;
  effectiveDate:string; expiryDate:string; reviewDate:string; renewalDate:string;
  signatoryName:string; signatoryTitle:string; signatoryCompany:string;
  signedDate:string; notarisedDate:string;
  stampDutyAmount:string; stampDutyCurrency:string;
  languageCode:string; jurisdiction:string; confidentiality:string;
  hasOriginal:boolean; originalLocation:string;
  retentionYears:string; retentionPolicy:string;
  versionNotes:string; notes:string;
}
const def: UF = {
  contractId:"",documentType:"",documentName:"",
  docCategory:"",docSubCategory:"",docStatus:"Draft",
  effectiveDate:"",expiryDate:"",reviewDate:"",renewalDate:"",
  signatoryName:"",signatoryTitle:"",signatoryCompany:"",
  signedDate:"",notarisedDate:"",
  stampDutyAmount:"",stampDutyCurrency:"AED",
  languageCode:"en",jurisdiction:"",confidentiality:"Internal",
  hasOriginal:false,originalLocation:"",
  retentionYears:"",retentionPolicy:"",
  versionNotes:"",notes:"",
};

export default function ContractDocuments() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedDocId, setSelectedDocId] = useState<number|null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState<UF>(def);
  const [fileData, setFileData] = useState<{base64:string;name:string;size:number;mime:string}|null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<Record<string,any>|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({});
  const leases = (leasesData?.rows ?? []) as any[];
  const { data: docs, isLoading } = trpc.contractDms.listDocuments.useQuery(
    {
      contractId: form.contractId ? parseInt(form.contractId) : undefined,
      documentType: filterType !== "all" ? filterType : undefined,
      status: filterStatus !== "all" ? filterStatus : undefined
    },
    { keepPreviousData: true } as any
  );
  const { data: selectedDoc } = trpc.contractDms.getDocument.useQuery(
    { documentId: selectedDocId! }, { enabled: !!selectedDocId }
  );

  const uploadMut = trpc.contractDms.uploadDocument.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      utils.contractDms.listDocuments.invalidate();
      setShowUpload(false); setForm(def); setFileData(null); setExtractedData(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.contractDms.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success("Document deleted");
      utils.contractDms.listDocuments.invalidate();
      setSelectedDocId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const extractMut = trpc.contractDms.extractMetadata.useMutation({
    onSuccess: (data: any) => {
      setExtractedData(data.extracted);
      toast.success(`AI extraction complete (${data.confidence}% confidence)`);
      const ex = data.extracted;
      setForm(p => ({
        ...p,
        signatoryName: ex.signatory_name ?? p.signatoryName,
        signatoryTitle: ex.signatory_title ?? p.signatoryTitle,
        signatoryCompany: ex.signatory_company ?? p.signatoryCompany,
        signedDate: ex.signed_date ?? p.signedDate,
        effectiveDate: ex.commencement_date ?? p.effectiveDate,
        expiryDate: ex.expiry_date ?? p.expiryDate,
        jurisdiction: ex.jurisdiction ?? p.jurisdiction,
        languageCode: ex.language_code ?? p.languageCode,
        confidentiality: ex.confidentiality_level ?? p.confidentiality,
        retentionYears: ex.retention_years?.toString() ?? p.retentionYears,
        stampDutyAmount: ex.stamp_duty_amount?.toString() ?? p.stampDutyAmount,
        documentName: ex.contract_reference ?? p.documentName,
      }));
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(",")[1];
      setFileData({ base64: b64, name: file.name, size: Math.round(file.size/1024), mime: file.type });
      if (!form.documentName) setForm(p => ({ ...p, documentName: file.name.replace(/\.[^/.]+$/,"") }));
    };
    reader.readAsDataURL(file);
  };

  const handleExtract = () => {
    if (!fileData && !selectedDocId) { toast.error("Select a file or document first"); return; }
    setExtracting(true);
    extractMut.mutate(
      { documentId: selectedDocId ?? undefined, fileBase64: fileData?.base64, mimeType: fileData?.mime },
      { onSettled: () => setExtracting(false) }
    );
  };

  const handleUpload = () => {
    if (!form.contractId) { toast.error("Select a contract"); return; }
    if (!form.documentType) { toast.error("Select document type"); return; }
    if (!form.documentName) { toast.error("Enter document name"); return; }
    if (!fileData) { toast.error("Select a file to upload"); return; }
    setUploading(true);
    uploadMut.mutate({
      contractId: parseInt(form.contractId),
      documentType: form.documentType, documentName: form.documentName,
      fileBase64: fileData.base64, mimeType: fileData.mime, fileSizeKb: fileData.size,
      docCategory: form.docCategory||undefined, docSubCategory: form.docSubCategory||undefined,
      docStatus: form.docStatus,
      effectiveDate: form.effectiveDate||undefined, expiryDate: form.expiryDate||undefined,
      reviewDate: form.reviewDate||undefined, renewalDate: form.renewalDate||undefined,
      signatoryName: form.signatoryName||undefined, signatoryTitle: form.signatoryTitle||undefined,
      signatoryCompany: form.signatoryCompany||undefined,
      signedDate: form.signedDate||undefined, notarisedDate: form.notarisedDate||undefined,
      stampDutyAmount: form.stampDutyAmount ? parseFloat(form.stampDutyAmount) : undefined,
      stampDutyCurrency: form.stampDutyCurrency||undefined,
      languageCode: form.languageCode, jurisdiction: form.jurisdiction||undefined,
      confidentiality: form.confidentiality, hasOriginal: form.hasOriginal,
      originalLocation: form.originalLocation||undefined,
      retentionYears: form.retentionYears ? parseInt(form.retentionYears) : undefined,
      retentionPolicy: form.retentionPolicy||undefined,
      versionNotes: form.versionNotes||undefined, notes: form.notes||undefined,
    }, { onSettled: () => setUploading(false) });
  };

  const filtered = ((docs ?? []) as any[]).filter((d: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (d.document_name as string)?.toLowerCase().includes(s) ||
           (d.document_type as string)?.toLowerCase().includes(s) ||
           (d.contract_ref as string)?.toLowerCase().includes(s);
  });

  const f = (k: keyof UF, v: string|boolean) => setForm(p => ({ ...p, [k]: v }));

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <ScreenHeader
          screenId={SCREEN_ID} screenType="contract_documents"
          title="Contract Documents"
          subtitle="Upload, manage, and track all contract documents with full metadata and AI extraction"
          icon={<FileText className="w-5 h-5" />}
          actions={
            <Button size="sm" onClick={() => { setShowUpload(true); setSelectedDocId(null); }}>
              <Upload className="w-4 h-4 mr-2" /> Upload Document
            </Button>
          }
        />

        <div className="flex flex-1 overflow-hidden">
          {/* LEFT: Document List */}
          <div className={`flex flex-col border-r border-border transition-all duration-300 ${showUpload || selectedDocId ? "w-[42%]" : "w-full"}`}>
            <div className="flex gap-2 p-3 border-b border-border bg-muted/30">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search documents..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading documents...
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <FileText className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No documents found</p>
                  <p className="text-xs mt-1">Upload a document to get started</p>
                </div>
              ) : (
                filtered.map((doc: any) => (
                  <div
                    key={doc.document_id}
                    onClick={() => { setSelectedDocId(doc.document_id); setShowUpload(false); }}
                    className={`flex items-start gap-3 p-3 border-b border-border cursor-pointer hover:bg-muted/40 transition-colors ${selectedDocId === doc.document_id ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}
                  >
                    <div className="mt-0.5 p-1.5 rounded bg-muted"><FileText className="w-4 h-4 text-primary" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{doc.document_name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">v{doc.version_number}</Badge>
                        {doc.is_current && <Badge className="text-[10px] bg-emerald-500/20 text-emerald-300 shrink-0">Current</Badge>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">{doc.document_type}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{doc.contract_ref ?? `Contract #${doc.contract_id}`}</span>
                        {doc.doc_status && <Badge className={`text-[10px] ${statusColor[doc.doc_status] ?? "bg-slate-500/20 text-slate-300"}`}>{doc.doc_status}</Badge>}
                        {doc.confidentiality && <Badge className={`text-[10px] ${confColor[doc.confidentiality] ?? ""}`}><Lock className="w-2.5 h-2.5 mr-1" />{doc.confidentiality}</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                        {doc.file_size_kb && <span className="text-[10px] text-muted-foreground">{fmtKb(doc.file_size_kb)}</span>}
                        {doc.ai_extracted_at && <span className="text-[10px] text-emerald-400 flex items-center gap-1"><Sparkles className="w-2.5 h-2.5" /> AI</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT: Upload Panel */}
          {showUpload && (
            <div className="flex-1 overflow-y-auto bg-muted/20">
              <div className="p-4 border-b border-border flex items-center justify-between bg-background sticky top-0 z-10">
                <div>
                  <h3 className="font-semibold text-sm">Upload New Document</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Fill in all metadata fields for compliance tracking</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)}>✕</Button>
              </div>
              <div className="p-4 space-y-5">
                {/* File Drop Zone */}
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${fileData ? "border-emerald-500 bg-emerald-500/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                >
                  <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={handleFile} />
                  {fileData ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileCheck className="w-8 h-8 text-emerald-400" />
                      <p className="text-sm font-medium text-emerald-400">{fileData.name}</p>
                      <p className="text-xs text-muted-foreground">{fmtKb(fileData.size)} · {fileData.mime}</p>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleExtract(); }} disabled={extracting} className="mt-1">
                        {extracting ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-400" />}
                        {extracting ? "Extracting..." : "AI Extract Metadata"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <p className="text-sm font-medium">Click to select file</p>
                      <p className="text-xs text-muted-foreground">PDF, Word, Excel, Images (max 16MB)</p>
                    </div>
                  )}
                </div>

                {extractedData && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-semibold text-amber-300">AI Extracted — Fields auto-filled below</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {Object.entries(extractedData).slice(0,8).map(([k,v]) => (
                        <div key={k} className="flex gap-1">
                          <span className="text-muted-foreground capitalize">{k.replace(/_/g," ")}:</span>
                          <span className="text-foreground truncate">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Core Information */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"><FileText className="w-3.5 h-3.5" /> Core Information</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs">Contract *</Label>
                      <Select value={form.contractId} onValueChange={v => f("contractId",v)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select contract..." /></SelectTrigger>
                        <SelectContent>
                          {(leases ?? []).map((l: any) => (
                            <SelectItem key={l.contract_id} value={String(l.contract_id)}>
                              {l.contract_ref} — {l.asset_description ?? l.asset_type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Document Type *</Label>
                      <Select value={form.documentType} onValueChange={v => f("documentType",v)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
                        <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value={form.docStatus} onValueChange={v => f("docStatus",v)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Document Name *</Label>
                      <Input value={form.documentName} onChange={e => f("documentName",e.target.value)} className="h-8 text-xs mt-1" placeholder="e.g. Office Lease Agreement 2024" />
                    </div>
                    <div>
                      <Label className="text-xs">Category</Label>
                      <Select value={form.docCategory} onValueChange={v => f("docCategory",v)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>{DOC_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Sub-Category</Label>
                      <Input value={form.docSubCategory} onChange={e => f("docSubCategory",e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                  </div>
                </div>
                <Separator />

                {/* Key Dates */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"><Calendar className="w-3.5 h-3.5" /> Key Dates</div>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      ["effectiveDate","Effective Date"],["expiryDate","Expiry Date"],
                      ["reviewDate","Review Date"],["renewalDate","Renewal Date"],
                      ["signedDate","Signed Date"],["notarisedDate","Notarised Date"]
                    ] as [keyof UF, string][]).map(([k,lbl]) => (
                      <div key={k}>
                        <Label className="text-xs">{lbl}</Label>
                        <Input type="date" value={form[k] as string} onChange={e => f(k,e.target.value)} className="h-8 text-xs mt-1" />
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />

                {/* Signatory */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"><User className="w-3.5 h-3.5" /> Signatory Details</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Signatory Name</Label><Input value={form.signatoryName} onChange={e => f("signatoryName",e.target.value)} className="h-8 text-xs mt-1" /></div>
                    <div><Label className="text-xs">Title / Position</Label><Input value={form.signatoryTitle} onChange={e => f("signatoryTitle",e.target.value)} className="h-8 text-xs mt-1" /></div>
                    <div className="col-span-2"><Label className="text-xs">Company</Label><Input value={form.signatoryCompany} onChange={e => f("signatoryCompany",e.target.value)} className="h-8 text-xs mt-1" /></div>
                  </div>
                </div>
                <Separator />

                {/* Financial & Legal */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"><Building2 className="w-3.5 h-3.5" /> Financial &amp; Legal</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Stamp Duty Amount</Label><Input type="number" value={form.stampDutyAmount} onChange={e => f("stampDutyAmount",e.target.value)} className="h-8 text-xs mt-1" /></div>
                    <div><Label className="text-xs">Currency</Label><Input value={form.stampDutyCurrency} onChange={e => f("stampDutyCurrency",e.target.value)} className="h-8 text-xs mt-1" /></div>
                    <div><Label className="text-xs">Jurisdiction</Label><Input value={form.jurisdiction} onChange={e => f("jurisdiction",e.target.value)} className="h-8 text-xs mt-1" placeholder="e.g. Qatar" /></div>
                    <div>
                      <Label className="text-xs">Language</Label>
                      <Select value={form.languageCode} onValueChange={v => f("languageCode",v)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <Separator />

                {/* Compliance & Retention */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"><Shield className="w-3.5 h-3.5" /> Compliance &amp; Retention</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Confidentiality</Label>
                      <Select value={form.confidentiality} onValueChange={v => f("confidentiality",v)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{CONFIDENTIALITY.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">Retention (Years)</Label><Input type="number" value={form.retentionYears} onChange={e => f("retentionYears",e.target.value)} className="h-8 text-xs mt-1" /></div>
                    <div className="col-span-2"><Label className="text-xs">Retention Policy</Label><Input value={form.retentionPolicy} onChange={e => f("retentionPolicy",e.target.value)} className="h-8 text-xs mt-1" /></div>
                    <div className="col-span-2 flex items-center gap-2">
                      <input type="checkbox" id="hasOrig" checked={form.hasOriginal} onChange={e => f("hasOriginal",e.target.checked)} className="rounded" />
                      <Label htmlFor="hasOrig" className="text-xs cursor-pointer">Physical original document exists</Label>
                    </div>
                    {form.hasOriginal && (
                      <div className="col-span-2"><Label className="text-xs">Original Location</Label><Input value={form.originalLocation} onChange={e => f("originalLocation",e.target.value)} className="h-8 text-xs mt-1" /></div>
                    )}
                  </div>
                </div>
                <Separator />

                <div>
                  <Label className="text-xs">Version Notes</Label>
                  <Textarea value={form.versionNotes} onChange={e => f("versionNotes",e.target.value)} className="text-xs mt-1 h-16 resize-none" placeholder="What changed in this version?" />
                </div>
                <div>
                  <Label className="text-xs">Internal Notes</Label>
                  <Textarea value={form.notes} onChange={e => f("notes",e.target.value)} className="text-xs mt-1 h-16 resize-none" />
                </div>
                <Button className="w-full" onClick={handleUpload} disabled={uploading || !fileData}>
                  {uploading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {uploading ? "Uploading..." : "Upload Document"}
                </Button>
              </div>
            </div>
          )}

          {/* RIGHT: Document Detail Panel */}
          {!showUpload && selectedDocId && selectedDoc && (
            <div className="flex-1 overflow-y-auto bg-muted/20">
              <div className="p-4 border-b border-border flex items-center justify-between bg-background sticky top-0 z-10">
                <div>
                  <h3 className="font-semibold text-sm">{(selectedDoc as any).document_name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(selectedDoc as any).document_type} · v{(selectedDoc as any).version_number} · {(selectedDoc as any).contract_ref ?? `Contract #${(selectedDoc as any).contract_id}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleExtract} disabled={extracting}>
                    {extracting ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-400" />}
                    {extracting ? "Extracting..." : "AI Extract"}
                  </Button>
                  {(selectedDoc as any).storage_url && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={(selectedDoc as any).storage_url} target="_blank" rel="noreferrer"><Eye className="w-3.5 h-3.5 mr-1" /> View</a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-red-400 hover:text-red-300"
                    onClick={() => deleteMut.mutate({ documentId: selectedDocId })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDocId(null)}>✕</Button>
                </div>
              </div>
              <Tabs defaultValue="metadata" className="p-4">
                <TabsList className="h-8 text-xs mb-4">
                  <TabsTrigger value="metadata" className="text-xs">Metadata</TabsTrigger>
                  <TabsTrigger value="dates" className="text-xs">Dates</TabsTrigger>
                  <TabsTrigger value="signatory" className="text-xs">Signatory</TabsTrigger>
                  <TabsTrigger value="compliance" className="text-xs">Compliance</TabsTrigger>
                  {(selectedDoc as any).ai_extracted_data && <TabsTrigger value="ai" className="text-xs">AI Data</TabsTrigger>}
                </TabsList>
                <TabsContent value="metadata" className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label:"Document Type", value:(selectedDoc as any).document_type, icon:<Tag className="w-3.5 h-3.5" /> },
                      { label:"Status", value:(selectedDoc as any).doc_status, icon:<FileCheck className="w-3.5 h-3.5" /> },
                      { label:"Category", value:(selectedDoc as any).doc_category, icon:<Layers className="w-3.5 h-3.5" /> },
                      { label:"Sub-Category", value:(selectedDoc as any).doc_sub_category, icon:<Layers className="w-3.5 h-3.5" /> },
                      { label:"File Size", value:fmtKb((selectedDoc as any).file_size_kb), icon:<FileText className="w-3.5 h-3.5" /> },
                      { label:"MIME Type", value:(selectedDoc as any).mime_type, icon:<FileText className="w-3.5 h-3.5" /> },
                      { label:"Version", value:`v${(selectedDoc as any).version_number}`, icon:<Archive className="w-3.5 h-3.5" /> },
                      { label:"Uploaded", value:new Date((selectedDoc as any).uploaded_at).toLocaleDateString(), icon:<Clock className="w-3.5 h-3.5" /> },
                    ].map(({label,value,icon}) => (
                      <div key={label} className="rounded-lg bg-muted/40 p-2.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">{icon} {label}</div>
                        <div className="text-xs font-medium">{value ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                  {(selectedDoc as any).version_notes && <div className="rounded-lg bg-muted/40 p-2.5"><div className="text-[10px] text-muted-foreground mb-1">Version Notes</div><div className="text-xs">{(selectedDoc as any).version_notes}</div></div>}
                  {(selectedDoc as any).notes && <div className="rounded-lg bg-muted/40 p-2.5"><div className="text-[10px] text-muted-foreground mb-1">Internal Notes</div><div className="text-xs">{(selectedDoc as any).notes}</div></div>}
                </TabsContent>
                <TabsContent value="dates" className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {[["effective_date","Effective Date"],["expiry_date","Expiry Date"],["review_date","Review Date"],["renewal_date","Renewal Date"],["signed_date","Signed Date"],["notarised_date","Notarised Date"]].map(([k,lbl]) => (
                      <div key={k} className="rounded-lg bg-muted/40 p-2.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1"><Calendar className="w-3.5 h-3.5" /> {lbl}</div>
                        <div className="text-xs font-medium">{(selectedDoc as any)[k] ? new Date((selectedDoc as any)[k]).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "—"}</div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="signatory" className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label:"Signatory Name", key:"signatory_name", icon:<User className="w-3.5 h-3.5" /> },
                      { label:"Title / Position", key:"signatory_title", icon:<User className="w-3.5 h-3.5" /> },
                      { label:"Company", key:"signatory_company", icon:<Building2 className="w-3.5 h-3.5" /> },
                    ].map(({label,key,icon}) => (
                      <div key={key} className="rounded-lg bg-muted/40 p-2.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">{icon} {label}</div>
                        <div className="text-xs font-medium">{(selectedDoc as any)[key] ?? "—"}</div>
                      </div>
                    ))}
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1"><FileCheck className="w-3.5 h-3.5" /> Stamp Duty</div>
                      <div className="text-xs font-medium">{(selectedDoc as any).stamp_duty_amount ? `${(selectedDoc as any).stamp_duty_currency} ${Number((selectedDoc as any).stamp_duty_amount).toLocaleString()}` : "—"}</div>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="compliance" className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label:"Confidentiality", key:"confidentiality", icon:<Lock className="w-3.5 h-3.5" /> },
                      { label:"Jurisdiction", key:"jurisdiction", icon:<Globe className="w-3.5 h-3.5" /> },
                      { label:"Language", key:"language_code", icon:<Globe className="w-3.5 h-3.5" /> },
                      { label:"Retention (Years)", key:"retention_years", icon:<Archive className="w-3.5 h-3.5" /> },
                      { label:"Retention Policy", key:"retention_policy", icon:<Shield className="w-3.5 h-3.5" /> },
                      { label:"Physical Original", key:"has_original", icon:<FileCheck className="w-3.5 h-3.5" /> },
                    ].map(({label,key,icon}) => (
                      <div key={key} className="rounded-lg bg-muted/40 p-2.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">{icon} {label}</div>
                        <div className="text-xs font-medium">{key === "has_original" ? ((selectedDoc as any)[key] ? "Yes" : "No") : ((selectedDoc as any)[key] ?? "—")}</div>
                      </div>
                    ))}
                  </div>
                  {(selectedDoc as any).original_location && (
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1"><MapPin className="w-3.5 h-3.5" /> Original Location</div>
                      <div className="text-xs font-medium">{(selectedDoc as any).original_location}</div>
                    </div>
                  )}
                </TabsContent>
                {(selectedDoc as any).ai_extracted_data && (
                  <TabsContent value="ai" className="space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-semibold text-amber-300">AI Extracted Data</span>
                      {(selectedDoc as any).ai_confidence_score && (
                        <Badge className="text-[10px] bg-amber-500/20 text-amber-300">{Number((selectedDoc as any).ai_confidence_score).toFixed(0)}% confidence</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(JSON.parse((selectedDoc as any).ai_extracted_data || "{}")).map(([k,v]) => (
                        <div key={k} className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2.5">
                          <div className="text-[10px] text-amber-300/70 mb-0.5 capitalize">{k.replace(/_/g," ")}</div>
                          <div className="text-xs font-medium truncate">{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
