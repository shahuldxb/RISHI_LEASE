import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const sql = readFileSync(join(__dirname, '../drizzle/contract_dms_migration.sql'), 'utf8');

  // Remove comment lines, split on semicolons
  const stmts = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of stmts) {
    try {
      await conn.execute(stmt);
      console.log('OK:', stmt.slice(0, 80));
    } catch (e) {
      console.error('ERR:', e.message, '|', stmt.slice(0, 80));
    }
  }
  await conn.end();
  console.log('Migration complete');
}

run().catch(console.error);
