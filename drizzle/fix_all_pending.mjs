/**
 * Fix all pending items:
 * 1. Fix calc_explanation IBR display formatting in SP
 * 2. Create sp_HardDeleteLease SP
 * 3. Recreate lessees (10 real estate + 5 car leasing)
 */
import sql from 'mssql';

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};

async function main() {
  const pool = await sql.connect(cfg);

  // ─── 1. Fix sp_PostInitialRecognitionJV calc_explanation IBR formatting ───
  console.log('1️⃣  Fixing sp_PostInitialRecognitionJV...');
  await pool.request().query(`DROP PROCEDURE IF EXISTS accounting.sp_PostInitialRecognitionJV`);
  await pool.request().query(`
    CREATE PROCEDURE accounting.sp_PostInitialRecognitionJV
      @contract_id INT
    AS
    BEGIN
      SET NOCOUNT ON;

      -- Check if JV already exists
      IF EXISTS (SELECT 1 FROM accounting.journal_vouchers WHERE contract_id = @contract_id AND jv_type = 'Initial Recognition')
      BEGIN
        DECLARE @existing_jv NVARCHAR(50);
        SELECT @existing_jv = jv_number FROM accounting.journal_vouchers WHERE contract_id = @contract_id AND jv_type = 'Initial Recognition';
        SELECT 'ALREADY_EXISTS' AS result, @existing_jv AS existing_jv_number;
        RETURN;
      END

      -- Read contract values
      DECLARE @contract_ref NVARCHAR(50), @asset_type NVARCHAR(50);
      DECLARE @monthly_payment DECIMAL(18,2), @ibr DECIMAL(10,6), @term_months INT;
      DECLARE @rou_asset_value DECIMAL(18,2), @lease_liability DECIMAL(18,2);
      DECLARE @idc DECIMAL(18,2), @incentives DECIMAL(18,2), @deposit DECIMAL(18,2);
      DECLARE @commence_date DATE;

      SELECT
        @contract_ref = contract_ref,
        @asset_type = ISNULL(asset_type, 'Property'),
        @monthly_payment = ISNULL(monthly_payment, 0),
        @ibr = ISNULL(ibr, 0),
        @term_months = ISNULL(term_months, 0),
        @rou_asset_value = ISNULL(rou_asset_value, 0),
        @lease_liability = ISNULL(lease_liability_commence, 0),
        @idc = ISNULL(initial_direct_costs, 0),
        @incentives = ISNULL(lease_incentives, 0),
        @deposit = ISNULL(deposit_amount, 0),
        @commence_date = commencement_date
      FROM lease.contracts WHERE contract_id = @contract_id;

      IF @contract_ref IS NULL
      BEGIN
        RAISERROR('Contract not found', 16, 1);
        RETURN;
      END

      -- Determine GL codes by asset type
      DECLARE @rou_code VARCHAR(10), @rou_name NVARCHAR(200);
      DECLARE @liab_code VARCHAR(10), @liab_name NVARCHAR(200);

      IF @asset_type IN ('Vehicle', 'Vehicles', 'Fleet')
      BEGIN SET @rou_code = '10110'; SET @rou_name = 'Right-of-Use Asset - Vehicles'; SET @liab_code = '21030'; SET @liab_name = 'Lease Liability - Vehicles'; END
      ELSE IF @asset_type IN ('Equipment', 'IT', 'Network')
      BEGIN SET @rou_code = '10120'; SET @rou_name = 'Right-of-Use Asset - Equipment'; SET @liab_code = '21040'; SET @liab_name = 'Lease Liability - Equipment'; END
      ELSE IF @asset_type IN ('Tower', 'Tower Site', 'Towers')
      BEGIN SET @rou_code = '10140'; SET @rou_name = 'Right-of-Use Asset - Tower Sites'; SET @liab_code = '21060'; SET @liab_name = 'Lease Liability - Tower Sites'; END
      ELSE
      BEGIN SET @rou_code = '10100'; SET @rou_name = 'Right-of-Use Asset - Property'; SET @liab_code = '21020'; SET @liab_name = 'Lease Liability - Property'; END

      -- ROU debit = rou_asset_value (already includes IDC - Incentives)
      DECLARE @rou_dr DECIMAL(18,2) = @rou_asset_value;
      DECLARE @total_dr DECIMAL(18,2) = @rou_dr + @deposit;
      DECLARE @total_cr DECIMAL(18,2) = @lease_liability + @idc + @incentives + @deposit;

      -- Format IBR for display
      DECLARE @ibr_pct NVARCHAR(20) = CAST(CAST(@ibr * 100 AS DECIMAL(10,4)) AS NVARCHAR(20));
      DECLARE @monthly_r NVARCHAR(20) = CAST(CAST(@ibr / 12 AS DECIMAL(10,8)) AS NVARCHAR(20));

      -- Generate JV number
      DECLARE @period NVARCHAR(7) = FORMAT(@commence_date, 'yyyyMM');
      DECLARE @seq INT;
      SELECT @seq = ISNULL(MAX(CAST(RIGHT(jv_number, 5) AS INT)), 0) + 1
        FROM accounting.journal_vouchers WHERE jv_number LIKE 'JV-' + LEFT(@period, 4) + RIGHT(@period, 2) + '-%';
      DECLARE @jv_number NVARCHAR(50) = 'JV-' + LEFT(@period, 4) + RIGHT(@period, 2) + '-' + RIGHT('00000' + CAST(@seq AS NVARCHAR), 5);

      -- Insert JV header
      DECLARE @jv_id INT;
      INSERT INTO accounting.journal_vouchers (jv_number, jv_type, posting_date, period_year, period_month, contract_id, source_ref, description, total_debit, total_credit, status, created_by, created_at)
      VALUES (@jv_number, 'Initial Recognition', @commence_date, YEAR(@commence_date), MONTH(@commence_date), @contract_id, @contract_ref,
              'Day-1 Initial Recognition JV for ' + @contract_ref, @total_dr, @total_cr, 'Posted', 'system', GETUTCDATE());
      SET @jv_id = SCOPE_IDENTITY();

      -- Build calc explanations
      DECLARE @rou_calc NVARCHAR(MAX) = 'ROU Asset = PV of Lease Payments + Initial Direct Costs (IDC) - Lease Incentives' + CHAR(10)
        + 'ROU Asset = ' + FORMAT(@lease_liability, 'N2') + ' + ' + FORMAT(@idc, 'N2') + ' - ' + FORMAT(@incentives, 'N2') + CHAR(10)
        + 'ROU Asset = ' + FORMAT(@rou_dr, 'N2') + CHAR(10) + CHAR(10)
        + 'Where:' + CHAR(10)
        + '  Monthly Payment = ' + FORMAT(@monthly_payment, 'N2') + ' QAR' + CHAR(10)
        + '  IBR (annual) = ' + @ibr_pct + '%' + CHAR(10)
        + '  Monthly Rate (r) = ' + @ibr_pct + '% / 12 = ' + @monthly_r + CHAR(10)
        + '  Lease Term (n) = ' + CAST(@term_months AS NVARCHAR) + ' months' + CHAR(10)
        + '  PV = Monthly Payment x [(1 - (1 + r)^-n) / r]' + CHAR(10)
        + 'PV = ' + FORMAT(@monthly_payment, 'N2') + ' x [(1 - (1 + ' + @monthly_r + ')^-' + CAST(@term_months AS NVARCHAR) + ') / ' + @monthly_r + ']' + CHAR(10)
        + 'PV = ' + FORMAT(@lease_liability, 'N2');

      DECLARE @liab_calc NVARCHAR(MAX) = 'Lease Liability = PV of future lease payments discounted at IBR' + CHAR(10)
        + 'PV = Monthly Payment x [(1 - (1 + r)^-n) / r]' + CHAR(10)
        + 'PV = ' + FORMAT(@monthly_payment, 'N2') + ' x [(1 - (1 + ' + @monthly_r + ')^-' + CAST(@term_months AS NVARCHAR) + ') / ' + @monthly_r + ']' + CHAR(10)
        + 'PV = ' + FORMAT(@lease_liability, 'N2') + CHAR(10) + CHAR(10)
        + 'Where:' + CHAR(10)
        + '  Monthly Payment = ' + FORMAT(@monthly_payment, 'N2') + ' QAR' + CHAR(10)
        + '  IBR (annual) = ' + @ibr_pct + '%' + CHAR(10)
        + '  Monthly Rate (r) = ' + @ibr_pct + '% / 12 = ' + @monthly_r + CHAR(10)
        + '  Lease Term (n) = ' + CAST(@term_months AS NVARCHAR) + ' months';

      DECLARE @idc_calc NVARCHAR(MAX) = 'Initial Direct Costs (IDC) = Legal fees + Broker commissions + Registration costs' + CHAR(10)
        + 'IDC = ' + FORMAT(@idc, 'N2') + ' QAR' + CHAR(10)
        + 'These costs are capitalised into the ROU Asset and accrued as a liability until paid.';

      DECLARE @dep_calc NVARCHAR(MAX) = 'Security Deposit = Refundable deposit paid to lessor' + CHAR(10)
        + 'Deposit = ' + FORMAT(@deposit, 'N2') + ' QAR' + CHAR(10)
        + 'Recognised as a non-current asset (receivable) - refundable at lease end or termination.';

      DECLARE @bank_calc NVARCHAR(MAX) = 'Bank Payment for Security Deposit' + CHAR(10)
        + 'Amount = ' + FORMAT(@deposit, 'N2') + ' QAR' + CHAR(10)
        + 'Cash outflow from operating bank account to lessor for refundable security deposit.';

      DECLARE @incent_calc NVARCHAR(MAX) = 'Lease Incentives Received from Lessor' + CHAR(10)
        + 'Incentives = ' + FORMAT(@incentives, 'N2') + ' QAR' + CHAR(10)
        + 'Reduces the ROU Asset carrying value. Recognised as a credit (deferred income).';

      -- Insert JV lines
      DECLARE @line_seq INT = 1;

      -- Line 1: Dr ROU Asset
      INSERT INTO accounting.jv_lines (jv_id, line_seq, dr_cr, account_code, account_name, amount, description, calc_explanation)
      VALUES (@jv_id, @line_seq, 'Dr', @rou_code, @rou_name, @rou_dr, 'ROU Asset initial recognition', @rou_calc);
      SET @line_seq = @line_seq + 1;

      -- Line 2: Cr Lease Liability
      INSERT INTO accounting.jv_lines (jv_id, line_seq, dr_cr, account_code, account_name, amount, description, calc_explanation)
      VALUES (@jv_id, @line_seq, 'Cr', @liab_code, @liab_name, @lease_liability, 'Lease Liability = PV of future payments at IBR', @liab_calc);
      SET @line_seq = @line_seq + 1;

      -- Line 3: Cr Accrued IDC (only if IDC > 0)
      IF @idc > 0
      BEGIN
        INSERT INTO accounting.jv_lines (jv_id, line_seq, dr_cr, account_code, account_name, amount, description, calc_explanation)
        VALUES (@jv_id, @line_seq, 'Cr', '20020', 'Accrued Initial Direct Costs', @idc, 'IDC accrued', @idc_calc);
        SET @line_seq = @line_seq + 1;
      END

      -- Line 4: Cr Lease Incentives (only if > 0)
      IF @incentives > 0
      BEGIN
        INSERT INTO accounting.jv_lines (jv_id, line_seq, dr_cr, account_code, account_name, amount, description, calc_explanation)
        VALUES (@jv_id, @line_seq, 'Cr', '20030', 'Lease Incentives Received', @incentives, 'Lease incentives received from lessor', @incent_calc);
        SET @line_seq = @line_seq + 1;
      END

      -- Line 5: Dr Security Deposit (only if > 0)
      IF @deposit > 0
      BEGIN
        INSERT INTO accounting.jv_lines (jv_id, line_seq, dr_cr, account_code, account_name, amount, description, calc_explanation)
        VALUES (@jv_id, @line_seq, 'Dr', '12020', 'Security Deposit - Lease', @deposit, 'Security deposit paid to lessor', @dep_calc);
        SET @line_seq = @line_seq + 1;

        INSERT INTO accounting.jv_lines (jv_id, line_seq, dr_cr, account_code, account_name, amount, description, calc_explanation)
        VALUES (@jv_id, @line_seq, 'Cr', '11000', 'Bank Account - QAR Operating', @deposit, 'Bank payment of security deposit', @bank_calc);
      END

      SELECT 'SUCCESS' AS result, @jv_id AS jv_id, @jv_number AS jv_number, @rou_dr AS rou_debit, @lease_liability AS liability_credit;
    END
  `);
  console.log('  ✅ sp_PostInitialRecognitionJV recreated with correct IBR formatting');

  // ─── 2. Create sp_HardDeleteLease ───
  console.log('\n2️⃣  Creating sp_HardDeleteLease...');
  await pool.request().query(`DROP PROCEDURE IF EXISTS lease.sp_HardDeleteLease`);

  // Get all lease schema tables that have contract_id
  const tablesResult = await pool.request().query(`
    SELECT t.name AS table_name
    FROM sys.tables t
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON t.object_id = c.object_id
    WHERE s.name = 'lease' AND c.name = 'contract_id' AND t.name != 'contracts'
    ORDER BY t.name
  `);
  const leaseChildTables = tablesResult.recordset.map(r => `lease.[${r.table_name}]`);
  console.log(`  Found ${leaseChildTables.length} lease child tables with contract_id`);

  // Build DELETE statements for all child tables
  const deleteStatements = leaseChildTables.map(t => `        DELETE FROM ${t} WHERE contract_id = @contract_id;`).join('\n');

  await pool.request().query(`
    CREATE PROCEDURE lease.sp_HardDeleteLease
      @contract_id INT
    AS
    BEGIN
      SET NOCOUNT ON;

      IF NOT EXISTS (SELECT 1 FROM lease.contracts WHERE contract_id = @contract_id)
      BEGIN
        RAISERROR('Contract not found', 16, 1);
        RETURN;
      END

      DECLARE @contract_ref NVARCHAR(50);
      SELECT @contract_ref = contract_ref FROM lease.contracts WHERE contract_id = @contract_id;

      BEGIN TRY
        BEGIN TRANSACTION;

        -- Delete JV lines then JV headers
        DELETE jl FROM accounting.jv_lines jl
          INNER JOIN accounting.journal_vouchers jv ON jl.jv_id = jv.jv_id
          WHERE jv.contract_id = @contract_id;
        DELETE FROM accounting.journal_vouchers WHERE contract_id = @contract_id;

        -- Delete all lease child tables
${deleteStatements}

        -- Delete payables
        DELETE pl FROM payables.payment_run_lines pl
          INNER JOIN payables.invoices inv ON pl.invoice_id = inv.invoice_id
          WHERE inv.contract_id = @contract_id;
        DELETE FROM payables.invoices WHERE contract_id = @contract_id;

        -- Delete workflow instances
        DELETE ut FROM workflow.user_tasks ut
          INNER JOIN workflow.process_instances pi ON ut.instance_id = pi.instance_id
          WHERE pi.business_key = CAST(@contract_id AS NVARCHAR(50)) AND pi.business_entity = 'Lease';
        DELETE FROM workflow.process_instances WHERE business_key = CAST(@contract_id AS NVARCHAR(50)) AND business_entity = 'Lease';

        -- Delete maker-checker queue
        DELETE FROM security.maker_checker_queue WHERE record_id = CAST(@contract_id AS NVARCHAR(50)) AND record_type = 'Lease';

        -- Delete the contract itself
        DELETE FROM lease.contracts WHERE contract_id = @contract_id;

        COMMIT TRANSACTION;
        SELECT 'SUCCESS' AS result, @contract_ref AS deleted_contract_ref;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
      END CATCH
    END
  `);
  console.log('  ✅ sp_HardDeleteLease created');

  // ─── 3. Recreate lessees: 10 real estate + 5 car leasing ───
  console.log('\n3️⃣  Recreating lessees (10 real estate + 5 car leasing)...');
  await pool.request().query('DELETE FROM lessee.lessees');
  console.log('  Cleared existing lessees');

  const lessees = [
    // 10 Real Estate Companies (Qatar-based lessors/property companies)
    { code: 'RE-001', name: 'Barwa Real Estate Group', trade: 'Barwa', type: 'Corporate', parent: null, reg: 'CR-QA-100001', vat: 'QA200100001', sector: 'Real Estate', rating: 'A-', city: 'Doha', address: 'Barwa Tower, West Bay, Doha', po: '27777', contact: 'Salman Al-Mohannadi', email: 'leasing@barwa.com.qa', phone: '+974 4494 4444' },
    { code: 'RE-002', name: 'Msheireb Properties', trade: 'Msheireb', type: 'Corporate', parent: 'Qatar Foundation', reg: 'CR-QA-100002', vat: 'QA200100002', sector: 'Real Estate Development', rating: 'A', city: 'Doha', address: 'Msheireb Downtown Doha', po: '2828', contact: 'Noor Al-Suwaidi', email: 'leasing@msheireb.com', phone: '+974 4495 0000' },
    { code: 'RE-003', name: 'Qatari Diar Real Estate', trade: 'Qatari Diar', type: 'Government', parent: 'Qatar Investment Authority', reg: 'CR-QA-100003', vat: 'QA200100003', sector: 'Real Estate Investment', rating: 'AAA', city: 'Doha', address: 'Qatari Diar Tower, Lusail', po: '23833', contact: 'Khalid Al-Rumaihi', email: 'property@qataridiar.com', phone: '+974 4496 8888' },
    { code: 'RE-004', name: 'United Development Company (UDC)', trade: 'UDC', type: 'Corporate', parent: null, reg: 'CR-QA-100004', vat: 'QA200100004', sector: 'Real Estate & Infrastructure', rating: 'BBB+', city: 'Doha', address: 'The Pearl-Qatar, Porto Arabia', po: '17155', contact: 'Ibrahim Al-Mannai', email: 'leasing@udcqatar.com', phone: '+974 4495 5555' },
    { code: 'RE-005', name: 'Ezdan Holding Group', trade: 'Ezdan', type: 'Corporate', parent: null, reg: 'CR-QA-100005', vat: 'QA200100005', sector: 'Real Estate', rating: 'BBB', city: 'Doha', address: 'Ezdan Tower, Al Sadd', po: '7755', contact: 'Thani Al-Thani', email: 'leasing@ezdan.com.qa', phone: '+974 4444 7777' },
    { code: 'RE-006', name: 'Al Asmakh Real Estate', trade: 'Al Asmakh', type: 'Corporate', parent: null, reg: 'CR-QA-100006', vat: 'QA200100006', sector: 'Property Management', rating: 'BBB', city: 'Doha', address: 'Al Asmakh Tower, C-Ring Road', po: '22345', contact: 'Ahmed Al-Asmakh', email: 'leasing@alasmakh.com', phone: '+974 4436 6666' },
    { code: 'RE-007', name: 'Lusail Real Estate Development', trade: 'LREDC', type: 'Government', parent: 'Qatari Diar', reg: 'CR-QA-100007', vat: 'QA200100007', sector: 'Real Estate Development', rating: 'A+', city: 'Lusail', address: 'Lusail City, Marina District', po: '23000', contact: 'Hamad Al-Hajri', email: 'leasing@lusail.com', phone: '+974 4495 1111' },
    { code: 'RE-008', name: 'Al Bandary Real Estate', trade: 'Al Bandary', type: 'Corporate', parent: null, reg: 'CR-QA-100008', vat: 'QA200100008', sector: 'Commercial Real Estate', rating: 'BBB+', city: 'Doha', address: 'Al Bandary Tower, Salwa Road', po: '15000', contact: 'Faisal Al-Bandary', email: 'leasing@albandary.com', phone: '+974 4442 8888' },
    { code: 'RE-009', name: 'Katara Hospitality', trade: 'Katara', type: 'Corporate', parent: null, reg: 'CR-QA-100009', vat: 'QA200100009', sector: 'Hospitality & Real Estate', rating: 'A', city: 'Doha', address: 'Katara Cultural Village, West Bay', po: '4488', contact: 'Hamad Al-Attiyah', email: 'estates@katara.net', phone: '+974 4408 0000' },
    { code: 'RE-010', name: 'Ooredoo Real Estate (Aamal)', trade: 'Aamal', type: 'Corporate', parent: 'Aamal Company', reg: 'CR-QA-100010', vat: 'QA200100010', sector: 'Diversified Real Estate', rating: 'A-', city: 'Doha', address: 'Aamal Tower, West Bay', po: '202', contact: 'Rashid Al-Naimi', email: 'property@aamal.com.qa', phone: '+974 4409 0000' },
    // 5 Large Car Leasing Companies
    { code: 'CL-001', name: 'Al Mana Leasing & Fleet Management', trade: 'Al Mana Fleet', type: 'Corporate', parent: 'Al Mana Group', reg: 'CR-QA-200001', vat: 'QA300200001', sector: 'Vehicle Leasing', rating: 'A-', city: 'Doha', address: 'Al Mana HQ, Salwa Road', po: '994', contact: 'Nasser Al-Mana', email: 'fleet@almana.com', phone: '+974 4455 1111' },
    { code: 'CL-002', name: 'Q-Auto Leasing (Al Abdulghani)', trade: 'Q-Auto', type: 'Corporate', parent: 'Al Abdulghani Motors', reg: 'CR-QA-200002', vat: 'QA300200002', sector: 'Vehicle Leasing', rating: 'A', city: 'Doha', address: 'Al Abdulghani Tower, Industrial Area', po: '1555', contact: 'Khalifa Al-Abdulghani', email: 'leasing@qauto.com.qa', phone: '+974 4462 2222' },
    { code: 'CL-003', name: 'Europcar Qatar', trade: 'Europcar', type: 'Corporate', parent: 'Europcar International', reg: 'CR-QA-200003', vat: 'QA300200003', sector: 'Vehicle Leasing & Rental', rating: 'BBB+', city: 'Doha', address: 'Hamad International Airport, Arrivals', po: '30300', contact: 'David Thompson', email: 'fleet@europcar.qa', phone: '+974 4462 3333' },
    { code: 'CL-004', name: 'Hertz Qatar (Jaidah Group)', trade: 'Hertz Qatar', type: 'Corporate', parent: 'Jaidah Group', reg: 'CR-QA-200004', vat: 'QA300200004', sector: 'Vehicle Leasing & Rental', rating: 'BBB+', city: 'Doha', address: 'Jaidah Square, Airport Road', po: '150', contact: 'Tariq Al-Jaidah', email: 'fleet@hertzqatar.com', phone: '+974 4462 4444' },
    { code: 'CL-005', name: 'National Car Rental Qatar', trade: 'National Qatar', type: 'Corporate', parent: 'Mannai Corporation', reg: 'CR-QA-200005', vat: 'QA300200005', sector: 'Vehicle Leasing & Rental', rating: 'BBB', city: 'Doha', address: 'Mannai HQ, Salwa Road', po: '76', contact: 'Bader Al-Mannai', email: 'fleet@nationalqatar.com', phone: '+974 4455 5555' },
  ];

  for (const l of lessees) {
    await pool.request()
      .input('code', sql.VarChar(30), l.code)
      .input('name', sql.NVarChar(200), l.name)
      .input('trade', sql.NVarChar(200), l.trade)
      .input('type', sql.VarChar(30), l.type)
      .input('parent', sql.NVarChar(200), l.parent)
      .input('reg', sql.VarChar(100), l.reg)
      .input('vat', sql.VarChar(100), l.vat)
      .input('sector', sql.NVarChar(100), l.sector)
      .input('rating', sql.VarChar(20), l.rating)
      .input('country', sql.VarChar(100), 'Qatar')
      .input('city', sql.NVarChar(100), l.city)
      .input('address', sql.NVarChar(500), l.address)
      .input('po', sql.VarChar(50), l.po)
      .input('contact', sql.NVarChar(200), l.contact)
      .input('email', sql.VarChar(200), l.email)
      .input('phone', sql.VarChar(50), l.phone)
      .query(`INSERT INTO lessee.lessees (lessee_code, lessee_name, trade_name, entity_type, parent_company, registration_no, tax_vat_no, industry_sector, credit_rating, country, city, address, po_box, contact_person, contact_email, contact_phone, status, created_at, updated_at)
        VALUES (@code, @name, @trade, @type, @parent, @reg, @vat, @sector, @rating, @country, @city, @address, @po, @contact, @email, @phone, 'Active', GETUTCDATE(), GETUTCDATE())`);
    console.log(`  ✓ ${l.code} ${l.name}`);
  }

  const cnt = await pool.request().query('SELECT COUNT(*) as cnt FROM lessee.lessees');
  console.log(`\n  ✅ Total lessees: ${cnt.recordset[0].cnt}`);

  // ─── 4. Update existing JV with correct calc_explanation ───
  console.log('\n4️⃣  Updating existing JV calc_explanation...');
  // Delete existing JV for contract 37 and re-post
  await pool.request().query(`DELETE jl FROM accounting.jv_lines jl INNER JOIN accounting.journal_vouchers jv ON jl.jv_id = jv.jv_id WHERE jv.contract_id = 37`);
  await pool.request().query(`DELETE FROM accounting.journal_vouchers WHERE contract_id = 37`);
  const req = pool.request();
  req.input('contract_id', 37);
  const result = await req.execute('accounting.sp_PostInitialRecognitionJV');
  console.log('  ✅ JV re-posted:', result.recordset[0]);

  pool.close();
  console.log('\n🎉 All fixes applied!');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
