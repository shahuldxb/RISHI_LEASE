import { getPool } from './server/db-sqlserver';
async function main() {
  const pool = await getPool();
  const r1 = await pool.request().query(`
    SELECT name, schema_name(schema_id) as schema_name 
    FROM sys.objects 
    WHERE type = 'P' AND (
      name LIKE 'sp_Originate%' OR name LIKE 'sp_Post%' OR name LIKE 'sp_Modify%' 
      OR name LIKE 'sp_Close%' OR name LIKE 'sp_GetLease%' OR name LIKE 'sp_GetGL%'
    )
    ORDER BY schema_name, name
  `);
  console.log('All lifecycle SPs:');
  r1.recordset.forEach((r: any) => console.log(`  ${r.schema_name}.${r.name}`));
  // Test sp_GetLeaseLifecycle with schema prefix
  const r2 = await pool.request().query(`
    EXEC lease.sp_GetLeaseLifecycle @ContractId = 1, @Year = 2026
  `);
  const cols = Object.keys(r2.recordset[0] || {});
  console.log('\nsp_GetLeaseLifecycle columns:', cols.join(', '));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
