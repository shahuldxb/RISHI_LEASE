import sql from 'mssql';

const config = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }
};

async function main() {
  const pool = await sql.connect(config);

  // Drop and recreate SP with correct column names
  await pool.request().query(`DROP PROCEDURE IF EXISTS accounting.sp_PostInitialRecognitionJV`);
  console.log('Dropped old SP');

  await pool.request().query(`
    CREATE PROCEDURE accounting.sp_PostInitialRecognitionJV
      @contract_id INT
    AS
    BEGIN
      SET NOCOUNT ON;

      -- Check if already posted
      IF EXISTS (SELECT 1 FROM accounting.journal_vouchers WHERE contract_id = @contract_id AND jv_type = 'Initial Recognition')
      BEGIN
        SELECT 'ALREADY_EXISTS' AS result,
               jv_id, jv_number
        FROM accounting.journal_vouchers
        WHERE contract_id = @contract_id AND jv_type = 'Initial Recognition';
        RETURN;
      END

      -- Get contract data (correct column names: term_months, ibr, contract_ref)
      DECLARE @contract_ref NVARCHAR(50), @asset_type NVARCHAR(50), @currency NVARCHAR(10);
      DECLARE @rou DECIMAL(18,2), @liability DECIMAL(18,2), @deposit DECIMAL(18,2);
      DECLARE @idc DECIMAL(18,2), @incentives DECIMAL(18,2);
      DECLARE @monthly_payment DECIMAL(18,2), @ibr DECIMAL(10,6), @term INT;
      DECLARE @commence_date DATE;

      SELECT @contract_ref = contract_ref,
             @asset_type = asset_type,
             @currency = ISNULL(currency, 'QAR'),
             @rou = ISNULL(rou_asset_value, 0),
             @liability = ISNULL(lease_liability_commence, 0),
             @deposit = ISNULL(deposit_amount, 0),
             @idc = ISNULL(initial_direct_costs, 0),
             @incentives = ISNULL(lease_incentives, 0),
             @monthly_payment = ISNULL(monthly_payment, 0),
             @ibr = ISNULL(ibr, 0),
             @term = ISNULL(term_months, 0),
             @commence_date = commencement_date
      FROM lease.contracts
      WHERE contract_id = @contract_id;

      IF @contract_ref IS NULL
      BEGIN
        RAISERROR('Contract not found', 16, 1);
        RETURN;
      END

      -- Determine GL codes by asset type
      DECLARE @rou_code NVARCHAR(20), @rou_name NVARCHAR(100);
      DECLARE @liab_code NVARCHAR(20), @liab_name NVARCHAR(100);

      IF @asset_type IN ('Vehicle', 'Vehicles', 'Fleet')
      BEGIN SET @rou_code = '10110'; SET @rou_name = 'ROU Asset - Vehicles'; SET @liab_code = '21030'; SET @liab_name = 'Lease Liability - Vehicles'; END
      ELSE IF @asset_type IN ('Equipment', 'IT', 'Network')
      BEGIN SET @rou_code = '10120'; SET @rou_name = 'ROU Asset - Equipment'; SET @liab_code = '21040'; SET @liab_name = 'Lease Liability - Equipment'; END
      ELSE IF @asset_type IN ('Tower', 'Tower Site', 'Towers')
      BEGIN SET @rou_code = '10140'; SET @rou_name = 'ROU Asset - Tower Sites'; SET @liab_code = '21060'; SET @liab_name = 'Lease Liability - Tower Sites'; END
      ELSE
      BEGIN SET @rou_code = '10100'; SET @rou_name = 'Right-of-Use Asset - Property'; SET @liab_code = '21020'; SET @liab_name = 'Lease Liability - Property'; END

      -- ROU debit = rou_asset_value (already includes IDC - Incentives from sp_CreateLease)
      DECLARE @rou_dr DECIMAL(18,2) = @rou;
      DECLARE @liab_cr DECIMAL(18,2) = @liability;

      -- Generate JV number
      DECLARE @period_year INT = YEAR(@commence_date);
      DECLARE @period_month INT = MONTH(@commence_date);
      DECLARE @period_str NVARCHAR(6) = CAST(@period_year AS NVARCHAR) + RIGHT('0' + CAST(@period_month AS NVARCHAR), 2);
      DECLARE @seq INT;
      SELECT @seq = ISNULL(MAX(CAST(RIGHT(jv_number, 5) AS INT)), 0) + 1
      FROM accounting.journal_vouchers
      WHERE jv_number LIKE 'JV-' + @period_str + '-%';
      DECLARE @jv_number NVARCHAR(50) = 'JV-' + @period_str + '-' + RIGHT('00000' + CAST(@seq AS NVARCHAR), 5);

      -- Calculate totals
      DECLARE @total_dr DECIMAL(18,2) = @rou_dr + CASE WHEN @deposit > 0 THEN @deposit ELSE 0 END;
      DECLARE @total_cr DECIMAL(18,2) = @liab_cr + CASE WHEN @idc > 0 THEN @idc ELSE 0 END + CASE WHEN @incentives > 0 THEN @incentives ELSE 0 END + CASE WHEN @deposit > 0 THEN @deposit ELSE 0 END;

      -- Build calc explanation strings
      DECLARE @monthly_rate DECIMAL(18,6) = @ibr / 100.0 / 12.0;
      DECLARE @ibr_pct NVARCHAR(20) = FORMAT(@ibr, '0.0000') + '%';
      DECLARE @monthly_rate_str NVARCHAR(20) = FORMAT(@monthly_rate, '0.000000');

      DECLARE @calc_rou NVARCHAR(MAX) =
        'ROU Asset = PV of Lease Payments + Initial Direct Costs (IDC) - Lease Incentives' + CHAR(10) +
        'ROU Asset = ' + FORMAT(@liability, '#,##0.00') + ' + ' + FORMAT(@idc, '#,##0.00') + ' - ' + FORMAT(@incentives, '#,##0.00') + CHAR(10) +
        'ROU Asset = ' + FORMAT(@rou_dr, '#,##0.00') + CHAR(10) + CHAR(10) +
        'Where:' + CHAR(10) +
        '  Monthly Payment = ' + FORMAT(@monthly_payment, '#,##0.00') + ' ' + @currency + CHAR(10) +
        '  IBR (annual) = ' + @ibr_pct + CHAR(10) +
        '  Monthly Rate (r) = ' + @ibr_pct + ' / 12 = ' + @monthly_rate_str + CHAR(10) +
        '  Lease Term (n) = ' + CAST(@term AS NVARCHAR) + ' months' + CHAR(10) +
        '  PV = Monthly Payment x [(1 - (1 + r)^-n) / r]' + CHAR(10) +
        'PV = ' + FORMAT(@monthly_payment, '#,##0.00') + ' x [(1 - (1 + ' + @monthly_rate_str + ')^-' + CAST(@term AS NVARCHAR) + ') / ' + @monthly_rate_str + ']' + CHAR(10) +
        'PV = ' + FORMAT(@liability, '#,##0.00');

      DECLARE @calc_liab NVARCHAR(MAX) =
        'Lease Liability = PV of future lease payments discounted at IBR' + CHAR(10) +
        'PV = Monthly Payment x [(1 - (1 + r)^-n) / r]' + CHAR(10) +
        'PV = ' + FORMAT(@monthly_payment, '#,##0.00') + ' x [(1 - (1 + ' + @monthly_rate_str + ')^-' + CAST(@term AS NVARCHAR) + ') / ' + @monthly_rate_str + ']' + CHAR(10) +
        'PV = ' + FORMAT(@liability, '#,##0.00') + CHAR(10) + CHAR(10) +
        'Where:' + CHAR(10) +
        '  Monthly Payment = ' + FORMAT(@monthly_payment, '#,##0.00') + ' ' + @currency + CHAR(10) +
        '  IBR (annual) = ' + @ibr_pct + CHAR(10) +
        '  Monthly Rate (r) = ' + @ibr_pct + ' / 12 = ' + @monthly_rate_str + CHAR(10) +
        '  Lease Term (n) = ' + CAST(@term AS NVARCHAR) + ' months';

      DECLARE @calc_idc NVARCHAR(MAX) =
        'Initial Direct Costs (IDC) = Legal fees + Broker commissions + Registration costs' + CHAR(10) +
        'IDC = ' + FORMAT(@idc, '#,##0.00') + ' ' + @currency + CHAR(10) +
        'These costs are capitalised into the ROU Asset and accrued as a liability until paid.';

      DECLARE @calc_deposit_dr NVARCHAR(MAX) =
        'Security Deposit = Refundable deposit paid to lessor' + CHAR(10) +
        'Deposit = ' + FORMAT(@deposit, '#,##0.00') + ' ' + @currency + CHAR(10) +
        'Recognised as a non-current asset (receivable) - refundable at lease end or termination.';

      DECLARE @calc_deposit_cr NVARCHAR(MAX) =
        'Bank Payment for Security Deposit' + CHAR(10) +
        'Amount = ' + FORMAT(@deposit, '#,##0.00') + ' ' + @currency + CHAR(10) +
        'Cash outflow from operating bank account to lessor for refundable security deposit.';

      -- Insert JV header - AUTO POSTED (no contract_ref column in journal_vouchers)
      INSERT INTO accounting.journal_vouchers (jv_number, jv_type, period_year, period_month, posting_date, description, contract_id, source_ref, source_type, currency, total_debit, total_credit, status, created_by, posted_by, created_at)
      VALUES (@jv_number, 'Initial Recognition', @period_year, @period_month, GETUTCDATE(),
              'IFRS 16 Initial Recognition - ' + @contract_ref, @contract_id, @contract_ref, 'Lease',
              @currency, @total_dr, @total_cr, 'Posted', 'System', 'System', GETUTCDATE());

      DECLARE @jv_id INT = SCOPE_IDENTITY();
      DECLARE @seq_line INT = 0;

      -- Line 1: Dr ROU Asset
      SET @seq_line = @seq_line + 1;
      INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, currency, description, calc_explanation)
      VALUES (@jv_id, @seq_line, @rou_code, @rou_name, 'Dr', @rou_dr, @currency, 'ROU Asset initial recognition', @calc_rou);

      -- Line 2: Cr Lease Liability
      SET @seq_line = @seq_line + 1;
      INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, currency, description, calc_explanation)
      VALUES (@jv_id, @seq_line, @liab_code, @liab_name, 'Cr', @liab_cr, @currency, 'Lease Liability = PV of future payments at IBR', @calc_liab);

      -- Line 3: Cr IDC (if > 0)
      IF @idc > 0
      BEGIN
        SET @seq_line = @seq_line + 1;
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, currency, description, calc_explanation)
        VALUES (@jv_id, @seq_line, '20020', 'Accrued Initial Direct Costs', 'Cr', @idc, @currency, 'IDC accrued', @calc_idc);
      END

      -- Line 4: Cr Lease Incentives (if > 0)
      IF @incentives > 0
      BEGIN
        SET @seq_line = @seq_line + 1;
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, currency, description, calc_explanation)
        VALUES (@jv_id, @seq_line, '20030', 'Lease Incentives Received', 'Cr', @incentives, @currency, 'Lease incentives received from lessor',
                'Lease Incentives = Amounts received from lessor as inducement' + CHAR(10) + 'Incentives = ' + FORMAT(@incentives, '#,##0.00') + ' ' + @currency + CHAR(10) + 'Reduces the ROU Asset carrying value at initial recognition.');
      END

      -- Line 5 & 6: Dr Security Deposit / Cr Bank (if > 0)
      IF @deposit > 0
      BEGIN
        SET @seq_line = @seq_line + 1;
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, currency, description, calc_explanation)
        VALUES (@jv_id, @seq_line, '12020', 'Security Deposit - Lease', 'Dr', @deposit, @currency, 'Security deposit paid to lessor', @calc_deposit_dr);

        SET @seq_line = @seq_line + 1;
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, currency, description, calc_explanation)
        VALUES (@jv_id, @seq_line, '11000', 'Bank Account - QAR Operating', 'Cr', @deposit, @currency, 'Bank payment of security deposit', @calc_deposit_cr);
      END

      SELECT 'SUCCESS' AS result, @jv_id AS jv_id, @jv_number AS jv_number, @rou_dr AS rou_debit, @liab_cr AS liability_credit;
    END
  `);
  console.log('SP created successfully');

  // Update existing JV to Posted
  const upd = await pool.request().query(`
    UPDATE accounting.journal_vouchers 
    SET status = 'Posted', posted_by = 'System', posting_date = GETUTCDATE()
    WHERE contract_id = 36 AND jv_type = 'Initial Recognition' AND status = 'Draft'
  `);
  console.log('Existing JV updated to Posted:', upd.rowsAffected[0], 'rows');

  pool.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
