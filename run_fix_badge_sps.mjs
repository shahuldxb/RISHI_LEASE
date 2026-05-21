import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = {
  server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT||'1433'),
  database: process.env.MSSQL_DATABASE, user: process.env.MSSQL_USER, password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
  connectionTimeout: 30000, requestTimeout: 60000,
};
const pool = await sql.connect(config);
console.log('Connected');
const content = fs.readFileSync(path.join(__dirname, 'server/migrations/fix_renewal_badge_sps.sql'), 'utf8');
const batches = content.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean);
for (let i = 0; i < batches.length; i++) {
  try { await pool.request().query(batches[i]); console.log(`  ✓ Batch ${i+1}/${batches.length}`); }
  catch(e) { console.error(`  ✗ Batch ${i+1}: ${e.message}`); }
}
await pool.close();
console.log('Done');
