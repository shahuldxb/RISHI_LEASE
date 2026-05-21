import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import React from "react";
import { CheckCircle, XCircle, RefreshCw, ChevronRight, Calculator, FileText, Download, Search, Filter, Calendar, TrendingUp, BookOpen, Layers, AlertTriangle, Info, X, Link2, Printer } from "lucide-react";
import { groupDrCrByAmount, type JVLine } from "@/lib/jvGrouping";

const SCREEN_ID = "VFACCJVUIX0001P001";

const JV_TYPE_LABELS: Record<string, string> = {
  INCEPTION: "Day-1 Inception",
  "Initial Recognition": "Day-1 Inception",
  MONTHLY_AMORT: "Monthly Amortisation",
  "Monthly Lease Payment": "Lease Payment",
  "Monthly Depreciation": "Depreciation",
  REMEASUREMENT: "Remeasurement",
  PERIOD_CLOSE: "Period-End Close",
  TERMINATION: "Termination",
  MANUAL: "Manual",
};

const JV_TYPE_COLORS: Record<string, string> = {
  INCEPTION: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Initial Recognition": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  MONTHLY_AMORT: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Monthly Lease Payment": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Monthly Depreciation": "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  REMEASUREMENT: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  PERIOD_CLOSE: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  TERMINATION: "bg-red-500/15 text-red-400 border-red-500/30",
  MANUAL: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  Submitted: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Posted: "bg-green-500/15 text-green-400 border-green-500/30",
  Rejected: "bg-red-500/15 text-red-400 border-red-500/30",
};

function fmt(n: number | null | undefined, cur = "QAR") {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " " + cur;
}

