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
  const batches = sql.split(/^\s*GO\s*$/im).filter(b => b.trim().length > 0);
  for (const batch of batches) {
    try {
      await pool.request().query(batch);
    } catch (e) {
      console.error('  BATCH ERROR:', e.message.substring(0, 300));
      console.error('  Batch:', batch.substring(0, 120));
    }
  }
  console.log(`  Done: ${file}`);
}

await runSQL('./server/migrations/fix_disclosure_ias17_v2.sql');

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
console.log('\n=== All SPs ===');
r.recordset.forEach(x => console.log(`  ${x.schema_name}.${x.sp_name}`));

// Quick smoke test: call sp_GetIFRS16DisclosureNotes for 2026
try {
  const test = await pool.request().input('ReportingYear', mssql.Int, 2026).execute('sp_GetIFRS16DisclosureNotes');
  console.log('\nDisclosure Notes test: OK, result sets:', test.recordsets.length);
  if (test.recordsets[3]) console.log('  Key Assumptions:', JSON.stringify(test.recordsets[3][0]));
} catch(e) {
  console.error('Disclosure Notes test FAILED:', e.message);
}

// Quick smoke test: sp_GetIAS17Comparison
try {
  const test2 = await pool.request().input('Year', mssql.Int, 2026).execute('sp_GetIAS17Comparison');
  console.log('IAS17 Comparison test: OK, rows:', test2.recordsets[0]?.length, 'summary:', JSON.stringify(test2.recordsets[1]?.[0]));
} catch(e) {
  console.error('IAS17 Comparison test FAILED:', e.message);
}

await pool.close();
console.log('\nAll done.');
