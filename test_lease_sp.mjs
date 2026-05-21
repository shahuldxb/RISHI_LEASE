import sql from "mssql";
import dotenv from "dotenv";
dotenv.config({ path: "/home/ubuntu/vodalease-enterprise/.env" });

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || "1433"),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};

const pool = await sql.connect(cfg);

// Check if SP exists
const spCheck = await pool.request().query(`
  SELECT OBJECT_ID('asset.sp_GetLeaseListForSubAsset') AS sp_id
`);
console.log("SP exists:", spCheck.recordset[0]);

// Try calling it
try {
  const r = await pool.request().execute("asset.sp_GetLeaseListForSubAsset");
  console.log("SP result rows:", r.recordset?.length, JSON.stringify(r.recordset?.slice(0,3)));
} catch(e) {
  console.log("SP error:", e.message);
}

// Check what lease tables exist and have data
const tables = await pool.request().query(`
  SELECT TOP 5 t.name, s.name as schema_name, p.rows
  FROM sys.tables t
  JOIN sys.schemas s ON t.schema_id = s.schema_id
  JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
  WHERE s.name IN ('lease','asset') AND t.name LIKE '%lease%'
  ORDER BY p.rows DESC
`);
console.log("Lease tables:", JSON.stringify(tables.recordset));

await pool.close();
