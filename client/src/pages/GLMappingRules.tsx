import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Pencil, Save, X, RefreshCw, Plus,
  ArrowRightLeft, Zap, Download, Layers, AlertTriangle, Check,
  Play, Eye, Trash2, Search
} from "lucide-react";

const SCREEN_ID = "VFGLMAP0001P001";

// ── Lifecycle group metadata ───────────────────────────────────────────────────
const LIFECYCLE_META: Record<string, { icon: string; color: string; description: string }> = {
  INCEPTION:      { icon: "🏗️", color: "border-blue-500/50 bg-blue-500/5",    description: "Day-1 recognition entries when a new lease is originated" },
  MONTHLY:        { icon: "📅", color: "border-emerald-500/50 bg-emerald-500/5", description: "Recurring monthly amortisation entries (depreciation, interest, payments)" },
  REMEASUREMENT:  { icon: "🔄", color: "border-amber-500/50 bg-amber-500/5",   description: "Entries triggered by CPI escalation, modifications, or renewals" },
  TERMINATION:    { icon: "🔚", color: "border-rose-500/50 bg-rose-500/5",     description: "Derecognition entries for lease termination, impairment, or gain/loss" },
  OTHER:          { icon: "📋", color: "border-purple-500/50 bg-purple-500/5",  description: "Sub-lease income, FX revaluation, and other transaction types" },
};

// ── Human-readable transaction type labels ─────────────────────────────────────
const TX_TYPE_LABELS: Record<string, string> = {
  ROU_INITIAL_RECOGNITION: "ROU Asset Initial Recognition",
  SECURITY_DEPOSIT_PAID: "Security Deposit Paid",
  RENT_PREPAYMENT: "Rent Prepayment",
  DEPRECIATION_PROPERTY: "Depreciation — Property",
  DEPRECIATION_VEHICLE: "Depreciation — Vehicle",
  DEPRECIATION_EQUIPMENT: "Depreciation — Equipment",
  DEPRECIATION_IT_INFRA: "Depreciation — IT Infrastructure",
  DEPRECIATION_TOWER: "Depreciation — Tower Sites",
  INTEREST_EXPENSE: "Interest Expense (Unwinding)",
  LEASE_PAYMENT: "Lease Payment",
  CPI_ESCALATION: "CPI Escalation Remeasurement",
  MODIFICATION_INCREASE: "Modification — Increase in Scope",
  MODIFICATION_DECREASE: "Modification — Decrease in Scope",
  RENEWAL: "Lease Renewal",
  TERMINATION_GAIN: "Termination — Gain on Derecognition",
  TERMINATION_LOSS: "Termination — Loss on Derecognition",
  IMPAIRMENT: "Impairment of ROU Asset",
  SUBLEASE_INCOME: "Sub-lease Rental Income",
  FX_REVALUATION: "FX Revaluation on Lease Liability",
  RENT_EXPENSE: "Rent Expense (Exempt Leases)",
};

