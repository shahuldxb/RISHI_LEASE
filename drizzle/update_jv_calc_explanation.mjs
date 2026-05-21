import sql from 'mssql';

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }
};

async function run() {
  const pool = await sql.connect(cfg);

  await pool.request().batch(`
    ALTER PROCEDURE accounting.sp_PostInitialRecognitionJV
      @contract_id INT
    AS BEGIN
      SET NOCOUNT ON;

      -- Check if JV already exists
      IF EXISTS (SELECT 1 FROM accounting.journal_vouchers WHERE contract_id = @contract_id AND jv_type = 'Initial Recognition')
      BEGIN
        SELECT jv_id, jv_number, 0 AS period_year, 0 AS period_month,
               CAST(0 AS DECIMAL(18,2)) AS rou_debit, CAST(0 AS DECIMAL(18,2)) AS liability_credit,
               'ALREADY_EXISTS' AS result
        FROM accounting.journal_vouchers
        WHERE contract_id = @contract_id AND jv_type = 'Initial Recognition';
        RETURN;
      END

      -- Read contract values
      DECLARE @contract_ref NVARCHAR(30), @asset_type NVARCHAR(50), @currency CHAR(3),
              @commencement_date DATE, @posted_by INT, @term_months INT,
              @monthly_payment DECIMAL(18,2), @ibr DECIMAL(8,6),
              @rou_asset_value DECIMAL(18,2), @lease_liability DECIMAL(18,2),
              @idc DECIMAL(18,2), @lease_incentives DECIMAL(18,2), @security_deposit DECIMAL(18,2);

      SELECT @contract_ref = contract_ref, @asset_type = asset_type, @currency = currency,
             @commencement_date = commencement_date, @posted_by = maker_id,
             @term_months = term_months, @monthly_payment = monthly_payment, @ibr = ibr,
             @rou_asset_value = ISNULL(rou_asset_value, 0),
             @lease_liability = ISNULL(lease_liability_commence, 0),
             @idc = ISNULL(initial_direct_costs, 0),
             @lease_incentives = ISNULL(lease_incentives, 0),
             @security_deposit = ISNULL(deposit_amount, 0)
      FROM lease.contracts
      WHERE contract_id = @contract_id;

      IF @contract_ref IS NULL
      BEGIN
        RAISERROR('Contract not found', 16, 1);
        RETURN;
      END

      -- Map asset type to GL accounts
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

      -- Build calculation explanation strings
      DECLARE @monthly_rate_str NVARCHAR(20) = CAST(CAST(@ibr * 100 AS DECIMAL(8,4)) AS NVARCHAR) + '% / 12 = ' + CAST(CAST(@ibr / 12.0 * 100 AS DECIMAL(10,6)) AS NVARCHAR) + '%';

      DECLARE @pv_formula NVARCHAR(500) = 
        'PV = Monthly Payment x [(1 - (1 + r)^-n) / r]' + CHAR(10) +
        'PV = ' + FORMAT(@monthly_payment, 'N2') + ' x [(1 - (1 + ' + CAST(CAST(@ibr/12.0 AS DECIMAL(10,6)) AS NVARCHAR) + ')^-' + CAST(@term_months AS NVARCHAR) + ') / ' + CAST(CAST(@ibr/12.0 AS DECIMAL(10,6)) AS NVARCHAR) + ']' + CHAR(10) +
        'PV = ' + FORMAT(@lease_liability, 'N2');

      DECLARE @rou_formula NVARCHAR(800) =
        'ROU Asset = PV of Lease Payments + Initial Direct Costs (IDC) - Lease Incentives' + CHAR(10) +
        'ROU Asset = ' + FORMAT(@lease_liability, 'N2') + ' + ' + FORMAT(@idc, 'N2') + ' - ' + FORMAT(@lease_incentives, 'N2') + CHAR(10) +
        'ROU Asset = ' + FORMAT(@rou_asset_value, 'N2') + CHAR(10) + CHAR(10) +
        'Where:' + CHAR(10) +
        '  Monthly Payment = ' + FORMAT(@monthly_payment, 'N2') + ' ' + @currency + CHAR(10) +
        '  IBR (annual) = ' + CAST(CAST(@ibr * 100 AS DECIMAL(8,4)) AS NVARCHAR) + '%' + CHAR(10) +
        '  Monthly Rate (r) = ' + @monthly_rate_str + CHAR(10) +
        '  Lease Term (n) = ' + CAST(@term_months AS NVARCHAR) + ' months' + CHAR(10) +
        '  ' + @pv_formula;

      DECLARE @liability_formula NVARCHAR(500) =
        'Lease Liability = PV of future lease payments discounted at IBR' + CHAR(10) +
        @pv_formula + CHAR(10) + CHAR(10) +
        'Where:' + CHAR(10) +
        '  Monthly Payment = ' + FORMAT(@monthly_payment, 'N2') + ' ' + @currency + CHAR(10) +
        '  IBR (annual) = ' + CAST(CAST(@ibr * 100 AS DECIMAL(8,4)) AS NVARCHAR) + '%' + CHAR(10) +
        '  Monthly Rate (r) = ' + @monthly_rate_str + CHAR(10) +
        '  Lease Term (n) = ' + CAST(@term_months AS NVARCHAR) + ' months';

      DECLARE @idc_formula NVARCHAR(300) =
        'Initial Direct Costs (IDC) = Legal fees + Broker commissions + Registration costs' + CHAR(10) +
        'IDC = ' + FORMAT(@idc, 'N2') + ' ' + @currency + CHAR(10) +
        'These costs are capitalised into the ROU Asset and accrued as a liability until paid.';

      DECLARE @incentive_formula NVARCHAR(300) =
        'Lease Incentives Received = Cash or rent-free periods from lessor' + CHAR(10) +
        'Incentives = ' + FORMAT(@lease_incentives, 'N2') + ' ' + @currency + CHAR(10) +
        'Incentives reduce the ROU Asset carrying value and are received as cash/bank credit.';

      DECLARE @deposit_dr_formula NVARCHAR(300) =
        'Security Deposit = Refundable deposit paid to lessor' + CHAR(10) +
        'Deposit = ' + FORMAT(@security_deposit, 'N2') + ' ' + @currency + CHAR(10) +
        'Recognised as a non-current asset (receivable) - refundable at lease end or termination.';

      DECLARE @deposit_cr_formula NVARCHAR(300) =
        'Bank Payment for Security Deposit' + CHAR(10) +
        'Amount = ' + FORMAT(@security_deposit, 'N2') + ' ' + @currency + CHAR(10) +
        'Cash outflow from operating bank account to lessor for refundable security deposit.';

      -- Totals
      DECLARE @rou_dr DECIMAL(18,2) = @rou_asset_value;
      DECLARE @total_dr DECIMAL(18,2) = @rou_dr + @lease_incentives + @security_deposit;
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

      -- Line 1: Dr ROU Asset
      INSERT INTO accounting.jv_lines
        (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount, calc_explanation)
      VALUES (@jv_id, @line, @rou_account, @rou_acct_name, 'Dr', @rou_dr,
              'ROU Asset initial recognition',
              @currency, @rou_dr, @rou_formula);
      SET @line = @line + 1;

      -- Line 2: Cr Lease Liability
      INSERT INTO accounting.jv_lines
        (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount, calc_explanation)
      VALUES (@jv_id, @line, @liability_account, @liab_acct_name, 'Cr', @lease_liability,
              'Lease Liability = PV of future payments at IBR',
              @currency, @lease_liability, @liability_formula);
      SET @line = @line + 1;

      -- Line 3: Cr Accrued IDC
      IF @idc > 0
      BEGIN
        INSERT INTO accounting.jv_lines
          (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount, calc_explanation)
        VALUES (@jv_id, @line, '20020', 'Accrued Initial Direct Costs', 'Cr', @idc,
                'IDC accrued',
                @currency, @idc, @idc_formula);
        SET @line = @line + 1;
      END

      -- Line 4: Dr Lease Incentives (if > 0)
      IF @lease_incentives > 0
      BEGIN
        INSERT INTO accounting.jv_lines
          (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount, calc_explanation)
        VALUES (@jv_id, @line, '11000', 'Bank Account - QAR Operating', 'Dr', @lease_incentives,
                'Lease incentives received from lessor',
                @currency, @lease_incentives, @incentive_formula);
        SET @line = @line + 1;
      END

      -- Line 5+6: Security Deposit
      IF @security_deposit > 0
      BEGIN
        INSERT INTO accounting.jv_lines
          (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount, calc_explanation)
        VALUES (@jv_id, @line, '12020', 'Security Deposit - Lease', 'Dr', @security_deposit,
                'Security deposit paid to lessor',
                @currency, @security_deposit, @deposit_dr_formula);
        SET @line = @line + 1;

        INSERT INTO accounting.jv_lines
          (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount, calc_explanation)
        VALUES (@jv_id, @line, '11000', 'Bank Account - QAR Operating', 'Cr', @security_deposit,
                'Bank payment of security deposit',
                @currency, @security_deposit, @deposit_cr_formula);
        SET @line = @line + 1;
      END

      SELECT @jv_id AS jv_id, @jv_number AS jv_number,
             @period_year AS period_year, @period_month AS period_month,
             @rou_dr AS rou_debit, @lease_liability AS liability_credit,
             'CREATED' AS result;
    END
  `);
  console.log('1. SP updated with calc_explanation for all lines');

  // Re-post the JV for contract 36 to get the new explanations
  await pool.request().query('DELETE FROM accounting.jv_lines WHERE jv_id=34');
  await pool.request().query('DELETE FROM accounting.journal_vouchers WHERE jv_id=34');
  console.log('2. Old JV deleted');

  const r = await pool.request()
    .input('contract_id', sql.Int, 36)
    .execute('accounting.sp_PostInitialRecognitionJV');
  console.log('3. JV re-posted:', JSON.stringify(r.recordset[0]));

  // Verify with explanations
  const jvId = r.recordset[0].jv_id;
  const lines = await pool.request().query(`SELECT account_code, account_name, dr_cr, amount, calc_explanation FROM accounting.jv_lines WHERE jv_id=${jvId} ORDER BY line_id`);
  lines.recordset.forEach(row => {
    console.log(`\n${row.dr_cr} ${row.account_code} ${row.account_name}: ${Number(row.amount).toLocaleString('en', {minimumFractionDigits:2})}`);
    console.log('  Calc:', (row.calc_explanation || '').substring(0, 100) + '...');
  });

  await pool.close();
}

run().catch(e => console.error('ERROR:', e.message));
