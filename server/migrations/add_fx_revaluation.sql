-- ============================================================
-- FX REVALUATION MIGRATION
-- Creates tables and SPs for multi-currency lease liability
-- revaluation per IFRS 16 / IAS 21
-- ============================================================

-- ── 1. FX RATES TABLE ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'fx_rates' AND schema_id = SCHEMA_ID('lease'))
BEGIN
  CREATE TABLE lease.fx_rates (
    rate_id       INT IDENTITY(1,1) PRIMARY KEY,
    currency_code NVARCHAR(3)    NOT NULL,
    rate_date     DATE           NOT NULL,
    closing_rate  DECIMAL(18,6)  NOT NULL,   -- units of functional currency (QAR) per 1 FC unit
    source        NVARCHAR(50)   NULL,
    created_at    DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_fx_rates_ccy_date UNIQUE (currency_code, rate_date)
  );
END
GO

-- ── 2. FX REVALUATION LOG TABLE ──────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'fx_revaluation_log' AND schema_id = SCHEMA_ID('lease'))
BEGIN
  CREATE TABLE lease.fx_revaluation_log (
    reval_id             INT IDENTITY(1,1) PRIMARY KEY,
    contract_id          INT            NOT NULL,
    period_year          INT            NOT NULL,
    period_month         INT            NOT NULL,
    currency_code        NVARCHAR(3)    NOT NULL,
    original_amount_fc   DECIMAL(18,2)  NOT NULL,   -- liability in foreign currency
    closing_rate         DECIMAL(18,6)  NOT NULL,
    revalued_amount_lc   DECIMAL(18,2)  NOT NULL,   -- liability after revaluation in QAR
    prev_carrying_lc     DECIMAL(18,2)  NOT NULL,   -- carrying amount before revaluation in QAR
    fx_gain_loss         DECIMAL(18,2)  NOT NULL,   -- positive = gain, negative = loss
    je_ref               NVARCHAR(20)   NULL,
    posted_by            NVARCHAR(100)  NULL,
    posted_at            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_fx_reval_contract_period UNIQUE (contract_id, period_year, period_month)
  );
END
GO

