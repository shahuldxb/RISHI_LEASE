import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles, Search, Filter, ToggleLeft, ToggleRight, Pencil, Trash2,
  RefreshCw, Loader2, ChevronDown, ChevronRight, BookOpen, Calculator,
  Shield, FileText, CheckCircle2, XCircle, Layers, Save, X,
  Play, Beaker, BarChart3, Clock, AlertTriangle, Zap, Link2
} from "lucide-react";
import { toast } from "sonner";

const SCREEN_ID = "VFLBRULESMGR001";

// ── Category Config ────────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { icon: any; color: string; label: string; tabKey: string }> = {
  STANDARD_REF:   { icon: BookOpen,     color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", label: "Standard Reference", tabKey: "standards" },
  CALCULATION:    { icon: Calculator,   color: "text-blue-400 bg-blue-500/10 border-blue-500/30",         label: "Calculation",         tabKey: "calculations" },
  VALIDATION:     { icon: Shield,       color: "text-violet-400 bg-violet-500/10 border-violet-500/30",   label: "Validation",          tabKey: "validations" },
  JV_PATTERN:     { icon: FileText,     color: "text-orange-400 bg-orange-500/10 border-orange-500/30",   label: "JV Pattern",          tabKey: "jv_patterns" },
  RECOGNITION:    { icon: CheckCircle2, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",         label: "Recognition",         tabKey: "calculations" },
  MEASUREMENT:    { icon: Layers,       color: "text-pink-400 bg-pink-500/10 border-pink-500/30",         label: "Measurement",         tabKey: "calculations" },
  CLASSIFICATION: { icon: Filter,       color: "text-amber-400 bg-amber-500/10 border-amber-500/30",      label: "Classification",      tabKey: "validations" },
  GL_CODE:        { icon: Link2,        color: "text-teal-400 bg-teal-500/10 border-teal-500/30",         label: "GL Code",             tabKey: "gl_codes" },
};

function getCategoryConfig(cat: string) {
  return CATEGORY_CONFIG[cat] || { icon: BookOpen, color: "text-muted-foreground bg-muted/10 border-border", label: cat, tabKey: "all" };
}

// ── Tab Definitions ────────────────────────────────────────────────────────────
const TABS = [
  { key: "all",          label: "All Rules",          icon: Layers },
  { key: "calculations", label: "Calculations",       icon: Calculator },
  { key: "validations",  label: "Validations",        icon: Shield },
  { key: "jv_patterns",  label: "JV Patterns",        icon: FileText },
  { key: "standards",    label: "Standard References", icon: BookOpen },
  { key: "gl_codes",     label: "GL Codes",           icon: Link2 },
  { key: "dashboard",    label: "Execution Dashboard", icon: BarChart3 },
  { key: "testing",      label: "Rule Testing",       icon: Beaker },
];

// ── Execution Dashboard ────────────────────────────────────────────────────────
function ExecutionDashboard() {
  const { data: logs = [], isLoading } = trpc.businessRules.getExecutionLog.useQuery(
    { screenId: '', top: 100 },
    { staleTime: 10_000 }
  );

  const stats = useMemo(() => {
    const arr = logs as any[];
    const total = arr.length;
    const success = arr.filter((l: any) => l.status === "SUCCESS").length;
    const failed = arr.filter((l: any) => l.status === "FAILED").length;
    const avgDuration = total > 0
      ? Math.round(arr.reduce((sum: number, l: any) => sum + (l.duration_ms || 0), 0) / total)
      : 0;
    return { total, success, failed, avgDuration };
  }, [logs]);

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Executions</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Successful</div>
          <div className="text-2xl font-bold text-emerald-400">{stats.success}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Failed</div>
          <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Duration</div>
          <div className="text-2xl font-bold text-blue-400">{stats.avgDuration}ms</div>
        </div>
      </div>

      {/* Execution Log Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/20">
          <span className="text-sm font-semibold">Recent Rule Executions</span>
        </div>
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading execution log...</div>
        ) : (logs as any[]).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No rule executions recorded yet. Execute rules from any screen to see logs here.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/10 text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Timestamp</th>
                <th className="text-left px-4 py-2 font-medium">Screen</th>
                <th className="text-left px-4 py-2 font-medium">Rule</th>
                <th className="text-center px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Duration</th>
                <th className="text-left px-4 py-2 font-medium">Input</th>
                <th className="text-left px-4 py-2 font-medium">Output</th>
              </tr>
            </thead>
            <tbody>
              {(logs as any[]).map((log: any, idx: number) => (
                <tr key={idx} className="border-t border-border/30 hover:bg-muted/10">
                  <td className="px-4 py-2 font-mono text-muted-foreground">
                    {log.executed_at ? new Date(log.executed_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="text-[10px] font-mono">{log.screen_id}</Badge>
                  </td>
                  <td className="px-4 py-2 font-medium truncate max-w-[200px]">{log.rule_name || `Rule #${log.rule_id}`}</td>
                  <td className="px-4 py-2 text-center">
                    {log.status === "SUCCESS" ? (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">SUCCESS</span>
                    ) : (
                      <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">FAILED</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{log.duration_ms ?? "—"}ms</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground truncate max-w-[150px]">{log.input_json || "—"}</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground truncate max-w-[150px]">{log.output_json || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Rule Testing Sandbox ───────────────────────────────────────────────────────
function RuleTestingSandbox() {
  const [screenId, setScreenId] = useState("INCEPTION");
  const [testInputs, setTestInputs] = useState(JSON.stringify({
    lease_liability: 500000,
    rou_asset: 520000,
    idc: 15000,
    deposit: 5000,
    monthly_rent: 12000,
    ibr: 0.065,
    lease_term_months: 60,
    cpi_rate: 0.03,
  }, null, 2));
  const [testResult, setTestResult] = useState<any>(null);

  const executeMut = trpc.businessRules.executeRules.useMutation({
    onSuccess: (r) => {
      setTestResult(r);
      toast.success("Rules executed successfully");
    },
    onError: (e) => toast.error(`Execution failed: ${e.message}`),
  });

  const runTest = () => {
    try {
      const inputs = JSON.parse(testInputs);
      executeMut.mutate({ screenId, context: inputs });
    } catch {
      toast.error("Invalid JSON input");
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Beaker className="w-4 h-4 text-violet-400" /> Rule Testing Sandbox
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Enter test input values and execute rules for a specific screen to see calculated outputs, validation results, and JV patterns.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* Left: Inputs */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target Screen</label>
              <select
                value={screenId}
                onChange={e => setScreenId(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="INCEPTION">Initial Recognition</option>
                <option value="AMORTISATION">Amortisation Schedule</option>
                <option value="CPI_ESCALATION">CPI Escalation</option>
                <option value="REMEASUREMENT">Remeasurement</option>
                <option value="PERIOD_CLOSE">Period-End Close</option>
                <option value="TERMINATION">Termination</option>
                <option value="CLASSIFICATION">Lease Classification</option>
                <option value="DISCLOSURE">IFRS 16 Disclosure</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Test Input (JSON)</label>
              <Textarea
                value={testInputs}
                onChange={e => setTestInputs(e.target.value)}
                className="mt-1 font-mono text-xs min-h-[280px]"
                placeholder='{"lease_liability": 500000, ...}'
              />
            </div>

            <Button onClick={runTest} disabled={executeMut.isPending} className="w-full">
              {executeMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
              Execute Rules
            </Button>
          </div>

          {/* Right: Results */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Execution Results</label>
            {!testResult ? (
              <div className="bg-muted/20 border border-border rounded-lg p-8 text-center min-h-[380px] flex flex-col items-center justify-center">
                <Beaker className="w-10 h-10 text-muted-foreground mb-3 opacity-50" />
                <p className="text-sm text-muted-foreground">Enter test inputs and click Execute to see results</p>
              </div>
            ) : (
              <div className="bg-muted/10 border border-border rounded-lg overflow-hidden min-h-[380px]">
                {/* Calculations */}
                {testResult.calculations?.length > 0 && (
                  <div className="border-b border-border">
                    <div className="px-3 py-2 bg-blue-500/5 border-b border-border">
                      <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                        <Calculator className="w-3 h-3" /> Calculations ({testResult.calculations.length})
                      </span>
                    </div>
                    <div className="p-3 space-y-1">
                      {testResult.calculations.map((c: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{c.rule_name}</span>
                          <span className="font-mono font-semibold">{typeof c.result === "number" ? c.result.toLocaleString() : JSON.stringify(c.result)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Validations */}
                {testResult.validations?.length > 0 && (
                  <div className="border-b border-border">
                    <div className="px-3 py-2 bg-violet-500/5 border-b border-border">
                      <span className="text-xs font-semibold text-violet-400 flex items-center gap-1.5">
                        <Shield className="w-3 h-3" /> Validations ({testResult.validations.length})
                      </span>
                    </div>
                    <div className="p-3 space-y-1">
                      {testResult.validations.map((v: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {v.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          )}
                          <span className={v.passed ? "text-emerald-400" : "text-red-400"}>{v.rule_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* JV Patterns */}
                {testResult.jvPatterns?.length > 0 && (
                  <div>
                    <div className="px-3 py-2 bg-orange-500/5 border-b border-border">
                      <span className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                        <FileText className="w-3 h-3" /> JV Patterns ({testResult.jvPatterns.length})
                      </span>
                    </div>
                    <div className="p-3 space-y-2">
                      {testResult.jvPatterns.map((j: any, i: number) => (
                        <div key={i} className="text-xs">
                          <div className="font-medium mb-1">{j.rule_name}</div>
                          <pre className="font-mono text-[10px] text-muted-foreground bg-muted/30 p-2 rounded whitespace-pre-wrap">{j.jv_pattern}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty result */}
                {!testResult.calculations?.length && !testResult.validations?.length && !testResult.jvPatterns?.length && (
                  <div className="p-8 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No rules found for screen "{screenId}". Generate rules first using Alt+4 on that screen.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BusinessRulesManager() {
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState<string>("ALL");
  const [expandedScreens, setExpandedScreens] = useState<Set<string>>(new Set());
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ rule_name: "", formula: "", jv_pattern: "", ifrs_reference: "", rule_definition_json: "" });

  const { data: allRules, isLoading, refetch } = trpc.businessRules.getAll.useQuery(undefined, { staleTime: 30_000 });
  const { data: summary } = trpc.businessRules.getSummary.useQuery(undefined, { staleTime: 30_000 });

  const toggleMutation = trpc.businessRules.toggle.useMutation({
    onSuccess: () => { refetch(); toast.success("Rule status updated"); },
    onError: (e) => toast.error(e.message),
  });

  const upsertMutation = trpc.businessRules.upsert.useMutation({
    onSuccess: () => { refetch(); setEditingRule(null); toast.success("Rule updated"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.businessRules.deleteByScreen.useMutation({
    onSuccess: () => { refetch(); toast.success("Screen rules deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const regenerateMutation = trpc.genai.generateBusinessRules.useMutation({
    onSuccess: () => { refetch(); toast.success("Business rules regenerated from AI"); },
    onError: (e) => toast.error(`Regeneration failed: ${e.message}`),
  });

  // Filter rules by active tab + search
  const filteredRules = useMemo(() => {
    if (!allRules) return [];
    return (allRules as any[]).filter((r: any) => {
      // Tab filter
      if (activeTab !== "all" && activeTab !== "dashboard" && activeTab !== "testing") {
        const catCfg = getCategoryConfig(r.rule_category);
        if (catCfg.tabKey !== activeTab) return false;
      }
      // Search filter
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        if (!r.rule_name?.toLowerCase().includes(s) &&
            !r.screen_id?.toLowerCase().includes(s) &&
            !r.ifrs_reference?.toLowerCase().includes(s)) return false;
      }
      // Active filter
      if (filterActive === "ACTIVE" && !r.is_active) return false;
      if (filterActive === "INACTIVE" && r.is_active) return false;
      return true;
    });
  }, [allRules, activeTab, searchTerm, filterActive]);

  // Group by screen
  const groupedRules = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredRules.forEach((r: any) => {
      const sid = r.screen_id || "UNKNOWN";
      if (!groups[sid]) groups[sid] = [];
      groups[sid].push(r);
    });
    return groups;
  }, [filteredRules]);

  const screenIds = Object.keys(groupedRules).sort();

  const toggleScreen = (sid: string) => {
    setExpandedScreens(prev => {
      const next = new Set(prev);
      next.has(sid) ? next.delete(sid) : next.add(sid);
      return next;
    });
  };

  const startEdit = (rule: any) => {
    setEditingRule(rule);
    setEditForm({
      rule_name: rule.rule_name || "",
      formula: rule.formula || "",
      jv_pattern: rule.jv_pattern || "",
      ifrs_reference: rule.ifrs_reference || "",
      rule_definition_json: rule.rule_definition_json ? (typeof rule.rule_definition_json === "string" ? rule.rule_definition_json : JSON.stringify(rule.rule_definition_json, null, 2)) : "",
    });
  };

  const saveEdit = () => {
    if (!editingRule) return;
    upsertMutation.mutate({
      rule_id: editingRule.rule_id,
      screen_id: editingRule.screen_id,
      category_code: editingRule.rule_category || editingRule.category_code || 'CALCULATION',
      rule_name: editForm.rule_name,
      formula: editForm.formula || undefined,
      ifrs_reference: editForm.ifrs_reference || undefined,
      priority: editingRule.priority,
      is_active: editingRule.is_active,
    });
  };

  const totalRules = allRules?.length || 0;
  const activeRules = (allRules as any[] || []).filter((r: any) => r.is_active).length;

  return (
    <DashboardLayout>
      <ScreenHeader
        screenId={SCREEN_ID}
        title="Business Rules Engine"
        subtitle="Centralized IFRS 16 rules management — calculations, validations, JV patterns, GL codes"
        icon={<Sparkles className="w-4 h-4 text-yellow-400" />}
        screenType="business_rules_manager"
        onAIData={() => {}}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Rules</div>
          <div className="text-xl font-bold text-yellow-400">{totalRules}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Active</div>
          <div className="text-xl font-bold text-emerald-400">{activeRules}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Inactive</div>
          <div className="text-xl font-bold text-red-400">{totalRules - activeRules}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Screens</div>
          <div className="text-xl font-bold text-blue-400">{new Set((allRules as any[] || []).map((r: any) => r.screen_id)).size}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Categories</div>
          <div className="text-xl font-bold text-purple-400">{new Set((allRules as any[] || []).map((r: any) => r.rule_category)).size}</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-4 bg-card border border-border rounded-lg p-1 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          const count = tab.key === "all" ? totalRules
            : tab.key === "dashboard" || tab.key === "testing" ? null
            : (allRules as any[] || []).filter((r: any) => getCategoryConfig(r.rule_category).tabKey === tab.key).length;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {count !== null && <span className={`ml-1 text-[10px] font-mono ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "dashboard" ? (
        <ExecutionDashboard />
      ) : activeTab === "testing" ? (
        <RuleTestingSandbox />
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search rules by name, screen, or IFRS reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              className="h-8 text-xs bg-background border border-border rounded-md px-2 text-foreground"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => setExpandedScreens(new Set(screenIds))}>
              <ChevronDown className="w-3 h-3" /> Expand All
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => setExpandedScreens(new Set())}>
              <ChevronRight className="w-3 h-3" /> Collapse All
            </Button>
          </div>

          {/* Rules grouped by screen */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading business rules...</span>
            </div>
          ) : screenIds.length === 0 ? (
            <div className="text-center py-20 bg-card border border-border rounded-lg">
              <Sparkles className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-1">No Rules Found</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {searchTerm || filterActive !== "ALL"
                  ? "No rules match your current filters. Try adjusting your search criteria."
                  : "Navigate to any screen and press Alt+4 to generate business rules from AI."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {screenIds.map(sid => {
                const rules = groupedRules[sid];
                const isExpanded = expandedScreens.has(sid);
                const activeCount = rules.filter((r: any) => r.is_active).length;

                return (
                  <div key={sid} className="bg-card border border-border rounded-lg overflow-hidden">
                    {/* Screen header */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleScreen(sid)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 border-yellow-500/30 text-yellow-400 bg-yellow-500/5">
                          {sid}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                          {activeCount} active
                        </Badge>
                        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                          {rules.length} rules
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Regenerate all rules for ${sid} from AI?`)) {
                              regenerateMutation.mutate({ screenId: sid, screenTitle: sid });
                            }
                          }}
                          disabled={regenerateMutation.isPending}
                          title="Regenerate from AI"
                        >
                          {regenerateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete all ${rules.length} rules for ${sid}?`)) {
                              deleteMutation.mutate({ screenId: sid });
                            }
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded rules table */}
                    {isExpanded && (
                      <div className="border-t border-border">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/20 text-muted-foreground">
                              <th className="text-left px-4 py-2 font-medium w-8">#</th>
                              <th className="text-left px-4 py-2 font-medium">Category</th>
                              <th className="text-left px-4 py-2 font-medium">Rule Name</th>
                              <th className="text-left px-4 py-2 font-medium">IFRS Ref</th>
                              <th className="text-left px-4 py-2 font-medium">Formula / Pattern</th>
                              <th className="text-center px-4 py-2 font-medium w-16">Active</th>
                              <th className="text-left px-4 py-2 font-medium w-16">Ver</th>
                              <th className="text-center px-4 py-2 font-medium w-20">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rules.map((rule: any, idx: number) => {
                              const catCfg = getCategoryConfig(rule.rule_category);
                              const CatIcon = catCfg.icon;
                              return (
                                <tr key={rule.rule_id} className="border-t border-border/50 hover:bg-muted/10 transition-colors">
                                  <td className="px-4 py-2 text-muted-foreground font-mono">{idx + 1}</td>
                                  <td className="px-4 py-2">
                                    <Badge variant="outline" className={`text-[10px] gap-1 ${catCfg.color}`}>
                                      <CatIcon className="w-2.5 h-2.5" />
                                      {catCfg.label}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2 font-medium max-w-[250px] truncate" title={rule.rule_name}>
                                    {rule.rule_name}
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground font-mono">{rule.ifrs_reference || "—"}</td>
                                  <td className="px-4 py-2 text-muted-foreground font-mono max-w-[200px] truncate" title={rule.formula || rule.jv_pattern}>
                                    {rule.formula || rule.jv_pattern || "—"}
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <button
                                      onClick={() => toggleMutation.mutate({ rule_id: rule.rule_id, is_active: !rule.is_active })}
                                      title={rule.is_active ? "Deactivate" : "Activate"}
                                    >
                                      {rule.is_active ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                                    </button>
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground font-mono">v{rule.version ?? 1}</td>
                                  <td className="px-4 py-2 text-center">
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEdit(rule)}>
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Edit overlay — full screen */}
      {editingRule && (
        <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-yellow-500/20 bg-gradient-to-r from-yellow-950/40 to-background shrink-0">
            <div className="flex items-center gap-3">
              <Pencil className="w-5 h-5 text-yellow-400" />
              <div>
                <h2 className="text-lg font-semibold">Edit Business Rule</h2>
                <p className="text-xs text-muted-foreground">{editingRule.screen_id} — Rule #{editingRule.rule_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={saveEdit}
                disabled={upsertMutation.isPending}
                className="gap-1.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-semibold text-xs"
              >
                {upsertMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Changes
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingRule(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Rule Name</label>
                  <Input value={editForm.rule_name} onChange={(e) => setEditForm(f => ({ ...f, rule_name: e.target.value }))} className="text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">IFRS Reference</label>
                  <Input value={editForm.ifrs_reference} onChange={(e) => setEditForm(f => ({ ...f, ifrs_reference: e.target.value }))} className="text-sm font-mono" placeholder="e.g., IFRS 16.42(b)" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Formula</label>
                <Input value={editForm.formula} onChange={(e) => setEditForm(f => ({ ...f, formula: e.target.value }))} className="text-sm font-mono" placeholder="e.g., new_rent = current_rent * (1 + cpi_rate)" />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">JV Pattern</label>
                <Textarea value={editForm.jv_pattern} onChange={(e) => setEditForm(f => ({ ...f, jv_pattern: e.target.value }))} className="text-sm font-mono min-h-[100px]" placeholder={"Dr  Right-of-Use Asset  XXX\nCr  Lease Liability      XXX"} />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Rule Definition (JSON)</label>
                <Textarea value={editForm.rule_definition_json} onChange={(e) => setEditForm(f => ({ ...f, rule_definition_json: e.target.value }))} className="text-sm font-mono min-h-[200px]" placeholder='{"condition": "...", "action": "..."}' />
              </div>

              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <Badge variant="outline" className={`mt-1 ${getCategoryConfig(editingRule.rule_category).color}`}>
                    {getCategoryConfig(editingRule.rule_category).label}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="text-sm font-mono mt-1">{editingRule.rule_type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created by AI</p>
                  <p className="text-sm mt-1">{editingRule.created_by_ai ? "Yes" : "No"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
