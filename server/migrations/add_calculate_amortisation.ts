/**
 * Migration: sp_CalculateAmortisationAll
 * Generates IFRS 16 amortisation schedule rows for ALL active leases
 * using the effective interest method (reducing balance).
 *
 * IFRS 16 logic per period:
 *   interest_expense   = opening_liability × (IBR / 12)
 *   principal          = payment - interest_expense
 *   closing_liability  = opening_liability - principal
 *   depreciation       = rou_asset_value / term_months
 *   rou_nbv            = previous_rou_nbv - depreciation
 */
import { getPool } from '../db-sqlserver';

async function run() {
  const pool = await getPool();

  await pool.request().query(`
    CREATE OR ALTER PROCEDURE dbo.sp_CalculateAmortisationAll
      @MakerId  INT = NULL,
      @ScreenId VARCHAR(50) = 'VFLAMORT0001P001'
    AS
    BEGIN
      SET NOCOUNT ON;

      DECLARE @ContractId        INT;
      DECLARE @CommencementDate  DATE;
      DECLARE @TermMonths        INT;
      DECLARE @MonthlyPayment    DECIMAL(18,4);
      DECLARE @IBR               DECIMAL(10,8);
      DECLARE @RouAssetValue     DECIMAL(18,4);
      DECLARE @LeaseLiability    DECIMAL(18,4);

      DECLARE @Period            INT;
      DECLARE @PeriodDate        DATE;
      DECLARE @OpeningLiability  DECIMAL(18,4);
      DECLARE @InterestExpense   DECIMAL(18,4);
      DECLARE @Principal         DECIMAL(18,4);
      DECLARE @ClosingLiability  DECIMAL(18,4);
      DECLARE @Depreciation      DECIMAL(18,4);
      DECLARE @RouNBV            DECIMAL(18,4);
      DECLARE @CumulativeDepr    DECIMAL(18,4);
      DECLARE @MonthlyIBR        DECIMAL(10,8);
      DECLARE @RowsInserted      INT = 0;
      DECLARE @ContractsProcessed INT = 0;

      -- Cursor over all active leases
      DECLARE contract_cur CURSOR FOR
        SELECT
          contract_id,
          commencement_date,
          term_months,
          monthly_payment,
          ibr,
          ISNULL(rou_asset_value,     monthly_payment * term_months),
          ISNULL(lease_liability_commence, monthly_payment * term_months)
        FROM lease.contracts
        WHERE status NOT IN ('Deleted', 'Terminated')
          AND term_months > 0
          AND monthly_payment > 0;

      OPEN contract_cur;
      FETCH NEXT FROM contract_cur INTO
        @ContractId, @CommencementDate, @TermMonths,
        @MonthlyPayment, @IBR, @RouAssetValue, @LeaseLiability;

      WHILE @@FETCH_STATUS = 0
      BEGIN
        -- Delete existing schedule for this contract (full recalculation)
        DELETE FROM lease.amortisation_schedule WHERE contract_id = @ContractId;

        SET @MonthlyIBR       = @IBR / 12.0;
        SET @OpeningLiability = @LeaseLiability;
        SET @RouNBV           = @RouAssetValue;
        SET @CumulativeDepr   = 0;
        SET @Depreciation     = @RouAssetValue / @TermMonths;
        SET @Period           = 1;

        WHILE @Period <= @TermMonths
        BEGIN
          SET @PeriodDate = DATEADD(MONTH, @Period - 1, @CommencementDate);

          -- Effective interest method
          SET @InterestExpense  = ROUND(@OpeningLiability * @MonthlyIBR, 2);
          SET @Principal        = ROUND(@MonthlyPayment - @InterestExpense, 2);

          -- Prevent closing liability going below zero on final period
          IF @Period = @TermMonths
            SET @ClosingLiability = 0
          ELSE
            SET @ClosingLiability = @OpeningLiability - @Principal;

          -- ROU asset straight-line depreciation
          SET @CumulativeDepr = ROUND(@CumulativeDepr + @Depreciation, 2);
          SET @RouNBV         = ROUND(@RouAssetValue - @CumulativeDepr, 2);
          IF @RouNBV < 0 SET @RouNBV = 0;

          INSERT INTO lease.amortisation_schedule (
            contract_id, period_date,
            opening_liability, interest_expense, payment, principal,
            closing_liability, rou_nbv, depreciation, cumulative_depr
          ) VALUES (
            @ContractId, @PeriodDate,
            ROUND(@OpeningLiability, 2), @InterestExpense,
            ROUND(@MonthlyPayment, 2),   @Principal,
            @ClosingLiability,           @RouNBV,
            ROUND(@Depreciation, 2),     @CumulativeDepr
          );

          SET @RowsInserted      = @RowsInserted + 1;
          SET @OpeningLiability  = @ClosingLiability;
          SET @Period            = @Period + 1;
        END

        SET @ContractsProcessed = @ContractsProcessed + 1;

        FETCH NEXT FROM contract_cur INTO
          @ContractId, @CommencementDate, @TermMonths,
          @MonthlyPayment, @IBR, @RouAssetValue, @LeaseLiability;
      END

      CLOSE contract_cur;
      DEALLOCATE contract_cur;

      SELECT @ContractsProcessed AS contracts_processed, @RowsInserted AS rows_inserted;
    END
  `);
  console.log('✅ sp_CalculateAmortisationAll created');

  // Also fix sp_GetAmortisationScheduleAll to use lessor.lessors (not lease.lessors)
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
        l.lessor_name,
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
      LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
      WHERE c.status <> 'Deleted'
        AND (@Year = 0 OR YEAR(s.period_date) = @Year)
      ORDER BY c.contract_ref, s.period_date;
    END
  `);
  console.log('✅ sp_GetAmortisationScheduleAll updated (lessor.lessors fix)');

  // Also fix sp_GetConsolidatedGLEntries to use lessor.lessors
  await pool.request().query(`
    CREATE OR ALTER PROCEDURE dbo.sp_GetConsolidatedGLEntries
      @Year     INT = 0,
      @ViewMode NVARCHAR(10) = 'monthly'
    AS
    BEGIN
      SET NOCOUNT ON;

      -- Interest expense entries (debit Interest Expense / credit Lease Liability)
      SELECT
        YEAR(s.period_date)  AS period_year,
        MONTH(s.period_date) AS period_month,
        s.period_date,
        '6100-001' AS gl_account_code,
        'Interest Expense — IFRS 16' AS gl_account_name,
        'Debit'    AS entry_type,
        SUM(s.interest_expense) AS amount,
        COUNT(DISTINCT s.contract_id) AS lease_count
      FROM lease.amortisation_schedule s
      JOIN lease.contracts c ON c.contract_id = s.contract_id
      WHERE c.status <> 'Deleted'
        AND (@Year = 0 OR YEAR(s.period_date) = @Year)
      GROUP BY YEAR(s.period_date), MONTH(s.period_date), s.period_date

      UNION ALL

      SELECT
        YEAR(s.period_date), MONTH(s.period_date), s.period_date,
        '2200-001', 'Lease Liability — IFRS 16', 'Credit',
        SUM(s.principal), COUNT(DISTINCT s.contract_id)
      FROM lease.amortisation_schedule s
      JOIN lease.contracts c ON c.contract_id = s.contract_id
      WHERE c.status <> 'Deleted'
        AND (@Year = 0 OR YEAR(s.period_date) = @Year)
      GROUP BY YEAR(s.period_date), MONTH(s.period_date), s.period_date

      UNION ALL

      SELECT
        YEAR(s.period_date), MONTH(s.period_date), s.period_date,
        '7100-001', 'Depreciation — ROU Asset', 'Debit',
        SUM(s.depreciation), COUNT(DISTINCT s.contract_id)
      FROM lease.amortisation_schedule s
      JOIN lease.contracts c ON c.contract_id = s.contract_id
      WHERE c.status <> 'Deleted'
        AND (@Year = 0 OR YEAR(s.period_date) = @Year)
      GROUP BY YEAR(s.period_date), MONTH(s.period_date), s.period_date

      UNION ALL

      SELECT
        YEAR(s.period_date), MONTH(s.period_date), s.period_date,
        '1600-002', 'Accumulated Depreciation — ROU Asset', 'Credit',
        SUM(s.depreciation), COUNT(DISTINCT s.contract_id)
      FROM lease.amortisation_schedule s
      JOIN lease.contracts c ON c.contract_id = s.contract_id
      WHERE c.status <> 'Deleted'
        AND (@Year = 0 OR YEAR(s.period_date) = @Year)
      GROUP BY YEAR(s.period_date), MONTH(s.period_date), s.period_date

      ORDER BY period_date, gl_account_code;
    END
  `);
  console.log('✅ sp_GetConsolidatedGLEntries updated');

  console.log('✅ All amortisation migrations complete');
  process.exit(0);
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
