import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf, TrendingDown, BarChart3, FileText, Download, Globe, Building2, Zap } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";

const CARBON_DATA = [
  { entity: "VF-Qatar", category: "Office Leases", sqm: 12400, energy_kwh: 2480000, co2_tonnes: 1116, green_certified: true, rating: "LEED Gold" },
  { entity: "VF-Qatar", category: "Network Sites", sqm: 8200, energy_kwh: 9840000, co2_tonnes: 4428, green_certified: false, rating: "—" },
  { entity: "VF-Qatar", category: "Data Centres", sqm: 3100, energy_kwh: 12400000, co2_tonnes: 5580, green_certified: true, rating: "ISO 50001" },
  { entity: "VF-DXB", category: "Office Leases", sqm: 6800, energy_kwh: 1360000, co2_tonnes: 612, green_certified: true, rating: "BREEAM Very Good" },
  { entity: "VF-AUH", category: "Office Leases", sqm: 4200, energy_kwh: 840000, co2_tonnes: 378, green_certified: false, rating: "—" },
];

const TCFD_METRICS = [
  { framework: "TCFD", pillar: "Governance", metric: "Board oversight of climate-related risks", status: "DISCLOSED", value: "Quarterly Board ESG Committee review" },
  { framework: "TCFD", pillar: "Strategy", metric: "Climate-related risks to lease portfolio", status: "DISCLOSED", value: "Physical risk assessment for 47 properties" },
  { framework: "TCFD", pillar: "Risk Management", metric: "Transition risk — stranded asset exposure", status: "IN_PROGRESS", value: "12 properties in high-risk zones" },
  { framework: "TCFD", pillar: "Metrics & Targets", metric: "Scope 1 & 2 GHG emissions from leased assets", status: "DISCLOSED", value: "12,114 tCO₂e (2025)" },
  { framework: "SASB", pillar: "Real Estate", metric: "Energy consumption in managed assets", status: "DISCLOSED", value: "26,920 MWh" },
  { framework: "SASB", pillar: "Real Estate", metric: "% green-certified floor area", status: "DISCLOSED", value: "62.3%" },
  { framework: "SASB", pillar: "Real Estate", metric: "Water consumption in managed assets", status: "IN_PROGRESS", value: "Data collection in progress" },
  { framework: "GRI", pillar: "GRI 302", metric: "Energy intensity per sqm", status: "DISCLOSED", value: "0.78 MWh/sqm" },
];

const STATUS_COLORS: Record<string, string> = {
  DISCLOSED: "bg-green-500/20 text-green-400 border-green-500/30",
  IN_PROGRESS: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  NOT_STARTED: "bg-red-500/20 text-red-400 border-red-500/30",
};

const TARGETS = [
  { target: "Net Zero by 2040", current: 12114, baseline: 14500, target_value: 0, progress: 16, unit: "tCO₂e" },
  { target: "100% Renewable Energy by 2030", current: 42, baseline: 0, target_value: 100, progress: 42, unit: "%" },
  { target: "80% Green-Certified Floor Area by 2028", current: 62.3, baseline: 45, target_value: 80, progress: 50, unit: "%" },
];

export default function ESGReporting() {
  const utils = trpc.useUtils();
  const actionMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Action completed successfully"),
    onError: (e: any) => toast.error(e.message),
  });
  const [tab, setTab] = useState("overview");
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [year, setYear] = useState("2025");

  const totalCO2 = CARBON_DATA.reduce((s, d) => s + d.co2_tonnes, 0);
  const totalEnergy = CARBON_DATA.reduce((s, d) => s + d.energy_kwh, 0);
  const totalSqm = CARBON_DATA.reduce((s, d) => s + d.sqm, 0);
  const greenPct = Math.round((CARBON_DATA.filter(d => d.green_certified).reduce((s, d) => s + d.sqm, 0) / totalSqm) * 100);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
  screenId="VFLESGRPT0001P001"
          screenType="esg_reporting"
          onAIData={(rows) => setAiRows(rows)}
  title="ESG Reporting"
  subtitle="TCFD/SASB ESG disclosure and reporting"
