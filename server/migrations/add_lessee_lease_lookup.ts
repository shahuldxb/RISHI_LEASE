/**
 * Migration: add_lessee_lease_lookup
 * Creates:
 *   dbo.sp_GetLesseeList       — returns all lessees from lessor.lessors
 *   dbo.sp_GetLeaseByLessee    — given a lessor_id, returns their active lease contract
 */
import { getPool } from "../db-sqlserver";

async function run() {
  const pool = await getPool();

  // ── 1. Drop & recreate sp_GetLesseeList ──────────────────────────────────────
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_GetLesseeList', 'P') IS NOT NULL
      DROP PROCEDURE dbo.sp_GetLesseeList;
  `);
  console.log("Dropped sp_GetLesseeList");

  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_GetLesseeList
    AS
    BEGIN
      SET NOCOUNT ON;
      SELECT
        l.lessor_id          AS lessor_id,
        l.lessee_name        AS lessee_name,
        l.lessee_type        AS lessee_type,
        l.staff_number       AS staff_number,
        l.employee_id        AS employee_id,
        l.grade              AS grade,
        l.position           AS position,
        l.department         AS department,
        l.place_of_work      AS place_of_work,
        l.lessee_contact_email AS contact_email,
        l.lessee_contact_phone AS contact_phone,
        l.lessor_name        AS lessor_name,
        l.lessor_code        AS lessor_code
      FROM lessor.lessors l
      WHERE l.lessee_name IS NOT NULL
        AND LTRIM(RTRIM(l.lessee_name)) <> ''
      ORDER BY l.lessee_name;
    END;
  `);
  console.log("Created sp_GetLesseeList");

  // ── 2. Drop & recreate sp_GetLeaseByLessee ───────────────────────────────────
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_GetLeaseByLessee', 'P') IS NOT NULL
      DROP PROCEDURE dbo.sp_GetLeaseByLessee;
  `);
  console.log("Dropped sp_GetLeaseByLessee");

  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_GetLeaseByLessee
      @LessorId INT
    AS
    BEGIN
      SET NOCOUNT ON;
      -- Find the most recent active (or latest) lease contract linked to this lessor_id
      -- lease.contracts links to lease.lessors via lessor_id
      -- We join lease.lessors (which has lessor_ref matching lessor.lessors.lessor_code)
      -- to find the contract
      SELECT TOP 1
        c.contract_id        AS contract_id,
        c.contract_ref       AS lease_ref,
        c.asset_description  AS asset_name,
        c.asset_type         AS asset_type,
        c.status             AS status,
        c.commencement_date  AS commencement_date,
        c.expiry_date        AS expiry_date,
        c.currency           AS currency,
        c.monthly_payment    AS monthly_payment,
        ll.legal_name        AS lessor_name,
        lr.lessor_name       AS lessee_lessor_name,
        lr.lessee_name       AS lessee_name,
        lr.lessee_type       AS lessee_type,
        lr.staff_number      AS staff_number,
        lr.position          AS position,
        lr.department        AS department
      FROM lease.contracts c
      INNER JOIN lease.lessors ll
        ON ll.lessor_id = c.lessor_id
      INNER JOIN lessor.lessors lr
        ON lr.lessor_id = @LessorId
        AND (
          ll.lessor_ref = lr.lessor_code
          OR ll.legal_name = lr.lessor_name
        )
      ORDER BY
        CASE c.status WHEN 'Active' THEN 0 WHEN 'Draft' THEN 1 ELSE 2 END,
        c.commencement_date DESC;
    END;
  `);
  console.log("Created sp_GetLeaseByLessee");

  console.log("Migration add_lessee_lease_lookup complete.");
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
