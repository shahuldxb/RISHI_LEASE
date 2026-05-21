/**
 * VodaLease Enterprise — Lease Renewal Engine
 * IFRS 16 Para 45 compliant renewal workflow with maker/checker approval
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
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, Plus, CheckCircle, XCircle, Clock, AlertTriangle, CalendarClock, X } from "lucide-react";
import { toast } from 'sonner';

const fmt = (n: unknown, dec = 2) =>
  typeof n === 'number' ? n.toLocaleString('en-ZA', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';

type Renewal = Record<string, unknown>;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Pending:  'bg-amber-500/20 text-amber-300 border-amber-500/30',
    Approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    Rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
  };
  return <Badge className={`text-xs border ${map[status] ?? 'bg-muted text-muted-foreground border-border'}`}>{status}</Badge>;
}

function daysToExpiryBadge(days: number) {
  if (days < 0)  return <Badge className="text-xs bg-red-500/20 text-red-300 border border-red-500/30">Expired</Badge>;
  if (days < 30) return <Badge className="text-xs bg-red-500/20 text-red-300 border border-red-500/30">{days}d</Badge>;
  if (days < 90) return <Badge className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">{days}d</Badge>;
  return <Badge className="text-xs bg-muted text-muted-foreground border border-border">{days}d</Badge>;
}

const EMPTY_FORM = {
  contractId: '', newExpiryDate: '', newMonthlyPayment: '', newTermMonths: '', newIBR: '', notes: '',
};

export default function RenewalEngine() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showInitiate, setShowInitiate] = useState(false);
  const [confirmRow, setConfirmRow] = useState<{ action: 'approve' | 'reject'; renewal: Renewal } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const utils = trpc.useUtils();

  const { data: renewals = [], isLoading } = trpc.lease.getRenewals.useQuery(
    { status: statusFilter === 'all' ? undefined : statusFilter },
    { retry: false }
  );

  const initiateMut = trpc.lease.initiateRenewal.useMutation({
    onSuccess: () => {
      toast.success('Renewal initiated and submitted for approval');
      setShowInitiate(false);
      setForm({ ...EMPTY_FORM });
      utils.lease.getRenewals.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const approveMut = trpc.lease.approveRenewal.useMutation({
    onSuccess: () => {
      toast.success('Renewal approved — amortisation schedule regenerated');
      setConfirmRow(null);
      utils.lease.getRenewals.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMut = trpc.lease.rejectRenewal.useMutation({
    onSuccess: () => {
      toast.success('Renewal rejected');
      setConfirmRow(null);
      utils.lease.getRenewals.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = renewals as Renewal[];
  const pending  = rows.filter(r => r.status === 'Pending').length;
  const expiring = rows.filter(r => Number(r.days_to_expiry) >= 0 && Number(r.days_to_expiry) < 90).length;
  const approved = rows.filter(r => r.status === 'Approved').length;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFLSE-RENEWAL-001" screenType="renewal_engine"
          title="Renewal Engine"
          subtitle="IFRS 16 Para 45 — manage lease extensions with maker/checker approval"
          icon={<CalendarClock className="h-6 w-6 text-emerald-400" />}
          actions={
            <div className="flex items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setShowInitiate(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4" /> Initiate Renewal
              </Button>
            </div>
          }
        />

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Pending Approval', value: pending,  icon: Clock,         color: 'text-amber-400',  bg: 'bg-amber-500/10' },
            { label: 'Expiring < 90 Days', value: expiring, icon: AlertTriangle, color: 'text-red-400',    bg: 'bg-red-500/10' },
            { label: 'Approved',          value: approved, icon: CheckCircle,   color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
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

        {/* Renewals table */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Renewal Queue</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No renewals found. Click <strong>Initiate Renewal</strong> to start one.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      {['Contract', 'Asset', 'Lessor', 'Current Expiry', 'Days Left', 'New Expiry', 'New Payment', 'New IBR', 'Status', 'Actions'].map(h => (
                        <th key={h} className="text-left py-2 px-2 text-muted-foreground font-medium whitespace-nowrap text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="py-2 px-2 font-mono text-xs text-blue-400">{String(r.contract_ref ?? '—')}</td>
                        <td className="py-2 px-2 max-w-[140px] truncate text-foreground text-xs">{String(r.asset_description ?? '—')}</td>
                        <td className="py-2 px-2 text-muted-foreground text-xs">{String(r.lessor_name ?? '—')}</td>
                        <td className="py-2 px-2 text-muted-foreground text-xs">
                          {r.current_expiry_date ? new Date(r.current_expiry_date as string).toLocaleDateString('en-ZA') : '—'}
                        </td>
                        <td className="py-2 px-2">{daysToExpiryBadge(Number(r.days_to_expiry))}</td>
                        <td className="py-2 px-2 text-foreground text-xs">
                          {r.new_expiry_date ? new Date(r.new_expiry_date as string).toLocaleDateString('en-ZA') : '—'}
                        </td>
                        <td className="py-2 px-2 text-right text-foreground text-xs">{fmt(r.new_monthly_payment)}</td>
                        <td className="py-2 px-2 text-right text-foreground text-xs">
                          {typeof r.new_ibr === 'number' ? `${(r.new_ibr * 100).toFixed(2)}%` : '—'}
                        </td>
                        <td className="py-2 px-2">{statusBadge(String(r.status))}</td>
                        <td className="py-2 px-2">
                          {r.status === 'Pending' && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline"
                                className="h-6 px-2 text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                                onClick={() => setConfirmRow({ action: 'approve', renewal: r })}>
                                <CheckCircle className="h-3 w-3 mr-1" />Approve
                              </Button>
                              <Button size="sm" variant="outline"
                                className="h-6 px-2 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                                onClick={() => setConfirmRow({ action: 'reject', renewal: r })}>
                                <XCircle className="h-3 w-3 mr-1" />Reject
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Initiate Renewal — inline panel */}
      {showInitiate && (
        <div className="mx-6 mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Initiate Lease Renewal</h4>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowInitiate(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-xs mb-1 block">Contract ID <span className="text-red-400">*</span></Label>
              <Input type="number" placeholder="e.g. 42" value={form.contractId}
                onChange={e => setForm(f => ({ ...f, contractId: e.target.value }))} />
              <p className="text-xs text-muted-foreground mt-1">Must be an Active or Modified lease</p>
            </div>
            <div>
              <Label className="text-xs mb-1 block">New Expiry Date <span className="text-red-400">*</span></Label>
              <Input type="date" value={form.newExpiryDate}
                onChange={e => setForm(f => ({ ...f, newExpiryDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">New Term (months) <span className="text-red-400">*</span></Label>
              <Input type="number" placeholder="e.g. 36" value={form.newTermMonths}
                onChange={e => setForm(f => ({ ...f, newTermMonths: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">New Monthly Payment <span className="text-red-400">*</span></Label>
              <Input type="number" placeholder="e.g. 15000" value={form.newMonthlyPayment}
                onChange={e => setForm(f => ({ ...f, newMonthlyPayment: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">New IBR (decimal) <span className="text-red-400">*</span></Label>
              <Input type="number" step="0.001" placeholder="e.g. 0.085" value={form.newIBR}
                onChange={e => setForm(f => ({ ...f, newIBR: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs mb-1 block">Notes</Label>
              <Textarea placeholder="Renewal rationale, negotiation notes, board approval reference…"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300">
            <strong>IFRS 16 Para 45:</strong> On approval, the system will remeasure the lease liability at the revised present value of remaining payments discounted at the new IBR, and regenerate all Projected amortisation periods.
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => setShowInitiate(false)}>Cancel</Button>
            <Button size="sm" disabled={initiateMut.isPending}
              onClick={() => {
                if (!form.contractId || !form.newExpiryDate || !form.newMonthlyPayment || !form.newTermMonths || !form.newIBR) {
                  toast.error('Please fill all required fields');
                  return;
                }
                initiateMut.mutate({
                  contractId:        Number(form.contractId),
                  newExpiryDate:     form.newExpiryDate,
                  newMonthlyPayment: Number(form.newMonthlyPayment),
                  newTermMonths:     Number(form.newTermMonths),
                  newIBR:            Number(form.newIBR),
                  notes:             form.notes || undefined,
                });
              }}>
              {initiateMut.isPending ? 'Submitting…' : 'Submit for Approval'}
            </Button>
          </div>
        </div>
      )}

      {/* Confirm Approve/Reject — inline panel */}
      {confirmRow && (
        <div className={`mx-6 mb-4 rounded-xl border p-5 space-y-3 ${confirmRow.action === 'approve' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              {confirmRow.action === 'approve'
                ? <><CheckCircle className="h-4 w-4 text-emerald-400" /> Approve Renewal</>
                : <><XCircle className="h-4 w-4 text-red-400" /> Reject Renewal</>}
            </h4>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setConfirmRow(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {confirmRow.action === 'approve'
              ? `Approving will regenerate the amortisation schedule for contract ${confirmRow.renewal.contract_ref} with the new terms. All future Projected periods will be replaced. This action cannot be undone.`
              : `Rejecting will mark this renewal as rejected. The original lease terms remain unchanged.`}
          </p>
          {confirmRow.action === 'approve' && (
            <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 rounded-lg p-3">
              <span className="text-muted-foreground">New expiry:</span>
              <span className="text-foreground">{confirmRow.renewal.new_expiry_date ? new Date(confirmRow.renewal.new_expiry_date as string).toLocaleDateString('en-ZA') : '—'}</span>
              <span className="text-muted-foreground">New payment:</span>
              <span className="text-foreground">{fmt(confirmRow.renewal.new_monthly_payment)}</span>
              <span className="text-muted-foreground">New IBR:</span>
              <span className="text-foreground">{typeof confirmRow.renewal.new_ibr === 'number' ? `${(confirmRow.renewal.new_ibr * 100).toFixed(2)}%` : '—'}</span>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => setConfirmRow(null)}>Cancel</Button>
            <Button size="sm"
              className={confirmRow.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
              disabled={approveMut.isPending || rejectMut.isPending}
              onClick={() => {
                const id = Number(confirmRow.renewal.renewal_id);
                if (confirmRow.action === 'approve') approveMut.mutate({ renewalId: id });
                else rejectMut.mutate({ renewalId: id });
              }}>
              {confirmRow.action === 'approve' ? 'Approve & Regenerate' : 'Reject'}
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
