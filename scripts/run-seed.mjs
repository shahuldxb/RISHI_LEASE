/**
 * Seed runner — executes 13_comprehensive_seed.sql against SQL Server
 */
import sql from 'mssql';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  server: process.env.SQLSERVER_HOST || 'SQL_SERVER_HOST_REDACTED',
  database: process.env.SQLSERVER_DB || 'leasing',
  user: process.env.SQLSERVER_USER || 'SQL_USER_REDACTED',
  password: process.env.SQLSERVER_PASSWORD || 'SQL_PASSWORD_REDACTED',
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectTimeout: 30000,
    requestTimeout: 300000,
  },
};

async function runSeed() {
  console.log('Connecting to SQL Server...');
  const pool = await sql.connect(config);
  console.log('Connected!');

  const seedFile = path.join(__dirname, '../database/14_fix_missing_seed.sql');
  const rawSql = readFileSync(seedFile, 'utf-8');

  // Split on GO statements (SQL Server batch separator)
  const batches = rawSql
    .split(/^\s*GO\s*$/gim)
    .map(b => b.trim())
    .filter(b => b.length > 0 && !b.startsWith('--'));

  console.log(`Running ${batches.length} SQL batches...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      await pool.request().query(batch);
      process.stdout.write('.');
    } catch (err) {
      console.error(`\nError in batch ${i + 1}:`);
      console.error('SQL:', batch.substring(0, 200));
      console.error('Error:', err.message);
      // Continue with other batches
    }
  }

  console.log('\nSeed complete!');
  await pool.close();
}

runSeed().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
