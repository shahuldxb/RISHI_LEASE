import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-500/20 text-green-400 border-green-500/30",
  Completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Suspended: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Failed: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function WorkflowMonitor() {
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const { data } = trpc.workflow.getQueue.useQuery({ page: 1, pageSize: 100 });

  const utils = trpc.useUtils();
  const completeTaskMut = trpc.workflow.completeTask.useMutation({
    onSuccess: () => { utils.workflow.getQueue.invalidate(); toast.success("Task completed"); },
    onError: (e) => toast.error(e.message),
  });
  const rows: any[] = (data as any)?.rows ?? [];

  return (
    <DashboardLayout>
      <ScreenHeader
  screenId="VFLWFLMON0001P001"
  title="Workflow Monitor"
  subtitle="Active workflow instances and status"

          screenType="workflow_monitor"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />
    </DashboardLayout>
  );
}
