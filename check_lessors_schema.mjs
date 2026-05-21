import sql from 'mssql';
const config = {
  server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT||'1433'),
  database: process.env.MSSQL_DATABASE, user: process.env.MSSQL_USER, password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
};
const pool = await sql.connect(config);
const r = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='lessors'
  ORDER BY ORDINAL_POSITION
`);
console.log('lease.lessors columns:');
r.recordset.forEach(c => console.log(' ', c.COLUMN_NAME, '-', c.DATA_TYPE));
await pool.close();
