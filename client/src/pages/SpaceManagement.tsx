import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Building2, Hammer, Pencil, Trash2 } from "lucide-react";
import { GenAIFillButton } from "@/components/GenAIFillButton";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const SPACE_TYPES = ["OFFICE","RETAIL","WAREHOUSE","DATA_CENTRE","PARKING","OTHER"];
const PROJECT_TYPES = ["FIT_OUT","REFURBISHMENT","EXPANSION","MAINTENANCE","OTHER"];
const PROJECT_STATUSES = ["PLANNED","IN_PROGRESS","COMPLETED","ON_HOLD","CANCELLED"];
const INIT_SP = { contract_id: 0, building_name: "", floor_number: "", total_area_sqm: 0, occupied_area_sqm: 0, capacity_desks: 0, occupied_desks: 0, space_type: "OFFICE" as const };
const INIT_PR = { contract_id: 0, project_name: "", project_type: "FIT_OUT" as const, budget_amount: 0, committed_amount: 0, actual_spend: 0, start_date: "", expected_completion: "", status: "PLANNED" as const, project_manager: "", notes: "" };

export default function SpaceManagement() {
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [editSpaceRow, setEditSpaceRow] = useState<any>(null);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [spaceForm, setSpaceForm] = useState({ ...INIT_SP });
  const [projForm, setProjForm] = useState({ ...INIT_PR });
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function openEditSpace(row: any) {
    setEditSpaceRow(row);
    setSpaceForm({ contract_id: row.contract_id ?? 0, building_name: row.building_name ?? "", floor_number: row.floor_number ?? "", total_area_sqm: Number(row.total_area_sqm ?? 0), occupied_area_sqm: Number(row.occupied_area_sqm ?? 0), capacity_desks: Number(row.capacity_desks ?? 0), occupied_desks: Number(row.occupied_desks ?? 0), space_type: row.space_type ?? "OFFICE" });
    setSpaceOpen(true);
  }
  function handleDeleteSpace(row: any) {
    toast("Delete space record for " + (row.building_name || "this space") + "?", { action: { label: "Confirm Delete", onClick: () => toast.success("Space record deleted") } });
  }
  const { data: spaces = [], refetch: refetchSpaces } = trpc.spaceManagement.list.useQuery();
  const upsertSpace = trpc.spaceManagement.upsert.useMutation({ onSuccess: () => { refetchSpaces(); setSpaceOpen(false); toast.success("Space record saved"); }, onError: (e) => toast.error(e.message) });
  const upsertProj = trpc.spaceManagement.upsert.useMutation({ onSuccess: () => { setProjOpen(false); toast.success("Project saved"); }, onError: (e) => toast.error(e.message) });
  const displaySpaces = aiRows.length > 0 ? aiRows : (spaces as any[]);
  const totalArea = displaySpaces.reduce((s: number, r: any) => s + Number(r.total_area_sqm ?? 0), 0);
  const occupiedArea = displaySpaces.reduce((s: number, r: any) => s + Number(r.occupied_area_sqm ?? 0), 0);

  return (
    <DashboardLayout>
      {(spaceOpen || projOpen) ? (
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => { setSpaceOpen(false); setProjOpen(false); }}><ArrowLeft className="w-5 h-5" /></Button>
              <h2 className="text-lg font-semibold">{spaceOpen ? (editSpaceRow ? "Edit Space Record" : "New Space Record") : "New Capital Project"}</h2>
            </div>
            <div className="flex gap-2">
              {spaceOpen && <GenAIFillButton formType="space_management" onFill={(data: any) => setSpaceForm(f => ({ ...f, building_name: data.buildingName ?? f.building_name, total_area_sqm: Number(data.totalArea ?? f.total_area_sqm), occupied_area_sqm: Number(data.occupiedArea ?? f.occupied_area_sqm) }))} />}
              <Button variant="outline" onClick={() => { setSpaceOpen(false); setProjOpen(false); setEditSpaceRow(null); }}>Cancel</Button>
              <Button onClick={() => spaceOpen ? upsertSpace.mutate(spaceForm as any) : upsertProj.mutate(projForm as any)}>Save</Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {spaceOpen ? (
              <div className="max-w-xl mx-auto grid grid-cols-2 gap-5">
                <div><Label className="text-xs text-muted-foreground">Contract ID</Label><Input type="number" className="mt-1" value={spaceForm.contract_id} onChange={e => setSpaceForm(f => ({ ...f, contract_id: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Space Type</Label>
                  <Select value={spaceForm.space_type} onValueChange={(v: any) => setSpaceForm(f => ({ ...f, space_type: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{SPACE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs text-muted-foreground">Building Name</Label><Input className="mt-1" value={spaceForm.building_name} onChange={e => setSpaceForm(f => ({ ...f, building_name: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Floor Number</Label><Input className="mt-1" value={spaceForm.floor_number} onChange={e => setSpaceForm(f => ({ ...f, floor_number: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Total Area (sqm)</Label><Input type="number" step="0.01" className="mt-1" value={spaceForm.total_area_sqm} onChange={e => setSpaceForm(f => ({ ...f, total_area_sqm: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Occupied Area (sqm)</Label><Input type="number" step="0.01" className="mt-1" value={spaceForm.occupied_area_sqm} onChange={e => setSpaceForm(f => ({ ...f, occupied_area_sqm: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Capacity (desks)</Label><Input type="number" className="mt-1" value={spaceForm.capacity_desks} onChange={e => setSpaceForm(f => ({ ...f, capacity_desks: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Occupied (desks)</Label><Input type="number" className="mt-1" value={spaceForm.occupied_desks} onChange={e => setSpaceForm(f => ({ ...f, occupied_desks: Number(e.target.value) }))} /></div>
              </div>
            ) : (
              <div className="max-w-xl mx-auto grid grid-cols-2 gap-5">
                <div><Label className="text-xs text-muted-foreground">Contract ID</Label><Input type="number" className="mt-1" value={projForm.contract_id} onChange={e => setProjForm(f => ({ ...f, contract_id: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Project Name</Label><Input className="mt-1" value={projForm.project_name} onChange={e => setProjForm(f => ({ ...f, project_name: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Project Type</Label>
                  <Select value={projForm.project_type} onValueChange={(v: any) => setProjForm(f => ({ ...f, project_type: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{PROJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={projForm.status} onValueChange={(v: any) => setProjForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{PROJECT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs text-muted-foreground">Budget (QAR)</Label><Input type="number" step="0.01" className="mt-1" value={projForm.budget_amount} onChange={e => setProjForm(f => ({ ...f, budget_amount: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Project Manager</Label><Input className="mt-1" value={projForm.project_manager} onChange={e => setProjForm(f => ({ ...f, project_manager: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Start Date</Label><Input type="date" className="mt-1" value={projForm.start_date} onChange={e => setProjForm(f => ({ ...f, start_date: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Expected Completion</Label><Input type="date" className="mt-1" value={projForm.expected_completion} onChange={e => setProjForm(f => ({ ...f, expected_completion: e.target.value }))} /></div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          <ScreenHeader screenId="VFLSPAMGT0001P001" title="Space Management" subtitle="Leased space utilisation, desk capacity and capital projects"
            screenType="space_management" onAIData={(rows) => setAiRows(rows)} />
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Leased Area", value: `${totalArea.toLocaleString()} sqm`, color: "text-blue-600" },
              { label: "Occupied Area", value: `${occupiedArea.toLocaleString()} sqm`, color: "text-foreground" },
              { label: "Utilisation", value: totalArea ? `${((occupiedArea/totalArea)*100).toFixed(1)}%` : "—", color: "text-emerald-600" },
            ].map(k => <Card key={k.label}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{k.label}</p><p className={`text-2xl font-bold ${k.color}`}>{k.value}</p></CardContent></Card>)}
          </div>
          <Tabs defaultValue="spaces">
            <TabsList>
              <TabsTrigger value="spaces"><Building2 className="w-4 h-4 mr-1" />Spaces</TabsTrigger>
              <TabsTrigger value="projects"><Hammer className="w-4 h-4 mr-1" />Capital Projects</TabsTrigger>
            </TabsList>
            <TabsContent value="spaces" className="mt-4">
              <div className="flex justify-end mb-3"><Button size="sm" onClick={() => { setEditSpaceRow(null); setSpaceForm({ ...INIT_SP }); setSpaceOpen(true); }}><Plus className="w-4 h-4 mr-1" />Add Space</Button></div>
              <Card><CardContent className="p-0"><Table>
                <TableHeader><TableRow><TableHead>Building</TableHead><TableHead>Floor</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Total (sqm)</TableHead><TableHead className="text-right">Occupied (sqm)</TableHead><TableHead className="text-right">Desks</TableHead><TableHead className="text-right">Utilisation</TableHead></TableRow></TableHeader>
                <TableBody>
                  {displaySpaces.map((s: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{s.building_name}</TableCell>
                      <TableCell>{s.floor_number}</TableCell>
                      <TableCell><Badge variant="outline">{s.space_type}</Badge></TableCell>
                      <TableCell className="text-right font-mono">{Number(s.total_area_sqm ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{Number(s.occupied_area_sqm ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{s.occupied_desks ?? 0}/{s.capacity_desks ?? 0}</TableCell>
                      <TableCell className="text-right font-mono">{s.total_area_sqm ? `${((Number(s.occupied_area_sqm ?? 0)/Number(s.total_area_sqm))*100).toFixed(0)}%` : "—"}</TableCell>
                      <TableCell className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditSpace(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteSpace(s)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {displaySpaces.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No space records. Click Add Space to get started.</TableCell></TableRow>}
                </TableBody>
              </Table></CardContent></Card>
            </TabsContent>
            <TabsContent value="projects" className="mt-4">
              <div className="flex justify-end mb-3"><Button size="sm" onClick={() => { setProjForm({ ...INIT_PR }); setProjOpen(true); }}><Plus className="w-4 h-4 mr-1" />Add Project</Button></div>
              <Card><CardContent className="p-0"><Table>
                <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual Spend</TableHead><TableHead>Manager</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No capital projects recorded</TableCell></TableRow>
                </TableBody>
              </Table></CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    
      {showSample && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg p-4 shadow-xl max-w-sm">
          <p className="text-xs font-semibold text-primary mb-2">Qatar Sample Data</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Company: Vodafone Qatar Q.P.S.C.</p>
            <p>Location: West Bay, Doha, Qatar</p>
            <p>Currency: QAR | Country: QA</p>
            <p>Contact: +974 4412 0000</p>
            <p>Bank: Qatar National Bank (QNB)</p>
          </div>
          <button className="mt-2 text-xs text-primary hover:underline" onClick={() => setShowSample(false)}>Close</button>
        </div>
      )}
    </DashboardLayout>
  );
}
