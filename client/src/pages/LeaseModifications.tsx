import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GenAIFillButton } from "@/components/GenAIFillButton";

const MOD_TYPES = ["Rent Change","Term Extension","Term Reduction","Scope Change","Remeasurement","Other"];

export default function LeaseModifications() {
  const [showForm, setShowForm] = useState(false);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [selectedLease, setSelectedLease] = useState("");
  const [modType, setModType] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [newRent, setNewRent] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [editRow, setEditRow] = useState<any>(null);
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
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 200 });
  const leases: any[] = (leasesData as any)?.rows ?? [];

  const createMut = trpc.leaseModification.create.useMutation({
    onSuccess: () => { utils.leaseModification.list.invalidate(); toast.success("Modification created"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.leaseModification.update.useMutation({
    onSuccess: () => { utils.leaseModification.list.invalidate(); toast.success("Modification updated"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.leaseModification.delete.useMutation({
    onSuccess: () => { utils.leaseModification.list.invalidate(); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const { data: mods = [], isLoading } = trpc.leaseModification.list.useQuery({});

  function openAdd() {
    setEditRow(null); setSelectedLease(""); setModType(""); setEffectiveDate(""); setNewRent(""); setNewEndDate(""); setReason("");
    setShowForm(true);
  }

  const handleSubmit = () => {
    if (!selectedLease || !modType || !effectiveDate) { toast.error("Please fill in all required fields"); return; }
    const payload = {
      contract_id: Number(selectedLease),
      modification_date: effectiveDate,
      modification_type: modType as any,
      liability_adjustment: newRent ? Number(newRent) : undefined,
      status: "Draft" as const,
    };
    if (editRow) { updateMut.mutate({ modification_id: editRow.modification_id, ...payload }); }
    else { createMut.mutate(payload); }
  };

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[#161616] shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><ArrowLeft className="w-5 h-5" /></Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{editRow ? "Edit Lease Modification" : "New Lease Modification"}</h2>
              <p className="text-xs text-muted-foreground">Record a lease modification or remeasurement event</p>
            </div>
            <GenAIFillButton formType="lease_modification" onFill={(data) => {
              if (data.modificationDate) setEffectiveDate(String(data.modificationDate));
              if (data.modificationTypeValue) setModType(String(data.modificationTypeValue));
              if (data.reason) setReason(String(data.reason));
            }} />
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <Label>Lease Contract *</Label>
                <Select value={selectedLease} onValueChange={setSelectedLease}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select lease..." /></SelectTrigger>
                  <SelectContent>
                    {(leases as any[]).map((l: any) => (
                      <SelectItem key={l.contract_id} value={String(l.contract_id)}>{l.contract_ref} — {l.asset_description}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Modification Type *</Label>
                <Select value={modType} onValueChange={setModType}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>{MOD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Effective Date *</Label>
                <Input type="date" className="mt-1" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
              </div>
              {(modType === "Rent Change" || modType === "Remeasurement") && (
                <div>
                  <Label>New Monthly Rent</Label>
                  <Input type="number" className="mt-1" placeholder="0.00" value={newRent} onChange={e => setNewRent(e.target.value)} />
                </div>
              )}
              {(modType === "Term Extension" || modType === "Term Reduction") && (
                <div>
                  <Label>New End Date</Label>
                  <Input type="date" className="mt-1" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} />
                </div>
              )}
              <div>
                <Label>Reason / Notes</Label>
                <Input className="mt-1" placeholder="Reason for modification..." value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={handleSubmit}>
                  {editRow ? "Update Modification" : "Submit for Remeasurement"}
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
          screenId="VFLLEAMOD0001P001"
          screenType="lease_modifications"
          onAIData={(rows) => setAiRows(rows)}
          title="Lease Modifications"
          subtitle="Lease modification and remeasurement processing"
          actions={<Button size="sm" onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2"><PlusCircle className="w-4 h-4" />New Modification</Button>}
        />
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Contract Ref</TableHead>
                <TableHead className="text-xs">Lessor</TableHead>
                <TableHead className="text-xs">Mod Type</TableHead>
                <TableHead className="text-xs">Effective Date</TableHead>
                <TableHead className="text-xs">Liability Adj.</TableHead>
                <TableHead className="text-xs">ROU Adj.</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && aiRows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Loading…</TableCell></TableRow>
              ) : (aiRows.length > 0 ? aiRows : (mods as any[])).length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No modifications yet. <button className="text-primary underline" onClick={openAdd}>Add the first one.</button></TableCell></TableRow>
              ) : (
                (aiRows.length > 0 ? aiRows : (mods as any[])).map((row: any, i: number) => (
                  <TableRow key={row.modification_id ?? i}>
                    <TableCell className="font-mono text-xs">{row.mod_ref ?? row.contract_ref ?? "—"}</TableCell>
                    <TableCell>{row.lessor_name ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{row.modification_type ?? "—"}</Badge></TableCell>
                    <TableCell>{row.modification_date ? new Date(row.modification_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">{row.liability_adjustment ?? "—"}</TableCell>
                    <TableCell className="text-right">{row.rou_adjustment ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Badge variant="outline">{row.status ?? "Draft"}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditRow(row); setSelectedLease(String(row.contract_id)); setModType(row.modification_type);
                          setEffectiveDate(row.modification_date?.split("T")[0] ?? ""); setShowForm(true);
                        }}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMut.mutate({ modification_id: row.modification_id })}>Del</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
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
