/**
 * VodaLease Enterprise — Period-End Close Lock
 * Locks Posted rows for a month so they cannot be re-posted or modified
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Lock, Unlock, CheckCircle, AlertTriangle, Calendar, BookOpen, X, ChevronDown, ChevronRight } from "lucide-react";
import { groupDrCrByAmount, type JVLine, type JVGroup } from "@/lib/jvGrouping";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from 'sonner';

type PeriodRow = {
  period_year: number;
  period_month: number;
  month_name: string;
  is_closed: number;
  closed_at: string | null;
  closed_by: string | null;
  notes: string | null;
  posted_count: number;
  projected_count: number;
};

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function PeriodClose() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [confirmClose, setConfirmClose] = useState<PeriodRow | null>(null);
  const [confirmReopen, setConfirmReopen] = useState<PeriodRow | null>(null);
  const [closeNotes, setCloseNotes] = useState('');

  const utils = trpc.useUtils();

  const { data: periods = [], isLoading } = trpc.lease.getPeriodCloseStatus.useQuery(
    { year },
    { retry: false }
  );

  const closeMut = trpc.lease.closePeriod.useMutation({
    onSuccess: () => {
      toast.success(`Period closed — all Posted rows are now Locked`);
      setConfirmClose(null);
      setCloseNotes('');
      utils.lease.getPeriodCloseStatus.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [previewMonth, setPreviewMonth] = useState<number | null>(null);
  const sendToJvMut = trpc.journalVoucher.generatePeriodClose.useMutation({
    onSuccess: (r: any) => {
      toast.success(`JV ${r?.jv_number ?? ''} created — open Journal Voucher Register to review and post`);
      // Show preview for the month that was just generated
      utils.journalVoucher.list.invalidate();
    },
    onError: (e: any) => toast.error(`JV generation failed: ${e.message}`),
  });

  // Fetch JV lines for the preview month to show Dr/Cr grouping
  const { data: periodJvData } = trpc.journalVoucher.list.useQuery(
    { period_year: year, period_month: previewMonth ?? 1, page: 1, page_size: 50 },
    { enabled: previewMonth != null }
  );
  const periodJvLines = (periodJvData as any)?.allLines ?? [];
  const periodJvRows = (periodJvData as any)?.rows ?? [];

  // Group lines for preview
  const previewGroups: JVGroup[] = (() => {
    if (!previewMonth || periodJvLines.length === 0) return [];
    const mapped: JVLine[] = periodJvLines.map((l: any) => ({
      dr_cr: l.dr_cr?.toUpperCase() === 'DR' ? 'Dr' as const : 'Cr' as const,
      account_code: l.account_code ?? '',
      account_name: l.account_name ?? l.description ?? '',
      amount: Math.abs(Number(l.amount ?? 0)),
      description: l.line_description ?? l.description ?? '',
    }));
    return groupDrCrByAmount(mapped);
  })();
  const reopenMut = trpc.lease.reopenPeriod.useMutation({
    onSuccess: () => {
      toast.success(`Period reopened — Locked rows restored to Posted`);
      setConfirmReopen(null);
      utils.lease.getPeriodCloseStatus.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = periods as PeriodRow[];
  const closedCount   = rows.filter(r => r.is_closed).length;
  const openCount     = rows.filter(r => !r.is_closed).length;
  const totalPosted   = rows.reduce((s, r) => s + (r.posted_count || 0), 0);
  const totalProjected = rows.reduce((s, r) => s + (r.projected_count || 0), 0);

  // Determine the "current" month to highlight
  const nowMonth = new Date().getMonth() + 1;
  const nowYear  = new Date().getFullYear();

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFACC-PERDCLOSE-001" screenType="period_close"
          onAIData={(rows) => { /* Period close AI data handler */ }}
          title="Period-End Close Lock"
          subtitle="Lock Posted periods to prevent re-posting — essential for audit integrity"
          icon={<Lock className="h-6 w-6 text-violet-400" />}
          actions={
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
          }
        />

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Closed Periods', value: closedCount,    icon: Lock,         color: 'text-violet-400', bg: 'bg-violet-500/10' },
            { label: 'Open Periods',   value: openCount,      icon: Unlock,       color: 'text-blue-400',   bg: 'bg-blue-500/10' },
            { label: 'Posted Rows',    value: totalPosted,    icon: CheckCircle,  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Projected Rows', value: totalProjected, icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-500/10' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="bg-card/60 border-border/50">
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-2xl font-bold text-foreground">{value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Period grid */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {year} — Monthly Close Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading…</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {rows.map((row) => {
                  const isCurrent = row.period_year === nowYear && row.period_month === nowMonth;
                  const isClosed  = Boolean(row.is_closed);
                  return (
                    <div
                      key={row.period_month}
                      className={`rounded-lg border p-4 transition-colors ${
                        isClosed
                          ? 'bg-violet-500/10 border-violet-500/30'
                          : isCurrent
                          ? 'bg-blue-500/10 border-blue-500/30'
                          : 'bg-card/40 border-border/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{MONTH_NAMES[row.period_month]}</span>
                          {isCurrent && <Badge className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">Current</Badge>}
                        </div>
                        {isClosed
                          ? <Badge className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30"><Lock className="h-3 w-3 mr-1 inline" />Closed</Badge>
                          : <Badge className="text-xs bg-muted text-muted-foreground border border-border"><Unlock className="h-3 w-3 mr-1 inline" />Open</Badge>}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="bg-emerald-500/10 rounded p-2 text-center">
                          <div className="text-emerald-400 font-semibold text-base">{row.posted_count}</div>
                          <div className="text-muted-foreground">Posted</div>
                        </div>
                        <div className="bg-amber-500/10 rounded p-2 text-center">
                          <div className="text-amber-400 font-semibold text-base">{row.projected_count}</div>
                          <div className="text-muted-foreground">Projected</div>
                        </div>
                      </div>

                      {isClosed && row.closed_at && (
                        <div className="text-xs text-muted-foreground mb-2">
                          Closed by <span className="text-foreground">{row.closed_by}</span> on{' '}
                          {new Date(row.closed_at).toLocaleDateString('en-ZA')}
                        </div>
                      )}

                      <div className="flex gap-2 mb-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-xs border-purple-700 text-purple-400 hover:bg-purple-900/30"
                          onClick={() => { sendToJvMut.mutate({ period_year: row.period_year, period_month: row.period_month }); setPreviewMonth(row.period_month); }}
                          disabled={sendToJvMut.isPending}
                        >
                          <BookOpen className="h-3 w-3 mr-1" /> Send to JV
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setPreviewMonth(previewMonth === row.period_month ? null : row.period_month)}
                          title="View JV lines"
                        >
                          {previewMonth === row.period_month ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        {!isClosed ? (
                          <Button
                            size="sm"
                            className="flex-1 h-7 text-xs bg-violet-600 hover:bg-violet-700"
                            disabled={row.posted_count === 0}
                            onClick={() => { setConfirmClose(row); setCloseNotes(''); }}
                          >
                            <Lock className="h-3 w-3 mr-1" /> Close Period
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-7 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                            onClick={() => setConfirmReopen(row)}
                          >
                            <Unlock className="h-3 w-3 mr-1" /> Reopen
                          </Button>
                        )}
                      </div>
                      {!isClosed && row.posted_count === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">No Posted rows — post periods first</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* JV Lines Preview with Dr/Cr Grouping */}
      {previewMonth != null && previewGroups.length > 0 && (
        <div className="mx-6 mb-4 rounded-xl border border-purple-500/40 bg-purple-500/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-purple-400" />
              JV Lines — {MONTH_NAMES[previewMonth]} {year} ({periodJvRows.length} JVs, {periodJvLines.length} lines)
            </h4>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setPreviewMonth(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-3">
            {previewGroups.map((group, gIdx) => (
              <div key={group.id} className={gIdx > 0 ? 'border-t border-purple-500/20 pt-3' : ''}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs font-mono">Group {gIdx + 1}</Badge>
                  <span className="text-xs text-muted-foreground">{group.label}</span>
                  {group.balanced && <Badge className="text-xs bg-emerald-500/20 text-emerald-400">Balanced</Badge>}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs w-12">Dr/Cr</TableHead>
                      <TableHead className="text-xs w-20">Account</TableHead>
                      <TableHead className="text-xs">Account Name</TableHead>
                      <TableHead className="text-xs text-right w-28">Debit</TableHead>
                      <TableHead className="text-xs text-right w-28">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...group.drLines, ...group.crLines].map((line, lIdx) => (
                      <TableRow key={lIdx} className={line.dr_cr === 'Dr' ? 'bg-emerald-500/5' : 'bg-rose-500/5'}>
                        <TableCell>
                          <Badge className={line.dr_cr === 'Dr' ? 'bg-emerald-500/20 text-emerald-400 text-xs' : 'bg-rose-500/20 text-rose-400 text-xs'}>{line.dr_cr}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold">{line.account_code}</TableCell>
                        <TableCell className="text-xs">{line.account_name}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-emerald-500">{line.dr_cr === 'Dr' ? Number(line.amount).toLocaleString('en-QA', { minimumFractionDigits: 2 }) : '—'}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-rose-500">{line.dr_cr === 'Cr' ? Number(line.amount).toLocaleString('en-QA', { minimumFractionDigits: 2 }) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm Close — inline panel */}
      {confirmClose && (
        <div className="mx-6 mb-4 rounded-xl border border-violet-500/40 bg-violet-500/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Lock className="h-4 w-4 text-violet-400" />
              Close {MONTH_NAMES[confirmClose.period_month]} {year}
            </h4>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setConfirmClose(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <p className="text-sm text-muted-foreground">
            This will lock all <strong className="text-foreground">{confirmClose.posted_count} Posted</strong> rows for{' '}
            {MONTH_NAMES[confirmClose.period_month]} {year}. Locked rows cannot be re-posted or modified.
          </p>
          <div>
            <Label className="text-xs mb-1.5 block">Close Notes (optional)</Label>
            <Textarea
              placeholder="e.g. Month-end close approved by Finance Director…"
              value={closeNotes}
              onChange={e => setCloseNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => setConfirmClose(null)}>Cancel</Button>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white"
              disabled={closeMut.isPending}
              onClick={() => closeMut.mutate({
                year: confirmClose.period_year,
                month: confirmClose.period_month,
                notes: closeNotes || undefined,
              })}>
              {closeMut.isPending ? 'Closing…' : 'Confirm Close'}
            </Button>
          </div>
        </div>
      )}

      {/* Confirm Reopen — inline panel */}
      {confirmReopen && (
        <div className="mx-6 mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Unlock className="h-4 w-4 text-amber-400" />
              Reopen {MONTH_NAMES[confirmReopen.period_month]} {year}
            </h4>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setConfirmReopen(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Reopening will restore all Locked rows to Posted status for{' '}
            {MONTH_NAMES[confirmReopen.period_month]} {year}. This should only be done with appropriate authorisation.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => setConfirmReopen(null)}>Cancel</Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={reopenMut.isPending}
              onClick={() => reopenMut.mutate({
                year: confirmReopen.period_year,
                month: confirmReopen.period_month,
              })}>
              {reopenMut.isPending ? 'Reopening…' : 'Confirm Reopen'}
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
