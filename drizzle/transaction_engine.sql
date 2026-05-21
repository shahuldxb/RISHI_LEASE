-- ═══════════════════════════════════════════════════════════════════════════
-- Transaction Engine: Scenarios table + 8 IFRS 16 function SPs
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Scenarios table ─────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES
               WHERE TABLE_SCHEMA='accounting' AND TABLE_NAME='txn_scenarios')
BEGIN
  CREATE TABLE accounting.txn_scenarios (
    scenario_id    INT IDENTITY(1,1) PRIMARY KEY,
    function_type  NVARCHAR(60)  NOT NULL,  -- e.g. 'INITIAL_RECOGNITION'
    scenario_name  NVARCHAR(200) NOT NULL,
    contract_id    INT           NULL,
    params_json    NVARCHAR(MAX) NULL,       -- input parameters as JSON
    result_json    NVARCHAR(MAX) NULL,       -- computed result as JSON
    jv_id          INT           NULL,       -- FK to accounting.journal_vouchers
    test_status    NVARCHAR(20)  NOT NULL DEFAULT 'PENDING', -- PENDING/PASS/FAIL
    error_message  NVARCHAR(MAX) NULL,
    run_by         NVARCHAR(200) NULL,
    run_at         DATETIME2     NULL,
    created_at     DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );
END;
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- SP 1: Initial Recognition
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE accounting.sp_TxnInitialRecognition
  @contract_id  INT,
  @created_by   NVARCHAR(200) = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE
    @monthly_payment   DECIMAL(18,4),
    @ibr               DECIMAL(10,6),
    @term_months       INT,
    @currency          NVARCHAR(10),
    @contract_ref      NVARCHAR(50),
    @rou_asset         DECIMAL(18,4),
    @lease_liability   DECIMAL(18,4),
    @jv_number         NVARCHAR(50),
    @jv_id             INT,
    @period_year       INT = YEAR(GETUTCDATE()),
    @period_month      INT = MONTH(GETUTCDATE()),
    @posting_date      DATE = CAST(GETUTCDATE() AS DATE);

  -- Fetch contract
  SELECT
    @monthly_payment = monthly_payment,
    @ibr             = ibr,
    @term_months     = term_months,
    @currency        = currency,
    @contract_ref    = contract_ref,
    @rou_asset       = rou_asset_value,
    @lease_liability = lease_liability_commence
  FROM lease.contracts WHERE contract_id = @contract_id;

  IF @monthly_payment IS NULL
    THROW 50001, 'Contract not found', 1;

  -- Calculate PV of lease payments (annuity formula)
  -- PV = PMT × [1 - (1+r)^-n] / r   where r = monthly IBR
  DECLARE @r DECIMAL(18,10) = @ibr / 12.0;
  IF @rou_asset IS NULL OR @rou_asset = 0
  BEGIN
    IF @r > 0
      SET @lease_liability = @monthly_payment * (1.0 - POWER(1.0 + @r, -@term_months)) / @r;
    ELSE
      SET @lease_liability = @monthly_payment * @term_months;
    SET @rou_asset = @lease_liability;
  END;

  -- Get next JV number
  EXEC accounting.sp_NextJVNumber @jv_number OUTPUT;

  -- Insert JV header
  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit,
     status, created_by, created_at)
  VALUES
    (@jv_number, 'INITIAL_RECOGNITION', @period_year, @period_month, @posting_date,
     'Initial Recognition — ' + @contract_ref,
     @contract_id, @contract_ref, 'TXN_ENGINE', @currency,
     @rou_asset + @lease_liability, @rou_asset + @lease_liability,
     'Draft', @created_by, GETUTCDATE());
  SET @jv_id = SCOPE_IDENTITY();

  -- JV Lines
  -- Dr ROU Asset
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 1, '1610', 'Right-of-Use Asset', 'DR', @rou_asset,
          'Initial ROU Asset = PV of lease payments', @currency, 1.0, @rou_asset,
          'ROU Asset = PMT × [1-(1+r)^-n]/r = ' + CAST(@monthly_payment AS NVARCHAR) + ' × [1-(1+' + CAST(@r AS NVARCHAR) + ')^-' + CAST(@term_months AS NVARCHAR) + ']/' + CAST(@r AS NVARCHAR));

  -- Cr Lease Liability
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 2, '2310', 'Lease Liability', 'CR', @lease_liability,
          'Initial Lease Liability = PV of lease payments', @currency, 1.0, @lease_liability,
          'Lease Liability = ' + CAST(@lease_liability AS NVARCHAR(50)));

  SELECT @jv_id AS jv_id, @jv_number AS jv_number, @rou_asset AS rou_asset, @lease_liability AS lease_liability;
