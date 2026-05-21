/**
 * VodaLease Enterprise — Contract Milestones
 * Screen ID: VFCNTMLS0001P001
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Milestone, PlusCircle, CheckCircle2, Clock, AlertTriangle, Pencil, Trash2, Bell, Search, RefreshCw, XCircle, X } from "lucide-react";

const SCREEN_ID = "VFCNTMLS0001P001";
const MILESTONE_TYPES = [
  "Rent Review Date","Renewal Decision Deadline","Break Clause Date",
  "Insurance Renewal","Maintenance Inspection","Regulatory Compliance",
  "Payment Escalation","Make-Good Assessment","Stamp Duty Deadline",
  "Registration Deadline","Fit-Out Deadline","Handover Due","Custom",
];
const STATUS_COLORS: Record<string,string> = {
  Pending:"bg-amber-500/20 text-amber-300 border-amber-500/30",
  Completed:"bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Overdue:"bg-red-500/20 text-red-300 border-red-500/30",
  Dismissed:"bg-slate-500/20 text-slate-400 border-slate-500/30",
};

function daysLabel(days: number|null) {
  if (days===null||days===undefined) return "—";
  if (days<0) return `${Math.abs(days)}d overdue`;
  if (days===0) return "Today";
  return `${days}d left`;
}
function daysColor(days: number|null, status: string) {
  if (status==="Completed"||status==="Dismissed") return "text-muted-foreground";
  if (days===null) return "text-muted-foreground";
  if (days<0) return "text-red-400 font-semibold";
  if (days<=7) return "text-orange-400 font-semibold";
  if (days<=30) return "text-amber-400";
  return "text-emerald-400";
}

interface MsDraft {
  milestoneId?: number;
  contractId: string;
  milestoneType: string;
  milestoneDate: string;
  description: string;
  notes: string;
}
const EMPTY: MsDraft = { milestoneId:undefined, contractId:"", milestoneType:"", milestoneDate:"", description:"", notes:"" };

export default function ContractMilestones() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterContract, setFilterContract] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<MsDraft>(EMPTY);
  const [deleteId, setDeleteId] = useState<number|null>(null);
  const [completeId, setCompleteId] = useState<number|null>(null);
  const [dismissId, setDismissId] = useState<number|null>(null);
  const [completeNotes, setCompleteNotes] = useState("");
  const [dismissReason, setDismissReason] = useState("");

  const { data: leasesData } = trpc.lease.getLeaseRegister.useQuery({ page:1, pageSize:500 });
  const leases = (leasesData?.rows ?? []) as any[];
  const { data: milestones=[], isLoading, refetch } = trpc.contractDms.listMilestones.useQuery(
    { contractId: filterContract!=="all"?parseInt(filterContract):undefined, status: filterStatus!=="all"?filterStatus:undefined },
    { keepPreviousData:true } as any
  );

  const upsertMs = trpc.contractDms.upsertMilestone.useMutation({
    onSuccess:()=>{ toast.success(draft.milestoneId?"Milestone updated":"Milestone created"); utils.contractDms.listMilestones.invalidate(); setShowForm(false); setDraft(EMPTY); },
    onError:(e)=>toast.error(e.message),
  });
  const completeMs = trpc.contractDms.completeMilestone.useMutation({
    onSuccess:()=>{ toast.success("Milestone completed"); utils.contractDms.listMilestones.invalidate(); setCompleteId(null); setCompleteNotes(""); },
    onError:(e)=>toast.error(e.message),
  });
  const dismissMs = trpc.contractDms.dismissMilestone.useMutation({
    onSuccess:()=>{ toast.success("Milestone dismissed"); utils.contractDms.listMilestones.invalidate(); setDismissId(null); setDismissReason(""); },
    onError:(e)=>toast.error(e.message),
  });
  const deleteMs = trpc.contractDms.deleteMilestone.useMutation({
    onSuccess:()=>{ toast.success("Milestone deleted"); utils.contractDms.listMilestones.invalidate(); setDeleteId(null); },
    onError:(e)=>toast.error(e.message),
  });
  const syncAlert = trpc.contractDms.syncMilestoneToAlert.useMutation({
    onSuccess:()=>toast.success("Synced to Alert Rules"),
    onError:(e)=>toast.error(e.message),
  });

  const allMs = (milestones as any[]).filter(m => {
    if (filterType!=="all" && m.milestone_type!==filterType) return false;
    if (search) {
      const s=search.toLowerCase();
      if (!m.milestone_type?.toLowerCase().includes(s) && !m.description?.toLowerCase().includes(s) && !m.contract_ref?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  function openAdd() { setDraft({...EMPTY, contractId:filterContract!=="all"?filterContract:""}); setShowForm(true); }
  function openEdit(m:any) {
    setDraft({ milestoneId:m.milestone_id, contractId:String(m.contract_id??""), milestoneType:m.milestone_type??"", milestoneDate:m.milestone_date?new Date(m.milestone_date).toISOString().slice(0,10):"", description:m.description??"", notes:m.notes??"" });
    setShowForm(true);
  }
  function handleSave() {
    if (!draft.contractId) { toast.error("Select a contract"); return; }
    if (!draft.milestoneType) { toast.error("Select milestone type"); return; }
    if (!draft.milestoneDate) { toast.error("Enter milestone date"); return; }
    upsertMs.mutate({ milestoneId:draft.milestoneId, contractId:parseInt(draft.contractId), milestoneType:draft.milestoneType, milestoneDate:draft.milestoneDate, description:draft.description||undefined, notes:draft.notes||undefined });
  }
  const setField = (k:keyof MsDraft, v:string) => setDraft(p=>({...p,[k]:v}));

  const totalMs=(milestones as any[]).length;
  const overdueMs=(milestones as any[]).filter(m=>(m.days_until??0)<0&&m.status==="Pending").length;
  const dueThisWeek=(milestones as any[]).filter(m=>{ const dd=m.days_until??999; return dd>=0&&dd<=7&&m.status==="Pending"; }).length;
  const completedMs=(milestones as any[]).filter(m=>m.status==="Completed").length;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <ScreenHeader
          screenId={SCREEN_ID} screenType="contract_milestones"
          title="Contract Milestones"
          subtitle="Track and manage all contractual milestones, deadlines, and obligations"
          icon={<Milestone className="w-5 h-5"/>}
          actions={<Button size="sm" onClick={openAdd}><PlusCircle className="w-4 h-4 mr-2"/>Add Milestone</Button>}
        />

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 px-4 py-3 border-b border-border bg-muted/20">
          {[
            {label:"Total",value:totalMs,color:"text-foreground"},
            {label:"Overdue",value:overdueMs,color:"text-red-400"},
            {label:"Due This Week",value:dueThisWeek,color:"text-amber-400"},
            {label:"Completed",value:completedMs,color:"text-emerald-400"},
          ].map(s=>(
            <div key={s.label} className="bg-card border border-border rounded-lg px-3 py-2 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-4 py-2 border-b border-border bg-muted/10 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground"/>
            <Input placeholder="Search milestones..." value={search} onChange={e=>setSearch(e.target.value)} className="pl-8 h-8 text-xs"/>
          </div>
          <Select value={filterContract} onValueChange={setFilterContract}>
            <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue placeholder="All Contracts"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Contracts</SelectItem>
              {leases.map((l:any)=><SelectItem key={l.contract_id} value={String(l.contract_id)}>{l.contract_ref??l.contract_id}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="All Statuses"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["Pending","Completed","Overdue","Dismissed"].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-xs w-[170px]"><SelectValue placeholder="All Types"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {MILESTONE_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-8" onClick={()=>refetch()}><RefreshCw className="w-3.5 h-3.5"/></Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading milestones...</div>
          ) : allMs.length===0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <Milestone className="w-8 h-8 opacity-30"/>
              <p className="text-sm">No milestones found</p>
              <Button variant="outline" size="sm" onClick={openAdd}><PlusCircle className="w-4 h-4 mr-2"/>Add First Milestone</Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-8">#</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Contract</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Milestone Type</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Due Date</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Days</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Description</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allMs.map((m:any,i:number)=>(
                  <tr key={m.milestone_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2 text-xs text-muted-foreground">{i+1}</td>
                    <td className="px-4 py-2"><span className="text-xs font-mono text-primary">{m.contract_ref??`#${m.contract_id}`}</span></td>
                    <td className="px-4 py-2"><span className="text-xs font-medium">{m.milestone_type}</span></td>
                    <td className="px-4 py-2 text-xs">{m.milestone_date?new Date(m.milestone_date).toLocaleDateString():"—"}</td>
                    <td className={`px-4 py-2 text-xs ${daysColor(m.days_until,m.status)}`}>{daysLabel(m.days_until)}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[m.status]??""}`}>
                        {m.status==="Pending"&&<Clock className="w-3 h-3 mr-1"/>}
                        {m.status==="Completed"&&<CheckCircle2 className="w-3 h-3 mr-1"/>}
                        {m.status==="Overdue"&&<AlertTriangle className="w-3 h-3 mr-1"/>}
                        {m.status==="Dismissed"&&<XCircle className="w-3 h-3 mr-1"/>}
                        {m.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-[200px] truncate">{m.description??"—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1 justify-end">
                        {m.status==="Pending"&&<>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Mark Complete" onClick={()=>{setCompleteId(m.milestone_id);setCompleteNotes("");}}>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400"/>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Dismiss" onClick={()=>{setDismissId(m.milestone_id);setDismissReason("");}}>
                            <XCircle className="w-3.5 h-3.5 text-amber-400"/>
                          </Button>
                        </>}
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Sync to Alert Rules" onClick={()=>syncAlert.mutate({milestoneId:m.milestone_id})}>
                          <Bell className="w-3.5 h-3.5 text-blue-400"/>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={()=>openEdit(m)}>
                          <Pencil className="w-3.5 h-3.5"/>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Delete" onClick={()=>setDeleteId(m.milestone_id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive"/>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add/Edit Dialog */}
      {showForm && (
        <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
          
            <div className="flex items-center justify-between"><h4 className="text-sm font-semibold flex items-center gap-2">{draft.milestoneId?"Edit Milestone":"Add Milestone"}</h4><Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowForm(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="col-span-2">
                <Label className="text-xs">Contract *</Label>
                <Select value={draft.contractId} onValueChange={v=>setField("contractId",v)}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select contract..."/></SelectTrigger>
                  <SelectContent>
                    {leases.map((l:any)=>(
                      <SelectItem key={l.contract_id} value={String(l.contract_id)}>
                        {l.contract_ref??l.contract_id} — {l.asset_description??l.asset_type??""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Milestone Type *</Label>
                <Select value={draft.milestoneType} onValueChange={v=>setField("milestoneType",v)}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select type..."/></SelectTrigger>
                  <SelectContent>{MILESTONE_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Due Date *</Label>
                <Input type="date" value={draft.milestoneDate} onChange={e=>setField("milestoneDate",e.target.value)} className="h-8 text-xs mt-1"/>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Description</Label>
                <Textarea value={draft.description} onChange={e=>setField("description",e.target.value)} className="text-xs mt-1 resize-none" rows={2} placeholder="Optional description..."/>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea value={draft.notes} onChange={e=>setField("notes",e.target.value)} className="text-xs mt-1 resize-none" rows={2} placeholder="Optional notes..."/>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={()=>{setShowForm(false);setDraft(EMPTY);}}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={upsertMs.isPending}>{upsertMs.isPending?"Saving...":"Save Milestone"}</Button>
            </div>
        </div>
      )}

        {/* Complete Dialog */}
        {completeId !== null && (
        <div className="rounded-xl border border-emerald-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
          
            <div className="flex items-center justify-between"><h4 className="text-sm font-semibold flex items-center gap-2">Mark as Completed</h4><Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setCompleteId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
            <div className="py-2">
              <Label className="text-xs">Completion Notes (optional)</Label>
              <Textarea value={completeNotes} onChange={e=>setCompleteNotes(e.target.value)} className="text-xs mt-1 resize-none" rows={3} placeholder="Add completion notes..."/>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={()=>setCompleteId(null)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={()=>completeMs.mutate({milestoneId:completeId!,notes:completeNotes||undefined})} disabled={completeMs.isPending}>
                {completeMs.isPending?"Saving...":"Mark Complete"}
              </Button>
            </div>
        </div>
      )}

        {/* Dismiss Dialog */}
        {dismissId !== null && (
        <div className="rounded-xl border border-amber-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
          
            <div className="flex items-center justify-between"><h4 className="text-sm font-semibold flex items-center gap-2">Dismiss Milestone</h4><Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDismissId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
            <div className="py-2">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea value={dismissReason} onChange={e=>setDismissReason(e.target.value)} className="text-xs mt-1 resize-none" rows={3} placeholder="Reason for dismissal..."/>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={()=>setDismissId(null)}>Cancel</Button>
              <Button size="sm" variant="outline" className="border-amber-500 text-amber-400 hover:bg-amber-500/10" onClick={()=>dismissMs.mutate({milestoneId:dismissId!,reason:dismissReason||undefined})} disabled={dismissMs.isPending}>
                {dismissMs.isPending?"Saving...":"Dismiss"}
              </Button>
            </div>
        </div>
      )}

        {/* Delete Confirm */}
        {deleteId !== null && (
        <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
          
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">Delete Milestone?</h4>
              <p className="text-xs text-muted-foreground">This will permanently remove the milestone. This action cannot be undone.</p>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDeleteId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline">Cancel</Button>
              <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={()=>deleteMs.mutate({milestoneId:deleteId!})}>Delete</Button>
            </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
