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
  SELECT s.name AS schema_name, o.name AS sp_name
  FROM sys.objects o
  JOIN sys.schemas s ON o.schema_id = s.schema_id
  WHERE o.type = 'P' AND s.name = 'lease'
  ORDER BY o.name
`);
console.log('SPs in lease schema:', r.recordset.map(x => x.sp_name).join(', '));
await pool.close();
