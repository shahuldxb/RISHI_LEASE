import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, ChevronLeft, CheckCircle2, Building2, FileText, DollarSign, Upload, Eye, Package, X, ChevronDown, User, Briefcase, Phone, Mail, IdCard, MapPin, CreditCard, Plus, Trash2, Calculator } from "lucide-react";
import { groupDrCrByAmount, type JVLine } from "@/lib/jvGrouping";

// Right-side slide-in full-height calculation explanation panel for JV lines
function CalcExplanationInline({ explanation }: { explanation: string | null }) {
  const [open, setOpen] = useState(false);
  if (!explanation) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
        title="View calculation method"
      >
        <Calculator className="w-3 h-3" />
        Calc
      </button>
      {open && (
        <div className="fixed inset-0 z-[9999]" onClick={() => setOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          {/* Right-side panel */}
          <div
            className="absolute top-0 right-0 h-full w-full max-w-[600px] bg-gray-950 border-l border-amber-500/30 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-amber-500/20 bg-gray-900/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Calculation Method</h2>
                  <p className="text-xs text-amber-400/70">IFRS 16 — Blackboard Breakdown</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-gray-900 rounded-xl border border-gray-700/50 p-6">
                <div className="font-mono text-sm text-gray-200 whitespace-pre-wrap leading-[1.8] tracking-wide">
                  {explanation}
                </div>
              </div>
            </div>
            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50">
              <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";

const STEPS = [
  { id: 1, label: "Lessor Details",    icon: Building2 },
  { id: 2, label: "Lessee Details",    icon: User },
  { id: 3, label: "Asset Details",     icon: FileText },
  { id: 4, label: "Financial Terms",   icon: DollarSign },
  { id: 5, label: "Cheque Details",    icon: CreditCard },
  { id: 6, label: "Documents",         icon: Upload },
  { id: 7, label: "Review & Post",     icon: Eye },
];

const CHEQUE_TYPES = ['Rent', 'Security Deposit', 'Advance', 'Other'] as const;
type ChequeType = typeof CHEQUE_TYPES[number];
interface ChequeRow {
  id: string;
  chequeNumber: string;
  bankName: string;
  bankAccountNo: string;
  payeeName: string;
  amount: string;
  currency: string;
  chequeDate: string;
  chequeType: ChequeType;
  periodCovered: string;
  remarks: string;
}

const ASSET_TYPES = ["Villa","Apartment","Vehicle","Heavy Vehicle","Tower Site","Data Centre","Retail Outlet","Office","Warehouse","Fleet Vehicle","Network Equipment","Generator Site","Other"];
const VEHICLE_ASSET_TYPES = new Set(["Vehicle","Heavy Vehicle","Fleet Vehicle"]);
const FUEL_TYPES = ["Petrol","Diesel","Hybrid","Electric","LPG","CNG","Other"];
const CURRENCIES  = ["QAR","USD","GHS","EUR","GBP","ZAR","KES","NGN","ZMW"];
const FREQ_OPTIONS = ["Monthly","Quarterly","Semi-Annual","Annual"];

export default function NewLease() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();

  // ── Edit mode: read ?edit=<contractId> from URL ──
  const editContractId = (() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('edit');
    return v ? parseInt(v, 10) : null;
  })();
  const isEditMode = editContractId !== null;

  // Step 1 — Lessor
  const [lessor, setLessor] = useState({ name: "", contactPerson: "", email: "", phone: "", address: "", country: "QA", taxId: "", contractPreparedDate: new Date().toISOString().split("T")[0], createdDate: new Date().toISOString().split("T")[0] });
  const [selectedLessorId, setSelectedLessorId] = useState<number | null>(null);
  // Step 2 — Asset
  const [asset, setAsset] = useState({
    assetType: "Villa", assetName: "", assetCode: "", location: "Doha", country: "QA", gpsLat: "", gpsLng: "", maintenanceBy: "Lessor" as "Lessor"|"Vodafone",
    // Vehicle-specific fields
    vehicleMake: "", vehicleModel: "", vehicleYear: "", vehiclePlate: "", vehicleVIN: "", vehicleEngineCC: "", vehicleColour: "", vehicleFuelType: "Petrol",
  });
  // Step 3 — Financial
  const [financial, setFinancial] = useState({
    commencementDate: "", endDate: "", leaseTerm: "", currency: "QAR",
    rentAmount: "", paymentFrequency: "Monthly", escalationRate: "", escalationFrequency: "Annual",
    discountRate: "", securityDeposit: "", noticePeriod: "90",
    isLTO: false, ltoPrice: "", ltoDeposit: "", ltoInstalments: "", ltoRate: "", ltoBalloon: "",
    maintenanceBy: "Lessor" as "Lessor"|"Vodafone",
    initialDirectCosts: "", leaseIncentives: "",
    _autoDeposit: "" as string,
  });
  // Step 2 — Lessee Details
  const [lessee, setLessee] = useState({
    lesseeType: "Staff" as "Staff" | "Client" | "Other",
    lesseeName: "",
    staffNumber: "",
    staffId: null as number | null,
    grade: "",
    position: "",
    department: "",
    placeOfWork: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [savedContractId, setSavedContractId] = useState<number | null>(null);
  // Step 5 — Cheque Details
  const [cheques, setCheques] = useState<ChequeRow[]>([]);
  const addCheque = () => setCheques(prev => [...prev, { id: crypto.randomUUID(), chequeNumber: '', bankName: '', bankAccountNo: '', payeeName: '', amount: '', currency: 'QAR', chequeDate: new Date().toISOString().split('T')[0], chequeType: 'Rent', periodCovered: '', remarks: '' }]);
  const removeCheque = (id: string) => setCheques(prev => prev.filter(c => c.id !== id));
  const updateCheque = (id: string, field: keyof ChequeRow, value: string) => setCheques(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  // Step 6 — Documents
  const [docs, setDocs] = useState<{ name: string; type: string; file?: File }[]>([]);
  // Step 7 — computed preview
  const [ifrs16Result, setIfrs16Result] = useState<any>(null);
  const [day1JvResult, setDay1JvResult] = useState<{ jv_id: number; jv_number: string; rou_debit: number; liability_credit: number; result: string } | null>(null);
  const [day1JvError, setDay1JvError] = useState<string | null>(null);

  // Fetch existing lease data in edit mode
  const { data: editData } = trpc.lease.getLeaseById.useQuery(
    { contractId: editContractId! },
    { enabled: isEditMode, retry: false }
  );
  // Fetch existing lessee details in edit mode (separate table)
  const { data: lesseeEditData } = trpc.lease.getLesseeDetails.useQuery(
    { contractId: editContractId! },
    { enabled: isEditMode, retry: false }
  );

  // Pre-populate all form states when edit data loads
  useEffect(() => {
    if (!editData) return;
    const d = editData as Record<string, any>;
    // Step 1 — Lessor
    let contactPerson = '', email = '', phone = '';
    try {
      const c = JSON.parse(d.contact_json || '{}');
      contactPerson = c.name || ''; email = c.email || ''; phone = c.phone || '';
    } catch { /* ignore */ }
    setLessor({
      name: d.lessor_name || '',
      contactPerson,
      email,
      phone,
      address: (() => { try { return JSON.parse(d.location_json || '{}').address || ''; } catch { return ''; } })(),
      country: d.lessor_country || 'QA',
      taxId: d.tax_no || '',
      contractPreparedDate: d.created_at ? new Date(d.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      createdDate: d.created_at ? new Date(d.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    });
    // Step 3 — Asset
    let locCity = 'Doha', locCountry = 'QA', gpsLat = '', gpsLng = '';
    try {
      const loc = JSON.parse(d.location_json || '{}');
      locCity = loc.city || loc.address || 'Doha';
      locCountry = loc.country || 'QA';
      gpsLat = loc.lat ? String(loc.lat) : '';
      gpsLng = loc.lng ? String(loc.lng) : '';
    } catch { /* ignore */ }
    // Parse vehicle fields from asset_json if present
    let vehicleMake = '', vehicleModel = '', vehicleYear = '', vehiclePlate = '', vehicleVIN = '', vehicleEngineCC = '', vehicleColour = '', vehicleFuelType = 'Petrol';
    try {
      const vj = JSON.parse(d.asset_json || '{}');
      vehicleMake = vj.make || ''; vehicleModel = vj.model || ''; vehicleYear = vj.year || '';
      vehiclePlate = vj.plate || ''; vehicleVIN = vj.vin || ''; vehicleEngineCC = vj.engineCC || '';
      vehicleColour = vj.colour || ''; vehicleFuelType = vj.fuelType || 'Petrol';
    } catch { /* ignore */ }
    setAsset({
      assetType: d.asset_type || 'Villa',
      assetName: d.asset_description || '',
      assetCode: d.asset_tag || '',
      location: locCity,
      country: locCountry,
      gpsLat,
      gpsLng,
      maintenanceBy: (d.maintenance_responsibility === 'Vodafone' ? 'Vodafone' : 'Lessor') as 'Lessor' | 'Vodafone',
      vehicleMake, vehicleModel, vehicleYear, vehiclePlate, vehicleVIN, vehicleEngineCC, vehicleColour, vehicleFuelType,
    });
    // Step 4 — Financial Terms
    const toDateStr = (v: any) => v ? new Date(v).toISOString().split('T')[0] : '';
    setFinancial({
      commencementDate: toDateStr(d.commencement_date),
      endDate: toDateStr(d.expiry_date),
      leaseTerm: String(d.term_months || ''),
      currency: d.currency || 'QAR',
      rentAmount: String(d.monthly_payment || ''),
      paymentFrequency: 'Monthly',
      escalationRate: d.escalation_rate ? String(Number(d.escalation_rate) * 100) : '',
      escalationFrequency: 'Annual',
      discountRate: d.ibr ? String(Number(d.ibr) * 100) : '',
      securityDeposit: String(d.deposit_amount || ''),
      noticePeriod: '90',
      isLTO: Boolean(d.is_lto),
      ltoPrice: String(d.lto_purchase_price || ''),
      ltoDeposit: String(d.lto_deposit || ''),
      ltoInstalments: String(d.lto_total_instalments || ''),
      ltoRate: d.lto_finance_charge_rate ? String(Number(d.lto_finance_charge_rate) * 100) : '',
      ltoBalloon: String(d.lto_balloon_amount || ''),
      maintenanceBy: (d.maintenance_responsibility === 'Vodafone' ? 'Vodafone' : 'Lessor') as 'Lessor' | 'Vodafone',
      initialDirectCosts: String(d.initial_direct_costs || ''),
      leaseIncentives: String(d.lease_incentives || ''),
      _autoDeposit: '',
    });
    // Pre-set the savedContractId so the wizard updates rather than creates
    setSavedContractId(d.contract_id);
  }, [editData]);

  // Pre-populate lessee state when lessee edit data loads
  useEffect(() => {
    if (!lesseeEditData) return;
    const ld = lesseeEditData as Record<string, any>;
    setLessee({
      lesseeType:   (ld.lesseeType  as 'Staff' | 'Client' | 'Other') || 'Staff',
      lesseeName:   ld.lesseeName   || '',
      staffNumber:  ld.staffNumber  || '',
      staffId:      ld.staffId      || null,
      grade:        ld.grade        || '',
      position:     ld.position     || '',
      department:   ld.department   || '',
      placeOfWork:  ld.placeOfWork  || '',
      contactEmail: ld.contactEmail || '',
      contactPhone: ld.contactPhone || '',
    });
  }, [lesseeEditData]);

  const { data: lessors = [] } = trpc.lease.getLessors.useQuery({});
  // Lessor master dropdown
  const { data: lessorOptions = [] } = trpc.lessor.getLessorDropdown.useQuery(undefined, { staleTime: 60000 });
  // Staff master dropdown
  const { data: staffOptions = [] } = trpc.lessor.getStaffDropdown.useQuery({ searchTerm: undefined }, { staleTime: 60000 });
  const { data: subAssetGroupsRaw = [] } = trpc.asset.getSubAssetGroups.useQuery();
  // Parse sub-asset groups for display
  const subAssetGroups = subAssetGroupsRaw.map(r => {
    let items: {code:string;name:string;category:string;brand?:string;model?:string;spec?:string;qty:number;unitPrice?:number}[] = [];
    try { items = JSON.parse(r.tags || "[]"); } catch { /* ignore */ }
    const itemCount = items.reduce((s, l) => s + l.qty, 0);
    const totalQAR  = items.reduce((s, l) => s + (l.unitPrice ?? 0) * l.qty, 0);
    return { assetId: r.assetId, assetCode: r.assetCode, setName: r.setName, description: r.description, itemCount, totalQAR, items };
  });
  // Selected sub-asset set IDs for this lease
  const [selectedSetIds, setSelectedSetIds] = useState<number[]>([]);
  const [setPickerValue, setSetPickerValue] = useState<string>("none");
  // Expanded state per set card
  const [expandedSets, setExpandedSets] = useState<Record<number, boolean>>({});
  // Per-item detail fields
  type SetItemDetail = { serialNumber: string; leasedDate: string; warrantyEndDate: string; status: string };
  const [setItemDetails, setSetItemDetails] = useState<Record<string, SetItemDetail>>({});
  function toggleSetExpand(id: number) { setExpandedSets(prev => ({ ...prev, [id]: !prev[id] })); }
  function getItemKey(setId: number, code: string, unitIdx: number) { return `${setId}:${code}:${unitIdx}`; }
  function getItemDetail(setId: number, code: string, unitIdx: number): SetItemDetail {
    return setItemDetails[getItemKey(setId, code, unitIdx)] ?? { serialNumber: "", leasedDate: "", warrantyEndDate: "", status: "Active" };
  }
  function updateItemDetail(setId: number, code: string, unitIdx: number, field: keyof SetItemDetail, value: string) {
    const key = getItemKey(setId, code, unitIdx);
    setSetItemDetails(prev => ({ ...prev, [key]: { ...getItemDetail(setId, code, unitIdx), [field]: value } }));
  }
  const postDay1JVMutation = trpc.journalVoucher.postInitialRecognitionJV.useMutation({
    onSuccess: (data) => {
      if (data?.result === 'ALREADY_EXISTS') {
        toast.info(`Day-1 JV already exists: ${data.existing_jv_number}`);
      } else if (data?.jv_number) {
        setDay1JvResult(data);
        toast.success(`Day-1 Initial Recognition JV created: ${data.jv_number}`);
      }
    },
    onError: (e) => {
      setDay1JvError(e.message);
      toast.error("Day-1 JV creation failed: " + e.message);
    },
  });

  const computeMutation = trpc.genai.computeIFRS16.useMutation({
    onSuccess: (data) => setIfrs16Result(data),
    onError: (e) => toast.error("IFRS 16 computation failed: " + e.message),
  });

  // Derive term months from dates
  const termMonths = financial.commencementDate && financial.endDate
    ? Math.round((new Date(financial.endDate).getTime() - new Date(financial.commencementDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    : 0;
  // Monthly payment from rent amount + frequency
  const monthlyPayment = financial.rentAmount
    ? financial.paymentFrequency === "Monthly" ? Number(financial.rentAmount)
    : financial.paymentFrequency === "Quarterly" ? Number(financial.rentAmount) / 3
    : financial.paymentFrequency === "Semi-Annual" ? Number(financial.rentAmount) / 6
    : Number(financial.rentAmount) / 12
    : 0;
  const upsertLesseeMutation = trpc.lease.upsertLesseeDetails.useMutation({
    onError: (e) => toast.error("Failed to save lessee details: " + e.message),
  });
  const createLeaseMutation = trpc.lease.createLease.useMutation({
    onSuccess: async (result) => {
      // After lease created, save lessee details if provided
      if (result?.contract_id && lessee.lesseeName) {
        try {
          await upsertLesseeMutation.mutateAsync({
            contractId:   result.contract_id,
            lesseeType:   lessee.lesseeType,
            lesseeName:   lessee.lesseeName,
            staffNumber:  lessee.staffNumber || undefined,
            grade:        lessee.grade       || undefined,
            position:     lessee.position    || undefined,
            department:   lessee.department  || undefined,
            placeOfWork:  lessee.placeOfWork || undefined,
            contactEmail: lessee.contactEmail || undefined,
            contactPhone: lessee.contactPhone || undefined,
          });
        } catch (e: any) {
          toast.error("Failed to save lessee details: " + e.message);
        }
      }
      // Auto-post Day-1 Initial Recognition JV — MUST await before navigating
      if (result?.contract_id) {
        try {
          const jvResult = await postDay1JVMutation.mutateAsync({ contract_id: result.contract_id });
          if (jvResult?.jv_number) {
            toast.success(`Day-1 JV posted: ${jvResult.jv_number}`);
          } else if (jvResult?.result === 'ALREADY_EXISTS') {
            toast.info(`Day-1 JV already exists: ${jvResult.existing_jv_number}`);
          }
        } catch (e: any) {
          toast.error("Day-1 JV posting failed: " + e.message);
        }
      }
      toast.success("Lease created successfully!");
      setLocation("/leases");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLeaseMutation = trpc.lease.updateLease.useMutation({
    onSuccess: () => {
      toast.success("Lease updated successfully!");
      setLocation("/leases");
    },
    onError: (e) => toast.error(e.message),
  });

  const inputCls = "bg-background border-border text-foreground placeholder:text-muted-foreground";
  const labelCls = "text-sm font-medium text-foreground";

  const handleNext = () => {
    if (step === 1 && !selectedLessorId) {
      toast.error("Please select a Lessor / Company from the dropdown");
      return;
    }
    if (step === 2 && !lessee.staffId) {
      toast.error("Please select a Staff member from the Staff Number dropdown");
      return;
    }
    if (step === 2 && !lessee.lesseeName) {
      toast.error("Lessee name is required");
      return;
    }
    if (step === 4) {
      // Trigger IFRS 16 computation preview
      computeMutation.mutate({
        monthlyPayment,
        ibr: Number(financial.discountRate) / 100,
        termMonths,
        commencementDate: financial.commencementDate,
      });
    }
    setStep(s => Math.min(s + 1, 7));
  };

  const handleSubmit = () => {
    const sharedPayload = {
      assetType:         asset.assetType || "Other",
      assetDescription:  asset.assetName || "New Asset",
      assetTag:          asset.assetCode || undefined,
      location: {
        address:  asset.location,
        country:  lessor.country,
        coordinates: asset.gpsLat && asset.gpsLng ? { lat: Number(asset.gpsLat), lng: Number(asset.gpsLng) } : undefined,
      },
      commencementDate:  financial.commencementDate,
      expiryDate:        financial.endDate,
      termMonths,
      monthlyPayment,
      currency:          financial.currency,
      ibr:               Number(financial.discountRate) / 100,
      escalationRate:    Number(financial.escalationRate) / 100 || 0,
      depositAmount:     Number(financial.securityDeposit) || 0,
      initialDirectCosts: Number(financial.initialDirectCosts) || 0,
      leaseIncentives:   Number(financial.leaseIncentives) || 0,
      isLTO:             financial.isLTO,
      ltoPurchasePrice:  financial.isLTO ? Number(financial.ltoPrice) : undefined,
      ltoDeposit:        financial.isLTO ? Number(financial.ltoDeposit) : undefined,
      ltoTotalInstalments: financial.isLTO ? Number(financial.ltoInstalments) : undefined,
      ltoFinanceChargeRate: financial.isLTO ? Number(financial.ltoRate) / 100 : undefined,
      ltoBalloonAmount:  financial.isLTO ? Number(financial.ltoBalloon) : undefined,
      maintenanceResponsibility: asset.maintenanceBy as "Vodafone" | "Lessor" | "Shared",
    };

    if (isEditMode && editContractId) {
      updateLeaseMutation.mutate({ contractId: editContractId, ...sharedPayload });
    } else {
      createLeaseMutation.mutate({
        lessorId: selectedLessorId ?? 1,
        ...sharedPayload,
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <ScreenHeader
  screenId="VFLNEWLEA0001P001" screenType="new_lease"
  title={isEditMode ? "Modify Lease" : "New Lease Origination"}
  subtitle={isEditMode ? "Update existing lease contract details" : "IFRS 16 compliant lease creation wizard"}

          formType="new_lease"
          onAIFormFill={(data) => {
            // Map AI response keys → form state setters
            setLessor(l => ({
              ...l,
              name:          data.lessorName          ?? l.name,
              contactPerson: data.lessorContact        ?? l.contactPerson,
              email:         data.lessorEmail          ?? l.email,
              phone:         data.lessorPhone          ?? l.phone,
              address:       data.propertyAddress      ?? l.address,
              country:       "QA",
              taxId:         data.taxId                ?? l.taxId,
            }));
            setAsset(a => ({
              ...a,
              assetType: data.assetClass ?? a.assetType,
              assetName: data.leaseName  ?? a.assetName,
              location:  data.city       ?? a.location,
              country:   "QA",
              assetCode: data.assetCode  ?? a.assetCode,
              gpsLat:    data.gpsLat     ?? a.gpsLat,
              gpsLng:    data.gpsLng     ?? a.gpsLng,
            }));
            setFinancial(f => ({
              ...f,
              commencementDate: data.commencementDate  ?? f.commencementDate,
              endDate:          data.expiryDate         ?? f.endDate,
              currency:         data.currency           ?? f.currency,
              rentAmount:       data.monthlyRent        ?? f.rentAmount,
              paymentFrequency: data.rentFrequency === "MONTHLY" ? "Monthly"
                               : data.rentFrequency === "QUARTERLY" ? "Quarterly"
                               : data.rentFrequency === "ANNUALLY" ? "Annual"
                               : f.paymentFrequency,
              securityDeposit:  data.depositAmount      ?? f.securityDeposit,
              discountRate:     data.discountRate        ?? f.discountRate,
              escalationRate:   data.escalationRate      ?? f.escalationRate,
              noticePeriod:     data.noticePeriod        ?? f.noticePeriod,
            }));
            if (data.taxId) setLessor(l => ({ ...l, taxId: data.taxId ?? l.taxId }));
            // Map lessee fields
            setLessee(le => ({
              ...le,
              lesseeType:   (data.lesseeType as "Staff" | "Client" | "Other") ?? le.lesseeType,
              lesseeName:   data.lesseeName         ?? le.lesseeName,
              staffNumber:  data.staffNumber         ?? le.staffNumber,
              grade:        data.grade               ?? le.grade,
              position:     data.lesseePosition      ?? le.position,
              department:   data.lesseeDepartment    ?? le.department,
              placeOfWork:  data.placeOfWork         ?? le.placeOfWork,
              contactEmail: data.lesseeContactEmail  ?? le.contactEmail,
              contactPhone: data.lesseeContactPhone  ?? le.contactPhone,
            }));
          }}
        />

        {/* Step Indicator */}
        <div className="flex items-center mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <div className={`flex flex-col items-center gap-1 ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                  step > s.id ? "bg-green-500 border-green-500 text-white" :
                  step === s.id ? "bg-[#e60000] border-[#e60000] text-white" :
                  "bg-muted border-border text-muted-foreground"
                }`}>
                  {step > s.id ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${step === s.id ? "text-[#e60000]" : "text-muted-foreground"}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-2 ${step > s.id ? "bg-green-500" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">

          {/* ── Step 1: Lessor Details ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Step 1 — Lessor Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className={labelCls}>Lessor / Company Name *</Label>
                  <Select
                    value={selectedLessorId !== null ? String(selectedLessorId) : ""}
                    onValueChange={(val) => {
                      const opt = lessorOptions.find((o: any) => String(o.lessorId) === val);
                      if (!opt) return;
                      setSelectedLessorId(opt.lessorId);
                      setLessor(l => ({
                        ...l,
                        name:    opt.lessorName || '',
                        country: opt.country    || l.country,
                      }));
                    }}
                  >
                    <SelectTrigger className={inputCls}>
                      <SelectValue placeholder="Select lessor from master..." />
                    </SelectTrigger>
                    <SelectContent>
                      {lessorOptions.map((o: any) => (
                        <SelectItem key={o.lessorId} value={String(o.lessorId)}>
                          {o.lessorCode ? `[${o.lessorCode}] ` : ''}{o.lessorName || o.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className={labelCls}>Contact Person</Label>
                  <Input className={inputCls} placeholder="Full name" value={lessor.contactPerson} onChange={e => setLessor(l => ({ ...l, contactPerson: e.target.value }))} />
                </div>
                <div>
                  <Label className={labelCls}>Email</Label>
                  <Input className={inputCls} type="email" placeholder="contact@lessor.com" value={lessor.email} onChange={e => setLessor(l => ({ ...l, email: e.target.value }))} />
                </div>
                <div>
                  <Label className={labelCls}>Phone</Label>
                  <Input className={inputCls} placeholder="+974 XXXX XXXX" value={lessor.phone} onChange={e => setLessor(l => ({ ...l, phone: e.target.value }))} />
                </div>
                <div>
                  <Label className={labelCls}>Tax / VAT ID</Label>
                  <Input className={inputCls} placeholder="Tax registration number" value={lessor.taxId} onChange={e => setLessor(l => ({ ...l, taxId: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label className={labelCls}>Address</Label>
                  <Input className={inputCls} placeholder="Street, City, Region" value={lessor.address} onChange={e => setLessor(l => ({ ...l, address: e.target.value }))} />
                </div>
                <div>
                  <Label className={labelCls}>Country</Label>
                  <Select value={lessor.country} onValueChange={v => setLessor(l => ({ ...l, country: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QA">Qatar</SelectItem>
                      <SelectItem value="AE">UAE</SelectItem>
                      <SelectItem value="SA">Saudi Arabia</SelectItem>
                      <SelectItem value="KW">Kuwait</SelectItem>
                      <SelectItem value="BH">Bahrain</SelectItem>
                      <SelectItem value="OM">Oman</SelectItem>
                      <SelectItem value="GB">United Kingdom</SelectItem>
                      <SelectItem value="US">United States</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className={labelCls}>Contract Prepared Date *</Label>
                  <Input type="date" className={inputCls} value={lessor.contractPreparedDate} onChange={e => setLessor(l => ({ ...l, contractPreparedDate: e.target.value }))} />
                </div>
                <div>
                  <Label className={labelCls}>Created Date</Label>
                  <Input type="date" className={inputCls} value={lessor.createdDate} onChange={e => setLessor(l => ({ ...l, createdDate: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Lessee Details ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Step 2 — Lessee Details</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Screen ID: VFLSNEWLS0002P001</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  lessee.lesseeType === "Staff" ? "bg-blue-500/10 text-blue-400" :
                  lessee.lesseeType === "Client" ? "bg-green-500/10 text-green-400" :
                  "bg-muted text-muted-foreground"
                }`}>{lessee.lesseeType}</span>
              </div>

              {/* Identity Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <IdCard className="w-4 h-4" /><span>Identity</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className={labelCls}>Lessee Type *</Label>
                    <Select value={lessee.lesseeType} onValueChange={v => setLessee(l => ({ ...l, lesseeType: v as "Staff"|"Client"|"Other" }))}>
                      <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Staff">Staff (Employee)</SelectItem>
                        <SelectItem value="Client">Client</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className={labelCls}>Full Name *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input className={`${inputCls} pl-9`} placeholder="e.g. Mohammed Al-Thani" value={lessee.lesseeName} onChange={e => setLessee(l => ({ ...l, lesseeName: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Employment Details Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <Briefcase className="w-4 h-4" /><span>Employment Details</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label className={labelCls}>Staff Number *</Label>
                    <Select
                      value={lessee.staffId !== null ? String(lessee.staffId) : ""}
                      onValueChange={(val) => {
                        const staff = staffOptions.find((s: any) => String(s.staffId) === val);
                        if (!staff) return;
                        setLessee(l => ({
                          ...l,
                          staffId:      staff.staffId,
                          staffNumber:  staff.staffNumber,
                          lesseeName:   staff.fullName,
                          grade:        staff.grade        || l.grade,
                          position:     staff.position     || l.position,
                          department:   staff.department   || l.department,
                          placeOfWork:  staff.placeOfWork  || l.placeOfWork,
                          contactEmail: staff.email        || l.contactEmail,
                          contactPhone: staff.phone        || l.contactPhone,
                        }));
                      }}
                    >
                      <SelectTrigger className={inputCls}>
                        <SelectValue placeholder="Select staff member..." />
                      </SelectTrigger>
                      <SelectContent>
                        {staffOptions.map((s: any) => (
                          <SelectItem key={s.staffId} value={String(s.staffId)}>
                            {s.staffNumber} — {s.fullName} ({s.department})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className={labelCls}>Grade / Band</Label>
                    <Input className={inputCls} placeholder="e.g. Grade 7, Band 4, Senior Manager" value={lessee.grade} onChange={e => setLessee(l => ({ ...l, grade: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>Position / Job Title</Label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input className={`${inputCls} pl-9`} placeholder="e.g. Network Engineer" value={lessee.position} onChange={e => setLessee(l => ({ ...l, position: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label className={labelCls}>Department</Label>
                    <Input className={inputCls} placeholder="e.g. Network Operations" value={lessee.department} onChange={e => setLessee(l => ({ ...l, department: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>Place of Work</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input className={`${inputCls} pl-9`} placeholder="e.g. Vodafone Qatar HQ, West Bay" value={lessee.placeOfWork} onChange={e => setLessee(l => ({ ...l, placeOfWork: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <Phone className="w-4 h-4" /><span>Contact Information</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className={labelCls}>Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type="email" className={`${inputCls} pl-9`} placeholder="e.g. m.althani@vodafone.com.qa" value={lessee.contactEmail} onChange={e => setLessee(l => ({ ...l, contactEmail: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label className={labelCls}>Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input className={`${inputCls} pl-9`} placeholder="+974 XXXX XXXX" value={lessee.contactPhone} onChange={e => setLessee(l => ({ ...l, contactPhone: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* (Step 3 Asset Details content follows) */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Step 3 — Asset Details</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Screen ID: VFLSNEWLS0003P001</p>
                </div>
                {VEHICLE_ASSET_TYPES.has(asset.assetType) && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-500/10 text-amber-400">Vehicle Mode</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* Asset Type — always shown */}
                <div>
                  <Label className={labelCls}>Asset Type *</Label>
                  <Select value={asset.assetType} onValueChange={v => setAsset(a => ({ ...a, assetType: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue placeholder="Select asset type" /></SelectTrigger>
                    <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {/* Asset Name / Reference — label changes for vehicles */}
                <div>
                  <Label className={labelCls}>{VEHICLE_ASSET_TYPES.has(asset.assetType) ? "Vehicle Description *" : "Asset Name / Reference *"}</Label>
                  <Input className={inputCls} placeholder={VEHICLE_ASSET_TYPES.has(asset.assetType) ? "e.g. Toyota Land Cruiser GXR" : "e.g. GH-ACC-TOWER-001"} value={asset.assetName} onChange={e => setAsset(a => ({ ...a, assetName: e.target.value }))} />
                </div>
                {/* Asset Code / Fleet Code — always shown */}
                <div>
                  <Label className={labelCls}>{VEHICLE_ASSET_TYPES.has(asset.assetType) ? "Fleet Code" : "Asset Code"}</Label>
                  <Input className={inputCls} placeholder={VEHICLE_ASSET_TYPES.has(asset.assetType) ? "e.g. VQ-FLEET-001" : "Internal asset code"} value={asset.assetCode} onChange={e => setAsset(a => ({ ...a, assetCode: e.target.value }))} />
                </div>

                {/* ── PROPERTY fields (non-vehicle) ── */}
                {!VEHICLE_ASSET_TYPES.has(asset.assetType) && (<>
                  <div>
                    <Label className={labelCls}>Location / Address</Label>
                    <Input className={inputCls} placeholder="Physical location" value={asset.location} onChange={e => setAsset(a => ({ ...a, location: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>GPS Latitude</Label>
                    <Input className={inputCls} placeholder="5.6037" value={asset.gpsLat} onChange={e => setAsset(a => ({ ...a, gpsLat: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>GPS Longitude</Label>
                    <Input className={inputCls} placeholder="-0.1870" value={asset.gpsLng} onChange={e => setAsset(a => ({ ...a, gpsLng: e.target.value }))} />
                  </div>
                </>)}

                {/* ── VEHICLE fields ── */}
                {VEHICLE_ASSET_TYPES.has(asset.assetType) && (<>
                  <div>
                    <Label className={labelCls}>Make / Brand *</Label>
                    <Input className={inputCls} placeholder="e.g. Toyota, Nissan, BMW" value={asset.vehicleMake} onChange={e => setAsset(a => ({ ...a, vehicleMake: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>Model *</Label>
                    <Input className={inputCls} placeholder="e.g. Land Cruiser GXR, Patrol, X5" value={asset.vehicleModel} onChange={e => setAsset(a => ({ ...a, vehicleModel: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>Year of Manufacture</Label>
                    <Input className={inputCls} type="number" placeholder="e.g. 2023" min="1990" max="2030" value={asset.vehicleYear} onChange={e => setAsset(a => ({ ...a, vehicleYear: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>Registration / Plate Number *</Label>
                    <Input className={inputCls} placeholder="e.g. QA-12345" value={asset.vehiclePlate} onChange={e => setAsset(a => ({ ...a, vehiclePlate: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>VIN / Chassis Number</Label>
                    <Input className={inputCls} placeholder="17-character VIN" maxLength={17} value={asset.vehicleVIN} onChange={e => setAsset(a => ({ ...a, vehicleVIN: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>Engine Capacity (CC)</Label>
                    <Input className={inputCls} type="number" placeholder="e.g. 4000" value={asset.vehicleEngineCC} onChange={e => setAsset(a => ({ ...a, vehicleEngineCC: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>Colour</Label>
                    <Input className={inputCls} placeholder="e.g. White, Silver, Black" value={asset.vehicleColour} onChange={e => setAsset(a => ({ ...a, vehicleColour: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>Fuel Type</Label>
                    <Select value={asset.vehicleFuelType} onValueChange={v => setAsset(a => ({ ...a, vehicleFuelType: v }))}>
                      <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                      <SelectContent>{FUEL_TYPES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>)}

                {/* Maintenance Responsibility — always shown, vehicle-aware labels */}
                <div className="col-span-2">
                  <Label className={labelCls}>Maintenance Responsibility *</Label>
                  <Select value={asset.maintenanceBy} onValueChange={v => setAsset(a => ({ ...a, maintenanceBy: v as any }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VEHICLE_ASSET_TYPES.has(asset.assetType) ? (<>
                        <SelectItem value="Lessor">Lessor — Lessor / Fleet Company handles all servicing</SelectItem>
                        <SelectItem value="Vodafone">Vodafone — Vodafone arranges and pays for all servicing</SelectItem>
                        <SelectItem value="Shared">Shared — Routine by Vodafone, major repairs by Lessor</SelectItem>
                      </>) : (<>
                        <SelectItem value="Lessor">Lessor — Lessor is responsible for all maintenance</SelectItem>
                        <SelectItem value="Vodafone">Vodafone — Vodafone is responsible for maintenance</SelectItem>
                        <SelectItem value="Shared">Shared — Defined split of responsibilities</SelectItem>
                      </>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sub-Asset Sets — only for non-vehicle assets */}
                {!VEHICLE_ASSET_TYPES.has(asset.assetType) && (
                <div className="col-span-2 border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#e60000]" />
                    <Label className="text-sm font-semibold">Sub-Asset Sets (Furniture / Appliances)</Label>
                    <span className="text-xs text-muted-foreground font-normal ml-1">Attach pre-configured asset sets to this lease</span>
                  </div>
                  {/* Picker */}
                  <div className="flex gap-2">
                    <Select value={setPickerValue} onValueChange={v => {
                      if (v === "none") return;
                      const id = Number(v);
                      if (!selectedSetIds.includes(id)) setSelectedSetIds(prev => [...prev, id]);
                      setSetPickerValue("none");
                    }}>
                      <SelectTrigger className={`${inputCls} flex-1`}><SelectValue placeholder="Select a sub-asset set to attach..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Select a set —</SelectItem>
                        {subAssetGroups.filter(g => !selectedSetIds.includes(g.assetId)).map(g => (
                          <SelectItem key={g.assetId} value={String(g.assetId)}>
                            {g.assetCode} · {g.setName} ({g.itemCount} items)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Selected set cards — expandable accordion */}
                  {selectedSetIds.length > 0 && (
                    <div className="space-y-2 mt-1">
                      {selectedSetIds.map(id => {
                        const g = subAssetGroups.find(x => x.assetId === id);
                        if (!g) return null;
                        const isOpen = !!expandedSets[id];
                        return (
                          <div key={id} className="border border-border rounded-lg overflow-hidden">
                            <div
                              className="flex items-center justify-between bg-muted/40 px-4 py-3 cursor-pointer hover:bg-muted/60 transition-colors select-none"
                              onClick={() => toggleSetExpand(id)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`} />
                                <span className="text-xs font-mono text-[#e60000] shrink-0">{g.assetCode}</span>
                                <span className="text-sm font-medium truncate">{g.setName}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{g.itemCount} item{g.itemCount !== 1 ? "s" : ""}</span>
                                {g.totalQAR > 0 && <span className="text-xs text-muted-foreground shrink-0">· QAR {g.totalQAR.toLocaleString()}</span>}
                              </div>
                              <button
                                className="text-muted-foreground hover:text-red-400 transition-colors ml-3 shrink-0"
                                onClick={e => { e.stopPropagation(); setSelectedSetIds(prev => prev.filter(x => x !== id)); }}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            {isOpen && (
                              <div className="overflow-x-auto border-t border-border">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-muted/20 text-muted-foreground border-b border-border">
                                      <th className="text-left py-2 pl-4 pr-2 font-medium">#</th>
                                      <th className="text-left py-2 px-2 font-medium">Item</th>
                                      <th className="text-left py-2 px-2 font-medium">Category</th>
                                      <th className="text-left py-2 px-2 font-medium">Brand / Spec</th>
                                      <th className="text-left py-2 px-2 font-medium">Serial Number <span className="text-red-400">*</span></th>
                                      <th className="text-left py-2 px-2 font-medium">Leased Date <span className="text-red-400">*</span></th>
                                      <th className="text-left py-2 px-2 font-medium">Warranty End</th>
                                      <th className="text-left py-2 pl-2 pr-4 font-medium">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {g.items.flatMap((item, itemIdx) =>
                                      Array.from({ length: item.qty }, (_, unitIdx) => {
                                        const detail = getItemDetail(id, item.code, unitIdx);
                                        return (
                                          <tr key={`${id}-${itemIdx}-${unitIdx}`} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                                            <td className="py-2 pl-4 pr-2 text-muted-foreground">{itemIdx + 1}{item.qty > 1 ? `.${unitIdx + 1}` : ""}</td>
                                            <td className="py-2 px-2 font-medium">{item.name}</td>
                                            <td className="py-2 px-2 text-muted-foreground">{item.category}</td>
                                            <td className="py-2 px-2 text-muted-foreground">{[item.brand, item.spec].filter(Boolean).join(" · ") || "—"}</td>
                                            <td className="py-1.5 px-2">
                                              <Input className="h-7 text-xs px-2 bg-background border-border" placeholder="SN-XXXXXXXX"
                                                value={detail.serialNumber}
                                                onChange={e => updateItemDetail(id, item.code, unitIdx, "serialNumber", e.target.value)} />
                                            </td>
                                            <td className="py-1.5 px-2">
                                              <Input type="date" className="h-7 text-xs px-2 bg-background border-border"
                                                value={detail.leasedDate}
                                                onChange={e => updateItemDetail(id, item.code, unitIdx, "leasedDate", e.target.value)} />
                                            </td>
                                            <td className="py-1.5 px-2">
                                              <Input type="date" className="h-7 text-xs px-2 bg-background border-border"
                                                value={detail.warrantyEndDate}
                                                onChange={e => updateItemDetail(id, item.code, unitIdx, "warrantyEndDate", e.target.value)} />
                                            </td>
                                            <td className="py-1.5 pl-2 pr-4">
                                              <Select value={detail.status} onValueChange={v => updateItemDetail(id, item.code, unitIdx, "status", v)}>
                                                <SelectTrigger className="h-7 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="Active">Active</SelectItem>
                                                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                                                  <SelectItem value="Returned">Returned</SelectItem>
                                                  <SelectItem value="BackIn">Back In</SelectItem>
                                                  <SelectItem value="Replaced">Replaced</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {selectedSetIds.length === 0 && (
                    <p className="text-xs text-muted-foreground">No sets attached. This is optional — leave empty if the property is unfurnished.</p>
                  )}
                </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: Financial Terms ── */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Step 4 — Financial & Lease Terms</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={labelCls}>Commencement Date *</Label>
                  <Input className={inputCls} type="date" value={financial.commencementDate} onChange={e => setFinancial(f => ({ ...f, commencementDate: e.target.value }))} />
                </div>
                <div>
                  <Label className={labelCls}>End Date *</Label>
                  <Input className={inputCls} type="date" value={financial.endDate} onChange={e => setFinancial(f => ({ ...f, endDate: e.target.value }))} />
                </div>
                <div>
                  <Label className={labelCls}>Currency *</Label>
                  <Select value={financial.currency} onValueChange={v => setFinancial(f => ({ ...f, currency: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className={labelCls}>Rent Amount *</Label>
                  <Input className={inputCls} type="number" placeholder="0.00" value={financial.rentAmount} onChange={e => {
                    const rent = e.target.value;
                    setFinancial(f => {
                      // Auto-set deposit to 1 month rent if user hasn't manually overridden it
                      const monthlyRent = f.paymentFrequency === 'Monthly' ? Number(rent)
                        : f.paymentFrequency === 'Quarterly' ? Number(rent) / 3
                        : f.paymentFrequency === 'Semi-Annual' ? Number(rent) / 6
                        : Number(rent) / 12;
                      const autoDeposit = monthlyRent > 0 ? String(Math.round(monthlyRent * 100) / 100) : '';
                      const depositUnchanged = !f.securityDeposit || f.securityDeposit === '0' || f.securityDeposit === f._autoDeposit;
                      return { ...f, rentAmount: rent, ...(depositUnchanged ? { securityDeposit: autoDeposit, _autoDeposit: autoDeposit } : {}) };
                    });
                  }} />
                </div>
                <div>
                  <Label className={labelCls}>Payment Frequency *</Label>
                  <Select value={financial.paymentFrequency} onValueChange={v => setFinancial(f => ({ ...f, paymentFrequency: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>{FREQ_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className={labelCls}>Discount Rate (IBR %) *</Label>
                  <Input className={inputCls} type="number" step="0.01" placeholder="e.g. 8.5" value={financial.discountRate} onChange={e => setFinancial(f => ({ ...f, discountRate: e.target.value }))} />
                </div>
                <div>
                  <Label className={labelCls}>Escalation Rate (%)</Label>
                  <Input className={inputCls} type="number" step="0.01" placeholder="e.g. 5.0" value={financial.escalationRate} onChange={e => setFinancial(f => ({ ...f, escalationRate: e.target.value }))} />
                </div>
                <div>
                  <Label className={labelCls}>Escalation Frequency</Label>
                  <Select value={financial.escalationFrequency} onValueChange={v => setFinancial(f => ({ ...f, escalationFrequency: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>{FREQ_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className={labelCls}>Security Deposit</Label>
                  <Input className={inputCls} type="number" placeholder="0.00" value={financial.securityDeposit} onChange={e => setFinancial(f => ({ ...f, securityDeposit: e.target.value, _autoDeposit: f._autoDeposit }))} />
                  <p className="text-xs text-muted-foreground mt-1">Default: 1 month rent. Adjust if different (e.g. 2 months).</p>
                </div>
                <div>
                  <Label className={labelCls}>Notice Period (days)</Label>
                  <Input className={inputCls} type="number" placeholder="90" value={financial.noticePeriod} onChange={e => setFinancial(f => ({ ...f, noticePeriod: e.target.value }))} />
                </div>
                <div>
                  <Label className={labelCls}>Initial Direct Costs (IDC)</Label>
                  <Input className={inputCls} type="number" placeholder="0.00" value={financial.initialDirectCosts} onChange={e => setFinancial(f => ({ ...f, initialDirectCosts: e.target.value }))} />
                  <p className="text-xs text-muted-foreground mt-1">Legal fees, broker commissions, registration costs capitalised into ROU asset</p>
                </div>
                <div>
                  <Label className={labelCls}>Lease Incentives Received</Label>
                  <Input className={inputCls} type="number" placeholder="0.00" value={financial.leaseIncentives} onChange={e => setFinancial(f => ({ ...f, leaseIncentives: e.target.value }))} />
                  <p className="text-xs text-muted-foreground mt-1">Cash or rent-free periods received from lessor — reduces ROU asset value</p>
                </div>

                {/* LTO Option */}
                <div className="col-span-2 border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Checkbox id="lto" checked={financial.isLTO} onCheckedChange={v => setFinancial(f => ({ ...f, isLTO: !!v }))} />
                    <Label htmlFor="lto" className="text-sm font-semibold cursor-pointer">
                      Lease-to-Own (LTO) Option
                      <span className="ml-2 text-xs text-muted-foreground font-normal">Configure this lease as a finance lease with ownership transfer</span>
                    </Label>
                  </div>
                  {financial.isLTO && (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div>
                        <Label className={labelCls}>Purchase Price</Label>
                        <Input className={inputCls} type="number" placeholder="0.00" value={financial.ltoPrice} onChange={e => setFinancial(f => ({ ...f, ltoPrice: e.target.value }))} />
                      </div>
                      <div>
                        <Label className={labelCls}>Deposit Amount</Label>
                        <Input className={inputCls} type="number" placeholder="0.00" value={financial.ltoDeposit} onChange={e => setFinancial(f => ({ ...f, ltoDeposit: e.target.value }))} />
                      </div>
                      <div>
                        <Label className={labelCls}>Total Instalments</Label>
                        <Input className={inputCls} type="number" placeholder="e.g. 60" value={financial.ltoInstalments} onChange={e => setFinancial(f => ({ ...f, ltoInstalments: e.target.value }))} />
                      </div>
                      <div>
                        <Label className={labelCls}>Finance Charge Rate (%)</Label>
                        <Input className={inputCls} type="number" step="0.01" placeholder="e.g. 12.5" value={financial.ltoRate} onChange={e => setFinancial(f => ({ ...f, ltoRate: e.target.value }))} />
                      </div>
                      <div>
                        <Label className={labelCls}>Balloon Payment</Label>
                        <Input className={inputCls} type="number" placeholder="0.00" value={financial.ltoBalloon} onChange={e => setFinancial(f => ({ ...f, ltoBalloon: e.target.value }))} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 5: Cheque Details ── */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Step 5 — Cheque Details</h2>
                <Button size="sm" variant="outline" onClick={addCheque} className="gap-1.5">
                  <Plus className="w-4 h-4" /> Add Cheque
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Record post-dated or security cheques associated with this lease. These will be tracked in the Cheque Register.</p>
              {cheques.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-xl gap-3 text-muted-foreground">
                  <CreditCard className="w-10 h-10 opacity-30" />
                  <p className="text-sm">No cheques added yet. This step is optional.</p>
                  <Button size="sm" onClick={addCheque} className="bg-[#e60000] hover:bg-[#cc0000] text-white gap-1.5">
                    <Plus className="w-4 h-4" /> Add Cheque
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {cheques.map((ch, idx) => (
                    <div key={ch.id} className="border border-border rounded-xl p-4 space-y-3 bg-muted/10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-[#e60000]">Cheque #{idx + 1}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeCheque(ch.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Cheque Number *</Label>
                          <Input className="h-9 text-sm bg-muted/30" value={ch.chequeNumber} onChange={e => updateCheque(ch.id, 'chequeNumber', e.target.value)} placeholder="e.g. 000123" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Bank Name *</Label>
                          <Input className="h-9 text-sm bg-muted/30" value={ch.bankName} onChange={e => updateCheque(ch.id, 'bankName', e.target.value)} placeholder="e.g. Qatar National Bank" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Bank Account No.</Label>
                          <Input className="h-9 text-sm bg-muted/30" value={ch.bankAccountNo} onChange={e => updateCheque(ch.id, 'bankAccountNo', e.target.value)} placeholder="e.g. 0012345678" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Payee Name *</Label>
                          <Input className="h-9 text-sm bg-muted/30" value={ch.payeeName} onChange={e => updateCheque(ch.id, 'payeeName', e.target.value)} placeholder="e.g. Emaar Properties PJSC" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Amount *</Label>
                          <Input className="h-9 text-sm bg-muted/30" type="number" min="0" step="0.01" value={ch.amount} onChange={e => updateCheque(ch.id, 'amount', e.target.value)} placeholder="e.g. 15000.00" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Currency</Label>
                          <Select value={ch.currency} onValueChange={v => updateCheque(ch.id, 'currency', v)}>
                            <SelectTrigger className="h-9 text-sm bg-muted/30"><SelectValue /></SelectTrigger>
                            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Cheque Date *</Label>
                          <Input type="date" className="h-9 text-sm bg-muted/30" value={ch.chequeDate} onChange={e => updateCheque(ch.id, 'chequeDate', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Cheque Type</Label>
                          <Select value={ch.chequeType} onValueChange={v => updateCheque(ch.id, 'chequeType', v as ChequeType)}>
                            <SelectTrigger className="h-9 text-sm bg-muted/30"><SelectValue /></SelectTrigger>
                            <SelectContent>{CHEQUE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Period Covered</Label>
                          <Input className="h-9 text-sm bg-muted/30" value={ch.periodCovered} onChange={e => updateCheque(ch.id, 'periodCovered', e.target.value)} placeholder="e.g. Jan 2026 – Dec 2026" />
                        </div>
                        <div className="space-y-1 col-span-2 sm:col-span-3">
                          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Remarks</Label>
                          <Input className="h-9 text-sm bg-muted/30" value={ch.remarks} onChange={e => updateCheque(ch.id, 'remarks', e.target.value)} placeholder="Optional notes" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 6: Documents ── */}
          {step === 6 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Step 5 — Document Upload</h2>
              <p className="text-sm text-muted-foreground">Upload the signed lease agreement and supporting documents. GPT-4o OCR will extract key terms automatically.</p>
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center space-y-3">
                <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Drag & drop files or click to browse</p>
                <p className="text-xs text-muted-foreground">Supported: PDF, DOCX, JPG, PNG · Max 25MB per file</p>
                <input type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png"
                  className="hidden" id="doc-upload"
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    setDocs(files.map(f => ({ name: f.name, type: f.type, file: f })));
                  }} />
                <Button variant="outline" onClick={() => document.getElementById("doc-upload")?.click()}>Browse Files</Button>
              </div>
              {docs.length > 0 && (
                <div className="space-y-2">
                  {docs.map((d, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span>{d.name}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setDocs(ds => ds.filter((_, j) => j !== i))}>Remove</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 7: Review & Post ── */}
          {step === 7 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Step 6 — Review & Post</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="col-span-2 bg-muted/50 rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold text-foreground">Lessor</h3>
                  <p className="text-muted-foreground">{lessor.name || "—"} · {lessor.country || "—"}</p>
                </div>
                <div className="col-span-2 bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-400" />
                    <h3 className="font-semibold text-foreground">Lessee</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      lessee.lesseeType === "Staff" ? "bg-blue-500/20 text-blue-400" :
                      lessee.lesseeType === "Client" ? "bg-green-500/20 text-green-400" :
                      "bg-muted text-muted-foreground"
                    }`}>{lessee.lesseeType}</span>
                  </div>
                  {lessee.lesseeName ? (
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div><span className="text-muted-foreground text-xs">Name</span><br /><span className="font-medium">{lessee.lesseeName}</span></div>
                      {lessee.staffNumber && <div><span className="text-muted-foreground text-xs">Staff No.</span><br /><span>{lessee.staffNumber}</span></div>}
                      {lessee.grade && <div><span className="text-muted-foreground text-xs">Grade</span><br /><span>{lessee.grade}</span></div>}
                      {lessee.position && <div><span className="text-muted-foreground text-xs">Position</span><br /><span>{lessee.position}</span></div>}
                      {lessee.department && <div><span className="text-muted-foreground text-xs">Department</span><br /><span>{lessee.department}</span></div>}
                      {lessee.placeOfWork && <div><span className="text-muted-foreground text-xs">Place of Work</span><br /><span>{lessee.placeOfWork}</span></div>}
                      {lessee.contactEmail && <div><span className="text-muted-foreground text-xs">Email</span><br /><span>{lessee.contactEmail}</span></div>}
                      {lessee.contactPhone && <div><span className="text-muted-foreground text-xs">Phone</span><br /><span>{lessee.contactPhone}</span></div>}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No lessee details provided.</p>
                  )}
                </div>
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold text-foreground">Asset</h3>
                  <p className="text-muted-foreground">{asset.assetType || "—"} · {asset.assetName || "—"}</p>
                  <p className="text-muted-foreground">Maintenance: {asset.maintenanceBy}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold text-foreground">Financial Terms</h3>
                  <p className="text-muted-foreground">{financial.commencementDate} → {financial.endDate}</p>
                  <p className="text-muted-foreground">{financial.currency} {Number(financial.rentAmount).toLocaleString()} / {financial.paymentFrequency}</p>
                  <p className="text-muted-foreground">IBR: {financial.discountRate}%</p>
                  {financial.isLTO && <p className="text-amber-500 font-medium">LTO Option: {financial.currency} {Number(financial.ltoPrice).toLocaleString()}</p>}
                </div>
                {ifrs16Result && (
                  <div className="col-span-2 bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-2">
                    <h3 className="font-semibold text-green-400">IFRS 16 Computation</h3>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Lease Liability:</span><br /><span className="font-bold">{financial.currency} {Number(ifrs16Result.leaseLiability ?? 0).toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground">ROU Asset:</span><br /><span className="font-bold">{financial.currency} {Number(ifrs16Result.rouAssetValue ?? 0).toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground">Term:</span><br /><span className="font-bold">{termMonths} months</span></div>
                    </div>
                  </div>
                )}
                {computeMutation.isPending && (
                  <div className="col-span-2 text-center text-muted-foreground text-sm py-4">Computing IFRS 16 values...</div>
                )}

                {/* Sub-Asset Sets Summary */}
                <div className="col-span-2 bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#e60000]" />
                    <h3 className="font-semibold text-foreground">Sub-Asset Sets</h3>
                    {selectedSetIds.length > 0 && (
                      <span className="text-xs bg-[#e60000]/20 text-[#e60000] px-2 py-0.5 rounded-full">{selectedSetIds.length} set{selectedSetIds.length !== 1 ? "s" : ""} attached</span>
                    )}
                  </div>
                  {selectedSetIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No sub-asset sets attached (unfurnished).</p>
                  ) : (
                    <table className="w-full text-sm mt-1">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="text-left py-1 pr-4">Set Code</th>
                          <th className="text-left py-1 pr-4">Set Name</th>
                          <th className="text-left py-1 pr-4">Items</th>
                          <th className="text-left py-1">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSetIds.map(id => {
                          const g = subAssetGroups.find(x => x.assetId === id);
                          if (!g) return null;
                          return (
                            <tr key={id} className="border-b border-border/50">
                              <td className="py-1.5 pr-4 font-mono text-xs text-[#e60000]">{g.assetCode}</td>
                              <td className="py-1.5 pr-4 font-medium">{g.setName}</td>
                              <td className="py-1.5 pr-4 text-muted-foreground">{g.itemCount}</td>
                              <td className="py-1.5 text-muted-foreground text-xs truncate max-w-[200px]">{g.description || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              {/* Day-1 JV Preview */}
              <div className="col-span-2 border border-[#e60000]/30 bg-[#e60000]/5 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#e60000]" />
                  <h3 className="font-semibold text-foreground text-sm">Day-1 IFRS 16 Journal Entry (Auto-Generated on Submit)</h3>
                  <span className="text-xs bg-[#e60000]/20 text-[#e60000] px-2 py-0.5 rounded-full">Initial Recognition</span>
                </div>
                <p className="text-xs text-muted-foreground">The following journal entry will be automatically created in the JV Register when this lease is submitted.</p>
                {(() => {
                      const assetType = asset.assetType;
                      const rouCode = VEHICLE_ASSET_TYPES.has(assetType) ? '10110' : assetType.includes('Tower') ? '10140' : assetType.includes('Equipment') ? '10120' : '10100';
                      const liabCode = VEHICLE_ASSET_TYPES.has(assetType) ? '21030' : assetType.includes('Tower') ? '21060' : assetType.includes('Equipment') ? '21040' : '21020';
                      const rouName = VEHICLE_ASSET_TYPES.has(assetType) ? 'ROU Asset — Vehicles & Fleet' : assetType.includes('Tower') ? 'ROU Asset — Tower Sites' : assetType.includes('Equipment') ? 'ROU Asset — Equipment' : 'ROU Asset — Property';
                      const liabName = VEHICLE_ASSET_TYPES.has(assetType) ? 'Lease Liability — Vehicles' : assetType.includes('Tower') ? 'Lease Liability — Tower Sites' : assetType.includes('Equipment') ? 'Lease Liability — Equipment' : 'Lease Liability — Property';
                      const idc = Number(financial.initialDirectCosts) || 0;
                      const incentives = Number(financial.leaseIncentives) || 0;
                      const deposit = Number(financial.securityDeposit) || 0;
                      const liability = ifrs16Result?.leaseLiability ?? 0;
                      const rouDebit = liability + idc - incentives;
                      const cur = financial.currency;
                      const fmtN = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      const fmt = (n: number) => n > 0 ? `${cur} ${fmtN(n)}` : '—';
                      const ibrPct = (Number(financial.discountRate) || 0);
                      const ibrAnnual = ibrPct.toFixed(4);
                      const monthlyRate = (ibrPct / 12);
                      const monthlyRateStr = monthlyRate.toFixed(6);
                      const n = termMonths;

                      const pvFormula = `PV = Monthly Payment × [(1 − (1 + r)⁻ⁿ) / r]\nPV = ${fmtN(monthlyPayment)} × [(1 − (1 + ${monthlyRateStr})⁻${n}) / ${monthlyRateStr}]\nPV = ${fmtN(liability)}`;
                      const rouCalc = `ROU Asset = PV of Lease Payments + IDC − Lease Incentives\nROU Asset = ${fmtN(liability)} + ${fmtN(idc)} − ${fmtN(incentives)}\nROU Asset = ${fmtN(rouDebit)}\n\nWhere:\n  Monthly Payment = ${fmtN(monthlyPayment)} ${cur}\n  IBR (annual) = ${ibrAnnual}%\n  Monthly Rate (r) = ${ibrAnnual}% / 12 = ${monthlyRateStr}%\n  Lease Term (n) = ${n} months\n\n${pvFormula}`;
                      const liabCalc = `Lease Liability = PV of future lease payments discounted at IBR\n\n${pvFormula}\n\nWhere:\n  Monthly Payment = ${fmtN(monthlyPayment)} ${cur}\n  IBR (annual) = ${ibrAnnual}%\n  Monthly Rate (r) = ${monthlyRateStr}%\n  Lease Term (n) = ${n} months`;
                      const idcCalc = `Initial Direct Costs (IDC)\n= Legal fees + Broker commissions + Registration costs\n= ${fmtN(idc)} ${cur}\n\nThese costs are capitalised into the ROU Asset\nand accrued as a liability until paid.\n\nImpact on ROU: ROU = PV + IDC − Incentives\n             = ${fmtN(liability)} + ${fmtN(idc)} − ${fmtN(incentives)}\n             = ${fmtN(rouDebit)}`;
                      const incentiveCalc = `Lease Incentives Received\n= Cash or rent-free periods received from lessor\n= ${fmtN(incentives)} ${cur}\n\nIncentives reduce the ROU Asset carrying value.\n\nImpact on ROU: ROU = PV + IDC − Incentives\n             = ${fmtN(liability)} + ${fmtN(idc)} − ${fmtN(incentives)}\n             = ${fmtN(rouDebit)}`;
                      const depositDrCalc = `Security Deposit = Refundable deposit paid to lessor\nDeposit = ${fmtN(deposit)} ${cur}\n\nRecognised as a non-current asset (receivable).\nRefundable at lease end or early termination.\n\nDefault = 1 month rent = ${fmtN(monthlyPayment)} ${cur}`;
                      const depositCrCalc = `Bank Payment for Security Deposit\nAmount = ${fmtN(deposit)} ${cur}\n\nCash outflow from operating bank account\nto lessor for refundable security deposit.`;

                      // Build JV lines for grouping
                      const jvLines: JVLine[] = [];
                      jvLines.push({ dr_cr: 'Dr', account_code: rouCode, account_name: rouName, amount: rouDebit, calc_explanation: rouCalc });
                      jvLines.push({ dr_cr: 'Cr', account_code: liabCode, account_name: liabName, amount: liability, calc_explanation: liabCalc });
                      if (idc > 0) jvLines.push({ dr_cr: 'Cr', account_code: '20020', account_name: 'Accrued Initial Direct Costs', amount: idc, calc_explanation: idcCalc });
                      if (incentives > 0) jvLines.push({ dr_cr: 'Dr', account_code: '11000', account_name: 'Bank Account — Incentive Received', amount: incentives, calc_explanation: incentiveCalc });
                      if (deposit > 0) {
                        jvLines.push({ dr_cr: 'Dr', account_code: '12020', account_name: 'Security Deposit — Lease', amount: deposit, calc_explanation: depositDrCalc });
                        jvLines.push({ dr_cr: 'Cr', account_code: '11000', account_name: 'Bank Account — QAR Operating', amount: deposit, calc_explanation: depositCrCalc });
                      }

                      const groups = groupDrCrByAmount(jvLines);
                      const totalDr = jvLines.filter(l => l.dr_cr === 'Dr').reduce((s, l) => s + l.amount, 0);
                      const totalCr = jvLines.filter(l => l.dr_cr === 'Cr').reduce((s, l) => s + l.amount, 0);

                      return (
                        <div className="space-y-3">
                          {groups.map((group, gIdx) => (
                            <div key={group.id} className={gIdx > 0 ? 'border-t border-amber-500/20 pt-3' : ''}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">Group {gIdx + 1}</span>
                                <span className="text-[10px] text-muted-foreground">{group.label}</span>
                                {group.balanced && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">Balanced</span>}
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-border text-xs text-muted-foreground">
                                    <th className="text-left py-1 w-8"></th>
                                    <th className="text-left py-1 w-10">Dr/Cr</th>
                                    <th className="text-left py-1 pr-4">Account Code</th>
                                    <th className="text-left py-1 pr-4">Account Name</th>
                                    <th className="text-right py-1 pr-4">Debit</th>
                                    <th className="text-right py-1">Credit</th>
                                  </tr>
                                </thead>
                                <tbody className="text-xs">
                                  {[...group.drLines, ...group.crLines].map((line, lIdx) => (
                                    <tr key={lIdx} className={`border-b border-border/30 ${line.dr_cr === 'Dr' ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`}>
                                      <td className="py-1.5 pl-1">
                                        <CalcExplanationInline explanation={line.calc_explanation ?? null} />
                                      </td>
                                      <td className="py-1.5">
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${line.dr_cr === 'Dr' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>{line.dr_cr}</span>
                                      </td>
                                      <td className="py-1.5 pr-4 font-mono text-[#e60000]">{line.account_code}</td>
                                      <td className="py-1.5 pr-4">{line.account_name}</td>
                                      <td className="py-1.5 pr-4 text-right font-medium font-mono text-emerald-500">{line.dr_cr === 'Dr' ? fmt(line.amount) : '—'}</td>
                                      <td className="py-1.5 text-right font-medium font-mono text-rose-500">{line.dr_cr === 'Cr' ? fmt(line.amount) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                          {/* Grand Total */}
                          <div className="border-t-2 border-border pt-2 flex justify-end gap-8 text-xs font-semibold">
                            <span>Total Debit: <span className="font-mono text-emerald-500">{fmt(totalDr)}</span></span>
                            <span>Total Credit: <span className="font-mono text-rose-500">{fmt(totalCr)}</span></span>
                          </div>
                        </div>
                      );
                    })()}
                {!ifrs16Result && (
                  <p className="text-xs text-amber-500">Note: IFRS 16 computation not yet run — go back to Step 4 and click Next to compute lease liability before reviewing.</p>
                )}
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-sm text-emerald-400">
                <strong>Auto-Post:</strong> The Day-1 IFRS 16 Journal Entry above will be automatically posted to the Journal Voucher Register when you submit this lease. No additional approval is required.
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={() => step === 1 ? setLocation("/leases") : setStep(s => s - 1)} disabled={createLeaseMutation.isPending || updateLeaseMutation.isPending}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < 7 ? (
            <Button onClick={handleNext} className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={computeMutation.isPending}>
              {step === 2 ? "Save & Continue" : "Next"} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} className="bg-[#e60000] hover:bg-[#cc0000] text-white" disabled={createLeaseMutation.isPending || updateLeaseMutation.isPending}>
              {(createLeaseMutation.isPending || updateLeaseMutation.isPending) ? "Saving..." : isEditMode ? "Update Lease" : "Submit for Approval"}
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
