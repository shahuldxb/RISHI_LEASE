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

export default function LeaseDataQuality() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({ ruleName: "", ruleType: "Completeness", severity: "Warning", description: "" });
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
  const actionMut = trpc.system.notifyOwner.useMutation({ onSuccess: () => { setShowForm(false); toast.success("Quality rule submitted"); }, onError: (e: any) => toast.error(e.message) });

  const rules = [
    { id: 1, name: "Missing Commencement Date", type: "Completeness", severity: "Error", affected: 3, status: "Open" },
    { id: 2, name: "Duplicate Contract Reference", type: "Uniqueness", severity: "Warning", affected: 1, status: "Open" },
    { id: 3, name: "Negative Rent Amount", type: "Validity", severity: "Error", affected: 0, status: "Resolved" },
    { id: 4, name: "Missing Lessor Contact", type: "Completeness", severity: "Warning", affected: 7, status: "Open" },
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
              <h2 className="font-semibold text-lg">{editId ? "Edit Quality Rule" : "Add Quality Rule"}</h2>
              <p className="text-sm text-muted-foreground">Define a new data quality validation rule</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="lease_data_quality"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          ruleName: data.ruleName ?? f.ruleName,
                          ruleType: data.ruleType ?? f.ruleType,
                          severity: data.severity ?? f.severity,
                          description: data.description ?? f.description,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div><Label>Rule Name *</Label><Input className="mt-1" value={form.ruleName} onChange={e => setForm((f: any) => ({ ...f, ruleName: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Rule Type</Label>
                  <Select value={form.ruleType} onValueChange={v => setForm((f: any) => ({ ...f, ruleType: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Completeness","Uniqueness","Validity","Consistency","Timeliness"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Severity</Label>
                  <Select value={form.severity} onValueChange={v => setForm((f: any) => ({ ...f, severity: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Error","Warning","Info"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Description</Label><Input className="mt-1" value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={actionMut.isPending}
                  onClick={() => actionMut.mutate({ title: "New Quality Rule: " + form.ruleName, content: JSON.stringify(form) })}>
                  {actionMut.isPending ? "Saving..." : "Add Rule"}
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
          screenId="VFLLEADQ0001P001"
          title="Lease Data Quality"
          subtitle="Abstraction quality scoring and duplicate detection"
          screenType="lease_data_quality"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={() => setShowForm(true)} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Rule Name</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Affected Records</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.type}</TableCell>
                  <TableCell><Badge className={r.severity === "Error" ? "bg-red-500/20 text-red-400" : r.severity === "Warning" ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"}>{r.severity}</Badge></TableCell>
                  <TableCell>{r.affected}</TableCell>
                  <TableCell><Badge className={r.status === "Open" ? "bg-orange-500/20 text-orange-400" : "bg-green-500/20 text-green-400"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-blue-400" onClick={() => { setEditId(r.id); setForm({ ruleName: r.name, ruleType: r.type, severity: r.severity, description: "" }); setShowForm(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-400" onClick={() => toast("Remove this rule?", { action: { label: "Remove", onClick: () => toast.success("Rule removed") } })}><Trash2 className="w-3.5 h-3.5" /></Button>
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
