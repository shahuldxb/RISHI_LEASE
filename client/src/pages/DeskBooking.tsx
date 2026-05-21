/**
 * VodaLease Enterprise — Desk Booking
 * Screen ID: VFLDESKBOOK0001P001
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
  desk_number: "",
  floor_level: "",
  building: "",
  booked_by_name: "",
  booked_by_email: "",
  booking_date: "",
  start_time: "",
  end_time: "",
  notes: ""
};

export default function DeskBooking() {
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
  const { data: rows = [], isLoading } = trpc.deskBooking.list.useQuery({} as any);

  const createMut = trpc.deskBooking.create.useMutation({
    onSuccess: () => { utils.deskBooking.list.invalidate(); toast.success("Record created"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.deskBooking.update.useMutation({
    onSuccess: () => { utils.deskBooking.list.invalidate(); toast.success("Updated"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.deskBooking.delete.useMutation({
    onSuccess: () => { utils.deskBooking.list.invalidate(); toast.success("Deleted"); },
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
      desk_number: row.desk_number ?? "",
      floor_level: row.floor_level ?? "",
      building: row.building ?? "",
      booked_by_name: row.booked_by_name ?? "",
      booked_by_email: row.booked_by_email ?? "",
      booking_date: row.booking_date ?? "",
      start_time: row.start_time ?? "",
      end_time: row.end_time ?? "",
      notes: row.notes ?? ""
      });
    setShowForm(true);
  }
  function handleSubmit() {
    const payload = {
      desk_number: form.desk_number as any,
      floor_level: form.floor_level as any,
      building: form.building as any,
      booked_by_name: form.booked_by_name as any,
      booked_by_email: form.booked_by_email as any,
      booking_date: form.booking_date as any,
      start_time: form.start_time as any,
      end_time: form.end_time as any,
      notes: form.notes as any
      };
    if (editRow) {
            updateMut.mutate({ booking_id: editRow.booking_id, ...payload } as any);
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
            <Label>Desk Number</Label>
            <Input type="text" value={form.desk_number ?? ""} onChange={e => setForm((f: any) => ({...f, desk_number: e.target.value}))} />
          </div>
          <div>
            <Label>Floor Level</Label>
            <Input type="text" value={form.floor_level ?? ""} onChange={e => setForm((f: any) => ({...f, floor_level: e.target.value}))} />
          </div>
          <div>
            <Label>Building</Label>
            <Input type="text" value={form.building ?? ""} onChange={e => setForm((f: any) => ({...f, building: e.target.value}))} />
          </div>
          <div>
            <Label>Booked By Name</Label>
            <Input type="text" value={form.booked_by_name ?? ""} onChange={e => setForm((f: any) => ({...f, booked_by_name: e.target.value}))} />
          </div>
          <div>
            <Label>Booked By Email</Label>
            <Input type="email" value={form.booked_by_email ?? ""} onChange={e => setForm((f: any) => ({...f, booked_by_email: e.target.value}))} />
          </div>
          <div>
            <Label>Booking Date</Label>
            <Input type="date" value={form.booking_date ?? ""} onChange={e => setForm((f: any) => ({...f, booking_date: e.target.value}))} />
          </div>
          <div>
            <Label>Start Time</Label>
            <Input type="time" value={form.start_time ?? ""} onChange={e => setForm((f: any) => ({...f, start_time: e.target.value}))} />
          </div>
          <div>
            <Label>End Time</Label>
            <Input type="time" value={form.end_time ?? ""} onChange={e => setForm((f: any) => ({...f, end_time: e.target.value}))} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={e => setForm((f: any) => ({...f, notes: e.target.value}))} rows={3} />
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
          screenId="VFLDESKBOOK0001P001"
          title="Desk Booking"
          subtitle="Manage desk booking records"
          screenType="deskBooking"
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
                <TableHead className="text-xs">Booking Ref</TableHead>
                <TableHead className="text-xs">Desk Number</TableHead>
                <TableHead className="text-xs">Floor Level</TableHead>
                <TableHead className="text-xs">Booked By Name</TableHead>
                <TableHead className="text-xs">Booking Date</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && aiRows.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">No records found. <button className="text-primary underline" onClick={openAdd}>Add the first one.</button></TableCell></TableRow>
                  ) : (
                    filtered.map((row: any, i: number) => (
                      <TableRow key={row.booking_id ?? i} className="hover:bg-muted/20">
                    <TableCell>{row.booking_ref ?? "—"}</TableCell>
                    <TableCell>{row.desk_number ?? "—"}</TableCell>
                    <TableCell>{row.floor_level ?? "—"}</TableCell>
                    <TableCell>{row.booked_by_name ?? "—"}</TableCell>
                    <TableCell>{row.booking_date ?? "—"}</TableCell>
                    <TableCell>{row.status ?? "—"}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(row)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteMut.mutate({ booking_id: row.booking_id })}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
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