-- ── 3. SP: UPSERT FX RATE ────────────────────────────────────
IF OBJECT_ID('dbo.sp_UpsertFXRate', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_UpsertFXRate;
GO
CREATE PROCEDURE dbo.sp_UpsertFXRate
  @CurrencyCode NVARCHAR(3),
  @RateDate     DATE,
  @ClosingRate  DECIMAL(18,6),
  @Source       NVARCHAR(50) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  MERGE lease.fx_rates AS tgt
  USING (SELECT @CurrencyCode AS currency_code, @RateDate AS rate_date) AS src
    ON tgt.currency_code = src.currency_code AND tgt.rate_date = src.rate_date
  WHEN MATCHED THEN
    UPDATE SET closing_rate = @ClosingRate, source = @Source
  WHEN NOT MATCHED THEN
    INSERT (currency_code, rate_date, closing_rate, source)
    VALUES (@CurrencyCode, @RateDate, @ClosingRate, @Source);

  SELECT 'OK' AS result, 'FX rate saved' AS message;
END
GO

-- ── 4. SP: GET FX RATES ──────────────────────────────────────
IF OBJECT_ID('dbo.sp_GetFXRates', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetFXRates;
GO
CREATE PROCEDURE dbo.sp_GetFXRates
  @CurrencyCode NVARCHAR(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    rate_id,
    currency_code,
    CONVERT(VARCHAR(10), rate_date, 120) AS rate_date,
    closing_rate,
    source,
    CONVERT(VARCHAR(23), created_at, 120) AS created_at
  FROM lease.fx_rates
  WHERE (@CurrencyCode IS NULL OR currency_code = @CurrencyCode)
  ORDER BY currency_code, rate_date DESC;
END
GO

-- ── 5. SP: RUN FX REVALUATION ────────────────────────────────
IF OBJECT_ID('dbo.sp_RunFXRevaluation', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_RunFXRevaluation;
GO
CREATE PROCEDURE dbo.sp_RunFXRevaluation
  @Year     INT,
  @Month    INT,
  @PostedBy NVARCHAR(100) = 'system'
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRY
    BEGIN TRANSACTION;

    -- Period end date
    DECLARE @PeriodEnd DATE = EOMONTH(DATEFROMPARTS(@Year, @Month, 1));
    DECLARE @JePrefix NVARCHAR(10) = 'JE8-';

    -- Temp table for leases with non-QAR currency that have an active liability
    CREATE TABLE #RevalLeases (
      contract_id        INT,
      contract_ref       NVARCHAR(20),
      currency_code      NVARCHAR(3),
      closing_balance_fc DECIMAL(18,2),   -- liability in FC (from latest amortisation row)
      prev_carrying_lc   DECIMAL(18,2),   -- previous QAR carrying amount
      closing_rate       DECIMAL(18,6),
      revalued_lc        DECIMAL(18,2),
      fx_gain_loss       DECIMAL(18,2)
    );

    -- Get leases with non-QAR currency and active lifecycle status
    INSERT INTO #RevalLeases (contract_id, contract_ref, currency_code, closing_balance_fc, prev_carrying_lc)
    SELECT
      c.contract_id,
      c.contract_ref,
      c.currency_code,
      -- Use the closing balance from the most recent posted/projected period
      ISNULL((
        SELECT TOP 1 a.closing_balance
        FROM lease.amortisation_schedule a
        WHERE a.contract_id = c.contract_id
          AND (a.period_year < @Year OR (a.period_year = @Year AND a.period_month <= @Month))
        ORDER BY a.period_year DESC, a.period_month DESC
      ), 0) AS closing_balance_fc,
      -- Previous QAR carrying = closing_balance_fc * previous rate (or original rate if no prior reval)
      ISNULL((
        SELECT TOP 1 revalued_amount_lc
        FROM lease.fx_revaluation_log rl
        WHERE rl.contract_id = c.contract_id
          AND (rl.period_year < @Year OR (rl.period_year = @Year AND rl.period_month < @Month))
        ORDER BY rl.period_year DESC, rl.period_month DESC
      ),
      -- Fall back to original PV * original rate (approximate: use closing_balance_fc as QAR if no prior reval)
      ISNULL((
        SELECT TOP 1 a.closing_balance
        FROM lease.amortisation_schedule a
        WHERE a.contract_id = c.contract_id
          AND (a.period_year < @Year OR (a.period_year = @Year AND a.period_month <= @Month))
        ORDER BY a.period_year DESC, a.period_month DESC
      ), 0)
      ) AS prev_carrying_lc
    FROM lease.contracts c
    WHERE c.currency_code <> 'QAR'
      AND c.lifecycle_status IN ('Active', 'Modified')
      AND c.is_deleted = 0;

    -- Get closing rates for each currency
    UPDATE r
    SET closing_rate = fx.closing_rate
    FROM #RevalLeases r
    INNER JOIN lease.fx_rates fx
      ON fx.currency_code = r.currency_code
      AND fx.rate_date = (
        SELECT MAX(rate_date) FROM lease.fx_rates
        WHERE currency_code = r.currency_code
          AND rate_date <= @PeriodEnd
      );

    -- Remove leases where no rate is available
    DELETE FROM #RevalLeases WHERE closing_rate IS NULL OR closing_rate = 0;

    -- Calculate revalued amounts
    UPDATE #RevalLeases
    SET revalued_lc  = closing_balance_fc * closing_rate,
        fx_gain_loss = (closing_balance_fc * closing_rate) - prev_carrying_lc;

    -- Count how many leases to revalue
    DECLARE @Count INT = (SELECT COUNT(*) FROM #RevalLeases);

    IF @Count = 0
    BEGIN
      DROP TABLE #RevalLeases;
      SELECT 'OK' AS result, 'No non-QAR leases with available rates found for this period' AS message, 0 AS revalued_count;
      RETURN;
    END

    -- Insert / update revaluation log
    MERGE lease.fx_revaluation_log AS tgt
    USING #RevalLeases AS src
      ON tgt.contract_id = src.contract_id
         AND tgt.period_year = @Year
         AND tgt.period_month = @Month
    WHEN MATCHED THEN
      UPDATE SET
        currency_code      = src.currency_code,
        original_amount_fc = src.closing_balance_fc,
        closing_rate       = src.closing_rate,
        revalued_amount_lc = src.revalued_lc,
        prev_carrying_lc   = src.prev_carrying_lc,
        fx_gain_loss       = src.fx_gain_loss,
        je_ref             = @JePrefix + CAST(@Year AS NVARCHAR) + '-' + RIGHT('0' + CAST(@Month AS NVARCHAR), 2) + '-' + CAST(src.contract_id AS NVARCHAR),
        posted_by          = @PostedBy,
        posted_at          = GETUTCDATE()
    WHEN NOT MATCHED THEN
      INSERT (contract_id, period_year, period_month, currency_code, original_amount_fc,
              closing_rate, revalued_amount_lc, prev_carrying_lc, fx_gain_loss, je_ref, posted_by)
      VALUES (src.contract_id, @Year, @Month, src.currency_code, src.closing_balance_fc,
              src.closing_rate, src.revalued_lc, src.prev_carrying_lc, src.fx_gain_loss,
              @JePrefix + CAST(@Year AS NVARCHAR) + '-' + RIGHT('0' + CAST(@Month AS NVARCHAR), 2) + '-' + CAST(src.contract_id AS NVARCHAR),
              @PostedBy);

    -- Also insert into gl_postings for each revalued lease
    INSERT INTO lease.gl_postings (
      contract_id, je_ref, je_label, posting_date,
      ledger_no, account_name, debit_amount, credit_amount, posted_by
    )
    SELECT
      r.contract_id,
      @JePrefix + CAST(@Year AS NVARCHAR) + '-' + RIGHT('0' + CAST(@Month AS NVARCHAR), 2) + '-' + CAST(r.contract_id AS NVARCHAR),
      'JE-8: FX Revaluation (' + r.currency_code + ')',
      @PeriodEnd,
      CASE WHEN r.fx_gain_loss < 0 THEN '2100' ELSE '4500' END,
      CASE WHEN r.fx_gain_loss < 0 THEN 'Lease Liability' ELSE 'FX Gain on Lease Liability' END,
      CASE WHEN r.fx_gain_loss < 0 THEN ABS(r.fx_gain_loss) ELSE 0 END,
      CASE WHEN r.fx_gain_loss < 0 THEN 0 ELSE ABS(r.fx_gain_loss) END,
      @PostedBy
    FROM #RevalLeases r
    WHERE r.fx_gain_loss <> 0;

    DROP TABLE #RevalLeases;
    COMMIT TRANSACTION;

    SELECT 'OK' AS result,
           'FX revaluation posted for ' + CAST(@Count AS NVARCHAR) + ' lease(s)' AS message,
           @Count AS revalued_count;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    IF OBJECT_ID('tempdb..#RevalLeases') IS NOT NULL DROP TABLE #RevalLeases;
    SELECT 'ERROR' AS result, ERROR_MESSAGE() AS message, 0 AS revalued_count;
  END CATCH
END
GO

-- ── 6. SP: GET FX REVALUATION LOG ────────────────────────────
IF OBJECT_ID('dbo.sp_GetFXRevaluationLog', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetFXRevaluationLog;
GO
CREATE PROCEDURE dbo.sp_GetFXRevaluationLog
  @Year       INT = NULL,
  @Month      INT = NULL,
  @ContractId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    rl.reval_id,
    rl.contract_id,
    c.contract_ref,
    c.asset_description,
    rl.period_year,
    rl.period_month,
    rl.currency_code,
    rl.original_amount_fc,
    rl.closing_rate,
    rl.revalued_amount_lc,
    rl.prev_carrying_lc,
    rl.fx_gain_loss,
    rl.je_ref,
    rl.posted_by,
    CONVERT(VARCHAR(23), rl.posted_at, 120) AS posted_at
  FROM lease.fx_revaluation_log rl
  INNER JOIN lease.contracts c ON c.contract_id = rl.contract_id
  WHERE (@Year       IS NULL OR rl.period_year  = @Year)
    AND (@Month      IS NULL OR rl.period_month = @Month)
    AND (@ContractId IS NULL OR rl.contract_id  = @ContractId)
  ORDER BY rl.period_year DESC, rl.period_month DESC, rl.contract_id;
END
GO

-- ── 7. SP: GET FX SUMMARY (for KPI cards) ────────────────────
IF OBJECT_ID('dbo.sp_GetFXRevaluationSummary', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetFXRevaluationSummary;
GO
CREATE PROCEDURE dbo.sp_GetFXRevaluationSummary
  @Year  INT,
  @Month INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    COUNT(*)                                    AS total_leases_revalued,
    SUM(CASE WHEN fx_gain_loss > 0 THEN fx_gain_loss ELSE 0 END) AS total_fx_gain,
    SUM(CASE WHEN fx_gain_loss < 0 THEN ABS(fx_gain_loss) ELSE 0 END) AS total_fx_loss,
    SUM(fx_gain_loss)                           AS net_fx_impact,
    SUM(revalued_amount_lc)                     AS total_revalued_liability_lc,
    COUNT(DISTINCT currency_code)               AS currencies_revalued
  FROM lease.fx_revaluation_log
  WHERE period_year = @Year AND period_month = @Month;
END
GO

PRINT 'FX Revaluation migration completed successfully';
