import sql from 'mssql';
import { readFileSync } from 'fs';

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 60000,
  connectionTimeout: 30000,
};

const pool = await sql.connect(cfg);
console.log('Connected to SQL Server');

const sqlContent = readFileSync('./server/migrations/add_ifrs_financial_statements.sql', 'utf8');
const batches = sqlContent.split(/\bGO\b/gi).map(b => b.trim()).filter(b => b.length > 0);

console.log(`Running ${batches.length} batches...`);
let ok = 0, fail = 0;
for (let i = 0; i < batches.length; i++) {
  try {
    await pool.request().query(batches[i]);
    console.log(`  [${i+1}/${batches.length}] OK`);
    ok++;
  } catch (e) {
    console.error(`  [${i+1}/${batches.length}] FAILED: ${e.message.split('\n')[0]}`);
    fail++;
  }
}

console.log(`\nDone: ${ok} OK, ${fail} failed`);
await pool.close();
