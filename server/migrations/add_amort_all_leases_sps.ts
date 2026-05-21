/**
 * Migration: Create sp_GetAmortisationScheduleAll and sp_GetConsolidatedGLEntries
 * - sp_GetAmortisationScheduleAll: returns amortisation rows for ALL contracts
 *   joined with contract header, filtered by @Year (0 = all years)
 *   and @ViewMode ('monthly' | 'yearly')
 * - sp_GetConsolidatedGLEntries: aggregates all leases into consolidated
 *   debit/credit lines per GL account per period
 */
import { getPool } from '../db-sqlserver';

async function run() {
  const pool = await getPool();

  // ── 1. sp_GetAmortisationScheduleAll ──────────────────────────────────────
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_GetAmortisationScheduleAll', 'P') IS NOT NULL
      DROP PROCEDURE dbo.sp_GetAmortisationScheduleAll
  `);

  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_GetAmortisationScheduleAll
      @Year      INT = 0,
      @ViewMode  NVARCHAR(10) = 'monthly'   -- 'monthly' | 'yearly'
    AS
    BEGIN
      SET NOCOUNT ON;

      -- Base CTE: join amortisation_schedule with contract header
      WITH base AS (
        SELECT
          s.schedule_id,
          s.contract_id,
          c.contract_ref,
          c.asset_description,
          c.currency,
          c.monthly_payment,
          c.ibr,
          c.term_months,
          c.commencement_date,
          c.expiry_date,
          c.ifrs16_classification,
          c.status        AS contract_status,
          -- lessor name from lease.lessors
          ISNULL(ll.legal_name, '') AS lessor_name,
          s.period_date,
          YEAR(s.period_date)  AS period_year,
          MONTH(s.period_date) AS period_month,
          DATENAME(MONTH, s.period_date) AS month_name,
          s.opening_liability,
          s.interest_expense,
          s.payment,
          s.principal,
          s.closing_liability,
          s.rou_nbv,
          s.depreciation,
          s.cumulative_depr,
          -- GL account codes (standard IFRS 16 COA)
          '21100' AS gl_lease_liability,
          '17100' AS gl_rou_asset,
          '17900' AS gl_accum_depreciation,
          '67100' AS gl_interest_expense,
          '67200' AS gl_depreciation_expense,
          '10100' AS gl_cash_bank
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        LEFT JOIN lease.lessors ll ON ll.lessor_id = c.lessor_id
        WHERE (@Year = 0 OR YEAR(s.period_date) = @Year)
      )
      SELECT
        schedule_id,
        contract_id,
        contract_ref,
        asset_description,
        currency,
        monthly_payment,
        ibr,
        term_months,
        commencement_date,
        expiry_date,
        ifrs16_classification,
        contract_status,
        lessor_name,
        period_date,
        period_year,
        period_month,
        month_name,
        opening_liability,
        interest_expense,
        payment,
        principal,
        closing_liability,
        rou_nbv,
        depreciation,
        cumulative_depr,
        gl_lease_liability,
        gl_rou_asset,
        gl_accum_depreciation,
        gl_interest_expense,
        gl_depreciation_expense,
        gl_cash_bank
      FROM base
      ORDER BY contract_ref, period_date;
    END
  `);
  console.log('✅ sp_GetAmortisationScheduleAll created');

  // ── 2. sp_GetConsolidatedGLEntries ────────────────────────────────────────
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_GetConsolidatedGLEntries', 'P') IS NOT NULL
      DROP PROCEDURE dbo.sp_GetConsolidatedGLEntries
  `);

  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_GetConsolidatedGLEntries
      @Year      INT = 0,
      @ViewMode  NVARCHAR(10) = 'monthly'   -- 'monthly' | 'yearly'
    AS
    BEGIN
      SET NOCOUNT ON;

      -- Flatten each amortisation row into individual GL lines
      -- then group/consolidate by period + account
      WITH flat AS (
        -- JE-1a: DR Lease Liability (principal)
        SELECT
          s.contract_id,
          s.period_date,
          YEAR(s.period_date)  AS period_year,
          MONTH(s.period_date) AS period_month,
          DATENAME(MONTH, s.period_date) AS month_name,
          'JE-1' AS je_ref,
          'Lease payment — principal reduction' AS description,
          '21100' AS account_code,
          'Lease Liability' AS account_name,
          s.principal AS debit_amount,
          0.00        AS credit_amount
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE (@Year = 0 OR YEAR(s.period_date) = @Year)

        UNION ALL
        -- JE-1b: DR Interest Expense
        SELECT s.contract_id, s.period_date, YEAR(s.period_date), MONTH(s.period_date),
          DATENAME(MONTH, s.period_date),
          'JE-1', 'Lease payment — interest charge',
          '67100', 'Interest Expense',
          s.interest_expense, 0.00
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE (@Year = 0 OR YEAR(s.period_date) = @Year)

        UNION ALL
        -- JE-1c: CR Cash / Bank (total payment)
        SELECT s.contract_id, s.period_date, YEAR(s.period_date), MONTH(s.period_date),
          DATENAME(MONTH, s.period_date),
          'JE-1', 'Lease payment — cash disbursement',
          '10100', 'Cash / Bank',
          0.00, s.payment
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE (@Year = 0 OR YEAR(s.period_date) = @Year)

        UNION ALL
        -- JE-2a: DR Depreciation Expense
        SELECT s.contract_id, s.period_date, YEAR(s.period_date), MONTH(s.period_date),
          DATENAME(MONTH, s.period_date),
          'JE-2', 'ROU asset depreciation charge',
          '67200', 'Depreciation Expense',
          s.depreciation, 0.00
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE (@Year = 0 OR YEAR(s.period_date) = @Year)

        UNION ALL
        -- JE-2b: CR Accumulated Depreciation
        SELECT s.contract_id, s.period_date, YEAR(s.period_date), MONTH(s.period_date),
          DATENAME(MONTH, s.period_date),
          'JE-2', 'ROU asset accumulated depreciation',
          '17900', 'Accumulated Depreciation',
          0.00, s.depreciation
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE (@Year = 0 OR YEAR(s.period_date) = @Year)
      )
      -- Consolidate: group by period + account
      SELECT
        period_year,
        period_month,
        month_name,
        je_ref,
        description,
        account_code,
        account_name,
        CAST(SUM(debit_amount)  AS DECIMAL(18,2)) AS total_debit,
        CAST(SUM(credit_amount) AS DECIMAL(18,2)) AS total_credit,
        COUNT(DISTINCT contract_id) AS lease_count
      FROM flat
      GROUP BY period_year, period_month, month_name, je_ref, description, account_code, account_name
      ORDER BY period_year, period_month, je_ref, account_code;
    END
  `);
  console.log('✅ sp_GetConsolidatedGLEntries created');

  console.log('Migration complete.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
