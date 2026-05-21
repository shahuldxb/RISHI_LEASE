import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, X } from "lucide-react";
import { groupDrCrByAmount, fmtAmount, type JVLine, type JVGroup } from "@/lib/jvGrouping";

/* ─── Screen ID ─────────────────────────────────────────────────────────── */
const SCREEN_ID = "VAMORTMSTR001";

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtPeriod(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

export default function AmortizationMaster() {
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [calcGroup, setCalcGroup] = useState<JVGroup | null>(null);

  /* ─── Queries ────────────────────────────────────────────────────────── */
  const contractsQ = trpc.transactionEngine.getContracts.useQuery();
  const initialJvQ = trpc.journalVoucher.getInitialJV.useQuery(
    { contract_id: selectedContractId! },
    { enabled: !!selectedContractId }
  );

  /* ─── Derived data ───────────────────────────────────────────────────── */
  const contracts = contractsQ.data ?? [];
  const selectedContract = contracts.find((c: any) => c.contract_id === selectedContractId);
  const jvData = initialJvQ.data as { header: any; lines: any[] } | undefined;

  const groups: JVGroup[] = useMemo(() => {
    if (!jvData?.lines?.length) return [];
    const lines: JVLine[] = jvData.lines.map((l: any) => ({
      line_id: l.line_id,
      line_seq: l.line_seq,
      dr_cr: l.dr_cr,
      account_code: l.account_code,
      account_name: l.account_name,
      amount: Number(l.amount ?? 0),
      description: l.description,
      currency: l.currency,
      calc_explanation: l.calc_explanation,
    }));
    return groupDrCrByAmount(lines);
  }, [jvData]);

  const totalDebit = groups.reduce((s, g) => s + g.drTotal, 0);
  const totalCredit = groups.reduce((s, g) => s + g.crTotal, 0);
  const currency = jvData?.lines?.[0]?.currency ?? selectedContract?.currency ?? "QAR";

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* ─── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
          <div className="flex items-center gap-4">
            <FileText className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Amortization Master</h1>
            <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">{SCREEN_ID}</span>
          </div>
        </div>

        {/* ─── Lease Selector ──────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-border bg-card/30">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium text-muted-foreground">Select Lease:</label>
            <Select
              value={selectedContractId?.toString() ?? ""}
              onValueChange={(v) => setSelectedContractId(Number(v))}
            >
              <SelectTrigger className="w-[400px] bg-background">
                <SelectValue placeholder="Choose a lease contract..." />
              </SelectTrigger>
              <SelectContent>
                {contracts.map((c: any) => (
                  <SelectItem key={c.contract_id} value={c.contract_id.toString()}>
                    <span className="flex items-center gap-6 w-full">
                      <span className="text-red-400 font-mono font-semibold">{c.contract_ref}</span>
                      <span className="text-muted-foreground">{c.lessor_name ?? c.asset_type ?? 'Lease'}</span>
                      <span className="text-muted-foreground">—</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedContract && (
              <div className="flex items-center gap-6 text-xs text-muted-foreground ml-4">
                <span><strong className="text-foreground">Commencement:</strong> {fmtDate(selectedContract.commencement_date)}</span>
                <span><strong className="text-foreground">Period:</strong> {fmtPeriod(selectedContract.commencement_date)}</span>
                <span><strong className="text-foreground">Term:</strong> {selectedContract.term_months} months</span>
                <span><strong className="text-foreground">IBR:</strong> {(Number(selectedContract.ibr ?? 0) * 100).toFixed(4)}%</span>
              </div>
            )}
          </div>
          {jvData?.header && (
            <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
              <span><strong className="text-foreground">Lessee:</strong> {jvData.header.lessee_name ?? "N/A"}</span>
              <span><strong className="text-foreground">JV Number:</strong> <span className="text-primary font-mono">{jvData.header.jv_number}</span></span>
              <span><strong className="text-foreground">Date:</strong> {fmtDate(jvData.header.posting_date)}</span>
              <span><strong className="text-foreground">Status:</strong>
                <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {jvData.header.status}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* ─── Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {!selectedContractId && (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Select a lease from the dropdown above to view the Day-1 Initial Recognition Journal Entry.
            </div>
          )}

          {selectedContractId && initialJvQ.isLoading && (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm animate-pulse">
              Loading initial journal entry...
            </div>
          )}

          {selectedContractId && !initialJvQ.isLoading && groups.length === 0 && (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              No Day-1 Initial Recognition JV found for this lease. Please ensure the lease has been submitted.
            </div>
          )}

          {groups.length > 0 && (
            <div className="space-y-6">
              {/* Title Banner */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Day-1 IFRS 16 Journal Entry (Auto-Generated on Submit)</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The following journal entry was automatically created in the JV Register when this lease was submitted.
                  </p>
                </div>
                <span className="ml-auto px-2 py-1 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Initial Recognition
                </span>
              </div>

              {/* Groups */}
              {groups.map((group, gi) => (
                <div key={group.id} className="rounded-lg border border-border overflow-hidden">
                  {/* Group Header */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/30 border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground">Group {gi + 1}</span>
                    <span className="text-xs text-muted-foreground">{group.label}</span>
                    <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-semibold ${group.balanced ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'}`}>
                      {group.balanced ? "Balanced" : "Unbalanced"}
                    </span>
                  </div>

                  {/* Group Table */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/20">
                        <th className="px-4 py-2 text-left w-12"></th>
                        <th className="px-4 py-2 text-left text-muted-foreground font-medium text-xs">Dr/Cr</th>
                        <th className="px-4 py-2 text-left text-muted-foreground font-medium text-xs">Account Code</th>
                        <th className="px-4 py-2 text-left text-muted-foreground font-medium text-xs">Account Name</th>
                        <th className="px-4 py-2 text-right text-muted-foreground font-medium text-xs">Debit</th>
                        <th className="px-4 py-2 text-right text-muted-foreground font-medium text-xs">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...group.drLines, ...group.crLines].map((line, li) => {
                        const isDr = line.dr_cr?.toUpperCase() === "DR";
                        return (
                          <tr key={`${group.id}-${li}`} className="border-t border-border/50 hover:bg-muted/10">
                            <td className="px-4 py-2.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400"
                                title="Show calculation"
                                onClick={() => setCalcGroup(group)}
                              >
                                <Calculator className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDr ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                                {line.dr_cr}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-red-400 font-semibold text-xs">{line.account_code}</td>
                            <td className="px-4 py-2.5">{line.account_name}</td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {isDr ? <span className="text-foreground">{currency} {Number(line.amount).toLocaleString("en-QA", { minimumFractionDigits: 2 })}</span> : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {!isDr ? <span className="text-foreground">{currency} {Number(line.amount).toLocaleString("en-QA", { minimumFractionDigits: 2 })}</span> : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}

              {/* Totals */}
              <div className="flex items-center justify-end gap-12 px-4 py-3 rounded-lg border border-border bg-muted/20">
                <span className="text-sm font-semibold">
                  Total Debit: <span className="text-green-400 font-mono">{currency} {totalDebit.toLocaleString("en-QA", { minimumFractionDigits: 2 })}</span>
                </span>
                <span className="text-sm font-semibold">
                  Total Credit: <span className="text-red-400 font-mono">{currency} {totalCredit.toLocaleString("en-QA", { minimumFractionDigits: 2 })}</span>
                </span>
              </div>

              {/* Auto-Post Notice */}
              <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5">
                <p className="text-xs text-red-400">
                  <strong>Auto-Post:</strong> The Day-1 IFRS 16 Journal Entry above will be automatically posted to the Journal
                  Voucher Register when you submit this lease. No additional approval is required.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Full-Screen Calc Explanation Modal ────────────────────────── */}
      {calcGroup && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col overflow-hidden">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Calculator className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Calculation Explanation</h2>
                <p className="text-xs text-muted-foreground">Group {calcGroup.id}: {calcGroup.label}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCalcGroup(null)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Group summary */}
              <div className="p-4 rounded-lg border border-border bg-muted/20">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Debit:</span>
                    <span className="ml-2 font-mono font-semibold text-green-400">{fmtAmount(calcGroup.drTotal, currency)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Credit:</span>
                    <span className="ml-2 font-mono font-semibold text-red-400">{fmtAmount(calcGroup.crTotal, currency)}</span>
                  </div>
                </div>
              </div>

              {/* Each line's explanation */}
              {[...calcGroup.drLines, ...calcGroup.crLines].map((line, i) => (
                <div key={i} className="rounded-lg border border-border overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b border-border">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${line.dr_cr?.toUpperCase() === 'DR' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                      {line.dr_cr}
                    </span>
                    <span className="font-mono text-red-400 text-xs font-semibold">{line.account_code}</span>
                    <span className="text-sm font-medium">{line.account_name}</span>
                    <span className="ml-auto font-mono text-sm font-semibold">
                      {fmtAmount(line.amount, currency)}
                    </span>
                  </div>
                  <div className="px-4 py-4 bg-[#0d1117]">
                    <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed">
                      {line.calc_explanation || "No calculation explanation available for this line."}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
