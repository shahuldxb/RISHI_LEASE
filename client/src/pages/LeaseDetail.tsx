/**
 * VodaLease Enterprise — Lease Detail (Unified View/Edit)
 * All tabs are editable in-place with individual Save buttons.
 * Amortisation tab shows schedule for this specific lease only.
 */
import { useState, useEffect, Fragment } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Building2, DollarSign, FileText, User, Package, History, ArrowLeft, RefreshCw, BarChart2, Info, Save, Calculator, ChevronDown, ChevronUp, Pencil, CheckCircle, XCircle, AlertTriangle, X, Send } from "lucide-react";
import { LeaseStatPill, LeaseStatDivider, LeaseStatStrip } from "@/components/LeaseStatPill";

// ── Sub-Assets Grid ───────────────────────────────────────────────────────────
type SubAssetRow = {
  leaseSubAssetId: number;
  leaseId: string;
  assetId: number;
  assetCode: string;
  setName: string;
  status: string;
  statusDate: string | null;
  reason: string | null;
  replacedByCode: string | null;
  notes: string | null;
  tagsWithSerials: string | null;
  owner: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
};

const SUB_STATUS_BADGE: Record<string, string> = {
  Active:    'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  Cancelled: 'bg-red-500/15 text-red-400 border border-red-500/30',
  Returned:  'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  BackIn:    'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  Replaced:  'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  WriteOff:  'bg-slate-500/15 text-slate-400 border border-slate-500/30',
  Condemned: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
};

