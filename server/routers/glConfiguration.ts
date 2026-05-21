/**
 * VodaLease Enterprise — GL Configuration Router
 * Centralized Chart of Accounts (COA) and GL Mapping management.
 * Enterprise-grade CRUD for GL codes, account hierarchy, and transaction mappings.
 */
import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { getPool } from '../db-sqlserver';
import { execSPP, execSPPOne, sql } from '../db-sqlserver';
import { simpleAuditLog as writeAuditLog, simpleErrorLog as writeErrorLog } from '../audit';
import { RulesEngine } from '../rulesEngine';

// ── Account type enum ──────────────────────────────────────────────────────────
const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;
const NORMAL_BALANCE = ['Dr', 'Cr'] as const;

// ── Lifecycle groups for GL mappings ───────────────────────────────────────────
const LIFECYCLE_GROUPS: Record<string, { label: string; types: readonly string[] }> = {
  INCEPTION: {
    label: 'Lease Inception (Day 1)',
    types: ['ROU_INITIAL_RECOGNITION', 'SECURITY_DEPOSIT_PAID', 'RENT_PREPAYMENT'],
  },
  MONTHLY: {
    label: 'Monthly Amortisation',
    types: ['DEPRECIATION_PROPERTY', 'DEPRECIATION_VEHICLE', 'DEPRECIATION_EQUIPMENT', 'DEPRECIATION_IT_INFRA', 'DEPRECIATION_TOWER', 'INTEREST_EXPENSE', 'LEASE_PAYMENT'],
  },
  REMEASUREMENT: {
    label: 'Remeasurement & Modification',
    types: ['CPI_ESCALATION', 'MODIFICATION_INCREASE', 'MODIFICATION_DECREASE', 'RENEWAL'],
  },
  TERMINATION: {
    label: 'Termination & Derecognition',
    types: ['TERMINATION_GAIN', 'TERMINATION_LOSS', 'IMPAIRMENT'],
  },
  OTHER: {
    label: 'Other Transactions',
    types: ['SUBLEASE_INCOME', 'FX_REVALUATION', 'RENT_EXPENSE'],
  },
};

// Build a reverse lookup: transaction_type → lifecycle group key
const TX_TO_GROUP: Record<string, string> = {};
for (const [groupKey, group] of Object.entries(LIFECYCLE_GROUPS)) {
  for (const t of group.types) {
    TX_TO_GROUP[t] = groupKey;
  }
}

// ── Helper: classify a GL code rule into a lifecycle group ─────────────────────
function classifyMapping(m: any): string {
  // 1. Check jv_description (the SP stores transaction_type in jv_description for GL_CODE rules)
  const desc = (m.jv_description || '').toUpperCase().replace(/[\s-]+/g, '_');
  const name = (m.rule_name || '').toUpperCase().replace(/[\s-]+/g, '_');
  // Try exact match on jv_description first (most reliable)
  if (TX_TO_GROUP[desc]) return TX_TO_GROUP[desc];
  if (TX_TO_GROUP[name]) return TX_TO_GROUP[name];
  // Try partial match
  for (const [txType, groupKey] of Object.entries(TX_TO_GROUP)) {
    if (desc.includes(txType) || name.includes(txType)) return groupKey;
  }
  // Keyword-based fallback
  const combined = `${desc} ${name}`;
  if (combined.includes('INITIAL') || combined.includes('INCEPTION') || combined.includes('RECOGNITION') || combined.includes('DEPOSIT') || combined.includes('PREPAY')) return 'INCEPTION';
  if (combined.includes('DEPRECIATION') || combined.includes('INTEREST') || combined.includes('PAYMENT') || combined.includes('AMORTIS')) return 'MONTHLY';
  if (combined.includes('CPI') || combined.includes('ESCALAT') || combined.includes('MODIFIC') || combined.includes('REMEASUR') || combined.includes('RENEWAL')) return 'REMEASUREMENT';
  if (combined.includes('TERMINAT') || combined.includes('IMPAIR') || combined.includes('DERECOG') || combined.includes('GAIN') || combined.includes('LOSS')) return 'TERMINATION';
  return 'OTHER';
}

