import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, AlertTriangle, Clock, DollarSign, FileText } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

type AlertType = "SLA_BREACH" | "INSURANCE_EXPIRY" | "LEASE_EXPIRY" | "PAYMENT_OVERDUE" | "CHEQUE_STALE" | "DOCUMENT_EXPIRY";

interface Alert {
  id: string;
  type: AlertType;
  title: string;
  description: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  timestamp: Date;
  read: boolean;
  entityRef?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "bg-red-500/20 text-red-400 border-red-500/30",
  High: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const TYPE_ICONS: Record<AlertType, React.ReactNode> = {
  SLA_BREACH: <Clock className="w-4 h-4 text-red-400" />,
  INSURANCE_EXPIRY: <FileText className="w-4 h-4 text-amber-400" />,
  LEASE_EXPIRY: <AlertTriangle className="w-4 h-4 text-orange-400" />,
  PAYMENT_OVERDUE: <DollarSign className="w-4 h-4 text-red-400" />,
  CHEQUE_STALE: <DollarSign className="w-4 h-4 text-amber-400" />,
  DOCUMENT_EXPIRY: <FileText className="w-4 h-4 text-amber-400" />,
};

// Derive alerts from live data
export default function AlertCentre() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const { data: kpis } = trpc.mis.getDashboardKPIs.useQuery();
  const { data: leases } = trpc.lease.getLeaseRegister.useQuery({ page: 1, pageSize: 200 });
  const { data: insurance } = trpc.lease.getInsurancePolicies.useQuery({});
  const { data: cheques } = trpc.cheque.getStaleCheques.useQuery();

  const utils = trpc.useUtils();
  const submitMut = trpc.lease.submitForApproval.useMutation({
    onSuccess: () => { utils.lease.getLeaseRegister.invalidate(); toast.success("Submitted"); },
    onError: (e) => toast.error(e.message),
  });

  const leaseList: any[] = (leases as any)?.rows ?? [];
  const insuranceList: any[] = Array.isArray(insurance) ? insurance : [];
  const chequeList: any[] = Array.isArray(cheques) ? cheques : [];
  const today = new Date();

  // Build alerts from live data
  const alerts: Alert[] = [
    // Leases expiring < 90 days
    ...leaseList
      .filter((l: any) => {
        if (!l.expiry_date) return false;
        const exp = new Date(l.expiry_date);
        const days = Math.floor((exp.getTime() - today.getTime()) / 86400000);
        return days >= 0 && days <= 90;
      })
      .map((l: any) => {
        const days = Math.floor((new Date(l.expiry_date).getTime() - today.getTime()) / 86400000);
        return {
          id: `lease-expiry-${l.contract_id}`,
          type: "LEASE_EXPIRY" as AlertType,
          title: "Lease Expiring Soon",
          description: `${l.contract_ref} — ${l.asset_description} expires in ${days} days`,
          severity: days <= 30 ? "Critical" : days <= 60 ? "High" : "Medium" as any,
          timestamp: new Date(),
          read: readIds.has(`lease-expiry-${l.contract_id}`),
          entityRef: l.contract_ref,
        };
      }),
    // Insurance expiring < 30 days
    ...insuranceList
      .filter((p: any) => {
        if (!p.end_date) return false;
        const exp = new Date(p.end_date);
        const days = Math.floor((exp.getTime() - today.getTime()) / 86400000);
        return days >= 0 && days <= 30;
      })
      .map((p: any) => ({
        id: `ins-expiry-${p.policy_id}`,
        type: "INSURANCE_EXPIRY" as AlertType,
        title: "Insurance Policy Expiring",
        description: `Policy ${p.policy_number} from ${p.provider_name ?? p.provider} expires soon`,
        severity: "High" as any,
        timestamp: new Date(),
        read: readIds.has(`ins-expiry-${p.policy_id}`),
        entityRef: p.policy_number,
      })),
    // Stale cheques
    ...chequeList.slice(0, 5).map((c: any) => ({
      id: `cheque-stale-${c.cheque_id}`,
      type: "CHEQUE_STALE" as AlertType,
      title: "Stale Cheque",
      description: `Cheque ${c.cheque_number} issued to ${c.payee_name ?? "Lessor"} not presented after 90 days`,
      severity: "Medium" as any,
      timestamp: new Date(),
      read: readIds.has(`cheque-stale-${c.cheque_id}`),
      entityRef: c.cheque_number,
    })),
    // Overdue payments from KPIs
    ...((kpis as any)?.overdue_payments_count > 0 ? [{
      id: "payment-overdue",
      type: "PAYMENT_OVERDUE" as AlertType,
      title: "Overdue Payments",
      description: `${(kpis as any).overdue_payments_count} payment(s) are overdue totalling $${Number((kpis as any).overdue_amount ?? 0).toLocaleString()}`,
      severity: "Critical" as any,
      timestamp: new Date(),
      read: readIds.has("payment-overdue"),
    }] : []),
  ];

  const filtered = filter === "unread" ? alerts.filter(a => !a.read) : alerts;
  const unreadCount = alerts.filter(a => !a.read).length;

  const markAllRead = () => setReadIds(new Set<string>(alerts.map(a => a.id)));

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
  screenId="VFLALERT0001P001"
  title="Alert Centre"
  subtitle="Critical lease events and notification centre"

          screenType="alert_centre"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />

        <div className="grid grid-cols-4 gap-4">
          {["Critical","High","Medium","Low"].map(s => (
            <div key={s} className={`rounded-xl p-4 border ${SEVERITY_COLORS[s]}`}>
              <p className="text-xs opacity-70">{s}</p>
              <p className="text-2xl font-bold mt-1">{alerts.filter(a => a.severity === s).length}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.map(alert => (
            <div key={alert.id}
              className={`bg-card border rounded-xl p-4 flex items-start gap-4 transition-opacity ${alert.read ? "opacity-60" : ""} ${!alert.read ? "border-[#e60000]/30" : "border-border"}`}>
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                {TYPE_ICONS[alert.type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{alert.title}</span>
                  <Badge className={SEVERITY_COLORS[alert.severity]}>{alert.severity}</Badge>
                  {alert.entityRef && <span className="font-mono text-xs text-muted-foreground">{alert.entityRef}</span>}
                  {!alert.read && <span className="w-2 h-2 bg-[#e60000] rounded-full" />}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{alert.description}</p>
                <p className="text-xs text-muted-foreground mt-1">{alert.timestamp.toLocaleString()}</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs flex-shrink-0"
                onClick={() => { setReadIds(prev => { const s = new Set<string>(Array.from(prev)); s.add(alert.id); return s; }); toast.success("Marked as read"); }}>
                Dismiss
              </Button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">{filter === "unread" ? "No unread alerts" : "No alerts at this time"}</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
