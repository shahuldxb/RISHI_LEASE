-- ═══════════════════════════════════════════════════════════════════════════════
-- IFRS 16 Remeasurement Stored Procedures
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── SP 1: Calculate Remeasurement (Preview) ─────────────────────────────────
-- Calculates the new liability, adjustment amounts, and generates a preview
-- of the new amortisation schedule. Does NOT post anything.
IF OBJECT_ID('accounting.sp_CalculateRemeasurement', 'P') IS NOT NULL
  DROP PROCEDURE accounting.sp_CalculateRemeasurement;
GO

CREATE PROCEDURE accounting.sp_CalculateRemeasurement
  @contract_id INT,
  @event_type NVARCHAR(50),
  @event_date DATE,
  @trigger_description NVARCHAR(500),
  @new_ibr DECIMAL(8,6) = NULL,          -- NULL = keep existing IBR
  @new_remaining_term INT = NULL,          -- NULL = calculate from expiry
  @new_monthly_payment DECIMAL(18,4) = NULL, -- NULL = keep existing payment
  @created_by NVARCHAR(200)
AS BEGIN
  SET NOCOUNT ON;
  
  -- ─── 1. Get current contract values ───────────────────────────────────────
  DECLARE @curr_liability DECIMAL(18,4), @curr_rou DECIMAL(18,4), @curr_ibr DECIMAL(8,6),
          @curr_payment DECIMAL(18,4), @curr_remaining INT, @currency VARCHAR(10),
          @contract_ref VARCHAR(50), @commencement_date DATE, @expiry_date DATE,
          @rou_asset_value DECIMAL(18,4);
  
  SELECT @curr_liability = lease_liability_commence,
         @rou_asset_value = rou_asset_value,
         @curr_ibr = ibr,
         @curr_payment = monthly_payment,
         @currency = ISNULL(currency, 'QAR'),
         @contract_ref = contract_ref,
         @commencement_date = commencement_date,
         @expiry_date = expiry_date
  FROM lease.contracts WHERE contract_id = @contract_id;
  
  IF @curr_liability IS NULL
  BEGIN
    RAISERROR('Contract not found', 16, 1);
    RETURN;
  END
  
  -- ─── 2. Get current posted state ──────────────────────────────────────────
  -- Find the last posted amortisation row to determine current liability balance
  DECLARE @last_posted_liability DECIMAL(18,4), @last_posted_rou DECIMAL(18,4),
          @last_posted_date DATE, @months_already_posted INT, @cumulative_depr DECIMAL(18,4);
  
  SELECT TOP 1 
    @last_posted_liability = closing_liability,
    @last_posted_rou = rou_nbv,
    @last_posted_date = period_date,
    @cumulative_depr = cumulative_depr
  FROM lease.amortisation_schedule 
  WHERE contract_id = @contract_id AND posting_status = 'Posted'
  ORDER BY period_date DESC;
  
  -- If no posted rows, use commencement values
  IF @last_posted_liability IS NULL
  BEGIN
    SET @last_posted_liability = @curr_liability;
    SET @last_posted_rou = @rou_asset_value;
    SET @last_posted_date = @commencement_date;
    SET @cumulative_depr = 0;
  END
  
  SELECT @months_already_posted = COUNT(*) 
  FROM lease.amortisation_schedule 
  WHERE contract_id = @contract_id AND posting_status = 'Posted';
  
  -- ─── 3. Determine revised parameters ──────────────────────────────────────
  DECLARE @rev_ibr DECIMAL(8,6) = ISNULL(@new_ibr, @curr_ibr);
  DECLARE @rev_payment DECIMAL(18,4) = ISNULL(@new_monthly_payment, @curr_payment);
  DECLARE @rev_remaining INT;
  
  IF @new_remaining_term IS NOT NULL
    SET @rev_remaining = @new_remaining_term;
  ELSE
    SET @rev_remaining = DATEDIFF(MONTH, @event_date, @expiry_date);
  
  IF @rev_remaining < 1 SET @rev_remaining = 1;
  
  -- ─── 4. Calculate new lease liability (PV of revised payments) ────────────
  DECLARE @monthly_rate DECIMAL(18,10) = @rev_ibr / 12.0;
  DECLARE @new_liability DECIMAL(18,4);
  
  IF @monthly_rate > 0
    SET @new_liability = @rev_payment * (1.0 - POWER(1.0 + @monthly_rate, -@rev_remaining)) / @monthly_rate;
  ELSE
    SET @new_liability = @rev_payment * @rev_remaining;
  
  -- ─── 5. Calculate adjustments ─────────────────────────────────────────────
  -- The adjustment is: new liability - current outstanding liability (not commencement value)
  DECLARE @liability_adj DECIMAL(18,4) = @new_liability - @last_posted_liability;
  DECLARE @rou_adj DECIMAL(18,4);
  DECLARE @pnl_adj DECIMAL(18,4) = 0;
  
  -- ROU adjustment = liability adjustment, BUT capped at zero
  IF (@last_posted_rou + @liability_adj) >= 0
  BEGIN
    SET @rou_adj = @liability_adj;
  END
  ELSE
  BEGIN
    -- ROU would go negative: cap at zero, excess to P&L
    SET @rou_adj = -@last_posted_rou;  -- reduce ROU to zero
    SET @pnl_adj = @liability_adj - @rou_adj;  -- remainder to P&L (gain)
  END
  
  DECLARE @new_rou DECIMAL(18,4) = @last_posted_rou + @rou_adj;
  
  -- ─── 6. Generate preview schedule ─────────────────────────────────────────
  CREATE TABLE #preview_schedule (
    month_num INT,
    period_date DATE,
    opening_liability DECIMAL(18,4),
    interest_expense DECIMAL(18,4),
    payment DECIMAL(18,4),
    principal DECIMAL(18,4),
    closing_liability DECIMAL(18,4),
    rou_nbv DECIMAL(18,4),
    depreciation DECIMAL(18,4)
  );
  
  DECLARE @sched_opening DECIMAL(18,4) = @new_liability;
  DECLARE @sched_rou DECIMAL(18,4) = @new_rou;
  DECLARE @monthly_depr DECIMAL(18,4) = CASE WHEN @rev_remaining > 0 THEN @new_rou / @rev_remaining ELSE 0 END;
  DECLARE @i INT = 1;
  DECLARE @sched_date DATE = @event_date;
  
  WHILE @i <= @rev_remaining
  BEGIN
    DECLARE @s_interest DECIMAL(18,4) = @sched_opening * @monthly_rate;
    DECLARE @s_principal DECIMAL(18,4) = @rev_payment - @s_interest;
    DECLARE @s_closing DECIMAL(18,4) = @sched_opening - @s_principal;
    
    SET @sched_rou = @sched_rou - @monthly_depr;
    
    INSERT INTO #preview_schedule VALUES (
      @i, @sched_date, @sched_opening, @s_interest, @rev_payment, @s_principal,
      @s_closing, @sched_rou, @monthly_depr
    );
    
    SET @sched_opening = @s_closing;
    SET @sched_date = DATEADD(MONTH, 1, @sched_date);
    SET @i = @i + 1;
  END
  
  -- ─── 7. Return results ────────────────────────────────────────────────────
  -- Result Set 1: Summary
  SELECT 
    @contract_id AS contract_id,
    @contract_ref AS contract_ref,
    @currency AS currency,
    @event_type AS event_type,
    @event_date AS event_date,
    -- Old values
    @last_posted_liability AS old_liability,
    @last_posted_rou AS old_rou_asset,
    @curr_ibr AS old_ibr,
    @curr_payment AS old_monthly_payment,
    DATEDIFF(MONTH, @event_date, @expiry_date) AS old_remaining_term,
    @months_already_posted AS months_already_posted,
    -- New values
    @new_liability AS new_liability,
    @new_rou AS new_rou_asset,
    @rev_ibr AS new_ibr,
    @rev_payment AS new_monthly_payment,
    @rev_remaining AS new_remaining_term,
    -- Adjustments
    @liability_adj AS liability_adjustment,
    @rou_adj AS rou_adjustment,
    @pnl_adj AS pnl_adjustment,
    -- JV Preview
    CASE WHEN @liability_adj > 0 THEN 'Dr ROU Asset / Cr Lease Liability'
         WHEN @liability_adj < 0 AND @pnl_adj = 0 THEN 'Dr Lease Liability / Cr ROU Asset'
         WHEN @liability_adj < 0 AND @pnl_adj < 0 THEN 'Dr Lease Liability / Cr ROU Asset + Cr Gain on Remeasurement'
         ELSE 'No adjustment required' END AS jv_description;
  
  -- Result Set 2: New amortisation schedule preview
  SELECT * FROM #preview_schedule ORDER BY month_num;
  
  DROP TABLE #preview_schedule;
