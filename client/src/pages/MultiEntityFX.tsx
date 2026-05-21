import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Globe, DollarSign , Pencil, Trash2} from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const CURRENCIES = ["QAR","USD","EUR","GBP","SAR","KWD","QAR","BHD","OMR"];
const INIT_ENT = { entity_code: "", entity_name: "", country: "QA", currency: "QAR", functional_currency: "QAR", is_consolidation_entity: false, parent_entity_id: undefined as number | undefined };
const INIT_FX = { contract_id: 0, from_currency: "USD", to_currency: "QAR", exchange_rate: 0, translation_date: "", rou_asset_fc: 0, lease_liability_fc: 0 };

export default function MultiEntityFX() {
  const [entityOpen, setEntityOpen] = useState(false);
  const [fxOpen, setFxOpen] = useState(false);
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [entityForm, setEntityForm] = useState({ ...INIT_ENT });
  const [fxForm, setFxForm] = useState({ ...INIT_FX });
  const { data: entities = [], refetch: refetchEnt } = trpc.multiEntity.listEntities.useQuery();
  const { data: fxRates = [], refetch: refetchFx } = trpc.multiEntity.listEntities?.useQuery?.() ?? { data: [], refetch: () => {} };
  const upsertEnt = trpc.multiEntity.upsertEntity.useMutation({ onSuccess: () => { refetchEnt(); setEntityOpen(false); toast.success("Entity saved"); }, onError: (e) => toast.error(e.message) });
  const upsertFx = trpc.multiEntity.upsertEntity?.useMutation?.({ onSuccess: () => { refetchFx(); setFxOpen(false); toast.success("FX rate saved"); }, onError: (e: any) => toast.error(e.message) });
  const displayEntities = aiRows.length > 0 ? aiRows : (entities as any[]);

  return (
    <DashboardLayout>
      {(entityOpen || fxOpen) ? (
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => { setEntityOpen(false); setFxOpen(false); }}><ArrowLeft className="w-5 h-5" /></Button>
              <div><h2 className="text-lg font-semibold">{entityOpen ? "New Legal Entity" : "New FX Translation Rate"}</h2></div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setEntityOpen(false); setFxOpen(false); }}>Cancel</Button>
              <Button onClick={() => entityOpen ? upsertEnt.mutate(entityForm as any) : upsertFx?.mutate?.(fxForm as any)}>Save</Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {entityOpen ? (
              <div className="max-w-xl mx-auto grid grid-cols-2 gap-5">
                <div><Label className="text-xs text-muted-foreground">Entity Code</Label><Input className="mt-1" value={entityForm.entity_code} onChange={e => setEntityForm(f => ({ ...f, entity_code: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Entity Name</Label><Input className="mt-1" value={entityForm.entity_name} onChange={e => setEntityForm(f => ({ ...f, entity_name: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Country (2-letter)</Label><Input maxLength={2} className="mt-1" value={entityForm.country} onChange={e => setEntityForm(f => ({ ...f, country: e.target.value.toUpperCase() }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Currency</Label><Input className="mt-1" value={entityForm.currency} onChange={e => setEntityForm(f => ({ ...f, currency: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Functional Currency</Label><Input className="mt-1" value={entityForm.functional_currency} onChange={e => setEntityForm(f => ({ ...f, functional_currency: e.target.value }))} /></div>
                <div className="flex items-center gap-2 mt-5"><Checkbox checked={entityForm.is_consolidation_entity} onCheckedChange={v => setEntityForm(f => ({ ...f, is_consolidation_entity: !!v }))} /><Label className="text-sm">Consolidation Entity</Label></div>
              </div>
            ) : (
              <div className="max-w-xl mx-auto grid grid-cols-2 gap-5">
                <div><Label className="text-xs text-muted-foreground">Contract ID</Label><Input type="number" className="mt-1" value={fxForm.contract_id} onChange={e => setFxForm(f => ({ ...f, contract_id: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Translation Date</Label><Input type="date" className="mt-1" value={fxForm.translation_date} onChange={e => setFxForm(f => ({ ...f, translation_date: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">From Currency</Label><Input className="mt-1" value={fxForm.from_currency} onChange={e => setFxForm(f => ({ ...f, from_currency: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">To Currency</Label><Input className="mt-1" value={fxForm.to_currency} onChange={e => setFxForm(f => ({ ...f, to_currency: e.target.value }))} /></div>
                <div><Label className="text-xs text-muted-foreground">Exchange Rate</Label><Input type="number" step="0.0001" className="mt-1" value={fxForm.exchange_rate} onChange={e => setFxForm(f => ({ ...f, exchange_rate: Number(e.target.value) }))} /></div>
                <div><Label className="text-xs text-muted-foreground">ROU Asset (FC)</Label><Input type="number" step="0.01" className="mt-1" value={fxForm.rou_asset_fc} onChange={e => setFxForm(f => ({ ...f, rou_asset_fc: Number(e.target.value) }))} /></div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          <ScreenHeader screenId="VFLMULTFX0001P001" title="Multi-Entity & FX" subtitle="Legal entities, consolidation and foreign exchange translation"
            screenType="multi_entity_fx" onAIData={(rows) => setAiRows(rows)} />
          <Tabs defaultValue="entities">
            <TabsList>
              <TabsTrigger value="entities"><Globe className="w-4 h-4 mr-1" />Legal Entities</TabsTrigger>
              <TabsTrigger value="fx"><DollarSign className="w-4 h-4 mr-1" />FX Rates</TabsTrigger>
            </TabsList>
            <TabsContent value="entities" className="mt-4">
              <div className="flex justify-end mb-3"><Button size="sm" onClick={() => { setEntityForm({ ...INIT_ENT }); setEntityOpen(true); }}><Plus className="w-4 h-4 mr-1" />Add Entity</Button></div>
              <Card><CardContent className="p-0"><Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Country</TableHead><TableHead>Currency</TableHead><TableHead>Functional CCY</TableHead><TableHead>Consolidation</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {displayEntities.map((e: any, i: number) => (
                    <TableRow key={i}><TableCell className="font-mono font-semibold">{e.entity_code}</TableCell><TableCell>{e.entity_name}</TableCell><TableCell>{e.country}</TableCell><TableCell><Badge variant="outline">{e.currency}</Badge></TableCell><TableCell><Badge variant="outline">{e.functional_currency}</Badge></TableCell><TableCell>{e.is_consolidation_entity ? <Badge className="bg-purple-600 text-white text-xs">Yes</Badge> : <span className="text-muted-foreground text-xs">No</span>}</TableCell></TableRow>
                  ))}
                  {displayEntities.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No entities configured</TableCell></TableRow>}
                </TableBody>
              </Table></CardContent></Card>
            </TabsContent>
            <TabsContent value="fx" className="mt-4">
              <div className="flex justify-end mb-3"><Button size="sm" onClick={() => { setFxForm({ ...INIT_FX }); setFxOpen(true); }}><Plus className="w-4 h-4 mr-1" />Add FX Rate</Button></div>
              <Card><CardContent className="p-0"><Table>
                <TableHeader><TableRow><TableHead>Contract</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(fxRates as any[]).map((r: any, i: number) => (
                    <TableRow key={i}><TableCell className="font-mono text-xs">{r.contract_ref ?? r.contract_id}</TableCell><TableCell><Badge variant="outline">{r.from_currency}</Badge></TableCell><TableCell><Badge variant="outline">{r.to_currency}</Badge></TableCell><TableCell className="text-right font-mono">{Number(r.exchange_rate ?? 0).toFixed(4)}</TableCell><TableCell className="text-sm">{r.translation_date?.slice(0,10)}</TableCell></TableRow>
                  ))}
                  {(fxRates as any[]).length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No FX rates recorded</TableCell></TableRow>}
                </TableBody>
              </Table></CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </DashboardLayout>
  );
}
