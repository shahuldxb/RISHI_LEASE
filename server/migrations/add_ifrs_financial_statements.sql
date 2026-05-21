-- ============================================================
-- Feature 8: Live Consolidated Financial Statements (IAS 1)
-- Feature 9: ROU Asset & Lease Liability Roll-Forward (IFRS 16 Para 53)
-- Feature 10: Trial Balance (IAS 1)
-- Feature 11: Short-term & Low-value Exemption Register (IFRS 16 Para 5)
-- ============================================================

-- ── FEATURE 11: Add exemption columns to lease.contracts ─────────────────────
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='contracts' AND COLUMN_NAME='exemption_type')
BEGIN
  ALTER TABLE lease.contracts ADD exemption_type VARCHAR(20) NULL DEFAULT 'None';
  ALTER TABLE lease.contracts ADD exemption_reason NVARCHAR(500) NULL;
END
GO

-- ── FEATURE 8: sp_GetBalanceSheet ────────────────────────────────────────────
-- Returns IFRS 16 balance sheet lines as at a given period-end date
-- Aggregates gl_postings by ledger_no and joins to coa.accounts for classification
GO
CREATE OR ALTER PROCEDURE dbo.sp_GetBalanceSheet
  @PeriodEnd DATE
AS
BEGIN
  SET NOCOUNT ON;

  -- Aggregate all GL postings up to period-end by ledger_no
  SELECT
    gp.ledger_no,
    gp.ledger_name,
    COALESCE(ca.class, 'Unknown')      AS account_class,
    COALESCE(ca.type, 'Unknown')       AS account_type,
    COALESCE(ca.sub_type, '')          AS account_sub_type,
    SUM(CASE WHEN gp.dr_cr = 'Dr' THEN gp.amount ELSE 0 END) AS total_dr,
    SUM(CASE WHEN gp.dr_cr = 'Cr' THEN gp.amount ELSE 0 END) AS total_cr,
    SUM(CASE WHEN gp.dr_cr = 'Dr' THEN gp.amount ELSE -gp.amount END) AS net_balance
  FROM lease.gl_postings gp
  LEFT JOIN coa.accounts ca ON ca.account_code = gp.ledger_no
  WHERE CAST(gp.posting_date AS DATE) <= @PeriodEnd
  GROUP BY gp.ledger_no, gp.ledger_name, ca.class, ca.type, ca.sub_type
  ORDER BY ca.class, ca.type, gp.ledger_no;

  -- Summary KPIs
  SELECT
    SUM(CASE WHEN gp.dr_cr = 'Dr' AND gp.ledger_no IN ('1101','1102','1103') THEN gp.amount
             WHEN gp.dr_cr = 'Cr' AND gp.ledger_no IN ('1101','1102','1103') THEN -gp.amount
             ELSE 0 END) AS rou_asset_gross,
    SUM(CASE WHEN gp.dr_cr = 'Cr' AND gp.ledger_no = '1104' THEN gp.amount
             WHEN gp.dr_cr = 'Dr' AND gp.ledger_no = '1104' THEN -gp.amount
             ELSE 0 END) AS accumulated_depreciation,
    SUM(CASE WHEN gp.dr_cr = 'Cr' AND gp.ledger_no = '2101' THEN gp.amount
             WHEN gp.dr_cr = 'Dr' AND gp.ledger_no = '2101' THEN -gp.amount
             ELSE 0 END) AS lease_liability_total,
    SUM(CASE WHEN gp.dr_cr = 'Cr' AND gp.ledger_no = '2102' THEN gp.amount
             WHEN gp.dr_cr = 'Dr' AND gp.ledger_no = '2102' THEN -gp.amount
             ELSE 0 END) AS current_lease_liability,
    SUM(CASE WHEN gp.dr_cr = 'Dr' AND gp.ledger_no IN ('5101','5102','5103','5104') THEN gp.amount
             WHEN gp.dr_cr = 'Cr' AND gp.ledger_no IN ('5101','5102','5103','5104') THEN -gp.amount
             ELSE 0 END) AS total_expense_ytd
  FROM lease.gl_postings gp
  WHERE CAST(gp.posting_date AS DATE) <= @PeriodEnd;
