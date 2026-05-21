-- Fix sp_RunFXRevaluation v2: explicit CREATE TABLE + INSERT INTO for temp table
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

    -- Explicit temp table with all columns including computed ones
    CREATE TABLE #RevalLeases (
      contract_id        INT            NOT NULL,
      contract_ref       NVARCHAR(20)   NULL,
      currency_code      NVARCHAR(3)    NOT NULL,
      closing_balance_fc DECIMAL(18,2)  NOT NULL DEFAULT 0,
      prev_carrying_lc   DECIMAL(18,2)  NOT NULL DEFAULT 0,
      closing_rate       DECIMAL(18,6)  NOT NULL DEFAULT 0,
      revalued_lc        DECIMAL(18,2)  NOT NULL DEFAULT 0,
      fx_gain_loss       DECIMAL(18,2)  NOT NULL DEFAULT 0
    );

    -- Insert base data for non-QAR active leases
    INSERT INTO #RevalLeases (contract_id, contract_ref, currency_code, closing_balance_fc, prev_carrying_lc, closing_rate)
    SELECT
      c.contract_id,
      c.contract_ref,
      c.currency_code,
      -- Latest closing balance from amortisation schedule
      ISNULL((
        SELECT TOP 1 a.closing_balance
        FROM lease.amortisation_schedule a
        WHERE a.contract_id = c.contract_id
          AND (a.period_year < @Year OR (a.period_year = @Year AND a.period_month <= @Month))
        ORDER BY a.period_year DESC, a.period_month DESC
      ), 0),
      -- Previous QAR carrying amount (from last revaluation log, or same as FC balance if first time)
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
      -- Most recent FX rate on or before period end
      ISNULL((
        SELECT TOP 1 fx.closing_rate
        FROM lease.fx_rates fx
        WHERE fx.currency_code = c.currency_code
          AND fx.rate_date <= @PeriodEnd
        ORDER BY fx.rate_date DESC
      ), 0)
    FROM lease.contracts c
    WHERE c.currency_code <> 'QAR'
      AND c.lifecycle_status IN ('Active', 'Modified')
      AND c.is_deleted = 0;

    -- Remove rows without a rate
    DELETE FROM #RevalLeases WHERE closing_rate = 0;

    -- Calculate revalued amounts
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

    -- Delete existing log rows for this period (allow re-run)
    DELETE FROM lease.fx_revaluation_log
    WHERE period_year = @Year AND period_month = @Month
      AND contract_id IN (SELECT contract_id FROM #RevalLeases);

    -- Insert revaluation log
    INSERT INTO lease.fx_revaluation_log (
      contract_id, period_year, period_month, currency_code,
      original_amount_fc, closing_rate, revalued_amount_lc,
      prev_carrying_lc, fx_gain_loss, je_ref, posted_by
    )
    SELECT
      contract_id, @Year, @Month, currency_code,
      closing_balance_fc, closing_rate, revalued_lc,
      prev_carrying_lc, fx_gain_loss,
      @JePrefix + CAST(@Year AS NVARCHAR) + '-' + RIGHT('0' + CAST(@Month AS NVARCHAR), 2) + '-' + CAST(contract_id AS NVARCHAR),
      @PostedBy
    FROM #RevalLeases;

    -- Insert GL postings for gain/loss entries
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
PRINT 'sp_RunFXRevaluation v2 created successfully';
