import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, PlusCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GenAIFillButton } from "@/components/GenAIFillButton";

const INIT = { ruleName: "", matchField: "description", matchOperator: "contains", matchValue: "", glAccount: "", priority: "1" };

export default function BankRules() {
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [form, setForm] = useState({ ...INIT });
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setShowForm(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const { data: rulesData, refetch } = trpc.bankRecon.getRules.useQuery();
  const upsertMutation = trpc.bankRecon.upsertRule.useMutation({
    onSuccess: () => { toast.success("Rule saved"); setShowForm(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const rows: any[] = Array.isArray(rulesData) ? rulesData : (rulesData as any)?.rules ?? [];

  function openAdd() { setEditRow(null); setForm({ ...INIT }); setShowForm(true); }
  function openEdit(r: any) {
    setEditRow(r);
    setForm({
      ruleName: r.rule_name ?? "",
      matchField: r.match_field ?? "description",
      matchOperator: r.match_operator ?? "contains",
      matchValue: r.match_value ?? "",
      glAccount: r.gl_account ?? "",
      priority: String(r.priority ?? "1"),
    });
    setShowForm(true);
  }
  function handleDelete(r: any) {
    toast("Delete this rule?", {
      action: {
        label: "Confirm Delete",
        onClick: () => toast.info("Delete coming soon — contact admin to remove rules"),
      },
    });
  }
  function handleSubmit() {
    upsertMutation.mutate({
      ...(editRow ? { rule_id: editRow.rule_id } : {}),
      ruleName: form.ruleName,
      ruleType: "RefMatch",
      priority: Number(form.priority),
      refPattern: form.matchValue,
      description: `${form.matchField} ${form.matchOperator} ${form.matchValue}`,
    } as any);
  }

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[#161616] shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><ArrowLeft className="w-5 h-5" /></Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{editRow ? "Edit Matching Rule" : "New Matching Rule"}</h2>
              <p className="text-xs text-muted-foreground">Configure an auto-matching rule for bank reconciliation</p>
            </div>
            <GenAIFillButton formType="bank_reconciliation" onFill={(data) => setForm(f => ({
              ...f,
              ruleName: data.description ? String(data.description) : f.ruleName,
              matchValue: data.matchValue ? String(data.matchValue) : f.matchValue,
            }))} />
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              <div><Label>Rule Name *</Label><Input className="mt-1" value={form.ruleName} onChange={e => setForm(f => ({ ...f, ruleName: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Match Field</Label>
                  <Select value={form.matchField} onValueChange={v => setForm(f => ({ ...f, matchField: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["description","reference","amount","counterparty"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Operator</Label>
                  <Select value={form.matchOperator} onValueChange={v => setForm(f => ({ ...f, matchOperator: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["contains","equals","starts_with","ends_with","regex"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Value *</Label><Input className="mt-1" value={form.matchValue} onChange={e => setForm(f => ({ ...f, matchValue: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>GL Account</Label><Input className="mt-1" placeholder="e.g. 2110" value={form.glAccount} onChange={e => setForm(f => ({ ...f, glAccount: e.target.value }))} /></div>
                <div><Label>Priority</Label><Input type="number" className="mt-1" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={handleSubmit} disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending ? "Saving..." : editRow ? "Update Rule" : "Save Rule"}
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
          screenId="VFLBNKRUL0001P001" screenType="bank_rules"
          title="Bank Matching Rules"
          subtitle="Configurable auto-matching rules for bank reconciliation"
          actions={<Button size="sm" onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2"><PlusCircle className="w-4 h-4" />New Rule</Button>}
        />
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Rule Name</TableHead>
                <TableHead className="text-xs">Match Field</TableHead>
                <TableHead className="text-xs">Operator</TableHead>
                <TableHead className="text-xs">Match Value</TableHead>
                <TableHead className="text-xs">GL Account</TableHead>
                <TableHead className="text-xs">Priority</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.rule_id} className="text-sm hover:bg-muted/30">
                  <TableCell className="font-medium">{r.rule_name}</TableCell>
                  <TableCell>{r.match_field}</TableCell>
                  <TableCell>{r.match_operator}</TableCell>
                  <TableCell className="font-mono text-xs">{r.match_value}</TableCell>
                  <TableCell className="font-mono text-xs">{r.gl_account ?? "—"}</TableCell>
                  <TableCell>{r.priority}</TableCell>
                  <TableCell><Badge className={r.is_active ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-muted text-muted-foreground"}>{r.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(r)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(r)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No matching rules configured.{" "}
                    <button className="text-primary underline" onClick={openAdd}>Add the first rule.</button>
                  </TableCell>
                </TableRow>
              )}
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
