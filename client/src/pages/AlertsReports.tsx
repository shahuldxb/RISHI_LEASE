import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Bell, FileText, Plus, Pencil, Trash2, Send, CheckCircle2, AlertTriangle, Clock, Info, Zap, X, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

// ── Alert event type catalogue ────────────────────────────────────────────────
type AlertTemplate = {
  event_type: string;
  label: string;
  category: string;
  days_before: number;
  description: string;
  ifrs_ref: string;
  severity: "critical" | "warning" | "info";
};

const ALERT_TEMPLATES: AlertTemplate[] = [
  // Critical Date Alerts
  { event_type: "LEASE_EXPIRY",           label: "Lease Expiry",                   category: "Critical Dates", days_before: 90,  description: "Lease reaches its contractual end date. Action required: renew, terminate, or let expire.", ifrs_ref: "IFRS 16 §19",  severity: "critical" },
  { event_type: "LEASE_EXPIRY_30",        label: "Lease Expiry (30-day final)",     category: "Critical Dates", days_before: 30,  description: "Final 30-day warning before lease expiry. Escalate if no renewal decision made.", ifrs_ref: "IFRS 16 §19",  severity: "critical" },
  { event_type: "RENEWAL_OPTION",         label: "Renewal Option Deadline",         category: "Critical Dates", days_before: 90,  description: "Deadline to exercise renewal option. Reassess 'reasonably certain' under IFRS 16 §19.", ifrs_ref: "IFRS 16 §19",  severity: "critical" },
  { event_type: "BREAK_CLAUSE_NOTICE",    label: "Break Clause Notice Deadline",    category: "Critical Dates", days_before: 60,  description: "Notice must be served by this date to exercise break clause. Missed deadline = lease continues.", ifrs_ref: "IFRS 16 §19",  severity: "critical" },
  { event_type: "PURCHASE_OPTION",        label: "Purchase Option Deadline",        category: "Critical Dates", days_before: 90,  description: "Deadline to exercise purchase option. If exercised, reclassify as finance lease.", ifrs_ref: "IFRS 16 §26",  severity: "warning"  },
  { event_type: "TERMINATION_OPTION",     label: "Termination Option Deadline",     category: "Critical Dates", days_before: 60,  description: "Deadline to exercise early termination option. Triggers JE-5 derecognition.", ifrs_ref: "IFRS 16 §46",  severity: "warning"  },
  // Financial Alerts
  { event_type: "PAYMENT_DUE",            label: "Lease Payment Due",               category: "Financial",      days_before: 7,   description: "Scheduled lease payment due. Trigger payment run or AP invoice approval.", ifrs_ref: "IFRS 16 §26",  severity: "warning"  },
  { event_type: "PAYMENT_OVERDUE",        label: "Payment Overdue",                 category: "Financial",      days_before: 0,   description: "Lease payment past due date. May trigger default clause in lease agreement.", ifrs_ref: "IFRS 16 §26",  severity: "critical" },
  { event_type: "RENT_REVIEW",            label: "Rent Review Date",                category: "Financial",      days_before: 60,  description: "Contractual rent review date. New rent may trigger lease remeasurement under IFRS 16 §45.", ifrs_ref: "IFRS 16 §45",  severity: "warning"  },
  { event_type: "CPI_ESCALATION",         label: "CPI Escalation Due",              category: "Financial",      days_before: 30,  description: "Annual CPI-linked rent escalation. Recalculate lease payments and remeasure liability.", ifrs_ref: "IFRS 16 §42",  severity: "info"     },
  { event_type: "SECURITY_DEPOSIT_EXPIRY",label: "Security Deposit Expiry",         category: "Financial",      days_before: 30,  description: "Security deposit held against lease expires or is due for return.", ifrs_ref: "IAS 32",       severity: "info"     },
  { event_type: "DEPOSIT_REFUND_DUE",     label: "Deposit Refund Due",              category: "Financial",      days_before: 14,  description: "Lessor must refund security deposit within this period post-termination.", ifrs_ref: "IAS 32",       severity: "warning"  },
  // Accounting & Compliance Alerts
  { event_type: "REMEASUREMENT_TRIGGER",  label: "Remeasurement Required",          category: "Accounting",     days_before: 0,   description: "Significant event (rate change, term change) requires IFRS 16 §45 remeasurement.", ifrs_ref: "IFRS 16 §45",  severity: "critical" },
  { event_type: "PERIOD_END_CLOSE",       label: "Period-End Close Reminder",       category: "Accounting",     days_before: 3,   description: "Monthly period-end close. Ensure amortisation journals are posted for all active leases.", ifrs_ref: "IFRS 16 §47",  severity: "warning"  },
  { event_type: "YEAR_END_DISCLOSURE",    label: "Year-End Disclosure Deadline",    category: "Accounting",     days_before: 30,  description: "Annual IFRS 16 disclosure pack must be prepared for financial statements.", ifrs_ref: "IFRS 16 §52",  severity: "critical" },
  { event_type: "IBR_REVIEW",             label: "IBR Annual Review",               category: "Accounting",     days_before: 30,  description: "Incremental Borrowing Rate should be reviewed annually for new leases and remeasurements.", ifrs_ref: "IFRS 16 §26",  severity: "info"     },
  { event_type: "IFRS16_TRANSITION",      label: "IFRS 16 Transition Milestone",    category: "Accounting",     days_before: 60,  description: "Transition date milestone for new leases adopting IFRS 16 for the first time.", ifrs_ref: "IFRS 16 §C1",  severity: "info"     },
  // Insurance & Document Alerts
  { event_type: "INSURANCE_EXPIRY",       label: "Insurance Policy Expiry",         category: "Documents",      days_before: 45,  description: "Lease-linked insurance policy expires. Renewal required to maintain coverage.", ifrs_ref: "Lease Contract", severity: "warning"  },
  { event_type: "DOCUMENT_EXPIRY",        label: "Lease Document Expiry",           category: "Documents",      days_before: 30,  description: "Lease-related document (permit, licence, certificate) expires.", ifrs_ref: "Lease Contract", severity: "warning"  },
  { event_type: "HANDOVER_DUE",           label: "Asset Handover Due",              category: "Documents",      days_before: 14,  description: "Asset handover to lessor due on lease termination. Arrange inspection and key return.", ifrs_ref: "IFRS 16 §46",  severity: "warning"  },
  { event_type: "DILAPIDATION_REVIEW",    label: "Dilapidation Provision Review",   category: "Documents",      days_before: 60,  description: "Review restoration/dilapidation provision. Adjust ROU asset cost if estimate changes.", ifrs_ref: "IFRS 16 §24(d)", severity: "info"   },
  // Operational Alerts
  { event_type: "MAINTENANCE_DUE",        label: "Scheduled Maintenance Due",       category: "Operational",    days_before: 14,  description: "Lessee maintenance obligation due. Failure may breach lease covenants.", ifrs_ref: "Lease Contract", severity: "info"     },
  { event_type: "LEASE_COMMENCEMENT",     label: "Lease Commencement",              category: "Operational",    days_before: 7,   description: "New lease commences. Ensure ROU asset and lease liability are recognised on this date.", ifrs_ref: "IFRS 16 §22",  severity: "warning"  },
  { event_type: "SUB_LEASE_REVIEW",       label: "Sub-Lease Review",                category: "Operational",    days_before: 30,  description: "Sub-lease terms due for review. Assess lessor classification under IFRS 16 §61.", ifrs_ref: "IFRS 16 §61",  severity: "info"     },
];

