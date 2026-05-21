/**
 * VodaLease Enterprise — Error Log
 * Screen ID: VFLCMPERR0001P001
 * Columns: error_no, timestamp_utc, severity, module, screen_id, user_context, message, status
 */
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Clock, RefreshCw, User, Monitor } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toast } from "sonner";

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "bg-red-500/20 text-red-400 border-red-500/30",
  High:     "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Medium:   "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Low:      "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Info:     "bg-muted text-muted-foreground border-border",
  Error:    "bg-red-500/20 text-red-400 border-red-500/30",
  Warning:  "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ComplianceErrors() {
  const [aiRows, setAiRows] = useState<Record<string, unknown>[]>([]);
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  const { data, isLoading, refetch } = trpc.compliance.getErrorLog.useQuery({
    severity: severity !== "all" ? severity : undefined,
    status: status !== "all" ? status : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const rows: any[] = (data as any)?.rows ?? [];
  const totalCount = (data as any)?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <ScreenHeader
          screenId="VFLCMPERR0001P001"
          screenType="error_log"
          onAIData={(r) => setAiRows(r)}
          title="Error Log"
          subtitle="System error log — screen ID, user context, and time are key"
        />

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={severity} onValueChange={v => { setSeverity(v); setPage(1); }}>
                <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="InProgress">In Progress</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                  <SelectItem value="Ignored">Ignored</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-9 ml-auto" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Error No</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Time</span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Severity</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Module</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <span className="flex items-center gap-1"><Monitor className="h-3 w-3" /> Screen ID</span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /> User</span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Message</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No error log entries found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row: any, idx: number) => (
                      <tr key={row.error_id ?? idx} className="border-b last:border-0 hover:bg-muted/20">
                        {/* Error No */}
                        <td className="px-4 py-3 font-mono text-xs text-primary whitespace-nowrap">
                          {row.error_no ?? `ERR-${row.error_id}`}
                        </td>
                        {/* Timestamp — prominent */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <div className="font-semibold text-foreground">
                            {row.timestamp_utc ? new Date(row.timestamp_utc).toLocaleString() : "—"}
                          </div>
                          <div className="text-muted-foreground text-[10px] flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {timeAgo(row.timestamp_utc)}
                          </div>
                        </td>
                        {/* Severity */}
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${SEVERITY_COLORS[row.severity] ?? SEVERITY_COLORS.Info}`}>
                            {row.severity ?? "—"}
                          </Badge>
                        </td>
                        {/* Module */}
                        <td className="px-4 py-3 text-xs">
                          <span className="badge-draft">{row.module ?? "—"}</span>
                        </td>
                        {/* Screen ID — prominent */}
                        <td className="px-4 py-3 font-mono text-xs text-amber-400 whitespace-nowrap">
                          {row.screen_id ?? "—"}
                        </td>
                        {/* User context */}
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate" title={row.user_context ?? ""}>
                          {row.user_context ?? "—"}
                        </td>
                        {/* Message */}
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px]">
                          <div className="truncate" title={row.full_message ?? row.message ?? ""}>
                            {row.message ?? "—"}
                          </div>
                          {row.error_code && (
                            <div className="text-[10px] font-mono text-muted-foreground/60">{row.error_code}</div>
                          )}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={
                            row.resolution_status === "Resolved" ? "badge-active" :
                            row.resolution_status === "Open" ? "badge-expired" :
                            "badge-draft"
                          }>
                            {row.resolution_status ?? "Open"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages} ({totalCount} errors)</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
