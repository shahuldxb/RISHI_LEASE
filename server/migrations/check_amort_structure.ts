import { getPool } from "../db-sqlserver";

async function main() {
  const pool = await getPool();

  // Check if sp_GetAmortisationSchedule exists
  const sp = await pool.request().query(`
    SELECT OBJECT_ID('dbo.sp_GetAmortisationSchedule', 'P') AS sp_exists
  `);
  console.log("SP exists:", JSON.stringify(sp.recordset[0]));

  // Check amortisation_schedule table columns
  const tbl = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='amortisation_schedule'
    ORDER BY ORDINAL_POSITION
  `);
  console.log("amortisation_schedule columns:", JSON.stringify(tbl.recordset, null, 2));

  // Sample contracts
  const sample = await pool.request().query(`
    SELECT TOP 5 contract_id, contract_ref, commencement_date, expiry_date,
           monthly_payment, ibr, classification, currency, asset_description
    FROM lease.contracts
    WHERE classification IN ('Finance','Operating','Rental','ShortTerm')
    ORDER BY contract_id DESC
  `);
  console.log("Sample contracts:", JSON.stringify(sample.recordset, null, 2));

  // Check if any amortisation rows exist
  const rows = await pool.request().query(`
    SELECT TOP 3 * FROM lease.amortisation_schedule ORDER BY period_date DESC
  `);
  console.log("Sample amort rows:", JSON.stringify(rows.recordset, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
