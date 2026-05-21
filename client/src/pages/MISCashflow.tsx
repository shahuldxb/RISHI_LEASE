import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { DollarSign } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toast } from "sonner";

export default function MISCashflow() {
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const { data: forecast } = trpc.mis.getCashFlowForecast.useQuery({ months: 12 });

  const utils = trpc.useUtils();
  const notifyMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Report sent to owner"),
    onError: (e) => toast.error(e.message),
  });
  const rows: any[] = Array.isArray(forecast) ? forecast : (forecast as any)?.forecast ?? [];

  const chartData = rows.map((r: any) => ({
    month: r.period ?? r.month,
    principal: Number(r.principal_payment ?? 0),
    interest: Number(r.interest_expense ?? 0),
    total: Number(r.total_payment ?? 0),
  }));

  const totalForecast = chartData.reduce((s, r) => s + r.total, 0);

  return (
    <DashboardLayout>
      <ScreenHeader
  screenId="VFLMISCSH0001P001"
  title="Cash Flow Forecast"
  subtitle="Portfolio cash flow projection and analysis"

          screenType="mis_cashflow"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />
    </DashboardLayout>
  );
}
