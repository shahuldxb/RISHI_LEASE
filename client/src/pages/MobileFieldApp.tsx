import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Smartphone, Wifi, WifiOff, CheckCircle, Clock, Camera, MapPin, RefreshCw, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";

const INSPECTIONS = [
  { id: "INS-2026-001", property: "Vodafone HQ — Floor 12", type: "Annual Condition Survey", inspector: "Ahmed Al Rashid", date: "2026-04-20", status: "COMPLETED", photos: 24, findings: 3, synced: true },
  { id: "INS-2026-002", property: "Vodafone Doha", type: "Lease Commencement Inspection", inspector: "Sarah Johnson", date: "2026-04-18", status: "COMPLETED", photos: 18, findings: 1, synced: true },
  { id: "INS-2026-003", property: "Vodafone Sharjah", type: "Dilapidations Assessment", inspector: "Mohammed Al Zaabi", date: "2026-04-22", status: "IN_PROGRESS", photos: 8, findings: 2, synced: false },
  { id: "INS-2026-004", property: "Vodafone HQ — Floor 13", type: "Quarterly Walk-Through", inspector: "Fatima Al Hashimi", date: "2026-04-23", status: "PENDING", photos: 0, findings: 0, synced: false },
];

const DEVICES = [
  { id: 1, name: "iPad Pro — Ahmed Al Rashid", model: "iPad Pro 12.9\" (M2)", last_sync: "2026-04-22 16:30", pending_uploads: 0, app_version: "3.2.1", status: "ONLINE" },
  { id: 2, name: "Samsung Tab — Sarah Johnson", model: "Samsung Galaxy Tab S9", last_sync: "2026-04-21 09:15", pending_uploads: 0, app_version: "3.2.1", status: "ONLINE" },
  { id: 3, name: "iPad Air — Mohammed Al Zaabi", model: "iPad Air 5th Gen", last_sync: "2026-04-22 11:00", pending_uploads: 12, app_version: "3.2.0", status: "OFFLINE" },
  { id: 4, name: "iPhone — Fatima Al Hashimi", model: "iPhone 15 Pro", last_sync: "2026-04-20 14:00", pending_uploads: 0, app_version: "3.2.1", status: "ONLINE" },
];

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-500/20 text-green-400 border-green-500/30",
  IN_PROGRESS: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  PENDING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  ONLINE: "bg-green-500/20 text-green-400 border-green-500/30",
  OFFLINE: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function MobileFieldApp() {
  const utils = trpc.useUtils();
  const actionMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Action completed successfully"),
    onError: (e: any) => toast.error(e.message),
  });
  const [tab, setTab] = useState("inspections");
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);

  const completed = INSPECTIONS.filter(i => i.status === "COMPLETED").length;
  const pending = INSPECTIONS.filter(i => i.status === "PENDING").length;
  const pendingUploads = DEVICES.reduce((s, d) => s + d.pending_uploads, 0);
  const offlineDevices = DEVICES.filter(d => d.status === "OFFLINE").length;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
  screenId="VFLMOBILE0001P001"
  title="Mobile Field App"
  subtitle="Mobile inspection and offline sync"

          screenType="mobile_field_app"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Completed Inspections", value: completed, icon: CheckCircle, color: "text-green-400" },
            { label: "Pending Inspections", value: pending, icon: Clock, color: "text-blue-400" },
            { label: "Pending Uploads", value: pendingUploads, icon: Upload, color: "text-yellow-400" },
            { label: "Offline Devices", value: offlineDevices, icon: WifiOff, color: "text-red-400" },
          ].map((kpi) => (
            <Card key={kpi.label} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <kpi.icon className={`w-8 h-8 ${kpi.color}`} />
                  <div>
                    <p className="text-2xl font-bold">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {pendingUploads > 0 && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <WifiOff className="w-5 h-5 text-yellow-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-yellow-400">Offline Data Pending Sync</p>
              <p className="text-xs text-muted-foreground">{pendingUploads} photos and form submissions are queued for upload when device comes online.</p>
            </div>
            <Button size="sm" variant="outline" className="text-xs border-yellow-500/30 text-yellow-400" onClick={() => toast.info("Attempting manual sync...")}>
              Force Sync
            </Button>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-muted/30">
            <TabsTrigger value="inspections">Inspections</TabsTrigger>
            <TabsTrigger value="devices">Device Management</TabsTrigger>
            <TabsTrigger value="checklist">Inspection Checklist</TabsTrigger>
          </TabsList>

          <TabsContent value="inspections" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Inspection ID</TableHead>
                      <TableHead className="text-xs">Property</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Inspector</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs text-center">Photos</TableHead>
                      <TableHead className="text-xs text-center">Findings</TableHead>
                      <TableHead className="text-xs">Sync</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {INSPECTIONS.map((ins) => (
                      <TableRow key={ins.id}>
                        <TableCell className="font-mono text-xs">{ins.id}</TableCell>
                        <TableCell className="text-sm">{ins.property}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{ins.type}</TableCell>
                        <TableCell className="text-sm">{ins.inspector}</TableCell>
                        <TableCell className="text-sm">{ins.date}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Camera className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm">{ins.photos}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {ins.findings > 0
                            ? <Badge className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30">{ins.findings}</Badge>
                            : <span className="text-xs text-green-400">None</span>}
                        </TableCell>
                        <TableCell>
                          {ins.synced
                            ? <div className="flex items-center gap-1 text-green-400 text-xs"><Wifi className="w-3 h-3" /> Synced</div>
                            : <div className="flex items-center gap-1 text-yellow-400 text-xs"><WifiOff className="w-3 h-3" /> Pending</div>}
                        </TableCell>
                        <TableCell><Badge className={`text-xs border ${STATUS_COLORS[ins.status]}`}>{ins.status.replace("_", " ")}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Device Name</TableHead>
                      <TableHead className="text-xs">Model</TableHead>
                      <TableHead className="text-xs">App Version</TableHead>
                      <TableHead className="text-xs">Last Sync</TableHead>
                      <TableHead className="text-xs text-center">Pending Uploads</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DEVICES.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-sm font-medium">{d.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.model}</TableCell>
                        <TableCell className="font-mono text-xs">{d.app_version}</TableCell>
                        <TableCell className="text-xs">{d.last_sync}</TableCell>
                        <TableCell className="text-center">
                          {d.pending_uploads > 0
                            ? <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">{d.pending_uploads}</Badge>
                            : <span className="text-xs text-green-400">0</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {d.status === "ONLINE" ? <Wifi className="w-3.5 h-3.5 text-green-400" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
                            <Badge className={`text-xs border ${STATUS_COLORS[d.status]}`}>{d.status}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => toast.info(`Syncing ${d.name}...`)}>
                            <RefreshCw className="w-3 h-3 mr-1" /> Sync
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="checklist" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm">Standard Inspection Checklist Template</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { section: "Exterior & Common Areas", items: ["Building facade condition", "Entrance / lobby condition", "Lift and escalator operation", "Car park condition", "Signage and wayfinding"] },
                    { section: "Leased Space — Interior", items: ["Floor condition (carpet/tiles)", "Ceiling tiles and lighting", "Wall finishes", "Windows and blinds", "HVAC vents and operation"] },
                    { section: "MEP Services", items: ["Electrical panel access", "Plumbing fixtures", "Fire suppression heads", "Emergency exits and signage", "Data / comms cabling"] },
                    { section: "Compliance & Safety", items: ["Fire extinguisher tags", "Emergency lighting test", "First aid kit present", "Hazardous materials check", "Accessibility compliance"] },
                  ].map((section, si) => (
                    <div key={si}>
                      <p className="text-sm font-semibold mb-2 text-[#e60000]">{section.section}</p>
                      <div className="space-y-1.5 pl-3">
                        {section.items.map((item, ii) => (
                          <div key={ii} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="mt-4 text-xs" onClick={() => toast.info("Checklist template download — coming soon")}>
                  <Download className="w-3.5 h-3.5 mr-2" /> Download Checklist PDF
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
