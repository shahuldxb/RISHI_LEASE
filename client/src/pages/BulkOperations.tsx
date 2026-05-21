import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Download, CheckCircle, XCircle, AlertCircle, FileSpreadsheet, RefreshCw, Play, FileDown } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const IMPORT_TYPES = [
  { value: "LEASE_REGISTER", label: "Lease Register", desc: "Import new leases with full IFRS 16 fields" },
  { value: "AMORTISATION", label: "Amortisation Schedule", desc: "Import pre-calculated amortisation schedules" },
  { value: "IBR_RATES", label: "IBR Rates", desc: "Bulk upload incremental borrowing rates" },
  { value: "INVOICES", label: "Invoices", desc: "Import payables invoices in bulk" },
  { value: "LESSOR_CONTACTS", label: "Lessor Contacts", desc: "Import lessor contact information" },
] as const;

type ImportType = typeof IMPORT_TYPES[number]["value"];

export default function BulkOperations() {
  const [activeTab, setActiveTab] = useState("import");
  const [importType, setImportType] = useState<ImportType>("LEASE_REGISTER");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [remeasureForm, setRemeasureForm] = useState({ new_ibr: "", currency: "QAR", reason: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: history = [], refetch: refetchHistory } = trpc.accounting.bulk.operationLog.useQuery();

  const validateMutation = trpc.accounting.bulk.validateFile.useMutation({
    onSuccess: (data) => {
      setValidationResult(data);
      if (data.valid) toast.success(`File validated: ${data.rowCount} rows, all columns present`);
      else toast.error(`Validation failed: ${data.errors?.join(", ")}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const importMutation = trpc.accounting.bulk.importFile.useMutation({
    onSuccess: (data) => {
      setImportResult(data);
      setIsImporting(false);
      refetchHistory();
      if (data.successCount > 0 && data.errorCount === 0) {
        toast.success(`Successfully imported ${data.successCount} records`);
      } else if (data.successCount > 0) {
        toast.warning(`Imported ${data.successCount} records with ${data.errorCount} errors`);
      } else {
        toast.error(`Import failed: ${data.errorCount} errors`);
      }
    },
    onError: (err) => {
      setIsImporting(false);
      toast.error(err.message);
    },
  });

  const remeasureMutation = trpc.accounting.bulk.massRemeasure.useMutation({
    onSuccess: (data) => {
      refetchHistory();
      toast.success(`Mass remeasurement complete: ${data.successCount} contracts updated, ${data.errorCount} errors`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFile = (file: File) => {
    setUploadFile(file);
    setValidationResult(null);
    setImportResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const doValidate = async () => {
    if (!uploadFile) return;
    const base64 = await readFileAsBase64(uploadFile);
    validateMutation.mutate({ type: importType, base64 });
  };

  const doImport = async () => {
    if (!uploadFile) return;
    setIsImporting(true);
    const base64 = await readFileAsBase64(uploadFile);
    importMutation.mutate({ type: importType, base64, filename: uploadFile.name });
  };

  const doDownloadTemplate = async (type: ImportType) => {
    try {
      const res = await fetch(`/api/trpc/accounting.bulk.downloadTemplate?input=${encodeURIComponent(JSON.stringify({ json: { type } }))}`, { credentials: 'include' });
      const json = await res.json();
      const base64 = json?.result?.data?.json?.base64 || json?.result?.data?.base64;
      if (!base64) { toast.error("Failed to generate template"); return; }
      const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type.toLowerCase()}_template.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    } catch { toast.error("Download failed"); }
  };

  const doMassRemeasure = () => {
    const ibr = parseFloat(remeasureForm.new_ibr);
    if (!ibr || ibr <= 0 || ibr > 50) { toast.error("Enter a valid IBR rate (0.01 - 50)"); return; }
    if (!remeasureForm.reason.trim()) { toast.error("Please provide a reason"); return; }
    remeasureMutation.mutate({ new_ibr: ibr, currency: remeasureForm.currency, reason: remeasureForm.reason });
  };

  const statusBadge = (s: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      COMPLETED: "default", PARTIAL: "secondary", RUNNING: "outline", FAILED: "destructive"
    };
    return <Badge variant={variants[s] || "destructive"}>{s}</Badge>;
  };

  return (
    <DashboardLayout>
      <ScreenHeader
        screenId="VFLBLKOPS0001P001"
        title="Bulk Operations"
        subtitle="Mass import, remeasurement, and batch processing"
        screenType="bulk_operations"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="import">Bulk Import</TabsTrigger>
          <TabsTrigger value="remeasure">Mass Remeasure</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ─── Bulk Import Tab ─────────────────────────────────────── */}
        <TabsContent value="import" className="space-y-4 mt-4">
          {/* Template Downloads */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileDown className="w-4 h-4" /> Download Templates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {IMPORT_TYPES.map(t => (
                  <Button
                    key={t.value}
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2 text-left h-auto py-2"
                    onClick={() => doDownloadTemplate(t.value)}
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <div>
                      <div className="font-medium text-xs">{t.label}</div>
                      <div className="text-[10px] text-muted-foreground">{t.desc}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Upload Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4" /> Upload & Import
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Import Type Selection */}
              <div className="flex items-center gap-4">
                <Label className="shrink-0">Import Type:</Label>
                <Select value={importType} onValueChange={(v) => setImportType(v as ImportType)}>
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPORT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                {uploadFile ? (
                  <div>
                    <p className="font-medium text-sm">{uploadFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium">Drop Excel file here or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">Supports .xlsx and .xls files</p>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              {/* Actions */}
              {uploadFile && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={doValidate} disabled={validateMutation.isPending}>
                    {validateMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <AlertCircle className="w-4 h-4 mr-2" />}
                    Validate
                  </Button>
                  <Button onClick={doImport} disabled={isImporting}>
                    {isImporting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    Import
                  </Button>
                  <Button variant="ghost" onClick={() => { setUploadFile(null); setValidationResult(null); setImportResult(null); }}>
                    Clear
                  </Button>
                </div>
              )}

              {/* Validation Result */}
              {validationResult && (
                <Card className={validationResult.valid ? "border-emerald-500/50 bg-emerald-500/5" : "border-red-500/50 bg-red-500/5"}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      {validationResult.valid ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                      <span className="font-medium text-sm">{validationResult.valid ? "Validation Passed" : "Validation Failed"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Rows: {validationResult.rowCount} | Columns: {validationResult.columns?.length || 0}</p>
                    {validationResult.missingColumns?.length > 0 && (
                      <p className="text-xs text-red-500 mt-1">Missing: {validationResult.missingColumns.join(", ")}</p>
                    )}
                    {validationResult.columns?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">Found: {validationResult.columns.join(", ")}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Import Result */}
              {importResult && (
                <Card className={importResult.errorCount === 0 ? "border-emerald-500/50 bg-emerald-500/5" : "border-amber-500/50 bg-amber-500/5"}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      {importResult.errorCount === 0 ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
                      <span className="font-medium text-sm">Import Complete</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center mt-3">
                      <div>
                        <p className="text-lg font-bold">{importResult.totalRows}</p>
                        <p className="text-[10px] text-muted-foreground">Total Rows</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-emerald-600">{importResult.successCount}</p>
                        <p className="text-[10px] text-muted-foreground">Imported</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-red-600">{importResult.errorCount}</p>
                        <p className="text-[10px] text-muted-foreground">Errors</p>
                      </div>
                    </div>
                    {importResult.errors?.length > 0 && (
                      <div className="mt-3 max-h-40 overflow-y-auto">
                        <p className="text-xs font-medium mb-1">Errors:</p>
                        {importResult.errors.slice(0, 20).map((e: any, i: number) => (
                          <p key={i} className="text-[11px] text-red-600">Row {e.row}: {e.message}</p>
                        ))}
                        {importResult.errors.length > 20 && (
                          <p className="text-[11px] text-muted-foreground">...and {importResult.errors.length - 20} more</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Progress bar during import */}
              {isImporting && (
                <div className="space-y-2">
                  <Progress className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">Processing import...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Mass Remeasurement Tab ──────────────────────────────── */}
        <TabsContent value="remeasure" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Mass Remeasurement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Apply a new IBR rate to all active contracts in a given currency. This will create remeasurement events
                and recalculate lease liabilities for each affected contract.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>New IBR Rate (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="50"
                    placeholder="e.g. 5.25"
                    value={remeasureForm.new_ibr}
                    onChange={(e) => setRemeasureForm(p => ({ ...p, new_ibr: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={remeasureForm.currency} onValueChange={(v) => setRemeasureForm(p => ({ ...p, currency: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QAR">QAR - Qatar Riyal</SelectItem>
                      <SelectItem value="EGP">EGP - Egyptian Pound</SelectItem>
                      <SelectItem value="USD">USD - US Dollar</SelectItem>
                      <SelectItem value="AED">AED - UAE Dirham</SelectItem>
                      <SelectItem value="GBP">GBP - British Pound</SelectItem>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Input
                    placeholder="e.g. Central Bank rate revision Q2 2026"
                    value={remeasureForm.reason}
                    onChange={(e) => setRemeasureForm(p => ({ ...p, reason: e.target.value }))}
                  />
                </div>
              </div>

              <Button
                onClick={doMassRemeasure}
                disabled={remeasureMutation.isPending}
                className="mt-2"
              >
                {remeasureMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Execute Mass Remeasurement
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Operation History Tab ───────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Operation History</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => refetchHistory()}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No operations recorded yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Operation</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Success</TableHead>
                        <TableHead className="text-right">Errors</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Completed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((op: any) => (
                        <TableRow key={op.bulk_op_id}>
                          <TableCell className="text-xs">{op.bulk_op_id}</TableCell>
                          <TableCell className="text-xs font-medium">{op.operation_type?.replace(/_/g, " ")}</TableCell>
                          <TableCell>{statusBadge(op.status)}</TableCell>
                          <TableCell className="text-right text-xs">{op.total_records ?? "-"}</TableCell>
                          <TableCell className="text-right text-xs text-emerald-600">{op.success_count ?? "-"}</TableCell>
                          <TableCell className="text-right text-xs text-red-600">{op.error_count ?? "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {op.started_at ? new Date(op.started_at).toLocaleString() : "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {op.completed_at ? new Date(op.completed_at).toLocaleString() : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
