import sql from 'mssql';
import { readFileSync } from 'fs';

const config = {
  server: 'SQL_SERVER_HOST_REDACTED', port: 1433, user: 'SQL_USER_REDACTED',
  password: 'SQL_PASSWORD_REDACTED', database: 'leasing',
  options: { encrypt: true, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 60000
};

const content = readFileSync('./database/07_cheque_module.sql', 'utf8');

// Split on GO statements
const batches = content.split(/^\s*GO\s*$/im)
  .map(b => b.trim())
  .filter(b => b.length > 0 && !b.startsWith('--'));

async function run() {
  const pool = await sql.connect(config);
  console.log('Connected to SQL Server');
  let ok = 0, fail = 0;
  for (const batch of batches) {
    try {
      await pool.request().query(batch);
      ok++;
    } catch (e) {
      console.error(`FAIL: ${e.message.substring(0, 120)}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
  await pool.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
