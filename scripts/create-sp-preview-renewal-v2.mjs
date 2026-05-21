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
CREATE OR ALTER PROCEDURE dbo.sp_PreviewRenewal_v2
  @ContractId        INT,
  @NewExpiryDate     DATE,
  @NewMonthlyPayment DECIMAL(18,2),
  @NewIBR            DECIMAL(18,10) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  -- ═══ RENEWAL (IFRS 16 §19): Extends lease term, increases liability & ROU ═══
  -- Treatment: Same as lease modification (Para 45) but with term extension
  -- JE-7: Dr ROU Asset / Cr Lease Liability (for the increase in PV due to extended term)

  DECLARE @IBR               DECIMAL(18,10),
          @OldExpiryDate     DATE,
          @Currency          NVARCHAR(10),
          @OldMonthlyPayment DECIMAL(18,2),
          @CurrentLiability  DECIMAL(18,2),
          @CurrentRouNBV     DECIMAL(18,2),
          @ContractRef       NVARCHAR(50),
          @RouAssetCost      DECIMAL(18,2),
          @CommenceDate      DATE;

  SELECT
    @IBR               = ISNULL(@NewIBR, c.ibr),
    @OldExpiryDate     = c.expiry_date,
    @Currency          = c.currency,
    @OldMonthlyPayment = c.monthly_payment,
    @ContractRef       = c.contract_ref,
    @RouAssetCost      = c.rou_asset_value,
    @CommenceDate      = c.commencement_date
  FROM lease.contracts c
  WHERE c.contract_id = @ContractId;

  -- Effective date for renewal = day after old expiry (or today if already past)
  DECLARE @EffectiveDate DATE = CASE 
    WHEN @OldExpiryDate < GETUTCDATE() THEN CAST(GETUTCDATE() AS DATE)
    ELSE @OldExpiryDate
  END;

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

  -- Calculate new total remaining months (from effective date to NEW expiry)
  DECLARE @NewTotalMonths INT = DATEDIFF(MONTH, @EffectiveDate, @NewExpiryDate);
  IF @NewTotalMonths < 1 SET @NewTotalMonths = 1;

  -- Old remaining months (from effective date to OLD expiry)
  DECLARE @OldRemainingMonths INT = DATEDIFF(MONTH, @EffectiveDate, @OldExpiryDate);
  IF @OldRemainingMonths < 0 SET @OldRemainingMonths = 0;

  -- Extension months
  DECLARE @ExtensionMonths INT = @NewTotalMonths - @OldRemainingMonths;

  -- New PV = PV of new monthly payments over NEW total remaining term at IBR
  DECLARE @MonthlyRate DECIMAL(18,10) = @IBR / 12.0;
  DECLARE @NewPV DECIMAL(18,2);
  IF @MonthlyRate = 0
    SET @NewPV = ROUND(@NewMonthlyPayment * @NewTotalMonths, 2)
  ELSE
    SET @NewPV = ROUND(@NewMonthlyPayment * (1 - POWER(1 + @MonthlyRate, -@NewTotalMonths)) / @MonthlyRate, 2);

  -- Liability Delta = New PV - Current Liability (should be positive for renewal)
  DECLARE @LiabilityDelta DECIMAL(18,2) = @NewPV - @CurrentLiability;

  -- For renewal (IFRS 16 Para 45): ROU adjustment = Liability Delta (no P&L)
  DECLARE @RouDelta  DECIMAL(18,2) = @LiabilityDelta;
  DECLARE @NewRouNBV DECIMAL(18,2) = @CurrentRouNBV + @RouDelta;

  -- New depreciation over new total remaining months
  DECLARE @NewDepr DECIMAL(18,2) = CASE WHEN @NewTotalMonths > 0 THEN ROUND(@NewRouNBV / @NewTotalMonths, 2) ELSE 0 END;

  -- Build new amortisation schedule preview
  DECLARE @PreviewPeriod INT = 1;
  DECLARE @PreviewOpening DECIMAL(18,2) = @NewPV;
  DECLARE @PreviewRows TABLE (
    period_no INT, period_date DATE,
    opening_liability DECIMAL(18,2), interest_expense DECIMAL(18,2),
    payment DECIMAL(18,2), principal DECIMAL(18,2), closing_liability DECIMAL(18,2),
    rou_nbv DECIMAL(18,2), depreciation DECIMAL(18,2)
  );
  DECLARE @PreviewRouNBV DECIMAL(18,2) = @NewRouNBV;
  DECLARE @PreviewDepr   DECIMAL(18,2) = @NewDepr;
  DECLARE @PreviewInterest  DECIMAL(18,2);
  DECLARE @PreviewPrincipal DECIMAL(18,2);
  DECLARE @PreviewClosing   DECIMAL(18,2);
  DECLARE @PreviewRouRow    DECIMAL(18,2);

  WHILE @PreviewPeriod <= @NewTotalMonths
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
    @OldExpiryDate       AS old_expiry_date,
    @NewExpiryDate       AS new_expiry_date,
    @EffectiveDate       AS effective_date,
    @IBR                 AS ibr_used,
    @OldRemainingMonths  AS old_remaining_months,
    @NewTotalMonths      AS new_total_months,
    @ExtensionMonths     AS extension_months,
    @CurrentLiability    AS current_liability,
    @NewPV               AS new_pv,
    @LiabilityDelta      AS liability_delta,
    @CurrentRouNBV       AS current_rou_nbv,
    @NewRouNBV           AS new_rou_nbv,
    @RouDelta            AS rou_delta,
    @NewDepr             AS new_monthly_depreciation,
    @Currency            AS currency;

  -- Result set 2: JE-7 lines (Dr ROU / Cr Liability — same as Para 45 increase)
  SELECT line_no, account_code, account_name, dr_cr, amount, description FROM (
    SELECT 1 AS line_no, '1601' AS account_code, 'Right-of-Use Asset' AS account_name,
      'Dr' AS dr_cr, @LiabilityDelta AS amount, 'ROU asset increase due to lease renewal (extended term)' AS description
    UNION ALL
    SELECT 2, '2101', 'Lease Liability', 'Cr', @LiabilityDelta, 'Lease liability increase due to renewal (extended term PV)'
  ) je ORDER BY line_no;

  -- Result set 3: Schedule preview
  SELECT * FROM @PreviewRows ORDER BY period_no;
END
`;

(async () => {
  try {
    const pool = await sql.connect(config);
    await pool.request().query(spDef);
    console.log('SUCCESS: sp_PreviewRenewal_v2 created');
    pool.close();
  } catch(e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