const CATEGORY_COLORS: Record<string, string> = {
  "Critical Dates": "bg-red-500/15 text-red-400 border-red-500/30",
  "Financial":      "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Accounting":     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Documents":      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Operational":    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};
const SEVERITY_ICON: Record<string, React.ReactNode> = {
  critical: <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
  warning:  <Clock className="w-3.5 h-3.5 text-amber-400" />,
  info:     <Info className="w-3.5 h-3.5 text-blue-400" />,
};
const SEVERITY_CLS: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  warning:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  info:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const FREQUENCIES = ["DAILY","WEEKLY","MONTHLY"];
const FORMATS = ["PDF","EXCEL","CSV"];
const CATEGORIES = ["All", ...Array.from(new Set(ALERT_TEMPLATES.map(t => t.category)))];

type AlertForm = {
  config_id?: number;
  event_type: string;
  days_before: number;
  recipient_roles: string;
  email_template: string;
  is_active: boolean;
};
const INIT_ALERT: AlertForm = { event_type: "LEASE_EXPIRY", days_before: 90, recipient_roles: "", email_template: "", is_active: true };

type ReportForm = {
  schedule_id?: number;
  report_name: string;
  report_type: string;
  cron_expression: string;
  recipients: string;
  output_format: "PDF" | "EXCEL" | "CSV";
  is_active: boolean;
  parameters: string;
};
const INIT_REPORT: ReportForm = { report_name: "", report_type: "LEASE_SUMMARY", cron_expression: "0 8 1 * *", recipients: "", output_format: "PDF", is_active: true, parameters: "" };

