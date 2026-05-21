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
CREATE OR ALTER PROCEDURE dbo.sp_PreviewPurchase
  @ContractId     INT,
  @PurchaseDate   DATE,
  @PurchasePrice  DECIMAL(18,2)
AS
BEGIN
  SET NOCOUNT ON;

  -- ═══ PURCHASE OPTION (IFRS 16 §26): Exercise purchase option ═══
  -- When lessee exercises purchase option:
  -- 1. Derecognise the lease liability (remaining balance)
  -- 2. Derecognise the ROU asset (transfer to owned PPE)
  -- 3. Record purchase price payment (Cash/Bank)
  -- 4. Recognise owned asset at: ROU NBV + Purchase Price (or fair value)
  -- 5. Any difference = Gain/Loss on purchase

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

  -- Get current carrying amounts at purchase date
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

  -- Accumulated depreciation
  SET @AccumDepr = @RouAssetCost - @CurrentRouNBV;

  -- The owned asset is recognised at ROU carrying amount (NBV) 
  -- Per IFRS 16.26: purchase price was already included in lease payments if reasonably certain
  -- On exercise: derecognise lease, recognise owned asset
  -- Owned asset value = ROU NBV (carrying amount at purchase date)
  DECLARE @OwnedAssetValue DECIMAL(18,2) = @CurrentRouNBV;

  -- Gain/Loss = Lease Liability derecognised - Purchase Price paid
  -- If liability > purchase price → Gain (we owed more than we paid)
  -- If liability < purchase price → Loss (we paid more than we owed)
  DECLARE @GainLoss DECIMAL(18,2) = @CurrentLiability - @PurchasePrice;
  DECLARE @GainLossType NVARCHAR(10) = CASE WHEN @GainLoss >= 0 THEN 'Gain' ELSE 'Loss' END;

  -- Result set 1: Summary
  SELECT
    @ContractId        AS contract_id,
    @ContractRef       AS contract_ref,
    @PurchaseDate      AS purchase_date,
    @PurchasePrice     AS purchase_price,
    @CurrentLiability  AS current_liability,
    @CurrentRouNBV     AS current_rou_nbv,
    @RouAssetCost      AS rou_asset_cost,
    @AccumDepr         AS accumulated_depreciation,
    @OwnedAssetValue   AS owned_asset_value,
    @GainLoss          AS gain_loss,
    @GainLossType      AS gain_loss_type,
    @Currency          AS currency;

  -- Result set 2: Journal Entry lines
  -- JE for Purchase Option Exercise:
  -- Dr: Property, Plant & Equipment (owned asset at ROU NBV)
  -- Dr: Accumulated Depreciation - ROU (reverse accum depr)
  -- Dr: Lease Liability (derecognise remaining liability)
  -- Cr: Right-of-Use Asset (derecognise at cost)
  -- Cr: Cash/Bank (purchase price paid)
  -- Dr/Cr: Gain/Loss on Purchase (balancing)
  SELECT line_no, account_code, account_name, dr_cr, amount, description FROM (
    SELECT 1 AS line_no, '1501' AS account_code, 'Property, Plant & Equipment' AS account_name,
      'Dr' AS dr_cr, @OwnedAssetValue AS amount, 'Recognise owned asset at ROU carrying amount' AS description
    UNION ALL
    SELECT 2, '10200', 'Accum. Depreciation - ROU Property',
      'Dr', @AccumDepr, 'Derecognise accumulated depreciation on ROU asset'
    UNION ALL
    SELECT 3, '2101', 'Lease Liability',
      'Dr', @CurrentLiability, 'Derecognise remaining lease liability'
    UNION ALL
    SELECT 4, '1601', 'Right-of-Use Asset',
      'Cr', @RouAssetCost, 'Derecognise ROU asset at original cost'
    UNION ALL
    SELECT 5, '1001', 'Cash / Bank',
      'Cr', @PurchasePrice, 'Purchase price paid to lessor'
    UNION ALL
    SELECT 6, '7202', 'Gain/Loss on Lease Purchase',
      CASE WHEN @GainLoss >= 0 THEN 'Cr' ELSE 'Dr' END,
      ABS(@GainLoss),
      CASE WHEN @GainLoss >= 0 THEN 'Gain on purchase option exercise' ELSE 'Loss on purchase option exercise' END
    WHERE @GainLoss <> 0
  ) je ORDER BY line_no;
END
`;

(async () => {
  try {
    const pool = await sql.connect(config);
    await pool.request().query(spDef);
    console.log('SUCCESS: sp_PreviewPurchase created');
    pool.close();
  } catch(e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
