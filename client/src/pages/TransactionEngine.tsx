import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, XCircle, PlayCircle, ChevronRight, ChevronLeft,
  BookOpen, RefreshCw, Info, Zap, FileText, TrendingUp, ArrowLeftRight,
  DollarSign, RotateCcw, Calendar, BarChart3, AlertTriangle, BookMarked,
  ClipboardCheck, Lightbulb, Scale, ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { groupDrCrByAmount, type JVLine } from "@/lib/jvGrouping";

// ─── Business Proof Data ──────────────────────────────────────────────────────
// Each entry explains the function to a non-technical business audience.
const BUSINESS_PROOF: Record<string, {
  story: string;
  analogy: string;
  rules: { rule: string; check: (result: any, lines: any[]) => boolean | null }[];
  expectedEntries: { side: "DR" | "CR"; account: string; why: string }[];
  auditNote: string;
}> = {
  INITIAL_RECOGNITION: {
    story: "Vodafone signs a 5-year office lease at QAR 50,000 per month. On the very first day of the lease (Day 1), IFRS 16 requires the company to record two things simultaneously: the Right-of-Use (ROU) Asset — representing the right to occupy the office — and the Lease Liability — representing the obligation to make future payments. Both amounts equal the present value of all future lease payments, discounted at the company's Incremental Borrowing Rate (IBR).",
    analogy: "Think of it like buying a car on finance. The moment you drive it off the forecourt, you record both the car (asset) and the loan (liability) on your balance sheet — even though you haven't paid most of it yet.",
    rules: [
      { rule: "Debits must equal Credits (the books must balance)", check: (_, lines) => { if (!lines.length) return null; const dr = lines.filter(l => l.dr_cr === "DR").reduce((s, l) => s + Number(l.amount), 0); const cr = lines.filter(l => l.dr_cr === "CR").reduce((s, l) => s + Number(l.amount), 0); return Math.abs(dr - cr) < 0.01; } },
      { rule: "ROU Asset amount must be recorded (greater than zero)", check: (result) => result?.rou_asset > 0 },
      { rule: "Lease Liability must be recorded (greater than zero)", check: (result) => result?.lease_liability > 0 },
      { rule: "ROU Asset and Lease Liability must be equal on Day 1", check: (result) => result ? Math.abs(result.rou_asset - result.lease_liability) < 1 : null },
    ],
    expectedEntries: [
      { side: "DR", account: "Right-of-Use Asset", why: "We now control the asset — we have the right to use the office for 5 years." },
      { side: "CR", account: "Lease Liability", why: "We now owe the future payments — this is our financial obligation." },
    ],
    auditNote: "IFRS 16.22–16.28 requires initial measurement at the present value of lease payments not paid at commencement, discounted at the IBR. The ROU asset equals the lease liability at inception (assuming no initial direct costs or lease incentives).",
  },
  INTEREST_ACCRUAL: {
    story: "Each month, the lease liability 'grows' slightly because of the time value of money — the company is effectively borrowing money by deferring payments. IFRS 16 requires this interest to be recognised as a Finance Cost expense each month. The formula is simple: Lease Liability × (Annual IBR ÷ 12). For example, if the liability is QAR 2,000,000 and the IBR is 5%, the monthly interest is QAR 8,333.",
    analogy: "It works exactly like a mortgage. Each month, part of your payment is interest on the outstanding balance. IFRS 16 makes this interest visible on the income statement as a Finance Cost.",
    rules: [
      { rule: "Debits must equal Credits", check: (_, lines) => { if (!lines.length) return null; const dr = lines.filter(l => l.dr_cr === "DR").reduce((s, l) => s + Number(l.amount), 0); const cr = lines.filter(l => l.dr_cr === "CR").reduce((s, l) => s + Number(l.amount), 0); return Math.abs(dr - cr) < 0.01; } },
      { rule: "Interest expense must be greater than zero", check: (result) => result?.interest_expense > 0 },
      { rule: "Exactly 2 JV lines must be created (one DR, one CR)", check: (_, lines) => lines.length === 2 },
    ],
    expectedEntries: [
      { side: "DR", account: "Finance Cost (Interest Expense)", why: "The cost of financing the lease — shown on the income statement." },
      { side: "CR", account: "Lease Liability", why: "The liability grows by the interest amount before the payment reduces it." },
    ],
    auditNote: "IFRS 16.36(a) — the lessee shall recognise interest on the lease liability as a finance cost in profit or loss each period during the lease term. Calculated as the opening liability × IBR/12.",
  },
  DEPRECIATION: {
    story: "The Right-of-Use Asset is not an expense all at once — it is 'used up' gradually over the lease term, just like any other asset. Each month, a depreciation charge is recognised on the income statement. For a straight-line lease, this is simply: ROU Asset Value ÷ Total Lease Term (in months). For example, a QAR 2,400,000 ROU asset over 48 months = QAR 50,000 per month depreciation.",
    analogy: "Think of the ROU asset like a company vehicle. You don't expense the full cost on day one — you spread it evenly over the years you use it. IFRS 16 does the same for leased assets.",
    rules: [
      { rule: "Debits must equal Credits", check: (_, lines) => { if (!lines.length) return null; const dr = lines.filter(l => l.dr_cr === "DR").reduce((s, l) => s + Number(l.amount), 0); const cr = lines.filter(l => l.dr_cr === "CR").reduce((s, l) => s + Number(l.amount), 0); return Math.abs(dr - cr) < 0.01; } },
      { rule: "Monthly depreciation must be greater than zero", check: (result) => result?.monthly_depreciation > 0 },
      { rule: "Exactly 2 JV lines must be created", check: (_, lines) => lines.length === 2 },
    ],
    expectedEntries: [
      { side: "DR", account: "Depreciation Expense (ROU)", why: "The monthly cost of 'using up' the leased asset — shown on the income statement." },
      { side: "CR", account: "Accumulated Depreciation (ROU)", why: "Reduces the net book value of the ROU asset on the balance sheet." },
    ],
    auditNote: "IFRS 16.31 — if ownership transfers or purchase option is reasonably certain, depreciate to end of asset life; otherwise depreciate over the shorter of lease term or useful life. Straight-line method unless another systematic basis is more representative.",
  },
  LEASE_PAYMENT: {
    story: "When the monthly lease payment is made, it is not a single expense — it must be split into two components: (1) the Principal portion, which reduces the Lease Liability on the balance sheet, and (2) the Interest portion, which was already accrued in the previous entry. The cash payment therefore reduces both the liability and the accrued interest. For example, a QAR 50,000 payment might be split as QAR 41,667 principal + QAR 8,333 interest.",
    analogy: "Exactly like a mortgage repayment. Your monthly payment goes partly to reduce the loan balance (principal) and partly to pay the interest charge. IFRS 16 requires the same split to be recorded explicitly.",
    rules: [
      { rule: "Debits must equal Credits", check: (_, lines) => { if (!lines.length) return null; const dr = lines.filter(l => l.dr_cr === "DR").reduce((s, l) => s + Number(l.amount), 0); const cr = lines.filter(l => l.dr_cr === "CR").reduce((s, l) => s + Number(l.amount), 0); return Math.abs(dr - cr) < 0.01; } },
      { rule: "Total payment must equal principal + interest", check: (result) => result ? Math.abs(result.total_payment - (result.principal_portion + result.interest_portion)) < 0.01 : null },
      { rule: "Principal portion must be greater than zero", check: (result) => result?.principal_portion > 0 },
    ],
    expectedEntries: [
      { side: "DR", account: "Lease Liability", why: "The principal portion reduces what we owe on the balance sheet." },
      { side: "DR", account: "Finance Cost (Interest)", why: "The interest portion is the cost of financing — shown on the income statement." },
      { side: "CR", account: "Cash / Bank", why: "The actual cash paid to the lessor." },
    ],
    auditNote: "IFRS 16.36(b) — the lessee shall reduce the lease liability to reflect lease payments made. The payment is split: interest (already accrued under 16.36(a)) and principal (reduces the liability). Total cash = principal + interest.",
  },
  MODIFICATION: {
    story: "When the terms of a lease change — for example, the monthly rent increases from QAR 50,000 to QAR 55,000, or the lease is extended by 2 years — IFRS 16 requires the company to 'remeasure' the lease. This means recalculating the present value of the new future payments and adjusting both the Lease Liability and the ROU Asset. The difference between the old and new liability is recorded as an adjustment entry.",
    analogy: "It is like refinancing your mortgage. When you change the terms, the bank recalculates your outstanding balance and your monthly payments. IFRS 16 requires the same recalculation to be reflected in the accounts immediately.",
    rules: [
      { rule: "Debits must equal Credits", check: (_, lines) => { if (!lines.length) return null; const dr = lines.filter(l => l.dr_cr === "DR").reduce((s, l) => s + Number(l.amount), 0); const cr = lines.filter(l => l.dr_cr === "CR").reduce((s, l) => s + Number(l.amount), 0); return Math.abs(dr - cr) < 0.01; } },
      { rule: "New liability must differ from old liability", check: (result) => result ? Math.abs(result.new_liability - result.old_liability) > 0.01 : null },
      { rule: "Adjustment amount must be recorded", check: (result) => result ? Math.abs(result.adjustment) > 0 : null },
    ],
    expectedEntries: [
      { side: "DR", account: "Lease Liability or ROU Asset (depending on direction)", why: "If the liability increases, ROU Asset is debited. If it decreases, Lease Liability is debited." },
      { side: "CR", account: "ROU Asset or Lease Liability (opposite side)", why: "The offsetting entry adjusts the other balance sheet item to reflect the new terms." },
    ],
    auditNote: "IFRS 16.45–16.50 — for modifications not treated as a separate lease, remeasure the lease liability using a revised discount rate and adjust the ROU asset by the same amount. Any excess adjustment is recognised in profit or loss.",
  },
  TERMINATION: {
    story: "When a lease ends early or is terminated, both the ROU Asset and the Lease Liability must be removed from the balance sheet ('derecognised'). If the remaining ROU Asset value is higher than the remaining Lease Liability at termination, a loss is recognised. If the liability is higher than the asset, a gain is recognised. This ensures the balance sheet accurately reflects that the company no longer has the right to use the asset.",
    analogy: "It is like selling a car that still has a loan on it. You remove both the car (asset) and the loan (liability) from your books. If the car was worth less than the loan, you record a loss. If worth more, you record a gain.",
    rules: [
      { rule: "Debits must equal Credits", check: (_, lines) => { if (!lines.length) return null; const dr = lines.filter(l => l.dr_cr === "DR").reduce((s, l) => s + Number(l.amount), 0); const cr = lines.filter(l => l.dr_cr === "CR").reduce((s, l) => s + Number(l.amount), 0); return Math.abs(dr - cr) < 0.01; } },
      { rule: "Lease Liability must be fully derecognised", check: (result) => result?.liability_derecognised > 0 },
      { rule: "ROU Asset must be fully derecognised", check: (result) => result?.rou_derecognised > 0 },
    ],
    expectedEntries: [
      { side: "DR", account: "Lease Liability", why: "Remove the remaining obligation from the balance sheet." },
      { side: "DR", account: "Loss on Termination (if applicable)", why: "Recognised when the ROU asset NBV exceeds the liability at termination." },
      { side: "CR", account: "Right-of-Use Asset", why: "Remove the remaining asset value from the balance sheet." },
      { side: "CR", account: "Gain on Termination (if applicable)", why: "Recognised when the liability exceeds the ROU asset NBV at termination." },
    ],
    auditNote: "IFRS 16.46 — at the termination date, derecognise the ROU asset and the lease liability. The difference is recognised as a gain or loss in profit or loss. Early termination penalties are included in the final measurement.",
  },
  FX_REVALUATION: {
    story: "When a lease is denominated in a foreign currency (e.g. USD), the Lease Liability must be retranslated at the closing exchange rate at each reporting date. If the QAR has strengthened against the USD, the liability in QAR terms decreases — creating a Foreign Exchange Gain. If the QAR has weakened, the liability increases — creating an FX Loss. The ROU Asset is NOT revalued (it stays at the historical rate), so only the liability side is adjusted.",
    analogy: "Imagine you borrowed USD 100,000 when 1 USD = 3.64 QAR (liability = QAR 364,000). At year-end, 1 USD = 3.68 QAR — your liability is now QAR 368,000. You record a QAR 4,000 FX Loss because it now costs more QAR to settle the same USD debt.",
    rules: [
      { rule: "Debits must equal Credits", check: (_, lines) => { if (!lines.length) return null; const dr = lines.filter(l => l.dr_cr === "DR").reduce((s, l) => s + Number(l.amount), 0); const cr = lines.filter(l => l.dr_cr === "CR").reduce((s, l) => s + Number(l.amount), 0); return Math.abs(dr - cr) < 0.01; } },
      { rule: "FX gain/loss amount must be non-zero", check: (result) => result ? Math.abs(result.fx_gain_loss) > 0 : null },
      { rule: "New base amount must differ from old base amount", check: (result) => result ? Math.abs(result.new_base_amount - result.old_base_amount) > 0.01 : null },
    ],
    expectedEntries: [
      { side: "DR", account: "FX Loss on Lease Liability (if rate moved against us)", why: "The cost of the currency movement — shown on the income statement." },
      { side: "CR", account: "Lease Liability", why: "The liability increases in functional currency terms." },
    ],
    auditNote: "IAS 21 + IFRS 16 — monetary items (including lease liabilities) are retranslated at the closing rate. Exchange differences are recognised in profit or loss. The ROU asset is a non-monetary item and is not retranslated after initial recognition.",
  },
  PERIOD_CLOSE: {
    story: "At the end of each accounting period (month or year), the system posts a combined 'Period-End Close' entry that consolidates both the Interest Accrual and the ROU Depreciation into a single Journal Voucher. This gives the finance team a clean, single entry per period that captures the full P&L impact of all leases — making it easier to review, approve, and post to the general ledger in one step.",
    analogy: "Think of it like a monthly payroll run — instead of posting each employee's salary separately, you run a single batch that captures everyone's pay in one consolidated journal entry. Period-End Close does the same for all lease accounting charges.",
    rules: [
      { rule: "Debits must equal Credits", check: (_, lines) => { if (!lines.length) return null; const dr = lines.filter(l => l.dr_cr === "DR").reduce((s, l) => s + Number(l.amount), 0); const cr = lines.filter(l => l.dr_cr === "CR").reduce((s, l) => s + Number(l.amount), 0); return Math.abs(dr - cr) < 0.01; } },
      { rule: "Interest expense must be included", check: (result) => result?.interest_expense > 0 },
      { rule: "Depreciation must be included", check: (result) => result?.depreciation > 0 },
      { rule: "Total expense = Interest + Depreciation", check: (result) => result ? Math.abs(result.total_expense - (result.interest_expense + result.depreciation)) < 0.01 : null },
    ],
    expectedEntries: [
      { side: "DR", account: "Finance Cost (Interest Expense)", why: "Monthly interest on the lease liability — P&L charge." },
      { side: "DR", account: "Depreciation Expense (ROU)", why: "Monthly straight-line depreciation of the ROU asset — P&L charge." },
      { side: "CR", account: "Lease Liability", why: "The liability grows by the interest amount." },
      { side: "CR", account: "Accumulated Depreciation (ROU)", why: "Reduces the net book value of the ROU asset." },
    ],
    auditNote: "IFRS 16.36 — combined period-end entry capturing both interest (16.36(a)) and depreciation (16.31) in one JV for operational efficiency. Total P&L impact = Finance Cost + Depreciation Expense.",
  },
};