type PanelMode = "none" | "alert" | "report";

export default function AlertsReports() {
  const [activeTab, setActiveTab] = useState("alerts");
  const [filterCat, setFilterCat] = useState("All");
  const [searchQ, setSearchQ] = useState("");

  // Inline panel state
  const [panelMode, setPanelMode] = useState<PanelMode>("none");
  const [alertForm, setAlertForm] = useState<AlertForm>({ ...INIT_ALERT });
  const [reportForm, setReportForm] = useState<ReportForm>({ ...INIT_REPORT });

  const { data: alerts = [], refetch: refetchAlerts } = trpc.emailAlerts.list.useQuery();
  const { data: reports = [], refetch: refetchReports } = trpc.scheduledReports.list.useQuery();

  const saveAlert = trpc.emailAlerts.upsert.useMutation({
    onSuccess: () => { refetchAlerts(); setPanelMode("none"); toast.success("Alert rule saved"); },
    onError: (e) => toast.error(e.message),
  });
  const sendTest = trpc.emailAlerts.sendTest.useMutation({
    onSuccess: (d) => { toast.success(d.message); },
    onError: (e) => toast.error(e.message),
  });
  const saveReport = trpc.scheduledReports.upsert.useMutation({
    onSuccess: () => { refetchReports(); setPanelMode("none"); toast.success("Scheduled report saved"); },
    onError: (e) => toast.error(e.message),
  });

  function openNewAlert(template?: AlertTemplate) {
    setAlertForm(template
      ? { event_type: template.event_type, days_before: template.days_before, recipient_roles: "", email_template: `[${template.label}] — ${template.description}`, is_active: true }
      : { ...INIT_ALERT });
    setPanelMode("alert");
  }
  function openEditAlert(a: Record<string, unknown>) {
    setAlertForm({
      config_id: Number(a.config_id),
      event_type: String(a.event_type ?? "LEASE_EXPIRY"),
      days_before: Number(a.days_before ?? 30),
      recipient_roles: String(a.recipient_roles ?? ""),
      email_template: String(a.email_template ?? ""),
      is_active: Boolean(a.is_active ?? true),
    });
    setPanelMode("alert");
  }
  function openNewReport() { setReportForm({ ...INIT_REPORT }); setPanelMode("report"); }
  function openEditReport(r: Record<string, unknown>) {
    setReportForm({
      schedule_id: Number(r.schedule_id),
      report_name: String(r.report_name ?? ""),
      report_type: String(r.report_type ?? "LEASE_SUMMARY"),
      cron_expression: String(r.cron_expression ?? "0 8 1 * *"),
      recipients: String(r.recipients ?? ""),
      output_format: (r.output_format as "PDF" | "EXCEL" | "CSV") ?? "PDF",
      is_active: Boolean(r.is_active ?? true),
      parameters: String(r.parameters ?? ""),
    });
    setPanelMode("report");
  }
  function deleteAlert(id: number) {
    saveAlert.mutate({ config_id: id, event_type: "LEASE_EXPIRY", days_before: 0, recipient_roles: "", is_active: false });
    toast.success("Alert rule deleted");
  }
  function deleteReport(id: number) {
    saveReport.mutate({ schedule_id: id, report_name: "", report_type: "LEASE_SUMMARY", cron_expression: "0 8 1 * *", recipients: "", output_format: "PDF", is_active: false });
    toast.success("Scheduled report deleted");
  }

  const filteredTemplates = ALERT_TEMPLATES.filter(t => {
    const matchCat = filterCat === "All" || t.category === filterCat;
    const matchQ = !searchQ || t.label.toLowerCase().includes(searchQ.toLowerCase()) || t.description.toLowerCase().includes(searchQ.toLowerCase());
    return matchCat && matchQ;
  });

  const configuredTypes = new Set((alerts as Record<string, unknown>[]).map(a => String(a.event_type)));

  // ── Inline form panels ────────────────────────────────────────────────────
  if (panelMode === "alert") {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setPanelMode("none")}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              {alertForm.config_id ? "Edit Alert Rule" : "New Alert Rule"}
            </h2>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Event Type *</Label>
              <Select value={alertForm.event_type} onValueChange={v => {
                const tmpl = ALERT_TEMPLATES.find(t => t.event_type === v);
                setAlertForm(f => ({
                  ...f,
                  event_type: v,
                  days_before: tmpl?.days_before ?? f.days_before,
                  email_template: tmpl ? `[${tmpl.label}] ${tmpl.description}` : f.email_template,
                }));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {ALERT_TEMPLATES.map(t => (
                    <SelectItem key={t.event_type} value={t.event_type}>
                      <span className="flex items-center gap-2">
                        {SEVERITY_ICON[t.severity]}
                        <span>{t.label}</span>
                        <span className="text-[10px] text-muted-foreground">({t.category})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(() => {
                const tmpl = ALERT_TEMPLATES.find(t => t.event_type === alertForm.event_type);
                return tmpl ? (
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    {tmpl.ifrs_ref} — {tmpl.description}
                  </p>
                ) : null;
              })()}
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Days Before Event *</Label>
              <Input type="number" min={0} value={alertForm.days_before}
                onChange={e => setAlertForm(f => ({ ...f, days_before: Number(e.target.value) }))} />
              <p className="text-xs text-muted-foreground mt-1">Set 0 to trigger on the event date itself.</p>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Recipient Roles / Emails</Label>
              <Input value={alertForm.recipient_roles}
                onChange={e => setAlertForm(f => ({ ...f, recipient_roles: e.target.value }))}
                placeholder="e.g. lease_manager, finance_team, user@company.com" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Email Template / Message</Label>
              <Textarea value={alertForm.email_template}
                onChange={e => setAlertForm(f => ({ ...f, email_template: e.target.value }))}
                placeholder="Email subject or body template…"
                className="min-h-[100px]" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={alertForm.is_active} onCheckedChange={v => setAlertForm(f => ({ ...f, is_active: v }))} />
              <Label className="text-sm">{alertForm.is_active ? "Active" : "Inactive"}</Label>
            </div>
            <div className="flex gap-3 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setPanelMode("none")}>Cancel</Button>
              <Button
                disabled={!alertForm.event_type || saveAlert.isPending}
                onClick={() => saveAlert.mutate(alertForm as Parameters<typeof saveAlert.mutate>[0])}
              >
                {saveAlert.isPending ? "Saving…" : "Save Alert Rule"}
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (panelMode === "report") {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setPanelMode("none")}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {reportForm.schedule_id ? "Edit Scheduled Report" : "New Scheduled Report"}
            </h2>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Report Name *</Label>
              <Input value={reportForm.report_name} onChange={e => setReportForm(f => ({ ...f, report_name: e.target.value }))} placeholder="e.g. Monthly IFRS 16 Disclosure Pack" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Report Type</Label>
                <Select value={reportForm.report_type} onValueChange={v => setReportForm(f => ({ ...f, report_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["LEASE_SUMMARY","AMORTISATION","DISCLOSURE","CASH_FLOW","MATURITY","AUDIT_LOG","PORTFOLIO_HEALTH"].map(t => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Output Format</Label>
                <Select value={reportForm.output_format} onValueChange={v => setReportForm(f => ({ ...f, output_format: v as "PDF" | "EXCEL" | "CSV" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMATS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Cron Schedule</Label>
              <Input value={reportForm.cron_expression} onChange={e => setReportForm(f => ({ ...f, cron_expression: e.target.value }))} className="font-mono" placeholder="0 8 1 * * (1st of month at 8am)" />
              <p className="text-xs text-muted-foreground mt-1">Standard 5-field cron expression. Examples: <code className="font-mono">0 8 1 * *</code> (monthly), <code className="font-mono">0 8 * * 1</code> (weekly Monday).</p>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Recipients</Label>
              <Input value={reportForm.recipients} onChange={e => setReportForm(f => ({ ...f, recipients: e.target.value }))} placeholder="email1@company.com, email2@company.com" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={reportForm.is_active} onCheckedChange={v => setReportForm(f => ({ ...f, is_active: v }))} />
              <Label className="text-sm">{reportForm.is_active ? "Active" : "Inactive"}</Label>
            </div>
            <div className="flex gap-3 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setPanelMode("none")}>Cancel</Button>
              <Button
                disabled={!reportForm.report_name || saveReport.isPending}
                onClick={() => saveReport.mutate(reportForm as Parameters<typeof saveReport.mutate>[0])}
              >
                {saveReport.isPending ? "Saving…" : "Save Report"}
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
          screenId="VFLALERTS0001P001"
          title="Alerts & Scheduled Reports"
          subtitle="Configure lease lifecycle alert rules and automated report delivery"
          screenType="alerts_reports"
          onAIData={() => {}}
          actions={
            <Button size="sm" onClick={() => activeTab === "alerts" ? openNewAlert() : openNewReport()}>
              <Plus className="w-4 h-4 mr-1.5" />
              {activeTab === "alerts" ? "New Alert Rule" : "New Report"}
            </Button>
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="alerts"><Bell className="w-4 h-4 mr-1.5" />Alert Rules</TabsTrigger>
            <TabsTrigger value="templates"><Zap className="w-4 h-4 mr-1.5" />Rule Library</TabsTrigger>
            <TabsTrigger value="reports"><FileText className="w-4 h-4 mr-1.5" />Scheduled Reports</TabsTrigger>
          </TabsList>

          {/* ── CONFIGURED ALERT RULES ── */}
          <TabsContent value="alerts" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Days Before</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Recipients / Roles</TableHead>
                      <TableHead>Email Template</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(alerts as Record<string, unknown>[]).map((a, i) => {
                      const tmpl = ALERT_TEMPLATES.find(t => t.event_type === String(a.event_type));
                      return (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {tmpl && SEVERITY_ICON[tmpl.severity]}
                              <span className="font-medium text-sm">{tmpl?.label ?? String(a.event_type)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {tmpl && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${CATEGORY_COLORS[tmpl.category] ?? ""}`}>
                                {tmpl.category}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{String(a.days_before)} days</TableCell>
                          <TableCell>
                            {tmpl && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${SEVERITY_CLS[tmpl.severity]}`}>
                                {tmpl.severity.toUpperCase()}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate" title={String(a.recipient_roles ?? "")}>
                            {String(a.recipient_roles ?? "—")}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={String(a.email_template ?? "")}>
                            {String(a.email_template ?? "—")}
                          </TableCell>
                          <TableCell>
                            <Badge className={Boolean(a.is_active) ? "bg-emerald-600 text-white" : "bg-zinc-600 text-white"}>
                              {Boolean(a.is_active) ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button size="sm" variant="ghost" className="h-7 px-2" title="Send test alert"
                                onClick={() => sendTest.mutate({ config_id: Number(a.config_id) })}>
                                <Send className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEditAlert(a)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-300"
                                onClick={() => deleteAlert(Number(a.config_id))}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(alerts as Record<string, unknown>[]).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <Bell className="w-8 h-8 opacity-30" />
                            <p className="text-sm">No alert rules configured.</p>
                            <p className="text-xs">Use the <strong>Rule Library</strong> tab to add pre-built rules, or click <strong>New Alert Rule</strong> to create a custom one.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── RULE LIBRARY ── */}
          <TabsContent value="templates" className="mt-4 space-y-4">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search rules…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                className="max-w-xs h-8 text-sm"
              />
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setFilterCat(c)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterCat === c
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredTemplates.map(t => {
                const isConfigured = configuredTypes.has(t.event_type);
                return (
                  <div key={t.event_type} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {SEVERITY_ICON[t.severity]}
                        <span className="font-semibold text-sm">{t.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isConfigured && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Added
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${SEVERITY_CLS[t.severity]}`}>
                          {t.severity.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${CATEGORY_COLORS[t.category]}`}>{t.category}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{t.days_before === 0 ? "On event" : `${t.days_before} days before`}</span>
                      <span className="text-[10px] text-muted-foreground">{t.ifrs_ref}</span>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed flex-1">{t.description}</p>

                    <Button
                      size="sm"
                      variant={isConfigured ? "outline" : "default"}
                      className="w-full h-7 text-xs"
                      onClick={() => openNewAlert(t)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {isConfigured ? "Add Another" : "Add to Alert Rules"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ── SCHEDULED REPORTS ── */}
          <TabsContent value="reports" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Report Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Schedule (Cron)</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reports as Record<string, unknown>[]).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{String(r.report_name)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{String(r.report_type)}</Badge></TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{String(r.cron_expression ?? "—")}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{String(r.output_format ?? r.format ?? "—")}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{String(r.recipients ?? "—")}</TableCell>
                        <TableCell>
                          <Badge className={Boolean(r.is_active) ? "bg-emerald-600 text-white" : "bg-zinc-600 text-white"}>
                            {Boolean(r.is_active) ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEditReport(r)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-300"
                              onClick={() => deleteReport(Number(r.schedule_id))}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(reports as Record<string, unknown>[]).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <FileText className="w-8 h-8 opacity-30" />
                            <p className="text-sm">No scheduled reports configured.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