/>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total CO₂ Emissions", value: `${(totalCO2 / 1000).toFixed(1)}K tCO₂e`, icon: Leaf, color: "text-green-400" },
            { label: "Energy Consumption", value: `${(totalEnergy / 1000000).toFixed(1)}M kWh`, icon: Zap, color: "text-yellow-400" },
            { label: "Green Certified Area", value: `${greenPct}%`, icon: Building2, color: "text-blue-400" },
            { label: "Total Leased Area", value: `${(totalSqm / 1000).toFixed(0)}K sqm`, icon: Globe, color: "text-purple-400" },
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
            <TabsTrigger value="overview">Carbon Overview</TabsTrigger>
            <TabsTrigger value="tcfd">TCFD / SASB / GRI</TabsTrigger>
            <TabsTrigger value="targets">Net Zero Targets</TabsTrigger>
            <TabsTrigger value="properties">Property Ratings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-sm">CO₂ Emissions by Category</CardTitle></CardHeader>
                <CardContent>
                  {CARBON_DATA.map((d, i) => {
                    const pct = Math.round((d.co2_tonnes / totalCO2) * 100);
                    return (
                      <div key={i} className="flex items-center gap-3 mb-2">
                        <div className="w-36 shrink-0">
                          <p className="text-xs font-medium">{d.category}</p>
                          <p className="text-xs text-muted-foreground">{d.entity}</p>
                        </div>
                        <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
                          <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: `rgba(34,197,94,${0.3 + pct / 100 * 0.7})` }} />
                        </div>
                        <span className="text-xs font-mono w-16 text-right">{d.co2_tonnes.toLocaleString()} t</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-sm">Energy Intensity (kWh/sqm)</CardTitle></CardHeader>
                <CardContent>
                  {CARBON_DATA.map((d, i) => {
                    const intensity = Math.round(d.energy_kwh / d.sqm);
                    const maxIntensity = 4000;
                    const pct = Math.min(100, Math.round((intensity / maxIntensity) * 100));
                    return (
                      <div key={i} className="flex items-center gap-3 mb-2">
                        <div className="w-36 shrink-0">
                          <p className="text-xs font-medium">{d.category}</p>
                          <p className="text-xs text-muted-foreground">{d.entity}</p>
                        </div>
                        <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
                          <div className={`h-full rounded ${intensity > 3000 ? "bg-red-500/70" : intensity > 1500 ? "bg-yellow-500/70" : "bg-green-500/70"}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-mono w-16 text-right">{intensity.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="tcfd" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Framework</TableHead>
                      <TableHead className="text-xs">Pillar</TableHead>
                      <TableHead className="text-xs">Metric / Disclosure</TableHead>
                      <TableHead className="text-xs">Value / Status</TableHead>
                      <TableHead className="text-xs">Disclosure Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {TCFD_METRICS.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell><Badge className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">{m.framework}</Badge></TableCell>
                        <TableCell className="text-xs font-medium">{m.pillar}</TableCell>
                        <TableCell className="text-sm">{m.metric}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px]">{m.value}</TableCell>
                        <TableCell><Badge className={`text-xs border ${STATUS_COLORS[m.status]}`}>{m.status.replace("_", " ")}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="targets" className="mt-4">
            <div className="space-y-4">
              {TARGETS.map((t, i) => (
                <Card key={i} className="bg-card border-border">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold">{t.target}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Current: {t.current} {t.unit} | Baseline: {t.baseline} {t.unit} | Target: {t.target_value} {t.unit}
                        </p>
                      </div>
                      <Badge className={`text-xs border ${t.progress >= 50 ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"}`}>
                        {t.progress}% progress
                      </Badge>
                    </div>
                    <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${t.progress >= 50 ? "bg-green-500" : "bg-yellow-500"}`}
                        style={{ width: `${t.progress}%` }} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="properties" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Entity</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs text-right">Area (sqm)</TableHead>
                      <TableHead className="text-xs text-right">Energy (MWh)</TableHead>
                      <TableHead className="text-xs text-right">CO₂ (tCO₂e)</TableHead>
                      <TableHead className="text-xs">Green Certified</TableHead>
                      <TableHead className="text-xs">Rating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CARBON_DATA.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs font-semibold">{d.entity}</TableCell>
                        <TableCell className="text-sm">{d.category}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{d.sqm.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(d.energy_kwh / 1000).toFixed(0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{d.co2_tonnes.toLocaleString()}</TableCell>
                        <TableCell>
                          {d.green_certified
                            ? <Badge className="text-xs bg-green-500/20 text-green-400 border border-green-500/30">Yes</Badge>
                            : <span className="text-xs text-muted-foreground">No</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.rating}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
