import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
};

async function main() {
  const pool = await sql.connect(config);

  // Drop if exists
  await pool.request().query(`IF OBJECT_ID('dbo.sp_PostMonthlyEntry', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_PostMonthlyEntry;`);

  // Create the SP
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_PostMonthlyEntry
      @ContractId INT,
      @MonthsToPost INT = 1
    AS
    BEGIN
      SET NOCOUNT ON;
      
      DECLARE @contract_ref VARCHAR(50), @term_months INT, @monthly_payment DECIMAL(18,2),
              @ibr DECIMAL(10,6), @rou_asset_value DECIMAL(18,2), @lease_liability DECIMAL(18,2),
              @commencement_date DATE, @currency CHAR(3), @deposit_amount DECIMAL(18,2);
      
      SELECT @contract_ref = contract_ref, @term_months = term_months,
             @monthly_payment = monthly_payment, @ibr = ibr,
             @rou_asset_value = rou_asset_value, @lease_liability = lease_liability_commence,
             @commencement_date = commencement_date, @currency = currency,
             @deposit_amount = ISNULL(deposit_amount, 0)
      FROM lease.contracts WHERE contract_id = @ContractId;
      
      IF @contract_ref IS NULL
      BEGIN
        RAISERROR('Contract not found', 16, 1);
        RETURN;
      END
      
      DECLARE @monthly_rate DECIMAL(18,10) = @ibr / 12.0;
      DECLARE @monthly_depreciation DECIMAL(18,2) = ROUND(@rou_asset_value / CAST(@term_months AS DECIMAL(18,2)), 2);
      
      -- Find how many months already posted
      DECLARE @already_posted INT;
      SELECT @already_posted = COUNT(*) FROM lease.amortisation_schedule 
      WHERE contract_id = @ContractId AND posting_status = 'Posted';
      
      IF @already_posted >= @term_months
      BEGIN
        RAISERROR('All months already posted for this contract', 16, 1);
        RETURN;
      END
      
      IF @already_posted + @MonthsToPost > @term_months
        SET @MonthsToPost = @term_months - @already_posted;
      
      -- Replay schedule to current position
      DECLARE @opening_liability DECIMAL(18,2) = @lease_liability;
      DECLARE @cumulative_depr DECIMAL(18,2) = 0;
      DECLARE @i INT = 0;
      
      WHILE @i < @already_posted
      BEGIN
        DECLARE @int_temp DECIMAL(18,2) = ROUND(@opening_liability * @monthly_rate, 2);
        DECLARE @prin_temp DECIMAL(18,2) = @monthly_payment - @int_temp;
        SET @opening_liability = @opening_liability - @prin_temp;
        SET @cumulative_depr = @cumulative_depr + @monthly_depreciation;
        SET @i = @i + 1;
      END
      
      -- Post the requested months
      DECLARE @month_num INT = @already_posted + 1;
      DECLARE @months_posted_count INT = 0;
      DECLARE @total_interest DECIMAL(18,2) = 0;
      DECLARE @total_principal DECIMAL(18,2) = 0;
      DECLARE @total_depreciation_sum DECIMAL(18,2) = 0;
      
      CREATE TABLE #posted_results (
        month_num INT,
        period_date DATE,
        jv_payment_id INT,
        jv_payment_number VARCHAR(30),
        jv_depreciation_id INT,
        jv_depreciation_number VARCHAR(30),
        interest_amount DECIMAL(18,2),
        principal_amount DECIMAL(18,2),
        payment_amount DECIMAL(18,2),
        depreciation_amount DECIMAL(18,2),
        opening_liability DECIMAL(18,2),
        closing_liability DECIMAL(18,2),
        rou_nbv DECIMAL(18,2)
      );
      
      WHILE @months_posted_count < @MonthsToPost
      BEGIN
        DECLARE @period_date DATE = DATEADD(MONTH, @month_num - 1, @commencement_date);
        DECLARE @interest DECIMAL(18,2) = ROUND(@opening_liability * @monthly_rate, 2);
        DECLARE @principal DECIMAL(18,2) = @monthly_payment - @interest;
        DECLARE @closing_liability DECIMAL(18,2) = @opening_liability - @principal;
        
        -- Last month: zero out liability
        IF @month_num = @term_months
        BEGIN
          SET @principal = @opening_liability;
          SET @interest = @monthly_payment - @principal;
          SET @closing_liability = 0;
        END
        
        DECLARE @period_year INT = YEAR(@period_date);
        DECLARE @period_month INT = MONTH(@period_date);
        
        -- ═══ JV 1: Lease Payment ═══
        DECLARE @jv_pay_number VARCHAR(30);
        DECLARE @max_seq_pay INT;
        SELECT @max_seq_pay = ISNULL(MAX(CAST(RIGHT(jv_number, 5) AS INT)), 0)
        FROM accounting.journal_vouchers 
        WHERE jv_number LIKE 'JV-' + FORMAT(@period_date, 'yyyyMM') + '-%';
        
        SET @jv_pay_number = 'JV-' + FORMAT(@period_date, 'yyyyMM') + '-' + RIGHT('00000' + CAST(@max_seq_pay + 1 AS VARCHAR), 5);
        
        INSERT INTO accounting.journal_vouchers 
          (jv_number, jv_type, period_year, period_month, posting_date, description, contract_id, source_ref, currency, total_debit, total_credit, status, created_by, created_at)
        VALUES 
          (@jv_pay_number, 'Monthly Lease Payment', @period_year, @period_month, @period_date,
           'Monthly lease payment - Month ' + CAST(@month_num AS VARCHAR) + '/' + CAST(@term_months AS VARCHAR) + ' - ' + @contract_ref,
           @ContractId, @contract_ref, @currency, @monthly_payment, @monthly_payment, 'Posted', 'system', GETUTCDATE());
        
        DECLARE @jv_pay_id INT = SCOPE_IDENTITY();
        
        -- Dr Interest Expense
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
        VALUES (@jv_pay_id, 1, '5200', 'IFRS 16 Interest Expense', 'Dr', @interest,
          'Interest on lease liability - Month ' + CAST(@month_num AS VARCHAR),
          @contract_ref, @currency,
          'Interest Expense = Opening Liability x Monthly Rate' + CHAR(10) +
          'Interest = ' + FORMAT(@opening_liability, 'N2') + ' x (' + FORMAT(@ibr * 100, 'N4') + '% / 12)' + CHAR(10) +
          'Interest = ' + FORMAT(@opening_liability, 'N2') + ' x ' + FORMAT(@monthly_rate, 'N8') + CHAR(10) +
          'Interest = ' + FORMAT(@interest, 'N2') + ' ' + RTRIM(@currency));
        
        -- Dr Lease Liability (Principal)
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
        VALUES (@jv_pay_id, 2, '2130', 'Lease Liability - Current', 'Dr', @principal,
          'Principal reduction - Month ' + CAST(@month_num AS VARCHAR),
          @contract_ref, @currency,
          'Principal = Monthly Payment - Interest' + CHAR(10) +
          'Principal = ' + FORMAT(@monthly_payment, 'N2') + ' - ' + FORMAT(@interest, 'N2') + CHAR(10) +
          'Principal = ' + FORMAT(@principal, 'N2') + ' ' + RTRIM(@currency) + CHAR(10) + CHAR(10) +
          'Closing Liability = ' + FORMAT(@opening_liability, 'N2') + ' - ' + FORMAT(@principal, 'N2') + ' = ' + FORMAT(@closing_liability, 'N2'));
        
        -- Cr Cash/Bank
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
        VALUES (@jv_pay_id, 3, '1110', 'Cash and Cash Equivalents', 'Cr', @monthly_payment,
          'Lease payment to lessor - Month ' + CAST(@month_num AS VARCHAR),
          @contract_ref, @currency,
          'Cash Payment = Fixed Monthly Lease Payment = ' + FORMAT(@monthly_payment, 'N2') + ' ' + RTRIM(@currency) + CHAR(10) +
          'Split: Interest ' + FORMAT(@interest, 'N2') + ' + Principal ' + FORMAT(@principal, 'N2'));
        
        -- ═══ JV 2: Depreciation ═══
        DECLARE @jv_dep_number VARCHAR(30);
        DECLARE @max_seq_dep INT;
        SELECT @max_seq_dep = ISNULL(MAX(CAST(RIGHT(jv_number, 5) AS INT)), 0)
        FROM accounting.journal_vouchers 
        WHERE jv_number LIKE 'JV-' + FORMAT(@period_date, 'yyyyMM') + '-%';
        
        SET @jv_dep_number = 'JV-' + FORMAT(@period_date, 'yyyyMM') + '-' + RIGHT('00000' + CAST(@max_seq_dep + 1 AS VARCHAR), 5);
        
        INSERT INTO accounting.journal_vouchers 
          (jv_number, jv_type, period_year, period_month, posting_date, description, contract_id, source_ref, currency, total_debit, total_credit, status, created_by, created_at)
        VALUES 
          (@jv_dep_number, 'Monthly Depreciation', @period_year, @period_month, @period_date,
           'ROU depreciation - Month ' + CAST(@month_num AS VARCHAR) + '/' + CAST(@term_months AS VARCHAR) + ' - ' + @contract_ref,
           @ContractId, @contract_ref, @currency, @monthly_depreciation, @monthly_depreciation, 'Posted', 'system', GETUTCDATE());
        
        DECLARE @jv_dep_id INT = SCOPE_IDENTITY();
        
        -- Dr Depreciation Expense
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
        VALUES (@jv_dep_id, 1, '5100', 'IFRS 16 Depreciation - ROU Assets', 'Dr', @monthly_depreciation,
          'ROU Asset depreciation - Month ' + CAST(@month_num AS VARCHAR),
          @contract_ref, @currency,
          'Monthly Depreciation = ROU Asset / Lease Term' + CHAR(10) +
          'Depreciation = ' + FORMAT(@rou_asset_value, 'N2') + ' / ' + CAST(@term_months AS VARCHAR) + ' months' + CHAR(10) +
          'Depreciation = ' + FORMAT(@monthly_depreciation, 'N2') + ' ' + RTRIM(@currency) + ' per month' + CHAR(10) + CHAR(10) +
          'Cumulative after Month ' + CAST(@month_num AS VARCHAR) + ' = ' + FORMAT(@cumulative_depr + @monthly_depreciation, 'N2') + CHAR(10) +
          'ROU NBV = ' + FORMAT(@rou_asset_value - @cumulative_depr - @monthly_depreciation, 'N2'));
        
        -- Cr Accumulated Depreciation
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
        VALUES (@jv_dep_id, 2, '1210', 'Accumulated Depreciation - ROU Assets', 'Cr', @monthly_depreciation,
          'Accumulated depreciation - Month ' + CAST(@month_num AS VARCHAR),
          @contract_ref, @currency,
          'Accumulated Depreciation += ' + FORMAT(@monthly_depreciation, 'N2') + CHAR(10) +
          'Cumulative total = ' + FORMAT(@cumulative_depr + @monthly_depreciation, 'N2') + ' ' + RTRIM(@currency));
        
        -- Update cumulative
        SET @cumulative_depr = @cumulative_depr + @monthly_depreciation;
        
        -- Insert amortisation schedule row
        INSERT INTO lease.amortisation_schedule 
          (contract_id, period_date, opening_liability, interest_expense, payment, principal, closing_liability, rou_nbv, depreciation, cumulative_depr, posting_status, posted_at, posted_by)
        VALUES 
          (@ContractId, @period_date, @opening_liability, @interest, @monthly_payment, @principal, @closing_liability,
           @rou_asset_value - @cumulative_depr, @monthly_depreciation, @cumulative_depr, 'Posted', GETUTCDATE(), 'system');
        
        -- Store results
        INSERT INTO #posted_results VALUES (
          @month_num, @period_date, @jv_pay_id, @jv_pay_number, @jv_dep_id, @jv_dep_number,
          @interest, @principal, @monthly_payment, @monthly_depreciation, @opening_liability, @closing_liability,
          @rou_asset_value - @cumulative_depr
        );
        
        -- Update running totals
        SET @total_interest = @total_interest + @interest;
        SET @total_principal = @total_principal + @principal;
        SET @total_depreciation_sum = @total_depreciation_sum + @monthly_depreciation;
        SET @opening_liability = @closing_liability;
        SET @month_num = @month_num + 1;
        SET @months_posted_count = @months_posted_count + 1;
      END
      
      -- Return posted details
      SELECT * FROM #posted_results ORDER BY month_num;
      
      -- Return summary
      SELECT @months_posted_count AS months_posted, @total_interest AS total_interest, 
             @total_principal AS total_principal, @total_depreciation_sum AS total_depreciation,
             @already_posted + @months_posted_count AS total_months_posted, @term_months AS total_term_months,
             @opening_liability AS current_liability, @rou_asset_value - @cumulative_depr AS current_rou_nbv;
      
      DROP TABLE #posted_results;
    END
  `);

  console.log('sp_PostMonthlyEntry created successfully');

  // Test it with contract 42, 1 month
  try {
    const result = await pool.request()
      .input('ContractId', sql.Int, 42)
      .input('MonthsToPost', sql.Int, 1)
      .execute('sp_PostMonthlyEntry');
    
    console.log('\nTest: Posted 1 month for contract 42');
    console.log('Details:', JSON.stringify(result.recordsets[0]));
    console.log('Summary:', JSON.stringify(result.recordsets[1]));
  } catch (e) {
    console.error('Test error:', e.message);
  }

  await pool.close();
}

main().catch(e => { console.error(e); process.exit(1); });
