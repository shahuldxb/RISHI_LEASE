/**
 * Migration: Update sp_GetLeaseRegister to include lessee_name and lessee_type
 * from lease.lease_lessee_details joined by contract_id
 */
import { getPool } from '../db-sqlserver';

async function run() {
  const pool = await getPool();

  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_GetLeaseRegister', 'P') IS NOT NULL
      DROP PROCEDURE dbo.sp_GetLeaseRegister
  `);

  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_GetLeaseRegister
      @PageNumber    INT           = 1,
      @PageSize      INT           = 100,
      @StatusFilter  VARCHAR(30)   = NULL,
      @AssetType     VARCHAR(50)   = NULL,
      @SearchTerm    NVARCHAR(200) = NULL,
      @SortColumn    VARCHAR(50)   = 'created_at',
      @SortDirection VARCHAR(4)    = 'DESC'
    AS
    BEGIN
      SET NOCOUNT ON;

      DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;

      SELECT
        c.contract_id,
        c.contract_ref,
        c.status,
        c.asset_type,
        c.asset_description,
        c.asset_tag,
        -- Lessor info from lease.lessors
        ISNULL(ll.legal_name, '') AS lessor_name,
        ISNULL(ll.country, '')    AS lessor_country,
        -- Lessee info from lease.lease_lessee_details
        ISNULL(ld.lessee_name, '')  AS lessee_name,
        ISNULL(ld.lessee_type, '')  AS lessee_type,
        ISNULL(ld.staff_number, '') AS lessee_staff_number,
        ISNULL(ld.position, '')     AS lessee_position,
        ISNULL(ld.department, '')   AS lessee_department,
        -- Dates
        c.commencement_date,
        c.expiry_date,
        c.term_months,
        c.monthly_payment,
        c.currency,
        c.rou_asset_value,
        c.lease_liability_commence,
        c.ifrs16_classification,
        c.is_lto,
        c.maintenance_responsibility,
        -- Maker/checker
        ISNULL(mu.username, '') AS maker_name,
        ISNULL(cu.username, '') AS checker_name,
        c.approved_at,
        c.created_at,
        -- Total count for pagination
        COUNT(*) OVER() AS total_count
      FROM lease.contracts c
      LEFT JOIN lease.lessors ll ON ll.lessor_id = c.lessor_id
      LEFT JOIN lease.lease_lessee_details ld ON ld.contract_id = c.contract_id
      LEFT JOIN security.users mu ON mu.user_id = c.maker_id
      LEFT JOIN security.users cu ON cu.user_id = c.checker_id
      WHERE
        (@StatusFilter IS NULL OR c.status = @StatusFilter)
        AND (@AssetType IS NULL OR c.asset_type = @AssetType)
        AND (
          @SearchTerm IS NULL
          OR c.contract_ref LIKE '%' + @SearchTerm + '%'
          OR c.asset_description LIKE '%' + @SearchTerm + '%'
          OR ll.legal_name LIKE '%' + @SearchTerm + '%'
          OR ld.lessee_name LIKE '%' + @SearchTerm + '%'
        )
      ORDER BY
        CASE WHEN @SortColumn = 'contract_ref'   AND @SortDirection = 'ASC'  THEN c.contract_ref   END ASC,
        CASE WHEN @SortColumn = 'contract_ref'   AND @SortDirection = 'DESC' THEN c.contract_ref   END DESC,
        CASE WHEN @SortColumn = 'status'         AND @SortDirection = 'ASC'  THEN c.status         END ASC,
        CASE WHEN @SortColumn = 'status'         AND @SortDirection = 'DESC' THEN c.status         END DESC,
        CASE WHEN @SortColumn = 'asset_type'     AND @SortDirection = 'ASC'  THEN c.asset_type     END ASC,
        CASE WHEN @SortColumn = 'asset_type'     AND @SortDirection = 'DESC' THEN c.asset_type     END DESC,
        CASE WHEN @SortColumn = 'commencement_date' AND @SortDirection = 'ASC'  THEN c.commencement_date END ASC,
        CASE WHEN @SortColumn = 'commencement_date' AND @SortDirection = 'DESC' THEN c.commencement_date END DESC,
        CASE WHEN @SortColumn = 'expiry_date'    AND @SortDirection = 'ASC'  THEN c.expiry_date    END ASC,
        CASE WHEN @SortColumn = 'expiry_date'    AND @SortDirection = 'DESC' THEN c.expiry_date    END DESC,
        CASE WHEN @SortColumn = 'monthly_payment' AND @SortDirection = 'ASC' THEN c.monthly_payment END ASC,
        CASE WHEN @SortColumn = 'monthly_payment' AND @SortDirection = 'DESC' THEN c.monthly_payment END DESC,
        CASE WHEN @SortDirection = 'ASC'  THEN c.created_at END ASC,
        c.created_at DESC
      OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
    END
  `);

  console.log('✅ sp_GetLeaseRegister updated with lessee_name, lessee_type, lessee_staff_number, lessee_position, lessee_department, commencement_date, expiry_date');
  await pool.close();
}

run().catch(e => { console.error('❌ Migration failed:', e.message); process.exit(1); });
