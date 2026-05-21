import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();
const config = {
  server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT||'1433'),
  database: process.env.MSSQL_DATABASE, user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  connectionTimeout: 30000, requestTimeout: 30000,
};
async function run() {
  const pool = await sql.connect(config);
  const r = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='fx_revaluation_log' ORDER BY ORDINAL_POSITION
  `);
  console.log('fx_revaluation_log columns:');
  r.recordset.forEach(c => console.log(' ', c.COLUMN_NAME, '-', c.DATA_TYPE));
  await pool.close();
}
run().catch(e=>{console.error(e.message);process.exit(1);});
