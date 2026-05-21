/**
 * Migration: Features 12, 13, 14
 * - Feature 12: sp_GetDisclosurePack (IFRS 16 Disclosure Pack PDF)
 * - Feature 13: lease.budget_lines table + sp_GetBudgetVsActual + sp_UpsertBudgetLine + sp_GetBudgetSummary
 * - Feature 14: sp_GetMaturityLadder (IFRS 16 Para 58 undiscounted cash flow buckets)
 * Actual column names verified from DB:
 *   amortisation_schedule: schedule_id, contract_id, period_date, opening_liability, interest_expense,
 *                          payment, principal, closing_liability, rou_nbv, depreciation, cumulative_depr,
 *                          posting_status, posted_at, posted_by
 *   gl_postings: posting_id, contract_id, posting_date, period_date, je_ref, je_label,
 *                ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes
 *   lessors: lessor_id, lessor_ref, legal_name, ...
 */
import { getPool } from "../db-sqlserver";

async function main() {
  const pool = await getPool();
  const req = () => pool.request();

  console.log("=== Features 12, 13, 14 Migration ===");

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE 13: lease.budget_lines table
  // ─────────────────────────────────────────────────────────────────────────
  await req().query(`
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('lease.budget_lines'))
CREATE TABLE lease.budget_lines (
  budget_line_id        INT IDENTITY(1,1) PRIMARY KEY,
  contract_id           INT NOT NULL,
  period_year           INT NOT NULL,
  period_month          INT NOT NULL,
  budgeted_payment      DECIMAL(18,2) NOT NULL DEFAULT 0,
  budgeted_depreciation DECIMAL(18,2) NOT NULL DEFAULT 0,
  budgeted_interest     DECIMAL(18,2) NOT NULL DEFAULT 0,
  cost_centre           NVARCHAR(50) NULL,
  notes                 NVARCHAR(500) NULL,
  created_by            INT NULL,
  created_at            DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  updated_at            DATETIME2 NULL,
  CONSTRAINT uq_budget_lines UNIQUE (contract_id, period_year, period_month)
);
`);
  console.log("✅ lease.budget_lines table ready");

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE 13: sp_UpsertBudgetLine
  // ─────────────────────────────────────────────────────────────────────────
  await req().query(`IF OBJECT_ID('lease.sp_UpsertBudgetLine','P') IS NOT NULL DROP PROCEDURE lease.sp_UpsertBudgetLine;`);
  await req().query(`
CREATE PROCEDURE lease.sp_UpsertBudgetLine
  @ContractId           INT,
  @PeriodYear           INT,
  @PeriodMonth          INT,
  @BudgetedPayment      DECIMAL(18,2),
  @BudgetedDepreciation DECIMAL(18,2) = 0,
  @BudgetedInterest     DECIMAL(18,2) = 0,
  @CostCentre           NVARCHAR(50)  = NULL,
  @Notes                NVARCHAR(500) = NULL,
  @CreatedBy            INT           = NULL
AS
BEGIN
  SET NOCOUNT ON;
  MERGE lease.budget_lines AS t
  USING (SELECT @ContractId AS contract_id, @PeriodYear AS period_year, @PeriodMonth AS period_month) AS s
  ON t.contract_id=s.contract_id AND t.period_year=s.period_year AND t.period_month=s.period_month
  WHEN MATCHED THEN
    UPDATE SET budgeted_payment=@BudgetedPayment, budgeted_depreciation=@BudgetedDepreciation,
               budgeted_interest=@BudgetedInterest, cost_centre=@CostCentre, notes=@Notes, updated_at=GETUTCDATE()
  WHEN NOT MATCHED THEN
    INSERT (contract_id,period_year,period_month,budgeted_payment,budgeted_depreciation,budgeted_interest,cost_centre,notes,created_by)
    VALUES (@ContractId,@PeriodYear,@PeriodMonth,@BudgetedPayment,@BudgetedDepreciation,@BudgetedInterest,@CostCentre,@Notes,@CreatedBy);
  SELECT SCOPE_IDENTITY() AS budget_line_id;
END;
`);
  console.log("✅ sp_UpsertBudgetLine created");

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE 13: sp_GetBudgetVsActual
  // ─────────────────────────────────────────────────────────────────────────
  await req().query(`IF OBJECT_ID('lease.sp_GetBudgetVsActual','P') IS NOT NULL DROP PROCEDURE lease.sp_GetBudgetVsActual;`);
  await req().query(`
CREATE PROCEDURE lease.sp_GetBudgetVsActual
  @PeriodYear  INT,
  @PeriodMonth INT = NULL
AS
BEGIN
  SET NOCOUNT ON;

  -- RS 1: Per-lease per-period variance detail
  SELECT
    c.contract_id,
    c.contract_ref,
    c.asset_description,
    c.asset_type,
    ls.legal_name                                                         AS lessor_name,
    bl.period_year,
    bl.period_month,
    bl.cost_centre,
    ISNULL(bl.budgeted_payment, 0)                                        AS budgeted_payment,
    ISNULL(SUM(a.payment), 0)                                             AS actual_payment,
    ISNULL(SUM(a.payment), 0) - ISNULL(bl.budgeted_payment, 0)           AS payment_variance,
    CASE WHEN ISNULL(bl.budgeted_payment,0)=0 THEN NULL
         ELSE ((ISNULL(SUM(a.payment),0) - ISNULL(bl.budgeted_payment,0)) / bl.budgeted_payment) * 100
    END                                                                   AS payment_variance_pct,
    ISNULL(bl.budgeted_depreciation, 0)                                   AS budgeted_depreciation,
    ISNULL(SUM(a.depreciation), 0)                                        AS actual_depreciation,
    ISNULL(SUM(a.depreciation), 0) - ISNULL(bl.budgeted_depreciation, 0) AS depreciation_variance,
    ISNULL(bl.budgeted_interest, 0)                                       AS budgeted_interest,
    ISNULL(SUM(a.interest_expense), 0)                                    AS actual_interest,
    ISNULL(SUM(a.interest_expense), 0) - ISNULL(bl.budgeted_interest, 0) AS interest_variance,
    CASE
      WHEN ISNULL(bl.budgeted_payment,0)=0 THEN 'GREY'
      WHEN ABS((ISNULL(SUM(a.payment),0)-ISNULL(bl.budgeted_payment,0))/bl.budgeted_payment)*100 < 5  THEN 'GREEN'
      WHEN ABS((ISNULL(SUM(a.payment),0)-ISNULL(bl.budgeted_payment,0))/bl.budgeted_payment)*100 < 15 THEN 'AMBER'
      ELSE 'RED'
    END                                                                   AS rag_status
  FROM lease.budget_lines bl
  JOIN lease.contracts c ON c.contract_id=bl.contract_id
  LEFT JOIN lease.lessors ls ON ls.lessor_id=c.lessor_id
  LEFT JOIN lease.amortisation_schedule a
    ON a.contract_id=bl.contract_id
    AND YEAR(a.period_date)=bl.period_year
    AND MONTH(a.period_date)=bl.period_month
  WHERE bl.period_year=@PeriodYear
    AND (@PeriodMonth IS NULL OR bl.period_month=@PeriodMonth)
  GROUP BY
    c.contract_id,c.contract_ref,c.asset_description,c.asset_type,ls.legal_name,
    bl.period_year,bl.period_month,bl.cost_centre,
    bl.budgeted_payment,bl.budgeted_depreciation,bl.budgeted_interest
  ORDER BY ABS(ISNULL(SUM(a.payment),0)-ISNULL(bl.budgeted_payment,0)) DESC;

  -- RS 2: Summary totals
  SELECT
    SUM(ISNULL(bl.budgeted_payment,0))                                    AS total_budgeted_payment,
    SUM(ISNULL(a_agg.actual_payment,0))                                   AS total_actual_payment,
    SUM(ISNULL(a_agg.actual_payment,0))-SUM(ISNULL(bl.budgeted_payment,0)) AS total_payment_variance,
    CASE WHEN SUM(ISNULL(bl.budgeted_payment,0))=0 THEN NULL
         ELSE ((SUM(ISNULL(a_agg.actual_payment,0))-SUM(ISNULL(bl.budgeted_payment,0)))/SUM(bl.budgeted_payment))*100
    END                                                                   AS total_variance_pct,
    SUM(ISNULL(bl.budgeted_depreciation,0))                               AS total_budgeted_depreciation,
    SUM(ISNULL(a_agg.actual_depreciation,0))                              AS total_actual_depreciation,
    SUM(ISNULL(bl.budgeted_interest,0))                                   AS total_budgeted_interest,
    SUM(ISNULL(a_agg.actual_interest,0))                                  AS total_actual_interest,
    COUNT(DISTINCT bl.contract_id)                                        AS lease_count,
    SUM(CASE WHEN ABS(ISNULL(a_agg.actual_payment,0)-ISNULL(bl.budgeted_payment,0))/NULLIF(bl.budgeted_payment,0)*100 >= 15 THEN 1 ELSE 0 END) AS red_count,
    SUM(CASE WHEN ABS(ISNULL(a_agg.actual_payment,0)-ISNULL(bl.budgeted_payment,0))/NULLIF(bl.budgeted_payment,0)*100 BETWEEN 5 AND 14.99 THEN 1 ELSE 0 END) AS amber_count,
    SUM(CASE WHEN ABS(ISNULL(a_agg.actual_payment,0)-ISNULL(bl.budgeted_payment,0))/NULLIF(bl.budgeted_payment,0)*100 < 5 THEN 1 ELSE 0 END) AS green_count
  FROM lease.budget_lines bl
  LEFT JOIN (
    SELECT contract_id, YEAR(period_date) AS yr, MONTH(period_date) AS mo,
           SUM(payment) AS actual_payment, SUM(depreciation) AS actual_depreciation, SUM(interest_expense) AS actual_interest
    FROM lease.amortisation_schedule
    GROUP BY contract_id, YEAR(period_date), MONTH(period_date)
  ) a_agg ON a_agg.contract_id=bl.contract_id AND a_agg.yr=bl.period_year AND a_agg.mo=bl.period_month
  WHERE bl.period_year=@PeriodYear
    AND (@PeriodMonth IS NULL OR bl.period_month=@PeriodMonth);
END;
`);
  console.log("✅ sp_GetBudgetVsActual created");

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE 13: sp_GetBudgetSummary
  // ─────────────────────────────────────────────────────────────────────────
  await req().query(`IF OBJECT_ID('lease.sp_GetBudgetSummary','P') IS NOT NULL DROP PROCEDURE lease.sp_GetBudgetSummary;`);
  await req().query(`
CREATE PROCEDURE lease.sp_GetBudgetSummary
  @PeriodYear INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    bl.period_month,
    SUM(ISNULL(bl.budgeted_payment,0))    AS total_budget,
    SUM(ISNULL(a_agg.actual_payment,0))   AS total_actual,
    SUM(ISNULL(a_agg.actual_payment,0))-SUM(ISNULL(bl.budgeted_payment,0)) AS variance,
    CASE WHEN SUM(ISNULL(bl.budgeted_payment,0))=0 THEN NULL
         ELSE ((SUM(ISNULL(a_agg.actual_payment,0))-SUM(ISNULL(bl.budgeted_payment,0)))/SUM(bl.budgeted_payment))*100
    END AS variance_pct
  FROM lease.budget_lines bl
  LEFT JOIN (
    SELECT contract_id, YEAR(period_date) AS yr, MONTH(period_date) AS mo, SUM(payment) AS actual_payment
    FROM lease.amortisation_schedule GROUP BY contract_id, YEAR(period_date), MONTH(period_date)
  ) a_agg ON a_agg.contract_id=bl.contract_id AND a_agg.yr=bl.period_year AND a_agg.mo=bl.period_month
  WHERE bl.period_year=@PeriodYear
  GROUP BY bl.period_month
  ORDER BY bl.period_month;
END;
`);
  console.log("✅ sp_GetBudgetSummary created");

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE 14: sp_GetMaturityLadder
  // ─────────────────────────────────────────────────────────────────────────
  await req().query(`IF OBJECT_ID('lease.sp_GetMaturityLadder','P') IS NOT NULL DROP PROCEDURE lease.sp_GetMaturityLadder;`);
  await req().query(`
CREATE PROCEDURE lease.sp_GetMaturityLadder
  @AsOfDate DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @AsOf DATE = ISNULL(@AsOfDate, CAST(GETDATE() AS DATE));

  -- RS 1: Per-lease breakdown by maturity bucket
  SELECT
    c.contract_id,
    c.contract_ref,
    c.asset_description,
    c.asset_type,
    ls.legal_name                                                                                AS lessor_name,
    c.currency,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > @AsOf AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,1,@AsOf) THEN a.principal ELSE 0 END)        AS bucket_lt1yr_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > @AsOf AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,1,@AsOf) THEN a.interest_expense ELSE 0 END)  AS bucket_lt1yr_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,1,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,2,@AsOf) THEN a.principal ELSE 0 END)        AS bucket_1_2yr_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,1,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,2,@AsOf) THEN a.interest_expense ELSE 0 END)  AS bucket_1_2yr_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,2,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,3,@AsOf) THEN a.principal ELSE 0 END)        AS bucket_2_3yr_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,2,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,3,@AsOf) THEN a.interest_expense ELSE 0 END)  AS bucket_2_3yr_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,3,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,4,@AsOf) THEN a.principal ELSE 0 END)        AS bucket_3_4yr_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,3,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,4,@AsOf) THEN a.interest_expense ELSE 0 END)  AS bucket_3_4yr_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,4,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,5,@AsOf) THEN a.principal ELSE 0 END)        AS bucket_4_5yr_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,4,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,5,@AsOf) THEN a.interest_expense ELSE 0 END)  AS bucket_4_5yr_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,5,@AsOf) THEN a.principal ELSE 0 END)                                                                  AS bucket_gt5yr_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,5,@AsOf) THEN a.interest_expense ELSE 0 END)                                                           AS bucket_gt5yr_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > @AsOf THEN a.principal ELSE 0 END)                                                                                  AS total_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > @AsOf THEN a.interest_expense ELSE 0 END)                                                                           AS total_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > @AsOf THEN a.principal + a.interest_expense ELSE 0 END)                                                             AS total_undiscounted
  FROM lease.contracts c
  JOIN lease.amortisation_schedule a ON a.contract_id=c.contract_id
  LEFT JOIN lease.lessors ls ON ls.lessor_id=c.lessor_id
  WHERE c.status='Active' AND CAST(a.period_date AS DATE) > @AsOf
  GROUP BY c.contract_id,c.contract_ref,c.asset_description,c.asset_type,ls.legal_name,c.currency
  ORDER BY total_undiscounted DESC;

  -- RS 2: Aggregate totals per bucket (for chart)
  SELECT
    SUM(CASE WHEN CAST(a.period_date AS DATE) > @AsOf AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,1,@AsOf) THEN a.principal ELSE 0 END)        AS lt1yr_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > @AsOf AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,1,@AsOf) THEN a.interest_expense ELSE 0 END)  AS lt1yr_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,1,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,2,@AsOf) THEN a.principal ELSE 0 END)        AS yr1_2_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,1,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,2,@AsOf) THEN a.interest_expense ELSE 0 END)  AS yr1_2_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,2,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,3,@AsOf) THEN a.principal ELSE 0 END)        AS yr2_3_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,2,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,3,@AsOf) THEN a.interest_expense ELSE 0 END)  AS yr2_3_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,3,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,4,@AsOf) THEN a.principal ELSE 0 END)        AS yr3_4_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,3,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,4,@AsOf) THEN a.interest_expense ELSE 0 END)  AS yr3_4_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,4,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,5,@AsOf) THEN a.principal ELSE 0 END)        AS yr4_5_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,4,@AsOf) AND CAST(a.period_date AS DATE) <= DATEADD(YEAR,5,@AsOf) THEN a.interest_expense ELSE 0 END)  AS yr4_5_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,5,@AsOf) THEN a.principal ELSE 0 END)                                                                  AS gt5yr_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > DATEADD(YEAR,5,@AsOf) THEN a.interest_expense ELSE 0 END)                                                           AS gt5yr_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > @AsOf THEN a.principal ELSE 0 END)                                                                                  AS grand_total_principal,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > @AsOf THEN a.interest_expense ELSE 0 END)                                                                           AS grand_total_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) > @AsOf THEN a.principal + a.interest_expense ELSE 0 END)                                                             AS grand_total_undiscounted
  FROM lease.contracts c
  JOIN lease.amortisation_schedule a ON a.contract_id=c.contract_id
  WHERE c.status='Active' AND CAST(a.period_date AS DATE) > @AsOf;
END;
`);
  console.log("✅ sp_GetMaturityLadder created");

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE 12: sp_GetDisclosurePack
  // ─────────────────────────────────────────────────────────────────────────
  await req().query(`IF OBJECT_ID('lease.sp_GetDisclosurePack','P') IS NOT NULL DROP PROCEDURE lease.sp_GetDisclosurePack;`);
  await req().query(`
CREATE PROCEDURE lease.sp_GetDisclosurePack
  @PeriodEnd   DATE,
  @PeriodStart DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Start DATE = ISNULL(@PeriodStart, DATEADD(YEAR,-1,@PeriodEnd));
  DECLARE @AsOf  DATE = @PeriodEnd;

  -- RS 0: Portfolio summary (cover page)
  SELECT
    COUNT(*)                AS total_leases,
    SUM(rou_asset_value)    AS total_rou_asset,
    SUM(lease_liability_commence) AS total_lease_liability,
    SUM(monthly_payment*12) AS annual_lease_expense,
    MIN(commencement_date)  AS earliest_lease,
    MAX(expiry_date)        AS latest_expiry,
    GETUTCDATE()            AS generated_at
  FROM lease.contracts WHERE status='Active';

  -- RS 1: Balance sheet lines from lease.gl_postings
  SELECT
    CASE WHEN gl.ledger_name LIKE '%Asset%' OR gl.ledger_name LIKE '%ROU%' THEN 'Asset' ELSE 'Liability' END AS section,
    gl.ledger_name AS account_name,
    SUM(CASE WHEN gl.dr_cr='DR' THEN gl.amount ELSE -gl.amount END) AS balance
  FROM lease.gl_postings gl
  WHERE CAST(gl.posting_date AS DATE) <= @PeriodEnd
    AND (gl.ledger_name LIKE '%Asset%' OR gl.ledger_name LIKE '%ROU%' OR gl.ledger_name LIKE '%Liability%' OR gl.ledger_name LIKE '%Lease%')
  GROUP BY gl.ledger_name
  ORDER BY gl.ledger_name;

  -- RS 2: Income statement lines from lease.gl_postings
  SELECT
    gl.ledger_name AS account_name,
    SUM(CASE WHEN gl.dr_cr='DR' THEN gl.amount ELSE -gl.amount END) AS amount
  FROM lease.gl_postings gl
  WHERE CAST(gl.posting_date AS DATE) BETWEEN @Start AND @PeriodEnd
    AND (gl.ledger_name LIKE '%Depreciation%' OR gl.ledger_name LIKE '%Interest%' OR gl.ledger_name LIKE '%Expense%' OR gl.ledger_name LIKE '%Revenue%')
  GROUP BY gl.ledger_name
  ORDER BY gl.ledger_name;

  -- RS 3: ROU roll-forward movements
  SELECT
    c.contract_ref,
    c.asset_description,
    c.asset_type,
    SUM(CASE WHEN CAST(a.period_date AS DATE) < @Start THEN a.depreciation ELSE 0 END) AS opening_accumulated_dep,
    SUM(CASE WHEN CAST(a.period_date AS DATE) BETWEEN @Start AND @PeriodEnd THEN a.depreciation ELSE 0 END) AS period_depreciation,
    c.rou_asset_value AS gross_rou_asset
  FROM lease.contracts c
  JOIN lease.amortisation_schedule a ON a.contract_id=c.contract_id
  WHERE c.status='Active'
  GROUP BY c.contract_ref,c.asset_description,c.asset_type,c.rou_asset_value
  ORDER BY c.contract_ref;

  -- RS 4: Lease liability roll-forward
  SELECT
    c.contract_ref,
    c.asset_description,
    SUM(CASE WHEN CAST(a.period_date AS DATE) < @Start THEN a.payment ELSE 0 END) AS cumulative_payments_to_open,
    SUM(CASE WHEN CAST(a.period_date AS DATE) BETWEEN @Start AND @PeriodEnd THEN a.interest_expense ELSE 0 END) AS period_interest,
    SUM(CASE WHEN CAST(a.period_date AS DATE) BETWEEN @Start AND @PeriodEnd THEN a.payment ELSE 0 END) AS period_payments,
    c.lease_liability_commence AS opening_liability
  FROM lease.contracts c
  JOIN lease.amortisation_schedule a ON a.contract_id=c.contract_id
  WHERE c.status='Active'
  GROUP BY c.contract_ref,c.asset_description,c.lease_liability_commence
  ORDER BY c.contract_ref;

  -- RS 5: Maturity analysis (undiscounted)
  SELECT
    CASE
      WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,1,@AsOf) THEN 'Less than 1 year'
      WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,2,@AsOf) THEN '1 to 2 years'
      WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,3,@AsOf) THEN '2 to 3 years'
      WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,4,@AsOf) THEN '3 to 4 years'
      WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,5,@AsOf) THEN '4 to 5 years'
      ELSE 'More than 5 years'
    END AS maturity_band,
    SUM(a.principal + a.interest_expense) AS undiscounted_cashflow,
    SUM(a.principal) AS principal,
    SUM(a.interest_expense) AS interest
  FROM lease.contracts c
  JOIN lease.amortisation_schedule a ON a.contract_id=c.contract_id
  WHERE c.status='Active' AND CAST(a.period_date AS DATE) > @AsOf
  GROUP BY
    CASE
      WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,1,@AsOf) THEN 'Less than 1 year'
      WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,2,@AsOf) THEN '1 to 2 years'
      WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,3,@AsOf) THEN '2 to 3 years'
      WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,4,@AsOf) THEN '3 to 4 years'
      WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,5,@AsOf) THEN '4 to 5 years'
      ELSE 'More than 5 years'
    END
  ORDER BY MIN(a.period_date);

  -- RS 6: Exemption register
  SELECT
    c.contract_ref,
    c.asset_description,
    ls.legal_name AS lessor_name,
    c.monthly_payment,
    c.commencement_date,
    c.expiry_date,
    ISNULL(c.exemption_type,'None') AS exemption_type,
    c.exemption_reason
  FROM lease.contracts c
  LEFT JOIN lease.lessors ls ON ls.lessor_id=c.lessor_id
  WHERE ISNULL(c.exemption_type,'None') <> 'None'
  ORDER BY c.exemption_type, c.contract_ref;
END;
`);
  console.log("✅ sp_GetDisclosurePack created");

  // ─────────────────────────────────────────────────────────────────────────
  // Register screen IDs
  // ─────────────────────────────────────────────────────────────────────────
  await req().query(`
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLDSCPK0001P001')
  INSERT INTO security.screen_registry (screen_id,screen_name,module,sub_module,screen_type,route,created_at)
  VALUES ('VFLDSCPK0001P001','Disclosure Pack','Accounting Engine','Financial Reporting','Report','/accounting/disclosure-pack',GETDATE());
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLBDGVAR0001P001')
  INSERT INTO security.screen_registry (screen_id,screen_name,module,sub_module,screen_type,route,created_at)
  VALUES ('VFLBDGVAR0001P001','Budget vs Actual','Accounting Engine','Planning','Report','/accounting/budget-variance',GETDATE());
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLMTYLDR0001P001')
  INSERT INTO security.screen_registry (screen_id,screen_name,module,sub_module,screen_type,route,created_at)
  VALUES ('VFLMTYLDR0001P001','Maturity Ladder','Accounting Engine','Financial Reporting','Report','/accounting/maturity-ladder',GETDATE());
`);
  console.log("✅ Screen IDs registered");

  console.log("=== Migration complete ===");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
