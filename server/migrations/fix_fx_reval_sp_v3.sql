-- Fix sp_RunFXRevaluation v3: use correct column names (currency, not currency_code; status not is_deleted)
-- Also fix fx_revaluation_log to use 'currency' column name matching contracts table

-- First fix the fx_revaluation_log table column name if needed
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'lease' AND TABLE_NAME = 'fx_revaluation_log' AND COLUMN_NAME = 'currency_code'
)
BEGIN
  EXEC sp_rename 'lease.fx_revaluation_log.currency_code', 'currency', 'COLUMN';
END
GO

-- Also fix fx_rates table column name
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'lease' AND TABLE_NAME = 'fx_rates' AND COLUMN_NAME = 'currency_code'
)
BEGIN
  EXEC sp_rename 'lease.fx_rates.currency_code', 'currency', 'COLUMN';
  -- Rename the unique constraint
  IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_fx_rates_ccy_date')
    EXEC sp_rename 'lease.fx_rates.UQ_fx_rates_ccy_date', 'UQ_fx_rates_ccy_date2', 'INDEX';
END
GO

-- Recreate sp_UpsertFXRate with correct column name
IF OBJECT_ID('dbo.sp_UpsertFXRate', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_UpsertFXRate;
GO
CREATE PROCEDURE dbo.sp_UpsertFXRate
  @Currency    NVARCHAR(3),
  @RateDate    DATE,
  @ClosingRate DECIMAL(18,6),
  @Source      NVARCHAR(50) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  MERGE lease.fx_rates AS tgt
  USING (SELECT @Currency AS currency, @RateDate AS rate_date) AS src
    ON tgt.currency = src.currency AND tgt.rate_date = src.rate_date
  WHEN MATCHED THEN
    UPDATE SET closing_rate = @ClosingRate, source = @Source
  WHEN NOT MATCHED THEN
    INSERT (currency, rate_date, closing_rate, source)
    VALUES (@Currency, @RateDate, @ClosingRate, @Source);
  SELECT 'OK' AS result, 'FX rate saved' AS message;
END
GO

-- Recreate sp_GetFXRates with correct column name
IF OBJECT_ID('dbo.sp_GetFXRates', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetFXRates;
GO
CREATE PROCEDURE dbo.sp_GetFXRates
  @Currency NVARCHAR(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    rate_id,
    currency,
    CONVERT(VARCHAR(10), rate_date, 120) AS rate_date,
    closing_rate,
    source,
    CONVERT(VARCHAR(23), created_at, 120) AS created_at
  FROM lease.fx_rates
  WHERE (@Currency IS NULL OR currency = @Currency)
  ORDER BY currency, rate_date DESC;
END
GO

-- Recreate sp_GetFXRevaluationLog with correct column name
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
    rl.currency,
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

-- Recreate sp_GetFXRevaluationSummary
IF OBJECT_ID('dbo.sp_GetFXRevaluationSummary', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetFXRevaluationSummary;
GO
CREATE PROCEDURE dbo.sp_GetFXRevaluationSummary
  @Year  INT,
  @Month INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    COUNT(*)                                                          AS total_leases_revalued,
    SUM(CASE WHEN fx_gain_loss > 0 THEN fx_gain_loss ELSE 0 END)    AS total_fx_gain,
    SUM(CASE WHEN fx_gain_loss < 0 THEN ABS(fx_gain_loss) ELSE 0 END) AS total_fx_loss,
    SUM(fx_gain_loss)                                                 AS net_fx_impact,
    SUM(revalued_amount_lc)                                           AS total_revalued_liability_lc,
    COUNT(DISTINCT currency)                                          AS currencies_revalued
  FROM lease.fx_revaluation_log
  WHERE period_year = @Year AND period_month = @Month;
END
GO

-- Recreate sp_RunFXRevaluation with correct column names
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

    DECLARE @PeriodEnd DATE = EOMONTH(DATEFROMPARTS(@Year, @Month, 1));
    DECLARE @JePrefix  NVARCHAR(10) = 'JE8-';

    CREATE TABLE #RevalLeases (
      contract_id        INT            NOT NULL,
      contract_ref       NVARCHAR(20)   NULL,
      currency           NVARCHAR(3)    NOT NULL,
      closing_balance_fc DECIMAL(18,2)  NOT NULL,
      prev_carrying_lc   DECIMAL(18,2)  NOT NULL,
      closing_rate       DECIMAL(18,6)  NOT NULL,
      revalued_lc        DECIMAL(18,2)  NOT NULL DEFAULT 0,
      fx_gain_loss       DECIMAL(18,2)  NOT NULL DEFAULT 0
    );

    INSERT INTO #RevalLeases (contract_id, contract_ref, currency, closing_balance_fc, prev_carrying_lc, closing_rate)
    SELECT
      c.contract_id,
      c.contract_ref,
      c.currency,
      ISNULL((
        SELECT TOP 1 a.closing_balance
        FROM lease.amortisation_schedule a
        WHERE a.contract_id = c.contract_id
          AND (a.period_year < @Year OR (a.period_year = @Year AND a.period_month <= @Month))
        ORDER BY a.period_year DESC, a.period_month DESC
      ), 0),
      ISNULL((
        SELECT TOP 1 rl.revalued_amount_lc
        FROM lease.fx_revaluation_log rl
        WHERE rl.contract_id = c.contract_id
          AND (rl.period_year < @Year OR (rl.period_year = @Year AND rl.period_month < @Month))
        ORDER BY rl.period_year DESC, rl.period_month DESC
      ),
        ISNULL((
          SELECT TOP 1 a2.closing_balance
          FROM lease.amortisation_schedule a2
          WHERE a2.contract_id = c.contract_id
            AND (a2.period_year < @Year OR (a2.period_year = @Year AND a2.period_month <= @Month))
          ORDER BY a2.period_year DESC, a2.period_month DESC
        ), 0)
      ),
      ISNULL((
        SELECT TOP 1 fx.closing_rate
        FROM lease.fx_rates fx
        WHERE fx.currency = c.currency
          AND fx.rate_date <= @PeriodEnd
        ORDER BY fx.rate_date DESC
      ), 0)
    FROM lease.contracts c
    WHERE c.currency <> 'QAR'
      AND c.lifecycle_status IN ('Active', 'Modified')
      AND c.status <> 'Terminated';

    DELETE FROM #RevalLeases WHERE closing_rate = 0;

    UPDATE #RevalLeases
    SET revalued_lc  = closing_balance_fc * closing_rate,
        fx_gain_loss = (closing_balance_fc * closing_rate) - prev_carrying_lc;

    DECLARE @Count INT = (SELECT COUNT(*) FROM #RevalLeases);

    IF @Count = 0
    BEGIN
      DROP TABLE #RevalLeases;
      COMMIT TRANSACTION;
      SELECT 'OK' AS result, 'No non-QAR leases with available rates found for this period' AS message, 0 AS revalued_count;
      RETURN;
    END

    DELETE FROM lease.fx_revaluation_log
    WHERE period_year = @Year AND period_month = @Month
      AND contract_id IN (SELECT contract_id FROM #RevalLeases);

    INSERT INTO lease.fx_revaluation_log (
      contract_id, period_year, period_month, currency,
      original_amount_fc, closing_rate, revalued_amount_lc,
      prev_carrying_lc, fx_gain_loss, je_ref, posted_by
    )
    SELECT
      contract_id, @Year, @Month, currency,
      closing_balance_fc, closing_rate, revalued_lc,
      prev_carrying_lc, fx_gain_loss,
      @JePrefix + CAST(@Year AS NVARCHAR) + '-' + RIGHT('0' + CAST(@Month AS NVARCHAR), 2) + '-' + CAST(contract_id AS NVARCHAR),
      @PostedBy
    FROM #RevalLeases;

    INSERT INTO lease.gl_postings (
      contract_id, je_ref, je_label, posting_date,
      ledger_no, account_name, debit_amount, credit_amount, posted_by
    )
    SELECT
      r.contract_id,
      @JePrefix + CAST(@Year AS NVARCHAR) + '-' + RIGHT('0' + CAST(@Month AS NVARCHAR), 2) + '-' + CAST(r.contract_id AS NVARCHAR),
      'JE-8: FX Revaluation (' + r.currency + ')',
      @PeriodEnd,
      CASE WHEN r.fx_gain_loss < 0 THEN '2100' ELSE '4500' END,
      CASE WHEN r.fx_gain_loss < 0 THEN 'Lease Liability (FX Loss)' ELSE 'FX Gain on Lease Liability' END,
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
PRINT 'All FX Revaluation SPs recreated successfully';
