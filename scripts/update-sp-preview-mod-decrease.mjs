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
CREATE OR ALTER PROCEDURE dbo.sp_PreviewModification
  @ContractId        INT,
  @NewMonthlyPayment DECIMAL(18,2),
  @EffectiveDate     DATE,
  @NewIBR            DECIMAL(18,10) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IBR               DECIMAL(18,10),
          @ExpiryDate        DATE,
          @Currency          NVARCHAR(10),
          @OldMonthlyPayment DECIMAL(18,2),
          @CurrentLiability  DECIMAL(18,2),
          @CurrentRouNBV     DECIMAL(18,2),
          @ContractRef       NVARCHAR(50),
          @RouAssetCost      DECIMAL(18,2),
          @AccumDepr         DECIMAL(18,2);

  SELECT
    @IBR               = ISNULL(@NewIBR, c.ibr),
    @ExpiryDate        = c.expiry_date,
    @Currency          = c.currency,
    @OldMonthlyPayment = c.monthly_payment,
    @ContractRef       = c.contract_ref,
    @RouAssetCost      = c.rou_asset_value
  FROM lease.contracts c
  WHERE c.contract_id = @ContractId;

  -- Get current carrying amounts at effective date
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

  -- Calculate accumulated depreciation
  SET @AccumDepr = @RouAssetCost - @CurrentRouNBV;

  -- Remaining months from effective date
  DECLARE @RemainingMonths INT = DATEDIFF(MONTH, @EffectiveDate, @ExpiryDate);
  IF @RemainingMonths < 1 SET @RemainingMonths = 1;

  -- New PV = PV of new monthly payments over remaining term at new IBR
  DECLARE @MonthlyRate DECIMAL(18,10) = @IBR / 12.0;
  DECLARE @NewPV DECIMAL(18,2);
  IF @MonthlyRate = 0
    SET @NewPV = ROUND(@NewMonthlyPayment * @RemainingMonths, 2)
  ELSE
    SET @NewPV = ROUND(@NewMonthlyPayment * (1 - POWER(1 + @MonthlyRate, -@RemainingMonths)) / @MonthlyRate, 2);

  -- Determine if this is an INCREASE or DECREASE
  DECLARE @LiabilityDelta     DECIMAL(18,2) = @NewPV - @CurrentLiability;
  DECLARE @IsDecrease         BIT = CASE WHEN @LiabilityDelta < 0 THEN 1 ELSE 0 END;
  DECLARE @RouDelta           DECIMAL(18,2);
  DECLARE @NewRouNBV          DECIMAL(18,2);
  DECLARE @RemeasurementGL    DECIMAL(18,2) = 0;
  DECLARE @ProportionalRatio  DECIMAL(18,10) = 0;

  IF @IsDecrease = 0
  BEGIN
    -- RENT INCREASE (IFRS 16 Para 45): Adjust ROU by same amount, no P&L
    SET @RouDelta = @LiabilityDelta;
    SET @NewRouNBV = @CurrentRouNBV + @RouDelta;
  END
  ELSE
  BEGIN
    -- RENT DECREASE (IFRS 16 Para 46(a)): Partial termination
    -- Reduce ROU proportionally, recognize G/L in P&L
    DECLARE @AbsLiabilityDelta DECIMAL(18,2) = ABS(@LiabilityDelta);
    
    -- Proportional ratio = decrease in liability / current liability
    IF @CurrentLiability > 0
      SET @ProportionalRatio = CAST(@AbsLiabilityDelta AS DECIMAL(18,10)) / CAST(@CurrentLiability AS DECIMAL(18,10));
    ELSE
      SET @ProportionalRatio = 1.0;

    -- ROU reduction = proportional share of current ROU NBV
    SET @RouDelta = -ROUND(@CurrentRouNBV * @ProportionalRatio, 2);
    SET @NewRouNBV = @CurrentRouNBV + @RouDelta;  -- RouDelta is negative
    
    -- Gain/Loss = Liability decrease - ROU decrease (both as positive amounts)
    -- If Liability decrease > ROU decrease => Gain (positive)
    -- If Liability decrease < ROU decrease => Loss (negative)
    SET @RemeasurementGL = @AbsLiabilityDelta - ABS(@RouDelta);
    
    -- Ensure ROU doesn't go negative
    IF @NewRouNBV < 0
    BEGIN
      SET @RemeasurementGL = @RemeasurementGL + ABS(@NewRouNBV);
      SET @RouDelta = -@CurrentRouNBV;
      SET @NewRouNBV = 0;
    END
  END

  -- Build new amortisation schedule preview (ALL remaining periods)
  DECLARE @PreviewPeriod INT = 1;
  DECLARE @PreviewOpening DECIMAL(18,2) = @NewPV;
  DECLARE @PreviewRows TABLE (
    period_no INT, period_date DATE,
    opening_liability DECIMAL(18,2), interest_expense DECIMAL(18,2),
    payment DECIMAL(18,2), principal DECIMAL(18,2), closing_liability DECIMAL(18,2),
    rou_nbv DECIMAL(18,2), depreciation DECIMAL(18,2)
  );
  DECLARE @PreviewRouNBV DECIMAL(18,2) = @NewRouNBV;
  DECLARE @PreviewDepr   DECIMAL(18,2) = CASE WHEN @RemainingMonths > 0 THEN ROUND(@NewRouNBV / @RemainingMonths, 2) ELSE 0 END;
  DECLARE @PreviewInterest  DECIMAL(18,2);
  DECLARE @PreviewPrincipal DECIMAL(18,2);
  DECLARE @PreviewClosing   DECIMAL(18,2);
  DECLARE @PreviewRouRow    DECIMAL(18,2);

  WHILE @PreviewPeriod <= @RemainingMonths
  BEGIN
    SET @PreviewInterest = ROUND(@PreviewOpening * @MonthlyRate, 2);
    SET @PreviewPrincipal = @NewMonthlyPayment - @PreviewInterest;
    SET @PreviewClosing = @PreviewOpening - @PreviewPrincipal;
    IF @PreviewClosing < 0 SET @PreviewClosing = 0;
    SET @PreviewRouRow = @PreviewRouNBV - @PreviewDepr;
    IF @PreviewRouRow < 0 SET @PreviewRouRow = 0;

    INSERT INTO @PreviewRows VALUES (
      @PreviewPeriod,
      DATEADD(MONTH, @PreviewPeriod - 1, @EffectiveDate),
      @PreviewOpening, @PreviewInterest,
      @NewMonthlyPayment, @PreviewPrincipal, @PreviewClosing,
      @PreviewRouNBV, @PreviewDepr
    );

    SET @PreviewOpening = @PreviewClosing;
    SET @PreviewRouNBV  = @PreviewRouRow;
    SET @PreviewPeriod  = @PreviewPeriod + 1;
  END

  -- Result set 1: Summary
  SELECT
    @ContractId          AS contract_id,
    @ContractRef         AS contract_ref,
    @OldMonthlyPayment   AS old_monthly_payment,
    @NewMonthlyPayment   AS new_monthly_payment,
    @EffectiveDate       AS effective_date,
    @IBR                 AS ibr_used,
    @RemainingMonths     AS remaining_months,
    @CurrentLiability    AS current_liability,
    @NewPV               AS new_pv,
    @LiabilityDelta      AS liability_delta,
    @CurrentRouNBV       AS current_rou_nbv,
    @NewRouNBV           AS new_rou_nbv,
    @RouDelta            AS rou_delta,
    @RemeasurementGL     AS remeasurement_gain_loss,
    @Currency            AS currency,
    @IsDecrease          AS is_decrease,
    @ProportionalRatio   AS proportional_ratio,
    @AccumDepr           AS accum_depr,
    @RouAssetCost        AS rou_asset_cost;

  -- Result set 2: JE-4 preview lines
  IF @IsDecrease = 0
  BEGIN
    -- RENT INCREASE: Simple 2-line entry (Dr ROU / Cr Liability)
    SELECT line_no, account_code, account_name, dr_cr, amount, description FROM (
      SELECT 1 AS line_no, '1601' AS account_code, 'Right-of-Use Asset' AS account_name,
        'Dr' AS dr_cr, @LiabilityDelta AS amount, 'Adjusted ROU asset carrying amount' AS description
      UNION ALL
      SELECT 2, '2101', 'Lease Liability', 'Cr', @LiabilityDelta, 'Remeasured lease liability'
    ) je ORDER BY line_no;
  END
  ELSE
  BEGIN
    -- RENT DECREASE: 4-line entry (Dr Liability, Dr Accum Depr proportional, Cr ROU at proportional cost, Cr/Dr G/L)
    DECLARE @ProportionalAccumDepr DECIMAL(18,2) = ROUND(@AccumDepr * @ProportionalRatio, 2);
    DECLARE @ProportionalRouCost   DECIMAL(18,2) = ABS(@RouDelta) + @ProportionalAccumDepr;

    SELECT line_no, account_code, account_name, dr_cr, amount, description FROM (
      SELECT 1 AS line_no, '2101' AS account_code, 'Lease Liability' AS account_name,
        'Dr' AS dr_cr, ABS(@LiabilityDelta) AS amount, 'Derecognise lease liability (partial)' AS description
      UNION ALL
      SELECT 2, '10200', 'Accum. Depreciation - ROU Property',
        'Dr', @ProportionalAccumDepr, 'Derecognise accumulated depreciation (proportional)'
      UNION ALL
      SELECT 3, '1601', 'Right-of-Use Asset',
        'Cr', @ProportionalRouCost, 'Derecognise ROU asset (proportional cost)'
      UNION ALL
      SELECT 4, '7201', 'Gain/Loss on Lease Modification',
        CASE WHEN @RemeasurementGL >= 0 THEN 'Cr' ELSE 'Dr' END,
        ABS(@RemeasurementGL), 
        CASE WHEN @RemeasurementGL >= 0 THEN 'Gain on partial termination' ELSE 'Loss on partial termination' END
    ) je ORDER BY line_no;
  END

  -- Result set 3: Schedule preview
  SELECT * FROM @PreviewRows ORDER BY period_no;
END
`;

(async () => {
  try {
    const pool = await sql.connect(config);
    await pool.request().query(spDef);
    console.log('SUCCESS: sp_PreviewModification updated with rent decrease (partial termination) logic');
    pool.close();
  } catch(e) {
    console.error('ERROR:', e.message);
  }
})();
