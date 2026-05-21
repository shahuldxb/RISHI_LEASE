import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  server:   process.env.MSSQL_HOST,
  port:     parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user:     process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options:  { encrypt: true, trustServerCertificate: true },
  connectionTimeout: 30000,
  requestTimeout:    60000,
};

async function runMigration() {
  const pool = await sql.connect(config);
  console.log('Connected to SQL Server');

  const migFile = path.join(__dirname, 'server/migrations/add_fx_revaluation.sql');
  const migSql  = fs.readFileSync(migFile, 'utf8');

  // Split on GO statements
  const batches = migSql.split(/^\s*GO\s*$/im).filter(b => b.trim().length > 0);
  console.log(`Running ${batches.length} SQL batches...`);

  let ok = 0, fail = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i].trim();
    if (!batch) continue;
    try {
      await pool.request().query(batch);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      console.error(`\nBatch ${i + 1} failed: ${e.message.slice(0, 120)}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} OK, ${fail} failed`);

  // Smoke test: verify tables and SPs exist
  const checks = [
    "SELECT COUNT(*) AS cnt FROM sys.tables WHERE name = 'fx_rates' AND schema_id = SCHEMA_ID('lease')",
    "SELECT COUNT(*) AS cnt FROM sys.tables WHERE name = 'fx_revaluation_log' AND schema_id = SCHEMA_ID('lease')",
    "SELECT COUNT(*) AS cnt FROM sys.objects WHERE name = 'sp_UpsertFXRate' AND type = 'P'",
    "SELECT COUNT(*) AS cnt FROM sys.objects WHERE name = 'sp_GetFXRates' AND type = 'P'",
    "SELECT COUNT(*) AS cnt FROM sys.objects WHERE name = 'sp_RunFXRevaluation' AND type = 'P'",
    "SELECT COUNT(*) AS cnt FROM sys.objects WHERE name = 'sp_GetFXRevaluationLog' AND type = 'P'",
    "SELECT COUNT(*) AS cnt FROM sys.objects WHERE name = 'sp_GetFXRevaluationSummary' AND type = 'P'",
  ];

  console.log('\nSmoke tests:');
  for (const q of checks) {
    const r = await pool.request().query(q);
    const cnt = r.recordset[0].cnt;
    const name = q.match(/'([^']+)'/g).pop().replace(/'/g, '');
    console.log(`  ${cnt === 1 ? '✓' : '✗'} ${name}: ${cnt === 1 ? 'EXISTS' : 'MISSING'}`);
  }

  // Seed some sample FX rates for demo
  console.log('\nSeeding sample FX rates...');
  const today = new Date().toISOString().slice(0, 10);
  const rates = [
    { code: 'USD', rate: 3.641 },
    { code: 'EUR', rate: 3.982 },
    { code: 'AED', rate: 0.991 },
    { code: 'GBP', rate: 4.621 },
    { code: 'SAR', rate: 0.971 },
  ];
  for (const r of rates) {
    try {
      await pool.request()
        .input('CurrencyCode', sql.NVarChar(3),   r.code)
        .input('RateDate',     sql.Date,           new Date(today))
        .input('ClosingRate',  sql.Decimal(18, 6), r.rate)
        .input('Source',       sql.NVarChar(50),   'Manual seed')
        .execute('sp_UpsertFXRate');
      console.log(`  ✓ ${r.code} = ${r.rate} QAR`);
    } catch (e) {
      console.error(`  ✗ ${r.code}: ${e.message.slice(0, 80)}`);
    }
  }

  await pool.close();
}

runMigration().catch(e => { console.error(e); process.exit(1); });
