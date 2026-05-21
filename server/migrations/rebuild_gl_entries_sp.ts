/**
 * Migration: Rebuild sp_GetConsolidatedGLEntries
 * Returns normalised rows: one row per journal line (Dr or Cr)
 * Columns: period_year, period_month, period_date, month_name, je_ref, je_label,
 *          ledger_no, ledger_name, dr_cr ('Dr'|'Cr'), amount, lease_count, sort_order
 *
 * 4 journal entries per period (first period has all 4; subsequent periods have JE-2, JE-3, JE-4):
 *   JE-1  Day 1 Commencement : ROU Asset Dr / Lease Liability Cr
 *   JE-2  Interest Accrual   : Interest Expense Dr / Lease Liability Cr
 *   JE-3  Rent Payment       : Lease Liability Dr / Bank/Cash Cr
 *   JE-4  ROU Depreciation   : Depreciation Expense Dr / Accumulated Depreciation Cr
 */
import { getPool } from '../db-sqlserver';

async function run() {
  const pool = await getPool();

  await pool.request().query(`
    CREATE OR ALTER PROCEDURE lease.sp_GetConsolidatedGLEntries
      @Year     INT          = 0,
      @ViewMode NVARCHAR(10) = 'monthly'
    AS
    BEGIN
      SET NOCOUNT ON;

      -- ── Aggregate amortisation data by period ────────────────────────────
      WITH AmortData AS (
        SELECT
          s.contract_id,
          s.period_date,
          YEAR(s.period_date)   AS period_year,
          MONTH(s.period_date)  AS period_month,
          s.interest_expense,
          s.principal,
          s.payment,
          s.depreciation,
          s.opening_liability,
          s.rou_nbv
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE c.status NOT IN ('Deleted','Terminated')
          AND (@Year = 0 OR YEAR(s.period_date) = @Year)
      ),
      Grouped AS (
        SELECT
          period_year,
          period_month,
          MIN(period_date)          AS period_date,
          FORMAT(MIN(period_date),'MMM yyyy') AS month_name,
          COUNT(DISTINCT contract_id) AS lease_count,
          SUM(payment)              AS total_payment,
          SUM(interest_expense)     AS total_interest,
          SUM(principal)            AS total_principal,
          SUM(depreciation)         AS total_depreciation,
          SUM(opening_liability)    AS total_opening_liability
        FROM AmortData
        GROUP BY period_year, period_month
      ),
      -- ── Normalised journal lines ─────────────────────────────────────────
      JournalLines AS (
        -- JE-1a  ROU Asset Dr  (first period only — commencement)
        SELECT period_year, period_month, period_date, month_name, lease_count,
               'JE-1' AS je_ref,
               'Lease Commencement — Day 1' AS je_label,
               '14001' AS ledger_no,
               'Right-of-Use Asset' AS ledger_name,
               'Dr' AS dr_cr,
               total_opening_liability AS amount,
               1 AS sort_order
        FROM Grouped
        WHERE period_month = (SELECT MIN(period_month) FROM Grouped WHERE period_year = Grouped.period_year)
          AND period_year  = (SELECT MIN(period_year)  FROM Grouped)

        UNION ALL
        -- JE-1b  Lease Liability Cr  (first period only)
        SELECT period_year, period_month, period_date, month_name, lease_count,
               'JE-1', 'Lease Commencement — Day 1',
               '21001', 'Lease Liability',
               'Cr', total_opening_liability, 2
        FROM Grouped
        WHERE period_month = (SELECT MIN(period_month) FROM Grouped WHERE period_year = Grouped.period_year)
          AND period_year  = (SELECT MIN(period_year)  FROM Grouped)

        UNION ALL
        -- JE-2a  Interest Expense Dr
        SELECT period_year, period_month, period_date, month_name, lease_count,
               'JE-2', 'Finance Cost — Interest Accrual',
               '52001', 'Interest Expense — Lease',
               'Dr', total_interest, 3
        FROM Grouped

        UNION ALL
        -- JE-2b  Lease Liability Cr  (interest increases liability)
        SELECT period_year, period_month, period_date, month_name, lease_count,
               'JE-2', 'Finance Cost — Interest Accrual',
               '21001', 'Lease Liability',
               'Cr', total_interest, 4
        FROM Grouped

        UNION ALL
        -- JE-3a  Lease Liability Dr  (payment reduces liability)
        SELECT period_year, period_month, period_date, month_name, lease_count,
               'JE-3', 'Rent Payment — Cash Settlement',
               '21001', 'Lease Liability',
               'Dr', total_payment, 5
        FROM Grouped

        UNION ALL
        -- JE-3b  Bank / Cash Cr
        SELECT period_year, period_month, period_date, month_name, lease_count,
               'JE-3', 'Rent Payment — Cash Settlement',
               '11001', 'Bank / Cash',
               'Cr', total_payment, 6
        FROM Grouped

        UNION ALL
        -- JE-4a  Depreciation Expense Dr
        SELECT period_year, period_month, period_date, month_name, lease_count,
               'JE-4', 'ROU Asset Depreciation',
               '63001', 'Depreciation Expense — ROU Asset',
               'Dr', total_depreciation, 7
        FROM Grouped

        UNION ALL
        -- JE-4b  Accumulated Depreciation Cr
        SELECT period_year, period_month, period_date, month_name, lease_count,
               'JE-4', 'ROU Asset Depreciation',
               '12002', 'Accumulated Depreciation — ROU',
               'Cr', total_depreciation, 8
        FROM Grouped
      )
      SELECT
        period_year,
        period_month,
        period_date,
        month_name,
        je_ref,
        je_label,
        ledger_no,
        ledger_name,
        dr_cr,
        CAST(amount AS DECIMAL(18,2)) AS amount,
        lease_count,
        sort_order
      FROM JournalLines
      ORDER BY period_year, period_month, sort_order;
    END
  `);

  console.log('✅ sp_GetConsolidatedGLEntries rebuilt — normalised Dr/Cr rows');
  await pool.close();
}

run().catch(e => { console.error(e); process.exit(1); });