END;
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- SP 2: Interest Accrual
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE accounting.sp_TxnInterestAccrual
  @contract_id  INT,
  @period_year  INT,
  @period_month INT,
  @created_by   NVARCHAR(200) = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE
    @ibr              DECIMAL(10,6),
    @lease_liability  DECIMAL(18,4),
    @currency         NVARCHAR(10),
    @contract_ref     NVARCHAR(50),
    @interest_expense DECIMAL(18,4),
    @jv_number        NVARCHAR(50),
    @jv_id            INT,
    @posting_date     DATE = DATEFROMPARTS(@period_year, @period_month, 28);

  SELECT @ibr = ibr, @lease_liability = lease_liability_commence,
         @currency = currency, @contract_ref = contract_ref
  FROM lease.contracts WHERE contract_id = @contract_id;

  IF @ibr IS NULL THROW 50001, 'Contract not found', 1;

  -- Monthly interest = liability × (IBR/12)
  SET @interest_expense = @lease_liability * (@ibr / 12.0);

  EXEC accounting.sp_NextJVNumber @jv_number OUTPUT;

  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit,
     status, created_by, created_at)
  VALUES (@jv_number, 'INTEREST_ACCRUAL', @period_year, @period_month, @posting_date,
          'Interest Accrual ' + CAST(@period_year AS NVARCHAR) + '-' + RIGHT('0'+CAST(@period_month AS NVARCHAR),2) + ' — ' + @contract_ref,
          @contract_id, @contract_ref, 'TXN_ENGINE', @currency,
          @interest_expense, @interest_expense, 'Draft', @created_by, GETUTCDATE());
  SET @jv_id = SCOPE_IDENTITY();

  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 1, '6310', 'Finance Cost — Interest on Lease', 'DR', @interest_expense,
          'Monthly interest expense', @currency, 1.0, @interest_expense,
          'Interest = Liability × (IBR/12) = ' + CAST(@lease_liability AS NVARCHAR(50)) + ' × (' + CAST(@ibr AS NVARCHAR(20)) + '/12) = ' + CAST(@interest_expense AS NVARCHAR(50)));

  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 2, '2310', 'Lease Liability', 'CR', @interest_expense,
          'Unwinding of discount — increases liability', @currency, 1.0, @interest_expense,
          'Liability increases by interest accrued: +' + CAST(@interest_expense AS NVARCHAR(50)));

  SELECT @jv_id AS jv_id, @jv_number AS jv_number, @interest_expense AS interest_expense;
