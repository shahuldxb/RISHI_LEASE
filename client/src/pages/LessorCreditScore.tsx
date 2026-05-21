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

export default function LessorCreditScore() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ lessor_id: "", score: "", rating: "A", assessmentDate: "", notes: "" });
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

  const { data: scores = [], refetch } = trpc.lessorCredit.list.useQuery();
  const { data: lessorsData } = trpc.lessor.getLessors.useQuery({});
  const lessors: any[] = (lessorsData as any)?.lessors ?? [];
  // Auto-select first lessor when data loads
  useEffect(() => {
    if (lessors.length > 0 && !form.lessor_id) {
      setForm((f: any) => ({ ...f, lessor_id: String(lessors[0].lessor_id) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessors.length]);
  const save = trpc.lessorCredit.upsert.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Credit score saved"); }, onError: (e: any) => toast.error(e.message) });

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">Record Credit Score</h2>
              <p className="text-sm text-muted-foreground">Assign a credit score and rating to a lessor</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="lessor_credit_score"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          score: data.score ? String(data.score) : f.score,
                          rating: data.rating ?? f.rating,
                          assessmentDate: data.assessmentDate ?? f.assessmentDate,
                          notes: data.notes ?? f.notes,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div><Label>Lessor</Label>
                <Select value={form.lessor_id} onValueChange={v => setForm((f: any) => ({ ...f, lessor_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select lessor" /></SelectTrigger>
                  <SelectContent>{(lessors as any[]).map((l: any) => <SelectItem key={l.lessor_id} value={String(l.lessor_id)}>{l.lessor_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Credit Score (0-1000)</Label><Input className="mt-1" type="number" min="0" max="1000" value={form.score} onChange={e => setForm((f: any) => ({ ...f, score: e.target.value }))} /></div>
                <div><Label>Rating</Label>
                  <Select value={form.rating} onValueChange={v => setForm((f: any) => ({ ...f, rating: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["AAA","AA","A","BBB","BB","B","CCC","CC","C","D"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Assessment Date</Label><Input className="mt-1" type="date" value={form.assessmentDate} onChange={e => setForm((f: any) => ({ ...f, assessmentDate: e.target.value }))} /></div>
              <div><Label>Notes</Label><Input className="mt-1" value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={save.isPending}
                  onClick={() => save.mutate({ lessor_id: Number(form.lessor_id), payment_history_score: Number(form.score || 70), financial_stability_score: Number(form.score || 70), dispute_history_score: Number(form.score || 70), compliance_score: Number(form.score || 70), notes: form.notes })}>
                  {save.isPending ? "Saving..." : "Save Score"}
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
          screenId="VFLLESCRD0001P001"
          title="Lessor Credit Score"
          subtitle="Credit ratings and risk assessment for lessors"
          screenType="lessor_credit_score"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={() => setShowForm(true)} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Lessor</TableHead><TableHead>Score</TableHead><TableHead>Rating</TableHead><TableHead>Assessment Date</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(scores as any[]).map((s: any) => (
                <TableRow key={s.credit_id}>
                  <TableCell>{s.lessor_name ?? s.lessor_id}</TableCell>
                  <TableCell>{s.score}</TableCell>
                  <TableCell><Badge className="bg-blue-500/20 text-blue-400">{s.rating}</Badge></TableCell>
                  <TableCell>{s.assessment_date ? new Date(s.assessment_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{s.notes ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-blue-400" onClick={() => { setForm({ lessorId: String(s.lessor_id), score: s.score, rating: s.rating, assessmentDate: s.assessment_date?.slice(0,10) ?? "", notes: s.notes ?? "" }); setShowForm(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-400" onClick={() => toast("Remove this score?", { action: { label: "Remove", onClick: () => toast.success("Score removed") } })}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(scores as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No credit scores recorded yet</TableCell></TableRow>}
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