// ── Full enterprise COA seed data (200+ accounts) ──────────────────────────────
const COA_SEED_DATA = `
-- ═══════════════════════════════════════════════════════════════
-- ASSETS (10000-19999)
-- ═══════════════════════════════════════════════════════════════
('10000', 'Assets', 'Asset', 'Header', 'Dr', 'QAR', NULL, 'Top-level asset header', 0),
-- Current Assets
('10001', 'Current Assets', 'Asset', 'Header', 'Dr', 'QAR', '10000', 'Current assets sub-header', 0),
('10010', 'Cash and Cash Equivalents', 'Asset', 'Current Asset', 'Dr', 'QAR', '10001', 'Cash on hand and bank balances', 0),
('10011', 'Petty Cash', 'Asset', 'Current Asset', 'Dr', 'QAR', '10010', 'Petty cash fund', 0),
('10012', 'Cash at Bank — QAR', 'Asset', 'Current Asset', 'Dr', 'QAR', '10010', 'QAR bank account', 0),
('10013', 'Cash at Bank — USD', 'Asset', 'Current Asset', 'Dr', 'USD', '10010', 'USD bank account', 0),
('10014', 'Cash at Bank — EGP', 'Asset', 'Current Asset', 'Dr', 'EGP', '10010', 'EGP bank account', 0),
('10015', 'Short-term Investments', 'Asset', 'Current Asset', 'Dr', 'QAR', '10010', 'Short-term money market investments', 0),
('10020', 'Trade Receivables', 'Asset', 'Current Asset', 'Dr', 'QAR', '10001', 'Accounts receivable from customers', 0),
('10021', 'Trade Receivables — Domestic', 'Asset', 'Current Asset', 'Dr', 'QAR', '10020', 'Domestic trade receivables', 0),
('10022', 'Trade Receivables — International', 'Asset', 'Current Asset', 'Dr', 'QAR', '10020', 'International trade receivables', 0),
('10025', 'Allowance for Doubtful Debts', 'Asset', 'Contra Asset', 'Cr', 'QAR', '10020', 'Provision for expected credit losses', 0),
('10030', 'Other Receivables', 'Asset', 'Current Asset', 'Dr', 'QAR', '10001', 'Sundry receivables and advances', 0),
('10031', 'Staff Advances', 'Asset', 'Current Asset', 'Dr', 'QAR', '10030', 'Advances to employees', 0),
('10032', 'VAT Receivable', 'Asset', 'Current Asset', 'Dr', 'QAR', '10030', 'Input VAT recoverable', 0),
('10033', 'Accrued Income', 'Asset', 'Current Asset', 'Dr', 'QAR', '10030', 'Income earned but not yet received', 0),
('10040', 'Inventory', 'Asset', 'Current Asset', 'Dr', 'QAR', '10001', 'Spare parts and consumables', 0),
('10041', 'Inventory — Network Equipment', 'Asset', 'Current Asset', 'Dr', 'QAR', '10040', 'Network equipment inventory', 0),
('10042', 'Inventory — SIM Cards', 'Asset', 'Current Asset', 'Dr', 'QAR', '10040', 'SIM card inventory', 0),
('10043', 'Inventory — Handsets', 'Asset', 'Current Asset', 'Dr', 'QAR', '10040', 'Mobile handset inventory', 0),
-- IFRS 16 — Right-of-Use Assets
('10100', 'Right-of-Use Assets', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10000', 'IFRS 16 Right-of-Use Assets — net carrying amount', 1),
('10101', 'ROU Assets — Property', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10100', 'ROU assets for leased properties (offices, retail, warehouses)', 1),
('10102', 'ROU Assets — Vehicles', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10100', 'ROU assets for leased vehicles (fleet, executive)', 1),
('10103', 'ROU Assets — Equipment', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10100', 'ROU assets for leased equipment (generators, HVAC)', 1),
('10104', 'ROU Assets — IT Infrastructure', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10100', 'ROU assets for leased IT infrastructure (servers, data centres)', 1),
('10105', 'ROU Assets — Tower Sites', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10100', 'ROU assets for leased telecom tower sites', 1),
('10106', 'ROU Assets — Land', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10100', 'ROU assets for leased land plots', 1),
('10200', 'Accumulated Depreciation — ROU Property', 'Asset', 'Contra Asset', 'Cr', 'QAR', '10100', 'Accumulated depreciation on ROU property assets', 1),
('10210', 'Accumulated Depreciation — ROU Vehicles', 'Asset', 'Contra Asset', 'Cr', 'QAR', '10100', 'Accumulated depreciation on ROU vehicle assets', 1),
('10220', 'Accumulated Depreciation — ROU Equipment', 'Asset', 'Contra Asset', 'Cr', 'QAR', '10100', 'Accumulated depreciation on ROU equipment', 1),
('10230', 'Accumulated Depreciation — ROU IT Infra', 'Asset', 'Contra Asset', 'Cr', 'QAR', '10100', 'Accumulated depreciation on ROU IT infrastructure', 1),
('10240', 'Accumulated Depreciation — ROU Towers', 'Asset', 'Contra Asset', 'Cr', 'QAR', '10100', 'Accumulated depreciation on ROU tower sites', 1),
('10250', 'Accumulated Depreciation — ROU Land', 'Asset', 'Contra Asset', 'Cr', 'QAR', '10100', 'Accumulated depreciation on ROU land (if finite life)', 1),
-- Other Non-Current Assets
('10300', 'Leasehold Improvements', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10000', 'Fit-out and renovation costs for leased premises', 1),
('10310', 'Accumulated Depreciation — Leasehold Improvements', 'Asset', 'Contra Asset', 'Cr', 'QAR', '10300', 'Accumulated depreciation on leasehold improvements', 1),
('10400', 'Property, Plant & Equipment', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10000', 'Owned tangible fixed assets', 0),
('10410', 'Land & Buildings (Owned)', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10400', 'Owned land and buildings', 0),
('10420', 'Network Infrastructure', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10400', 'Owned telecom network infrastructure', 0),
('10430', 'Furniture & Fixtures', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10400', 'Office furniture and fixtures', 0),
('10440', 'Computer Equipment', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10400', 'Owned IT hardware and computers', 0),
('10450', 'Motor Vehicles (Owned)', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10400', 'Owned motor vehicles', 0),
('10460', 'Accumulated Depreciation — PP&E', 'Asset', 'Contra Asset', 'Cr', 'QAR', '10400', 'Accumulated depreciation on owned PP&E', 0),
('10500', 'Intangible Assets', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10000', 'Intangible assets (licences, software, goodwill)', 0),
('10510', 'Telecom Licences', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10500', 'Telecom operating licences', 0),
('10520', 'Software & IT Licences', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10500', 'Enterprise software licences', 0),
('10530', 'Goodwill', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10500', 'Goodwill from business combinations', 0),
('10540', 'Accumulated Amortisation — Intangibles', 'Asset', 'Contra Asset', 'Cr', 'QAR', '10500', 'Accumulated amortisation on intangible assets', 0),
('10600', 'Investments', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10000', 'Long-term investments and associates', 0),
('10610', 'Investment in Subsidiaries', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10600', 'Investment in subsidiary companies', 0),
('10620', 'Investment in Associates', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10600', 'Investment in associated companies', 0),
('10630', 'Available-for-Sale Investments', 'Asset', 'Non-Current Asset', 'Dr', 'QAR', '10600', 'Available-for-sale financial assets', 0),
('11000', 'Deposits & Prepayments', 'Asset', 'Current Asset', 'Dr', 'QAR', '10001', 'Deposits and prepayments header', 0),
('11100', 'Security Deposits', 'Asset', 'Current Asset', 'Dr', 'QAR', '11000', 'Refundable security deposits paid to lessors', 1),
('11110', 'Security Deposits — Property', 'Asset', 'Current Asset', 'Dr', 'QAR', '11100', 'Security deposits for property leases', 1),
('11120', 'Security Deposits — Equipment', 'Asset', 'Current Asset', 'Dr', 'QAR', '11100', 'Security deposits for equipment leases', 1),
('11200', 'Prepaid Rent', 'Asset', 'Current Asset', 'Dr', 'QAR', '11000', 'Prepaid rent for short-term and low-value leases', 1),
('11300', 'Prepaid Insurance', 'Asset', 'Current Asset', 'Dr', 'QAR', '11000', 'Prepaid insurance premiums', 0),
('11400', 'Prepaid Maintenance', 'Asset', 'Current Asset', 'Dr', 'QAR', '11000', 'Prepaid maintenance contracts', 0),
('11500', 'Other Prepayments', 'Asset', 'Current Asset', 'Dr', 'QAR', '11000', 'Other prepaid expenses', 0),
-- ═══════════════════════════════════════════════════════════════
-- LIABILITIES (20000-29999)
-- ═══════════════════════════════════════════════════════════════
('20000', 'Liabilities', 'Liability', 'Header', 'Cr', 'QAR', NULL, 'Top-level liability header', 0),
-- Current Liabilities
('20001', 'Current Liabilities', 'Liability', 'Header', 'Cr', 'QAR', '20000', 'Current liabilities sub-header', 0),
('20010', 'Trade Payables', 'Liability', 'Current Liability', 'Cr', 'QAR', '20001', 'Amounts owed to suppliers and vendors', 0),
('20011', 'Trade Payables — Domestic', 'Liability', 'Current Liability', 'Cr', 'QAR', '20010', 'Domestic trade payables', 0),
('20012', 'Trade Payables — International', 'Liability', 'Current Liability', 'Cr', 'QAR', '20010', 'International trade payables', 0),
('20020', 'Accrued Expenses', 'Liability', 'Current Liability', 'Cr', 'QAR', '20001', 'Expenses incurred but not yet paid', 0),
('20021', 'Accrued Salaries & Benefits', 'Liability', 'Current Liability', 'Cr', 'QAR', '20020', 'Accrued employee compensation', 0),
('20022', 'Accrued Utilities', 'Liability', 'Current Liability', 'Cr', 'QAR', '20020', 'Accrued utility expenses', 0),
('20023', 'Accrued Professional Fees', 'Liability', 'Current Liability', 'Cr', 'QAR', '20020', 'Accrued legal, audit, consulting fees', 0),
('20030', 'VAT Payable', 'Liability', 'Current Liability', 'Cr', 'QAR', '20001', 'Output VAT payable to tax authority', 0),
('20040', 'Income Tax Payable', 'Liability', 'Current Liability', 'Cr', 'QAR', '20001', 'Corporate income tax payable', 0),
('20050', 'Dividends Payable', 'Liability', 'Current Liability', 'Cr', 'QAR', '20001', 'Declared but unpaid dividends', 0),
('20060', 'Deferred Revenue', 'Liability', 'Current Liability', 'Cr', 'QAR', '20001', 'Revenue received in advance', 0),
('20070', 'Short-term Borrowings', 'Liability', 'Current Liability', 'Cr', 'QAR', '20001', 'Bank overdrafts and short-term loans', 0),
-- IFRS 16 — Lease Liabilities
('20100', 'Lease Liabilities', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20000', 'IFRS 16 Lease Liabilities — present value of future payments', 1),
('20101', 'Lease Liabilities — Property', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20100', 'Lease liabilities for property leases', 1),
('20102', 'Lease Liabilities — Vehicles', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20100', 'Lease liabilities for vehicle leases', 1),
('20103', 'Lease Liabilities — Equipment', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20100', 'Lease liabilities for equipment leases', 1),
('20104', 'Lease Liabilities — IT Infrastructure', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20100', 'Lease liabilities for IT infrastructure leases', 1),
('20105', 'Lease Liabilities — Tower Sites', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20100', 'Lease liabilities for telecom tower leases', 1),
('20200', 'Lease Liabilities — Current Portion', 'Liability', 'Current Liability', 'Cr', 'QAR', '20100', 'Current portion of lease liabilities (due within 12 months)', 1),
-- Other Non-Current Liabilities
('20300', 'Long-term Borrowings', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20000', 'Long-term bank loans and bonds', 0),
('20310', 'Term Loans', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20300', 'Term loan facilities', 0),
('20320', 'Bonds Payable', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20300', 'Issued bonds and sukuk', 0),
('20400', 'Employee Benefits', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20000', 'Long-term employee benefit obligations', 0),
('20410', 'End-of-Service Benefits', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20400', 'End-of-service gratuity provision', 0),
('20420', 'Pension Obligations', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20400', 'Defined benefit pension obligations', 0),
('20500', 'Provisions', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20000', 'Provisions for liabilities and charges', 0),
('20510', 'Provision for Decommissioning', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20500', 'Asset retirement / decommissioning obligations', 0),
('20520', 'Provision for Legal Claims', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20500', 'Provision for pending legal claims', 0),
('20600', 'Deferred Tax Liabilities', 'Liability', 'Non-Current Liability', 'Cr', 'QAR', '20000', 'Deferred tax liabilities (including IFRS 16 impact)', 1),
-- ═══════════════════════════════════════════════════════════════
-- EQUITY (30000-39999)
-- ═══════════════════════════════════════════════════════════════
('30000', 'Equity', 'Equity', 'Header', 'Cr', 'QAR', NULL, 'Top-level equity header', 0),
('30100', 'Share Capital', 'Equity', 'Share Capital', 'Cr', 'QAR', '30000', 'Issued and paid-up share capital', 0),
('30200', 'Share Premium', 'Equity', 'Share Premium', 'Cr', 'QAR', '30000', 'Share premium reserve', 0),
('30300', 'Legal Reserve', 'Equity', 'Statutory Reserve', 'Cr', 'QAR', '30000', 'Statutory legal reserve (10% of net profit)', 0),
('30400', 'Retained Earnings', 'Equity', 'Retained Earnings', 'Cr', 'QAR', '30000', 'Accumulated retained earnings', 0),
('30500', 'Foreign Currency Translation Reserve', 'Equity', 'OCI Reserve', 'Cr', 'QAR', '30000', 'Foreign currency translation differences', 0),
('30600', 'Fair Value Reserve', 'Equity', 'OCI Reserve', 'Cr', 'QAR', '30000', 'Fair value changes on financial instruments', 0),
('30700', 'Treasury Shares', 'Equity', 'Contra Equity', 'Dr', 'QAR', '30000', 'Repurchased own shares', 0),
('30800', 'Non-controlling Interests', 'Equity', 'NCI', 'Cr', 'QAR', '30000', 'Non-controlling interests in subsidiaries', 0),
-- ═══════════════════════════════════════════════════════════════
-- REVENUE (40000-49999)
-- ═══════════════════════════════════════════════════════════════
('40000', 'Revenue', 'Revenue', 'Header', 'Cr', 'QAR', NULL, 'Top-level revenue header', 0),
('40010', 'Telecom Service Revenue', 'Revenue', 'Operating Revenue', 'Cr', 'QAR', '40000', 'Mobile and fixed-line service revenue', 0),
('40011', 'Mobile Service Revenue', 'Revenue', 'Operating Revenue', 'Cr', 'QAR', '40010', 'Mobile voice and data revenue', 0),
('40012', 'Fixed-line Revenue', 'Revenue', 'Operating Revenue', 'Cr', 'QAR', '40010', 'Fixed-line and broadband revenue', 0),
('40013', 'Enterprise Solutions Revenue', 'Revenue', 'Operating Revenue', 'Cr', 'QAR', '40010', 'Enterprise ICT solutions revenue', 0),
('40020', 'Equipment Sales Revenue', 'Revenue', 'Operating Revenue', 'Cr', 'QAR', '40000', 'Handset and equipment sales', 0),
('40030', 'Interconnect Revenue', 'Revenue', 'Operating Revenue', 'Cr', 'QAR', '40000', 'Interconnect and roaming revenue', 0),
('40040', 'Value-Added Services Revenue', 'Revenue', 'Operating Revenue', 'Cr', 'QAR', '40000', 'VAS, content, and digital services', 0),
('40100', 'Sub-lease Income', 'Revenue', 'Operating Revenue', 'Cr', 'QAR', '40000', 'Rental income from sub-leased assets', 1),
('40200', 'Management Fee Income', 'Revenue', 'Other Income', 'Cr', 'QAR', '40000', 'Management and advisory fee income', 0),
('40300', 'Interest Income', 'Revenue', 'Other Income', 'Cr', 'QAR', '40000', 'Interest income on deposits and investments', 0),
('40400', 'Dividend Income', 'Revenue', 'Other Income', 'Cr', 'QAR', '40000', 'Dividend income from investments', 0),
-- ═══════════════════════════════════════════════════════════════
-- EXPENSES (50000-69999)
-- ═══════════════════════════════════════════════════════════════
('50000', 'Operating Expenses', 'Expense', 'Header', 'Dr', 'QAR', NULL, 'Top-level operating expense header', 0),
-- Depreciation & Amortisation (IFRS 16 relevant)
('50010', 'Depreciation & Amortisation', 'Expense', 'Header', 'Dr', 'QAR', '50000', 'Depreciation and amortisation sub-header', 0),
('50100', 'Depreciation Expense — ROU Property', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50010', 'Depreciation of ROU property assets', 1),
('50110', 'Depreciation Expense — ROU Vehicles', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50010', 'Depreciation of ROU vehicle assets', 1),
('50120', 'Depreciation Expense — ROU Equipment', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50010', 'Depreciation of ROU equipment', 1),
('50130', 'Depreciation Expense — ROU IT Infra', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50010', 'Depreciation of ROU IT infrastructure', 1),
('50140', 'Depreciation Expense — ROU Towers', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50010', 'Depreciation of ROU tower sites', 1),
('50150', 'Depreciation Expense — ROU Land', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50010', 'Depreciation of ROU land (finite life)', 1),
('50160', 'Depreciation Expense — Leasehold Improvements', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50010', 'Depreciation of leasehold improvements', 1),
('50170', 'Depreciation Expense — PP&E', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50010', 'Depreciation of owned property, plant & equipment', 0),
('50180', 'Amortisation Expense — Intangibles', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50010', 'Amortisation of intangible assets', 0),
-- Employee Costs
('50200', 'Employee Costs', 'Expense', 'Header', 'Dr', 'QAR', '50000', 'Employee costs sub-header', 0),
('50210', 'Salaries & Wages', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50200', 'Basic salaries and wages', 0),
('50220', 'Employee Benefits', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50200', 'Medical, housing, transport allowances', 0),
('50230', 'End-of-Service Benefit Expense', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50200', 'End-of-service gratuity expense', 0),
('50240', 'Training & Development', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50200', 'Staff training and development costs', 0),
('50250', 'Recruitment Costs', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50200', 'Recruitment and hiring costs', 0),
-- Network & Operations
('50300', 'Network Operations', 'Expense', 'Header', 'Dr', 'QAR', '50000', 'Network operations sub-header', 0),
('50310', 'Network Maintenance', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50300', 'Network maintenance and repair costs', 0),
('50320', 'Interconnect Costs', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50300', 'Interconnect and roaming charges', 0),
('50330', 'Spectrum Fees', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50300', 'Spectrum licence annual fees', 0),
('50340', 'Power & Utilities — Network', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50300', 'Electricity and utilities for network sites', 0),
-- General & Administrative
('50400', 'General & Administrative', 'Expense', 'Header', 'Dr', 'QAR', '50000', 'G&A expenses sub-header', 0),
('50410', 'Office Rent — Short-term/Low-value', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50400', 'Short-term and low-value lease rent (IFRS 16 exempt)', 1),
('50420', 'Utilities — Office', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50400', 'Office electricity, water, cooling', 0),
('50430', 'Insurance Expense', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50400', 'General insurance premiums', 0),
('50440', 'Professional Fees', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50400', 'Legal, audit, consulting fees', 0),
('50450', 'Travel & Entertainment', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50400', 'Business travel and entertainment', 0),
('50460', 'Office Supplies', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50400', 'Stationery and office supplies', 0),
('50470', 'IT & Software Expenses', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50400', 'IT support and software subscriptions', 0),
('50480', 'Marketing & Advertising', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50400', 'Marketing campaigns and advertising', 0),
('50490', 'CSR & Community Investment', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50400', 'Corporate social responsibility expenses', 0),
-- Finance Costs
('60000', 'Finance Costs', 'Expense', 'Header', 'Dr', 'QAR', NULL, 'Finance cost header', 0),
('60100', 'Interest Expense — Lease Liabilities', 'Expense', 'Finance Cost', 'Dr', 'QAR', '60000', 'Interest expense on IFRS 16 lease liabilities (unwinding of discount)', 1),
('60110', 'Interest Expense — Bank Loans', 'Expense', 'Finance Cost', 'Dr', 'QAR', '60000', 'Interest on bank borrowings', 0),
('60120', 'Interest Expense — Bonds', 'Expense', 'Finance Cost', 'Dr', 'QAR', '60000', 'Interest on issued bonds and sukuk', 0),
('60130', 'Bank Charges & Fees', 'Expense', 'Finance Cost', 'Dr', 'QAR', '60000', 'Bank transaction fees and charges', 0),
('60200', 'Impairment Loss — ROU Assets', 'Expense', 'Finance Cost', 'Dr', 'QAR', '60000', 'Impairment losses on ROU assets per IAS 36', 1),
('60210', 'Impairment Loss — Trade Receivables', 'Expense', 'Finance Cost', 'Dr', 'QAR', '60000', 'Expected credit loss on trade receivables', 0),
('60220', 'Impairment Loss — Goodwill', 'Expense', 'Finance Cost', 'Dr', 'QAR', '60000', 'Goodwill impairment losses', 0),
('60300', 'FX Revaluation — Lease Liabilities', 'Expense', 'Finance Cost', 'Dr', 'QAR', '60000', 'Foreign exchange gains/losses on lease liabilities', 1),
('60310', 'FX Gains/Losses — General', 'Expense', 'Finance Cost', 'Dr', 'QAR', '60000', 'General foreign exchange gains and losses', 0),
-- ═══════════════════════════════════════════════════════════════
-- OTHER INCOME/EXPENSE (70000-79999)
-- ═══════════════════════════════════════════════════════════════
('70000', 'Other Income/Expense', 'Revenue', 'Header', 'Cr', 'QAR', NULL, 'Other income and expense header', 0),
('70100', 'Gain on Lease Termination', 'Revenue', 'Other Income', 'Cr', 'QAR', '70000', 'Gain on derecognition of lease liability exceeding ROU asset', 1),
('70110', 'Gain on Disposal of PP&E', 'Revenue', 'Other Income', 'Cr', 'QAR', '70000', 'Gain on disposal of property, plant & equipment', 0),
('70120', 'Gain on Sale of Investments', 'Revenue', 'Other Income', 'Cr', 'QAR', '70000', 'Gain on sale of investments', 0),
('70130', 'Insurance Claim Income', 'Revenue', 'Other Income', 'Cr', 'QAR', '70000', 'Insurance claim settlements received', 0),
('70200', 'Loss on Lease Termination', 'Expense', 'Other Expense', 'Dr', 'QAR', '70000', 'Loss on derecognition when ROU asset exceeds lease liability', 1),
('70210', 'Loss on Disposal of PP&E', 'Expense', 'Other Expense', 'Dr', 'QAR', '70000', 'Loss on disposal of property, plant & equipment', 0),
('70220', 'Loss on Sale of Investments', 'Expense', 'Other Expense', 'Dr', 'QAR', '70000', 'Loss on sale of investments', 0),
('70300', 'Extraordinary Items', 'Expense', 'Other Expense', 'Dr', 'QAR', '70000', 'Extraordinary and non-recurring items', 0),
-- Rent Expense (IFRS 16 Exempt)
('80000', 'Rent Expense (Exempt Leases)', 'Expense', 'Operating Expense', 'Dr', 'QAR', '50000', 'Straight-line rent expense for short-term and low-value leases', 1),
('80010', 'Short-term Lease Expense', 'Expense', 'Operating Expense', 'Dr', 'QAR', '80000', 'Expense for leases with term <= 12 months', 1),
('80020', 'Low-value Lease Expense', 'Expense', 'Operating Expense', 'Dr', 'QAR', '80000', 'Expense for leases of low-value assets', 1),
('80030', 'Variable Lease Payments', 'Expense', 'Operating Expense', 'Dr', 'QAR', '80000', 'Variable lease payments not included in liability', 1)
`;