END;
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- SP 3: Depreciation
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE accounting.sp_TxnDepreciation
  @contract_id  INT,
  @period_year  INT,
  @period_month INT,
  @created_by   NVARCHAR(200) = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE
    @rou_asset     DECIMAL(18,4),
    @term_months   INT,
    @currency      NVARCHAR(10),
    @contract_ref  NVARCHAR(50),
    @monthly_dep   DECIMAL(18,4),
    @jv_number     NVARCHAR(50),
    @jv_id         INT,
    @posting_date  DATE = DATEFROMPARTS(@period_year, @period_month, 28);

  SELECT @rou_asset = rou_asset_value, @term_months = term_months,
         @currency = currency, @contract_ref = contract_ref
  FROM lease.contracts WHERE contract_id = @contract_id;

  IF @rou_asset IS NULL THROW 50001, 'Contract not found', 1;

  -- Straight-line depreciation
  SET @monthly_dep = @rou_asset / NULLIF(@term_months, 0);

  EXEC accounting.sp_NextJVNumber @jv_number OUTPUT;

  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit,
     status, created_by, created_at)
  VALUES (@jv_number, 'DEPRECIATION', @period_year, @period_month, @posting_date,
          'ROU Depreciation ' + CAST(@period_year AS NVARCHAR) + '-' + RIGHT('0'+CAST(@period_month AS NVARCHAR),2) + ' — ' + @contract_ref,
          @contract_id, @contract_ref, 'TXN_ENGINE', @currency,
          @monthly_dep, @monthly_dep, 'Draft', @created_by, GETUTCDATE());
  SET @jv_id = SCOPE_IDENTITY();

  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 1, '6320', 'Depreciation — ROU Asset', 'DR', @monthly_dep,
          'Monthly straight-line ROU depreciation', @currency, 1.0, @monthly_dep,
          'Dep = ROU / Term = ' + CAST(@rou_asset AS NVARCHAR(50)) + ' / ' + CAST(@term_months AS NVARCHAR) + ' = ' + CAST(@monthly_dep AS NVARCHAR(50)));

  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 2, '1611', 'Accumulated Depreciation — ROU Asset', 'CR', @monthly_dep,
          'Accumulated depreciation on ROU asset', @currency, 1.0, @monthly_dep,
          'Accumulated Dep increases by: ' + CAST(@monthly_dep AS NVARCHAR(50)));

  SELECT @jv_id AS jv_id, @jv_number AS jv_number, @monthly_dep AS monthly_depreciation;
END;
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- SP 4: Lease Payment
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE accounting.sp_TxnLeasePayment
  @contract_id  INT,
  @period_year  INT,
  @period_month INT,
  @created_by   NVARCHAR(200) = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE
    @monthly_payment  DECIMAL(18,4),
    @ibr              DECIMAL(10,6),
    @lease_liability  DECIMAL(18,4),
    @currency         NVARCHAR(10),
    @contract_ref     NVARCHAR(50),
    @interest_portion DECIMAL(18,4),
    @principal_portion DECIMAL(18,4),
    @jv_number        NVARCHAR(50),
    @jv_id            INT,
    @posting_date     DATE = DATEFROMPARTS(@period_year, @period_month, 28);

  SELECT @monthly_payment = monthly_payment, @ibr = ibr,
         @lease_liability = lease_liability_commence,
         @currency = currency, @contract_ref = contract_ref
  FROM lease.contracts WHERE contract_id = @contract_id;

  IF @monthly_payment IS NULL THROW 50001, 'Contract not found', 1;

  SET @interest_portion  = @lease_liability * (@ibr / 12.0);
  SET @principal_portion = @monthly_payment - @interest_portion;
  IF @principal_portion < 0 SET @principal_portion = 0;

  EXEC accounting.sp_NextJVNumber @jv_number OUTPUT;

  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit,
     status, created_by, created_at)
  VALUES (@jv_number, 'LEASE_PAYMENT', @period_year, @period_month, @posting_date,
          'Lease Payment ' + CAST(@period_year AS NVARCHAR) + '-' + RIGHT('0'+CAST(@period_month AS NVARCHAR),2) + ' — ' + @contract_ref,
          @contract_id, @contract_ref, 'TXN_ENGINE', @currency,
          @monthly_payment, @monthly_payment, 'Draft', @created_by, GETUTCDATE());
  SET @jv_id = SCOPE_IDENTITY();

  -- Dr Lease Liability (principal reduction)
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 1, '2310', 'Lease Liability', 'DR', @principal_portion,
          'Principal repayment portion', @currency, 1.0, @principal_portion,
          'Principal = PMT - Interest = ' + CAST(@monthly_payment AS NVARCHAR(50)) + ' - ' + CAST(@interest_portion AS NVARCHAR(50)) + ' = ' + CAST(@principal_portion AS NVARCHAR(50)));

  -- Dr Finance Cost (interest portion)
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 2, '6310', 'Finance Cost — Interest on Lease', 'DR', @interest_portion,
          'Interest portion of payment', @currency, 1.0, @interest_portion,
          'Interest = Liability × (IBR/12) = ' + CAST(@lease_liability AS NVARCHAR(50)) + ' × (' + CAST(@ibr AS NVARCHAR(20)) + '/12) = ' + CAST(@interest_portion AS NVARCHAR(50)));

  -- Cr Cash/Bank
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 3, '1010', 'Cash / Bank', 'CR', @monthly_payment,
          'Total cash outflow for lease payment', @currency, 1.0, @monthly_payment,
          'Total payment = ' + CAST(@monthly_payment AS NVARCHAR(50)));

  SELECT @jv_id AS jv_id, @jv_number AS jv_number,
         @monthly_payment AS total_payment, @interest_portion AS interest_portion, @principal_portion AS principal_portion;
