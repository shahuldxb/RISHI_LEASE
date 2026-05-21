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

export default function LessorFinanceLease() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ lessorId: "", contractId: "", financeType: "Operating Lease", facilityAmount: "", currency: "QAR", interestRate: "", maturityDate: "", lender: "" });
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
  const actionMut = trpc.system.notifyOwner.useMutation({ onSuccess: () => { setShowForm(false); toast.success("Finance lease submitted for review"); }, onError: (e: any) => toast.error(e.message) });
  const { data: lessorsData } = trpc.lessor.getLessors.useQuery({});
  const lessors: any[] = (lessorsData as any)?.lessors ?? [];
  // Auto-select first lessor when data loads
  useEffect(() => {
    if (lessors.length > 0 && !form.lessorId) {
      setForm((f: any) => ({ ...f, lessorId: String(lessors[0].lessor_id) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessors.length]);

  const records = [
    { id: 1, lessor: "Al Futtaim Properties", type: "Finance Lease", amount: "25,000,000", currency: "QAR", rate: "4.5%", maturity: "2028-12-31", status: "Active" },
    { id: 2, lessor: "Emaar Properties", type: "Operating Lease", amount: "12,500,000", currency: "QAR", rate: "3.8%", maturity: "2026-06-30", status: "Active" },
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
              <h2 className="font-semibold text-lg">New Lessor Finance Lease</h2>
              <p className="text-sm text-muted-foreground">Record a finance lease facility for a lessor</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="lessor_finance_lease"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          financeType: data.financeType ?? f.financeType,
                          facilityAmount: data.facilityAmount ? String(data.facilityAmount) : f.facilityAmount,
                          currency: data.currency ?? f.currency,
                          interestRate: data.interestRate ? String(data.interestRate) : f.interestRate,
                          maturityDate: data.maturityDate ?? f.maturityDate,
                          lender: data.lender ?? f.lender,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div><Label>Lessor</Label>
                <Select value={form.lessorId} onValueChange={v => setForm((f: any) => ({ ...f, lessorId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select lessor" /></SelectTrigger>
                  <SelectContent>{(lessors as any[]).map((l: any) => <SelectItem key={l.lessor_id} value={String(l.lessor_id)}>{l.lessor_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Finance Type</Label>
                <Select value={form.financeType} onValueChange={v => setForm((f: any) => ({ ...f, financeType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Operating Lease","Finance Lease","Sale and Leaseback","Mortgage"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Lender</Label><Input className="mt-1" value={form.lender} onChange={e => setForm((f: any) => ({ ...f, lender: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Facility Amount</Label><Input className="mt-1" type="number" value={form.facilityAmount} onChange={e => setForm((f: any) => ({ ...f, facilityAmount: e.target.value }))} /></div>
                <div><Label>Currency</Label>
                  <Select value={form.currency} onValueChange={v => setForm((f: any) => ({ ...f, currency: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["QAR","USD","EUR","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Interest Rate (%)</Label><Input className="mt-1" type="number" step="0.01" value={form.interestRate} onChange={e => setForm((f: any) => ({ ...f, interestRate: e.target.value }))} /></div>
                <div><Label>Maturity Date</Label><Input className="mt-1" type="date" value={form.maturityDate} onChange={e => setForm((f: any) => ({ ...f, maturityDate: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={actionMut.isPending}
                  onClick={() => actionMut.mutate({ title: "New Lessor Finance Lease", content: JSON.stringify(form) })}>
                  {actionMut.isPending ? "Saving..." : "Submit"}
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
          screenId="VFLLESFIN0001P001"
          title="Lessor Finance Lease"
          subtitle="Finance lease facilities and funding structures for lessors"
          screenType="lessor_finance_lease"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={() => setShowForm(true)} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Lessor</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Rate</TableHead><TableHead>Maturity</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.lessor}</TableCell>
                  <TableCell>{r.type}</TableCell>
                  <TableCell>{r.currency} {r.amount}</TableCell>
                  <TableCell>{r.rate}</TableCell>
                  <TableCell>{r.maturity}</TableCell>
                  <TableCell><Badge className="bg-green-500/20 text-green-400">{r.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-blue-400" onClick={() => { setForm((f: any) => ({ ...f, lessor: r.lessor, type: r.type, currency: r.currency, amount: r.amount, rate: r.rate, maturity: r.maturity?.slice(0,10) ?? "" })); setShowForm(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-400" onClick={() => toast("Remove this facility?", { action: { label: "Remove", onClick: () => toast.success("Facility removed") } })}><Trash2 className="w-3.5 h-3.5" /></Button>
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
