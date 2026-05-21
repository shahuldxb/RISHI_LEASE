import { getPool } from '../db-sqlserver';

async function main() {
  const pool = await getPool();
  
  // Check if amortisation_schedule has data
  const countRes = await pool.request().query(`
    SELECT COUNT(*) as cnt FROM lease.amortisation_schedule
  `);
  console.log("amortisation_schedule rows:", countRes.recordset[0].cnt);

  // Check what sp_GetConsolidatedGLEntries returns
  const glRes = await pool.request()
    .input("year", null)
    .input("viewMode", "monthly")
    .execute("sp_GetConsolidatedGLEntries");
  console.log("GL entries count:", glRes.recordset?.length ?? 0);
  if (glRes.recordset?.length > 0) {
    console.log("Sample GL entry:", JSON.stringify(glRes.recordset[0]));
  }

  // Check what sp_GetAmortisationScheduleAll returns
  const schedRes = await pool.request()
    .input("year", null)
    .input("viewMode", "monthly")
    .execute("sp_GetAmortisationScheduleAll");
  console.log("Schedule rows count:", schedRes.recordset?.length ?? 0);
  if (schedRes.recordset?.length > 0) {
    console.log("Sample schedule row:", JSON.stringify(schedRes.recordset[0]));
  }

  await pool.close();
}

main().catch(console.error);
