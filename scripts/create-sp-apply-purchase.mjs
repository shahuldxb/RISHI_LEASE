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
CREATE OR ALTER PROCEDURE dbo.sp_ApplyPurchase
  @ContractId     INT,
  @PurchaseDate   DATE,
  @PurchasePrice  DECIMAL(18,2),
  @PostedBy       NVARCHAR(100) = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRY
  BEGIN TRANSACTION;

  -- ═══ PURCHASE OPTION EXERCISE (IFRS 16 §26) ═══
  DECLARE @Currency          NVARCHAR(10),
          @CurrentLiability  DECIMAL(18,2),
          @CurrentRouNBV     DECIMAL(18,2),
          @ContractRef       NVARCHAR(50),
          @RouAssetCost      DECIMAL(18,2),
          @AccumDepr         DECIMAL(18,2);

  SELECT
    @Currency      = c.currency,
    @ContractRef   = c.contract_ref,
    @RouAssetCost  = c.rou_asset_value
  FROM lease.contracts c
  WHERE c.contract_id = @ContractId;

  SELECT TOP 1
    @CurrentLiability = closing_liability,
    @CurrentRouNBV    = rou_nbv
  FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId
    AND period_date <= @PurchaseDate
  ORDER BY period_date DESC;

  IF @CurrentLiability IS NULL
    SELECT @CurrentLiability = lease_liability_commence, @CurrentRouNBV = rou_asset_value
    FROM lease.contracts WHERE contract_id = @ContractId;

  SET @AccumDepr = @RouAssetCost - @CurrentRouNBV;

  DECLARE @OwnedAssetValue DECIMAL(18,2) = @CurrentRouNBV;
  DECLARE @GainLoss DECIMAL(18,2) = @CurrentLiability - @PurchasePrice;

  -- ═══ STEP 1: Delete future monthly JVs ═══
  DELETE jl FROM accounting.jv_lines jl
  INNER JOIN accounting.journal_vouchers jv ON jl.jv_id = jv.jv_id
  WHERE jv.contract_id = @ContractId
    AND jv.jv_type = 'MONTHLY_AMORT'
    AND jv.posting_date >= @PurchaseDate;

  DELETE FROM accounting.journal_vouchers
  WHERE contract_id = @ContractId
    AND jv_type = 'MONTHLY_AMORT'
    AND posting_date >= @PurchaseDate;

  -- ═══ STEP 2: Insert Purchase JV ═══
  DECLARE @JeRef NVARCHAR(50) = 'JE-PUR-' + @ContractRef;
  DECLARE @CalcExpl NVARCHAR(MAX) = 
    'PURCHASE OPTION (IFRS 16 Para 26): Exercised purchase at ' + FORMAT(@PurchasePrice, 'N2') + ' ' + @Currency +
    '. Liability derecognised=' + FORMAT(@CurrentLiability, 'N2') +
    '. ROU Cost=' + FORMAT(@RouAssetCost, 'N2') + ' AccumDepr=' + FORMAT(@AccumDepr, 'N2') + ' NBV=' + FORMAT(@CurrentRouNBV, 'N2') +
    '. Owned asset recognised at=' + FORMAT(@OwnedAssetValue, 'N2') +
    '. Gain/Loss=' + FORMAT(@GainLoss, 'N2');

  DECLARE @TotalDr DECIMAL(18,2) = @OwnedAssetValue + @AccumDepr + @CurrentLiability + CASE WHEN @GainLoss < 0 THEN ABS(@GainLoss) ELSE 0 END;
  DECLARE @TotalCr DECIMAL(18,2) = @RouAssetCost + @PurchasePrice + CASE WHEN @GainLoss >= 0 THEN @GainLoss ELSE 0 END;

  DECLARE @NewJvId INT;
  INSERT INTO accounting.journal_vouchers (contract_id, jv_type, jv_number, posting_date, currency, status, description, source_ref, source_type, created_by, period_seq, total_debit, total_credit)
  VALUES (@ContractId, 'LEASE_PURCHASE', @JeRef, @PurchaseDate, @Currency, 'ERP',
          'Purchase Option Exercised - Asset transferred to PPE', @ContractRef, 'PURCHASE', @PostedBy, NULL, @TotalDr, @TotalCr);
  SET @NewJvId = SCOPE_IDENTITY();

  -- Insert JV lines
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, calc_explanation)
  VALUES
    (@NewJvId, 1, '1501', 'Property, Plant & Equipment', 'Dr', @OwnedAssetValue, 'Recognise owned asset at ROU carrying amount', @CalcExpl),
    (@NewJvId, 2, '10200', 'Accum. Depreciation - ROU Property', 'Dr', @AccumDepr, 'Derecognise accumulated depreciation on ROU asset', @CalcExpl),
    (@NewJvId, 3, '2101', 'Lease Liability', 'Dr', @CurrentLiability, 'Derecognise remaining lease liability', @CalcExpl),
    (@NewJvId, 4, '1601', 'Right-of-Use Asset', 'Cr', @RouAssetCost, 'Derecognise ROU asset at original cost', @CalcExpl),
    (@NewJvId, 5, '1001', 'Cash / Bank', 'Cr', @PurchasePrice, 'Purchase price paid to lessor', @CalcExpl);

  -- Insert Gain/Loss line if non-zero
  IF @GainLoss <> 0
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, calc_explanation)
    VALUES (@NewJvId, 6, '7202', 'Gain/Loss on Lease Purchase',
      CASE WHEN @GainLoss >= 0 THEN 'Cr' ELSE 'Dr' END,
      ABS(@GainLoss),
      CASE WHEN @GainLoss >= 0 THEN 'Gain on purchase option exercise' ELSE 'Loss on purchase option exercise' END,
      @CalcExpl);

  -- ═══ STEP 3: Update contract status ═══
  UPDATE lease.contracts SET
    status     = 'Purchased',
    updated_at = GETUTCDATE()
  WHERE contract_id = @ContractId;

  -- ═══ STEP 4: Record in modifications table ═══
  INSERT INTO lease.lease_modifications (contract_id, modification_type, modification_date, old_monthly_payment, new_monthly_payment, old_liability, new_liability, old_rou_nbv, new_rou_nbv, remeasurement_gain_loss, je_ref, status, created_by, created_at)
  VALUES (@ContractId, 'PURCHASE', @PurchaseDate, 0, @PurchasePrice, @CurrentLiability, 0, @CurrentRouNBV, 0, @GainLoss, @JeRef, 'Applied', @PostedBy, GETUTCDATE());

  COMMIT TRANSACTION;

  SELECT 'OK' AS result, @JeRef AS je_ref, 'Purchase Option Exercised - Asset transferred to PPE' AS je_label,
         @OwnedAssetValue AS owned_asset_value, @GainLoss AS gain_loss;

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
    console.log('SUCCESS: sp_ApplyPurchase created');
    pool.close();
  } catch(e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
