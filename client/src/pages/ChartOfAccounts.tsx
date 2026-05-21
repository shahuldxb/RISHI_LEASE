import { useState, useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Plus, Pencil, Search, TreePine, Table2,
  ToggleLeft, ToggleRight, Link2, Save, X, RefreshCw, Filter, Download,
  Building2, Landmark, Wallet, TrendingUp, CircleDollarSign, Info
} from "lucide-react";

const SCREEN_ID = "VFCOACFG0001P001";

// ── Types ──────────────────────────────────────────────────────────────────────
interface COAAccount {
  account_code: string;
  account_name: string;
  account_type: string;
  sub_type: string | null;
  normal_balance: string;
  currency: string;
  parent_code: string | null;
  description: string | null;
  ifrs16_relevant: boolean;
  is_active: boolean;
  child_count?: number;
  usage_count?: number;
}

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense"] as const;
const ACCOUNT_TYPE_ICONS: Record<string, React.ElementType> = {
  Asset: Building2,
  Liability: Landmark,
  Equity: Wallet,
  Revenue: TrendingUp,
  Expense: CircleDollarSign,
};
const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  Asset: "text-blue-400 bg-blue-500/10",
  Liability: "text-rose-400 bg-rose-500/10",
  Equity: "text-emerald-400 bg-emerald-500/10",
  Revenue: "text-amber-400 bg-amber-500/10",
  Expense: "text-purple-400 bg-purple-500/10",
};

