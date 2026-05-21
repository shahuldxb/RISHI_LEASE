import sql from '/home/ubuntu/vodalease-enterprise/node_modules/mssql/index.js';

const cfg = {
  server: process.env.MSSQL_HOST,
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  options: { trustServerCertificate: true, encrypt: false }
};

const pool = await sql.connect(cfg);

const acRes = await pool.request().query(
  `SELECT contract_id, monthly_payment AS monthly_rent, asset_type FROM lease.contracts WHERE status='Active' ORDER BY contract_id`
);
const ac = acRes.recordset;
console.log('Active contracts:', ac.length);

// Remeasurement events
await pool.request().query(`DELETE FROM lease.remeasurement_events`);
const remRows = [
  [ac[0]?.contract_id, 'EXTENSION_EXERCISE', '2024-06-01', 'Renewal option exercised 2yr', 850000, 820000, 5.50, 24, 1420000, 1380000, 5.25, 48, 570000, 560000, 'POSTED'],
  [ac[1]?.contract_id, 'CPI_UPDATE', '2025-01-01', 'CPI rent review 6.2%', 1200000, 1150000, 5.75, 36, 1274400, 1221300, 5.75, 35, 74400, 71300, 'POSTED'],
  [ac[2]?.contract_id, 'MODIFICATION', '2025-03-15', 'Scope reduction floor 3', 2100000, 2050000, 6.00, 48, 1750000, 1708333, 6.00, 48, -350000, -341667, 'POSTED'],
  [ac[3]?.contract_id, 'RATE_REVISION', '2025-04-01', 'IBR revised 6.00 to 5.75', 980000, 945000, 6.00, 30, 1010000, 974167, 5.75, 30, 30000, 29167, 'PENDING'],
];
for (const [cid, et, ed, desc, ol, or_, oi, ot, nl, nr, ni, nt, la, ra, st] of remRows) {
  if (!cid) continue;
  const req = pool.request();
  req.input('cid', sql.Int, cid);
  req.input('et', sql.NVarChar, et);
  req.input('ed', sql.Date, new Date(ed));
  req.input('desc', sql.NVarChar, desc);
  req.input('ol', sql.Decimal(18,2), ol);
  req.input('or_', sql.Decimal(18,2), or_);
  req.input('oi', sql.Decimal(8,4), oi);
  req.input('ot', sql.Int, ot);
  req.input('nl', sql.Decimal(18,2), nl);
  req.input('nr', sql.Decimal(18,2), nr);
  req.input('ni', sql.Decimal(8,4), ni);
  req.input('nt', sql.Int, nt);
  req.input('la', sql.Decimal(18,2), la);
  req.input('ra', sql.Decimal(18,2), ra);
  req.input('st', sql.NVarChar, st);
  await req.query(`INSERT INTO lease.remeasurement_events (contract_id,event_type,event_date,trigger_description,old_liability,old_rou_asset,old_ibr,old_remaining_term,new_liability,new_rou_asset,new_ibr,new_remaining_term,liability_adjustment,rou_adjustment,status) VALUES (@cid,@et,@ed,@desc,@ol,@or_,@oi,@ot,@nl,@nr,@ni,@nt,@la,@ra,@st)`);
}
console.log('Remeasurement events seeded');

