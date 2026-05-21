import { getPool, sql } from './server/db-sqlserver';
async function main() {
  const pool = await getPool();
  // Check if lifecycle SPs exist
  const r1 = await pool.request().query(`
    SELECT name, schema_name(schema_id) as schema_name 
    FROM sys.objects 
    WHERE type = 'P' AND name LIKE '%lifecycle%' OR name LIKE '%Originate%' OR name LIKE '%PostPeriod%' OR name LIKE '%GLPostings%'
  `);
  console.log('Lifecycle SPs:', r1.recordset.map((r: any) => `${r.schema_name}.${r.name}`).join(', '));
  // Check if sp_GetAmortisationScheduleAll returns lifecycle_status
  const r2 = await pool.request().query(`
    SELECT name, schema_name(schema_id) as schema_name 
    FROM sys.objects 
    WHERE type = 'P' AND name LIKE '%Amort%'
  `);
  console.log('Amort SPs:', r2.recordset.map((r: any) => `${r.schema_name}.${r.name}`).join(', '));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
