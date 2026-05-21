"""
Phase 4 patch for Amortisation.tsx:
1. Add lifecycle_status and posting_status to ScheduleRow interface
2. Add lifecycle state variables and mutations
3. Add lifecycle status badge + action buttons to contract group header row
4. Add GL Postings Ledger section after the GL Entries section
5. Add Modify Rent dialog and Close Lease dialog
"""

with open('/home/ubuntu/vodalease-enterprise/client/src/pages/Amortisation.tsx') as f:
    content = f.read()

changes = []

# ── 1. Update imports: add lifecycle icons
old_imports = """import { Calculator, Download, ChevronDown, ChevronRight,
  TrendingDown, Banknote, BookOpen, Building2,
  ArrowDownRight, BarChart3, HelpCircle, Info, X,
} from "lucide-react";"""
new_imports = """import { Calculator, Download, ChevronDown, ChevronRight,
  TrendingDown, Banknote, BookOpen, Building2,
  ArrowDownRight, BarChart3, HelpCircle, Info, X,
  Zap, CheckCircle2, Lock, Play, Edit3, XCircle, Receipt,
} from "lucide-react";
import { Input } from "@/components/ui/input";"""
if old_imports in content:
    content = content.replace(old_imports, new_imports)
    changes.append("✅ imports updated")
else:
    changes.append("❌ imports not found")

# ── 2. Add lifecycle_status and posting_status to ScheduleRow interface
old_interface = """  gl_cash_bank: string;
}"""
new_interface = """  gl_cash_bank: string;
  lifecycle_status: string;
  posting_status: string;
  posted_at: string | null;
  posted_by: string | null;
}"""
if old_interface in content:
    content = content.replace(old_interface, new_interface, 1)
    changes.append("✅ ScheduleRow interface updated")
else:
    changes.append("❌ ScheduleRow interface not found")

# ── 3. Add lifecycle colour maps after CLASS_COLOUR
old_class_colour = """const CLASS_COLOUR: Record<string, string> = {
  Finance:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Operating: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  ShortTerm: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  LowValue:  "bg-purple-500/20 text-purple-400 border-purple-500/30",
};"""
new_class_colour = """const CLASS_COLOUR: Record<string, string> = {
  Finance:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Operating: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  ShortTerm: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  LowValue:  "bg-purple-500/20 text-purple-400 border-purple-500/30",
};
const LIFECYCLE_COLOUR: Record<string, string> = {
  Draft:    "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  Active:   "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Modified: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Closed:   "bg-red-500/20 text-red-400 border-red-500/30",
};"""
if old_class_colour in content:
    content = content.replace(old_class_colour, new_class_colour)
    changes.append("✅ LIFECYCLE_COLOUR added")
else:
    changes.append("❌ CLASS_COLOUR not found")

# ── 4. Add lifecycle state variables after glSelectedMonth state
old_state_end = """  const [glSelectedMonth, setGlSelectedMonth]     = useState<string>("");
  // ── Data queries ──────────────────────────────────────────────────────────"""
new_state_end = """  const [glSelectedMonth, setGlSelectedMonth]     = useState<string>("");
  // ── Lifecycle action state ─────────────────────────────────────────────────
  const [modifyDialogId, setModifyDialogId]       = useState<number | null>(null);
  const [modifyAmount, setModifyAmount]           = useState<string>("");
  const [modifyDate, setModifyDate]               = useState<string>("");
  const [closeDialogId, setCloseDialogId]         = useState<number | null>(null);
  const [closeDate, setCloseDate]                 = useState<string>("");
  const [glPostingsContractId, setGlPostingsContractId] = useState<number | null>(null);
  // ── Data queries ──────────────────────────────────────────────────────────"""
if old_state_end in content:
    content = content.replace(old_state_end, new_state_end)
    changes.append("✅ lifecycle state variables added")
else:
    changes.append("❌ glSelectedMonth state not found")

# ── 5. Add GL Postings query after existing data queries
old_queries_end = """  const scheduleRows: ScheduleRow[] = Array.isArray(rawSchedule) ? rawSchedule as ScheduleRow[] : [];
  const glEntries:   GLEntry[]      = Array.isArray(rawGL)       ? rawGL       as GLEntry[]      : [];"""
new_queries_end = """  const scheduleRows: ScheduleRow[] = Array.isArray(rawSchedule) ? rawSchedule as ScheduleRow[] : [];
  const glEntries:   GLEntry[]      = Array.isArray(rawGL)       ? rawGL       as GLEntry[]      : [];
  // ── GL Postings query (per-lease audit ledger) ─────────────────────────────
  const { data: rawGLPostings, isLoading: loadingGLPostings, refetch: refetchGLPostings } =
    trpc.lease.getGLPostings.useQuery(
      { contractId: glPostingsContractId ?? undefined },
      { enabled: glPostingsContractId !== null }
    );
  const glPostings = Array.isArray(rawGLPostings) ? rawGLPostings as any[] : [];"""
if old_queries_end in content:
    content = content.replace(old_queries_end, new_queries_end)
    changes.append("✅ GL Postings query added")
else:
    changes.append("❌ scheduleRows/glEntries assignment not found")

# ── 6. Add lifecycle mutations after calcMut
old_calcmut_end = """    onError: (err) => toast.error(`Calculation failed: ${err.message}`),
  });"""
new_calcmut_end = """    onError: (err) => toast.error(`Calculation failed: ${err.message}`),
  });
  // ── Lifecycle mutations ───────────────────────────────────────────────────
  const originateMut = trpc.lease.originateLease.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      toast.success(`Lease originated — Opening Liability: QAR ${(d?.opening_liability ?? 0).toLocaleString("en-US", {minimumFractionDigits: 2})}`);
      utils.lease.getAmortisationScheduleAll.invalidate();
    },
    onError: (err) => toast.error(`Origination failed: ${err.message}`),
  });
  const postPeriodMut = trpc.lease.postPeriod.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      toast.success(`Period posted — ${d?.period_posted ?? ''}: Interest QAR ${(d?.interest ?? 0).toLocaleString("en-US", {minimumFractionDigits: 2})}`);
      utils.lease.getAmortisationScheduleAll.invalidate();
      if (glPostingsContractId) refetchGLPostings();
    },
    onError: (err) => toast.error(`Post period failed: ${err.message}`),
  });
  const modifyMut = trpc.lease.modifyLease.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      toast.success(`Lease modified — Remeasurement: QAR ${(d?.remeasurement_amount ?? 0).toLocaleString("en-US", {minimumFractionDigits: 2})}`);
      setModifyDialogId(null);
      utils.lease.getAmortisationScheduleAll.invalidate();
    },
    onError: (err) => toast.error(`Modification failed: ${err.message}`),
  });
  const closeMut = trpc.lease.closeLease.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      toast.success(`Lease closed — Gain/Loss: QAR ${(d?.gain_loss ?? 0).toLocaleString("en-US", {minimumFractionDigits: 2})}`);
      setCloseDialogId(null);
      utils.lease.getAmortisationScheduleAll.invalidate();
    },
    onError: (err) => toast.error(`Closure failed: ${err.message}`),
  });"""
if old_calcmut_end in content:
    content = content.replace(old_calcmut_end, new_calcmut_end)
    changes.append("✅ lifecycle mutations added")
else:
    changes.append("❌ calcMut onError not found")

print("\n".join(changes))
print(f"\nFile length: {len(content.splitlines())} lines")

with open('/home/ubuntu/vodalease-enterprise/client/src/pages/Amortisation.tsx', 'w') as f:
    f.write(content)
print("✅ File written")