END
GO

-- ── FEATURE 8: sp_GetIncomeStatement ─────────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetIncomeStatement
  @PeriodStart DATE,
  @PeriodEnd   DATE
AS
BEGIN
  SET NOCOUNT ON;

  -- P&L lines from gl_postings in the period
  SELECT
    gp.ledger_no,
    gp.ledger_name,
    COALESCE(ca.class, 'Expense')      AS account_class,
    COALESCE(ca.type, 'Unknown')       AS account_type,
    COUNT(DISTINCT gp.contract_id)     AS lease_count,
    SUM(CASE WHEN gp.dr_cr = 'Dr' THEN gp.amount ELSE -gp.amount END) AS net_amount
  FROM lease.gl_postings gp
  LEFT JOIN coa.accounts ca ON ca.account_code = gp.ledger_no
  WHERE CAST(gp.posting_date AS DATE) BETWEEN @PeriodStart AND @PeriodEnd
    AND gp.ledger_no IN ('5101','5102','5103','5104','5105','5106','5107','5108','5109','5110',
                         '4101','4102','4103','4104','4105')
  GROUP BY gp.ledger_no, gp.ledger_name, ca.class, ca.type
  ORDER BY ca.class, gp.ledger_no;

  -- Summary totals
  SELECT
    SUM(CASE WHEN gp.ledger_no = '5101' AND gp.dr_cr = 'Dr' THEN gp.amount
             WHEN gp.ledger_no = '5101' AND gp.dr_cr = 'Cr' THEN -gp.amount ELSE 0 END) AS depreciation_expense,
    SUM(CASE WHEN gp.ledger_no = '5102' AND gp.dr_cr = 'Dr' THEN gp.amount
             WHEN gp.ledger_no = '5102' AND gp.dr_cr = 'Cr' THEN -gp.amount ELSE 0 END) AS interest_expense,
    SUM(CASE WHEN gp.ledger_no = '5103' AND gp.dr_cr = 'Dr' THEN gp.amount
             WHEN gp.ledger_no = '5103' AND gp.dr_cr = 'Cr' THEN -gp.amount ELSE 0 END) AS shortterm_lease_expense,
    SUM(CASE WHEN gp.ledger_no = '5104' AND gp.dr_cr = 'Dr' THEN gp.amount
             WHEN gp.ledger_no = '5104' AND gp.dr_cr = 'Cr' THEN -gp.amount ELSE 0 END) AS lowvalue_lease_expense,
    SUM(CASE WHEN gp.ledger_no IN ('4101','4102','4103') AND gp.dr_cr = 'Cr' THEN gp.amount
             WHEN gp.ledger_no IN ('4101','4102','4103') AND gp.dr_cr = 'Dr' THEN -gp.amount ELSE 0 END) AS fx_gain_loss,
    SUM(CASE WHEN gp.ledger_no IN ('5101','5102','5103','5104','5105') AND gp.dr_cr = 'Dr' THEN gp.amount
             WHEN gp.ledger_no IN ('5101','5102','5103','5104','5105') AND gp.dr_cr = 'Cr' THEN -gp.amount ELSE 0 END) AS total_ifrs16_expense
  FROM lease.gl_postings gp
  WHERE CAST(gp.posting_date AS DATE) BETWEEN @PeriodStart AND @PeriodEnd;
END
GO

-- ── FEATURE 8: sp_GetCashFlowStatement ───────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetCashFlowStatement
  @PeriodStart DATE,
  @PeriodEnd   DATE