END;
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- SP 5: Lease Modification (Remeasurement)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE accounting.sp_TxnModification
  @contract_id       INT,
  @new_monthly_payment DECIMAL(18,4),
  @new_term_months   INT,
  @created_by        NVARCHAR(200) = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE
    @ibr               DECIMAL(10,6),
    @old_liability     DECIMAL(18,4),
    @currency          NVARCHAR(10),
    @contract_ref      NVARCHAR(50),
    @new_liability     DECIMAL(18,4),
    @adjustment        DECIMAL(18,4),
    @r                 DECIMAL(18,10),
    @jv_number         NVARCHAR(50),
    @jv_id             INT,
    @period_year       INT = YEAR(GETUTCDATE()),
    @period_month      INT = MONTH(GETUTCDATE()),
    @posting_date      DATE = CAST(GETUTCDATE() AS DATE);

  SELECT @ibr = ibr, @old_liability = lease_liability_commence,
         @currency = currency, @contract_ref = contract_ref
  FROM lease.contracts WHERE contract_id = @contract_id;

  IF @ibr IS NULL THROW 50001, 'Contract not found', 1;

  SET @r = @ibr / 12.0;
  IF @r > 0
    SET @new_liability = @new_monthly_payment * (1.0 - POWER(1.0 + @r, -@new_term_months)) / @r;
  ELSE
    SET @new_liability = @new_monthly_payment * @new_term_months;

  SET @adjustment = @new_liability - @old_liability;

  EXEC accounting.sp_NextJVNumber @jv_number OUTPUT;

  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit,
     status, created_by, created_at)
  VALUES (@jv_number, 'MODIFICATION', @period_year, @period_month, @posting_date,
          'Lease Modification Remeasurement — ' + @contract_ref,
          @contract_id, @contract_ref, 'TXN_ENGINE', @currency,
          ABS(@adjustment), ABS(@adjustment), 'Draft', @created_by, GETUTCDATE());
  SET @jv_id = SCOPE_IDENTITY();

  IF @adjustment >= 0
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 1, '1610', 'Right-of-Use Asset', 'DR', @adjustment,
            'ROU increase from modification', @currency, 1.0, @adjustment,
            'New Liability ' + CAST(@new_liability AS NVARCHAR(50)) + ' - Old ' + CAST(@old_liability AS NVARCHAR(50)) + ' = +' + CAST(@adjustment AS NVARCHAR(50)));
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 2, '2310', 'Lease Liability', 'CR', @adjustment,
            'Liability increase from modification', @currency, 1.0, @adjustment,
            'Remeasured liability increases by: ' + CAST(@adjustment AS NVARCHAR(50)));
  END
  ELSE
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 1, '2310', 'Lease Liability', 'DR', ABS(@adjustment),
            'Liability decrease from modification', @currency, 1.0, ABS(@adjustment),
            'Remeasured liability decreases by: ' + CAST(ABS(@adjustment) AS NVARCHAR(50)));
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 2, '1610', 'Right-of-Use Asset', 'CR', ABS(@adjustment),
            'ROU decrease from modification', @currency, 1.0, ABS(@adjustment),
            'New Liability ' + CAST(@new_liability AS NVARCHAR(50)) + ' - Old ' + CAST(@old_liability AS NVARCHAR(50)) + ' = ' + CAST(@adjustment AS NVARCHAR(50)));
  END;

  SELECT @jv_id AS jv_id, @jv_number AS jv_number,
         @old_liability AS old_liability, @new_liability AS new_liability, @adjustment AS adjustment;
