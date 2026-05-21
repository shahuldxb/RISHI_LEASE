import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, PlusCircle, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GenAIFillButton } from "@/components/GenAIFillButton";

const INIT = { bankName: "", accountName: "", accountNumber: "", currency: "USD", branchCode: "", swiftCode: "", accountType: "Current" };

export default function BankAccounts() {
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [form, setForm] = useState(INIT);
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setShowForm(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const { data: accountsData, refetch } = trpc.bankRecon.listAccounts.useQuery({});
  const createMut = trpc.bankRecon.createAccount.useMutation({
    onSuccess: () => { toast.success("Bank account created"); setShowForm(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const rows: any[] = (accountsData as any)?.accounts ?? [];

  function openAdd() { setEditRow(null); setForm(INIT); setShowForm(true); }

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[#161616] shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><ArrowLeft className="w-5 h-5" /></Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Add Bank Account</h2>
              <p className="text-xs text-muted-foreground">Register a new bank account for payment processing</p>
            </div>
            <GenAIFillButton formType="bank_reconciliation" onFill={(data) => setForm(f => ({ ...f,
              bankName: data.bankName ? String(data.bankName) : f.bankName,
              accountName: data.accountName ? String(data.accountName) : f.accountName,
              swiftCode: data.swiftCode ? String(data.swiftCode) : f.swiftCode,
              accountNumber: data.accountNumber ? String(data.accountNumber) : f.accountNumber,
            }))} />
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Label>Bank Name *</Label><Input className="mt-1" value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} /></div>
                <div className="col-span-2"><Label>Account Name *</Label><Input className="mt-1" value={form.accountName} onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))} /></div>
                <div><Label>Account Number *</Label><Input className="mt-1" value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} /></div>
                <div><Label>Currency</Label>
                  <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["USD","QAR","EUR","GBP","ZAR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Branch Code</Label><Input className="mt-1" value={form.branchCode} onChange={e => setForm(f => ({ ...f, branchCode: e.target.value }))} /></div>
                <div><Label>SWIFT Code</Label><Input className="mt-1" value={form.swiftCode} onChange={e => setForm(f => ({ ...f, swiftCode: e.target.value }))} /></div>
                <div><Label>Account Type</Label>
                  <Select value={form.accountType} onValueChange={v => setForm(f => ({ ...f, accountType: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Current","Savings","Call"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white"
                  onClick={() => createMut.mutate({ bankName: form.bankName, accountName: form.accountName, accountNumber: form.accountNumber, currency: form.currency, swiftBic: form.swiftCode, accountType: form.accountType })}
                  disabled={createMut.isPending}>
                  {createMut.isPending ? "Creating..." : "Create Account"}
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
        <ScreenHeader screenId="VFLBNKACC0001P001" screenType="bank_accounts" title="Bank Accounts" subtitle="Registered bank accounts for payment processing"
          actions={<Button size="sm" onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2"><PlusCircle className="w-4 h-4" />Add Account</Button>}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((acc: any) => (
            <div key={acc.account_id} className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 bg-[#e60000]/10 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-[#e60000]" />
                </div>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{acc.currency}</Badge>
              </div>
              <div>
                <p className="font-semibold">{acc.bank_name}</p>
                <p className="text-sm text-muted-foreground">{acc.account_name}</p>
                <p className="text-xs font-mono text-muted-foreground mt-1">{acc.account_number}</p>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>SWIFT: {acc.swift_code ?? "—"}</span>
                <span>{acc.account_type}</span>
              </div>
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => { setEditRow(acc); setForm({ bankName: acc.bank_name, accountName: acc.account_name, accountNumber: acc.account_number, currency: acc.currency, branchCode: acc.branch_code ?? "", swiftCode: acc.swift_bic ?? "", accountType: acc.account_type }); setShowForm(true); }}>
                  <Pencil className="w-3 h-3" />Edit
                </Button>
                <Button size="sm" variant="outline" className="text-red-400 border-red-400/30 hover:bg-red-500/10 gap-1 text-xs" onClick={() => { if (confirm('Delete this bank account?')) toast.info('Delete coming soon'); }}>
                  <Trash2 className="w-3 h-3" />Delete
                </Button>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No bank accounts registered yet.</p>
              <button className="text-primary underline mt-2" onClick={openAdd}>Add the first one.</button>
            </div>
          )}
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
