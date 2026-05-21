/**
 * VodaLease Enterprise — Trial Balance
 * Screen ID: VFLACCTBAL0001P001
 * Period-end GL account balances from posted lease entries
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, RefreshCw, AlertCircle, Search, FileText, Scale } from 'lucide-react';
import { toast } from 'sonner';

const SCREEN_ID = 'VFLACCTBAL0001P001';

function fmt(v: unknown): string {
  const n = Number(v ?? 0);
  if (isNaN(n) || n === 0) return '—';
  return new Intl.NumberFormat('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
}

type TBRow = Record<string, unknown>;

export default function TrialBalance() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(currentMonth).padStart(2, '0'));
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState({ year: String(currentYear), month: String(currentMonth).padStart(2, '0') });

  const periodEnd = `${submitted.year}-${submitted.month}-${new Date(Number(submitted.year), Number(submitted.month), 0).getDate()}`;

  const tbQuery = trpc.lease.getTrialBalance.useQuery({ periodEnd });
  const rows = (tbQuery.data?.lines ?? []) as TBRow[];
  const summary = tbQuery.data?.totals as Record<string, unknown> ?? {};

  const filtered = rows.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return String(r.ledger_no ?? '').toLowerCase().includes(s) ||
           String(r.ledger_name ?? '').toLowerCase().includes(s) ||
           String(r.account_class ?? '').toLowerCase().includes(s);
  });

  const years = Array.from({ length: 6 }, (_, i) => String(currentYear - i));
  const months = [
    { v: '01', l: 'January' }, { v: '02', l: 'February' }, { v: '03', l: 'March' },
    { v: '04', l: 'April' }, { v: '05', l: 'May' }, { v: '06', l: 'June' },
    { v: '07', l: 'July' }, { v: '08', l: 'August' }, { v: '09', l: 'September' },
    { v: '10', l: 'October' }, { v: '11', l: 'November' }, { v: '12', l: 'December' },
  ];

  const totalDebits = filtered.reduce((s, r) => s + Number(r.total_debit ?? 0), 0);
  const totalCredits = filtered.reduce((s, r) => s + Number(r.total_credit ?? 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  const classColour: Record<string, string> = {
    'Asset': 'text-blue-400',
    'Liability': 'text-amber-400',
    'Equity': 'text-purple-400',
    'Revenue': 'text-green-400',
    'Expense': 'text-red-400',
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFACC-TRIAL-001" screenType="trial_balance"
          title="Trial Balance"
          subtitle="Period-end GL account balances from all posted lease journal entries"
          icon={<Scale className="h-6 w-6 text-blue-400" />}
          actions={
            <div className="flex items-center gap-3">
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={() => setSubmitted({ year, month })} disabled={tbQuery.isLoading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${tbQuery.isLoading ? 'animate-spin' : ''}`} /> Run
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast.info('Export to Excel — coming soon')}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </div>
          }
        />

        {/* Balance check banner */}
        {rows.length > 0 && (
          <div className={`flex items-center gap-3 p-3 rounded-lg text-sm ${isBalanced ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {isBalanced ? (
              <span>✓ Trial balance is in balance — Total Debits = Total Credits = {new Intl.NumberFormat('en-QA', { minimumFractionDigits: 2 }).format(totalDebits)} QAR</span>
            ) : (
              <><AlertCircle className="h-4 w-4" /> Trial balance is OUT OF BALANCE — Debits: {new Intl.NumberFormat('en-QA', { minimumFractionDigits: 2 }).format(totalDebits)} QAR | Credits: {new Intl.NumberFormat('en-QA', { minimumFractionDigits: 2 }).format(totalCredits)} QAR | Difference: {new Intl.NumberFormat('en-QA', { minimumFractionDigits: 2 }).format(Math.abs(totalDebits - totalCredits))} QAR</>
            )}
          </div>
        )}

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground mb-1">Total Accounts</div>
              <div className="text-xl font-bold">{rows.length}</div>
            </CardContent>
          </Card>
          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground mb-1">Total Debits</div>
              <div className="text-lg font-bold text-green-400">{new Intl.NumberFormat('en-QA', { minimumFractionDigits: 0 }).format(totalDebits)} QAR</div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground mb-1">Total Credits</div>
              <div className="text-lg font-bold text-amber-400">{new Intl.NumberFormat('en-QA', { minimumFractionDigits: 0 }).format(totalCredits)} QAR</div>
            </CardContent>
          </Card>
          <Card className={`${isBalanced ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground mb-1">Balance Status</div>
              <div className={`text-lg font-bold ${isBalanced ? 'text-green-400' : 'text-red-400'}`}>
                {isBalanced ? 'Balanced ✓' : 'Out of Balance ✗'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search + Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Trial Balance — as at {months.find(m => m.v === submitted.month)?.l} {submitted.year}
              </CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search account..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tbQuery.isLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading trial balance...
              </div>
            )}
            {tbQuery.isError && (
              <div className="flex items-center gap-2 text-red-400 py-8">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{tbQuery.error.message}</span>
              </div>
            )}
            {tbQuery.data && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-32">Account No.</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead className="w-28">Class</TableHead>
                      <TableHead className="w-28">Type</TableHead>
                      <TableHead className="text-right w-36">Total Debits</TableHead>
                      <TableHead className="text-right w-36">Total Credits</TableHead>
                      <TableHead className="text-right w-36">Net Balance</TableHead>
                      <TableHead className="text-right w-24">Entries</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r, i) => {
                      const net = Number(r.net_balance ?? 0);
                      return (
                        <TableRow key={i} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="font-mono text-xs">{String(r.ledger_no ?? '')}</TableCell>
                          <TableCell className="text-sm">{String(r.ledger_name ?? '')}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${classColour[String(r.account_class ?? '')] ?? ''}`}>
                              {String(r.account_class ?? '—')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{String(r.account_type ?? '—')}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-green-400">{fmt(r.total_debit)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-amber-400">{fmt(r.total_credit)}</TableCell>
                          <TableCell className={`text-right font-mono text-xs font-semibold ${net < 0 ? 'text-red-400' : net > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {net !== 0 ? `${net < 0 ? '(' : ''}${fmt(net)}${net < 0 ? ')' : ''} QAR` : '—'}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{String(r.entry_count ?? 0)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Totals row */}
                    {filtered.length > 0 && (
                      <TableRow className="font-bold bg-muted/40 border-t-2 border-border">
                        <TableCell colSpan={4}>TOTALS</TableCell>
                        <TableCell className="text-right font-mono text-xs text-green-400">
                          {new Intl.NumberFormat('en-QA', { minimumFractionDigits: 2 }).format(totalDebits)} QAR
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-amber-400">
                          {new Intl.NumberFormat('en-QA', { minimumFractionDigits: 2 }).format(totalCredits)} QAR
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {new Intl.NumberFormat('en-QA', { minimumFractionDigits: 2 }).format(Math.abs(totalDebits - totalCredits))} QAR
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                    {filtered.length === 0 && !tbQuery.isLoading && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                          No GL entries found for this period. Post transactions to generate trial balance data.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
