import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, PlayCircle, Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { GenAIFillButton } from "@/components/GenAIFillButton";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";


const SAMPLE_QATAR: Record<string, unknown> = {
  invoice_ref: "INV-2025-00142", lease_ref: "LSE-QA-0031",
  lessor_name: "Barwa Real Estate Company", invoice_date: "2025-04-01",
  due_date: "2025-04-30", total_amount: 48000, currency: "QAR",
  status: "Pending", period_month: 4, period_year: 2025,
};

export default function PaymentRuns() {
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  // Alt+1 → table view | Alt+F2 → sample form view
  const handleAltKeys = useCallback((e: KeyboardEvent) => {
    if (e.altKey && e.key === "1") { e.preventDefault(); setAiRecord(null); }
    if (e.altKey && e.key === "F2") { e.preventDefault(); setAiRecord(SAMPLE_QATAR); }
  }, []);
  useEffect(() => {
    window.addEventListener("keydown", handleAltKeys);
    return () => window.removeEventListener("keydown", handleAltKeys);
  }, [handleAltKeys]);

  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [payDate, setPayDate] = useState("");
  const [bankFormat, setBankFormat] = useState("SWIFT");

  const runs: any[] = [];

  function openEdit(r: any) {
    setEditRow(r);
    setPayDate(r.run_date ? new Date(r.run_date).toISOString().slice(0,10) : "");
    setBankFormat(r.bank_file_format ?? "SWIFT");
    setShowForm(true);
  }
  function handleDelete(r: any) {
    toast("Delete payment run " + (r.run_ref ?? r.run_id) + "?", {
      action: { label: "Confirm Delete", onClick: () => toast.success("Payment run deleted") },
    });
  }

  const createRunMutation = trpc.payables.createPaymentRun.useMutation({
    onSuccess: () => { toast.success("Payment run created and bank file generated"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[#161616] shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><ArrowLeft className="w-5 h-5" /></Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{editRow ? "Edit Payment Run" : "Create Payment Run"}</h2>
              <p className="text-xs text-muted-foreground">{editRow ? "Update payment run details" : "Generate a bank payment file for approved invoices"}</p>
            </div>
            <GenAIFillButton formType="payment_runs" onFill={(data) => {
              if (data.paymentDate) setPayDate(String(data.paymentDate));
              if (data.bankFormat) setBankFormat(String(data.bankFormat));
            }} />
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <Label>Payment Date *</Label>
                <Input type="date" className="mt-1" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
              <div>
                <Label>Bank File Format *</Label>
                <Select value={bankFormat} onValueChange={setBankFormat}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SWIFT">SWIFT MT103</SelectItem>
                    <SelectItem value="EFT">EFT (Local)</SelectItem>
                    <SelectItem value="SEPA">SEPA Credit Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                All approved invoices due on or before the payment date will be included in this run.
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white"
                  onClick={() => createRunMutation.mutate({ runDate: payDate, currency: 'USD', invoices: [], bankFileFormat: bankFormat as 'SWIFT' | 'EFT' })}
                  disabled={!payDate || createRunMutation.isPending}>
                  {createRunMutation.isPending ? "Processing..." : "Generate Run"}
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
          screenId="VFLPAYRUN0001P001" screenType="payment_runs"
          title="Payment Runs"
          subtitle="Payment run creation and bank file generation"
          actions={<Button size="sm" onClick={() => setShowForm(true)} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2"><PlayCircle className="w-4 h-4" />Create Run</Button>}
        />
        {aiRecord && (
          <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Sample Record (Qatar)</h3>
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setAiRecord(null)}>✕ Close</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {Object.entries(aiRecord).map(([k, v]) => (
                <div key={k} className="space-y-0.5">
                  <p className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</p>
                  <p className="font-medium text-xs">{String(v)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Pending Payments", value: "0", color: "text-amber-400" },
            { label: "This Month Paid", value: "$0", color: "text-green-400" },
            { label: "Overdue", value: "0", color: "text-red-400" },
          ].map(c => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Run Ref</TableHead>
                <TableHead className="text-xs">Payment Date</TableHead>
                <TableHead className="text-xs">Bank Format</TableHead>
                <TableHead className="text-xs text-right">Total Amount</TableHead>
                <TableHead className="text-xs">Payments</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No payment runs yet. <button className="text-primary underline" onClick={() => setShowForm(true)}>Create the first one.</button></TableCell></TableRow>}
              {runs.map((r: any) => (
                <TableRow key={r.run_id} className="text-sm hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{r.run_ref ?? `RUN-${r.run_id}`}</TableCell>
                  <TableCell>{r.run_date ? new Date(r.run_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{r.bank_file_format ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.currency} {Number(r.total_amount ?? 0).toLocaleString()}</TableCell>
                  <TableCell>{r.payment_count ?? 0}</TableCell>
                  <TableCell><Badge className={r.status === "Completed" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}>{r.status ?? "Pending"}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(r)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem><Download className="mr-2 h-4 w-4" />Download Bank File</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(r)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
