import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Globe, Plus, Play, ChevronDown, ChevronUp } from 'lucide-react';

const CURRENCIES = ['USD', 'EUR', 'AED', 'GBP', 'SAR', 'KWD', 'BHD', 'OMR', 'JOD', 'EGP', 'TRY', 'INR', 'PKR'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(n: unknown, decimals = 2) {
  const v = Number(n);
  if (isNaN(v)) return '—';
  return v.toLocaleString('en-QA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function FXRevaluation() {
  const now = new Date();
  const [selectedYear, setSelectedYear]   = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [showAddRate, setShowAddRate]     = useState(false);
  const [showRunConfirm, setShowRunConfirm] = useState(false);
  const [showLog, setShowLog]             = useState(false);
  const [filterCurrency, setFilterCurrency] = useState('');

  // New rate form
  const [newCurrency, setNewCurrency]     = useState('USD');
  const [newRate, setNewRate]             = useState('');
  const [newDate, setNewDate]             = useState(new Date().toISOString().slice(0, 10));
  const [newSource, setNewSource]         = useState('Manual');

  const utils = trpc.useUtils();

  const { data: rates = [], isLoading: ratesLoading } = trpc.lease.getFXRates.useQuery({});
  const { data: log = [], isLoading: logLoading }     = trpc.lease.getFXRevaluationLog.useQuery({
    year: selectedYear, month: selectedMonth,
  });
  const { data: summary, isLoading: summaryLoading }  = trpc.lease.getFXRevaluationSummary.useQuery({
    year: selectedYear, month: selectedMonth,
  });

  const upsertMut = trpc.lease.upsertFXRate.useMutation({
    onSuccess: () => {
      toast.success('FX rate saved');
      utils.lease.getFXRates.invalidate();
      setShowAddRate(false);
      setNewRate('');
    },
    onError: (e) => toast.error(e.message),
  });

  const runMut = trpc.lease.runFXRevaluation.useMutation({
    onSuccess: (r) => {
      toast.success(r.message);
      utils.lease.getFXRevaluationLog.invalidate();
      utils.lease.getFXRevaluationSummary.invalidate();
      setShowRunConfirm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const years = useMemo(() => {
    const y = [];
    for (let i = now.getFullYear() - 3; i <= now.getFullYear() + 1; i++) y.push(i);
    return y;
  }, []);

  // Latest rate per currency
  const latestRates = useMemo(() => {
    const map: Record<string, typeof rates[0]> = {};
    for (const r of rates) {
      const ccy = String(r.currency);
      if (!map[ccy] || String(r.rate_date) > String(map[ccy].rate_date)) map[ccy] = r;
    }
    return Object.values(map);
  }, [rates]);

  const filteredRates = filterCurrency
    ? latestRates.filter(r => String(r.currency).includes(filterCurrency.toUpperCase()))
    : latestRates;

  const netImpact = Number(summary?.net_fx_impact ?? 0);

  return (
    <DashboardLayout>
      <div className="flex gap-0 h-full">
      <div className="flex-1 p-6 space-y-6 min-w-0">
        <ScreenHeader
          screenId="VFACC-FXREVAL-001" screenType="fx_revaluation"
          title="Multi-Currency FX Revaluation"
          subtitle="IAS 21 — Monthly revaluation of non-QAR lease liabilities to closing exchange rates"
          icon={<Globe className="h-6 w-6 text-indigo-400" />}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddRate(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add FX Rate
              </Button>
              <Button size="sm" onClick={() => setShowRunConfirm(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Play className="w-4 h-4 mr-1" /> Run Revaluation
              </Button>
            </div>
          }
        />

        {/* Period Selector */}
        <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Period:</Label>
            <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <span className="text-sm text-muted-foreground">
            Showing revaluation results for {MONTHS[selectedMonth - 1]} {selectedYear}
          </span>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Leases Revalued</p>
                  <p className="text-2xl font-bold">{summaryLoading ? '…' : String(summary?.total_leases_revalued ?? 0)}</p>
                </div>
                <Globe className="w-8 h-8 text-indigo-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total FX Gain</p>
                  <p className="text-2xl font-bold text-emerald-500">
                    {summaryLoading ? '…' : `QAR ${fmt(summary?.total_fx_gain)}`}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-emerald-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total FX Loss</p>
                  <p className="text-2xl font-bold text-red-500">
                    {summaryLoading ? '…' : `QAR ${fmt(summary?.total_fx_loss)}`}
                  </p>
                </div>
                <TrendingDown className="w-8 h-8 text-red-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Net P&L Impact</p>
                  <p className={`text-2xl font-bold ${netImpact >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {summaryLoading ? '…' : `QAR ${fmt(Math.abs(netImpact))}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{netImpact >= 0 ? 'Net Gain' : 'Net Loss'}</p>
                </div>
                <DollarSign className="w-8 h-8 text-amber-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* FX Rate Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Current FX Rates (Latest per Currency)</CardTitle>
              <Input
                placeholder="Filter currency..."
                className="w-36 h-7 text-xs"
                value={filterCurrency}
                onChange={e => setFilterCurrency(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {ratesLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Loading rates...</div>
            ) : filteredRates.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                No FX rates found. Add rates using the "Add FX Rate" button.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2 font-medium">Currency</th>
                      <th className="text-right px-4 py-2 font-medium">Rate (QAR per 1 FC)</th>
                      <th className="text-right px-4 py-2 font-medium">Rate Date</th>
                      <th className="text-left px-4 py-2 font-medium">Source</th>
                      <th className="text-right px-4 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRates.map((r, i) => (
                      <tr key={i} className="border-b hover:bg-muted/20">
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="font-mono">{String(r.currency)}</Badge>
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-medium">{fmt(r.closing_rate, 6)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{String(r.rate_date).slice(0, 10)}</td>
                        <td className="px-4 py-2 text-muted-foreground">{String(r.source ?? '—')}</td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => {
                              setNewCurrency(String(r.currency));
                              setNewRate(String(r.closing_rate));
                              setNewDate(new Date().toISOString().slice(0, 10));
                              setShowAddRate(true);
                            }}
                          >
                            Update
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revaluation Log */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowLog(v => !v)}>
              <CardTitle className="text-base">
                Revaluation Log — {MONTHS[selectedMonth - 1]} {selectedYear}
                {log.length > 0 && <Badge className="ml-2 bg-indigo-600 text-white">{log.length}</Badge>}
              </CardTitle>
              {showLog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </CardHeader>
          {showLog && (
            <CardContent className="p-0">
              {logLoading ? (
                <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
              ) : log.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  No revaluation entries for this period. Click "Run Revaluation" to process.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-2 font-medium">Contract</th>
                        <th className="text-left px-4 py-2 font-medium">Asset</th>
                        <th className="text-center px-4 py-2 font-medium">CCY</th>
                        <th className="text-right px-4 py-2 font-medium">Liability (FC)</th>
                        <th className="text-right px-4 py-2 font-medium">Closing Rate</th>
                        <th className="text-right px-4 py-2 font-medium">Prev Carrying (QAR)</th>
                        <th className="text-right px-4 py-2 font-medium">Revalued (QAR)</th>
                        <th className="text-right px-4 py-2 font-medium">FX Gain / Loss</th>
                        <th className="text-left px-4 py-2 font-medium">JE Ref</th>
                        <th className="text-left px-4 py-2 font-medium">Posted By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.map((row, i) => {
                        const gl = Number(row.fx_gain_loss);
                        return (
                          <tr key={i} className="border-b hover:bg-muted/20">
                            <td className="px-4 py-2 font-mono text-xs">{String(row.contract_ref)}</td>
                            <td className="px-4 py-2 text-xs max-w-[140px] truncate">{String(row.asset_description)}</td>
                            <td className="px-4 py-2 text-center">
                              <Badge variant="outline" className="font-mono text-xs">{String(row.currency)}</Badge>
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{fmt(row.original_amount_fc)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{fmt(row.closing_rate, 6)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{fmt(row.prev_carrying_lc)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs font-medium">{fmt(row.revalued_amount_lc)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">
                              <span className={gl >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                                {gl >= 0 ? '+' : ''}{fmt(gl)}
                              </span>
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-indigo-400">{String(row.je_ref ?? '—')}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{String(row.posted_by ?? '—')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30 font-semibold">
                        <td colSpan={7} className="px-4 py-2 text-right text-xs">Net FX Impact:</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          <span className={netImpact >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                            {netImpact >= 0 ? '+' : ''}{fmt(netImpact)}
                          </span>
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* ── Right Panel: Add / Update FX Rate ─────────────────────────────── */}
      {showAddRate && (
        <div className="w-96 border-l bg-card flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-semibold text-sm">Add / Update FX Rate</h2>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAddRate(false)}>
              <span className="text-lg leading-none">×</span>
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Currency</Label>
                <Select value={newCurrency} onValueChange={setNewCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Rate Date</Label>
                <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Closing Rate (QAR per 1 {newCurrency})</Label>
              <Input type="number" step="0.000001" placeholder="e.g. 3.641000" value={newRate} onChange={e => setNewRate(e.target.value)} />
            </div>
            <div>
              <Label>Source</Label>
              <Input value={newSource} onChange={e => setNewSource(e.target.value)} placeholder="Manual / Bloomberg / Reuters" />
            </div>
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-400">
              <strong>IAS 21:</strong> Use the closing rate (spot rate at period end) for monetary items such as lease liabilities.
            </div>
          </div>
          <div className="px-5 py-4 border-t flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAddRate(false)}>Cancel</Button>
            <Button size="sm"
              onClick={() => upsertMut.mutate({ currency: newCurrency, rateDate: newDate, closingRate: parseFloat(newRate), source: newSource })}
              disabled={!newRate || isNaN(parseFloat(newRate)) || upsertMut.isPending}>
              {upsertMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : null}
              Save Rate
            </Button>
          </div>
        </div>
      )}

      {/* ── Right Panel: Run Revaluation Confirm ──────────────────────────── */}
      {showRunConfirm && (
        <div className="w-96 border-l bg-card flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-semibold text-sm">Run FX Revaluation</h2>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowRunConfirm(false)}>
              <span className="text-lg leading-none">×</span>
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              This will revalue all non-QAR lease liabilities for{' '}
              <strong>{MONTHS[selectedMonth - 1]} {selectedYear}</strong> using the latest available closing rates.
            </p>
            <ul className="text-sm space-y-2 text-muted-foreground list-disc list-inside">
              <li>JE-8 entries will be posted to the GL for each revalued lease</li>
              <li>FX gain/loss will be recorded to account 4500 / 2100</li>
              <li>Re-running for the same period will overwrite previous results</li>
            </ul>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400">
              <strong>IAS 21.23:</strong> At the end of each reporting period, monetary items denominated in a foreign currency shall be translated using the closing rate.
            </div>
          </div>
          <div className="px-5 py-4 border-t flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowRunConfirm(false)}>Cancel</Button>
            <Button size="sm" onClick={() => runMut.mutate({ year: selectedYear, month: selectedMonth })} disabled={runMut.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {runMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
              Run Revaluation
            </Button>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
