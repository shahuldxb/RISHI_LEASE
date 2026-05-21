/**
 * Migration: Add soft-delete support
 * 1. Create sp_SoftDeleteContract (sets status='Deleted')
 * 2. Update sp_GetLeaseRegister to exclude status='Deleted'
 * 3. Update sp_GetAmortisationScheduleAll to exclude status='Deleted'
 * 4. Update sp_GetConsolidatedGLEntries to exclude status='Deleted'
 */
import { getPool } from '../db-sqlserver';

async function run() {
  const pool = await getPool();

  // 1. Create sp_SoftDeleteContract
  await pool.request().query(`
    CREATE OR ALTER PROCEDURE dbo.sp_SoftDeleteContract
      @ContractId INT,
      @MakerId    INT = NULL,
      @ScreenId   VARCHAR(50) = 'VFLSLSREG0001P001'
    AS
    BEGIN
      SET NOCOUNT ON;
      UPDATE lease.contracts
      SET    status     = 'Deleted',
             updated_at = GETUTCDATE()
      WHERE  contract_id = @ContractId
        AND  status <> 'Deleted';

      -- Audit log
      IF @@ROWCOUNT > 0
      BEGIN
        INSERT INTO security.audit_log (table_name, record_id, action, changed_by, screen_id, changed_at)
        VALUES ('lease.contracts', @ContractId, 'SOFT_DELETE', @MakerId, @ScreenId, GETUTCDATE());
      END
    END
  `);
  console.log('✅ sp_SoftDeleteContract created');

  // 2. Update sp_GetLeaseRegister — add AND c.status <> 'Deleted' to WHERE clause
  // Re-create the full SP with the exclusion (we already have the latest version from update_lease_register_sp.ts)
  await pool.request().query(`
    CREATE OR ALTER PROCEDURE dbo.sp_GetLeaseRegister
      @PageNumber    INT = 1,
      @PageSize      INT = 20,
      @SearchTerm    NVARCHAR(200) = NULL,
      @StatusFilter  NVARCHAR(50)  = NULL,
      @AssetType     NVARCHAR(50)  = NULL,
      @SortColumn    NVARCHAR(50)  = 'created_at',
      @SortDirection NVARCHAR(4)   = 'DESC'
    AS
    BEGIN
      SET NOCOUNT ON;

      DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;

      SELECT
        c.contract_id,
        c.contract_ref,
        c.ifrs16_classification,
        c.commencement_date,
        c.expiry_date,
        c.currency,
        c.monthly_payment,
        c.status,
        c.created_at,
        c.updated_at,
        -- Lessor info
        l.legal_name      AS lessor_name,
        l.lessor_ref,
        -- Asset info
        c.asset_description AS asset_name,
        c.asset_type,
        -- Lessee info from lease_lessee_details
        ld.lessee_name,
        ld.lessee_type,
        ld.staff_number   AS lessee_staff_number,
        ld.position       AS lessee_position,
        ld.department     AS lessee_department,
        -- Maker/checker
        mu.username       AS maker_name,
        cu.username       AS checker_name,
        -- Total count for pagination
        COUNT(*) OVER()   AS total_count
      FROM   lease.contracts c
      LEFT JOIN lease.lessors     l  ON l.lessor_id   = c.lessor_id
      LEFT JOIN lease.lease_lessee_details ld ON ld.contract_id = c.contract_id
      LEFT JOIN security.users    mu ON mu.user_id    = c.maker_id
      LEFT JOIN security.users    cu ON cu.user_id    = c.checker_id
      WHERE  c.status <> 'Deleted'
        AND  (
               @StatusFilter IS NULL
            OR c.status = @StatusFilter
             )
        AND  (
               @AssetType IS NULL
            OR c.asset_type = @AssetType
             )
        AND  (
               @SearchTerm IS NULL
            OR c.contract_ref        LIKE '%' + @SearchTerm + '%'
            OR c.asset_description   LIKE '%' + @SearchTerm + '%'
            OR l.legal_name          LIKE '%' + @SearchTerm + '%'
            OR ld.lessee_name        LIKE '%' + @SearchTerm + '%'
             )
      ORDER BY
        CASE WHEN @SortColumn = 'contract_ref'   AND @SortDirection = 'ASC'  THEN c.contract_ref   END ASC,
        CASE WHEN @SortColumn = 'contract_ref'   AND @SortDirection = 'DESC' THEN c.contract_ref   END DESC,
        CASE WHEN @SortColumn = 'lessor_name'    AND @SortDirection = 'ASC'  THEN l.legal_name     END ASC,
        CASE WHEN @SortColumn = 'lessor_name'    AND @SortDirection = 'DESC' THEN l.legal_name     END DESC,
        CASE WHEN @SortColumn = 'status'         AND @SortDirection = 'ASC'  THEN c.status         END ASC,
        CASE WHEN @SortColumn = 'status'         AND @SortDirection = 'DESC' THEN c.status         END DESC,
        CASE WHEN @SortColumn = 'expiry_date'    AND @SortDirection = 'ASC'  THEN c.expiry_date    END ASC,
        CASE WHEN @SortColumn = 'expiry_date'    AND @SortDirection = 'DESC' THEN c.expiry_date    END DESC,
        CASE WHEN @SortColumn = 'monthly_payment' AND @SortDirection = 'ASC' THEN c.monthly_payment END ASC,
        CASE WHEN @SortColumn = 'monthly_payment' AND @SortDirection = 'DESC' THEN c.monthly_payment END DESC,
        CASE WHEN @SortDirection = 'ASC'  THEN c.created_at END ASC,
        c.created_at DESC
      OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
    END
  `);
  console.log('✅ sp_GetLeaseRegister updated (excludes Deleted)');

  // 3. Update sp_GetAmortisationScheduleAll — add AND c.status <> 'Deleted'
  await pool.request().query(`
    CREATE OR ALTER PROCEDURE dbo.sp_GetAmortisationScheduleAll
      @Year     INT = 0,
      @ViewMode NVARCHAR(10) = 'monthly'
    AS
    BEGIN
      SET NOCOUNT ON;

      SELECT
        c.contract_id,
        c.contract_ref,
        c.asset_description,
        c.ifrs16_classification,
        c.commencement_date,
        c.expiry_date,
        c.monthly_payment,
        l.legal_name AS lessor_name,
        s.period_date,
        YEAR(s.period_date)  AS period_year,
        MONTH(s.period_date) AS period_month,
        s.opening_liability,
        s.interest_expense,
        s.payment,
        s.principal,
        s.closing_liability,
        s.rou_nbv,
        s.depreciation,
        s.cumulative_depr
      FROM lease.amortisation_schedule s
      JOIN lease.contracts c ON c.contract_id = s.contract_id
      LEFT JOIN lease.lessors l ON l.lessor_id = c.lessor_id
      WHERE c.status <> 'Deleted'
        AND (@Year = 0 OR YEAR(s.period_date) = @Year)
      ORDER BY c.contract_ref, s.period_date;
    END
  `);
  console.log('✅ sp_GetAmortisationScheduleAll updated (excludes Deleted)');

  // 4. Update sp_GetConsolidatedGLEntries — add AND c.status <> 'Deleted'
  await pool.request().query(`
    CREATE OR ALTER PROCEDURE dbo.sp_GetConsolidatedGLEntries
      @Year     INT = 0,
      @ViewMode NVARCHAR(10) = 'monthly'
    AS
    BEGIN
      SET NOCOUNT ON;

      WITH AmortData AS (
        SELECT
          s.contract_id,
          s.period_date,
          YEAR(s.period_date)  AS period_year,
          MONTH(s.period_date) AS period_month,
          s.interest_expense,
          s.principal,
          s.payment,
          s.depreciation,
          s.closing_liability,
          s.rou_nbv
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE c.status <> 'Deleted'
          AND (@Year = 0 OR YEAR(s.period_date) = @Year)
      ),
      Grouped AS (
        SELECT
          period_year,
          period_month,
          period_date,
          COUNT(DISTINCT contract_id) AS lease_count,
          SUM(payment)          AS total_payment,
          SUM(interest_expense) AS total_interest,
          SUM(principal)        AS total_principal,
          SUM(depreciation)     AS total_depreciation,
          SUM(closing_liability) AS total_closing_liability,
          SUM(rou_nbv)          AS total_rou_nbv
        FROM AmortData
        GROUP BY period_year, period_month, period_date
      )
      SELECT
        period_year,
        period_month,
        period_date,
        lease_count,
        -- JE1: Lease Liability Payment
        'JE-1' AS je_ref,
        '21001' AS debit_account_code,
        'Lease Liability (Current)' AS debit_account_name,
        total_principal AS debit_amount,
        '52001' AS credit_account_code_1,
        'Finance Cost — Interest' AS credit_account_name_1,
        total_interest AS credit_amount_1,
        '11001' AS credit_account_code_2,
        'Cash / Bank' AS credit_account_name_2,
        total_payment AS credit_amount_2,
        -- JE2: ROU Depreciation
        'JE-2' AS je_ref_2,
        '63001' AS debit_account_code_2,
        'Depreciation — ROU Asset' AS debit_account_name_2,
        total_depreciation AS debit_amount_2,
        '12002' AS credit_account_code_3,
        'Accumulated Depreciation — ROU' AS credit_account_name_3,
        total_depreciation AS credit_amount_3
      FROM Grouped
      ORDER BY period_year, period_month;
    END
  `);
  console.log('✅ sp_GetConsolidatedGLEntries updated (excludes Deleted)');

  await pool.close();
  console.log('✅ All soft-delete migrations complete');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
