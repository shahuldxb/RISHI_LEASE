/**
 * Migration: Update sp_GetLeaseListForSubAsset to return lessee_name
 * from lessor.lessors joined via lease.contracts → lessor.lessors
 */
import { getPool } from "../db-sqlserver";

async function main() {
  const pool = await getPool();

  console.log("Updating sp_GetLeaseListForSubAsset to include lessee_name...");
  await pool.request().query(`
    IF OBJECT_ID('asset.sp_GetLeaseListForSubAsset', 'P') IS NOT NULL
      DROP PROCEDURE asset.sp_GetLeaseListForSubAsset;
  `);
  await pool.request().query(`
    CREATE PROCEDURE asset.sp_GetLeaseListForSubAsset
    AS
    BEGIN
      SET NOCOUNT ON;
      SELECT
        c.contract_id                           AS lease_id,
        c.contract_ref                          AS lease_ref,
        COALESCE(c.asset_description, c.contract_ref) AS asset_name,
        COALESCE(ll.lessor_name, lh.legal_name, 'Unknown') AS lessor_name,
        COALESCE(ll.lessee_name, '')            AS lessee_name,
        c.status
      FROM lease.contracts c
      LEFT JOIN lessor.lessors ll ON ll.lessor_id = c.lessor_id
      LEFT JOIN lease.lessors  lh ON lh.lessor_id = c.lessor_id
      WHERE c.status NOT IN ('Terminated', 'Cancelled')
      ORDER BY c.contract_id DESC;
    END
  `);
  console.log("Done: sp_GetLeaseListForSubAsset updated with lessee_name.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
