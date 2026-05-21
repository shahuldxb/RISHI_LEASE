import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toast } from "sonner";

export default function BankHistory() {
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const { data } = trpc.bankRecon.getHistory.useQuery({ pageNumber: 1, pageSize: 50 });

  const utils = trpc.useUtils();
  const notifyMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Reconciliation report sent"),
    onError: (e) => toast.error(e.message),
  });
  const rows: any[] = (data as any)?.sessions ?? [];
  return (
    <DashboardLayout>
      <ScreenHeader
  screenId="VFLBNKHST0001P001"
  title="Bank Statement History"
  subtitle="Imported bank statement archive"

          screenType="bank_history"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />
    </DashboardLayout>
  );
}
