import { getPool } from "../db-sqlserver";

async function main() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='contracts'
    ORDER BY ORDINAL_POSITION
  `);
  console.log("Columns:", r.recordset.map((c: any) => c.COLUMN_NAME).join(', '));

  // Sample row
  const s = await pool.request().query(`SELECT TOP 1 * FROM lease.contracts ORDER BY contract_id DESC`);
  if (s.recordset.length > 0) {
    console.log("Sample row:", JSON.stringify(s.recordset[0], null, 2));
  } else {
    console.log("No rows in lease.contracts");
  }

  // Check amortisation_schedule sample
  const a = await pool.request().query(`SELECT TOP 2 * FROM lease.amortisation_schedule ORDER BY schedule_id DESC`);
  console.log("Amort rows:", JSON.stringify(a.recordset, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
