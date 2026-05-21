import sql from 'mssql';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 60000,
};

async function run() {
  console.log(`Connecting to ${config.server}/${config.database}...`);
  const pool = await sql.connect(config);
  
  const script = readFileSync(join(__dirname, '08_fix_sps.sql'), 'utf8');
  // Split on GO statements
  const batches = script.split(/^\s*GO\s*$/im).filter(b => b.trim().length > 0);
  
  let passed = 0, failed = 0;
  for (const batch of batches) {
    const preview = batch.trim().substring(0, 60).replace(/\n/g, ' ');
    try {
      await pool.request().query(batch);
      console.log(`  OK: ${preview}...`);
      passed++;
    } catch (e) {
      console.error(`  FAIL: ${preview}... → ${e.message}`);
      failed++;
    }
  }
  
  console.log(`\nDone: ${passed} passed, ${failed} failed`);
  await pool.close();
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
