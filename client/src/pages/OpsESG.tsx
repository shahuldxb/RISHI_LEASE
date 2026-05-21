import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Leaf } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ESG_DATA = [
  { month: "Jan", carbon: 0, energy: 0, water: 0 },
  { month: "Feb", carbon: 0, energy: 0, water: 0 },
  { month: "Mar", carbon: 0, energy: 0, water: 0 },
  { month: "Apr", carbon: 0, energy: 0, water: 0 },
];

const ESG_METRICS = [
  { label: "Total Carbon Footprint", value: "0 tCO₂e", desc: "YTD across all leased assets", color: "text-green-400" },
  { label: "Energy Consumption", value: "0 MWh", desc: "YTD electricity usage", color: "text-blue-400" },
  { label: "Water Usage", value: "0 kL", desc: "YTD water consumption", color: "text-cyan-400" },
  { label: "ESG Score", value: "N/A", desc: "Composite sustainability score", color: "text-amber-400" },
];

export default function OpsESG() {
  const utils = trpc.useUtils();
  const actionMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Action completed successfully"),
    onError: (e: any) => toast.error(e.message),
  });
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  return (
    <DashboardLayout>
      <ScreenHeader
  screenId="VFLOPSESG0001P001"
  title="ESG Dashboard"
  subtitle="Environmental, social, and governance metrics"

          screenType="ops_esg"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />
    </DashboardLayout>
  );
}
