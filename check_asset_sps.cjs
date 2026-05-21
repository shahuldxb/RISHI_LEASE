const sql = require('mssql');
const config = { server: 'SQL_SERVER_HOST_REDACTED', database: 'leasing', user: 'SQL_USER_REDACTED', password: 'SQL_PASSWORD_REDACTED', options: { trustServerCertificate: true, encrypt: false } };
async function main() {
  const pool = await sql.connect(config);
  const sps = await pool.request().query(`SELECT name FROM sys.procedures WHERE name LIKE '%SubAsset%' OR name LIKE '%sub_asset%' OR name LIKE '%Asset%' ORDER BY name`);
  console.log('Asset SPs:', JSON.stringify(sps.recordset.map(r => r.name)));
  const tables = await pool.request().query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%sub_asset%' OR TABLE_NAME LIKE '%asset%' ORDER BY TABLE_NAME`);
  console.log('Asset tables:', JSON.stringify(tables.recordset.map(r => r.TABLE_NAME)));
  await pool.close();
}
main().catch(e => console.error('ERR:', e.message));
