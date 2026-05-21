import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, RefreshCw, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const fmt = (n: number | null | undefined) => n != null ? Number(n).toLocaleString("en-AE", { maximumFractionDigits: 0 }) : "—";
const fmtK = (n: number | null | undefined) => n != null ? `QAR ${(Number(n) / 1000).toFixed(0)}K` : "—";

export default function IFRS16Disclosure() {
  const [periodEnd, setPeriodEnd] = useState("2025-03-31");
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const [submitted, setSubmitted] = useState("2025-03-31");

  const { data, isLoading, refetch } = trpc.accounting.reporting.disclosureNote.useQuery({ periodEnd: submitted });

  const utils = trpc.useUtils();
  const notifyMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Disclosure note sent to owner"),
    onError: (e) => toast.error(e.message),
  });

  const handleGenerate = () => {
    setSubmitted(periodEnd);
    toast.success("Disclosure note generated");
  };

  const rou = data?.rouAsset;
  const liab = data?.leaseLiability;
  const mat = data?.maturityAnalysis;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
  screenId="VFLIFRDSC0001P001"
  title="IFRS 16 Disclosure"
  subtitle="Financial statement disclosure notes"

          screenType="ifrs16_disclosure"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />

        {/* Period selector */}
        <Card>
          <CardContent className="pt-4 flex items-end gap-4">
            <div className="space-y-1">
              <Label>Reporting Period End</Label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="w-48" />
            </div>
            <Button onClick={handleGenerate} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Generate Disclosure
            </Button>
          </CardContent>
        </Card>

        {data && (
          <div className="space-y-6">
            {/* Note header */}
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  Note X — Leases (IFRS 16)
                  <Badge variant="outline" className="ml-auto">Period ending {submitted}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The Group leases various properties, vehicles, and equipment. Rental contracts are typically made for fixed periods of 1 to 15 years but may have extension options. Lease terms are negotiated on an individual basis and contain a wide range of different terms and conditions. The lease agreements do not impose any covenants other than the security interests in the leased assets that are held by the lessor.
                </p>
              </CardContent>
            </Card>

            {/* ROU Asset movement */}
            <Card>
              <CardHeader><CardTitle className="text-base">Right-of-Use Assets</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Movement</TableHead>
                      <TableHead className="text-right">QAR '000</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow><TableCell>Opening balance</TableCell><TableCell className="text-right font-mono">{fmt(Number(rou?.opening_rou) / 1000)}</TableCell></TableRow>
                    <TableRow><TableCell>Additions — new leases</TableCell><TableCell className="text-right font-mono text-emerald-600">—</TableCell></TableRow>
                    <TableRow><TableCell>Depreciation charge</TableCell><TableCell className="text-right font-mono text-red-600">({fmt(Number(rou?.depreciation_charge) / 1000)})</TableCell></TableRow>
                    <TableRow><TableCell>Remeasurements</TableCell><TableCell className="text-right font-mono">—</TableCell></TableRow>
                    <TableRow><TableCell>Disposals</TableCell><TableCell className="text-right font-mono">—</TableCell></TableRow>
                    <TableRow className="font-bold border-t-2">
                      <TableCell>Closing balance</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(rou?.closing_rou) / 1000)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <p className="text-xs text-muted-foreground mt-2">Total active leases: {rou?.lease_count}</p>
              </CardContent>
            </Card>

            {/* Lease liability movement */}
            <Card>
              <CardHeader><CardTitle className="text-base">Lease Liabilities</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Movement</TableHead>
                      <TableHead className="text-right">QAR '000</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow><TableCell>Opening balance</TableCell><TableCell className="text-right font-mono">{fmt(Number(liab?.opening_liability) / 1000)}</TableCell></TableRow>
                    <TableRow><TableCell>New leases recognised</TableCell><TableCell className="text-right font-mono text-emerald-600">—</TableCell></TableRow>
                    <TableRow><TableCell>Interest accrued</TableCell><TableCell className="text-right font-mono">{fmt(Number(liab?.interest_expense) / 1000)}</TableCell></TableRow>
                    <TableRow><TableCell>Lease payments made</TableCell><TableCell className="text-right font-mono text-red-600">({fmt(Number(liab?.lease_payments_year) / 1000)})</TableCell></TableRow>
                    <TableRow><TableCell>Remeasurements</TableCell><TableCell className="text-right font-mono">—</TableCell></TableRow>
                    <TableRow className="font-bold border-t-2">
                      <TableCell>Closing balance</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(liab?.closing_liability) / 1000)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <Separator className="my-4" />

                {/* Current/non-current split */}
                <p className="text-sm font-semibold mb-2">Maturity Analysis of Lease Liabilities</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">QAR '000</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow><TableCell>Within 1 year (current)</TableCell><TableCell className="text-right font-mono">{fmt(Number(mat?.within_1yr) / 1000)}</TableCell></TableRow>
                    <TableRow><TableCell>1 to 3 years</TableCell><TableCell className="text-right font-mono">{fmt(Number(mat?.yr_1_to_3) / 1000)}</TableCell></TableRow>
                    <TableRow><TableCell>3 to 5 years</TableCell><TableCell className="text-right font-mono">{fmt(Number(mat?.yr_3_to_5) / 1000)}</TableCell></TableRow>
                    <TableRow><TableCell>Over 5 years</TableCell><TableCell className="text-right font-mono">{fmt(Number(mat?.over_5yr) / 1000)}</TableCell></TableRow>
                    <TableRow className="font-bold border-t-2">
                      <TableCell>Total undiscounted lease payments</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt((Number(mat?.within_1yr) + Number(mat?.yr_1_to_3) + Number(mat?.yr_3_to_5) + Number(mat?.over_5yr)) / 1000)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* P&L charges */}
            <Card>
              <CardHeader><CardTitle className="text-base">Amounts Recognised in Profit or Loss</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">QAR '000</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow><TableCell>Depreciation of right-of-use assets</TableCell><TableCell className="text-right font-mono">{fmt(Number(rou?.depreciation_charge) / 1000)}</TableCell></TableRow>
                    <TableRow><TableCell>Interest expense on lease liabilities</TableCell><TableCell className="text-right font-mono">{fmt(Number(liab?.interest_expense) / 1000)}</TableCell></TableRow>
                    <TableRow>
                      <TableCell>Expense relating to short-term leases</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt((data.exemptions?.find((e: any) => e.exemption_type === "SHORT_TERM")?.total_annual_expense ?? 0) / 1000)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Expense relating to low-value asset leases</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt((data.exemptions?.find((e: any) => e.exemption_type === "LOW_VALUE")?.total_annual_expense ?? 0) / 1000)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Variable lease payments not in measurement</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(data.variableRent?.total) / 1000)}</TableCell>
                    </TableRow>
                    <TableRow className="font-bold border-t-2">
                      <TableCell>Total lease-related charges</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt((Number(rou?.depreciation_charge) + Number(liab?.interest_expense) + (data.exemptions?.reduce((a: number, e: any) => a + Number(e.total_annual_expense), 0) ?? 0)) / 1000)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Cash flow */}
            <Card>
              <CardHeader><CardTitle className="text-base">Cash Flow Information</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <TableRow><TableCell>Total cash outflow for leases</TableCell><TableCell className="text-right font-mono">{fmt(Number(liab?.lease_payments_year) / 1000)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />Generating disclosure note...
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
