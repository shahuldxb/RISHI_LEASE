import { getPool, sql } from './server/db-sqlserver';
async function main() {
  const pool = await getPool();
  const result = await pool.request()
    .input('Year', sql.Int, 2026)
    .input('ViewMode', sql.NVarChar(10), 'monthly')
    .execute('sp_GetAmortisationScheduleAll');
  const cols = Object.keys(result.recordset[0] || {});
  console.log('sp_GetAmortisationScheduleAll columns:', cols.join(', '));
  const r2 = await pool.request().query(`SELECT TOP 3 contract_id, contract_ref, lifecycle_status FROM lease.contracts ORDER BY contract_id`);
  console.log('Sample lifecycle_status:', r2.recordset.map((r: any) => `${r.contract_ref}=${r.lifecycle_status}`).join(', '));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
