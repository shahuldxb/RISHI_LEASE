import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: true, trustServerCertificate: true, connectTimeout: 60000, requestTimeout: 120000 }
};

const SP_SQL = `
-- Drop and recreate sp_ApplyLeaseModification with full JV Register integration
IF OBJECT_ID('dbo.sp_ApplyLeaseModification', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ApplyLeaseModification;
GO

CREATE PROCEDURE dbo.sp_ApplyLeaseModification
  @ModificationId INT,
  @ApprovedBy     INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRY
  BEGIN TRANSACTION;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 1. Load modification details
  -- ══════════════════════════════════════════════════════════════════════════════
  DECLARE @ContractId    INT,
          @NewPayment    DECIMAL(18,2),
          @NewIBR        DECIMAL(10,6),
          @ModDate       DATE,
          @Notes         NVARCHAR(500);

  SELECT
    @ContractId  = contract_id,
    @NewPayment  = new_monthly_payment,
    @NewIBR      = ISNULL(new_ibr, 0),
    @ModDate     = modification_date,
    @Notes       = notes
  FROM lease.lease_modifications
  WHERE modification_id = @ModificationId AND status = 'pending';

  IF @ContractId IS NULL
  BEGIN
    RAISERROR('Modification not found or already applied.', 16, 1);
    RETURN;
  END

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 2. Load current contract details
  -- ══════════════════════════════════════════════════════════════════════════════
  DECLARE @OldPayment      DECIMAL(18,2),
          @OldIBR          DECIMAL(10,6),
          @ContractRef     NVARCHAR(50),
          @CommenceDate    DATE,
          @ExpiryDate      DATE,
          @OrigTermMonths  INT,
          @OldROUNBV       DECIMAL(18,2),
          @OldLiability    DECIMAL(18,2),
          @Currency        NVARCHAR(10),
          @CreatedBy       NVARCHAR(100);

  SELECT
    @OldPayment     = monthly_payment,
    @OldIBR         = ibr,
    @ContractRef    = contract_ref,
    @CommenceDate   = commencement_date,
    @ExpiryDate     = expiry_date,
    @OrigTermMonths = term_months,
    @Currency       = ISNULL(currency, 'QAR'),
    @CreatedBy      = CAST(ISNULL(maker_id, 0) AS NVARCHAR)
  FROM lease.contracts
  WHERE contract_id = @ContractId;

  -- Use existing IBR if new IBR not provided
  IF @NewIBR = 0 OR @NewIBR IS NULL SET @NewIBR = @OldIBR;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 3. Calculate remaining months from effective date
  -- ══════════════════════════════════════════════════════════════════════════════
  DECLARE @RemainingMonths INT = DATEDIFF(MONTH, @ModDate, @ExpiryDate);
  IF @RemainingMonths < 1 SET @RemainingMonths = 1;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 4. Get current liability and ROU NBV at modification date
  --    (from the last amortisation schedule row before effective date)
  -- ══════════════════════════════════════════════════════════════════════════════
  SELECT TOP 1
    @OldLiability = closing_liability,
    @OldROUNBV    = rou_nbv
  FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId
    AND period_date < @ModDate
  ORDER BY period_date DESC;

  -- If no prior period, use opening values
  IF @OldLiability IS NULL
  BEGIN
    SELECT TOP 1
      @OldLiability = opening_liability,
      @OldROUNBV    = rou_nbv + depreciation
    FROM lease.amortisation_schedule
    WHERE contract_id = @ContractId
    ORDER BY period_date ASC;
  END

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 5. Calculate new PV of lease liability (present value of annuity)
  -- ══════════════════════════════════════════════════════════════════════════════
  DECLARE @MonthlyRate DECIMAL(18,10) = @NewIBR / 12.0;
  DECLARE @NewLiability DECIMAL(18,2);

  IF @MonthlyRate > 0
    SET @NewLiability = @NewPayment * (1.0 - POWER(1.0 + @MonthlyRate, -@RemainingMonths)) / @MonthlyRate;
  ELSE
    SET @NewLiability = @NewPayment * @RemainingMonths;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 6. Calculate deltas and gain/loss
  -- ══════════════════════════════════════════════════════════════════════════════
  DECLARE @LiabDelta DECIMAL(18,2) = @NewLiability - @OldLiability;
  DECLARE @NewROUNBV DECIMAL(18,2) = @OldROUNBV + @LiabDelta;  -- Adjust ROU by liability change
  DECLARE @GainLoss  DECIMAL(18,2) = 0;  -- No P&L for scope increase (IFRS 16 Para 45)

  -- If new ROU would be negative, there's a gain/loss
  IF @NewROUNBV < 0
  BEGIN
    SET @GainLoss = @NewROUNBV;  -- Loss
    SET @NewROUNBV = 0;
  END

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 7. Delete future monthly amortisation JVs (from effective date onwards)
  -- ══════════════════════════════════════════════════════════════════════════════
  -- First delete the lines, then the headers
  DELETE l FROM accounting.jv_lines l
  INNER JOIN accounting.journal_vouchers jv ON l.jv_id = jv.jv_id
  WHERE jv.contract_id = @ContractId
    AND jv.jv_type = 'MONTHLY_AMORT'
    AND jv.posting_date >= @ModDate;

  DELETE FROM accounting.journal_vouchers
  WHERE contract_id = @ContractId
    AND jv_type = 'MONTHLY_AMORT'
    AND posting_date >= @ModDate;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 8. Generate JV number for the Remeasurement entry
  -- ══════════════════════════════════════════════════════════════════════════════
  DECLARE @ModYear  INT = YEAR(@ModDate);
  DECLARE @ModMonth INT = MONTH(@ModDate);
  DECLARE @YYYYmm   VARCHAR(6) = FORMAT(@ModDate, 'yyyyMM');

  DECLARE @NextSeq INT;
  SELECT @NextSeq = ISNULL(MAX(
    TRY_CAST(RIGHT(jv_number, 5) AS INT)
  ), 0) + 1
  FROM accounting.journal_vouchers
  WHERE jv_number LIKE 'JV-' + @YYYYmm + '-%';

  DECLARE @JVNumber VARCHAR(20) = 'JV-' + @YYYYmm + '-' + RIGHT('00000' + CAST(@NextSeq AS VARCHAR), 5);

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 9. Insert Remeasurement JV (JE-4) into journal_vouchers
  -- ══════════════════════════════════════════════════════════════════════════════
  DECLARE @RemeasJVId INT;
  DECLARE @TotalAmount DECIMAL(18,2) = ABS(@LiabDelta);

  INSERT INTO accounting.journal_vouchers (
    jv_number, jv_type, period_year, period_month, posting_date,
    description, contract_id, source_ref, source_type,
    currency, total_debit, total_credit, status, created_by, created_at
  )
  VALUES (
    @JVNumber, 'LEASE_MODIFICATION', @ModYear, @ModMonth, @ModDate,
    'Lease Modification (IFRS 16 Para 45) - ' + @ContractRef + ' | ' + FORMAT(@ModDate, 'MMM yyyy'),
    @ContractId, CAST(@ModificationId AS VARCHAR), 'MODIFICATION',
    @Currency, @TotalAmount, @TotalAmount, 'ERP', @CreatedBy, GETUTCDATE()
  );

  SET @RemeasJVId = SCOPE_IDENTITY();

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 10. Insert Remeasurement JV lines
  -- ══════════════════════════════════════════════════════════════════════════════
  DECLARE @CalcExpl NVARCHAR(MAX) = 
    'Lease Modification (IFRS 16 Para 45):' + CHAR(10) +
    'Effective Date: ' + FORMAT(@ModDate, 'dd MMM yyyy') + CHAR(10) +
    'New Monthly Payment: ' + FORMAT(@NewPayment, 'N2') + ' ' + @Currency + CHAR(10) +
    'Remaining Months: ' + CAST(@RemainingMonths AS VARCHAR) + CHAR(10) +
    'IBR: ' + FORMAT(@NewIBR * 100, 'N4') + '%' + CHAR(10) +
    'Monthly Rate: ' + FORMAT(@MonthlyRate * 100, 'N4') + '%' + CHAR(10) + CHAR(10) +
    'New PV = ' + FORMAT(@NewPayment, 'N2') + ' x [(1-(1+' + FORMAT(@MonthlyRate, 'N6') + ')^-' + CAST(@RemainingMonths AS VARCHAR) + ') / ' + FORMAT(@MonthlyRate, 'N6') + ']' + CHAR(10) +
    '     = ' + FORMAT(@NewLiability, 'N2') + ' ' + @Currency + CHAR(10) + CHAR(10) +
    'Current Liability: ' + FORMAT(@OldLiability, 'N2') + CHAR(10) +
    'Liability Delta: ' + FORMAT(@LiabDelta, 'N2') + CHAR(10) +
    'Current ROU NBV: ' + FORMAT(@OldROUNBV, 'N2') + CHAR(10) +
    'ROU Adjustment: ' + FORMAT(@LiabDelta, 'N2') + CHAR(10) +
    'New ROU NBV: ' + FORMAT(@NewROUNBV, 'N2');

  -- Line 1: ROU Asset adjustment
  IF @LiabDelta > 0
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@RemeasJVId, 1, '1601', 'Right-of-Use Asset', 'Dr', ABS(@LiabDelta),
            'Adjusted ROU asset carrying amount', @ContractRef, @Currency, @CalcExpl);

    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@RemeasJVId, 2, '2101', 'Lease Liability', 'Cr', ABS(@LiabDelta),
            'Remeasured lease liability', @ContractRef, @Currency, @CalcExpl);
  END
  ELSE
  BEGIN
    -- Decrease: Dr Lease Liability, Cr ROU Asset
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@RemeasJVId, 1, '2101', 'Lease Liability', 'Dr', ABS(@LiabDelta),
            'Remeasured lease liability (decrease)', @ContractRef, @Currency, @CalcExpl);

    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@RemeasJVId, 2, '1601', 'Right-of-Use Asset', 'Cr', ABS(@LiabDelta),
            'Adjusted ROU asset carrying amount (decrease)', @ContractRef, @Currency, @CalcExpl);
  END

  -- Gain/Loss line if applicable
  IF ABS(@GainLoss) > 0.01
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@RemeasJVId, 3, '7201', 'Gain/Loss on Lease Modification',
            CASE WHEN @GainLoss > 0 THEN 'Cr' ELSE 'Dr' END,
            ABS(@GainLoss),
            'Remeasurement gain/loss on modification', @ContractRef, @Currency, @CalcExpl);
  END

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 11. Delete old amortisation schedule from effective date onwards
  -- ══════════════════════════════════════════════════════════════════════════════
  DELETE FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId
    AND period_date >= @ModDate;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 12. Regenerate amortisation schedule with new terms
  -- ══════════════════════════════════════════════════════════════════════════════
  -- Find the next schedule_id offset (use schedule_id identity)

  -- Build new schedule
  DECLARE @i INT = 0;
  DECLARE @OpenLiab DECIMAL(18,2) = @NewLiability;
  DECLARE @MonthlyDepr DECIMAL(18,2) = @NewROUNBV / @RemainingMonths;
  DECLARE @CumDepr DECIMAL(18,2) = 0;
  DECLARE @ROUNBV DECIMAL(18,2) = @NewROUNBV;
  DECLARE @PeriodDate DATE;
  DECLARE @Interest DECIMAL(18,2), @Principal DECIMAL(18,2), @CloseLiab DECIMAL(18,2);

  -- Get existing cumulative depreciation
  SELECT @CumDepr = ISNULL(MAX(cumulative_depr), 0)
  FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId;

  WHILE @i < @RemainingMonths
  BEGIN
    SET @PeriodDate = DATEADD(MONTH, @i, @ModDate);
    SET @Interest = ROUND(@OpenLiab * @MonthlyRate, 2);
    SET @Principal = @NewPayment - @Interest;
    SET @CloseLiab = @OpenLiab - @Principal;
    SET @CumDepr = @CumDepr + @MonthlyDepr;
    SET @ROUNBV = @NewROUNBV - (@MonthlyDepr * (@i + 1));

    INSERT INTO lease.amortisation_schedule (
      contract_id, period_date,
      opening_liability, interest_expense, payment, principal, closing_liability,
      depreciation, rou_nbv, cumulative_depr, posting_status
    )
    VALUES (
      @ContractId, @PeriodDate,
      @OpenLiab, @Interest, @NewPayment, @Principal, @CloseLiab,
      @MonthlyDepr, @ROUNBV, @CumDepr, 'pending'
    );

    SET @OpenLiab = @CloseLiab;
    SET @i = @i + 1;
  END

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 13. Generate new monthly amortisation JVs for remaining periods
  -- ══════════════════════════════════════════════════════════════════════════════
  -- Determine period_seq continuation (count existing monthly JVs that were kept)
  DECLARE @ExistingSeqMax INT;
  SELECT @ExistingSeqMax = ISNULL(MAX(period_seq), 0)
  FROM accounting.journal_vouchers
  WHERE contract_id = @ContractId AND jv_type = 'MONTHLY_AMORT';

  -- Cursor through new schedule periods to generate JVs
  DECLARE @sPeriodDate DATE,
          @sOpenLiab DECIMAL(18,2), @sInterest DECIMAL(18,2),
          @sPayment DECIMAL(18,2), @sPrincipal DECIMAL(18,2),
          @sCloseLiab DECIMAL(18,2), @sDepr DECIMAL(18,2), @sROUNBV DECIMAL(18,2);

  DECLARE @SeqCounter INT = @ExistingSeqMax;
  DECLARE @pYear INT, @pMonth INT;
  DECLARE @pYYYYmm VARCHAR(6);
  DECLARE @pNextSeq INT;
  DECLARE @pJVNumber VARCHAR(20);
  DECLARE @pTotalDrCr DECIMAL(18,2);
  DECLARE @pJVId INT;
  DECLARE @intCalc NVARCHAR(MAX);
  DECLARE @deprCalc NVARCHAR(MAX);

  DECLARE sched_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT period_date,
           opening_liability, interest_expense, payment, principal, closing_liability,
           depreciation, rou_nbv
    FROM lease.amortisation_schedule
    WHERE contract_id = @ContractId AND period_date >= @ModDate
    ORDER BY period_date;

  OPEN sched_cursor;
  FETCH NEXT FROM sched_cursor INTO @sPeriodDate,
    @sOpenLiab, @sInterest, @sPayment, @sPrincipal, @sCloseLiab, @sDepr, @sROUNBV;

  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @SeqCounter = @SeqCounter + 1;

    -- Generate JV number for this period
    SET @pYear = YEAR(@sPeriodDate);
    SET @pMonth = MONTH(@sPeriodDate);
    SET @pYYYYmm = FORMAT(@sPeriodDate, 'yyyyMM');

    SELECT @pNextSeq = ISNULL(MAX(TRY_CAST(RIGHT(jv_number, 5) AS INT)), 0) + 1
    FROM accounting.journal_vouchers
    WHERE jv_number LIKE 'JV-' + @pYYYYmm + '-%';

    SET @pJVNumber = 'JV-' + @pYYYYmm + '-' + RIGHT('00000' + CAST(@pNextSeq AS VARCHAR), 5);

    -- Calculate totals for this period
    SET @pTotalDrCr = @sInterest + @sDepr;

    -- Insert JV header
    INSERT INTO accounting.journal_vouchers (
      jv_number, jv_type, period_year, period_month, posting_date,
      description, contract_id, source_ref, source_type,
      currency, total_debit, total_credit, status, created_by, created_at, period_seq
    )
    VALUES (
      @pJVNumber, 'MONTHLY_AMORT', @pYear, @pMonth, EOMONTH(@sPeriodDate),
      'Monthly IFRS 16 Amortisation - ' + @ContractRef + ' | ' + FORMAT(@sPeriodDate, 'MMM yyyy'),
      @ContractId, CAST(@SeqCounter AS VARCHAR), 'AMORTISATION',
      @Currency, @pTotalDrCr, @pTotalDrCr, 'ERP', @CreatedBy, GETUTCDATE(), @SeqCounter
    );
    SET @pJVId = SCOPE_IDENTITY();

    -- Calc explanation for interest
    SET @intCalc =
      'Interest Expense (Period ' + CAST(@SeqCounter AS VARCHAR) + '/' + CAST(@RemainingMonths AS VARCHAR) + '):' + CHAR(10) +
      'Opening Liability = ' + FORMAT(@sOpenLiab, 'N2') + ' ' + @Currency + CHAR(10) +
      'Monthly IBR = ' + FORMAT(@NewIBR * 100, 'N2') + '% / 12 = ' + FORMAT(@MonthlyRate * 100, 'N4') + '%' + CHAR(10) +
      'Interest = ' + FORMAT(@sOpenLiab, 'N2') + ' x ' + FORMAT(@MonthlyRate * 100, 'N4') + '%' + CHAR(10) +
      '= ' + FORMAT(@sInterest, 'N2') + ' ' + @Currency + CHAR(10) +
      'Closing Liability = ' + FORMAT(@sCloseLiab, 'N2') + ' ' + @Currency;

    -- Calc explanation for depreciation
    SET @deprCalc =
      'Depreciation (Period ' + CAST(@SeqCounter AS VARCHAR) + '/' + CAST(@RemainingMonths AS VARCHAR) + '):' + CHAR(10) +
      'ROU Asset (post-modification) = ' + FORMAT(@NewROUNBV, 'N2') + ' ' + @Currency + CHAR(10) +
      'Remaining Term = ' + CAST(@RemainingMonths AS VARCHAR) + ' months' + CHAR(10) +
      'Monthly Depr = ' + FORMAT(@NewROUNBV, 'N2') + ' / ' + CAST(@RemainingMonths AS VARCHAR) + CHAR(10) +
      '= ' + FORMAT(@sDepr, 'N2') + ' ' + @Currency + ' (straight-line)' + CHAR(10) +
      'ROU NBV = ' + FORMAT(@sROUNBV, 'N2') + ' ' + @Currency;

    -- Line 1: Dr Finance Cost
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@pJVId, 1, '51010', 'Finance Cost - Lease Interest (Property)', 'Dr', @sInterest,
            'Interest expense - unwinding of discount (' + @pYYYYmm + ')', @ContractRef, @Currency, @intCalc);

    -- Line 2: Cr Lease Liability
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@pJVId, 2, '21020', 'Lease Liability - Property', 'Cr', @sInterest,
            'Lease liability interest accrual (' + @pYYYYmm + ')', @ContractRef, @Currency, @intCalc);

    -- Line 3: Dr Depreciation
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@pJVId, 3, '52010', 'Depreciation - ROU Property', 'Dr', @sDepr,
            'ROU asset depreciation - straight-line (' + @pYYYYmm + ')', @ContractRef, @Currency, @deprCalc);

    -- Line 4: Cr Accum Depreciation
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@pJVId, 4, '10200', 'Accum. Depreciation - ROU Property', 'Cr', @sDepr,
            'Accumulated depreciation on ROU asset (' + @pYYYYmm + ')', @ContractRef, @Currency, @deprCalc);

    FETCH NEXT FROM sched_cursor INTO @sPeriodDate,
      @sOpenLiab, @sInterest, @sPayment, @sPrincipal, @sCloseLiab, @sDepr, @sROUNBV;
  END

  CLOSE sched_cursor;
  DEALLOCATE sched_cursor;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 14. Update contract with new terms
  -- ══════════════════════════════════════════════════════════════════════════════
  UPDATE lease.contracts
  SET
    monthly_payment          = @NewPayment,
    ibr                      = @NewIBR,
    rou_asset_value          = @NewROUNBV,
    lease_liability_commence = @NewLiability,
    modified_at              = GETUTCDATE()
  WHERE contract_id = @ContractId;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 15. Update modification status
  -- ══════════════════════════════════════════════════════════════════════════════
  UPDATE lease.lease_modifications
  SET
    status      = 'applied',
    je_ref      = @JVNumber,
    approved_by = @ApprovedBy,
    approved_at = GETUTCDATE(),
    applied_at  = GETUTCDATE()
  WHERE modification_id = @ModificationId;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 16. Also post to gl_postings for legacy compatibility
  -- ══════════════════════════════════════════════════════════════════════════════
  DECLARE @JERef NVARCHAR(50) = 'MOD-' + CAST(@ModificationId AS NVARCHAR) + '-' + FORMAT(@ModDate, 'yyyyMMdd');

  IF ABS(@LiabDelta) > 0.01
  BEGIN
    INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
    VALUES (@ContractId, GETUTCDATE(), @ModDate, @JERef, 'Lease Modification - ROU Asset Remeasurement', '1601', 'Right-of-Use Asset',
            CASE WHEN @LiabDelta > 0 THEN 'DR' ELSE 'CR' END, ABS(@LiabDelta), ISNULL(@ApprovedBy, 1), GETUTCDATE(), 'Modification ID: ' + CAST(@ModificationId AS NVARCHAR));

    INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
    VALUES (@ContractId, GETUTCDATE(), @ModDate, @JERef, 'Lease Modification - Lease Liability Remeasurement', '2101', 'Lease Liability',
            CASE WHEN @LiabDelta > 0 THEN 'CR' ELSE 'DR' END, ABS(@LiabDelta), ISNULL(@ApprovedBy, 1), GETUTCDATE(), 'Modification ID: ' + CAST(@ModificationId AS NVARCHAR));
  END

  IF ABS(@GainLoss) > 0.01
  BEGIN
    INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
    VALUES (@ContractId, GETUTCDATE(), @ModDate, @JERef, 'Lease Modification - Remeasurement Gain/Loss', '7201', 'Gain/Loss on Lease Modification',
            CASE WHEN @GainLoss > 0 THEN 'CR' ELSE 'DR' END, ABS(@GainLoss), ISNULL(@ApprovedBy, 1), GETUTCDATE(), 'Modification ID: ' + CAST(@ModificationId AS NVARCHAR));
  END

  COMMIT;

  -- Return result
  SELECT
    @ModificationId  AS modification_id,
    @ContractId      AS contract_id,
    @JVNumber        AS jv_number,
    @JERef           AS je_ref,
    'applied'        AS status,
    @GainLoss        AS remeasurement_gain_loss,
    @NewROUNBV       AS new_rou_nbv,
    @NewLiability    AS new_liability,
    @RemainingMonths AS remaining_months,
    @SeqCounter      AS total_jvs_generated;

  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
  END CATCH
END;
`;

async function main() {
  const pool = await sql.connect(config);
  
  // Split by GO and execute each batch
  const batches = SP_SQL.split(/\nGO\n/);
  for (const batch of batches) {
    const trimmed = batch.trim();
    if (trimmed.length > 0) {
      await pool.request().query(trimmed);
    }
  }
  
  console.log('✅ sp_ApplyLeaseModification rewritten successfully with full JV Register integration');
  pool.close();
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
