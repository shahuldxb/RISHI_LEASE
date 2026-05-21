import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GenAIFillButton } from "@/components/GenAIFillButton";

const CRITERIA = [
  { key: "transfers_ownership", label: "Ownership transfers to lessee at end of lease term" },
  { key: "purchase_option_certain", label: "Bargain purchase option — reasonably certain to exercise" },
  { key: "major_part_of_life", label: "Lease term is for the major part (≥75%) of the asset's economic life" },
  { key: "substantially_all_fv", label: "PV of lease payments amounts to substantially all (≥90%) of fair value" },
  { key: "specialised_asset", label: "Asset is specialised — no alternative use to lessor without major modification" },
];

export default function LeaseClassification() {
  const [showForm, setShowForm] = useState(false);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [standard, setStandard] = useState<"IFRS16" | "ASC842">("IFRS16");
  const [criteria, setCriteria] = useState<Record<string, boolean>>({
    transfers_ownership: false,
    purchase_option_certain: false,
    major_part_of_life: false,
    substantially_all_fv: false,
    specialised_asset: false,
  });
  const [notes, setNotes] = useState("");
  const [showSample, setShowSample] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setShowForm(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Fetch all leases for dropdown (no status filter)
  const { data: contractsData } = trpc.lease.getLeaseRegister.useQuery({});
  const contracts = (contractsData as any)?.rows ?? [];

  // Fetch existing classifications
  const { data: classifications = [], refetch } = trpc.accounting.classification.list.useQuery({});

  // Classify mutation
  const classifyMut = trpc.accounting.classification.classify.useMutation({
    onSuccess: (result) => {
      toast.success(`Lease classified as ${result.leaseType}`);
      refetch();
      setShowForm(false);
      resetForm();
    },
    onError: (err) => {
      toast.error(`Classification failed: ${err.message}`);
    },
  });

  const resetForm = () => {
    setSelectedContractId("");
    setStandard("IFRS16");
    setCriteria({
      transfers_ownership: false,
      purchase_option_certain: false,
      major_part_of_life: false,
      substantially_all_fv: false,
      specialised_asset: false,
    });
    setNotes("");
  };

  const handleSave = () => {
    if (!selectedContractId) {
      toast.error("Please select a lease contract");
      return;
    }
    classifyMut.mutate({
      contract_id: Number(selectedContractId),
      standard,
      transfers_ownership: criteria.transfers_ownership,
      purchase_option_certain: criteria.purchase_option_certain,
      major_part_of_life: criteria.major_part_of_life,
      substantially_all_fv: criteria.substantially_all_fv,
      specialised_asset: criteria.specialised_asset,
      notes,
    });
  };

  const isFinance = Object.values(criteria).some(Boolean);
  const criteriaCount = Object.values(criteria).filter(Boolean).length;
  const displayRows = aiRows.length > 0 ? aiRows : (classifications as any[]);

  return (
    <DashboardLayout>
      {showForm ? (
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><ArrowLeft className="w-5 h-5" /></Button>
              <div>
                <h2 className="text-lg font-semibold">Classify Lease</h2>
                <p className="text-xs text-muted-foreground">Apply IFRS 16 / ASC 842 classification criteria</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={classifyMut.isPending}>
                {classifyMut.isPending ? "Saving..." : "Save Classification"}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Contract Selection */}
              <Card>
                <CardHeader><CardTitle className="text-sm">Select Lease Contract</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Contract</Label>
                    <Select value={selectedContractId} onValueChange={setSelectedContractId}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select a lease contract..." /></SelectTrigger>
                      <SelectContent>
                        {contracts.map((c: any) => (
                          <SelectItem key={c.contract_id ?? c.id} value={String(c.contract_id ?? c.id)}>
                            {c.contract_ref} — {c.asset_description || c.lessor_name || "N/A"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Accounting Standard</Label>
                    <Select value={standard} onValueChange={(v: any) => setStandard(v)}>
                      <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IFRS16">IFRS 16</SelectItem>
                        <SelectItem value="ASC842">ASC 842</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Classification Criteria */}
              <Card>
                <CardHeader><CardTitle className="text-sm">Finance Lease Criteria</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">If <strong>any one</strong> criterion is met, the lease is classified as a <strong>Finance Lease</strong>. If none are met, it is an <strong>Operating Lease</strong>.</p>
                  {CRITERIA.map(c => (
                    <div key={c.key} className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <Checkbox
                        checked={!!criteria[c.key]}
                        onCheckedChange={v => setCriteria(prev => ({ ...prev, [c.key]: !!v }))}
                        className="mt-0.5"
                      />
                      <div>
                        <Label className="text-sm cursor-pointer">{c.label}</Label>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Classification Result */}
              <div className={`p-4 rounded-lg border-2 ${isFinance ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20" : "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"}`}>
                <div className="flex items-center gap-2">
                  {isFinance ? <XCircle className="w-5 h-5 text-amber-500" /> : <CheckCircle className="w-5 h-5 text-emerald-500" />}
                  <p className="font-semibold text-sm">{isFinance ? "Finance Lease" : "Operating Lease"}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-7">
                  {isFinance
                    ? `${criteriaCount} of 5 criteria met — classify as Finance Lease`
                    : "No criteria met — classify as Operating Lease"}
                </p>
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs text-muted-foreground">Notes / Justification</Label>
                <Textarea className="mt-1" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Document the rationale for this classification..." />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          <ScreenHeader screenId="VFLLSECLS0001P001" title="Lease Classification" subtitle="IFRS 16 / ASC 842 finance vs operating lease classification"
            screenType="lease_classification" onAIData={(rows) => setAiRows(rows)}
            actions={<Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}><Plus className="w-4 h-4 mr-1" />Classify Lease</Button>} />
          <Card><CardContent className="p-0"><Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Standard</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Criteria Met</TableHead>
                <TableHead>Classified By</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.map((r: any, i: number) => {
                const critCount = [r.transfers_ownership, r.purchase_option_certain, r.major_part_of_life, r.substantially_all_fv, r.specialised_asset].filter(Boolean).length;
                return (
                  <TableRow key={r.id ?? i}>
                    <TableCell className="font-mono text-xs">{r.contract_ref}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.asset_description ?? r.asset_type ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{r.standard ?? "IFRS16"}</Badge></TableCell>
                    <TableCell>
                      {(r.lease_type ?? r.classification) === "Finance"
                        ? <Badge className="bg-amber-500 text-white">Finance</Badge>
                        : <Badge className="bg-emerald-600 text-white">Operating</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{critCount}/5</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.classified_by ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.classification_date ? new Date(r.classification_date).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                );
              })}
              {displayRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No classifications yet. Click <strong>Classify Lease</strong> to begin.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table></CardContent></Card>
        </div>
      )}

      {showSample && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg p-4 shadow-xl max-w-sm">
          <p className="text-xs font-semibold text-primary mb-2">Qatar Sample Data</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Company: Vodafone Qatar Q.P.S.C.</p>
            <p>Location: West Bay, Doha, Qatar</p>
            <p>Currency: QAR | Country: QA</p>
            <p>Contact: +974 4412 0000</p>
            <p>Bank: Qatar National Bank (QNB)</p>
          </div>
          <button className="mt-2 text-xs text-primary hover:underline" onClick={() => setShowSample(false)}>Close</button>
        </div>
      )}
    </DashboardLayout>
  );
}
