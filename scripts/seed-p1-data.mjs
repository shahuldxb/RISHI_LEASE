import sql from '/home/ubuntu/vodalease-enterprise/node_modules/mssql/index.js';

const cfg = {
  server: process.env.MSSQL_HOST || 'localhost',
  database: process.env.MSSQL_DATABASE || 'compliance',
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  options: { trustServerCertificate: true, encrypt: false }
};

const pool = await sql.connect(cfg);

// ── IBR Rates ──────────────────────────────────────────────────────────────
await pool.request().query(`DELETE FROM lease.ibr_rates`);
await pool.request().query(`
  INSERT INTO lease.ibr_rates (currency, lease_term_min, lease_term_max, rate_pct, effective_from, effective_to, source, notes) VALUES
  ('AED',  1,  12, 5.2500, '2024-01-01', '2024-12-31', 'Central Bank UAE', 'Short-term 1-12 months'),
  ('AED', 13,  36, 5.5000, '2024-01-01', '2024-12-31', 'Central Bank UAE', 'Medium-term 1-3 years'),
  ('AED', 37,  60, 5.7500, '2024-01-01', '2024-12-31', 'Central Bank UAE', 'Medium-term 3-5 years'),
  ('AED', 61, 120, 6.0000, '2024-01-01', '2024-12-31', 'Central Bank UAE', 'Long-term 5-10 years'),
  ('AED',121, 999, 6.2500, '2024-01-01', '2024-12-31', 'Central Bank UAE', 'Very long-term >10 years'),
  ('AED',  1,  12, 5.0000, '2025-01-01', NULL,          'Central Bank UAE', 'Short-term 1-12 months'),
  ('AED', 13,  36, 5.2500, '2025-01-01', NULL,          'Central Bank UAE', 'Medium-term 1-3 years'),
  ('AED', 37,  60, 5.5000, '2025-01-01', NULL,          'Central Bank UAE', 'Medium-term 3-5 years'),
  ('AED', 61, 120, 5.7500, '2025-01-01', NULL,          'Central Bank UAE', 'Long-term 5-10 years'),
  ('AED',121, 999, 6.0000, '2025-01-01', NULL,          'Central Bank UAE', 'Very long-term >10 years'),
  ('USD',  1,  12, 5.5000, '2025-01-01', NULL,          'Federal Reserve',  'USD short-term'),
  ('USD', 13,  60, 5.7500, '2025-01-01', NULL,          'Federal Reserve',  'USD medium-term'),
  ('USD', 61, 999, 5.9000, '2025-01-01', NULL,          'Federal Reserve',  'USD long-term'),
  ('GBP',  1,  12, 5.2000, '2025-01-01', NULL,          'Bank of England',  'GBP short-term'),
  ('GBP', 13,  60, 5.4000, '2025-01-01', NULL,          'Bank of England',  'GBP medium-term'),
  ('EUR',  1,  12, 3.8000, '2025-01-01', NULL,          'ECB',              'EUR short-term'),
  ('EUR', 13,  60, 4.0000, '2025-01-01', NULL,          'ECB',              'EUR medium-term')
`);
console.log('IBR rates seeded');

// ── CPI Index ──────────────────────────────────────────────────────────────
await pool.request().query(`DELETE FROM lease.cpi_index`);
const uaeCPI = [
  [2023,1,105.2,null],[2023,2,105.8,0.57],[2023,3,106.4,0.57],[2023,4,107.1,0.66],[2023,5,107.6,0.47],[2023,6,108.2,0.56],
  [2023,7,108.8,0.55],[2023,8,109.3,0.46],[2023,9,109.9,0.55],[2023,10,110.4,0.45],[2023,11,110.9,0.45],[2023,12,111.5,0.54],
  [2024,1,112.1,0.54],[2024,2,112.6,0.45],[2024,3,113.2,0.53],[2024,4,113.8,0.53],[2024,5,114.3,0.44],[2024,6,114.9,0.52],
  [2024,7,115.4,0.44],[2024,8,115.9,0.43],[2024,9,116.5,0.52],[2024,10,117.0,0.43],[2024,11,117.5,0.43],[2024,12,118.1,0.51],
  [2025,1,118.7,0.51],[2025,2,119.2,0.42],[2025,3,119.8,0.50],[2025,4,120.3,0.42],
];
for (const [y,m,v,yoy] of uaeCPI) {
  await pool.request().query(`
    INSERT INTO lease.cpi_index (index_name,country_code,period_year,period_month,index_value,yoy_change_pct,source,published_date)
    VALUES ('UAE CPI','AE',${y},${m},${v},${yoy??'NULL'},'UAE Federal Competitiveness Authority','${y}-${String(m).padStart(2,'0')}-01')
  `);
}
console.log('CPI index seeded');