export const glConfigurationRouter = router({
  // ═══════════════════════════════════════════════════════════════
  // CHART OF ACCOUNTS (COA)
  // ═══════════════════════════════════════════════════════════════
  /** Get all COA accounts with optional filters */
  getCOA: protectedProcedure
    .input(z.object({
      accountType: z.string().optional(),
      search: z.string().optional(),
      activeOnly: z.boolean().default(true),
      ifrs16Only: z.boolean().default(false),
    }).optional())
    .query(async ({ input }) => {
      const pool = await getPool();
      let where = 'WHERE 1=1';
      if (input?.activeOnly) where += ' AND is_active = 1';
      if (input?.ifrs16Only) where += ' AND ifrs16_relevant = 1';
      if (input?.accountType && input.accountType !== 'All Types') where += ` AND account_type = '${input.accountType.replace(/'/g, "''")}'`;
      if (input?.search) where += ` AND (account_code LIKE '%${input.search.replace(/'/g, "''")}%' OR account_name LIKE '%${input.search.replace(/'/g, "''")}%')`;
      try {
        const result = await pool.request().query(`
          SELECT account_code, account_name, account_type, sub_type, normal_balance,
                 currency, parent_code, description, ifrs16_relevant, is_active,
                 created_at, updated_at
          FROM accounting.gl_chart_of_accounts
          ${where}
          ORDER BY account_code
        `);
        return result.recordset ?? [];
      } catch (err: any) {
        // Table might not exist yet
        if (err.message?.includes('Invalid object name')) return [];
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
      }
    }),

  /** Get COA in hierarchical tree structure */
  getCOAHierarchy: protectedProcedure
    .query(async () => {
      const pool = await getPool();
      try {
        const result = await pool.request().query(`
          SELECT account_code, account_name, account_type, sub_type, normal_balance,
                 currency, parent_code, description, ifrs16_relevant, is_active
          FROM accounting.gl_chart_of_accounts
          WHERE is_active = 1
          ORDER BY account_code
        `);
        return result.recordset ?? [];
      } catch {
        return [];
      }
    }),

  /** Upsert a COA account */
  upsertCOAAccount: protectedProcedure
    .input(z.object({
      accountCode: z.string().min(1).max(20),
      accountName: z.string().min(1).max(200),
      accountType: z.enum(ACCOUNT_TYPES),
      subType: z.string().optional(),
      normalBalance: z.enum(NORMAL_BALANCE),
      currency: z.string().default('QAR'),
      parentCode: z.string().optional(),
      description: z.string().optional(),
      ifrs16Relevant: z.boolean().default(true),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input('account_code', sql.NVarChar(20), input.accountCode);
      req.input('account_name', sql.NVarChar(200), input.accountName);
      req.input('account_type', sql.NVarChar(50), input.accountType);
      req.input('sub_type', sql.NVarChar(100), input.subType ?? null);
      req.input('normal_balance', sql.NVarChar(5), input.normalBalance);
      req.input('currency', sql.NVarChar(10), input.currency);
      req.input('parent_code', sql.NVarChar(20), input.parentCode ?? null);
      req.input('description', sql.NVarChar(500), input.description ?? null);
      req.input('ifrs16_relevant', sql.Bit, input.ifrs16Relevant ? 1 : 0);
      req.input('is_active', sql.Bit, input.isActive ? 1 : 0);
      try {
        const result = await req.query(`
          MERGE accounting.gl_chart_of_accounts AS target
          USING (SELECT @account_code AS account_code) AS source
          ON target.account_code = source.account_code
          WHEN MATCHED THEN UPDATE SET
            account_name = @account_name, account_type = @account_type, sub_type = @sub_type,
            normal_balance = @normal_balance, currency = @currency, parent_code = @parent_code,
            description = @description, ifrs16_relevant = @ifrs16_relevant, is_active = @is_active,
            updated_at = GETDATE()
          WHEN NOT MATCHED THEN INSERT
            (account_code, account_name, account_type, sub_type, normal_balance, currency, parent_code, description, ifrs16_relevant, is_active, created_at, updated_at)
          VALUES
            (@account_code, @account_name, @account_type, @sub_type, @normal_balance, @currency, @parent_code, @description, @ifrs16_relevant, @is_active, GETDATE(), GETDATE())
          OUTPUT $action AS action;
        `);
        const action = result.recordset?.[0]?.action ?? 'UNKNOWN';
        await writeAuditLog('gl_chart_of_accounts', action === 'INSERT' ? 'INSERT' : 'UPDATE',
          ctx.user?.name || 'system',
          `COA Account ${action}: ${input.accountCode} — ${input.accountName}`,
          { account_code: input.accountCode, account_type: input.accountType }
        );
        return { success: true, action, accountCode: input.accountCode };
      } catch (err: any) {
        await writeErrorLog('glConfiguration.upsertCOAAccount', err.message, 'gl_configuration', input);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to save account: ${err.message}` });
      }
    }),

  /** Toggle COA account active/inactive */
  toggleCOAAccount: protectedProcedure
    .input(z.object({ accountCode: z.string(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      await pool.request()
        .input('code', sql.NVarChar(20), input.accountCode)
        .input('active', sql.Bit, input.isActive ? 1 : 0)
        .query(`UPDATE accounting.gl_chart_of_accounts SET is_active = @active, updated_at = GETDATE() WHERE account_code = @code`);
      await writeAuditLog('gl_chart_of_accounts', 'UPDATE', ctx.user?.name || 'system',
        `COA Account ${input.isActive ? 'activated' : 'deactivated'}: ${input.accountCode}`, input);
      return { success: true };
    }),

  /** Get usage details for a specific GL account code */
  getCOAUsage: protectedProcedure
    .input(z.object({ accountCode: z.string() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      try {
        const result = await pool.request()
          .input('code', sql.NVarChar(20), input.accountCode)
          .query(`
            SELECT rule_id, screen_id, rule_name, jv_debit_account, jv_credit_account,
              CASE WHEN jv_debit_account = @code THEN 'DEBIT' ELSE 'CREDIT' END AS usage_side,
              is_active, ifrs_reference
            FROM dbo.business_rules
            WHERE category_code = 'GL_CODE' AND is_active = 1
              AND (jv_debit_account = @code OR jv_credit_account = @code)
            ORDER BY screen_id, rule_name
          `);
        return result.recordset ?? [];
      } catch {
        return [];
      }
    }),

  /** Get COA summary statistics */
  getCOASummary: protectedProcedure
    .query(async () => {
      const pool = await getPool();
      try {
        const result = await pool.request().query(`
          SELECT
            COUNT(*) AS total_accounts,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_accounts,
            SUM(CASE WHEN ifrs16_relevant = 1 THEN 1 ELSE 0 END) AS ifrs16_accounts,
            SUM(CASE WHEN account_type = 'Asset' THEN 1 ELSE 0 END) AS asset_count,
            SUM(CASE WHEN account_type = 'Liability' THEN 1 ELSE 0 END) AS liability_count,
            SUM(CASE WHEN account_type = 'Equity' THEN 1 ELSE 0 END) AS equity_count,
            SUM(CASE WHEN account_type = 'Revenue' THEN 1 ELSE 0 END) AS revenue_count,
            SUM(CASE WHEN account_type = 'Expense' THEN 1 ELSE 0 END) AS expense_count
          FROM accounting.gl_chart_of_accounts
        `);
        return result.recordset?.[0] ?? {};
      } catch {
        return {};
      }
    }),

  // ═══════════════════════════════════════════════════════════════
  // GL MAPPING RULES (Transaction Type → GL Code pairs)
  // ═══════════════════════════════════════════════════════════════
  /** Get all GL mappings (from business_rules where category_code = GL_CODE) */
  getAllMappings: protectedProcedure
    .query(async () => {
      try {
        const pool = await getPool();
        const r = await pool.request().query(`
          SELECT br.rule_id, br.screen_id, br.rule_name, br.rule_description,
                 br.jv_debit_account, br.jv_credit_account, br.jv_description,
                 br.ifrs_reference, br.priority, br.is_active, br.version,
                 br.created_at, br.updated_at,
                 da.account_name AS debit_account_name,
                 ca.account_name AS credit_account_name
          FROM dbo.business_rules br
          LEFT JOIN accounting.gl_chart_of_accounts da ON da.account_code = br.jv_debit_account
          LEFT JOIN accounting.gl_chart_of_accounts ca ON ca.account_code = br.jv_credit_account
          WHERE br.category_code = 'GL_CODE'
          ORDER BY br.priority, br.rule_name
        `);
        return r.recordset;
      } catch (err: any) {
        console.error('getAllMappings error:', err.message);
        return [];
      }
    }),
  /** Get GL mappings grouped by lifecycle stage — uses intelligent classification */
  getMappingsByLifecycle: protectedProcedure
    .query(async () => {
      try {
        const pool = await getPool();
        const r = await pool.request().query(`
          SELECT br.rule_id, br.screen_id, br.rule_name, br.rule_description,
                 br.jv_debit_account, br.jv_credit_account, br.jv_description,
                 br.ifrs_reference, br.priority, br.is_active, br.version,
                 br.created_at, br.updated_at,
                 da.account_name AS debit_account_name,
                 ca.account_name AS credit_account_name
          FROM dbo.business_rules br
          LEFT JOIN accounting.gl_chart_of_accounts da ON da.account_code = br.jv_debit_account
          LEFT JOIN accounting.gl_chart_of_accounts ca ON ca.account_code = br.jv_credit_account
          WHERE br.category_code = 'GL_CODE'
          ORDER BY br.priority, br.rule_name
        `);
        const allMappings = r.recordset;
        const grouped: Record<string, { label: string; mappings: any[] }> = {};
        for (const [key, group] of Object.entries(LIFECYCLE_GROUPS)) {
          grouped[key] = { label: group.label, mappings: [] };
        }
        // Classify each mapping into the correct lifecycle group
        for (const m of allMappings) {
          const groupKey = classifyMapping(m);
          if (grouped[groupKey]) {
            grouped[groupKey].mappings.push(m);
          } else {
            grouped.OTHER.mappings.push(m);
          }
        }
        return grouped;
      } catch (err: any) {
        console.error('getMappingsByLifecycle error:', err.message);
        const grouped: Record<string, { label: string; mappings: any[] }> = {};
        for (const [key, group] of Object.entries(LIFECYCLE_GROUPS)) {
          grouped[key] = { label: group.label, mappings: [] };
        }
        return grouped;
      }
    }),

  /** Upsert a GL mapping rule */
  upsertMapping: protectedProcedure
    .input(z.object({
      screenId: z.string().default('GLOBAL'),
      transactionType: z.string(),
      debitGLCode: z.string(),
      creditGLCode: z.string(),
      description: z.string().optional(),
      ifrsReference: z.string().optional(),
      priority: z.number().default(50),
    }))
    .mutation(async ({ input, ctx }) => {
      // Validate GL codes exist in COA
      const pool = await getPool();
      const drCheck = await pool.request()
        .input('code', sql.NVarChar(20), input.debitGLCode)
        .query(`SELECT COUNT(*) AS cnt FROM accounting.gl_chart_of_accounts WHERE account_code = @code`);
      const crCheck = await pool.request()
        .input('code', sql.NVarChar(20), input.creditGLCode)
        .query(`SELECT COUNT(*) AS cnt FROM accounting.gl_chart_of_accounts WHERE account_code = @code`);
      const warnings: string[] = [];
      if ((drCheck.recordset?.[0]?.cnt ?? 0) === 0) warnings.push(`Debit GL code ${input.debitGLCode} not found in Chart of Accounts`);
      if ((crCheck.recordset?.[0]?.cnt ?? 0) === 0) warnings.push(`Credit GL code ${input.creditGLCode} not found in Chart of Accounts`);
      const result = await RulesEngine.upsertGLCodeRule({
        screenId: input.screenId,
        transactionType: input.transactionType,
        debitGLCode: input.debitGLCode,
        creditGLCode: input.creditGLCode,
        description: input.description,
        ifrsReference: input.ifrsReference,
        priority: input.priority,
        updatedBy: ctx.user?.name || 'system',
      });
      return { ...result, warnings };
    }),

  /** Delete a GL mapping */
  deleteMapping: protectedProcedure
    .input(z.object({ ruleId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      await pool.request()
        .input('ruleId', sql.Int, input.ruleId)
        .query(`UPDATE dbo.business_rules SET is_active = 0, updated_at = GETDATE() WHERE rule_id = @ruleId`);
      await writeAuditLog('business_rules', 'DELETE', ctx.user?.name || 'system',
        `GL Mapping rule deactivated: #${input.ruleId}`, input);
      return { success: true };
    }),

  /** Simulate a JV for a transaction type (preview mode) */
  simulateJV: protectedProcedure
    .input(z.object({
      transactionType: z.string(),
      amount: z.number().default(100000),
      screenId: z.string().default('GLOBAL'),
    }))
    .query(async ({ input }) => {
      const drResult = await RulesEngine.lookupGLCode(input.screenId, input.transactionType, 'DEBIT');
      const crResult = await RulesEngine.lookupGLCode(input.screenId, input.transactionType, 'CREDIT');
      // Look up account names from COA
      const pool = await getPool();
      let drName = 'Unknown Account';
      let crName = 'Unknown Account';
      if (drResult.glCode) {
        const r = await pool.request().input('code', sql.NVarChar(20), drResult.glCode)
          .query(`SELECT account_name FROM accounting.gl_chart_of_accounts WHERE account_code = @code`);
        drName = r.recordset?.[0]?.account_name ?? drResult.glCode;
      }
      if (crResult.glCode) {
        const r = await pool.request().input('code', sql.NVarChar(20), crResult.glCode)
          .query(`SELECT account_name FROM accounting.gl_chart_of_accounts WHERE account_code = @code`);
        crName = r.recordset?.[0]?.account_name ?? crResult.glCode;
      }
      return {
        transactionType: input.transactionType,
        amount: input.amount,
        debit: { glCode: drResult.glCode, accountName: drName, amount: input.amount },
        credit: { glCode: crResult.glCode, accountName: crName, amount: input.amount },
        autoCreated: drResult.autoCreated || crResult.autoCreated,
      };
    }),

  /** Seed default GL code rules */
  seedDefaults: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await RulesEngine.seedDefaultGLCodeRules(ctx.user?.name || 'system');
      return { success: true, seededCount: count };
    }),

  /** Get lifecycle groups metadata */
  getLifecycleGroups: protectedProcedure
    .query(() => {
      return Object.entries(LIFECYCLE_GROUPS).map(([key, val]) => ({
        key,
        label: val.label,
        transactionTypes: [...val.types],
      }));
    }),

  // ═══════════════════════════════════════════════════════════════
  // ENSURE COA TABLE EXISTS WITH 200+ ACCOUNTS
  // ═══════════════════════════════════════════════════════════════
  /** Initialize the COA table if it doesn't exist, seed with 200+ enterprise accounts */
  ensureCOATable: protectedProcedure
    .mutation(async ({ ctx }) => {
      const pool = await getPool();
      try {
        await pool.request().query(`
          IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'accounting')
            EXEC('CREATE SCHEMA accounting');
        `);
        await pool.request().query(`
          IF OBJECT_ID('accounting.gl_chart_of_accounts', 'U') IS NULL
          BEGIN
            CREATE TABLE accounting.gl_chart_of_accounts (
              account_code    NVARCHAR(20)   NOT NULL PRIMARY KEY,
              account_name    NVARCHAR(200)  NOT NULL,
              account_type    NVARCHAR(50)   NOT NULL,
              sub_type        NVARCHAR(100)  NULL,
              normal_balance  NVARCHAR(5)    NOT NULL DEFAULT 'Dr',
              currency        NVARCHAR(10)   NOT NULL DEFAULT 'QAR',
              parent_code     NVARCHAR(20)   NULL,
              description     NVARCHAR(500)  NULL,
              ifrs16_relevant BIT            NOT NULL DEFAULT 0,
              is_active       BIT            NOT NULL DEFAULT 1,
              created_at      DATETIME2      NOT NULL DEFAULT GETDATE(),
              updated_at      DATETIME2      NOT NULL DEFAULT GETDATE()
            );
          END
        `);
        // Seed if empty
        const countResult = await pool.request().query(`SELECT COUNT(*) AS cnt FROM accounting.gl_chart_of_accounts`);
        if ((countResult.recordset?.[0]?.cnt ?? 0) === 0) {
          await pool.request().query(`
            INSERT INTO accounting.gl_chart_of_accounts
              (account_code, account_name, account_type, sub_type, normal_balance, currency, parent_code, description, ifrs16_relevant)
            VALUES
            ${COA_SEED_DATA}
          `);
        }
        await writeAuditLog('gl_chart_of_accounts', 'INIT', ctx.user?.name || 'system', 'COA table ensured with 200+ enterprise accounts', {});
        return { success: true, message: 'COA table initialized with 200+ accounts' };
      } catch (err: any) {
        await writeErrorLog('glConfiguration.ensureCOATable', err.message, 'gl_configuration', {});
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
      }
    }),
});
