import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Wrench, PlusCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GenAIFillButton } from "@/components/GenAIFillButton";

const TICKET_TYPES = ["Routine Maintenance","Major Repair","Emergency","Structural","HVAC/Power","Cleaning","Security","Compliance Inspection"];
const RESPONSIBILITY = ["Vodafone","Lessor","Shared"];

export default function OpsMaintenance() {
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ leaseId: "", ticketType: "", description: "", responsibility: "Lessor", priority: "Normal", estimatedCost: "" });
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setShowForm(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function openAdd() { setEditRow(null); setForm({ leaseId: "", ticketType: "", description: "", responsibility: "Lessor", priority: "Normal", estimatedCost: "" }); setShowForm(true); }
  function openEdit(t: any) {
    setEditRow(t);
    setForm({ leaseId: String(t.contract_id ?? ""), ticketType: t.ticket_type ?? "", description: t.description ?? "", responsibility: t.responsibility ?? "Lessor", priority: t.priority ?? "Normal", estimatedCost: String(t.estimated_cost ?? "") });
    setShowForm(true);
  }
  function handleDelete(t: any) {
    toast("Delete ticket " + (t.ticket_ref ?? t.ticket_id) + "?", {
      action: { label: "Confirm Delete", onClick: () => toast.success("Ticket deleted") },
    });
  }

  const { data: tickets = [], refetch } = trpc.lease.getMaintenanceTickets.useQuery({});
  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 200 });
  const leases: any[] = (leasesData as any)?.rows ?? [];

  const rows: any[] = Array.isArray(tickets) ? tickets : (tickets as any)?.tickets ?? [];
  const leaseList: any[] = leases;

  const statusColor = (s: string) => {
    if (s === "Open") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    if (s === "In Progress") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (s === "Closed") return "bg-green-500/20 text-green-400 border-green-500/30";
    return "bg-muted text-muted-foreground";
  };

  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[#161616] shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><ArrowLeft className="w-5 h-5" /></Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{editRow ? "Edit Maintenance Ticket" : "Raise Maintenance Ticket"}</h2>
              <p className="text-xs text-muted-foreground">{editRow ? "Update ticket details" : "Log a new maintenance or repair request"}</p>
            </div>
            <GenAIFillButton formType="maintenance_ticket" onFill={(data) => {
              setForm(f => ({
                ...f,
                description: data.description ?? data.title ?? f.description,
                priority: data.priority === "LOW" ? "Low" : data.priority === "HIGH" ? "High" : data.priority === "CRITICAL" ? "Critical" : data.priority ?? f.priority,
                ticketType: data.category ?? f.ticketType,
                estimatedCost: data.estimatedCost ? String(data.estimatedCost) : f.estimatedCost,
              }));
            }} />
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <Label>Lease *</Label>
                <Select value={form.leaseId} onValueChange={v => setForm(f => ({ ...f, leaseId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select lease..." /></SelectTrigger>
                  <SelectContent>{leaseList.map((l: any) => <SelectItem key={l.contract_id} value={String(l.contract_id)}>{l.contract_ref} — {l.asset_description}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Ticket Type</Label>
                  <Select value={form.ticketType} onValueChange={v => setForm(f => ({ ...f, ticketType: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{TICKET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Responsibility</Label>
                  <Select value={form.responsibility} onValueChange={v => setForm(f => ({ ...f, responsibility: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{RESPONSIBILITY.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Description</Label><Input className="mt-1" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Low","Normal","High","Critical"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Estimated Cost ($)</Label><Input type="number" className="mt-1" value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={() => { toast.success("Ticket raised"); setShowForm(false); refetch(); }}>Raise Ticket</Button>
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
          screenId="VFLOPSMNT0001P001"
          screenType="maintenance"
          onAIData={(rows) => setAiRows(rows)}
          title="Asset Maintenance"
          subtitle="Maintenance ticket register and repair tracking"
          actions={<Button size="sm" onClick={openAdd} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-2"><PlusCircle className="w-4 h-4" />Raise Ticket</Button>}
        />

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Open Tickets", value: rows.filter((r: any) => r.status === "Open").length, color: "text-amber-400" },
            { label: "In Progress", value: rows.filter((r: any) => r.status === "In Progress").length, color: "text-blue-400" },
            { label: "Lessor Responsibility", value: rows.filter((r: any) => r.responsibility === "Lessor").length, color: "text-purple-400" },
            { label: "Cost Recovery Pending", value: rows.filter((r: any) => r.cost_recovery_required).length, color: "text-red-400" },
          ].map(k => (
            <div key={k.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Ticket #</TableHead>
                <TableHead className="text-xs">Lease</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Responsibility</TableHead>
                <TableHead className="text-xs">Priority</TableHead>
                <TableHead className="text-xs text-right">Est. Cost</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t: any) => (
                <TableRow key={t.ticket_id} className="text-sm hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{t.ticket_ref ?? `TKT-${t.ticket_id}`}</TableCell>
                  <TableCell className="font-mono text-xs">{t.contract_ref ?? "—"}</TableCell>
                  <TableCell>{t.ticket_type}</TableCell>
                  <TableCell>
                    <Badge className={t.responsibility === "Lessor" ? "bg-purple-500/20 text-purple-400 border-purple-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30"}>
                      {t.responsibility}
                    </Badge>
                  </TableCell>
                  <TableCell>{t.priority}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{t.estimated_cost ? `$${Number(t.estimated_cost).toLocaleString()}` : "—"}</TableCell>
                  <TableCell><Badge className={statusColor(t.status)}>{t.status}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(t)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No maintenance tickets. <button className="text-primary underline" onClick={() => setShowForm(true)}>Raise the first one.</button></TableCell></TableRow>}
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
