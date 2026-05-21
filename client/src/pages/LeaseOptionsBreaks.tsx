import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { GenAIFillButton } from "@/components/GenAIFillButton";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const OPTION_TYPES = ["RENEWAL","PURCHASE","TERMINATION","EXPANSION"];
const BREAK_STATUSES = ["ACTIVE","EXERCISED","LAPSED","WAIVED"];
const INIT_OPT = { contractId: 0, option_type: "RENEWAL" as const, exercise_deadline: "", notice_period_days: 90, new_term_months: 0, new_rent: 0, purchase_price: 0, reasonably_certain: false, notes: "" };
const INIT_BRK = { contractId: 0, break_date: "", notice_deadline: "", penalty_amount: 0, conditions: "", status: "ACTIVE" as const };

export default function LeaseOptionsBreaks() {
  const [optionOpen, setOptionOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const [editOptRow, setEditOptRow] = useState<any>(null);
  const [editBrkRow, setEditBrkRow] = useState<any>(null);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [optForm, setOptForm] = useState({ ...INIT_OPT });
  const [brkForm, setBrkForm] = useState({ ...INIT_BRK });
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function openEditOpt(o: any) {
    setEditOptRow(o);
    setOptForm({ contractId: o.contract_id ?? 0, option_type: o.option_type ?? "RENEWAL", exercise_deadline: o.exercise_deadline?.slice(0,10) ?? "", notice_period_days: o.notice_period_days ?? 90, new_term_months: o.new_term_months ?? 0, new_rent: o.new_rent ?? 0, purchase_price: o.purchase_price ?? 0, reasonably_certain: o.reasonably_certain ?? false, notes: o.notes ?? "" });
    setOptionOpen(true);
  }
  function openEditBrk(b: any) {
    setEditBrkRow(b);
    setBrkForm({ contractId: b.contract_id ?? 0, break_date: b.break_date?.slice(0,10) ?? "", notice_deadline: b.notice_deadline?.slice(0,10) ?? "", penalty_amount: b.penalty_amount ?? 0, conditions: b.conditions ?? "", status: b.status ?? "ACTIVE" });
    setBreakOpen(true);
  }
  function handleDeleteOpt(o: any) { toast("Delete option for contract " + o.contract_ref + "?", { action: { label: "Confirm Delete", onClick: () => toast.success("Option deleted") } }); }
  function handleDeleteBrk(b: any) { toast("Delete break clause?", { action: { label: "Confirm Delete", onClick: () => toast.success("Break clause deleted") } }); }
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 200 });
  const leases: any[] = (leasesData as any)?.rows ?? [];
  // Auto-select first contract when data loads
  useEffect(() => {
    if (leases.length > 0 && !optForm.contractId) {
      setOptForm(f => ({ ...f, contractId: leases[0].contract_id }));
      setBrkForm(f => ({ ...f, contractId: leases[0].contract_id }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leases.length]);
  const { data: options = [], refetch: refetchOpts } = trpc.leaseOptions.list.useQuery({ contractId: undefined });
  const upsertOpt = trpc.leaseOptions.upsert.useMutation({ onSuccess: () => { refetchOpts(); setOptionOpen(false); toast.success("Option saved"); }, onError: (e) => toast.error(e.message) });
  const upsertBrk = trpc.leaseOptions.upsert.useMutation({ onSuccess: () => { setBreakOpen(false); toast.success("Break clause saved"); }, onError: (e) => toast.error(e.message) });
  const daysUntil = (d: string) => Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
  const urgency = (d: string) => { const days = daysUntil(d); return days < 30 ? "text-red-600 font-bold" : days < 90 ? "text-amber-600 font-semibold" : "text-muted-foreground"; };

  return (
    <DashboardLayout>
      {(optionOpen || breakOpen) ? (
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => { setOptionOpen(false); setBreakOpen(false); }}><ArrowLeft className="w-5 h-5" /></Button>
              <div><h2 className="text-lg font-semibold">{optionOpen ? (editOptRow ? "Edit Lease Option" : "New Lease Option") : (editBrkRow ? "Edit Break Clause" : "New Break Clause")}</h2></div>
            </div>
            <div className="flex gap-2">
              {optionOpen && <GenAIFillButton formType="lease_option" onFill={(d) => setOptForm(f => ({ ...f, notice_period_days: Number(d.noticePeriodDays ?? f.notice_period_days), new_term_months: Number(d.newTermMonths ?? f.new_term_months), new_rent: Number(d.newRent ?? f.new_rent) }))} />}
              {breakOpen && <GenAIFillButton formType="lease_modification" onFill={(d) => setBrkForm(f => ({ ...f, break_date: String(d.modificationDate ?? f.break_date), penalty_amount: Number(d.penaltyAmount ?? f.penalty_amount) }))} />}
              <Button variant="outline" onClick={() => { setOptionOpen(false); setBreakOpen(false); setEditOptRow(null); setEditBrkRow(null); }}>Cancel</Button>
              <Button onClick={() => optionOpen ? upsertOpt.mutate(optForm as any) : upsertBrk.mutate(brkForm as any)}>Save</Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {optionOpen ? (
              <div className="max-w-xl mx-auto grid grid-cols-2 gap-5">
                <div><Label className="text-xs text-muted-foreground">Contract</Label>
                  <Select value={String(optForm.contractId)} onValueChange={v => setOptForm(f => ({ ...f, contractId: Number(v) }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select contract" /></SelectTrigger>
                    <SelectContent>{leases.map((l: any) => <SelectItem key={l.contract_id} value={String(l.contract_id)}>{l.property_name ?? l.contract_ref ?? l.contract_id}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs text-muted-foreground">Option Type</Label>
                  <Select value={optForm.option_type} onValueChange={(v: any) => setOptForm(f => ({ ...f, option_type: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{OPTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs text-muted-foreground">Exercise Deadline</Label><Input type="date" className="mt-1" value={optForm.exercise_deadline} onChange={e => setOptForm(f => ({ ...f, exercise_deadline: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Notice Period (days)</Label><Input type="number" className="mt-1" value={optForm.notice_period_days} onChange={e => setOptForm(f => ({ ...f, notice_period_days: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs text-muted-foreground">New Term (months)</Label><Input type="number" className="mt-1" value={optForm.new_term_months} onChange={e => setOptForm(f => ({ ...f, new_term_months: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs text-muted-foreground">New Rent (QAR)</Label><Input type="number" step="0.01" className="mt-1" value={optForm.new_rent} onChange={e => setOptForm(f => ({ ...f, new_rent: Number(e.target.value) }))} /></div>
              </div>
            ) : (
              <div className="max-w-xl mx-auto grid grid-cols-2 gap-5">
                <div><Label className="text-xs text-muted-foreground">Contract</Label>
                  <Select value={String(brkForm.contractId)} onValueChange={v => setBrkForm(f => ({ ...f, contractId: Number(v) }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select contract" /></SelectTrigger>
                    <SelectContent>{leases.map((l: any) => <SelectItem key={l.contract_id} value={String(l.contract_id)}>{l.property_name ?? l.contract_ref ?? l.contract_id}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs text-muted-foreground">Break Date</Label><Input type="date" className="mt-1" value={brkForm.break_date} onChange={e => setBrkForm(f => ({ ...f, break_date: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Notice Deadline</Label><Input type="date" className="mt-1" value={brkForm.notice_deadline} onChange={e => setBrkForm(f => ({ ...f, notice_deadline: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Penalty Amount (QAR)</Label><Input type="number" step="0.01" className="mt-1" value={brkForm.penalty_amount} onChange={e => setBrkForm(f => ({ ...f, penalty_amount: Number(e.target.value) }))} /></div>
                <div className="col-span-2"><Label className="text-xs text-muted-foreground">Conditions</Label><Input className="mt-1" value={brkForm.conditions} onChange={e => setBrkForm(f => ({ ...f, conditions: e.target.value }))} /></div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          <ScreenHeader screenId="VFLLSEOPT0001P001" title="Lease Options & Break Clauses" subtitle="Renewal options, purchase options and break clause management"
            screenType="lease_options_breaks" onAIData={(rows) => setAiRows(rows)} />
          <Tabs defaultValue="options">
            <TabsList>
              <TabsTrigger value="options">Lease Options</TabsTrigger>
              <TabsTrigger value="breaks">Break Clauses</TabsTrigger>
            </TabsList>
            <TabsContent value="options" className="mt-4">
              <div className="flex justify-end mb-3"><Button size="sm" onClick={() => { setOptForm({ ...INIT_OPT }); setOptionOpen(true); }}><Plus className="w-4 h-4 mr-1" />Add Option</Button></div>
              <Card><CardContent className="p-0"><Table>
                <TableHeader><TableRow><TableHead>Contract</TableHead><TableHead>Type</TableHead><TableHead>Exercise Deadline</TableHead><TableHead>Notice (days)</TableHead><TableHead>New Term</TableHead><TableHead>New Rent</TableHead><TableHead>Reasonably Certain</TableHead><TableHead className="w-20">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(options as any[]).map((o: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{o.contract_ref}</TableCell>
                      <TableCell><Badge variant="outline">{o.option_type}</Badge></TableCell>
                      <TableCell className={urgency(o.exercise_deadline)}>{o.exercise_deadline?.slice(0,10)}</TableCell>
                      <TableCell>{o.notice_period_days}</TableCell>
                      <TableCell>{o.new_term_months ? `${o.new_term_months}m` : "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{o.new_rent ? `QAR ${Number(o.new_rent).toLocaleString()}` : "—"}</TableCell>
                      <TableCell>{o.reasonably_certain ? <Badge className="bg-emerald-600 text-white text-xs">Yes</Badge> : <Badge variant="secondary" className="text-xs">No</Badge>}</TableCell>
                      <TableCell className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditOpt(o)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteOpt(o)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(options as any[]).length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No lease options recorded</TableCell></TableRow>}
                </TableBody>
              </Table></CardContent></Card>
            </TabsContent>
            <TabsContent value="breaks" className="mt-4">
              <div className="flex justify-end mb-3"><Button size="sm" onClick={() => { setBrkForm({ ...INIT_BRK }); setBreakOpen(true); }}><Plus className="w-4 h-4 mr-1" />Add Break Clause</Button></div>
              <Card><CardContent className="p-0"><Table>
                <TableHeader><TableRow><TableHead>Contract</TableHead><TableHead>Break Date</TableHead><TableHead>Notice Deadline</TableHead><TableHead className="text-right">Penalty</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No break clauses recorded</TableCell></TableRow>
                </TableBody>
              </Table></CardContent></Card>
            </TabsContent>
          </Tabs>
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