// ── ERP Export Configs ─────────────────────────────────────────────────────
await pool.request().query(`DELETE FROM finance.erp_export_configs`);
await pool.request().query(`
  INSERT INTO finance.erp_export_configs (config_name, erp_type, export_format, gl_account_mapping, date_format, delimiter, include_header, is_active) VALUES
  ('SAP S/4HANA Standard', 'SAP', 'CSV', '{"ROU_ASSET":"10100001","LEASE_LIABILITY":"20100001","DEPRECIATION":"50100001","INTEREST":"50200001"}', 'YYYY-MM-DD', ',', 1, 1),
  ('Oracle Fusion Cloud', 'ORACLE', 'CSV', '{"ROU_ASSET":"1510","LEASE_LIABILITY":"2310","DEPRECIATION":"7110","INTEREST":"7210"}', 'DD-MON-YYYY', ',', 1, 1),
  ('Microsoft Dynamics 365', 'DYNAMICS', 'CSV', '{"ROU_ASSET":"16000","LEASE_LIABILITY":"24000","DEPRECIATION":"62000","INTEREST":"63000"}', 'MM/DD/YYYY', ',', 1, 1),
  ('NetSuite', 'NETSUITE', 'CSV', '{"ROU_ASSET":"1600","LEASE_LIABILITY":"2400","DEPRECIATION":"6200","INTEREST":"6300"}', 'MM/DD/YYYY', ',', 1, 1),
  ('Custom CSV Export', 'CUSTOM', 'CSV', NULL, 'YYYY-MM-DD', ',', 1, 1)
`);
console.log('ERP export configs seeded');

// ── Get active contracts ───────────────────────────────────────────────────
const acRes = await pool.request().query(`SELECT contract_id, monthly_rent, asset_type FROM lease.contracts WHERE lease_status='Active' ORDER BY contract_id`);
const ac = acRes.recordset;

// ── Lease Classification ───────────────────────────────────────────────────
await pool.request().query(`DELETE FROM lease.lease_classification`);
for (let i = 0; i < ac.length; i++) {
  const isFinance = i % 4 === 0;
  await pool.request().query(`
    INSERT INTO lease.lease_classification (contract_id,standard,transfers_ownership,purchase_option_certain,major_part_of_life,substantially_all_fv,specialised_asset,lease_type,classification_date,classified_by)
    VALUES (${ac[i].contract_id},'IFRS16',0,${isFinance?1:0},${isFinance?1:0},${isFinance?1:0},0,'${isFinance?'Finance':'Operating'}','2024-01-01',1)
  `);
}
console.log(`Lease classifications seeded for ${ac.length} contracts`);

// ── Remeasurement Events ───────────────────────────────────────────────────
await pool.request().query(`DELETE FROM lease.remeasurement_events`);
if (ac[0]) await pool.request().query(`INSERT INTO lease.remeasurement_events (contract_id,event_type,event_date,trigger_description,old_liability,old_rou_asset,old_ibr,old_remaining_term,new_liability,new_rou_asset,new_ibr,new_remaining_term,liability_adjustment,rou_adjustment,status) VALUES (${ac[0].contract_id},'EXTENSION_EXERCISE','2024-06-01','Renewal option exercised — 2 year extension',850000,820000,5.50,24,1420000,1380000,5.25,48,570000,560000,'POSTED')`);
if (ac[1]) await pool.request().query(`INSERT INTO lease.remeasurement_events (contract_id,event_type,event_date,trigger_description,old_liability,old_rou_asset,old_ibr,old_remaining_term,new_liability,new_rou_asset,new_ibr,new_remaining_term,liability_adjustment,rou_adjustment,status) VALUES (${ac[1].contract_id},'CPI_UPDATE','2025-01-01','Annual CPI rent review — UAE CPI 6.2% increase',1200000,1150000,5.75,36,1274400,1221300,5.75,35,74400,71300,'POSTED')`);
if (ac[2]) await pool.request().query(`INSERT INTO lease.remeasurement_events (contract_id,event_type,event_date,trigger_description,old_liability,old_rou_asset,old_ibr,old_remaining_term,new_liability,new_rou_asset,new_ibr,new_remaining_term,liability_adjustment,rou_adjustment,status) VALUES (${ac[2].contract_id},'MODIFICATION','2025-03-15','Scope reduction — floor 3 surrendered',2100000,2050000,6.00,48,1750000,1708333,6.00,48,-350000,-341667,'POSTED')`);
if (ac[3]) await pool.request().query(`INSERT INTO lease.remeasurement_events (contract_id,event_type,event_date,trigger_description,old_liability,old_rou_asset,old_ibr,old_remaining_term,new_liability,new_rou_asset,new_ibr,new_remaining_term,liability_adjustment,rou_adjustment,status) VALUES (${ac[3].contract_id},'RATE_REVISION','2025-04-01','IBR revised from 6.00% to 5.75% per CBUAE guidance',980000,945000,6.00,30,1010000,974167,5.75,30,30000,29167,'PENDING')`);
console.log('Remeasurement events seeded');

