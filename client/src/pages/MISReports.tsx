import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Download, Play } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";

const REPORT_TEMPLATES = [
  { id: "lease_register", name: "Lease Register Report", description: "Full list of all active leases with key terms" },
  { id: "amortisation_summary", name: "Amortisation Summary", description: "IFRS 16 amortisation schedule summary by period" },
  { id: "ifrs16_disclosure", name: "IFRS 16 Disclosure Pack", description: "Full IFRS 16 note disclosure for financial statements" },
  { id: "maturity_analysis", name: "Lease Maturity Analysis", description: "Undiscounted future lease payments by maturity band" },
  { id: "payment_forecast", name: "Payment Forecast Report", description: "12-month forward-looking payment schedule" },
  { id: "rou_movement", name: "ROU Asset Movement", description: "Right-of-use asset additions, depreciation, and NBV" },
  { id: "lease_liability", name: "Lease Liability Roll-forward", description: "Opening balance, additions, payments, and closing balance" },
  { id: "insurance_register", name: "Insurance Policy Register", description: "All active insurance policies with renewal dates" },
  { id: "cheque_register", name: "Cheque Register Report", description: "All issued cheques with status and clearance details" },
  { id: "bank_recon_summary", name: "Bank Reconciliation Summary", description: "Reconciliation status per bank account" },
];

export default function MISReports() {
  const utils = trpc.useUtils();
  const actionMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Action completed successfully"),
    onError: (e: any) => toast.error(e.message),
  });
  const [selectedReport, setSelectedReport] = useState("");
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0,10));
  const [format, setFormat] = useState("PDF");

  const handleGenerate = () => {
    if (!selectedReport) { toast.error("Please select a report"); return; }
    toast.success(`Generating ${format} report...`);
    setTimeout(() => toast.info("Report ready for download (feature in progress)"), 2000);
  };

  return (
    <DashboardLayout>
      <ScreenHeader
  screenId="VFLMISRPT0001P001"
  title="MIS Reports"
  subtitle="Management information system reports and board pack"

          screenType="mis_reports"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />
    </DashboardLayout>
  );
}
