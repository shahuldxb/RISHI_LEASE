/**
 * VodaLease Enterprise — Lease Exemption Register
 * Screen ID: VFLLSEEXRG0001P001
 * IFRS 16 Para 5 — Short-term & Low-value Lease Exemptions
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, RefreshCw, AlertCircle, Pencil, Clock, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const SCREEN_ID = 'VFLLSEEXRG0001P001';

function fmt(v: unknown): string {
  const n = Number(v ?? 0);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-QA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

type ExRow = Record<string, unknown>;

const EXEMPTION_COLOURS: Record<string, string> = {
  ShortTerm: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  LowValue: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  None: 'bg-muted text-muted-foreground',
};

const EXEMPTION_LABELS: Record<string, string> = {
  ShortTerm: 'Short-term (≤12 months)',
  LowValue: 'Low-value (< USD 10,000/item)',
  None: 'No Exemption',
};


export default function LeaseExemptions() {
  const [filterType, setFilterType] = useState<string>('all');
  const [editRow, setEditRow] = useState<ExRow | null>(null);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [editType, setEditType] = useState<'None' | 'ShortTerm' | 'LowValue'>('None');
  const [editReason, setEditReason] = useState('');
  const utils = trpc.useUtils();
  const exemptQuery = trpc.lease.getExemptionRegister.useQuery({
    exemptionType: filterType === 'all' ? undefined : filterType,
  });
  const updateMut = trpc.lease.updateLeaseExemption.useMutation({
    onSuccess: () => { toast.success('Exemption status updated'); utils.lease.getExemptionRegister.invalidate(); setEditRow(null); },
    onError: (e) => toast.error(e.message),
  });
  const leases = (exemptQuery.data?.leases ?? []) as ExRow[];
  const summary = (exemptQuery.data?.summary ?? []) as ExRow[];
  const summaryRow = (summary[0] ?? {}) as Record<string, unknown>;
  const shortTermLeases = leases.filter(l => l.exemption_type === 'ShortTerm');
  const lowValueLeases = leases.filter(l => l.exemption_type === 'LowValue');
  function openEdit(row: ExRow) { setEditRow(row); setEditType((row.exemption_type as 'None' | 'ShortTerm' | 'LowValue') ?? 'None'); setEditReason(String(row.exemption_reason ?? '')); }
  function submitEdit() { if (!editRow) return; updateMut.mutate({ contractId: Number(editRow.contract_id), exemptionType: editType, exemptionReason: editReason }); }

  return (
    <DashboardLayout>
      <div className="flex h-full">
        {/* ── Main content ────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-6">
          <ScreenHeader
            screenId="VFLSE-EXEMPT-001" screenType="lease_exemptions"
            onAIData={(rows) => setAiRows(rows)}
            title="Exemption Register"
            subtitle="Short-term and low-value lease exemptions — straight-line expense recognition"
            icon={<Clock className="h-6 w-6 text-blue-400" />}
            actions={
              <div className="flex items-center gap-3">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Filter by type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Leases</SelectItem>
                    <SelectItem value="ShortTerm">Short-term only</SelectItem>
                    <SelectItem value="LowValue">Low-value only</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => toast.info('Export coming soon')}><Download className="h-4 w-4 mr-1" /> Export</Button>
              </div>
            }
          />
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-300">
            <strong>IFRS 16 Para 5:</strong> Short-term leases (term &le;12 months) and low-value leases (single item &lt; USD 10,000 or total annual value &lt; USD 20,000) may be exempted from capitalisation. Exempted leases are treated as <strong>operational leases</strong> with payments recognised straight-line over the lease term.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-blue-500/30 bg-blue-500/5"><CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1"><Clock className="h-4 w-4 text-blue-400" /><span className="text-xs text-muted-foreground">Short-term</span></div>
              <div className="text-xl font-bold text-blue-400">{shortTermLeases.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Annual: {fmt(summaryRow.total_shortterm_expense)} QAR</div>
            </CardContent></Card>
            <Card className="border-purple-500/30 bg-purple-500/5"><CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-purple-400" /><span className="text-xs text-muted-foreground">Low-value</span></div>
              <div className="text-xl font-bold text-purple-400">{lowValueLeases.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Annual: {fmt(summaryRow.total_lowvalue_expense)} QAR</div>
            </CardContent></Card>
            <Card className="border-green-500/30 bg-green-500/5"><CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground mb-1">Total Exempted</div>
              <div className="text-xl font-bold text-green-400">{shortTermLeases.length + lowValueLeases.length}</div>
            </CardContent></Card>
            <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground mb-1">Total Straight-line Expense</div>
              <div className="text-lg font-bold text-amber-400">{fmt(summaryRow.total_exemption_expense)} QAR</div>
            </CardContent></Card>
          </div>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({leases.length})</TabsTrigger>
              <TabsTrigger value="shortterm">Short-term ({shortTermLeases.length})</TabsTrigger>
              <TabsTrigger value="lowvalue">Low-value ({lowValueLeases.length})</TabsTrigger>
            </TabsList>
            {(['all', 'shortterm', 'lowvalue'] as const).map(tab => {
              const tabLeases = tab === 'all' ? leases : tab === 'shortterm' ? shortTermLeases : lowValueLeases;
              return (
                <TabsContent key={tab} value={tab}>
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base">{tab === 'all' ? 'All Leases' : tab === 'shortterm' ? 'Short-term Exemptions' : 'Low-value Exemptions'}</CardTitle></CardHeader>
                    <CardContent>
                      {exemptQuery.isLoading && <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading...</div>}
                      {exemptQuery.isError && <div className="flex items-center gap-2 text-red-400 py-8"><AlertCircle className="h-4 w-4" /><span className="text-sm">{exemptQuery.error.message}</span></div>}
                      {!exemptQuery.isLoading && (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead>Contract Ref</TableHead><TableHead>Asset</TableHead><TableHead>Lessor</TableHead>
                                <TableHead>Start</TableHead><TableHead>Expiry</TableHead>
                                <TableHead className="text-right">Monthly Rent</TableHead><TableHead className="text-right">Annual Expense</TableHead>
                                <TableHead>Exemption</TableHead><TableHead>Reason</TableHead><TableHead className="w-16">Edit</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tabLeases.map((l, i) => (
                                <TableRow key={i} className="hover:bg-muted/20 transition-colors">
                                  <TableCell className="font-mono text-xs">{String(l.contract_ref ?? '—')}</TableCell>
                                  <TableCell className="text-sm max-w-[120px] truncate">{String(l.asset_description ?? '—')}</TableCell>
                                  <TableCell className="text-sm">{String(l.lessor_name ?? '—')}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{String(l.start_date ?? '—').substring(0, 10)}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{String(l.expiry_date ?? '—').substring(0, 10)}</TableCell>
                                  <TableCell className="text-right font-mono text-xs">{fmt(l.monthly_payment)} QAR</TableCell>
                                  <TableCell className="text-right font-mono text-xs font-semibold">{fmt(l.annual_expense)} QAR</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={`text-xs ${EXEMPTION_COLOURS[String(l.exemption_type ?? 'None')] ?? EXEMPTION_COLOURS['None']}`}>
                                      {EXEMPTION_LABELS[String(l.exemption_type ?? 'None')] ?? 'No Exemption'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate">{String(l.exemption_reason ?? '—')}</TableCell>
                                  <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
                                </TableRow>
                              ))}
                              {tabLeases.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-12">No exempted leases found.</TableCell></TableRow>}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>

        {/* ── Right Panel: Update Exemption Status ────────────────────────── */}
        {!!editRow && (
          <div className="w-96 border-l bg-card flex flex-col shrink-0">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-sm">Update Exemption Status</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditRow(null)}>
                <span className="text-lg leading-none">×</span>
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="p-3 bg-muted/30 rounded text-sm">
                <span className="text-muted-foreground">Lease: </span>
                <span className="font-semibold">{String(editRow?.contract_ref ?? '')} — {String(editRow?.asset_description ?? '')}</span>
              </div>
              <div className="space-y-1.5">
                <Label>Exemption Type</Label>
                <Select value={editType} onValueChange={v => setEditType(v as 'None' | 'ShortTerm' | 'LowValue')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">No Exemption (capitalise under IFRS 16)</SelectItem>
                    <SelectItem value="ShortTerm">Short-term (lease term ≤12 months)</SelectItem>
                    <SelectItem value="LowValue">Low-value (item &lt; USD 10,000 or annual &lt; USD 20,000)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reason / Justification</Label>
                <Textarea value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="e.g. Month-to-month IT equipment, asset value USD 800..." rows={3} />
              </div>
              {editType !== 'None' && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-300">
                  This lease will be classified as an <strong>operational lease</strong> and excluded from the IFRS 16 balance sheet. Payments expensed straight-line per IFRS 16 Para 6. Low-value threshold: USD 10,000 per single item or USD 20,000 total annual value.
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button size="sm" onClick={submitEdit} disabled={updateMut.isPending}>
                {updateMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : null}
                Save Exemption
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