// ── Tree Node Component ────────────────────────────────────────────────────────
function TreeNode({
  account,
  children: childAccounts,
  allAccounts,
  depth,
  onEdit,
  onToggle,
  onViewUsage,
}: {
  account: COAAccount;
  children: COAAccount[];
  allAccounts: COAAccount[];
  depth: number;
  onEdit: (a: COAAccount) => void;
  onToggle: (code: string, active: boolean) => void;
  onViewUsage: (code: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = childAccounts.length > 0;
  const Icon = ACCOUNT_TYPE_ICONS[account.account_type] || Building2;
  const colorClass = ACCOUNT_TYPE_COLORS[account.account_type] || "text-gray-400 bg-gray-500/10";

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-md transition-colors group ${
          !account.is_active ? "opacity-50" : ""
        }`}
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        {/* Expand/Collapse */}
        <button
          className="w-5 h-5 flex items-center justify-center shrink-0"
          onClick={() => hasChildren && setExpanded(!expanded)}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
          ) : <span className="w-4" />}
        </button>

        {/* Account Type Icon */}
        <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </span>

        {/* Account Code */}
        <span className="font-mono text-sm font-semibold text-primary w-16 shrink-0">{account.account_code}</span>

        {/* Account Name */}
        <span className="text-sm flex-1 truncate">{account.account_name}</span>

        {/* Normal Balance Badge */}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
          account.normal_balance === "Dr" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
        }`}>
          {account.normal_balance}
        </span>

        {/* Sub Type */}
        {account.sub_type && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 max-w-[120px] truncate">
            {account.sub_type}
          </span>
        )}

        {/* IFRS 16 Badge */}
        {account.ifrs16_relevant && (
          <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded shrink-0">
            IFRS 16
          </span>
        )}

        {/* Usage Count */}
        {(account.usage_count ?? 0) > 0 && (
          <button
            onClick={() => onViewUsage(account.account_code)}
            className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0 hover:bg-amber-500/20 transition-colors"
          >
            {account.usage_count} rules
          </button>
        )}

        {/* Actions (visible on hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onEdit(account)} className="p-1 hover:bg-muted rounded" title="Edit">
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => onToggle(account.account_code, !account.is_active)}
            className="p-1 hover:bg-muted rounded"
            title={account.is_active ? "Deactivate" : "Activate"}
          >
            {account.is_active
              ? <ToggleRight className="w-3.5 h-3.5 text-green-400" />
              : <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground" />
            }
          </button>
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && childAccounts.map(child => (
        <TreeNode
          key={child.account_code}
          account={child}
          children={allAccounts.filter(a => a.parent_code === child.account_code)}
          allAccounts={allAccounts}
          depth={depth + 1}
          onEdit={onEdit}
          onToggle={onToggle}
          onViewUsage={onViewUsage}
        />
      ))}
    </div>
  );
}

// ── Account Edit Form (Full Screen) ────────────────────────────────────────────
function AccountEditForm({
  account,
  allAccounts,
  onSave,
  onCancel,
  isSaving,
}: {
  account: COAAccount | null;
  allAccounts: COAAccount[];
  onSave: (data: any) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    accountCode: account?.account_code ?? "",
    accountName: account?.account_name ?? "",
    accountType: account?.account_type ?? "Asset",
    subType: account?.sub_type ?? "",
    normalBalance: account?.normal_balance ?? "Dr",
    currency: account?.currency ?? "QAR",
    parentCode: account?.parent_code ?? "",
    description: account?.description ?? "",
    ifrs16Relevant: account?.ifrs16_relevant ?? true,
    isActive: account?.is_active ?? true,
  });

  const isNew = !account;
  const parentOptions = allAccounts.filter(a => a.account_code !== form.accountCode && a.sub_type === "Header");

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{isNew ? "Add New GL Account" : `Edit Account ${account.account_code}`}</h2>
            <p className="text-xs text-muted-foreground">Chart of Accounts — GL Configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(form)} disabled={isSaving}>
            <Save className="w-4 h-4 mr-1" /> {isSaving ? "Saving..." : "Save Account"}
          </Button>
        </div>
      </div>

      {/* Form Body */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 gap-6">
          {/* Account Code */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Code *</label>
            <Input
              value={form.accountCode}
              onChange={e => setForm(f => ({ ...f, accountCode: e.target.value }))}
              placeholder="e.g. 10100"
              className="font-mono"
              disabled={!isNew}
            />
          </div>

          {/* Account Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Name *</label>
            <Input
              value={form.accountName}
              onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))}
              placeholder="e.g. Right-of-Use Assets"
            />
          </div>

          {/* Account Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Type *</label>
            <select
              value={form.accountType}
              onChange={e => setForm(f => ({ ...f, accountType: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Sub Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sub Type</label>
            <Input
              value={form.subType}
              onChange={e => setForm(f => ({ ...f, subType: e.target.value }))}
              placeholder="e.g. Non-Current Asset, Contra Asset, Header"
            />
          </div>

          {/* Normal Balance */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Normal Balance *</label>
            <div className="flex gap-2">
              {(["Dr", "Cr"] as const).map(nb => (
                <button
                  key={nb}
                  onClick={() => setForm(f => ({ ...f, normalBalance: nb }))}
                  className={`flex-1 h-9 rounded-md border text-sm font-semibold transition-colors ${
                    form.normalBalance === nb
                      ? nb === "Dr" ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-red-500/20 text-red-400 border-red-500/50"
                      : "border-input text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {nb === "Dr" ? "Debit (Dr)" : "Credit (Cr)"}
                </button>
              ))}
            </div>
          </div>

          {/* Currency */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Currency</label>
            <Input
              value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              placeholder="QAR"
            />
          </div>

          {/* Parent Code */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Parent Account</label>
            <select
              value={form.parentCode}
              onChange={e => setForm(f => ({ ...f, parentCode: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— None (Top Level) —</option>
              {parentOptions.map(p => (
                <option key={p.account_code} value={p.account_code}>
                  {p.account_code} — {p.account_name}
                </option>
              ))}
            </select>
          </div>

          {/* Flags */}
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Flags</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.ifrs16Relevant}
                  onChange={e => setForm(f => ({ ...f, ifrs16Relevant: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm">IFRS 16 Relevant</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm">Active</span>
              </label>
            </div>
          </div>

          {/* Description (full width) */}
          <div className="col-span-2 flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Account description and IFRS reference..."
              className="min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Usage Panel (Full Screen) ──────────────────────────────────────────────────
function UsagePanel({ accountCode, onClose }: { accountCode: string; onClose: () => void }) {
  const { data: usage, isLoading } = trpc.glConfiguration.getCOAUsage.useQuery({ accountCode });

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold">GL Code Usage — {accountCode}</h2>
          <p className="text-xs text-muted-foreground">Business rules and mappings referencing this account</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4 mr-1" /> Close</Button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading usage data...</div>
        ) : !usage?.length ? (
          <div className="text-center py-12 text-muted-foreground">No rules reference this GL code</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Rule ID</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Screen</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Rule Name</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Side</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Dr Account</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Cr Account</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">IFRS Ref</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u: any) => (
                <tr key={u.rule_id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 px-3 font-mono text-xs">{u.rule_id}</td>
                  <td className="py-2 px-3">{u.screen_id}</td>
                  <td className="py-2 px-3">{u.rule_name}</td>
                  <td className="py-2 px-3">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      u.usage_side === "DEBIT" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    }`}>{u.usage_side}</span>
                  </td>
                  <td className="py-2 px-3 font-mono text-xs">{u.jv_debit_account}</td>
                  <td className="py-2 px-3 font-mono text-xs">{u.jv_credit_account}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{u.ifrs_reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ChartOfAccounts() {
  const [viewMode, setViewMode] = useState<"tree" | "table">("tree");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [editAccount, setEditAccount] = useState<COAAccount | null | "new">(null);
  const [usageCode, setUsageCode] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Ensure COA table exists on first load
  const ensureMut = trpc.glConfiguration.ensureCOATable.useMutation({
    onSuccess: () => {
      utils.glConfiguration.getCOAHierarchy.invalidate();
      utils.glConfiguration.getCOASummary.invalidate();
    },
  });
  useEffect(() => { ensureMut.mutate(); }, []); // eslint-disable-line

  const { data: accounts = [], isLoading } = trpc.glConfiguration.getCOAHierarchy.useQuery();
  const { data: summary } = trpc.glConfiguration.getCOASummary.useQuery();

  const upsertMut = trpc.glConfiguration.upsertCOAAccount.useMutation({
    onSuccess: (r) => {
      toast.success(`Account ${r.accountCode} ${r.action === "INSERT" ? "created" : "updated"}`);
      utils.glConfiguration.getCOAHierarchy.invalidate();
      utils.glConfiguration.getCOASummary.invalidate();
      setEditAccount(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMut = trpc.glConfiguration.toggleCOAAccount.useMutation({
    onSuccess: () => {
      toast.success("Account status updated");
      utils.glConfiguration.getCOAHierarchy.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Filter accounts
  const filtered = useMemo(() => {
    let list = accounts as COAAccount[];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(a => a.account_code.toLowerCase().includes(s) || a.account_name.toLowerCase().includes(s));
    }
    if (filterType) {
      list = list.filter(a => a.account_type === filterType);
    }
    return list;
  }, [accounts, search, filterType]);

  // Tree: root accounts (no parent)
  const rootAccounts = useMemo(() => filtered.filter(a => !a.parent_code || !filtered.some(p => p.account_code === a.parent_code)), [filtered]);

  // Summary stats
  const stats = summary as any;

  return (
    <DashboardLayout>
      <ScreenHeader title="Chart of Accounts" screenId={SCREEN_ID} subtitle="Enterprise GL Account Master — IFRS 16 Configuration" />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {[
          { label: "Total Accounts", value: stats?.total_accounts ?? 0, color: "text-foreground" },
          { label: "Active", value: stats?.active_accounts ?? 0, color: "text-green-400" },
          { label: "IFRS 16", value: stats?.ifrs16_accounts ?? 0, color: "text-cyan-400" },
          { label: "Assets", value: stats?.asset_count ?? 0, color: "text-blue-400" },
          { label: "Liabilities", value: stats?.liability_count ?? 0, color: "text-rose-400" },
          { label: "Revenue", value: stats?.revenue_count ?? 0, color: "text-amber-400" },
          { label: "Expenses", value: stats?.expense_count ?? 0, color: "text-purple-400" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</div>
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* View Toggle */}
        <div className="flex items-center border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode("tree")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "tree" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            <TreePine className="w-3.5 h-3.5" /> Tree
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            <Table2 className="w-3.5 h-3.5" /> Table
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by code or name..."
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Filter by Type */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">All Types</option>
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="flex-1" />

        {/* Actions */}
        <Button variant="outline" size="sm" onClick={() => { utils.glConfiguration.getCOAHierarchy.invalidate(); }}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
        <Button size="sm" onClick={() => setEditAccount("new")}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Account
        </Button>
      </div>

      {/* Content */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading Chart of Accounts...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Info className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-3">No accounts found. Initialize the Chart of Accounts to get started.</p>
            <Button size="sm" onClick={() => ensureMut.mutate()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Initialize COA
            </Button>
          </div>
        ) : viewMode === "tree" ? (
          /* ── Tree View ── */
          <div className="py-2">
            {rootAccounts.map(account => (
              <TreeNode
                key={account.account_code}
                account={account}
                children={filtered.filter(a => a.parent_code === account.account_code)}
                allAccounts={filtered}
                depth={0}
                onEdit={setEditAccount}
                onToggle={(code, active) => toggleMut.mutate({ accountCode: code, isActive: active })}
                onViewUsage={setUsageCode}
              />
            ))}
          </div>
        ) : (
          /* ── Table View ── */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">Code</th>
                  <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">Account Name</th>
                  <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                  <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">Sub Type</th>
                  <th className="py-2.5 px-3 text-center text-xs font-medium text-muted-foreground">Balance</th>
                  <th className="py-2.5 px-3 text-center text-xs font-medium text-muted-foreground">Currency</th>
                  <th className="py-2.5 px-3 text-center text-xs font-medium text-muted-foreground">Parent</th>
                  <th className="py-2.5 px-3 text-center text-xs font-medium text-muted-foreground">IFRS 16</th>
                  <th className="py-2.5 px-3 text-center text-xs font-medium text-muted-foreground">Rules</th>
                  <th className="py-2.5 px-3 text-center text-xs font-medium text-muted-foreground">Status</th>
                  <th className="py-2.5 px-3 text-center text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a: COAAccount) => {
                  const Icon = ACCOUNT_TYPE_ICONS[a.account_type] || Building2;
                  const color = ACCOUNT_TYPE_COLORS[a.account_type] || "";
                  return (
                    <tr key={a.account_code} className={`border-b border-border/50 hover:bg-muted/30 ${!a.is_active ? "opacity-50" : ""}`}>
                      <td className="py-2 px-3 font-mono text-xs font-semibold">{a.account_code}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${color}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </span>
                          <span className="truncate">{a.account_name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs">{a.account_type}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{a.sub_type || "—"}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          a.normal_balance === "Dr" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        }`}>{a.normal_balance}</span>
                      </td>
                      <td className="py-2 px-3 text-center text-xs">{a.currency}</td>
                      <td className="py-2 px-3 text-center font-mono text-xs text-muted-foreground">{a.parent_code || "—"}</td>
                      <td className="py-2 px-3 text-center">
                        {a.ifrs16_relevant && <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">Yes</span>}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {(a.usage_count ?? 0) > 0 && (
                          <button onClick={() => setUsageCode(a.account_code)} className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded hover:bg-amber-500/20">
                            {a.usage_count}
                          </button>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.is_active ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                          {a.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setEditAccount(a)} className="p-1 hover:bg-muted rounded"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => toggleMut.mutate({ accountCode: a.account_code, isActive: !a.is_active })} className="p-1 hover:bg-muted rounded">
                            {a.is_active ? <ToggleRight className="w-3.5 h-3.5 text-green-400" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Form Overlay */}
      {editAccount !== null && (
        <AccountEditForm
          account={editAccount === "new" ? null : editAccount}
          allAccounts={accounts as COAAccount[]}
          onSave={(data) => upsertMut.mutate(data)}
          onCancel={() => setEditAccount(null)}
          isSaving={upsertMut.isPending}
        />
      )}

      {/* Usage Panel Overlay */}
      {usageCode && (
        <UsagePanel accountCode={usageCode} onClose={() => setUsageCode(null)} />
      )}
    </DashboardLayout>
  );
}
