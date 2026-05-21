import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function WorkflowEscalations() {
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const { data, refetch } = trpc.workflow.getQueue.useQuery({ page: 1, pageSize: 100 });
  const tasks: any[] = ((data as any)?.rows ?? []).filter((t: any) => t.is_overdue);

  const completeMutation = trpc.workflow.completeTask.useMutation({
    onSuccess: () => { toast.success("Task escalated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <ScreenHeader
  screenId="VFLWFLESC0001P001"
  title="Workflow Escalations"
  subtitle="Escalation rules and SLA breach management"

          screenType="workflow_escalations"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />
    </DashboardLayout>
  );
}