AS
BEGIN
  SET NOCOUNT ON;

  -- Cash flow lines: principal repayments and interest = Financing; short-term/low-value = Operating
  SELECT
    CASE
      WHEN gp.je_ref IN ('JE-2','JE-3') THEN 'Financing'
      WHEN gp.je_ref IN ('JE-5') THEN 'Financing'
      ELSE 'Operating'
    END AS activity_type,
    gp.je_ref,
    gp.je_label,
    gp.ledger_no,
    gp.ledger_name,
    COUNT(*) AS posting_count,
    SUM(gp.amount) AS total_amount
  FROM lease.gl_postings gp
  WHERE CAST(gp.posting_date AS DATE) BETWEEN @PeriodStart AND @PeriodEnd
    AND gp.ledger_no IN ('1001','1002','2101','2102','5101','5102','5103','5104')
  GROUP BY
    CASE WHEN gp.je_ref IN ('JE-2','JE-3','JE-5') THEN 'Financing' ELSE 'Operating' END,
    gp.je_ref, gp.je_label, gp.ledger_no, gp.ledger_name
  ORDER BY activity_type, gp.je_ref, gp.ledger_no;

  -- Summary
  SELECT
    SUM(CASE WHEN gp.ledger_no = '2101' AND gp.dr_cr = 'Dr' THEN gp.amount ELSE 0 END) AS principal_repaid,
    SUM(CASE WHEN gp.ledger_no = '5102' AND gp.dr_cr = 'Dr' THEN gp.amount ELSE 0 END) AS interest_paid,
    SUM(CASE WHEN gp.ledger_no IN ('5103','5104') AND gp.dr_cr = 'Dr' THEN gp.amount ELSE 0 END) AS exempt_lease_payments,
    SUM(CASE WHEN gp.ledger_no IN ('2101','5102','5103','5104') AND gp.dr_cr = 'Dr' THEN gp.amount ELSE 0 END) AS total_lease_outflows
  FROM lease.gl_postings gp
  WHERE CAST(gp.posting_date AS DATE) BETWEEN @PeriodStart AND @PeriodEnd;
END
GO

-- ── FEATURE 9: sp_GetROURollForward ──────────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetROURollForward
  @PeriodStart DATE,
  @PeriodEnd   DATE
AS
BEGIN
  SET NOCOUNT ON;

  -- ROU Asset Roll-Forward: Opening → Additions → Depreciation → Modifications → Terminations → FX → Closing
  -- Uses amortisation_schedule for depreciation and gl_postings for other movements

  -- Opening balance (sum of all ROU-related Dr postings before period start)
  DECLARE @OpeningROU DECIMAL(18,2);
  SELECT @OpeningROU = ISNULL(SUM(
    CASE WHEN dr_cr = 'Dr' THEN amount ELSE -amount END
  ), 0)
  FROM lease.gl_postings
  WHERE ledger_no IN ('1101','1102','1103','1104')
    AND CAST(posting_date AS DATE) < @PeriodStart;

  -- Movements in period
  SELECT
    CASE
      WHEN gp.je_ref = 'JE-1' THEN 'Additions (New Leases)'
      WHEN gp.je_ref = 'JE-3' THEN 'Depreciation'
      WHEN gp.je_ref = 'JE-4' THEN 'Modifications (Remeasurement)'
      WHEN gp.je_ref = 'JE-5' THEN 'Terminations (Derecognition)'
      WHEN gp.je_ref = 'JE-7' THEN 'Renewals'
      WHEN gp.je_ref = 'JE-8' THEN 'FX Revaluation'
      ELSE 'Other'
    END AS movement_type,
    gp.je_ref,
    COUNT(DISTINCT gp.contract_id) AS lease_count,
    SUM(CASE WHEN gp.dr_cr = 'Dr' THEN gp.amount ELSE -gp.amount END) AS net_movement
  FROM lease.gl_postings gp
  WHERE gp.ledger_no IN ('1101','1102','1103','1104')
    AND CAST(gp.posting_date AS DATE) BETWEEN @PeriodStart AND @PeriodEnd
  GROUP BY
    CASE
      WHEN gp.je_ref = 'JE-1' THEN 'Additions (New Leases)'
      WHEN gp.je_ref = 'JE-3' THEN 'Depreciation'
      WHEN gp.je_ref = 'JE-4' THEN 'Modifications (Remeasurement)'
      WHEN gp.je_ref = 'JE-5' THEN 'Terminations (Derecognition)'
      WHEN gp.je_ref = 'JE-7' THEN 'Renewals'
      WHEN gp.je_ref = 'JE-8' THEN 'FX Revaluation'
      ELSE 'Other'
    END,
    gp.je_ref
  ORDER BY gp.je_ref;

  -- Opening and closing summary
  DECLARE @PeriodMovement DECIMAL(18,2);
  SELECT @PeriodMovement = ISNULL(SUM(
    CASE WHEN dr_cr = 'Dr' THEN amount ELSE -amount END
  ), 0)
  FROM lease.gl_postings
  WHERE ledger_no IN ('1101','1102','1103','1104')
    AND CAST(posting_date AS DATE) BETWEEN @PeriodStart AND @PeriodEnd;

  SELECT
    @OpeningROU AS opening_balance,
    @PeriodMovement AS period_movement,
    @OpeningROU + @PeriodMovement AS closing_balance;
