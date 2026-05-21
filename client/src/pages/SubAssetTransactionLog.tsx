/**
 * VodaLease Enterprise — Sub-Asset Transaction Log
 * Screen ID: VFLSEASTTXN0001P001
 *
 * Workflow:
 *   1. Select a Lease Number → Sub-Asset Set dropdown populates
 *   2. Select a Sub-Asset Set → Detail card shows full info + items
 *   3. "Add Transaction" panel below with action buttons
 *   4. Transaction History table at the bottom
 */
import { useState, useMemo, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { lookupItem, MASTER_ITEMS_MAP } from "@/lib/masterItems";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ChevronDown, ChevronRight, RotateCcw, ShieldOff, Repeat2, Skull, Package, Calendar, User, Hash, Tag, FileText, AlertTriangle, CheckCircle2, XCircle, Clock, ArrowUpDown, Plus, Pencil, Save, X as XIcon, Link2, Trash2, Sparkles } from "lucide-react";

// ── Status badge colours ─────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  Active:    "bg-green-500/20 text-green-400 border-green-500/30",
  Cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
  Returned:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  BackIn:    "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  Replaced:  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  WriteOff:  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Condemned: "bg-rose-700/20 text-rose-400 border-rose-700/30",
};

const ACTION_BADGE: Record<string, string> = {
  INSERT:           "bg-green-500/20 text-green-400",
  UPDATE:           "bg-blue-500/20 text-blue-400",
  DELETE:           "bg-red-500/20 text-red-400",
  ATTACH:           "bg-emerald-500/20 text-emerald-400",
  STATUS_CHANGE:    "bg-amber-500/20 text-amber-400",
  OWNERSHIP_CHANGE: "bg-violet-500/20 text-violet-400",
  ITEM_ADD:         "bg-sky-500/20 text-sky-400",
  ITEM_EDIT:        "bg-indigo-500/20 text-indigo-400",
  ITEM_DELETE:      "bg-pink-500/20 text-pink-400",
};

// ── Action definitions ───────────────────────────────────────
const ACTIONS = [
  { id: "Returned",  label: "Returned",  icon: RotateCcw,    newStatus: "Returned",  color: "text-blue-400",   desc: "Asset returned to lessor" },
  { id: "BackIn",    label: "Back In",   icon: CheckCircle2, newStatus: "BackIn",    color: "text-cyan-400",   desc: "Asset back in service" },
  { id: "Replaced",  label: "Replaced",  icon: Repeat2,      newStatus: "Replaced",  color: "text-purple-400", desc: "Replace with another set" },
  { id: "WriteOff",  label: "Write Off", icon: ShieldOff,    newStatus: "WriteOff",  color: "text-orange-400", desc: "Asset written off" },
  { id: "Condemned", label: "Condemned", icon: Skull,        newStatus: "Condemned", color: "text-rose-400",   desc: "Asset condemned" },
  { id: "Cancelled", label: "Cancel",    icon: XCircle,      newStatus: "Cancelled", color: "text-red-400",    desc: "Cancel this assignment" },
] as const;

