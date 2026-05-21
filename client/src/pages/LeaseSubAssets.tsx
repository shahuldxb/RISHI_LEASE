/**
 * LeaseSubAssets.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Lease Sub-Asset Lifecycle Management
 *
 * Workflow:
 *  1. Select a lease from the dropdown
 *  2. See all attached sub-asset sets as cards with status badges
 *  3. Expand a card → full furniture/appliance inventory table (item, serial, date)
 *  4. Attach a new set → transaction dialog: pick set, fill serial numbers + date per item
 *  5. Change status (Return / Cancel / Replace / Back-In) → logs transaction
 *
 * Every attach and status change is recorded in sub_asset_transactions.
 */

import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronUp, Plus, RefreshCw, ArrowLeft, Package, Hash, Calendar, User, FileText, Layers, CheckCircle2, XCircle, RotateCcw, ArrowRightLeft, Boxes, AlertCircle, Loader2, FileDown, ShieldAlert, X } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";

// ─── Types ────────────────────────────────────────────────────────────────────

type SubAssetStatus = "Active" | "Cancelled" | "Returned" | "BackIn" | "Replaced";

interface ItemWithSerial {
  code: string;
  name: string;
  category: string;
  subCategory?: string;
  brand?: string;
  model?: string;
  spec?: string;
  qty: number;
  serialNumbers: string[];   // length === qty
  attachDate: string;        // ISO date
  warrantyExpiry?: string;   // optional ISO date
  priceQAR?: number;
}

