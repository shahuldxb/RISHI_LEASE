import sql from '/home/ubuntu/vodalease-enterprise/node_modules/mssql/index.js';
import fs from 'fs';

const cfg = {
  server: process.env.MSSQL_HOST || 'localhost',
  database: process.env.MSSQL_DATABASE || 'compliance',
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  options: { trustServerCertificate: true, encrypt: false }
};

const sqlText = fs.readFileSync('/home/ubuntu/vodalease-enterprise/database/15_p1_accounting_engine.sql', 'utf8');
const batches = sqlText.split(/\bGO\b/i).map(b => b.trim()).filter(b => b.length > 0);

const pool = await sql.connect(cfg);
let ok = 0, fail = 0;
for (const batch of batches) {
  try {
    await pool.request().query(batch);
    ok++;
  } catch (e) {
    console.error('BATCH ERROR:', e.message.substring(0, 120));
    fail++;
  }
}
console.log(`Done: ${ok} ok, ${fail} failed`);
await pool.close();
