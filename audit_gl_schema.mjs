import sql from 'mssql';
const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }
};
const pool = await sql.connect(cfg);

// gl_postings columns
const gp = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='gl_postings' ORDER BY ORDINAL_POSITION`);
console.log('gl_postings columns:', gp.recordset.map(r => r.COLUMN_NAME).join(', '));

// coa table - check schema
const coa = await pool.request().query(`SELECT TOP 10 * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%account%' OR TABLE_NAME LIKE '%coa%' OR TABLE_NAME LIKE '%chart%'`);
console.log('COA tables:', coa.recordset.map(r => `${r.TABLE_SCHEMA}.${r.TABLE_NAME}`).join(', '));

// sample gl_postings row
const sample = await pool.request().query(`SELECT TOP 2 * FROM lease.gl_postings ORDER BY posted_at DESC`);
console.log('Sample gl_postings:', JSON.stringify(sample.recordset[0] || {}, null, 2));

// check coa schema columns
const coaCols = await pool.request().query(`SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='coa' ORDER BY TABLE_NAME, ORDINAL_POSITION`);
console.log('COA schema columns:');
const byTable = {};
for (const r of coaCols.recordset) {
  if (!byTable[r.TABLE_NAME]) byTable[r.TABLE_NAME] = [];
  byTable[r.TABLE_NAME].push(`${r.COLUMN_NAME}(${r.DATA_TYPE})`);
}
for (const [t, cols] of Object.entries(byTable)) {
  console.log(`  ${t}: ${cols.join(', ')}`);
}

// check lease.contracts for exemption_type column
const contracts = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='contracts' ORDER BY ORDINAL_POSITION`);
console.log('lease.contracts columns:', contracts.recordset.map(r => r.COLUMN_NAME).join(', '));

// check amortisation_schedule columns
const amort = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='amortisation_schedule' ORDER BY ORDINAL_POSITION`);
console.log('amortisation_schedule columns:', amort.recordset.map(r => r.COLUMN_NAME).join(', '));

await pool.close();