END
GO

-- ── FEATURE 9: sp_GetLiabilityRollForward ────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetLiabilityRollForward
  @PeriodStart DATE,
  @PeriodEnd   DATE
AS
BEGIN
  SET NOCOUNT ON;

  -- Opening lease liability balance
  DECLARE @OpeningLiab DECIMAL(18,2);
  SELECT @OpeningLiab = ISNULL(SUM(
    CASE WHEN dr_cr = 'Cr' THEN amount ELSE -amount END
  ), 0)
  FROM lease.gl_postings
  WHERE ledger_no IN ('2101','2102')
    AND CAST(posting_date AS DATE) < @PeriodStart;

  -- Movements in period
  SELECT
    CASE
      WHEN gp.je_ref = 'JE-1' THEN 'Additions (New Leases)'
      WHEN gp.je_ref = 'JE-2' THEN 'Interest Accrued'
      WHEN gp.je_ref = 'JE-3' THEN 'Lease Payments Made'
      WHEN gp.je_ref = 'JE-4' THEN 'Modifications (Remeasurement)'
      WHEN gp.je_ref = 'JE-5' THEN 'Terminations (Derecognition)'
      WHEN gp.je_ref = 'JE-7' THEN 'Renewals'
      WHEN gp.je_ref = 'JE-8' THEN 'FX Revaluation'
      ELSE 'Other'
    END AS movement_type,
    gp.je_ref,
    COUNT(DISTINCT gp.contract_id) AS lease_count,
    SUM(CASE WHEN gp.dr_cr = 'Cr' THEN gp.amount ELSE -gp.amount END) AS net_movement
  FROM lease.gl_postings gp
  WHERE gp.ledger_no IN ('2101','2102')
    AND CAST(gp.posting_date AS DATE) BETWEEN @PeriodStart AND @PeriodEnd
  GROUP BY
    CASE
      WHEN gp.je_ref = 'JE-1' THEN 'Additions (New Leases)'
      WHEN gp.je_ref = 'JE-2' THEN 'Interest Accrued'
      WHEN gp.je_ref = 'JE-3' THEN 'Lease Payments Made'
      WHEN gp.je_ref = 'JE-4' THEN 'Modifications (Remeasurement)'
      WHEN gp.je_ref = 'JE-5' THEN 'Terminations (Derecognition)'
      WHEN gp.je_ref = 'JE-7' THEN 'Renewals'
      WHEN gp.je_ref = 'JE-8' THEN 'FX Revaluation'
      ELSE 'Other'
    END,
    gp.je_ref
  ORDER BY gp.je_ref;

  -- Opening and closing summary
  DECLARE @PeriodMovement DECIMAL(18,2);
  SELECT @PeriodMovement = ISNULL(SUM(
    CASE WHEN dr_cr = 'Cr' THEN amount ELSE -amount END
  ), 0)
  FROM lease.gl_postings
  WHERE ledger_no IN ('2101','2102')
    AND CAST(posting_date AS DATE) BETWEEN @PeriodStart AND @PeriodEnd;

  SELECT
    @OpeningLiab AS opening_balance,
    @PeriodMovement AS period_movement,
    @OpeningLiab + @PeriodMovement AS closing_balance;
END
GO

