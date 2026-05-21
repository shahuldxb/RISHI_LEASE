import React, { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, TrendingUp, Play, Calculator, CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GenAIFillButton } from "@/components/GenAIFillButton";

// Types
interface EligibleLease {
  contract_id: number;
  contract_ref: string;
  lessor_name: string;
  asset_description: string;
  asset_type: string;
  monthly_payment: number;
  currency: string;
  escalation_rate: number;
  commencement_date: string;
  expiry_date: string;
  ibr: number;
  lease_liability_commence: number;
  rou_asset_value: number;
  term_months: number;
  status: string;
  ifrs16_classification: string;
}

interface CalculatedEscalation {
  contract_id: number;
  contract_ref: string;
  lessor_name: string;
  asset_description: string;
  currency: string;
  current_rent: number;
  cpi_rate: number;
  proposed_rent: number;
  annual_increase: number;
  remaining_months: number;
  ibr: number;
  old_liability: number;
  new_liability: number;
  liability_adjustment: number;
  effective_date: string;
}

type WizardStep = 0 | 1 | 2 | 3;

export default function CPIEscalation() {
  // Wizard state
  const [wizardMode, setWizardMode] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(0);

  // Step 1: CPI Rate & Effective Date
  const [cpiRate, setCpiRate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Step 2: Eligible leases selection
  const [selectedContracts, setSelectedContracts] = useState<Set<number>>(new Set());

  // Step 3: Calculated results with overrides
  const [calculations, setCalculations] = useState<CalculatedEscalation[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [approvedContracts, setApprovedContracts] = useState<Set<number>>(new Set());

  // Step 4: Execution results
  const [executionResult, setExecutionResult] = useState<any>(null);

  // Calculation explanation modal
  const [calcExplainRow, setCalcExplainRow] = useState<CalculatedEscalation | null>(null);

  // Legacy list view state
  const [applyDialog, setApplyDialog] = useState<any>(null);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [newRent, setNewRent] = useState("");

  // Fetch escalations from backend (for list view)
  const { data: escalationsData, isLoading } = trpc.accounting.escalation.escalations.useQuery({});
  const pending: any[] = escalationsData ?? [];

  // Fetch eligible leases for wizard
  const { data: eligibleLeases, isLoading: eligibleLoading } = trpc.accounting.escalation.getEligibleLeases.useQuery(
    {},
    { enabled: wizardMode }
  );

  const utils = trpc.useUtils();

  // Mutations
  const applyMut = trpc.accounting.escalation.applyEscalation.useMutation({
    onSuccess: () => {
      utils.accounting.escalation.escalations.invalidate();
      toast.success("CPI escalation applied successfully");
      setApplyDialog(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const calculateMut = trpc.accounting.escalation.calculateCPICycle.useMutation({
    onSuccess: (data) => {
      setCalculations(data as CalculatedEscalation[]);
      // Auto-approve all
      setApprovedContracts(new Set(data.map((d: any) => d.contract_id)));
      setWizardStep(2);
    },
    onError: (e) => toast.error(`Calculation failed: ${e.message}`),
  });

  const executeMut = trpc.accounting.escalation.executeCPICycle.useMutation({
    onSuccess: (data) => {
      setExecutionResult(data);
      setWizardStep(3);
      utils.accounting.escalation.escalations.invalidate();
      toast.success(`CPI Escalation cycle completed: ${data.successful}/${data.total} leases processed`);
    },
    onError: (e) => toast.error(`Execution failed: ${e.message}`),
  });

  const displayRows = aiRows.length > 0 ? aiRows : pending;

  const statusBadge = (s: string) => {
    if (s === "APPLIED") return <Badge variant="default">Applied</Badge>;
    if (s === "PENDING") return <Badge variant="secondary" className="text-amber-600">Pending</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  };

  // Wizard helpers
  const handleStartWizard = () => {
    setWizardMode(true);
    setWizardStep(0);
    setCpiRate("");
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setSelectedContracts(new Set());
    setCalculations([]);
    setOverrides({});
    setApprovedContracts(new Set());
    setExecutionResult(null);
  };

  const handleStep1Next = () => {
    if (!cpiRate || Number(cpiRate) <= 0) {
      toast.error("Please enter a valid CPI rate");
      return;
    }
    setWizardStep(1);
  };

  const handleStep2Calculate = () => {
    if (selectedContracts.size === 0) {
      toast.error("Please select at least one lease");
      return;
    }
    calculateMut.mutate({
      cpi_rate: Number(cpiRate),
      effective_date: effectiveDate,
      contract_ids: Array.from(selectedContracts),
    });
  };

  const handleStep3Execute = () => {
    const approved = calculations.filter(c => approvedContracts.has(c.contract_id));
    if (approved.length === 0) {
      toast.error("Please approve at least one lease");
      return;
    }
    executeMut.mutate({
      escalations: approved.map(c => ({
        contract_id: c.contract_id,
        current_rent: c.current_rent,
        proposed_rent: c.proposed_rent,
        cpi_rate: c.cpi_rate,
        effective_date: c.effective_date,
        override_rent: overrides[c.contract_id] ? Number(overrides[c.contract_id]) : undefined,
      })),
    });
  };

  const toggleAll = () => {
    if (!eligibleLeases) return;
    if (selectedContracts.size === eligibleLeases.length) {
      setSelectedContracts(new Set());
    } else {
      setSelectedContracts(new Set(eligibleLeases.map((l: any) => l.contract_id)));
    }
  };

  const toggleApproveAll = () => {
    if (approvedContracts.size === calculations.length) {
      setApprovedContracts(new Set());
    } else {
      setApprovedContracts(new Set(calculations.map(c => c.contract_id)));
    }
  };

  // Step indicator component
  const StepIndicator = () => {
    const steps = [
      { num: 1, label: "Set CPI Rate" },
      { num: 2, label: "Select Leases" },
      { num: 3, label: "Review & Approve" },
      { num: 4, label: "Execute" },
    ];
    return (
      <div className="flex items-center gap-2 mb-6">
        {steps.map((s, i) => {
          const isActive = wizardStep === i;
          const isCompleted = wizardStep > i;
          return (
            <React.Fragment key={s.num}>
              {i > 0 && <span className="text-muted-foreground mx-1">→</span>}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                isCompleted ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/40" :
                isActive ? "bg-primary/20 text-primary border border-primary/40" :
                "bg-muted/30 text-muted-foreground border border-border"
              }`}>
                {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{s.num}</span>}
                <span>{s.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // Calculation explanation modal
  const CalcExplainModal = ({ row, onClose }: { row: CalculatedEscalation; onClose: () => void }) => (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold">CPI Escalation Calculation</h3>
            <p className="text-xs text-muted-foreground mt-1">{row.contract_ref} — {row.asset_description}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>
        <div className="p-6 space-y-6 font-mono text-sm">
          <div className="bg-muted/20 p-4 rounded-lg border border-border space-y-3">
            <p className="text-primary font-semibold text-base">Step 1: Calculate New Rent</p>
            <div className="pl-4 space-y-1">
              <p>Current Monthly Rent = <span className="text-emerald-400">{row.currency} {row.current_rent.toLocaleString()}</span></p>
              <p>CPI Rate = <span className="text-emerald-400">{row.cpi_rate}%</span></p>
              <p className="border-t border-border pt-2 mt-2">
                New Rent = Current Rent × (1 + CPI Rate / 100)
              </p>
              <p className="pl-4">= {row.current_rent.toLocaleString()} × (1 + {row.cpi_rate} / 100)</p>
              <p className="pl-4">= {row.current_rent.toLocaleString()} × {(1 + row.cpi_rate / 100).toFixed(4)}</p>
              <p className="pl-4 text-primary font-semibold">= {row.currency} {row.proposed_rent.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-muted/20 p-4 rounded-lg border border-border space-y-3">
            <p className="text-primary font-semibold text-base">Step 2: Annual Impact</p>
            <div className="pl-4 space-y-1">
              <p>Monthly Increase = {row.proposed_rent.toLocaleString()} − {row.current_rent.toLocaleString()} = <span className="text-amber-400">{row.currency} {(row.proposed_rent - row.current_rent).toLocaleString()}</span></p>
              <p>Annual Increase = Monthly Increase × 12 = <span className="text-amber-400">{row.currency} {row.annual_increase.toLocaleString()}</span></p>
            </div>
          </div>

          <div className="bg-muted/20 p-4 rounded-lg border border-border space-y-3">
            <p className="text-primary font-semibold text-base">Step 3: IFRS 16 Remeasurement (Lease Liability)</p>
            <div className="pl-4 space-y-1">
              <p>Remaining Term = <span className="text-emerald-400">{row.remaining_months} months</span> (from effective date to expiry)</p>
              <p>IBR (Annual) = <span className="text-emerald-400">{(row.ibr * 100).toFixed(3)}%</span></p>
              <p>Monthly Rate (r) = IBR / 12 = {(row.ibr / 12).toFixed(6)}</p>
              <p className="border-t border-border pt-2 mt-2">
                PV Factor = (1 − (1 + r)^−n) / r
              </p>
              <p className="pl-4">= (1 − (1 + {(row.ibr / 12).toFixed(6)})^−{row.remaining_months}) / {(row.ibr / 12).toFixed(6)}</p>
              {(() => {
                const monthlyRate = row.ibr / 12;
                const pvFactor = monthlyRate > 0 ? (1 - Math.pow(1 + monthlyRate, -row.remaining_months)) / monthlyRate : row.remaining_months;
                return <p className="pl-4">= {pvFactor.toFixed(4)}</p>;
              })()}
              <p className="border-t border-border pt-2 mt-2">
                Old Liability = Current Rent × PV Factor = <span className="text-muted-foreground">{row.currency} {row.old_liability.toLocaleString()}</span>
              </p>
              <p>
                New Liability = New Rent × PV Factor = <span className="text-primary font-semibold">{row.currency} {row.new_liability.toLocaleString()}</span>
              </p>
              <p className="border-t border-border pt-2 mt-2 text-amber-400 font-semibold">
                Liability Adjustment = New − Old = {row.currency} {row.liability_adjustment.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-muted/20 p-4 rounded-lg border border-border space-y-3">
            <p className="text-primary font-semibold text-base">Step 4: Journal Entry (on execution)</p>
            <div className="pl-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>ROU Asset (Right-of-Use)</TableCell>
                    <TableCell className="text-right font-mono">{row.liability_adjustment > 0 ? row.currency + " " + Math.abs(row.liability_adjustment).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{row.liability_adjustment < 0 ? row.currency + " " + Math.abs(row.liability_adjustment).toLocaleString() : "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Lease Liability</TableCell>
                    <TableCell className="text-right font-mono">{row.liability_adjustment < 0 ? row.currency + " " + Math.abs(row.liability_adjustment).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{row.liability_adjustment > 0 ? row.currency + " " + Math.abs(row.liability_adjustment).toLocaleString() : "—"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="text-xs text-muted-foreground italic">
            Per IFRS 16.42(b): When variable lease payments linked to an index/rate change due to a reassessment, the lessee remeasures the lease liability using a revised discount rate (or unchanged rate if not a modification).
          </div>
        </div>
      </div>
    </div>
  );

  // ─── WIZARD MODE ─────────────────────────────────────────────────────────────
  if (wizardMode) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full w-full bg-background">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setWizardMode(false)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-semibold">Run CPI Escalation Cycle</h2>
                <p className="text-xs text-muted-foreground">Set CPI rate → Select leases → Review & approve → Execute remeasurement</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setWizardMode(false)}>Cancel</Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <StepIndicator />

            {/* ─── STEP 1: Set CPI Rate ─── */}
            {wizardStep === 0 && (
              <div className="max-w-lg space-y-6">
                <h3 className="text-base font-semibold">Step 1 — Set CPI Rate & Effective Date</h3>
                <p className="text-sm text-muted-foreground">
                  Enter the published CPI rate for the applicable period. This rate will be applied to all eligible leases with index-linked escalation clauses.
                </p>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">CPI Rate (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="50"
                      className="mt-1 max-w-xs"
                      value={cpiRate}
                      onChange={e => setCpiRate(e.target.value)}
                      placeholder="e.g., 3.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Source: Qatar Planning and Statistics Authority or relevant national statistics office
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Effective Date</Label>
                    <Input
                      type="date"
                      className="mt-1 max-w-xs"
                      value={effectiveDate}
                      onChange={e => setEffectiveDate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      The date from which the new rent will take effect
                    </p>
                  </div>
                </div>
                <Button onClick={handleStep1Next} disabled={!cpiRate || Number(cpiRate) <= 0}>
                  Next — Select Leases →
                </Button>
              </div>
            )}

            {/* ─── STEP 2: Select Eligible Leases ─── */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Step 2 — Select Eligible Leases</h3>
                    <p className="text-sm text-muted-foreground">
                      The following leases have CPI/index-linked escalation clauses. Select which ones to include in this cycle.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">CPI Rate: {cpiRate}%</Badge>
                    <Badge variant="outline" className="text-xs">Effective: {effectiveDate}</Badge>
                  </div>
                </div>

                {eligibleLoading ? (
                  <div className="text-center py-12 text-muted-foreground">Loading eligible leases…</div>
                ) : !eligibleLeases || eligibleLeases.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No eligible leases found.</p>
                      <p className="text-xs text-muted-foreground mt-1">Leases must be Active with an escalation rate &gt; 0.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="flex items-center gap-3 text-sm">
                      <Checkbox
                        checked={selectedContracts.size === eligibleLeases.length}
                        onCheckedChange={toggleAll}
                      />
                      <span className="text-muted-foreground">Select All ({eligibleLeases.length} leases)</span>
                      <span className="ml-auto text-muted-foreground">{selectedContracts.size} selected</span>
                    </div>
                    <Card>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10"></TableHead>
                              <TableHead>Contract</TableHead>
                              <TableHead>Lessor</TableHead>
                              <TableHead>Property</TableHead>
                              <TableHead className="text-right">Monthly Rent</TableHead>
                              <TableHead className="text-right">Escalation Rate</TableHead>
                              <TableHead>Expiry</TableHead>
                              <TableHead>Classification</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(eligibleLeases as EligibleLease[]).map((l) => (
                              <TableRow key={l.contract_id} className={selectedContracts.has(l.contract_id) ? "bg-primary/5" : ""}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedContracts.has(l.contract_id)}
                                    onCheckedChange={(checked) => {
                                      const next = new Set(selectedContracts);
                                      if (checked) next.add(l.contract_id);
                                      else next.delete(l.contract_id);
                                      setSelectedContracts(next);
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="font-mono text-xs">{l.contract_ref}</TableCell>
                                <TableCell className="text-sm">{l.lessor_name}</TableCell>
                                <TableCell className="text-sm">{l.asset_description}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{l.currency} {Number(l.monthly_payment).toLocaleString()}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{(Number(l.escalation_rate) * 100).toFixed(2)}%</TableCell>
                                <TableCell className="text-sm">{l.expiry_date ? new Date(l.expiry_date).toISOString().slice(0, 10) : "—"}</TableCell>
                                <TableCell><Badge variant="outline" className="text-xs">{l.ifrs16_classification || "—"}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setWizardStep(0)}>← Back</Button>
                      <Button
                        onClick={handleStep2Calculate}
                        disabled={selectedContracts.size === 0 || calculateMut.isPending}
                      >
                        {calculateMut.isPending ? "Calculating…" : `Calculate for ${selectedContracts.size} Leases →`}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─── STEP 3: Review & Approve ─── */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Step 3 — Review & Approve</h3>
                    <p className="text-sm text-muted-foreground">
                      Review proposed new rents and IFRS 16 impact. Override individual amounts if needed (e.g., contractual caps/floors).
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">CPI: {cpiRate}%</Badge>
                    <Badge variant="outline" className="text-xs">{approvedContracts.size}/{calculations.length} approved</Badge>
                  </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-muted-foreground">Total Leases</p>
                      <p className="text-xl font-bold text-blue-400">{calculations.length}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-muted-foreground">Total Monthly Increase</p>
                      <p className="text-xl font-bold text-amber-400">
                        {calculations[0]?.currency ?? "QAR"} {calculations.reduce((s, c) => s + (c.proposed_rent - c.current_rent), 0).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-muted-foreground">Total Annual Impact</p>
                      <p className="text-xl font-bold text-emerald-400">
                        {calculations[0]?.currency ?? "QAR"} {calculations.reduce((s, c) => s + c.annual_increase, 0).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-muted-foreground">Total Liability Adj.</p>
                      <p className="text-xl font-bold text-purple-400">
                        {calculations[0]?.currency ?? "QAR"} {calculations.reduce((s, c) => s + c.liability_adjustment, 0).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={approvedContracts.size === calculations.length}
                    onCheckedChange={toggleApproveAll}
                  />
                  <span className="text-muted-foreground">Approve All</span>
                </div>

                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Contract</TableHead>
                          <TableHead>Property</TableHead>
                          <TableHead className="text-right">Current Rent</TableHead>
                          <TableHead className="text-right">Proposed Rent</TableHead>
                          <TableHead className="text-right">Override</TableHead>
                          <TableHead className="text-right">Liability Adj.</TableHead>
                          <TableHead className="text-center">Approve</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calculations.map((c) => (
                          <TableRow key={c.contract_id} className={approvedContracts.has(c.contract_id) ? "bg-emerald-500/5" : "opacity-60"}>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setCalcExplainRow(c)}
                                title="Show calculation"
                              >
                                <Calculator className="w-3.5 h-3.5 text-primary" />
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={approvedContracts.has(c.contract_id)}
                                onCheckedChange={(checked) => {
                                  const next = new Set(approvedContracts);
                                  if (checked) next.add(c.contract_id);
                                  else next.delete(c.contract_id);
                                  setApprovedContracts(next);
                                }}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{c.contract_ref}</TableCell>
                            <TableCell className="text-sm">{c.asset_description}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{c.currency} {c.current_rent.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold text-emerald-400">{c.currency} {c.proposed_rent.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                className="w-28 h-7 text-xs text-right ml-auto"
                                placeholder={c.proposed_rent.toFixed(2)}
                                value={overrides[c.contract_id] ?? ""}
                                onChange={e => setOverrides(prev => ({ ...prev, [c.contract_id]: e.target.value }))}
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-amber-400">
                              {c.currency} {c.liability_adjustment.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-center">
                              {approvedContracts.has(c.contract_id) ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setWizardStep(1)}>← Back</Button>
                  <Button
                    onClick={handleStep3Execute}
                    disabled={approvedContracts.size === 0 || executeMut.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {executeMut.isPending ? "Executing…" : `Execute CPI Escalation (${approvedContracts.size} leases) →`}
                  </Button>
                </div>
              </div>
            )}

            {/* ─── STEP 4: Execution Complete ─── */}
            {wizardStep === 3 && executionResult && (
              <div className="space-y-6 max-w-2xl">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  <div>
                    <h3 className="text-base font-semibold">CPI Escalation Cycle Complete</h3>
                    <p className="text-sm text-muted-foreground">
                      {executionResult.successful}/{executionResult.total} leases processed successfully
                    </p>
                  </div>
                </div>

                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">CPI Rate Applied</p>
                        <p className="font-semibold">{cpiRate}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Effective Date</p>
                        <p className="font-semibold">{effectiveDate}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Leases Processed</p>
                        <p className="font-semibold">{executionResult.successful}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Contract</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>JV Reference</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {executionResult.results.map((r: any) => {
                          const calc = calculations.find(c => c.contract_id === r.contract_id);
                          return (
                            <TableRow key={r.contract_id}>
                              <TableCell className="font-mono text-xs">{calc?.contract_ref ?? r.contract_id}</TableCell>
                              <TableCell>
                                {r.success ? (
                                  <Badge variant="default" className="bg-emerald-600">Success</Badge>
                                ) : (
                                  <Badge variant="destructive">Failed</Badge>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{r.jv?.jv_number ?? r.jv?.remeasurement_id ?? "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.warning ?? "Remeasurement posted"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Button onClick={() => setWizardMode(false)}>
                  ← Return to CPI Escalation Dashboard
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Calculation explanation modal */}
        {calcExplainRow && <CalcExplainModal row={calcExplainRow} onClose={() => setCalcExplainRow(null)} />}
      </DashboardLayout>
    );
  }

  // ─── LIST MODE (existing) ─────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      {applyDialog ? (
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setApplyDialog(null)}><ArrowLeft className="w-5 h-5" /></Button>
              <div><h2 className="text-lg font-semibold">Apply CPI Escalation</h2><p className="text-xs text-muted-foreground">Contract: {applyDialog.contract_ref}</p></div>
            </div>
            <div className="flex gap-2">
              <GenAIFillButton formType="cpi_escalation" onFill={(data) => {
                if (data.newRent) setNewRent(String(data.newRent));
              }} />
              <Button variant="outline" onClick={() => setApplyDialog(null)}>Cancel</Button>
              <Button
                disabled={applyMut.isPending || !newRent}
                onClick={() => applyMut.mutate({ escalation_id: applyDialog.escalation_id, new_rent: Number(newRent) })}
              >
                {applyMut.isPending ? "Applying..." : "Apply Escalation"}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-xl mx-auto space-y-5">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg text-sm">
                <div><span className="text-muted-foreground">Current Rent:</span><span className="ml-2 font-mono font-semibold">QAR {Number(applyDialog.current_rent ?? 0).toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">CPI Rate:</span><span className="ml-2 font-mono font-semibold">{applyDialog.cpi_rate ?? "—"}%</span></div>
                <div><span className="text-muted-foreground">Proposed Rent:</span><span className="ml-2 font-mono font-semibold text-emerald-600">QAR {Number(applyDialog.proposed_rent ?? 0).toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Effective Date:</span><span className="ml-2">{applyDialog.effective_date?.slice(0,10)}</span></div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Confirmed New Rent (QAR) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="mt-1"
                  value={newRent}
                  onChange={e => setNewRent(e.target.value)}
                  placeholder={String(applyDialog.proposed_rent ?? "")}
                />
                <p className="text-xs text-muted-foreground mt-1">Enter the confirmed new monthly rent to apply. Defaults to proposed rent.</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          <ScreenHeader
            screenId="VFLCPIESC0001P001"
            title="CPI Escalation"
            subtitle="Consumer Price Index rent escalations pending review and application"
            screenType="cpi_escalation"
            onAIData={(rows) => setAiRows(rows)}
            actions={
              <Button onClick={handleStartWizard} className="bg-primary">
                <Play className="w-4 h-4 mr-2" />
                Run CPI Escalation Cycle
              </Button>
            }
          />

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Pending Escalations", value: displayRows.filter((r: any) => r.status === "PENDING").length, color: "text-amber-600" },
              { label: "Applied This Year", value: displayRows.filter((r: any) => r.status === "APPLIED").length, color: "text-emerald-600" },
              { label: "Total Contracts", value: displayRows.length, color: "text-blue-600" },
            ].map(k => (
              <Card key={k.label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead className="text-right">Current Rent</TableHead>
                    <TableHead className="text-right">CPI Rate</TableHead>
                    <TableHead className="text-right">Proposed Rent</TableHead>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && aiRows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading escalations…</TableCell></TableRow>
                  ) : displayRows.map((r: any, i: number) => (
                    <TableRow key={r.escalation_id ?? i}>
                      <TableCell className="font-mono text-xs">{r.contract_ref}</TableCell>
                      <TableCell className="text-sm">{r.asset_description ?? r.property_name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">QAR {Number(r.base_rent ?? r.current_rent ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.escalation_rate_pct ?? r.cpi_rate ?? "—"}%</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-emerald-600">QAR {Number(r.new_rent ?? r.proposed_rent ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{r.effective_date ? (typeof r.effective_date === 'string' ? r.effective_date.slice(0,10) : new Date(r.effective_date).toISOString().slice(0,10)) : r.review_date ? (typeof r.review_date === 'string' ? r.review_date.slice(0,10) : new Date(r.review_date).toISOString().slice(0,10)) : '—'}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell>
                        {r.status === "PENDING" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setNewRent(String(r.proposed_rent ?? "")); setApplyDialog(r); }}
                          >
                            <TrendingUp className="w-3 h-3 mr-1" />Apply
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && displayRows.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No CPI escalations pending</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
