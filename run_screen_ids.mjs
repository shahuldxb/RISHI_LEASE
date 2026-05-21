import sql from 'mssql';
import { readFileSync } from 'fs';
const cfg = { server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT||'1433'), database: process.env.MSSQL_DATABASE, user: process.env.MSSQL_USER, password: process.env.MSSQL_PASSWORD, options: { encrypt: true, trustServerCertificate: true }, requestTimeout: 30000 };
const pool = await sql.connect(cfg);
const sqlContent = readFileSync('./server/migrations/register_ifrs_screen_ids.sql', 'utf8');
const batches = sqlContent.split(/\bGO\b/gi).map(b=>b.trim()).filter(b=>b.length>0);
for (let i=0;i<batches.length;i++) {
  try { await pool.request().query(batches[i]); console.log(`[${i+1}] OK`); }
  catch(e) { console.error(`[${i+1}] FAILED: ${e.message.split('\n')[0]}`); }
}
await pool.close();