// ── Simulate JV Panel ──────────────────────────────────────────────────────────
function SimulateJVPanel({ transactionType, onClose }: { transactionType: string; onClose: () => void }) {
  const [amount, setAmount] = useState(100000);
  const { data: simulation, isLoading } = trpc.glConfiguration.simulateJV.useQuery(
    { transactionType, amount, screenId: "GLOBAL" },
    { enabled: !!transactionType }
  );

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold">Simulate Journal Voucher</h2>
          <p className="text-xs text-muted-foreground">{TX_TYPE_LABELS[transactionType] || transactionType}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4 mr-1" /> Close</Button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Amount Input */}
          <div className="flex items-center gap-3 mb-6">
            <label className="text-sm font-medium">Transaction Amount:</label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(Number(e.target.value))}
              className="w-48 font-mono"
            />
            <span className="text-sm text-muted-foreground">QAR</span>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Simulating...</div>
          ) : simulation ? (
            <div className="space-y-4">
              {/* JV Preview */}
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-muted/30 border-b border-border">
                  <span className="text-sm font-semibold">Journal Voucher Preview</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">Entry</th>
                      <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">GL Code</th>
                      <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">Account Name</th>
                      <th className="py-2.5 px-4 text-right text-xs font-medium text-muted-foreground">Debit</th>
                      <th className="py-2.5 px-4 text-right text-xs font-medium text-muted-foreground">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50 bg-green-500/5">
                      <td className="py-2.5 px-4">
                        <span className="text-xs font-bold text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded">Dr</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs font-semibold">{simulation.debit.glCode || "—"}</td>
                      <td className="py-2.5 px-4">{simulation.debit.accountName}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold">{simulation.debit.amount.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right text-muted-foreground">—</td>
                    </tr>
                    <tr className="bg-red-500/5">
                      <td className="py-2.5 px-4">
                        <span className="text-xs font-bold text-red-400 bg-red-500/20 px-1.5 py-0.5 rounded">Cr</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs font-semibold">{simulation.credit.glCode || "—"}</td>
                      <td className="py-2.5 px-4">{simulation.credit.accountName}</td>
                      <td className="py-2.5 px-4 text-right text-muted-foreground">—</td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold">{simulation.credit.amount.toLocaleString()}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={3} className="py-2.5 px-4 text-xs font-semibold text-right">Total</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold">{amount.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold">{amount.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {simulation.autoCreated && (
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs text-amber-300">One or more GL codes were auto-created from the Chart of Accounts lookup. Review and confirm the mapping.</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Edit Mapping Form (Full Screen) ────────────────────────────────────────────
function EditMappingForm({
  mapping,
  coaAccounts,
  onSave,
  onCancel,
  isSaving,
}: {
  mapping: any;
  coaAccounts: any[];
  onSave: (data: any) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    screenId: mapping?.screen_id ?? "GLOBAL",
    transactionType: mapping?.rule_name?.replace(/\s+/g, "_").toUpperCase() ?? "",
    debitGLCode: mapping?.jv_debit_account ?? "",
    creditGLCode: mapping?.jv_credit_account ?? "",
    description: mapping?.rule_description ?? mapping?.jv_description ?? "",
    ifrsReference: mapping?.ifrs_reference ?? "",
    priority: mapping?.priority ?? 50,
  });

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{mapping ? "Edit GL Mapping" : "Add New GL Mapping"}</h2>
            <p className="text-xs text-muted-foreground">Transaction Type → GL Code Configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(form)} disabled={isSaving}>
            <Save className="w-4 h-4 mr-1" /> {isSaving ? "Saving..." : "Save Mapping"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto grid grid-cols-2 gap-6">
          {/* Screen ID */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Screen Scope</label>
            <select
              value={form.screenId}
              onChange={e => setForm(f => ({ ...f, screenId: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="GLOBAL">GLOBAL (All Screens)</option>
              <option value="INCEPTION">Inception Only</option>
              <option value="MONTHLY">Monthly Only</option>
              <option value="REMEASUREMENT">Remeasurement Only</option>
              <option value="TERMINATION">Termination Only</option>
            </select>
          </div>

          {/* Transaction Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transaction Type *</label>
            <select
              value={form.transactionType}
              onChange={e => setForm(f => ({ ...f, transactionType: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Select —</option>
              {Object.entries(TX_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Debit GL Code */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Debit GL Code *</label>
            <select
              value={form.debitGLCode}
              onChange={e => setForm(f => ({ ...f, debitGLCode: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-mono"
            >
              <option value="">— Select Account —</option>
              {coaAccounts.filter((a: any) => a.is_active).map((a: any) => (
                <option key={a.account_code} value={a.account_code}>
                  {a.account_code} — {a.account_name}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-green-400">Dr (Debit) side of the journal entry</span>
          </div>

          {/* Credit GL Code */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Credit GL Code *</label>
            <select
              value={form.creditGLCode}
              onChange={e => setForm(f => ({ ...f, creditGLCode: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-mono"
            >
              <option value="">— Select Account —</option>
              {coaAccounts.filter((a: any) => a.is_active).map((a: any) => (
                <option key={a.account_code} value={a.account_code}>
                  {a.account_code} — {a.account_name}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-red-400">Cr (Credit) side of the journal entry</span>
          </div>

          {/* IFRS Reference */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">IFRS Reference</label>
            <Input
              value={form.ifrsReference}
              onChange={e => setForm(f => ({ ...f, ifrsReference: e.target.value }))}
              placeholder="e.g. IFRS 16.22-25"
            />
          </div>

          {/* Priority */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Priority (1-100)</label>
            <Input
              type="number"
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
              min={1}
              max={100}
            />
          </div>

          {/* Description (full width) */}
          <div className="col-span-2 flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe the accounting treatment and IFRS 16 paragraph reference..."
              className="min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function GLMappingRules() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["INCEPTION", "MONTHLY"]));
  const [editMapping, setEditMapping] = useState<any | null | "new">(null);
  const [simulateTxType, setSimulateTxType] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const utils = trpc.useUtils();

  const { data: allMappings = [], isLoading } = trpc.glConfiguration.getAllMappings.useQuery();
  const { data: lifecycleGroups = [] } = trpc.glConfiguration.getLifecycleGroups.useQuery();
  const { data: coaAccounts = [] } = trpc.glConfiguration.getCOA.useQuery({ activeOnly: true });

  const seedMut = trpc.glConfiguration.seedDefaults.useMutation({
    onSuccess: (r) => {
      toast.success(`Seeded ${r.seededCount} default GL mappings`);
      utils.glConfiguration.getAllMappings.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const upsertMut = trpc.glConfiguration.upsertMapping.useMutation({
    onSuccess: (r) => {
      if (r?.warnings?.length) {
        r.warnings.forEach((w: string) => toast.warning(w));
      }
      toast.success("GL mapping saved");
      utils.glConfiguration.getAllMappings.invalidate();
      setEditMapping(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.glConfiguration.deleteMapping.useMutation({
    onSuccess: () => {
      toast.success("Mapping deactivated");
      utils.glConfiguration.getAllMappings.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Group mappings by lifecycle
  const grouped = useMemo(() => {
    const groups: Record<string, { label: string; types: string[]; mappings: any[] }> = {};
    for (const lg of lifecycleGroups as any[]) {
      groups[lg.key] = { label: lg.label, types: lg.transactionTypes, mappings: [] };
    }
    // Assign each mapping to a group using bidirectional matching + keyword fallback
    for (const m of allMappings as any[]) {
      const txType = m.rule_name?.replace(/\s+/g, "_").toUpperCase() || "";
      const desc = (m.jv_description || "").toUpperCase().replace(/[\s-]+/g, "_");
      const combined = `${txType} ${desc}`;
      let assigned = false;
      for (const [key, group] of Object.entries(groups)) {
        // Bidirectional: rule_name includes type OR type includes rule_name
        if (group.types.some((t: string) => txType.includes(t) || t.includes(txType) || desc.includes(t))) {
          group.mappings.push(m);
          assigned = true;
          break;
        }
      }
      // Keyword-based fallback (mirrors backend classifyMapping logic)
      // Order matters: check TERMINATION before INCEPTION to avoid "derecognition" matching "recognition"
      if (!assigned) {
        if (combined.includes('TERMINAT') || combined.includes('IMPAIR') || combined.includes('DERECOG')) {
          if (groups.TERMINATION) { groups.TERMINATION.mappings.push(m); assigned = true; }
        } else if (combined.includes('CPI') || combined.includes('ESCALAT') || combined.includes('MODIFIC') || combined.includes('REMEASUR') || combined.includes('RENEWAL')) {
          if (groups.REMEASUREMENT) { groups.REMEASUREMENT.mappings.push(m); assigned = true; }
        } else if (combined.includes('DEPRECIATION') || combined.includes('INTEREST') || combined.includes('PAYMENT') || combined.includes('AMORTIS') || combined.includes('PERIOD_CLOSE')) {
          if (groups.MONTHLY) { groups.MONTHLY.mappings.push(m); assigned = true; }
        } else if (combined.includes('INITIAL') || combined.includes('INCEPTION') || combined.includes('RECOGNITION') || combined.includes('DEPOSIT') || combined.includes('PREPAY')) {
          if (groups.INCEPTION) { groups.INCEPTION.mappings.push(m); assigned = true; }
        } else if (combined.includes('SUBLEASE') || combined.includes('FX_REVAL') || combined.includes('RENT_EXPENSE')) {
          if (groups.OTHER) { groups.OTHER.mappings.push(m); assigned = true; }
        }
      }
      if (!assigned && groups.OTHER) {
        groups.OTHER.mappings.push(m);
      }
    }
    return groups;
  }, [allMappings, lifecycleGroups]);

  // Filter
  const filteredGrouped = useMemo(() => {
    if (!search) return grouped;
    const s = search.toLowerCase();
    const result: typeof grouped = {};
    for (const [key, group] of Object.entries(grouped)) {
      const filtered = group.mappings.filter((m: any) =>
        m.rule_name?.toLowerCase().includes(s) ||
        m.jv_debit_account?.toLowerCase().includes(s) ||
        m.jv_credit_account?.toLowerCase().includes(s) ||
        m.jv_description?.toLowerCase().includes(s)
      );
      if (filtered.length > 0) {
        result[key] = { ...group, mappings: filtered };
      }
    }
    return result;
  }, [grouped, search]);

  const totalMappings = (allMappings as any[]).length;
  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <DashboardLayout>
      <ScreenHeader title="GL Mapping Rules" screenId={SCREEN_ID} subtitle="Transaction Type → GL Code Configuration Matrix" />

      {/* Summary Bar */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="bg-card border border-border rounded-lg px-4 py-2.5 flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{totalMappings}</span>
          <span className="text-xs text-muted-foreground">Total Mappings</span>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-2.5 flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold">{Object.keys(grouped).length}</span>
          <span className="text-xs text-muted-foreground">Lifecycle Groups</span>
        </div>
        <div className="flex-1" />

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search mappings..."
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Button variant="outline" size="sm" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${seedMut.isPending ? "animate-spin" : ""}`} /> Seed Defaults
        </Button>
        <Button size="sm" onClick={() => setEditMapping("new")}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Mapping
        </Button>
      </div>

      {/* Lifecycle Groups */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading GL Mappings...</div>
      ) : totalMappings === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-lg">
          <Layers className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">No GL mappings configured yet. Seed the default IFRS 16 mappings to get started.</p>
          <Button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
            <Zap className="w-4 h-4 mr-1" /> Seed Default Mappings
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(filteredGrouped).map(([key, group]) => {
            const meta = LIFECYCLE_META[key] || LIFECYCLE_META.OTHER;
            const isExpanded = expandedGroups.has(key);

            return (
              <div key={key} className={`border rounded-lg overflow-hidden ${meta.color}`}>
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(key)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="text-lg">{meta.icon}</span>
                  <div className="text-left flex-1">
                    <div className="text-sm font-semibold">{group.label}</div>
                    <div className="text-[10px] text-muted-foreground">{meta.description}</div>
                  </div>
                  <span className="text-xs font-mono bg-muted/50 px-2 py-0.5 rounded">{group.mappings.length} mappings</span>
                </button>

                {/* Group Content */}
                {isExpanded && (
                  <div className="border-t border-border/50">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/20">
                          <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground w-8">#</th>
                          <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Transaction Type</th>
                          <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Scope</th>
                          <th className="py-2 px-4 text-center text-xs font-medium text-muted-foreground">
                            <span className="text-green-400">Dr</span> GL Code
                          </th>
                          <th className="py-2 px-4 text-center text-xs font-medium text-muted-foreground">
                            <span className="text-red-400">Cr</span> GL Code
                          </th>
                          <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">IFRS Ref</th>
                          <th className="py-2 px-4 text-center text-xs font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.mappings.map((m: any, idx: number) => (
                          <tr key={m.rule_id} className="border-t border-border/30 hover:bg-muted/10 group">
                            <td className="py-2 px-4 text-xs text-muted-foreground">{idx + 1}</td>
                            <td className="py-2 px-4">
                              <div className="font-medium text-sm">{m.rule_name || m.jv_description}</div>
                              {m.rule_description && (
                                <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[300px]">{m.rule_description}</div>
                              )}
                            </td>
                            <td className="py-2 px-4">
                              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{m.screen_id || "GLOBAL"}</span>
                            </td>
                            <td className="py-2 px-4 text-center">
                              <span className="font-mono text-xs font-semibold bg-green-500/10 text-green-400 px-2 py-0.5 rounded">
                                {m.jv_debit_account || "—"}
                              </span>
                            </td>
                            <td className="py-2 px-4 text-center">
                              <span className="font-mono text-xs font-semibold bg-red-500/10 text-red-400 px-2 py-0.5 rounded">
                                {m.jv_credit_account || "—"}
                              </span>
                            </td>
                            <td className="py-2 px-4 text-xs text-muted-foreground">{m.ifrs_reference || "—"}</td>
                            <td className="py-2 px-4">
                              <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => setSimulateTxType(m.rule_name?.replace(/\s+/g, "_").toUpperCase())}
                                  className="p-1 hover:bg-muted rounded" title="Simulate JV"
                                >
                                  <Play className="w-3.5 h-3.5 text-blue-400" />
                                </button>
                                <button onClick={() => setEditMapping(m)} className="p-1 hover:bg-muted rounded" title="Edit">
                                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("Deactivate this GL mapping?")) deleteMut.mutate({ ruleId: m.rule_id });
                                  }}
                                  className="p-1 hover:bg-muted rounded" title="Deactivate"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Mapping Overlay */}
      {editMapping !== null && (
        <EditMappingForm
          mapping={editMapping === "new" ? null : editMapping}
          coaAccounts={coaAccounts as any[]}
          onSave={(data) => upsertMut.mutate(data)}
          onCancel={() => setEditMapping(null)}
          isSaving={upsertMut.isPending}
        />
      )}

      {/* Simulate JV Overlay */}
      {simulateTxType && (
        <SimulateJVPanel transactionType={simulateTxType} onClose={() => setSimulateTxType(null)} />
      )}
    </DashboardLayout>
  );
}