END;
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- SP 6: Termination
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE accounting.sp_TxnTermination
  @contract_id       INT,
  @remaining_liability DECIMAL(18,4),
  @remaining_rou     DECIMAL(18,4),
  @created_by        NVARCHAR(200) = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE
    @currency      NVARCHAR(10),
    @contract_ref  NVARCHAR(50),
    @gain_loss     DECIMAL(18,4),
    @jv_number     NVARCHAR(50),
    @jv_id         INT,
    @period_year   INT = YEAR(GETUTCDATE()),
    @period_month  INT = MONTH(GETUTCDATE()),
    @posting_date  DATE = CAST(GETUTCDATE() AS DATE);

  SELECT @currency = currency, @contract_ref = contract_ref
  FROM lease.contracts WHERE contract_id = @contract_id;

  IF @currency IS NULL THROW 50001, 'Contract not found', 1;

  -- Gain = Liability derecognised - ROU derecognised
  SET @gain_loss = @remaining_liability - @remaining_rou;

  EXEC accounting.sp_NextJVNumber @jv_number OUTPUT;

  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit,
     status, created_by, created_at)
  VALUES (@jv_number, 'TERMINATION', @period_year, @period_month, @posting_date,
          'Lease Termination Derecognition — ' + @contract_ref,
          @contract_id, @contract_ref, 'TXN_ENGINE', @currency,
          @remaining_liability + CASE WHEN @gain_loss < 0 THEN ABS(@gain_loss) ELSE 0 END,
          @remaining_rou + CASE WHEN @gain_loss >= 0 THEN @gain_loss ELSE 0 END,
          'Draft', @created_by, GETUTCDATE());
  SET @jv_id = SCOPE_IDENTITY();

  -- Dr Lease Liability (derecognise)
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 1, '2310', 'Lease Liability', 'DR', @remaining_liability,
          'Derecognise remaining lease liability', @currency, 1.0, @remaining_liability,
          'Remaining liability at termination date: ' + CAST(@remaining_liability AS NVARCHAR(50)));

  -- Cr ROU Asset (derecognise)
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 2, '1610', 'Right-of-Use Asset', 'CR', @remaining_rou,
          'Derecognise remaining ROU asset', @currency, 1.0, @remaining_rou,
          'Remaining ROU at termination date: ' + CAST(@remaining_rou AS NVARCHAR(50)));

  -- Gain or Loss
  IF @gain_loss >= 0
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 3, '7110', 'Gain on Lease Termination', 'CR', @gain_loss,
            'Gain = Liability - ROU', @currency, 1.0, @gain_loss,
            'Gain = ' + CAST(@remaining_liability AS NVARCHAR(50)) + ' - ' + CAST(@remaining_rou AS NVARCHAR(50)) + ' = ' + CAST(@gain_loss AS NVARCHAR(50)));
  ELSE
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 3, '6410', 'Loss on Lease Termination', 'DR', ABS(@gain_loss),
            'Loss = ROU - Liability', @currency, 1.0, ABS(@gain_loss),
            'Loss = ' + CAST(@remaining_rou AS NVARCHAR(50)) + ' - ' + CAST(@remaining_liability AS NVARCHAR(50)) + ' = ' + CAST(ABS(@gain_loss) AS NVARCHAR(50)));

  SELECT @jv_id AS jv_id, @jv_number AS jv_number,
         @remaining_liability AS liability_derecognised, @remaining_rou AS rou_derecognised, @gain_loss AS gain_loss;
