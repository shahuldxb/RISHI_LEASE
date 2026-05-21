import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, TrendingUp, Building2, Scale, Info } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: unknown, dec = 0) =>
  typeof n === 'number' ? n.toLocaleString('en-ZA', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';
const pct = (n: unknown) => typeof n === 'number' ? `${(n * 100).toFixed(2)}%` : '—';

const MATURITY_ORDER = [
  'Less than 1 year', '1 to 2 years', '2 to 3 years',
  '3 to 4 years', '4 to 5 years', 'More than 5 years',
];

export default function DisclosureNotes() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data: settings } = trpc.journalVoucher.getSettings.useQuery();
  const ccy = settings?.default_currency || 'QAR';

  const { data, isLoading, refetch } = trpc.lease.getDisclosureNotes.useQuery(
    { reportingYear: year },
    { retry: false }
  );

  const maturity   = (data?.maturityAnalysis ?? []) as Record<string, unknown>[];
  const rouRows    = (data?.rouMovement ?? []) as Record<string, unknown>[];
  const liab       = (data?.liabilityReconciliation ?? {}) as Record<string, unknown>;
  const assumptions = (data?.keyAssumptions ?? {}) as Record<string, unknown>;

  const sortedMaturity = [...maturity].sort(
    (a, b) => MATURITY_ORDER.indexOf(a.maturity_band as string) - MATURITY_ORDER.indexOf(b.maturity_band as string)
  );

  const totalUndiscounted = sortedMaturity.reduce((s, r) => s + (Number(r.undiscounted_payment) || 0), 0);
  const totalDiscounted   = sortedMaturity.reduce((s, r) => s + (Number(r.discounted_liability) || 0), 0);

  const handleCopy = () => {
    const lines: string[] = [
      `IFRS 16 Disclosure Note — Year ended 31 December ${year}`,
      '',
      '1. Maturity Analysis of Lease Liabilities (Undiscounted)',
      ...sortedMaturity.map(r =>
        `  ${r.maturity_band}: Undiscounted ${ccy} ${fmt(r.undiscounted_payment, 2)} | Discounted ${ccy} ${fmt(r.discounted_liability, 2)}`
      ),
      `  Total: Undiscounted ${ccy} ${fmt(totalUndiscounted, 2)} | Discounted ${ccy} ${fmt(totalDiscounted, 2)}`,
      '',
      '2. ROU Asset Movement',
      ...rouRows.map(r =>
        `  ${r.asset_class}: Opening ${fmt(r.opening_nbv, 2)}, Additions ${fmt(r.additions, 2)}, Depreciation (${fmt(r.depreciation_charge, 2)}), Closing ${fmt(r.closing_nbv, 2)}`
      ),
      '',
      '3. Lease Liability Reconciliation',
      `  Opening liability: ${ccy} ${fmt(liab.opening_liability, 2)}`,
      `  New leases recognised: ${ccy} ${fmt(liab.new_leases, 2)}`,
      `  Interest accrued: ${ccy} ${fmt(liab.interest_accrued, 2)}`,
      `  Payments made: (${ccy} ${fmt(liab.payments_made, 2)})`,
      `  Closing liability: ${ccy} ${fmt(liab.closing_liability, 2)}`,
      '',
      '4. Key Assumptions',
      `  Number of leases: ${assumptions.total_leases}`,
      `  Weighted average IBR: ${pct(assumptions.weighted_avg_ibr)}`,
      `  Average remaining term: ${assumptions.avg_remaining_term_months} months`,
      `  Total ROU asset (NBV): ${ccy} ${fmt(assumptions.total_rou_nbv, 2)}`,
      `  Total lease liability: ${ccy} ${fmt(assumptions.total_lease_liability, 2)}`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Copied to clipboard — ready to paste into the financial statements.');
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFACC-DISCNOTES-001" screenType="disclosure_notes"
          title="IFRS 16 Disclosure Notes"
          subtitle="Auto-generated note for the financial statements"
          icon={<FileText className="h-6 w-6 text-blue-400" />}
          actions={
            <div className="flex items-center gap-2">
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
              <Button onClick={handleCopy} className="gap-2">
                <Download className="h-4 w-4" /> Copy to Clipboard
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading disclosure data for {year}…</div>
        ) : (
          <div className="space-y-6">

            {/* Key Assumptions Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Leases', value: String(assumptions.total_leases ?? '—'), icon: Building2, color: 'text-blue-400' },
                { label: 'Weighted Avg IBR', value: pct(assumptions.weighted_avg_ibr), icon: TrendingUp, color: 'text-emerald-400' },
                { label: 'Total ROU Asset', value: `${ccy} ${fmt(assumptions.total_rou_nbv, 0)}`, icon: Scale, color: 'text-violet-400' },
                { label: 'Total Lease Liability', value: `${ccy} ${fmt(assumptions.total_lease_liability, 0)}`, icon: Info, color: 'text-amber-400' },
              ].map(({ label, value, icon: Icon, color }) => (
                <Card key={label} className="bg-card/60 border-border/50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-4 w-4 ${color}`} />
                      <span className="text-xs text-muted-foreground">{label}</span>
                    </div>
                    <div className="text-xl font-bold text-foreground">{value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Note 1: Maturity Analysis */}
            <Card className="bg-card/60 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Note 1</Badge>
                  Maturity Analysis of Lease Liabilities (Undiscounted Cash Flows)
                </CardTitle>
                <p className="text-xs text-muted-foreground">IFRS 16 para 58(a) — as at 31 December {year}</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 text-muted-foreground font-medium">Maturity Band</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Leases</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Undiscounted ({ccy})</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Discounted ({ccy})</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Discount Effect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMaturity.map((row, i) => {
                        const undis = Number(row.undiscounted_payment) || 0;
                        const dis   = Number(row.discounted_liability) || 0;
                        return (
                          <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="py-2 font-medium text-foreground">{String(row.maturity_band)}</td>
                            <td className="py-2 text-right text-muted-foreground">{String(row.lease_count)}</td>
                            <td className="py-2 text-right text-foreground">{fmt(undis, 2)}</td>
                            <td className="py-2 text-right text-foreground">{fmt(dis, 2)}</td>
                            <td className="py-2 text-right text-amber-400">{fmt(undis - dis, 2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="py-2 text-foreground">Total</td>
                        <td className="py-2 text-right text-muted-foreground">
                          {sortedMaturity.reduce((s, r) => s + (Number(r.lease_count) || 0), 0)}
                        </td>
                        <td className="py-2 text-right text-foreground">{fmt(totalUndiscounted, 2)}</td>
                        <td className="py-2 text-right text-foreground">{fmt(totalDiscounted, 2)}</td>
                        <td className="py-2 text-right text-amber-400">{fmt(totalUndiscounted - totalDiscounted, 2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Note 2: ROU Asset Movement */}
            <Card className="bg-card/60 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Note 2</Badge>
                  Right-of-Use Asset Movement
                </CardTitle>
                <p className="text-xs text-muted-foreground">IFRS 16 para 53(j) — for the year ended 31 December {year}</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 text-muted-foreground font-medium">Asset Class</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Leases</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Opening NBV</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Additions</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Depreciation</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Closing NBV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rouRows.length === 0 ? (
                        <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No data for {year}</td></tr>
                      ) : rouRows.map((row, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="py-2 font-medium text-foreground">{String(row.asset_class || '—')}</td>
                          <td className="py-2 text-right text-muted-foreground">{String(row.lease_count)}</td>
                          <td className="py-2 text-right text-foreground">{fmt(row.opening_nbv, 2)}</td>
                          <td className="py-2 text-right text-emerald-400">{fmt(row.additions, 2)}</td>
                          <td className="py-2 text-right text-red-400">({fmt(row.depreciation_charge, 2)})</td>
                          <td className="py-2 text-right font-semibold text-foreground">{fmt(row.closing_nbv, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {rouRows.length > 1 && (
                      <tfoot>
                        <tr className="border-t-2 border-border font-semibold">
                          <td className="py-2 text-foreground">Total</td>
                          <td className="py-2 text-right text-muted-foreground">
                            {rouRows.reduce((s, r) => s + (Number(r.lease_count) || 0), 0)}
                          </td>
                          <td className="py-2 text-right">{fmt(rouRows.reduce((s, r) => s + (Number(r.opening_nbv) || 0), 0), 2)}</td>
                          <td className="py-2 text-right text-emerald-400">{fmt(rouRows.reduce((s, r) => s + (Number(r.additions) || 0), 0), 2)}</td>
                          <td className="py-2 text-right text-red-400">({fmt(rouRows.reduce((s, r) => s + (Number(r.depreciation_charge) || 0), 0), 2)})</td>
                          <td className="py-2 text-right font-semibold">{fmt(rouRows.reduce((s, r) => s + (Number(r.closing_nbv) || 0), 0), 2)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Note 3: Lease Liability Reconciliation */}
            <Card className="bg-card/60 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Note 3</Badge>
                  Lease Liability Reconciliation
                </CardTitle>
                <p className="text-xs text-muted-foreground">IFRS 16 para 53(a)–(e) — for the year ended 31 December {year}</p>
              </CardHeader>
              <CardContent>
                <div className="max-w-lg space-y-1 text-sm">
                  {[
                    { label: 'Opening balance (1 January)', value: liab.opening_liability, sign: 1, bold: false },
                    { label: 'New leases recognised', value: liab.new_leases, sign: 1, bold: false },
                    { label: 'Interest accrued (unwinding of discount)', value: liab.interest_accrued, sign: 1, bold: false },
                    { label: 'Lease payments made', value: liab.payments_made, sign: -1, bold: false },
                    { label: 'Closing balance (31 December)', value: liab.closing_liability, sign: 1, bold: true },
                  ].map(({ label, value, sign, bold }) => (
                    <div key={label} className={`flex justify-between py-1.5 border-b border-border/20 ${bold ? 'border-t-2 border-border font-semibold mt-2 pt-2' : ''}`}>
                      <span className={bold ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
                      <span className={`font-mono ${bold ? 'text-foreground' : sign < 0 ? 'text-red-400' : 'text-foreground'}`}>
                        {sign < 0 ? `(${fmt(value, 2)})` : `${ccy} ${fmt(value, 2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Note 4: Key Assumptions */}
            <Card className="bg-card/60 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Note 4</Badge>
                  Key Assumptions &amp; Judgements
                </CardTitle>
                <p className="text-xs text-muted-foreground">IFRS 16 para 59(a) — significant judgements applied</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {[
                    { label: 'Total leases in portfolio', value: String(assumptions.total_leases ?? '—') },
                    { label: 'Weighted average IBR', value: pct(assumptions.weighted_avg_ibr) },
                    { label: 'IBR range', value: `${pct(assumptions.min_ibr)} – ${pct(assumptions.max_ibr)}` },
                    { label: 'Avg remaining term', value: `${assumptions.avg_remaining_term_months ?? '—'} months` },
                    { label: 'Total annual payments', value: `${ccy} ${fmt(assumptions.total_annual_payments, 0)}` },
                    { label: 'Total lease liability', value: `${ccy} ${fmt(assumptions.total_lease_liability, 0)}` },
                    { label: 'Total ROU asset (NBV)', value: `${ccy} ${fmt(assumptions.total_rou_nbv, 0)}` },
                    { label: 'Discount on liability', value: `${ccy} ${fmt((Number(assumptions.total_lease_liability) || 0) - (Number(liab.closing_liability) || 0), 0)}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/20 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">{label}</div>
                      <div className="font-semibold text-foreground">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
                  <strong>Disclosure basis:</strong> The Group applies the incremental borrowing rate (IBR) as the discount rate for all leases where the interest rate implicit in the lease cannot be readily determined. The IBR reflects the rate the Group would pay to borrow funds over a similar term with similar security. Short-term leases (≤12 months) and leases of low-value assets are expensed on a straight-line basis.
                </div>
              </CardContent>
            </Card>

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
