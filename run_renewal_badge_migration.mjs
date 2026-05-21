import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  server:   process.env.MSSQL_HOST,
  port:     parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user:     process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options:  { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
  connectionTimeout: 30000,
  requestTimeout:    60000,
};

async function run() {
  let pool;
  try {
    pool = await sql.connect(config);
    console.log('Connected to SQL Server');

    const sqlFile = path.join(__dirname, 'server/migrations/add_renewal_badge_notification.sql');
    const content = fs.readFileSync(sqlFile, 'utf8');

    // Split on GO statements
    const batches = content.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean);
    console.log(`Running ${batches.length} batches...`);

    for (let i = 0; i < batches.length; i++) {
      try {
        await pool.request().query(batches[i]);
        console.log(`  ✓ Batch ${i + 1}/${batches.length}`);
      } catch (err) {
        console.error(`  ✗ Batch ${i + 1} failed: ${err.message}`);
        console.error('    SQL:', batches[i].substring(0, 200));
      }
    }

    console.log('\nMigration complete.');
  } catch (err) {
    console.error('Connection error:', err.message);
    process.exit(1);
  } finally {
    if (pool) await pool.close();
  }
}

run();
