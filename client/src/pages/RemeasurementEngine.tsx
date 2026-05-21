import React, { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Calculator, CheckCircle2, AlertTriangle, BookOpen, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { groupDrCrByAmount, type JVLine } from "@/lib/jvGrouping";

export default function RemeasurementEngine() {
  const [mode, setMode] = useState<"list" | "form" | "preview">("list");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterContractId, setFilterContractId] = useState("");
  const [form, setForm] = useState({
    contractId: "",
    triggerType: "Modification",
    eventDate: new Date().toISOString().slice(0, 10),
    triggerDescription: "",
  });
  // Scope of change checkboxes
  const [scope, setScope] = useState({
    ibr: false,
    term: false,
    payment: false,
    renewal: false,
    purchase: false,
  });
  // Editable revised values
  const [revised, setRevised] = useState({
    ibr: "",
    remainingTerm: "",
    monthlyPayment: "",
    expiryDate: "",
  });
  const [preview, setPreview] = useState<any>(null);
  const [showCalcExplanation, setShowCalcExplanation] = useState(false);

  const { data: events = [], refetch } = trpc.accounting.remeasurement.list.useQuery({ status: filterStatus || undefined });
  const { data: contractsData } = trpc.lease.getLeaseRegister.useQuery({});
  const contracts = useMemo(() => (contractsData as any)?.rows ?? [], [contractsData]);

  // Fetch full contract details when a contract is selected (form mode)
  const { data: fullContractDetails } = trpc.lease.getLeaseById.useQuery(
    { contractId: Number(form.contractId) },
    { enabled: !!form.contractId }
  );
  const selectedContract = fullContractDetails as any;

  // Fetch full contract details for the list filter dropdown
  const { data: listContractDetails } = trpc.lease.getLeaseById.useQuery(
    { contractId: Number(filterContractId) },
    { enabled: !!filterContractId }
  );
  const listSelectedContract = listContractDetails as any;

  // Fetch JV entries for the selected lease
  const { data: leaseJVs } = trpc.journalVoucher.list.useQuery(
    { contract_id: Number(filterContractId), page: 1, page_size: 100 },
    { enabled: !!filterContractId }
  );

  // Fetch amortisation schedule for the selected lease
  const { data: leaseScheduleData } = trpc.lease.getAmortisationSchedule.useQuery(
    { contractId: Number(filterContractId) },
    { enabled: !!filterContractId }
  );

  // State for expanded remeasurement row (radio button)
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  // Fetch JV details for the expanded remeasurement event
  const expandedEvent = (events as any[]).find((e: any) => e.remeasurement_id === expandedEventId);


  const calculateMut = trpc.accounting.remeasurement.calculate.useMutation({
    onSuccess: (data) => {
      setPreview(data);
      setMode("preview");
    },
    onError: (e: any) => toast.error(`Calculation failed: ${e.message}`),
  });

  const executeMut = trpc.accounting.remeasurement.execute.useMutation({
    onSuccess: (data: any) => {
      refetch();
      setMode("list");
      setPreview(null);
      toast.success(`Remeasurement posted — JV ${data.jv_number ?? ''} created. Old JVs preserved.`);
    },
    onError: (e: any) => toast.error(`Execution failed: ${e.message}`),
  });

  const sendToJvMut = trpc.journalVoucher.generateRemeasurement.useMutation({
    onSuccess: (r: any) => { toast.success(`JV ${r?.jv_number} created`); },
    onError: (e: any) => toast.error(`JV generation failed: ${e.message}`),
  });

  const handleCalculate = () => {
    if (!form.contractId) { toast.error("Select a contract"); return; }
    if (!scope.ibr && !scope.term && !scope.payment && !scope.renewal && !scope.purchase) {
      toast.error("Select at least one scope of change"); return;
    }
    calculateMut.mutate({
      contract_id: Number(form.contractId),
      event_type: form.triggerType,
      event_date: form.eventDate,
      trigger_description: form.triggerDescription,
      new_ibr: scope.ibr && revised.ibr ? Number(revised.ibr) : null,
      new_remaining_term: (scope.term || scope.renewal) && revised.remainingTerm ? Number(revised.remainingTerm) : null,
      new_monthly_payment: scope.payment && revised.monthlyPayment ? Number(revised.monthlyPayment) : null,
    });
  };

  const handleConfirmPost = () => {
    executeMut.mutate({
      contract_id: Number(form.contractId),
      event_type: form.triggerType,
      event_date: form.eventDate,
      trigger_description: form.triggerDescription,
      new_ibr: scope.ibr && revised.ibr ? Number(revised.ibr) : null,
      new_remaining_term: (scope.term || scope.renewal) && revised.remainingTerm ? Number(revised.remainingTerm) : null,
      new_monthly_payment: scope.payment && revised.monthlyPayment ? Number(revised.monthlyPayment) : null,
    });
  };

  const fmt = (v: any) => v != null ? Number(v).toLocaleString("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
  const fmtPct = (v: any) => v != null ? `${(Number(v) * 100).toFixed(3)}%` : "—";
  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  // ═══ FULL-SCREEN CALC EXPLANATION ═══════════════════════════════════════════
  if (showCalcExplanation && preview?.summary) {
    const s = preview.summary;
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setShowCalcExplanation(false)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back to Preview
            </Button>
            <div>
              <h2 className="font-semibold text-lg">Calculation Logic — Remeasurement</h2>
              <p className="text-sm text-muted-foreground">Full blackboard-style calculation breakdown</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="bg-[#1a1a2e] rounded-xl p-8 font-mono text-sm text-[#ffd700] whitespace-pre-wrap leading-relaxed border border-[#ffd700]/20">
{`╔══════════════════════════════════════════════════════════════════════════════╗
║                    IFRS 16 REMEASUREMENT CALCULATION                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

Contract:  ${s.contract_ref}
Event:     ${s.event_type}
Date:      ${fmtDate(s.event_date)}
Currency:  ${s.currency}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: CURRENT OUTSTANDING BALANCES (Before Remeasurement)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Lease Liability (current balance)  = ${fmt(s.old_liability)} ${s.currency}
  ROU Asset (Net Book Value)         = ${fmt(s.old_rou_asset)} ${s.currency}
  Current IBR                        = ${fmtPct(s.old_ibr)} per annum
  Current Monthly Payment            = ${fmt(s.old_monthly_payment)} ${s.currency}
  Months Already Posted              = ${s.months_already_posted}
  Old Remaining Term                 = ${s.old_remaining_term} months

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2: CALCULATE NEW LEASE LIABILITY (Present Value of Revised Payments)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Formula:  PV = PMT × [1 - (1 + r)^(-n)] / r

  Where:
    PMT  = ${fmt(s.new_monthly_payment)} ${s.currency}  (revised monthly payment)
    r    = ${fmtPct(s.new_ibr)} ÷ 12 = ${(Number(s.new_ibr) / 12).toFixed(8)}  (monthly discount rate)
    n    = ${s.new_remaining_term} months  (revised remaining lease term)

  Calculation:
    (1 + r)^(-n)  = (1 + ${(Number(s.new_ibr) / 12).toFixed(8)})^(-${s.new_remaining_term})
                  = ${Math.pow(1 + Number(s.new_ibr) / 12, -s.new_remaining_term).toFixed(8)}

    1 - (1+r)^(-n) = ${(1 - Math.pow(1 + Number(s.new_ibr) / 12, -s.new_remaining_term)).toFixed(8)}

    Annuity Factor = [1 - (1+r)^(-n)] / r
                   = ${((1 - Math.pow(1 + Number(s.new_ibr) / 12, -s.new_remaining_term)) / (Number(s.new_ibr) / 12)).toFixed(6)}

  ┌─────────────────────────────────────────────────────────────────────┐
  │  NEW LEASE LIABILITY = ${fmt(s.new_monthly_payment)} × ${((1 - Math.pow(1 + Number(s.new_ibr) / 12, -s.new_remaining_term)) / (Number(s.new_ibr) / 12)).toFixed(6)}
  │                      = ${fmt(s.new_liability)} ${s.currency}
  └─────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3: CALCULATE ADJUSTMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Liability Adjustment  = New Liability − Old Liability
                        = ${fmt(s.new_liability)} − ${fmt(s.old_liability)}
                        = ${fmt(s.liability_adjustment)} ${s.currency}

  ROU Asset Adjustment  = ${fmt(s.rou_adjustment)} ${s.currency}
${Number(s.pnl_adjustment) !== 0 ? `
  ⚠ ROU Asset reduced to ZERO
  P&L Adjustment        = ${fmt(s.pnl_adjustment)} ${s.currency}
  (Excess recognised in Profit & Loss per IFRS 16.46(b))
` : `
  (ROU Asset absorbs the full adjustment — no P&L impact)`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4: PROSPECTIVE TREATMENT (IFRS 16.45)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ Old JVs:        PRESERVED — never reversed or modified
  ✓ Adjustment JV:  Single entry posted on ${fmtDate(s.event_date)}
  ✓ Future Schedule: Regenerated for ${s.new_remaining_term} months from event date
  ✓ Depreciation:   New ROU (${fmt(s.new_rou_asset)}) ÷ ${s.new_remaining_term} months
                   = ${fmt(Number(s.new_rou_asset) / s.new_remaining_term)} ${s.currency} per month

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JOURNAL VOUCHER ENTRY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${Number(s.liability_adjustment) > 0 ? `
  Dr.  Right-of-Use Asset (10100)     ${fmt(Math.abs(s.rou_adjustment))} ${s.currency}
  Cr.  Lease Liability (21020)        ${fmt(Math.abs(s.liability_adjustment))} ${s.currency}
` : `
  Dr.  Lease Liability (21020)        ${fmt(Math.abs(s.liability_adjustment))} ${s.currency}
  Cr.  Right-of-Use Asset (10100)     ${fmt(Math.abs(s.rou_adjustment))} ${s.currency}
${Number(s.pnl_adjustment) !== 0 ? `  Cr.  Gain on Remeasurement (40500)   ${fmt(Math.abs(s.pnl_adjustment))} ${s.currency}` : ''}`}

╔══════════════════════════════════════════════════════════════════════════════╗
║  RESULT: Lease remeasured prospectively. Schedule regenerated.             ║
╚══════════════════════════════════════════════════════════════════════════════╝`}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ═══ PREVIEW MODE — Current vs New Comparison ══════════════════════════════
  if (mode === "preview" && preview?.summary) {
    const s = preview.summary;
    const schedule = preview.schedule ?? [];
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setMode("form")} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back to Form
            </Button>
            <div>
              <h2 className="font-semibold text-lg">Current Entries vs New Adjusted Entries</h2>
              <p className="text-sm text-muted-foreground">Review before confirming — old JVs will NOT be touched</p>
            </div>
            <div className="ml-auto flex gap-3">
              <Button
                className="bg-[#ffd700] hover:bg-[#e6c200] text-black font-semibold gap-2"
                onClick={() => setShowCalcExplanation(true)}
              >
                <Calculator className="w-4 h-4" />Calc Logic
              </Button>
              <Button variant="outline" onClick={() => setMode("form")}>Edit Parameters</Button>
              <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2" onClick={handleConfirmPost} disabled={executeMut.isPending}>
                <CheckCircle2 className="w-4 h-4" />{executeMut.isPending ? "Posting..." : "Confirm & Post"}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* ─── CURRENT vs NEW Side-by-Side ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Current Entries */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-muted/30 px-4 py-3 border-b border-border">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span>
                    Current Entries (Before Remeasurement)
                  </h3>
                </div>
                <Table>
                  <TableBody>
                    <TableRow><TableCell className="text-muted-foreground text-xs w-48">Lease Liability</TableCell><TableCell className="font-mono font-semibold">{fmt(s.old_liability)} {s.currency}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground text-xs">ROU Asset (NBV)</TableCell><TableCell className="font-mono font-semibold">{fmt(s.old_rou_asset)} {s.currency}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground text-xs">IBR (Annual)</TableCell><TableCell className="font-mono">{fmtPct(s.old_ibr)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground text-xs">Monthly Payment</TableCell><TableCell className="font-mono">{fmt(s.old_monthly_payment)} {s.currency}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground text-xs">Remaining Term</TableCell><TableCell className="font-mono">{s.old_remaining_term} months</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground text-xs">Months Already Posted</TableCell><TableCell className="font-mono">{s.months_already_posted}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* New Adjusted Entries */}
              <div className="rounded-xl border border-[#ffd700]/30 overflow-hidden">
                <div className="bg-[#ffd700]/10 px-4 py-3 border-b border-[#ffd700]/30">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#ffd700] inline-block"></span>
                    New Adjusted Entries (After Remeasurement)
                  </h3>
                </div>
                <Table>
                  <TableBody>
                    <TableRow><TableCell className="text-muted-foreground text-xs w-48">Lease Liability</TableCell><TableCell className="font-mono font-semibold text-[#ffd700]">{fmt(s.new_liability)} {s.currency}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground text-xs">ROU Asset (NBV)</TableCell><TableCell className="font-mono font-semibold text-[#ffd700]">{fmt(s.new_rou_asset)} {s.currency}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground text-xs">IBR (Annual)</TableCell><TableCell className="font-mono text-[#ffd700]">{fmtPct(s.new_ibr)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground text-xs">Monthly Payment</TableCell><TableCell className="font-mono text-[#ffd700]">{fmt(s.new_monthly_payment)} {s.currency}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground text-xs">Remaining Term</TableCell><TableCell className="font-mono text-[#ffd700]">{s.new_remaining_term} months</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground text-xs">New Depreciation/mo</TableCell><TableCell className="font-mono text-[#ffd700]">{fmt(Number(s.new_rou_asset) / s.new_remaining_term)} {s.currency}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* ─── Adjustment Summary ─── */}
            <div className="rounded-xl border border-border p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Info className="w-4 h-4 text-blue-400" />Adjustment Impact</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <span className="text-xs text-muted-foreground block mb-1">Liability Change</span>
                  <span className={`font-mono font-bold text-lg ${Number(s.liability_adjustment) > 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(s.liability_adjustment)}</span>
                </div>
                <div className="text-center">
                  <span className="text-xs text-muted-foreground block mb-1">ROU Asset Change</span>
                  <span className={`font-mono font-bold text-lg ${Number(s.rou_adjustment) > 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(s.rou_adjustment)}</span>
                </div>
                <div className="text-center">
                  <span className="text-xs text-muted-foreground block mb-1">P&L Impact</span>
                  <span className={`font-mono font-bold text-lg ${Number(s.pnl_adjustment) !== 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>{Number(s.pnl_adjustment) !== 0 ? fmt(s.pnl_adjustment) : 'Nil'}</span>
                </div>
                <div className="text-center">
                  <span className="text-xs text-muted-foreground block mb-1">Event Type</span>
                  <Badge variant="outline" className="text-sm">{s.event_type}</Badge>
                </div>
              </div>
              {Number(s.pnl_adjustment) !== 0 && (
                <div className="flex items-center gap-2 p-3 mt-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-amber-300 text-xs">ROU Asset reduced to zero. Excess {fmt(Math.abs(s.pnl_adjustment))} {s.currency} recognised in P&L per IFRS 16.46(b).</span>
                </div>
              )}
            </div>

            {/* ─── Tabs: JV Preview + New Schedule ─── */}
            <Tabs defaultValue="jv" className="space-y-4">
              <TabsList>
                <TabsTrigger value="jv">Adjustment JV</TabsTrigger>
                <TabsTrigger value="schedule">New Amortisation Schedule ({schedule.length} months)</TabsTrigger>
              </TabsList>

              <TabsContent value="jv">
                <div className="rounded-xl border border-border p-5 space-y-4">
                  <h3 className="font-semibold">Adjustment Journal Voucher</h3>
                  <p className="text-sm text-muted-foreground">This single JV will be posted on {fmtDate(s.event_date)}. Existing JVs remain untouched.</p>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>#</TableHead><TableHead>Account</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit ({s.currency})</TableHead><TableHead className="text-right">Credit ({s.currency})</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {Number(s.liability_adjustment) > 0 ? (
                        <>
                          <TableRow>
                            <TableCell>1</TableCell>
                            <TableCell className="font-mono">10100</TableCell>
                            <TableCell>Right-of-Use Asset</TableCell>
                            <TableCell className="text-right font-semibold text-green-400">{fmt(Math.abs(s.rou_adjustment))}</TableCell>
                            <TableCell className="text-right">—</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>2</TableCell>
                            <TableCell className="font-mono">21020</TableCell>
                            <TableCell>Lease Liability</TableCell>
                            <TableCell className="text-right">—</TableCell>
                            <TableCell className="text-right font-semibold text-red-400">{fmt(Math.abs(s.liability_adjustment))}</TableCell>
                          </TableRow>
                        </>
                      ) : (
                        <>
                          <TableRow>
                            <TableCell>1</TableCell>
                            <TableCell className="font-mono">21020</TableCell>
                            <TableCell>Lease Liability</TableCell>
                            <TableCell className="text-right font-semibold text-green-400">{fmt(Math.abs(s.liability_adjustment))}</TableCell>
                            <TableCell className="text-right">—</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>2</TableCell>
                            <TableCell className="font-mono">10100</TableCell>
                            <TableCell>Right-of-Use Asset</TableCell>
                            <TableCell className="text-right">—</TableCell>
                            <TableCell className="text-right font-semibold text-red-400">{fmt(Math.abs(s.rou_adjustment))}</TableCell>
                          </TableRow>
                          {Number(s.pnl_adjustment) !== 0 && (
                            <TableRow>
                              <TableCell>3</TableCell>
                              <TableCell className="font-mono">40500</TableCell>
                              <TableCell>Gain on Lease Remeasurement (P&L)</TableCell>
                              <TableCell className="text-right">—</TableCell>
                              <TableCell className="text-right font-semibold text-amber-400">{fmt(Math.abs(s.pnl_adjustment))}</TableCell>
                            </TableRow>
                          )}
                        </>
                      )}
                    </TableBody>
                  </Table>
                  <div className="flex justify-between pt-3 border-t border-border text-sm">
                    <span className="text-muted-foreground">Total Debit = Total Credit</span>
                    <span className="font-semibold font-mono">{fmt(Math.abs(s.liability_adjustment))} {s.currency}</span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="schedule">
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Opening Liability</TableHead>
                          <TableHead className="text-right">Interest</TableHead>
                          <TableHead className="text-right">Payment</TableHead>
                          <TableHead className="text-right">Principal</TableHead>
                          <TableHead className="text-right">Closing Liability</TableHead>
                          <TableHead className="text-right">ROU NBV</TableHead>
                          <TableHead className="text-right">Depreciation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schedule.map((row: any) => (
                          <TableRow key={row.month_num}>
                            <TableCell className="text-muted-foreground">{row.month_num}</TableCell>
                            <TableCell>{new Date(row.period_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(row.opening_liability)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(row.interest_expense)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(row.payment)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(row.principal)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(row.closing_liability)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(row.rou_nbv)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(row.depreciation)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* IFRS 16 Note */}
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-xs text-green-300">
              <CheckCircle2 className="w-4 h-4 inline mr-2" />
              <strong>Old JVs are PRESERVED.</strong> Only a single adjustment JV will be posted. The amortisation schedule is regenerated prospectively from {fmtDate(s.event_date)}.
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ═══ FORM MODE — Step-by-step ══════════════════════════════════════════════
  if (mode === "form") {
    const d = selectedContract || {};
    const remainingMonths = d.expiry_date ? Math.max(0, Math.ceil((new Date(d.expiry_date).getTime() - Date.now()) / (1000*60*60*24*30.44))) : null;

    const FORM_STEPS = ["Select Lease", "Scope of Change", "Review & Calculate"];
    const currentFormStep = !form.contractId ? 0 : (!scope.ibr && !scope.term && !scope.payment && !scope.renewal && !scope.purchase) ? 1 : 2;

    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setMode("list")} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div className="flex-1">
              <h2 className="font-semibold text-lg">New Remeasurement</h2>
              <p className="text-sm text-muted-foreground">Select lease → Check scope of change → Review & Calculate</p>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 px-6 pt-4">
            {FORM_STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  i === currentFormStep ? "bg-[#e60000] text-white" :
                  i < currentFormStep ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {i < currentFormStep ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="w-3.5 h-3.5 flex items-center justify-center text-[10px]">{i + 1}</span>}
                  {s}
                </div>
                {i < FORM_STEPS.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* ─── STEP 1: Lease Selection ─── */}
            <div className="space-y-3">
              <h3 className="font-semibold text-base border-b border-border pb-2">Step 1 — Select Lease</h3>
              <Select value={form.contractId} onValueChange={v => { setForm(f => ({ ...f, contractId: v })); setScope({ ibr: false, term: false, payment: false, renewal: false, purchase: false }); setRevised({ ibr: "", remainingTerm: "", monthlyPayment: "", expiryDate: "" }); }}>
                <SelectTrigger className="w-full max-w-lg"><SelectValue placeholder="Choose a lease contract..." /></SelectTrigger>
                <SelectContent>
                  {contracts.map((c: any) => (
                    <SelectItem key={c.contract_id} value={String(c.contract_id)}>
                      {c.contract_ref} — {c.lessor_name || c.asset_description || `Contract ${c.contract_id}`} ({fmt(c.monthly_payment)} {c.currency}/mo)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ─── Lease Details Table (shown when contract selected) ─── */}
            {selectedContract && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2 border-b border-border">
                  <span className="text-sm font-semibold">Lease Details — {d.contract_ref}</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44">Category</TableHead>
                      <TableHead className="w-56">Field</TableHead>
                      <TableHead>Current Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Financial */}
                    <TableRow className="border-t-2"><TableCell rowSpan={7} className="align-top font-semibold text-xs uppercase tracking-wide text-muted-foreground bg-muted/20 border-r border-border">Financial</TableCell><TableCell className="text-sm">Lease Liability (Commencement)</TableCell><TableCell className="font-mono text-sm">{fmt(d.lease_liability_commence)} {d.currency}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">ROU Asset Value</TableCell><TableCell className="font-mono text-sm">{fmt(d.rou_asset_value)} {d.currency}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Monthly Payment</TableCell><TableCell className="font-mono text-sm">{fmt(d.monthly_payment)} {d.currency}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">IBR (Annual)</TableCell><TableCell className="font-mono text-sm">{d.ibr != null ? fmtPct(d.ibr) : "—"}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Escalation Rate</TableCell><TableCell className="font-mono text-sm">{d.escalation_rate != null ? `${(Number(d.escalation_rate)*100).toFixed(2)}%` : "—"}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Deposit Amount</TableCell><TableCell className="font-mono text-sm">{fmt(d.deposit_amount)} {d.currency}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Currency</TableCell><TableCell className="font-mono text-sm">{d.currency ?? "—"}</TableCell></TableRow>
                    {/* Term & Dates */}
                    <TableRow className="border-t-2"><TableCell rowSpan={5} className="align-top font-semibold text-xs uppercase tracking-wide text-muted-foreground bg-muted/20 border-r border-border">Term & Dates</TableCell><TableCell className="text-sm">Commencement Date</TableCell><TableCell className="font-mono text-sm">{fmtDate(d.commencement_date)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Expiry Date</TableCell><TableCell className="font-mono text-sm">{fmtDate(d.expiry_date)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Original Term</TableCell><TableCell className="font-mono text-sm">{d.term_months ?? "—"} months</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Remaining Term</TableCell><TableCell className="font-mono text-sm">{remainingMonths ?? "—"} months</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">IFRS 16 Classification</TableCell><TableCell className="text-sm"><Badge variant="outline">{d.ifrs16_classification ?? "—"}</Badge></TableCell></TableRow>
                    {/* Contract & Asset */}
                    <TableRow className="border-t-2"><TableCell rowSpan={4} className="align-top font-semibold text-xs uppercase tracking-wide text-muted-foreground bg-muted/20 border-r border-border">Contract & Asset</TableCell><TableCell className="text-sm">Lessor</TableCell><TableCell className="text-sm">{d.lessor_name ?? "—"}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Asset Type</TableCell><TableCell className="text-sm">{d.asset_type ?? "—"}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Asset Description</TableCell><TableCell className="text-sm">{d.asset_description ?? "—"}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Status</TableCell><TableCell className="text-sm"><Badge variant="outline">{d.status ?? "—"}</Badge></TableCell></TableRow>
                    {/* Options */}
                    <TableRow className="border-t-2"><TableCell rowSpan={4} className="align-top font-semibold text-xs uppercase tracking-wide text-muted-foreground bg-muted/20 border-r border-border">Options</TableCell><TableCell className="text-sm">Renewal Option</TableCell><TableCell className="text-sm">{d.renewal_option ? "Yes" : "No"}{d.renewal_certain ? " (Certain)" : ""}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Purchase Option</TableCell><TableCell className="text-sm">{d.purchase_option ? "Yes" : "No"}{d.purchase_certain ? " (Certain)" : ""}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Make-Good Obligation</TableCell><TableCell className="text-sm">{d.make_good_obligation ? `Yes (${fmt(d.make_good_estimate)})` : "No"}</TableCell></TableRow>
                    <TableRow><TableCell className="text-sm">Maintenance</TableCell><TableCell className="text-sm">{d.maintenance_responsibility ?? "—"}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </div>
            )}

            {/* ─── STEP 2: Scope of Change ─── */}
            {selectedContract && (
              <div className="space-y-4">
                <h3 className="font-semibold text-base border-b border-border pb-2">Step 2 — Scope of Change</h3>
                <p className="text-xs text-muted-foreground mb-3">Select what is changing in this remeasurement event. The selected fields will become editable below.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Scope checkboxes */}
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-[#ffd700]/50 transition-colors">
                    <Checkbox id="scope-ibr" checked={scope.ibr} onCheckedChange={(v) => setScope(s => ({ ...s, ibr: !!v }))} />
                    <div>
                      <label htmlFor="scope-ibr" className="text-sm font-medium cursor-pointer">Change IBR / Discount Rate</label>
                      <p className="text-xs text-muted-foreground">Revised incremental borrowing rate</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-[#ffd700]/50 transition-colors">
                    <Checkbox id="scope-term" checked={scope.term} onCheckedChange={(v) => setScope(s => ({ ...s, term: !!v }))} />
                    <div>
                      <label htmlFor="scope-term" className="text-sm font-medium cursor-pointer">Change Lease Term</label>
                      <p className="text-xs text-muted-foreground">Extension, reduction, or reassessment</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-[#ffd700]/50 transition-colors">
                    <Checkbox id="scope-payment" checked={scope.payment} onCheckedChange={(v) => setScope(s => ({ ...s, payment: !!v }))} />
                    <div>
                      <label htmlFor="scope-payment" className="text-sm font-medium cursor-pointer">Change Monthly Payment</label>
                      <p className="text-xs text-muted-foreground">Rent review, index adjustment, modification</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-[#ffd700]/50 transition-colors">
                    <Checkbox id="scope-renewal" checked={scope.renewal} onCheckedChange={(v) => setScope(s => ({ ...s, renewal: !!v }))} />
                    <div>
                      <label htmlFor="scope-renewal" className="text-sm font-medium cursor-pointer">Exercise Renewal Option</label>
                      <p className="text-xs text-muted-foreground">Now reasonably certain to renew</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-[#ffd700]/50 transition-colors">
                    <Checkbox id="scope-purchase" checked={scope.purchase} onCheckedChange={(v) => setScope(s => ({ ...s, purchase: !!v }))} />
                    <div>
                      <label htmlFor="scope-purchase" className="text-sm font-medium cursor-pointer">Exercise Purchase Option</label>
                      <p className="text-xs text-muted-foreground">Now reasonably certain to purchase</p>
                    </div>
                  </div>
                </div>

                {/* Trigger type and date */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trigger Type</Label>
                    <Select value={form.triggerType} onValueChange={v => setForm(f => ({ ...f, triggerType: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Modification", "IBR Change", "Rent Review", "Extension", "Termination", "Index/Rate Change", "Purchase Option"].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remeasurement Date</Label>
                    <Input className="mt-1" type="date" value={form.eventDate} onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description / Reason</Label>
                    <Input className="mt-1" placeholder="e.g., Renewal option exercised" value={form.triggerDescription} onChange={e => setForm(f => ({ ...f, triggerDescription: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            {/* ─── STEP 3: Revised Values (editable based on scope) ─── */}
            {selectedContract && (scope.ibr || scope.term || scope.payment || scope.renewal || scope.purchase) && (
              <div className="space-y-4">
                <h3 className="font-semibold text-base border-b border-border pb-2">Step 3 — Enter Revised Values</h3>
                <p className="text-xs text-muted-foreground">Only the fields within scope of change are editable below.</p>
                
                <div className="rounded-xl border border-[#ffd700]/30 overflow-hidden">
                  <div className="bg-[#ffd700]/10 px-4 py-2 border-b border-[#ffd700]/30">
                    <span className="text-sm font-semibold text-[#ffd700]">Revised Parameters</span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-56">Parameter</TableHead>
                        <TableHead className="w-48">Current Value</TableHead>
                        <TableHead className="w-48">New Value</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* IBR Row */}
                      <TableRow className={!scope.ibr ? "opacity-40" : ""}>
                        <TableCell className="text-sm font-medium">IBR (Annual, decimal)</TableCell>
                        <TableCell className="font-mono text-sm">{d.ibr != null ? String(d.ibr) : "—"}</TableCell>
                        <TableCell>
                          {scope.ibr ? (
                            <Input className="h-8 w-40 font-mono text-sm border-[#ffd700]/50 focus:border-[#ffd700]" type="number" step="0.001" placeholder={d.ibr ? String(d.ibr) : "0.065"} value={revised.ibr} onChange={e => setRevised(r => ({ ...r, ibr: e.target.value }))} />
                          ) : <span className="text-muted-foreground text-xs">Not in scope</span>}
                        </TableCell>
                        <TableCell>{scope.ibr ? <Badge className="bg-[#ffd700]/20 text-[#ffd700] border-[#ffd700]/30">Changing</Badge> : <Badge variant="outline" className="text-muted-foreground">Unchanged</Badge>}</TableCell>
                      </TableRow>
                      {/* Term Row */}
                      <TableRow className={!(scope.term || scope.renewal) ? "opacity-40" : ""}>
                        <TableCell className="text-sm font-medium">Remaining Term (months)</TableCell>
                        <TableCell className="font-mono text-sm">{remainingMonths ?? "—"}</TableCell>
                        <TableCell>
                          {(scope.term || scope.renewal) ? (
                            <Input className="h-8 w-40 font-mono text-sm border-[#ffd700]/50 focus:border-[#ffd700]" type="number" placeholder={remainingMonths ? String(remainingMonths) : "36"} value={revised.remainingTerm} onChange={e => setRevised(r => ({ ...r, remainingTerm: e.target.value }))} />
                          ) : <span className="text-muted-foreground text-xs">Not in scope</span>}
                        </TableCell>
                        <TableCell>{(scope.term || scope.renewal) ? <Badge className="bg-[#ffd700]/20 text-[#ffd700] border-[#ffd700]/30">Changing</Badge> : <Badge variant="outline" className="text-muted-foreground">Unchanged</Badge>}</TableCell>
                      </TableRow>
                      {/* Payment Row */}
                      <TableRow className={!scope.payment ? "opacity-40" : ""}>
                        <TableCell className="text-sm font-medium">Monthly Payment ({d.currency})</TableCell>
                        <TableCell className="font-mono text-sm">{fmt(d.monthly_payment)}</TableCell>
                        <TableCell>
                          {scope.payment ? (
                            <Input className="h-8 w-40 font-mono text-sm border-[#ffd700]/50 focus:border-[#ffd700]" type="number" step="0.01" placeholder={d.monthly_payment ? String(d.monthly_payment) : "0"} value={revised.monthlyPayment} onChange={e => setRevised(r => ({ ...r, monthlyPayment: e.target.value }))} />
                          ) : <span className="text-muted-foreground text-xs">Not in scope</span>}
                        </TableCell>
                        <TableCell>{scope.payment ? <Badge className="bg-[#ffd700]/20 text-[#ffd700] border-[#ffd700]/30">Changing</Badge> : <Badge variant="outline" className="text-muted-foreground">Unchanged</Badge>}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* IFRS 16 Guidance */}
                <div className="rounded-lg border border-[#ffd700]/30 bg-[#ffd700]/5 p-3 text-xs">
                  <span className="font-semibold text-[#ffd700]">IFRS 16 Guidance:</span>
                  {form.triggerType === "Modification" && <span className="ml-2">A change in scope/consideration not part of original terms. Remeasure liability with revised payments at revised discount rate.</span>}
                  {form.triggerType === "IBR Change" && <span className="ml-2">Change in discount rate. Remeasure liability using revised IBR for remaining payments.</span>}
                  {form.triggerType === "Rent Review" && <span className="ml-2">Periodic rent review resulting in changed lease payments. Remeasure with new payment at current IBR.</span>}
                  {form.triggerType === "Extension" && <span className="ml-2">Lessee exercises renewal option or becomes reasonably certain to do so. Extend term and remeasure.</span>}
                  {form.triggerType === "Termination" && <span className="ml-2">Early termination or partial scope reduction. Reduce term and remeasure; gain/loss to P&L for scope reduction.</span>}
                  {form.triggerType === "Index/Rate Change" && <span className="ml-2">Variable payments linked to index/rate (e.g., CPI). Remeasure when actual payments change.</span>}
                  {form.triggerType === "Purchase Option" && <span className="ml-2">Lessee now reasonably certain to exercise purchase option. Add exercise price to payments and remeasure.</span>}
                </div>
              </div>
            )}

            {/* ─── Actions ─── */}
            {selectedContract && (
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setMode("list")}>Cancel</Button>
                <Button
                  className="bg-[#ffd700] hover:bg-[#e6c200] text-black font-semibold gap-2 px-6"
                  onClick={handleCalculate}
                  disabled={calculateMut.isPending || (!scope.ibr && !scope.term && !scope.payment && !scope.renewal && !scope.purchase)}
                >
                  <Calculator className="w-4 h-4" />{calculateMut.isPending ? "Calculating..." : "Calculate & Preview"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ═══ LIST MODE ══════════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFLRMSENG0001P001"
          title="Remeasurement Engine"
          subtitle="IFRS 16 lease liability remeasurement — prospective treatment, old JVs preserved"
          screenType="remeasurement_engine"
          actions={
            <Button onClick={() => { setForm({ contractId: "", triggerType: "Modification", eventDate: new Date().toISOString().slice(0, 10), triggerDescription: "" }); setScope({ ibr: false, term: false, payment: false, renewal: false, purchase: false }); setRevised({ ibr: "", remainingTerm: "", monthlyPayment: "", expiryDate: "" }); setPreview(null); setMode("form"); }} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg">
              <Calculator className="w-4 h-4" />New Remeasurement
            </Button>
          }
        />

        {/* Filters Row */}
        <div className="flex gap-3 flex-wrap">
          <Select value={filterContractId || "all"} onValueChange={v => setFilterContractId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-80"><SelectValue placeholder="Select Lease" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leases</SelectItem>
              {contracts.map((c: any) => (
                <SelectItem key={c.contract_id} value={String(c.contract_id)}>
                  {c.contract_ref} — {c.lessor_name || c.asset_description || `Contract ${c.contract_id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus || "all"} onValueChange={v => setFilterStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["PENDING", "CALCULATED", "POSTED"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {filterContractId && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setFilterContractId("")}>Clear Filter</Button>
          )}
        </div>

        {/* ═══ WHEN LEASE SELECTED: Show Full Origination Details ═══ */}
        {listSelectedContract && (
          <Tabs defaultValue="details" className="space-y-4">
            <TabsList>
              <TabsTrigger value="details">Lease Details</TabsTrigger>
              <TabsTrigger value="jv_entries">Original JV Entries ({(leaseJVs as any)?.rows?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="schedule">Amortisation Schedule ({(leaseScheduleData as any)?.schedule?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="remeasurements">Remeasurement Events ({(events as any[]).filter(e => String(e.contract_id) === filterContractId).length})</TabsTrigger>
            </TabsList>

            {/* Tab 1: Full Lease Details */}
            <TabsContent value="details">
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2 border-b border-border">
                  <span className="text-sm font-semibold">Lease Details — {listSelectedContract.contract_ref}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-4 p-4 text-sm">
                  <div><span className="text-muted-foreground block text-xs">Lease Liability</span><span className="font-mono font-semibold">{fmt(listSelectedContract.lease_liability_commence)}</span></div>
                  <div><span className="text-muted-foreground block text-xs">ROU Asset</span><span className="font-mono font-semibold">{fmt(listSelectedContract.rou_asset_value)}</span></div>
                  <div><span className="text-muted-foreground block text-xs">IBR</span><span className="font-mono font-semibold">{listSelectedContract.ibr != null ? fmtPct(listSelectedContract.ibr) : '—'}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Monthly Payment</span><span className="font-mono font-semibold">{fmt(listSelectedContract.monthly_payment)} {listSelectedContract.currency}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Classification</span><Badge variant="outline">{listSelectedContract.ifrs16_classification ?? '—'}</Badge></div>
                  <div><span className="text-muted-foreground block text-xs">Commencement</span><span className="font-mono">{fmtDate(listSelectedContract.commencement_date)}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Expiry</span><span className="font-mono">{fmtDate(listSelectedContract.expiry_date)}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Term</span><span className="font-mono">{listSelectedContract.term_months ?? '—'} months</span></div>
                  <div><span className="text-muted-foreground block text-xs">Lessor</span><span>{listSelectedContract.lessor_name ?? '—'}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Asset</span><span className="text-xs">{listSelectedContract.asset_description ?? '—'}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Currency</span><span className="font-mono">{listSelectedContract.currency ?? '—'}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Escalation Rate</span><span className="font-mono">{listSelectedContract.escalation_rate != null ? `${(Number(listSelectedContract.escalation_rate) * 100).toFixed(2)}%` : '—'}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Deposit</span><span className="font-mono">{fmt(listSelectedContract.deposit_amount)}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Renewal Option</span><Badge variant="outline">{listSelectedContract.renewal_option ? 'Yes' : 'No'}</Badge></div>
                  <div><span className="text-muted-foreground block text-xs">Status</span><Badge variant="outline">{listSelectedContract.status ?? '—'}</Badge></div>
                </div>
              </div>
            </TabsContent>

            {/* Tab 2: Original JV Entries */}
            <TabsContent value="jv_entries">
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2 border-b border-border">
                  <span className="text-sm font-semibold">Journal Voucher Entries — {listSelectedContract.contract_ref}</span>
                </div>
                {(leaseJVs as any)?.rows?.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>JV Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Posted Date</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {(leaseJVs as any).rows.map((jv: any) => (
                        <TableRow key={jv.jv_id}>
                          <TableCell className="font-mono text-xs font-semibold">{jv.jv_number}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{jv.jv_type}</Badge></TableCell>
                          <TableCell className="text-xs">{jv.period_year}/{String(jv.period_month).padStart(2, '0')}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{jv.description}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(jv.total_amount)}</TableCell>
                          <TableCell>
                            <Badge className={jv.status === 'POSTED' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}>{jv.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{jv.posted_at ? new Date(jv.posted_at).toLocaleDateString() : jv.created_at ? new Date(jv.created_at).toLocaleDateString() : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-8 text-center text-muted-foreground text-sm">No journal entries posted for this lease yet. Generate inception JV from the Lease Transaction Centre.</div>
                )}
                {/* JV Lines detail */}
                {(leaseJVs as any)?.allLines?.length > 0 && (
                  <div className="border-t border-border">
                    <div className="bg-muted/20 px-4 py-2 border-b border-border">
                      <span className="text-xs font-semibold">All JV Lines (Dr/Cr Detail)</span>
                    </div>
                    <div className="max-h-[400px] overflow-auto">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead className="text-xs">JV#</TableHead>
                          <TableHead className="text-xs">Account</TableHead>
                          <TableHead className="text-xs">Account Name</TableHead>
                          <TableHead className="text-xs">Dr/Cr</TableHead>
                          <TableHead className="text-xs text-right">Debit</TableHead>
                          <TableHead className="text-xs text-right">Credit</TableHead>
                          <TableHead className="text-xs">Description</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {(() => {
                            const groups = groupDrCrByAmount((leaseJVs as any).allLines as JVLine[]);
                            return groups.map((group, gIdx) => {
                              const allLines = [...group.drLines, ...group.crLines];
                              return allLines.map((line: any, idx: number) => (
                                <TableRow key={`${gIdx}-${idx}`} className={`${line.dr_cr === 'DR' ? 'bg-emerald-500/5' : 'bg-rose-500/5'} ${idx === 0 && gIdx > 0 ? 'border-t-2 border-amber-500/20' : ''}`}>
                                  <TableCell className="font-mono text-xs">{line.jv_number ?? ''}</TableCell>
                                  <TableCell className="font-mono text-xs font-semibold">{line.account_code}</TableCell>
                                  <TableCell className="text-xs">{line.account_name ?? line.description ?? ''}</TableCell>
                                  <TableCell>
                                    <Badge className={line.dr_cr === 'DR' ? 'bg-emerald-500/20 text-emerald-400 text-xs' : 'bg-rose-500/20 text-rose-400 text-xs'}>
                                      {line.dr_cr}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs font-semibold text-emerald-500">
                                    {line.dr_cr === 'DR' ? fmt(line.amount) : '\u2014'}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs font-semibold text-rose-500">
                                    {line.dr_cr === 'CR' ? fmt(line.amount) : '\u2014'}
                                  </TableCell>
                                  <TableCell className="text-xs max-w-[200px] truncate">{line.line_description ?? ''}</TableCell>
                                </TableRow>
                              ));
                            });
                          })()}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 3: Amortisation Schedule */}
            <TabsContent value="schedule">
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2 border-b border-border">
                  <span className="text-sm font-semibold">Amortisation Schedule — {listSelectedContract.contract_ref}</span>
                </div>
                {(leaseScheduleData as any)?.schedule?.length > 0 ? (
                  <div className="max-h-[500px] overflow-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Period</TableHead>
                        <TableHead className="text-xs text-right">Opening Liability</TableHead>
                        <TableHead className="text-xs text-right">Interest</TableHead>
                        <TableHead className="text-xs text-right">Payment</TableHead>
                        <TableHead className="text-xs text-right">Principal</TableHead>
                        <TableHead className="text-xs text-right">Closing Liability</TableHead>
                        <TableHead className="text-xs text-right">ROU NBV</TableHead>
                        <TableHead className="text-xs text-right">Depreciation</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {(leaseScheduleData as any).schedule.map((row: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="text-xs font-mono">{row.period_date ? new Date(row.period_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : `Month ${idx + 1}`}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(row.opening_liability)}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-amber-400">{fmt(row.interest_expense)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(row.payment)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(row.principal)}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold">{fmt(row.closing_liability)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmt(row.rou_nbv)}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-blue-400">{fmt(row.depreciation)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground text-sm">No amortisation schedule generated for this lease yet. Run amortisation from the Lease Transaction Centre.</div>
                )}
              </div>
            </TabsContent>

            {/* Tab 4: Remeasurement Events */}
            <TabsContent value="remeasurements">
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Old Liability</TableHead>
                    <TableHead className="text-right">New Liability</TableHead>
                    <TableHead className="text-right">Adjustment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(events as any[]).filter(e => String(e.contract_id) === filterContractId).map((e: any) => (
                      <React.Fragment key={e.remeasurement_id}>
                        <TableRow className={expandedEventId === e.remeasurement_id ? 'bg-muted/30' : ''}>
                          <TableCell>
                            <input
                              type="radio"
                              name="remeasurement_select"
                              checked={expandedEventId === e.remeasurement_id}
                              onChange={() => setExpandedEventId(expandedEventId === e.remeasurement_id ? null : e.remeasurement_id)}
                              className="w-4 h-4 accent-[#ffd700]"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{e.contract_ref || e.contract_id}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{e.event_type}</Badge></TableCell>
                          <TableCell>{e.event_date ? new Date(e.event_date).toLocaleDateString() : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(e.old_liability)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(e.new_liability)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(e.liability_adjustment)}</TableCell>
                          <TableCell>
                            <Badge className={e.status === "POSTED" ? "bg-green-500/20 text-green-400" : e.status === "CALCULATED" ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"}>
                              {e.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {e.status === "CALCULATED" && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sendToJvMut.mutate({ remeasurement_id: e.remeasurement_id })}>
                                  <BookOpen className="w-3 h-3 mr-1" />Post
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-[#ffd700] hover:bg-[#e6c200] text-black font-semibold gap-1"
                                onClick={() => {
                                  const explanation = {
                                    summary: {
                                      contract_ref: e.contract_ref,
                                      event_type: e.event_type,
                                      event_date: e.event_date,
                                      currency: e.currency || "QAR",
                                      old_liability: e.old_liability,
                                      new_liability: e.new_liability,
                                      liability_adjustment: e.liability_adjustment,
                                      old_rou_asset: e.old_rou_asset,
                                      new_rou_asset: e.new_rou_asset,
                                      rou_adjustment: e.rou_adjustment,
                                      pnl_adjustment: e.pnl_adjustment || 0,
                                      old_ibr: e.old_ibr,
                                      new_ibr: e.new_ibr,
                                      old_monthly_payment: e.old_monthly_payment,
                                      new_monthly_payment: e.new_monthly_payment,
                                      old_remaining_term: e.old_remaining_term,
                                      new_remaining_term: e.new_remaining_term,
                                      months_already_posted: e.months_already_posted || 0,
                                      jv_description: e.jv_description || "",
                                    },
                                    schedule: [],
                                  };
                                  setPreview(explanation);
                                  setShowCalcExplanation(true);
                                }}
                              >
                                <Calculator className="w-3 h-3" />Calc
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {/* Expanded row: Show old JV vs new adjustment JV */}
                        {expandedEventId === e.remeasurement_id && (
                          <TableRow>
                            <TableCell colSpan={9} className="p-0">
                              <div className="bg-muted/20 p-4 border-t border-border space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Old Entries (Before) */}
                                  <div className="rounded-lg border border-border overflow-hidden">
                                    <div className="bg-red-500/10 px-3 py-2 border-b border-border">
                                      <span className="text-xs font-semibold text-red-400">OLD ENTRIES (Before Remeasurement)</span>
                                    </div>
                                    <div className="p-3 space-y-2 text-xs">
                                      <div className="grid grid-cols-3 gap-2">
                                        <div><span className="text-muted-foreground block">Lease Liability</span><span className="font-mono font-semibold">{fmt(e.old_liability)}</span></div>
                                        <div><span className="text-muted-foreground block">ROU Asset</span><span className="font-mono font-semibold">{fmt(e.old_rou_asset)}</span></div>
                                        <div><span className="text-muted-foreground block">IBR</span><span className="font-mono font-semibold">{e.old_ibr != null ? fmtPct(e.old_ibr) : '—'}</span></div>
                                        <div><span className="text-muted-foreground block">Monthly Payment</span><span className="font-mono">{fmt(e.old_monthly_payment)}</span></div>
                                        <div><span className="text-muted-foreground block">Remaining Term</span><span className="font-mono">{e.old_remaining_term ?? '—'} months</span></div>
                                        <div><span className="text-muted-foreground block">Months Posted</span><span className="font-mono">{e.months_already_posted ?? '—'}</span></div>
                                      </div>
                                    </div>
                                  </div>
                                  {/* New Entries (After) */}
                                  <div className="rounded-lg border border-border overflow-hidden">
                                    <div className="bg-green-500/10 px-3 py-2 border-b border-border">
                                      <span className="text-xs font-semibold text-green-400">NEW ADJUSTED ENTRIES (After Remeasurement)</span>
                                    </div>
                                    <div className="p-3 space-y-2 text-xs">
                                      <div className="grid grid-cols-3 gap-2">
                                        <div><span className="text-muted-foreground block">Lease Liability</span><span className="font-mono font-semibold">{fmt(e.new_liability)}</span></div>
                                        <div><span className="text-muted-foreground block">ROU Asset</span><span className="font-mono font-semibold">{fmt(e.new_rou_asset)}</span></div>
                                        <div><span className="text-muted-foreground block">IBR</span><span className="font-mono font-semibold">{e.new_ibr != null ? fmtPct(e.new_ibr) : '—'}</span></div>
                                        <div><span className="text-muted-foreground block">Monthly Payment</span><span className="font-mono">{fmt(e.new_monthly_payment)}</span></div>
                                        <div><span className="text-muted-foreground block">Remaining Term</span><span className="font-mono">{e.new_remaining_term ?? '—'} months</span></div>
                                        <div><span className="text-muted-foreground block">Adjustment</span><span className="font-mono font-semibold text-amber-400">{fmt(e.liability_adjustment)}</span></div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {/* Adjustment JV */}
                                <div className="rounded-lg border border-amber-500/30 overflow-hidden">
                                  <div className="bg-amber-500/10 px-3 py-2 border-b border-amber-500/30">
                                    <span className="text-xs font-semibold text-amber-400">ADJUSTMENT JOURNAL VOUCHER — {e.jv_number ?? 'Pending'}</span>
                                  </div>
                                  <div className="p-3">
                                    <Table>
                                      <TableHeader><TableRow>
                                        <TableHead className="text-xs">Account</TableHead>
                                        <TableHead className="text-xs">Description</TableHead>
                                        <TableHead className="text-xs text-right">Debit</TableHead>
                                        <TableHead className="text-xs text-right">Credit</TableHead>
                                      </TableRow></TableHeader>
                                      <TableBody>
                                        {Number(e.liability_adjustment) < 0 ? (
                                          <>
                                            <TableRow>
                                              <TableCell className="font-mono text-xs">21020</TableCell>
                                              <TableCell className="text-xs">Lease Liability</TableCell>
                                              <TableCell className="text-right font-mono text-xs text-red-400">{fmt(Math.abs(Number(e.liability_adjustment)))}</TableCell>
                                              <TableCell className="text-right">—</TableCell>
                                            </TableRow>
                                            <TableRow>
                                              <TableCell className="font-mono text-xs">10100</TableCell>
                                              <TableCell className="text-xs">Right-of-Use Asset</TableCell>
                                              <TableCell className="text-right">—</TableCell>
                                              <TableCell className="text-right font-mono text-xs text-green-400">{fmt(Math.abs(Number(e.liability_adjustment)))}</TableCell>
                                            </TableRow>
                                          </>
                                        ) : (
                                          <>
                                            <TableRow>
                                              <TableCell className="font-mono text-xs">10100</TableCell>
                                              <TableCell className="text-xs">Right-of-Use Asset</TableCell>
                                              <TableCell className="text-right font-mono text-xs text-red-400">{fmt(Math.abs(Number(e.liability_adjustment)))}</TableCell>
                                              <TableCell className="text-right">—</TableCell>
                                            </TableRow>
                                            <TableRow>
                                              <TableCell className="font-mono text-xs">21020</TableCell>
                                              <TableCell className="text-xs">Lease Liability</TableCell>
                                              <TableCell className="text-right">—</TableCell>
                                              <TableCell className="text-right font-mono text-xs text-green-400">{fmt(Math.abs(Number(e.liability_adjustment)))}</TableCell>
                                            </TableRow>
                                          </>
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground italic">Old JVs remain untouched. This is a prospective adjustment per IFRS 16.45.</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                    {(events as any[]).filter(e => String(e.contract_id) === filterContractId).length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No remeasurement events for this lease — click "New Remeasurement" to begin</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* When no lease selected: show all remeasurement events */}
        {!filterContractId && (
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Old Liability</TableHead>
                <TableHead className="text-right">New Liability</TableHead>
                <TableHead className="text-right">Adjustment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(events as any[]).map((e: any) => (
                  <React.Fragment key={e.remeasurement_id}>
                    <TableRow className={expandedEventId === e.remeasurement_id ? 'bg-muted/30' : ''}>
                      <TableCell>
                        <input
                          type="radio"
                          name="remeasurement_select_all"
                          checked={expandedEventId === e.remeasurement_id}
                          onChange={() => setExpandedEventId(expandedEventId === e.remeasurement_id ? null : e.remeasurement_id)}
                          className="w-4 h-4 accent-[#ffd700]"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{e.contract_ref || e.contract_id}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{e.event_type}</Badge></TableCell>
                      <TableCell>{e.event_date ? new Date(e.event_date).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmt(e.old_liability)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmt(e.new_liability)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmt(e.liability_adjustment)}</TableCell>
                      <TableCell>
                        <Badge className={e.status === "POSTED" ? "bg-green-500/20 text-green-400" : e.status === "CALCULATED" ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"}>
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {e.status === "CALCULATED" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sendToJvMut.mutate({ remeasurement_id: e.remeasurement_id })}>
                              <BookOpen className="w-3 h-3 mr-1" />Post
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-[#ffd700] hover:bg-[#e6c200] text-black font-semibold gap-1"
                            onClick={() => {
                              const explanation = {
                                summary: {
                                  contract_ref: e.contract_ref,
                                  event_type: e.event_type,
                                  event_date: e.event_date,
                                  currency: e.currency || "QAR",
                                  old_liability: e.old_liability,
                                  new_liability: e.new_liability,
                                  liability_adjustment: e.liability_adjustment,
                                  old_rou_asset: e.old_rou_asset,
                                  new_rou_asset: e.new_rou_asset,
                                  rou_adjustment: e.rou_adjustment,
                                  pnl_adjustment: e.pnl_adjustment || 0,
                                  old_ibr: e.old_ibr,
                                  new_ibr: e.new_ibr,
                                  old_monthly_payment: e.old_monthly_payment,
                                  new_monthly_payment: e.new_monthly_payment,
                                  old_remaining_term: e.old_remaining_term,
                                  new_remaining_term: e.new_remaining_term,
                                  months_already_posted: e.months_already_posted || 0,
                                  jv_description: e.jv_description || "",
                                },
                                schedule: [],
                              };
                              setPreview(explanation);
                              setShowCalcExplanation(true);
                            }}
                          >
                            <Calculator className="w-3 h-3" />Calc
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Expanded row: Show old JV vs new adjustment JV */}
                    {expandedEventId === e.remeasurement_id && (
                      <TableRow>
                        <TableCell colSpan={9} className="p-0">
                          <div className="bg-muted/20 p-4 border-t border-border space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Old Entries */}
                              <div className="rounded-lg border border-border overflow-hidden">
                                <div className="bg-red-500/10 px-3 py-2 border-b border-border">
                                  <span className="text-xs font-semibold text-red-400">OLD ENTRIES (Before)</span>
                                </div>
                                <div className="p-3 text-xs">
                                  <div className="grid grid-cols-3 gap-2">
                                    <div><span className="text-muted-foreground block">Liability</span><span className="font-mono font-semibold">{fmt(e.old_liability)}</span></div>
                                    <div><span className="text-muted-foreground block">ROU Asset</span><span className="font-mono font-semibold">{fmt(e.old_rou_asset)}</span></div>
                                    <div><span className="text-muted-foreground block">IBR</span><span className="font-mono">{e.old_ibr != null ? fmtPct(e.old_ibr) : '—'}</span></div>
                                    <div><span className="text-muted-foreground block">Payment</span><span className="font-mono">{fmt(e.old_monthly_payment)}</span></div>
                                    <div><span className="text-muted-foreground block">Term</span><span className="font-mono">{e.old_remaining_term ?? '—'} mo</span></div>
                                  </div>
                                </div>
                              </div>
                              {/* New Entries */}
                              <div className="rounded-lg border border-border overflow-hidden">
                                <div className="bg-green-500/10 px-3 py-2 border-b border-border">
                                  <span className="text-xs font-semibold text-green-400">NEW ENTRIES (After)</span>
                                </div>
                                <div className="p-3 text-xs">
                                  <div className="grid grid-cols-3 gap-2">
                                    <div><span className="text-muted-foreground block">Liability</span><span className="font-mono font-semibold">{fmt(e.new_liability)}</span></div>
                                    <div><span className="text-muted-foreground block">ROU Asset</span><span className="font-mono font-semibold">{fmt(e.new_rou_asset)}</span></div>
                                    <div><span className="text-muted-foreground block">IBR</span><span className="font-mono">{e.new_ibr != null ? fmtPct(e.new_ibr) : '—'}</span></div>
                                    <div><span className="text-muted-foreground block">Payment</span><span className="font-mono">{fmt(e.new_monthly_payment)}</span></div>
                                    <div><span className="text-muted-foreground block">Term</span><span className="font-mono">{e.new_remaining_term ?? '—'} mo</span></div>
                                    <div><span className="text-muted-foreground block">Adjustment</span><span className="font-mono font-semibold text-amber-400">{fmt(e.liability_adjustment)}</span></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground italic">Old JVs preserved. Prospective adjustment per IFRS 16.45.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
                {(events as any[]).length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No remeasurement events — click "New Remeasurement" to begin</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* IFRS 16 Reference */}
        <div className="rounded-xl border border-border/50 p-4 bg-muted/20">
          <h4 className="text-sm font-semibold mb-2">IFRS 16 Remeasurement Rules</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
            <div><span className="font-semibold text-foreground block mb-1">Prospective Treatment</span>Old JVs are never reversed. Adjustment is a single entry on the remeasurement date.</div>
            <div><span className="font-semibold text-foreground block mb-1">ROU Asset Adjustment</span>Normally offsets liability change. If ROU goes to zero, excess recognised in P&L (IFRS 16.46b).</div>
            <div><span className="font-semibold text-foreground block mb-1">Schedule Regeneration</span>Future amortisation recalculated from event date using revised IBR, term, and payments.</div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
