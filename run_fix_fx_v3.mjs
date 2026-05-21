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
  const migSql = fs.readFileSync(path.join(__dirname, 'server/migrations/fix_fx_reval_sp_v3.sql'), 'utf8');
  const batches = migSql.split(/^\s*GO\s*$/im).filter(b => b.trim().length > 0);
  for (let i = 0; i < batches.length; i++) {
    try { await pool.request().query(batches[i].trim()); console.log(`Batch ${i+1}: OK`); }
    catch(e) { console.error(`Batch ${i+1} FAILED: ${e.message.slice(0,120)}`); }
  }
  // Smoke test all 5 SPs
  const sps = ['sp_UpsertFXRate','sp_GetFXRates','sp_RunFXRevaluation','sp_GetFXRevaluationLog','sp_GetFXRevaluationSummary'];
  for (const sp of sps) {
    const r = await pool.request().query(`SELECT COUNT(*) AS cnt FROM sys.objects WHERE name='${sp}' AND type='P'`);
    console.log(`  ${r.recordset[0].cnt===1?'✓':'✗'} ${sp}`);
  }
  // Re-seed FX rates with correct column name
  const today = new Date().toISOString().slice(0,10);
  const rates = [{code:'USD',rate:3.641},{code:'EUR',rate:3.982},{code:'AED',rate:0.991},{code:'GBP',rate:4.621},{code:'SAR',rate:0.971}];
  for (const r of rates) {
    try {
      await pool.request()
        .input('Currency',    sql.NVarChar(3),   r.code)
        .input('RateDate',    sql.Date,           new Date(today))
        .input('ClosingRate', sql.Decimal(18,6),  r.rate)
        .input('Source',      sql.NVarChar(50),   'Manual seed')
        .execute('sp_UpsertFXRate');
      console.log(`  ✓ ${r.code} = ${r.rate} QAR`);
    } catch(e) { console.error(`  ✗ ${r.code}: ${e.message.slice(0,80)}`); }
  }
  await pool.close();
}
run().catch(e=>{console.error(e.message);process.exit(1);});
