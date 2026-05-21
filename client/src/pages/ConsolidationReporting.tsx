import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Building2, BarChart3, FileText, Download, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";

const ENTITIES = [
  { code: "VF-Qatar", name: "Vodafone Qatar LLC", type: "Parent", leases: 47, rou_asset: 125400000, lease_liability: 118900000, interco: false },
  { code: "VF-DXB", name: "Vodafone Doha Operations", type: "Subsidiary", leases: 23, rou_asset: 58200000, lease_liability: 55100000, interco: true },
  { code: "VF-AUH", name: "Vodafone Doha", type: "Subsidiary", leases: 15, rou_asset: 34700000, lease_liability: 32800000, interco: false },
  { code: "VF-SHJ", name: "Vodafone Sharjah", type: "Subsidiary", leases: 9, rou_asset: 18300000, lease_liability: 17200000, interco: false },
];

const INTERCO_LEASES = [
  { id: 1, lessor_entity: "VF-Qatar", lessee_entity: "VF-DXB", contract_ref: "IC-2024-001", asset: "Network Equipment — Doha Hub", monthly_rent: 125000, rou_asset: 6800000, lease_liability: 6450000, eliminated: true },
  { id: 2, lessor_entity: "VF-Qatar", lessee_entity: "VF-DXB", contract_ref: "IC-2024-002", asset: "Data Centre Infrastructure", monthly_rent: 87500, rou_asset: 4750000, lease_liability: 4510000, eliminated: true },
  { id: 3, lessor_entity: "VF-Qatar", lessee_entity: "VF-AUH", contract_ref: "IC-2024-003", asset: "Tower Equipment", monthly_rent: 45000, rou_asset: 2450000, lease_liability: 2320000, eliminated: false },
];

const CONSOLIDATED = {
  total_leases: 94,
  rou_asset: 236600000,
  lease_liability: 224000000,
  interco_eliminated_rou: 14000000,
  interco_eliminated_liability: 13280000,
  consolidated_rou: 222600000,
  consolidated_liability: 210720000,
};

