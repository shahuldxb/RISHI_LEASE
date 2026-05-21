import mssql from 'mssql';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
const cfg = {
  server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT||'1433'),
  database: process.env.MSSQL_DATABASE, user: process.env.MSSQL_USER, password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 120000,
};
const pool = await mssql.connect(cfg);
const sql = fs.readFileSync('./server/migrations/fix_ltc_lessor_col.sql','utf8');
const batches = sql.split(/^\s*GO\s*$/im).map(b=>b.trim()).filter(b=>b.length>0);
console.log(`Running ${batches.length} batches...`);
for(let i=0;i<batches.length;i++){
  try{ await pool.request().query(batches[i]); console.log(`  ✅ Batch ${i+1} OK`); }
  catch(e){ console.error(`  ❌ Batch ${i+1} FAILED: ${e.message}`); }
}
await pool.close();
