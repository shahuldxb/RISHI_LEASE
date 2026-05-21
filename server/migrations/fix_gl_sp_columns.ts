import { getPool } from "../db-sqlserver";

async function main() {
  const pool = await getPool();

  // Drop and recreate sp_GetConsolidatedGLEntries with correct normalised columns
  await pool.request().query(`
IF OBJECT_ID('sp_GetConsolidatedGLEntries', 'P') IS NOT NULL
  DROP PROCEDURE sp_GetConsolidatedGLEntries;
`);

  await pool.request().query(`
CREATE PROCEDURE sp_GetConsolidatedGLEntries
  @Year    INT,
  @ViewMode NVARCHAR(10) = 'monthly'   -- 'monthly' | 'yearly'
AS
BEGIN
  SET NOCOUNT ON;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Returns one row per journal line (Dr or Cr) per period.
  -- Columns: period_year, period_month, period_date, month_name,
  --          je_ref, je_label, ledger_no, ledger_name, dr_cr, amount,
  --          lease_count, sort_order
  -- ─────────────────────────────────────────────────────────────────────────

  -- Aggregate amortisation schedule by period
  ;WITH ScheduleAgg AS (
    SELECT
      YEAR(period_date)  AS period_year,
      MONTH(period_date) AS period_month,
      MIN(period_date)   AS period_date,
      SUM(interest_expense)   AS total_interest,
      SUM(payment)            AS total_payment,
      SUM(principal)          AS total_principal,
      SUM(depreciation)       AS total_depreciation,
      SUM(opening_liability)  AS total_opening_liability,
      COUNT(DISTINCT a.contract_id) AS lease_count
    FROM lease.amortisation_schedule a
    INNER JOIN lease.contracts c ON a.contract_id = c.contract_id
    WHERE c.status NOT IN ('Deleted','Terminated')
      AND (@ViewMode = 'yearly' OR YEAR(a.period_date) = @Year)
      AND (@ViewMode = 'monthly' OR 1=1)
    GROUP BY YEAR(a.period_date), MONTH(a.period_date)
  ),
  -- Day-1 commencement: only for the first period of each contract
  -- Identify first period per contract using MIN(period_date)
  FirstPeriods AS (
    SELECT contract_id, MIN(period_date) AS first_date
    FROM lease.amortisation_schedule
    GROUP BY contract_id
  ),
  CommenceAgg AS (
    SELECT
      YEAR(a.period_date)  AS period_year,
      MONTH(a.period_date) AS period_month,
      SUM(a.opening_liability)  AS total_rou,
      COUNT(DISTINCT a.contract_id) AS lease_count
    FROM lease.amortisation_schedule a
    INNER JOIN lease.contracts c ON a.contract_id = c.contract_id
    INNER JOIN FirstPeriods fp ON fp.contract_id = a.contract_id AND fp.first_date = a.period_date
    WHERE c.status NOT IN ('Deleted','Terminated')
      AND (@ViewMode = 'yearly' OR YEAR(a.period_date) = @Year)
    GROUP BY YEAR(a.period_date), MONTH(a.period_date)
  )

  -- ── JE-1: Lease Commencement (Day 1 — first period only) ──────────────
  SELECT
    s.period_year,
    s.period_month,
    s.period_date,
    DATENAME(MONTH, s.period_date) AS month_name,
    'JE-1' AS je_ref,
    'Lease Commencement — Day 1 Recognition' AS je_label,
    '1400-001' AS ledger_no,
    'Right-of-Use Asset' AS ledger_name,
    'Dr' AS dr_cr,
    ca.total_rou AS amount,
    ca.lease_count,
    1 AS sort_order
  FROM ScheduleAgg s
  INNER JOIN CommenceAgg ca ON ca.period_year = s.period_year AND ca.period_month = s.period_month

  UNION ALL

  SELECT
    s.period_year, s.period_month, s.period_date,
    DATENAME(MONTH, s.period_date),
    'JE-1',
    'Lease Commencement — Day 1 Recognition',
    '2200-001',
    'Lease Liability — IFRS 16',
    'Cr',
    ca.total_rou,
    ca.lease_count,
    2
  FROM ScheduleAgg s
  INNER JOIN CommenceAgg ca ON ca.period_year = s.period_year AND ca.period_month = s.period_month

  -- ── JE-2: Monthly Interest Accrual ────────────────────────────────────
  UNION ALL
  SELECT
    s.period_year, s.period_month, s.period_date,
    DATENAME(MONTH, s.period_date),
    'JE-2',
    'Finance Cost — Interest Accrual',
    '6100-001',
    'Interest Expense — IFRS 16',
    'Dr',
    s.total_interest,
    s.lease_count,
    3
  FROM ScheduleAgg s

  UNION ALL
  SELECT
    s.period_year, s.period_month, s.period_date,
    DATENAME(MONTH, s.period_date),
    'JE-2',
    'Finance Cost — Interest Accrual',
    '2200-001',
    'Lease Liability — IFRS 16',
    'Cr',
    s.total_interest,
    s.lease_count,
    4
  FROM ScheduleAgg s

  -- ── JE-3: Monthly Rent Payment ────────────────────────────────────────
  UNION ALL
  SELECT
    s.period_year, s.period_month, s.period_date,
    DATENAME(MONTH, s.period_date),
    'JE-3',
    'Lease Payment — Cash Settlement',
    '2200-001',
    'Lease Liability — IFRS 16',
    'Dr',
    s.total_payment,
    s.lease_count,
    5
  FROM ScheduleAgg s

  UNION ALL
  SELECT
    s.period_year, s.period_month, s.period_date,
    DATENAME(MONTH, s.period_date),
    'JE-3',
    'Lease Payment — Cash Settlement',
    '1010-001',
    'Bank / Cash Account',
    'Cr',
    s.total_payment,
    s.lease_count,
    6
  FROM ScheduleAgg s

  -- ── JE-4: Monthly ROU Asset Depreciation ──────────────────────────────
  UNION ALL
  SELECT
    s.period_year, s.period_month, s.period_date,
    DATENAME(MONTH, s.period_date),
    'JE-4',
    'ROU Asset Depreciation',
    '7100-001',
    'Depreciation Expense — ROU Asset',
    'Dr',
    s.total_depreciation,
    s.lease_count,
    7
  FROM ScheduleAgg s

  UNION ALL
  SELECT
    s.period_year, s.period_month, s.period_date,
    DATENAME(MONTH, s.period_date),
    'JE-4',
    'ROU Asset Depreciation',
    '1600-002',
    'Accumulated Depreciation — ROU Asset',
    'Cr',
    s.total_depreciation,
    s.lease_count,
    8
  FROM ScheduleAgg s

  ORDER BY period_year, period_month, sort_order;
END;
`);

  console.log("✅ sp_GetConsolidatedGLEntries rebuilt with normalised columns");
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