function SubAssetsGrid({ contractId }: { contractId: number }) {
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.lease.getSubAssetsByContractId.useQuery({ contractId });
  const logDev = trpc.lease.logSubAssetDeviation.useMutation();
  const updateStatus = trpc.asset.updateSubAssetStatus.useMutation({
    onSuccess: () => utils.lease.getSubAssetsByContractId.invalidate({ contractId }),
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const updateTags = trpc.asset.updateLeaseSubAssetTags.useMutation({
    onSuccess: () => utils.lease.getSubAssetsByContractId.invalidate({ contractId }),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<{ notes: string; tagsWithSerials: string }>({ notes: '', tagsWithSerials: '' });
  const [statusModal, setStatusModal] = useState<SubAssetRow | null>(null);
  const [newStatus, setNewStatus] = useState('Cancelled');
  const [statusReason, setStatusReason] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [devLog, setDevLog] = useState<{ action: string; code: string; name: string; ts: string }[]>([]);

  const startEdit = (row: SubAssetRow) => {
    setEditId(row.leaseSubAssetId);
    setEditRow({ notes: row.notes ?? '', tagsWithSerials: row.tagsWithSerials ?? '' });
  };
  const cancelEdit = () => { setEditId(null); setEditRow({ notes: '', tagsWithSerials: '' }); };

  const saveEdit = (row: SubAssetRow) => {
    const before = JSON.stringify({ notes: row.notes, tagsWithSerials: row.tagsWithSerials });
    const after  = JSON.stringify(editRow);
    updateTags.mutate({ leaseSubAssetId: row.leaseSubAssetId, tagsWithSerials: editRow.tagsWithSerials }, {
      onSuccess: () => {
        logDev.mutate({ action: 'EDIT', entityId: row.leaseSubAssetId, entityCode: row.assetCode, entityName: row.setName, beforeJson: before, afterJson: after });
        setDevLog(l => [{ action: 'EDIT', code: row.assetCode, name: row.setName, ts: new Date().toLocaleTimeString() }, ...l]);
        toast.success('Sub-asset updated');
        cancelEdit();
      },
    });
  };

  const applyStatus = () => {
    if (!statusModal) return;
    const row = statusModal;
    const before = JSON.stringify({ status: row.status });
    updateStatus.mutate({ leaseSubAssetId: row.leaseSubAssetId, newStatus: newStatus as any, statusDate: new Date().toISOString().split('T')[0], reason: statusReason, notes: statusNotes }, {
      onSuccess: () => {
        logDev.mutate({ action: newStatus.toUpperCase(), entityId: row.leaseSubAssetId, entityCode: row.assetCode, entityName: row.setName, beforeJson: before, afterJson: JSON.stringify({ status: newStatus, reason: statusReason }) });
        setDevLog(l => [{ action: newStatus.toUpperCase(), code: row.assetCode, name: row.setName, ts: new Date().toLocaleTimeString() }, ...l]);
        toast.success(`Status changed to ${newStatus}`);
        setStatusModal(null);
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2"><Package className="w-4 h-4 text-amber-400" /> Sub-Assets <span className="text-xs font-normal text-muted-foreground">({rows.length})</span></h4>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground animate-pulse py-4 text-center">Loading sub-assets…</p>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">No sub-assets attached to this lease.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Asset Code</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Set Name</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Status</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Owner</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Tags / Serials</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Notes</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Updated</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(rows as SubAssetRow[]).map((row) => (
                <tr key={row.leaseSubAssetId} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="px-3 py-2 font-mono text-primary">{row.assetCode}</td>
                  <td className="px-3 py-2">{row.setName}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SUB_STATUS_BADGE[row.status] ?? 'bg-muted text-muted-foreground'}`}>{row.status}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{row.owner ?? '—'}</td>
                  <td className="px-3 py-2 max-w-[150px]">
                    {editId === row.leaseSubAssetId ? (
                      <Input className="h-6 text-xs px-1.5 py-0 bg-muted/30" value={editRow.tagsWithSerials}
                        onChange={e => setEditRow(r => ({ ...r, tagsWithSerials: e.target.value }))} placeholder="Tags / serials…" />
                    ) : <span className="truncate block text-muted-foreground">{row.tagsWithSerials ?? '—'}</span>}
                  </td>
                  <td className="px-3 py-2 max-w-[130px]">
                    {editId === row.leaseSubAssetId ? (
                      <Input className="h-6 text-xs px-1.5 py-0 bg-muted/30" value={editRow.notes}
                        onChange={e => setEditRow(r => ({ ...r, notes: e.target.value }))} placeholder="Notes…" />
                    ) : <span className="truncate block text-muted-foreground">{row.notes ?? '—'}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{row.updatedAt ? fmtDate(row.updatedAt) : fmtDate(row.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {editId === row.leaseSubAssetId ? (
                        <>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-400" onClick={() => saveEdit(row)} disabled={updateTags.isPending}>
                            <CheckCircle className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={cancelEdit}>
                            <XCircle className="h-3.5 w-3.5" /></Button>
                        </>
                      ) : (
                        <>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(row)} title="Edit tags / notes">
                            <Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-amber-400" onClick={() => { setStatusModal(row); setNewStatus('Cancelled'); setStatusReason(''); setStatusNotes(''); }} title="Change status">
                            <AlertTriangle className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Session Deviation Log */}
      {devLog.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><History className="w-3 h-3" /> Session Deviation Log</h5>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30"><tr>
                <th className="text-left px-3 py-1.5 text-muted-foreground">Action</th>
                <th className="text-left px-3 py-1.5 text-muted-foreground">Asset Code</th>
                <th className="text-left px-3 py-1.5 text-muted-foreground">Set Name</th>
                <th className="text-left px-3 py-1.5 text-muted-foreground">Time</th>
              </tr></thead>
              <tbody>
                {devLog.map((d, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5"><span className="font-mono text-amber-400">{d.action}</span></td>
                    <td className="px-3 py-1.5 font-mono text-primary">{d.code}</td>
                    <td className="px-3 py-1.5">{d.name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{d.ts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status Change — inline panel */}
      {statusModal && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Change Sub-Asset Status
            </h4>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setStatusModal(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <p className="text-xs text-muted-foreground">Asset: <span className="font-mono text-primary">{statusModal.assetCode}</span> — {statusModal.setName}</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{['Cancelled','Returned','BackIn','Replaced','WriteOff','Condemned'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Reason</Label>
              <Input className="h-8 text-xs" value={statusReason} onChange={e => setStatusReason(e.target.value)} placeholder="Reason for change…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Input className="h-8 text-xs" value={statusNotes} onChange={e => setStatusNotes(e.target.value)} placeholder="Additional notes…" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setStatusModal(null)}>Cancel</Button>
            <Button size="sm" className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={applyStatus} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? 'Saving…' : 'Apply Status'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── constants ─────────────────────────────────────────────────────────────────
const ASSET_TYPES = ['Villa','Apartment','Vehicle','Heavy Vehicle','Tower Site','Data Centre','Retail Outlet','Office','Warehouse','Fleet Vehicle','Network Equipment','Generator Site','Other'];
const CURRENCIES  = ['QAR','USD','GHS','EUR','GBP','ZAR','KES','NGN','ZMW'];
const COUNTRIES   = ['QA','AE','SA','KW','BH','OM','GH','NG','ZA','KE','ZM','GB','US'];

const LIFECYCLE_COLORS: Record<string, string> = {
  Active:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Modified: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Draft:    'bg-slate-500/15 text-slate-400 border-slate-500/30',
  Closed:   'bg-red-500/15 text-red-400 border-red-500/30',
  Pending:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: unknown) =>
  typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(n ?? '—');
const fmtDate = (d: unknown) =>
  d ? new Date(d as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtPct = (v: unknown) =>
  v ? `${(Number(v) * 100).toFixed(4)}%` : '—';
const toDateStr = (v: unknown) =>
  v ? new Date(v as string).toISOString().split('T')[0] : '';

const inputCls = 'bg-muted/30 border-border focus:border-primary h-9 text-sm';
const labelCls = 'text-[11px] text-muted-foreground uppercase tracking-wide mb-1';

// ── Blackboard Dialog ─────────────────────────────────────────────────────────
function BlackboardDialog({ row, onClose }: { row: Record<string, unknown>; onClose: () => void }) {
  const opening = Number(row.opening_liability ?? 0);
  const ibr     = Number(row.ibr_rate ?? 0);
  const payment = Number(row.payment ?? 0);
  const interest = opening * (ibr / 12);
  const principal = payment - interest;
  const closing = opening - principal;
  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-3 transition-all duration-200 ease-in-out">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Calculator className="w-4 h-4 text-primary" /> Period {String(row.period_no)} Calculation
        </h4>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onClose}><X className="w-3.5 h-3.5" /></Button>
      </div>
      <p className="text-xs text-muted-foreground">IFRS 16 effective interest method</p>
      <div className="text-sm font-mono bg-muted/30 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-2">
          <span className="text-muted-foreground">Opening Liability</span>
          <span className="text-right">{fmt(opening)}</span>
          <span className="text-muted-foreground">IBR (monthly)</span>
          <span className="text-right">{((ibr / 12) * 100).toFixed(6)}%</span>
          <Separator className="col-span-2" />
          <span className="font-semibold">Interest Expense</span>
          <span className="text-right text-amber-400 font-semibold">{fmt(interest)}</span>
          <span className="text-muted-foreground text-xs col-span-2">= Opening × (IBR ÷ 12)</span>
          <Separator className="col-span-2" />
          <span className="text-muted-foreground">Lease Payment</span>
          <span className="text-right">{fmt(payment)}</span>
          <span className="font-semibold">Principal Repaid</span>
          <span className="text-right text-blue-400 font-semibold">{fmt(principal)}</span>
          <span className="text-muted-foreground text-xs col-span-2">= Payment − Interest</span>
          <Separator className="col-span-2" />
          <span className="font-semibold">Closing Liability</span>
          <span className="text-right text-emerald-400 font-semibold">{fmt(closing)}</span>
          <span className="text-muted-foreground text-xs col-span-2">= Opening − Principal</span>
        </div>
      </div>
    </div>
  );
}

// ── Amortisation Tab ──────────────────────────────────────────────────────────
function AmortisationTab({ contractId }: { contractId: number }) {
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly');
  const [blackboardRow, setBlackboardRow] = useState<Record<string, unknown> | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.lease.getAmortisationSchedule.useQuery({ contractId });
  const generateJvMut = trpc.journalVoucher.generateInception.useMutation({
    onSuccess: (r: any) => toast.success(`JV ${r?.jv_number ?? ''} created for this lease — check Journal Voucher Register`),
    onError: (e: any) => toast.error(`JV generation failed: ${e.message}`),
  });
  const persistScheduleMut = trpc.lease.persistAmortisationSchedule.useMutation();
  const generateMonthlyMut = trpc.journalVoucher.generateMonthly.useMutation({
    onSuccess: (r: any) => toast.success(`${r?.generated_count ?? 0} monthly JV(s) generated — check Journal Voucher Register`),
    onError: (e: any) => toast.error(`Monthly JV generation failed: ${e.message}`),
  });
  const generateMonthlySelectedMut = trpc.journalVoucher.generateMonthlySelected.useMutation({
    onSuccess: (r: any) => {
      const gen = r?.generated_count ?? 0;
      const skip = r?.skipped_count ?? 0;
      if (gen > 0) toast.success(`${gen} monthly JV(s) sent to JV Register.${skip > 0 ? ` ${skip} skipped (already sent).` : ''}`);
      else toast.info(`No new JVs generated. ${skip} row(s) were already sent.`);
      setSelectedIds(new Set());
      utils.lease.getAmortisationSchedule.invalidate({ contractId });
    },
    onError: (e: any) => toast.error(`Monthly JV generation failed: ${e.message}`),
  });
  const [monthlyBusy, setMonthlyBusy] = useState(false);

  if (isLoading) return <p className="text-sm text-muted-foreground animate-pulse p-4">Loading schedule…</p>;

  const allRows = (data?.schedule ?? []) as Array<Record<string, unknown>>;
  const header  = (data?.header ?? {}) as Record<string, unknown>;

  // Aggregate to yearly if needed
  const schedule = viewMode === 'monthly' ? allRows : (() => {
    const byYear: Record<number, Record<string, unknown>> = {};
    allRows.forEach(r => {
      const yr = r.period_date ? new Date(r.period_date as string).getFullYear() : 0;
      if (!byYear[yr]) byYear[yr] = { period_no: yr, period_date: `${yr}-12-31`, opening_liability: r.opening_liability, interest_expense: 0, payment: 0, principal: 0, closing_liability: 0, rou_nbv: 0, depreciation: 0, ibr_rate: r.ibr_rate };
      const y = byYear[yr];
      y.interest_expense = Number(y.interest_expense) + Number(r.interest_expense ?? 0);
      y.payment          = Number(y.payment)          + Number(r.payment ?? 0);
      y.principal        = Number(y.principal)        + Number(r.principal ?? 0);
      y.closing_liability = r.closing_liability;
      y.rou_nbv           = r.rou_nbv;
      y.depreciation      = Number(y.depreciation)    + Number(r.depreciation ?? 0);
    });
    return Object.values(byYear);
  })();

  if (!schedule.length) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground italic p-4 border border-dashed border-border rounded-lg">
      <Info className="w-4 h-4" /> No amortisation schedule generated yet.
    </div>
  );

  return (
    <div className="space-y-4">
      {blackboardRow && <BlackboardDialog row={blackboardRow} onClose={() => setBlackboardRow(null)} />}

      {/* Summary KPIs */}
      {header && (
        <LeaseStatStrip>
          <LeaseStatPill label="Initial Liability" value={fmt(header.initial_liability)} badge={header.currency ? String(header.currency) : undefined} mono />
          <LeaseStatPill label="Current Liability" value={fmt(header.current_liability)} badge={header.currency ? String(header.currency) : undefined} mono color="amber" />
          <LeaseStatDivider />
          <LeaseStatPill label="Initial ROU" value={fmt(header.initial_rou)} badge={header.currency ? String(header.currency) : undefined} mono />
          <LeaseStatPill label="Current ROU NBV" value={fmt(header.current_rou_nbv)} badge={header.currency ? String(header.currency) : undefined} mono color="emerald" />
        </LeaseStatStrip>
      )}

      {/* View toggle + Send to JV */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">View:</span>
        {(['monthly', 'yearly'] as const).map(v => (
          <Button key={v} size="sm" variant={viewMode === v ? 'default' : 'outline'} className="h-7 text-xs capitalize" onClick={() => setViewMode(v)}>{v}</Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
            disabled={generateJvMut.isPending}
            onClick={() => generateJvMut.mutate({ contract_id: contractId })}
          >
            <Send className="w-3 h-3 mr-1" /> {generateJvMut.isPending ? 'Generating…' : 'Send Inception JV'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
            disabled={monthlyBusy || (viewMode === 'monthly' && selectedIds.size === 0)}
            onClick={async () => {
              if (viewMode === 'monthly' && selectedIds.size === 0) {
                toast.error('Please select at least one period row to send.');
                return;
              }
              setMonthlyBusy(true);
              try {
                // Step 1: persist schedule to DB if not already there
                await persistScheduleMut.mutateAsync({ contractId });
                // Step 2: re-fetch schedule to get fresh IDs (persist may have re-created rows)
                const freshData = await utils.lease.getAmortisationSchedule.fetch({ contractId });
                const freshRows = (freshData?.schedule ?? []) as Array<Record<string, unknown>>;
                // Map selected period numbers to fresh schedule_ids
                const selectedPeriods = new Set<number>();
                allRows.forEach(r => {
                  if (selectedIds.has(Number(r.schedule_id ?? 0))) {
                    selectedPeriods.add(Number(r.period ?? 0));
                  }
                });
                const freshIds = freshRows
                  .filter(r => selectedPeriods.has(Number(r.period ?? 0)))
                  .map(r => Number(r.schedule_id ?? 0))
                  .filter(id => id > 0);
                if (freshIds.length === 0) {
                  toast.error('No valid schedule rows found after persist.');
                  return;
                }
                // Step 3: generate monthly JVs for fresh IDs
                generateMonthlySelectedMut.mutate({ schedule_ids: freshIds, contract_id: contractId });
              } catch (e: any) {
                toast.error(`Failed to persist schedule: ${e.message}`);
              } finally {
                setMonthlyBusy(false);
              }
            }}
          >
            <Send className="w-3 h-3 mr-1" /> {monthlyBusy ? 'Generating…' : `Send Monthly JVs${viewMode === 'monthly' && selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
          </Button>
        </div>
      </div>

      {/* Schedule table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              {viewMode === 'monthly' && (
                <th className="px-3 py-2.5 text-center w-12 cursor-pointer" onClick={() => {
                      const selectable = allRows.filter(r => !['Sent','ERP'].includes(String(r.posting_status ?? '')) && r.schedule_id);
                      const allSelected = selectable.length > 0 && selectable.every(r => selectedIds.has(Number(r.schedule_id)));
                      if (allSelected) {
                        setSelectedIds(new Set());
                      } else {
                        const newSet = new Set(selectedIds);
                        allRows.forEach(r => { if (!['Sent','ERP'].includes(String(r.posting_status ?? '')) && r.schedule_id) newSet.add(Number(r.schedule_id)); });
                        setSelectedIds(newSet);
                      }
                    }}>
                  <Checkbox
                    className="h-5 w-5"
                    checked={(() => {
                      const selectable = allRows.filter(r => !['Sent','ERP'].includes(String(r.posting_status ?? '')) && r.schedule_id);
                      return selectable.length > 0 && selectable.every(r => selectedIds.has(Number(r.schedule_id)));
                    })()}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        const newSet = new Set(selectedIds);
                        allRows.forEach(r => { if (!['Sent','ERP'].includes(String(r.posting_status ?? '')) && r.schedule_id) newSet.add(Number(r.schedule_id)); });
                        setSelectedIds(newSet);
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                  />
                </th>
              )}
              <th className="px-2 py-2.5 text-left text-muted-foreground font-semibold w-8"></th>
              <th className="px-3 py-2.5 text-left text-muted-foreground font-semibold">{viewMode === 'monthly' ? 'Period' : 'Year'}</th>
              <th className="px-3 py-2.5 text-left text-muted-foreground font-semibold">Date</th>
              {viewMode === 'monthly' && <th className="px-3 py-2.5 text-center text-muted-foreground font-semibold">Status</th>}
              <th className="px-3 py-2.5 text-right text-muted-foreground font-semibold">Opening Liability</th>
              <th className="px-3 py-2.5 text-right text-muted-foreground font-semibold">Interest</th>
              <th className="px-3 py-2.5 text-right text-muted-foreground font-semibold">Payment</th>
              <th className="px-3 py-2.5 text-right text-muted-foreground font-semibold">Principal</th>
              <th className="px-3 py-2.5 text-right text-muted-foreground font-semibold">Closing Liability</th>
              <th className="px-3 py-2.5 text-right text-muted-foreground font-semibold">ROU NBV</th>
              <th className="px-3 py-2.5 text-right text-muted-foreground font-semibold">Depreciation</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((r, i) => {
              const rowKey = Number(r.period_no ?? i);
              const isExpanded = expandedRows.has(rowKey);
              const schedId = Number(r.schedule_id ?? 0);
              const rowStatus = String(r.posting_status ?? '');
              const isSent = rowStatus === 'Sent' || rowStatus === 'ERP';
              const isSelected = selectedIds.has(schedId);
              // GL entries for this row
              const glEntries = [
                { ledger: '1600', account: 'Right-of-Use Asset', drCr: 'CR', amount: Number(r.depreciation ?? 0) },
                { ledger: '2600', account: 'Lease Liability', drCr: 'DR', amount: Number(r.principal ?? 0) },
                { ledger: '7100', account: 'Interest Expense', drCr: 'DR', amount: Number(r.interest_expense ?? 0) },
                { ledger: '2100', account: 'Accounts Payable', drCr: 'CR', amount: Number(r.payment ?? 0) },
              ];
              return (
                <Fragment key={`period-${rowKey}`}>
                  <tr className={`border-t border-border hover:bg-muted/20 ${isSent ? 'opacity-60' : ''}`}>
                    {viewMode === 'monthly' && (
                      <td className="px-3 py-2 text-center cursor-pointer" onClick={() => {
                            if (isSent) return;
                            const newSet = new Set(selectedIds);
                            if (isSelected) newSet.delete(schedId);
                            else newSet.add(schedId);
                            setSelectedIds(newSet);
                          }}>
                        <Checkbox
                          className="h-5 w-5"
                          checked={isSelected}
                          disabled={isSent}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedIds);
                            if (checked) newSet.add(schedId);
                            else newSet.delete(schedId);
                            setSelectedIds(newSet);
                          }}
                        />
                      </td>
                    )}
                    <td className="px-2 py-2">
                      <Button
                        variant="ghost" size="icon"
                        className="h-5 w-5 text-primary"
                        title="Show calculation"
                        onClick={() => setBlackboardRow(r)}
                      >
                        <Calculator className="w-3 h-3" />
                      </Button>
                    </td>
                    <td className="px-3 py-2">{String(r.period_no ?? i + 1)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.period_date)}</td>
                    {viewMode === 'monthly' && (
                      <td className="px-3 py-2 text-center">
                        {isSent ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-500/15 text-green-400 border border-green-500/30">Sent</span>
                        ) : rowStatus === 'Posted' ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Posted</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground">Pending</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-mono">{fmt(r.opening_liability)}</td>
                    <td className="px-3 py-2 text-right font-mono text-amber-400">{fmt(r.interest_expense)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(r.payment)}</td>
                    <td className="px-3 py-2 text-right font-mono text-blue-400">{fmt(r.principal)}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-400">{fmt(r.closing_liability)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(r.rou_nbv)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      <div className="flex items-center justify-end gap-1">
                        {fmt(r.depreciation)}
                        <Button
                          variant="ghost" size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                          onClick={() => setExpandedRows(prev => { const n = new Set(prev); n.has(rowKey) ? n.delete(rowKey) : n.add(rowKey); return n; })}
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`gl-${i}`} className="bg-muted/10 border-t border-dashed border-border/50">
                      <td colSpan={viewMode === 'monthly' ? 12 : 10} className="px-6 py-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 font-semibold">GL Accounting Entries — Period {String(r.period_no)}</p>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          {glEntries.map((e, ei) => (
                            <div key={ei} className={`p-2 rounded border ${e.drCr === 'DR' ? 'border-blue-500/30 bg-blue-500/5' : 'border-purple-500/30 bg-purple-500/5'}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-mono text-[10px] text-muted-foreground">{e.ledger}</span>
                                <span className={`text-[10px] font-bold px-1 rounded ${e.drCr === 'DR' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>{e.drCr}</span>
                              </div>
                              <p className="text-[11px] font-medium">{e.account}</p>
                              <p className="font-mono font-semibold mt-0.5">{fmt(e.amount)}</p>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Transaction History Tab ───────────────────────────────────────────────────
function TxnHistoryTab({ contractId }: { contractId: number }) {
  const { data, isLoading } = trpc.lease.getLeaseTransactionHistory.useQuery({ contractId });
  if (isLoading) return <p className="text-sm text-muted-foreground animate-pulse p-4">Loading history…</p>;
  const drafts   = (data?.drafts   ?? []) as Array<Record<string, unknown>>;
  const postings = (data?.postings ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><History className="w-4 h-4 text-primary" />Transaction Log</h3>
        {drafts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground italic p-4 border border-dashed border-border rounded-lg"><Info className="w-4 h-4" /> No transactions posted yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                {['Type','Status','JE Ref','Posted By','Posted At','Notes'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {drafts.map((d, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{String(d.transaction_type ?? '—')}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${d.status === 'Posted' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{String(d.status ?? '—')}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{String(d.posted_je_ref ?? '—')}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{String(d.approved_by ?? d.submitted_by ?? '—')}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(d.approved_at ?? d.submitted_at)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{String(d.notes ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" />GL Postings</h3>
        {postings.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground italic p-4 border border-dashed border-border rounded-lg"><Info className="w-4 h-4" /> No GL postings yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                {['Date','JE Ref','Label','Ledger No.','Account','Dr/Cr','Amount','Posted By'].map(h => (
                  <th key={h} className={`px-3 py-2.5 text-xs font-semibold text-muted-foreground ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {postings.map((p, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(p.posting_date)}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-xs text-primary">{String(p.je_ref ?? '—')}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[160px] truncate">{String(p.je_label ?? '—')}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{String(p.ledger_no ?? '—')}</td>
                    <td className="px-3 py-2.5">{String(p.ledger_name ?? '—')}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${p.dr_cr === 'Dr' ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400'}`}>{String(p.dr_cr ?? '—')}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(p.amount)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{String(p.posted_by ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LeaseDetail() {
  const [, setLocation] = useLocation();

  const contractId = (() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('id') || params.get('view') || params.get('edit');
    return v ? parseInt(v, 10) : null;
  })();

  const isReadOnly = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'view';
  })();

  const utils = trpc.useUtils();

  // ── Server data ──────────────────────────────────────────────────────────
  const { data: leaseRaw, isLoading } = trpc.lease.getLeaseById.useQuery(
    { contractId: contractId! }, { enabled: !!contractId }
  );
  const { data: lesseeRaw } = trpc.lease.getLesseeDetails.useQuery(
    { contractId: contractId! }, { enabled: !!contractId }
  );

  // ── Local editable state ─────────────────────────────────────────────────
  const [lessor, setLessor] = useState({ name: '', contactPerson: '', email: '', phone: '', address: '', country: 'QA', taxId: '' });
  const [lessee, setLessee] = useState({ lesseeType: 'Staff' as 'Staff'|'Client'|'Other', lesseeName: '', staffNumber: '', employeeId: '', grade: '', position: '', department: '', placeOfWork: '', contactEmail: '', contactPhone: '' });
  const [asset, setAsset]   = useState({ assetType: 'Office', assetName: '', assetCode: '', location: '', country: 'QA', maintenanceBy: 'Lessor' as 'Lessor'|'Vodafone' });
  const [financial, setFin] = useState({ commencementDate: '', endDate: '', leaseTerm: '', currency: 'QAR', rentAmount: '', escalationRate: '', discountRate: '', securityDeposit: '' });
  const [lto, setLTO]       = useState({ isLTO: false, ltoPrice: '', ltoDeposit: '', ltoInstalments: '', ltoRate: '', ltoBalloon: '' });

  // ── Populate from server ─────────────────────────────────────────────────
  useEffect(() => {
    if (!leaseRaw) return;
    const d = leaseRaw as Record<string, any>;
    let cp = '', em = '', ph = '';
    try { const c = JSON.parse(d.contact_json || '{}'); cp = c.name || ''; em = c.email || ''; ph = c.phone || ''; } catch { /* ignore */ }
    let addr = '', locCountry = 'QA';
    try { const loc = JSON.parse(d.location_json || '{}'); addr = loc.city || loc.address || ''; locCountry = loc.country || 'QA'; } catch { /* ignore */ }
    setLessor({ name: d.lessor_name || '', contactPerson: cp, email: em, phone: ph, address: addr, country: d.lessor_country || 'QA', taxId: d.tax_no || '' });
    setAsset({ assetType: d.asset_type || 'Office', assetName: d.asset_description || '', assetCode: d.asset_tag || '', location: addr, country: locCountry, maintenanceBy: d.maintenance_responsibility === 'Vodafone' ? 'Vodafone' : 'Lessor' });
    setFin({
      commencementDate: toDateStr(d.commencement_date),
      endDate: toDateStr(d.expiry_date),
      leaseTerm: String(d.term_months || ''),
      currency: d.currency || 'QAR',
      rentAmount: String(d.monthly_payment || ''),
      escalationRate: d.escalation_rate ? String(Number(d.escalation_rate) * 100) : '',
      discountRate: d.ibr ? String(Number(d.ibr) * 100) : '',
      securityDeposit: String(d.deposit_amount || ''),
    });
    setLTO({
      isLTO: Boolean(d.is_lto),
      ltoPrice: String(d.lto_purchase_price || ''),
      ltoDeposit: String(d.lto_deposit || ''),
      ltoInstalments: String(d.lto_total_instalments || ''),
      ltoRate: d.lto_finance_charge_rate ? String(Number(d.lto_finance_charge_rate) * 100) : '',
      ltoBalloon: String(d.lto_balloon_amount || ''),
    });
  }, [leaseRaw]);

  useEffect(() => {
    if (!lesseeRaw) return;
    const ld = lesseeRaw as Record<string, any>;
    setLessee({ lesseeType: (ld.lesseeType as 'Staff'|'Client'|'Other') || 'Staff', lesseeName: ld.lesseeName || '', staffNumber: ld.staffNumber || '', employeeId: ld.employeeId || '', grade: ld.grade || '', position: ld.position || '', department: ld.department || '', placeOfWork: ld.placeOfWork || '', contactEmail: ld.contactEmail || '', contactPhone: ld.contactPhone || '' });
  }, [lesseeRaw]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const updateLeaseMut = trpc.lease.updateLease.useMutation({
    onSuccess: () => { toast.success('Lease updated successfully'); utils.lease.getLeaseById.invalidate({ contractId: contractId! }); },
    onError: (e) => toast.error(e.message),
  });
  const upsertLesseeMut = trpc.lease.upsertLesseeDetails.useMutation({
    onSuccess: () => { toast.success('Lessee details saved'); utils.lease.getLesseeDetails.invalidate({ contractId: contractId! }); },
    onError: (e) => toast.error(e.message),
  });

  const handleSaveFinancialAndAsset = () => {
    if (!contractId) return;
    const termMonths = financial.commencementDate && financial.endDate
      ? Math.round((new Date(financial.endDate).getTime() - new Date(financial.commencementDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
      : Number(financial.leaseTerm) || 0;
    updateLeaseMut.mutate({
      contractId,
      assetType: asset.assetType,
      assetDescription: asset.assetName,
      assetTag: asset.assetCode || undefined,
      location: { address: asset.location, country: asset.country },
      commencementDate: financial.commencementDate,
      expiryDate: financial.endDate,
      termMonths,
      monthlyPayment: Number(financial.rentAmount) || 0,
      currency: financial.currency,
      ibr: Number(financial.discountRate) / 100 || 0,
      escalationRate: Number(financial.escalationRate) / 100 || 0,
      depositAmount: Number(financial.securityDeposit) || 0,
      maintenanceResponsibility: asset.maintenanceBy === 'Vodafone' ? 'Vodafone' : 'Lessor',
      isLTO: lto.isLTO,
      ltoPurchasePrice: lto.ltoPrice ? Number(lto.ltoPrice) : undefined,
      ltoDeposit: lto.ltoDeposit ? Number(lto.ltoDeposit) : undefined,
      ltoTotalInstalments: lto.ltoInstalments ? Number(lto.ltoInstalments) : undefined,
      ltoFinanceChargeRate: lto.ltoRate ? Number(lto.ltoRate) / 100 : undefined,
      ltoBalloonAmount: lto.ltoBalloon ? Number(lto.ltoBalloon) : undefined,
    });
  };

  const handleSaveLessee = () => {
    if (!contractId || !lessee.lesseeName) { toast.error('Lessee name is required'); return; }
    upsertLesseeMut.mutate({ contractId, ...lessee });
  };

  if (!contractId) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <Info className="w-10 h-10" />
        <p>No contract ID provided.</p>
        <Button variant="outline" onClick={() => setLocation('/leases')}><ArrowLeft className="w-4 h-4 mr-2" /> Back to Lease Register</Button>
      </div>
    </DashboardLayout>
  );

  if (isLoading) return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted/40 rounded animate-pulse" />
        <div className="h-24 bg-muted/30 rounded-xl animate-pulse" />
        <div className="h-64 bg-muted/20 rounded-xl animate-pulse" />
      </div>
    </DashboardLayout>
  );

  const d = (leaseRaw ?? {}) as Record<string, any>;
  const lifecycleStatus = String(d.lifecycle_status ?? 'Draft');

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-0px)] overflow-hidden">

        {/* ── Header ── */}
        <div className="px-6 py-3 border-b border-border bg-card/50 flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setLocation('/leases')} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Separator orientation="vertical" className="h-5" />
              <ScreenHeader
                screenId="VFLSECLSDET0001P001" screenType="lease_detail"
                title={`Lease — ${d.contract_ref ?? ''}`}
                subtitle={isReadOnly ? "Read-only view" : "View and edit all lease details in-place"}
              />
              {isReadOnly && <Badge variant="outline" className="ml-2 text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">View Only</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs ${LIFECYCLE_COLORS[lifecycleStatus] ?? ''}`}>{lifecycleStatus}</Badge>
              <Button size="sm" variant="outline" onClick={() => setLocation('/leases/transaction-centre')}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Transaction Centre
              </Button>
            </div>
          </div>

          {/* Summary bar + KPI strip */}
          <LeaseStatStrip>
            <LeaseStatPill label="Contract Ref" value={d.contract_ref ?? '—'} mono color="red" />
            <LeaseStatPill label="Monthly Payment" value={fmt(d.monthly_payment)} badge={d.currency ?? undefined} mono />
            <LeaseStatPill label="Expiry" value={fmtDate(d.expiry_date)} />
            <LeaseStatDivider />
            <LeaseStatPill label="Lease Liability" value={fmt(d.current_liability)} badge={d.currency ?? undefined} mono color="amber" />
            <LeaseStatPill label="ROU Asset NBV" value={fmt(d.current_rou_nbv)} badge={d.currency ?? undefined} mono color="emerald" />
            <LeaseStatPill label="IBR" value={fmtPct(d.ibr)} color="amber" />
            <LeaseStatPill label="Term" value={`${d.term_months ?? '—'} mo`} />
            <LeaseStatPill label="Commencement" value={fmtDate(d.commencement_date)} />
          </LeaseStatStrip>
        </div>

        {/* ── Tabs ── */}
        <div className={`flex-1 overflow-y-auto ${isReadOnly ? '[&_input]:pointer-events-none [&_input]:opacity-70 [&_select]:pointer-events-none [&_textarea]:pointer-events-none [&_[role=combobox]]:pointer-events-none [&_[role=checkbox]]:pointer-events-none' : ''}`}>
          <Tabs defaultValue="lessor" className="h-full">
            <div className="px-6 pt-3 border-b border-border">
              <TabsList className="grid grid-cols-7 w-full max-w-4xl">
                <TabsTrigger value="lessor"       className="text-xs flex items-center gap-1"><Building2 className="w-3 h-3" /> Lessor</TabsTrigger>
                <TabsTrigger value="lessee"       className="text-xs flex items-center gap-1"><User className="w-3 h-3" /> Lessee</TabsTrigger>
                <TabsTrigger value="asset"        className="text-xs flex items-center gap-1"><FileText className="w-3 h-3" /> Asset</TabsTrigger>
                <TabsTrigger value="financial"    className="text-xs flex items-center gap-1"><DollarSign className="w-3 h-3" /> Financial</TabsTrigger>
                <TabsTrigger value="lto"          className="text-xs flex items-center gap-1"><Package className="w-3 h-3" /> LTO</TabsTrigger>
                <TabsTrigger value="amortisation" className="text-xs flex items-center gap-1"><BarChart2 className="w-3 h-3" /> Amortisation</TabsTrigger>
                <TabsTrigger value="history"      className="text-xs flex items-center gap-1"><History className="w-3 h-3" /> Txn History</TabsTrigger>
              </TabsList>
            </div>

            {/* ── LESSOR (read-only — managed via Lessor Master) ── */}
            <TabsContent value="lessor" className="px-6 py-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Lessor Information</h3>
                <Button size="sm" variant="outline" onClick={() => setLocation('/lessors')}>
                  <Building2 className="w-3.5 h-3.5 mr-1.5" /> Manage in Lessor Master
                </Button>
              </div>
              <Separator />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
                {[
                  { label: 'Lessor Name', value: lessor.name },
                  { label: 'Contact Person', value: lessor.contactPerson },
                  { label: 'Email', value: lessor.email },
                  { label: 'Phone', value: lessor.phone },
                  { label: 'Address / City', value: lessor.address },
                  { label: 'Country', value: lessor.country },
                  { label: 'Tax / VAT ID', value: lessor.taxId },
                  { label: 'Contract Ref', value: d.contract_ref },
                ].map((f, i) => (
                  <div key={i} className="space-y-0.5">
                    <p className={labelCls}>{f.label}</p>
                    <p className="text-sm text-foreground">{f.value || <span className="text-muted-foreground italic">—</span>}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── LESSEE ── */}
            <TabsContent value="lessee" className="px-6 py-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Lessee Details</h3>
                {!isReadOnly && <Button size="sm" className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={handleSaveLessee} disabled={upsertLesseeMut.isPending}>
                  <Save className="w-3.5 h-3.5 mr-1.5" /> {upsertLesseeMut.isPending ? 'Saving…' : 'Save Lessee'}
                </Button>}
              </div>
              <Separator />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
                <div className="space-y-1">
                  <Label className={labelCls}>Lessee Type</Label>
                  <Select value={lessee.lesseeType} onValueChange={v => setLessee(l => ({ ...l, lesseeType: v as 'Staff'|'Client'|'Other' }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Staff">Staff</SelectItem>
                      <SelectItem value="Client">Client</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {[
                  { label: 'Full Name *', key: 'lesseeName', placeholder: 'e.g. Mohammed Al-Thani' },
                  { label: 'Staff Number', key: 'staffNumber', placeholder: 'e.g. VQ-EMP-00142' },
                  { label: 'Employee ID', key: 'employeeId', placeholder: 'e.g. EMP-2024-00142' },
                  { label: 'Grade / Band', key: 'grade', placeholder: 'e.g. Grade 7' },
                  { label: 'Position / Title', key: 'position', placeholder: 'e.g. Network Engineer' },
                  { label: 'Department', key: 'department', placeholder: 'e.g. Network Operations' },
                  { label: 'Place of Work', key: 'placeOfWork', placeholder: 'e.g. Vodafone Qatar HQ' },
                  { label: 'Contact Email', key: 'contactEmail', placeholder: 'e.g. m.althani@vodafone.com.qa' },
                  { label: 'Contact Phone', key: 'contactPhone', placeholder: '+974 XXXX XXXX' },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <Label className={labelCls}>{f.label}</Label>
                    <Input className={inputCls} placeholder={f.placeholder} value={(lessee as any)[f.key]} onChange={e => setLessee(l => ({ ...l, [f.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── ASSET ── */}
            <TabsContent value="asset" className="px-6 py-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Asset Details</h3>
                {!isReadOnly && <Button size="sm" className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={handleSaveFinancialAndAsset} disabled={updateLeaseMut.isPending}>
                  <Save className="w-3.5 h-3.5 mr-1.5" /> {updateLeaseMut.isPending ? 'Saving…' : 'Save Asset'}
                </Button>}
              </div>
              <Separator />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
                <div className="space-y-1">
                  <Label className={labelCls}>Asset Type</Label>
                  <Select value={asset.assetType} onValueChange={v => setAsset(a => ({ ...a, assetType: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className={labelCls}>Asset Description *</Label>
                  <Input className={inputCls} value={asset.assetName} onChange={e => setAsset(a => ({ ...a, assetName: e.target.value }))} placeholder="e.g. Rooftop BTS Tower — Emaar Square Tower 1" />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Asset Tag / Code</Label>
                  <Input className={inputCls} value={asset.assetCode} onChange={e => setAsset(a => ({ ...a, assetCode: e.target.value }))} placeholder="e.g. VQ-BTS-00042" />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Location / City</Label>
                  <Input className={inputCls} value={asset.location} onChange={e => setAsset(a => ({ ...a, location: e.target.value }))} placeholder="e.g. Doha" />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Country</Label>
                  <Select value={asset.country} onValueChange={v => setAsset(a => ({ ...a, country: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>{COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Maintenance By</Label>
                  <Select value={asset.maintenanceBy} onValueChange={v => setAsset(a => ({ ...a, maintenanceBy: v as 'Lessor'|'Vodafone' }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lessor">Lessor</SelectItem>
                      <SelectItem value="Vodafone">Vodafone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Sub-Assets Grid */}
              <Separator />
              <SubAssetsGrid contractId={contractId} />
            </TabsContent>

            {/* ── FINANCIAL TERMS ── */}
            <TabsContent value="financial" className="px-6 py-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" /> Financial Terms</h3>
                {!isReadOnly && <Button size="sm" className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={handleSaveFinancialAndAsset} disabled={updateLeaseMut.isPending}>
                  <Save className="w-3.5 h-3.5 mr-1.5" /> {updateLeaseMut.isPending ? 'Saving…' : 'Save Financial Terms'}
                </Button>}
              </div>
              <Separator />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
                <div className="space-y-1">
                  <Label className={labelCls}>Commencement Date *</Label>
                  <Input type="date" className={inputCls} value={financial.commencementDate} onChange={e => setFin(f => ({ ...f, commencementDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>End / Expiry Date *</Label>
                  <Input type="date" className={inputCls} value={financial.endDate} onChange={e => setFin(f => ({ ...f, endDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Term (months)</Label>
                  <Input className={inputCls} value={financial.leaseTerm} onChange={e => setFin(f => ({ ...f, leaseTerm: e.target.value }))} placeholder="e.g. 60" />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Currency</Label>
                  <Select value={financial.currency} onValueChange={v => setFin(f => ({ ...f, currency: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Monthly Payment *</Label>
                  <Input className={inputCls} value={financial.rentAmount} onChange={e => setFin(f => ({ ...f, rentAmount: e.target.value }))} placeholder="e.g. 15000.00" />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Escalation Rate (%)</Label>
                  <Input className={inputCls} value={financial.escalationRate} onChange={e => setFin(f => ({ ...f, escalationRate: e.target.value }))} placeholder="e.g. 3.00" />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>IBR / Discount Rate (%)</Label>
                  <Input className={inputCls} value={financial.discountRate} onChange={e => setFin(f => ({ ...f, discountRate: e.target.value }))} placeholder="e.g. 5.00" />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Security Deposit</Label>
                  <Input className={inputCls} value={financial.securityDeposit} onChange={e => setFin(f => ({ ...f, securityDeposit: e.target.value }))} placeholder="e.g. 45000.00" />
                </div>
              </div>
            </TabsContent>

            {/* ── LTO ── */}
            <TabsContent value="lto" className="px-6 py-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> Lease-to-Own (LTO) Terms</h3>
                {!isReadOnly && <Button size="sm" className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={handleSaveFinancialAndAsset} disabled={updateLeaseMut.isPending}>
                  <Save className="w-3.5 h-3.5 mr-1.5" /> {updateLeaseMut.isPending ? 'Saving…' : 'Save LTO'}
                </Button>}
              </div>
              <Separator />
              <div className="flex items-center gap-2 mb-4">
                <Checkbox id="isLTO" checked={lto.isLTO} onCheckedChange={v => setLTO(l => ({ ...l, isLTO: Boolean(v) }))} />
                <Label htmlFor="isLTO" className="text-sm cursor-pointer">This lease has Lease-to-Own terms</Label>
              </div>
              {lto.isLTO && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                  {[
                    { label: 'Purchase Price', key: 'ltoPrice', placeholder: 'e.g. 500000.00' },
                    { label: 'LTO Deposit', key: 'ltoDeposit', placeholder: 'e.g. 50000.00' },
                    { label: 'Total Instalments', key: 'ltoInstalments', placeholder: 'e.g. 48' },
                    { label: 'Finance Charge Rate (%)', key: 'ltoRate', placeholder: 'e.g. 4.50' },
                    { label: 'Balloon Amount', key: 'ltoBalloon', placeholder: 'e.g. 100000.00' },
                  ].map(f => (
                    <div key={f.key} className="space-y-1">
                      <Label className={labelCls}>{f.label}</Label>
                      <Input className={inputCls} value={(lto as any)[f.key]} onChange={e => setLTO(l => ({ ...l, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── AMORTISATION ── */}
            <TabsContent value="amortisation" className="px-6 py-5 space-y-4">
              <AmortisationTab contractId={contractId} />
            </TabsContent>

            {/* ── TRANSACTION HISTORY ── */}
            <TabsContent value="history" className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2"><History className="w-4 h-4 text-primary" />Transaction History & GL Ledger</h3>
                <Button size="sm" variant="outline" onClick={() => setLocation('/leases/transaction-centre')}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Post New Transaction
                </Button>
              </div>
              <TxnHistoryTab contractId={contractId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
