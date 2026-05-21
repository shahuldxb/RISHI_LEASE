import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { GenAIFillButton } from "@/components/GenAIFillButton";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const ASSET_TYPES = ["OFFICE","RETAIL","WAREHOUSE","DATA_CENTRE","PARKING","OTHER"];
const PRIORITIES = ["LOW","MEDIUM","HIGH","CRITICAL"];
const CURRENCIES = ["QAR","USD","EUR","GBP","SAR"];
const INIT = { lessor_name: "", asset_description: "", asset_type: "OFFICE", proposed_start: "", proposed_end: "", estimated_annual_rent: 0, currency: "QAR", business_justification: "", priority: "MEDIUM" as const };

export default function LeaseOrigination() {
  const [open, setOpen] = useState(false);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ ...INIT });
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setOpen(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const { data: requests = [], refetch } = trpc.leaseOrigination.list.useQuery();
  const createMut = trpc.leaseOrigination.create.useMutation({ onSuccess: () => { refetch(); setOpen(false); toast.success("Origination request submitted"); }, onError: (e) => toast.error(e.message) });
  const displayRows = aiRows.length > 0 ? aiRows : (requests as any[]);

  const priorityColor: Record<string, string> = { LOW: "bg-gray-500", MEDIUM: "bg-blue-500", HIGH: "bg-amber-500", CRITICAL: "bg-red-600" };

  return (
    <DashboardLayout>
      {open ? (
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><ArrowLeft className="w-5 h-5" /></Button>
              <div><h2 className="text-lg font-semibold">New Lease Origination Request</h2><p className="text-xs text-muted-foreground">Submit a new lease requirement for approval</p></div>
            </div>
            <div className="flex gap-2">
              <GenAIFillButton formType="lease_origination" onFill={(data) => setForm(f => ({
                ...f,
                lessor_name: data.lessorName ? String(data.lessorName) : f.lessor_name,
                asset_description: data.assetDescription ? String(data.assetDescription) : f.asset_description,
                asset_type: data.assetType ? String(data.assetType) : f.asset_type,
                proposed_start: data.proposedStart ? String(data.proposedStart) : f.proposed_start,
                proposed_end: data.proposedEnd ? String(data.proposedEnd) : f.proposed_end,
                estimated_annual_rent: data.estimatedAnnualRent ? Number(data.estimatedAnnualRent) : f.estimated_annual_rent,
                business_justification: data.businessJustification ? String(data.businessJustification) : f.business_justification,
              }))} />
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={createMut.isPending} onClick={() => createMut.mutate(form as any)}>{createMut.isPending ? "Submitting..." : "Submit Request"}</Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-2xl mx-auto grid grid-cols-2 gap-5">
              <div className="col-span-2"><Label className="text-xs text-muted-foreground">Lessor / Landlord Name</Label><Input className="mt-1" value={form.lessor_name} onChange={e => setForm(f => ({ ...f, lessor_name: e.target.value }))} /></div>
              <div className="col-span-2"><Label className="text-xs text-muted-foreground">Asset Description</Label><Input className="mt-1" value={form.asset_description} onChange={e => setForm(f => ({ ...f, asset_description: e.target.value }))} /></div>
              <div><Label className="text-xs text-muted-foreground">Asset Type</Label>
                <Select value={form.asset_type} onValueChange={v => setForm(f => ({ ...f, asset_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={form.priority} onValueChange={(v: any) => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs text-muted-foreground">Proposed Start</Label><Input type="date" className="mt-1" value={form.proposed_start} onChange={e => setForm(f => ({ ...f, proposed_start: e.target.value }))} /></div>
              <div><Label className="text-xs text-muted-foreground">Proposed End</Label><Input type="date" className="mt-1" value={form.proposed_end} onChange={e => setForm(f => ({ ...f, proposed_end: e.target.value }))} /></div>
              <div><Label className="text-xs text-muted-foreground">Estimated Annual Rent</Label><Input type="number" step="0.01" className="mt-1" value={form.estimated_annual_rent} onChange={e => setForm(f => ({ ...f, estimated_annual_rent: Number(e.target.value) }))} /></div>
              <div><Label className="text-xs text-muted-foreground">Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label className="text-xs text-muted-foreground">Business Justification</Label><Textarea className="mt-1" rows={4} value={form.business_justification} onChange={e => setForm(f => ({ ...f, business_justification: e.target.value }))} /></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          <ScreenHeader screenId="VFLLSEORG0001P001" title="Lease Origination" subtitle="New lease requests, approvals and pipeline management"
            screenType="lease_origination" onAIData={(rows) => setAiRows(rows)}
            actions={<Button size="sm" onClick={() => { setForm({ ...INIT }); setOpen(true); }}><Plus className="w-4 h-4 mr-1" />New Request</Button>} />
          <Card><CardContent className="p-0"><Table>
            <TableHeader><TableRow><TableHead>Lessor</TableHead><TableHead>Asset</TableHead><TableHead>Type</TableHead><TableHead>Priority</TableHead><TableHead>Proposed Start</TableHead><TableHead className="text-right">Est. Annual Rent</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {displayRows.map((r: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.lessor_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.asset_description}</TableCell>
                  <TableCell><Badge variant="outline">{r.asset_type}</Badge></TableCell>
                  <TableCell><Badge className={`${priorityColor[r.priority] ?? "bg-gray-500"} text-white text-xs`}>{r.priority}</Badge></TableCell>
                  <TableCell className="text-sm">{r.proposed_start?.slice(0,10)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.currency} {Number(r.estimated_annual_rent ?? 0).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="secondary">{r.status ?? "PENDING"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-blue-400" onClick={() => { setForm({ lessor_name: r.lessor_name ?? "", asset_description: r.asset_description ?? "", asset_type: r.asset_type ?? "OFFICE", proposed_start: r.proposed_start?.slice(0,10) ?? "", proposed_end: r.proposed_end?.slice(0,10) ?? "", estimated_annual_rent: r.estimated_annual_rent ?? 0, currency: r.currency ?? "QAR", business_justification: r.business_justification ?? "", priority: r.priority ?? "MEDIUM" }); setOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-400" onClick={() => toast("Remove this request?", { action: { label: "Remove", onClick: () => toast.success("Request removed") } })}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {displayRows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No origination requests. Click New Request to submit one.</TableCell></TableRow>}
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
