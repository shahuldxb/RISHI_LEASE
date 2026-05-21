import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Trash2, Plus, Pencil } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { GenAIFillButton } from "@/components/GenAIFillButton";

export default function IBRLibrary() {
  const [showForm, setShowForm] = useState(false);
  const [filterCurrency, setFilterCurrency] = useState("all");
  const [showCurrentOnly, setShowCurrentOnly] = useState(true);
  const [form, setForm] = useState<any>({ currency: "QAR", tenor: "", rate: "", effectiveDate: "", source: "", ibr_id: null });
  const INIT_FORM = { currency: "QAR", tenor: "", rate: "", effectiveDate: "", source: "", ibr_id: null };
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

  const { data: rawRates = [], refetch } = trpc.accounting.ibr.list.useQuery({ currency: filterCurrency === "all" ? undefined : filterCurrency });
  const rates = showCurrentOnly
    ? (rawRates as any[]).filter((r: any) => !r.effective_to || new Date(r.effective_to) >= new Date())
    : rawRates;
  const upsert = trpc.accounting.ibr.upsert.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("IBR rate saved"); }, onError: (e: any) => toast.error(e.message) });
  const del = trpc.accounting.ibr.delete.useMutation({ onSuccess: () => { refetch(); toast.success("IBR rate deleted"); } });

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">{form.ibr_id ? "Edit IBR Rate" : "Add IBR Rate"}</h2>
              <p className="text-sm text-muted-foreground">Add an Incremental Borrowing Rate for IFRS 16 calculations</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="ibr_form"
              onFill={(data) => setForm((f: any) => ({
                          ...f,
                          currency: data.currency ?? f.currency,
                          tenor: data.tenor ?? f.tenor,
                          rate: data.rate ?? f.rate,
                          effectiveDate: data.effectiveDate ?? f.effectiveDate,
                          source: data.source ?? f.source,
                        }))}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Currency</Label>
                  <Select value={form.currency} onValueChange={v => setForm((f: any) => ({ ...f, currency: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["QAR","USD","EUR","GBP","SAR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                   </Select>                </div>
                <div><Label>Tenor (months)</Label><Input className="mt-1" type="number" value={form.tenor} onChange={e => setForm((f: any) => ({ ...f, tenor: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Rate (%)</Label><Input className="mt-1" type="number" step="0.001" value={form.rate} onChange={e => setForm((f: any) => ({ ...f, rate: e.target.value }))} /></div>
                <div><Label>Effective Date</Label><Input className="mt-1" type="date" value={form.effectiveDate} onChange={e => setForm((f: any) => ({ ...f, effectiveDate: e.target.value }))} /></div>
              </div>
              <div><Label>Source</Label><Input className="mt-1" placeholder="e.g. Central Bank, Bloomberg" value={form.source} onChange={e => setForm((f: any) => ({ ...f, source: e.target.value }))} /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => { setShowForm(false); setForm(INIT_FORM); }}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={upsert.isPending}
                  onClick={() => upsert.mutate({ currency: form.currency, lease_term_min: Number(form.tenor || 1), lease_term_max: Number(form.tenor || 60), rate_pct: Number(form.rate), effective_from: form.effectiveDate, source: form.source })}>
                  {upsert.isPending ? "Saving..." : "Save Rate"}
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
          screenId="VFLIBR0001P001"
          title="IBR Library"
          subtitle="Incremental Borrowing Rates for IFRS 16 lease calculations"
          screenType="ibr_library"
          onAIData={(rows) => setAiRows(rows)}
          actions={<Button onClick={() => { setForm(INIT_FORM); setShowForm(true); }} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2 h-9 px-3 text-sm rounded-lg"><Plus className="w-4 h-4" />Add</Button>}
        />
        <div className="flex gap-3 items-center">
          <Select value={filterCurrency} onValueChange={setFilterCurrency}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Currencies</SelectItem>
              {["QAR","USD","EUR","GBP","SAR","AED","BHD","KWD","OMR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={showCurrentOnly ? "default" : "outline"} size="sm" onClick={() => setShowCurrentOnly(!showCurrentOnly)}>
            {showCurrentOnly ? "Current Rates" : "All Historical"}
          </Button>
          <span className="text-sm text-muted-foreground">{(rates as any[]).length} rates</span>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Currency</TableHead><TableHead>Tenor Range (mo)</TableHead><TableHead>Rate (%)</TableHead><TableHead>Effective From</TableHead><TableHead>Effective To</TableHead><TableHead>Source</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(rates as any[]).map((r: any) => (
                <TableRow key={r.ibr_id}>
                  <TableCell>{r.currency}</TableCell>
                  <TableCell>{r.lease_term_min}–{r.lease_term_max}</TableCell>
                  <TableCell>{Number(r.rate_pct).toFixed(3)}%</TableCell>
                  <TableCell>{r.effective_from ? new Date(r.effective_from).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{r.effective_to ? new Date(r.effective_to).toLocaleDateString() : "Open"}</TableCell>
                  <TableCell>{r.source ?? "—"}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setForm({ currency: r.currency, tenor: String(r.lease_term_min), rate: String(r.rate_pct), effectiveDate: r.effective_from ? new Date(r.effective_from).toISOString().split('T')[0] : '', source: r.source ?? '', ibr_id: r.ibr_id }); setShowForm(true); }}><Pencil className="w-4 h-4 text-blue-400" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => del.mutate({ ibr_id: r.ibr_id })}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {(rates as any[]).length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No IBR rates configured</TableCell></TableRow>}
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
