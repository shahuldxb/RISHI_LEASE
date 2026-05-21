import sql from 'mssql';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 60000,
};

const sqlFile = readFileSync(join(__dirname, '../drizzle/jv_module.sql'), 'utf8');

// Split on GO statements (T-SQL batch separator)
const batches = sqlFile.split(/^\s*GO\s*$/m).map(b => b.trim()).filter(b => b.length > 0);

async function run() {
  const pool = await sql.connect(cfg);
  console.log('Connected to SQL Server');

  let ok = 0, fail = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      await pool.request().query(batch);
      ok++;
      // Print first 80 chars of batch for progress
      console.log(`  [${i+1}/${batches.length}] OK — ${batch.substring(0,80).replace(/\n/g,' ')}...`);
    } catch (e) {
      fail++;
      console.error(`  [${i+1}/${batches.length}] FAIL — ${e.message.substring(0,120)}`);
      console.error(`  Batch: ${batch.substring(0,120)}`);
    }
  }

  console.log(`\nDone: ${ok} OK, ${fail} failed`);

  // Verify
  const r = await pool.request().query(`
    SELECT TABLE_SCHEMA+'.'+TABLE_NAME AS tbl FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA='accounting' ORDER BY TABLE_NAME
  `);
  console.log('\nAccounting tables:', r.recordset.map(x => x.tbl));

  const r2 = await pool.request().query(`SELECT COUNT(*) AS cnt FROM accounting.gl_chart_of_accounts`);
  console.log('GL COA rows:', r2.recordset[0].cnt);

  const r3 = await pool.request().query(`SELECT setting_key, setting_value FROM accounting.system_settings`);
  console.log('System settings:', r3.recordset);

  await pool.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