export default function ConsolidationReporting() {
  const utils = trpc.useUtils();
  const actionMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Action completed successfully"),
    onError: (e: any) => toast.error(e.message),
  });
  const [tab, setTab] = useState("overview");
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [period, setPeriod] = useState("2026-03");
  const [intercoLeases, setIntercoLeases] = useState(INTERCO_LEASES);

  function toggleElimination(id: number) {
    setIntercoLeases(prev => prev.map(l => l.id === id ? { ...l, eliminated: !l.eliminated } : l));
    toast.success("Intercompany elimination flag updated");
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
  screenId="VFLCONRPT0001P001"
          screenType="consolidation"
          onAIData={(rows) => setAiRows(rows)}
  title="Consolidation Reporting"
  subtitle="Multi-entity consolidation with intercompany elimination"
/>

        {/* Consolidated Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Leases (Group)", value: CONSOLIDATED.total_leases, icon: FileText, color: "text-blue-400" },
            { label: "Consolidated ROU Asset", value: `QAR ${(CONSOLIDATED.consolidated_rou / 1000000).toFixed(1)}M`, icon: Building2, color: "text-green-400" },
            { label: "Consolidated Liability", value: `QAR ${(CONSOLIDATED.consolidated_liability / 1000000).toFixed(1)}M`, icon: BarChart3, color: "text-red-400" },
            { label: "Interco Eliminated", value: `QAR ${(CONSOLIDATED.interco_eliminated_rou / 1000000).toFixed(1)}M`, icon: XCircle, color: "text-yellow-400" },
          ].map((kpi) => (
            <Card key={kpi.label} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <kpi.icon className={`w-8 h-8 ${kpi.color}`} />
                  <div>
                    <p className="text-xl font-bold">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-muted/30">
            <TabsTrigger value="overview">Entity Overview</TabsTrigger>
            <TabsTrigger value="interco">Intercompany Elimination</TabsTrigger>
            <TabsTrigger value="consolidated">Consolidated Statement</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Entity Code</TableHead>
                      <TableHead className="text-xs">Entity Name</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs text-right">Leases</TableHead>
                      <TableHead className="text-xs text-right">ROU Asset (QAR)</TableHead>
                      <TableHead className="text-xs text-right">Lease Liability (QAR)</TableHead>
                      <TableHead className="text-xs">Interco Lessor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ENTITIES.map((e) => (
                      <TableRow key={e.code}>
                        <TableCell className="font-mono text-sm font-semibold">{e.code}</TableCell>
                        <TableCell className="text-sm">{e.name}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs border ${e.type === "Parent" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : "bg-muted text-muted-foreground border-border"}`}>{e.type}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{e.leases}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(e.rou_asset / 1000000).toFixed(2)}M</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(e.lease_liability / 1000000).toFixed(2)}M</TableCell>
                        <TableCell>
                          {e.interco
                            ? <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Yes</Badge>
                            : <span className="text-xs text-muted-foreground">No</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell className="font-mono text-sm">TOTAL</TableCell>
                      <TableCell className="text-sm">Group Consolidated</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono text-sm">{ENTITIES.reduce((s, e) => s + e.leases, 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{(ENTITIES.reduce((s, e) => s + e.rou_asset, 0) / 1000000).toFixed(2)}M</TableCell>
                      <TableCell className="text-right font-mono text-sm">{(ENTITIES.reduce((s, e) => s + e.lease_liability, 0) / 1000000).toFixed(2)}M</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interco" className="mt-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3 mb-4">
              <XCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-amber-400">Intercompany Lease Elimination</p>
                <p className="text-muted-foreground mt-1">Leases where the lessor and lessee are both within the Vodafone Group must be eliminated on consolidation. Toggle the elimination flag to include/exclude from the consolidated balance sheet.</p>
              </div>
            </div>
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Contract Ref</TableHead>
                      <TableHead className="text-xs">Lessor Entity</TableHead>
                      <TableHead className="text-xs">Lessee Entity</TableHead>
                      <TableHead className="text-xs">Asset</TableHead>
                      <TableHead className="text-xs text-right">Monthly Rent</TableHead>
                      <TableHead className="text-xs text-right">ROU Asset</TableHead>
                      <TableHead className="text-xs text-right">Lease Liability</TableHead>
                      <TableHead className="text-xs">Eliminate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {intercoLeases.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-sm">{l.contract_ref}</TableCell>
                        <TableCell className="font-mono text-xs text-blue-400">{l.lessor_entity}</TableCell>
                        <TableCell className="font-mono text-xs text-orange-400">{l.lessee_entity}</TableCell>
                        <TableCell className="text-sm max-w-[140px] truncate">{l.asset}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{l.monthly_rent.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(l.rou_asset / 1000000).toFixed(2)}M</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(l.lease_liability / 1000000).toFixed(2)}M</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch checked={l.eliminated} onCheckedChange={() => toggleElimination(l.id)} />
                            {l.eliminated && <Badge className="text-xs bg-red-500/20 text-red-400 border border-red-500/30">Eliminated</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="consolidated" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-sm">Consolidated IFRS 16 Balance Sheet Impact — {period}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-3 font-semibold">Line Item</th>
                        <th className="text-right p-3 font-semibold">Before Elimination</th>
                        <th className="text-right p-3 font-semibold">Elimination</th>
                        <th className="text-right p-3 font-semibold">Consolidated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { item: "Right-of-Use Assets", before: CONSOLIDATED.rou_asset, elim: CONSOLIDATED.interco_eliminated_rou, after: CONSOLIDATED.consolidated_rou },
                        { item: "Lease Liabilities — Current", before: 52400000, elim: 3100000, after: 49300000 },
                        { item: "Lease Liabilities — Non-Current", before: 171600000, elim: 10180000, after: 161420000 },
                        { item: "Total Lease Liabilities", before: CONSOLIDATED.lease_liability, elim: CONSOLIDATED.interco_eliminated_liability, after: CONSOLIDATED.consolidated_liability },
                      ].map((row, i) => (
                        <tr key={i} className={`border-t border-border ${i === 3 ? "bg-muted/20 font-semibold" : ""}`}>
                          <td className="p-3">{row.item}</td>
                          <td className="p-3 text-right font-mono">{(row.before / 1000000).toFixed(2)}M</td>
                          <td className="p-3 text-right font-mono text-red-400">({(row.elim / 1000000).toFixed(2)}M)</td>
                          <td className="p-3 text-right font-mono text-green-400">{(row.after / 1000000).toFixed(2)}M</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
