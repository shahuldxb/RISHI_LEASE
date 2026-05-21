import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = {
  server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT||'1433'),
  database: process.env.MSSQL_DATABASE, user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 60000,
};
async function run() {
  const pool = await sql.connect(config);
  const migSql = fs.readFileSync(path.join(__dirname, 'server/migrations/fix_fx_reval_sp_v2.sql'), 'utf8');
  const batches = migSql.split(/^\s*GO\s*$/im).filter(b => b.trim().length > 0);
  for (let i = 0; i < batches.length; i++) {
    try { await pool.request().query(batches[i].trim()); console.log(`Batch ${i+1}: OK`); }
    catch(e) { console.error(`Batch ${i+1} FAILED: ${e.message.slice(0,120)}`); }
  }
  const r = await pool.request().query("SELECT COUNT(*) AS cnt FROM sys.objects WHERE name='sp_RunFXRevaluation' AND type='P'");
  console.log('sp_RunFXRevaluation:', r.recordset[0].cnt===1?'✓ EXISTS':'✗ MISSING');
  await pool.close();
}
run().catch(e=>{console.error(e);process.exit(1);});
