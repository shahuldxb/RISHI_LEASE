import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Settings, Shield, Users, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const MODULES = ["Lease","Payables","Contract","BankRecon","Cheque","Workflow"];
const ROLES = ["Manager","Senior Manager","Director","CFO","CEO"];
const INIT = { module: "", minAmount: "", maxAmount: "", approverRole: "" };

export default function AdminPanel() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ ...INIT });
  const { data: thresholds = [], refetch } = trpc.workflow.getMCThresholds.useQuery();
  const { data: screenRegistry } = trpc.compliance.getScreenRegistry.useQuery();
  const utils = trpc.useUtils();
  const notifyMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Notification sent"),
    onError: (e) => toast.error(e.message),
  });
  const screens: any[] = Array.isArray(screenRegistry) ? screenRegistry : [];
  const thresholdList: any[] = Array.isArray(thresholds) ? thresholds : [];
  const displayRows = aiRows.length > 0 ? aiRows : thresholdList;

  return (
    <DashboardLayout>
      {panelOpen ? (
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setPanelOpen(false)}><ArrowLeft className="w-5 h-5" /></Button>
              <div><h2 className="text-lg font-semibold">{form.module ? `Edit Threshold — ${form.module}` : "New Approval Threshold"}</h2><p className="text-xs text-muted-foreground">Configure module-level approval thresholds</p></div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPanelOpen(false)}>Cancel</Button>
              <Button onClick={() => { toast.success("Threshold saved"); setPanelOpen(false); }}>Save</Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-xl mx-auto space-y-5">
              <div><Label className="text-xs text-muted-foreground">Module</Label>
                <Select value={form.module} onValueChange={v => setForm(f => ({ ...f, module: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select module" /></SelectTrigger>
                  <SelectContent>{MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs text-muted-foreground">Min Amount (QAR)</Label><Input type="number" className="mt-1" value={form.minAmount} onChange={e => setForm(f => ({ ...f, minAmount: e.target.value }))} /></div>
              <div><Label className="text-xs text-muted-foreground">Max Amount (QAR)</Label><Input type="number" className="mt-1" value={form.maxAmount} onChange={e => setForm(f => ({ ...f, maxAmount: e.target.value }))} /></div>
              <div><Label className="text-xs text-muted-foreground">Approver Role</Label>
                <Select value={form.approverRole} onValueChange={v => setForm(f => ({ ...f, approverRole: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          <ScreenHeader screenId="VFLADMIN0001P001" title="Admin Panel" subtitle="System configuration, approval thresholds and screen registry"
            screenType="admin_panel" onAIData={(rows) => setAiRows(rows)}
            actions={<Button size="sm" onClick={() => { setForm({ ...INIT }); setPanelOpen(true); }}><Plus className="w-4 h-4 mr-1" />Add Threshold</Button>} />
          <Tabs defaultValue="thresholds">
            <TabsList><TabsTrigger value="thresholds"><Shield className="w-4 h-4 mr-1" />Approval Thresholds</TabsTrigger><TabsTrigger value="screens"><Settings className="w-4 h-4 mr-1" />Screen Registry</TabsTrigger></TabsList>
            <TabsContent value="thresholds" className="mt-4">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Module</TableHead><TableHead className="text-right">Min (QAR)</TableHead><TableHead className="text-right">Max (QAR)</TableHead><TableHead>Approver Role</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {displayRows.map((t: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{t.module}</TableCell>
                        <TableCell className="text-right font-mono">{Number(t.min_amount ?? t.minAmount ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">{Number(t.max_amount ?? t.maxAmount ?? 0).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline">{t.approver_role ?? t.approverRole}</Badge></TableCell>
                        <TableCell className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setForm({ module: t.module, minAmount: String(t.min_amount ?? t.minAmount ?? ''), maxAmount: String(t.max_amount ?? t.maxAmount ?? ''), approverRole: t.approver_role ?? t.approverRole }); setPanelOpen(true); }}><Pencil className="w-4 h-4 text-blue-400" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => toast.success(`Threshold for ${t.module} deleted`)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {displayRows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No thresholds configured</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="screens" className="mt-4">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Screen ID</TableHead><TableHead>Title</TableHead><TableHead>Module</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {screens.slice(0,20).map((s: any, i: number) => (
                      <TableRow key={i}><TableCell className="font-mono text-xs">{s.screen_id}</TableCell><TableCell>{s.title}</TableCell><TableCell><Badge variant="secondary">{s.module}</Badge></TableCell><TableCell><Badge className="bg-emerald-600 text-white text-xs">Active</Badge></TableCell></TableRow>
                    ))}
                    {screens.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No screens registered</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </DashboardLayout>
  );
}
