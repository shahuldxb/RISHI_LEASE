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

  // Fix the SP: @rou_dr should be @rou_asset_value directly (it already includes IDC - incentives)
  // The separate Cr IDC and Cr Incentives lines are the counterpart entries
  // Dr ROU Asset = PV + IDC - Incentives  (this IS @rou_asset_value)
  // Cr Lease Liability = PV
  // Cr Accrued IDC = IDC
  // Dr Lease Incentives = Incentives (or Cr reduces ROU)
  // The JV balances: Dr(ROU) = Cr(Liability) + Cr(IDC) - Cr(Incentives)
  //   PV + IDC - Incentives = PV + IDC - Incentives  ✓
  
  await pool.request().batch(`
    ALTER PROCEDURE accounting.sp_PostInitialRecognitionJV
      @contract_id INT
    AS BEGIN
      SET NOCOUNT ON;

      -- Check if JV already exists for this contract
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
              @commencement_date DATE, @posted_by INT,
              @rou_asset_value DECIMAL(18,2), @lease_liability DECIMAL(18,2),
              @idc DECIMAL(18,2), @lease_incentives DECIMAL(18,2), @security_deposit DECIMAL(18,2);

      SELECT @contract_ref = contract_ref, @asset_type = asset_type, @currency = currency,
             @commencement_date = commencement_date, @posted_by = maker_id,
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

      -- Period
      DECLARE @period_year INT = YEAR(@commencement_date);
      DECLARE @period_month INT = MONTH(@commencement_date);

      -- JV number sequence
      DECLARE @jv_seq INT;
      SELECT @jv_seq = ISNULL(MAX(CAST(SUBSTRING(jv_number, 10, 5) AS INT)), 0) + 1
      FROM accounting.journal_vouchers
      WHERE jv_number LIKE 'JV-' + FORMAT(@commencement_date, 'yyyyMM') + '-%';

      DECLARE @jv_number NVARCHAR(30);
      SET @jv_number = 'JV-' + FORMAT(@commencement_date, 'yyyyMM') + '-' + RIGHT('00000' + CAST(@jv_seq AS NVARCHAR), 5);

      -- KEY FIX: @rou_asset_value already = PV + IDC - Incentives
      -- So Dr ROU = @rou_asset_value (NOT @rou_asset_value + @idc - @incentives again)
      DECLARE @rou_dr DECIMAL(18,2) = @rou_asset_value;
      DECLARE @total_dr DECIMAL(18,2) = @rou_dr + @security_deposit;
      DECLARE @total_cr DECIMAL(18,2) = @lease_liability + @idc + @security_deposit;
      -- Note: incentives reduce ROU but don't appear as separate Cr if already netted in ROU
      -- If incentives > 0, total_cr should also subtract incentives to balance:
      -- Dr ROU (PV+IDC-Inc) + Dr Deposit = Cr Liability(PV) + Cr IDC + Cr Deposit - but that doesn't balance
      -- Actually: Dr ROU = PV + IDC - Inc
      --           Cr Liability = PV
      --           Cr IDC = IDC  
      --           So Dr = PV + IDC - Inc, Cr = PV + IDC => imbalance of Inc
      -- Fix: If incentives > 0, we need Dr Incentives Receivable or Cr reduces ROU
      -- Correct IFRS 16 treatment: Incentives received reduce the ROU asset
      -- The entry is: Dr ROU (PV+IDC-Inc) / Cr Liability (PV) / Cr IDC (IDC) / Dr Cash/Receivable (Inc)
      -- OR simply: the incentive is already netted in ROU, and the Cr side = PV + IDC - Inc
      -- Wait, let's think again:
      -- If incentive is cash received: Dr Cash / Cr Lease Incentive Liability
      -- Then ROU = PV + IDC - Incentive
      -- JV: Dr ROU (PV+IDC-Inc) / Cr Liability (PV) / Cr Accrued IDC (IDC) / Dr Cash (Inc) / Cr Incentive Payable (Inc)
      -- But simpler: Dr ROU = PV + IDC - Inc, Cr Liability = PV, Cr IDC = IDC
      -- Balance check: Dr = PV+IDC-Inc, Cr = PV+IDC => Dr < Cr by Inc
      -- So we need: if Inc > 0, add a Dr line for Incentives Received (cash or receivable)
      -- Actually in practice, lease incentives received means lessor gave us cash/rent-free
      -- So: Dr Bank/Receivable (Inc) to balance
      -- Let's handle it properly:

      -- Recalculate totals properly
      SET @total_dr = @rou_dr + @security_deposit + @lease_incentives;
      SET @total_cr = @lease_liability + @idc + @security_deposit + @lease_incentives;
      -- Wait that still doesn't work. Let me think step by step:
      -- Dr ROU Asset = PV + IDC - Incentives = @rou_asset_value
      -- Cr Lease Liability = PV = @lease_liability
      -- Cr Accrued IDC = IDC (if > 0)
      -- Now: Dr = PV + IDC - Inc, Cr = PV + IDC
      -- Difference = Inc (Cr side is higher by Inc)
      -- To balance, we either:
      --   a) Don't show IDC as separate Cr, just: Dr ROU / Cr Liability / Cr Bank(IDC)
      --   b) Show incentives as: Cr Lease Incentives (reduces Cr side? No, it's already Cr)
      -- 
      -- CORRECT IFRS 16 Day-1 entry:
      -- Dr ROU Asset = PV + IDC - Incentives + Make-Good
      -- Cr Lease Liability = PV
      -- Cr Cash/Bank = IDC (paid out)
      -- Dr Cash/Bank = Incentives (received)
      -- 
      -- So the IDC Cr is against Bank (cash paid for IDC)
      -- And Incentives Dr is against Bank (cash received as incentive)
      -- 
      -- Simplified:
      -- Dr ROU Asset .............. PV + IDC - Inc
      -- Dr Security Deposit ....... Deposit
      -- Cr Lease Liability ........ PV
      -- Cr Bank (IDC payment) ..... IDC
      -- Cr Bank (Deposit) ......... Deposit  
      -- Dr Bank (Incentive) ....... Inc  (or net with the Cr Bank lines)
      --
      -- But we already have Bank for deposit. Let's keep it clean:
      -- Line 1: Dr ROU Asset = @rou_asset_value
      -- Line 2: Cr Lease Liability = @lease_liability  
      -- Line 3: Cr Bank/Accrued IDC = @idc (if > 0)
      -- Line 4: Dr Bank/Incentive Receivable = @lease_incentives (if > 0)
      -- Line 5: Dr Security Deposit = @security_deposit (if > 0)
      -- Line 6: Cr Bank = @security_deposit (if > 0)
      -- 
      -- Check: Dr = (PV+IDC-Inc) + Inc + Deposit = PV + IDC + Deposit
      --        Cr = PV + IDC + Deposit  ✓ BALANCED!

      SET @total_dr = @rou_dr + @lease_incentives + @security_deposit;
      SET @total_cr = @lease_liability + @idc + @security_deposit;

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
        (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount)
      VALUES (@jv_id, @line, @rou_account, @rou_acct_name, 'Dr', @rou_dr,
              'ROU Asset initial recognition = PV(' + CAST(@lease_liability AS NVARCHAR) + ') + IDC(' + CAST(@idc AS NVARCHAR) + ') - Incentives(' + CAST(@lease_incentives AS NVARCHAR) + ')',
              @currency, @rou_dr);
      SET @line = @line + 1;

      -- Line 2: Cr Lease Liability
      INSERT INTO accounting.jv_lines
        (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount)
      VALUES (@jv_id, @line, @liability_account, @liab_acct_name, 'Cr', @lease_liability,
              'Lease Liability = PV of future payments at IBR',
              @currency, @lease_liability);
      SET @line = @line + 1;

      -- Line 3: Cr Accrued IDC (if > 0)
      IF @idc > 0
      BEGIN
        INSERT INTO accounting.jv_lines
          (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount)
        VALUES (@jv_id, @line, '20020', 'Accrued Initial Direct Costs', 'Cr', @idc,
                'IDC accrued - legal fees, broker commission, registration costs',
                @currency, @idc);
        SET @line = @line + 1;
      END

      -- Line 4: Dr Lease Incentives Received (if > 0) - cash/benefit received from lessor
      IF @lease_incentives > 0
      BEGIN
        INSERT INTO accounting.jv_lines
          (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, base_amount)
        VALUES (@jv_id, @line, '11000', 'Bank Account - QAR Operating', 'Dr', @lease_incentives,
                'Lease incentives received from lessor (cash/rent-free benefit)',
                @currency, @lease_incentives);
        SET @line = @line + 1;
      END

      -- Line 5+6: Security Deposit (if > 0)
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
  `);
  console.log('1. SP fixed - no more double-counting IDC');

  // 2. Delete the incorrect JV and re-post
  await pool.request().query('DELETE FROM accounting.jv_lines WHERE jv_id=33');
  await pool.request().query('DELETE FROM accounting.journal_vouchers WHERE jv_id=33');
  console.log('2. Old JV deleted');

  const r = await pool.request()
    .input('contract_id', sql.Int, 36)
    .execute('accounting.sp_PostInitialRecognitionJV');
  console.log('3. JV re-posted:', JSON.stringify(r.recordset[0]));

  // 4. Verify
  const jvId = r.recordset[0].jv_id;
  const lines = await pool.request().query(`SELECT account_code, account_name, dr_cr, amount FROM accounting.jv_lines WHERE jv_id=${jvId} ORDER BY line_id`);
  let totalDr = 0, totalCr = 0;
  console.log('\n=== Day-1 JV Lines (Corrected) ===');
  lines.recordset.forEach(row => {
    const amt = Number(row.amount);
    if (row.dr_cr === 'Dr') totalDr += amt; else totalCr += amt;
    console.log(`  ${row.dr_cr} ${row.account_code} ${row.account_name}: QAR ${amt.toLocaleString('en', {minimumFractionDigits:2})}`);
  });
  console.log(`\n  Total Dr: QAR ${totalDr.toLocaleString('en', {minimumFractionDigits:2})}`);
  console.log(`  Total Cr: QAR ${totalCr.toLocaleString('en', {minimumFractionDigits:2})}`);
  console.log(`  Balanced: ${Math.abs(totalDr - totalCr) < 0.01}`);

  await pool.close();
}

run().catch(e => console.error('ERROR:', e.message));
