import { getPool, sql } from './server/db-sqlserver';
async function main() {
  const pool = await getPool();
  // Check sp_GetLeaseLifecycle columns
  const r1 = await pool.request()
    .input('ContractId', sql.Int, 1)
    .input('Year', sql.Int, 2026)
    .execute('sp_GetLeaseLifecycle');
  const cols1 = Object.keys(r1.recordset[0] || {});
  console.log('sp_GetLeaseLifecycle columns:', cols1.join(', '));
  console.log('Sample row:', JSON.stringify(r1.recordset[0]));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
