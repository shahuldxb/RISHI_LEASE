import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, ChevronDown, ChevronRight } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toast } from "sonner";
import { groupDrCrByAmount, type JVLine, type JVGroup } from "@/lib/jvGrouping";

const fmt = (n: number | null | undefined) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function GLJournals() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedJvId, setExpandedJvId] = useState<number | null>(null);

  // Fetch JVs from the accounting journal voucher system with period filter
  const { data, isLoading, refetch } = trpc.journalVoucher.list.useQuery({
    period_year: year,
    period_month: month,
    status: statusFilter === "all" ? undefined : statusFilter,
    search: search || undefined,
    page: 1,
    page_size: 200,
  });

  const jvRows: any[] = (data as any)?.rows ?? [];
  const allLines: any[] = (data as any)?.allLines ?? [];

  // Group all lines by JV for expandable detail
  const linesByJv = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const line of allLines) {
      const jvId = line.jv_id;
      if (!map.has(jvId)) map.set(jvId, []);
      map.get(jvId)!.push(line);
    }
    return map;
  }, [allLines]);

  // Compute Dr/Cr groups for expanded JV
  const expandedGroups = useMemo<JVGroup[]>(() => {
    if (expandedJvId == null) return [];
    const lines = linesByJv.get(expandedJvId) ?? [];
    const jvLines: JVLine[] = lines.map((l: any) => ({
      line_id: l.line_id,
      line_seq: l.line_seq,
      dr_cr: l.dr_cr?.toUpperCase() === "DR" ? "Dr" : "Cr",
      account_code: l.account_code ?? "",
      account_name: l.account_name ?? l.description ?? "",
      amount: Math.abs(Number(l.amount ?? 0)),
      description: l.line_description ?? l.description ?? "",
      currency: l.currency,
      calc_explanation: l.calc_explanation,
    }));
    return groupDrCrByAmount(jvLines);
  }, [expandedJvId, linesByJv]);

  // KPI stats
  const totalJVs = jvRows.length;
  const postedCount = jvRows.filter((j: any) => j.status === "POSTED").length;
  const draftCount = jvRows.filter((j: any) => j.status === "DRAFT").length;
  const totalDebit = allLines.filter((l: any) => l.dr_cr?.toUpperCase() === "DR").reduce((s: number, l: any) => s + Math.abs(Number(l.amount ?? 0)), 0);
  const totalCredit = allLines.filter((l: any) => l.dr_cr?.toUpperCase() === "CR").reduce((s: number, l: any) => s + Math.abs(Number(l.amount ?? 0)), 0);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFLGLJ0001P001"
          screenType="gl_journals"
          title="GL Journals"
          subtitle="General ledger journal entries with Dr/Cr grouping — consolidated view of all accounting entries"
          actions={
            <Button variant="outline" size="sm" className="gap-2 h-9" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />Refresh
            </Button>
          }
        />

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total JVs", value: totalJVs, color: "text-blue-400" },
            { label: "Posted", value: postedCount, color: "text-emerald-400" },
            { label: "Draft", value: draftCount, color: "text-amber-400" },
            { label: "Total Debits", value: fmt(totalDebit), color: "text-emerald-400" },
            { label: "Total Credits", value: fmt(totalCredit), color: "text-rose-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-end gap-4 bg-card border border-border rounded-xl p-4 flex-wrap">
          <div>
            <label className="text-sm font-medium block mb-1">Month</label>
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Year</label>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2023,2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="POSTED">Posted</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="LOCKED">Locked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium block mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="JV number, description..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {/* JV Table with expandable Dr/Cr grouped lines */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs w-8"></TableHead>
                <TableHead className="text-xs">JV Number</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Period</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Total Amount</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Posted Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading journals...</TableCell></TableRow>
              )}
              {!isLoading && jvRows.map((jv: any) => {
                const isExpanded = expandedJvId === jv.jv_id;
                const jvLineCount = linesByJv.get(jv.jv_id)?.length ?? 0;
                return (
                  <> 
                    <TableRow
                      key={jv.jv_id}
                      className={`text-xs cursor-pointer hover:bg-muted/30 ${isExpanded ? 'bg-muted/20' : ''}`}
                      onClick={() => setExpandedJvId(isExpanded ? null : jv.jv_id)}
                    >
                      <TableCell className="px-2">
                        {jvLineCount > 0 && (isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />)}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">{jv.jv_number}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{jv.jv_type}</Badge></TableCell>
                      <TableCell className="font-mono">{jv.period_year}/{String(jv.period_month).padStart(2, '0')}</TableCell>
                      <TableCell className="max-w-[250px] truncate">{jv.description}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmt(jv.total_amount)}</TableCell>
                      <TableCell>
                        <Badge className={
                          jv.status === 'POSTED' ? 'bg-green-500/20 text-green-400' :
                          jv.status === 'LOCKED' ? 'bg-violet-500/20 text-violet-400' :
                          'bg-amber-500/20 text-amber-400'
                        }>{jv.status}</Badge>
                      </TableCell>
                      <TableCell>{jv.posted_at ? new Date(jv.posted_at).toLocaleDateString() : jv.created_at ? new Date(jv.created_at).toLocaleDateString() : '—'}</TableCell>
                    </TableRow>

                    {/* Expanded: Dr/Cr Grouped Lines */}
                    {isExpanded && (
                      <TableRow key={`${jv.jv_id}-detail`}>
                        <TableCell colSpan={8} className="p-0">
                          <div className="bg-muted/10 border-t border-border">
                            {expandedGroups.length === 0 ? (
                              <div className="p-4 text-center text-xs text-muted-foreground">No journal lines for this entry</div>
                            ) : (
                              <div className="divide-y divide-border/50">
                                {expandedGroups.map((group, gIdx) => (
                                  <div key={group.id} className="px-4 py-3">
                                    {/* Group header */}
                                    <div className="flex items-center gap-2 mb-2">
                                      <Badge variant="outline" className="text-xs font-mono">Group {gIdx + 1}</Badge>
                                      <span className="text-xs text-muted-foreground">{group.label}</span>
                                      {group.balanced && <Badge className="text-xs bg-emerald-500/20 text-emerald-400">Balanced</Badge>}
                                    </div>
                                    {/* Dr/Cr lines table */}
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-muted/30">
                                          <TableHead className="text-xs w-16">Dr/Cr</TableHead>
                                          <TableHead className="text-xs w-24">Account</TableHead>
                                          <TableHead className="text-xs">Account Name</TableHead>
                                          <TableHead className="text-xs text-right w-32">Debit</TableHead>
                                          <TableHead className="text-xs text-right w-32">Credit</TableHead>
                                          <TableHead className="text-xs">Description</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {[...group.drLines, ...group.crLines].map((line, lIdx) => (
                                          <TableRow key={lIdx} className={line.dr_cr === 'Dr' ? 'bg-emerald-500/5' : 'bg-rose-500/5'}>
                                            <TableCell>
                                              <Badge className={line.dr_cr === 'Dr' ? 'bg-emerald-500/20 text-emerald-400 text-xs' : 'bg-rose-500/20 text-rose-400 text-xs'}>
                                                {line.dr_cr}
                                              </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs font-semibold">{line.account_code}</TableCell>
                                            <TableCell className="text-xs">{line.account_name}</TableCell>
                                            <TableCell className="text-right font-mono text-xs font-semibold text-emerald-500">
                                              {line.dr_cr === 'Dr' ? fmt(line.amount) : '—'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs font-semibold text-rose-500">
                                              {line.dr_cr === 'Cr' ? fmt(line.amount) : '—'}
                                            </TableCell>
                                            <TableCell className="text-xs max-w-[200px] truncate">{line.description ?? ''}</TableCell>
                                          </TableRow>
                                        ))}
                                        {/* Group totals */}
                                        <TableRow className="border-t-2 border-border bg-muted/20">
                                          <TableCell colSpan={3} className="text-xs font-semibold text-right">Group Total</TableCell>
                                          <TableCell className="text-right font-mono text-xs font-bold text-emerald-500">{fmt(group.drTotal)}</TableCell>
                                          <TableCell className="text-right font-mono text-xs font-bold text-rose-500">{fmt(group.crTotal)}</TableCell>
                                          <TableCell></TableCell>
                                        </TableRow>
                                      </TableBody>
                                    </Table>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
              {!isLoading && jvRows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No journal entries for {MONTHS[month-1]} {year}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
