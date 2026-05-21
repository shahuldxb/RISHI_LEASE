import { getPool } from '../db-sqlserver';

async function main() {
  const pool = await getPool();

  // Check amortisation_schedule columns
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'lease' AND TABLE_NAME = 'amortisation_schedule'
    ORDER BY ORDINAL_POSITION
  `);
  console.log("amortisation_schedule columns:", cols.recordset.map((r: any) => r.COLUMN_NAME).join(", "));

  // Sample row from amortisation_schedule
  const sample = await pool.request().query(`SELECT TOP 2 * FROM lease.amortisation_schedule`);
  console.log("Sample amortisation_schedule row:", JSON.stringify(sample.recordset[0]));

  // Check lease.contracts columns
  const contractCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'lease' AND TABLE_NAME = 'contracts'
    ORDER BY ORDINAL_POSITION
  `);
  console.log("lease.contracts columns:", contractCols.recordset.map((r: any) => r.COLUMN_NAME).join(", "));

  // Check if contract_id values match between the two tables
  const matchCheck = await pool.request().query(`
    SELECT TOP 5 a.contract_id, c.contract_id as c_contract_id
    FROM lease.amortisation_schedule a
    LEFT JOIN lease.contracts c ON a.contract_id = c.contract_id
  `);
  console.log("Join check:", JSON.stringify(matchCheck.recordset));

  await pool.close();
}

main().catch(console.error);
