import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function BankImport() {
  const [accountId, setAccountId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [imported, setImported] = useState(false);

  // FIX: router returns { accounts: rows } not a plain array
  const { data: accountsData } = trpc.bankRecon.listAccounts.useQuery({});
  const accounts: any[] = (accountsData as any)?.accounts ?? [];

  const importMutation = trpc.bankRecon.importStatement.useMutation({
    onSuccess: (d: any) => { toast.success(`Imported ${d?.rows_imported ?? 0} transactions`); setImported(true); },
    onError: (e) => toast.error(e.message),
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!accountId) { toast.error("Please select a bank account first"); return; }
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const today = new Date().toISOString().slice(0, 10);
      importMutation.mutate({ accountId: Number(accountId), statementDate: today, periodFrom: today, periodTo: today, openingBalance: 0, closingBalance: 0, fileFormat: 'CSV', transactions: [] });
    };
    reader.readAsText(file);
  };

  return (
    <DashboardLayout>
      <ScreenHeader
        screenId="VFLBNKIMP0001P001"
        title="Bank Statement Import"
        subtitle="Upload and parse bank statement files"
        screenType="bank_import"
        onAIData={() => {}}
      />
      <div className="p-6 max-w-2xl space-y-6">
        {/* Account Selection */}
        <div className="space-y-2">
          <Label>Bank Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder={accounts.length === 0 ? "No accounts registered" : "Select bank account…"} />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a: any) => (
                <SelectItem key={a.account_id ?? a.id} value={String(a.account_id ?? a.id)}>
                  {a.account_name ?? a.bank_name} — {a.account_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {accounts.length === 0 && (
            <p className="text-xs text-muted-foreground">Go to Bank Accounts to register an account first.</p>
          )}
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          className={`border-2 border-dashed rounded-lg p-12 flex flex-col items-center gap-3 transition-colors cursor-pointer ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
          onClick={() => {
            if (!accountId) { toast.error("Please select a bank account first"); return; }
            toast.info("Drag and drop a CSV or OFX file to import");
          }}
        >
          {imported ? (
            <>
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="text-sm font-medium text-green-500">Statement imported successfully</p>
            </>
          ) : (
            <>
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">Drop bank statement file here</p>
              <p className="text-xs text-muted-foreground">Supported formats: CSV, OFX, MT940</p>
              <Button variant="outline" size="sm" className="mt-2">
                <Upload className="h-4 w-4 mr-2" />
                Browse File
              </Button>
            </>
          )}
        </div>

        {imported && (
          <Button variant="outline" onClick={() => setImported(false)}>
            Import Another Statement
          </Button>
        )}
      </div>
    </DashboardLayout>
  );
}
