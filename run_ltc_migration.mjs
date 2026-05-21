import mssql from 'mssql';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  pool: { max: 3, min: 0, idleTimeoutMillis: 10000 },
  connectionTimeout: 30000,
  requestTimeout: 120000,
};

const pool = await mssql.connect(cfg);

const sql = fs.readFileSync('./server/migrations/add_lease_transaction_centre.sql', 'utf8');

// Split on GO statements
const batches = sql.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(b => b.length > 0);

console.log(`Running ${batches.length} SQL batches...`);
let ok = 0, fail = 0;

for (let i = 0; i < batches.length; i++) {
  try {
    await pool.request().query(batches[i]);
    console.log(`  ✅ Batch ${i + 1} OK`);
    ok++;
  } catch (e) {
    console.error(`  ❌ Batch ${i + 1} FAILED: ${e.message}`);
    fail++;
  }
}

console.log(`\nDone: ${ok} OK, ${fail} failed`);
await pool.close();
