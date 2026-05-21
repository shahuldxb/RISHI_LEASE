/**
 * VodaLease Enterprise — SSOConfig
 * Screen ID: VFLSSOCONFI0001P001
 */
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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Plus, Search, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GenAIFillButton } from "@/components/GenAIFillButton";

const INIT_FORM = {
  provider_name: "",
  provider_type: "",
  entity_id: "",
  sso_url: "",
  logout_url: "",
  certificate: "",
  is_active: false
};

export default function SSOConfig() {
  const [search, setSearch] = useState("");
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [form, setForm] = useState<any>({ ...INIT_FORM });
  const [showSample, setShowSample] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setShowForm(false); }
      if (e.altKey && e.key === "F2") { e.preventDefault(); setShowSample(s => !s); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.ssoConfig.list.useQuery({} as any);

  const createMut = trpc.ssoConfig.upsert.useMutation({
    onSuccess: () => { utils.ssoConfig.list.invalidate(); toast.success("Record created"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.ssoConfig.upsert.useMutation({
    onSuccess: () => { utils.ssoConfig.list.invalidate(); toast.success("Updated"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.ssoConfig.delete.useMutation({
    onSuccess: () => { utils.ssoConfig.list.invalidate(); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });


  const displayRows = aiRows.length > 0 ? aiRows : (rows as any[]);
  const filtered = displayRows.filter((r: any) =>
    !search || Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
  );

  function openAdd() {
    setEditRow(null);
    setForm({ ...INIT_FORM });
    setShowForm(true);
  }
  function openEdit(row: any) {
    setEditRow(row);
    setForm({
      provider_name: row.provider_name ?? "",
      provider_type: row.provider_type ?? "",
      entity_id: row.entity_id ?? "",
      sso_url: row.sso_url ?? "",
      logout_url: row.logout_url ?? "",
      certificate: row.certificate ?? "",
      is_active: row.is_active ?? ""
      });
    setShowForm(true);
  }
  function handleSubmit() {
    const payload = {
      provider_name: form.provider_name as any,
      provider_type: form.provider_type as any,
      entity_id: form.entity_id as any,
      sso_url: form.sso_url as any,
      logout_url: form.logout_url as any,
      certificate: form.certificate as any,
      is_active: !!form.is_active
      };
    if (editRow) {
            updateMut.mutate({ config_id: editRow.config_id, ...payload } as any);
    } else {
      createMut.mutate(payload as any);
    }
  }


  if (showForm) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-full w-full bg-background">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[#161616] shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><ArrowLeft className="w-5 h-5" /></Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{editRow ? "Edit Record" : "Add New Record"}</h2>
              <p className="text-xs text-muted-foreground">Fill in the details below</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="space-y-4">
          <div>
            <Label>Provider Name</Label>
            <Input type="text" value={form.provider_name ?? ""} onChange={e => setForm((f: any) => ({...f, provider_name: e.target.value}))} />
          </div>
          <div>
            <Label>Provider Type</Label>
            <Select value={String(form.provider_type ?? "")} onValueChange={v => setForm((f: any) => ({...f, provider_type: v}))} >
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                  <SelectItem value="SAML">SAML</SelectItem>
                  <SelectItem value="OIDC">OIDC</SelectItem>
                  <SelectItem value="OAUTH2">OAUTH2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Entity Id</Label>
            <Input type="text" value={form.entity_id ?? ""} onChange={e => setForm((f: any) => ({...f, entity_id: e.target.value}))} />
          </div>
          <div>
            <Label>Sso Url</Label>
            <Input type="text" value={form.sso_url ?? ""} onChange={e => setForm((f: any) => ({...f, sso_url: e.target.value}))} />
          </div>
          <div>
            <Label>Logout Url</Label>
            <Input type="text" value={form.logout_url ?? ""} onChange={e => setForm((f: any) => ({...f, logout_url: e.target.value}))} />
          </div>
          <div>
            <Label>Certificate</Label>
            <Textarea value={form.certificate ?? ""} onChange={e => setForm((f: any) => ({...f, certificate: e.target.value}))} rows={3} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active" checked={!!form.is_active} onChange={e => setForm((f: any) => ({...f, is_active: e.target.checked}))} className="w-4 h-4" />
            <Label htmlFor="is_active">Is Active</Label>
          </div>
        </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending}>
              {createMut.isPending ? "Saving…" : editRow ? "Update" : "Create"}
            </Button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFLSSOCONFI0001P001"
          title="SSOConfig"
          subtitle="Manage ssoconfig records"
          screenType="ssoConfig"
          onAIData={(r) => setAiRows(r)}
          actions={<Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add New</Button>}
        />

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                <TableHead className="text-xs">Provider Name</TableHead>
                <TableHead className="text-xs">Provider Type</TableHead>
                <TableHead className="text-xs">Entity Id</TableHead>
                <TableHead className="text-xs">Sso Url</TableHead>
                <TableHead className="text-xs">Is Active</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && aiRows.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No records found. <button className="text-primary underline" onClick={openAdd}>Add the first one.</button></TableCell></TableRow>
                  ) : (
                    filtered.map((row: any, i: number) => (
                      <TableRow key={row.config_id ?? i} className="hover:bg-muted/20">
                    <TableCell>{row.provider_name ?? "—"}</TableCell>
                    <TableCell>{row.provider_type ?? "—"}</TableCell>
                    <TableCell>{row.entity_id ?? "—"}</TableCell>
                    <TableCell>{row.sso_url ?? "—"}</TableCell>
                    <TableCell>{row.is_active ?? "—"}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(row)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteMut.mutate({ config_id: row.config_id })}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    
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
