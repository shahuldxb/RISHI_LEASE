import sql from 'mssql';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = {
  server:   process.env.MSSQL_HOST,
  port:     parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user:     process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options:  { encrypt: true, trustServerCertificate: true },
};

async function run() {
  const pool = await sql.connect(config);
  const sqlText = readFileSync(join(__dirname, '../drizzle/lessee_master.sql'), 'utf8');

  // Split on GO statements (batch separator)
  const batches = sqlText.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(b => b.length > 0);

  let ok = 0, fail = 0;
  for (const batch of batches) {
    try {
      await pool.request().query(batch);
      ok++;
    } catch (e) {
      const msg = e.message || String(e);
      // Ignore "already exists" type errors
      if (msg.includes('already exists') || msg.includes('There is already') || msg.includes('duplicate')) {
        console.log(`[SKIP] ${msg.slice(0, 80)}`);
        ok++;
      } else {
        console.error(`[FAIL] ${msg.slice(0, 200)}`);
        console.error(`Batch: ${batch.slice(0, 100)}`);
        fail++;
      }
    }
  }
  await pool.close();
  console.log(`\nDone: ${ok} batches OK, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
