import { getPool, sql } from './server/db-sqlserver';
async function main() {
  const pool = await getPool();
  // Test schema-prefixed SP call
  try {
    const r1 = await pool.request()
      .input('ContractId', sql.Int, 1)
      .input('Year', sql.Int, 2026)
      .execute('lease.sp_GetLeaseLifecycle');
    console.log('✅ lease.sp_GetLeaseLifecycle works with schema prefix, rows:', r1.recordset.length);
  } catch(e: any) {
    console.log('❌ lease.sp_GetLeaseLifecycle failed:', e.message);
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
