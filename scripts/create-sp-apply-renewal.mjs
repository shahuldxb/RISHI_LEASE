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
CREATE OR ALTER PROCEDURE dbo.sp_ApplyRenewal
  @ContractId        INT,
  @NewExpiryDate     DATE,
  @NewMonthlyPayment DECIMAL(18,2),
  @NewIBR            DECIMAL(18,10) = NULL,
  @PostedBy          NVARCHAR(100) = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRY
  BEGIN TRANSACTION;

  -- ═══ RENEWAL (IFRS 16 §19): Same as modification Para 45 but with term extension ═══
  DECLARE @IBR               DECIMAL(18,10),
          @OldExpiryDate     DATE,
          @Currency          NVARCHAR(10),
          @OldMonthlyPayment DECIMAL(18,2),
          @CurrentLiability  DECIMAL(18,2),
          @CurrentRouNBV     DECIMAL(18,2),
          @ContractRef       NVARCHAR(50),
          @RouAssetCost      DECIMAL(18,2);

  SELECT
    @IBR               = ISNULL(@NewIBR, c.ibr),
    @OldExpiryDate     = c.expiry_date,
    @Currency          = c.currency,
    @OldMonthlyPayment = c.monthly_payment,
    @ContractRef       = c.contract_ref,
    @RouAssetCost      = c.rou_asset_value
  FROM lease.contracts c
  WHERE c.contract_id = @ContractId;

  DECLARE @EffectiveDate DATE = CASE 
    WHEN @OldExpiryDate < GETUTCDATE() THEN CAST(GETUTCDATE() AS DATE)
    ELSE @OldExpiryDate
  END;

  -- Get current carrying amounts
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

  -- Calculate new PV over extended term
  DECLARE @NewTotalMonths INT = DATEDIFF(MONTH, @EffectiveDate, @NewExpiryDate);
  IF @NewTotalMonths < 1 SET @NewTotalMonths = 1;

  DECLARE @MonthlyRate DECIMAL(18,10) = @IBR / 12.0;
  DECLARE @NewPV DECIMAL(18,2);
  IF @MonthlyRate = 0
    SET @NewPV = ROUND(@NewMonthlyPayment * @NewTotalMonths, 2)
  ELSE
    SET @NewPV = ROUND(@NewMonthlyPayment * (1 - POWER(1 + @MonthlyRate, -@NewTotalMonths)) / @MonthlyRate, 2);

  DECLARE @LiabilityDelta DECIMAL(18,2) = @NewPV - @CurrentLiability;
  DECLARE @NewRouNBV      DECIMAL(18,2) = @CurrentRouNBV + @LiabilityDelta;
  DECLARE @NewDepr        DECIMAL(18,2) = CASE WHEN @NewTotalMonths > 0 THEN ROUND(@NewRouNBV / @NewTotalMonths, 2) ELSE 0 END;

  -- ═══ STEP 1: Delete future monthly JVs from effective date onwards ═══
  DECLARE @MaxPastSeq INT = 0;
  SELECT @MaxPastSeq = ISNULL(MAX(jv.period_seq), 0)
  FROM accounting.journal_vouchers jv
  WHERE jv.contract_id = @ContractId
    AND jv.jv_type = 'MONTHLY_AMORT'
    AND jv.posting_date < @EffectiveDate;

  DELETE jl FROM accounting.jv_lines jl
  INNER JOIN accounting.journal_vouchers jv ON jl.jv_id = jv.jv_id
  WHERE jv.contract_id = @ContractId
    AND jv.jv_type = 'MONTHLY_AMORT'
    AND jv.posting_date >= @EffectiveDate;

  DELETE FROM accounting.journal_vouchers
  WHERE contract_id = @ContractId
    AND jv_type = 'MONTHLY_AMORT'
    AND posting_date >= @EffectiveDate;

  -- ═══ STEP 2: Insert Renewal JV (JE-7) into journal_vouchers + jv_lines ═══
  DECLARE @JeRef NVARCHAR(50) = 'JE7-' + @ContractRef + '-REN';
  DECLARE @CalcExpl NVARCHAR(MAX) = 
    'RENEWAL (IFRS 16 Para 19/45): Extended term from ' + FORMAT(@OldExpiryDate, 'yyyy-MM-dd') + 
    ' to ' + FORMAT(@NewExpiryDate, 'yyyy-MM-dd') + 
    '. New PV=' + FORMAT(@NewPV, 'N2') + ' (' + CAST(@NewTotalMonths AS NVARCHAR) + ' months @ ' + FORMAT(@IBR*100, 'N4') + '% IBR)' +
    '. Liability Delta=' + FORMAT(@LiabilityDelta, 'N2') + 
    '. New ROU NBV=' + FORMAT(@NewRouNBV, 'N2') +
    '. New Monthly Depr=' + FORMAT(@NewDepr, 'N2');

  DECLARE @NewJvId INT;
  INSERT INTO accounting.journal_vouchers (contract_id, jv_type, jv_number, posting_date, currency, status, description, source_ref, source_type, created_by, period_seq, total_debit, total_credit)
  VALUES (@ContractId, 'LEASE_RENEWAL', @JeRef, @EffectiveDate, @Currency, 'ERP', 
          'Lease Renewal - Extended to ' + FORMAT(@NewExpiryDate, 'yyyy-MM-dd'), @ContractRef, 'RENEWAL', @PostedBy, NULL, @LiabilityDelta, @LiabilityDelta);
  SET @NewJvId = SCOPE_IDENTITY();

  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, calc_explanation)
  VALUES
    (@NewJvId, 1, '1601', 'Right-of-Use Asset', 'Dr', @LiabilityDelta, 'ROU asset increase due to lease renewal', @CalcExpl),
    (@NewJvId, 2, '2101', 'Lease Liability', 'Cr', @LiabilityDelta, 'Lease liability increase due to renewal (extended term PV)', @CalcExpl);

  -- ═══ STEP 3: Regenerate monthly JVs for new extended term ═══
  DECLARE @PeriodSeq INT = @MaxPastSeq + 1;
  DECLARE @PeriodDate DATE = @EffectiveDate;
  DECLARE @Opening DECIMAL(18,2) = @NewPV;
  DECLARE @Interest DECIMAL(18,2), @Principal DECIMAL(18,2), @Closing DECIMAL(18,2);
  DECLARE @LoopRouNBV DECIMAL(18,2) = @NewRouNBV;
  DECLARE @MonthJvId INT;
  DECLARE @MonthRef NVARCHAR(50);
  DECLARE @MonthCalc NVARCHAR(MAX);

  DECLARE @LoopCount INT = 1;
  WHILE @LoopCount <= @NewTotalMonths
  BEGIN
    SET @Interest = ROUND(@Opening * @MonthlyRate, 2);
    SET @Principal = @NewMonthlyPayment - @Interest;
    SET @Closing = @Opening - @Principal;
    IF @Closing < 0 SET @Closing = 0;

    SET @MonthRef = 'JV-' + @ContractRef + '-M' + RIGHT('000' + CAST(@PeriodSeq AS NVARCHAR), 3);
    SET @MonthCalc = 'Period ' + CAST(@PeriodSeq AS NVARCHAR) + ': Opening=' + FORMAT(@Opening, 'N2') +
      ' Interest=' + FORMAT(@Interest, 'N2') + ' Payment=' + FORMAT(@NewMonthlyPayment, 'N2') +
      ' Principal=' + FORMAT(@Principal, 'N2') + ' Closing=' + FORMAT(@Closing, 'N2') +
      ' Depr=' + FORMAT(@NewDepr, 'N2') + ' ROU NBV=' + FORMAT(@LoopRouNBV - @NewDepr, 'N2');

    INSERT INTO accounting.journal_vouchers (contract_id, jv_type, jv_number, posting_date, currency, status, description, source_ref, source_type, created_by, period_seq, total_debit, total_credit)
    VALUES (@ContractId, 'MONTHLY_AMORT', @MonthRef, @PeriodDate, @Currency, 'ERP',
            'Monthly Amortisation #' + CAST(@PeriodSeq AS NVARCHAR) + ' (' + FORMAT(@PeriodDate, 'MMM yyyy') + ')', @ContractRef, 'AMORT', @PostedBy, @PeriodSeq, @Interest + @NewDepr, @Principal + @NewDepr);
    SET @MonthJvId = SCOPE_IDENTITY();

    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, calc_explanation)
    VALUES
      (@MonthJvId, 1, '5101', 'Interest Expense', 'Dr', @Interest, 'Interest expense (' + FORMAT(@PeriodDate, 'MMM yyyy') + ')', @MonthCalc),
      (@MonthJvId, 2, '5201', 'Depreciation Expense', 'Dr', @NewDepr, 'ROU depreciation (' + FORMAT(@PeriodDate, 'MMM yyyy') + ')', @MonthCalc),
      (@MonthJvId, 3, '2101', 'Lease Liability', 'Cr', @Principal, 'Lease liability reduction (' + FORMAT(@PeriodDate, 'MMM yyyy') + ')', @MonthCalc),
      (@MonthJvId, 4, '1601', 'Right-of-Use Asset', 'Cr', @NewDepr, 'ROU asset depreciation (' + FORMAT(@PeriodDate, 'MMM yyyy') + ')', @MonthCalc);

    SET @Opening = @Closing;
    SET @LoopRouNBV = @LoopRouNBV - @NewDepr;
    IF @LoopRouNBV < 0 SET @LoopRouNBV = 0;
    SET @PeriodDate = DATEADD(MONTH, 1, @PeriodDate);
    SET @PeriodSeq = @PeriodSeq + 1;
    SET @LoopCount = @LoopCount + 1;
  END

  -- ═══ STEP 4: Update contract terms ═══
  UPDATE lease.contracts SET
    expiry_date     = @NewExpiryDate,
    monthly_payment = @NewMonthlyPayment,
    ibr             = @IBR,
    term_months     = DATEDIFF(MONTH, commencement_date, @NewExpiryDate),
    lease_liability_commence = @NewPV,
    rou_asset_value = @RouAssetCost + @LiabilityDelta,
    updated_at      = GETUTCDATE()
  WHERE contract_id = @ContractId;

  -- ═══ STEP 5: Record modification history ═══
  INSERT INTO lease.lease_modifications (contract_id, modification_type, modification_date, old_monthly_payment, new_monthly_payment, old_ibr, new_ibr, old_term_end, new_term_end, old_liability, new_liability, old_rou_nbv, new_rou_nbv, remeasurement_gain_loss, je_ref, status, created_by, created_at)
  VALUES (@ContractId, 'RENEWAL', @EffectiveDate, @OldMonthlyPayment, @NewMonthlyPayment, @IBR, @IBR, @OldExpiryDate, @NewExpiryDate, @CurrentLiability, @NewPV, @CurrentRouNBV, @NewRouNBV, 0, @JeRef, 'Applied', @PostedBy, GETUTCDATE());

  COMMIT TRANSACTION;

  SELECT 'OK' AS result, @JeRef AS je_ref, 'Lease Renewal Applied - Extended to ' + FORMAT(@NewExpiryDate, 'yyyy-MM-dd') AS je_label,
         @LiabilityDelta AS liability_delta, @NewTotalMonths AS new_total_months;

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
    console.log('SUCCESS: sp_ApplyRenewal created');
    pool.close();
  } catch(e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
