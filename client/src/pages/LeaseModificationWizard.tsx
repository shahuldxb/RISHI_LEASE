/**
 * Feature 17 — Lease Modification Wizard
 * 4-step wizard: Select Lease → Enter New Terms → Review Remeasurement → Confirm & Post GL
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CheckCircle, ChevronRight, ChevronLeft, AlertTriangle, FileText,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";

const fmt = (v: unknown) =>
  v == null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v: unknown) =>
  v == null ? "—" : `${(Number(v) * 100).toFixed(4)}%`;

const MODIFICATION_TYPES = [
  { value: "extension", label: "Lease Extension", desc: "Extend the lease term beyond the original expiry date" },
  { value: "payment_change", label: "Payment Change", desc: "Change in monthly payment amount (e.g. rent review)" },
  { value: "scope_change", label: "Scope Change", desc: "Change in the right-of-use asset (e.g. additional floor space)" },
  { value: "termination", label: "Early Termination", desc: "Terminate the lease before the original expiry date" },
];

const STEPS = ["Select Lease", "New Terms", "Review Impact", "Confirm & Post"];

type DraftMod = {
  modification_id: number;
  contract_id: number;
  modification_date: string;
  modification_type: string;
  old_ibr: number;
  new_ibr: number;
  old_term_end: string;
  new_term_end: string;
  old_monthly_payment: number;
  new_monthly_payment: number;
  old_rou_nbv: number;
  new_rou_nbv: number;
  old_liability: number;
  new_liability: number;
  remeasurement_gain_loss: number;
  remaining_months: number;
  status: string;
};

export default function LeaseModificationWizard() {
  const [step, setStep] = useState(0);
  const [activeHistoryTab, setActiveHistoryTab] = useState("all");

  // Step 1 state
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [modificationType, setModificationType] = useState<string>("");

  // Step 2 state
  const [modDate, setModDate] = useState(new Date().toISOString().slice(0, 10));
  const [newIBR, setNewIBR] = useState("");
  const [newTermEnd, setNewTermEnd] = useState("");
  const [newPayment, setNewPayment] = useState("");
  const [notes, setNotes] = useState("");

  // Draft result from Step 2 → Step 3
  const [draft, setDraft] = useState<DraftMod | null>(null);
  const [appliedResult, setAppliedResult] = useState<Record<string, unknown> | null>(null);

  const utils = trpc.useUtils();

  // Fetch leases
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ status: "active" });
  const leases = ((leasesData as any)?.rows ?? leasesData ?? []) as Array<Record<string, unknown>>;

  // Fetch modification history
  const { data: history, refetch: refetchHistory } = trpc.lease.getLeaseModifications.useQuery({
    contractId: selectedContractId ?? undefined,
    status: activeHistoryTab === "all" ? undefined : activeHistoryTab,
  });

  // Fetch selected lease details
  const selectedLease = leases.find((l) => l.contract_id === selectedContractId);

  // Create draft mutation
  const createMod = trpc.lease.createLeaseModification.useMutation({
    onSuccess: (data) => {
      setDraft(data as unknown as DraftMod);
      setStep(2);
    },
    onError: (err) => toast.error(`Failed to compute remeasurement: ${err.message}`),
  });

  // Apply mutation
  const applyMod = trpc.lease.applyLeaseModification.useMutation({
    onSuccess: (data) => {
      setAppliedResult(data as unknown as Record<string, unknown>);
      setStep(3);
      refetchHistory();
      utils.lease.getLeaseModifications.invalidate();
      toast.success("Lease modification applied and GL journals posted.");
    },
    onError: (err) => toast.error(`Failed to apply modification: ${err.message}`),
  });

  const handleComputeRemeasurement = () => {
    if (!selectedContractId || !modificationType || !modDate) {
      toast.error("Please complete all required fields.");
      return;
    }
    createMod.mutate({
      contractId: selectedContractId,
      modificationDate: modDate,
      modificationType: modificationType as "extension" | "payment_change" | "scope_change" | "termination",
      newIBR: newIBR ? Number(newIBR) / 100 : undefined,
      newTermEnd: newTermEnd || undefined,
      newMonthlyPayment: newPayment ? Number(newPayment) : undefined,
      notes: notes || undefined,
    });
  };

  const handleApply = () => {
    if (!draft) return;
    applyMod.mutate({ modificationId: draft.modification_id });
  };

  const resetWizard = () => {
    setStep(0);
    setDraft(null);
    setAppliedResult(null);
    setModificationType("");
    setNewIBR("");
    setNewTermEnd("");
    setNewPayment("");
    setNotes("");
  };

  const gainLoss = draft ? Number(draft.remeasurement_gain_loss ?? 0) : 0;

  return (
    <div className="p-6 space-y-6">
      <ScreenHeader
        screenId="VFLLSMOD0001P001" screenType="lease_modification_wizard"
        title="Lease Modification Wizard"
        subtitle="IFRS 16 Para 44–46 — Remeasurement & GL Journal Generation"
      />

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              i === step ? "bg-primary text-primary-foreground" :
              i < step ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
            }`}>
              {i < step ? <CheckCircle className="h-4 w-4" /> : <span className="w-4 h-4 flex items-center justify-center text-xs">{i + 1}</span>}
              {s}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Wizard Panel */}
        <div className="lg:col-span-2 space-y-4">

          {/* STEP 0: Select Lease */}
          {step === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 1 — Select Lease & Modification Type</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Lease Contract</label>
                  <Select
                    value={selectedContractId?.toString() ?? ""}
                    onValueChange={(v) => setSelectedContractId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a lease to modify…" />
                    </SelectTrigger>
                    <SelectContent>
                      {leases.map((l) => (
                        <SelectItem key={String(l.contract_id)} value={String(l.contract_id)}>
                          {String(l.contract_ref)} — {String(l.asset_description ?? "")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedLease && (
                  <div className="bg-muted/40 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Asset:</span> <span className="font-medium">{String(selectedLease.asset_description ?? "")}</span></div>
                    <div><span className="text-muted-foreground">Type:</span> <span className="font-medium capitalize">{String(selectedLease.asset_type ?? "")}</span></div>
                    <div><span className="text-muted-foreground">Current IBR:</span> <span className="font-medium">{fmtPct(selectedLease.ibr)}</span></div>
                    <div><span className="text-muted-foreground">Monthly Payment:</span> <span className="font-medium">{fmt(selectedLease.monthly_payment)}</span></div>
                    <div><span className="text-muted-foreground">Commencement:</span> <span className="font-medium">{String(selectedLease.commencement_date ?? "").slice(0, 10)}</span></div>
                    <div><span className="text-muted-foreground">Expiry:</span> <span className="font-medium">{String(selectedLease.expiry_date ?? "").slice(0, 10)}</span></div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium mb-2 block">Modification Type</label>
                  <div className="grid grid-cols-1 gap-2">
                    {MODIFICATION_TYPES.map((mt) => (
                      <button
                        key={mt.value}
                        onClick={() => setModificationType(mt.value)}
                        className={`text-left p-3 rounded-lg border transition-colors ${
                          modificationType === mt.value
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50 hover:bg-muted/30"
                        }`}
                      >
                        <p className="font-medium text-sm">{mt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{mt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={() => setStep(1)}
                  disabled={!selectedContractId || !modificationType}
                  className="w-full"
                >
                  Next: Enter New Terms <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* STEP 1: Enter New Terms */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 2 — Enter New Lease Terms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Modification Date *</label>
                    <input
                      type="date"
                      value={modDate}
                      onChange={(e) => setModDate(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">New IBR (% p.a.) — leave blank to keep current</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={selectedLease ? `Current: ${(Number(selectedLease.ibr ?? 0) * 100).toFixed(4)}%` : "e.g. 5.25"}
                      value={newIBR}
                      onChange={(e) => setNewIBR(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">New Term End Date — leave blank to keep current</label>
                    <input
                      type="date"
                      value={newTermEnd}
                      onChange={(e) => setNewTermEnd(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">New Monthly Payment — leave blank to keep current</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={selectedLease ? `Current: ${fmt(selectedLease.monthly_payment)}` : "e.g. 12500"}
                      value={newPayment}
                      onChange={(e) => setNewPayment(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm bg-background"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Notes</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Reason for modification, board approval reference, etc."
                    className="w-full border rounded px-3 py-2 text-sm bg-background resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(0)} className="flex-1">
                    <ChevronLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button
                    onClick={handleComputeRemeasurement}
                    disabled={createMod.isPending}
                    className="flex-1"
                  >
                    {createMod.isPending ? "Computing…" : "Compute Remeasurement →"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 2: Review Impact */}
          {step === 2 && draft && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 3 — Review Remeasurement Impact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Gain/Loss Banner */}
                <div className={`flex items-center gap-3 p-4 rounded-lg ${
                  gainLoss > 0 ? "bg-green-900/30 border border-green-600" :
                  gainLoss < 0 ? "bg-red-900/30 border border-red-600" :
                  "bg-muted border border-border"
                }`}>
                  {gainLoss > 0 ? <TrendingDown className="h-6 w-6 text-green-400" /> :
                   gainLoss < 0 ? <TrendingUp className="h-6 w-6 text-red-400" /> :
                   <Minus className="h-6 w-6 text-muted-foreground" />}
                  <div>
                    <p className="font-semibold text-sm">
                      {gainLoss > 0 ? "Gain on Remeasurement" : gainLoss < 0 ? "Loss on Remeasurement" : "No Remeasurement Impact"}
                    </p>
                    <p className={`text-xl font-bold font-mono ${gainLoss > 0 ? "text-green-400" : gainLoss < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {fmt(Math.abs(gainLoss))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Old Liability ({fmt(draft.old_liability)}) − New PV ({fmt(draft.new_liability)})
                    </p>
                  </div>
                </div>

                {/* Before / After Comparison */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide"></div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide text-center">Before</div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide text-center">After</div>

                  {[
                    { label: "IBR (p.a.)", before: fmtPct(draft.old_ibr), after: fmtPct(draft.new_ibr) },
                    { label: "Term End", before: String(draft.old_term_end ?? "").slice(0, 10), after: String(draft.new_term_end ?? "").slice(0, 10) },
                    { label: "Monthly Payment", before: fmt(draft.old_monthly_payment), after: fmt(draft.new_monthly_payment) },
                    { label: "ROU Asset NBV", before: fmt(draft.old_rou_nbv), after: fmt(draft.new_rou_nbv) },
                    { label: "Lease Liability", before: fmt(draft.old_liability), after: fmt(draft.new_liability) },
                  ].map((row) => (
                    <>
                      <div key={`${row.label}-label`} className="py-2 px-3 bg-muted/30 rounded text-sm font-medium">{row.label}</div>
                      <div key={`${row.label}-before`} className="py-2 px-3 bg-muted/20 rounded text-sm font-mono text-center text-muted-foreground">{row.before}</div>
                      <div key={`${row.label}-after`} className="py-2 px-3 bg-primary/10 rounded text-sm font-mono text-center font-semibold">{row.after}</div>
                    </>
                  ))}
                </div>

                {/* GL Journals Preview */}
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" /> GL Journals to be Posted
                  </p>
                  <div className="rounded-lg border overflow-hidden text-xs">
                    <table className="w-full">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-left py-2 px-3">Ledger</th>
                          <th className="text-left py-2 px-3">Description</th>
                          <th className="text-center py-2 px-3">Dr/Cr</th>
                          <th className="text-right py-2 px-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Math.abs(draft.new_rou_nbv - draft.old_rou_nbv) > 0.01 && (
                          <tr className="border-t">
                            <td className="py-2 px-3 font-mono">1600</td>
                            <td className="py-2 px-3">Right-of-Use Asset — Remeasurement</td>
                            <td className="py-2 px-3 text-center">
                              <Badge variant={draft.new_rou_nbv > draft.old_rou_nbv ? "default" : "secondary"}>
                                {draft.new_rou_nbv > draft.old_rou_nbv ? "DR" : "CR"}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-right font-mono">{fmt(Math.abs(draft.new_rou_nbv - draft.old_rou_nbv))}</td>
                          </tr>
                        )}
                        {Math.abs(draft.new_liability - draft.old_liability) > 0.01 && (
                          <tr className="border-t">
                            <td className="py-2 px-3 font-mono">2600</td>
                            <td className="py-2 px-3">Lease Liability — Remeasurement</td>
                            <td className="py-2 px-3 text-center">
                              <Badge variant={draft.new_liability > draft.old_liability ? "secondary" : "default"}>
                                {draft.new_liability > draft.old_liability ? "CR" : "DR"}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-right font-mono">{fmt(Math.abs(draft.new_liability - draft.old_liability))}</td>
                          </tr>
                        )}
                        {Math.abs(gainLoss) > 0.01 && (
                          <tr className="border-t">
                            <td className="py-2 px-3 font-mono">7100</td>
                            <td className="py-2 px-3">Gain/Loss on Lease Modification</td>
                            <td className="py-2 px-3 text-center">
                              <Badge variant={gainLoss > 0 ? "secondary" : "default"}>
                                {gainLoss > 0 ? "CR" : "DR"}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-right font-mono">{fmt(Math.abs(gainLoss))}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-300">
                    Applying this modification will update the lease contract, post the GL journals above,
                    and mark the modification as applied. This action cannot be undone.
                    The amortisation schedule will need to be regenerated after application.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                    <ChevronLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button
                    onClick={handleApply}
                    disabled={applyMod.isPending}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {applyMod.isPending ? "Posting GL…" : "Confirm & Post GL Journals →"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 3: Confirmation */}
          {step === 3 && appliedResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  Step 4 — Modification Applied Successfully
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-green-900/20 border border-green-600 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">JE Reference</span>
                    <span className="font-mono font-semibold">{String(appliedResult.je_ref ?? "")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className="bg-green-600 text-white">Applied</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">New ROU Asset NBV</span>
                    <span className="font-mono">{fmt(appliedResult.new_rou_nbv)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">New Lease Liability</span>
                    <span className="font-mono">{fmt(appliedResult.new_liability)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Remeasurement Gain/Loss</span>
                    <span className={`font-mono font-semibold ${Number(appliedResult.remeasurement_gain_loss ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {fmt(appliedResult.remeasurement_gain_loss)}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  The lease contract has been updated and GL journals have been posted.
                  Please regenerate the amortisation schedule to reflect the new terms.
                </p>
                <Button onClick={resetWizard} className="w-full">
                  Start Another Modification
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* History Panel */}
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Modification History</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={activeHistoryTab} onValueChange={setActiveHistoryTab}>
                <TabsList className="w-full text-xs">
                  <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                  <TabsTrigger value="draft" className="flex-1">Draft</TabsTrigger>
                  <TabsTrigger value="applied" className="flex-1">Applied</TabsTrigger>
                </TabsList>
                <TabsContent value={activeHistoryTab}>
                  <div className="space-y-2 mt-2 max-h-[600px] overflow-y-auto">
                    {!history || (history as unknown[]).length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">No modifications found.</p>
                    ) : (
                      (history as Array<Record<string, unknown>>).map((m) => (
                        <div key={String(m.modification_id)} className="border rounded-lg p-3 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold">{String(m.contract_ref ?? "")}</span>
                            <Badge variant={m.status === "applied" ? "default" : m.status === "draft" ? "secondary" : "outline"} className="text-xs capitalize">
                              {String(m.status ?? "")}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground capitalize">{String(m.modification_type ?? "").replace("_", " ")}</p>
                          <p className="text-muted-foreground">{String(m.modification_date ?? "").slice(0, 10)}</p>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Old Liab: {fmt(m.old_liability)}</span>
                            <span>New Liab: {fmt(m.new_liability)}</span>
                          </div>
                          <div className={`font-semibold ${Number(m.remeasurement_gain_loss ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {Number(m.remeasurement_gain_loss ?? 0) >= 0 ? "Gain: " : "Loss: "}{fmt(Math.abs(Number(m.remeasurement_gain_loss ?? 0)))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
