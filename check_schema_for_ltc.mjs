import mssql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false }
};

const pool = await mssql.connect(cfg);

// 1. contracts columns
const cols = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='contracts'
  ORDER BY ORDINAL_POSITION
`);
console.log('=== lease.contracts columns ===');
cols.recordset.forEach(r => console.log(`  ${r.COLUMN_NAME} (${r.DATA_TYPE}) ${r.IS_NULLABLE==='YES'?'NULL':''}`));

// 2. amortisation_schedule columns
const acols = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='amortisation_schedule'
  ORDER BY ORDINAL_POSITION
`);
console.log('\n=== lease.amortisation_schedule columns ===');
acols.recordset.forEach(r => console.log(`  ${r.COLUMN_NAME} (${r.DATA_TYPE})`));

// 3. gl_postings columns
const gcols = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='gl_postings'
  ORDER BY ORDINAL_POSITION
`);
console.log('\n=== lease.gl_postings columns ===');
gcols.recordset.forEach(r => console.log(`  ${r.COLUMN_NAME} (${r.DATA_TYPE})`));

// 4. Sample GL account codes
const gl = await pool.request().query(`
  SELECT TOP 20 account_code, account_name, account_type
  FROM coa.chart_of_accounts
  WHERE account_name LIKE '%Lease%' OR account_name LIKE '%ROU%' OR account_name LIKE '%Right%'
  ORDER BY account_code
`);
console.log('\n=== Lease-related GL accounts ===');
gl.recordset.forEach(r => console.log(`  ${r.account_code} | ${r.account_name} | ${r.account_type}`));

await pool.close();