interface AttachedSet {
  leaseSubAssetId: number;
  assetId: number;
  assetCode: string;
  setName: string;
  status: SubAssetStatus;
  statusDate: string;
  reason?: string;
  replacedByCode?: string;
  tagsWithSerials?: string;  // JSON ItemWithSerial[]
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

// Status config
const STATUS_CFG: Record<SubAssetStatus, { label: string; color: string; icon: React.ReactNode }> = {
  Active:    { label: "Active",    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
  Cancelled: { label: "Cancelled", color: "bg-red-500/20 text-red-400 border-red-500/30",           icon: <XCircle className="h-3 w-3" /> },
  Returned:  { label: "Returned",  color: "bg-amber-500/20 text-amber-400 border-amber-500/30",     icon: <RotateCcw className="h-3 w-3" /> },
  BackIn:    { label: "Back In",   color: "bg-sky-500/20 text-sky-400 border-sky-500/30",           icon: <RefreshCw className="h-3 w-3" /> },
  Replaced:  { label: "Replaced",  color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: <ArrowRightLeft className="h-3 w-3" /> },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseItems(tagsWithSerials?: string): ItemWithSerial[] {
  if (!tagsWithSerials) return [];
  try { return JSON.parse(tagsWithSerials) as ItemWithSerial[]; } catch { return []; }
}

function parseSetTags(tags?: string): Array<{ code: string; name: string; category: string; subCategory?: string; brand?: string; model?: string; spec?: string; qty: number; priceQAR?: number }> {
  if (!tags) return [];
  try { return JSON.parse(tags); } catch { return []; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeaseSubAssets() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // ── Lessee selector ─────────────────────────────────────────────────────────
  const { data: lessees = [], isLoading: loadingLessees } = trpc.lessor.getLesseeList.useQuery();
  const [selectedLessorId, setSelectedLessorId] = useState<number | null>(null);
  const selectedLessee = (lessees as any[]).find((l: any) => l.lessorId === selectedLessorId) ?? null;

  // Auto-fetch the lease linked to the selected lessee
  const { data: lesseeLeaseData, isLoading: loadingLesseeLease } = trpc.lessor.getLeaseByLessee.useQuery(
    { lessorId: selectedLessorId! },
    { enabled: selectedLessorId !== null }
  );

  // ── Lease selector ──────────────────────────────────────────────────────────
  const { data: leases = [], isLoading: loadingLeases } = trpc.asset.getLeaseList.useQuery();
  const [selectedLeaseId, setSelectedLeaseId] = useState<string>("");
  const selectedLease = (leases as any[]).find((l: any) => String(l.leaseId) === selectedLeaseId);

  // When lessee's lease is found, auto-select it in the Lease dropdown
  useEffect(() => {
    if (selectedLessorId !== null && lesseeLeaseData && !loadingLesseeLease) {
      const foundId = String(lesseeLeaseData.contractId);
      if (foundId && foundId !== selectedLeaseId) {
        setSelectedLeaseId(foundId);
      }
    }
  }, [lesseeLeaseData, loadingLesseeLease, selectedLessorId]);

  // ── Attached sets for selected lease ────────────────────────────────────────
  const { data: rawSets = [], isLoading: loadingSets, refetch: refetchSets } =
    trpc.asset.getLeaseSubAssets.useQuery(
      { leaseId: selectedLeaseId },
      { enabled: !!selectedLeaseId }
    );

  const attachedSets: AttachedSet[] = useMemo(() =>
    rawSets.map((r: any) => ({
      leaseSubAssetId: r.lease_sub_asset_id,
      assetId:         r.asset_id,
      assetCode:       r.asset_code,
      setName:         r.set_name,
      status:          r.status as SubAssetStatus,
      statusDate:      r.status_date ?? "",
      reason:          r.reason ?? "",
      replacedByCode:  r.replaced_by_code ?? "",
      tagsWithSerials: r.tags_with_serials ?? "",
      createdBy:       r.created_by ?? "",
      createdAt:       r.created_at ?? "",
      updatedBy:       r.updated_by ?? "",
      updatedAt:       r.updated_at ?? "",
      owner:           r.owner ?? "",
    })), [rawSets]);

  // ── Available sets from Sub-Asset Registry ───────────────────────────────────
  const { data: registrySets = [] } = trpc.asset.getSubAssetGroups.useQuery();

  // ── Expanded cards ───────────────────────────────────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  function toggleExpand(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Attach dialog state ──────────────────────────────────────────────────────
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachSetId, setAttachSetId] = useState<string>("");
  const [attachItems, setAttachItems] = useState<ItemWithSerial[]>([]);
  const [attachStep, setAttachStep] = useState<"select" | "serials">("select");

  const attachMutation = trpc.asset.attachSubAssetToLease.useMutation({
    onSuccess: (res) => {
      if (res.message === "Already attached") {
        toast.warning("This set is already active on this lease.");
        return;
      }
      toast.success("Sub-asset set attached successfully with transaction log.");
      utils.asset.getLeaseSubAssets.invalidate();
      setAttachOpen(false);
      resetAttachDialog();
    },
    onError: (e) => toast.error(`Attach failed: ${e.message}`),
  });

  function resetAttachDialog() {
    setAttachSetId("");
    setAttachItems([]);
    setAttachStep("select");
  }

  // When user picks a set in the attach dialog, build the item rows with empty serials
  function onPickSet(setId: string) {
    setAttachSetId(setId);
    const reg = (registrySets as any[]).find(s => String(s.assetId) === setId);
    if (!reg) return;
    const lines = parseSetTags(reg.tags ?? "[]");
    const today = new Date().toISOString().slice(0, 10);
    setAttachItems(lines.map(l => ({
      code:        l.code,
      name:        l.name,
      category:    l.category,
      subCategory: l.subCategory,
      brand:       l.brand,
      model:       l.model,
      spec:        l.spec,
      qty:         l.qty,
      serialNumbers: Array.from({ length: l.qty }, () => ""),
      attachDate:  today,
      priceQAR:    l.priceQAR,
    })));
    setAttachStep("serials");
  }

  function updateSerial(itemCode: string, idx: number, val: string) {
    setAttachItems(prev => prev.map(it =>
      it.code === itemCode
        ? { ...it, serialNumbers: it.serialNumbers.map((s, i) => i === idx ? val : s) }
        : it
    ));
  }

  function updateAttachDate(itemCode: string, val: string) {
    setAttachItems(prev => prev.map(it =>
      it.code === itemCode ? { ...it, attachDate: val } : it
    ));
  }

  function updateWarrantyExpiry(itemCode: string, val: string) {
    setAttachItems(prev => prev.map(it =>
      it.code === itemCode ? { ...it, warrantyExpiry: val } : it
    ));
  }

  function exportInventoryPDF() {
    if (!selectedLease || attachedSets.length === 0) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const leaseRef = selectedLease.leaseRef ?? selectedLeaseId;
    const property = selectedLease.assetName ?? "";
    const today = new Date().toLocaleDateString("en-GB");

    // Header
    doc.setFontSize(16);
    doc.setTextColor(30, 30, 30);
    doc.text("VodaLease — Lease Sub-Asset Inventory", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Lease Ref: ${leaseRef}   Property: ${property}   Exported: ${today}`, 14, 26);
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 29, 283, 29);

    let yOffset = 34;
    for (const set of attachedSets) {
      const items = parseItems(set.tagsWithSerials);
      if (items.length === 0) continue;

      // Set header
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text(`Set: ${set.assetCode} — ${set.setName}  [${set.status}]`, 14, yOffset);
      yOffset += 4;

      const rows: string[][] = [];
      let rowNum = 1;
      for (const item of items) {
        for (let i = 0; i < item.qty; i++) {
          rows.push([
            String(rowNum++),
            item.name,
            item.category + (item.subCategory ? ` / ${item.subCategory}` : ""),
            (item.brand ?? "") + (item.model ? ` ${item.model}` : ""),
            item.spec ?? "",
            item.serialNumbers[i] ?? "",
            item.attachDate ?? "",
            (item as any).warrantyExpiry ?? "",
          ]);
        }
      }

      autoTable(doc, {
        startY: yOffset,
        head: [["#", "Item", "Category", "Brand/Model", "Spec", "Serial Number", "Attach Date", "Warranty Expiry"]],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [230, 0, 0], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        margin: { left: 14, right: 14 },
        theme: "striped",
        didDrawPage: (data) => { yOffset = data.cursor?.y ?? yOffset; },
      });
      yOffset = (doc as any).lastAutoTable.finalY + 8;
      if (yOffset > 185) { doc.addPage(); yOffset = 14; }
    }

    doc.save(`inventory-${leaseRef}-${today.replace(/\//g, "-")}.pdf`);
    toast.success("PDF exported successfully.");
  }

  function validateAttach(): string | null {
    for (const it of attachItems) {
      if (!it.attachDate) return `Missing attachment date for "${it.name}"`;
      for (let i = 0; i < it.qty; i++) {
        if (!it.serialNumbers[i]?.trim())
          return `Missing serial number #${i + 1} for "${it.name}"`;
      }
    }
    return null;
  }

  async function doAttach() {
    const err = validateAttach();
    if (err) { toast.error(err); return; }
    const reg = (registrySets as any[]).find(s => String(s.assetId) === attachSetId);
    if (!reg || !selectedLeaseId) return;
    const tagsWithSerials = JSON.stringify(attachItems);
    await attachMutation.mutateAsync({
      leaseId:        selectedLeaseId,
      assetId:        reg.assetId,
      assetCode:      reg.assetCode,
      setName:        reg.setName,
      tagsWithSerials,
      lesseeName:     (selectedLease as any)?.lesseeName || undefined,
    });
  }

  // ── Status change dialog ─────────────────────────────────────────────────────
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<AttachedSet | null>(null);
  const [newStatus, setNewStatus] = useState<SubAssetStatus>("Returned");
  const [statusDate, setStatusDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusReason, setStatusReason] = useState("");
  const [replacementSetId, setReplacementSetId] = useState("");

  const statusMutation = trpc.asset.updateSubAssetStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated and transaction logged.");
      utils.asset.getLeaseSubAssets.invalidate();
      setStatusOpen(false);
      setStatusTarget(null);
      setStatusReason("");
      setReplacementSetId("");
    },
    onError: (e) => toast.error(`Update failed: ${e.message}`),
  });

  function openStatusDialog(set: AttachedSet, status: SubAssetStatus) {
    setStatusTarget(set);
    setNewStatus(status);
    setStatusDate(new Date().toISOString().slice(0, 10));
    setStatusReason("");
    setReplacementSetId("");
    setStatusOpen(true);
  }

  async function doStatusChange() {
    if (!statusTarget) return;
    if (!statusDate) { toast.error("Status date is required"); return; }
    const replacedReg = newStatus === "Replaced"
      ? (registrySets as any[]).find(s => String(s.assetId) === replacementSetId)
      : null;
    // Owner logic: Returned → lessor takes ownership; BackIn → lessee takes back
    const lessorName = (selectedLease as any)?.lessorName || undefined;
    const lesseeName = (selectedLease as any)?.lesseeName || undefined;
    await statusMutation.mutateAsync({
      leaseSubAssetId:   statusTarget.leaseSubAssetId,
      newStatus:         newStatus,
      statusDate,
      reason:            statusReason,
      replacedByAssetId: replacedReg?.assetId,
      replacedByCode:    replacedReg?.assetCode,
      lessorName:        newStatus === "Returned" ? lessorName : undefined,
      lesseeName:        newStatus === "BackIn"   ? lesseeName : undefined,
    });
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full bg-[#0a0c14] text-white">

        <ScreenHeader
          screenId="VFLSE-SUBASSET-001" screenType="lease_sub_assets"
          title="Lease Sub-Asset Registry"
          subtitle="Attach, track and manage furniture & appliance sets per lease"
          icon={<Boxes className="h-6 w-6 text-amber-400" />}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => setLocation("/leases")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {selectedLeaseId && (
                <>
                  <Button size="sm" className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5"
                    onClick={() => { resetAttachDialog(); setAttachOpen(true); }}>
                    <Plus className="h-4 w-4" /> Attach Set
                  </Button>
                  {attachedSets.length > 0 && (
                    <Button size="sm" variant="outline"
                      className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                      onClick={exportInventoryPDF}>
                      <FileDown className="h-3.5 w-3.5" /> Export PDF
                    </Button>
                  )}
                </>
              )}
              <Button size="sm" variant="outline" className="gap-1.5"
                onClick={() => refetchSets()}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
          }
        />

        {/* ── Lessee + Lease Selector ──────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-white/5 bg-[#0d0f1a] shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Lessee selector — primary entry point */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <User className="h-3 w-3" /> Select Lessee
                <span className="text-amber-400 ml-1">(choose first)</span>
              </Label>
              {loadingLessees ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading lessees…
                </div>
              ) : (
                <Select
                  value={selectedLessorId !== null ? String(selectedLessorId) : ""}
                  onValueChange={(v) => {
                    setSelectedLessorId(v ? Number(v) : null);
                    setSelectedLeaseId("");
                  }}
                >
                  <SelectTrigger className="bg-[#13161f] border-amber-500/30 text-white h-10">
                    <SelectValue placeholder="— Choose a lessee / staff member —" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#13161f] border-white/10 text-white">
                    {(lessees as any[]).map((l: any) => (
                      <SelectItem key={l.lessorId} value={String(l.lessorId)}>
                        <span className="font-medium text-white mr-2">{l.lesseeName}</span>
                        {l.staffNumber && <span className="text-gray-400 text-xs mr-1">#{l.staffNumber}</span>}
                        {l.lesseeType && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            l.lesseeType === "Staff" ? "bg-blue-500/20 text-blue-300" :
                            l.lesseeType === "Client" ? "bg-emerald-500/20 text-emerald-300" :
                            "bg-gray-500/20 text-gray-300"
                          }`}>{l.lesseeType}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedLessee && (
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                  {selectedLessee.position && <span><span className="text-white">Position:</span> {selectedLessee.position}</span>}
                  {selectedLessee.department && <span><span className="text-white">Dept:</span> {selectedLessee.department}</span>}
                  {selectedLessee.grade && <span><span className="text-white">Grade:</span> {selectedLessee.grade}</span>}
                  {selectedLessee.placeOfWork && <span><span className="text-white">Location:</span> {selectedLessee.placeOfWork}</span>}
                </div>
              )}
              {selectedLessorId && !loadingLesseeLease && !lesseeLeaseData && (
                <p className="text-xs text-red-400 mt-1.5">No lease found for this lessee — select manually below.</p>
              )}
            </div>

            {/* Lease selector — auto-populated from lessee, or manual override */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                Lease Number
                {loadingLesseeLease && <Loader2 className="h-3 w-3 animate-spin ml-1 text-amber-400" />}
              </Label>
              {loadingLeases ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading leases…
                </div>
              ) : (
                <Select value={selectedLeaseId} onValueChange={setSelectedLeaseId}>
                  <SelectTrigger className="bg-[#13161f] border-white/10 text-white h-10">
                    <SelectValue placeholder="— Auto-filled from lessee or choose manually —" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#13161f] border-white/10 text-white">
                    {(leases as any[]).map((l: any) => (
                      <SelectItem key={l.leaseId} value={l.leaseId}>
                        <span className="font-mono text-amber-400 mr-2">{l.leaseRef ?? l.leaseId}</span>
                        <span className="text-gray-300">{l.assetName ?? ""}</span>
                        {l.lessorName && <span className="text-gray-500 ml-2">· {l.lessorName}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedLease && (
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                  <span><span className="text-white">Ref:</span> {selectedLease.leaseRef ?? selectedLeaseId}</span>
                  {selectedLease.assetName && <span><span className="text-white">Property:</span> {selectedLease.assetName}</span>}
                  {selectedLease.lessorName && <span><span className="text-white">Lessor:</span> {selectedLease.lessorName}</span>}
                  <span className="ml-auto font-semibold text-amber-400">{attachedSets.length} set(s) attached</span>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {!selectedLeaseId ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Boxes className="h-12 w-12 text-white/10 mb-3" />
              <p className="text-muted-foreground text-sm">Select a lease above to view its sub-asset sets</p>
            </div>
          ) : loadingSets ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : attachedSets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Package className="h-12 w-12 text-white/10 mb-3" />
              <p className="text-muted-foreground text-sm">No sub-asset sets attached to this lease yet.</p>
              <Button size="sm" className="mt-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5"
                onClick={() => { resetAttachDialog(); setAttachOpen(true); }}>
                <Plus className="h-4 w-4" /> Attach First Set
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {attachedSets.map(set => {
                const cfg = STATUS_CFG[set.status] ?? STATUS_CFG.Active;
                const items = parseItems(set.tagsWithSerials);
                const totalItems = items.reduce((s, i) => s + i.qty, 0);
                const isExpanded = expandedIds.has(set.leaseSubAssetId);

                return (
                  <Card key={set.leaseSubAssetId}
                    className="bg-[#0f1117] border-white/5 overflow-hidden">

                    {/* Card header */}
                    <CardHeader className="px-5 py-4 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                            <Layers className="h-5 w-5 text-amber-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                                {set.assetCode}
                              </span>
                              <Badge className={`text-[10px] px-2 py-0.5 border ${cfg.color} flex items-center gap-1`}>
                                {cfg.icon} {cfg.label}
                              </Badge>
                            </div>
                            <CardTitle className="text-sm font-semibold text-white mt-1">{set.setName}</CardTitle>
                            <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Package className="h-3 w-3" /> {items.length} item type{items.length !== 1 ? "s" : ""} · {totalItems} unit{totalItems !== 1 ? "s" : ""}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> {set.statusDate || set.createdAt?.slice(0, 10)}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" /> {set.createdBy}
                              </span>
                              {set.reason && (
                                <span className="flex items-center gap-1 text-amber-400/80">
                                  <FileText className="h-3 w-3" /> {set.reason}
                                </span>
                              )}
                              {set.replacedByCode && (
                                <span className="flex items-center gap-1 text-purple-400/80">
                                  <ArrowRightLeft className="h-3 w-3" /> Replaced by {set.replacedByCode}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          {set.status === "Active" && (
                            <>
                              <Button size="sm" variant="outline"
                                className="h-7 text-[11px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                onClick={() => openStatusDialog(set, "Returned")}>
                                <RotateCcw className="h-3 w-3 mr-1" /> Return
                              </Button>
                              <Button size="sm" variant="outline"
                                className="h-7 text-[11px] border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                                onClick={() => openStatusDialog(set, "Replaced")}>
                                <ArrowRightLeft className="h-3 w-3 mr-1" /> Replace
                              </Button>
                              <Button size="sm" variant="outline"
                                className="h-7 text-[11px] border-red-500/30 text-red-400 hover:bg-red-500/10"
                                onClick={() => openStatusDialog(set, "Cancelled")}>
                                <XCircle className="h-3 w-3 mr-1" /> Cancel
                              </Button>
                            </>
                          )}
                          {(set.status === "Returned" || set.status === "Cancelled") && (
                            <Button size="sm" variant="outline"
                              className="h-7 text-[11px] border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                              onClick={() => openStatusDialog(set, "BackIn")}>
                              <RefreshCw className="h-3 w-3 mr-1" /> Back In
                            </Button>
                          )}
                          {set.status === "BackIn" && (
                            <Button size="sm" variant="outline"
                              className="h-7 text-[11px] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                              onClick={() => openStatusDialog(set, "Active")}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Re-Activate
                            </Button>
                          )}
                          <Button size="sm" variant="ghost"
                            className="h-7 text-[11px] text-gray-400 hover:text-white"
                            onClick={() => toggleExpand(set.leaseSubAssetId)}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            {isExpanded ? "Hide" : "Inventory"}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    {/* Expandable inventory table */}
                    {isExpanded && (
                      <CardContent className="px-5 pb-5 pt-0">
                        <div className="border border-white/5 rounded-lg overflow-hidden">
                          <div className="px-4 py-2 bg-[#13161f] border-b border-white/5 flex items-center gap-2">
                            <Hash className="h-3.5 w-3.5 text-amber-400" />
                            <span className="text-xs font-semibold text-white">Furniture &amp; Appliance Inventory</span>
                            <span className="ml-auto text-[10px] text-muted-foreground">{totalItems} unit{totalItems !== 1 ? "s" : ""} total</span>
                          </div>
                          {items.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                              <AlertCircle className="h-5 w-5 mx-auto mb-2 text-white/20" />
                              No item detail recorded for this set.
                            </div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow className="border-white/5 hover:bg-transparent">
                                  <TableHead className="text-[11px] text-muted-foreground py-2 pl-4">#</TableHead>
                                  <TableHead className="text-[11px] text-muted-foreground py-2">Item</TableHead>
                                  <TableHead className="text-[11px] text-muted-foreground py-2">Category</TableHead>
                                  <TableHead className="text-[11px] text-muted-foreground py-2">Brand / Model</TableHead>
                                  <TableHead className="text-[11px] text-muted-foreground py-2">Spec</TableHead>
                                  <TableHead className="text-[11px] text-muted-foreground py-2">Qty</TableHead>
                                  <TableHead className="text-[11px] text-muted-foreground py-2">Serial Numbers</TableHead>
                                  <TableHead className="text-[11px] text-muted-foreground py-2">Attach Date</TableHead>
                                  <TableHead className="text-[11px] text-muted-foreground py-2 pr-4">Warranty Expiry</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {items.map((item, idx) => (
                                  <TableRow key={item.code} className="border-white/5 hover:bg-white/2">
                                    <TableCell className="py-2 pl-4 text-[11px] font-mono text-muted-foreground">{idx + 1}</TableCell>
                                    <TableCell className="py-2">
                                      <div className="text-[12px] font-medium text-white">{item.name}</div>
                                      <div className="text-[10px] font-mono text-muted-foreground">{item.code}</div>
                                    </TableCell>
                                    <TableCell className="py-2 text-[11px] text-gray-300">
                                      {item.category}
                                      {item.subCategory && <span className="text-muted-foreground"> / {item.subCategory}</span>}
                                    </TableCell>
                                    <TableCell className="py-2 text-[11px] text-gray-300">
                                      {item.brand && <span>{item.brand}</span>}
                                      {item.model && <span className="text-muted-foreground"> {item.model}</span>}
                                    </TableCell>
                                    <TableCell className="py-2 text-[11px] text-gray-400">{item.spec ?? "—"}</TableCell>
                                    <TableCell className="py-2 text-[11px] text-center font-mono text-amber-400">{item.qty}</TableCell>
                                    <TableCell className="py-2">
                                      <div className="flex flex-col gap-0.5">
                                        {item.serialNumbers.map((sn, i) => (
                                          <span key={i} className="text-[11px] font-mono text-sky-300 bg-sky-500/10 px-1.5 py-0.5 rounded">
                                            #{i + 1}: {sn || <span className="text-red-400">missing</span>}
                                          </span>
                                        ))}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-2 text-[11px] text-gray-300 font-mono">{item.attachDate || "—"}</TableCell>
                                    <TableCell className="py-2 pr-4">
                                      {(item as any).warrantyExpiry ? (
                                        (() => {
                                          const exp = new Date((item as any).warrantyExpiry);
                                          const daysLeft = Math.ceil((exp.getTime() - Date.now()) / 86400000);
                                          return (
                                            <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                                              daysLeft < 0 ? "bg-red-500/20 text-red-400" :
                                              daysLeft <= 30 ? "bg-amber-500/20 text-amber-400" :
                                              "text-gray-300"
                                            }`}>
                                              {(item as any).warrantyExpiry}
                                              {daysLeft < 0 && " ⚠ Expired"}
                                              {daysLeft >= 0 && daysLeft <= 30 && ` (${daysLeft}d)`}
                                            </span>
                                          );
                                        })()
                                      ) : <span className="text-muted-foreground text-[11px]">—</span>}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Attach Set Dialog ──────────────────────────────────────────────────── */}
      {attachOpen && (
        <div className="rounded-xl border border-amber-500/40 bg-[#0f1117] text-white p-5 space-y-4">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Plus className="h-5 w-5 text-amber-400" />
              Attach Sub-Asset Set to Lease
            </h4>
            {selectedLease && (
              <p className="text-xs text-muted-foreground mt-1">
                Lease: <span className="text-amber-400 font-mono">{selectedLease.leaseRef ?? selectedLeaseId}</span>
                {selectedLease.assetName && ` · ${selectedLease.assetName}`}
              </p>
            )}
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400" onClick={() => { setAttachOpen(false); resetAttachDialog(); }}><X className="w-3.5 h-3.5" /></Button>
          </div>

          {/* Step 1: Pick a set */}
          {attachStep === "select" && (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Sub-Asset Set</Label>
                <Select value={attachSetId} onValueChange={onPickSet}>
                  <SelectTrigger className="bg-[#13161f] border-white/10 text-white">
                    <SelectValue placeholder="— Select a set from the registry —" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#13161f] border-white/10 text-white">
                    {(registrySets as any[]).map((s: any) => {
                      const lines = parseSetTags(s.tags ?? "[]");
                      const totalQty = lines.reduce((a: number, l: any) => a + l.qty, 0);
                      return (
                        <SelectItem key={s.assetId} value={String(s.assetId)}>
                          <span className="font-mono text-amber-400 mr-2">{s.assetCode}</span>
                          <span className="text-white">{s.setName}</span>
                          <span className="text-muted-foreground ml-2">({totalQty} units)</span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                After selecting a set, you will be asked to enter the serial number and attachment date for each item.
              </p>
            </div>
          )}

          {/* Step 2: Fill serial numbers + dates */}
          {attachStep === "serials" && (
            <div className="space-y-5 py-2">
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Enter the serial number and attachment date for every unit. All fields are mandatory.
              </div>

              {attachItems.map(item => (
                <div key={item.code} className="border border-white/5 rounded-lg overflow-hidden">
                  {/* Item header */}
                  <div className="px-4 py-2.5 bg-[#13161f] border-b border-white/5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-semibold text-white">{item.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground ml-2">{item.code}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="text-amber-400 font-mono">×{item.qty}</span>
                        {item.category && <span>{item.category}</span>}
                        {item.brand && <span>· {item.brand}</span>}
                        {item.spec && <span>· {item.spec}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Attachment date + Warranty expiry */}
                  <div className="px-4 pt-3 pb-2 flex gap-4 flex-wrap">
                    <div>
                      <Label className="text-[11px] text-muted-foreground mb-1 block">
                        Attachment Date <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        type="date"
                        value={item.attachDate}
                        onChange={e => updateAttachDate(item.code, e.target.value)}
                        className="h-8 text-xs bg-[#13161f] border-white/10 text-white w-44"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground mb-1 block">
                        Warranty Expiry <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        type="date"
                        value={item.warrantyExpiry ?? ""}
                        onChange={e => updateWarrantyExpiry(item.code, e.target.value)}
                        className="h-8 text-xs bg-[#13161f] border-white/10 text-white w-44"
                      />
                    </div>
                  </div>

                  {/* Serial numbers */}
                  <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                    {Array.from({ length: item.qty }).map((_, idx) => (
                      <div key={idx}>
                        <Label className="text-[11px] text-muted-foreground mb-1 block">
                          Serial #{idx + 1} <span className="text-red-400">*</span>
                        </Label>
                        <Input
                          value={item.serialNumbers[idx] ?? ""}
                          onChange={e => updateSerial(item.code, idx, e.target.value)}
                          placeholder={`e.g. SN-${item.code}-${String(idx + 1).padStart(3, "0")}`}
                          className="h-8 text-xs font-mono bg-[#13161f] border-white/10 text-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="border-white/10 text-gray-300"
              onClick={() => {
                if (attachStep === "serials") { setAttachStep("select"); setAttachSetId(""); }
                else { setAttachOpen(false); resetAttachDialog(); }
              }}>
              {attachStep === "serials" ? "← Back" : "Cancel"}
            </Button>
            {attachStep === "serials" && (
              <Button
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5"
                onClick={doAttach}
                disabled={attachMutation.isPending}>
                {attachMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : <><CheckCircle2 className="h-4 w-4" /> Attach &amp; Log Transaction</>}
              </Button>
            )}
          </div>
        </div>
      )}

      {statusOpen && statusTarget && (
        <div className="rounded-xl border border-white/10 bg-[#0f1117] text-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              {STATUS_CFG[newStatus]?.icon}
              Change Status to {STATUS_CFG[newStatus]?.label}
            </h4>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400" onClick={() => setStatusOpen(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Set: <span className="text-amber-400">{statusTarget.assetCode}</span> · {statusTarget.setName}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Status Date <span className="text-red-400">*</span>
              </Label>
              <Input type="date" value={statusDate}
                onChange={e => setStatusDate(e.target.value)}
                className="h-9 text-sm bg-[#13161f] border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Reason / Notes</Label>
              <Input value={statusReason}
                onChange={e => setStatusReason(e.target.value)}
                placeholder="Optional reason for this status change…"
                className="bg-[#13161f] border-white/10 text-white text-sm h-9" />
            </div>
            {newStatus === "Replaced" && (
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Replacement Set <span className="text-red-400">*</span>
                </Label>
                <Select value={replacementSetId} onValueChange={setReplacementSetId}>
                  <SelectTrigger className="bg-[#13161f] border-white/10 text-white">
                    <SelectValue placeholder="— Select replacement set —" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#13161f] border-white/10 text-white">
                    {(registrySets as any[])
                      .filter((s: any) => s.assetId !== statusTarget?.assetId)
                      .map((s: any) => (
                        <SelectItem key={s.assetId} value={String(s.assetId)}>
                          <span className="font-mono text-amber-400 mr-2">{s.assetCode}</span>
                          {s.setName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="border-white/10 text-gray-300"
              onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button
              className={`font-semibold gap-1.5 ${
                newStatus === "Cancelled" ? "bg-red-600 hover:bg-red-500 text-white" :
                newStatus === "Returned"  ? "bg-amber-500 hover:bg-amber-400 text-black" :
                newStatus === "Replaced"  ? "bg-purple-600 hover:bg-purple-500 text-white" :
                newStatus === "BackIn"    ? "bg-sky-600 hover:bg-sky-500 text-white" :
                                            "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
              onClick={doStatusChange}
              disabled={statusMutation.isPending}>
              {statusMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : <><CheckCircle2 className="h-4 w-4" /> Confirm &amp; Log</>}
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
