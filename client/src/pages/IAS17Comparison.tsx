/**
 * VodaLease Enterprise — IAS 17 vs IFRS 16 Comparative Report
 * Side-by-side comparison of lease expense under old IAS 17 vs IFRS 16
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Scale, TrendingUp, TrendingDown, Download, Search, Info } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: unknown, dec = 0) =>
  typeof n === 'number' ? n.toLocaleString('en-ZA', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';

type LeaseRow = Record<string, unknown>;

export default function IAS17Comparison() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');

  const { data: settings } = trpc.journalVoucher.getSettings.useQuery();
  const ccy = settings?.default_currency || 'QAR';

  const { data, isLoading, refetch } = trpc.lease.getIAS17Comparison.useQuery(
    { year },
    { retry: false }
  );

  const leases  = (data?.leases  ?? []) as LeaseRow[];
  const summary = (data?.summary ?? {}) as Record<string, unknown>;

  const filtered = leases.filter(r =>
    !search || [r.contract_ref, r.asset_description, r.lessor_name, r.ifrs16_classification]
      .some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  const handleCopy = () => {
    const lines = [
      `IAS 17 vs IFRS 16 Comparative Report — Year ended 31 December ${year}`,
      '',
      `Total IAS 17 Rent Expense:          ${ccy} ${fmt(summary.total_ias17_expense, 2)}`,
      `Total IFRS 16 Interest Expense:     ${ccy} ${fmt(summary.total_ifrs16_interest, 2)}`,
      `Total IFRS 16 Depreciation:         ${ccy} ${fmt(summary.total_ifrs16_depreciation, 2)}`,
      `Total IFRS 16 P&L Charge:           ${ccy} ${fmt(summary.total_ifrs16_charge, 2)}`,
      `Total Lease Liability (B/S):        ${ccy} ${fmt(summary.total_lease_liability, 2)}`,
      `Total ROU Asset (B/S):              ${ccy} ${fmt(summary.total_rou_asset, 2)}`,
      '',
      'Per-Lease Detail:',
      ...filtered.map(r =>
        `  ${r.contract_ref} | ${r.asset_description} | IAS17: ${fmt(r.ias17_rent_expense, 2)} | IFRS16: ${fmt(r.ifrs16_total_charge, 2)} | Diff: ${fmt(r.pl_difference, 2)}`
      ),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Copied to clipboard');
  };

  const plDiff = (Number(summary.total_ifrs16_charge) || 0) - (Number(summary.total_ias17_expense) || 0);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFCMP-IAS17-001" screenType="ias17_comparison"
          title="IAS 17 vs IFRS 16 Comparison"
          subtitle="P&L and balance sheet impact of IFRS 16 adoption"
          icon={<Scale className="h-6 w-6 text-sky-400" />}
          actions={
            <div className="flex items-center gap-3">
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
              <Button onClick={handleCopy} className="gap-2">
                <Download className="h-4 w-4" /> Copy
              </Button>
            </div>
          }
        />

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'IAS 17 Rent Expense',    value: summary.total_ias17_expense,       color: 'text-blue-400',    icon: TrendingDown },
            { label: 'IFRS 16 Interest',        value: summary.total_ifrs16_interest,     color: 'text-violet-400',  icon: TrendingUp },
            { label: 'IFRS 16 Depreciation',    value: summary.total_ifrs16_depreciation, color: 'text-amber-400',   icon: TrendingDown },
            { label: 'IFRS 16 Total P&L',       value: summary.total_ifrs16_charge,       color: 'text-red-400',     icon: TrendingDown },
            { label: 'Lease Liability (B/S)',   value: summary.total_lease_liability,     color: 'text-sky-400',     icon: Info },
            { label: 'ROU Asset (B/S)',          value: summary.total_rou_asset,           color: 'text-emerald-400', icon: Info },
          ].map(({ label, value, color, icon: Icon }) => (
            <Card key={label} className="bg-card/60 border-border/50">
              <CardContent className="pt-3 pb-2">
                <div className="flex items-center gap-1 mb-1">
                  <Icon className={`h-3 w-3 ${color}`} />
                  <span className="text-xs text-muted-foreground leading-tight">{label}</span>
                </div>
                <div className={`text-base font-bold ${color}`}>{fmt(value, 0)}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* P&L Impact Summary */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4 text-sky-400" />
              P&amp;L Impact Summary — {year}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* IAS 17 column */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-blue-400 border-b border-blue-500/30 pb-1">Under IAS 17 (Old)</div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Operating lease expense</span>
                  <span className="text-foreground font-mono">{fmt(summary.total_ias17_expense, 2)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t border-border pt-1">
                  <span className="text-foreground">Total P&amp;L charge</span>
                  <span className="text-blue-400 font-mono">{fmt(summary.total_ias17_expense, 2)}</span>
                </div>
                <div className="text-xs text-muted-foreground">No balance sheet recognition</div>
              </div>

              {/* IFRS 16 column */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-violet-400 border-b border-violet-500/30 pb-1">Under IFRS 16 (Current)</div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Interest expense</span>
                  <span className="text-foreground font-mono">{fmt(summary.total_ifrs16_interest, 2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Depreciation of ROU</span>
                  <span className="text-foreground font-mono">{fmt(summary.total_ifrs16_depreciation, 2)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t border-border pt-1">
                  <span className="text-foreground">Total P&amp;L charge</span>
                  <span className="text-violet-400 font-mono">{fmt(summary.total_ifrs16_charge, 2)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  B/S: Liability {fmt(summary.total_lease_liability, 0)} | ROU {fmt(summary.total_rou_asset, 0)}
                </div>
              </div>

              {/* Difference column */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-sky-400 border-b border-sky-500/30 pb-1">Difference (IFRS 16 − IAS 17)</div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">P&amp;L impact</span>
                  <span className={`font-mono font-semibold ${plDiff > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {plDiff > 0 ? '+' : ''}{fmt(plDiff, 2)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {plDiff > 0
                    ? 'IFRS 16 front-loads charges — higher P&L expense in early years due to interest on full liability.'
                    : 'IFRS 16 results in lower P&L charge — occurs in later years as interest component decreases.'}
                </div>
                <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded text-xs text-sky-300 mt-2">
                  <strong>Balance sheet:</strong> IFRS 16 adds {ccy} {fmt(summary.total_lease_liability, 0)} of lease liabilities and {ccy} {fmt(summary.total_rou_asset, 0)} of ROU assets.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Per-lease detail table */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Per-Lease Detail</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contracts…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No data for {year}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      {['Contract', 'Asset', 'Class', 'Lessor', 'IAS 17 Rent', 'IFRS 16 Interest', 'IFRS 16 Depr.', 'IFRS 16 Total', 'P&L Diff', 'Lease Liability', 'ROU Asset'].map(h => (
                        <th key={h} className="text-left py-2 px-2 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => {
                      const diff = Number(row.pl_difference) || 0;
                      return (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="py-1.5 px-2 font-mono text-blue-400">{String(row.contract_ref ?? '—')}</td>
                          <td className="py-1.5 px-2 max-w-[120px] truncate text-foreground">{String(row.asset_description ?? '—')}</td>
                          <td className="py-1.5 px-2">
                            <Badge className="text-xs bg-muted text-muted-foreground border border-border">
                              {String(row.ifrs16_classification ?? '—')}
                            </Badge>
                          </td>
                          <td className="py-1.5 px-2 text-muted-foreground">{String(row.lessor_name ?? '—')}</td>
                          <td className="py-1.5 px-2 text-right text-blue-300">{fmt(row.ias17_rent_expense, 2)}</td>
                          <td className="py-1.5 px-2 text-right text-violet-300">{fmt(row.ifrs16_interest_expense, 2)}</td>
                          <td className="py-1.5 px-2 text-right text-amber-300">{fmt(row.ifrs16_depreciation, 2)}</td>
                          <td className="py-1.5 px-2 text-right font-semibold text-foreground">{fmt(row.ifrs16_total_charge, 2)}</td>
                          <td className={`py-1.5 px-2 text-right font-semibold ${diff > 0 ? 'text-red-400' : diff < 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                            {diff > 0 ? '+' : ''}{fmt(diff, 2)}
                          </td>
                          <td className="py-1.5 px-2 text-right text-sky-300">{fmt(row.bs_lease_liability, 2)}</td>
                          <td className="py-1.5 px-2 text-right text-emerald-300">{fmt(row.bs_rou_asset, 2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold text-xs">
                      <td colSpan={4} className="py-2 px-2 text-foreground">Total ({filtered.length} leases)</td>
                      <td className="py-2 px-2 text-right text-blue-300">{fmt(filtered.reduce((s, r) => s + (Number(r.ias17_rent_expense) || 0), 0), 2)}</td>
                      <td className="py-2 px-2 text-right text-violet-300">{fmt(filtered.reduce((s, r) => s + (Number(r.ifrs16_interest_expense) || 0), 0), 2)}</td>
                      <td className="py-2 px-2 text-right text-amber-300">{fmt(filtered.reduce((s, r) => s + (Number(r.ifrs16_depreciation) || 0), 0), 2)}</td>
                      <td className="py-2 px-2 text-right text-foreground">{fmt(filtered.reduce((s, r) => s + (Number(r.ifrs16_total_charge) || 0), 0), 2)}</td>
                      <td className={`py-2 px-2 text-right ${plDiff > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {plDiff > 0 ? '+' : ''}{fmt(filtered.reduce((s, r) => s + (Number(r.pl_difference) || 0), 0), 2)}
                      </td>
                      <td className="py-2 px-2 text-right text-sky-300">{fmt(filtered.reduce((s, r) => s + (Number(r.bs_lease_liability) || 0), 0), 2)}</td>
                      <td className="py-2 px-2 text-right text-emerald-300">{fmt(filtered.reduce((s, r) => s + (Number(r.bs_rou_asset) || 0), 0), 2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
