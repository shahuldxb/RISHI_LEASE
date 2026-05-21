/**
 * VodaLease Enterprise — Financial Statements
 * Screen ID: VFLACCFNST0001P001
 * IAS 1 — Statement of Financial Position, P&L, Cash Flow
 * All data sourced from live posted GL entries in lease.gl_postings
 */
import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Building2, TrendingUp, Banknote, Download, RefreshCw, FileText, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const SCREEN_ID = 'VFLACCFNST0001P001';

function fmt(v: unknown, decimals = 0): string {
  const n = Number(v ?? 0);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-QA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

function fmtSign(v: unknown): string {
  const n = Number(v ?? 0);
  if (isNaN(n)) return '—';
  const abs = Math.abs(n);
  const formatted = new Intl.NumberFormat('en-QA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs);
  return n < 0 ? `(${formatted})` : formatted;
}

type FSLine = Record<string, unknown>;

function SectionGroup({ lines, title, highlight }: { lines: FSLine[]; title: string; highlight?: boolean }) {
  if (!lines.length) return null;
  const total = lines.reduce((s, l) => s + Number(l.amount ?? 0), 0);
  return (
    <div className={`mb-4 ${highlight ? 'bg-muted/30 rounded-lg p-3' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
        <span className="text-sm font-bold">{fmtSign(total)} QAR</span>
      </div>
      <div className="space-y-1">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono w-28">{String(l.ledger_no ?? l.account_code ?? '')}</span>
              <span className="text-sm">{String(l.ledger_name ?? l.account_name ?? l.line_label ?? '')}</span>
            </div>
            <span className={`text-sm font-medium tabular-nums ${Number(l.amount ?? 0) < 0 ? 'text-red-400' : ''}`}>
              {fmtSign(l.amount)} QAR
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FinancialStatements() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [activeTab, setActiveTab] = useState('balance-sheet');

  // Period calculations
  const periodEnd = `${year}-12-31`;
  const periodStart = `${year}-01-01`;

  const bsQuery = trpc.lease.getBalanceSheet.useQuery(
    { periodEnd },
    { enabled: activeTab === 'balance-sheet' }
  );
  const plQuery = trpc.lease.getIncomeStatement.useQuery(
    { periodStart, periodEnd },
    { enabled: activeTab === 'income-statement' }
  );
  const cfQuery = trpc.lease.getCashFlowStatement.useQuery(
    { periodStart, periodEnd },
    { enabled: activeTab === 'cash-flow' }
  );

  // Group Balance Sheet lines by section
  const bsGroups = useMemo(() => {
    const lines = (bsQuery.data?.lines ?? []) as FSLine[];
    const groups: Record<string, FSLine[]> = {};
    lines.forEach(l => {
      const section = String(l.section ?? l.account_class ?? 'Other');
      if (!groups[section]) groups[section] = [];
      groups[section].push(l);
    });
    return groups;
  }, [bsQuery.data]);

  const plGroups = useMemo(() => {
    const lines = (plQuery.data?.lines ?? []) as FSLine[];
    const groups: Record<string, FSLine[]> = {};
    lines.forEach(l => {
      const section = String(l.section ?? l.account_class ?? 'Other');
      if (!groups[section]) groups[section] = [];
      groups[section].push(l);
    });
    return groups;
  }, [plQuery.data]);

  const cfGroups = useMemo(() => {
    const lines = (cfQuery.data?.lines ?? []) as FSLine[];
    const groups: Record<string, FSLine[]> = {};
    lines.forEach(l => {
      const section = String(l.section ?? l.cf_category ?? 'Other');
      if (!groups[section]) groups[section] = [];
      groups[section].push(l);
    });
    return groups;
  }, [cfQuery.data]);

  const bsSummary = bsQuery.data?.summary as Record<string, unknown> ?? {};
  const plSummary = plQuery.data?.summary as Record<string, unknown> ?? {};
  const cfSummary = cfQuery.data?.summary as Record<string, unknown> ?? {};

  const years = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

  const handleExport = (type: string) => {
    toast.info(`Export to Excel for ${type} — coming soon`);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFACC-FINSTAT-001" screenType="financial_statements"
          title="Financial Statements"
          subtitle="Live statements generated from posted GL entries — Balance Sheet, P&L, Cash Flow"
          icon={<Building2 className="h-6 w-6 text-blue-400" />}
          actions={
            <div className="flex items-center gap-3">
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => handleExport(activeTab)}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </div>
          }
        />

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">Total ROU Assets</span>
              </div>
              <div className="text-xl font-bold text-blue-400">
                {fmt(bsSummary.total_rou_assets)} QAR
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Banknote className="h-4 w-4 text-amber-400" />
                <span className="text-xs text-muted-foreground">Total Lease Liabilities</span>
              </div>
              <div className="text-xl font-bold text-amber-400">
                {fmt(bsSummary.total_lease_liabilities)} QAR
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-red-400" />
                <span className="text-xs text-muted-foreground">Total Lease Expense (P&amp;L)</span>
              </div>
              <div className="text-xl font-bold text-red-400">
                {fmt(plSummary.total_lease_expense)} QAR
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Banknote className="h-4 w-4 text-green-400" />
                <span className="text-xs text-muted-foreground">Lease Cash Outflows</span>
              </div>
              <div className="text-xl font-bold text-green-400">
                {fmt(cfSummary.total_lease_payments)} QAR
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-lg">
            <TabsTrigger value="balance-sheet" className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" /> Balance Sheet
            </TabsTrigger>
            <TabsTrigger value="income-statement" className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> P&amp;L
            </TabsTrigger>
            <TabsTrigger value="cash-flow" className="flex items-center gap-1">
              <Banknote className="h-3.5 w-3.5" /> Cash Flow
            </TabsTrigger>
          </TabsList>

          {/* BALANCE SHEET */}
          <TabsContent value="balance-sheet">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Statement of Financial Position
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">As at 31 December {year}</span>
                </div>
              </CardHeader>
              <CardContent>
                {bsQuery.isLoading && (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading balance sheet...
                  </div>
                )}
                {bsQuery.isError && (
                  <div className="flex items-center gap-2 text-red-400 py-8">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">{bsQuery.error.message}</span>
                  </div>
                )}
                {bsQuery.data && (
                  <div className="space-y-2">
                    {/* Assets */}
                    <h3 className="text-base font-bold border-b border-border pb-2 mb-3">ASSETS</h3>
                    {['Non-Current Assets', 'Current Assets'].map(section => (
                      bsGroups[section] && <SectionGroup key={section} lines={bsGroups[section]} title={section} />
                    ))}
                    {Object.entries(bsGroups)
                      .filter(([k]) => !['Non-Current Assets', 'Current Assets', 'Non-Current Liabilities', 'Current Liabilities', 'Equity'].includes(k))
                      .map(([k, v]) => <SectionGroup key={k} lines={v} title={k} />)
                    }
                    <div className="flex justify-between py-2 border-t-2 border-border font-bold text-base mt-4">
                      <span>TOTAL ASSETS</span>
                      <span>{fmtSign(bsSummary.total_assets)} QAR</span>
                    </div>

                    <Separator className="my-4" />

                    {/* Liabilities & Equity */}
                    <h3 className="text-base font-bold border-b border-border pb-2 mb-3">LIABILITIES &amp; EQUITY</h3>
                    {['Non-Current Liabilities', 'Current Liabilities'].map(section => (
                      bsGroups[section] && <SectionGroup key={section} lines={bsGroups[section]} title={section} />
                    ))}
                    {bsGroups['Equity'] && <SectionGroup lines={bsGroups['Equity']} title="Equity" />}
                    <div className="flex justify-between py-2 border-t-2 border-border font-bold text-base mt-4">
                      <span>TOTAL LIABILITIES &amp; EQUITY</span>
                      <span>{fmtSign(bsSummary.total_liabilities_equity)} QAR</span>
                    </div>

                    {/* Balance check */}
                    {bsSummary.is_balanced === false && (
                      <div className="flex items-center gap-2 text-amber-400 text-sm mt-3 p-3 bg-amber-500/10 rounded">
                        <AlertCircle className="h-4 w-4" />
                        Balance sheet does not balance — check for unposted entries or missing GL mappings.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* INCOME STATEMENT */}
          <TabsContent value="income-statement">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Statement of Profit or Loss
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">Year ended 31 December {year}</span>
                </div>
              </CardHeader>
              <CardContent>
                {plQuery.isLoading && (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading income statement...
                  </div>
                )}
                {plQuery.isError && (
                  <div className="flex items-center gap-2 text-red-400 py-8">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">{plQuery.error.message}</span>
                  </div>
                )}
                {plQuery.data && (
                  <div className="space-y-2">
                    {['Revenue', 'Operating Expenses', 'Depreciation', 'Finance Costs', 'Other Income', 'Other Expenses'].map(section => (
                      plGroups[section] && <SectionGroup key={section} lines={plGroups[section]} title={section} />
                    ))}
                    {Object.entries(plGroups)
                      .filter(([k]) => !['Revenue', 'Operating Expenses', 'Depreciation', 'Finance Costs', 'Other Income', 'Other Expenses'].includes(k))
                      .map(([k, v]) => <SectionGroup key={k} lines={v} title={k} />)
                    }
                    <Separator className="my-3" />
                    <div className="flex justify-between py-2 font-semibold">
                      <span>Depreciation on ROU Assets</span>
                      <span className="text-red-400">{fmtSign(plSummary.depreciation_expense)} QAR</span>
                    </div>
                    <div className="flex justify-between py-2 font-semibold">
                      <span>Interest on Lease Liabilities</span>
                      <span className="text-red-400">{fmtSign(plSummary.interest_expense)} QAR</span>
                    </div>
                    <div className="flex justify-between py-2 font-semibold">
                      <span>FX Gain / (Loss) on Lease Liabilities</span>
                      <span className={Number(plSummary.fx_gain_loss ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {fmtSign(plSummary.fx_gain_loss)} QAR
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-t-2 border-border font-bold text-base mt-4">
                      <span>NET PROFIT / (LOSS) FOR THE YEAR</span>
                      <span className={Number(plSummary.net_profit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {fmtSign(plSummary.net_profit)} QAR
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* CASH FLOW */}
          <TabsContent value="cash-flow">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Banknote className="h-4 w-4" />
                    Statement of Cash Flows — Lease Section
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">Year ended 31 December {year}</span>
                </div>
              </CardHeader>
              <CardContent>
                {cfQuery.isLoading && (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading cash flow statement...
                  </div>
                )}
                {cfQuery.isError && (
                  <div className="flex items-center gap-2 text-red-400 py-8">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">{cfQuery.error.message}</span>
                  </div>
                )}
                {cfQuery.data && (
                  <div className="space-y-2">
                    {['Operating Activities', 'Financing Activities', 'Investing Activities'].map(section => (
                      cfGroups[section] && <SectionGroup key={section} lines={cfGroups[section]} title={section} highlight />
                    ))}
                    {Object.entries(cfGroups)
                      .filter(([k]) => !['Operating Activities', 'Financing Activities', 'Investing Activities'].includes(k))
                      .map(([k, v]) => <SectionGroup key={k} lines={v} title={k} />)
                    }
                    <Separator className="my-3" />
                    <div className="flex justify-between py-2 font-semibold">
                      <span>Principal repayments of lease liabilities (IFRS 16)</span>
                      <span className="text-red-400">{fmtSign(cfSummary.principal_payments)} QAR</span>
                    </div>
                    <div className="flex justify-between py-2 font-semibold">
                      <span>Interest paid on lease liabilities (IFRS 16)</span>
                      <span className="text-red-400">{fmtSign(cfSummary.interest_payments)} QAR</span>
                    </div>
                    <div className="flex justify-between py-2 border-t-2 border-border font-bold text-base mt-4">
                      <span>NET CASH OUTFLOW FROM LEASES</span>
                      <span className="text-red-400">{fmtSign(cfSummary.total_lease_payments)} QAR</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 p-3 bg-muted/30 rounded">
                      Under IFRS 16, principal repayments are classified as financing activities and interest payments
                      may be classified as either operating or financing activities per IAS 7 Para 31.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