-- ── FEATURE 10: sp_GetTrialBalance ───────────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetTrialBalance
  @PeriodEnd DATE
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    gp.ledger_no                                    AS account_code,
    gp.ledger_name                                  AS account_name,
    COALESCE(ca.class, 'Unknown')                   AS account_class,
    COALESCE(ca.type, 'Unknown')                    AS account_type,
    COALESCE(ca.sub_type, '')                       AS account_sub_type,
    SUM(CASE WHEN gp.dr_cr = 'Dr' THEN gp.amount ELSE 0 END) AS total_debits,
    SUM(CASE WHEN gp.dr_cr = 'Cr' THEN gp.amount ELSE 0 END) AS total_credits,
    SUM(CASE WHEN gp.dr_cr = 'Dr' THEN gp.amount ELSE -gp.amount END) AS net_balance,
    COUNT(DISTINCT gp.contract_id)                  AS lease_count,
    COUNT(*)                                        AS posting_count
  FROM lease.gl_postings gp
  LEFT JOIN coa.accounts ca ON ca.account_code = gp.ledger_no
  WHERE CAST(gp.posting_date AS DATE) <= @PeriodEnd
  GROUP BY gp.ledger_no, gp.ledger_name, ca.class, ca.type, ca.sub_type
  ORDER BY ca.class, gp.ledger_no;

  -- Balance check: total debits vs total credits
  SELECT
    SUM(CASE WHEN dr_cr = 'Dr' THEN amount ELSE 0 END) AS grand_total_debits,
    SUM(CASE WHEN dr_cr = 'Cr' THEN amount ELSE 0 END) AS grand_total_credits,
    SUM(CASE WHEN dr_cr = 'Dr' THEN amount ELSE -amount END) AS net_difference,
    CASE WHEN ABS(SUM(CASE WHEN dr_cr = 'Dr' THEN amount ELSE -amount END)) < 0.01 THEN 1 ELSE 0 END AS is_balanced
  FROM lease.gl_postings
  WHERE CAST(posting_date AS DATE) <= @PeriodEnd;
END
GO

-- ── FEATURE 11: sp_GetExemptionRegister ──────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetExemptionRegister
  @ExemptionType VARCHAR(20) = NULL  -- NULL = all, 'ShortTerm', 'LowValue'
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    c.contract_id,
    c.contract_ref,
    c.asset_type,
    c.asset_description,
    l.lessor_name,
    c.commencement_date,
    c.expiry_date,
    c.term_months,
    c.monthly_payment,
    c.currency,
    c.exemption_type,
    c.exemption_reason,
    c.lifecycle_status,
    -- Total straight-line expense (monthly_payment * months elapsed)
    c.monthly_payment * DATEDIFF(MONTH, c.commencement_date,
      CASE WHEN GETDATE() > c.expiry_date THEN c.expiry_date ELSE GETDATE() END
    ) AS total_expense_ytd,
    -- Total life expense
    c.monthly_payment * c.term_months AS total_expense_life
  FROM lease.contracts c
  LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
  WHERE c.exemption_type IS NOT NULL
    AND c.exemption_type != 'None'
    AND (@ExemptionType IS NULL OR c.exemption_type = @ExemptionType)
  ORDER BY c.exemption_type, c.commencement_date;

  -- Summary by exemption type
  SELECT
    c.exemption_type,
    COUNT(*) AS lease_count,
    SUM(c.monthly_payment) AS total_monthly_payments,
    SUM(c.monthly_payment * c.term_months) AS total_life_expense,
    SUM(c.monthly_payment * DATEDIFF(MONTH, c.commencement_date,
      CASE WHEN GETDATE() > c.expiry_date THEN c.expiry_date ELSE GETDATE() END
    )) AS total_expense_ytd
  FROM lease.contracts c
  WHERE c.exemption_type IS NOT NULL AND c.exemption_type != 'None'
  GROUP BY c.exemption_type;
END
GO

-- ── FEATURE 11: sp_UpdateLeaseExemption ──────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_UpdateLeaseExemption
  @ContractId    INT,
  @ExemptionType VARCHAR(20),
  @ExemptionReason NVARCHAR(500) = NULL,
  @UpdatedBy     NVARCHAR(200)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE lease.contracts
  SET
    exemption_type   = @ExemptionType,
    exemption_reason = @ExemptionReason,
    updated_at       = GETDATE()
  WHERE contract_id = @ContractId;

  SELECT contract_id, contract_ref, exemption_type, exemption_reason
  FROM lease.contracts
  WHERE contract_id = @ContractId;
END
GO