// Escalations
await pool.request().query(`DELETE FROM lease.lease_escalations`);
const escRows = [
  [ac[0]?.contract_id, 'CPI', '2025-01-01', ac[0]?.monthly_rent, 6.20, ac[0] ? (ac[0].monthly_rent * 1.062) : null, 'APPLIED', '2025-01-01', 'Annual UAE CPI review'],
  [ac[1]?.contract_id, 'FIXED_PCT', '2025-07-01', ac[1]?.monthly_rent, 5.00, ac[1] ? (ac[1].monthly_rent * 1.05) : null, 'PENDING', null, 'Fixed 5% escalation per lease clause 12.3'],
  [ac[2]?.contract_id, 'MARKET_REVIEW', '2026-01-01', ac[2]?.monthly_rent, null, null, 'PENDING', null, 'Market rent review - valuer to be appointed'],
  [ac[3]?.contract_id, 'FIXED_AMT', '2025-06-01', ac[3]?.monthly_rent, null, ac[3] ? (ac[3].monthly_rent + 5000) : null, 'PENDING', null, 'Fixed AED 5000/month step-up'],
];
for (const [cid, et, rd, br, rp, nr, st, ad, notes] of escRows) {
  if (!cid) continue;
  const req = pool.request();
  req.input('cid', sql.Int, cid);
  req.input('et', sql.NVarChar, et);
  req.input('rd', sql.Date, new Date(rd));
  req.input('br', sql.Decimal(18,2), br);
  req.input('rp', rp != null ? sql.Decimal(8,4) : sql.NVarChar, rp);
  req.input('nr', nr != null ? sql.Decimal(18,2) : sql.NVarChar, nr);
  req.input('st', sql.NVarChar, st);
  req.input('ad', ad ? sql.Date : sql.NVarChar, ad ? new Date(ad) : null);
  req.input('notes', sql.NVarChar, notes);
  await req.query(`INSERT INTO lease.lease_escalations (contract_id,escalation_type,review_date,base_rent,escalation_rate_pct,new_rent,status,applied_date,notes) VALUES (@cid,@et,@rd,@br,@rp,@nr,@st,@ad,@notes)`);
}
console.log('Escalations seeded');

// Variable rent
await pool.request().query(`DELETE FROM lease.variable_rent`);
const cid0 = ac[0]?.contract_id;
if (cid0) {
  const r1 = pool.request();
  r1.input('cid', sql.Int, cid0);
  await r1.query(`INSERT INTO lease.variable_rent (contract_id,period_start,period_end,basis,rate_pct,actual_amount,estimated_amount,notes) VALUES (@cid,'2024-01-01','2024-12-31','Revenue % (Retail Turnover)',2.50,185000,170000,'Variable rent 2024')`);
  const r2 = pool.request();
  r2.input('cid', sql.Int, cid0);
  await r2.query(`INSERT INTO lease.variable_rent (contract_id,period_start,period_end,basis,rate_pct,actual_amount,estimated_amount,notes) VALUES (@cid,'2025-01-01','2025-12-31','Revenue % (Retail Turnover)',2.50,NULL,195000,'Variable rent 2025')`);
}
console.log('Variable rent seeded');

// Exemptions
await pool.request().query(`DELETE FROM lease.short_term_exemptions`);
const exemptions = [
  [ac[5]?.contract_id, 'SHORT_TERM', 'Office Equipment', 48000, '2025-01-01', '2025-12-31', 'Lease term 11 months - short-term exemption IFRS 16.B3'],
  [ac[6]?.contract_id, 'LOW_VALUE', 'IT Equipment', 18000, '2025-01-01', '2025-12-31', 'Asset value AED 18000 below threshold IFRS 16.5(b)'],
  [ac[7]?.contract_id, 'LOW_VALUE', 'Photocopiers', 12000, '2025-01-01', '2025-12-31', 'Photocopier lease low-value exemption'],
];
for (const [cid, et, ac_, ae, ps, pe, just] of exemptions) {
  if (!cid) continue;
  const req = pool.request();
  req.input('cid', sql.Int, cid);
  req.input('et', sql.NVarChar, et);
  req.input('ac_', sql.NVarChar, ac_);
  req.input('ae', sql.Decimal(18,2), ae);
  req.input('ps', sql.Date, new Date(ps));
  req.input('pe', sql.Date, new Date(pe));
  req.input('just', sql.NVarChar, just);
  await req.query(`INSERT INTO lease.short_term_exemptions (contract_id,exemption_type,asset_class,annual_expense,period_start,period_end,justification,approved_by,approved_date,is_active) VALUES (@cid,@et,@ac_,@ae,@ps,@pe,@just,1,'2024-12-15',1)`);
}
console.log('Exemptions seeded');

await pool.close();
console.log('All P1 remaining data seeded successfully');
