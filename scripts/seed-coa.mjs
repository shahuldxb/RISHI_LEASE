/**
 * Seed the full Chart of Accounts with 166 enterprise GL accounts.
 */
import fs from 'fs';
import sql from 'mssql';

function getEnvFromProcess() {
  const envs = {};
  try {
    const pids = fs.readdirSync('/proc').filter(f => /^\d+$/.test(f));
    for (const pid of pids) {
      try {
        const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
        if (cmdline.includes('tsx') && cmdline.includes('watch')) {
          fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').forEach(line => {
            const idx = line.indexOf('=');
            if (idx > 0) envs[line.substring(0, idx)] = line.substring(idx + 1);
          });
          break;
        }
      } catch {}
    }
  } catch {}
  return envs;
}

const env = getEnvFromProcess();
const config = {
  server: env.MSSQL_HOST,
  port: parseInt(env.MSSQL_PORT || '1433'),
  database: env.MSSQL_DATABASE,
  user: env.MSSQL_USER,
  password: env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};

// Full enterprise COA with IFRS 16 + general ledger accounts
const ACCOUNTS = [
  // ═══════════════════════════════════════════════════
  // ASSETS (1xxxx)
  // ═══════════════════════════════════════════════════
  // Current Assets
  ['10000', 'Cash and Cash Equivalents', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'Cash at bank and in hand'],
  ['10001', 'Petty Cash', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'Petty cash float'],
  ['10002', 'Bank — Current Account (QAR)', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'Main operating bank account'],
  ['10003', 'Bank — Current Account (USD)', 'Asset', 'Current Asset', null, 'Dr', 'USD', 'USD operating bank account'],
  ['10010', 'Accounts Receivable — Trade', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'Trade receivables from customers'],
  ['10011', 'Accounts Receivable — Related Parties', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'Receivables from group companies'],
  ['10012', 'Allowance for Doubtful Debts', 'Asset', 'Current Asset', null, 'Cr', 'QAR', 'ECL provision per IFRS 9'],
  ['10020', 'Prepaid Expenses', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'Prepaid rent, insurance, etc.'],
  ['10021', 'Prepaid Rent', 'Asset', 'Current Asset', 'IFRS16_PREPAID', 'Dr', 'QAR', 'Prepaid lease payments per IFRS 16.5-8'],
  ['10025', 'Accrued Income', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'Revenue earned but not yet invoiced'],
  ['10030', 'Inventory — Handsets & Devices', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'Telecom device inventory'],
  ['10031', 'Inventory — SIM Cards', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'SIM card inventory'],
  ['10035', 'VAT Receivable', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'Input VAT recoverable'],
  ['10040', 'Short-term Investments', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'Investments maturing < 12 months'],
  ['10050', 'Other Current Assets', 'Asset', 'Current Asset', null, 'Dr', 'QAR', 'Miscellaneous current assets'],

  // ROU Assets (IFRS 16)
  ['10100', 'Right-of-Use Asset — Property', 'Asset', 'ROU Asset', 'IFRS16_ROU', 'Dr', 'QAR', 'IFRS 16 ROU asset for property leases'],
  ['10110', 'Right-of-Use Asset — Vehicles', 'Asset', 'ROU Asset', 'IFRS16_ROU', 'Dr', 'QAR', 'IFRS 16 ROU asset for vehicle leases'],
  ['10120', 'Right-of-Use Asset — Equipment', 'Asset', 'ROU Asset', 'IFRS16_ROU', 'Dr', 'QAR', 'IFRS 16 ROU asset for equipment leases'],
  ['10130', 'Right-of-Use Asset — IT Infrastructure', 'Asset', 'ROU Asset', 'IFRS16_ROU', 'Dr', 'QAR', 'IFRS 16 ROU asset for IT/telecom infrastructure'],
  ['10140', 'Right-of-Use Asset — Tower Sites', 'Asset', 'ROU Asset', 'IFRS16_ROU', 'Dr', 'QAR', 'IFRS 16 ROU asset for telecom tower sites'],
  ['10150', 'Right-of-Use Asset — Fibre/Dark Fibre', 'Asset', 'ROU Asset', 'IFRS16_ROU', 'Dr', 'QAR', 'IFRS 16 ROU asset for fibre optic leases'],
  ['10160', 'Right-of-Use Asset — Land', 'Asset', 'ROU Asset', 'IFRS16_ROU', 'Dr', 'QAR', 'IFRS 16 ROU asset for land leases'],

  // Accumulated Depreciation — ROU
  ['10200', 'Accum. Depreciation — ROU Property', 'Asset', 'Accum. Depreciation', 'IFRS16_DEPR', 'Cr', 'QAR', 'Accumulated depreciation on ROU property'],
  ['10210', 'Accum. Depreciation — ROU Vehicles', 'Asset', 'Accum. Depreciation', 'IFRS16_DEPR', 'Cr', 'QAR', 'Accumulated depreciation on ROU vehicles'],
  ['10220', 'Accum. Depreciation — ROU Equipment', 'Asset', 'Accum. Depreciation', 'IFRS16_DEPR', 'Cr', 'QAR', 'Accumulated depreciation on ROU equipment'],
  ['10230', 'Accum. Depreciation — ROU IT Infra', 'Asset', 'Accum. Depreciation', 'IFRS16_DEPR', 'Cr', 'QAR', 'Accumulated depreciation on ROU IT infrastructure'],
  ['10240', 'Accum. Depreciation — ROU Tower Sites', 'Asset', 'Accum. Depreciation', 'IFRS16_DEPR', 'Cr', 'QAR', 'Accumulated depreciation on ROU tower sites'],
  ['10250', 'Accum. Depreciation — ROU Fibre', 'Asset', 'Accum. Depreciation', 'IFRS16_DEPR', 'Cr', 'QAR', 'Accumulated depreciation on ROU fibre'],
  ['10260', 'Accum. Depreciation — ROU Land', 'Asset', 'Accum. Depreciation', 'IFRS16_DEPR', 'Cr', 'QAR', 'Accumulated depreciation on ROU land'],

  // Non-Current Assets
  ['11000', 'Property, Plant & Equipment', 'Asset', 'Non-Current Asset', null, 'Dr', 'QAR', 'Owned PP&E at cost'],
  ['11010', 'Accum. Depreciation — PP&E', 'Asset', 'Non-Current Asset', null, 'Cr', 'QAR', 'Accumulated depreciation on PP&E'],
  ['11050', 'Intangible Assets — Licences', 'Asset', 'Non-Current Asset', null, 'Dr', 'QAR', 'Telecom spectrum licences'],
  ['11060', 'Intangible Assets — Software', 'Asset', 'Non-Current Asset', null, 'Dr', 'QAR', 'Capitalised software costs'],
  ['11070', 'Accum. Amortisation — Intangibles', 'Asset', 'Non-Current Asset', null, 'Cr', 'QAR', 'Accumulated amortisation on intangibles'],
  ['11100', 'Security Deposits Paid', 'Asset', 'Non-Current Asset', 'IFRS16_DEPOSIT', 'Dr', 'QAR', 'Lease security deposits paid'],
  ['11110', 'Long-term Receivables', 'Asset', 'Non-Current Asset', null, 'Dr', 'QAR', 'Receivables due > 12 months'],
  ['11120', 'Deferred Tax Asset', 'Asset', 'Non-Current Asset', null, 'Dr', 'QAR', 'Deferred tax asset per IAS 12'],
  ['11130', 'Goodwill', 'Asset', 'Non-Current Asset', null, 'Dr', 'QAR', 'Goodwill from business combinations'],
  ['11140', 'Investment in Subsidiaries', 'Asset', 'Non-Current Asset', null, 'Dr', 'QAR', 'Equity investments in subsidiaries'],
  ['11200', 'Rent Prepayment (Non-Current)', 'Asset', 'Non-Current Asset', 'IFRS16_PREPAID', 'Dr', 'QAR', 'Long-term prepaid lease payments'],

  // ═══════════════════════════════════════════════════
  // LIABILITIES (2xxxx)
  // ═══════════════════════════════════════════════════
  // Current Liabilities
  ['20000', 'Accounts Payable — Trade', 'Liability', 'Current Liability', null, 'Cr', 'QAR', 'Trade payables to suppliers'],
  ['20001', 'Accounts Payable — Related Parties', 'Liability', 'Current Liability', null, 'Cr', 'QAR', 'Payables to group companies'],
  ['20010', 'Accrued Expenses', 'Liability', 'Current Liability', null, 'Cr', 'QAR', 'Expenses incurred but not yet paid'],
  ['20020', 'VAT Payable', 'Liability', 'Current Liability', null, 'Cr', 'QAR', 'Output VAT payable'],
  ['20030', 'Income Tax Payable', 'Liability', 'Current Liability', null, 'Cr', 'QAR', 'Current income tax liability'],
  ['20040', 'Salaries & Wages Payable', 'Liability', 'Current Liability', null, 'Cr', 'QAR', 'Employee compensation accrual'],
  ['20050', 'Dividends Payable', 'Liability', 'Current Liability', null, 'Cr', 'QAR', 'Declared but unpaid dividends'],
  ['20060', 'Deferred Revenue — Current', 'Liability', 'Current Liability', null, 'Cr', 'QAR', 'Prepaid service revenue < 12 months'],
  ['20070', 'Short-term Borrowings', 'Liability', 'Current Liability', null, 'Cr', 'QAR', 'Bank overdrafts and short-term loans'],
  ['20080', 'Current Portion — Long-term Debt', 'Liability', 'Current Liability', null, 'Cr', 'QAR', 'Current portion of long-term borrowings'],
  ['20090', 'Other Current Liabilities', 'Liability', 'Current Liability', null, 'Cr', 'QAR', 'Miscellaneous current liabilities'],

  // Lease Liabilities (IFRS 16)
  ['20100', 'Lease Liability — Current', 'Liability', 'Lease Liability', 'IFRS16_LIABILITY', 'Cr', 'QAR', 'Current portion of IFRS 16 lease liability'],
  ['20110', 'Lease Liability — Property (Current)', 'Liability', 'Lease Liability', 'IFRS16_LIABILITY', 'Cr', 'QAR', 'Current lease liability — property'],
  ['20120', 'Lease Liability — Vehicles (Current)', 'Liability', 'Lease Liability', 'IFRS16_LIABILITY', 'Cr', 'QAR', 'Current lease liability — vehicles'],
  ['20130', 'Lease Liability — Equipment (Current)', 'Liability', 'Lease Liability', 'IFRS16_LIABILITY', 'Cr', 'QAR', 'Current lease liability — equipment'],
  ['20140', 'Lease Liability — Towers (Current)', 'Liability', 'Lease Liability', 'IFRS16_LIABILITY', 'Cr', 'QAR', 'Current lease liability — tower sites'],

  // Non-Current Liabilities
  ['21000', 'Long-term Borrowings', 'Liability', 'Non-Current Liability', null, 'Cr', 'QAR', 'Bank loans and bonds > 12 months'],
  ['21010', 'Deferred Tax Liability', 'Liability', 'Non-Current Liability', null, 'Cr', 'QAR', 'Deferred tax liability per IAS 12'],
  ['21020', 'Employee End-of-Service Benefits', 'Liability', 'Non-Current Liability', null, 'Cr', 'QAR', 'Gratuity and EOSB provision'],
  ['21030', 'Provisions — Non-Current', 'Liability', 'Non-Current Liability', null, 'Cr', 'QAR', 'Long-term provisions per IAS 37'],
  ['21040', 'Deferred Revenue — Non-Current', 'Liability', 'Non-Current Liability', null, 'Cr', 'QAR', 'Prepaid service revenue > 12 months'],

  // Lease Liabilities — Non-Current
  ['21100', 'Lease Liability — Non-Current', 'Liability', 'Lease Liability', 'IFRS16_LIABILITY', 'Cr', 'QAR', 'Non-current portion of IFRS 16 lease liability'],
  ['21110', 'Lease Liability — Property (Non-Current)', 'Liability', 'Lease Liability', 'IFRS16_LIABILITY', 'Cr', 'QAR', 'Non-current lease liability — property'],
  ['21120', 'Lease Liability — Vehicles (Non-Current)', 'Liability', 'Lease Liability', 'IFRS16_LIABILITY', 'Cr', 'QAR', 'Non-current lease liability — vehicles'],
  ['21130', 'Lease Liability — Equipment (Non-Current)', 'Liability', 'Lease Liability', 'IFRS16_LIABILITY', 'Cr', 'QAR', 'Non-current lease liability — equipment'],
  ['21140', 'Lease Liability — Towers (Non-Current)', 'Liability', 'Lease Liability', 'IFRS16_LIABILITY', 'Cr', 'QAR', 'Non-current lease liability — tower sites'],

  // ═══════════════════════════════════════════════════
  // EQUITY (3xxxx)
  // ═══════════════════════════════════════════════════
  ['30000', 'Share Capital', 'Equity', 'Equity', null, 'Cr', 'QAR', 'Issued share capital'],
  ['30010', 'Share Premium', 'Equity', 'Equity', null, 'Cr', 'QAR', 'Share premium account'],
  ['30020', 'Retained Earnings', 'Equity', 'Equity', null, 'Cr', 'QAR', 'Accumulated retained earnings'],
  ['30030', 'Other Comprehensive Income', 'Equity', 'Equity', null, 'Cr', 'QAR', 'OCI reserve per IAS 1'],
  ['30040', 'Foreign Currency Translation Reserve', 'Equity', 'Equity', null, 'Cr', 'QAR', 'FX translation reserve per IAS 21'],
  ['30050', 'Legal Reserve', 'Equity', 'Equity', null, 'Cr', 'QAR', 'Statutory legal reserve'],
  ['30060', 'Treasury Shares', 'Equity', 'Equity', null, 'Dr', 'QAR', 'Repurchased own shares'],

  // ═══════════════════════════════════════════════════
  // REVENUE (4xxxx)
  // ═══════════════════════════════════════════════════
  ['40000', 'Revenue — Mobile Services', 'Revenue', 'Operating Revenue', null, 'Cr', 'QAR', 'Mobile voice and data revenue'],
  ['40010', 'Revenue — Fixed Line Services', 'Revenue', 'Operating Revenue', null, 'Cr', 'QAR', 'Fixed broadband and voice revenue'],
  ['40020', 'Revenue — Enterprise Solutions', 'Revenue', 'Operating Revenue', null, 'Cr', 'QAR', 'B2B and enterprise ICT revenue'],
  ['40030', 'Revenue — Handset Sales', 'Revenue', 'Operating Revenue', null, 'Cr', 'QAR', 'Device and handset sales'],
  ['40040', 'Revenue — Roaming', 'Revenue', 'Operating Revenue', null, 'Cr', 'QAR', 'International roaming revenue'],
  ['40050', 'Revenue — Interconnect', 'Revenue', 'Operating Revenue', null, 'Cr', 'QAR', 'Interconnect and wholesale revenue'],
  ['40060', 'Revenue — Digital Services', 'Revenue', 'Operating Revenue', null, 'Cr', 'QAR', 'VAS, content, and digital services'],
  ['40100', 'Sub-lease Income', 'Revenue', 'Other Revenue', 'IFRS16_SUBLEASE', 'Cr', 'QAR', 'Income from IFRS 16 sub-leases'],
  ['40110', 'Other Operating Income', 'Revenue', 'Other Revenue', null, 'Cr', 'QAR', 'Miscellaneous operating income'],
  ['40120', 'Interest Income', 'Revenue', 'Other Revenue', null, 'Cr', 'QAR', 'Interest earned on deposits'],
  ['40130', 'Dividend Income', 'Revenue', 'Other Revenue', null, 'Cr', 'QAR', 'Dividend income from investments'],

  // ═══════════════════════════════════════════════════
  // EXPENSES (5xxxx — Operating)
  // ═══════════════════════════════════════════════════
  // Depreciation & Amortisation
  ['50100', 'Depreciation — ROU Property', 'Expense', 'Depreciation', 'IFRS16_DEPR_EXP', 'Dr', 'QAR', 'IFRS 16 depreciation on ROU property'],
  ['50110', 'Depreciation — ROU Vehicles', 'Expense', 'Depreciation', 'IFRS16_DEPR_EXP', 'Dr', 'QAR', 'IFRS 16 depreciation on ROU vehicles'],
  ['50120', 'Depreciation — ROU Equipment', 'Expense', 'Depreciation', 'IFRS16_DEPR_EXP', 'Dr', 'QAR', 'IFRS 16 depreciation on ROU equipment'],
  ['50130', 'Depreciation — ROU IT Infra', 'Expense', 'Depreciation', 'IFRS16_DEPR_EXP', 'Dr', 'QAR', 'IFRS 16 depreciation on ROU IT infrastructure'],
  ['50140', 'Depreciation — ROU Tower Sites', 'Expense', 'Depreciation', 'IFRS16_DEPR_EXP', 'Dr', 'QAR', 'IFRS 16 depreciation on ROU tower sites'],
  ['50150', 'Depreciation — ROU Fibre', 'Expense', 'Depreciation', 'IFRS16_DEPR_EXP', 'Dr', 'QAR', 'IFRS 16 depreciation on ROU fibre'],
  ['50160', 'Depreciation — ROU Land', 'Expense', 'Depreciation', 'IFRS16_DEPR_EXP', 'Dr', 'QAR', 'IFRS 16 depreciation on ROU land'],
  ['50200', 'Depreciation — PP&E', 'Expense', 'Depreciation', null, 'Dr', 'QAR', 'Depreciation on owned PP&E'],
  ['50210', 'Amortisation — Intangibles', 'Expense', 'Depreciation', null, 'Dr', 'QAR', 'Amortisation of intangible assets'],

  // Network & Operations
  ['51000', 'Network Operations Expense', 'Expense', 'Operating Expense', null, 'Dr', 'QAR', 'Network maintenance and operations'],
  ['51010', 'Interconnect Costs', 'Expense', 'Operating Expense', null, 'Dr', 'QAR', 'Interconnect and termination charges'],
  ['51020', 'Roaming Costs', 'Expense', 'Operating Expense', null, 'Dr', 'QAR', 'Outbound roaming charges'],
  ['51030', 'Content & Licensing Costs', 'Expense', 'Operating Expense', null, 'Dr', 'QAR', 'Digital content and licensing fees'],
  ['51040', 'Cost of Handsets Sold', 'Expense', 'Operating Expense', null, 'Dr', 'QAR', 'Cost of device sales'],
  ['51050', 'Utilities Expense', 'Expense', 'Operating Expense', null, 'Dr', 'QAR', 'Electricity, water, and utilities'],
  ['51060', 'Insurance Expense', 'Expense', 'Operating Expense', null, 'Dr', 'QAR', 'Insurance premiums'],

  // Employee Costs
  ['52000', 'Salaries & Wages', 'Expense', 'Employee Cost', null, 'Dr', 'QAR', 'Employee salaries and wages'],
  ['52010', 'Employee Benefits', 'Expense', 'Employee Cost', null, 'Dr', 'QAR', 'Medical, housing, transport allowances'],
  ['52020', 'End-of-Service Benefits Expense', 'Expense', 'Employee Cost', null, 'Dr', 'QAR', 'Gratuity and EOSB expense'],
  ['52030', 'Training & Development', 'Expense', 'Employee Cost', null, 'Dr', 'QAR', 'Employee training costs'],
  ['52040', 'Share-based Payment Expense', 'Expense', 'Employee Cost', null, 'Dr', 'QAR', 'IFRS 2 share-based compensation'],

  // General & Administrative
  ['53000', 'Office Supplies & Consumables', 'Expense', 'G&A Expense', null, 'Dr', 'QAR', 'Office supplies and stationery'],
  ['53010', 'Professional Fees', 'Expense', 'G&A Expense', null, 'Dr', 'QAR', 'Legal, audit, and consulting fees'],
  ['53020', 'Travel & Entertainment', 'Expense', 'G&A Expense', null, 'Dr', 'QAR', 'Business travel and entertainment'],
  ['53030', 'Marketing & Advertising', 'Expense', 'G&A Expense', null, 'Dr', 'QAR', 'Marketing campaigns and advertising'],
  ['53040', 'Rent Expense — Short-term', 'Expense', 'G&A Expense', 'IFRS16_EXEMPT', 'Dr', 'QAR', 'Short-term lease expense (IFRS 16 exemption)'],
  ['53050', 'Rent Expense — Low Value', 'Expense', 'G&A Expense', 'IFRS16_EXEMPT', 'Dr', 'QAR', 'Low-value lease expense (IFRS 16 exemption)'],
  ['53060', 'IT & Software Expense', 'Expense', 'G&A Expense', null, 'Dr', 'QAR', 'IT services and software subscriptions'],
  ['53070', 'Bad Debt Expense', 'Expense', 'G&A Expense', null, 'Dr', 'QAR', 'Expected credit loss expense per IFRS 9'],
  ['53080', 'Regulatory & Licence Fees', 'Expense', 'G&A Expense', null, 'Dr', 'QAR', 'Telecom regulatory and licence fees'],

  // ═══════════════════════════════════════════════════
  // EXPENSES (6xxxx — Finance & Other)
  // ═══════════════════════════════════════════════════
  ['60100', 'Interest Expense — Lease Liabilities', 'Expense', 'Finance Cost', 'IFRS16_INTEREST', 'Dr', 'QAR', 'IFRS 16 interest on lease liabilities'],
  ['60110', 'Interest Expense — Borrowings', 'Expense', 'Finance Cost', null, 'Dr', 'QAR', 'Interest on bank loans and bonds'],
  ['60120', 'Bank Charges & Fees', 'Expense', 'Finance Cost', null, 'Dr', 'QAR', 'Bank service charges and fees'],
  ['60130', 'Unwinding of Discount — Provisions', 'Expense', 'Finance Cost', null, 'Dr', 'QAR', 'Time value unwinding on provisions'],
  ['60200', 'Impairment — ROU Assets', 'Expense', 'Impairment', 'IFRS16_IMPAIRMENT', 'Dr', 'QAR', 'Impairment loss on ROU assets per IAS 36'],
  ['60210', 'Impairment — Goodwill', 'Expense', 'Impairment', null, 'Dr', 'QAR', 'Goodwill impairment per IAS 36'],
  ['60220', 'Impairment — Receivables', 'Expense', 'Impairment', null, 'Dr', 'QAR', 'ECL impairment on receivables per IFRS 9'],
  ['60300', 'Foreign Exchange Loss', 'Expense', 'FX', 'IFRS16_FX', 'Dr', 'QAR', 'FX loss on lease liabilities per IAS 21'],
  ['60310', 'Foreign Exchange Gain', 'Revenue', 'FX', 'IFRS16_FX', 'Cr', 'QAR', 'FX gain on lease liabilities per IAS 21'],
  ['60400', 'Income Tax Expense', 'Expense', 'Tax', null, 'Dr', 'QAR', 'Current income tax expense'],
  ['60410', 'Deferred Tax Expense', 'Expense', 'Tax', null, 'Dr', 'QAR', 'Deferred tax expense per IAS 12'],

  // ═══════════════════════════════════════════════════
  // OTHER (7xxxx — Gains/Losses)
  // ═══════════════════════════════════════════════════
  ['70100', 'Gain on Lease Termination', 'Revenue', 'Gain/Loss', 'IFRS16_TERMINATION', 'Cr', 'QAR', 'Gain on early termination of lease per IFRS 16.B98'],
  ['70200', 'Loss on Lease Termination', 'Expense', 'Gain/Loss', 'IFRS16_TERMINATION', 'Dr', 'QAR', 'Loss on early termination of lease per IFRS 16.B98'],
  ['70300', 'Gain on Disposal of PP&E', 'Revenue', 'Gain/Loss', null, 'Cr', 'QAR', 'Gain on disposal of property, plant & equipment'],
  ['70400', 'Loss on Disposal of PP&E', 'Expense', 'Gain/Loss', null, 'Dr', 'QAR', 'Loss on disposal of property, plant & equipment'],
  ['70500', 'Gain on Lease Modification', 'Revenue', 'Gain/Loss', 'IFRS16_MODIFICATION', 'Cr', 'QAR', 'Gain on scope decrease per IFRS 16.46(a)'],
  ['70600', 'Loss on Lease Modification', 'Expense', 'Gain/Loss', 'IFRS16_MODIFICATION', 'Dr', 'QAR', 'Loss on scope decrease per IFRS 16.46(a)'],

  // ═══════════════════════════════════════════════════
  // SUSPENSE & CLEARING (9xxxx)
  // ═══════════════════════════════════════════════════
  ['90000', 'Suspense Account', 'Asset', 'Suspense', null, 'Dr', 'QAR', 'Temporary suspense account'],
  ['90010', 'Intercompany Clearing', 'Asset', 'Suspense', null, 'Dr', 'QAR', 'Intercompany clearing account'],
  ['90020', 'Bank Reconciliation Clearing', 'Asset', 'Suspense', null, 'Dr', 'QAR', 'Bank reconciliation clearing'],
  ['90030', 'Lease Transition Adjustment', 'Equity', 'Equity', 'IFRS16_TRANSITION', 'Cr', 'QAR', 'IFRS 16 transition adjustment to retained earnings'],
];

