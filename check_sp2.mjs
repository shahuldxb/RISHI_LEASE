import mssql from 'mssql';
const cfg = {
  server: process.env.MSSQL_HOST,
  port: Number(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }
};
const pool = await mssql.connect(cfg);
const r = await pool.request().query(`
  SELECT m.definition
  FROM sys.sql_modules m
  JOIN sys.objects o ON m.object_id = o.object_id
  JOIN sys.schemas s ON o.schema_id = s.schema_id
  WHERE s.name = 'lease' AND o.name = 'sp_GetAmortisationScheduleAll'
`);
const def = r.recordset[0]?.definition ?? '';
console.log('Has lifecycle_status:', def.includes('lifecycle_status'));
console.log('SP length:', def.length);
// Show SELECT columns
const selectIdx = def.indexOf('SELECT');
if (selectIdx >= 0) {
  console.log('SELECT block:', def.substring(selectIdx, selectIdx + 600));
}
await pool.close();
