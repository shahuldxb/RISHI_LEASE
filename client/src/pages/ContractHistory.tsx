/**
 * VodaLease Enterprise — Contract History
 * Screen ID: VFLCNTHST0001P001
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { History, Search, RefreshCw, Download, ChevronDown, ChevronRight } from "lucide-react";

const SCREEN_ID = "VFLCNTHST0001P001";
const EVENT_COLORS: Record<string,string> = {
  DOCUMENT_UPLOADED:"bg-blue-500/20 text-blue-300 border-blue-500/30",
  DOCUMENT_DELETED:"bg-red-500/20 text-red-300 border-red-500/30",
  DOCUMENT_APPROVED:"bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  MILESTONE_COMPLETED:"bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  MILESTONE_DISMISSED:"bg-slate-500/20 text-slate-400 border-slate-500/30",
  MILESTONE_CREATED:"bg-amber-500/20 text-amber-300 border-amber-500/30",
  MODIFICATION_CREATED:"bg-purple-500/20 text-purple-300 border-purple-500/30",
  MODIFICATION_APPROVED:"bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  MODIFICATION_REJECTED:"bg-red-500/20 text-red-300 border-red-500/30",
  MODIFICATION_APPLIED:"bg-blue-500/20 text-blue-300 border-blue-500/30",
  METADATA_SAVED:"bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
};
const EVENT_CATEGORIES = ["All Events","DOCUMENT","MILESTONE","MODIFICATION","METADATA"];
function formatEventType(et: string) { return et.replace(/_/g," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()); }
function timeAgo(dateStr: string) {
  const d=new Date(dateStr); const now=new Date(); const diff=now.getTime()-d.getTime();
  const mins=Math.floor(diff/60000); const hours=Math.floor(diff/3600000); const days=Math.floor(diff/86400000);
  if (mins<1) return "just now"; if (mins<60) return `${mins}m ago`; if (hours<24) return `${hours}h ago`; if (days<7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function ContractHistory() {
  const [search, setSearch] = useState("");
  const [filterContract, setFilterContract] = useState("all");
  const [filterCategory, setFilterCategory] = useState("All Events");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [limit, setLimit] = useState(200);
  const [expandedId, setExpandedId] = useState<number|null>(null);

  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page:1, pageSize:500 });
  const leases = (leasesData?.rows ?? []) as any[];
  const { data: history=[], isLoading, refetch } = trpc.contractDms.getContractHistory.useQuery(
    { contractId:filterContract!=="all"?parseInt(filterContract):undefined, eventType:filterCategory!=="All Events"?filterCategory:undefined, fromDate:fromDate||undefined, toDate:toDate||undefined, limit },
    { keepPreviousData:true } as any
  );

  const filtered = (history as any[]).filter(h => {
    if (!search) return true;
    const s=search.toLowerCase();
    return h.event_type?.toLowerCase().includes(s)||h.changed_by_name?.toLowerCase().includes(s)||h.field_name?.toLowerCase().includes(s)||h.new_value?.toLowerCase().includes(s)||h.notes?.toLowerCase().includes(s);
  });

  function exportCsv() {
    const rows = filtered.map((h:any)=>[h.history_id,h.contract_id,h.event_type,h.field_name??"",h.old_value??"",h.new_value??"",h.changed_by_name??"",h.change_reason??"",h.notes??"",h.event_date?new Date(h.event_date).toLocaleString():""]);
    const header=["ID","Contract ID","Event Type","Field","Old Value","New Value","Changed By","Reason","Notes","Date"];
    const csv=[header,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="contract_history.csv"; a.click(); URL.revokeObjectURL(url);
    toast.success("History exported");
  }

  const grouped: Record<string,any[]> = {};
  for (const h of filtered) {
    const dateKey=h.event_date?new Date(h.event_date).toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric"}):"Unknown Date";
    if (!grouped[dateKey]) grouped[dateKey]=[];
    grouped[dateKey].push(h);
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <ScreenHeader screenId={SCREEN_ID} screenType="contract_history" title="Contract History" subtitle="Complete audit trail of all contract events, changes, and activities" icon={<History className="w-5 h-5"/>} actions={<Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2"/>Export CSV</Button>}/>
        <div className="flex gap-2 px-4 py-2 border-b border-border bg-muted/10 flex-wrap items-center">
          <div className="relative flex-1 min-w-[180px]"><Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground"/><Input placeholder="Search history..." value={search} onChange={e=>setSearch(e.target.value)} className="pl-8 h-8 text-xs"/></div>
          <Select value={filterContract} onValueChange={setFilterContract}><SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue placeholder="All Contracts"/></SelectTrigger><SelectContent><SelectItem value="all">All Contracts</SelectItem>{leases.map((l:any)=><SelectItem key={l.contract_id} value={String(l.contract_id)}>{l.contract_ref??l.contract_id}</SelectItem>)}</SelectContent></Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}><SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="All Events"/></SelectTrigger><SelectContent>{EVENT_CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          <div className="flex items-center gap-1"><Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label><Input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="h-8 text-xs w-[130px]"/></div>
          <div className="flex items-center gap-1"><Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label><Input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="h-8 text-xs w-[130px]"/></div>
          <Button variant="ghost" size="sm" className="h-8" onClick={()=>refetch()}><RefreshCw className="w-3.5 h-3.5"/></Button>
        </div>
        <div className="flex gap-4 px-4 py-2 border-b border-border bg-muted/5 text-xs text-muted-foreground">
          <span>{filtered.length} events</span>
          {filterContract!=="all"&&<span>Contract: {leases.find((l:any)=>String(l.contract_id)===filterContract)?.contract_ref??filterContract}</span>}
          {filterCategory!=="All Events"&&<span>Category: {filterCategory}</span>}
        </div>
        <div className="flex-1 overflow-auto px-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading history...</div>
          ) : filtered.length===0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2"><History className="w-8 h-8 opacity-30"/><p className="text-sm">No history records found</p></div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([dateKey,events])=>(
                <div key={dateKey}>
                  <div className="flex items-center gap-3 mb-3"><div className="h-px flex-1 bg-border"/><span className="text-xs font-medium text-muted-foreground px-2 py-0.5 bg-muted rounded-full">{dateKey}</span><div className="h-px flex-1 bg-border"/></div>
                  <div className="space-y-2">
                    {events.map((h:any)=>(
                      <div key={h.history_id} className="bg-card border border-border rounded-lg overflow-hidden hover:border-border/80 transition-colors">
                        <div className="flex items-center gap-3 px-4 py-2.5 cursor-pointer" onClick={()=>setExpandedId(expandedId===h.history_id?null:h.history_id)}>
                          <Badge variant="outline" className={`text-xs shrink-0 ${EVENT_COLORS[h.event_type]??"bg-muted text-muted-foreground"}`}>{formatEventType(h.event_type)}</Badge>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {(h.contract_ref||h.contract_id)&&<span className="text-xs font-mono text-primary">{h.contract_ref??`#${h.contract_id}`}</span>}
                              {h.field_name&&<span className="text-xs text-muted-foreground">· {h.field_name}</span>}
                              {h.new_value&&<span className="text-xs text-foreground truncate max-w-[200px]">{h.new_value}</span>}
                            </div>
                            {h.notes&&<p className="text-xs text-muted-foreground truncate mt-0.5">{h.notes}</p>}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-muted-foreground">{h.changed_by_name??"System"}</span>
                            <span className="text-xs text-muted-foreground">{h.event_date?timeAgo(h.event_date):"—"}</span>
                            {expandedId===h.history_id?<ChevronDown className="w-3.5 h-3.5 text-muted-foreground"/>:<ChevronRight className="w-3.5 h-3.5 text-muted-foreground"/>}
                          </div>
                        </div>
                        {expandedId===h.history_id&&(
                          <div className="border-t border-border bg-muted/20 px-4 py-3">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                              {[{label:"History ID",value:h.history_id},{label:"Lease Ref",value:h.contract_ref??`Contract-${h.contract_id}`},{label:"Modification ID",value:h.modification_id??"—"},{label:"Event Type",value:formatEventType(h.event_type)},{label:"Field",value:h.field_name??"—"},{label:"Old Value",value:h.old_value??"—"},{label:"New Value",value:h.new_value??"—"},{label:"Changed By",value:h.changed_by_name??"System"},{label:"Change Reason",value:h.change_reason??"—"},{label:"Notes",value:h.notes??"—"},{label:"Date",value:h.event_date?new Date(h.event_date).toLocaleString():"—"}].map(row=>(
                                <div key={row.label} className="flex gap-2"><span className="text-muted-foreground w-[110px] shrink-0">{row.label}:</span><span className="text-foreground break-all">{String(row.value)}</span></div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {filtered.length>=limit&&(
                <div className="flex justify-center pt-2"><Button variant="outline" size="sm" onClick={()=>setLimit(l=>l+200)}>Load More (showing {limit})</Button></div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
