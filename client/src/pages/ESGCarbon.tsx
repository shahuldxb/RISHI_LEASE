import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { GenAIFillButton } from "@/components/GenAIFillButton";

export default function ESGCarbon() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ contractId: "", reportingPeriod: "", carbonKg: "", energyKwh: "", waterM3: "", wasteKg: "", renewablePercent: "" });
  const [aiRows, setAiRows] = useState<any[]>([]);
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setShowForm(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const { data: records = [], refetch } = trpc.esgCarbon.list.useQuery();
  const { data: contractsData } = trpc.lease.getLeaseRegister.useQuery({ status: "Active" });
  const contracts = (contractsData as any)?.rows ?? [];
  // Auto-select first contract when data loads
  useEffect(() => {
    if (contracts.length > 0 && !form.contractId) {
      setForm((f: any) => ({ ...f, contractId: String(contracts[0].contract_id) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts.length]);
  const save = trpc.esgCarbon.upsert.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("ESG record saved"); }, onError: (e: any) => toast.error(e.message) });

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">Log ESG Carbon Data</h2>
              <p className="text-sm text-muted-foreground">Record carbon footprint and sustainability metrics for a property</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="esg_carbon"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          reportingPeriod: data.reportingPeriod ?? f.reportingPeriod,
                          carbonKg: data.carbonKg ? String(data.carbonKg) : f.carbonKg,
                          energyKwh: data.energyKwh ? String(data.energyKwh) : f.energyKwh,
                          waterM3: data.waterM3 ? String(data.waterM3) : f.waterM3,
                          wasteKg: data.wasteKg ? String(data.wasteKg) : f.wasteKg,
                          renewablePercent: data.renewablePercent ? String(data.renewablePercent) : f.renewablePercent,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div><Label>Contract</Label>
                <Select value={form.contractId} onValueChange={v => setForm((f: any) => ({ ...f, contractId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select contract" /></SelectTrigger>
                  <SelectContent>{contracts.map((c: any) => <SelectItem key={c.contract_id} value={String(c.contract_id)}>{c.property_name ?? c.contract_id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Reporting Period (YYYY-MM)</Label><Input className="mt-1" placeholder="2024-01" value={form.reportingPeriod} onChange={e => setForm((f: any) => ({ ...f, reportingPeriod: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Carbon Emissions (kg CO₂)</Label><Input className="mt-1" type="number" value={form.carbonKg} onChange={e => setForm((f: any) => ({ ...f, carbonKg: e.target.value }))} /></div>
                <div><Label>Energy Consumption (kWh)</Label><Input className="mt-1" type="number" value={form.energyKwh} onChange={e => setForm((f: any) => ({ ...f, energyKwh: e.target.value }))} /></div>
                <div><Label>Water Usage (m³)</Label><Input className="mt-1" type="number" value={form.waterM3} onChange={e => setForm((f: any) => ({ ...f, waterM3: e.target.value }))} /></div>
                <div><Label>Waste Generated (kg)</Label><Input className="mt-1" type="number" value={form.wasteKg} onChange={e => setForm((f: any) => ({ ...f, wasteKg: e.target.value }))} /></div>
                <div><Label>Renewable Energy (%)</Label><Input className="mt-1" type="number" min="0" max="100" value={form.renewablePercent} onChange={e => setForm((f: any) => ({ ...f, renewablePercent: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={save.isPending}
                  onClick={() => save.mutate({ contract_id: Number(form.contractId), reporting_year: Number((form.reportingPeriod || '2024-01').split('-')[0]), reporting_month: Number((form.reportingPeriod || '2024-01').split('-')[1]), scope1_tonnes: Number(form.carbonKg), scope2_tonnes: Number(form.energyKwh), scope3_tonnes: Number(form.waterM3) })}>
                  {save.isPending ? "Saving..." : "Save ESG Data"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFLESGCRB0001P001"
          title="ESG Carbon Tracker"
          subtitle="Carbon footprint and sustainability metrics"
          screenType="esg_carbon"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={() => setShowForm(true)} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Contract</TableHead><TableHead>Period</TableHead><TableHead>Carbon (kg)</TableHead><TableHead>Energy (kWh)</TableHead><TableHead>Water (m³)</TableHead><TableHead>Renewable %</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(records as any[]).map((r: any) => (
                <TableRow key={r.esg_id}>
                  <TableCell>{r.contract_id}</TableCell>
                  <TableCell>{r.reporting_period}</TableCell>
                  <TableCell>{Number(r.carbon_kg).toLocaleString()}</TableCell>
                  <TableCell>{Number(r.energy_kwh).toLocaleString()}</TableCell>
                  <TableCell>{Number(r.water_m3).toLocaleString()}</TableCell>
                  <TableCell>{r.renewable_percent}%</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setForm({ contractId: String(r.contract_id), reportingPeriod: r.reporting_period ?? '', carbonKg: String(r.carbon_kg ?? ''), energyKwh: String(r.energy_kwh ?? ''), waterM3: String(r.water_m3 ?? ''), wasteKg: String(r.waste_kg ?? ''), renewablePercent: String(r.renewable_percent ?? '') }); setShowForm(true); }}><Pencil className="w-4 h-4 text-blue-400" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => toast.success('ESG record deleted')}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {(records as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No ESG data recorded yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>
    
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
