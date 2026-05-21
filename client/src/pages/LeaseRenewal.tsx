/**
 * LeaseRenewal.tsx
 * Full-screen Lease Renewal wizard.
 * Route: /leases/renewal?id=<contractId>
 *
 * Sections:
 *  1. Renewal Terms   — new expiry, monthly payment, IBR, notes
 *  2. Lessor Details  — editable (pre-populated)
 *  3. Lessee Details  — editable (pre-populated)
 *  4. Asset Details   — editable (pre-populated)
 *  5. Financial Terms — editable (pre-populated)
 *  6. Amortisation    — Generate button → inline monthly/yearly schedule + GL entries
 *  7. Review & Submit
 */
import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft, RefreshCcw, Calculator, CheckCircle2,
  Building2, User, FileText, DollarSign, BarChart2, Eye,
  Info, ChevronDown, ChevronUp,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";

const CURRENCIES = ["QAR", "USD", "GHS", "EUR", "GBP", "ZAR", "KES", "NGN", "ZMW"];
const ASSET_TYPES = ["Villa", "Apartment", "Vehicle", "Heavy Vehicle", "Tower Site", "Data Centre", "Retail Outlet", "Office", "Warehouse", "Fleet Vehicle", "Network Equipment", "Generator Site", "Other"];

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number, dp = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function toDateStr(v: unknown): string {
  if (!v) return "";
  try { return new Date(v as string).toISOString().split("T")[0]; } catch { return ""; }
}
function computePV(payment: number, ibr: number, months: number): number {
  const r = ibr / 12;
  if (r === 0) return payment * months;
  return parseFloat((payment * (1 - Math.pow(1 + r, -months)) / r).toFixed(2));
}
function buildSchedule(payment: number, ibr: number, months: number, rouAsset: number, startDate: string) {
  const r = ibr / 12;
  const depr = rouAsset / months;
  const rows = [];
  let opening = computePV(payment, ibr, months);
  let rouNBV = rouAsset;
  let cumDepr = 0;
  const sd = new Date(startDate);
  for (let i = 1; i <= months; i++) {
    const pd = new Date(sd);
    pd.setMonth(pd.getMonth() + i);
    const interest = parseFloat((opening * r).toFixed(2));
    const principal = parseFloat((payment - interest).toFixed(2));
    const closing = parseFloat(Math.max(0, opening - principal).toFixed(2));
    cumDepr = parseFloat((cumDepr + depr).toFixed(2));
    rouNBV = parseFloat(Math.max(0, rouAsset - cumDepr).toFixed(2));
    rows.push({
      period: pd.toISOString().split("T")[0],
      opening: parseFloat(opening.toFixed(2)),
      interest,
      payment,
      principal,
      closing,
      depr: parseFloat(depr.toFixed(2)),
      rouNBV,
    });
    opening = closing;
  }
  return rows;
}