// Full-screen modal showing combined calculation explanations for all lines in a JV
function CalcExplanationModal({ jvNumber, lines, open, onClose }: { jvNumber: string; lines: any[]; open: boolean; onClose: () => void }) {
  if (!open) return null;
  const allLines = lines.filter((l: any) => l.calc_explanation).map((l: any) => ({
    seq: l.line_seq,
    drCr: l.dr_cr,
    code: l.account_code,
    name: l.account_name,
    amount: l.amount,
    explanation: l.calc_explanation,
  }));
  if (allLines.length === 0) return null;

  // Use groupDrCrByAmount for proper amount-based matching
  const jvLinesForGrouping: JVLine[] = allLines.map((l: any) => ({
    dr_cr: l.drCr as 'Dr' | 'Cr',
    account_code: l.code,
    account_name: l.name,
    amount: Math.abs(Number(l.amount ?? 0)),
    calc_explanation: l.explanation,
  }));
  const groups = groupDrCrByAmount(jvLinesForGrouping);

  // Build pairs from groups for display (each group becomes a pair card)
  const pairs: { dr: any; cr: any; label: string }[] = [];
  for (const group of groups) {
    // For each group, pair Dr and Cr lines side by side
    const maxLen = Math.max(group.drLines.length, group.crLines.length);
    for (let i = 0; i < maxLen; i++) {
      const drLine = group.drLines[i] ?? null;
      const crLine = group.crLines[i] ?? null;
      const dr = drLine ? { drCr: 'Dr', code: drLine.account_code, name: drLine.account_name, amount: drLine.amount, explanation: drLine.calc_explanation } : null;
      const cr = crLine ? { drCr: 'Cr', code: crLine.account_code, name: crLine.account_name, amount: crLine.amount, explanation: crLine.calc_explanation } : null;
      const label = dr && cr ? `${dr.name} / ${cr.name}` : dr ? dr.name : cr ? cr.name : `Entry`;
      pairs.push({ dr, cr, label });
    }
  }

  // Totals
  const totalDr = allLines.filter((l: any) => l.drCr === 'Dr').reduce((s: number, l: any) => s + (Math.abs(l.amount) || 0), 0);
  const totalCr = allLines.filter((l: any) => l.drCr === 'Cr').reduce((s: number, l: any) => s + (Math.abs(l.amount) || 0), 0);

  return (
    <div className="fixed inset-0 z-[9999]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="absolute inset-4 md:inset-8 lg:inset-12 bg-gray-950 border border-amber-500/30 rounded-2xl shadow-2xl flex flex-col animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-500/20 bg-gray-900/80 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">IFRS 16 Calculation Breakdown</h2>
              <p className="text-xs text-amber-400/70">{jvNumber} — Dr / Cr Paired Entries</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {pairs.map((pair, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-700/50 overflow-hidden">
              {/* Pair header */}
              <div className="px-5 py-3 bg-gray-800/80 border-b border-gray-700/50">
                <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-400">{i + 1}</span>
                  {pair.label}
                </h3>
              </div>

              {/* Dr / Cr side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-700/40">
                {/* Debit side */}
                {pair.dr ? (
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">DEBIT</span>
                      <span className="font-mono text-blue-300 text-sm">{pair.dr.code}</span>
                      <span className="text-gray-300 text-sm">{pair.dr.name}</span>
                    </div>
                    <div className="text-right mb-3">
                      <span className="font-mono text-lg font-bold text-green-400">{fmt(pair.dr.amount)}</span>
                    </div>
                    <div className="bg-gray-950/60 rounded-lg p-4 border border-gray-800">
                      <div className="font-mono text-xs text-gray-300 whitespace-pre-wrap leading-[1.8] tracking-wide">
                        {pair.dr.explanation}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 flex items-center justify-center">
                    <p className="text-xs text-gray-500 italic">No debit entry</p>
                  </div>
                )}

                {/* Credit side */}
                {pair.cr ? (
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">CREDIT</span>
                      <span className="font-mono text-blue-300 text-sm">{pair.cr.code}</span>
                      <span className="text-gray-300 text-sm">{pair.cr.name}</span>
                    </div>
                    <div className="text-right mb-3">
                      <span className="font-mono text-lg font-bold text-red-400">{fmt(pair.cr.amount)}</span>
                    </div>
                    <div className="bg-gray-950/60 rounded-lg p-4 border border-gray-800">
                      <div className="font-mono text-xs text-gray-300 whitespace-pre-wrap leading-[1.8] tracking-wide">
                        {pair.cr.explanation}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 flex items-center justify-center">
                    <p className="text-xs text-gray-500 italic">—</p>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Totals bar */}
          <div className="bg-gray-900 rounded-xl border border-gray-700/50 px-6 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-300">Journal Totals</span>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total Debit</p>
                  <p className="font-mono text-base font-bold text-green-400">{fmt(totalDr)}</p>
                </div>
                <div className="text-gray-600">=</div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total Credit</p>
                  <p className="font-mono text-base font-bold text-red-400">{fmt(totalCr)}</p>
                </div>
                <div className="ml-4">
                  {Math.abs(totalDr - totalCr) < 0.01 ? (
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">BALANCED</span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">UNBALANCED</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50 rounded-b-2xl">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function JournalVoucher() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // ── Filters ────────────────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [contractFilter, setContractFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // ── Read contract_id from URL query param (navigated from Transaction Centre) ──────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cid = params.get('contract_id');
    if (cid && !isNaN(Number(cid))) {
      setContractFilter(cid);
    }
  }, []);

  // ── Contracts dropdown for filter ────────────────────────────────────────────────────────────────────────────
  const { data: contractsData } = trpc.transactionEngine.getContracts.useQuery();

  // ── Expanded JV (inline accordion) ────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // keep selectedId as alias so mutations still work
  const selectedId = expandedId;

  // ── Dialogs ──────────────────────────────────────────────────────────────
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; jv_id: number | null; reason: string }>({ open: false, jv_id: null, reason: "" });

  const [batchSelected, setBatchSelected] = useState<Set<number>>(new Set());
  const [calcModalJv, setCalcModalJv] = useState<{ jvNumber: string; jvId: number } | null>(null);

  // ── System Settings ───────────────────────────────────────────────────────
  const { data: settings } = trpc.journalVoucher.getSettings.useQuery();
  const accountingPeriodDate = settings?.accounting_period_date
    ? new Date(settings.accounting_period_date).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);


  // ── List Query ────────────────────────────────────────────────────────────────────────────
  const listInput = useMemo(() => ({
    status: statusFilter === "all" ? undefined : statusFilter,
    jv_type: typeFilter === "all" ? undefined : typeFilter,
    contract_id: contractFilter === "all" ? undefined : Number(contractFilter),
    search: search || undefined,
    page,
    page_size: 10,
  }), [statusFilter, typeFilter, contractFilter, search, page]);

  const { data: listData, isLoading, refetch } = trpc.journalVoucher.list.useQuery(listInput);
  const rows = listData?.rows ?? [];
  const allLines: any[] = listData?.allLines ?? [];
  const total = listData?.total ?? 0;

  const utils = trpc.useUtils();
  const invalidate = () => utils.journalVoucher.list.invalidate();

  // ── Mutations ─────────────────────────────────────────────────────────────
  const postMut = trpc.journalVoucher.post.useMutation({
    onSuccess: (r) => { toast.success(`JV ${r?.jv_number} posted successfully`); invalidate(); utils.journalVoucher.getById.invalidate(); },
    onError: (e) => toast.error(`Post failed: ${e.message}`),
  });

  const rejectMut = trpc.journalVoucher.reject.useMutation({
    onSuccess: (r) => { toast.success(`JV ${r?.jv_number} rejected`); setRejectDialog({ open: false, jv_id: null, reason: "" }); invalidate(); utils.journalVoucher.getById.invalidate(); },
    onError: (e) => toast.error(`Reject failed: ${e.message}`),
  });

  const batchPostMut = trpc.journalVoucher.batchPost.useMutation({
    onSuccess: (r) => {
      toast.success(`Batch post: ${r?.posted_count} posted, ${r?.failed_count} failed`);
      setBatchSelected(new Set());
      invalidate();
    },
    onError: (e) => toast.error(`Batch post failed: ${e.message}`),
  });

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ["JV Number", "Type", "Period", "Posting Date", "Description", "Contract Ref", "Currency", "Total Debit", "Total Credit", "Status", "Created By", "Posted By"];
    const csvRows = rows.map((r: any) => [
      r.jv_number, JV_TYPE_LABELS[r.jv_type] ?? r.jv_type,
      `${r.period_year}-${String(r.period_month).padStart(2, "0")}`,
      (r.posting_date ? new Date(r.posting_date).toISOString().slice(0, 10) : ""),
      `"${(r.description ?? "").replace(/"/g, '""')}"`,
      r.contract_ref ?? "",
      r.currency ?? "QAR",
      r.total_debit ?? 0,
      r.total_credit ?? 0,
      r.status,
      r.created_by ?? "",
      r.posted_by ?? "",
    ].join(","));
    const blob = new Blob([headers.join(",") + "\n" + csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "journal_vouchers.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // Lines for the currently expanded JV — sourced directly from the list query (no extra DB call)
  const expandedLines = expandedId ? allLines.filter((l: any) => l.jv_id === expandedId) : [];
  const expandedJv = expandedId ? (rows.find((r: any) => r.jv_id === expandedId) ?? null) : null;

  const selectedJv = expandedJv;
  const selectedLines = expandedLines;

  return (
    <DashboardLayout>
      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 10mm; }
          body { font-family: 'Arial', sans-serif; font-size: 8pt; color: #000; background: #fff !important; -webkit-print-color-adjust: exact; }
          .print-hidden, nav, aside, header, [data-sidebar], .sidebar { display: none !important; }
          .print-only { display: block !important; }
          .print-table { width: 100%; border-collapse: collapse; font-size: 7pt; }
          .print-table th, .print-table td { border: 0.5pt solid #333; padding: 2pt 4pt; text-align: left; }
          .print-table th { background: #e0e0e0 !important; font-weight: bold; }
          .print-header { text-align: center; margin-bottom: 8pt; }
          .print-header h1 { font-size: 14pt; font-weight: bold; margin: 0; }
          .print-header p { font-size: 9pt; margin: 2pt 0; color: #333; }
          .print-group-header { background: #f0f0f0 !important; font-weight: bold; }
          .page-break-avoid { page-break-inside: avoid; }
        }
      `}</style>
      <div className="flex flex-col h-full bg-gray-950 text-gray-100 print-hidden">
        <ScreenHeader
          screenId={SCREEN_ID}
          title="Journal Voucher Register"
          subtitle="IFRS 16 Accounting Entries — Generate, Review & Post"
          screenType="journal_voucher"
          onAIData={() => {}}
        />

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-gray-800 bg-gray-900">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search JV number, description..."
              className="pl-9 bg-gray-800 border-gray-700 text-gray-100 h-8 text-sm"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36 h-8 bg-gray-800 border-gray-700 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Submitted">Submitted</SelectItem>
              <SelectItem value="Posted">Posted</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-44 h-8 bg-gray-800 border-gray-700 text-sm">
              <SelectValue placeholder="JV Type" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="INCEPTION">Day-1 Inception</SelectItem>
              <SelectItem value="MONTHLY_AMORT">Monthly Amortisation</SelectItem>
              <SelectItem value="REMEASUREMENT">Remeasurement</SelectItem>
              <SelectItem value="PERIOD_CLOSE">Period-End Close</SelectItem>
            </SelectContent>
          </Select>

          {/* Lease filter dropdown */}
          <Select value={contractFilter} onValueChange={v => { setContractFilter(v); setPage(1); }}>
            <SelectTrigger className={`w-52 h-8 border-gray-700 text-sm ${contractFilter !== 'all' ? 'bg-blue-900/40 border-blue-500/50 text-blue-300' : 'bg-gray-800'}`}>
              <SelectValue placeholder="All Leases" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 max-h-64">
              <SelectItem value="all">All Leases</SelectItem>
              {(contractsData ?? []).map((c: any) => (
                <SelectItem key={c.contract_id} value={String(c.contract_id)}>
                  {c.contract_ref} — {c.asset_description ?? c.lessor_name ?? ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {contractFilter !== 'all' && (
            <button
              onClick={() => setContractFilter('all')}
              className="h-8 w-8 flex items-center justify-center rounded border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-colors"
              title="Clear lease filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="flex items-center gap-1 ml-auto">
            {batchSelected.size > 0 && (
              <Button
                size="sm"
                className="h-8 bg-green-600 hover:bg-green-700 text-white text-xs"
                onClick={() => batchPostMut.mutate({ jv_ids: Array.from(batchSelected) })}
                disabled={batchPostMut.isPending}
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Batch Post ({batchSelected.size})
              </Button>
            )}

            <Button
              size="sm"
              className="h-8 text-xs bg-[#e60000] hover:bg-[#cc0000] text-white font-semibold"
              onClick={() => window.print()}
            >
              <Printer className="w-3 h-3 mr-1" />
              Print Register
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-gray-700 bg-gray-800 hover:bg-gray-700"
              onClick={exportCSV}
            >
              <Download className="w-3 h-3 mr-1" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-gray-700 bg-gray-800 hover:bg-gray-700"
              onClick={() => refetch()}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {/* ── Accounting Period Info ── */}
        <div className="flex items-center gap-2 px-6 py-2 bg-blue-900/20 border-b border-blue-800/30 text-xs text-blue-300">
          <Calendar className="w-3.5 h-3.5" />
          <span>Current Accounting Period Date: <strong>{accountingPeriodDate}</strong></span>
          <span className="text-gray-500">— Used for monthly JV generation. Change in System Settings.</span>
        </div>

        {/* ── Main Content: Full-width accordion table ── */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-col w-full overflow-hidden">
            {/* Pagination bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/50">
              <span className="text-xs text-gray-500">{total} journal vouchers</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</Button>
                <span className="text-xs text-gray-500">Page {page} of {Math.ceil(total / 10) || 1}</span>
                <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setPage(p => p + 1)} disabled={rows.length < 10}>Next ›</Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-32 text-gray-500 text-sm">Loading journal vouchers...</div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-3">
                  <BookOpen className="w-10 h-10 opacity-30" />
                  <p className="text-sm">No journal vouchers found.</p>
                  <p className="text-xs text-gray-600">Use the Lease Register to send monthly JVs from the amortisation schedule.</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-900 border-b border-gray-800 z-10">
                    <tr>
                      <th className="w-6 px-2 py-2" />{/* spacer */}
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Dr/Cr</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Acct Code</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Account Name</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Description</th>
                      <th className="px-3 py-2 text-right text-gray-400 font-medium">Debit</th>
                      <th className="px-3 py-2 text-right text-gray-400 font-medium">Credit</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Status</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const monthNames = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                      return rows.map((r: any, rIdx: number) => {
                        const jvLines = allLines.filter((l: any) => l.jv_id === r.jv_id);
                        const groups = groupDrCrByAmount(jvLines as JVLine[]);
                        const periodStr = `${monthNames[r.period_month]}-${String(r.period_year).slice(2)}`;
                        const postingDateStr = r.posting_date ? new Date(r.posting_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                        const createdDateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                        return (
                          <React.Fragment key={r.jv_id}>
                            {/* ── Spacer row between groups ── */}
                            {rIdx > 0 && (
                              <tr><td colSpan={9} className="h-4 bg-gray-950"></td></tr>
                            )}
                            {/* ── JV Group Header ── */}
                            <tr className="bg-gray-800/70 border-b border-gray-700/60">
                              <td colSpan={9} className="px-4 py-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="font-mono text-blue-300 font-semibold text-[11px]">{r.jv_number}</span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] border ${JV_TYPE_COLORS[r.jv_type] ?? 'bg-gray-700 text-gray-300'}`}>
                                      {JV_TYPE_LABELS[r.jv_type] ?? r.jv_type}
                                    </span>
                                    {r.period_seq != null && r.jv_type === 'MONTHLY_AMORT' && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                                        #{r.period_seq}
                                      </span>
                                    )}
                                    {r.contract_ref && (
                                      <button
                                        className="font-mono text-[10px] text-blue-400 hover:text-blue-200 hover:underline transition-colors"
                                        onClick={() => setLocation(`/leases/transaction-centre?contractId=${r.contract_id}`)}
                                      >
                                        {r.contract_ref}
                                      </button>
                                    )}
                                    <span className="text-[10px] text-gray-500">|</span>
                                    <span className="text-[10px] text-gray-400">Period: <span className="text-amber-300 font-medium">{periodStr}</span></span>
                                    <span className="text-[10px] text-gray-500">|</span>
                                    <span className="text-[10px] text-gray-400">Posted: <span className="text-gray-200">{postingDateStr}</span></span>
                                    <span className="text-[10px] text-gray-500">|</span>
                                    <span className="text-[10px] text-gray-400">Created: <span className="text-gray-200">{createdDateStr}</span></span>
                                    {r.lessor_name && (
                                      <><span className="text-[10px] text-gray-500">|</span>
                                      <span className="text-[10px] text-gray-400">Lessor: <span className="text-gray-200">{r.lessor_name}</span></span></>
                                    )}
                                    {r.staff_name && (
                                      <><span className="text-[10px] text-gray-500">|</span>
                                      <span className="text-[10px] text-gray-400">By: <span className="text-cyan-400">{r.staff_name}</span></span></>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-[10px] border ${STATUS_COLORS[r.status] ?? 'bg-gray-700 text-gray-300'}`}>
                                      {r.status}
                                    </span>
                                    {(r.status === 'Draft' || r.status === 'Submitted') && (
                                      <>
                                        <Button size="sm" className="h-5 px-2 text-[9px] bg-green-700 hover:bg-green-600 text-white"
                                          onClick={() => postMut.mutate({ jv_id: r.jv_id })} disabled={postMut.isPending}>
                                          <CheckCircle className="w-2.5 h-2.5 mr-0.5" />Post
                                        </Button>
                                        <Button size="sm" variant="outline" className="h-5 px-2 text-[9px] border-red-700/50 text-red-400 hover:bg-red-900/20"
                                          onClick={() => setRejectDialog({ open: true, jv_id: r.jv_id, reason: '' })}>
                                          <XCircle className="w-2.5 h-2.5 mr-0.5" />Reject
                                        </Button>
                                      </>
                                    )}
                                    <button
                                      onClick={() => setCalcModalJv({ jvNumber: r.jv_number, jvId: r.jv_id })}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
                                      title="View IFRS 16 calculation breakdown"
                                    >
                                      <Calculator className="w-2.5 h-2.5" />Calc
                                    </button>
                                  </div>
                                </div>
                                {r.description && (
                                  <div className="mt-1 text-[10px] text-gray-500 pl-6">{r.description}</div>
                                )}
                              </td>
                            </tr>
                            {/* ── Grouped Dr/Cr lines by matching amounts ── */}
                            {groups.map((group, gIdx) => (
                              <React.Fragment key={`grp-${group.id}`}>
                                {/* Group separator */}
                                {gIdx > 0 && (
                                  <tr><td colSpan={9} className="h-px bg-gray-700/30"></td></tr>
                                )}
                                {/* Group label row */}
                                <tr className="bg-gray-850/40">
                                  <td colSpan={9} className="px-4 py-1">
                                    <div className="flex items-center gap-2">
                                      <Link2 className="w-3 h-3 text-amber-500/60" />
                                      <span className="text-[9px] text-amber-400/70 font-medium tracking-wide uppercase">Group {group.id}: {group.label}</span>
                                      {group.balanced && <span className="text-[8px] text-green-500/60 ml-auto">✓ balanced</span>}
                                    </div>
                                  </td>
                                </tr>
                                {/* Dr lines in this group */}
                                {group.drLines.map((line: any, idx: number) => (
                                  <tr key={`dr-${line.line_id ?? idx}`} className="border-b border-gray-800/30 bg-green-950/10 hover:bg-green-950/20">
                                    <td className="px-2 py-1.5"></td>
                                    <td className="px-3 py-1.5">
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-900/40 text-green-400 border border-green-700/40">Dr</span>
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-blue-300 text-[11px]">{line.account_code}</td>
                                    <td className="px-3 py-1.5 text-gray-200">{line.account_name}</td>
                                    <td className="px-3 py-1.5 text-gray-400 max-w-[200px] truncate">{line.description}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-green-400 font-semibold">{fmt(line.amount, line.currency)}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-700">—</td>
                                    <td className="px-3 py-1.5"></td>
                                    <td className="px-3 py-1.5"></td>
                                  </tr>
                                ))}
                                {/* Cr lines in this group */}
                                {group.crLines.map((line: any, idx: number) => (
                                  <tr key={`cr-${line.line_id ?? idx}`} className="border-b border-gray-800/30 bg-red-950/10 hover:bg-red-950/20">
                                    <td className="px-2 py-1.5">
                                      <div className="w-3 border-l-2 border-b-2 border-amber-500/20 h-3 ml-1 rounded-bl"></div>
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/40 text-red-400 border border-red-700/40">Cr</span>
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-blue-300 text-[11px]">{line.account_code}</td>
                                    <td className="px-3 py-1.5 text-gray-200 pl-4">{line.account_name}</td>
                                    <td className="px-3 py-1.5 text-gray-400 max-w-[200px] truncate">{line.description}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-700">—</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-red-400 font-semibold">{fmt(line.amount, line.currency)}</td>
                                    <td className="px-3 py-1.5"></td>
                                    <td className="px-3 py-1.5"></td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            ))}
                            {/* ── Totals row ── */}
                            <tr className="border-b border-gray-700/50 bg-gray-800/40">
                              <td className="px-2 py-1.5"></td>
                              <td colSpan={4} className="px-3 py-1.5 text-right text-[10px] text-gray-500 font-medium">TOTAL</td>
                              <td className="px-3 py-1.5 text-right font-mono text-green-300 font-bold border-t border-green-800/40">{fmt(r.total_debit, r.currency)}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-red-300 font-bold border-t border-red-800/40">{fmt(r.total_credit, r.currency)}</td>
                              <td className="px-3 py-1.5"></td>
                              <td className="px-3 py-1.5"></td>
                            </tr>
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>



        {/* ── Reject Dialog ── */}
        {rejectDialog.open && (
          <div className="rounded-xl border border-red-500/30 bg-gray-900/50 p-5 space-y-4">
          
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Reject Journal Voucher
              </h4>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setRejectDialog({ open: false, jv_id: null, reason: "" })}><X className="w-3.5 h-3.5" /></Button>
          </div>
            <div className="space-y-3 py-2">
              <label className="text-xs text-gray-400">Rejection Reason <span className="text-red-400">*</span></label>
              <Textarea
                placeholder="Enter reason for rejection..."
                className="bg-gray-800 border-gray-700 text-gray-100 resize-none"
                rows={3}
                value={rejectDialog.reason}
                onChange={e => setRejectDialog(d => ({ ...d, reason: e.target.value }))}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setRejectDialog({ open: false, jv_id: null, reason: "" })} className="border-gray-700">Cancel</Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={!rejectDialog.reason.trim() || rejectMut.isPending}
                onClick={() => rejectMut.mutate({ jv_id: rejectDialog.jv_id!, rejection_reason: rejectDialog.reason })}
              >
                {rejectMut.isPending ? "Rejecting..." : "Reject JV"}
              </Button>
            </div>
        </div>
      )}
        {/* ── Calc Explanation Modal (JV-level) ── */}
        {calcModalJv && (
          <CalcExplanationModal
            jvNumber={calcModalJv.jvNumber}
            lines={allLines.filter((l: any) => l.jv_id === calcModalJv.jvId)}
            open={true}
            onClose={() => setCalcModalJv(null)}
          />
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          PRINT-ONLY SECTION — hidden on screen, visible only when printing
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="hidden print-only" style={{ display: 'none' }}>
        <div className="print-header">
          <h1>Journal Voucher Register</h1>
          <p>IFRS 16 Monthly Amortisation — {rows.length > 0 ? rows[0].contract_ref : 'All Leases'}</p>
          <p>Period: {statusFilter !== 'all' ? statusFilter : 'All'} | Generated: {new Date().toLocaleDateString('en-GB')}</p>
        </div>
        <table className="print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>JV Number</th>
              <th>Type</th>
              <th>Period</th>
              <th>Dr/Cr</th>
              <th>Acct Code</th>
              <th>Account Name</th>
              <th style={{ textAlign: 'right' }}>Debit</th>
              <th style={{ textAlign: 'right' }}>Credit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, rIdx: number) => {
              const jvLines = allLines.filter((l: any) => l.jv_id === r.jv_id);
              const monthNames = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const periodStr = `${monthNames[r.period_month]}-${String(r.period_year).slice(2)}`;
              return (
                <React.Fragment key={r.jv_id}>
                  <tr className="print-group-header">
                    <td>{r.period_seq ?? rIdx + 1}</td>
                    <td>{r.jv_number}</td>
                    <td>{r.jv_type === 'MONTHLY_AMORT' ? 'Monthly' : r.jv_type === 'Initial Recognition' ? 'Initial' : r.jv_type}</td>
                    <td>{periodStr}</td>
                    <td colSpan={4}>{r.description || ''}</td>
                    <td>{r.status}</td>
                    <td></td>
                  </tr>
                  {jvLines.map((l: any) => (
                    <tr key={`${r.jv_id}-${l.line_seq}`}>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td>{l.dr_cr}</td>
                      <td>{l.account_code}</td>
                      <td>{l.account_name}</td>
                      <td style={{ textAlign: 'right' }}>{l.dr_cr === 'Dr' ? Number(l.amount).toLocaleString('en', { minimumFractionDigits: 2 }) : ''}</td>
                      <td style={{ textAlign: 'right' }}>{l.dr_cr === 'Cr' ? Number(l.amount).toLocaleString('en', { minimumFractionDigits: 2 }) : ''}</td>
                      <td></td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
