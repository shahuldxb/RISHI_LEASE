import mssql from 'mssql';
import { readFileSync } from 'fs';

const cfg = {
  server: process.env.MSSQL_HOST,
  port: Number(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }
};

const pool = await mssql.connect(cfg);

async function runSQL(file) {
  console.log(`\n=== Running: ${file} ===`);
  const sql = readFileSync(file, 'utf8');
  // Split on GO statements (SQL Server batch separator)
  const batches = sql.split(/^\s*GO\s*$/im).filter(b => b.trim().length > 0);
  for (const batch of batches) {
    try {
      await pool.request().query(batch);
    } catch (e) {
      console.error('  BATCH ERROR:', e.message.substring(0, 200));
      console.error('  Batch preview:', batch.substring(0, 100));
    }
  }
  console.log(`  Done: ${file}`);
}

await runSQL('./server/migrations/add_disclosure_notes_sp.sql');
await runSQL('./server/migrations/add_renewal_periodclose_ias17.sql');

// Verify all SPs exist
const r = await pool.request().query(`
  SELECT o.name AS sp_name, s.name AS schema_name
  FROM sys.objects o JOIN sys.schemas s ON o.schema_id=s.schema_id
  WHERE o.type='P' AND o.name IN (
    'sp_GetIFRS16DisclosureNotes',
    'sp_GetRenewals','sp_InitiateRenewal','sp_ApproveRenewal','sp_RejectRenewal',
    'sp_GetPeriodCloseStatus','sp_ClosePeriod','sp_ReopenPeriod',
    'sp_GetIAS17Comparison'
  )
  ORDER BY o.name
`);
console.log('\n=== Created SPs ===');
r.recordset.forEach(x => console.log(`  ${x.schema_name}.${x.sp_name}`));

// Verify tables
const t = await pool.request().query(`
  SELECT s.name AS schema_name, t.name AS table_name
  FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id
  WHERE t.name IN ('renewals','period_close')
  ORDER BY t.name
`);
console.log('\n=== Created Tables ===');
t.recordset.forEach(x => console.log(`  ${x.schema_name}.${x.table_name}`));

await pool.close();
console.log('\nAll migrations complete.');
