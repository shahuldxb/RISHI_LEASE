import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft , Pencil, Trash2} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { GenAIFillButton } from "@/components/GenAIFillButton";

export default function WorkflowQueue() {
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [dialogAction, setDialogAction] = useState<"Approve" | "Reject">("Approve");
  const [comment, setComment] = useState("");
  const [filterStatus, setFilterStatus] = useState("Pending");
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

  const { data, isLoading, refetch } = trpc.workflow.getQueue.useQuery({ outcome: filterStatus || undefined });
  const tasks = (data as any)?.rows ?? [];
  const completeTask = trpc.workflow.completeTask.useMutation({ onSuccess: () => { refetch(); setShowForm(false); setSelected(null); toast.success(`Task ${dialogAction === "Approve" ? "approved" : "rejected"}`); }, onError: (e: any) => toast.error(e.message) });

  if (showForm && selected) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setSelected(null); }} className="gap-2">
              <ArrowLeft className="w-4 h-4" />Back
            </Button>
            <div>
              <h2 className="font-semibold text-lg">{dialogAction} Task</h2>
              <p className="text-sm text-muted-foreground">{selected.description}</p>
            </div>
            <div className="ml-auto"><GenAIFillButton
              formType="new_lease"
              onFill={(data) => { if (data.notes) setComment(data.notes); }}
            /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <p className="text-sm font-medium">Task: {selected.task_type}</p>
                <p className="text-sm text-muted-foreground mt-1">Entity: {selected.entity_type} #{selected.entity_id}</p>
                <p className="text-sm text-muted-foreground">Assigned to: {selected.assigned_to ?? "Unassigned"}</p>
              </div>
              <div><Label>Comment</Label><Input className="mt-1" placeholder="Add a comment (optional)" value={comment} onChange={e => setComment(e.target.value)} /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => { setShowForm(false); setSelected(null); }}>Cancel</Button>
                <Button className={dialogAction === "Approve" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"} disabled={completeTask.isPending}
                  onClick={() => completeTask.mutate({ taskId: selected.task_id, outcome: dialogAction === 'Approve' ? 'APPROVED' : 'REJECTED', comment })}>
                  {completeTask.isPending ? "Processing..." : dialogAction}
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
          screenId="VFWKFACTNS0003P001"
          title="Workflow Queue"
          subtitle="Pending approvals and task management"
          screenType="workflow_queue"
          onAIData={(rows) => setAiRows(rows)}
        />
        <div className="flex gap-3">
          <Select value={filterStatus || "all"} onValueChange={v => setFilterStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["Pending","In Progress","Completed","Rejected"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Task Type</TableHead><TableHead>Entity</TableHead><TableHead>Description</TableHead><TableHead>Assigned To</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>}
              {!isLoading && tasks.map((t: any) => (
                <TableRow key={t.task_id}>
                  <TableCell>{t.task_type}</TableCell>
                  <TableCell>{t.entity_type} #{t.entity_id}</TableCell>
                  <TableCell className="max-w-xs truncate">{t.description}</TableCell>
                  <TableCell>{t.assigned_to ?? "—"}</TableCell>
                  <TableCell><Badge className={t.status === "Pending" ? "bg-amber-500/20 text-amber-400" : t.status === "Completed" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>{t.status}</Badge></TableCell>
                  <TableCell className="flex gap-2">
                    {t.status === "Pending" && <>
                      <Button size="sm" variant="outline" className="text-green-400 border-green-400" onClick={() => { setSelected(t); setDialogAction("Approve"); setComment(""); setShowForm(true); }}>Approve</Button>
                      <Button size="sm" variant="outline" className="text-red-400 border-red-400" onClick={() => { setSelected(t); setDialogAction("Reject"); setComment(""); setShowForm(true); }}>Reject</Button>
                    </>}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-400" onClick={() => toast("Remove this task?", { action: { label: "Remove", onClick: () => toast.success("Task removed") } })}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && tasks.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No tasks in queue</TableCell></TableRow>}
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
