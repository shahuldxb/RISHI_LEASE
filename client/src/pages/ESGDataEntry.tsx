/**
 * ESG Data Entry — Full-screen CRUD for Environmental, Social, and Governance metrics.
 * Screen ID: VFLESGRPT0001P001
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Leaf, Users, Shield, Plus, Pencil, Trash2, Save, X, RefreshCw,
} from "lucide-react";

const SCREEN_ID = "VFLESGRPT0001P001";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const GREEN_RATINGS = ["LEED Platinum","LEED Gold","LEED Silver","LEED Certified","BREEAM Outstanding","BREEAM Excellent","BREEAM Very Good","BREEAM Good","Estidama 5 Pearl","Estidama 4 Pearl","Estidama 3 Pearl","None"];
const COMPLIANCE_OPTIONS = ["Compliant","Partially Compliant","Non-Compliant","Under Review"];
const IFRS16_OPTIONS = ["Full","Partial","Non-Compliant","Exempt"];

export default function ESGDataEntry() {
  const [activeTab, setActiveTab] = useState("environmental");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterContract, setFilterContract] = useState<number | undefined>();
  const [editingRow, setEditingRow] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  // Data queries
  const { data: envData = [], refetch: refetchEnv } = trpc.esg.listEnvironmental.useQuery({ year: filterYear, contractId: filterContract });
  const { data: socialData = [], refetch: refetchSocial } = trpc.esg.listSocial.useQuery({ year: filterYear, contractId: filterContract });
  const { data: govData = [], refetch: refetchGov } = trpc.esg.listGovernance.useQuery({ year: filterYear, contractId: filterContract });
  const { data: contractsData } = trpc.lease.getLeaseRegister.useQuery({ status: "Active", pageSize: 500 });

  const contracts = useMemo(() => (contractsData?.rows || []).map((c: any) => ({ id: c.contract_id, ref: c.contract_ref, desc: c.asset_description })), [contractsData]);

  // Mutations
  const upsertEnv = trpc.esg.upsertEnvironmental.useMutation({ onSuccess: () => { refetchEnv(); setShowForm(false); setEditingRow(null); toast.success("Environmental record saved"); } });
  const upsertSocial = trpc.esg.upsertSocial.useMutation({ onSuccess: () => { refetchSocial(); setShowForm(false); setEditingRow(null); toast.success("Social record saved"); } });
  const upsertGov = trpc.esg.upsertGovernance.useMutation({ onSuccess: () => { refetchGov(); setShowForm(false); setEditingRow(null); toast.success("Governance record saved"); } });
  const deleteMut = trpc.esg.delete.useMutation({ onSuccess: () => { refetchEnv(); refetchSocial(); refetchGov(); toast.success("Record deleted"); } });

  const refetchAll = () => { refetchEnv(); refetchSocial(); refetchGov(); };

  const handleDelete = (tableType: "environmental" | "social" | "governance", recordId: number) => {
    if (!confirm("Delete this ESG record?")) return;
    deleteMut.mutate({ tableType, recordId });
  };

  const handleEdit = (row: any, tab: string) => {
    setActiveTab(tab);
    setEditingRow(row);
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingRow(null);
    setShowForm(true);
  };

  return (
    <div className="flex flex-col h-full">
      <ScreenHeader
        screenId={SCREEN_ID}
        title="ESG Data Entry"
        subtitle="Environmental, Social & Governance Metrics — CRUD"
        screenType="esg_data_entry"
        onAIData={() => {}}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-gray-800 bg-gray-900">
        <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(Number(v))}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2023, 2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterContract ? String(filterContract) : "all"} onValueChange={(v) => setFilterContract(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-[250px]"><SelectValue placeholder="All Contracts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contracts</SelectItem>
            {contracts.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.ref} — {c.desc}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={refetchAll}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
        <div className="flex-1" />
        <Button size="sm" onClick={handleNew}><Plus className="w-4 h-4 mr-1" />New Entry</Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        {showForm ? (
          <ESGForm
            tab={activeTab}
            editingRow={editingRow}
            contracts={contracts}
            onCancel={() => { setShowForm(false); setEditingRow(null); }}
            onSaveEnv={(data: any) => upsertEnv.mutate(data)}
            onSaveSocial={(data: any) => upsertSocial.mutate(data)}
            onSaveGov={(data: any) => upsertGov.mutate(data)}
            saving={upsertEnv.isPending || upsertSocial.isPending || upsertGov.isPending}
          />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="environmental" className="gap-1"><Leaf className="w-4 h-4" />Environmental ({envData.length})</TabsTrigger>
              <TabsTrigger value="social" className="gap-1"><Users className="w-4 h-4" />Social ({socialData.length})</TabsTrigger>
              <TabsTrigger value="governance" className="gap-1"><Shield className="w-4 h-4" />Governance ({govData.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="environmental">
              <EnvironmentalTable data={envData} onEdit={(r: any) => handleEdit(r, "environmental")} onDelete={(id: number) => handleDelete("environmental", id)} />
            </TabsContent>
            <TabsContent value="social">
              <SocialTable data={socialData} onEdit={(r: any) => handleEdit(r, "social")} onDelete={(id: number) => handleDelete("social", id)} />
            </TabsContent>
            <TabsContent value="governance">
              <GovernanceTable data={govData} onEdit={(r: any) => handleEdit(r, "governance")} onDelete={(id: number) => handleDelete("governance", id)} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

// ─── Environmental Table ────────────────────────────────────────────────────
function EnvironmentalTable({ data, onEdit, onDelete }: { data: any[]; onEdit: (r: any) => void; onDelete: (id: number) => void }) {
  if (!data.length) return <EmptyState label="No environmental records for this period." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400">
          <tr>
            <th className="px-3 py-2 text-left">Contract</th>
            <th className="px-3 py-2 text-left">Period</th>
            <th className="px-3 py-2 text-right">Scope 1 (t)</th>
            <th className="px-3 py-2 text-right">Scope 2 (t)</th>
            <th className="px-3 py-2 text-right">Scope 3 (t)</th>
            <th className="px-3 py-2 text-right">Energy (kWh)</th>
            <th className="px-3 py-2 text-right">Water (m³)</th>
            <th className="px-3 py-2 text-right">Waste (t)</th>
            <th className="px-3 py-2 text-left">Green Rating</th>
            <th className="px-3 py-2 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {data.map((r: any) => (
            <tr key={r.carbon_id} className="hover:bg-gray-900/50">
              <td className="px-3 py-2 font-medium">{r.contract_ref}</td>
              <td className="px-3 py-2">{MONTHS[(r.reporting_month || 1) - 1]} {r.reporting_year}</td>
              <td className="px-3 py-2 text-right">{num(r.scope1_tonnes)}</td>
              <td className="px-3 py-2 text-right">{num(r.scope2_tonnes)}</td>
              <td className="px-3 py-2 text-right">{num(r.scope3_tonnes)}</td>
              <td className="px-3 py-2 text-right">{num(r.energy_kwh)}</td>
              <td className="px-3 py-2 text-right">{num(r.water_m3)}</td>
              <td className="px-3 py-2 text-right">{num(r.waste_tonnes)}</td>
              <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{r.green_rating || "—"}</Badge></td>
              <td className="px-3 py-2 text-center">
                <Button variant="ghost" size="icon" onClick={() => onEdit(r)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(r.carbon_id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Social Table ───────────────────────────────────────────────────────────
function SocialTable({ data, onEdit, onDelete }: { data: any[]; onEdit: (r: any) => void; onDelete: (id: number) => void }) {
  if (!data.length) return <EmptyState label="No social records for this period." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400">
          <tr>
            <th className="px-3 py-2 text-left">Contract</th>
            <th className="px-3 py-2 text-left">Period</th>
            <th className="px-3 py-2 text-right">Workforce</th>
            <th className="px-3 py-2 text-right">H&S Incidents</th>
            <th className="px-3 py-2 text-right">Safety Score</th>
            <th className="px-3 py-2 text-right">Community Inv. (QAR)</th>
            <th className="px-3 py-2 text-right">Local Emp. %</th>
            <th className="px-3 py-2 text-right">Training Hrs</th>
            <th className="px-3 py-2 text-right">Diversity %</th>
            <th className="px-3 py-2 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {data.map((r: any) => (
            <tr key={r.social_id} className="hover:bg-gray-900/50">
              <td className="px-3 py-2 font-medium">{r.contract_ref}</td>
              <td className="px-3 py-2">{MONTHS[(r.reporting_month || 1) - 1]} {r.reporting_year}</td>
              <td className="px-3 py-2 text-right">{r.workforce_count ?? "—"}</td>
              <td className="px-3 py-2 text-right">{r.health_incidents ?? 0}</td>
              <td className="px-3 py-2 text-right">{num(r.safety_score)}</td>
              <td className="px-3 py-2 text-right">{num(r.community_investment_qar)}</td>
              <td className="px-3 py-2 text-right">{r.local_employment_pct != null ? `${Number(r.local_employment_pct).toFixed(1)}%` : "—"}</td>
              <td className="px-3 py-2 text-right">{num(r.training_hours)}</td>
              <td className="px-3 py-2 text-right">{r.diversity_pct != null ? `${Number(r.diversity_pct).toFixed(1)}%` : "—"}</td>
              <td className="px-3 py-2 text-center">
                <Button variant="ghost" size="icon" onClick={() => onEdit(r)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(r.social_id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Governance Table ───────────────────────────────────────────────────────
function GovernanceTable({ data, onEdit, onDelete }: { data: any[]; onEdit: (r: any) => void; onDelete: (id: number) => void }) {
  if (!data.length) return <EmptyState label="No governance records for this period." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400">
          <tr>
            <th className="px-3 py-2 text-left">Contract</th>
            <th className="px-3 py-2 text-left">Period</th>
            <th className="px-3 py-2 text-right">Approval Compliance</th>
            <th className="px-3 py-2 text-center">Related Party</th>
            <th className="px-3 py-2 text-right">Audit Findings</th>
            <th className="px-3 py-2 text-left">Regulatory</th>
            <th className="px-3 py-2 text-left">IFRS 16</th>
            <th className="px-3 py-2 text-right">Policy Violations</th>
            <th className="px-3 py-2 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {data.map((r: any) => (
            <tr key={r.governance_id} className="hover:bg-gray-900/50">
              <td className="px-3 py-2 font-medium">{r.contract_ref}</td>
              <td className="px-3 py-2">{MONTHS[(r.reporting_month || 1) - 1]} {r.reporting_year}</td>
              <td className="px-3 py-2 text-right">{r.approval_compliance_pct != null ? `${Number(r.approval_compliance_pct).toFixed(1)}%` : "—"}</td>
              <td className="px-3 py-2 text-center">{r.related_party_flag ? <Badge variant="destructive">Yes</Badge> : <Badge variant="outline">No</Badge>}</td>
              <td className="px-3 py-2 text-right">{r.audit_findings ?? 0}</td>
              <td className="px-3 py-2"><Badge variant={r.regulatory_compliance === "Compliant" ? "default" : "destructive"} className="text-xs">{r.regulatory_compliance || "—"}</Badge></td>
              <td className="px-3 py-2"><Badge variant={r.ifrs16_adherence === "Full" ? "default" : "secondary"} className="text-xs">{r.ifrs16_adherence || "—"}</Badge></td>
              <td className="px-3 py-2 text-right">{r.policy_violations ?? 0}</td>
              <td className="px-3 py-2 text-center">
                <Button variant="ghost" size="icon" onClick={() => onEdit(r)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(r.governance_id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── ESG Form ───────────────────────────────────────────────────────────────
function ESGForm({ tab, editingRow, contracts, onCancel, onSaveEnv, onSaveSocial, onSaveGov, saving }: any) {
  const [formTab, setFormTab] = useState(tab);
  const [contractId, setContractId] = useState(editingRow?.contract_id ? String(editingRow.contract_id) : "");
  const [year, setYear] = useState(editingRow?.reporting_year ?? new Date().getFullYear());
  const [month, setMonth] = useState(editingRow?.reporting_month ?? new Date().getMonth() + 1);

  // Environmental fields
  const [scope1, setScope1] = useState(editingRow?.scope1_tonnes ?? "");
  const [scope2, setScope2] = useState(editingRow?.scope2_tonnes ?? "");
  const [scope3, setScope3] = useState(editingRow?.scope3_tonnes ?? "");
  const [energy, setEnergy] = useState(editingRow?.energy_kwh ?? "");
  const [water, setWater] = useState(editingRow?.water_m3 ?? "");
  const [waste, setWaste] = useState(editingRow?.waste_tonnes ?? "");
  const [greenRating, setGreenRating] = useState(editingRow?.green_rating ?? "");
  const [envNotes, setEnvNotes] = useState(editingRow?.notes ?? "");

  // Social fields
  const [workforce, setWorkforce] = useState(editingRow?.workforce_count ?? "");
  const [incidents, setIncidents] = useState(editingRow?.health_incidents ?? "");
  const [safetyScore, setSafetyScore] = useState(editingRow?.safety_score ?? "");
  const [communityInv, setCommunityInv] = useState(editingRow?.community_investment_qar ?? "");
  const [localEmp, setLocalEmp] = useState(editingRow?.local_employment_pct ?? "");
  const [trainingHrs, setTrainingHrs] = useState(editingRow?.training_hours ?? "");
  const [diversity, setDiversity] = useState(editingRow?.diversity_pct ?? "");
  const [socialNotes, setSocialNotes] = useState(editingRow?.notes ?? "");

  // Governance fields
  const [approvalPct, setApprovalPct] = useState(editingRow?.approval_compliance_pct ?? "");
  const [relatedParty, setRelatedParty] = useState(editingRow?.related_party_flag ?? false);
  const [relatedDetails, setRelatedDetails] = useState(editingRow?.related_party_details ?? "");
  const [boardDate, setBoardDate] = useState(editingRow?.board_review_date ? String(editingRow.board_review_date).split("T")[0] : "");
  const [auditFindings, setAuditFindings] = useState(editingRow?.audit_findings ?? "");
  const [regCompliance, setRegCompliance] = useState(editingRow?.regulatory_compliance ?? "Compliant");
  const [ifrs16, setIfrs16] = useState(editingRow?.ifrs16_adherence ?? "Full");
  const [policyViol, setPolicyViol] = useState(editingRow?.policy_violations ?? "");
  const [govNotes, setGovNotes] = useState(editingRow?.notes ?? "");

  const handleSave = () => {
    if (!contractId) { toast.error("Please select a contract"); return; }
    const base = { contractId: Number(contractId), reportingYear: year, reportingMonth: month };

    if (formTab === "environmental") {
      onSaveEnv({
        ...base,
        carbonId: editingRow?.carbon_id,
        scope1Tonnes: scope1 !== "" ? Number(scope1) : null,
        scope2Tonnes: scope2 !== "" ? Number(scope2) : null,
        scope3Tonnes: scope3 !== "" ? Number(scope3) : null,
        energyKwh: energy !== "" ? Number(energy) : null,
        waterM3: water !== "" ? Number(water) : null,
        wasteTonnes: waste !== "" ? Number(waste) : null,
        greenRating: greenRating || null,
        notes: envNotes || null,
      });
    } else if (formTab === "social") {
      onSaveSocial({
        ...base,
        socialId: editingRow?.social_id,
        workforceCount: workforce !== "" ? Number(workforce) : null,
        healthIncidents: incidents !== "" ? Number(incidents) : null,
        safetyScore: safetyScore !== "" ? Number(safetyScore) : null,
        communityInvestmentQar: communityInv !== "" ? Number(communityInv) : null,
        localEmploymentPct: localEmp !== "" ? Number(localEmp) : null,
        trainingHours: trainingHrs !== "" ? Number(trainingHrs) : null,
        diversityPct: diversity !== "" ? Number(diversity) : null,
        notes: socialNotes || null,
      });
    } else {
      onSaveGov({
        ...base,
        governanceId: editingRow?.governance_id,
        approvalCompliancePct: approvalPct !== "" ? Number(approvalPct) : null,
        relatedPartyFlag: relatedParty,
        relatedPartyDetails: relatedDetails || null,
        boardReviewDate: boardDate || null,
        auditFindings: auditFindings !== "" ? Number(auditFindings) : null,
        regulatoryCompliance: regCompliance,
        ifrs16Adherence: ifrs16,
        policyViolations: policyViol !== "" ? Number(policyViol) : null,
        notes: govNotes || null,
      });
    }
  };

  return (
    <Card className="border-gray-800">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg">{editingRow ? "Edit ESG Record" : "New ESG Record"}</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}><X className="w-4 h-4 mr-1" />Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-4 h-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Common Fields */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label>Contract *</Label>
            <Select value={contractId} onValueChange={setContractId}>
              <SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger>
              <SelectContent>
                {contracts.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.ref} — {c.desc}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2023, 2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Tabs value={formTab} onValueChange={setFormTab}>
              <TabsList className="w-full">
                <TabsTrigger value="environmental" className="flex-1 text-xs"><Leaf className="w-3 h-3 mr-1" />Env</TabsTrigger>
                <TabsTrigger value="social" className="flex-1 text-xs"><Users className="w-3 h-3 mr-1" />Social</TabsTrigger>
                <TabsTrigger value="governance" className="flex-1 text-xs"><Shield className="w-3 h-3 mr-1" />Gov</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Environmental Fields */}
        {formTab === "environmental" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-green-400 flex items-center gap-2"><Leaf className="w-4 h-4" />Environmental Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Scope 1 Emissions (tonnes CO₂)</Label><Input type="number" step="0.01" value={scope1} onChange={e => setScope1(e.target.value)} placeholder="Direct emissions" /></div>
              <div><Label>Scope 2 Emissions (tonnes CO₂)</Label><Input type="number" step="0.01" value={scope2} onChange={e => setScope2(e.target.value)} placeholder="Indirect - electricity" /></div>
              <div><Label>Scope 3 Emissions (tonnes CO₂)</Label><Input type="number" step="0.01" value={scope3} onChange={e => setScope3(e.target.value)} placeholder="Value chain" /></div>
              <div><Label>Energy Consumption (kWh)</Label><Input type="number" step="0.01" value={energy} onChange={e => setEnergy(e.target.value)} placeholder="Total kWh" /></div>
              <div><Label>Water Usage (m³)</Label><Input type="number" step="0.01" value={water} onChange={e => setWater(e.target.value)} placeholder="Cubic metres" /></div>
              <div><Label>Waste Generated (tonnes)</Label><Input type="number" step="0.01" value={waste} onChange={e => setWaste(e.target.value)} placeholder="Total waste" /></div>
              <div>
                <Label>Green Building Rating</Label>
                <Select value={greenRating || "none_selected"} onValueChange={(v) => setGreenRating(v === "none_selected" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none_selected">No Rating</SelectItem>
                    {GREEN_RATINGS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea value={envNotes} onChange={e => setEnvNotes(e.target.value)} placeholder="Additional environmental notes..." rows={2} /></div>
          </div>
        )}

        {/* Social Fields */}
        {formTab === "social" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2"><Users className="w-4 h-4" />Social Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Workforce Count</Label><Input type="number" value={workforce} onChange={e => setWorkforce(e.target.value)} placeholder="Headcount at location" /></div>
              <div><Label>Health & Safety Incidents</Label><Input type="number" value={incidents} onChange={e => setIncidents(e.target.value)} placeholder="Number of incidents" /></div>
              <div><Label>Safety Score (0-100)</Label><Input type="number" step="0.1" min="0" max="100" value={safetyScore} onChange={e => setSafetyScore(e.target.value)} placeholder="Score" /></div>
              <div><Label>Community Investment (QAR)</Label><Input type="number" step="0.01" value={communityInv} onChange={e => setCommunityInv(e.target.value)} placeholder="Amount in QAR" /></div>
              <div><Label>Local Employment %</Label><Input type="number" step="0.1" min="0" max="100" value={localEmp} onChange={e => setLocalEmp(e.target.value)} placeholder="% local hires" /></div>
              <div><Label>Training Hours</Label><Input type="number" step="0.5" value={trainingHrs} onChange={e => setTrainingHrs(e.target.value)} placeholder="Total hours" /></div>
              <div><Label>Diversity %</Label><Input type="number" step="0.1" min="0" max="100" value={diversity} onChange={e => setDiversity(e.target.value)} placeholder="% diverse workforce" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={socialNotes} onChange={e => setSocialNotes(e.target.value)} placeholder="Additional social notes..." rows={2} /></div>
          </div>
        )}

        {/* Governance Fields */}
        {formTab === "governance" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2"><Shield className="w-4 h-4" />Governance Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Approval Compliance %</Label><Input type="number" step="0.1" min="0" max="100" value={approvalPct} onChange={e => setApprovalPct(e.target.value)} placeholder="% compliant approvals" /></div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={relatedParty} onCheckedChange={setRelatedParty} />
                <Label>Related Party Transaction</Label>
              </div>
              {relatedParty && <div><Label>Related Party Details</Label><Input value={relatedDetails} onChange={e => setRelatedDetails(e.target.value)} placeholder="Describe relationship" /></div>}
              <div><Label>Board Review Date</Label><Input type="date" value={boardDate} onChange={e => setBoardDate(e.target.value)} /></div>
              <div><Label>Audit Findings</Label><Input type="number" value={auditFindings} onChange={e => setAuditFindings(e.target.value)} placeholder="Number of findings" /></div>
              <div>
                <Label>Regulatory Compliance</Label>
                <Select value={regCompliance} onValueChange={setRegCompliance}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPLIANCE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>IFRS 16 Adherence</Label>
                <Select value={ifrs16} onValueChange={setIfrs16}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IFRS16_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Policy Violations</Label><Input type="number" value={policyViol} onChange={e => setPolicyViol(e.target.value)} placeholder="Number of violations" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={govNotes} onChange={e => setGovNotes(e.target.value)} placeholder="Additional governance notes..." rows={2} /></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function num(v: any) { return v != null ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"; }
function EmptyState({ label }: { label: string }) {
  return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">{label}</div>;
}
