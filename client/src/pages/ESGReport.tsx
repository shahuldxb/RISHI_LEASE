/**
 * ESG Report Dashboard — Aggregated KPIs, charts, and summary from sp_GetESGReport.
 * Screen ID: VFLESGRPT0002P001
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import ScreenHeader from "@/components/ScreenHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Leaf, Users, Shield, TrendingDown, Zap, Droplets, Trash2,
  Award, AlertTriangle, CheckCircle2, FileText, RefreshCw,
} from "lucide-react";

const SCREEN_ID = "VFLESGRPT0002P001";
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function ESGReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: report, refetch, isLoading } = trpc.esg.report.useQuery({ year });

  const env = report?.environmental;
  const soc = report?.social;
  const gov = report?.governance;
  const trend = report?.monthlyTrend ?? [];

  const maxCarbon = useMemo(() => Math.max(...trend.map((t: any) => t.monthly_carbon || 0), 1), [trend]);
  const maxEnergy = useMemo(() => Math.max(...trend.map((t: any) => t.monthly_energy || 0), 1), [trend]);

  return (
    <div className="flex flex-col h-full">
      <ScreenHeader
        screenId={SCREEN_ID}
        title="ESG Report"
        subtitle="Environmental, Social & Governance — Annual Summary"
        screenType="esg_report"
        onAIData={() => {}}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-800 bg-gray-900">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2023, 2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
        <div className="flex-1" />
        <Badge variant="outline" className="text-xs">Reporting Year: {year}</Badge>
      </div>

      {/* Dashboard Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-500">Loading report data...</div>
        ) : (
          <>
            {/* ── Environmental Section ── */}
            <section>
              <h2 className="text-lg font-semibold text-green-400 flex items-center gap-2 mb-4"><Leaf className="w-5 h-5" />Environmental Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <KPICard icon={<TrendingDown className="w-5 h-5 text-green-400" />} label="Total Carbon (tCO₂e)" value={fmt(env?.total_carbon)} sub={`Scope 1: ${fmt(env?.total_scope1)} | Scope 2: ${fmt(env?.total_scope2)} | Scope 3: ${fmt(env?.total_scope3)}`} />
                <KPICard icon={<Zap className="w-5 h-5 text-yellow-400" />} label="Energy Consumption" value={`${fmt(env?.total_energy_kwh)} kWh`} />
                <KPICard icon={<Droplets className="w-5 h-5 text-blue-400" />} label="Water Usage" value={`${fmt(env?.total_water_m3)} m³`} />
                <KPICard icon={<Trash2 className="w-5 h-5 text-orange-400" />} label="Waste Generated" value={`${fmt(env?.total_waste_tonnes)} tonnes`} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-gray-800">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Green Lease Scorecard</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="text-3xl font-bold text-green-400">{env?.green_certified_count ?? 0}</div>
                      <div className="text-sm text-gray-400">of {env?.leases_reported ?? 0} leases with green certification</div>
                    </div>
                    <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${env?.leases_reported ? ((env.green_certified_count / env.leases_reported) * 100) : 0}%` }} />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-gray-800">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Carbon Trend</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-1 h-24">
                      {MONTHS_SHORT.map((m, i) => {
                        const d = trend.find((t: any) => t.reporting_month === i + 1);
                        const h = d ? (d.monthly_carbon / maxCarbon) * 100 : 0;
                        return (
                          <div key={m} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-green-600/30 rounded-t relative" style={{ height: `${Math.max(h, 2)}%` }}>
                              <div className="absolute inset-0 bg-green-500 rounded-t" style={{ height: `${h}%` }} />
                            </div>
                            <span className="text-[10px] text-gray-500">{m}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* ── Social Section ── */}
            <section>
              <h2 className="text-lg font-semibold text-blue-400 flex items-center gap-2 mb-4"><Users className="w-5 h-5" />Social Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard icon={<Users className="w-5 h-5 text-blue-400" />} label="Total Workforce" value={fmt(soc?.total_workforce)} sub={`Across ${soc?.leases_reported ?? 0} locations`} />
                <KPICard icon={<AlertTriangle className="w-5 h-5 text-red-400" />} label="H&S Incidents" value={String(soc?.total_incidents ?? 0)} sub={`Safety Score: ${soc?.avg_safety_score ? Number(soc.avg_safety_score).toFixed(1) : "—"}/100`} />
                <KPICard icon={<Award className="w-5 h-5 text-purple-400" />} label="Community Investment" value={`QAR ${fmt(soc?.total_community_investment)}`} />
                <KPICard icon={<FileText className="w-5 h-5 text-cyan-400" />} label="Training & Diversity" value={`${fmt(soc?.total_training_hours)} hrs`} sub={`Local: ${soc?.avg_local_employment ? Number(soc.avg_local_employment).toFixed(1) : "—"}% | Diversity: ${soc?.avg_diversity ? Number(soc.avg_diversity).toFixed(1) : "—"}%`} />
              </div>
            </section>

            {/* ── Governance Section ── */}
            <section>
              <h2 className="text-lg font-semibold text-amber-400 flex items-center gap-2 mb-4"><Shield className="w-5 h-5" />Governance Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard icon={<CheckCircle2 className="w-5 h-5 text-green-400" />} label="Approval Compliance" value={`${gov?.avg_approval_compliance ? Number(gov.avg_approval_compliance).toFixed(1) : "—"}%`} sub={`${gov?.leases_reported ?? 0} leases assessed`} />
                <KPICard icon={<AlertTriangle className="w-5 h-5 text-amber-400" />} label="Related Party Txns" value={String(gov?.related_party_count ?? 0)} />
                <KPICard icon={<FileText className="w-5 h-5 text-red-400" />} label="Audit Findings" value={String(gov?.total_audit_findings ?? 0)} sub={`Policy Violations: ${gov?.total_policy_violations ?? 0}`} />
                <KPICard icon={<Shield className="w-5 h-5 text-green-400" />} label="IFRS 16 Full Compliance" value={`${gov?.full_ifrs16_count ?? 0} / ${gov?.leases_reported ?? 0}`} sub={`Regulatory Compliant: ${gov?.compliant_count ?? 0}`} />
              </div>
            </section>

            {/* ── Monthly Energy Trend ── */}
            <section>
              <h2 className="text-lg font-semibold text-yellow-400 flex items-center gap-2 mb-4"><Zap className="w-5 h-5" />Monthly Energy Trend</h2>
              <Card className="border-gray-800">
                <CardContent className="pt-4">
                  <div className="flex items-end gap-1 h-32">
                    {MONTHS_SHORT.map((m, i) => {
                      const d = trend.find((t: any) => t.reporting_month === i + 1);
                      const h = d ? (d.monthly_energy / maxEnergy) * 100 : 0;
                      return (
                        <div key={m} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[9px] text-gray-500">{d ? Number(d.monthly_energy).toLocaleString() : ""}</span>
                          <div className="w-full rounded-t" style={{ height: `${Math.max(h, 2)}%`, background: "linear-gradient(to top, #f59e0b, #fbbf24)" }} />
                          <span className="text-[10px] text-gray-500">{m}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────────────────
function KPICard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="border-gray-800">
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gray-800/50">{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 truncate">{label}</p>
            <p className="text-xl font-bold mt-0.5">{value}</p>
            {sub && <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function fmt(v: any) { return v != null ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"; }
