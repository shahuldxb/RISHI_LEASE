/**
 * VodaLease Enterprise — Workflow Tasks
 * Screen ID: VFLWFLTSK0001P001
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const priorityColor = (p: string) => {
  if (p === "Critical") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (p === "High") return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (p === "Medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
};

const statusColor = (s: string) => {
  if (s === "Pending") return "bg-yellow-500/20 text-yellow-400";
  if (s === "Completed") return "bg-green-500/20 text-green-400";
  if (s === "Rejected") return "bg-red-500/20 text-red-400";
  return "bg-gray-500/20 text-gray-400";
};

export default function WorkflowTasks() {
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const { data, refetch, isLoading } = trpc.workflow.getMyTasks.useQuery({ status: "Pending" });
  const dbTasks: any[] = (data as any)?.rows ?? [];
  const tasks = aiRows.length > 0 ? aiRows as any[] : dbTasks;

  const completeMutation = trpc.workflow.completeTask.useMutation({
    onSuccess: () => { toast.success("Task completed"); refetch(); },
    onError: (e) => toast.error(e.message),
  });



  return (
    <DashboardLayout>
      <div className="space-y-4">
        <ScreenHeader
          screenId="VFLWFLTSK0001P001"
          title="My Tasks"
          subtitle={`Personal workflow task inbox · ${tasks.length} pending`}
          icon={<ClipboardList className="w-6 h-6 text-[#e60000]" />}
          screenType="workflow_tasks"
          onAIData={(rows) => setAiRows(rows)}
          actions={
            <Button variant="outline" size="sm" onClick={() => { refetch(); setAiRows([]); }}>
              Refresh
            </Button>
          }
        />

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Pending", count: tasks.filter((t: any) => t.status === "Pending" || !t.status).length, icon: Clock, color: "text-yellow-400" },
            { label: "Critical", count: tasks.filter((t: any) => t.priority === "Critical").length, icon: AlertTriangle, color: "text-red-400" },
            { label: "High Priority", count: tasks.filter((t: any) => t.priority === "High").length, icon: AlertTriangle, color: "text-orange-400" },
            { label: "Completed Today", count: tasks.filter((t: any) => t.status === "Completed").length, icon: CheckCircle2, color: "text-green-400" },
          ].map(({ label, count, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div className="text-2xl font-bold mt-1">{count}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tasks Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Lease Ref</TableHead>
                  <TableHead>Assigned By</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && aiRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading tasks...</TableCell>
                  </TableRow>
                ) : tasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No pending tasks. Click "Gen AI" to generate sample workflow tasks.
                    </TableCell>
                  </TableRow>
                ) : (
                  tasks.map((task: any, idx: number) => (
                    <TableRow key={task.task_id ?? idx}>
                      <TableCell className="font-medium max-w-48 truncate">{task.task_name ?? task.title ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{task.task_type ?? task.type ?? "Approval"}</TableCell>
                      <TableCell className="font-mono text-xs text-primary">{task.lease_ref ?? task.reference ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{task.assigned_by ?? task.assignedBy ?? "System"}</TableCell>
                      <TableCell>
                        <Badge className={priorityColor(task.priority ?? "Medium")} variant="outline">
                          {task.priority ?? "Medium"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColor(task.status ?? "Pending")}>
                          {task.status ?? "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-green-600 hover:text-green-700"
                            onClick={() => task.task_id ? completeMutation.mutate({ taskId: task.task_id, outcome: "Approved", comment: "Approved" }) : toast.info("AI demo — no action taken")}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-red-600 hover:text-red-700"
                            onClick={() => task.task_id ? completeMutation.mutate({ taskId: task.task_id, outcome: "Rejected", comment: "Rejected" }) : toast.info("AI demo — no action taken")}
                          >
                            <XCircle className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
