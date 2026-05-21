import sql from 'mssql';

const config = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true, requestTimeout: 30000 }
};

async function main() {
  const pool = await sql.connect(config);
  
  let r = await pool.request().query(`SELECT OBJECT_DEFINITION(OBJECT_ID('accounting.sp_GenerateMonthlyJVsForSelected')) AS def`);
  let def = r.recordset[0].def;

  // 1. Add new columns to @t table definition
  def = def.replace(
    'payment DECIMAL(18,4)',
    'payment DECIMAL(18,4), opening_liability DECIMAL(18,4), closing_liability DECIMAL(18,4), rou_nbv DECIMAL(18,4), cumulative_depr DECIMAL(18,4)'
  );

  // 2. Add those columns to the INSERT INTO @t SELECT
  def = def.replace(
    'a.interest_expense, a.principal, a.depreciation, a.payment',
    'a.interest_expense, a.principal, a.depreciation, a.payment, a.opening_liability, a.closing_liability, a.rou_nbv, a.cumulative_depr'
  );

  // 3. Add cursor variables
  def = def.replace(
    '@int DECIMAL(18,4), @prin DECIMAL(18,4), @depr DECIMAL(18,4), @pay DECIMAL(18,4);',
    '@int DECIMAL(18,4), @prin DECIMAL(18,4), @depr DECIMAL(18,4), @pay DECIMAL(18,4), @open_liab DECIMAL(18,4), @close_liab DECIMAL(18,4), @rou_nbv DECIMAL(18,4), @cum_depr DECIMAL(18,4);'
  );

  // 4. Update FETCH NEXT
  def = def.replaceAll(
    'FETCH NEXT FROM c1 INTO @sid, @pdate, @pyear, @pmonth, @int, @prin, @depr, @pay;',
    'FETCH NEXT FROM c1 INTO @sid, @pdate, @pyear, @pmonth, @int, @prin, @depr, @pay, @open_liab, @close_liab, @rou_nbv, @cum_depr;'
  );

  // 5. Add @ibr_rate, @rou_val, @term_m declarations after @cref declaration
  def = def.replace(
    'DECLARE @cref VARCHAR(50), @cur VARCHAR(10), @atype VARCHAR(100);',
    'DECLARE @cref VARCHAR(50), @cur VARCHAR(10), @atype VARCHAR(100);\n      DECLARE @ibr_rate DECIMAL(10,6), @rou_val DECIMAL(18,4), @term_m INT;'
  );

  // 6. Set @ibr_rate, @rou_val, @term_m from contract - add after existing contract SELECT
  def = def.replace(
    'FROM lease.contracts WHERE contract_id = @contract_id;',
    `FROM lease.contracts WHERE contract_id = @contract_id;
      SELECT @ibr_rate = ibr, @rou_val = rou_asset_value, @term_m = term_months FROM lease.contracts WHERE contract_id = @contract_id;`
  );

  // 7. Update interest Dr INSERT
  const intDrOld = `INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency)
            VALUES (@jid, @seq, @int_a, @int_n, 'Dr', @int, 'Interest expense - unwinding of discount (' + @period_key + ')', @cref, @cur);`;
  const intDrNew = `INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
            VALUES (@jid, @seq, @int_a, @int_n, 'Dr', @int, 'Interest expense - unwinding of discount (' + @period_key + ')', @cref, @cur,
              'Interest Expense (Period ' + CAST(@period_seq AS VARCHAR) + '/' + CAST(@term_m AS VARCHAR) + '):' + CHAR(10) + 'Opening Liability = ' + FORMAT(@open_liab, 'N2') + ' QAR' + CHAR(10) + 'Monthly IBR = ' + FORMAT(@ibr_rate*100, 'N2') + '% / 12 = ' + FORMAT(@ibr_rate*100.0/12, 'N4') + '%' + CHAR(10) + 'Interest = ' + FORMAT(@open_liab, 'N2') + ' x ' + FORMAT(@ibr_rate*100.0/12, 'N4') + '%' + CHAR(10) + '= ' + FORMAT(@int, 'N2') + ' QAR' + CHAR(10) + 'Closing Liability = ' + FORMAT(@close_liab, 'N2') + ' QAR');`;
  def = def.replace(intDrOld, intDrNew);

  // 8. Update interest Cr INSERT
  const intCrOld = `INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency)
            VALUES (@jid, @seq, @liab_a, @liab_n, 'Cr', @int, 'Lease liability interest accrual (' + @period_key + ')', @cref, @cur);`;
  const intCrNew = `INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
            VALUES (@jid, @seq, @liab_a, @liab_n, 'Cr', @int, 'Lease liability interest accrual (' + @period_key + ')', @cref, @cur,
              'Interest Expense (Period ' + CAST(@period_seq AS VARCHAR) + '/' + CAST(@term_m AS VARCHAR) + '):' + CHAR(10) + 'Opening Liability = ' + FORMAT(@open_liab, 'N2') + ' QAR' + CHAR(10) + 'Monthly IBR = ' + FORMAT(@ibr_rate*100, 'N2') + '% / 12 = ' + FORMAT(@ibr_rate*100.0/12, 'N4') + '%' + CHAR(10) + 'Interest = ' + FORMAT(@open_liab, 'N2') + ' x ' + FORMAT(@ibr_rate*100.0/12, 'N4') + '%' + CHAR(10) + '= ' + FORMAT(@int, 'N2') + ' QAR' + CHAR(10) + 'Closing Liability = ' + FORMAT(@close_liab, 'N2') + ' QAR');`;
  def = def.replace(intCrOld, intCrNew);

  // 9. Update depreciation Dr INSERT
  const deprDrOld = `INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency)
            VALUES (@jid, @seq, @depr_a, @depr_n, 'Dr', @depr, 'ROU asset depreciation - straight-line (' + @period_key + ')', @cref, @cur);`;
  const deprDrNew = `INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
            VALUES (@jid, @seq, @depr_a, @depr_n, 'Dr', @depr, 'ROU asset depreciation - straight-line (' + @period_key + ')', @cref, @cur,
              'Depreciation (Period ' + CAST(@period_seq AS VARCHAR) + '/' + CAST(@term_m AS VARCHAR) + '):' + CHAR(10) + 'ROU Asset = ' + FORMAT(@rou_val, 'N2') + ' QAR' + CHAR(10) + 'Lease Term = ' + CAST(@term_m AS VARCHAR) + ' months' + CHAR(10) + 'Monthly Depr = ' + FORMAT(@rou_val, 'N2') + ' / ' + CAST(@term_m AS VARCHAR) + CHAR(10) + '= ' + FORMAT(@depr, 'N2') + ' QAR (straight-line)' + CHAR(10) + 'Cumulative Depr = ' + FORMAT(@cum_depr, 'N2') + ' QAR' + CHAR(10) + 'ROU NBV = ' + FORMAT(@rou_nbv, 'N2') + ' QAR');`;
  def = def.replace(deprDrOld, deprDrNew);

  // 10. Update depreciation Cr INSERT
  const deprCrOld = `INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency)
            VALUES (@jid, @seq, @acc_a, @acc_n, 'Cr', @depr, 'Accumulated depreciation on ROU asset (' + @period_key + ')', @cref, @cur);`;
  const deprCrNew = `INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
            VALUES (@jid, @seq, @acc_a, @acc_n, 'Cr', @depr, 'Accumulated depreciation on ROU asset (' + @period_key + ')', @cref, @cur,
              'Depreciation (Period ' + CAST(@period_seq AS VARCHAR) + '/' + CAST(@term_m AS VARCHAR) + '):' + CHAR(10) + 'ROU Asset = ' + FORMAT(@rou_val, 'N2') + ' QAR' + CHAR(10) + 'Lease Term = ' + CAST(@term_m AS VARCHAR) + ' months' + CHAR(10) + 'Monthly Depr = ' + FORMAT(@rou_val, 'N2') + ' / ' + CAST(@term_m AS VARCHAR) + CHAR(10) + '= ' + FORMAT(@depr, 'N2') + ' QAR (straight-line)' + CHAR(10) + 'Cumulative Depr = ' + FORMAT(@cum_depr, 'N2') + ' QAR' + CHAR(10) + 'ROU NBV = ' + FORMAT(@rou_nbv, 'N2') + ' QAR');`;
  def = def.replace(deprCrOld, deprCrNew);

  // Replace CREATE with ALTER
  def = def.replace('CREATE PROCEDURE', 'ALTER PROCEDURE');

  await pool.request().batch(def);
  console.log('SUCCESS: SP updated with calc_explanation in all INSERT statements');
  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
