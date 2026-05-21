import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const fmt = (n: any) => n != null ? `USD ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—";

export default function ASC842() {
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const { data: leases = [], isLoading, refetch } = trpc.asc842.list.useQuery();
  const sync = trpc.asc842.syncFromIFRS16.useMutation({
    onSuccess: (r: any) => { refetch(); toast.success(`Synced ${r.synced} leases to ASC 842`); },
    onError: (e: any) => toast.error(e.message),
  });

  const operatingLeases = (leases as any[]).filter((l: any) => l.asc842_classification === "OPERATING");
  const financeLeases = (leases as any[]).filter((l: any) => l.asc842_classification === "FINANCE");

  const totalROUA = (leases as any[]).reduce((s: number, l: any) => s + Number(l.rou_asset_asc842 ?? 0), 0);
  const totalLiability = (leases as any[]).reduce((s: number, l: any) => s + Number(l.lease_liability_asc842 ?? 0), 0);

  const handleExport = () => {
    const csv = ["Contract,Lessor,Asset,IFRS 16 Type,ASC 842 Type,ROU Asset (USD),Lease Liability (USD),Commencement,Expiry",
      ...(leases as any[]).map((l: any) => `"${l.contract_ref}","${l.lessor_name}","${l.asset_description}","${l.ifrs16_classification}","${l.asc842_classification}",${l.rou_asset_asc842},${l.lease_liability_asc842},${l.commencement_date?.slice(0,10)},${l.expiry_date?.slice(0,10)}`)
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "asc842-register.csv"; a.click();
    toast.success("ASC 842 register exported");
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
  screenId="VFLASC8420001P001"
  title="ASC 842 Compliance"
  subtitle="US GAAP lease accounting under ASC 842"

          screenType="asc842"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Leases", value: (leases as any[]).length, color: "text-foreground" },
            { label: "Finance Leases (ASC 842)", value: financeLeases.length, color: "text-blue-600" },
            { label: "Operating Leases (ASC 842)", value: operatingLeases.length, color: "text-emerald-600" },
            { label: "Total ROU Assets (USD)", value: fmt(totalROUA), color: "text-violet-600" },
          ].map(k => (
            <Card key={k.label}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{k.label}</p><p className={`text-2xl font-bold ${k.color}`}>{k.value}</p></CardContent></Card>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">IFRS 16 vs ASC 842 Classification Differences</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(leases as any[]).filter((l: any) => l.ifrs16_classification !== l.asc842_classification).map((l: any) => (
                  <div key={l.contract_id} className="flex items-center justify-between p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <span className="text-sm font-medium">{l.contract_ref}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{l.ifrs16_classification}</Badge>
                      <span className="text-muted-foreground text-xs">→</span>
                      <Badge className="text-xs bg-amber-500">{l.asc842_classification}</Badge>
                    </div>
                  </div>
                ))}
                {(leases as any[]).filter((l: any) => l.ifrs16_classification !== l.asc842_classification).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No classification differences</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Balance Sheet Impact (ASC 842)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "ROU Assets — Finance Leases", value: fmt(financeLeases.reduce((s: number, l: any) => s + Number(l.rou_asset_asc842 ?? 0), 0)) },
                { label: "ROU Assets — Operating Leases", value: fmt(operatingLeases.reduce((s: number, l: any) => s + Number(l.rou_asset_asc842 ?? 0), 0)) },
                { label: "Finance Lease Liabilities", value: fmt(financeLeases.reduce((s: number, l: any) => s + Number(l.lease_liability_asc842 ?? 0), 0)) },
                { label: "Operating Lease Liabilities", value: fmt(operatingLeases.reduce((s: number, l: any) => s + Number(l.lease_liability_asc842 ?? 0), 0)) },
                { label: "Total Lease Liabilities", value: fmt(totalLiability), bold: true },
              ].map(row => (
                <div key={row.label} className={`flex justify-between py-1 ${row.bold ? "border-t font-bold" : ""}`}>
                  <span className="text-sm">{row.label}</span>
                  <span className="font-mono text-sm">{row.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">ASC 842 Lease Register</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="all">
              <TabsList className="mb-4">
                <TabsTrigger value="all">All ({(leases as any[]).length})</TabsTrigger>
                <TabsTrigger value="finance">Finance ({financeLeases.length})</TabsTrigger>
                <TabsTrigger value="operating">Operating ({operatingLeases.length})</TabsTrigger>
              </TabsList>
              {["all", "finance", "operating"].map(tab => (
                <TabsContent key={tab} value={tab}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contract</TableHead>
                        <TableHead>Asset</TableHead>
                        <TableHead>IFRS 16</TableHead>
                        <TableHead>ASC 842</TableHead>
                        <TableHead className="text-right">ROU Asset (USD)</TableHead>
                        <TableHead className="text-right">Lease Liability (USD)</TableHead>
                        <TableHead>Expiry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                      ) : (tab === "all" ? leases : tab === "finance" ? financeLeases : operatingLeases).map((l: any) => (
                        <TableRow key={l.contract_id}>
                          <TableCell className="font-mono text-xs">{l.contract_ref}</TableCell>
                          <TableCell className="text-sm max-w-[150px] truncate">{l.asset_description}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{l.ifrs16_classification ?? "—"}</Badge></TableCell>
                          <TableCell><Badge className={`text-xs ${l.asc842_classification === "FINANCE" ? "bg-blue-500" : "bg-emerald-500"}`}>{l.asc842_classification}</Badge></TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(l.rou_asset_asc842)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(l.lease_liability_asc842)}</TableCell>
                          <TableCell className="text-sm">{l.expiry_date?.slice(0, 10)}</TableCell>
                        </TableRow>
                      ))}
                      {!isLoading && (tab === "all" ? leases : tab === "finance" ? financeLeases : operatingLeases).length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No data — click "Sync from IFRS 16" to populate</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