// ── CPI Escalation Schedule ────────────────────────────────────────────────
await pool.request().query(`DELETE FROM lease.lease_escalations`);
if (ac[0]) await pool.request().query(`INSERT INTO lease.lease_escalations (contract_id,escalation_type,review_date,base_rent,escalation_rate_pct,new_rent,status,applied_date,notes) VALUES (${ac[0].contract_id},'CPI','2025-01-01',${ac[0].monthly_rent},6.20,${(ac[0].monthly_rent*1.062).toFixed(2)},'APPLIED','2025-01-01','Annual UAE CPI review Jan 2025')`);
if (ac[1]) await pool.request().query(`INSERT INTO lease.lease_escalations (contract_id,escalation_type,review_date,base_rent,escalation_rate_pct,new_rent,status,notes) VALUES (${ac[1].contract_id},'FIXED_PCT','2025-07-01',${ac[1].monthly_rent},5.00,${(ac[1].monthly_rent*1.05).toFixed(2)},'PENDING','Fixed 5% escalation per lease clause 12.3')`);
if (ac[2]) await pool.request().query(`INSERT INTO lease.lease_escalations (contract_id,escalation_type,review_date,base_rent,escalation_rate_pct,new_rent,status,notes) VALUES (${ac[2].contract_id},'MARKET_REVIEW','2026-01-01',${ac[2].monthly_rent},NULL,NULL,'PENDING','Market rent review — valuer to be appointed')`);
if (ac[3]) await pool.request().query(`INSERT INTO lease.lease_escalations (contract_id,escalation_type,review_date,base_rent,escalation_amount,new_rent,status,notes) VALUES (${ac[3].contract_id},'FIXED_AMT','2025-06-01',${ac[3].monthly_rent},5000,${(ac[3].monthly_rent+5000).toFixed(2)},'PENDING','Fixed AED 5,000/month step-up from June 2025')`);
console.log('Lease escalations seeded');

// ── Variable Rent ──────────────────────────────────────────────────────────
await pool.request().query(`DELETE FROM lease.variable_rent`);
const retailAc = ac.filter(c => c.asset_type === 'Retail');
if (retailAc[0]) {
  await pool.request().query(`INSERT INTO lease.variable_rent (contract_id,period_start,period_end,basis,rate_pct,actual_amount,estimated_amount,notes) VALUES (${retailAc[0].contract_id},'2024-01-01','2024-12-31','Revenue % (Retail Turnover)',2.50,185000,170000,'Retail outlet — 2.5% of annual turnover above AED 5M threshold')`);
  await pool.request().query(`INSERT INTO lease.variable_rent (contract_id,period_start,period_end,basis,rate_pct,actual_amount,estimated_amount,notes) VALUES (${retailAc[0].contract_id},'2025-01-01','2025-12-31','Revenue % (Retail Turnover)',2.50,NULL,195000,'Retail outlet — 2.5% of annual turnover above AED 5M threshold')`);
}
// Fallback if no retail
if (!retailAc[0] && ac[4]) {
  await pool.request().query(`INSERT INTO lease.variable_rent (contract_id,period_start,period_end,basis,rate_pct,actual_amount,estimated_amount,notes) VALUES (${ac[4].contract_id},'2024-01-01','2024-12-31','Revenue % (Retail Turnover)',2.50,185000,170000,'Variable rent component')`);
}
console.log('Variable rent seeded');

// ── Short-term & Low-value Exemptions ─────────────────────────────────────
await pool.request().query(`DELETE FROM lease.short_term_exemptions`);
if (ac[5]) await pool.request().query(`INSERT INTO lease.short_term_exemptions (contract_id,exemption_type,asset_class,annual_expense,period_start,period_end,justification,approved_by,approved_date,is_active) VALUES (${ac[5].contract_id},'SHORT_TERM','Office Equipment',48000,'2025-01-01','2025-12-31','Lease term 11 months — qualifies for short-term exemption per IFRS 16.B3',1,'2024-12-15',1)`);
if (ac[6]) await pool.request().query(`INSERT INTO lease.short_term_exemptions (contract_id,exemption_type,asset_class,annual_expense,period_start,period_end,justification,approved_by,approved_date,is_active) VALUES (${ac[6].contract_id},'LOW_VALUE','IT Equipment',18000,'2025-01-01','2025-12-31','Underlying asset value AED 18,000 — below AED 50,000 low-value threshold per IFRS 16.5(b)',1,'2024-12-15',1)`);
if (ac[7]) await pool.request().query(`INSERT INTO lease.short_term_exemptions (contract_id,exemption_type,asset_class,annual_expense,period_start,period_end,justification,approved_by,approved_date,is_active) VALUES (${ac[7].contract_id},'LOW_VALUE','Photocopiers',12000,'2025-01-01','2025-12-31','Photocopier lease — asset value AED 12,000 qualifies for low-value exemption',1,'2024-12-15',1)`);
console.log('Exemptions seeded');

await pool.close();
console.log('\nAll P1 seed data inserted successfully');
