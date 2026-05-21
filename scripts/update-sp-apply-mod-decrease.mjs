import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: true, trustServerCertificate: true, connectTimeout: 120000, requestTimeout: 120000 }
};

const spDef = `
CREATE OR ALTER PROCEDURE dbo.sp_ApplyLeaseModification
  @ModificationId INT,
  @ApprovedBy     NVARCHAR(100) = 'system'
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRY
  BEGIN TRANSACTION;

  -- 1. Load modification details
  DECLARE @ContractId        INT,
          @NewMonthlyPayment DECIMAL(18,2),
          @EffectiveDate     DATE,
          @NewIBR            DECIMAL(18,10),
          @Notes             NVARCHAR(500);

  SELECT
    @ContractId        = contract_id,
    @NewMonthlyPayment = new_monthly_payment,
    @EffectiveDate     = modification_date,
    @NewIBR            = new_ibr,
    @Notes             = notes
  FROM lease.lease_modifications
  WHERE modification_id = @ModificationId AND status = 'pending';

  IF @ContractId IS NULL
  BEGIN
    RAISERROR('Modification not found or already applied', 16, 1);
    RETURN;
  END

  -- 2. Load current contract data
  DECLARE @IBR               DECIMAL(18,10),
          @ExpiryDate        DATE,
          @Currency          NVARCHAR(10),
          @OldMonthlyPayment DECIMAL(18,2),
          @ContractRef       NVARCHAR(50),
          @RouAssetCost      DECIMAL(18,2),
          @LesseeId          INT,
          @MakerId           NVARCHAR(100);

  SELECT
    @IBR               = ISNULL(@NewIBR, c.ibr),
    @ExpiryDate        = c.expiry_date,
    @Currency          = c.currency,
    @OldMonthlyPayment = c.monthly_payment,
    @ContractRef       = c.contract_ref,
    @RouAssetCost      = c.rou_asset_value,
    @LesseeId          = c.lessee_id,
    @MakerId           = c.maker_id
  FROM lease.contracts c
  WHERE c.contract_id = @ContractId;

  -- 3. Get current carrying amounts at effective date
  DECLARE @CurrentLiability DECIMAL(18,2),
          @CurrentRouNBV    DECIMAL(18,2);

  SELECT TOP 1
    @CurrentLiability = closing_liability,
    @CurrentRouNBV    = rou_nbv
  FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId
    AND period_date <= @EffectiveDate
  ORDER BY period_date DESC;

  IF @CurrentLiability IS NULL
    SELECT @CurrentLiability = lease_liability_commence, @CurrentRouNBV = rou_asset_value
    FROM lease.contracts WHERE contract_id = @ContractId;

  DECLARE @AccumDepr DECIMAL(18,2) = @RouAssetCost - @CurrentRouNBV;

  -- 4. Calculate remaining months and new PV
  DECLARE @RemainingMonths INT = DATEDIFF(MONTH, @EffectiveDate, @ExpiryDate);
  IF @RemainingMonths < 1 SET @RemainingMonths = 1;

  DECLARE @MonthlyRate DECIMAL(18,10) = @IBR / 12.0;
  DECLARE @NewPV DECIMAL(18,2);
  IF @MonthlyRate = 0
    SET @NewPV = ROUND(@NewMonthlyPayment * @RemainingMonths, 2)
  ELSE
    SET @NewPV = ROUND(@NewMonthlyPayment * (1 - POWER(1 + @MonthlyRate, -@RemainingMonths)) / @MonthlyRate, 2);

  -- 5. Determine increase vs decrease
  DECLARE @LiabilityDelta     DECIMAL(18,2) = @NewPV - @CurrentLiability;
  DECLARE @IsDecrease         BIT = CASE WHEN @LiabilityDelta < 0 THEN 1 ELSE 0 END;
  DECLARE @RouDelta           DECIMAL(18,2);
  DECLARE @NewRouNBV          DECIMAL(18,2);
  DECLARE @RemeasurementGL    DECIMAL(18,2) = 0;
  DECLARE @ProportionalRatio  DECIMAL(18,10) = 0;

  IF @IsDecrease = 0
  BEGIN
    -- RENT INCREASE: Adjust ROU by same amount, no P&L
    SET @RouDelta = @LiabilityDelta;
    SET @NewRouNBV = @CurrentRouNBV + @RouDelta;
  END
  ELSE
  BEGIN
    -- RENT DECREASE: Partial termination
    DECLARE @AbsLiabilityDelta DECIMAL(18,2) = ABS(@LiabilityDelta);
    IF @CurrentLiability > 0
      SET @ProportionalRatio = CAST(@AbsLiabilityDelta AS DECIMAL(18,10)) / CAST(@CurrentLiability AS DECIMAL(18,10));
    ELSE
      SET @ProportionalRatio = 1.0;

    SET @RouDelta = -ROUND(@CurrentRouNBV * @ProportionalRatio, 2);
    SET @NewRouNBV = @CurrentRouNBV + @RouDelta;
    SET @RemeasurementGL = @AbsLiabilityDelta - ABS(@RouDelta);

    IF @NewRouNBV < 0
    BEGIN
      SET @RemeasurementGL = @RemeasurementGL + ABS(@NewRouNBV);
      SET @RouDelta = -@CurrentRouNBV;
      SET @NewRouNBV = 0;
    END
  END

  -- 6. Delete future monthly JVs from effective date onwards
  DECLARE @LastKeptSeq INT = 0;
  SELECT @LastKeptSeq = ISNULL(MAX(period_seq), 0)
  FROM accounting.journal_vouchers
  WHERE contract_id = @ContractId
    AND jv_type = 'MONTHLY_AMORT'
    AND period_year * 100 + period_month < YEAR(@EffectiveDate) * 100 + MONTH(@EffectiveDate);

  -- Delete jv_lines first (FK), then journal_vouchers
  DELETE l FROM accounting.jv_lines l
  INNER JOIN accounting.journal_vouchers j ON l.jv_id = j.jv_id
  WHERE j.contract_id = @ContractId
    AND j.jv_type = 'MONTHLY_AMORT'
    AND (j.period_year * 100 + j.period_month) >= (YEAR(@EffectiveDate) * 100 + MONTH(@EffectiveDate));

  DELETE FROM accounting.journal_vouchers
  WHERE contract_id = @ContractId
    AND jv_type = 'MONTHLY_AMORT'
    AND (period_year * 100 + period_month) >= (YEAR(@EffectiveDate) * 100 + MONTH(@EffectiveDate));

  -- 7. Insert Remeasurement JV (JE-4) into journal_vouchers
  DECLARE @JvNumber NVARCHAR(30);
  DECLARE @PeriodYear INT = YEAR(@EffectiveDate);
  DECLARE @PeriodMonth INT = MONTH(@EffectiveDate);
  SET @JvNumber = 'JV-' + FORMAT(@EffectiveDate, 'yyyyMM') + '-MOD';

  DECLARE @ModJvId INT;
  INSERT INTO accounting.journal_vouchers (
    jv_number, jv_type, contract_id, source_ref, period_year, period_month,
    posting_date, created_at, currency, status, notes, staff_id
  ) VALUES (
    @JvNumber,
    CASE WHEN @IsDecrease = 1 THEN 'LEASE_MOD_DECREASE' ELSE 'LEASE_MOD_INCREASE' END,
    @ContractId, @ContractRef, @PeriodYear, @PeriodMonth,
    @EffectiveDate, GETUTCDATE(), @Currency, 'Posted', @Notes, @MakerId
  );
  SET @ModJvId = SCOPE_IDENTITY();

  -- 8. Insert JV lines for the modification entry
  DECLARE @CalcExpl NVARCHAR(MAX);

  IF @IsDecrease = 0
  BEGIN
    -- RENT INCREASE: 2 lines
    SET @CalcExpl = 'IFRS 16 Para 45 Remeasurement (Increase)' + CHAR(10)
      + 'New Monthly Payment: ' + FORMAT(@NewMonthlyPayment, 'N2') + CHAR(10)
      + 'Remaining Months: ' + CAST(@RemainingMonths AS NVARCHAR) + CHAR(10)
      + 'IBR (annual): ' + FORMAT(@IBR * 100, 'N4') + '%' + CHAR(10)
      + 'New PV = ' + FORMAT(@NewMonthlyPayment, 'N2') + ' x [(1-(1+' + FORMAT(@MonthlyRate, 'N6') + ')^-' + CAST(@RemainingMonths AS NVARCHAR) + ') / ' + FORMAT(@MonthlyRate, 'N6') + '] = ' + FORMAT(@NewPV, 'N2') + CHAR(10)
      + 'Liability Delta = ' + FORMAT(@NewPV, 'N2') + ' - ' + FORMAT(@CurrentLiability, 'N2') + ' = ' + FORMAT(@LiabilityDelta, 'N2') + CHAR(10)
      + 'ROU Delta = Liability Delta = ' + FORMAT(@LiabilityDelta, 'N2') + ' (no P&L impact)';

    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, calc_explanation)
    VALUES
      (@ModJvId, 1, '1601', 'Right-of-Use Asset', 'Dr', @LiabilityDelta, 'Adjusted ROU asset carrying amount', @CalcExpl),
      (@ModJvId, 2, '2101', 'Lease Liability', 'Cr', @LiabilityDelta, 'Remeasured lease liability', @CalcExpl);
  END
  ELSE
  BEGIN
    -- RENT DECREASE: 4 lines (partial termination)
    DECLARE @ProportionalAccumDepr DECIMAL(18,2) = ROUND(@AccumDepr * @ProportionalRatio, 2);
    DECLARE @ProportionalRouCost   DECIMAL(18,2) = ABS(@RouDelta) + @ProportionalAccumDepr;

    SET @CalcExpl = 'IFRS 16 Para 46(a) Partial Termination (Decrease)' + CHAR(10)
      + 'New Monthly Payment: ' + FORMAT(@NewMonthlyPayment, 'N2') + CHAR(10)
      + 'Remaining Months: ' + CAST(@RemainingMonths AS NVARCHAR) + CHAR(10)
      + 'IBR (annual): ' + FORMAT(@IBR * 100, 'N4') + '%' + CHAR(10)
      + 'New PV = ' + FORMAT(@NewPV, 'N2') + CHAR(10)
      + 'Liability Decrease = ' + FORMAT(@CurrentLiability, 'N2') + ' - ' + FORMAT(@NewPV, 'N2') + ' = ' + FORMAT(ABS(@LiabilityDelta), 'N2') + CHAR(10)
      + 'Proportional Ratio = ' + FORMAT(ABS(@LiabilityDelta), 'N2') + ' / ' + FORMAT(@CurrentLiability, 'N2') + ' = ' + FORMAT(@ProportionalRatio * 100, 'N4') + '%' + CHAR(10)
      + 'ROU Reduction = ' + FORMAT(@CurrentRouNBV, 'N2') + ' x ' + FORMAT(@ProportionalRatio * 100, 'N4') + '% = ' + FORMAT(ABS(@RouDelta), 'N2') + CHAR(10)
      + 'Gain/Loss = Liability Decrease - ROU Reduction = ' + FORMAT(ABS(@LiabilityDelta), 'N2') + ' - ' + FORMAT(ABS(@RouDelta), 'N2') + ' = ' + FORMAT(@RemeasurementGL, 'N2');

    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, calc_explanation)
    VALUES
      (@ModJvId, 1, '2101', 'Lease Liability', 'Dr', ABS(@LiabilityDelta), 'Derecognise lease liability (partial)', @CalcExpl),
      (@ModJvId, 2, '10200', 'Accum. Depreciation - ROU Property', 'Dr', @ProportionalAccumDepr, 'Derecognise accumulated depreciation (proportional)', @CalcExpl),
      (@ModJvId, 3, '1601', 'Right-of-Use Asset', 'Cr', @ProportionalRouCost, 'Derecognise ROU asset (proportional cost)', @CalcExpl),
      (@ModJvId, 4, '7201', 'Gain/Loss on Lease Modification',
        CASE WHEN @RemeasurementGL >= 0 THEN 'Cr' ELSE 'Dr' END,
        ABS(@RemeasurementGL),
        CASE WHEN @RemeasurementGL >= 0 THEN 'Gain on partial termination' ELSE 'Loss on partial termination' END,
        @CalcExpl);
  END

  -- 9. Delete old amortisation schedule from effective date onwards
  DELETE FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId
    AND period_date >= @EffectiveDate;

  -- 10. Regenerate new amortisation schedule
  DECLARE @Period INT = 1;
  DECLARE @Opening DECIMAL(18,2) = @NewPV;
  DECLARE @RouNBVLoop DECIMAL(18,2) = @NewRouNBV;
  DECLARE @Depr DECIMAL(18,2) = CASE WHEN @RemainingMonths > 0 THEN ROUND(@NewRouNBV / @RemainingMonths, 2) ELSE 0 END;
  DECLARE @Interest DECIMAL(18,2);
  DECLARE @Principal DECIMAL(18,2);
  DECLARE @Closing DECIMAL(18,2);
  DECLARE @PeriodDate DATE;

  WHILE @Period <= @RemainingMonths
  BEGIN
    SET @PeriodDate = DATEADD(MONTH, @Period - 1, @EffectiveDate);
    SET @Interest = ROUND(@Opening * @MonthlyRate, 2);
    SET @Principal = @NewMonthlyPayment - @Interest;
    SET @Closing = @Opening - @Principal;
    IF @Closing < 0 SET @Closing = 0;

    INSERT INTO lease.amortisation_schedule (
      contract_id, period_date, opening_liability, interest_expense,
      payment, principal, closing_liability, rou_nbv, depreciation
    ) VALUES (
      @ContractId, @PeriodDate, @Opening, @Interest,
      @NewMonthlyPayment, @Principal, @Closing, @RouNBVLoop, @Depr
    );

    SET @Opening = @Closing;
    SET @RouNBVLoop = @RouNBVLoop - @Depr;
    IF @RouNBVLoop < 0 SET @RouNBVLoop = 0;
    SET @Period = @Period + 1;
  END

  -- 11. Generate new monthly amortisation JVs
  DECLARE @Seq INT = @LastKeptSeq;
  DECLARE @LoopPeriod INT = 1;
  DECLARE @LoopDate DATE;
  DECLARE @LoopYear INT;
  DECLARE @LoopMonth INT;
  DECLARE @LoopJvNumber NVARCHAR(30);
  DECLARE @LoopJvId INT;
  DECLARE @LoopInterest DECIMAL(18,2);
  DECLARE @LoopDepr DECIMAL(18,2);
  DECLARE @LoopCalcInt NVARCHAR(MAX);
  DECLARE @LoopCalcDep NVARCHAR(MAX);
  DECLARE @LoopOpening DECIMAL(18,2);
  DECLARE @LoopRouNBV DECIMAL(18,2);

  -- Re-read the new schedule for generating JVs
  DECLARE @SchedCursor CURSOR;
  SET @SchedCursor = CURSOR FOR
    SELECT period_date, opening_liability, interest_expense, depreciation, rou_nbv
    FROM lease.amortisation_schedule
    WHERE contract_id = @ContractId AND period_date >= @EffectiveDate
    ORDER BY period_date;

  OPEN @SchedCursor;
  FETCH NEXT FROM @SchedCursor INTO @LoopDate, @LoopOpening, @LoopInterest, @LoopDepr, @LoopRouNBV;

  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @Seq = @Seq + 1;
    SET @LoopYear = YEAR(@LoopDate);
    SET @LoopMonth = MONTH(@LoopDate);
    SET @LoopJvNumber = 'JV-' + FORMAT(@LoopDate, 'yyyyMM') + '-' + RIGHT('00000' + CAST(@Seq AS NVARCHAR), 5);

    INSERT INTO accounting.journal_vouchers (
      jv_number, jv_type, contract_id, source_ref, period_year, period_month,
      posting_date, created_at, currency, status, staff_id, period_seq
    ) VALUES (
      @LoopJvNumber, 'MONTHLY_AMORT', @ContractId, @ContractRef,
      @LoopYear, @LoopMonth, EOMONTH(@LoopDate), GETUTCDATE(),
      @Currency, 'Posted', @MakerId, @Seq
    );
    SET @LoopJvId = SCOPE_IDENTITY();

    -- Calc explanations
    SET @LoopCalcInt = 'Interest = Opening Liability x (IBR/12)' + CHAR(10)
      + '= ' + FORMAT(@LoopOpening, 'N2') + ' x (' + FORMAT(@IBR, 'N6') + '/12)' + CHAR(10)
      + '= ' + FORMAT(@LoopOpening, 'N2') + ' x ' + FORMAT(@MonthlyRate, 'N6') + CHAR(10)
      + '= ' + FORMAT(@LoopInterest, 'N2');

    SET @LoopCalcDep = 'Depreciation = New ROU NBV / Remaining Months' + CHAR(10)
      + '= ' + FORMAT(@NewRouNBV, 'N2') + ' / ' + CAST(@RemainingMonths AS NVARCHAR) + CHAR(10)
      + '= ' + FORMAT(@Depr, 'N2') + ' per month';

    -- 4 JV lines per monthly amort: Interest Dr, Liability Cr, Depreciation Dr, Accum Depr Cr
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, calc_explanation)
    VALUES
      (@LoopJvId, 1, '51010', 'Finance Cost - Lease Interest (Property)', 'Dr', @LoopInterest, 'Interest expense - unwinding of discount (' + FORMAT(@LoopDate, 'yyyyMM') + ')', @LoopCalcInt),
      (@LoopJvId, 2, '21020', 'Lease Liability - Property', 'Cr', @LoopInterest, 'Lease liability interest accrual (' + FORMAT(@LoopDate, 'yyyyMM') + ')', @LoopCalcInt),
      (@LoopJvId, 3, '52010', 'Depreciation - ROU Property', 'Dr', @LoopDepr, 'ROU asset depreciation - straight-line (' + FORMAT(@LoopDate, 'yyyyMM') + ')', @LoopCalcDep),
      (@LoopJvId, 4, '10200', 'Accum. Depreciation - ROU Property', 'Cr', @LoopDepr, 'Accumulated depreciation on ROU asset (' + FORMAT(@LoopDate, 'yyyyMM') + ')', @LoopCalcDep);

    FETCH NEXT FROM @SchedCursor INTO @LoopDate, @LoopOpening, @LoopInterest, @LoopDepr, @LoopRouNBV;
  END

  CLOSE @SchedCursor;
  DEALLOCATE @SchedCursor;

  -- 12. Update contract with new terms
  UPDATE lease.contracts SET
    monthly_payment         = @NewMonthlyPayment,
    ibr                     = @IBR,
    rou_asset_value         = CASE WHEN @IsDecrease = 0 THEN @RouAssetCost + @LiabilityDelta ELSE @RouAssetCost - ROUND(@AccumDepr * @ProportionalRatio, 2) - ABS(@RouDelta) END,
    lease_liability_commence = @NewPV
  WHERE contract_id = @ContractId;

  -- 13. Update modification status
  UPDATE lease.lease_modifications SET
    status      = 'applied',
    applied_at  = GETUTCDATE(),
    approved_by = @ApprovedBy
  WHERE modification_id = @ModificationId;

  -- 14. Post to gl_postings for legacy compatibility
  INSERT INTO lease.gl_postings (contract_id, posting_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at)
  SELECT @ContractId, @EffectiveDate, @JvNumber,
    CASE WHEN @IsDecrease = 1 THEN 'MODIFICATION_DECREASE' ELSE 'MODIFICATION_INCREASE' END,
    account_code, account_name, dr_cr, amount, @ApprovedBy, GETUTCDATE()
  FROM accounting.jv_lines WHERE jv_id = @ModJvId;

  COMMIT TRANSACTION;

  -- Return success
  SELECT 'SUCCESS' AS result, @ModJvId AS modification_jv_id, @Seq AS total_monthly_jvs,
    @IsDecrease AS is_decrease, @RemeasurementGL AS gain_loss;

  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END
`;

(async () => {
  try {
    const pool = await sql.connect(config);
    await pool.request().query(spDef);
    console.log('SUCCESS: sp_ApplyLeaseModification updated with rent decrease (partial termination) logic');
    pool.close();
  } catch(e) {
    console.error('ERROR:', e.message);
  }
})();
