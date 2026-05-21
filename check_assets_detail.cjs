const sql = require('mssql');
const config = { server: 'SQL_SERVER_HOST_REDACTED', database: 'leasing', user: 'SQL_USER_REDACTED', password: 'SQL_PASSWORD_REDACTED', options: { trustServerCertificate: true, encrypt: false } };
async function main() {
  const pool = await sql.connect(config);
  const cols = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'assets' ORDER BY ORDINAL_POSITION`);
  console.log('ASSETS COLS:', cols.recordset.map(r => r.COLUMN_NAME + ':' + r.DATA_TYPE).join(', '));
  const params = await pool.request().query(`SELECT p.name, t.name as type FROM sys.parameters p JOIN sys.types t ON p.user_type_id = t.user_type_id WHERE p.object_id = OBJECT_ID('sp_UpsertAsset') ORDER BY p.parameter_id`);
  console.log('SP_UPSERTASSET PARAMS:', params.recordset.map(r => r.name + ':' + r.type).join(', '));
  await pool.close();
}
main().catch(e => console.error('ERR:', e.message));
