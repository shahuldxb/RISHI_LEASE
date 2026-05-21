import { getPool } from "../db-sqlserver";
async function main() {
  const pool = await getPool();
  // Get all column names in lease.contracts
  const cols = await pool.request().query(`SELECT TOP 1 * FROM lease.contracts`);
  if (cols.recordset.length > 0) {
    console.log("lease.contracts columns:", Object.keys(cols.recordset[0]));
  } else {
    // No rows — use sys.columns
    const r = await pool.request().query(`
      SELECT c.name AS col_name
      FROM sys.columns c
      JOIN sys.tables t ON c.object_id = t.object_id
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE s.name = 'lease' AND t.name = 'contracts'
      ORDER BY c.column_id
    `);
    console.log("lease.contracts columns (sys):", r.recordset.map((x: any) => x.col_name));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
