import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GenAIFillButton } from "@/components/GenAIFillButton";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Building2, Plus, Search, Phone, Mail, CreditCard,
  FileText, MapPin, ArrowLeft, Pencil, Trash2, Eye,
  User2, Briefcase, GraduationCap, IdCard, Hash, Building,
  CheckCircle2, XCircle, Sparkles, Save, UserCheck,
} from "lucide-react";

const LESSEE_TYPES = ["Staff", "Client", "Other"];
const EMPTY_LESSEE_FORM = {
  lesseeType: "Staff" as "Staff" | "Client" | "Other",
  lesseeName: "",
  staffNumber: "",
  grade: "",
  position: "",
  placeOfWork: "",
  lesseeDepartment: "",
  employeeId: "",
  lesseeContactEmail: "",
  lesseeContactPhone: "",
};

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-500/20 text-green-400 border-green-500/30",
  Inactive: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  Blacklisted: "bg-red-500/20 text-red-400 border-red-500/30",
};
const LESSOR_TYPES = ["Corporate", "Subsidiary", "Parent", "Joint Venture", "Branch"];
const CONTACT_TYPES = ["Primary", "Finance", "Legal", "Operations", "Emergency"];
const NOTE_TYPES = ["General", "Legal", "Financial", "Dispute", "Negotiation"];
const ACCOUNT_TYPES = ["Current", "Savings", "Fixed"];

type ViewMode = "list" | "detail" | "form_lessor" | "form_contact" | "form_bank" | "form_note";

const EMPTY_FORM = { lessorName: "", lessorType: "Company", registrationNo: "", taxId: "", country: "QA", city: "", addressLine1: "", addressLine2: "", postalCode: "", website: "", creditRating: "", paymentTerms: 30, preferredCurrency: "QAR", status: "Active", blacklistReason: "", registrationDate: "", contractStartDate: "", contractEndDate: "" };
const EMPTY_CONTACT = { contactType: "Primary", fullName: "", jobTitle: "", department: "", email: "", phonePrimary: "", phoneSecondary: "", whatsapp: "", isPrimary: false, notes: "" };
const EMPTY_BANK = { bankName: "", accountName: "", accountNumber: "", iban: "", swiftCode: "", currency: "QAR", accountType: "Current", branchName: "", country: "QA", verifiedBy: "" };
const EMPTY_NOTE = { noteType: "General", subject: "", noteText: "", isPrivate: false };

