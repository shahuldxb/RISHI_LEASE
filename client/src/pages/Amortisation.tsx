import React, { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toast } from "sonner";
import { Calculator, Download, ChevronDown, ChevronRight, TrendingDown, Banknote, BookOpen, Building2, ArrowDownRight, BarChart3, HelpCircle, Info, X, Zap, CheckCircle2, Lock, Play, Edit3, XCircle, Receipt, Send, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

// ── Column header with tooltip helper ─────────────────────────────────────────
function ColHead({ label, tip }: { label: string; tip: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help">
            {label}
            <HelpCircle className="w-3 h-3 text-muted-foreground/60 shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface ScheduleRow {
  schedule_id: number | null;
  contract_id: number;
  contract_ref: string;
  asset_description: string;
  currency: string;
  monthly_payment: number;
  ibr: number;
  term_months: number;
  commencement_date: string;
  expiry_date: string;
  ifrs16_classification: string;
  contract_status?: string;
  lessor_name: string;
  period_date: string;
  period_year: number;
  period_month: number;
  month_name: string;
  opening_liability: number;
  interest_expense: number;
  payment: number;
  principal: number;
  closing_liability: number;
  rou_nbv: number;
  depreciation: number;
  cumulative_depr: number;
  gl_lease_liability?: string;
  gl_rou_asset?: string;
  gl_accum_depreciation?: string;
  gl_interest_expense?: string;
  gl_depreciation_expense?: string;
  gl_cash_bank?: string;
  lifecycle_status: string;
  posting_status: string;
  posted_at: string | null;
  posted_by: string | null;
}

interface GLEntry {
  period_year: number;
  period_month: number;
  period_date: string;
  month_name: string;
  je_ref: string;
  je_label: string;
  ledger_no: string;
  ledger_name: string;
  dr_cr: "Dr" | "Cr";
  amount: number;
  lease_count: number;
  sort_order: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (v: number, currency = "QAR") =>
  `${currency} ${(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtNum = (v: number) =>
  (v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CLASS_COLOUR: Record<string, string> = {
  Finance:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Operating: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  ShortTerm: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  LowValue:  "bg-purple-500/20 text-purple-400 border-purple-500/30",
};
const LIFECYCLE_COLOUR: Record<string, string> = {
  Draft:    "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  Active:   "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Modified: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Closed:   "bg-red-500/20 text-red-400 border-red-500/30",
};

// ── Group rows by contract ─────────────────────────────────────────────────────
function groupByContract(rows: ScheduleRow[]) {
  const map = new Map<number, { meta: ScheduleRow; rows: ScheduleRow[] }>();
  for (const r of rows) {
    if (!map.has(r.contract_id)) {
      map.set(r.contract_id, { meta: r, rows: [] });
    }
    map.get(r.contract_id)!.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.meta.contract_ref.localeCompare(b.meta.contract_ref)
  );
}

// ── Yearly aggregation within a contract ──────────────────────────────────────
function aggregateYearly(rows: ScheduleRow[]) {
  const map = new Map<number, {
    year: number; months: ScheduleRow[];
    total_payment: number; total_interest: number; total_principal: number;
    total_depreciation: number; opening_liability: number; closing_liability: number;
    rou_nbv_end: number;
  }>();
  for (const r of rows) {
    if (!map.has(r.period_year)) {
      map.set(r.period_year, {
        year: r.period_year, months: [],
        total_payment: 0, total_interest: 0, total_principal: 0,
        total_depreciation: 0,
        opening_liability: r.opening_liability,
        closing_liability: r.closing_liability,
        rou_nbv_end: r.rou_nbv,
      });
    }
    const y = map.get(r.period_year)!;
    y.months.push(r);
    y.total_payment      += r.payment;
    y.total_interest     += r.interest_expense;
    y.total_principal    += r.principal;
    y.total_depreciation += r.depreciation;
    y.closing_liability   = r.closing_liability;
    y.rou_nbv_end         = r.rou_nbv;
  }
  return Array.from(map.values()).sort((a, b) => a.year - b.year);
}

// ── GL period grouping ─────────────────────────────────────────────────────────
interface GLPair {
  je_ref: string;
  je_label: string;
  lines: GLEntry[];
}
interface GLPeriod {
  key: string;
  label: string;
  year: number;
  month: number;
  pairs: GLPair[];
  totalDr: number;
  totalCr: number;
}
function groupGLByPeriod(entries: GLEntry[]): GLPeriod[] {
  const periodMap = new Map<string, GLPeriod>();
  for (const e of entries) {
    const key = `${e.period_year}-${String(e.period_month).padStart(2, "0")}`;
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        key,
        label: e.month_name,
        year: e.period_year,
        month: e.period_month,
        pairs: [],
        totalDr: 0,
        totalCr: 0,
      });
    }
    const period = periodMap.get(key)!;
    if (e.dr_cr === "Dr") period.totalDr += e.amount;
    else period.totalCr += e.amount;
    // Group by JE pair
    let pair = period.pairs.find(p => p.je_ref === e.je_ref);
    if (!pair) {
      pair = { je_ref: e.je_ref, je_label: e.je_label, lines: [] };
      period.pairs.push(pair);
    }
    pair.lines.push(e);
  }
  // Sort pairs by je_ref within each period
  const periodArr = Array.from(periodMap.values());
  for (const p of periodArr) {
    p.pairs.sort((a: GLPair, b: GLPair) => a.je_ref.localeCompare(b.je_ref));
    for (const pair of p.pairs) {
      pair.lines.sort((a: GLEntry, b: GLEntry) => a.sort_order - b.sort_order);
    }
  }
  return periodArr.sort((a: GLPeriod, b: GLPeriod) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
}

// ── Available years from data ──────────────────────────────────────────────────
function getYears(rows: ScheduleRow[]) {
  const s = new Set<number>();
  rows.forEach(r => s.add(r.period_year));
  return Array.from(s).sort();
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Amortisation() {
  const [, navigate] = useLocation();
  const currentYear = new Date().getFullYear();
  const [year, setYear]         = useState<number>(currentYear);
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [expandedContracts, setExpandedContracts] = useState<Set<number>>(new Set());
  const [expandedPeriods, setExpandedPeriods]     = useState<Set<string>>(new Set());
  const [showGuide, setShowGuide]                 = useState(false);
  const [blackboardRow, setBlackboardRow]         = useState<ScheduleRow | null>(null);
  const [showGLExplain, setShowGLExplain]         = useState(false);
  const [glViewMode, setGlViewMode]               = useState<"monthly" | "yearly">("monthly");
  const [glSelectedMonth, setGlSelectedMonth]     = useState<string>("");
  // ── Lifecycle action state ─────────────────────────────────────────────────
  const [modifyDialogId, setModifyDialogId]       = useState<number | null>(null);
  const [modifyAmount, setModifyAmount]           = useState<string>("");
  const [modifyDate, setModifyDate]               = useState<string>("");
  const [closeDialogId, setCloseDialogId]         = useState<number | null>(null);
  const [closeDate, setCloseDate]                 = useState<string>("");
  const [glPostingsContractId, setGlPostingsContractId] = useState<number | null>(null);
  // ── Monthly Posting state ─────────────────────────────────────────────────
  const [selectedLeases, setSelectedLeases] = useState<Set<number>>(new Set());
  const [monthsToPost, setMonthsToPost] = useState<number>(1);
  const [postingProgress, setPostingProgress] = useState<{ current: number; total: number } | null>(null);
  // ── Data queries ───────────────────────────────────────────────────────────
  const { data: rawSchedule, isLoading: loadingSchedule } =
    trpc.lease.getAmortisationScheduleAll.useQuery({ year, viewMode });

  const { data: rawGL, isLoading: loadingGL } =
    trpc.lease.getConsolidatedGLEntries.useQuery({ year, viewMode });

  const scheduleRows: ScheduleRow[] = Array.isArray(rawSchedule) ? rawSchedule as ScheduleRow[] : [];
  const glEntries:   GLEntry[]      = Array.isArray(rawGL)       ? rawGL       as GLEntry[]      : [];
  // ── GL Postings query (per-lease audit ledger) ─────────────────────────────
  const { data: rawGLPostings, isLoading: loadingGLPostings, refetch: refetchGLPostings } =
    trpc.lease.getGLPostings.useQuery(
      { contractId: glPostingsContractId ?? undefined },
      { enabled: glPostingsContractId !== null }
    );
   const glPostings = Array.isArray(rawGLPostings) ? rawGLPostings as any[] : [];
  // ── Leases for posting grid ────────────────────────────────────────────────
  const { data: rawLeasesForPosting, isLoading: loadingLeasesForPosting } =
    trpc.lease.getLeasesForPosting.useQuery();
  const leasesForPosting = Array.isArray(rawLeasesForPosting) ? rawLeasesForPosting as any[] : [];
  const grouped    = useMemo(() => groupByContract(scheduleRows), [scheduleRows]);
  const allGLPeriods = useMemo(() => groupGLByPeriod(glEntries), [glEntries]);
  // Available months for the month picker
  const glAvailMonths = useMemo(() =>
    allGLPeriods.map(p => ({ key: p.key, label: p.label })),
    [allGLPeriods]
  );
  // Filtered periods based on GL view mode and selected month
  const glPeriods = useMemo(() => {
    if (glViewMode === "yearly") {
      // Aggregate by year: one period per year, all pairs combined
      const yearMap = new Map<number, GLPeriod>();
      for (const p of allGLPeriods) {
        if (!yearMap.has(p.year)) {
          yearMap.set(p.year, { key: `${p.year}`, label: `Year ${p.year}`, year: p.year, month: 0, pairs: [], totalDr: 0, totalCr: 0 });
        }
        const yp = yearMap.get(p.year)!;
        yp.totalDr += p.totalDr;
        yp.totalCr += p.totalCr;
        for (const pair of p.pairs) {
          let yPair = yp.pairs.find(x => x.je_ref === pair.je_ref);
          if (!yPair) {
            yPair = { je_ref: pair.je_ref, je_label: pair.je_label, lines: [] };
            yp.pairs.push(yPair);
          }
          // Aggregate lines by ledger_no + dr_cr
          for (const line of pair.lines) {
            const existing = yPair.lines.find(l => l.ledger_no === line.ledger_no && l.dr_cr === line.dr_cr);
            if (existing) {
              existing.amount += line.amount;
            } else {
              yPair.lines.push({ ...line });
            }
          }
        }
      }
      const yearArr = Array.from(yearMap.values());
      for (const yp of yearArr) {
        yp.pairs.sort((a: GLPair, b: GLPair) => a.je_ref.localeCompare(b.je_ref));
        for (const pair of yp.pairs) pair.lines.sort((a: GLEntry, b: GLEntry) => a.sort_order - b.sort_order);
      }
      return yearArr.sort((a: GLPeriod, b: GLPeriod) => a.year - b.year);
    }
    // Monthly mode
    if (glSelectedMonth) {
      return allGLPeriods.filter(p => p.key === glSelectedMonth);
    }
    return allGLPeriods;
  }, [allGLPeriods, glViewMode, glSelectedMonth]);
  const availYears = useMemo(() => {
    const ys = getYears(scheduleRows);
    if (!ys.includes(currentYear)) ys.unshift(currentYear);
    return ys;
  }, [scheduleRows]);

  // ── KPI totals ────────────────────────────────────────────────────────────
  const totalPayment      = scheduleRows.reduce((s, r) => s + r.payment,          0);
  const totalInterest     = scheduleRows.reduce((s, r) => s + r.interest_expense, 0);
  const totalPrincipal    = scheduleRows.reduce((s, r) => s + r.principal,        0);
  const totalDepreciation = scheduleRows.reduce((s, r) => s + r.depreciation,     0);
  const leaseCount        = grouped.length;

  // ── Calculate amortisation mutation ─────────────────────────────────────
  const utils = trpc.useUtils();
  const calcMut = trpc.lease.calculateAmortisationAll.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Amortisation calculated: ${data.contracts_processed} leases, ${data.rows_inserted} schedule rows generated.`
      );
      utils.lease.getAmortisationScheduleAll.invalidate();
      utils.lease.getConsolidatedGLEntries.invalidate();
    },
    onError: (err) => toast.error(`Calculation failed: ${err.message}`),
  });
  // ── Monthly JV Posting mutation ─────────────────────────────────────────────────
  const postMonthlyMut = trpc.lease.postMonthlyEntries.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      const totalPosted = d.totalMonthsPosted ?? 0;
      const errors = (d.results ?? []).filter((r: any) => r.error);
      if (errors.length > 0) {
        toast.error(`Posted ${totalPosted} months but ${errors.length} contract(s) had errors`);
      } else {
        toast.success(`Successfully posted ${totalPosted} monthly entries across ${d.totalContractsProcessed} lease(s)`);
      }
      setPostingProgress(null);
      setSelectedLeases(new Set());
      utils.lease.getAmortisationScheduleAll.invalidate();
      utils.lease.getConsolidatedGLEntries.invalidate();
      utils.lease.getLeasesForPosting.invalidate();
    },
    onError: (err) => {
      toast.error(`Monthly posting failed: ${err.message}`);
      setPostingProgress(null);
    },
  });
  const handlePostMonthly = useCallback(() => {
    if (selectedLeases.size === 0) {
      toast.error('Please select at least one lease');
      return;
    }
    setPostingProgress({ current: 0, total: selectedLeases.size * monthsToPost });
    postMonthlyMut.mutate({
      contractIds: Array.from(selectedLeases),
      monthsToPost,
    });
  }, [selectedLeases, monthsToPost, postMonthlyMut]);
  const toggleLeaseSelection = useCallback((contractId: number) => {
    setSelectedLeases(prev => {
      const next = new Set(prev);
      next.has(contractId) ? next.delete(contractId) : next.add(contractId);
      return next;
    });
  }, []);
  const toggleAllLeases = useCallback(() => {
    if (selectedLeases.size === leasesForPosting.length) {
      setSelectedLeases(new Set());
    } else {
      setSelectedLeases(new Set(leasesForPosting.map((l: any) => l.contract_id)));
    }
   }, [selectedLeases, leasesForPosting]);
  // ── Lifecycle mutations ─────────────────────────────────────────────
  const originateMut = trpc.lease.originateLease.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      toast.success(`Lease originated — Opening Liability: QAR ${(d?.opening_liability ?? 0).toLocaleString("en-US", {minimumFractionDigits: 2})}`);
      utils.lease.getAmortisationScheduleAll.invalidate();
    },
    onError: (err) => toast.error(`Origination failed: ${err.message}`),
  });
  const postPeriodMut = trpc.lease.postPeriod.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      toast.success(`Period posted — ${d?.period_posted ?? ''}: Interest QAR ${(d?.interest ?? 0).toLocaleString("en-US", {minimumFractionDigits: 2})}`);
      utils.lease.getAmortisationScheduleAll.invalidate();
      if (glPostingsContractId) refetchGLPostings();
    },
    onError: (err) => toast.error(`Post period failed: ${err.message}`),
  });
  const modifyMut = trpc.lease.modifyLease.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      toast.success(`Lease modified — Remeasurement: QAR ${(d?.remeasurement_amount ?? 0).toLocaleString("en-US", {minimumFractionDigits: 2})}`);
      setModifyDialogId(null);
      utils.lease.getAmortisationScheduleAll.invalidate();
    },
    onError: (err) => toast.error(`Modification failed: ${err.message}`),
  });
  const closeMut = trpc.lease.closeLease.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      toast.success(`Lease closed — Gain/Loss: QAR ${(d?.gain_loss ?? 0).toLocaleString("en-US", {minimumFractionDigits: 2})}`);
      setCloseDialogId(null);
      utils.lease.getAmortisationScheduleAll.invalidate();
    },
    onError: (err) => toast.error(`Closure failed: ${err.message}`),
  });

  const toggleContract = (id: number) => {
    setExpandedContracts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const togglePeriod = (key: string) => {
    setExpandedPeriods(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const expandAll   = () => setExpandedContracts(new Set(grouped.map(g => g.meta.contract_id)));
  const collapseAll = () => setExpandedContracts(new Set());

  return (
    <DashboardLayout>
      <ScreenHeader
        screenId="VFLAMORT0001P001"
        screenType="amortisation"
        title="Amortisation Schedule — All Leases"
        subtitle="IFRS 16 consolidated amortisation schedule and GL accounting entries"
      />

      {/* ══════════════════════════════════════════════════════════════════
          LEASE SELECTION GRID — Monthly JV Posting (Demo Mode)
      ══════════════════════════════════════════════════════════════════ */}
      <div className="px-6 pb-4">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-[#e60000]" />
              <span className="text-sm font-semibold">Post Monthly Entries</span>
              <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400">Demo Mode</Badge>
              {selectedLeases.size > 0 && (
                <span className="text-xs text-muted-foreground ml-2">
                  {selectedLeases.size} lease{selectedLeases.size > 1 ? 's' : ''} selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Months to post selector */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Months:</label>
                <Select value={String(monthsToPost)} onValueChange={v => setMonthsToPost(Number(v))}>
                  <SelectTrigger className="w-20 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 6, 12, 24, 36, 48].map(m => (
                      <SelectItem key={m} value={String(m)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Post button */}
              <Button
                size="sm"
                className="bg-[#e60000] hover:bg-[#cc0000] text-white flex items-center gap-1.5"
                onClick={handlePostMonthly}
                disabled={selectedLeases.size === 0 || postMonthlyMut.isPending}
              >
                {postMonthlyMut.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Posting…</>
                ) : (
                  <><Play className="h-4 w-4" /> Post {monthsToPost} Month{monthsToPost > 1 ? 's' : ''}</>
                )}
              </Button>
            </div>
          </div>
          {/* Progress bar */}
          {postMonthlyMut.isPending && postingProgress && (
            <div className="px-4 py-2 border-b border-border bg-muted/20">
              <div className="flex items-center gap-3">
                <Progress value={50} className="flex-1 h-2" />
                <span className="text-xs text-muted-foreground">Processing…</span>
              </div>
            </div>
          )}
          {/* Lease grid */}
          {loadingLeasesForPosting ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />
              Loading leases…
            </div>
          ) : leasesForPosting.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No active leases found. Create a lease first.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="bg-muted/10">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedLeases.size === leasesForPosting.length && leasesForPosting.length > 0}
                        onCheckedChange={toggleAllLeases}
                      />
                    </TableHead>
                    <TableHead className="text-xs">Contract Ref</TableHead>
                    <TableHead className="text-xs">Lessee</TableHead>
                    <TableHead className="text-xs">Asset Type</TableHead>
                    <TableHead className="text-xs text-right">Monthly Payment</TableHead>
                    <TableHead className="text-xs text-right">IBR %</TableHead>
                    <TableHead className="text-xs text-center">Term</TableHead>
                    <TableHead className="text-xs text-center">Months Posted</TableHead>
                    <TableHead className="text-xs">Last Posted</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leasesForPosting.map((lease: any) => {
                    const isSelected = selectedLeases.has(lease.contract_id);
                    const progress = lease.term_months > 0 ? Math.round((lease.months_posted / lease.term_months) * 100) : 0;
                    return (
                      <TableRow
                        key={lease.contract_id}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-[#e60000]/5' : 'hover:bg-muted/20'}`}
                        onClick={() => toggleLeaseSelection(lease.contract_id)}
                      >
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleLeaseSelection(lease.contract_id)}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-mono font-medium text-foreground">{lease.contract_ref}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{lease.lessee_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{lease.asset_type}</TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {lease.currency} {(lease.monthly_payment ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {((lease.ibr ?? 0) * 100).toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-xs text-center">{lease.term_months} mo</TableCell>
                        <TableCell className="text-xs text-center">
                          <div className="flex items-center gap-1.5 justify-center">
                            <span className="font-mono">{lease.months_posted}/{lease.term_months}</span>
                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-[#e60000] rounded-full" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {lease.last_posted_date ? new Date(lease.last_posted_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-center">
                          <Badge variant="outline" className={`text-[10px] ${
                            lease.months_posted >= lease.term_months
                              ? 'border-emerald-500/40 text-emerald-400'
                              : lease.months_posted > 0
                              ? 'border-blue-500/40 text-blue-400'
                              : 'border-muted-foreground/40 text-muted-foreground'
                          }`}>
                            {lease.months_posted >= lease.term_months ? 'Complete' : lease.months_posted > 0 ? 'In Progress' : 'Not Started'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {/* Posting results summary */}
          {postMonthlyMut.data && !postMonthlyMut.isPending && (
            <div className="px-4 py-3 border-t border-border bg-emerald-500/5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">Posting Complete</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {(postMonthlyMut.data as any).results?.map((r: any) => (
                  <div key={r.contractId} className="bg-card border border-border rounded-lg p-2">
                    <div className="font-mono font-medium text-foreground">{r.contractRef}</div>
                    <div className="text-muted-foreground mt-1">
                      {r.monthsPosted} month{r.monthsPosted > 1 ? 's' : ''} posted
                    </div>
                    <div className="text-muted-foreground">
                      Interest: {r.totalInterest?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-muted-foreground">
                      Depreciation: {r.totalDepreciation?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    {r.error && <div className="text-red-400 mt-1">⚠ {r.error}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────────── */}      <div className="px-6 pb-4">
        <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center gap-4">
          {/* Year selector */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Financial Year</label>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-32 border-[#e60000]/40 focus:border-[#e60000]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">All Years</SelectItem>
                {availYears.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Monthly / Yearly toggle */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">View</label>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["monthly", "yearly"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    viewMode === m
                      ? "bg-[#e60000] text-white"
                      : "bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Expand / Collapse all + Calculate */}
          <div className="ml-auto flex gap-2 items-end">
            <Button size="sm" variant="outline" onClick={() => setShowGuide(true)} className="flex items-center gap-1.5">
              <Info className="h-4 w-4" />
              How is this calculated?
            </Button>
            <Button size="sm" variant="outline" onClick={expandAll}>Expand All</Button>
            <Button size="sm" variant="outline" onClick={collapseAll}>Collapse All</Button>
            <Button
              size="sm"
              className="bg-[#e60000] hover:bg-[#cc0000] text-white flex items-center gap-1.5"
              onClick={() => calcMut.mutate()}
              disabled={calcMut.isPending}
            >
              <Calculator className="h-4 w-4" />
              {calcMut.isPending ? "Calculating…" : "Calculate Amortisation"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="px-6 pb-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Leases",           value: leaseCount,        icon: Building2,     colour: "text-[#e60000]",    isCount: true },
          { label: "Total Payments",   value: totalPayment,      icon: Banknote,      colour: "text-blue-400",     isCount: false },
          { label: "Total Interest",   value: totalInterest,     icon: TrendingDown,  colour: "text-amber-400",    isCount: false },
          { label: "Total Principal",  value: totalPrincipal,    icon: ArrowDownRight,colour: "text-emerald-400",  isCount: false },
          { label: "Total Depreciation",value: totalDepreciation,icon: Calculator,    colour: "text-purple-400",   isCount: false },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <k.icon className={`w-4 h-4 ${k.colour}`} />
            </div>
            <div className={`text-lg font-bold ${k.colour}`}>
              {k.isCount ? k.value : fmtNum(k.value as number)}
            </div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          GRID 1 — Amortisation Schedule (grouped by lease)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="px-6 pb-6">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#e60000]" />
            <span className="text-sm font-semibold">Amortisation Schedule</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {grouped.length} leases · {scheduleRows.length} periods
            </span>
          </div>

          {loadingSchedule ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <Calculator className="w-7 h-7 mx-auto mb-2 animate-pulse" />
              Loading schedule…
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No amortisation data found for the selected period.
              <div className="text-xs mt-1">Click <strong>Calculate Amortisation</strong> to generate schedules for all active leases.</div>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="bg-muted/10">
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Lease / Period</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Asset / Lessor</TableHead>
                    <TableHead className="text-xs text-right whitespace-nowrap">
                      <ColHead label="Opening Liability" tip="The outstanding lease obligation at the start of the period — i.e. how much of the villa rent is still owed to the lessor under IFRS 16 at the beginning of this month/year." />
                    </TableHead>
                    <TableHead className="text-xs text-right whitespace-nowrap">
                      <ColHead label="Interest" tip="The finance cost for this period. Under IFRS 16, even a simple villa lease is treated like a loan: the outstanding obligation earns interest at the IBR (Incremental Borrowing Rate). This is the cost of 'borrowing' the right to use the property." />
                    </TableHead>
                    <TableHead className="text-xs text-right whitespace-nowrap">
                      <ColHead label="Payment" tip="The actual monthly rent paid to the lessor for this period. This is the cash that leaves your bank account." />
                    </TableHead>
                    <TableHead className="text-xs text-right whitespace-nowrap">
                      <ColHead label="Principal" tip="The portion of the monthly rent that reduces the lease obligation. Payment = Interest + Principal. After paying interest, the remainder chips away at the outstanding liability — like paying down a mortgage." />
                    </TableHead>
                    <TableHead className="text-xs text-right whitespace-nowrap">
                      <ColHead label="Closing Liability" tip="The outstanding lease obligation at the end of the period (Opening Liability minus Principal). This is what remains on the balance sheet as a liability after this month's payment." />
                    </TableHead>
                    <TableHead className="text-xs text-right whitespace-nowrap">
                      <ColHead label="ROU NBV" tip="Right-of-Use Asset Net Book Value — the remaining value of your right to occupy the villa. It starts at the total lease value and reduces each month by the depreciation charge, similar to how a fixed asset depreciates." />
                    </TableHead>
                    <TableHead className="text-xs text-right whitespace-nowrap">
                      <ColHead label="Depreciation" tip="The monthly portion of the Right-of-Use asset value charged to the P&L. The villa's usage right is spread evenly over the lease term (straight-line). This is an accounting charge, not a cash payment." />
                    </TableHead>
                    <TableHead className="text-xs text-right whitespace-nowrap">
                      <ColHead label="Cumul. Depr." tip="Total depreciation charged from the lease start date up to this period. When this equals the original ROU asset value, the asset is fully depreciated." />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map(({ meta, rows }) => {
                    const isOpen = expandedContracts.has(meta.contract_id);
                    const currency = meta.currency || "QAR";

                    // Totals for this contract
                    const cTotalPayment   = rows.reduce((s, r) => s + r.payment,          0);
                    const cTotalInterest  = rows.reduce((s, r) => s + r.interest_expense, 0);
                    const cTotalPrincipal = rows.reduce((s, r) => s + r.principal,        0);
                    const cTotalDepr      = rows.reduce((s, r) => s + r.depreciation,     0);
                    const firstRow        = rows[0];
                    const lastRow         = rows[rows.length - 1];

                    // Yearly aggregation if needed
                    const displayRows = viewMode === "yearly" ? aggregateYearly(rows) : null;

                    return (
                      <React.Fragment key={`c-${meta.contract_id}`}>
                        {/* ── Contract group header row ───────────────── */}
                        <TableRow
                          className="cursor-pointer bg-muted/5 hover:bg-muted/15 transition-colors border-t-2 border-border/60"
                          onClick={() => toggleContract(meta.contract_id)}
                        >
                          <TableCell className="py-2.5 px-2">
                            <div className="flex items-center gap-1">
                              {isOpen
                                ? <ChevronDown className="w-4 h-4 text-[#e60000]" />
                                : <ChevronRight className="w-4 h-4 text-[#e60000]" />}
                              <button
                                onClick={e => { e.stopPropagation(); navigate(`/leases/amortisation/blackboard?contractId=${meta.contract_id}`); }}
                                title="Show step-by-step calculation"
                                className="flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold transition-all hover:scale-110 active:scale-95"
                                style={{ background: "#0f2e0f", border: "1px solid #4ade80", color: "#4ade80", lineHeight: 1 }}
                              >&#x1F4D0;</button>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[#e60000] font-semibold text-sm">{meta.contract_ref}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CLASS_COLOUR[meta.ifrs16_classification] ?? "bg-muted text-muted-foreground"}`}>
                                {meta.ifrs16_classification}
                              </span>
                              {/* Lifecycle status badge */}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${LIFECYCLE_COLOUR[meta.lifecycle_status] ?? "bg-muted text-muted-foreground border-border"}`}>
                                {meta.lifecycle_status ?? "Draft"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {meta.term_months} months
                              </span>
                              {/* Lifecycle action buttons */}
                              <div className="flex items-center gap-1 ml-1" onClick={e => e.stopPropagation()}>
                                {/* Originate — only for Draft leases */}
                                {(meta.lifecycle_status === "Draft" || !meta.lifecycle_status) && (
                                  <button
                                    onClick={() => originateMut.mutate({ contractId: meta.contract_id })}
                                    disabled={originateMut.isPending}
                                    title="Originate lease — recognise ROU asset and liability (IFRS 16 Day 1)"
                                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                    style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.4)", color: "#4ade80" }}
                                  >
                                    <Zap className="w-2.5 h-2.5" /> Originate
                                  </button>
                                )}
                                {/* Post Period — for Active/Modified leases */}
                                {(meta.lifecycle_status === "Active" || meta.lifecycle_status === "Modified") && (
                                  <button
                                    onClick={() => postPeriodMut.mutate({ contractId: meta.contract_id, periodDate: new Date().toISOString().slice(0, 10) })}
                                    disabled={postPeriodMut.isPending}
                                    title="Post next projected period — creates GL journal entries"
                                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                    style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }}
                                  >
                                    <Play className="w-2.5 h-2.5" /> Post Period
                                  </button>
                                )}
                                {/* Modify — for Active/Modified leases */}
                                {(meta.lifecycle_status === "Active" || meta.lifecycle_status === "Modified") && (
                                  <button
                                    onClick={() => { setModifyDialogId(meta.contract_id); setModifyAmount(""); setModifyDate(""); }}
                                    title="Modify lease — remeasure liability with new rent amount"
                                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold transition-all hover:scale-105 active:scale-95"
                                    style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)", color: "#fbbf24" }}
                                  >
                                    <Edit3 className="w-2.5 h-2.5" /> Modify
                                  </button>
                                )}
                                {/* Close — for Active/Modified leases */}
                                {(meta.lifecycle_status === "Active" || meta.lifecycle_status === "Modified") && (
                                  <button
                                    onClick={() => { setCloseDialogId(meta.contract_id); setCloseDate(""); }}
                                    title="Close lease — derecognise ROU asset and liability"
                                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold transition-all hover:scale-105 active:scale-95"
                                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171" }}
                                  >
                                    <XCircle className="w-2.5 h-2.5" /> Close
                                  </button>
                                )}
                                {/* GL Postings ledger button */}
                                <button
                                  onClick={() => setGlPostingsContractId(glPostingsContractId === meta.contract_id ? null : meta.contract_id)}
                                  title="View GL Postings ledger for this lease"
                                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold transition-all hover:scale-105 active:scale-95"
                                  style={{ background: glPostingsContractId === meta.contract_id ? "rgba(14,165,233,0.25)" : "rgba(14,165,233,0.10)", border: "1px solid rgba(14,165,233,0.4)", color: "#38bdf8" }}
                                >
                                  <Receipt className="w-2.5 h-2.5" /> GL Ledger
                                </button>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="text-xs font-medium truncate max-w-[200px]">{meta.asset_description}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{meta.lessor_name}</div>
                          </TableCell>
                          <TableCell className="py-2.5 text-xs text-right font-mono">{fmtNum(firstRow?.opening_liability ?? 0)}</TableCell>
                          <TableCell className="py-2.5 text-xs text-right font-mono text-amber-400">{fmtNum(cTotalInterest)}</TableCell>
                          <TableCell className="py-2.5 text-xs text-right font-mono text-blue-400">{fmtNum(cTotalPayment)}</TableCell>
                          <TableCell className="py-2.5 text-xs text-right font-mono text-emerald-400">{fmtNum(cTotalPrincipal)}</TableCell>
                          <TableCell className="py-2.5 text-xs text-right font-mono">{fmtNum(lastRow?.closing_liability ?? 0)}</TableCell>
                          <TableCell className="py-2.5 text-xs text-right font-mono text-purple-400">{fmtNum(lastRow?.rou_nbv ?? 0)}</TableCell>
                          <TableCell className="py-2.5 text-xs text-right font-mono">{fmtNum(cTotalDepr)}</TableCell>
                          <TableCell className="py-2.5 text-xs text-right font-mono text-muted-foreground">{fmtNum(lastRow?.cumulative_depr ?? 0)}</TableCell>
                        </TableRow>

                        {/* ── Expanded: monthly rows ────────────────────── */}
                        {isOpen && viewMode === "monthly" && rows.map(r => (
                          <TableRow key={`r-${r.schedule_id ?? r.period_date}-${r.contract_id}`}
                            className="bg-muted/3 hover:bg-muted/8">
                            <TableCell className="py-1.5 px-2"></TableCell>
                            <TableCell className="py-1.5 pl-6 text-xs text-muted-foreground">
                              {r.month_name} {r.period_year}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-muted-foreground">—</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono">{fmtNum(r.opening_liability)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono text-amber-400">{fmtNum(r.interest_expense)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono text-blue-400">{fmtNum(r.payment)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono text-emerald-400">{fmtNum(r.principal)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono">{fmtNum(r.closing_liability)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono text-purple-400">{fmtNum(r.rou_nbv)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono">{fmtNum(r.depreciation)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono text-muted-foreground">{fmtNum(r.cumulative_depr)}</TableCell>
                          </TableRow>
                        ))}

                        {/* ── Expanded: yearly rows ─────────────────────── */}
                        {isOpen && viewMode === "yearly" && displayRows!.map(yr => (
                          <TableRow key={`yr-${meta.contract_id}-${yr.year}`}
                            className="bg-muted/3 hover:bg-muted/8">
                            <TableCell className="py-1.5 px-2"></TableCell>
                            <TableCell className="py-1.5 pl-6 text-xs font-semibold">{yr.year}</TableCell>
                            <TableCell className="py-1.5 text-xs text-muted-foreground">{yr.months.length} months</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono">{fmtNum(yr.opening_liability)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono text-amber-400">{fmtNum(yr.total_interest)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono text-blue-400">{fmtNum(yr.total_payment)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono text-emerald-400">{fmtNum(yr.total_principal)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono">{fmtNum(yr.closing_liability)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono text-purple-400">{fmtNum(yr.rou_nbv_end)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono">{fmtNum(yr.total_depreciation)}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono text-muted-foreground">—</TableCell>
                          </TableRow>
                        ))}
                        {/* ── GL Postings inline ledger ────────────────── */}
                        {glPostingsContractId === meta.contract_id && (
                          <TableRow>
                            <TableCell colSpan={11} className="p-0">
                              <div className="mx-2 my-2 rounded-lg border border-sky-500/30 bg-sky-500/5 overflow-hidden">
                                <div className="px-3 py-2 border-b border-sky-500/20 flex items-center gap-2">
                                  <Receipt className="w-3.5 h-3.5 text-sky-400" />
                                  <span className="text-xs font-semibold text-sky-400">GL Postings Ledger — {meta.contract_ref}</span>
                                  <span className="text-[10px] text-muted-foreground ml-1">Actual journal entries posted to the general ledger</span>
                                  <button onClick={() => setGlPostingsContractId(null)} className="ml-auto text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                                </div>
                                {loadingGLPostings ? (
                                  <div className="px-4 py-3 text-xs text-muted-foreground">Loading postings…</div>
                                ) : glPostings.length === 0 ? (
                                  <div className="px-4 py-3 text-xs text-muted-foreground">No GL postings yet for this lease. Use <strong>Originate</strong> or <strong>Post Period</strong> to create entries.</div>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-sky-500/10">
                                        <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">Date</th>
                                        <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">JE Ref</th>
                                        <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">Description</th>
                                        <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">Ledger No.</th>
                                        <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">Account</th>
                                        <th className="text-center px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">Dr/Cr</th>
                                        <th className="text-right px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">Amount</th>
                                        <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">Posted By</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/30">
                                      {glPostings.map((p: any, i: number) => (
                                        <tr key={p.posting_id ?? i} className="hover:bg-sky-500/5">
                                          <td className="px-3 py-1 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{p.posting_date ? new Date(p.posting_date).toLocaleDateString() : "—"}</td>
                                          <td className="px-3 py-1 font-mono text-[10px] text-sky-400 font-bold">{p.je_ref}</td>
                                          <td className="px-3 py-1 text-[10px] text-muted-foreground">{p.je_label}</td>
                                          <td className="px-3 py-1 font-mono text-[10px]">{p.ledger_no}</td>
                                          <td className="px-3 py-1 text-[10px]">{p.ledger_name}</td>
                                          <td className="px-3 py-1 text-center">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${
                                              p.dr_cr === "Dr"
                                                ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                                                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                            }`}>{p.dr_cr}</span>
                                          </td>
                                          <td className="px-3 py-1 text-right font-mono text-[10px] font-semibold">{fmtNum(p.amount)}</td>
                                          <td className="px-3 py-1 text-[10px] text-muted-foreground">{p.posted_by ?? "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* ── Grand totals row ─────────────────────────────────── */}
                  {scheduleRows.length > 0 && (
                    <TableRow className="bg-[#e60000]/10 border-t-2 border-[#e60000]/30 font-bold">
                      <TableCell></TableCell>
                      <TableCell className="py-2.5 text-sm text-[#e60000]">TOTAL</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{leaseCount} leases</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-mono">—</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-mono text-amber-400">{fmtNum(totalInterest)}</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-mono text-blue-400">{fmtNum(totalPayment)}</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-mono text-emerald-400">{fmtNum(totalPrincipal)}</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-mono">—</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-mono">—</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-mono">{fmtNum(totalDepreciation)}</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-mono">—</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          GRID 2 — Consolidated GL Accounting Entries (Row-wise Journal)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="px-6 pb-8">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* ── Section header ── */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
            {/* How is this calculated? — FIRST button */}
            <button
              onClick={() => setShowGLExplain(true)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-semibold transition-all hover:scale-105 active:scale-95"
              style={{ background: "#1a1a2e", border: "1px solid #6366f1", color: "#a5b4fc" }}
              title="How is each journal entry calculated?"
            >
              <Info className="w-3.5 h-3.5" /> How is this calculated?
            </button>
            <BookOpen className="w-4 h-4 text-[#e60000]" />
            <span className="text-sm font-semibold">Consolidated GL Accounting Entries</span>
            <span className="text-xs text-muted-foreground">All leases</span>
            {/* GL View toggle: Monthly / Yearly */}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <div className="flex rounded-md overflow-hidden border border-border text-xs">
                <button
                  onClick={() => { setGlViewMode("monthly"); setGlSelectedMonth(""); }}
                  className={`px-3 py-1 font-semibold transition-colors ${glViewMode === "monthly" ? "bg-[#e60000] text-white" : "bg-card text-muted-foreground hover:bg-muted/20"}`}
                >Monthly</button>
                <button
                  onClick={() => setGlViewMode("yearly")}
                  className={`px-3 py-1 font-semibold transition-colors ${glViewMode === "yearly" ? "bg-[#e60000] text-white" : "bg-card text-muted-foreground hover:bg-muted/20"}`}
                >Yearly</button>
              </div>
              {/* Month picker — only shown in monthly mode */}
              {glViewMode === "monthly" && glAvailMonths.length > 0 && (
                <select
                  value={glSelectedMonth}
                  onChange={e => setGlSelectedMonth(e.target.value)}
                  className="text-xs px-2 py-1 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-[#e60000]"
                >
                  <option value="">All months</option>
                  {glAvailMonths.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* ── Body ── */}
          {loadingGL ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              <BookOpen className="w-6 h-6 mx-auto mb-2 animate-pulse" />
              Loading GL entries...
            </div>
          ) : glPeriods.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              No GL entries found. Click <strong>Calculate Amortisation</strong> first.
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/20 border-b border-border">
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground w-10">#</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground w-24">Ledger No.</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Ledger Description</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground w-16">Dr / Cr</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground w-36">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {glPeriods.map(period => {
                    let lineNo = 0;
                    const totalDr = period.totalDr;
                    const totalCr = period.totalCr;
                    return (
                      <React.Fragment key={period.key}>
                        {/* ── Period header row ── */}
                        <tr className="bg-[#e60000]/10 border-y border-[#e60000]/20">
                          <td colSpan={5} className="px-3 py-2 font-bold text-[#e60000] text-xs tracking-wide">
                            {period.label}
                            <span className="ml-3 font-normal text-muted-foreground text-[10px]">
                              Dr {fmtNum(totalDr)} · Cr {fmtNum(totalCr)}
                              {Math.abs(totalDr - totalCr) < 0.01
                                ? <span className="ml-2 text-emerald-400">✓ Balanced</span>
                                : <span className="ml-2 text-amber-400">⚠ Unbalanced</span>}
                            </span>
                          </td>
                        </tr>
                        {period.pairs.map(pair => (
                          <React.Fragment key={`${period.key}-${pair.je_ref}`}>
                            {/* ── JE pair header ── */}
                            <tr className="bg-muted/10 border-b border-border/30">
                              <td colSpan={5} className="px-3 py-1.5">
                                <span className="inline-flex items-center gap-2">
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#e60000]/15 text-[#e60000]">{pair.je_ref}</span>
                                  <span className="text-muted-foreground font-medium">{pair.je_label}</span>
                                </span>
                              </td>
                            </tr>
                            {/* ── Individual Dr/Cr lines ── */}
                            {pair.lines.map(line => {
                              lineNo++;
                              const isDr = line.dr_cr === "Dr";
                              return (
                                <tr
                                  key={`${period.key}-${pair.je_ref}-${line.ledger_no}-${line.dr_cr}`}
                                  className={`border-b border-border/20 hover:bg-muted/10 transition-colors ${isDr ? "border-l-2 border-l-blue-500/60" : "border-l-2 border-l-emerald-500/60"}`}
                                >
                                  {/* # */}
                                  <td className="px-3 py-2 text-muted-foreground text-[10px] font-mono">{lineNo}</td>
                                  {/* Ledger No. */}
                                  <td className={`px-3 py-2 font-mono font-bold ${isDr ? "text-blue-400" : "text-emerald-400"}`}>
                                    {line.ledger_no}
                                  </td>
                                  {/* Ledger Description */}
                                  <td className="px-3 py-2 font-medium">
                                    {isDr ? "" : <span className="inline-block w-4" />}
                                    {line.ledger_name}
                                  </td>
                                  {/* Dr / Cr badge */}
                                  <td className="px-3 py-2 text-center">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                      isDr
                                        ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                                        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                    }`}>
                                      {line.dr_cr}
                                    </span>
                                  </td>
                                  {/* Amount */}
                                  <td className={`px-3 py-2 text-right font-mono font-semibold ${isDr ? "text-blue-400" : "text-emerald-400"}`}>
                                    {fmtNum(line.amount)}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))}
                        {/* ── Period subtotal ── */}
                        <tr className="bg-muted/5 border-b-2 border-border/40">
                          <td colSpan={3} className="px-3 py-1.5 text-[10px] text-muted-foreground italic">
                            {period.pairs.reduce((s, p) => s + p.lines.length, 0)} lines · {period.pairs.length} journal entries
                          </td>
                          <td className="px-3 py-1.5 text-center text-[10px] font-bold text-muted-foreground">TOTAL</td>
                          <td className="px-3 py-1.5 text-right font-mono font-bold text-muted-foreground text-xs">
                            {fmtNum(totalDr + totalCr)}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  {/* ── Grand total ── */}
                  {glPeriods.length > 0 && (
                    <tr className="bg-[#e60000]/10 border-t-2 border-[#e60000]/30">
                      <td colSpan={3} className="px-3 py-2.5 font-bold text-[#e60000] text-xs">GRAND TOTAL</td>
                      <td className="px-3 py-2.5 text-center text-[10px] font-bold text-[#e60000]">ALL</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-[#e60000] text-xs">
                        {fmtNum(glPeriods.reduce((s, p) => s + p.totalDr + p.totalCr, 0))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
            {/* ── How is this calculated? Guide Modal ─────────────────────────── */}
      {showGuide && (
        <div className="rounded-xl border border-blue-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Info className="h-5 w-5 text-[#e60000]" />
              How is the Amortisation Schedule Calculated?
            </h4>
            <p className="text-xs text-muted-foreground">
              IFRS 16 Effective Interest Method — plain-English guide with a worked example
            </p>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowGuide(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>

          <div className="space-y-6 text-sm">

            {/* ── Step 1: Opening Liability ── */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold text-[#e60000] mb-2">Step 1 — Opening Liability (Present Value)</h3>
              <p className="text-muted-foreground mb-3">
                On Day 1, the lease is recognised on the balance sheet at its <strong>Present Value (PV)</strong> —
                what all future rent payments are worth <em>today</em>, discounted at the lease's IBR (Incremental Borrowing Rate).
                This is the <strong>Opening Liability</strong> shown in the first row.
              </p>
              <div className="bg-muted/40 rounded p-3 font-mono text-xs space-y-1">
                <div className="text-muted-foreground">Formula: PV = PMT × (1 − (1 + r)^−n) / r</div>
                <div className="text-muted-foreground">Where: PMT = monthly rent, r = IBR ÷ 12, n = term in months</div>
                <div className="mt-2 text-foreground font-semibold">Example (12,000/month × 36 months @ 5% IBR):</div>
                <div>r = 5% ÷ 12 = 0.4167% per month</div>
                <div>PV = 12,000 × (1 − (1.004167)^−36) / 0.004167</div>
                <div className="text-emerald-400 font-bold">Opening Liability = QAR 395,400</div>
              </div>
            </div>

            {/* ── Step 2: Monthly Interest ── */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold text-amber-400 mb-2">Step 2 — Interest (Finance Cost)</h3>
              <p className="text-muted-foreground mb-3">
                Each month, the outstanding liability "earns" interest at the IBR rate — just like a bank loan.
                This is the <strong>Interest</strong> column. It is a P&amp;L charge (finance cost) but <em>no cash moves</em>.
              </p>
              <div className="bg-muted/40 rounded p-3 font-mono text-xs space-y-1">
                <div className="text-muted-foreground">Formula: Interest = Opening Liability × (IBR ÷ 12)</div>
                <div className="mt-2 text-foreground font-semibold">Month 1 example:</div>
                <div>Interest = 395,400 × (5% ÷ 12)</div>
                <div className="text-amber-400 font-bold">Interest = QAR 1,648</div>
              </div>
            </div>

            {/* ── Step 3: Payment ── */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold text-blue-400 mb-2">Step 3 — Payment (Cash Out)</h3>
              <p className="text-muted-foreground mb-3">
                The <strong>Payment</strong> column is the actual monthly rent paid to the landlord — the cash that leaves your bank account.
                This is always the fixed monthly rent amount from the Lease Register.
              </p>
              <div className="bg-muted/40 rounded p-3 font-mono text-xs space-y-1">
                <div className="text-muted-foreground">Payment = monthly_payment from Lease Register</div>
                <div className="mt-2 text-foreground font-semibold">Month 1 example:</div>
                <div className="text-blue-400 font-bold">Payment = QAR 12,000</div>
              </div>
            </div>

            {/* ── Step 4: Principal ── */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold text-emerald-400 mb-2">Step 4 — Principal (Liability Reduction)</h3>
              <p className="text-muted-foreground mb-3">
                <strong>Principal</strong> is the portion of the payment that reduces the outstanding lease obligation.
                Think of it as "paying down the debt". It is calculated as Payment minus Interest.
              </p>
              <div className="bg-muted/40 rounded p-3 font-mono text-xs space-y-1">
                <div className="text-muted-foreground">Formula: Principal = Payment − Interest</div>
                <div className="mt-2 text-foreground font-semibold">Month 1 example:</div>
                <div>Principal = 12,000 − 1,648</div>
                <div className="text-emerald-400 font-bold">Principal = QAR 10,352</div>
              </div>
            </div>

            {/* ── Step 5: Closing Liability ── */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold mb-2">Step 5 — Closing Liability</h3>
              <p className="text-muted-foreground mb-3">
                The <strong>Closing Liability</strong> is what remains on the balance sheet after this month's payment.
                It becomes next month's Opening Liability. By the final month it reaches zero.
              </p>
              <div className="bg-muted/40 rounded p-3 font-mono text-xs space-y-1">
                <div className="text-muted-foreground">Formula: Closing = Opening − Principal</div>
                <div className="mt-2 text-foreground font-semibold">Month 1 example:</div>
                <div>Closing = 395,400 − 10,352</div>
                <div className="font-bold">Closing Liability = QAR 385,048</div>
              </div>
            </div>

            {/* ── Step 6: Depreciation ── */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold text-purple-400 mb-2">Step 6 — Depreciation (ROU Asset)</h3>
              <p className="text-muted-foreground mb-3">
                On Day 1, a <strong>Right-of-Use (ROU) Asset</strong> equal to the Opening Liability is recognised.
                This asset is depreciated straight-line over the lease term. The <strong>Depreciation</strong> column
                is the monthly P&amp;L charge — it is non-cash (no money moves).
              </p>
              <div className="bg-muted/40 rounded p-3 font-mono text-xs space-y-1">
                <div className="text-muted-foreground">Formula: Depreciation = Opening Liability ÷ Term Months</div>
                <div className="mt-2 text-foreground font-semibold">Example:</div>
                <div>Depreciation = 395,400 ÷ 36</div>
                <div className="text-purple-400 font-bold">Monthly Depreciation = QAR 10,983</div>
              </div>
            </div>

            {/* ── Full Month 1 Summary ── */}
            <div className="rounded-lg border border-[#e60000]/30 bg-[#e60000]/5 p-4">
              <h3 className="font-semibold text-[#e60000] mb-3">Full Worked Example — Month 1 (Jan 2026)</h3>
              <p className="text-muted-foreground text-xs mb-3">Lease: 12,000/month × 36 months @ 5% IBR</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 font-semibold">Column</th>
                    <th className="text-right py-1.5 font-semibold">Amount (QAR)</th>
                    <th className="text-left py-1.5 pl-4 font-semibold">What it means</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  <tr><td className="py-1.5">Opening Liability</td><td className="text-right font-mono">395,400</td><td className="pl-4 text-muted-foreground">PV of all future rents on Day 1</td></tr>
                  <tr><td className="py-1.5 text-amber-400">Interest</td><td className="text-right font-mono text-amber-400">1,648</td><td className="pl-4 text-muted-foreground">Finance cost (IBR × opening liability ÷ 12)</td></tr>
                  <tr><td className="py-1.5 text-blue-400">Payment</td><td className="text-right font-mono text-blue-400">12,000</td><td className="pl-4 text-muted-foreground">Cash paid to landlord this month</td></tr>
                  <tr><td className="py-1.5 text-emerald-400">Principal</td><td className="text-right font-mono text-emerald-400">10,352</td><td className="pl-4 text-muted-foreground">Debt reduction (Payment − Interest)</td></tr>
                  <tr><td className="py-1.5">Closing Liability</td><td className="text-right font-mono">385,048</td><td className="pl-4 text-muted-foreground">Remaining obligation (Opening − Principal)</td></tr>
                  <tr><td className="py-1.5 text-purple-400">Depreciation</td><td className="text-right font-mono text-purple-400">10,983</td><td className="pl-4 text-muted-foreground">ROU asset written off (non-cash P&amp;L)</td></tr>
                </tbody>
              </table>
              <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                <strong>P&amp;L impact this month:</strong> Interest (1,648) + Depreciation (10,983) = <strong className="text-foreground">QAR 12,631</strong> — slightly more than the cash paid (12,000) because interest is front-loaded.
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Blackboard Calculation Modal ──────────────────────────── */}
      {blackboardRow && (() => {
        const ex = blackboardRow;
        const PMT  = ex.monthly_payment;
        const IBR  = ex.ibr;
        const N    = ex.term_months;
        const r    = IBR / 12 / 100;
        const PV   = PMT * (1 - Math.pow(1 + r, -N)) / r;
        const INT  = PV * r;
        const PRIN = PMT - INT;
        const CL   = PV - PRIN;
        const DEPR = PV / N;
        const cur  = ex.currency || "QAR";
        const f    = (v: number) => `${cur} ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const fp   = (v: number) => `${(v * 100).toFixed(4)}%`;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.85)" }}
            onClick={() => setBlackboardRow(null)}
          >
            <div
              className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl shadow-2xl"
              style={{
                background: "#1a2e1a",
                border: "3px solid #4ade80",
                fontFamily: "'Courier New', monospace",
                color: "#e2ffe2",
                boxShadow: "0 0 40px rgba(74,222,128,0.25), inset 0 0 60px rgba(0,0,0,0.4)",
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Chalk-dust texture overlay */}
              <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(74,222,128,0.03) 28px, rgba(74,222,128,0.03) 29px)" }} />

              {/* Header */}
              <div className="relative flex items-center justify-between px-6 pt-5 pb-3 border-b" style={{ borderColor: "rgba(74,222,128,0.3)" }}>
                <div>
                  <div className="text-lg font-bold" style={{ color: "#4ade80", textShadow: "0 0 8px rgba(74,222,128,0.5)" }}>IFRS 16 — Amortisation Calculation</div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(74,222,128,0.6)" }}>Using: {ex.contract_ref} · Month 1 ({ex.month_name} {ex.period_year})</div>
                </div>
                <button onClick={() => setBlackboardRow(null)} style={{ color: "rgba(74,222,128,0.7)", fontSize: "1.4rem", lineHeight: 1 }}>&times;</button>
              </div>

              <div className="relative px-6 py-5 space-y-6">

                {/* Given values */}
                <div>
                  <div className="text-xs mb-2" style={{ color: "rgba(74,222,128,0.5)" }}>GIVEN (from Lease Register)</div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { lbl: "Monthly Rent (PMT)",  val: f(PMT) },
                      { lbl: "IBR (Annual %)",       val: `${IBR}%` },
                      { lbl: "Term (months)",        val: `${N} months` },
                    ].map(({ lbl, val }) => (
                      <div key={lbl} className="rounded p-2.5 text-center" style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.2)" }}>
                        <div className="text-[10px] mb-1" style={{ color: "rgba(74,222,128,0.55)" }}>{lbl}</div>
                        <div className="text-sm font-bold" style={{ color: "#86efac" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Step 1 */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold" style={{ color: "#fde68a" }}>STEP 1 — Monthly Interest Rate (r)</div>
                  <div className="text-sm pl-4" style={{ color: "#e2ffe2" }}>
                    r &nbsp;= &nbsp;IBR &divide; 12 &divide; 100
                  </div>
                  <div className="text-sm pl-4" style={{ color: "#86efac" }}>
                    r &nbsp;= &nbsp;{IBR}% &divide; 12 &divide; 100 &nbsp;= &nbsp;<span style={{ color: "#fde68a", fontWeight: "bold" }}>{fp(r)}</span>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold" style={{ color: "#fde68a" }}>STEP 2 — Opening Liability (Present Value of all future rents)</div>
                  <div className="text-sm pl-4" style={{ color: "#e2ffe2" }}>
                    <span style={{ color: "#93c5fd" }}>Opening Liability</span> &nbsp;= &nbsp;PMT &times; (1 &minus; (1 + r)<sup>&minus;N</sup>) &divide; r
                  </div>
                  <div className="text-sm pl-4" style={{ color: "#86efac" }}>
                    = &nbsp;{f(PMT)} &times; (1 &minus; (1 + {fp(r)})<sup>&minus;{N}</sup>) &divide; {fp(r)}
                  </div>
                  <div className="text-sm pl-4 font-bold" style={{ color: "#93c5fd" }}>
                    <span style={{ color: "#93c5fd" }}>Opening Liability</span> &nbsp;= &nbsp;<span style={{ color: "#fde68a" }}>{f(PV)}</span>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold" style={{ color: "#fde68a" }}>STEP 3 — Interest (Finance Cost for Month 1)</div>
                  <div className="text-sm pl-4" style={{ color: "#e2ffe2" }}>
                    <span style={{ color: "#fbbf24" }}>Interest</span> &nbsp;= &nbsp;<span style={{ color: "#93c5fd" }}>Opening Liability</span> &times; r
                  </div>
                  <div className="text-sm pl-4" style={{ color: "#86efac" }}>
                    = &nbsp;{f(PV)} &times; {fp(r)}
                  </div>
                  <div className="text-sm pl-4 font-bold">
                    <span style={{ color: "#fbbf24" }}>Interest</span> &nbsp;= &nbsp;<span style={{ color: "#fde68a" }}>{f(INT)}</span>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold" style={{ color: "#fde68a" }}>STEP 4 — Payment (Cash paid to landlord)</div>
                  <div className="text-sm pl-4" style={{ color: "#e2ffe2" }}>
                    <span style={{ color: "#60a5fa" }}>Payment</span> &nbsp;= &nbsp;Monthly Rent (fixed)
                  </div>
                  <div className="text-sm pl-4 font-bold">
                    <span style={{ color: "#60a5fa" }}>Payment</span> &nbsp;= &nbsp;<span style={{ color: "#fde68a" }}>{f(PMT)}</span>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold" style={{ color: "#fde68a" }}>STEP 5 — Principal (Liability Reduction)</div>
                  <div className="text-sm pl-4" style={{ color: "#e2ffe2" }}>
                    <span style={{ color: "#34d399" }}>Principal</span> &nbsp;= &nbsp;<span style={{ color: "#60a5fa" }}>Payment</span> &minus; <span style={{ color: "#fbbf24" }}>Interest</span>
                  </div>
                  <div className="text-sm pl-4" style={{ color: "#86efac" }}>
                    = &nbsp;{f(PMT)} &minus; {f(INT)}
                  </div>
                  <div className="text-sm pl-4 font-bold">
                    <span style={{ color: "#34d399" }}>Principal</span> &nbsp;= &nbsp;<span style={{ color: "#fde68a" }}>{f(PRIN)}</span>
                  </div>
                </div>

                {/* Step 6 */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold" style={{ color: "#fde68a" }}>STEP 6 — Closing Liability</div>
                  <div className="text-sm pl-4" style={{ color: "#e2ffe2" }}>
                    <span style={{ color: "#a78bfa" }}>Closing Liability</span> &nbsp;= &nbsp;<span style={{ color: "#93c5fd" }}>Opening Liability</span> &minus; <span style={{ color: "#34d399" }}>Principal</span>
                  </div>
                  <div className="text-sm pl-4" style={{ color: "#86efac" }}>
                    = &nbsp;{f(PV)} &minus; {f(PRIN)}
                  </div>
                  <div className="text-sm pl-4 font-bold">
                    <span style={{ color: "#a78bfa" }}>Closing Liability</span> &nbsp;= &nbsp;<span style={{ color: "#fde68a" }}>{f(CL)}</span>
                  </div>
                </div>

                {/* Step 7 */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold" style={{ color: "#fde68a" }}>STEP 7 — Depreciation (ROU Asset written off per month)</div>
                  <div className="text-sm pl-4" style={{ color: "#e2ffe2" }}>
                    <span style={{ color: "#c084fc" }}>Depreciation</span> &nbsp;= &nbsp;<span style={{ color: "#93c5fd" }}>Opening Liability</span> &divide; Term
                  </div>
                  <div className="text-sm pl-4" style={{ color: "#86efac" }}>
                    = &nbsp;{f(PV)} &divide; {N}
                  </div>
                  <div className="text-sm pl-4 font-bold">
                    <span style={{ color: "#c084fc" }}>Depreciation</span> &nbsp;= &nbsp;<span style={{ color: "#fde68a" }}>{f(DEPR)}</span>
                  </div>
                </div>

                {/* Summary row */}
                <div className="rounded-lg p-4 mt-2" style={{ background: "rgba(74,222,128,0.06)", border: "1px dashed rgba(74,222,128,0.35)" }}>
                  <div className="text-xs font-bold mb-3" style={{ color: "#4ade80" }}>MONTH 1 SUMMARY</div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                    {[
                      { lbl: "Opening Liability",  val: f(PV),   col: "#93c5fd" },
                      { lbl: "Interest",            val: f(INT),  col: "#fbbf24" },
                      { lbl: "Payment",             val: f(PMT),  col: "#60a5fa" },
                      { lbl: "Principal",           val: f(PRIN), col: "#34d399" },
                      { lbl: "Closing Liability",   val: f(CL),   col: "#a78bfa" },
                      { lbl: "Depreciation",        val: f(DEPR), col: "#c084fc" },
                    ].map(({ lbl, val, col }) => (
                      <div key={lbl} className="flex justify-between items-center">
                        <span style={{ color: "rgba(226,255,226,0.7)" }}>{lbl}</span>
                        <span className="font-bold" style={{ color: col }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 text-xs" style={{ borderTop: "1px solid rgba(74,222,128,0.2)", color: "rgba(74,222,128,0.6)" }}>
                    P&amp;L charge this month: Interest ({f(INT)}) + Depreciation ({f(DEPR)}) = <span style={{ color: "#fde68a", fontWeight: "bold" }}>{f(INT + DEPR)}</span>
                    &nbsp;&nbsp;·&nbsp;&nbsp; Cash paid: <span style={{ color: "#60a5fa" }}>{f(PMT)}</span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* ── GL Entries Explain Modal ─────────────────────────────────── */}
      {showGLExplain && (
        <div className="rounded-xl border border-amber-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-400" />
              How are GL Entries generated?
            </h4>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowGLExplain(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">Under IFRS 16, every lease payment creates <strong>4 paired journal entries</strong> each month. Each pair has one Debit (Dr) and one Credit (Cr) of equal value — so total Dr always equals total Cr.</p>

            {/* Entry 1 */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 bg-muted/20 font-semibold text-xs text-[#e60000]">Entry 1 — Lease Liability Reduction (Principal)</div>
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/10"><th className="text-left px-3 py-1.5">Ledger No.</th><th className="text-left px-3 py-1.5">Account</th><th className="text-center px-3 py-1.5">Dr/Cr</th><th className="text-left px-3 py-1.5">What it means</th></tr></thead>
                <tbody>
                  <tr className="border-t border-border/40"><td className="px-3 py-1.5 font-mono text-blue-400">2100</td><td className="px-3 py-1.5">Lease Liability</td><td className="px-3 py-1.5 text-center"><span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded-full text-[10px] font-bold">Dr</span></td><td className="px-3 py-1.5 text-muted-foreground">Reduces the liability on the balance sheet (paying down the "loan")</td></tr>
                  <tr className="border-t border-border/40"><td className="px-3 py-1.5 font-mono text-emerald-400">1010</td><td className="px-3 py-1.5">Bank / Cash</td><td className="px-3 py-1.5 text-center"><span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded-full text-[10px] font-bold">Cr</span></td><td className="px-3 py-1.5 text-muted-foreground">Cash leaves the bank (actual rent payment minus interest portion)</td></tr>
                </tbody>
              </table>
            </div>

            {/* Entry 2 */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 bg-muted/20 font-semibold text-xs text-[#e60000]">Entry 2 — Finance Cost (Interest)</div>
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/10"><th className="text-left px-3 py-1.5">Ledger No.</th><th className="text-left px-3 py-1.5">Account</th><th className="text-center px-3 py-1.5">Dr/Cr</th><th className="text-left px-3 py-1.5">What it means</th></tr></thead>
                <tbody>
                  <tr className="border-t border-border/40"><td className="px-3 py-1.5 font-mono text-blue-400">6200</td><td className="px-3 py-1.5">Interest Expense</td><td className="px-3 py-1.5 text-center"><span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded-full text-[10px] font-bold">Dr</span></td><td className="px-3 py-1.5 text-muted-foreground">Finance cost charged to P&amp;L (IBR × opening liability ÷ 12)</td></tr>
                  <tr className="border-t border-border/40"><td className="px-3 py-1.5 font-mono text-emerald-400">2100</td><td className="px-3 py-1.5">Lease Liability</td><td className="px-3 py-1.5 text-center"><span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded-full text-[10px] font-bold">Cr</span></td><td className="px-3 py-1.5 text-muted-foreground">Interest accrued increases the liability before the payment reduces it</td></tr>
                </tbody>
              </table>
            </div>

            {/* Entry 3 */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 bg-muted/20 font-semibold text-xs text-[#e60000]">Entry 3 — ROU Asset Depreciation</div>
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/10"><th className="text-left px-3 py-1.5">Ledger No.</th><th className="text-left px-3 py-1.5">Account</th><th className="text-center px-3 py-1.5">Dr/Cr</th><th className="text-left px-3 py-1.5">What it means</th></tr></thead>
                <tbody>
                  <tr className="border-t border-border/40"><td className="px-3 py-1.5 font-mono text-blue-400">6100</td><td className="px-3 py-1.5">Depreciation — ROU Asset</td><td className="px-3 py-1.5 text-center"><span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded-full text-[10px] font-bold">Dr</span></td><td className="px-3 py-1.5 text-muted-foreground">Monthly usage charge to P&amp;L (opening liability ÷ term months, straight-line)</td></tr>
                  <tr className="border-t border-border/40"><td className="px-3 py-1.5 font-mono text-emerald-400">1500</td><td className="px-3 py-1.5">Accumulated Depreciation</td><td className="px-3 py-1.5 text-center"><span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded-full text-[10px] font-bold">Cr</span></td><td className="px-3 py-1.5 text-muted-foreground">Reduces the net book value of the ROU asset on the balance sheet</td></tr>
                </tbody>
              </table>
            </div>

            {/* Entry 4 */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 bg-muted/20 font-semibold text-xs text-[#e60000]">Entry 4 — ROU Asset Recognition (Day 1 only)</div>
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/10"><th className="text-left px-3 py-1.5">Ledger No.</th><th className="text-left px-3 py-1.5">Account</th><th className="text-center px-3 py-1.5">Dr/Cr</th><th className="text-left px-3 py-1.5">What it means</th></tr></thead>
                <tbody>
                  <tr className="border-t border-border/40"><td className="px-3 py-1.5 font-mono text-blue-400">1400</td><td className="px-3 py-1.5">ROU Asset</td><td className="px-3 py-1.5 text-center"><span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded-full text-[10px] font-bold">Dr</span></td><td className="px-3 py-1.5 text-muted-foreground">The right to use the property is capitalised at PV of future payments</td></tr>
                  <tr className="border-t border-border/40"><td className="px-3 py-1.5 font-mono text-emerald-400">2100</td><td className="px-3 py-1.5">Lease Liability</td><td className="px-3 py-1.5 text-center"><span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded-full text-[10px] font-bold">Cr</span></td><td className="px-3 py-1.5 text-muted-foreground">Equal and opposite liability recognised — total Dr = total Cr on Day 1</td></tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/30 px-3 py-2 text-xs text-indigo-300">
              <strong>Key rule:</strong> Every journal entry must balance — total Debits = total Credits for each period. Blue rows are Debits (assets increase / liabilities decrease). Green rows are Credits (assets decrease / liabilities increase).
            </div>
          </div>
        </div>
      )}
      {/* ── Modify Lease Dialog ─────────────────────────────────────────── */}
      {modifyDialogId !== null && (
        <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-amber-400" />
              Modify Lease — Remeasure Liability
            </h4>
            <p className="text-xs text-muted-foreground">
              IFRS 16 Para 45: When monthly rent changes, the lease liability is remeasured at the new PV of remaining payments.
              A remeasurement journal entry (JE-4) is posted to adjust the ROU asset and liability.
            </p>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setModifyDialogId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">New Monthly Payment (QAR)</label>
              <Input
                type="number"
                placeholder="e.g. 13500"
                value={modifyAmount}
                onChange={e => setModifyAmount(e.target.value)}
                className="border-amber-500/40 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Modification Effective Date</label>
              <Input
                type="date"
                value={modifyDate}
                onChange={e => setModifyDate(e.target.value)}
                className="border-amber-500/40 focus:border-amber-500"
              />
            </div>
            <div className="rounded bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-300">
              <strong>What happens:</strong> The system will recalculate the remaining schedule from the modification date using the new rent amount and post a remeasurement journal entry (JE-4) to adjust the ROU asset and lease liability.
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setModifyDialogId(null)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!modifyAmount || !modifyDate || modifyMut.isPending}
                onClick={() => {
                  if (modifyDialogId && modifyAmount && modifyDate) {
                    modifyMut.mutate({
                      contractId: modifyDialogId,
                      newMonthlyPayment: Number(modifyAmount),
                      effectiveDate: modifyDate,
                    });
                  }
                }}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                {modifyMut.isPending ? "Modifying…" : "Confirm Modification"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close Lease Dialog ───────────────────────────────────────────── */}
      {closeDialogId !== null && (
        <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              Close Lease — Derecognise Assets & Liabilities
            </h4>
            <p className="text-xs text-muted-foreground">
              IFRS 16 Para 46: On lease termination, the ROU asset and lease liability are derecognised.
              Any difference between the carrying amounts is recognised as a gain or loss in P&amp;L (JE-5).
            </p>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setCloseDialogId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Closure / Termination Date</label>
              <Input
                type="date"
                value={closeDate}
                onChange={e => setCloseDate(e.target.value)}
                className="border-red-500/40 focus:border-red-500"
              />
            </div>
            <div className="rounded bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
              <strong>Warning:</strong> This action is irreversible. The lease will be moved to <strong>Closed</strong> status.
              The ROU asset and remaining liability will be derecognised and a gain/loss entry (JE-5) will be posted.
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setCloseDialogId(null)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!closeDate || closeMut.isPending}
                onClick={() => {
                  if (closeDialogId && closeDate) {
                    closeMut.mutate({ contractId: closeDialogId, closeDate: closeDate });
                  }
                }}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {closeMut.isPending ? "Closing…" : "Confirm Closure"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
