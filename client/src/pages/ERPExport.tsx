import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Send, CheckCircle, Clock, AlertCircle, Database, FileSpreadsheet, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { groupDrCrByAmount } from "@/lib/jvGrouping";

const fmt = (n: any) => n != null ? `QAR ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

export default function ERPExport() {
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState("2026-01-01");
  const [toDate, setToDate] = useState("2026-12-31");
  const [showPreview, setShowPreview] = useState(false);

  const { data: configs = [] } = trpc.accounting.erpExport.configs.useQuery();
  const { data: exports = [], refetch: refetchLog } = trpc.accounting.erpExport.exportLog.useQuery();

  const { data: previewData, isLoading: previewLoading, refetch: refetchPreview } = trpc.accounting.erpExport.preview.useQuery(
    { period_from: fromDate, period_to: toDate },
    { enabled: showPreview }
  );

  const generate = trpc.accounting.erpExport.generateExport.useMutation({
    onSuccess: (data: any) => {
      refetchLog();
      refetchPreview();
      let msg = `Export generated: ${data.journalCount} JVs, ${data.rowCount} lines — status updated to ERP`;
      if (data.alreadyExportedCount > 0) {
        msg += `. Note: ${data.alreadyExportedCount} JV(s) were already in ERP status and were skipped.`;
      }
      toast.success(msg);
      // Trigger CSV download
      const blob = new Blob([data.csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Group preview data by JV number
  const groupedPreview = useMemo(() => {
    if (!previewData) return [];
    const map = new Map<string, { jv: any; lines: any[] }>();
    for (const row of previewData) {
      const key = row.jv_number;
      if (!map.has(key)) {
        map.set(key, {
          jv: { jv_number: row.jv_number, jv_type: row.jv_type, posting_date: row.posting_date, jv_description: row.jv_description, period_year: row.period_year, period_month: row.period_month, currency: row.currency, status: row.status, staff_name: row.staff_name, lease_reference: row.lease_reference, lessor_name: row.lessor_name, lease_start: row.lease_start, lease_end: row.lease_end, asset_description: row.asset_description, accounting_period: row.accounting_period },
          lines: [],
        });
      }
      map.get(key)!.lines.push(row);
    }
    return Array.from(map.values());
  }, [previewData]);

  // Summary stats
  const totalJVs = groupedPreview.length;
  const postedJVs = groupedPreview.filter(g => g.jv.status === 'Posted').length;
  const erpJVs = groupedPreview.filter(g => g.jv.status === 'ERP').length;
  const totalLines = previewData?.length ?? 0;
  const totalDebit = previewData?.filter((r: any) => r.dr_cr === 'Dr').reduce((s: number, r: any) => s + Number(r.amount || 0), 0) ?? 0;
  const totalCredit = previewData?.filter((r: any) => r.dr_cr === 'Cr').reduce((s: number, r: any) => s + Number(r.amount || 0), 0) ?? 0;

  const selectedConfig = configs.find((c: any) => c.config_id === selectedConfigId);

  const statusIcon = (s: string) => {
    if (s === "COMPLETED") return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    if (s === "PENDING") return <Clock className="w-4 h-4 text-amber-500" />;
    return <AlertCircle className="w-4 h-4 text-red-500" />;
  };

  const handlePreview = () => {
    setShowPreview(true);
    refetchPreview();
  };

  const handleExport = () => {
    if (!selectedConfigId) {
      toast.error("Please select an ERP system first");
      return;
    }
    if (showPreview && postedJVs === 0 && erpJVs > 0) {
      toast.error(`All ${erpJVs} JV(s) in this period have already been sent to ERP. Nothing to export.`);
      return;
    }
    generate.mutate({
      config_id: selectedConfigId,
      period_from: fromDate,
      period_to: toDate,
      erp_type: selectedConfig?.erp_type || 'CUSTOM',
    });
  };

  return (
    <DashboardLayout>
      <ScreenHeader
        screenId="VFLERPEXP0001P001"
        title="ERP Export"
        subtitle="GL journal export to SAP, Oracle, and other ERP systems"
        screenType="erp_export"
      />

      <div className="space-y-6 p-4">
        {/* Controls Row */}
        <Card className="border-slate-700 bg-slate-800/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-400" />
              Export Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label className="text-xs text-slate-400 mb-1 block">ERP System</Label>
                <Select
                  value={selectedConfigId?.toString() ?? ""}
                  onValueChange={(v) => setSelectedConfigId(Number(v))}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-600">
                    <SelectValue placeholder="Select ERP system..." />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.map((c: any) => (
                      <SelectItem key={c.config_id} value={c.config_id.toString()}>
                        {c.config_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-400 mb-1 block">Period From</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-slate-900 border-slate-600"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400 mb-1 block">Period To</Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-slate-900 border-slate-600"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handlePreview}
                  disabled={previewLoading}
                  className="flex-1"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  {previewLoading ? "Loading..." : "Preview"}
                </Button>
                <Button
                  onClick={handleExport}
                  disabled={generate.isPending || !selectedConfigId}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Download className="w-4 h-4 mr-1" />
                  {generate.isPending ? "Exporting..." : "Export CSV"}
                </Button>
              </div>
            </div>
            {selectedConfig && (
              <div className="mt-3 flex gap-4 text-xs text-slate-400">
                <span>Format: <Badge variant="outline" className="text-xs">{selectedConfig.export_format}</Badge></span>
                <span>Date Format: <Badge variant="outline" className="text-xs">{selectedConfig.date_format}</Badge></span>
                <span>Delimiter: <Badge variant="outline" className="text-xs">{selectedConfig.delimiter === ',' ? 'Comma' : selectedConfig.delimiter}</Badge></span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary KPIs */}
        {showPreview && previewData && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="border-slate-700 bg-slate-800/60">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-400">{totalJVs}</div>
                <div className="text-xs text-slate-400">Total JVs</div>
              </CardContent>
            </Card>
            <Card className={`border-slate-700 ${postedJVs > 0 ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-slate-800/60'}`}>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">{postedJVs}</div>
                <div className="text-xs text-slate-400">Ready to Export</div>
              </CardContent>
            </Card>
            <Card className={`border-slate-700 ${erpJVs > 0 ? 'bg-amber-900/30 border-amber-700/50' : 'bg-slate-800/60'}`}>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-amber-400">{erpJVs}</div>
                <div className="text-xs text-slate-400">Already Sent to ERP</div>
              </CardContent>
            </Card>
            <Card className="border-slate-700 bg-slate-800/60">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-slate-200">{totalLines}</div>
                <div className="text-xs text-slate-400">Total Lines</div>
              </CardContent>
            </Card>
            <Card className="border-slate-700 bg-slate-800/60">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">{fmt(totalDebit)}</div>
                <div className="text-xs text-slate-400">Total Debit</div>
              </CardContent>
            </Card>
            <Card className="border-slate-700 bg-slate-800/60">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-rose-400">{fmt(totalCredit)}</div>
                <div className="text-xs text-slate-400">Total Credit</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Preview Table — Grouped by JV, Dr/Cr paired by amount */}
        {showPreview && previewData && (
          <Card className="border-slate-700 bg-slate-800/60">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-5 h-5 text-violet-400" />
                JV Lines — Preview ({fromDate} to {toDate})
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => refetchPreview()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {groupedPreview.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg font-medium">No posted JVs found</p>
                  <p className="text-sm mt-1">No journal vouchers with status "Posted" exist for the selected date range.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedPreview.map(({ jv, lines }) => {
                    // Group Dr/Cr lines by matching amounts
                    const groups = groupDrCrByAmount(lines.map((l: any) => ({
                      dr_cr: l.dr_cr,
                      amount: Number(l.amount || 0),
                      account_code: l.account_code,
                      account_name: l.account_name,
                      description: l.line_description,
                      cost_centre: l.cost_centre,
                      contract_ref: l.contract_ref,
                    })));

                    return (
                      <div key={jv.jv_number} className="border border-slate-700 rounded-lg overflow-hidden">
                        {/* JV Header — Row 1: Core identifiers */}
                        <div className={`px-4 py-2 flex items-center gap-4 text-sm border-b border-slate-700/50 ${jv.status === 'ERP' ? 'bg-amber-900/20' : 'bg-slate-900/80'}`}>
                          <Badge variant="outline" className="text-blue-400 border-blue-500/40 font-mono">{jv.jv_number}</Badge>
                          <Badge className="bg-violet-500/20 text-violet-300 text-xs">{jv.jv_type}</Badge>
                          {jv.status === 'ERP' && <Badge className="bg-amber-500/20 text-amber-300 text-xs border border-amber-500/40">Sent to ERP</Badge>}
                          <span className="text-slate-400">Period: {jv.accounting_period || `${jv.period_year}-${String(jv.period_month).padStart(2, '0')}`}</span>
                          <span className="text-slate-400">Posted: {new Date(jv.posting_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          <span className="text-slate-300 flex-1 truncate">{jv.jv_description}</span>
                        </div>
                        {/* JV Header — Row 2: Lease & Staff details */}
                        <div className="bg-slate-900/60 px-4 py-1.5 flex items-center gap-6 text-xs flex-wrap">
                          {jv.lease_reference && (
                            <span className="text-slate-400">Lease: <span className="text-amber-400 font-mono">{jv.lease_reference}</span></span>
                          )}
                          {jv.lessor_name && (
                            <span className="text-slate-400">Lessor: <span className="text-slate-300">{jv.lessor_name}</span></span>
                          )}
                          {jv.asset_description && (
                            <span className="text-slate-400">Asset: <span className="text-slate-300">{jv.asset_description}</span></span>
                          )}
                          {jv.staff_name && (
                            <span className="text-slate-400">Prepared by: <span className="text-cyan-400">{jv.staff_name}</span></span>
                          )}
                          {jv.currency && (
                            <span className="text-slate-400">Currency: <span className="text-slate-300">{jv.currency}</span></span>
                          )}
                        </div>
                        {/* Grouped Dr/Cr Lines */}
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-700 hover:bg-transparent">
                              <TableHead className="w-14 text-center">Dr/Cr</TableHead>
                              <TableHead className="w-20">GL Code</TableHead>
                              <TableHead>Account Name</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right w-36 text-emerald-400">Debit</TableHead>
                              <TableHead className="text-right w-36 text-rose-400">Credit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                  {groups.map((group, gi) => {
                              const allLines = [...group.drLines, ...group.crLines];
                              return allLines.map((line, li) => (
                                <TableRow
                                  key={`${gi}-${li}`}
                                  className={`border-slate-700/50 ${gi % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-800/60'} ${li === 0 && gi > 0 ? 'border-t-2 border-slate-600/50' : ''}`}
                                >
                                  <TableCell className="text-center">
                                    <Badge className={`text-xs ${line.dr_cr?.toUpperCase() === 'DR' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                      {line.dr_cr}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-mono text-sm text-slate-300">{line.account_code}</TableCell>
                                  <TableCell className="text-slate-300">{line.account_name}</TableCell>
                                  <TableCell className="text-slate-400 text-sm">{line.description}</TableCell>
                                  <TableCell className="text-right font-mono text-emerald-400">
                                    {line.dr_cr?.toUpperCase() === 'DR' ? fmt(line.amount) : '\u2014'}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-rose-400">
                                    {line.dr_cr?.toUpperCase() === 'CR' ? fmt(line.amount) : '\u2014'}
                                  </TableCell>
                                </TableRow>
                              ));
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Export History */}
        <Card className="border-slate-700 bg-slate-800/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-5 h-5 text-amber-400" />
              Export History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {exports.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No exports yet. Select a date range and click Export.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-center">Journals</TableHead>
                    <TableHead className="text-center">Lines</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exports.map((exp: any, i: number) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="text-slate-300">
                        {exp.export_date ? new Date(exp.export_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </TableCell>
                      <TableCell className="text-slate-400">{exp.period_from instanceof Date ? exp.period_from.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : exp.period_from} → {exp.period_to instanceof Date ? exp.period_to.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : exp.period_to}</TableCell>
                      <TableCell className="text-center">{exp.journal_count}</TableCell>
                      <TableCell className="text-center">{exp.line_count}</TableCell>
                      <TableCell className="text-center flex items-center justify-center gap-1">
                        {statusIcon(exp.status)}
                        <span className="text-xs">{exp.status}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
