import { getPool } from "../db-sqlserver";

async function main() {
  const pool = await getPool();

  // Drop and recreate sp_GetAmortisationSchedule
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_GetAmortisationSchedule', 'P') IS NOT NULL
      DROP PROCEDURE dbo.sp_GetAmortisationSchedule;
  `);

  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_GetAmortisationSchedule
      @ContractId INT
    AS
    BEGIN
      SET NOCOUNT ON;

      -- ── 1. Contract header ──────────────────────────────────────────────────
      SELECT
        c.contract_id,
        c.contract_ref,
        c.asset_description,
        c.asset_type,
        c.commencement_date,
        c.expiry_date,
        c.term_months,
        c.monthly_payment,
        c.currency,
        c.ibr,
        c.escalation_rate,
        c.deposit_amount,
        c.initial_direct_costs,
        c.lease_incentives,
        c.rou_asset_value,
        c.lease_liability_commence,
        c.ifrs16_classification,
        c.status,
        l.lessor_name
      FROM lease.contracts c
      LEFT JOIN lessor.lessors l ON c.lessor_id = l.lessor_id
      WHERE c.contract_id = @ContractId;

      -- ── 2. Amortisation schedule rows ───────────────────────────────────────
      -- If rows exist in the table, return them; otherwise compute on-the-fly
      IF EXISTS (SELECT 1 FROM lease.amortisation_schedule WHERE contract_id = @ContractId)
      BEGIN
        SELECT
          s.schedule_id,
          s.contract_id,
          ROW_NUMBER() OVER (ORDER BY s.period_date) AS period_no,
          s.period_date,
          YEAR(s.period_date)                        AS period_year,
          MONTH(s.period_date)                       AS period_month,
          DATENAME(MONTH, s.period_date)             AS month_name,
          s.opening_liability,
          s.interest_expense,
          s.payment,
          s.principal,
          s.closing_liability,
          s.rou_nbv,
          s.depreciation,
          s.cumulative_depr,
          -- GL account codes for accounting entries
          '21100' AS gl_lease_liability,
          '17100' AS gl_rou_asset,
          '17900' AS gl_accum_depreciation,
          '67100' AS gl_interest_expense,
          '67200' AS gl_depreciation_expense,
          '10100' AS gl_cash_bank
        FROM lease.amortisation_schedule s
        WHERE s.contract_id = @ContractId
        ORDER BY s.period_date;
      END
      ELSE
      BEGIN
        -- Compute schedule on-the-fly using effective interest method
        DECLARE @MonthlyPayment   DECIMAL(18,4);
        DECLARE @IBR              DECIMAL(10,6);
        DECLARE @TermMonths       INT;
        DECLARE @CommenceDate     DATE;
        DECLARE @InitialLiability DECIMAL(18,4);
        DECLARE @RouAsset         DECIMAL(18,4);
        DECLARE @MonthlyIBR       DECIMAL(18,10);

        SELECT
          @MonthlyPayment   = c.monthly_payment,
          @IBR              = c.ibr,
          @TermMonths       = c.term_months,
          @CommenceDate     = c.commencement_date,
          @InitialLiability = COALESCE(c.lease_liability_commence,
                                -- PV of annuity: P * (1-(1+r)^-n) / r
                                CASE WHEN c.ibr > 0
                                  THEN c.monthly_payment * (1 - POWER(1 + c.ibr/12.0, -c.term_months)) / (c.ibr/12.0)
                                  ELSE c.monthly_payment * c.term_months
                                END),
          @RouAsset         = COALESCE(c.rou_asset_value,
                                CASE WHEN c.ibr > 0
                                  THEN c.monthly_payment * (1 - POWER(1 + c.ibr/12.0, -c.term_months)) / (c.ibr/12.0)
                                  ELSE c.monthly_payment * c.term_months
                                END)
        FROM lease.contracts c
        WHERE c.contract_id = @ContractId;

        SET @MonthlyIBR = @IBR / 12.0;

        -- Generate schedule using a recursive CTE
        WITH Schedule AS (
          -- Period 0 (seed)
          SELECT
            1                                                AS period_no,
            DATEADD(MONTH, 1, @CommenceDate)                AS period_date,
            @InitialLiability                               AS opening_liability,
          CAST(ROUND(@InitialLiability * @MonthlyIBR, 2) AS DECIMAL(18,4))       AS interest_expense,
          CAST(@MonthlyPayment AS DECIMAL(18,4))                                 AS payment,
          CAST(ROUND(@MonthlyPayment - @InitialLiability * @MonthlyIBR, 2) AS DECIMAL(18,4)) AS principal,
          CAST(ROUND(@InitialLiability - (@MonthlyPayment - @InitialLiability * @MonthlyIBR), 2) AS DECIMAL(18,4)) AS closing_liability,
          CAST(@RouAsset AS DECIMAL(18,4))                                       AS rou_asset_open,
          CAST(ROUND(@RouAsset / @TermMonths, 2) AS DECIMAL(18,4))               AS depreciation,
          CAST(ROUND(@RouAsset - @RouAsset / @TermMonths, 2) AS DECIMAL(18,4))   AS rou_nbv,
            CAST(ROUND(@RouAsset / @TermMonths, 2) AS DECIMAL(18,4)) AS cumulative_depr
          UNION ALL
          SELECT
            s.period_no + 1,
            DATEADD(MONTH, 1, s.period_date),
            s.closing_liability,
            CAST(ROUND(s.closing_liability * @MonthlyIBR, 2) AS DECIMAL(18,4)),
            @MonthlyPayment,
            CAST(ROUND(@MonthlyPayment - s.closing_liability * @MonthlyIBR, 2) AS DECIMAL(18,4)),
            CAST(ROUND(s.closing_liability - (@MonthlyPayment - s.closing_liability * @MonthlyIBR), 2) AS DECIMAL(18,4)),
            s.rou_nbv,
            CAST(ROUND(@RouAsset / @TermMonths, 2) AS DECIMAL(18,4)),
            CAST(ROUND(s.rou_nbv - @RouAsset / @TermMonths, 2) AS DECIMAL(18,4)),
            CAST(ROUND(s.cumulative_depr + @RouAsset / @TermMonths, 2) AS DECIMAL(18,4))
          FROM Schedule s
          WHERE s.period_no < @TermMonths
        )
        SELECT
          NULL                                              AS schedule_id,
          @ContractId                                       AS contract_id,
          s.period_no,
          s.period_date,
          YEAR(s.period_date)                               AS period_year,
          MONTH(s.period_date)                              AS period_month,
          DATENAME(MONTH, s.period_date)                    AS month_name,
          s.opening_liability,
          s.interest_expense,
          s.payment,
          s.principal,
          CASE WHEN s.closing_liability < 0 THEN 0 ELSE s.closing_liability END AS closing_liability,
          s.rou_nbv,
          s.depreciation,
          s.cumulative_depr,
          '21100' AS gl_lease_liability,
          '17100' AS gl_rou_asset,
          '17900' AS gl_accum_depreciation,
          '67100' AS gl_interest_expense,
          '67200' AS gl_depreciation_expense,
          '10100' AS gl_cash_bank
        FROM Schedule s
        ORDER BY s.period_no
        OPTION (MAXRECURSION 600);
      END
    END
  `);

  console.log("✅ sp_GetAmortisationSchedule recreated successfully");

  // Also create sp_GetLeaseListForAmortisation for the lease selector
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_GetLeaseListForAmortisation', 'P') IS NOT NULL
      DROP PROCEDURE dbo.sp_GetLeaseListForAmortisation;
  `);

  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_GetLeaseListForAmortisation
    AS
    BEGIN
      SET NOCOUNT ON;
      SELECT
        c.contract_id,
        c.contract_ref,
        c.asset_description,
        c.asset_type,
        c.commencement_date,
        c.expiry_date,
        c.term_months,
        c.monthly_payment,
        c.currency,
        c.ibr,
        c.ifrs16_classification,
        c.status,
        l.lessor_name
      FROM lease.contracts c
      LEFT JOIN lessor.lessors l ON c.lessor_id = l.lessor_id
      ORDER BY c.contract_ref;
    END
  `);

  console.log("✅ sp_GetLeaseListForAmortisation created successfully");
}

main().catch(console.error).finally(() => process.exit(0));