export default function LessorMaster() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedLessorId, setSelectedLessorId] = useState<number | null>(null);
  const [editingLessor, setEditingLessor] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [bankForm, setBankForm] = useState(EMPTY_BANK);
  const [noteForm, setNoteForm] = useState(EMPTY_NOTE);
  const [showSample, setShowSample] = useState(false);
  const [lesseeForm, setLesseeForm] = useState(EMPTY_LESSEE_FORM);
  const [editingLessee, setEditingLessee] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const listQuery = trpc.lessor.getLessors.useQuery({
    searchTerm: search || undefined,
    status: statusFilter !== "all" ? (statusFilter as "Active" | "Inactive" | "Blacklisted") : undefined,
    lessorType: typeFilter !== "all" ? typeFilter : undefined,
    pageNumber: page,
    pageSize: 20,
  });
  const detailQuery = trpc.lessor.getLessorDetail.useQuery(
    { lessorId: selectedLessorId! },
    { enabled: !!selectedLessorId }
  );

  const utils = trpc.useUtils();
  const upsertMutation = trpc.lessor.upsertLessor.useMutation({
    onSuccess: () => {
      toast.success(editingLessor ? "Lessor updated" : "Lessor created");
      setViewMode(editingLessor ? "detail" : "list");
      setEditingLessor(null);
      utils.lessor.getLessors.invalidate();
      if (selectedLessorId) utils.lessor.getLessorDetail.invalidate({ lessorId: selectedLessorId });
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.lessor.deleteLessor.useMutation({
    onSuccess: () => {
      toast.success("Lessor deleted");
      setSelectedLessorId(null);
      setViewMode("list");
      utils.lessor.getLessors.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const contactMutation = trpc.lessor.upsertContact.useMutation({
    onSuccess: () => {
      toast.success("Contact saved");
      setViewMode("detail");
      if (selectedLessorId) utils.lessor.getLessorDetail.invalidate({ lessorId: selectedLessorId });
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteContactMutation = trpc.lessor.deleteContact.useMutation({
    onSuccess: () => {
      toast.success("Contact removed");
      if (selectedLessorId) utils.lessor.getLessorDetail.invalidate({ lessorId: selectedLessorId });
    },
  });
  const bankMutation = trpc.lessor.upsertBankAccount.useMutation({
    onSuccess: () => {
      toast.success("Bank account saved");
      setViewMode("detail");
      if (selectedLessorId) utils.lessor.getLessorDetail.invalidate({ lessorId: selectedLessorId });
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteBankMutation = trpc.lessor.deleteBankAccount.useMutation({
    onSuccess: () => {
      toast.success("Bank account removed");
      if (selectedLessorId) utils.lessor.getLessorDetail.invalidate({ lessorId: selectedLessorId });
    },
  });
  const noteMutation = trpc.lessor.addNote.useMutation({
    onSuccess: () => {
      toast.success("Note added");
      setViewMode("detail");
      if (selectedLessorId) utils.lessor.getLessorDetail.invalidate({ lessorId: selectedLessorId });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleLesseeFormFill = (lessor: any) => {
    setLesseeForm({
      lesseeType: (lessor.lessee_type as "Staff" | "Client" | "Other") ?? "Staff",
      lesseeName: String(lessor.lessee_name ?? ""),
      staffNumber: String(lessor.staff_number ?? ""),
      grade: String(lessor.grade ?? ""),
      position: String(lessor.position ?? ""),
      placeOfWork: String(lessor.place_of_work ?? ""),
      lesseeDepartment: String(lessor.department ?? ""),
      employeeId: String(lessor.employee_id ?? ""),
      lesseeContactEmail: String(lessor.lessee_contact_email ?? ""),
      lesseeContactPhone: String(lessor.lessee_contact_phone ?? ""),
    });
    setEditingLessee(true);
  };

  const handleLesseeAIFill = (data: Record<string, string>) => {
    setLesseeForm(f => ({
      ...f,
      lesseeType: (data.lessee_type ?? data.lesseeType ?? f.lesseeType) as "Staff" | "Client" | "Other",
      lesseeName: data.lessee_name ?? data.lesseeName ?? f.lesseeName,
      staffNumber: data.staff_number ?? data.staffNumber ?? f.staffNumber,
      grade: data.grade ?? f.grade,
      position: data.position ?? f.position,
      placeOfWork: data.place_of_work ?? data.placeOfWork ?? f.placeOfWork,
      lesseeDepartment: data.department ?? data.lesseeDepartment ?? f.lesseeDepartment,
      employeeId: data.employee_id ?? data.employeeId ?? f.employeeId,
      lesseeContactEmail: data.lessee_contact_email ?? data.lesseeContactEmail ?? f.lesseeContactEmail,
      lesseeContactPhone: data.lessee_contact_phone ?? data.lesseeContactPhone ?? f.lesseeContactPhone,
    }));
  };

  const handleAIFormFill = (data: Record<string, string>) => {
    setForm(f => ({
      ...f,
      lessorName: data.lessor_name ?? data.lessorName ?? f.lessorName,
      lessorType: data.lessor_type ?? data.lessorType ?? f.lessorType,
      registrationNo: data.registration_no ?? data.registrationNo ?? f.registrationNo,
      taxId: data.tax_id ?? data.taxId ?? f.taxId,
      country: data.country ?? f.country,
      city: data.city ?? f.city,
      addressLine1: data.address_line1 ?? data.addressLine1 ?? f.addressLine1,
      addressLine2: data.address_line2 ?? data.addressLine2 ?? f.addressLine2,
      postalCode: data.postal_code ?? data.postalCode ?? f.postalCode,
      website: data.website ?? f.website,
      creditRating: data.credit_rating ?? data.creditRating ?? f.creditRating,
      paymentTerms: data.paymentTerms ? Number(data.paymentTerms) : f.paymentTerms,
      preferredCurrency: data.preferred_currency ?? data.preferredCurrency ?? f.preferredCurrency,
      status: data.status ?? f.status,
    }));
  };

  const lessors: any[] = (listQuery.data as any)?.lessors ?? listQuery.data ?? [];
  const total: number = (listQuery.data as any)?.total ?? lessors.length;
  const detail: any = detailQuery.data;

  // ─── FORM: Lessor ──────────────────────────────────────────────────────────
  if (viewMode === "form_lessor") {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#13161f] shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white"
                onClick={() => { setViewMode(editingLessor ? "detail" : "list"); setEditingLessor(null); }}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-semibold text-white">{editingLessor ? "Edit Lessor" : "New Lessor"}</h2>
                <p className="text-xs text-gray-500">Fill in lessor details. Use Gen AI to auto-fill.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ScreenHeader screenId="VFLSLESSOR001" screenType="lessor_master" title="" formType="lessor" onAIFormFill={handleAIFormFill} />
              <Button variant="outline" className="border-white/10 text-gray-400"
                onClick={() => { setViewMode(editingLessor ? "detail" : "list"); setEditingLessor(null); }}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={upsertMutation.isPending}
                onClick={() => upsertMutation.mutate({
                  ...(editingLessor ? { lessorId: Number(editingLessor.lessor_id) } : {}),
                  lessorName: form.lessorName,
                  lessorType: form.lessorType as "Individual" | "Company" | "Government" | "REIT" | "Trust",
                  registrationNo: form.registrationNo || undefined,
                  taxId: form.taxId || undefined,
                  country: form.country,
                  city: form.city || undefined,
                  addressLine1: form.addressLine1 || undefined,
                  addressLine2: form.addressLine2 || undefined,
                  postalCode: form.postalCode || undefined,
                  website: form.website || undefined,
                  creditRating: form.creditRating || undefined,
                  paymentTerms: form.paymentTerms,
                  preferredCurrency: form.preferredCurrency,
                  status: form.status as "Active" | "Inactive" | "Blacklisted",
                  blacklistReason: form.blacklistReason || undefined,
                })}>
                {upsertMutation.isPending ? "Saving..." : "Save Lessor"}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-3xl mx-auto grid grid-cols-2 gap-5">
              <div className="col-span-2">
                <Label className="text-xs text-gray-400">Lessor Name *</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.lessorName} onChange={e => setForm(f => ({ ...f, lessorName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Type</Label>
                <Select value={form.lessorType} onValueChange={v => setForm(f => ({ ...f, lessorType: v }))}>
                  <SelectTrigger className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#1a1d2e] border-white/10 text-gray-200">
                    {LESSOR_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#1a1d2e] border-white/10 text-gray-200">
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Blacklisted">Blacklisted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400">Registration No</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.registrationNo} onChange={e => setForm(f => ({ ...f, registrationNo: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Tax ID</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Country (2-letter)</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" maxLength={2} value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">City</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-400">Address Line 1</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.addressLine1} onChange={e => setForm(f => ({ ...f, addressLine1: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-400">Address Line 2</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.addressLine2} onChange={e => setForm(f => ({ ...f, addressLine2: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Postal Code</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.postalCode} onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Website</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Credit Rating</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.creditRating} onChange={e => setForm(f => ({ ...f, creditRating: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Payment Terms (days)</Label>
                <Input type="number" className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: Number(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Preferred Currency</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.preferredCurrency} onChange={e => setForm(f => ({ ...f, preferredCurrency: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Registration Date</Label>
                <Input type="date" className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.registrationDate} onChange={e => setForm(f => ({ ...f, registrationDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Contract Start Date</Label>
                <Input type="date" className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.contractStartDate} onChange={e => setForm(f => ({ ...f, contractStartDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Contract End Date</Label>
                <Input type="date" className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={form.contractEndDate} onChange={e => setForm(f => ({ ...f, contractEndDate: e.target.value }))} />
              </div>
              {form.status === "Blacklisted" && (
                <div className="col-span-2">
                  <Label className="text-xs text-gray-400">Blacklist Reason</Label>
                  <Textarea className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" rows={2} value={form.blacklistReason} onChange={e => setForm(f => ({ ...f, blacklistReason: e.target.value }))} />
                </div>
              )}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── FORM: Contact ─────────────────────────────────────────────────────────
  if (viewMode === "form_contact") {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#13161f] shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white" onClick={() => setViewMode("detail")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-semibold text-white">Add Contact</h2>
                <p className="text-xs text-gray-500">Add a contact person for this lessor</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GenAIFillButton formType="lessor_contact" onFill={(data) => setContactForm(f => ({
                ...f,
                fullName: data.fullName ? String(data.fullName) : f.fullName,
                jobTitle: data.jobTitle ? String(data.jobTitle) : f.jobTitle,
                department: data.department ? String(data.department) : f.department,
                email: data.email ? String(data.email) : f.email,
                phonePrimary: data.phonePrimary ? String(data.phonePrimary) : f.phonePrimary,
              }))} />
              <Button variant="outline" className="border-white/10 text-gray-400" onClick={() => setViewMode("detail")}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={contactMutation.isPending}
                onClick={() => contactMutation.mutate({
                  lessorId: selectedLessorId!,
                  contactType: contactForm.contactType as "Primary" | "Finance" | "Legal" | "Operations" | "Emergency",
                  fullName: contactForm.fullName,
                  jobTitle: contactForm.jobTitle || undefined,
                  department: contactForm.department || undefined,
                  email: contactForm.email || undefined,
                  phonePrimary: contactForm.phonePrimary || undefined,
                  phoneSecondary: contactForm.phoneSecondary || undefined,
                  whatsapp: contactForm.whatsapp || undefined,
                  isPrimary: contactForm.isPrimary,
                  notes: contactForm.notes || undefined,
                })}>
                {contactMutation.isPending ? "Saving..." : "Save Contact"}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-2xl mx-auto grid grid-cols-2 gap-5">
              <div>
                <Label className="text-xs text-gray-400">Contact Type</Label>
                <Select value={contactForm.contactType} onValueChange={v => setContactForm(f => ({ ...f, contactType: v }))}>
                  <SelectTrigger className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#1a1d2e] border-white/10 text-gray-200">
                    {CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400">Full Name *</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={contactForm.fullName} onChange={e => setContactForm(f => ({ ...f, fullName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Job Title</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={contactForm.jobTitle} onChange={e => setContactForm(f => ({ ...f, jobTitle: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Department</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={contactForm.department} onChange={e => setContactForm(f => ({ ...f, department: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Email</Label>
                <Input type="email" className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Phone Primary</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={contactForm.phonePrimary} onChange={e => setContactForm(f => ({ ...f, phonePrimary: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Phone Secondary</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={contactForm.phoneSecondary} onChange={e => setContactForm(f => ({ ...f, phoneSecondary: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">WhatsApp</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={contactForm.whatsapp} onChange={e => setContactForm(f => ({ ...f, whatsapp: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-400">Notes</Label>
                <Textarea className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" rows={3} value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── FORM: Bank Account ────────────────────────────────────────────────────
  if (viewMode === "form_bank") {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#13161f] shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white" onClick={() => setViewMode("detail")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-semibold text-white">Add Bank Account</h2>
                <p className="text-xs text-gray-500">Add a bank account for this lessor</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GenAIFillButton formType="lessor_bank" onFill={(data) => setBankForm(f => ({
                ...f,
                bankName: data.bankName ? String(data.bankName) : f.bankName,
                accountName: data.accountName ? String(data.accountName) : f.accountName,
                accountNumber: data.accountNumber ? String(data.accountNumber) : f.accountNumber,
                iban: data.iban ? String(data.iban) : f.iban,
                swiftCode: data.swiftCode ? String(data.swiftCode) : f.swiftCode,
                currency: data.currency ? String(data.currency) : f.currency,
              }))} />
              <Button variant="outline" className="border-white/10 text-gray-400" onClick={() => setViewMode("detail")}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={bankMutation.isPending}
                onClick={() => bankMutation.mutate({
                  lessorId: selectedLessorId!,
                  bankName: bankForm.bankName,
                  accountName: bankForm.accountName,
                  accountNumber: bankForm.accountNumber,
                  iban: bankForm.iban || undefined,
                  swiftCode: bankForm.swiftCode || undefined,
                  currency: bankForm.currency,
                  accountType: bankForm.accountType as "Current" | "Savings" | "Fixed",
                  branchName: bankForm.branchName || undefined,
                  country: bankForm.country,
                  verifiedBy: bankForm.verifiedBy || undefined,
                })}>
                {bankMutation.isPending ? "Saving..." : "Save Bank Account"}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-2xl mx-auto grid grid-cols-2 gap-5">
              <div>
                <Label className="text-xs text-gray-400">Bank Name *</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={bankForm.bankName} onChange={e => setBankForm(f => ({ ...f, bankName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Account Name *</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={bankForm.accountName} onChange={e => setBankForm(f => ({ ...f, accountName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Account Number *</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={bankForm.accountNumber} onChange={e => setBankForm(f => ({ ...f, accountNumber: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">IBAN</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={bankForm.iban} onChange={e => setBankForm(f => ({ ...f, iban: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">SWIFT Code</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={bankForm.swiftCode} onChange={e => setBankForm(f => ({ ...f, swiftCode: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Currency</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={bankForm.currency} onChange={e => setBankForm(f => ({ ...f, currency: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Account Type</Label>
                <Select value={bankForm.accountType} onValueChange={v => setBankForm(f => ({ ...f, accountType: v }))}>
                  <SelectTrigger className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#1a1d2e] border-white/10 text-gray-200">
                    {ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400">Branch Name</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={bankForm.branchName} onChange={e => setBankForm(f => ({ ...f, branchName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Country (2-letter)</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" maxLength={2} value={bankForm.country} onChange={e => setBankForm(f => ({ ...f, country: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Verified By</Label>
                <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={bankForm.verifiedBy} onChange={e => setBankForm(f => ({ ...f, verifiedBy: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── FORM: Note ────────────────────────────────────────────────────────────
  if (viewMode === "form_note") {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#13161f] shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white" onClick={() => setViewMode("detail")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-semibold text-white">Add Note</h2>
                <p className="text-xs text-gray-500">Add a note or comment about this lessor</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GenAIFillButton formType="lessor_note" onFill={(data) => setNoteForm(f => ({
                ...f,
                subject: data.subject ? String(data.subject) : f.subject,
                noteText: data.noteText ? String(data.noteText) : f.noteText,
              }))} />
              <Button variant="outline" className="border-white/10 text-gray-400" onClick={() => setViewMode("detail")}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={noteMutation.isPending}
                onClick={() => noteMutation.mutate({
                  lessorId: selectedLessorId!,
                  noteType: noteForm.noteType as "General" | "Legal" | "Financial" | "Dispute" | "Negotiation",
                  subject: noteForm.subject,
                  noteText: noteForm.noteText,
                  isPrivate: noteForm.isPrivate,
                })}>
                {noteMutation.isPending ? "Saving..." : "Save Note"}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <Label className="text-xs text-gray-400">Note Type</Label>
                  <Select value={noteForm.noteType} onValueChange={v => setNoteForm(f => ({ ...f, noteType: v }))}>
                    <SelectTrigger className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#1a1d2e] border-white/10 text-gray-200">
                      {NOTE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Subject *</Label>
                  <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" value={noteForm.subject} onChange={e => setNoteForm(f => ({ ...f, subject: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-400">Note *</Label>
                <Textarea className="bg-[#1a1d2e] border-white/10 text-gray-200 mt-1" rows={10} value={noteForm.noteText} onChange={e => setNoteForm(f => ({ ...f, noteText: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── DETAIL VIEW ───────────────────────────────────────────────────────────
  if (viewMode === "detail" && selectedLessorId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#13161f] shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white" onClick={() => setViewMode("list")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-semibold text-white">{String(detail?.lessor?.lessor_name ?? "Lessor Detail")}</h2>
                <p className="text-xs text-gray-500">{String(detail?.lessor?.lessor_type ?? "")} · {String(detail?.lessor?.country ?? "")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="border-white/10 text-gray-300 h-8 text-xs"
                onClick={() => {
                  const l = detail?.lessor;
                  if (!l) return;
                  setEditingLessor(l);
                  setForm({
                    lessorName: String(l.lessor_name ?? ""), lessorType: String(l.lessor_type ?? "Company"),
                    registrationNo: String(l.registration_no ?? ""), taxId: String(l.tax_id ?? ""),
                    country: String(l.country ?? "QA"), city: String(l.city ?? ""),
                    addressLine1: String(l.address_line1 ?? ""), addressLine2: String(l.address_line2 ?? ""),
                    postalCode: String(l.postal_code ?? ""), website: String(l.website ?? ""),
                    creditRating: String(l.credit_rating ?? ""), paymentTerms: Number(l.payment_terms ?? 30),
                    preferredCurrency: String(l.preferred_currency ?? "QAR"), status: String(l.status ?? "Active"),
                    blacklistReason: String(l.blacklist_reason ?? ""),
                    registrationDate: String(l.registration_date ?? ""), contractStartDate: String(l.contract_start_date ?? ""), contractEndDate: String(l.contract_end_date ?? ""),
                  });
                  setViewMode("form_lessor");
                }}>
                <Pencil className="w-3 h-3 mr-1" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 h-8 text-xs hover:bg-red-500/10"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  toast("Delete this lessor?", {
                    action: { label: "Delete", onClick: () => deleteMutation.mutate({ lessorId: selectedLessorId }) },
                  });
                }}>
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {detailQuery.isLoading ? (
              <div className="flex items-center justify-center h-32 text-gray-500">Loading...</div>
            ) : !detail ? (
              <div className="flex items-center justify-center h-32 text-gray-500">Lessor not found</div>
            ) : (
              <Tabs defaultValue="overview">
                <TabsList className="bg-[#1a1d2e] border border-white/10 mb-4">
                  <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="lessee" className="text-xs">Lessee</TabsTrigger>
                  <TabsTrigger value="contacts" className="text-xs">Contacts</TabsTrigger>
                  <TabsTrigger value="bank" className="text-xs">Bank Accounts</TabsTrigger>
                  <TabsTrigger value="assets" className="text-xs">Assets</TabsTrigger>
                  <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
                  <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      ["Registration No", detail.lessor?.registration_no],
                      ["Tax ID", detail.lessor?.tax_id],
                      ["Country", detail.lessor?.country],
                      ["City", detail.lessor?.city],
                      ["Credit Rating", detail.lessor?.credit_rating],
                      ["Payment Terms", detail.lessor?.payment_terms ? `${detail.lessor.payment_terms} days` : null],
                      ["Currency", detail.lessor?.preferred_currency],
                      ["Website", detail.lessor?.website],
                    ].filter(([, v]) => v).map(([label, value]) => (
                      <div key={String(label)} className="bg-[#1a1d2e] rounded-lg p-3 border border-white/10">
                        <p className="text-xs text-gray-500 mb-1">{String(label)}</p>
                        <p className="text-sm text-white font-medium">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* ── LESSEE TAB ─────────────────────────────────────────── */}
                <TabsContent value="lessee">
                  {(() => {
                    const l = detail?.lessor;
                    const hasLessee = !!l?.lessee_name;

                    // ── Save helper ────────────────────────────────────────────
                    const saveLessee = () => {
                      if (!l) return;
                      if (!lesseeForm.lesseeName.trim()) { toast.error("Lessee Name is required"); return; }
                      upsertMutation.mutate({
                        lessorId: Number(l.lessor_id),
                        lessorName: String(l.lessor_name),
                        lessorType: l.lessor_type as "Individual" | "Company" | "Government" | "REIT" | "Trust",
                        registrationNo: l.registration_no || undefined,
                        taxId: l.tax_id || undefined,
                        country: String(l.country ?? "QA"),
                        city: l.city || undefined,
                        addressLine1: l.address_line1 || undefined,
                        addressLine2: l.address_line2 || undefined,
                        postalCode: l.postal_code || undefined,
                        website: l.website || undefined,
                        creditRating: l.credit_rating || undefined,
                        paymentTerms: Number(l.payment_terms ?? 30),
                        preferredCurrency: String(l.preferred_currency ?? "QAR"),
                        status: l.status as "Active" | "Inactive" | "Blacklisted",
                        blacklistReason: l.blacklist_reason || undefined,
                        lesseeType: lesseeForm.lesseeType,
                        lesseeName: lesseeForm.lesseeName || undefined,
                        staffNumber: lesseeForm.staffNumber || undefined,
                        grade: lesseeForm.grade || undefined,
                        position: lesseeForm.position || undefined,
                        placeOfWork: lesseeForm.placeOfWork || undefined,
                        lesseeDepartment: lesseeForm.lesseeDepartment || undefined,
                        employeeId: lesseeForm.employeeId || undefined,
                        lesseeContactEmail: lesseeForm.lesseeContactEmail || undefined,
                        lesseeContactPhone: lesseeForm.lesseeContactPhone || undefined,
                      });
                      setEditingLessee(false);
                    };

                    return (
                      <div className="space-y-5">
                        {/* ── Tab header bar ──────────────────────────────── */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-[#e60000]" />
                            <span className="text-sm font-semibold text-white">Lessee Details</span>
                            {hasLessee && !editingLessee && (
                              <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                l.lessee_type === "Staff"
                                  ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                                  : l.lessee_type === "Client"
                                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                  : "bg-gray-500/15 text-gray-400 border-gray-500/30"
                              }`}>{l.lessee_type ?? "—"}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {editingLessee && (
                              <GenAIFillButton
                                formType="lessee_details"
                                existingData={{ lessor_name: l?.lessor_name, lessee_type: lesseeForm.lesseeType }}
                                onFill={handleLesseeAIFill}
                                label="Gen AI Fill"
                              />
                            )}
                            {!editingLessee ? (
                              <Button size="sm" className="bg-[#e60000] hover:bg-[#cc0000] text-white text-xs h-7 gap-1"
                                onClick={() => handleLesseeFormFill(l ?? {})}>
                                <Pencil className="w-3 h-3" />
                                {hasLessee ? "Edit Lessee" : "Assign Lessee"}
                              </Button>
                            ) : (
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="border-white/10 text-gray-400 text-xs h-7"
                                  onClick={() => setEditingLessee(false)}>Cancel</Button>
                                <Button size="sm" className="bg-[#e60000] hover:bg-[#cc0000] text-white text-xs h-7 gap-1"
                                  disabled={upsertMutation.isPending} onClick={saveLessee}>
                                  <Save className="w-3 h-3" />
                                  {upsertMutation.isPending ? "Saving…" : "Save Lessee"}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>

                        {!editingLessee ? (
                          hasLessee ? (
                            /* ── READ-ONLY PROFILE CARD ─────────────────────── */
                            <div className="space-y-4">
                              {/* Profile hero */}
                              <div className="flex items-start gap-5 bg-gradient-to-r from-[#1a1d2e] to-[#13161f] border border-white/10 rounded-xl p-5">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#e60000]/30 to-[#e60000]/10 border-2 border-[#e60000]/40 flex items-center justify-center shrink-0">
                                  <span className="text-xl font-bold text-[#e60000]">
                                    {String(l.lessee_name).split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-lg font-bold text-white">{l.lessee_name}</h3>
                                  <p className="text-sm text-gray-400 mt-0.5">{l.position || "—"}</p>
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {l.lessee_type && (
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                        l.lessee_type === "Staff"
                                          ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                                          : l.lessee_type === "Client"
                                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                          : "bg-gray-500/15 text-gray-400 border-gray-500/30"
                                      }`}>{l.lessee_type}</span>
                                    )}
                                    {l.grade && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-amber-500/15 text-amber-400 border-amber-500/30">
                                        Grade: {l.grade}
                                      </span>
                                    )}
                                    {l.department && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-violet-500/15 text-violet-400 border-violet-500/30">
                                        {l.department}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  {l.staff_number && (
                                    <div className="text-xs text-gray-500">Staff No.</div>
                                  )}
                                  {l.staff_number && (
                                    <div className="text-sm font-mono text-white font-semibold">{l.staff_number}</div>
                                  )}
                                  {l.employee_id && (
                                    <div className="text-xs text-gray-500 mt-1">Employee ID</div>
                                  )}
                                  {l.employee_id && (
                                    <div className="text-sm font-mono text-white">{l.employee_id}</div>
                                  )}
                                </div>
                              </div>

                              {/* Detail sections */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Identity & Employment */}
                                <div className="md:col-span-2 bg-[#1a1d2e] border border-white/10 rounded-xl p-4 space-y-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Briefcase className="w-3.5 h-3.5 text-[#e60000]" />
                                    <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Employment Details</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    {[
                                      { icon: <Hash className="w-3 h-3" />, label: "Staff Number", value: l.staff_number },
                                      { icon: <IdCard className="w-3 h-3" />, label: "Employee ID", value: l.employee_id },
                                      { icon: <GraduationCap className="w-3 h-3" />, label: "Grade", value: l.grade },
                                      { icon: <Briefcase className="w-3 h-3" />, label: "Position / Title", value: l.position },
                                      { icon: <Building className="w-3 h-3" />, label: "Department", value: l.department },
                                      { icon: <MapPin className="w-3 h-3" />, label: "Place of Work", value: l.place_of_work },
                                    ].map(({ icon, label, value }) => (
                                      <div key={label} className="flex items-start gap-2">
                                        <span className="text-gray-600 mt-0.5">{icon}</span>
                                        <div>
                                          <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
                                          <p className="text-sm text-white font-medium">{value || <span className="text-gray-600 italic">—</span>}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Contact */}
                                <div className="bg-[#1a1d2e] border border-white/10 rounded-xl p-4 space-y-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Phone className="w-3.5 h-3.5 text-[#e60000]" />
                                    <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Contact</span>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="flex items-start gap-2">
                                      <Mail className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
                                      <div>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Email</p>
                                        <p className="text-sm text-white break-all">{l.lessee_contact_email || <span className="text-gray-600 italic">—</span>}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                      <Phone className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
                                      <div>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Phone</p>
                                        <p className="text-sm text-white">{l.lessee_contact_phone || <span className="text-gray-600 italic">—</span>}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* ── EMPTY STATE ────────────────────────────────── */
                            <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-4">
                              <div className="w-16 h-16 rounded-full bg-[#1a1d2e] border-2 border-dashed border-white/10 flex items-center justify-center">
                                <User2 className="w-7 h-7 opacity-30" />
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-medium text-gray-400">No lessee assigned</p>
                                <p className="text-xs text-gray-600 mt-1">Assign a staff member or client as the lessee for this lessor record</p>
                              </div>
                              <Button size="sm" className="bg-[#e60000] hover:bg-[#cc0000] text-white text-xs h-8 gap-1.5 mt-1"
                                onClick={() => { setLesseeForm(EMPTY_LESSEE_FORM); setEditingLessee(true); }}>
                                <Plus className="w-3.5 h-3.5" /> Assign Lessee
                              </Button>
                            </div>
                          )
                        ) : (
                          /* ── EDIT FORM ──────────────────────────────────────── */
                          <div className="space-y-5">
                            {/* Section: Identity */}
                            <div className="bg-[#1a1d2e] border border-white/10 rounded-xl p-5">
                              <div className="flex items-center gap-2 mb-4">
                                <User2 className="w-3.5 h-3.5 text-[#e60000]" />
                                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Identity</span>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-xs text-gray-400">Lessee Type</Label>
                                  <Select value={lesseeForm.lesseeType} onValueChange={v => setLesseeForm(f => ({ ...f, lesseeType: v as "Staff" | "Client" | "Other" }))}>
                                    <SelectTrigger className="bg-[#13161f] border-white/10 text-gray-200 mt-1 h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1a1d2e] border-white/10 text-gray-200">
                                      {LESSEE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-400">Lessee Full Name <span className="text-red-400">*</span></Label>
                                  <Input className="bg-[#13161f] border-white/10 text-gray-200 mt-1 h-9" placeholder="e.g. Ahmed Al Rashidi"
                                    value={lesseeForm.lesseeName} onChange={e => setLesseeForm(f => ({ ...f, lesseeName: e.target.value }))} />
                                </div>
                              </div>
                            </div>

                            {/* Section: Employment */}
                            <div className="bg-[#1a1d2e] border border-white/10 rounded-xl p-5">
                              <div className="flex items-center gap-2 mb-4">
                                <Briefcase className="w-3.5 h-3.5 text-[#e60000]" />
                                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Employment Details</span>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-xs text-gray-400">Staff Number</Label>
                                  <div className="relative mt-1">
                                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                    <Input className="bg-[#13161f] border-white/10 text-gray-200 pl-8 h-9" placeholder="e.g. VF-00123"
                                      value={lesseeForm.staffNumber} onChange={e => setLesseeForm(f => ({ ...f, staffNumber: e.target.value }))} />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-400">Employee ID</Label>
                                  <div className="relative mt-1">
                                    <IdCard className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                    <Input className="bg-[#13161f] border-white/10 text-gray-200 pl-8 h-9" placeholder="HR system ID"
                                      value={lesseeForm.employeeId} onChange={e => setLesseeForm(f => ({ ...f, employeeId: e.target.value }))} />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-400">Grade</Label>
                                  <div className="relative mt-1">
                                    <GraduationCap className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                    <Input className="bg-[#13161f] border-white/10 text-gray-200 pl-8 h-9" placeholder="e.g. G5, Senior, Band 4"
                                      value={lesseeForm.grade} onChange={e => setLesseeForm(f => ({ ...f, grade: e.target.value }))} />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-400">Position / Job Title</Label>
                                  <div className="relative mt-1">
                                    <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                    <Input className="bg-[#13161f] border-white/10 text-gray-200 pl-8 h-9" placeholder="e.g. Network Engineer"
                                      value={lesseeForm.position} onChange={e => setLesseeForm(f => ({ ...f, position: e.target.value }))} />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-400">Department</Label>
                                  <div className="relative mt-1">
                                    <Building className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                    <Input className="bg-[#13161f] border-white/10 text-gray-200 pl-8 h-9" placeholder="e.g. Technology, Finance"
                                      value={lesseeForm.lesseeDepartment} onChange={e => setLesseeForm(f => ({ ...f, lesseeDepartment: e.target.value }))} />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-400">Place of Work</Label>
                                  <div className="relative mt-1">
                                    <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                    <Input className="bg-[#13161f] border-white/10 text-gray-200 pl-8 h-9" placeholder="e.g. Doha HQ, Al Rayyan Site"
                                      value={lesseeForm.placeOfWork} onChange={e => setLesseeForm(f => ({ ...f, placeOfWork: e.target.value }))} />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Section: Contact */}
                            <div className="bg-[#1a1d2e] border border-white/10 rounded-xl p-5">
                              <div className="flex items-center gap-2 mb-4">
                                <Phone className="w-3.5 h-3.5 text-[#e60000]" />
                                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Contact Information</span>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-xs text-gray-400">Contact Email</Label>
                                  <div className="relative mt-1">
                                    <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                    <Input type="email" className="bg-[#13161f] border-white/10 text-gray-200 pl-8 h-9" placeholder="lessee@vodafone.qa"
                                      value={lesseeForm.lesseeContactEmail} onChange={e => setLesseeForm(f => ({ ...f, lesseeContactEmail: e.target.value }))} />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-400">Contact Phone</Label>
                                  <div className="relative mt-1">
                                    <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                    <Input className="bg-[#13161f] border-white/10 text-gray-200 pl-8 h-9" placeholder="+974 xxxx xxxx"
                                      value={lesseeForm.lesseeContactPhone} onChange={e => setLesseeForm(f => ({ ...f, lesseeContactPhone: e.target.value }))} />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Save bar */}
                            <div className="flex justify-end gap-3 pt-1">
                              <Button variant="outline" size="sm" className="border-white/10 text-gray-400 h-9"
                                onClick={() => setEditingLessee(false)}>Cancel</Button>
                              <Button size="sm" className="bg-[#e60000] hover:bg-[#cc0000] text-white h-9 gap-1.5"
                                disabled={upsertMutation.isPending} onClick={saveLessee}>
                                <Save className="w-3.5 h-3.5" />
                                {upsertMutation.isPending ? "Saving…" : "Save Lessee Details"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="contacts">
                  <div className="flex justify-end mb-3">
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs h-7"
                      onClick={() => { setContactForm(EMPTY_CONTACT); setViewMode("form_contact"); }}>
                      <Plus className="w-3 h-3 mr-1" /> Add Contact
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(detail.contacts ?? []).map((c: any) => (
                      <Card key={String(c.contact_id)} className="bg-[#1a1d2e] border-white/10">
                        <CardContent className="p-4 flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">{String(c.full_name)}</p>
                            <p className="text-xs text-gray-500">{String(c.job_title ?? "")} {c.department ? `· ${c.department}` : ""}</p>
                            {c.email && <p className="text-xs text-blue-400 mt-1 flex items-center gap-1"><Mail className="w-3 h-3" />{String(c.email)}</p>}
                            {c.phone_primary && <p className="text-xs text-gray-400 flex items-center gap-1"><Phone className="w-3 h-3" />{String(c.phone_primary)}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">{String(c.contact_type)}</Badge>
                            <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400 hover:text-red-300"
                              onClick={() => deleteContactMutation.mutate({ contactId: Number(c.contact_id), lessorId: selectedLessorId! })}>Remove</Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {(detail.contacts ?? []).length === 0 && <p className="text-gray-500 text-sm text-center py-8">No contacts added yet</p>}
                  </div>
                </TabsContent>

                <TabsContent value="bank">
                  <div className="flex justify-end mb-3">
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs h-7"
                      onClick={() => { setBankForm(EMPTY_BANK); setViewMode("form_bank"); }}>
                      <Plus className="w-3 h-3 mr-1" /> Add Bank Account
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(detail.bankAccounts ?? []).map((b: any) => (
                      <Card key={String(b.account_id)} className="bg-[#1a1d2e] border-white/10">
                        <CardContent className="p-4 flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">{String(b.bank_name)}</p>
                            <p className="text-xs text-gray-500">{String(b.account_name)} · {String(b.account_number)}</p>
                            {b.iban && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><CreditCard className="w-3 h-3" />IBAN: {String(b.iban)}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">{String(b.currency)}</Badge>
                            <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400 hover:text-red-300"
                              onClick={() => deleteBankMutation.mutate({ bankAccId: Number(b.account_id), lessorId: selectedLessorId! })}>Remove</Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {(detail.bankAccounts ?? []).length === 0 && <p className="text-gray-500 text-sm text-center py-8">No bank accounts added yet</p>}
                  </div>
                </TabsContent>

                <TabsContent value="assets">
                  <div className="space-y-2">
                    {(detail.assets ?? []).map((a: any) => (
                      <div key={String(a.asset_id)} className="flex items-center justify-between p-3 bg-[#1a1d2e] rounded-lg border border-white/10">
                        <div>
                          <p className="text-sm font-medium text-white">{String(a.asset_name)}</p>
                          <p className="text-xs text-gray-500">{String(a.asset_type)} · {String(a.city ?? "")}, {String(a.country)}</p>
                        </div>
                        <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">{String(a.status)}</Badge>
                      </div>
                    ))}
                    {(detail.assets ?? []).length === 0 && <p className="text-gray-500 text-sm text-center py-8">No assets linked to this lessor</p>}
                  </div>
                </TabsContent>

                <TabsContent value="documents">
                  <div className="space-y-2">
                    {(detail.documents ?? []).map((d: any) => (
                      <div key={String(d.doc_id)} className="flex items-center justify-between p-3 bg-[#1a1d2e] rounded-lg border border-white/10">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-blue-400" />
                          <div>
                            <p className="text-sm text-white">{String(d.doc_name)}</p>
                            <p className="text-xs text-gray-500">{String(d.doc_type)} {d.doc_number ? `· ${d.doc_number}` : ""}</p>
                          </div>
                        </div>
                        {d.expiry_date && <p className="text-xs text-gray-500">Expires: {new Date(String(d.expiry_date)).toLocaleDateString()}</p>}
                      </div>
                    ))}
                    {(detail.documents ?? []).length === 0 && <p className="text-gray-500 text-sm text-center py-8">No documents uploaded</p>}
                  </div>
                </TabsContent>

                <TabsContent value="notes">
                  <div className="flex justify-end mb-3">
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs h-7"
                      onClick={() => { setNoteForm(EMPTY_NOTE); setViewMode("form_note"); }}>
                      <Plus className="w-3 h-3 mr-1" /> Add Note
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {(detail.notes ?? []).map((n: any) => (
                      <Card key={String(n.note_id)} className="bg-[#1a1d2e] border-white/10">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-sm font-medium text-white">{String(n.subject)}</p>
                              <p className="text-xs text-gray-500">{String(n.note_type)} · {new Date(String(n.created_at)).toLocaleDateString()}</p>
                            </div>
                            {n.is_private && <Badge className="text-[10px] bg-orange-500/20 text-orange-400 border-orange-500/30">Private</Badge>}
                          </div>
                          <p className="text-xs text-gray-300 whitespace-pre-wrap">{String(n.note_text)}</p>
                        </CardContent>
                      </Card>
                    ))}
                    {(detail.notes ?? []).length === 0 && <p className="text-gray-500 text-sm text-center py-8">No notes added yet</p>}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── LIST VIEW ─────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <ScreenHeader
        screenId="VFLSLESSOR001"
        title="Lessor Master"
        subtitle="Vodafone Qatar & subsidiaries — the entities who own and lease out assets (IFRS 16 Lessor)"
        actions={
          <Button className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => { setEditingLessor(null); setForm(EMPTY_FORM); setViewMode("form_lessor"); }}>
            <Plus className="w-4 h-4 mr-2" /> New Lessor
          </Button>
        }
      />
      <div className="px-6 pb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
          <Input className="pl-9 bg-[#1a1d2e] border-white/10 text-gray-200 placeholder:text-gray-500"
            placeholder="Search lessors..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36 bg-[#1a1d2e] border-white/10 text-gray-300"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent className="bg-[#1a1d2e] border-white/10 text-gray-200">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
            <SelectItem value="Blacklisted">Blacklisted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36 bg-[#1a1d2e] border-white/10 text-gray-300"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent className="bg-[#1a1d2e] border-white/10 text-gray-200">
            <SelectItem value="all">All Types</SelectItem>
            {LESSOR_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 overflow-auto px-6">
        {listQuery.isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-500">Loading...</div>
        ) : lessors.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-3">
            <Building2 className="w-12 h-12 opacity-20" />
            <p className="text-base">No lessors found</p>
            <Button className="bg-red-600 hover:bg-red-700 text-white mt-2"
              onClick={() => { setEditingLessor(null); setForm(EMPTY_FORM); setViewMode("form_lessor"); }}>
              <Plus className="w-4 h-4 mr-2" /> Add First Lessor
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-gray-400">Lessor Name</TableHead>
                <TableHead className="text-gray-400">Type</TableHead>
                <TableHead className="text-gray-400">Country</TableHead>
                <TableHead className="text-gray-400">City</TableHead>
                <TableHead className="text-gray-400">Status</TableHead>
                <TableHead className="text-gray-400">Assets</TableHead>
                <TableHead className="text-gray-400">Active Leases</TableHead>
                <TableHead className="text-gray-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lessors.map((l: any) => (
                <TableRow key={String(l.lessor_id)} className="border-white/5 hover:bg-white/5">
                  <TableCell className="text-white font-medium">{String(l.lessor_name)}</TableCell>
                  <TableCell className="text-gray-400">{String(l.lessor_type)}</TableCell>
                  <TableCell className="text-gray-400">{String(l.country)}</TableCell>
                  <TableCell className="text-gray-400">{l.city ? String(l.city) : "—"}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] px-1.5 py-0 border ${STATUS_COLORS[String(l.status)] ?? ""}`}>{String(l.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-gray-400">{Number(l.asset_count) || 0}</TableCell>
                  <TableCell className="text-gray-400">{Number(l.active_leases) || 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-white"
                        onClick={() => { setSelectedLessorId(Number(l.lessor_id)); setViewMode("detail"); }}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-blue-400"
                        onClick={() => {
                          setSelectedLessorId(Number(l.lessor_id));
                          setEditingLessor(l);
                          setForm({
                            lessorName: String(l.lessor_name ?? ""), lessorType: String(l.lessor_type ?? "Company"),
                            registrationNo: String(l.registration_no ?? ""), taxId: String(l.tax_id ?? ""),
                            country: String(l.country ?? "QA"), city: String(l.city ?? ""),
                            addressLine1: String(l.address_line1 ?? ""), addressLine2: String(l.address_line2 ?? ""),
                            postalCode: String(l.postal_code ?? ""), website: String(l.website ?? ""),
                            creditRating: String(l.credit_rating ?? ""), paymentTerms: Number(l.payment_terms ?? 30),
                            preferredCurrency: String(l.preferred_currency ?? "QAR"), status: String(l.status ?? "Active"),
                            blacklistReason: String(l.blacklist_reason ?? ""),
                            registrationDate: String(l.registration_date ?? ""), contractStartDate: String(l.contract_start_date ?? ""), contractEndDate: String(l.contract_end_date ?? ""),
                          });
                          setViewMode("form_lessor");
                        }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-400"
                        onClick={() => {
                          toast("Delete this lessor?", {
                            action: { label: "Delete", onClick: () => deleteMutation.mutate({ lessorId: Number(l.lessor_id) }) },
                          });
                        }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {total > 20 && (
          <div className="py-3 flex items-center justify-between border-t border-white/10 mt-2">
            <Button variant="outline" size="sm" className="border-white/10 text-gray-400" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <span className="text-xs text-gray-500">Page {page} of {Math.ceil(total / 20)} ({total} total)</span>
            <Button variant="outline" size="sm" className="border-white/10 text-gray-400" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        )}
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
