import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, Search, AlertTriangle } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toast } from "sonner";

export default function OpsDocuments() {
  const [search, setSearch] = useState("");
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  // Documents are stored per lease — use lease register as data source
  const { data } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 200, search: search || undefined });

  const utils = trpc.useUtils();
  const submitMut = trpc.lease.submitForApproval.useMutation({
    onSuccess: () => { utils.lease.getLeaseRegister.invalidate(); toast.success("Submitted"); },
    onError: (e) => toast.error(e.message),
  });
  const rows: any[] = (data as any)?.rows ?? [];
  const today = new Date();

  const expiringSoon = rows.filter((r: any) => {
    if (!r.expiry_date) return false;
    const exp = new Date(r.expiry_date);
    return exp > today && (exp.getTime() - today.getTime()) < 30 * 86400000;
  });

  const statusBadge = (expiryDate: string | null) => {
    if (!expiryDate) return <Badge variant="outline">No Expiry</Badge>;
    const exp = new Date(expiryDate);
    const daysLeft = Math.floor((exp.getTime() - today.getTime()) / 86400000);
    if (daysLeft < 0) return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Expired</Badge>;
    if (daysLeft < 30) return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{daysLeft}d left</Badge>;
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Valid</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
  screenId="VFLOPSDOC0001P001"
  title="Document Expiry Tracker"
  subtitle="Lease document expiry and renewal tracking"

          screenType="ops_documents"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />

        {expiringSoon.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-400"><strong>{expiringSoon.length} document(s)</strong> expiring within 30 days require renewal action.</p>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Documents", value: rows.length, color: "text-foreground" },
            { label: "Expiring < 30 Days", value: expiringSoon.length, color: "text-amber-400" },
            { label: "Expired", value: rows.filter((r: any) => r.expiry_date && new Date(r.expiry_date) <= today).length, color: "text-red-400" },
            { label: "No Expiry", value: rows.filter((r: any) => !r.expiry_date).length, color: "text-muted-foreground" },
          ].map(k => (
            <div key={k.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Document Name</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Contract</TableHead>
                <TableHead className="text-xs">Issue Date</TableHead>
                <TableHead className="text-xs">Expiry Date</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d: any, i: number) => (
                <TableRow key={d.document_id ?? i} className="text-sm hover:bg-muted/30">
                  <TableCell className="font-medium">{d.document_name ?? d.file_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.document_type}</TableCell>
                  <TableCell className="font-mono text-xs">{d.contract_ref ?? "—"}</TableCell>
                  <TableCell className="text-xs">{d.issue_date ? new Date(d.issue_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-xs">{d.expiry_date ? new Date(d.expiry_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{statusBadge(d.expiry_date)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No documents found</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
