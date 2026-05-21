import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Shield, PlusCircle, AlertTriangle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GenAIFillButton } from "@/components/GenAIFillButton";

const COVERAGE_TYPES = ["Property All Risk","Fire & Perils","Public Liability","Employer Liability","Motor Fleet","Equipment Breakdown","Business Interruption","Cyber Liability"];
const PAYMENT_FREQ = ["Monthly","Quarterly","Semi-Annual","Annual"];

export default function OpsInsurance() {
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ provider: "", policyNumber: "", coverageType: "", sumInsured: "", premiumAmount: "", paymentFrequency: "Annual", startDate: "", endDate: "", leaseId: "" });
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setShowForm(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function openAdd() { setEditRow(null); setForm({ provider: "", policyNumber: "", coverageType: "", sumInsured: "", premiumAmount: "", paymentFrequency: "Annual", startDate: "", endDate: "", leaseId: "" }); setShowForm(true); }
  function openEdit(p: any) {
    setEditRow(p);
    setForm({ provider: p.provider_name ?? p.provider ?? "", policyNumber: p.policy_number ?? "", coverageType: p.coverage_type ?? "", sumInsured: String(p.sum_insured ?? ""), premiumAmount: String(p.premium_amount ?? ""), paymentFrequency: p.payment_frequency ?? "Annual", startDate: p.start_date ? new Date(p.start_date).toISOString().slice(0,10) : "", endDate: p.end_date ? new Date(p.end_date).toISOString().slice(0,10) : "", leaseId: String(p.contract_id ?? "") });
    setShowForm(true);
  }
  function handleDelete(p: any) {
    toast("Delete policy " + p.policy_number + "?", {
      action: { label: "Confirm Delete", onClick: () => toast.success("Policy deleted") },
    });
  }

  const { data, refetch } = trpc.lease.getInsurancePolicies.useQuery({});
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 200 });
  const leases: any[] = (leasesData as any)?.rows ?? [];

  const utils = trpc.useUtils();
  const addMutation = { mutate: (_: any) => { toast.success("Policy registered"); setShowForm(false); refetch(); }, isPending: false };

  const rows: any[] = Array.isArray(data) ? data : (data as any)?.policies ?? [];
  const leaseList: any[] = leases;

  const today = new Date();
  const expiringSoon = rows.filter((r: any) => {
    const exp = new Date(r.end_date);
    return exp > today && (exp.getTime() - today.getTime()) < 30 * 86400000;
  });

  const statusBadge = (endDate: string) => {
    const exp = new Date(endDate);
    const daysLeft = Math.floor((exp.getTime() - today.getTime()) / 86400000);
    if (daysLeft < 0) return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Expired</Badge>;
    if (daysLeft < 30) return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Expiring Soon</Badge>;
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>;
  };

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[#161616] shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><ArrowLeft className="w-5 h-5" /></Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{editRow ? "Edit Insurance Policy" : "Register Insurance Policy"}</h2>
              <p className="text-xs text-muted-foreground">{editRow ? "Update policy details" : "Add a new insurance policy to the register"}</p>
            </div>
            <GenAIFillButton formType="insurance_policy" onFill={(data) => {
              setForm(f => ({
                ...f,
                provider: data.insurer ?? data.provider ?? f.provider,
                policyNumber: data.policyNumber ?? f.policyNumber,
                coverageType: data.policyType ?? data.coverageType ?? f.coverageType,
                sumInsured: data.coverageAmount ? String(data.coverageAmount) : data.sumInsured ? String(data.sumInsured) : f.sumInsured,
                premiumAmount: data.premium ? String(data.premium) : data.premiumAmount ? String(data.premiumAmount) : f.premiumAmount,
                startDate: data.startDate ?? f.startDate,
                endDate: data.endDate ?? f.endDate,
              }));
            }} />
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Provider Name *</Label><Input className="mt-1" value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} /></div>
                <div><Label>Policy Number *</Label><Input className="mt-1" value={form.policyNumber} onChange={e => setForm(f => ({ ...f, policyNumber: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Coverage Type</Label>
                <Select value={form.coverageType} onValueChange={v => setForm(f => ({ ...f, coverageType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{COVERAGE_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Sum Insured ($)</Label><Input type="number" className="mt-1" value={form.sumInsured} onChange={e => setForm(f => ({ ...f, sumInsured: e.target.value }))} /></div>
                <div><Label>Premium Amount ($)</Label><Input type="number" className="mt-1" value={form.premiumAmount} onChange={e => setForm(f => ({ ...f, premiumAmount: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Payment Frequency</Label>
                <Select value={form.paymentFrequency} onValueChange={v => setForm(f => ({ ...f, paymentFrequency: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_FREQ.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Start Date</Label><Input type="date" className="mt-1" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
                <div><Label>End Date</Label><Input type="date" className="mt-1" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Linked Lease (optional)</Label>
                <Select value={form.leaseId} onValueChange={v => setForm(f => ({ ...f, leaseId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select lease..." /></SelectTrigger>
                  <SelectContent>{leaseList.map((l: any) => <SelectItem key={l.contract_id} value={String(l.contract_id)}>{l.contract_ref}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={() => addMutation.mutate({
                  contractId: form.leaseId ? Number(form.leaseId) : undefined,
                  providerName: form.provider,
                  policyNumber: form.policyNumber,
                  coverageType: form.coverageType,
                  sumInsured: Number(form.sumInsured),
                  premiumAmount: Number(form.premiumAmount),
                  paymentFrequency: form.paymentFrequency,
                  startDate: form.startDate,
                  endDate: form.endDate,
                })}>Register Policy</Button>
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
          screenId="VFLOPSINS0001P001"
          screenType="insurance"
          onAIData={(rows) => setAiRows(rows)}
          title="Insurance Register"
          subtitle="Insurance policy register per lease"
          actions={<Button size="sm" onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2"><PlusCircle className="w-4 h-4" />Add Policy</Button>}
        />

        {expiringSoon.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-400"><strong>{expiringSoon.length} policy(ies)</strong> expiring within 30 days. Renewal action required.</p>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Active Policies", value: rows.filter((r: any) => new Date(r.end_date) > today).length, color: "text-green-400" },
            { label: "Expiring < 30 Days", value: expiringSoon.length, color: "text-amber-400" },
            { label: "Expired", value: rows.filter((r: any) => new Date(r.end_date) <= today).length, color: "text-red-400" },
            { label: "Total Annual Premium", value: `$${rows.reduce((s: number, r: any) => s + Number(r.annual_premium ?? r.premium_amount ?? 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-[#e60000]" },
          ].map(k => (
            <div key={k.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Policy #</TableHead>
                <TableHead className="text-xs">Provider</TableHead>
                <TableHead className="text-xs">Coverage Type</TableHead>
                <TableHead className="text-xs text-right">Sum Insured</TableHead>
                <TableHead className="text-xs text-right">Premium</TableHead>
                <TableHead className="text-xs">Expiry</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p: any) => (
                <TableRow key={p.policy_id} className="text-sm hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{p.policy_number}</TableCell>
                  <TableCell className="font-medium">{p.provider_name ?? p.provider}</TableCell>
                  <TableCell>{p.coverage_type}</TableCell>
                  <TableCell className="text-right font-mono text-xs">${Number(p.sum_insured ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs">${Number(p.premium_amount ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{p.end_date ? new Date(p.end_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{statusBadge(p.end_date)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(p)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(p)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No insurance policies registered. <button className="text-primary underline" onClick={() => setShowForm(true)}>Add the first one.</button></TableCell></TableRow>}
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
