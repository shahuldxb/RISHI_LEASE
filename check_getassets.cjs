const sql = require('mssql');
const config = { server: 'SQL_SERVER_HOST_REDACTED', database: 'leasing', user: 'SQL_USER_REDACTED', password: 'SQL_PASSWORD_REDACTED', options: { trustServerCertificate: true, encrypt: false } };
async function main() {
  const pool = await sql.connect(config);
  const params = await pool.request().query(`SELECT p.name, t.name as type FROM sys.parameters p JOIN sys.types t ON p.user_type_id = t.user_type_id WHERE p.object_id = OBJECT_ID('sp_GetAssets') ORDER BY p.parameter_id`);
  console.log('SP_GETASSETS PARAMS:', params.recordset.map(r => r.name + ':' + r.type).join(', '));
  const delParams = await pool.request().query(`SELECT p.name, t.name as type FROM sys.parameters p JOIN sys.types t ON p.user_type_id = t.user_type_id WHERE p.object_id = OBJECT_ID('sp_DeleteAsset') ORDER BY p.parameter_id`);
  console.log('SP_DELETEASSET PARAMS:', delParams.recordset.map(r => r.name + ':' + r.type).join(', '));
  await pool.close();
}
main().catch(e => console.error('ERR:', e.message));