async function main() {
  console.log('Connecting to database...');
  const pool = await sql.connect(config);
  console.log('Connected\n');

  let inserted = 0, skipped = 0;

  for (const [code, name, type, subtype, ifrs_cat, balance, currency, desc] of ACCOUNTS) {
    try {
      const existing = await pool.request()
        .input('code', sql.NVarChar(20), code)
        .query('SELECT account_id FROM accounting.gl_chart_of_accounts WHERE account_code = @code');
      
      if (existing.recordset.length > 0) {
        skipped++;
        continue;
      }

      await pool.request()
        .input('code', sql.NVarChar(20), code)
        .input('name', sql.NVarChar(200), name)
        .input('type', sql.NVarChar(50), type)
        .input('subtype', sql.NVarChar(100), subtype)
        .input('ifrs_cat', sql.NVarChar(50), ifrs_cat)
        .input('balance', sql.NVarChar(5), balance)
        .input('currency', sql.NVarChar(10), currency)
        .input('desc', sql.NVarChar(500), desc)
        .query(`
          INSERT INTO accounting.gl_chart_of_accounts 
          (account_code, account_name, account_type, account_subtype, ifrs16_category, normal_balance, currency, description, is_active, created_at, updated_at)
          VALUES (@code, @name, @type, @subtype, @ifrs_cat, @balance, @currency, @desc, 1, GETDATE(), GETDATE())
        `);
      inserted++;
    } catch (err) {
      console.error(`ERR ${code}: ${err.message.substring(0, 100)}`);
    }
  }

  console.log(`Inserted: ${inserted}, Skipped (existing): ${skipped}`);
  
  const count = await pool.request().query('SELECT COUNT(*) as total FROM accounting.gl_chart_of_accounts');
  console.log(`Total COA accounts: ${count.recordset[0].total}`);

  // Summary by type
  const summary = await pool.request().query('SELECT account_type, COUNT(*) as cnt FROM accounting.gl_chart_of_accounts GROUP BY account_type ORDER BY account_type');
  for (const row of summary.recordset) {
    console.log(`  ${row.account_type}: ${row.cnt}`);
  }

  await pool.close();
}

main().catch(err => { console.error(err); process.exit(1); });
