/**
 * VodaLease Enterprise — Heroine Seed Script
 * Seeds: lessors, staff, leases (20 contracts across all types),
 *        amortisation schedules, JVs (Day-1 + monthly), invoices,
 *        payment runs, cheques, insurance, maintenance, workflows,
 *        maker-checker queue, audit log.
 */
import sql from 'mssql';

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
function toDate(d) { return d.toISOString().split('T')[0]; }
function fmtRef(prefix, n, pad = 4) { return `${prefix}-${String(n).padStart(pad, '0')}`; }

/**
 * Compute IFRS 16 amortisation schedule (present value of lease payments)
 * Returns array of monthly periods.
 */
function computeAmortisation(monthlyPayment, ibr, termMonths, commencementDate, idc = 0, incentives = 0) {
  const monthlyRate = ibr / 12;
  // PV of annuity
  const pv = monthlyRate === 0
    ? monthlyPayment * termMonths
    : monthlyPayment * (1 - Math.pow(1 + monthlyRate, -termMonths)) / monthlyRate;
  const rouAsset = pv + idc - incentives;
  const monthlyDepr = rouAsset / termMonths;

  const schedule = [];
  let openingLiability = pv;
  let rouNbv = rouAsset;
  let cumDepr = 0;

  for (let i = 0; i < termMonths; i++) {
    const periodDate = addMonths(commencementDate, i);
    const interest = openingLiability * monthlyRate;
    const principal = monthlyPayment - interest;
    const closingLiability = Math.max(0, openingLiability - principal);
    rouNbv -= monthlyDepr;
    cumDepr += monthlyDepr;

    schedule.push({
      period_date: toDate(periodDate),
      opening_liability: Math.round(openingLiability * 100) / 100,
      interest_expense: Math.round(interest * 100) / 100,
      payment: Math.round(monthlyPayment * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      closing_liability: Math.round(closingLiability * 100) / 100,
      rou_nbv: Math.round(Math.max(0, rouNbv) * 100) / 100,
      depreciation: Math.round(monthlyDepr * 100) / 100,
      cumulative_depr: Math.round(cumDepr * 100) / 100,
      posting_status: i < 16 ? 'Posted' : 'Pending',  // first 16 months posted
    });
    openingLiability = closingLiability;
  }
  return { schedule, pv, rouAsset };
}

// ─── Master Data ─────────────────────────────────────────────────────────────
const LESSORS = [
  { name: 'Al Faisal Real Estate W.L.L.', type: 'Individual', regNo: 'QAT-RE-00234', taxId: 'TAX-QA-00234', country: 'QA', city: 'Doha', address: 'Al Sadd Street, Building 12, Doha', currency: 'QAR', creditRating: 'A', paymentTerms: 30 },
  { name: 'Barwa Real Estate Company Q.P.S.C.', type: 'Corporate', regNo: 'QAT-RE-00891', taxId: 'TAX-QA-00891', country: 'QA', city: 'Lusail', address: 'Lusail City, Marina District, Tower 3', currency: 'QAR', creditRating: 'AA', paymentTerms: 30 },
  { name: 'Ezdan Holding Group Q.P.S.C.', type: 'Corporate', regNo: 'QAT-RE-01102', taxId: 'TAX-QA-01102', country: 'QA', city: 'Al Wakra', address: 'Ezdan Village, Al Wakra', currency: 'QAR', creditRating: 'A+', paymentTerms: 30 },
  { name: 'Doha Tower Properties W.L.L.', type: 'Corporate', regNo: 'QAT-RE-01455', taxId: 'TAX-QA-01455', country: 'QA', city: 'West Bay', address: 'West Bay, Diplomatic Area, P.O. Box 5544', currency: 'QAR', creditRating: 'BBB+', paymentTerms: 45 },
  { name: 'Qatar National Fleet Services W.L.L.', type: 'Corporate', regNo: 'QAT-FL-00312', taxId: 'TAX-QA-00312', country: 'QA', city: 'Industrial Area', address: 'Industrial Area, Street 4, Zone 56', currency: 'QAR', creditRating: 'A', paymentTerms: 30 },
  { name: 'Gulf Tower Infrastructure L.L.C.', type: 'Corporate', regNo: 'QAT-INF-00788', taxId: 'TAX-QA-00788', country: 'QA', city: 'Dukhan', address: 'Dukhan Highway, Tower Zone B', currency: 'QAR', creditRating: 'A-', paymentTerms: 30 },
  { name: 'Mannai Corporation Q.P.S.C.', type: 'Corporate', regNo: 'QAT-EQ-00556', taxId: 'TAX-QA-00556', country: 'QA', city: 'Doha', address: 'Mannai Plaza, Al Corniche Street', currency: 'QAR', creditRating: 'A', paymentTerms: 30 },
  { name: 'Al Meera Consumer Goods Co. Q.P.S.C.', type: 'Corporate', regNo: 'QAT-RE-00677', taxId: 'TAX-QA-00677', country: 'QA', city: 'Doha', address: 'Al Meera Complex, Al Mirqab', currency: 'QAR', creditRating: 'BBB', paymentTerms: 30 },
  { name: 'Milaha Maritime & Logistics Q.P.S.C.', type: 'Corporate', regNo: 'QAT-LOG-00445', taxId: 'TAX-QA-00445', country: 'QA', city: 'Doha Port', address: 'Doha Port, Logistics Zone, Gate 7', currency: 'QAR', creditRating: 'A', paymentTerms: 30 },
  { name: 'United Development Company Q.P.S.C.', type: 'Corporate', regNo: 'QAT-RE-01899', taxId: 'TAX-QA-01899', country: 'QA', city: 'The Pearl', address: 'The Pearl-Qatar, Porto Arabia, Tower 12', currency: 'QAR', creditRating: 'AA-', paymentTerms: 30 },
];

const STAFF_EXTRA = [
  { number: 'VQ-EMP-00116', name: 'Nasser Al-Hajri', dept: 'Network Operations', grade: 'M3', pos: 'Network Manager', work: 'Doha HQ' },
  { number: 'VQ-EMP-00117', name: 'Hessa Al-Kuwari', dept: 'Corporate Real Estate', grade: 'P3', pos: 'Property Manager', work: 'Doha HQ' },
  { number: 'VQ-EMP-00118', name: 'Jassim Al-Mohannadi', dept: 'Fleet & Logistics', grade: 'M2', pos: 'Fleet Coordinator', work: 'Industrial Area' },
  { number: 'VQ-EMP-00119', name: 'Maryam Al-Ansari', dept: 'Finance', grade: 'D2', pos: 'Financial Controller', work: 'Doha HQ' },
  { number: 'VQ-EMP-00120', name: 'Tariq Al-Naimi', dept: 'IT Infrastructure', grade: 'M3', pos: 'IT Infrastructure Manager', work: 'Doha HQ' },
];

// ─── Lease Definitions ────────────────────────────────────────────────────────
// 20 leases: property (8), vehicle (6), equipment (4), tower (2)
// Statuses: Active(12), PendingApproval(3), Expired(3), Terminated(2)
const LEASES = [
  // ── PROPERTY LEASES ──
  {
    ref: 'VFL-2022-0001', lessorIdx: 0, assetType: 'Office Space', desc: 'Vodafone Qatar HQ — Al Sadd Tower, Floors 12-15', tag: 'PROP-HQ-001',
    loc: { address: 'Al Sadd Street, Tower B, Floors 12-15', city: 'Doha', country: 'QA' },
    commence: '2022-01-01', expiry: '2026-12-31', termMonths: 60, monthlyPayment: 185000,
    currency: 'QAR', ibr: 0.065, escalationRate: 0.03, depositAmount: 370000,
    idc: 45000, incentives: 0, classification: 'Finance', status: 'Active',
    maintenance: 'Lessor', staffIdx: 0,
  },
  {
    ref: 'VFL-2022-0002', lessorIdx: 1, assetType: 'Office Space', desc: 'Lusail Business Centre — Regional Sales Office', tag: 'PROP-LSL-001',
    loc: { address: 'Lusail City, Marina District, Tower 3, Floor 8', city: 'Lusail', country: 'QA' },
    commence: '2022-04-01', expiry: '2027-03-31', termMonths: 60, monthlyPayment: 95000,
    currency: 'QAR', ibr: 0.065, escalationRate: 0.025, depositAmount: 190000,
    idc: 22000, incentives: 95000, classification: 'Finance', status: 'Active',
    maintenance: 'Lessor', staffIdx: 1,
  },
  {
    ref: 'VFL-2022-0003', lessorIdx: 2, assetType: 'Retail Space', desc: 'Ezdan Mall Vodafone Store — Al Wakra Branch', tag: 'PROP-EZD-001',
    loc: { address: 'Ezdan Mall, Ground Floor, Unit G-14, Al Wakra', city: 'Al Wakra', country: 'QA' },
    commence: '2022-07-01', expiry: '2025-06-30', termMonths: 36, monthlyPayment: 42000,
    currency: 'QAR', ibr: 0.07, escalationRate: 0.02, depositAmount: 84000,
    idc: 8500, incentives: 0, classification: 'Operating', status: 'Active',
    maintenance: 'Shared', staffIdx: 1,
  },
  {
    ref: 'VFL-2023-0004', lessorIdx: 3, assetType: 'Office Space', desc: 'West Bay Corporate Suite — Executive Offices', tag: 'PROP-WB-001',
    loc: { address: 'West Bay, Diplomatic Area, Al Fardan Tower, Floor 22', city: 'Doha', country: 'QA' },
    commence: '2023-01-01', expiry: '2028-12-31', termMonths: 72, monthlyPayment: 145000,
    currency: 'QAR', ibr: 0.068, escalationRate: 0.03, depositAmount: 290000,
    idc: 38000, incentives: 145000, classification: 'Finance', status: 'Active',
    maintenance: 'Lessor', staffIdx: 3,
  },
  {
    ref: 'VFL-2023-0005', lessorIdx: 9, assetType: 'Retail Space', desc: 'The Pearl-Qatar Vodafone Flagship Store', tag: 'PROP-PEARL-001',
    loc: { address: 'The Pearl-Qatar, Porto Arabia, Promenade Level, Unit P-22', city: 'Doha', country: 'QA' },
    commence: '2023-03-01', expiry: '2026-02-28', termMonths: 36, monthlyPayment: 68000,
    currency: 'QAR', ibr: 0.07, escalationRate: 0.025, depositAmount: 136000,
    idc: 15000, incentives: 0, classification: 'Operating', status: 'Active',
    maintenance: 'Lessor', staffIdx: 1,
  },
  {
    ref: 'VFL-2023-0006', lessorIdx: 7, assetType: 'Warehouse', desc: 'Al Mirqab Logistics Warehouse — Device Storage', tag: 'PROP-WH-001',
    loc: { address: 'Al Mirqab Industrial Zone, Warehouse Block C, Unit 7', city: 'Doha', country: 'QA' },
    commence: '2023-06-01', expiry: '2026-05-31', termMonths: 36, monthlyPayment: 28500,
    currency: 'QAR', ibr: 0.065, escalationRate: 0.02, depositAmount: 57000,
    idc: 5000, incentives: 0, classification: 'Operating', status: 'Active',
    maintenance: 'Vodafone', staffIdx: 4,
  },
  {
    ref: 'VFL-2021-0007', lessorIdx: 0, assetType: 'Office Space', desc: 'Al Sadd Customer Care Centre — Ground Floor', tag: 'PROP-CC-001',
    loc: { address: 'Al Sadd Street, Building 45, Ground Floor', city: 'Doha', country: 'QA' },
    commence: '2021-01-01', expiry: '2024-12-31', termMonths: 48, monthlyPayment: 55000,
    currency: 'QAR', ibr: 0.06, escalationRate: 0.02, depositAmount: 110000,
    idc: 12000, incentives: 0, classification: 'Finance', status: 'Expired',
    maintenance: 'Lessor', staffIdx: 0,
  },
  {
    ref: 'VFL-2024-0008', lessorIdx: 1, assetType: 'Office Space', desc: 'Lusail Smart City Hub — Innovation Lab', tag: 'PROP-LSL-002',
    loc: { address: 'Lusail City, Entertainment City, Block D, Floor 5', city: 'Lusail', country: 'QA' },
    commence: '2024-09-01', expiry: '2027-08-31', termMonths: 36, monthlyPayment: 78000,
    currency: 'QAR', ibr: 0.072, escalationRate: 0.03, depositAmount: 156000,
    idc: 18000, incentives: 78000, classification: 'Finance', status: 'PendingApproval',
    maintenance: 'Lessor', staffIdx: 3,
  },
  // ── VEHICLE LEASES ──
  {
    ref: 'VFL-2023-0009', lessorIdx: 4, assetType: 'Vehicle', desc: 'Toyota Land Cruiser GXR Fleet — 10 Units', tag: 'VEH-LC-001',
    loc: { address: 'Industrial Area, Street 4, Zone 56', city: 'Doha', country: 'QA' },
    commence: '2023-01-01', expiry: '2026-12-31', termMonths: 48, monthlyPayment: 38500,
    currency: 'QAR', ibr: 0.075, escalationRate: 0, depositAmount: 77000,
    idc: 5500, incentives: 0, classification: 'Finance', status: 'Active',
    maintenance: 'Lessor', staffIdx: 2, isLTO: false,
    assetJson: { vehicleMake: 'Toyota', vehicleModel: 'Land Cruiser GXR', vehicleYear: '2023', vehiclePlate: 'QA-12345', vehicleVIN: '1FTFW1ET5DFC10312', vehicleEngineCC: '4000', vehicleColour: 'White', vehicleFuelType: 'Petrol' },
  },
  {
    ref: 'VFL-2023-0010', lessorIdx: 4, assetType: 'Vehicle', desc: 'Nissan Patrol SE Fleet — 8 Units', tag: 'VEH-NP-001',
    loc: { address: 'Industrial Area, Street 4, Zone 56', city: 'Doha', country: 'QA' },
    commence: '2023-04-01', expiry: '2026-03-31', termMonths: 36, monthlyPayment: 28000,
    currency: 'QAR', ibr: 0.075, escalationRate: 0, depositAmount: 56000,
    idc: 4000, incentives: 0, classification: 'Finance', status: 'Active',
    maintenance: 'Lessor', staffIdx: 2, isLTO: false,
    assetJson: { vehicleMake: 'Nissan', vehicleModel: 'Patrol SE', vehicleYear: '2023', vehiclePlate: 'QA-23456', vehicleVIN: '1N6AA0EC4DN303030', vehicleEngineCC: '5600', vehicleColour: 'Silver', vehicleFuelType: 'Petrol' },
  },
  {
    ref: 'VFL-2022-0011', lessorIdx: 4, assetType: 'Heavy Vehicle', desc: 'Mitsubishi Canter Trucks — 5 Units', tag: 'VEH-MC-001',
    loc: { address: 'Industrial Area, Street 4, Zone 56', city: 'Doha', country: 'QA' },
    commence: '2022-07-01', expiry: '2025-06-30', termMonths: 36, monthlyPayment: 18500,
    currency: 'QAR', ibr: 0.07, escalationRate: 0, depositAmount: 37000,
    idc: 3000, incentives: 0, classification: 'Finance', status: 'Active',
    maintenance: 'Shared', staffIdx: 2, isLTO: false,
    assetJson: { vehicleMake: 'Mitsubishi', vehicleModel: 'Canter FE84D', vehicleYear: '2022', vehiclePlate: 'QA-34567', vehicleVIN: '3FRNF65H47V000001', vehicleEngineCC: '3900', vehicleColour: 'White', vehicleFuelType: 'Diesel' },
  },
  {
    ref: 'VFL-2024-0012', lessorIdx: 4, assetType: 'Fleet Vehicle', desc: 'BMW 5 Series Executive Fleet — 6 Units', tag: 'VEH-BMW-001',
    loc: { address: 'Industrial Area, Street 4, Zone 56', city: 'Doha', country: 'QA' },
    commence: '2024-01-01', expiry: '2027-12-31', termMonths: 48, monthlyPayment: 32000,
    currency: 'QAR', ibr: 0.078, escalationRate: 0, depositAmount: 64000,
    idc: 6000, incentives: 0, classification: 'Finance', status: 'Active',
    maintenance: 'Lessor', staffIdx: 2, isLTO: false,
    assetJson: { vehicleMake: 'BMW', vehicleModel: '530i M Sport', vehicleYear: '2024', vehiclePlate: 'QA-45678', vehicleVIN: 'WBA5A5C50FD520001', vehicleEngineCC: '2000', vehicleColour: 'Black', vehicleFuelType: 'Petrol' },
  },
  {
    ref: 'VFL-2021-0013', lessorIdx: 4, assetType: 'Vehicle', desc: 'Ford F-150 Pickup Trucks — 12 Units', tag: 'VEH-F150-001',
    loc: { address: 'Industrial Area, Street 4, Zone 56', city: 'Doha', country: 'QA' },
    commence: '2021-06-01', expiry: '2024-05-31', termMonths: 36, monthlyPayment: 22000,
    currency: 'QAR', ibr: 0.065, escalationRate: 0, depositAmount: 44000,
    idc: 3500, incentives: 0, classification: 'Finance', status: 'Expired',
    maintenance: 'Shared', staffIdx: 2, isLTO: false,
    assetJson: { vehicleMake: 'Ford', vehicleModel: 'F-150 XLT', vehicleYear: '2021', vehiclePlate: 'QA-56789', vehicleVIN: '1FTFW1ET5DFC10999', vehicleEngineCC: '3500', vehicleColour: 'Blue', vehicleFuelType: 'Petrol' },
  },
  {
    ref: 'VFL-2024-0014', lessorIdx: 4, assetType: 'Fleet Vehicle', desc: 'Mercedes-Benz E-Class — 4 Units (LTO)', tag: 'VEH-MB-001',
    loc: { address: 'Industrial Area, Street 4, Zone 56', city: 'Doha', country: 'QA' },
    commence: '2024-03-01', expiry: '2029-02-28', termMonths: 60, monthlyPayment: 18500,
    currency: 'QAR', ibr: 0.08, escalationRate: 0, depositAmount: 37000,
    idc: 8000, incentives: 0, classification: 'Finance', status: 'PendingApproval',
    maintenance: 'Lessor', staffIdx: 2, isLTO: true,
    ltoPurchasePrice: 420000, ltoDeposit: 84000, ltoTotalInstalments: 60, ltoFinanceChargeRate: 0.08, ltoBalloonAmount: 42000,
    assetJson: { vehicleMake: 'Mercedes-Benz', vehicleModel: 'E350 AMG Line', vehicleYear: '2024', vehiclePlate: 'QA-67890', vehicleVIN: 'WDDZF4JB0FA000001', vehicleEngineCC: '3000', vehicleColour: 'Obsidian Black', vehicleFuelType: 'Petrol' },
  },
  // ── EQUIPMENT LEASES ──
  {
    ref: 'VFL-2022-0015', lessorIdx: 6, assetType: 'Network Equipment', desc: 'Ericsson 5G RAN Equipment — Batch 1 (50 Sites)', tag: 'EQ-5G-001',
    loc: { address: 'Mannai Plaza, Al Corniche Street, Doha', city: 'Doha', country: 'QA' },
    commence: '2022-10-01', expiry: '2027-09-30', termMonths: 60, monthlyPayment: 225000,
    currency: 'QAR', ibr: 0.068, escalationRate: 0.02, depositAmount: 450000,
    idc: 85000, incentives: 0, classification: 'Finance', status: 'Active',
    maintenance: 'Lessor', staffIdx: 4,
  },
  {
    ref: 'VFL-2023-0016', lessorIdx: 6, assetType: 'IT Equipment', desc: 'Dell PowerEdge Server Farm — Data Centre Expansion', tag: 'EQ-DC-001',
    loc: { address: 'Vodafone Data Centre, Al Rayyan Road, Doha', city: 'Doha', country: 'QA' },
    commence: '2023-07-01', expiry: '2026-06-30', termMonths: 36, monthlyPayment: 88000,
    currency: 'QAR', ibr: 0.072, escalationRate: 0, depositAmount: 176000,
    idc: 22000, incentives: 0, classification: 'Finance', status: 'Active',
    maintenance: 'Shared', staffIdx: 4,
  },
  {
    ref: 'VFL-2024-0017', lessorIdx: 6, assetType: 'Network Equipment', desc: 'Nokia Core Network Upgrade — IMS Platform', tag: 'EQ-IMS-001',
    loc: { address: 'Vodafone NOC, Al Waab Street, Doha', city: 'Doha', country: 'QA' },
    commence: '2024-01-01', expiry: '2029-12-31', termMonths: 72, monthlyPayment: 165000,
    currency: 'QAR', ibr: 0.075, escalationRate: 0.015, depositAmount: 330000,
    idc: 55000, incentives: 0, classification: 'Finance', status: 'Active',
    maintenance: 'Lessor', staffIdx: 4,
  },
  {
    ref: 'VFL-2022-0018', lessorIdx: 8, assetType: 'Logistics Equipment', desc: 'Doha Port Forklift & Handling Equipment — 8 Units', tag: 'EQ-LOG-001',
    loc: { address: 'Doha Port, Logistics Zone, Gate 7', city: 'Doha', country: 'QA' },
    commence: '2022-01-01', expiry: '2024-12-31', termMonths: 36, monthlyPayment: 15500,
    currency: 'QAR', ibr: 0.065, escalationRate: 0, depositAmount: 31000,
    idc: 4500, incentives: 0, classification: 'Finance', status: 'Terminated',
    maintenance: 'Shared', staffIdx: 4,
  },
  // ── TOWER LEASES ──
  {
    ref: 'VFL-2021-0019', lessorIdx: 5, assetType: 'Tower Site', desc: 'Gulf Tower Site — Al Khor Transmission Tower', tag: 'TWR-AK-001',
    loc: { address: 'Al Khor Highway, Tower Site K-14, GPS 25.6845N 51.5082E', city: 'Al Khor', country: 'QA', coordinates: { lat: 25.6845, lng: 51.5082 } },
    commence: '2021-01-01', expiry: '2031-12-31', termMonths: 132, monthlyPayment: 12500,
    currency: 'QAR', ibr: 0.06, escalationRate: 0.025, depositAmount: 25000,
    idc: 18000, incentives: 0, classification: 'Finance', status: 'Active',
    maintenance: 'Lessor', staffIdx: 4,
  },
  {
    ref: 'VFL-2022-0020', lessorIdx: 5, assetType: 'Tower Site', desc: 'Gulf Tower Site — Dukhan Highway Macro Cell', tag: 'TWR-DK-001',
    loc: { address: 'Dukhan Highway, Tower Zone B, Site D-22, GPS 25.4231N 50.7891E', city: 'Dukhan', country: 'QA', coordinates: { lat: 25.4231, lng: 50.7891 } },
    commence: '2022-06-01', expiry: '2032-05-31', termMonths: 120, monthlyPayment: 9800,
    currency: 'QAR', ibr: 0.062, escalationRate: 0.025, depositAmount: 19600,
    idc: 14000, incentives: 0, classification: 'Finance', status: 'Active',
    maintenance: 'Lessor', staffIdx: 4,
  },
  // ── PENDING APPROVAL ──
  {
    ref: 'VFL-2025-0021', lessorIdx: 0, assetType: 'Office Space', desc: 'Al Sadd New Branch Office — Customer Experience Centre', tag: 'PROP-CX-001',
    loc: { address: 'Al Sadd Street, Building 88, Ground Floor', city: 'Doha', country: 'QA' },
    commence: '2025-01-01', expiry: '2027-12-31', termMonths: 36, monthlyPayment: 62000,
    currency: 'QAR', ibr: 0.075, escalationRate: 0.03, depositAmount: 124000,
    idc: 14000, incentives: 62000, classification: 'Operating', status: 'PendingApproval',
    maintenance: 'Lessor', staffIdx: 1,
  },
];

// ─── GL Code Mapping ──────────────────────────────────────────────────────────
function getGLCodes(assetType) {
  const isVehicle = ['Vehicle','Heavy Vehicle','Fleet Vehicle'].includes(assetType);
  const isEquipment = ['Network Equipment','IT Equipment','Logistics Equipment'].includes(assetType);
  const isTower = assetType === 'Tower Site';
  if (isVehicle) return { rouCode: '10110', rouName: 'ROU Asset — Vehicles & Fleet', liabCode: '21030', liabName: 'Lease Liability — Vehicles', deprCode: '52030', deprName: 'Depreciation — Vehicles', intCode: '51020', intName: 'Finance Cost — Vehicles', rentCode: '51010', rentName: 'Lease Rental Expense' };
  if (isEquipment) return { rouCode: '10120', rouName: 'ROU Asset — Equipment', liabCode: '21040', liabName: 'Lease Liability — Equipment', deprCode: '52020', deprName: 'Depreciation — Equipment', intCode: '51020', intName: 'Finance Cost — Equipment', rentCode: '51010', rentName: 'Lease Rental Expense' };
  if (isTower) return { rouCode: '10140', rouName: 'ROU Asset — Tower Sites', liabCode: '21060', liabName: 'Lease Liability — Tower Sites', deprCode: '52040', deprName: 'Depreciation — Tower Sites', intCode: '51030', intName: 'Finance Cost — Tower Sites', rentCode: '51010', rentName: 'Lease Rental Expense' };
  return { rouCode: '10100', rouName: 'ROU Asset — Property', liabCode: '21020', liabName: 'Lease Liability — Property', deprCode: '52010', deprName: 'Depreciation — Property', intCode: '51020', intName: 'Finance Cost — Property', rentCode: '51010', rentName: 'Lease Rental Expense' };
}

// ─── Main Seed ────────────────────────────────────────────────────────────────
async function run() {
  const pool = await sql.connect(cfg);
  console.log('🌱 VodaLease Heroine Seed Starting...\n');

  // ── 1. Seed Lessors ──────────────────────────────────────────────────────
  console.log('📋 Seeding lessors...');
  const lessorIds = [];
  for (const [i, l] of LESSORS.entries()) {
    const code = `LSR-${String(i + 1).padStart(3, '0')}`;
      const r = await pool.request().query(`
      INSERT INTO lessor.lessors (lessor_code, lessor_name, lessor_type, registration_no, tax_id, country, city, address_line1, preferred_currency, credit_rating, payment_terms, status, total_leases, total_liability, created_by, created_at)
      VALUES ('${code}', N'${l.name}', '${l.type}', '${l.regNo}', '${l.taxId}', '${l.country}', N'${l.city}', N'${l.address}', '${l.currency}', '${l.creditRating}', ${l.paymentTerms}, 'Active', 0, 0, 'seed', GETDATE());
      SELECT SCOPE_IDENTITY() AS id;
    `);
    const id = r.recordset[0].id;
    lessorIds.push(id);
    // Insert contacts
    await pool.request().query(`
      INSERT INTO lessor.lessor_contacts (lessor_id, contact_name, role, email, phone, is_primary, created_at)
      VALUES (${id}, N'${l.name.split(' ')[0]} Al-Manager', 'Primary Contact', 'contact@${l.name.toLowerCase().replace(/[^a-z]/g,'')}.qa', '+974 4400 ${1000 + i}', 1, GETDATE())
    `);
    console.log(`  ✓ Lessor: ${l.name} (ID ${id})`);
  }

  // ── 2. Seed Extra Staff ──────────────────────────────────────────────────
  console.log('\n👥 Seeding additional staff...');
  const staffIds = [];
  // Get existing staff IDs
  const existingStaff = await pool.request().query('SELECT staff_id FROM hr.staff ORDER BY staff_id');
  existingStaff.recordset.forEach(s => staffIds.push(s.staff_id));

  for (const s of STAFF_EXTRA) {
    try {
      const r = await pool.request().query(`
        INSERT INTO hr.staff (staff_number, full_name, designation, department, grade, position, place_of_work, email, phone, entity, status, created_at)
        VALUES ('${s.number}', N'${s.name}', '${s.pos}', '${s.dept}', '${s.grade}', '${s.pos}', '${s.work}', '${s.number.toLowerCase()}@vodafone.qa', '+974 5555 ${staffIds.length + 1000}', 'Vodafone Qatar', 'Active', GETDATE());
        SELECT SCOPE_IDENTITY() AS id;
      `);
      staffIds.push(r.recordset[0].id);
      console.log(`  ✓ Staff: ${s.name}`);
    } catch (e) {
      console.log(`  ⚠ Staff ${s.name} skipped: ${e.message.substring(0,60)}`);
    }
  }

  // ── 3. Seed Leases ───────────────────────────────────────────────────────
  console.log('\n🏢 Seeding leases...');
  const contractIds = [];

  for (const [idx, lease] of LEASES.entries()) {
    const lessorId = lessorIds[lease.lessorIdx] ?? lessorIds[0];
    const staffId = staffIds[lease.staffIdx] ?? staffIds[0];
    const commence = new Date(lease.commence);
    const expiry = new Date(lease.expiry);
    const { schedule, pv, rouAsset } = computeAmortisation(
      lease.monthlyPayment, lease.ibr, lease.termMonths, commence, lease.idc || 0, lease.incentives || 0
    );
    const locJson = JSON.stringify(lease.loc);
    const assetJson = lease.assetJson ? JSON.stringify(lease.assetJson) : null;

    const statusMap = { Active: 'Active', PendingApproval: 'PendingApproval', Expired: 'Expired', Terminated: 'Terminated' };
    const lcStatus = statusMap[lease.status] || 'Active';

    const r = await pool.request().query(`
      INSERT INTO lease.contracts (
        contract_ref, lessor_id, asset_type, asset_description, asset_tag,
        location_json, commencement_date, expiry_date, term_months,
        monthly_payment, currency, escalation_rate, ibr, deposit_amount,
        ifrs16_classification, initial_direct_costs, lease_incentives,
        rou_asset_value, lease_liability_commence,
        is_lto, lto_purchase_price, lto_deposit, lto_total_instalments, lto_finance_charge_rate, lto_balloon_amount,
        maintenance_responsibility, status, lifecycle_status,
        maker_id, approved_at, created_at, updated_at, screen_id, lessee_id
      ) VALUES (
        '${lease.ref}', ${lessorId}, '${lease.assetType}', N'${lease.desc}', '${lease.tag}',
        N'${locJson}', '${lease.commence}', '${lease.expiry}', ${lease.termMonths},
        ${lease.monthlyPayment}, '${lease.currency}', ${lease.escalationRate || 0}, ${lease.ibr}, ${lease.depositAmount || 0},
        '${lease.classification}', ${lease.idc || 0}, ${lease.incentives || 0},
        ${Math.round(rouAsset * 100) / 100}, ${Math.round(pv * 100) / 100},
        ${lease.isLTO ? 1 : 0},
        ${lease.ltoPurchasePrice || 'NULL'}, ${lease.ltoDeposit || 'NULL'},
        ${lease.ltoTotalInstalments || 'NULL'}, ${lease.ltoFinanceChargeRate || 'NULL'}, ${lease.ltoBalloonAmount || 'NULL'},
        '${lease.maintenance}', '${lcStatus}', '${lcStatus}',
        1, ${lease.status === 'Active' || lease.status === 'Expired' || lease.status === 'Terminated' ? "DATEADD(day, -5, GETDATE())" : 'NULL'},
        DATEADD(day, -${(LEASES.length - idx) * 30}, GETDATE()),
        GETDATE(), 'VFLSENEWLSE0001P001', ${staffId}
      );
      SELECT SCOPE_IDENTITY() AS contract_id;
    `);
    const contractId = r.recordset[0].contract_id;
    contractIds.push({ contractId, lease, pv, rouAsset, schedule });

    // Insert lessee details
    const staffRow = await pool.request().query(`SELECT * FROM hr.staff WHERE staff_id = ${staffId}`);
    const st = staffRow.recordset[0];
    if (st) {
      await pool.request().query(`
        INSERT INTO lease.lease_lessee_details (contract_id, lessee_type, lessee_name, staff_number, grade, position, department, place_of_work, created_at)
        VALUES (${contractId}, 'Staff', N'${st.full_name}', '${st.staff_number}', '${st.grade || ''}', N'${st.position || ''}', N'${st.department || ''}', N'${st.place_of_work || ''}', GETDATE())
      `);
    }

    // Store asset_json for vehicles
    if (assetJson) {
      try {
        await pool.request().query(`
          UPDATE lease.contracts SET location_json = N'${locJson.replace(/'/g,"''")}' WHERE contract_id = ${contractId}
        `);
      } catch {}
    }

    console.log(`  ✓ Lease ${lease.ref} — ${lease.assetType} — ${lease.status} (ID ${contractId}, ROU ${Math.round(rouAsset).toLocaleString()} QAR)`);
  }

  // ── 4. Seed Amortisation Schedules ───────────────────────────────────────
  console.log('\n📅 Seeding amortisation schedules...');
  let totalPeriods = 0;
  for (const { contractId, lease, schedule } of contractIds) {
    // Only seed for active/expired/terminated (not pending)
    if (lease.status === 'PendingApproval') continue;
    for (const p of schedule) {
      await pool.request().query(`
        INSERT INTO lease.amortisation_schedule (
          contract_id, period_date, opening_liability, interest_expense,
          payment, principal, closing_liability, rou_nbv, depreciation,
          cumulative_depr, posting_status
        ) VALUES (
          ${contractId}, '${p.period_date}', ${p.opening_liability}, ${p.interest_expense},
          ${p.payment}, ${p.principal}, ${p.closing_liability}, ${p.rou_nbv},
          ${p.depreciation}, ${p.cumulative_depr}, '${p.posting_status}'
        )
      `);
      totalPeriods++;
    }
    console.log(`  ✓ ${lease.ref}: ${schedule.length} periods`);
  }
  console.log(`  Total: ${totalPeriods} amortisation rows`);

  // ── 5. Seed Journal Vouchers ─────────────────────────────────────────────
  console.log('\n📒 Seeding journal vouchers...');
  let jvCounter = 1;

  function nextJvNum() { return `JV-${new Date().getFullYear()}-${String(jvCounter++).padStart(4, '0')}`; }

  for (const { contractId, lease, pv, rouAsset, schedule } of contractIds) {
    if (lease.status === 'PendingApproval') continue;
    const gl = getGLCodes(lease.assetType);
    const commence = new Date(lease.commence);
    const idc = lease.idc || 0;
    const incentives = lease.incentives || 0;
    const deposit = lease.depositAmount || 0;

    // ── Day-1 Initial Recognition JV ──
    const jvNum = nextJvNum();
    const jvR = await pool.request().query(`
      INSERT INTO accounting.journal_vouchers (
        jv_number, jv_type, period_year, period_month, posting_date,
        description, contract_id, source_ref, source_type, currency,
        total_debit, total_credit, status, created_by, created_at, posted_at, posted_by
      ) VALUES (
        '${jvNum}', 'INITIAL_RECOGNITION', ${commence.getFullYear()}, ${commence.getMonth() + 1},
        '${lease.commence}',
        N'Day-1 Initial Recognition — ${lease.ref} — ${lease.desc.substring(0, 60)}',
        ${contractId}, '${lease.ref}', 'LEASE', '${lease.currency}',
        ${Math.round((rouAsset + deposit) * 100) / 100},
        ${Math.round((pv + idc + deposit) * 100) / 100},
        'Posted', 'system', GETDATE(), GETDATE(), 'system'
      );
      SELECT SCOPE_IDENTITY() AS jv_id;
    `);
    const jvId = jvR.recordset[0].jv_id;

    // JV Lines
    const lines = [
      { seq: 1, code: gl.rouCode, name: gl.rouName, drCr: 'D', amount: Math.round((rouAsset) * 100) / 100, desc: 'ROU Asset — Initial Recognition' },
      { seq: 2, code: gl.liabCode, name: gl.liabName, drCr: 'C', amount: Math.round(pv * 100) / 100, desc: 'Lease Liability — Initial Recognition' },
    ];
    if (idc > 0) lines.push({ seq: 3, code: '20020', name: 'Accrued Initial Direct Costs', drCr: 'C', amount: idc, desc: 'IDC Capitalised into ROU Asset' });
    if (incentives > 0) lines.push({ seq: lines.length + 1, code: '20030', name: 'Lease Incentives Received', drCr: 'C', amount: incentives, desc: 'Lease Incentive — Reduces ROU Asset' });
    if (deposit > 0) {
      lines.push({ seq: lines.length + 1, code: '12020', name: 'Security Deposit — Lease', drCr: 'D', amount: deposit, desc: 'Security Deposit Paid' });
      lines.push({ seq: lines.length + 1, code: '11000', name: 'Bank Account — QAR Operating', drCr: 'C', amount: deposit, desc: 'Bank Payment — Security Deposit' });
    }
    for (const ln of lines) {
      await pool.request().query(`
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency)
        VALUES (${jvId}, ${ln.seq}, '${ln.code}', N'${ln.name}', '${ln.drCr}', ${ln.amount}, N'${ln.desc}', '${lease.ref}', '${lease.currency}')
      `);
    }

    // ── Monthly JVs (first 12 posted periods) ──
    const postedPeriods = schedule.filter(p => p.posting_status === 'Posted').slice(0, 12);
    for (const period of postedPeriods) {
      const pDate = new Date(period.period_date);
      const mJvNum = nextJvNum();
      const mJvR = await pool.request().query(`
        INSERT INTO accounting.journal_vouchers (
          jv_number, jv_type, period_year, period_month, posting_date,
          description, contract_id, source_ref, source_type, currency,
          total_debit, total_credit, status, created_by, created_at, posted_at, posted_by
        ) VALUES (
          '${mJvNum}', 'MONTHLY_AMORTISATION', ${pDate.getFullYear()}, ${pDate.getMonth() + 1},
          '${period.period_date}',
          N'Monthly Amortisation — ${lease.ref} — ${pDate.toLocaleString('en-US', { month: 'short', year: 'numeric' })}',
          ${contractId}, '${lease.ref}', 'AMORTISATION', '${lease.currency}',
          ${Math.round((period.interest_expense + period.depreciation) * 100) / 100},
          ${Math.round((period.interest_expense + period.depreciation) * 100) / 100},
          'Posted', 'system', GETDATE(), GETDATE(), 'system'
        );
        SELECT SCOPE_IDENTITY() AS jv_id;
      `);
      const mJvId = mJvR.recordset[0].jv_id;

      // Monthly JV Lines: Dr Interest / Dr Depreciation / Cr Lease Liability / Cr Acc Depr
      const mLines = [
        { seq: 1, code: gl.intCode, name: gl.intName, drCr: 'D', amount: period.interest_expense, desc: 'Finance Cost — Monthly Interest' },
        { seq: 2, code: gl.deprCode, name: gl.deprName, drCr: 'D', amount: period.depreciation, desc: 'Depreciation — Monthly ROU Asset' },
        { seq: 3, code: gl.liabCode, name: gl.liabName, drCr: 'C', amount: period.interest_expense, desc: 'Lease Liability — Interest Accrual' },
        { seq: 4, code: '13010', name: 'Accumulated Depreciation — ROU Assets', drCr: 'C', amount: period.depreciation, desc: 'Accumulated Depreciation' },
      ];
      for (const ln of mLines) {
        await pool.request().query(`
          INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency)
          VALUES (${mJvId}, ${ln.seq}, '${ln.code}', N'${ln.name}', '${ln.drCr}', ${Math.round(ln.amount * 100) / 100}, N'${ln.desc}', '${lease.ref}', '${lease.currency}')
        `);
      }
    }
    console.log(`  ✓ JVs for ${lease.ref}: 1 Day-1 + ${postedPeriods.length} monthly`);
  }

  // ── 6. Seed Invoices ─────────────────────────────────────────────────────
  console.log('\n🧾 Seeding invoices...');
  let invCounter = 1;
  const invoiceIds = [];

  for (const { contractId, lease } of contractIds) {
    if (lease.status === 'PendingApproval') continue;
    const lessorId = lessorIds[lease.lessorIdx] ?? lessorIds[0];
    // Generate 6 invoices per active lease (last 6 months), 3 for expired/terminated
    const invoiceCount = lease.status === 'Active' ? 6 : 3;
    for (let m = 0; m < invoiceCount; m++) {
      const invDate = addMonths(new Date(), -(invoiceCount - m));
      const dueDate = addMonths(invDate, 1);
      const invRef = fmtRef('INV', invCounter++, 5);
      const invNum = `${lease.ref.split('-')[1]}-INV-${String(invCounter).padStart(4,'0')}`;
      const rent = lease.monthlyPayment;
      const svc = Math.round(rent * 0.05 * 100) / 100;
      const vat = Math.round((rent + svc) * 0.05 * 100) / 100;
      const total = rent + svc + vat;
      const invStatus = m < invoiceCount - 1 ? 'Paid' : (lease.status === 'Active' ? 'Approved' : 'Paid');

      const r = await pool.request().query(`
        INSERT INTO payables.invoices (
          invoice_ref, lessor_id, contract_id, invoice_number, invoice_date,
          period_month, period_year, rent_amount, service_charge, vat, total,
          currency, due_date, status, maker_id, created_at, updated_at, screen_id
        ) VALUES (
          '${invRef}', ${lessorId}, ${contractId}, '${invNum}',
          '${toDate(invDate)}', ${invDate.getMonth() + 1}, ${invDate.getFullYear()},
          ${rent}, ${svc}, ${vat}, ${total},
          '${lease.currency}', '${toDate(dueDate)}', '${invStatus}',
          1, GETDATE(), GETDATE(), 'VFLPAYINVREG0001P001'
        );
        SELECT SCOPE_IDENTITY() AS invoice_id;
      `);
      invoiceIds.push({ invoiceId: r.recordset[0].invoice_id, contractId, lease, total, lessorId });
    }
    console.log(`  ✓ ${invoiceCount} invoices for ${lease.ref}`);
  }

  // ── 7. Seed Payment Runs ─────────────────────────────────────────────────
  console.log('\n💳 Seeding payment runs...');
  let runCounter = 1;
  // Create 4 payment runs
  const runDates = [
    addMonths(new Date(), -5), addMonths(new Date(), -4),
    addMonths(new Date(), -3), addMonths(new Date(), -2),
  ];
  const runIds = [];
  for (const [ri, runDate] of runDates.entries()) {
    const runRef = fmtRef('PMTRUN', runCounter++, 4);
    const runInvoices = invoiceIds.filter((_, i) => i % 4 === ri && _.lease.status !== 'PendingApproval').slice(0, 8);
    const runTotal = runInvoices.reduce((s, i) => s + i.total, 0);
    if (runTotal === 0) continue;

    const r = await pool.request().query(`
      INSERT INTO payables.payment_runs (
        run_ref, run_date, total_amount, currency, bank_file_format,
        bank_file_reference, status, maker_id, checker_id, approved_at, created_at, screen_id
      ) VALUES (
        '${runRef}', '${toDate(runDate)}', ${Math.round(runTotal * 100) / 100},
        'QAR', 'SWIFT', 'SWIFT-${runRef}', 'Completed',
        1, 1, DATEADD(day, 1, '${toDate(runDate)}'), GETDATE(), 'VFLPAYPAYRUN0001P001'
      );
      SELECT SCOPE_IDENTITY() AS run_id;
    `);
    const runId = r.recordset[0].run_id;
    runIds.push(runId);

    for (const inv of runInvoices) {
      await pool.request().query(`
        INSERT INTO payables.payment_run_lines (run_id, invoice_id, amount, currency)
        VALUES (${runId}, ${inv.invoiceId}, ${Math.round(inv.total * 100) / 100}, 'QAR')
      `);
    }
    console.log(`  ✓ Payment Run ${runRef}: QAR ${Math.round(runTotal).toLocaleString()} (${runInvoices.length} invoices)`);
  }

  // ── 8. Seed Cheques ──────────────────────────────────────────────────────
  console.log('\n🏦 Seeding cheques...');
  // Insert a cheque bank account first
  const cbR = await pool.request().query(`
    INSERT INTO cheque.bank_accounts (bank_name, account_number, account_name, currency, iban, swift_code, branch, status, created_at)
    VALUES ('Qatar National Bank', 'QNB-0012345678', 'Vodafone Qatar Operating Account', 'QAR', 'QA58QNBA000000012345678901234', 'QNBAQAQA', 'West Bay Branch', 'Active', GETDATE());
    SELECT SCOPE_IDENTITY() AS id;
  `);
  const cbankId = cbR.recordset[0].id;

  // Insert cheque book
  const cbookR = await pool.request().query(`
    INSERT INTO cheque.cheque_books (bank_account_id, book_reference, series_from, series_to, issued_date, status, created_at)
    VALUES (${cbankId}, 'CHKBK-2024-001', 'CHK-001001', 'CHK-001100', '2024-01-01', 'Active', GETDATE());
    SELECT SCOPE_IDENTITY() AS id;
  `);
  const cbookId = cbookR.recordset[0].id;

  let chequeCounter = 1001;
  for (const { contractId, lease, lessorId } of contractIds.slice(0, 12)) {
    if (lease.status === 'PendingApproval') continue;
    const chequeNum = `CHK-${chequeCounter++}`;
    const issueDate = addMonths(new Date(), -3);
    const chequeStatus = lease.status === 'Active' ? 'Cleared' : 'Cleared';
    await pool.request().query(`
      INSERT INTO cheque.cheque_register (
        cheque_book_id, cheque_number, bank_account_id, payee_name, lessor_id,
        amount, currency, issue_date, cleared_date, status, remarks, created_by, created_at
      ) VALUES (
        ${cbookId}, '${chequeNum}', ${cbankId}, N'${LESSORS[lease.lessorIdx]?.name || 'Lessor'}',
        ${lessorId}, ${lease.monthlyPayment}, '${lease.currency}',
        '${toDate(issueDate)}', '${toDate(addMonths(issueDate, 1))}',
        '${chequeStatus}', N'Rent cheque — ${lease.ref}', 'seed', GETDATE()
      )
    `);
  }
  console.log(`  ✓ ${chequeCounter - 1001} cheques seeded`);

  // ── 9. Seed Insurance Policies ───────────────────────────────────────────
  console.log('\n🛡️  Seeding insurance policies...');
  const insurers = ['Qatar Insurance Company', 'Al Khaleej Takaful', 'Doha Insurance Group', 'Qatar General Insurance'];
  for (const { contractId, lease } of contractIds.filter(c => ['Active','Expired'].includes(c.lease.status))) {
    const insurer = insurers[contractIds.indexOf(contractIds.find(c => c.contractId === contractId)) % insurers.length];
    const validFrom = lease.commence;
    const validTo = lease.expiry;
    const premium = Math.round(lease.monthlyPayment * 0.008 * 12 * 100) / 100;
    const policyRef = `POL-${String(contractId).padStart(5,'0')}`;
    await pool.request().query(`
      INSERT INTO lease.insurance_policies (
        policy_ref, contract_id, provider_name, policy_number, coverage_type,
        premium_amount, currency, valid_from, valid_to, renewal_alert_days, status, created_by, created_at
      ) VALUES (
        '${policyRef}', ${contractId}, N'${insurer}', 'INS-${policyRef}',
        'Comprehensive', ${premium}, '${lease.currency}',
        '${validFrom}', '${validTo}', 60,
        '${lease.status === 'Active' ? 'Active' : 'Expired'}', 1, GETDATE()
      )
    `);
  }
  console.log(`  ✓ ${contractIds.filter(c => ['Active','Expired'].includes(c.lease.status)).length} insurance policies`);

  // ── 10. Seed Maintenance Tickets ─────────────────────────────────────────
  console.log('\n🔧 Seeding maintenance tickets...');
  const issueTypes = ['HVAC', 'Electrical', 'Plumbing', 'Structural', 'IT Infrastructure', 'Security System', 'Cleaning', 'Pest Control'];
  const ticketStatuses = ['Open', 'InProgress', 'Resolved', 'Closed'];
  let ticketCounter = 1;
  for (const { contractId, lease } of contractIds.filter(c => c.lease.status === 'Active').slice(0, 10)) {
    const numTickets = Math.floor(Math.random() * 3) + 1;
    for (let t = 0; t < numTickets; t++) {
      const issueType = issueTypes[(contractId + t) % issueTypes.length];
      const ticketRef = fmtRef('TKT', ticketCounter++, 5);
      const reportedAt = addMonths(new Date(), -(numTickets - t));
      const status = t === 0 ? 'Open' : t === 1 ? 'InProgress' : 'Resolved';
      const slaHours = issueType === 'Electrical' ? 4 : 24;
      await pool.request().query(`
        INSERT INTO lease.maintenance_tickets (
          ticket_ref, contract_id, issue_type, description, responsible_party,
          reported_by, reported_at, sla_due_at, status, screen_id
        ) VALUES (
          '${ticketRef}', ${contractId}, '${issueType}',
          N'${issueType} issue reported at ${lease.tag} — ${lease.desc.substring(0, 40)}',
          '${lease.maintenance}', 1, '${toDate(reportedAt)}',
          DATEADD(hour, ${slaHours}, '${toDate(reportedAt)}'),
          '${status}', 'VFLOPSMAI0001P001'
        )
      `);
    }
    console.log(`  ✓ ${numTickets} tickets for ${lease.ref}`);
  }

  // ── 11. Seed Maker-Checker Queue ─────────────────────────────────────────
  console.log('\n✅ Seeding maker-checker queue...');
  let queueCounter = 1;
  for (const { contractId, lease, pv } of contractIds.filter(c => c.lease.status === 'PendingApproval')) {
    const qRef = fmtRef('MCQ', queueCounter++, 5);
    await pool.request().query(`
      INSERT INTO security.maker_checker_queue (
        queue_ref, module, record_type, record_id, record_summary,
        value, currency, submitted_by, submitted_at, sla_due_at, screen_id
      ) VALUES (
        '${qRef}', 'Lease', 'NEW_LEASE', '${contractId}',
        N'New Lease — ${lease.ref} — ${lease.desc.substring(0, 60)}',
        ${Math.round(pv * 100) / 100}, '${lease.currency}',
        1, GETDATE(), DATEADD(day, 2, GETDATE()), 'VFLSENEWLSE0001P001'
      )
    `);
    console.log(`  ✓ MCQ for ${lease.ref}`);
  }

  // ── 12. Seed Workflow Instances ──────────────────────────────────────────
  console.log('\n⚙️  Seeding workflow instances...');
  // Get process definition IDs
  const procDefs = await pool.request().query('SELECT definition_id, process_key FROM workflow.process_definitions');
  const leaseApprovalDef = procDefs.recordset.find(d => d.process_key === 'LEASE_APPROVAL');

  if (leaseApprovalDef) {
    let wfCounter = 1;
    for (const { contractId, lease } of contractIds.filter(c => c.lease.status === 'PendingApproval')) {
      const instRef = fmtRef('WF', wfCounter++, 5);
      await pool.request().query(`
        INSERT INTO workflow.process_instances (
          instance_ref, definition_id, process_key, business_key, business_entity,
          variables_json, current_task, status, started_by, started_at, screen_id
        ) VALUES (
          '${instRef}', ${leaseApprovalDef.definition_id}, 'LEASE_APPROVAL',
          '${lease.ref}', 'lease.contracts',
          N'{"contract_id": ${contractId}, "contract_ref": "${lease.ref}", "value": ${Math.round(lease.monthlyPayment * lease.termMonths)}}',
          'CHECKER_REVIEW', 'Active', 1, GETDATE(), 'VFLSENEWLSE0001P001'
        );
        SELECT SCOPE_IDENTITY() AS instance_id;
      `);
      const instId = (await pool.request().query('SELECT @@IDENTITY AS id')).recordset[0].id;
      await pool.request().query(`
        INSERT INTO workflow.user_tasks (
          instance_id, task_key, task_name, assigned_to_role, status, created_at, due_at
        ) VALUES (
          ${instId}, 'CHECKER_REVIEW', 'Review & Approve Lease', 'admin',
          'Pending', GETDATE(), DATEADD(day, 2, GETDATE())
        )
      `);
      console.log(`  ✓ Workflow for ${lease.ref}`);
    }
  }

  // ── 13. Seed Audit Log ───────────────────────────────────────────────────
  console.log('\n📋 Seeding audit log...');
  const auditActions = [
    { module: 'Lease', subModule: 'Origination', action: 'CREATE', table: 'lease.contracts', outcome: 'Success' },
    { module: 'Payables', subModule: 'Invoice', action: 'APPROVE', table: 'payables.invoices', outcome: 'Success' },
    { module: 'Payables', subModule: 'PaymentRun', action: 'CREATE', table: 'payables.payment_runs', outcome: 'Success' },
    { module: 'Accounting', subModule: 'JV', action: 'POST', table: 'accounting.journal_vouchers', outcome: 'Success' },
    { module: 'Lease', subModule: 'Insurance', action: 'CREATE', table: 'lease.insurance_policies', outcome: 'Success' },
  ];
  for (let i = 0; i < 50; i++) {
    const a = auditActions[i % auditActions.length];
    const daysAgo = Math.floor(i / 5);
    await pool.request().query(`
      INSERT INTO compliance.audit_log (
        log_id, audit_no, timestamp_utc, user_id, username, user_role,
        module, sub_module, action_type, record_table, record_id,
        outcome, screen_id, process_start_time, process_end_time, elapsed_ms
      ) VALUES (
        NEWID(), 'AUD-${String(i + 1).padStart(6,'0')}',
        GETDATE(),
        1, 'saleellzy', 'admin',
        '${a.module}', '${a.subModule}', '${a.action}', '${a.table}', '${i + 1}',
        '${a.outcome}', 'SYSTEM', DATEADD(day, -${daysAgo}, GETDATE()),
        DATEADD(millisecond, 250, DATEADD(day, -${daysAgo}, GETDATE())), 250
      )
    `);
  }
  console.log('  ✓ 50 audit log entries');

  // ── 14. Final Verification ───────────────────────────────────────────────
  console.log('\n📊 Final Verification:');
  const verifyTables = [
    'lessor.lessors', 'hr.staff', 'lease.contracts',
    'lease.amortisation_schedule', 'accounting.journal_vouchers',
    'accounting.jv_lines', 'payables.invoices', 'payables.payment_runs',
    'cheque.cheque_register', 'lease.insurance_policies',
    'lease.maintenance_tickets', 'security.maker_checker_queue',
    'workflow.process_instances', 'compliance.audit_log',
  ];
  for (const t of verifyTables) {
    const r = await pool.request().query(`SELECT COUNT(*) as cnt FROM ${t}`);
    console.log(`  ${t}: ${r.recordset[0].cnt}`);
  }

  await pool.close();
  console.log('\n✅ Heroine seed complete!');
}

run().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