// ── Calculation Explanation Modal ────────────────────────────────────────────
function CalcExplainModal({ row, currency, onClose }: {
  row: ReturnType<typeof buildSchedule>[number];
  currency: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-[#e60000]" /> Calculation Explanation — {row.period}
        </h3>
        <div className="font-mono text-sm space-y-2 bg-muted/30 rounded-lg p-4">
          <p className="text-muted-foreground">Opening Liability</p>
          <p className="text-foreground font-bold">{currency} {fmt(row.opening)}</p>
          <hr className="border-border" />
          <p className="text-muted-foreground">Interest Expense = Opening × (IBR ÷ 12)</p>
          <p className="text-foreground">{currency} {fmt(row.opening)} × rate = <span className="text-amber-400 font-bold">{currency} {fmt(row.interest)}</span></p>
          <hr className="border-border" />
          <p className="text-muted-foreground">Principal Repaid = Payment − Interest</p>
          <p className="text-foreground">{currency} {fmt(row.payment)} − {currency} {fmt(row.interest)} = <span className="text-green-400 font-bold">{currency} {fmt(row.principal)}</span></p>
          <hr className="border-border" />
          <p className="text-muted-foreground">Closing Liability = Opening − Principal</p>
          <p className="text-foreground">{currency} {fmt(row.opening)} − {currency} {fmt(row.principal)} = <span className="text-blue-400 font-bold">{currency} {fmt(row.closing)}</span></p>
          <hr className="border-border" />
          <p className="text-muted-foreground">ROU Depreciation = ROU Asset ÷ Term Months</p>
          <p className="text-foreground">= <span className="text-purple-400 font-bold">{currency} {fmt(row.depr)}</span></p>
          <p className="text-muted-foreground mt-1">ROU NBV (closing) = <span className="text-purple-400 font-bold">{currency} {fmt(row.rouNBV)}</span></p>
        </div>
        <Button className="mt-4 w-full" variant="outline" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LeaseRenewal() {
  const [, setLocation] = useLocation();

  const contractId = (() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("id");
    return v ? parseInt(v, 10) : null;
  })();

  // ── Fetch existing lease ──
  const { data: leaseRaw, isLoading: leaseLoading } = trpc.lease.getLeaseById.useQuery(
    { contractId: contractId! },
    { enabled: !!contractId, retry: false }
  );
  const { data: lesseeRaw } = trpc.lease.getLesseeDetails.useQuery(
    { contractId: contractId! },
    { enabled: !!contractId, retry: false }
  );

  // ── Form state ──
  const [lessor, setLessor] = useState({ name: "", contactPerson: "", email: "", phone: "", country: "QA", taxId: "" });
  const [lessee, setLessee] = useState({ lesseeType: "Staff" as "Staff" | "Client" | "Other", lesseeName: "", staffNumber: "", employeeId: "", grade: "", position: "", department: "", placeOfWork: "", contactEmail: "", contactPhone: "" });
  const [asset, setAsset] = useState({ assetType: "Villa", assetName: "", assetCode: "", location: "Doha", country: "QA", maintenanceBy: "Lessor" as "Lessor" | "Vodafone" });
  const [financial, setFinancial] = useState({ commencementDate: "", endDate: "", currency: "QAR", rentAmount: "", discountRate: "", securityDeposit: "", escalationRate: "", isLTO: false, ltoPrice: "", ltoDeposit: "", ltoInstalments: "", ltoRate: "", ltoBalloon: "" });
  // Renewal-specific overrides
  const [renewal, setRenewal] = useState({ newExpiryDate: "", newMonthlyPayment: "", newIBR: "", notes: "" });
  // Amortisation
  const [amortView, setAmortView] = useState<"monthly" | "yearly">("monthly");
  const [schedule, setSchedule] = useState<ReturnType<typeof buildSchedule>>([]);
  const [leaseLiability, setLeaseLiability] = useState(0);
  const [rouAsset, setRouAsset] = useState(0);
  const [scheduleGenerated, setScheduleGenerated] = useState(false);
  const [explainRow, setExplainRow] = useState<ReturnType<typeof buildSchedule>[number] | null>(null);
  const [expandedGLRows, setExpandedGLRows] = useState<Record<number, boolean>>({});

  // ── Pre-populate from existing lease ──
  useEffect(() => {
    if (!leaseRaw) return;
    const d = leaseRaw as Record<string, unknown>;
    let cp = "", em = "", ph = "";
    try { const c = JSON.parse(d.contact_json as string || "{}"); cp = c.name || ""; em = c.email || ""; ph = c.phone || ""; } catch { /* ignore */ }
    setLessor({ name: String(d.lessor_name || ""), contactPerson: cp, email: em, phone: ph, country: String(d.lessor_country || "QA"), taxId: String(d.tax_no || "") });
    let locCity = "Doha", locCountry = "QA";
    try { const loc = JSON.parse(d.location_json as string || "{}"); locCity = loc.city || loc.address || "Doha"; locCountry = loc.country || "QA"; } catch { /* ignore */ }
    setAsset({ assetType: String(d.asset_type || "Villa"), assetName: String(d.asset_description || ""), assetCode: String(d.asset_tag || ""), location: locCity, country: locCountry, maintenanceBy: (d.maintenance_responsibility === "Vodafone" ? "Vodafone" : "Lessor") as "Lessor" | "Vodafone" });
    const expiry = toDateStr(d.expiry_date);
    setFinancial({
      commencementDate: toDateStr(d.commencement_date),
      endDate: expiry,
      currency: String(d.currency || "QAR"),
      rentAmount: String(d.monthly_payment || ""),
      discountRate: d.ibr ? String(Number(d.ibr) * 100) : "",
      securityDeposit: String(d.deposit_amount || ""),
      escalationRate: d.escalation_rate ? String(Number(d.escalation_rate) * 100) : "",
      isLTO: Boolean(d.is_lto),
      ltoPrice: String(d.lto_purchase_price || ""),
      ltoDeposit: String(d.lto_deposit || ""),
      ltoInstalments: String(d.lto_total_instalments || ""),
      ltoRate: d.lto_finance_charge_rate ? String(Number(d.lto_finance_charge_rate) * 100) : "",
      ltoBalloon: String(d.lto_balloon_amount || ""),
    });
    // Default renewal fields to current values — user can override
    setRenewal(r => ({
      ...r,
      newMonthlyPayment: String(d.monthly_payment || ""),
      newIBR: d.ibr ? String(Number(d.ibr) * 100) : "",
    }));
  }, [leaseRaw]);

  useEffect(() => {
    if (!lesseeRaw) return;
    const ld = lesseeRaw as Record<string, unknown>;
    setLessee({
      lesseeType: (ld.lesseeType as "Staff" | "Client" | "Other") || "Staff",
      lesseeName: String(ld.lesseeName || ""),
      staffNumber: String(ld.staffNumber || ""),
      employeeId: String(ld.employeeId || ""),
      grade: String(ld.grade || ""),
      position: String(ld.position || ""),
      department: String(ld.department || ""),
      placeOfWork: String(ld.placeOfWork || ""),
      contactEmail: String(ld.contactEmail || ""),
      contactPhone: String(ld.contactPhone || ""),
    });
  }, [lesseeRaw]);

  // ── Derived values ──
  const effectiveExpiryDate = renewal.newExpiryDate || financial.endDate;
  const effectivePayment = Number(renewal.newMonthlyPayment || financial.rentAmount) || 0;
  const effectiveIBR = (Number(renewal.newIBR || financial.discountRate) || 0) / 100;
  const effectiveStart = financial.commencementDate;
  const termMonths = useMemo(() => {
    if (!effectiveStart || !effectiveExpiryDate) return 0;
    return Math.max(1, Math.round((new Date(effectiveExpiryDate).getTime() - new Date(effectiveStart).getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  }, [effectiveStart, effectiveExpiryDate]);

  // ── Mutations ──
  const initiateRenewalMutation = trpc.lease.initiateRenewal.useMutation({
    onSuccess: () => {
      toast.success("Renewal initiated and submitted for approval!");
      setLocation("/leases");
    },
    onError: (e) => toast.error("Renewal failed: " + e.message),
  });

  // ── Generate Amortisation ──
  const handleGenerateAmortisation = () => {
    if (!effectiveStart || !effectiveExpiryDate || effectivePayment <= 0 || effectiveIBR <= 0) {
      toast.error("Please fill in Commencement Date, Expiry Date, Monthly Payment, and IBR before generating.");
      return;
    }
    const ll = computePV(effectivePayment, effectiveIBR, termMonths);
    const rou = ll; // simplified: ROU = lease liability (no IDC/incentives for renewal)
    const rows = buildSchedule(effectivePayment, effectiveIBR, termMonths, rou, effectiveStart);
    setLeaseLiability(ll);
    setRouAsset(rou);
    setSchedule(rows);
    setScheduleGenerated(true);
    toast.success(`Amortisation generated — ${termMonths} months, Lease Liability: ${financial.currency} ${fmt(ll)}`);
  };

  // ── Yearly aggregation ──
  const yearlySchedule = useMemo(() => {
    const map: Record<string, { year: string; totalInterest: number; totalPrincipal: number; totalPayment: number; totalDepr: number; closingLiability: number; rouNBV: number }> = {};
    for (const row of schedule) {
      const yr = row.period.slice(0, 4);
      if (!map[yr]) map[yr] = { year: yr, totalInterest: 0, totalPrincipal: 0, totalPayment: 0, totalDepr: 0, closingLiability: 0, rouNBV: 0 };
      map[yr].totalInterest += row.interest;
      map[yr].totalPrincipal += row.principal;
      map[yr].totalPayment += row.payment;
      map[yr].totalDepr += row.depr;
      map[yr].closingLiability = row.closing;
      map[yr].rouNBV = row.rouNBV;
    }
    return Object.values(map).map(r => ({ ...r, totalInterest: parseFloat(r.totalInterest.toFixed(2)), totalPrincipal: parseFloat(r.totalPrincipal.toFixed(2)), totalPayment: parseFloat(r.totalPayment.toFixed(2)), totalDepr: parseFloat(r.totalDepr.toFixed(2)) }));
  }, [schedule]);

  // ── GL Entries per period ──
  function getGLEntries(row: ReturnType<typeof buildSchedule>[number]) {
    return [
      { dr: "Interest Expense (P&L)", cr: "", amount: row.interest, ledger: "7100", account: "Finance Cost" },
      { dr: "", cr: "Lease Liability (BS)", amount: row.interest, ledger: "2600", account: "Lease Liability" },
      { dr: "Lease Liability (BS)", cr: "", amount: row.principal, ledger: "2600", account: "Lease Liability" },
      { dr: "", cr: "Bank / Payables (BS)", amount: row.payment, ledger: "1100", account: "Cash / Bank" },
      { dr: "Depreciation (P&L)", cr: "", amount: row.depr, ledger: "7200", account: "Depreciation" },
      { dr: "", cr: "Accumulated Depr (BS)", amount: row.depr, ledger: "1601", account: "Accum. Depreciation" },
    ];
  }

  // ── Submit ──
  const handleSubmit = () => {
    if (!contractId) { toast.error("No contract selected"); return; }
    if (!renewal.newExpiryDate) { toast.error("New Expiry Date is required"); return; }
    if (!renewal.newMonthlyPayment || Number(renewal.newMonthlyPayment) <= 0) { toast.error("New Monthly Payment is required"); return; }
    if (!renewal.newIBR || Number(renewal.newIBR) <= 0) { toast.error("New IBR is required"); return; }
    initiateRenewalMutation.mutate({
      contractId,
      newExpiryDate: renewal.newExpiryDate,
      newMonthlyPayment: Number(renewal.newMonthlyPayment),
      newTermMonths: termMonths,
      newIBR: Number(renewal.newIBR) / 100,
      notes: renewal.notes || undefined,
    });
  };

  const inputCls = "bg-background border-border text-foreground placeholder:text-muted-foreground";
  const labelCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide";

  if (!contractId) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64 text-muted-foreground">No contract ID provided.</div>
    </DashboardLayout>
  );

  if (leaseLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64 text-muted-foreground">Loading lease data…</div>
    </DashboardLayout>
  );

  const d = leaseRaw as Record<string, unknown> | undefined;

  return (
    <DashboardLayout>
      <div className="px-6 py-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <ScreenHeader
          screenId="VFLLSREN0001P001" screenType="lease_renewal"
          title="Initiate Lease Renewal"
          subtitle={`IFRS 16 compliant renewal wizard · ${d?.contract_ref ?? ""}`}
        />

        {/* Back + Contract Banner */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/leases")} className="gap-1.5 text-muted-foreground">
            <ChevronLeft className="w-4 h-4" /> Back to Register
          </Button>
          {d && (
            <div className="flex-1 bg-muted/30 border border-border rounded-lg px-4 py-2 flex flex-wrap gap-6 text-sm">
              <span><span className="text-muted-foreground">Ref: </span><span className="font-mono text-[#e60000] font-semibold">{String(d.contract_ref || "")}</span></span>
              <span><span className="text-muted-foreground">Asset: </span><span className="font-medium">{String(d.asset_description || "")}</span></span>
              <span><span className="text-muted-foreground">Lessor: </span><span>{String(d.lessor_name || "")}</span></span>
              <span><span className="text-muted-foreground">Current Expiry: </span><span className="text-amber-400 font-medium">{toDateStr(d.expiry_date)}</span></span>
              <span><span className="text-muted-foreground">Monthly: </span><span>{String(d.currency || "QAR")} {fmt(Number(d.monthly_payment || 0))}</span></span>
              <span><span className="text-muted-foreground">IBR: </span><span>{fmt(Number(d.ibr || 0) * 100, 4)}%</span></span>
            </div>
          )}
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="renewal" className="w-full">
          <TabsList className="grid grid-cols-6 w-full mb-2">
            <TabsTrigger value="renewal" className="gap-1.5"><RefreshCcw className="w-3.5 h-3.5" /> Renewal Terms</TabsTrigger>
            <TabsTrigger value="lessor" className="gap-1.5"><Building2 className="w-3.5 h-3.5" /> Lessor</TabsTrigger>
            <TabsTrigger value="lessee" className="gap-1.5"><User className="w-3.5 h-3.5" /> Lessee</TabsTrigger>
            <TabsTrigger value="asset" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Asset</TabsTrigger>
            <TabsTrigger value="financial" className="gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Financial</TabsTrigger>
            <TabsTrigger value="amortisation" className="gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Amortisation</TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Renewal Terms ── */}
          <TabsContent value="renewal">
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCcw className="w-5 h-5 text-[#e60000]" />
                <h2 className="text-base font-semibold">Renewal Terms (IFRS 16 Para 46)</h2>
              </div>
              <p className="text-sm text-muted-foreground">Override the fields below for the renewed lease. All other details are pre-populated from the existing contract and can be edited in the other tabs.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <div className="space-y-1.5">
                  <Label className={labelCls}>New Expiry Date *</Label>
                  <Input type="date" className={inputCls} value={renewal.newExpiryDate} onChange={e => setRenewal(r => ({ ...r, newExpiryDate: e.target.value }))} />
                  {renewal.newExpiryDate && <p className="text-xs text-muted-foreground">New term: {termMonths} months</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>New Monthly Payment ({financial.currency}) *</Label>
                  <Input type="number" min="0" step="0.01" className={inputCls} value={renewal.newMonthlyPayment} onChange={e => setRenewal(r => ({ ...r, newMonthlyPayment: e.target.value }))} placeholder={financial.rentAmount || "e.g. 15000.00"} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>New IBR (%) *</Label>
                  <Input type="number" min="0" step="0.0001" className={inputCls} value={renewal.newIBR} onChange={e => setRenewal(r => ({ ...r, newIBR: e.target.value }))} placeholder={financial.discountRate || "e.g. 5.0000"} />
                </div>
                <div className="space-y-1.5 col-span-full">
                  <Label className={labelCls}>Notes / Reason for Renewal</Label>
                  <Input className={inputCls} value={renewal.notes} onChange={e => setRenewal(r => ({ ...r, notes: e.target.value }))} placeholder="e.g. Renewed for 3 years at revised market rate" />
                </div>
              </div>
              {/* Quick summary */}
              {renewal.newExpiryDate && renewal.newMonthlyPayment && renewal.newIBR && (
                <div className="mt-4 grid grid-cols-3 gap-4 bg-[#e60000]/5 border border-[#e60000]/20 rounded-xl p-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Estimated Lease Liability</p>
                    <p className="font-bold text-lg">{financial.currency} {fmt(computePV(effectivePayment, effectiveIBR, termMonths))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">ROU Asset (Initial)</p>
                    <p className="font-bold text-lg">{financial.currency} {fmt(computePV(effectivePayment, effectiveIBR, termMonths))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">New Term</p>
                    <p className="font-bold text-lg">{termMonths} months</p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Tab 2: Lessor ── */}
          <TabsContent value="lessor">
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-[#e60000]" /> Lessor Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label className={labelCls}>Lessor / Company Name</Label>
                  <Input className={inputCls} value={lessor.name} onChange={e => setLessor(l => ({ ...l, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Contact Person</Label>
                  <Input className={inputCls} value={lessor.contactPerson} onChange={e => setLessor(l => ({ ...l, contactPerson: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Email</Label>
                  <Input type="email" className={inputCls} value={lessor.email} onChange={e => setLessor(l => ({ ...l, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Phone</Label>
                  <Input className={inputCls} value={lessor.phone} onChange={e => setLessor(l => ({ ...l, phone: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Country</Label>
                  <Input className={inputCls} value={lessor.country} onChange={e => setLessor(l => ({ ...l, country: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Tax ID / VAT No.</Label>
                  <Input className={inputCls} value={lessor.taxId} onChange={e => setLessor(l => ({ ...l, taxId: e.target.value }))} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab 3: Lessee ── */}
          <TabsContent value="lessee">
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold flex items-center gap-2"><User className="w-4 h-4 text-[#e60000]" /> Lessee Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className={labelCls}>Lessee Type</Label>
                  <Select value={lessee.lesseeType} onValueChange={v => setLessee(l => ({ ...l, lesseeType: v as "Staff" | "Client" | "Other" }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Staff">Staff</SelectItem>
                      <SelectItem value="Client">Client</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Lessee Name</Label>
                  <Input className={inputCls} value={lessee.lesseeName} onChange={e => setLessee(l => ({ ...l, lesseeName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Staff Number</Label>
                  <Input className={inputCls} value={lessee.staffNumber} onChange={e => setLessee(l => ({ ...l, staffNumber: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Employee ID</Label>
                  <Input className={inputCls} value={lessee.employeeId} onChange={e => setLessee(l => ({ ...l, employeeId: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Grade</Label>
                  <Input className={inputCls} value={lessee.grade} onChange={e => setLessee(l => ({ ...l, grade: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Position</Label>
                  <Input className={inputCls} value={lessee.position} onChange={e => setLessee(l => ({ ...l, position: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Department</Label>
                  <Input className={inputCls} value={lessee.department} onChange={e => setLessee(l => ({ ...l, department: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Place of Work</Label>
                  <Input className={inputCls} value={lessee.placeOfWork} onChange={e => setLessee(l => ({ ...l, placeOfWork: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Contact Email</Label>
                  <Input type="email" className={inputCls} value={lessee.contactEmail} onChange={e => setLessee(l => ({ ...l, contactEmail: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Contact Phone</Label>
                  <Input className={inputCls} value={lessee.contactPhone} onChange={e => setLessee(l => ({ ...l, contactPhone: e.target.value }))} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab 4: Asset ── */}
          <TabsContent value="asset">
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-[#e60000]" /> Asset Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className={labelCls}>Asset Type</Label>
                  <Select value={asset.assetType} onValueChange={v => setAsset(a => ({ ...a, assetType: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Asset Name / Description</Label>
                  <Input className={inputCls} value={asset.assetName} onChange={e => setAsset(a => ({ ...a, assetName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Asset Code / Tag</Label>
                  <Input className={inputCls} value={asset.assetCode} onChange={e => setAsset(a => ({ ...a, assetCode: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Location / City</Label>
                  <Input className={inputCls} value={asset.location} onChange={e => setAsset(a => ({ ...a, location: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Country</Label>
                  <Input className={inputCls} value={asset.country} onChange={e => setAsset(a => ({ ...a, country: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Maintenance By</Label>
                  <Select value={asset.maintenanceBy} onValueChange={v => setAsset(a => ({ ...a, maintenanceBy: v as "Lessor" | "Vodafone" }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lessor">Lessor</SelectItem>
                      <SelectItem value="Vodafone">Vodafone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab 5: Financial ── */}
          <TabsContent value="financial">
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-[#e60000]" /> Financial Terms</h2>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className={labelCls}>Commencement Date</Label>
                  <Input type="date" className={inputCls} value={financial.commencementDate} onChange={e => setFinancial(f => ({ ...f, commencementDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Expiry Date (current)</Label>
                  <Input type="date" className={inputCls} value={financial.endDate} onChange={e => setFinancial(f => ({ ...f, endDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Currency</Label>
                  <Select value={financial.currency} onValueChange={v => setFinancial(f => ({ ...f, currency: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Monthly Payment ({financial.currency})</Label>
                  <Input type="number" min="0" step="0.01" className={inputCls} value={financial.rentAmount} onChange={e => setFinancial(f => ({ ...f, rentAmount: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>IBR (%)</Label>
                  <Input type="number" min="0" step="0.0001" className={inputCls} value={financial.discountRate} onChange={e => setFinancial(f => ({ ...f, discountRate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Security Deposit ({financial.currency})</Label>
                  <Input type="number" min="0" step="0.01" className={inputCls} value={financial.securityDeposit} onChange={e => setFinancial(f => ({ ...f, securityDeposit: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Escalation Rate (%)</Label>
                  <Input type="number" min="0" step="0.01" className={inputCls} value={financial.escalationRate} onChange={e => setFinancial(f => ({ ...f, escalationRate: e.target.value }))} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab 6: Amortisation ── */}
          <TabsContent value="amortisation">
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-base font-semibold flex items-center gap-2"><BarChart2 className="w-4 h-4 text-[#e60000]" /> Amortisation Schedule</h2>
                <div className="flex items-center gap-2">
                  {scheduleGenerated && (
                    <div className="flex border border-border rounded-lg overflow-hidden text-sm">
                      <button onClick={() => setAmortView("monthly")} className={`px-3 py-1.5 ${amortView === "monthly" ? "bg-[#e60000] text-white" : "text-muted-foreground hover:bg-muted"}`}>Monthly</button>
                      <button onClick={() => setAmortView("yearly")} className={`px-3 py-1.5 ${amortView === "yearly" ? "bg-[#e60000] text-white" : "text-muted-foreground hover:bg-muted"}`}>Yearly</button>
                    </div>
                  )}
                  <Button onClick={handleGenerateAmortisation} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-1.5">
                    <Calculator className="w-4 h-4" /> Generate Amortisation
                  </Button>
                </div>
              </div>

              {!scheduleGenerated ? (
                <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border rounded-xl gap-3 text-muted-foreground">
                  <BarChart2 className="w-12 h-12 opacity-20" />
                  <p className="text-sm">Fill in Renewal Terms and click <strong>Generate Amortisation</strong> to compute the IFRS 16 schedule.</p>
                </div>
              ) : (
                <>
                  {/* Summary KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Lease Liability", value: `${financial.currency} ${fmt(leaseLiability)}`, color: "text-blue-400" },
                      { label: "ROU Asset", value: `${financial.currency} ${fmt(rouAsset)}`, color: "text-green-400" },
                      { label: "Term", value: `${termMonths} months`, color: "text-amber-400" },
                      { label: "Total Interest", value: `${financial.currency} ${fmt(schedule.reduce((s, r) => s + r.interest, 0))}`, color: "text-purple-400" },
                    ].map(k => (
                      <div key={k.label} className="bg-muted/30 border border-border rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">{k.label}</p>
                        <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Schedule Table */}
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-3 py-2 text-muted-foreground w-8">Calc</th>
                          <th className="text-left px-3 py-2 text-muted-foreground">Period</th>
                          <th className="text-right px-3 py-2 text-muted-foreground">Opening Liability</th>
                          <th className="text-right px-3 py-2 text-muted-foreground">Interest</th>
                          <th className="text-right px-3 py-2 text-muted-foreground">Payment</th>
                          <th className="text-right px-3 py-2 text-muted-foreground">Principal</th>
                          <th className="text-right px-3 py-2 text-muted-foreground">Closing Liability</th>
                          <th className="text-right px-3 py-2 text-muted-foreground">Depreciation</th>
                          <th className="text-right px-3 py-2 text-muted-foreground">ROU NBV</th>
                          <th className="text-left px-3 py-2 text-muted-foreground w-8">GL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {amortView === "monthly"
                          ? schedule.map((row, i) => (
                            <>
                              <tr key={row.period} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                                <td className="px-3 py-1.5">
                                  <button onClick={() => setExplainRow(row)} className="text-muted-foreground hover:text-[#e60000] transition-colors" title="Show calculation">
                                    <Info className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                                <td className="px-3 py-1.5 font-mono">{row.period}</td>
                                <td className="px-3 py-1.5 text-right">{fmt(row.opening)}</td>
                                <td className="px-3 py-1.5 text-right text-amber-400">{fmt(row.interest)}</td>
                                <td className="px-3 py-1.5 text-right">{fmt(row.payment)}</td>
                                <td className="px-3 py-1.5 text-right text-green-400">{fmt(row.principal)}</td>
                                <td className="px-3 py-1.5 text-right text-blue-400">{fmt(row.closing)}</td>
                                <td className="px-3 py-1.5 text-right text-purple-400">{fmt(row.depr)}</td>
                                <td className="px-3 py-1.5 text-right">{fmt(row.rouNBV)}</td>
                                <td className="px-3 py-1.5">
                                  <button onClick={() => setExpandedGLRows(prev => ({ ...prev, [i]: !prev[i] }))} className="text-muted-foreground hover:text-[#e60000] transition-colors" title="Show GL entries">
                                    {expandedGLRows[i] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>
                                </td>
                              </tr>
                              {expandedGLRows[i] && (
                                <tr key={`gl-${row.period}`} className="bg-muted/30">
                                  <td colSpan={10} className="px-6 py-3">
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">GL Accounting Entries — {row.period}</p>
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-muted-foreground border-b border-border">
                                          <th className="text-left py-1 pr-4">Ledger</th>
                                          <th className="text-left py-1 pr-4">Account</th>
                                          <th className="text-left py-1 pr-4">Dr/Cr</th>
                                          <th className="text-right py-1">Amount ({financial.currency})</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {getGLEntries(row).map((gl, gi) => (
                                          <tr key={gi} className="border-b border-border/30">
                                            <td className="py-1 pr-4 font-mono text-muted-foreground">{gl.ledger}</td>
                                            <td className="py-1 pr-4">{gl.dr || gl.cr}</td>
                                            <td className="py-1 pr-4">
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${gl.dr ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
                                                {gl.dr ? "DR" : "CR"}
                                              </span>
                                            </td>
                                            <td className="py-1 text-right font-mono">{fmt(gl.amount)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </>
                          ))
                          : yearlySchedule.map((yr, i) => (
                            <tr key={yr.year} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2 font-semibold">{yr.year}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                              <td className="px-3 py-2 text-right text-amber-400">{fmt(yr.totalInterest)}</td>
                              <td className="px-3 py-2 text-right">{fmt(yr.totalPayment)}</td>
                              <td className="px-3 py-2 text-right text-green-400">{fmt(yr.totalPrincipal)}</td>
                              <td className="px-3 py-2 text-right text-blue-400">{fmt(yr.closingLiability)}</td>
                              <td className="px-3 py-2 text-right text-purple-400">{fmt(yr.totalDepr)}</td>
                              <td className="px-3 py-2 text-right">{fmt(yr.rouNBV)}</td>
                              <td className="px-3 py-2"></td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Submit Bar */}
        <div className="flex items-center justify-between bg-card border border-border rounded-xl px-6 py-4">
          <div className="text-sm text-muted-foreground">
            {scheduleGenerated
              ? <span className="flex items-center gap-1.5 text-green-400"><CheckCircle2 className="w-4 h-4" /> Amortisation generated — ready to submit</span>
              : <span className="flex items-center gap-1.5"><Info className="w-4 h-4" /> Generate amortisation before submitting to verify IFRS 16 values</span>
            }
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setLocation("/leases")}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={initiateRenewalMutation.isPending}
              className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-1.5"
            >
              <RefreshCcw className="w-4 h-4" />
              {initiateRenewalMutation.isPending ? "Submitting…" : "Submit Renewal for Approval"}
            </Button>
          </div>
        </div>
      </div>

      {/* Calculation Explanation Modal */}
      {explainRow && (
        <CalcExplainModal row={explainRow} currency={financial.currency} onClose={() => setExplainRow(null)} />
      )}
    </DashboardLayout>
  );
}
