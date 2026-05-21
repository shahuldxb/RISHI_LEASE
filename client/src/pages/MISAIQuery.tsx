import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const SAMPLE_QUERIES = [
  "Show me all leases expiring in the next 90 days",
  "What is the total lease liability by asset type?",
  "List all overdue invoices with amounts greater than $10,000",
  "Show monthly depreciation for all tower site leases",
  "Which lessors have the most active leases?",
];

export default function MISAIQuery() {
  const [query, setQuery] = useState("");
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<any>(null);

  const queryMutation = trpc.genai.naturalLanguageQuery.useMutation({
    onSuccess: (data) => setResult(data),
    onError: (e) => toast.error(e.message),
  });

  const handleQuery = () => {
    if (!query.trim()) { toast.error("Please enter a query"); return; }
    setResult(null);
    queryMutation.mutate({ question: query });
  };

  const resultRows: any[] = result?.rows ?? [];
  const columns: string[] = resultRows.length > 0 ? Object.keys(resultRows[0]) : [];

  return (
    <DashboardLayout>
      <ScreenHeader
  screenId="VFLMISAIQ0001P001"
  title="AI Query"
  subtitle="Natural language text-to-SQL analytics"

          screenType="mis_ai_query"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />
    </DashboardLayout>
  );
}
