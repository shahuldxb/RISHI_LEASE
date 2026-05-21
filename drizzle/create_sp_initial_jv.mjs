// Creates accounting.sp_PostInitialRecognitionJV in SQL Server
// Run: node drizzle/create_sp_initial_jv.mjs

import sql from 'mssql';

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 60000,
  connectionTimeout: 30000,
};

async function run() {
  const pool = await sql.connect(cfg);
  console.log('Connected to SQL Server');

  // Step 1: Drop if exists
  await pool.request().query(`
    IF OBJECT_ID('accounting.sp_PostInitialRecognitionJV', 'P') IS NOT NULL
      DROP PROCEDURE accounting.sp_PostInitialRecognitionJV
  `);
  console.log('Dropped old SP (if existed)');

  // Step 2: Create the SP
  // Note: lease.contracts uses deposit_amount (not security_deposit)
  const spBody = `
CREATE PROCEDURE accounting.sp_PostInitialRecognitionJV
  @contract_id    INT,
  @posted_by      NVARCHAR(100) = 'SYSTEM'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE
    @contract_ref           NVARCHAR(50),
    @commencement_date      DATE,
    @asset_type             NVARCHAR(100),
    @currency               NVARCHAR(10),
    @rou_asset_value        DECIMAL(18,2),
    @lease_liability        DECIMAL(18,2),
    @idc                    DECIMAL(18,2),
    @security_deposit       DECIMAL(18,2),
    @lease_incentives       DECIMAL(18,2);

  SELECT
    @contract_ref       = contract_ref,
    @commencement_date  = commencement_date,
    @asset_type         = asset_type,
    @currency           = ISNULL(currency, 'QAR'),
    @rou_asset_value    = ISNULL(rou_asset_value, 0),
    @lease_liability    = ISNULL(lease_liability_commence, 0),
    @idc                = ISNULL(initial_direct_costs, 0),
    @security_deposit   = ISNULL(deposit_amount, 0),
    @lease_incentives   = ISNULL(lease_incentives, 0)
  FROM lease.contracts
  WHERE contract_id = @contract_id;

  IF @contract_ref IS NULL
  BEGIN
    RAISERROR('Contract not found: %d', 16, 1, @contract_id);
    RETURN;
  END

  IF EXISTS (
    SELECT 1 FROM accounting.journal_vouchers
    WHERE contract_id = @contract_id AND jv_type = 'Initial Recognition'
  )
  BEGIN
    SELECT jv_number AS existing_jv_number, 'ALREADY_EXISTS' AS result
    FROM accounting.journal_vouchers
    WHERE contract_id = @contract_id AND jv_type = 'Initial Recognition';
    RETURN;
  END

  DECLARE @rou_account NVARCHAR(10), @liability_account NVARCHAR(10);
  SET @rou_account = CASE
    WHEN @asset_type LIKE '%Vehicle%' OR @asset_type LIKE '%Fleet%' THEN '10110'
    WHEN @asset_type LIKE '%Equipment%'                              THEN '10120'
    WHEN @asset_type LIKE '%IT%' OR @asset_type LIKE '%Infra%'      THEN '10130'
    WHEN @asset_type LIKE '%Tower%'                                  THEN '10140'
    ELSE '10100'
  END;
  SET @liability_account = CASE
    WHEN @asset_type LIKE '%Vehicle%' OR @asset_type LIKE '%Fleet%' THEN '21030'
    WHEN @asset_type LIKE '%Equipment%'                              THEN '21040'
    WHEN @asset_type LIKE '%IT%' OR @asset_type LIKE '%Infra%'      THEN '21050'
    WHEN @asset_type LIKE '%Tower%'                                  THEN '21060'
    ELSE '21020'
  END;

  DECLARE @rou_acct_name NVARCHAR(100), @liab_acct_name NVARCHAR(100);
  SELECT @rou_acct_name = account_name FROM accounting.gl_chart_of_accounts WHERE account_code = @rou_account;
  SELECT @liab_acct_name = account_name FROM accounting.gl_chart_of_accounts WHERE account_code = @liability_account;

  DECLARE @period_year INT = YEAR(@commencement_date);
  DECLARE @period_month INT = MONTH(@commencement_date);

  DECLARE @jv_seq INT;
  SELECT @jv_seq = ISNULL(MAX(CAST(SUBSTRING(jv_number, 10, 5) AS INT)), 0) + 1
  FROM accounting.journal_vouchers
  WHERE jv_number LIKE 'JV-' + FORMAT(@commencement_date, 'yyyyMM') + '-%';

  DECLARE @jv_number NVARCHAR(30);
  SET @jv_number = 'JV-' + FORMAT(@commencement_date, 'yyyyMM') + '-' + RIGHT('00000' + CAST(@jv_seq AS NVARCHAR), 5);

  DECLARE @rou_dr DECIMAL(18,2) = @rou_asset_value + @idc - @lease_incentives;
  DECLARE @total_dr DECIMAL(18,2) = @rou_dr + @security_deposit;
  DECLARE @total_cr DECIMAL(18,2) = @lease_liability + @idc + @security_deposit;

  DECLARE @jv_id INT;
  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit,
     status, created_by, created_at)
  VALUES
    (@jv_number, 'Initial Recognition', @period_year, @period_month,
     @commencement_date,
     'IFRS 16 Day-1 Initial Recognition - ' + @contract_ref,
     @contract_id, @contract_ref, 'LEASE_ORIGINATION',
     @currency, @total_dr, @total_cr,
     'Draft', @posted_by, GETUTCDATE());
  SET @jv_id = SCOPE_IDENTITY();

  DECLARE @line INT = 1;

  INSERT INTO accounting.jv_lines
    (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount)
  VALUES (@jv_id, @line, @rou_account, @rou_acct_name, 'Dr', @rou_dr,
          'Right-of-Use Asset initial recognition (PV of payments + IDC - incentives)',
          @currency, @rou_dr);
  SET @line = @line + 1;

  INSERT INTO accounting.jv_lines
    (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount)
  VALUES (@jv_id, @line, @liability_account, @liab_acct_name, 'Cr', @lease_liability,
          'Lease Liability present value of future payments discounted at IBR',
          @currency, @lease_liability);
  SET @line = @line + 1;

  IF @idc > 0
  BEGIN
    INSERT INTO accounting.jv_lines
      (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount)
    VALUES (@jv_id, @line, '20020', 'Accrued Initial Direct Costs', 'Cr', @idc,
            'Initial direct costs accrued - legal fees, broker commission, registration',
            @currency, @idc);
    SET @line = @line + 1;
  END

  IF @lease_incentives > 0
  BEGIN
    INSERT INTO accounting.jv_lines
      (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount)
    VALUES (@jv_id, @line, '20030', 'Lease Incentives Received', 'Cr', @lease_incentives,
            'Lease incentives received from lessor - reduces ROU asset',
            @currency, @lease_incentives);
    SET @line = @line + 1;
  END

  IF @security_deposit > 0
  BEGIN
    INSERT INTO accounting.jv_lines
      (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount)
    VALUES (@jv_id, @line, '12020', 'Security Deposit - Lease', 'Dr', @security_deposit,
            'Security deposit paid to lessor - refundable at lease end',
            @currency, @security_deposit);
    SET @line = @line + 1;
    INSERT INTO accounting.jv_lines
      (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount)
    VALUES (@jv_id, @line, '11000', 'Bank Account - QAR Operating', 'Cr', @security_deposit,
            'Bank payment of security deposit to lessor',
            @currency, @security_deposit);
    SET @line = @line + 1;
  END

  SELECT @jv_id AS jv_id, @jv_number AS jv_number,
         @period_year AS period_year, @period_month AS period_month,
         @rou_dr AS rou_debit, @lease_liability AS liability_credit,
         'CREATED' AS result;
END
`;

  await pool.request().query(spBody);
  console.log('SP created successfully');

  // Verify
  const check = await pool.request().query(
    "SELECT name FROM sys.procedures WHERE name = 'sp_PostInitialRecognitionJV'"
  );
  console.log('Verification:', check.recordset.length > 0 ? 'FOUND in sys.procedures' : 'NOT FOUND');

  await pool.close();
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