// ── Item diff viewer ─────────────────────────────────────────
function ItemDiffViewer({ before, after }: { before: string | null; after: string | null }) {
  const parse = (s: string | null): unknown => { try { return s ? JSON.parse(s) : null; } catch { return s; } };
  const b = parse(before);
  const a = parse(after);

  const renderItemTable = (items: unknown, label: string, colour: string) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    const enriched: any[] = (items as any[]).map((item: any) => {
      const master = MASTER_ITEMS_MAP.get(item.code as string);
      return { ...item, name: item.name ?? master?.name ?? "—", category: item.category ?? master?.category ?? "—" };
    });
    return (
      <div className="mb-3">
        <p className={`text-xs font-semibold mb-1 ${colour}`}>{label}</p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-left py-1 px-2 font-medium text-muted-foreground">Code</th>
              <th className="text-left py-1 px-2 font-medium text-muted-foreground">Name</th>
              <th className="text-left py-1 px-2 font-medium text-muted-foreground">Qty</th>
              <th className="text-left py-1 px-2 font-medium text-muted-foreground">Serial Numbers</th>
              <th className="text-left py-1 px-2 font-medium text-muted-foreground">Lease Date</th>
              <th className="text-left py-1 px-2 font-medium text-muted-foreground">Warranty Expiry</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map((item, i) => (
              <tr key={i} className="border-b border-border/40">
                <td className="py-1 px-2 font-mono text-[#e60000]">{String(item.code ?? "—")}</td>
                <td className="py-1 px-2">{String(item.name ?? item.category ?? "—")}</td>
                <td className="py-1 px-2 text-center">{String(item.qty ?? 1)}</td>
                <td className="py-1 px-2 font-mono">
                  {Array.isArray(item.serialNumbers)
                    ? (item.serialNumbers as string[]).filter(Boolean).join(", ") || <span className="text-muted-foreground italic">—</span>
                    : <span className="text-muted-foreground italic">—</span>}
                </td>
                <td className="py-1 px-2">{String(item.leaseDate ?? item.attachDate ?? "—")}</td>
                <td className="py-1 px-2">{String(item.warrantyExpiry ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (!b && Array.isArray(a)) return <div>{renderItemTable(a, "Items Attached", "text-green-400")}</div>;
  if (Array.isArray(b) && !a) return <div>{renderItemTable(b, "Items Removed", "text-red-400")}</div>;
  if (b && typeof b === "object" && !Array.isArray(b) && a && typeof a === "object" && !Array.isArray(a)) {
    const bObj = b as Record<string, unknown>;
    const aObj = a as Record<string, unknown>;
    const allKeys = Array.from(new Set([...Object.keys(bObj), ...Object.keys(aObj)]));
    const str = (v: unknown) => v === undefined || v === null ? "—" : String(v);
    return (
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-1 pr-3 text-muted-foreground font-medium w-32">Field</th>
            <th className="text-left py-1 pr-3 text-red-400 font-medium">Before</th>
            <th className="text-left py-1 text-green-400 font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map(k => {
            const bv = str(bObj[k]); const av = str(aObj[k]);
            const changed = bv !== av;
            return (
              <tr key={k} className={`border-b border-border/50 ${changed ? "bg-amber-500/5" : ""}`}>
                <td className="py-1 pr-3 font-mono text-muted-foreground">{k}</td>
                <td className={`py-1 pr-3 font-mono ${changed ? "text-red-400 line-through opacity-70" : "text-foreground"}`}>{bv}</td>
                <td className={`py-1 font-mono ${changed ? "text-green-400 font-semibold" : "text-foreground"}`}>{av}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
      {before && <div className="bg-red-500/10 border border-red-500/20 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap text-red-300">{before}</div>}
      {after  && <div className="bg-green-500/10 border border-green-500/20 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap text-green-300">{after}</div>}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────
export default function SubAssetTransactionLog() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Parse URL params for persistence
  const urlParams = new URLSearchParams(search);
  const [selectedLeaseId, setSelectedLeaseId] = useState<string>(urlParams.get("leaseId") ?? "none");
  // selectedAssetId = assetId from the Sub-Asset Groups master list
  const [selectedAssetId, setSelectedAssetId] = useState<string>(urlParams.get("assetId") ?? "none");

  // ── Filters ──────────────────────────────────────────────
  const [filterAction,   setFilterAction]   = useState<string>("all");
  const [filterUser,     setFilterUser]     = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo,   setFilterDateTo]   = useState<string>("");
  const [expandedRow,    setExpandedRow]    = useState<number | null>(null);

  // ── Action dialog ─────────────────────────────────────────
  const [actionDialog, setActionDialog] = useState<{
    open: boolean; actionId: string; label: string; newStatus: string;
  }>({ open: false, actionId: "", label: "", newStatus: "" });
  const [actionDate,       setActionDate]       = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [actionReason,     setActionReason]     = useState<string>("");
  const [actionNotes,      setActionNotes]      = useState<string>("");
  const [actionReplaceSet, setActionReplaceSet] = useState<string>("none");

  // ── Inline item editing ───────────────────────────────────
  const [editingItems, setEditingItems] = useState(false);
  const [editItems, setEditItems] = useState<any[]>([]);

  // ── Add Item dialog ───────────────────────────────────────
  const [addItemOpen, setAddItemOpen] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const [addItemForm, setAddItemForm] = useState({
    code:           "",
    name:           "",
    category:       "",
    subCategory:    "",
    brand:          "",
    model:          "",
    spec:           "",
    qty:            1,
    serialNumbers:  [""] as string[],
    attachDate:     today,
    warrantyExpiry: "",
    priceQAR:       "" as string | number,
  });

  // ── Attach dialog state ───────────────────────────────────
  const [attachOpen, setAttachOpen] = useState(false);
  const [correlationRows, setCorrelationRows] = useState<Array<{leaseRef: string; assetCode: string; setName: string; attachedAt: string}>>([]);
  const [attachStep, setAttachStep] = useState<"select" | "serials">("select");
  const [attachSetId, setAttachSetId] = useState<string>("none");
  const [attachItems, setAttachItems] = useState<any[]>([]);
  // ── Inline attach mode (editable grid instead of dialog) ──
  const [attachingInline, setAttachingInline] = useState(false);
  const [aiFillingInline, setAiFillingInline] = useState(false);

  // ── Queries ───────────────────────────────────────────────
  const { data: leaseList = [] } = trpc.asset.getLeaseList.useQuery();

  const leaseSelected = selectedLeaseId !== "none";
  const { data: leaseSets = [], refetch: refetchSets, isLoading: loadingSets } = trpc.asset.getLeaseSubAssets.useQuery(
    { leaseId: selectedLeaseId },
    { enabled: leaseSelected }
  );

  // Master list of all sub-asset groups (same as Asset Registry)
  const { data: allAvailSets = [] } = trpc.asset.getSubAssetGroups.useQuery();

  // Derive selected set record: prefer the leaseSets record (has leaseSubAssetId + status) over master list
  const selectedSetRecord = useMemo(() => {
    if (selectedAssetId === "none") return null;
    const fromLease = (leaseSets as any[]).find((s: any) => String(s.assetId) === selectedAssetId);
    if (fromLease) return fromLease;
    return (allAvailSets as any[]).find((s: any) => String(s.assetId) === selectedAssetId) ?? null;
  }, [leaseSets, allAvailSets, selectedAssetId]);

  // Is the currently selected group already attached to the current lease?
  const isAlreadyAttached = useMemo(() => {
    if (selectedAssetId === "none" || !leaseSelected) return false;
    return (leaseSets as any[]).some((s: any) => String(s.assetId) === selectedAssetId);
  }, [leaseSets, selectedAssetId, leaseSelected]);

  // Parse tags_with_serials for the detail card
  const setItems = useMemo(() => {
    if (!selectedSetRecord) return [];
    try {
      // Prefer per-lease tagsWithSerials (saved on attach/edit) over master setTags
    const raw = (selectedSetRecord as any).tagsWithSerials ?? (selectedSetRecord as any).setTags ?? (selectedSetRecord as any).tags;
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((item: any) => {
        const master = MASTER_ITEMS_MAP.get(item.code);
        return {
          ...item,
          name: item.name ?? master?.name ?? "—",
          category: item.category ?? master?.category ?? "—",
        };
      }) : [];
    } catch { return []; }
  }, [selectedSetRecord]);

  // Transaction history query — uses leaseSubAssetId if available (set is attached to lease)
  const txnInput = useMemo(() => ({
    entityId:  selectedSetRecord ? (Number((selectedSetRecord as any).leaseSubAssetId) || undefined) : undefined,
    action:    filterAction !== "all" ? filterAction : undefined,
    changedBy: filterUser.trim() || undefined,
    dateFrom:  filterDateFrom || undefined,
    dateTo:    filterDateTo   || undefined,
  }), [selectedSetRecord, filterAction, filterUser, filterDateFrom, filterDateTo]);

  const setSelected = selectedAssetId !== "none" && !!selectedSetRecord;

  const { data: txnData, isFetching, refetch } = trpc.asset.getSubAssetTxns.useQuery(
    txnInput,
    { enabled: setSelected }
  );
  const txns = (txnData as any)?.rows ?? [];

  // ── Mutations ─────────────────────────────────────────────
  const utils = trpc.useUtils();
  const statusMutation = trpc.asset.updateSubAssetStatus.useMutation({
    onSuccess: () => {
      toast.success("Transaction recorded successfully");
      utils.asset.getLeaseSubAssets.invalidate();
      utils.asset.getSubAssetTxns.invalidate();
      closeActionDialog();
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const updateTagsMutation = trpc.asset.updateLeaseSubAssetTags.useMutation({
    onSuccess: () => {
      toast.success("Items updated successfully");
      utils.asset.getLeaseSubAssets.invalidate();
      utils.asset.getSubAssetTxns.invalidate();
      setEditingItems(false);
    },
    onError: (e) => toast.error(`Failed to update items: ${e.message}`),
  });

  const attachMutation = trpc.asset.attachSubAssetToLease.useMutation({
    onSuccess: (res) => {
      if ((res as any).message === "Already attached") {
        toast.warning("This set is already active on this lease.");
        return;
      }
      toast.success("Sub-asset set attached and transaction logged.");
      utils.asset.getLeaseSubAssets.invalidate();
      utils.asset.getSubAssetTxns.invalidate();
      // Add to correlation table
      const leaseLabel = (leaseList as any[]).find((l: any) => String(l.leaseId) === selectedLeaseId)?.leaseRef ?? selectedLeaseId;
      const setLabel = (allAvailSets as any[]).find((s: any) => String(s.assetId) === attachSetId);
      setCorrelationRows(prev => [...prev, {
        leaseRef: leaseLabel,
        assetCode: setLabel?.assetCode ?? attachSetId,
        setName: setLabel?.setName ?? "—",
        attachedAt: new Date().toLocaleString(),
      }]);
      setAttachOpen(false);
      resetAttachDialog();
    },
    onError: (e) => toast.error(`Attach failed: ${e.message}`),
  });

  const aiGenerateSerialsMutation = trpc.asset.aiGenerateSerials.useMutation();
  const addItemMutation = trpc.asset.addSubAssetItem.useMutation({
    onSuccess: () => {
      toast.success("Item added to set successfully");
      utils.asset.getLeaseSubAssets.invalidate();
      utils.asset.getSubAssetTxns.invalidate();
      setAddItemOpen(false);
      setAddItemForm({
        code: "", name: "", category: "", subCategory: "",
        brand: "", model: "", spec: "", qty: 1,
        serialNumbers: [""], attachDate: today,
        warrantyExpiry: "", priceQAR: "",
      });
    },
    onError: (e) => toast.error(`Failed to add item: ${e.message}`),
  });

  function confirmAddItem() {
    const rec = selectedSetRecord as any;
    if (!rec?.leaseSubAssetId) {
      toast.error("Set must be attached to a lease before adding items.");
      return;
    }
    if (!addItemForm.name.trim() || !addItemForm.category.trim()) {
      toast.error("Item name and category are required.");
      return;
    }
    addItemMutation.mutate({
      leaseSubAssetId: rec.leaseSubAssetId,
      code:            addItemForm.code.trim() || `ITEM-${Date.now()}`,
      name:            addItemForm.name.trim(),
      category:        addItemForm.category.trim(),
      subCategory:     addItemForm.subCategory.trim() || undefined,
      brand:           addItemForm.brand.trim() || undefined,
      model:           addItemForm.model.trim() || undefined,
      spec:            addItemForm.spec.trim() || undefined,
      qty:             addItemForm.qty,
      serialNumbers:   addItemForm.serialNumbers.slice(0, addItemForm.qty),
      attachDate:      addItemForm.attachDate,
      warrantyExpiry:  addItemForm.warrantyExpiry || undefined,
      priceQAR:        addItemForm.priceQAR !== "" ? Number(addItemForm.priceQAR) : undefined,
    });
  }

  function resetAttachDialog() {
    setAttachSetId("none");
    setAttachItems([]);
    setAttachStep("select");
    setAttachingInline(false);
  }

  function onPickAttachSet(setId: string) {
    setAttachSetId(setId);
    const reg = (allAvailSets as any[]).find((s: any) => String(s.assetId) === setId);
    if (!reg) return;
    const today = new Date().toISOString().slice(0, 10);
    let lines: any[] = [];
    try { lines = reg.tags ? JSON.parse(reg.tags) : []; } catch { lines = []; }
    setAttachItems(lines.map((l: any) => {
      const master = MASTER_ITEMS_MAP.get(l.code);
      return {
        code:          l.code,
        name:          l.name || master?.name || "",
        category:      l.category || master?.category || "",
        qty:           l.qty ?? 1,
        serialNumbers: Array.from({ length: l.qty ?? 1 }, () => ""),
        attachDate:    today,
        warrantyExpiry: "",
      };
    }));
    setAttachStep("serials");
  }

  function confirmAttach() {
    if (!selectedLeaseId || attachSetId === "none") return;
    const reg = (allAvailSets as any[]).find((s: any) => String(s.assetId) === attachSetId);
    if (!reg) return;
    const lease = (leaseList as any[]).find((l: any) => String(l.leaseId) === selectedLeaseId);
    attachMutation.mutate({
      leaseId:         selectedLeaseId,
      assetId:         reg.assetId,
      assetCode:       reg.assetCode,
      setName:         reg.setName,
      tagsWithSerials: JSON.stringify(attachItems),
      lesseeName:      lease?.lesseeName || undefined,
    });
  }

  function startEditItems() {
    setEditItems(setItems.map((it: any) => ({
      ...it,
      serialNumbers: Array.isArray(it.serialNumbers) ? [...it.serialNumbers] : [],
    })));
    setEditingItems(true);
  }

  function saveEditItems() {
    const rec = selectedSetRecord as any;
    if (!rec?.leaseSubAssetId) return;
    updateTagsMutation.mutate({
      leaseSubAssetId: rec.leaseSubAssetId,
      tagsWithSerials: JSON.stringify(editItems),
    });
  }

  // ── URL persistence ───────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams();
    if (selectedLeaseId !== "none") p.set("leaseId", selectedLeaseId);
    if (selectedAssetId !== "none") p.set("assetId", selectedAssetId);
    const qs = p.toString();
    setLocation(`/sub-asset-registry/transactions${qs ? `?${qs}` : ""}`, { replace: true });
  }, [selectedLeaseId, selectedAssetId]);

  // ── Auto-select first attached set when lease changes ─────
  useEffect(() => {
    if (!leaseSelected || loadingSets) return;
    const sets = leaseSets as any[];
    if (sets.length > 0 && selectedAssetId === "none") {
      setSelectedAssetId(String(sets[0].assetId));
    }
  }, [leaseSets, loadingSets, leaseSelected]);

  // ── Handlers ──────────────────────────────────────────────
  function handleLeaseChange(val: string) {
    setSelectedLeaseId(val);
    setSelectedAssetId("none");
  }

  function openAction(actionId: string) {
    const a = ACTIONS.find(x => x.id === actionId);
    if (!a) return;
    setActionDate(new Date().toISOString().split("T")[0]);
    setActionReason("");
    setActionNotes("");
    setActionReplaceSet("none");
    setActionDialog({ open: true, actionId, label: a.label, newStatus: a.newStatus });
  }

  function closeActionDialog() {
    setActionDialog({ open: false, actionId: "", label: "", newStatus: "" });
  }

  async function confirmAction() {
    if (!selectedSetRecord || !actionDate) return;
    const rec = selectedSetRecord as any;
    const replaceSet = actionReplaceSet !== "none"
      ? (allAvailSets as any[]).find((s: any) => String(s.assetId) === actionReplaceSet)
      : null;

    const lessorName = (leaseList as any[]).find((l: any) => String(l.leaseId) === selectedLeaseId)?.lessorName;
    const lesseeName = (leaseList as any[]).find((l: any) => String(l.leaseId) === selectedLeaseId)?.lesseeName;
    await statusMutation.mutateAsync({
      leaseSubAssetId:   rec.leaseSubAssetId,
      newStatus:         actionDialog.newStatus as any,
      statusDate:        actionDate,
      reason:            actionReason || undefined,
      replacedByAssetId: replaceSet?.assetId,
      replacedByCode:    replaceSet?.assetCode,
      notes:             actionNotes || undefined,
      lessorName:        actionDialog.newStatus === "Returned" ? lessorName : undefined,
      lesseeName:        actionDialog.newStatus === "BackIn"   ? lesseeName : undefined,
    });
  }

  const selectedLease = (leaseList as any[]).find((l: any) => String(l.leaseId) === selectedLeaseId);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <ScreenHeader
          screenId="VFLSEASTTXN0001P001" screenType="sub_asset_transaction_log"
          title="Sub-Asset Transactions"
          subtitle="Select a lease and sub-asset set to view details and record transactions"
        />

        <div className="flex-1 flex overflow-hidden">
          {/* ── Left: main content ─────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* ── Step 1 & 2: Lease + Set Selector ─────────────── */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Hash className="w-4 h-4 text-[#e60000]" />
              Select Lease &amp; Sub-Asset Set
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Lease selector */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Lease Number</Label>
                <Select value={selectedLeaseId} onValueChange={handleLeaseChange}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="— Select a lease —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select a lease —</SelectItem>
                    {(leaseList as any[]).map((l: any) => (
                      <SelectItem key={l.leaseId} value={String(l.leaseId)}>
                        <span className="font-mono text-[#e60000] mr-2">{l.leaseRef}</span>
                        <span className="text-muted-foreground text-xs">{l.assetName}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sub-Asset Group selector — shows ALL groups; attached ones show status badge */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Sub-Asset Group
                  {loadingSets && leaseSelected && <span className="ml-2 text-[10px] text-muted-foreground animate-pulse">Loading…</span>}
                  {leaseSelected && !loadingSets && (
                    <span className="ml-2 text-[10px] text-muted-foreground">{leaseSets.length} attached to this lease</span>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={selectedAssetId}
                    onValueChange={setSelectedAssetId}
                    disabled={!leaseSelected}
                  >
                    <SelectTrigger className="bg-background border-border flex-1">
                      <SelectValue placeholder={leaseSelected ? (loadingSets ? "Loading…" : "— Select a set —") : "— Select a lease first —"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Select a set —</SelectItem>
                      {(allAvailSets as any[]).map((s: any) => {
                        const attached = (leaseSets as any[]).find((ls: any) => String(ls.assetId) === String(s.assetId));
                        return (
                          <SelectItem key={s.assetId} value={String(s.assetId)}>
                            <span className="font-mono text-[#e60000] mr-2">{s.assetCode}</span>
                            <span>{s.setName}</span>
                            {attached ? (
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border ${STATUS_BADGE[attached.status] ?? "bg-muted text-muted-foreground"}`}>
                                {attached.status}
                              </span>
                            ) : leaseSelected ? (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground">
                                Not attached
                              </span>
                            ) : null}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {/* Attachment is handled by the right-side action panel */}
                </div>
              </div>
            </div>

            {/* Lease summary bar */}
            {selectedLease && (
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground bg-muted/20 border border-border rounded-lg px-3 py-2">
                <span><span className="text-foreground font-medium">Ref:</span> {selectedLease.leaseRef}</span>
                <span><span className="text-foreground font-medium">Asset:</span> {selectedLease.assetName}</span>
                <span><span className="text-foreground font-medium">Lessor:</span> {selectedLease.lessorName}</span>
                <span><span className="text-foreground font-medium">Status:</span> {selectedLease.status}</span>
                <span><span className="text-foreground font-medium">Sets attached:</span> {leaseSets.length}</span>
              </div>
            )}
          </div>

          {/* ── Correlation Table ─────────────────────────────── */}
          {correlationRows.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#e60000]" />
                  <span className="text-sm font-semibold">Lease ↔ Sub-Asset Correlations</span>
                  <span className="text-xs text-muted-foreground">({correlationRows.length} attachment{correlationRows.length !== 1 ? "s" : ""} this session)</span>
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => setCorrelationRows([])}>Clear</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/5 text-xs">
                      <th className="text-left py-2 px-4 font-medium text-muted-foreground">Lease Ref</th>
                      <th className="text-left py-2 px-4 font-medium text-muted-foreground">Asset Code</th>
                      <th className="text-left py-2 px-4 font-medium text-muted-foreground">Set Name</th>
                      <th className="text-left py-2 px-4 font-medium text-muted-foreground">Attached At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {correlationRows.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/10">
                        <td className="py-2 px-4 font-mono text-[#e60000]">{row.leaseRef}</td>
                        <td className="py-2 px-4 font-mono text-xs">{row.assetCode}</td>
                        <td className="py-2 px-4">{row.setName}</td>
                        <td className="py-2 px-4 text-muted-foreground text-xs">{row.attachedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* ── Detail Card ───────────────────────────────────── */}
          {setSelected && selectedSetRecord && (() => {
            const rec = selectedSetRecord as any;
            return (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-[#e60000]" />
                    <div>
                      <p className="font-semibold text-foreground">
                        <span className="font-mono text-[#e60000]">{rec.assetCode}</span>
                        <span className="mx-2 text-muted-foreground">·</span>
                        {rec.setName ?? rec.currentSetName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isAlreadyAttached ? `Lease: ${rec.leaseRef ?? rec.leaseId}` : <span className="text-amber-400 font-medium">Not yet attached to this lease</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded border text-xs font-medium ${isAlreadyAttached ? (STATUS_BADGE[rec.status] ?? "bg-muted text-muted-foreground") : "bg-amber-500/20 text-amber-400 border-amber-500/30"}`}>
                      {isAlreadyAttached ? rec.status : "Not Attached"}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => refetchSets()}>
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </Button>
                  </div>
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-border">
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Status Date</p>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      {rec.statusDate ?? "—"}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Created By</p>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      {rec.createdBy ?? "—"}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Created At</p>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      {rec.createdAt ? new Date(rec.createdAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Last Updated</p>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                      {rec.updatedAt ? new Date(rec.updatedAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  {rec.reason && (
                    <div className="px-4 py-3 col-span-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Reason</p>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        {rec.reason}
                      </p>
                    </div>
                  )}
                  {rec.notes && (
                    <div className="px-4 py-3 col-span-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Notes</p>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        {rec.notes}
                      </p>
                    </div>
                  )}
                  {rec.replacedByCode && (
                    <div className="px-4 py-3 col-span-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Replaced By</p>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Repeat2 className="w-3.5 h-3.5 text-amber-400" />
                        {rec.replacedByCode}
                      </p>
                    </div>
                  )}
                </div>

                {/* Items table — inline-attach-editable or view mode */}
                {attachingInline && attachItems.length > 0 && (
                      <div className="border-t border-emerald-500/40">
                        <div className="px-4 py-2 bg-emerald-500/10 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-xs font-semibold text-emerald-400">Fill in item details before attaching ({attachItems.length} items)</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2 border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                              onClick={async () => {
                                setAiFillingInline(true);
                                try {
                                  const firstDate = attachItems[0]?.attachDate || new Date().toISOString().slice(0,10);
                                  const result = await aiGenerateSerialsMutation.mutateAsync({
                                    items: attachItems.map(it => ({ code: it.code, name: it.name, category: it.category, qty: it.qty ?? 1 })),
                                    attachDate: firstDate,
                                  });
                                  setAttachItems(prev => prev.map(item => {
                                    const filled = result.items.find(r => r.code === item.code);
                                    if (!filled) return item;
                                    return { ...item, serialNumbers: filled.serialNumbers, warrantyExpiry: filled.warrantyExpiry };
                                  }));
                                  toast.success('AI filled serial numbers and warranty dates');
                                } catch (e: any) {
                                  toast.error('AI fill failed: ' + e.message);
                                } finally {
                                  setAiFillingInline(false);
                                }
                              }}
                              disabled={aiFillingInline || aiGenerateSerialsMutation.isPending}>
                              <Sparkles className="w-3 h-3" />
                              {aiFillingInline ? 'Filling…' : 'AI Fill'}
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2"
                              onClick={() => resetAttachDialog()}>
                              <XIcon className="w-3 h-3" /> Cancel
                            </Button>
                            <Button size="sm" className="h-6 text-[10px] gap-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={confirmAttach}
                              disabled={attachMutation.isPending}>
                              <Save className="w-3 h-3" />
                              {attachMutation.isPending ? "Attaching…" : "Confirm Attach"}
                            </Button>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border bg-muted/5">
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Code</th>
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Name</th>
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Category</th>
                                <th className="text-center py-2 px-4 font-medium text-muted-foreground">Qty</th>
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Serial Numbers</th>
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Attach Date</th>
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Warranty Expiry</th>
                                <th className="w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {attachItems.map((item: any, i: number) => (
                                <tr key={i} className="border-b border-border/50 bg-emerald-500/5">
                                  <td className="py-2 px-4">
                                    <Input
                                      className="h-6 text-xs bg-background border-border w-24 font-mono text-[#e60000]"
                                      value={item.code ?? ""}
                                      onChange={e => setAttachItems(prev => prev.map((it: any, idx: number) =>
                                        idx === i ? { ...it, code: e.target.value } : it
                                      ))}
                                      placeholder="Code"
                                    />
                                  </td>
                                  <td className="py-2 px-4">
                                    <Input
                                      className="h-6 text-xs bg-background border-border min-w-[120px]"
                                      value={item.name ?? ""}
                                      onChange={e => setAttachItems(prev => prev.map((it: any, idx: number) =>
                                        idx === i ? { ...it, name: e.target.value } : it
                                      ))}
                                      placeholder="Item name"
                                    />
                                  </td>
                                  <td className="py-2 px-4">
                                    <Input
                                      className="h-6 text-xs bg-background border-border min-w-[100px] text-muted-foreground"
                                      value={item.category ?? ""}
                                      onChange={e => setAttachItems(prev => prev.map((it: any, idx: number) =>
                                        idx === i ? { ...it, category: e.target.value } : it
                                      ))}
                                      placeholder="Category"
                                    />
                                  </td>
                                  <td className="py-2 px-4 text-center">
                                    <Input
                                      type="number" min={1}
                                      className="h-6 text-xs bg-background border-border w-16 text-center"
                                      value={item.qty ?? 1}
                                      onChange={e => setAttachItems(prev => prev.map((it: any, idx: number) =>
                                        idx === i ? { ...it, qty: Number(e.target.value) } : it
                                      ))}
                                    />
                                  </td>
                                  <td className="py-2 px-4">
                                    <Input
                                      className="h-6 text-xs bg-background border-border min-w-[160px]"
                                      value={Array.isArray(item.serialNumbers) ? item.serialNumbers.join(", ") : ""}
                                      onChange={e => {
                                        const vals = e.target.value.split(",").map((s: string) => s.trim());
                                        setAttachItems(prev => prev.map((it: any, idx: number) =>
                                          idx === i ? { ...it, serialNumbers: vals } : it
                                        ));
                                      }}
                                      placeholder="SN001, SN002…"
                                    />
                                  </td>
                                  <td className="py-2 px-4">
                                    <Input
                                      type="date"
                                      className="h-6 text-xs bg-background border-border w-32"
                                      value={item.attachDate ?? ""}
                                      onChange={e => setAttachItems(prev => prev.map((it: any, idx: number) =>
                                        idx === i ? { ...it, attachDate: e.target.value } : it
                                      ))}
                                    />
                                  </td>
                                  <td className="py-2 px-4">
                                    <Input
                                      type="date"
                                      className="h-6 text-xs bg-background border-border w-32"
                                      value={item.warrantyExpiry ?? ""}
                                      onChange={e => setAttachItems(prev => prev.map((it: any, idx: number) =>
                                        idx === i ? { ...it, warrantyExpiry: e.target.value } : it
                                      ))}
                                    />
                                  </td>
                                  <td className="py-2 px-2">
                                    <Button
                                      size="sm" variant="ghost"
                                      className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                      onClick={() => setAttachItems(prev => prev.filter((_: any, idx: number) => idx !== i))}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {/* Add new row button */}
                          <div className="px-4 py-2 border-t border-emerald-500/20">
                            <Button
                              size="sm" variant="outline"
                              className="h-7 text-xs gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                              onClick={() => setAttachItems(prev => [...prev, {
                                code: "",
                                name: "",
                                category: "",
                                qty: 1,
                                serialNumbers: [""],
                                attachDate: new Date().toISOString().slice(0, 10),
                                warrantyExpiry: "",
                              }])}
                            >
                              <Plus className="w-3 h-3" /> Add Item
                            </Button>
                          </div>
                        </div>
                      </div>
                )}

                {/* Normal view/edit mode */}
                {!attachingInline && setItems.length > 0 && (
                      <div className="border-t border-border">
                        <div className="px-4 py-2 bg-muted/10 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Tag className="w-3.5 h-3.5 text-[#e60000]" />
                            <span className="text-xs font-semibold text-foreground">Items in this Set ({setItems.length})</span>
                          </div>
                          {rec.leaseSubAssetId && (
                            editingItems ? (
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2"
                                  onClick={() => setEditingItems(false)}>
                                  <XIcon className="w-3 h-3" /> Cancel
                                </Button>
                                <Button size="sm" className="h-6 text-[10px] gap-1 px-2 bg-[#e60000] hover:bg-[#cc0000] text-white"
                                  onClick={saveEditItems}
                                  disabled={updateTagsMutation.isPending}>
                                  <Save className="w-3 h-3" />
                                  {updateTagsMutation.isPending ? "Saving…" : "Save"}
                                </Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2"
                                onClick={startEditItems}>
                                <Pencil className="w-3 h-3" /> Edit Items
                              </Button>
                            )
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border bg-muted/5">
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Code</th>
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Name</th>
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Category</th>
                                <th className="text-center py-2 px-4 font-medium text-muted-foreground">Qty</th>
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Serial Numbers</th>
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Attach Date</th>
                                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Warranty Expiry</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(editingItems ? editItems : setItems).map((item: any, i: number) => (
                                <tr key={i} className="border-b border-border/50 hover:bg-muted/10">
                                  <td className="py-2 px-4 font-mono text-[#e60000]">{item.code ?? "—"}</td>
                                  <td className="py-2 px-4">{item.name ?? "—"}</td>
                                  <td className="py-2 px-4 text-muted-foreground">{item.category ?? "—"}</td>
                                  <td className="py-2 px-4 text-center">
                                    {editingItems ? (
                                      <Input
                                        type="number" min={1}
                                        className="h-6 text-xs bg-background border-border w-16 text-center"
                                        value={item.qty ?? 1}
                                        onChange={e => setEditItems(prev => prev.map((it: any, idx: number) =>
                                          idx === i ? { ...it, qty: Number(e.target.value) } : it
                                        ))}
                                      />
                                    ) : (item.qty ?? "—")}
                                  </td>
                                  <td className="py-2 px-4">
                                    {editingItems ? (
                                      <Input
                                        className="h-6 text-xs bg-background border-border min-w-[160px]"
                                        value={Array.isArray(item.serialNumbers) ? item.serialNumbers.join(", ") : ""}
                                        onChange={e => {
                                          const vals = e.target.value.split(",").map((s: string) => s.trim());
                                          setEditItems(prev => prev.map((it: any, idx: number) =>
                                            idx === i ? { ...it, serialNumbers: vals } : it
                                          ));
                                        }}
                                        placeholder="Serial 1, Serial 2…"
                                      />
                                    ) : (
                                      Array.isArray(item.serialNumbers) && item.serialNumbers.filter(Boolean).length > 0
                                        ? item.serialNumbers.filter(Boolean).join(", ")
                                        : <span className="text-muted-foreground italic">None</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-4">
                                    {editingItems ? (
                                      <Input
                                        type="date"
                                        className="h-6 text-xs bg-background border-border w-32"
                                        value={item.attachDate ?? ""}
                                        onChange={e => setEditItems(prev => prev.map((it: any, idx: number) =>
                                          idx === i ? { ...it, attachDate: e.target.value } : it
                                        ))}
                                      />
                                    ) : (
                                      item.attachDate ?? item.leaseDate ?? "—"
                                    )}
                                  </td>
                                  <td className="py-2 px-4">
                                    {editingItems ? (
                                      <Input
                                        type="date"
                                        className="h-6 text-xs bg-background border-border w-32"
                                        value={item.warrantyExpiry ?? ""}
                                        onChange={e => setEditItems(prev => prev.map((it: any, idx: number) =>
                                          idx === i ? { ...it, warrantyExpiry: e.target.value } : it
                                        ))}
                                      />
                                    ) : (
                                      item.warrantyExpiry
                                        ? <span className={new Date(item.warrantyExpiry) < new Date() ? "text-red-400 font-semibold" : "text-green-400"}>{item.warrantyExpiry}</span>
                                        : <span className="text-muted-foreground italic">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                )}

                {/* Empty state */}
                {!attachingInline && setItems.length === 0 && (
                  <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground italic flex items-center gap-2">
                    <Package className="w-3.5 h-3.5" />
                    No item details stored for this set.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Add Transaction Panel removed — actions are in the right-side panel */}

          {/* ── Inline Attach CTA (shown when set selected but not attached) ───── */}
          {setSelected && !isAlreadyAttached && (() => {
            const rec = selectedSetRecord as any;
            return (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-4">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-400 mb-0.5">Not yet attached to this lease</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono text-[#e60000]">{rec.assetCode}</span>
                    {" · "}{rec.setName ?? rec.currentSetName} is in the master registry but has not been linked to this lease.
                    Attach it to start recording transactions and tracking items.
                  </p>
                </div>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shrink-0"
                  onClick={() => {
                    resetAttachDialog();
                    if (selectedAssetId !== "none") {
                      onPickAttachSet(selectedAssetId);
                      setAttachingInline(true);
                    }
                  }}
                >
                  <Link2 className="w-4 h-4" />
                  Attach to Lease
                </Button>
              </div>
            );
          })()}

          {/* ── Transaction History ───────────────────────────── */}
          {setSelected && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#e60000]" />
                  <span className="text-sm font-semibold text-foreground">Transaction History</span>
                  {txns.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{txns.length} records</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={filterAction} onValueChange={setFilterAction}>
                    <SelectTrigger className="h-7 text-xs w-40 bg-background border-border">
                      <SelectValue placeholder="All Actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      {["ATTACH","STATUS_CHANGE","OWNERSHIP_CHANGE","ITEM_ADD","ITEM_EDIT","ITEM_DELETE"].map(a => (
                        <SelectItem key={a} value={a}>{a.replace(/_/g," ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              {isFetching ? (
                <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">Loading transactions…</div>
              ) : txns.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No transactions recorded yet for this set.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/5 text-xs">
                        <th className="w-8 py-2 px-2" />
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Action</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Entity</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Changed By</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Date / Time</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Screen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(txns as any[]).flatMap((t: any) => {
                        const isExpanded = expandedRow === t.txnId;
                        const hasDiff = t.beforeJson || t.afterJson;
                        return [
                          <tr
                            key={`row-${t.txnId}`}
                            className={`border-b border-border/50 hover:bg-muted/10 ${isExpanded ? "bg-muted/10" : ""}`}
                          >
                            <td className="py-2 px-2 text-center">
                              {hasDiff && (
                                <button
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  onClick={() => setExpandedRow(isExpanded ? null : t.txnId)}
                                >
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </td>
                            <td className="py-2 px-2">
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${ACTION_BADGE[t.action] ?? "bg-muted text-muted-foreground"}`}>
                                {t.action?.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="py-2 px-2">
                              <span className="font-mono text-[#e60000] text-xs">{t.entityCode ?? `ID:${t.entityId}`}</span>
                              {t.entityName && <span className="ml-1 text-muted-foreground text-xs">· {t.entityName}</span>}
                            </td>
                            <td className="py-2 px-2 text-muted-foreground text-xs">{t.changedBy ?? "—"}</td>
                            <td className="py-2 px-2 text-muted-foreground text-xs">
                              {t.changedAt ? new Date(t.changedAt).toLocaleString() : "—"}
                            </td>
                            <td className="py-2 px-2 text-muted-foreground font-mono text-[10px]">{t.screenId ?? "—"}</td>
                          </tr>,
                          ...(isExpanded ? [
                            <tr key={`exp-${t.txnId}`} className="border-b border-border/50 bg-muted/10">
                              <td key={`exp-td-${t.txnId}`} colSpan={6} className="py-3 px-6">
                                <ItemDiffViewer before={t.beforeJson} after={t.afterJson} />
                              </td>
                            </tr>
                          ] : []),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Empty states */}
          {!setSelected && leaseSelected && (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Select a Sub-Asset Set above</p>
              <p className="text-xs mt-1">
                {leaseSets.length > 0
                  ? `${leaseSets.length} set(s) available on this lease`
                  : "No sets attached to this lease yet"}
              </p>
            </div>
          )}

          {!leaseSelected && (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
              <Hash className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Select a Lease Number to get started</p>
              <p className="text-xs mt-1">Choose a lease from the dropdown above to see its sub-asset sets</p>
            </div>
          )}

          </div>{/* end left panel */}


        </div>{/* end horizontal split */}
      </div>

      {/* ── Attach Dialog ─────────────────────────────────────────────────────── */}
      {attachOpen && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-5 space-y-4">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Link2 className="w-4 h-4 text-emerald-400" /> Attach Sub-Asset Set to Lease
            </h4>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setAttachOpen(false); resetAttachDialog(); }}><XIcon className="w-3.5 h-3.5" /></Button>
          </div>

          {attachStep === "select" ? (
            <div className="space-y-3 py-1">
              <p className="text-xs text-muted-foreground">
                Attaching to lease{" "}
                <span className="font-mono text-[#e60000]">
                  {(leaseList as any[]).find((l: any) => String(l.leaseId) === selectedLeaseId)?.leaseRef ?? selectedLeaseId}
                </span>
              </p>
              <div>
                <Label className="text-xs text-muted-foreground">Sub-Asset Group <span className="text-red-400">*</span></Label>
                <Select value={attachSetId} onValueChange={onPickAttachSet}>
                  <SelectTrigger className="mt-1 bg-background border-border">
                    <SelectValue placeholder="— Select a set —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select a set —</SelectItem>
                    {(allAvailSets as any[]).map((s: any) => (
                      <SelectItem key={s.assetId} value={String(s.assetId)}>
                        <span className="font-mono text-[#e60000] mr-2">{s.assetCode}</span>
                        <span>{s.setName}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-1 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                Fill in serial numbers, attach dates, and warranty expiry for each item.
              </p>
              {attachItems.map((item: any, i: number) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[#e60000] text-xs">{item.code}</span>
                    <span className="text-sm font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.category}</span>
                    <Badge variant="secondary" className="text-[10px]">Qty: {item.qty}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Serial Numbers (comma-separated)</Label>
                      <Input
                        className="mt-0.5 h-7 text-xs bg-background border-border"
                        value={Array.isArray(item.serialNumbers) ? item.serialNumbers.join(", ") : ""}
                        onChange={e => {
                          const vals = e.target.value.split(",").map((s: string) => s.trim());
                          setAttachItems(prev => prev.map((it: any, idx: number) =>
                            idx === i ? { ...it, serialNumbers: vals } : it
                          ));
                        }}
                        placeholder="SN001, SN002…"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Attach Date</Label>
                      <Input
                        type="date"
                        className="mt-0.5 h-7 text-xs bg-background border-border"
                        value={item.attachDate ?? ""}
                        onChange={e => setAttachItems(prev => prev.map((it: any, idx: number) =>
                          idx === i ? { ...it, attachDate: e.target.value } : it
                        ))}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Warranty Expiry (optional)</Label>
                      <Input
                        type="date"
                        className="mt-0.5 h-7 text-xs bg-background border-border"
                        value={item.warrantyExpiry ?? ""}
                        onChange={e => setAttachItems(prev => prev.map((it: any, idx: number) =>
                          idx === i ? { ...it, warrantyExpiry: e.target.value } : it
                        ))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => { setAttachOpen(false); resetAttachDialog(); }}>Cancel</Button>
            {attachStep === "serials" && (
              <Button variant="outline" size="sm" onClick={() => setAttachStep("select")}>Back</Button>
            )}
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={confirmAttach}
              disabled={attachMutation.isPending || attachSetId === "none"}
            >
              {attachMutation.isPending ? "Attaching…" : attachStep === "select" ? "Next: Fill Details" : "Confirm Attach"}
            </Button>
          </div>
        
        </div>
      )}

      {/* ── Add Item Dialog ───────────────────────────────────────────────────── */}
      {addItemOpen && (
        <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              Add New Item to Set
            </h4>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setAddItemOpen(false)}><XIcon className="w-3.5 h-3.5" /></Button>
          </div>

          {selectedSetRecord && (() => {
            const rec = selectedSetRecord as any;
            return (
              <div className="bg-muted/20 border border-border rounded-md p-3 text-xs mb-2">
                <span className="font-mono text-[#e60000] font-semibold">{rec.assetCode}</span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span>{rec.setName ?? rec.currentSetName}</span>
                {!rec.leaseSubAssetId && (
                  <span className="ml-3 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5">
                    ⚠ Set must be attached to a lease first
                  </span>
                )}
              </div>
            );
          })()}

          <div className="space-y-4 py-1">
            {/* Row 1: Code + Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Item Code</Label>
                <Input
                  className="mt-1 bg-background border-border font-mono text-xs"
                  placeholder="e.g. FURN-001 (auto-generated if blank)"
                  value={addItemForm.code}
                  onChange={e => setAddItemForm(f => ({ ...f, code: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Item Name <span className="text-red-400">*</span></Label>
                <Input
                  className="mt-1 bg-background border-border"
                  placeholder="e.g. Office Chair"
                  value={addItemForm.name}
                  onChange={e => setAddItemForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
            </div>

            {/* Row 2: Category + Sub-Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Category <span className="text-red-400">*</span></Label>
                <Input
                  className="mt-1 bg-background border-border"
                  placeholder="e.g. Furniture"
                  value={addItemForm.category}
                  onChange={e => setAddItemForm(f => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Sub-Category</Label>
                <Input
                  className="mt-1 bg-background border-border"
                  placeholder="e.g. Seating"
                  value={addItemForm.subCategory}
                  onChange={e => setAddItemForm(f => ({ ...f, subCategory: e.target.value }))}
                />
              </div>
            </div>

            {/* Row 3: Brand + Model */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Brand</Label>
                <Input
                  className="mt-1 bg-background border-border"
                  placeholder="e.g. Herman Miller"
                  value={addItemForm.brand}
                  onChange={e => setAddItemForm(f => ({ ...f, brand: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Model</Label>
                <Input
                  className="mt-1 bg-background border-border"
                  placeholder="e.g. Aeron"
                  value={addItemForm.model}
                  onChange={e => setAddItemForm(f => ({ ...f, model: e.target.value }))}
                />
              </div>
            </div>

            {/* Row 4: Spec */}
            <div>
              <Label className="text-xs text-muted-foreground">Specification / Description</Label>
              <Input
                className="mt-1 bg-background border-border"
                placeholder="e.g. Ergonomic mesh back, adjustable arms"
                value={addItemForm.spec}
                onChange={e => setAddItemForm(f => ({ ...f, spec: e.target.value }))}
              />
            </div>

            {/* Row 5: Qty + Price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Quantity <span className="text-red-400">*</span></Label>
                <Input
                  type="number" min={1}
                  className="mt-1 bg-background border-border"
                  value={addItemForm.qty}
                  onChange={e => {
                    const q = Math.max(1, parseInt(e.target.value) || 1);
                    setAddItemForm(f => ({
                      ...f,
                      qty: q,
                      serialNumbers: Array.from({ length: q }, (_, i) => f.serialNumbers[i] ?? ""),
                    }));
                  }}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Unit Price (QAR)</Label>
                <Input
                  type="number" min={0} step="0.01"
                  className="mt-1 bg-background border-border"
                  placeholder="0.00"
                  value={addItemForm.priceQAR}
                  onChange={e => setAddItemForm(f => ({ ...f, priceQAR: e.target.value }))}
                />
              </div>
            </div>

            {/* Row 6: Attach Date + Warranty Expiry */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Attach Date <span className="text-red-400">*</span></Label>
                <Input
                  type="date"
                  className="mt-1 bg-background border-border"
                  value={addItemForm.attachDate}
                  onChange={e => setAddItemForm(f => ({ ...f, attachDate: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Warranty Expiry</Label>
                <Input
                  type="date"
                  className="mt-1 bg-background border-border"
                  value={addItemForm.warrantyExpiry}
                  onChange={e => setAddItemForm(f => ({ ...f, warrantyExpiry: e.target.value }))}
                />
              </div>
            </div>

            {/* Serial Numbers */}
            {addItemForm.qty > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">
                  Serial Numbers ({addItemForm.qty} unit{addItemForm.qty > 1 ? "s" : ""})
                </Label>
                <div className="mt-1 space-y-1.5">
                  {Array.from({ length: addItemForm.qty }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6 text-right">{i + 1}.</span>
                      <Input
                        className="bg-background border-border font-mono text-xs"
                        placeholder={`Serial #${i + 1}`}
                        value={addItemForm.serialNumbers[i] ?? ""}
                        onChange={e => {
                          const sn = [...addItemForm.serialNumbers];
                          sn[i] = e.target.value;
                          setAddItemForm(f => ({ ...f, serialNumbers: sn }));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setAddItemOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={confirmAddItem}
              disabled={addItemMutation.isPending || !addItemForm.name.trim() || !addItemForm.category.trim()}
            >
              {addItemMutation.isPending ? "Adding…" : "Add Item to Set"}
            </Button>
          </div>
        
        </div>
      )}

      {/* ── Action Dialog ─────────────────────────────────────────────────────── */}
      {actionDialog.open && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              {(() => {
                const a = ACTIONS.find(x => x.id === actionDialog.actionId);
                if (!a) return null;
                const Icon = a.icon;
                return <><Icon className={`w-4 h-4 ${a.color}`} /> {a.label} Sub-Asset</>;
              })()}
            </h4>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => closeActionDialog()}><XIcon className="w-3.5 h-3.5" /></Button>
          </div>

          {selectedSetRecord && (() => {
            const rec = selectedSetRecord as any;
            return (
              <div className="bg-muted/20 border border-border rounded-md p-3 text-xs mb-2">
                <span className="font-mono text-[#e60000] font-semibold">{rec.assetCode}</span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span>{rec.setName ?? rec.currentSetName}</span>
                <span className={`ml-3 px-2 py-0.5 rounded border text-[10px] ${STATUS_BADGE[rec.status] ?? "bg-muted text-muted-foreground"}`}>{rec.status}</span>
              </div>
            );
          })()}

          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-muted-foreground">Transaction Date <span className="text-red-400">*</span></Label>
              <Input type="date" className="mt-1 bg-background border-border" value={actionDate} onChange={e => setActionDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Reason</Label>
              <Input className="mt-1 bg-background border-border" placeholder="Reason for this action…" value={actionReason} onChange={e => setActionReason(e.target.value)} />
            </div>
            {actionDialog.actionId === "Replaced" && (
              <div>
                <Label className="text-xs text-muted-foreground">Replacement Set</Label>
                <Select value={actionReplaceSet} onValueChange={setActionReplaceSet}>
                  <SelectTrigger className="mt-1 bg-background border-border">
                    <SelectValue placeholder="— Select replacement set —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select replacement set —</SelectItem>
                    {(allAvailSets as any[]).map((s: any) => (
                      <SelectItem key={s.assetId} value={String(s.assetId)}>
                        {s.assetCode} · {s.setName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
              <Textarea
                className="mt-1 bg-background border-border text-xs resize-none"
                rows={2}
                placeholder="Additional notes…"
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={closeActionDialog}>Cancel</Button>
            <Button
              size="sm"
              className="bg-[#e60000] hover:bg-[#cc0000] text-white"
              onClick={confirmAction}
              disabled={statusMutation.isPending || !actionDate}
            >
              {statusMutation.isPending ? "Saving…" : `Confirm ${actionDialog.label}`}
            </Button>
          </div>
        
        </div>
      )}
    </DashboardLayout>
  );
}
