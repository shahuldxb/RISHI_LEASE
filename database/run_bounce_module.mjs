import sql from 'mssql';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const config = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 60000,
};

const pool = await sql.connect(config);
const script = fs.readFileSync('database/11_bounce_module.sql', 'utf8');
const batches = script.split(/^\s*GO\s*$/im).filter(b => b.trim().length > 0);

let ok = 0, fail = 0;
for (const batch of batches) {
  const preview = batch.trim().substring(0, 60).replace(/\n/g, ' ');
  try {
    await pool.request().query(batch);
    ok++;
    console.log('OK:', preview);
  } catch (e) {
    fail++;
    console.error('FAIL:', preview, '->', e.message.substring(0, 100));
  }
}
console.log(`\nDone: ${ok} ok, ${fail} failed`);
await pool.close();
process.exit(fail > 0 ? 1 : 0);
