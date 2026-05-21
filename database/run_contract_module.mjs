import sql from 'mssql';
import { readFileSync } from 'fs';

const config = {
  server: 'SQL_SERVER_HOST_REDACTED', database: 'leasing', user: 'SQL_USER_REDACTED', password: 'SQL_PASSWORD_REDACTED',
  options: { trustServerCertificate: true, encrypt: false }
};

const pool = await sql.connect(config);
console.log('Connected to SQL Server');

const script = readFileSync('./database/04_contract_module.sql', 'utf8');
const batches = script.split(/^GO\s*$/im).map(b => b.trim()).filter(b => b.length > 0);

let ok = 0, fail = 0;
for (const batch of batches) {
  try {
    await pool.request().query(batch);
    ok++;
  } catch(e) {
    const msg = e.message || '';
    if (msg.includes('already exists') || msg.includes('There is already') || msg.includes('already an object')) {
      ok++;
    } else {
      console.error('FAIL:', msg.substring(0, 150));
      fail++;
    }
  }
}

console.log(`Contract module: ${ok} OK, ${fail} failed`);

// Verify tables created
const tables = await pool.request().query(
  "SELECT TABLE_SCHEMA + '.' + TABLE_NAME AS tbl FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA IN ('lease') AND TABLE_NAME IN ('contract_versions','contract_documents','contract_milestones','contract_terminations') ORDER BY TABLE_NAME"
);
console.log('Contract tables:', tables.recordset.map(r => r.tbl).join(', '));

// Verify SPs
const sps = await pool.request().query(
  "SELECT name FROM sys.procedures WHERE name LIKE '%Contract%' OR name LIKE '%contract%' ORDER BY name"
);
console.log('Contract SPs:', sps.recordset.map(r => r.name).join(', '));

await sql.close();