END;
GO

-- ─── SP 2: Execute Remeasurement (Confirm & Post) ────────────────────────────
-- Actually performs the remeasurement: inserts event, generates JV, regenerates schedule
IF OBJECT_ID('accounting.sp_ExecuteRemeasurement', 'P') IS NOT NULL
  DROP PROCEDURE accounting.sp_ExecuteRemeasurement;
GO

CREATE PROCEDURE accounting.sp_ExecuteRemeasurement
  @contract_id INT,
  @event_type NVARCHAR(50),
  @event_date DATE,
  @trigger_description NVARCHAR(500),
  @new_ibr DECIMAL(8,6) = NULL,
  @new_remaining_term INT = NULL,
  @new_monthly_payment DECIMAL(18,4) = NULL,
  @created_by NVARCHAR(200)
AS BEGIN
  SET NOCOUNT ON;
  BEGIN TRY
    BEGIN TRANSACTION;
    
    -- ─── 1. Get current contract values ─────────────────────────────────────
    DECLARE @curr_liability DECIMAL(18,4), @curr_rou DECIMAL(18,4), @curr_ibr DECIMAL(8,6),
            @curr_payment DECIMAL(18,4), @currency VARCHAR(10), @contract_ref VARCHAR(50),
            @commencement_date DATE, @expiry_date DATE, @rou_asset_value DECIMAL(18,4);
    
    SELECT @curr_liability = lease_liability_commence,
           @rou_asset_value = rou_asset_value,
           @curr_ibr = ibr,
           @curr_payment = monthly_payment,
           @currency = ISNULL(currency, 'QAR'),
           @contract_ref = contract_ref,
           @commencement_date = commencement_date,
           @expiry_date = expiry_date
    FROM lease.contracts WHERE contract_id = @contract_id;
    
    IF @curr_liability IS NULL
    BEGIN
      RAISERROR('Contract not found', 16, 1);
      RETURN;
    END
    
    -- ─── 2. Get current posted state ────────────────────────────────────────
    DECLARE @last_posted_liability DECIMAL(18,4), @last_posted_rou DECIMAL(18,4),
            @last_posted_date DATE, @cumulative_depr DECIMAL(18,4);
    
    SELECT TOP 1 
      @last_posted_liability = closing_liability,
      @last_posted_rou = rou_nbv,
      @last_posted_date = period_date,
      @cumulative_depr = cumulative_depr
    FROM lease.amortisation_schedule 
    WHERE contract_id = @contract_id AND posting_status = 'Posted'
    ORDER BY period_date DESC;
    
    IF @last_posted_liability IS NULL
    BEGIN
      SET @last_posted_liability = @curr_liability;
      SET @last_posted_rou = @rou_asset_value;
      SET @last_posted_date = @commencement_date;
      SET @cumulative_depr = 0;
    END
    
    DECLARE @months_already_posted INT;
    SELECT @months_already_posted = COUNT(*) 
    FROM lease.amortisation_schedule 
    WHERE contract_id = @contract_id AND posting_status = 'Posted';
    
    -- ─── 3. Determine revised parameters ────────────────────────────────────
    DECLARE @rev_ibr DECIMAL(8,6) = ISNULL(@new_ibr, @curr_ibr);
    DECLARE @rev_payment DECIMAL(18,4) = ISNULL(@new_monthly_payment, @curr_payment);
    DECLARE @rev_remaining INT;
    
    IF @new_remaining_term IS NOT NULL
      SET @rev_remaining = @new_remaining_term;
    ELSE
      SET @rev_remaining = DATEDIFF(MONTH, @event_date, @expiry_date);
    
    IF @rev_remaining < 1 SET @rev_remaining = 1;
    
    -- ─── 4. Calculate new lease liability ───────────────────────────────────
    DECLARE @monthly_rate DECIMAL(18,10) = @rev_ibr / 12.0;
    DECLARE @new_liability DECIMAL(18,4);
    
    IF @monthly_rate > 0
      SET @new_liability = @rev_payment * (1.0 - POWER(1.0 + @monthly_rate, -@rev_remaining)) / @monthly_rate;
    ELSE
      SET @new_liability = @rev_payment * @rev_remaining;
    
    -- ─── 5. Calculate adjustments ───────────────────────────────────────────
    DECLARE @liability_adj DECIMAL(18,4) = @new_liability - @last_posted_liability;
    DECLARE @rou_adj DECIMAL(18,4);
    DECLARE @pnl_adj DECIMAL(18,4) = 0;
    
    IF (@last_posted_rou + @liability_adj) >= 0
    BEGIN
      SET @rou_adj = @liability_adj;
    END
    ELSE
    BEGIN
      SET @rou_adj = -@last_posted_rou;
      SET @pnl_adj = @liability_adj - @rou_adj;
    END
    
    DECLARE @new_rou DECIMAL(18,4) = @last_posted_rou + @rou_adj;
    
    -- ─── 6. Insert remeasurement event ──────────────────────────────────────
    DECLARE @event_id INT;
    INSERT INTO lease.remeasurement_events 
      (contract_id, event_type, event_date, trigger_description,
       old_liability, old_rou_asset, old_ibr, old_remaining_term,
       new_liability, new_rou_asset, new_ibr, new_remaining_term,
       liability_adjustment, rou_adjustment, status, created_by)
    VALUES 
      (@contract_id, @event_type, @event_date, @trigger_description,
       @last_posted_liability, @last_posted_rou, @curr_ibr, DATEDIFF(MONTH, @event_date, @expiry_date),
       @new_liability, @new_rou, @rev_ibr, @rev_remaining,
       @liability_adj, @rou_adj, 'POSTED', @created_by);
    
    SET @event_id = SCOPE_IDENTITY();
    
    -- ─── 7. Generate Adjustment JV ──────────────────────────────────────────
    -- Old JVs are NEVER touched. This is a new, prospective adjustment.
    DECLARE @pk VARCHAR(10) = FORMAT(@event_date, 'yyyyMM');
    DECLARE @jvn VARCHAR(30);
    EXEC accounting.sp_NextJVNumber @pk, @jvn OUTPUT;
    
    DECLARE @abs_liability_adj DECIMAL(18,4) = ABS(@liability_adj);
    DECLARE @abs_rou_adj DECIMAL(18,4) = ABS(@rou_adj);
    DECLARE @abs_pnl_adj DECIMAL(18,4) = ABS(@pnl_adj);
    DECLARE @total_debit DECIMAL(18,4);
    DECLARE @total_credit DECIMAL(18,4);
    
    -- Calculate totals based on direction
    IF @liability_adj > 0
    BEGIN
      SET @total_debit = @abs_rou_adj;
      SET @total_credit = @abs_liability_adj;
    END
    ELSE
    BEGIN
      SET @total_debit = @abs_liability_adj;
      SET @total_credit = @abs_rou_adj + @abs_pnl_adj;
    END
    
    DECLARE @jv_id INT;
    INSERT INTO accounting.journal_vouchers
      (jv_number, jv_type, period_year, period_month, posting_date, description,
       contract_id, source_ref, source_type, currency, total_debit, total_credit, status, created_by, created_at)
    VALUES 
      (@jvn, 'Remeasurement', YEAR(@event_date), MONTH(@event_date), @event_date,
       'IFRS 16 Remeasurement — ' + @event_type + ' | ' + @contract_ref + ' | ' + ISNULL(@trigger_description, ''),
       @contract_id, CAST(@event_id AS VARCHAR), 'REMEASUREMENT', @currency,
       @total_debit, @total_credit, 'Posted', @created_by, GETUTCDATE());
    
    SET @jv_id = SCOPE_IDENTITY();
    
    DECLARE @line_seq INT = 1;
    DECLARE @calc_note NVARCHAR(MAX);
    
    IF @liability_adj > 0
    BEGIN
      -- Liability INCREASED: Dr ROU Asset, Cr Lease Liability
      SET @calc_note = 'IFRS 16 Remeasurement — Liability Increase' + CHAR(10) +
        'Trigger: ' + @event_type + ' — ' + ISNULL(@trigger_description, '') + CHAR(10) + CHAR(10) +
        'Old Lease Liability (outstanding): ' + FORMAT(@last_posted_liability, 'N2') + ' ' + @currency + CHAR(10) +
        'New Lease Liability (PV of revised payments): ' + FORMAT(@new_liability, 'N2') + ' ' + @currency + CHAR(10) +
        'Adjustment: +' + FORMAT(@liability_adj, 'N2') + ' ' + @currency + CHAR(10) + CHAR(10) +
        'Calculation: PV = PMT x [1 - (1+r)^-n] / r' + CHAR(10) +
        'PMT = ' + FORMAT(@rev_payment, 'N2') + ', r = ' + FORMAT(@rev_ibr, 'N6') + '/12, n = ' + CAST(@rev_remaining AS VARCHAR) + ' months' + CHAR(10) + CHAR(10) +
        'Per IFRS 16.45: Adjustment recognised against ROU Asset (prospective).' + CHAR(10) +
        'Old JVs remain untouched. Future amortisation recalculated from this date.';
      
      INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
      VALUES (@jv_id, @line_seq, '10100', 'Right-of-Use Asset — Property', 'Dr', @abs_rou_adj,
        'ROU Asset remeasurement — liability increase', @contract_ref, @currency, @calc_note);
      SET @line_seq = @line_seq + 1;
      
      INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
      VALUES (@jv_id, @line_seq, '21020', 'Lease Liability — Property', 'Cr', @abs_liability_adj,
        'Lease Liability remeasurement — increase', @contract_ref, @currency, @calc_note);
    END
    ELSE IF @liability_adj < 0
    BEGIN
      -- Liability DECREASED: Dr Lease Liability, Cr ROU Asset (+ Cr P&L if ROU=0)
      SET @calc_note = 'IFRS 16 Remeasurement — Liability Decrease' + CHAR(10) +
        'Trigger: ' + @event_type + ' — ' + ISNULL(@trigger_description, '') + CHAR(10) + CHAR(10) +
        'Old Lease Liability (outstanding): ' + FORMAT(@last_posted_liability, 'N2') + ' ' + @currency + CHAR(10) +
        'New Lease Liability (PV of revised payments): ' + FORMAT(@new_liability, 'N2') + ' ' + @currency + CHAR(10) +
        'Adjustment: ' + FORMAT(@liability_adj, 'N2') + ' ' + @currency + CHAR(10) + CHAR(10) +
        'Calculation: PV = PMT x [1 - (1+r)^-n] / r' + CHAR(10) +
        'PMT = ' + FORMAT(@rev_payment, 'N2') + ', r = ' + FORMAT(@rev_ibr, 'N6') + '/12, n = ' + CAST(@rev_remaining AS VARCHAR) + ' months' + CHAR(10) + CHAR(10) +
        CASE WHEN @pnl_adj < 0 
          THEN 'ROU Asset reduced to zero. Excess ' + FORMAT(@abs_pnl_adj, 'N2') + ' recognised in P&L per IFRS 16.46(b).'
          ELSE 'Per IFRS 16.45: Adjustment recognised against ROU Asset (prospective).' END + CHAR(10) +
        'Old JVs remain untouched. Future amortisation recalculated from this date.';
      
      INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
      VALUES (@jv_id, @line_seq, '21020', 'Lease Liability — Property', 'Dr', @abs_liability_adj,
        'Lease Liability remeasurement — decrease', @contract_ref, @currency, @calc_note);
      SET @line_seq = @line_seq + 1;
      
      INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
      VALUES (@jv_id, @line_seq, '10100', 'Right-of-Use Asset — Property', 'Cr', @abs_rou_adj,
        'ROU Asset remeasurement — decrease', @contract_ref, @currency, @calc_note);
      SET @line_seq = @line_seq + 1;
      
      -- If ROU went to zero, excess to P&L
      IF @pnl_adj < 0
      BEGIN
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
        VALUES (@jv_id, @line_seq, '40500', 'Gain on Lease Remeasurement', 'Cr', @abs_pnl_adj,
          'Excess remeasurement gain — ROU reduced to zero', @contract_ref, @currency, @calc_note);
      END
    END
    
    -- ─── 8. Update contract with new values ─────────────────────────────────
    UPDATE lease.contracts 
    SET lease_liability_commence = @new_liability,
        rou_asset_value = CASE WHEN @new_rou > 0 THEN @rou_asset_value + @rou_adj ELSE @rou_asset_value END,
        ibr = @rev_ibr,
        monthly_payment = @rev_payment,
        expiry_date = CASE WHEN @new_remaining_term IS NOT NULL 
                           THEN DATEADD(MONTH, @rev_remaining, @event_date) 
                           ELSE expiry_date END
    WHERE contract_id = @contract_id;
    
    -- ─── 9. Delete UNPOSTED future schedule rows ────────────────────────────
    -- IMPORTANT: Only delete rows that have NOT been posted. Posted rows are history.
    DELETE FROM lease.amortisation_schedule 
    WHERE contract_id = @contract_id 
      AND posting_status != 'Posted'
      AND period_date >= @event_date;
    
    -- ─── 10. Regenerate amortisation schedule from event date forward ───────
    DECLARE @sched_opening DECIMAL(18,4) = @new_liability;
    DECLARE @sched_rou DECIMAL(18,4) = @new_rou;
    DECLARE @monthly_depr DECIMAL(18,4) = CASE WHEN @rev_remaining > 0 THEN @new_rou / @rev_remaining ELSE 0 END;
    DECLARE @new_cumulative_depr DECIMAL(18,4) = @cumulative_depr;
    DECLARE @i INT = 1;
    DECLARE @sched_date DATE = @event_date;
    
    WHILE @i <= @rev_remaining
    BEGIN
      DECLARE @s_interest DECIMAL(18,4) = @sched_opening * @monthly_rate;
      DECLARE @s_principal DECIMAL(18,4) = @rev_payment - @s_interest;
      DECLARE @s_closing DECIMAL(18,4) = @sched_opening - @s_principal;
      SET @new_cumulative_depr = @new_cumulative_depr + @monthly_depr;
      SET @sched_rou = @sched_rou - @monthly_depr;
      
      INSERT INTO lease.amortisation_schedule 
        (contract_id, period_date, opening_liability, interest_expense, payment, principal, 
         closing_liability, rou_nbv, depreciation, cumulative_depr, posting_status)
      VALUES 
        (@contract_id, @sched_date, @sched_opening, @s_interest, @rev_payment, @s_principal,
         @s_closing, @sched_rou, @monthly_depr, @new_cumulative_depr, 'Scheduled');
      
      SET @sched_opening = @s_closing;
      SET @sched_date = DATEADD(MONTH, 1, @sched_date);
      SET @i = @i + 1;
    END
    
    COMMIT TRANSACTION;
    
    -- ─── 11. Return result ──────────────────────────────────────────────────
    SELECT 
      @event_id AS remeasurement_id,
      @jv_id AS jv_id,
      @jvn AS jv_number,
      @contract_ref AS contract_ref,
      @event_type AS event_type,
      @event_date AS event_date,
      @last_posted_liability AS old_liability,
      @new_liability AS new_liability,
      @liability_adj AS liability_adjustment,
      @last_posted_rou AS old_rou,
      @new_rou AS new_rou,
      @rou_adj AS rou_adjustment,
      @pnl_adj AS pnl_adjustment,
      @rev_remaining AS new_schedule_months,
      @rev_payment AS new_monthly_payment,
      @rev_ibr AS new_ibr,
      'POSTED' AS status,
      'Old JVs preserved. New schedule generated from ' + FORMAT(@event_date, 'yyyy-MM-dd') + ' for ' + CAST(@rev_remaining AS VARCHAR) + ' months.' AS message;
      
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @err_msg NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @err_sev INT = ERROR_SEVERITY();
    DECLARE @err_state INT = ERROR_STATE();
    RAISERROR(@err_msg, @err_sev, @err_state);
  END CATCH
END;
GO