END;
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- SP 7: FX Revaluation
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE accounting.sp_TxnFXRevaluation
  @contract_id   INT,
  @old_fx_rate   DECIMAL(18,6),
  @new_fx_rate   DECIMAL(18,6),
  @created_by    NVARCHAR(200) = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE
    @lease_liability   DECIMAL(18,4),
    @currency          NVARCHAR(10),
    @contract_ref      NVARCHAR(50),
    @old_base          DECIMAL(18,4),
    @new_base          DECIMAL(18,4),
    @fx_gain_loss      DECIMAL(18,4),
    @jv_number         NVARCHAR(50),
    @jv_id             INT,
    @period_year       INT = YEAR(GETUTCDATE()),
    @period_month      INT = MONTH(GETUTCDATE()),
    @posting_date      DATE = CAST(GETUTCDATE() AS DATE);

  SELECT @lease_liability = lease_liability_commence,
         @currency = currency, @contract_ref = contract_ref
  FROM lease.contracts WHERE contract_id = @contract_id;

  IF @lease_liability IS NULL THROW 50001, 'Contract not found', 1;

  SET @old_base   = @lease_liability * @old_fx_rate;
  SET @new_base   = @lease_liability * @new_fx_rate;
  SET @fx_gain_loss = @new_base - @old_base;  -- positive = loss (liability increased in base currency)

  EXEC accounting.sp_NextJVNumber @jv_number OUTPUT;

  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit,
     status, created_by, created_at)
  VALUES (@jv_number, 'FX_REVALUATION', @period_year, @period_month, @posting_date,
          'FX Revaluation ' + @currency + ' @ ' + CAST(@new_fx_rate AS NVARCHAR(20)) + ' — ' + @contract_ref,
          @contract_id, @contract_ref, 'TXN_ENGINE', @currency,
          ABS(@fx_gain_loss), ABS(@fx_gain_loss), 'Draft', @created_by, GETUTCDATE());
  SET @jv_id = SCOPE_IDENTITY();

  IF @fx_gain_loss > 0  -- FX Loss (liability increased)
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 1, '6510', 'FX Loss on Lease Liability', 'DR', @fx_gain_loss,
            'FX loss from revaluation', 'QAR', @new_fx_rate, @fx_gain_loss,
            'FX Loss = Liability × (New Rate - Old Rate) = ' + CAST(@lease_liability AS NVARCHAR(50)) + ' × (' + CAST(@new_fx_rate AS NVARCHAR(20)) + ' - ' + CAST(@old_fx_rate AS NVARCHAR(20)) + ') = ' + CAST(@fx_gain_loss AS NVARCHAR(50)));
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 2, '2310', 'Lease Liability', 'CR', @fx_gain_loss,
            'Liability increase from FX revaluation', 'QAR', @new_fx_rate, @fx_gain_loss,
            'Liability in QAR increases by: ' + CAST(@fx_gain_loss AS NVARCHAR(50)));
  END
  ELSE IF @fx_gain_loss < 0  -- FX Gain (liability decreased)
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 1, '2310', 'Lease Liability', 'DR', ABS(@fx_gain_loss),
            'Liability decrease from FX revaluation', 'QAR', @new_fx_rate, ABS(@fx_gain_loss),
            'Liability in QAR decreases by: ' + CAST(ABS(@fx_gain_loss) AS NVARCHAR(50)));
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 2, '7210', 'FX Gain on Lease Liability', 'CR', ABS(@fx_gain_loss),
            'FX gain from revaluation', 'QAR', @new_fx_rate, ABS(@fx_gain_loss),
            'FX Gain = Liability × (Old Rate - New Rate) = ' + CAST(ABS(@fx_gain_loss) AS NVARCHAR(50)));
  END
  ELSE
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 1, '2310', 'Lease Liability', 'DR', 0.01,
            'No FX movement — nominal entry', 'QAR', @new_fx_rate, 0.01, 'No rate change');
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
    VALUES (@jv_id, 2, '7210', 'FX Gain on Lease Liability', 'CR', 0.01,
            'No FX movement — nominal entry', 'QAR', @new_fx_rate, 0.01, 'No rate change');
  END;

  SELECT @jv_id AS jv_id, @jv_number AS jv_number,
         @old_base AS old_base_amount, @new_base AS new_base_amount, @fx_gain_loss AS fx_gain_loss;
