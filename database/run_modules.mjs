import sql from 'mssql';
import { readFileSync } from 'fs';

const config = {
  server: 'SQL_SERVER_HOST_REDACTED', database: 'leasing', user: 'SQL_USER_REDACTED', password: 'SQL_PASSWORD_REDACTED',
  options: { trustServerCertificate: true, encrypt: false }
};

async function runScript(pool, filename) {
  const script = readFileSync(filename, 'utf8');
  const batches = script.split(/^GO\s*$/im).map(b => b.trim()).filter(b => b.length > 0);
  let ok = 0, fail = 0;
  for (const batch of batches) {
    try {
      await pool.request().query(batch);
      ok++;
    } catch(e) {
      const msg = e.message || '';
      const isHarmless = msg.includes('already exists') || msg.includes('There is already') || msg.includes('already an object') || msg.includes('already exists in the current database');
      if (isHarmless) {
        ok++;
      } else {
        console.error(`  FAIL [${filename}]: ${msg.substring(0, 150)}`);
        fail++;
      }
    }
  }
  return { ok, fail };
}

const pool = await sql.connect(config);
console.log('Connected to SQL Server leasing database\n');

console.log('=== Running: Contract Module ===');
const r1 = await runScript(pool, './database/04_contract_module.sql');
console.log(`  Result: ${r1.ok} OK, ${r1.fail} failed\n`);

console.log('=== Running: Bank Reconciliation Module ===');
const r2 = await runScript(pool, './database/05_bank_recon_module.sql');
console.log(`  Result: ${r2.ok} OK, ${r2.fail} failed\n`);

// Verify tables
const tables = await pool.request().query(`
  SELECT TABLE_SCHEMA + '.' + TABLE_NAME AS tbl
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA IN ('lease','bank')
    AND TABLE_NAME IN ('contract_versions','contract_documents','contract_milestones','contract_terminations',
                       'bank_accounts','bank_statements','bank_transactions','recon_sessions','recon_matches','recon_exceptions','recon_rules')
  ORDER BY TABLE_SCHEMA, TABLE_NAME
`);
console.log('New tables created:');
tables.recordset.forEach(r => console.log('  ✓', r.tbl));

// Verify SPs
const sps = await pool.request().query(`
  SELECT name FROM sys.procedures
  WHERE name LIKE 'sp_%Contract%' OR name LIKE 'sp_%Recon%' OR name LIKE 'sp_%Bank%'
  ORDER BY name
`);
console.log('\nNew stored procedures:');
sps.recordset.forEach(r => console.log('  ✓', r.name));

// Verify screens
const screens = await pool.request().query(`
  SELECT screen_id, screen_name FROM security.screen_registry
  WHERE module IN ('Contract','BankRecon')
  ORDER BY module, screen_id
`);
console.log('\nRegistered screens:');
screens.recordset.forEach(r => console.log(`  ✓ ${r.screen_id} — ${r.screen_name}`));

await sql.close();
console.log('\n✅ All modules deployed successfully!');
