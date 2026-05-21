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

export default function TenantPortal() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ requestType: "Maintenance", subject: "", description: "", priority: "Medium", contractId: "" });
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
  const utils = trpc.useUtils();
  const actionMut = trpc.system.notifyOwner.useMutation({ onSuccess: () => { setShowForm(false); toast.success("Request submitted successfully"); }, onError: (e: any) => toast.error(e.message) });
  const { data: contractsData } = trpc.lease.getLeaseRegister.useQuery({ status: "Active" });
  const contracts = (contractsData as any)?.rows ?? [];

  const requests = [
    { id: 1, type: "Maintenance", subject: "AC unit not working", priority: "High", contract: "Villa 12B", status: "Open", date: "2024-01-15" },
    { id: 2, type: "Document", subject: "Request NOC letter", priority: "Medium", contract: "Office 5A", status: "Resolved", date: "2024-01-10" },
    { id: 3, type: "Payment", subject: "Rent receipt for January", priority: "Low", contract: "Apartment 3C", status: "Resolved", date: "2024-01-08" },
  ];

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">New Tenant Request</h2>
              <p className="text-sm text-muted-foreground">Submit a maintenance, document, or service request</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="tenant_request"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          requestType: data.requestType ?? f.requestType,
                          subject: data.subject ?? f.subject,
                          description: data.description ?? f.description,
                          priority: data.priority ?? f.priority,
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
              <div><Label>Request Type</Label>
                <Select value={form.requestType} onValueChange={v => setForm((f: any) => ({ ...f, requestType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Maintenance","Document","Payment","Complaint","General"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Subject *</Label><Input className="mt-1" value={form.subject} onChange={e => setForm((f: any) => ({ ...f, subject: e.target.value }))} /></div>
              <div><Label>Description</Label><Input className="mt-1" value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
              <div><Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm((f: any) => ({ ...f, priority: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Low","Medium","High","Urgent"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={actionMut.isPending}
                  onClick={() => actionMut.mutate({ title: `Tenant Request: ${form.subject}`, content: JSON.stringify(form) })}>
                  {actionMut.isPending ? "Submitting..." : "Submit Request"}
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
          screenId="VFLTENPTL0001P001"
          title="Tenant Portal"
          subtitle="Tenant service requests and communications"
          screenType="tenant_portal"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={() => setShowForm(true)} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Type</TableHead><TableHead>Subject</TableHead><TableHead>Contract</TableHead><TableHead>Priority</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.type}</TableCell>
                  <TableCell>{r.subject}</TableCell>
                  <TableCell>{r.contract}</TableCell>
                  <TableCell><Badge className={r.priority === "High" || r.priority === "Urgent" ? "bg-red-500/20 text-red-400" : r.priority === "Medium" ? "bg-amber-500/20 text-amber-400" : "bg-gray-500/20 text-gray-400"}>{r.priority}</Badge></TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell><Badge className={r.priority === "High" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}>{r.priority}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-blue-400" onClick={() => { setForm((f: any) => ({ ...f, type: r.type, subject: r.subject, description: r.subject, priority: r.priority })); setShowForm(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-400" onClick={() => toast("Remove this request?", { action: { label: "Remove", onClick: () => toast.success("Request removed") } })}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