END;
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- SP 8: Period-End Close
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE accounting.sp_TxnPeriodClose
  @contract_id  INT,
  @period_year  INT,
  @period_month INT,
  @created_by   NVARCHAR(200) = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE
    @monthly_payment  DECIMAL(18,4),
    @ibr              DECIMAL(10,6),
    @rou_asset        DECIMAL(18,4),
    @lease_liability  DECIMAL(18,4),
    @term_months      INT,
    @currency         NVARCHAR(10),
    @contract_ref     NVARCHAR(50),
    @interest_exp     DECIMAL(18,4),
    @depreciation     DECIMAL(18,4),
    @total_expense    DECIMAL(18,4),
    @jv_number        NVARCHAR(50),
    @jv_id            INT,
    @posting_date     DATE = DATEFROMPARTS(@period_year, @period_month, 28);

  SELECT @monthly_payment = monthly_payment, @ibr = ibr,
         @rou_asset = rou_asset_value, @lease_liability = lease_liability_commence,
         @term_months = term_months, @currency = currency, @contract_ref = contract_ref
  FROM lease.contracts WHERE contract_id = @contract_id;

  IF @monthly_payment IS NULL THROW 50001, 'Contract not found', 1;

  SET @interest_exp  = @lease_liability * (@ibr / 12.0);
  SET @depreciation  = @rou_asset / NULLIF(@term_months, 0);
  SET @total_expense = @interest_exp + @depreciation;

  EXEC accounting.sp_NextJVNumber @jv_number OUTPUT;

  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit,
     status, created_by, created_at)
  VALUES (@jv_number, 'PERIOD_CLOSE', @period_year, @period_month, @posting_date,
          'Period-End Close ' + CAST(@period_year AS NVARCHAR) + '-' + RIGHT('0'+CAST(@period_month AS NVARCHAR),2) + ' — ' + @contract_ref,
          @contract_id, @contract_ref, 'TXN_ENGINE', @currency,
          @total_expense, @total_expense, 'Draft', @created_by, GETUTCDATE());
  SET @jv_id = SCOPE_IDENTITY();

  -- Interest expense
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 1, '6310', 'Finance Cost — Interest on Lease', 'DR', @interest_exp,
          'Period-end interest accrual', @currency, 1.0, @interest_exp,
          'Interest = ' + CAST(@lease_liability AS NVARCHAR(50)) + ' × (' + CAST(@ibr AS NVARCHAR(20)) + '/12) = ' + CAST(@interest_exp AS NVARCHAR(50)));

  -- Depreciation
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 2, '6320', 'Depreciation — ROU Asset', 'DR', @depreciation,
          'Period-end ROU depreciation', @currency, 1.0, @depreciation,
          'Dep = ' + CAST(@rou_asset AS NVARCHAR(50)) + ' / ' + CAST(@term_months AS NVARCHAR) + ' = ' + CAST(@depreciation AS NVARCHAR(50)));

  -- Cr Lease Liability (interest unwinding)
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 3, '2310', 'Lease Liability', 'CR', @interest_exp,
          'Interest unwinding increases liability', @currency, 1.0, @interest_exp,
          'Liability +' + CAST(@interest_exp AS NVARCHAR(50)));

  -- Cr Accumulated Depreciation
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, fx_rate, base_amount, calc_explanation)
  VALUES (@jv_id, 4, '1611', 'Accumulated Depreciation — ROU Asset', 'CR', @depreciation,
          'Accumulated depreciation increase', @currency, 1.0, @depreciation,
          'Acc Dep +' + CAST(@depreciation AS NVARCHAR(50)));

  SELECT @jv_id AS jv_id, @jv_number AS jv_number,
         @interest_exp AS interest_expense, @depreciation AS depreciation, @total_expense AS total_expense;
END;
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- SP: List Scenarios
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE accounting.sp_ListTxnScenarios
  @function_type NVARCHAR(60) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT s.*, jv.jv_number, jv.status AS jv_status
  FROM accounting.txn_scenarios s
  LEFT JOIN accounting.journal_vouchers jv ON jv.jv_id = s.jv_id
  WHERE (@function_type IS NULL OR s.function_type = @function_type)
  ORDER BY s.created_at DESC;
END;
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- SP: Save Scenario Result
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE accounting.sp_SaveTxnScenario
  @function_type  NVARCHAR(60),
  @scenario_name  NVARCHAR(200),
  @contract_id    INT = NULL,
  @params_json    NVARCHAR(MAX) = NULL,
  @result_json    NVARCHAR(MAX) = NULL,
  @jv_id          INT = NULL,
  @test_status    NVARCHAR(20) = 'PASS',
  @error_message  NVARCHAR(MAX) = NULL,
  @run_by         NVARCHAR(200) = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO accounting.txn_scenarios
    (function_type, scenario_name, contract_id, params_json, result_json, jv_id, test_status, error_message, run_by, run_at)
  VALUES
    (@function_type, @scenario_name, @contract_id, @params_json, @result_json, @jv_id, @test_status, @error_message, @run_by, GETUTCDATE());
  SELECT SCOPE_IDENTITY() AS scenario_id;
END;
GO
