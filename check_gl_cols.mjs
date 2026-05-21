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
// Test the SP with year=0 to see what columns it returns
const r = await pool.request()
  .input('Year', mssql.Int, 0)
  .input('ViewMode', mssql.NVarChar(20), 'monthly')
  .execute('sp_GetAmortisationScheduleAll');
if (r.recordset.length > 0) {
  console.log('Columns:', Object.keys(r.recordset[0]).join(', '));
  console.log('Sample row:', JSON.stringify(r.recordset[0]));
} else {
  console.log('No rows returned');
}
await pool.close();