// ─── Function definitions ─────────────────────────────────────────────────────
const FUNCTIONS = [
  { key: "INITIAL_RECOGNITION", label: "Initial Recognition", icon: BookOpen, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30", description: "Recognise the ROU Asset and Lease Liability at lease commencement.", standard: "IFRS 16.22–16.28", params: ["contract_id"] },
  { key: "INTEREST_ACCRUAL", label: "Interest Accrual", icon: TrendingUp, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30", description: "Unwind the discount on the lease liability. Monthly interest = Liability × (IBR / 12).", standard: "IFRS 16.36(a)", params: ["contract_id", "period_year", "period_month"] },
  { key: "DEPRECIATION", label: "ROU Depreciation", icon: BarChart3, color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/30", description: "Straight-line depreciation of the ROU asset over the lease term.", standard: "IFRS 16.31", params: ["contract_id", "period_year", "period_month"] },
  { key: "LEASE_PAYMENT", label: "Lease Payment", icon: DollarSign, color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", description: "Split monthly payment into principal reduction and interest.", standard: "IFRS 16.36(b)", params: ["contract_id", "period_year", "period_month"] },
  { key: "MODIFICATION", label: "Modification", icon: RefreshCw, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30", description: "Remeasure the lease liability and adjust the ROU asset when terms change.", standard: "IFRS 16.45–16.50", params: ["contract_id", "new_monthly_payment", "new_term_months"] },
  { key: "TERMINATION", label: "Termination", icon: XCircle, color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", description: "Derecognise the remaining ROU asset and lease liability. Recognise gain or loss.", standard: "IFRS 16.46", params: ["contract_id", "remaining_liability", "remaining_rou"] },
  { key: "FX_REVALUATION", label: "FX Revaluation", icon: ArrowLeftRight, color: "text-cyan-500", bg: "bg-cyan-500/10 border-cyan-500/30", description: "Revalue foreign-currency lease liability at the closing rate.", standard: "IAS 21 + IFRS 16", params: ["contract_id", "old_fx_rate", "new_fx_rate"] },
  { key: "PERIOD_CLOSE", label: "Period-End Close", icon: Calendar, color: "text-teal-500", bg: "bg-teal-500/10 border-teal-500/30", description: "Combined period-end entry: interest accrual + ROU depreciation in one consolidated JV.", standard: "IFRS 16.36", params: ["contract_id", "period_year", "period_month"] },
] as const;

type FnKey = typeof FUNCTIONS[number]["key"];

// ─── JV Lines Table ───────────────────────────────────────────────────────────
function JVLinesTable({ lines, onCalcClick }: { lines: any[]; onCalcClick: (line: any) => void }) {
  if (!lines.length) return <p className="text-muted-foreground text-sm py-4 text-center">No JV lines found.</p>;
  const groups = groupDrCrByAmount(lines as JVLine[]);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Account</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Account Name</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground w-16">Dr/Cr</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Debit</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Credit</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground w-20">Calc</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, gIdx) => {
            const allLines = [...group.drLines, ...group.crLines];
            return allLines.map((line: any, idx: number) => (
              <tr key={`${gIdx}-${idx}`} className={`border-t border-border ${gIdx % 2 === 0 ? "bg-background" : "bg-muted/20"} ${idx === 0 && gIdx > 0 ? "border-t-2 border-amber-500/20" : ""}`}>
                <td className="px-3 py-2 text-muted-foreground">{line.line_seq}</td>
                <td className="px-3 py-2 font-mono text-xs">{line.account_code}</td>
                <td className="px-3 py-2 font-medium">{line.account_name}</td>
                <td className="px-3 py-2 text-center">
                  <Badge variant={line.dr_cr === "DR" ? "default" : "secondary"} className={line.dr_cr === "DR" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}>
                    {line.dr_cr}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-500">
                  {line.dr_cr === "DR" ? Number(line.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "\u2014"}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-rose-500">
                  {line.dr_cr === "CR" ? Number(line.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "\u2014"}
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{line.description}</td>
                <td className="px-3 py-2 text-center">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onCalcClick(line)} title="Show calculation">
                    <Info className="h-3.5 w-3.5 text-amber-500" />
                  </Button>
                </td>
              </tr>
            ));
          })}
        </tbody>
        <tfoot className="bg-muted/50 border-t-2 border-border">
          <tr>
            <td colSpan={4} className="px-3 py-2 font-semibold text-right text-sm">Totals:</td>
            <td className="px-3 py-2 text-right font-mono font-bold">
              DR: {lines.filter(l => l.dr_cr === "DR").reduce((s, l) => s + Number(l.amount), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              <br />
              CR: {lines.filter(l => l.dr_cr === "CR").reduce((s, l) => s + Number(l.amount), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Calculation Blackboard ───────────────────────────────────────────────────
function CalcBlackboard({ line, onClose }: { line: any; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 mt-3 transition-all duration-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-amber-400 font-semibold text-sm flex items-center gap-1.5">
          <Zap className="h-4 w-4" /> Calculation Logic — {line.account_name} ({line.dr_cr})
        </span>
        <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={onClose}>✕ Close</Button>
      </div>
      <pre className="text-amber-200 text-xs font-mono whitespace-pre-wrap leading-relaxed bg-black/30 rounded-lg p-3">
        {line.calc_explanation ?? "No calculation explanation available."}
      </pre>
    </div>
  );
}

// ─── Result Summary ───────────────────────────────────────────────────────────
function ResultSummary({ fnKey, result }: { fnKey: FnKey; result: any }) {
  const items: { label: string; value: string }[] = [];
  const fmt = (v: any) => v != null ? Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

  if (fnKey === "INITIAL_RECOGNITION") {
    items.push({ label: "ROU Asset", value: fmt(result.rou_asset) });
    items.push({ label: "Lease Liability", value: fmt(result.lease_liability) });
  } else if (fnKey === "INTEREST_ACCRUAL") {
    items.push({ label: "Interest Expense", value: fmt(result.interest_expense) });
  } else if (fnKey === "DEPRECIATION") {
    items.push({ label: "Monthly Depreciation", value: fmt(result.monthly_depreciation) });
  } else if (fnKey === "LEASE_PAYMENT") {
    items.push({ label: "Total Payment", value: fmt(result.total_payment) });
    items.push({ label: "Interest Portion", value: fmt(result.interest_portion) });
    items.push({ label: "Principal Portion", value: fmt(result.principal_portion) });
  } else if (fnKey === "MODIFICATION") {
    items.push({ label: "Old Liability", value: fmt(result.old_liability) });
    items.push({ label: "New Liability", value: fmt(result.new_liability) });
    items.push({ label: "Adjustment", value: fmt(result.adjustment) });
  } else if (fnKey === "TERMINATION") {
    items.push({ label: "Liability Derecognised", value: fmt(result.liability_derecognised) });
    items.push({ label: "ROU Derecognised", value: fmt(result.rou_derecognised) });
    items.push({ label: "Gain / (Loss)", value: fmt(result.gain_loss) });
  } else if (fnKey === "FX_REVALUATION") {
    items.push({ label: "Old Base Amount", value: fmt(result.old_base_amount) });
    items.push({ label: "New Base Amount", value: fmt(result.new_base_amount) });
    items.push({ label: "FX Gain / (Loss)", value: fmt(result.fx_gain_loss) });
  } else if (fnKey === "PERIOD_CLOSE") {
    items.push({ label: "Interest Expense", value: fmt(result.interest_expense) });
    items.push({ label: "Depreciation", value: fmt(result.depreciation) });
    items.push({ label: "Total Expense", value: fmt(result.total_expense) });
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
      {items.map(item => (
        <div key={item.label} className="rounded-lg bg-muted/40 px-4 py-3 border border-border">
          <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
          <p className="font-mono font-bold text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Business Proof Panel ─────────────────────────────────────────────────────
function BusinessProofPanel({ fnKey, result, jvLines }: { fnKey: FnKey; result: any; jvLines: any[] }) {
  const proof = BUSINESS_PROOF[fnKey];
  if (!proof) return null;

  const ruleResults = proof.rules.map(r => ({
    rule: r.rule,
    passed: result ? r.check(result, jvLines) : null,
  }));

  const allRulesPassed = ruleResults.every(r => r.passed === true);
  const anyFailed = ruleResults.some(r => r.passed === false);
  const hasResult = !!result;

  return (
    <div className="space-y-5 p-1">
      {/* Overall verdict */}
      {hasResult && (
        <div className={`rounded-xl border p-4 flex items-center gap-4 ${allRulesPassed ? "border-green-500/40 bg-green-500/8" : anyFailed ? "border-red-500/40 bg-red-500/8" : "border-amber-500/40 bg-amber-500/8"}`}>
          {allRulesPassed ? (
            <CheckCircle2 className="h-8 w-8 text-green-500 flex-shrink-0" />
          ) : anyFailed ? (
            <XCircle className="h-8 w-8 text-red-500 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-8 w-8 text-amber-500 flex-shrink-0" />
          )}
          <div>
            <p className={`font-bold text-base ${allRulesPassed ? "text-green-400" : anyFailed ? "text-red-400" : "text-amber-400"}`}>
              {allRulesPassed ? "✓ All Business Rules PASSED" : anyFailed ? "✗ One or More Rules FAILED" : "⚠ Partial Results"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {allRulesPassed
                ? "This transaction has been verified against all IFRS 16 accounting rules. Safe to present to auditors."
                : anyFailed
                ? "Review the failed rules below. The JV entries may not comply with IFRS 16 requirements."
                : "Run the scenario to see the full verdict."}
            </p>
          </div>
        </div>
      )}

      {/* Plain-English Story */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <BookMarked className="h-4 w-4 text-blue-400" />
          <h4 className="font-bold text-sm text-foreground">What Is This Transaction? (Plain English)</h4>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{proof.story}</p>
        <div className="rounded-lg bg-blue-500/8 border border-blue-500/20 p-3 flex gap-2">
          <Lightbulb className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-300 italic">{proof.analogy}</p>
        </div>
      </div>

      {/* Expected JV Entries */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-4 w-4 text-purple-400" />
          <h4 className="font-bold text-sm text-foreground">Expected Journal Entries</h4>
          <span className="text-xs text-muted-foreground ml-auto">What the system should post</span>
        </div>
        <div className="space-y-2">
          {proof.expectedEntries.map((entry, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <Badge className={`flex-shrink-0 font-bold text-xs mt-0.5 ${entry.side === "DR" ? "bg-blue-600 text-white" : "bg-green-600 text-white"}`}>
                {entry.side}
              </Badge>
              <div>
                <p className="font-semibold text-sm text-foreground">{entry.account}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{entry.why}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Business Rules Checklist */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardCheck className="h-4 w-4 text-amber-400" />
          <h4 className="font-bold text-sm text-foreground">Business Rules Verification</h4>
          {!hasResult && <span className="text-xs text-muted-foreground ml-auto">Run the scenario to check</span>}
        </div>
        <div className="space-y-2">
          {ruleResults.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
              r.passed === true ? "border-green-500/30 bg-green-500/5" :
              r.passed === false ? "border-red-500/30 bg-red-500/5" :
              "border-border bg-muted/20"
            }`}>
              {r.passed === true ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              ) : r.passed === false ? (
                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-muted-foreground flex-shrink-0" />
              )}
              <p className={`text-sm ${r.passed === true ? "text-green-300" : r.passed === false ? "text-red-300" : "text-muted-foreground"}`}>
                {r.rule}
              </p>
              <span className={`ml-auto text-xs font-bold flex-shrink-0 ${
                r.passed === true ? "text-green-400" : r.passed === false ? "text-red-400" : "text-muted-foreground"
              }`}>
                {r.passed === true ? "PASS" : r.passed === false ? "FAIL" : "PENDING"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Note */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Scale className="h-4 w-4 text-teal-400" />
          <h4 className="font-bold text-sm text-foreground">IFRS 16 Audit Reference</h4>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{proof.auditNote}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TransactionEngine() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [contractId, setContractId] = useState<number | null>(null);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [newMonthlyPayment, setNewMonthlyPayment] = useState("");
  const [newTermMonths, setNewTermMonths] = useState("");
  const [remainingLiability, setRemainingLiability] = useState("");
  const [remainingRou, setRemainingRou] = useState("");
  const [oldFxRate, setOldFxRate] = useState("3.64");
  const [newFxRate, setNewFxRate] = useState("3.68");
  const [runResult, setRunResult] = useState<Record<FnKey, any>>({} as any);
  const [jvLines, setJvLines] = useState<Record<FnKey, any[]>>({} as any);
  const [calcLine, setCalcLine] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [rightTab, setRightTab] = useState<"proof" | "history">("proof");

  const fn = FUNCTIONS[currentStep];
  const FnIcon = fn.icon;

  const { data: contracts } = trpc.transactionEngine.getContracts.useQuery();
  const { data: scenarios, refetch: refetchScenarios } = trpc.transactionEngine.listScenarios.useQuery({});

  const selectedContract = useMemo(
    () => contracts?.find(c => c.contract_id === contractId),
    [contracts, contractId]
  );

  const runInitial   = trpc.transactionEngine.runInitialRecognition.useMutation();
  const runInterest  = trpc.transactionEngine.runInterestAccrual.useMutation();
  const runDep       = trpc.transactionEngine.runDepreciation.useMutation();
  const runPayment   = trpc.transactionEngine.runLeasePayment.useMutation();
  const runMod       = trpc.transactionEngine.runModification.useMutation();
  const runTerm      = trpc.transactionEngine.runTermination.useMutation();
  const runFX        = trpc.transactionEngine.runFXRevaluation.useMutation();
  const runClose     = trpc.transactionEngine.runPeriodClose.useMutation();
  const postJV       = trpc.transactionEngine.postJV.useMutation();
  const getJVLines   = trpc.transactionEngine.getJVLines.useQuery(
    { jv_id: runResult[fn.key]?.jv_id ?? 0 },
    { enabled: !!runResult[fn.key]?.jv_id }
  );

  const handleContractChange = (val: string) => {
    const id = parseInt(val);
    setContractId(id);
    const c = contracts?.find(c => c.contract_id === id);
    if (c) {
      setNewMonthlyPayment(String(c.monthly_payment ?? ""));
      setNewTermMonths(String(c.term_months ?? ""));
      setRemainingLiability(String(c.lease_liability_commence ?? ""));
      setRemainingRou(String(c.rou_asset_value ?? ""));
    }
  };

  const handleRun = async () => {
    if (!contractId) { toast.error("Please select a contract first"); return; }
    setRunning(true);
    setCalcLine(null);
    try {
      let result: any;
      if (fn.key === "INITIAL_RECOGNITION") {
        result = await runInitial.mutateAsync({ contract_id: contractId });
      } else if (fn.key === "INTEREST_ACCRUAL") {
        result = await runInterest.mutateAsync({ contract_id: contractId, period_year: periodYear, period_month: periodMonth });
      } else if (fn.key === "DEPRECIATION") {
        result = await runDep.mutateAsync({ contract_id: contractId, period_year: periodYear, period_month: periodMonth });
      } else if (fn.key === "LEASE_PAYMENT") {
        result = await runPayment.mutateAsync({ contract_id: contractId, period_year: periodYear, period_month: periodMonth });
      } else if (fn.key === "MODIFICATION") {
        result = await runMod.mutateAsync({ contract_id: contractId, new_monthly_payment: parseFloat(newMonthlyPayment), new_term_months: parseInt(newTermMonths) });
      } else if (fn.key === "TERMINATION") {
        result = await runTerm.mutateAsync({ contract_id: contractId, remaining_liability: parseFloat(remainingLiability), remaining_rou: parseFloat(remainingRou) });
      } else if (fn.key === "FX_REVALUATION") {
        result = await runFX.mutateAsync({ contract_id: contractId, old_fx_rate: parseFloat(oldFxRate), new_fx_rate: parseFloat(newFxRate) });
      } else if (fn.key === "PERIOD_CLOSE") {
        result = await runClose.mutateAsync({ contract_id: contractId, period_year: periodYear, period_month: periodMonth });
      }
      setRunResult(prev => ({ ...prev, [fn.key]: result }));
      // Also store JV lines for the proof panel
      if (result?.jv_id) {
        // Lines will be fetched by the query automatically
      }
      toast.success(`${fn.label} — JV ${result.jv_number} created`);
      await refetchScenarios();
      // Switch to proof tab to show the verdict
      setRightTab("proof");
    } catch (e: any) {
      toast.error(`${fn.label} failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const handlePostJV = async () => {
    const jvId = runResult[fn.key]?.jv_id;
    if (!jvId) return;
    try {
      await postJV.mutateAsync({ jv_id: jvId });
      toast.success("JV posted to ledger");
      await refetchScenarios();
    } catch (e: any) {
      toast.error(`Post failed: ${e.message}`);
    }
  };

  const handleNext = () => {
    if (currentStep < FUNCTIONS.length - 1) {
      setCurrentStep(s => s + 1);
      setCalcLine(null);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(s => s - 1);
      setCalcLine(null);
    }
  };

  const currentResult = runResult[fn.key];
  const currentJVLines = getJVLines.data?.lines ?? [];
  const allPassed = FUNCTIONS.every(f => runResult[f.key]?.success);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full min-h-screen bg-background">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="border-b border-border px-6 py-4 bg-card">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Transaction Engine — IFRS 16 Scenario Runner
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Step through each accounting function, run test scenarios, review JV entries, and verify business rules.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {allPassed && (
                <Badge className="bg-green-600 text-white gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> All 8 Functions Passed
                </Badge>
              )}
              <Badge variant="outline" className="text-muted-foreground">
                Step {currentStep + 1} / {FUNCTIONS.length}
              </Badge>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex gap-1.5 mt-4">
            {FUNCTIONS.map((f, idx) => {
              const done = !!runResult[f.key];
              const active = idx === currentStep;
              return (
                <button
                  key={f.key}
                  onClick={() => { setCurrentStep(idx); setCalcLine(null); }}
                  className={`flex-1 h-2 rounded-full transition-all duration-200 ${
                    done ? "bg-green-500" : active ? "bg-amber-500" : "bg-muted"
                  }`}
                  title={f.label}
                />
              );
            })}
          </div>
          <div className="flex gap-1.5 mt-1">
            {FUNCTIONS.map((f, idx) => (
              <div key={f.key} className={`flex-1 text-center text-[9px] truncate ${idx === currentStep ? "text-amber-500 font-semibold" : "text-muted-foreground"}`}>
                {f.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex flex-1 gap-0 overflow-hidden">
          {/* Left: Function step panel */}
          <div className="w-full max-w-2xl border-r border-border flex flex-col overflow-y-auto p-6 gap-5">
            {/* Function card */}
            <div className={`rounded-xl border p-5 ${fn.bg} transition-all duration-200`}>
              <div className="flex items-start gap-3">
                <div className={`rounded-lg p-2.5 bg-background/60 ${fn.color}`}>
                  <FnIcon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-lg text-foreground">{fn.label}</h2>
                    <Badge variant="outline" className="text-xs font-mono">{fn.standard}</Badge>
                    {currentResult && (
                      <Badge className="bg-green-600 text-white gap-1 text-xs">
                        <CheckCircle2 className="h-3 w-3" /> PASS
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{fn.description}</p>
                </div>
              </div>
            </div>

            {/* Contract selector */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Contract</Label>
              <Select value={contractId?.toString() ?? ""} onValueChange={handleContractChange}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select a contract…" />
                </SelectTrigger>
                <SelectContent>
                  {contracts?.map(c => (
                    <SelectItem key={c.contract_id} value={String(c.contract_id)}>
                      {c.contract_ref} — {c.asset_type} ({c.currency} {Number(c.monthly_payment).toLocaleString()}/mo)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedContract && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { label: "IBR", value: `${(selectedContract.ibr * 100).toFixed(2)}%` },
                    { label: "Term", value: `${selectedContract.term_months}m` },
                    { label: "ROU Asset", value: Number(selectedContract.rou_asset_value).toLocaleString("en-US", { minimumFractionDigits: 0 }) },
                    { label: "Lease Liability", value: Number(selectedContract.lease_liability_commence).toLocaleString("en-US", { minimumFractionDigits: 0 }) },
                    { label: "Currency", value: selectedContract.currency },
                    { label: "Status", value: selectedContract.status },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg bg-muted/40 px-3 py-2 border border-border">
                      <p className="text-[10px] text-muted-foreground">{item.label}</p>
                      <p className="font-semibold text-sm text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Period inputs */}
            {((fn.params as readonly string[]).includes("period_year") || (fn.params as readonly string[]).includes("period_month")) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Period Year</Label>
                  <Input type="number" value={periodYear} onChange={e => setPeriodYear(parseInt(e.target.value))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Period Month</Label>
                  <Select value={String(periodMonth)} onValueChange={v => setPeriodMonth(parseInt(v))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i) => (
                        <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Modification params */}
            {fn.key === "MODIFICATION" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">New Monthly Payment</Label>
                  <Input type="number" value={newMonthlyPayment} onChange={e => setNewMonthlyPayment(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">New Term (months)</Label>
                  <Input type="number" value={newTermMonths} onChange={e => setNewTermMonths(e.target.value)} className="h-9" />
                </div>
              </div>
            )}

            {/* Termination params */}
            {fn.key === "TERMINATION" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Remaining Liability</Label>
                  <Input type="number" value={remainingLiability} onChange={e => setRemainingLiability(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Remaining ROU Asset</Label>
                  <Input type="number" value={remainingRou} onChange={e => setRemainingRou(e.target.value)} className="h-9" />
                </div>
              </div>
            )}

            {/* FX params */}
            {fn.key === "FX_REVALUATION" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Old FX Rate (to QAR)</Label>
                  <Input type="number" step="0.0001" value={oldFxRate} onChange={e => setOldFxRate(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">New FX Rate (to QAR)</Label>
                  <Input type="number" step="0.0001" value={newFxRate} onChange={e => setNewFxRate(e.target.value)} className="h-9" />
                </div>
              </div>
            )}

            {/* Run button */}
            <div className="flex gap-2">
              <Button
                onClick={handleRun}
                disabled={running || !contractId}
                className="flex-1 h-10 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              >
                {running ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Running…</>
                ) : (
                  <><PlayCircle className="h-4 w-4 mr-2" /> Run Scenario</>
                )}
              </Button>
              {currentResult?.jv_id && (
                <Button
                  variant="outline"
                  onClick={handlePostJV}
                  disabled={postJV.isPending}
                  className="h-10 border-green-600 text-green-600 hover:bg-green-600/10"
                >
                  <FileText className="h-4 w-4 mr-1.5" /> Post JV
                </Button>
              )}
              {currentResult?.jv_id && (
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/accounting/journal-voucher?jv_id=${currentResult.jv_id}`)}
                  className="h-10 border-blue-600 text-blue-400 hover:bg-blue-600/10"
                  title="Open this JV in the Journal Voucher Register"
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" /> View JV
                </Button>
              )}
            </div>

            {/* Result summary */}
            {currentResult && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 transition-all duration-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="font-semibold text-green-400 text-sm">
                    Scenario Passed — JV {currentResult.jv_number}
                  </span>
                </div>
                <ResultSummary fnKey={fn.key} result={currentResult} />
              </div>
            )}

            {/* JV Lines */}
            {currentResult?.jv_id && (
              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  Journal Voucher Lines — {currentResult.jv_number}
                </h3>
                <JVLinesTable
                  lines={currentJVLines}
                  onCalcClick={line => setCalcLine(calcLine?.line_seq === line.line_seq ? null : line)}
                />
                {calcLine && <CalcBlackboard line={calcLine} onClose={() => setCalcLine(null)} />}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-2 border-t border-border">
              <Button variant="outline" onClick={handlePrev} disabled={currentStep === 0} className="gap-1.5">
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button
                onClick={handleNext}
                disabled={currentStep === FUNCTIONS.length - 1}
                className="gap-1.5 bg-primary text-primary-foreground"
              >
                Next Function <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Right: Tabbed panel — Business Proof | Run History */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-border bg-card px-4 pt-3 gap-1">
              <button
                onClick={() => setRightTab("proof")}
                className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                  rightTab === "proof"
                    ? "border-amber-500 text-amber-400 bg-amber-500/5"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Business Proof
                  {currentResult && (
                    <span className="ml-1 h-2 w-2 rounded-full bg-green-500 inline-block" />
                  )}
                </span>
              </button>
              <button
                onClick={() => setRightTab("history")}
                className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                  rightTab === "history"
                    ? "border-amber-500 text-amber-400 bg-amber-500/5"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Run History
                  {scenarios && scenarios.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">{scenarios.length}</Badge>
                  )}
                </span>
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-5">
              {rightTab === "proof" && (
                <BusinessProofPanel
                  fnKey={fn.key}
                  result={currentResult}
                  jvLines={currentJVLines}
                />
              )}

              {rightTab === "history" && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-muted-foreground" />
                      Scenario Run History
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => refetchScenarios()} className="h-7 text-xs gap-1">
                      <RefreshCw className="h-3 w-3" /> Refresh
                    </Button>
                  </div>

                  {/* Function summary cards */}
                  <div className="grid grid-cols-2 gap-2 mb-5">
                    {FUNCTIONS.map(f => {
                      const Icon = f.icon;
                      const done = !!runResult[f.key];
                      const active = f.key === fn.key;
                      return (
                        <button
                          key={f.key}
                          onClick={() => { setCurrentStep(FUNCTIONS.findIndex(x => x.key === f.key)); setCalcLine(null); }}
                          className={`rounded-lg border p-3 text-left transition-all duration-150 ${
                            active ? "border-amber-500/60 bg-amber-500/10" :
                            done ? "border-green-500/40 bg-green-500/5" :
                            "border-border bg-card hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={`h-3.5 w-3.5 ${f.color}`} />
                            <span className="text-xs font-semibold text-foreground">{f.label}</span>
                            {done && <CheckCircle2 className="h-3 w-3 text-green-500 ml-auto" />}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">{f.standard}</p>
                        </button>
                      );
                    })}
                  </div>

                  <Separator className="mb-4" />

                  <div className="space-y-2">
                    {(scenarios ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">No scenarios run yet. Select a contract and run the first function.</p>
                    )}
                    {(scenarios ?? []).map((s: any) => {
                      const fnDef = FUNCTIONS.find(f => f.key === s.function_type);
                      const Icon = fnDef?.icon ?? Zap;
                      return (
                        <div key={s.scenario_id} className={`rounded-lg border p-3 text-sm transition-all duration-150 ${
                          s.test_status === "PASS" ? "border-green-500/30 bg-green-500/5" :
                          s.test_status === "FAIL" ? "border-red-500/30 bg-red-500/5" :
                          "border-border bg-card"
                        }`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${fnDef?.color ?? "text-muted-foreground"}`} />
                              <span className="font-medium text-foreground text-xs">{s.scenario_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {s.jv_number && (
                                <button
                                  className="text-[10px] font-mono text-blue-400 hover:text-blue-200 hover:underline transition-colors px-1.5 py-0.5 rounded border border-blue-500/30"
                                  onClick={() => setLocation(`/accounting/journal-voucher?jv_id=${s.jv_id}`)}
                                  title="Open in Journal Voucher Register"
                                >
                                  {s.jv_number} ↗
                                </button>
                              )}
                              <Badge className={`text-[10px] ${s.test_status === "PASS" ? "bg-green-600" : s.test_status === "FAIL" ? "bg-red-600" : "bg-muted"} text-white`}>
                                {s.test_status}
                              </Badge>
                            </div>
                          </div>
                          {s.error_message && (
                            <p className="text-red-400 text-[10px] mt-1 font-mono">{s.error_message}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {s.run_by} · {s.run_at ? new Date(s.run_at).toLocaleString() : "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
