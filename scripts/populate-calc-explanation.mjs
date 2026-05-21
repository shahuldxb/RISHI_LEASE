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

  // Get all monthly JVs
  const jvs = await pool.request().query(`
    SELECT jv.jv_id, jv.period_seq, jv.contract_id, jv.period_year, jv.period_month
    FROM accounting.journal_vouchers jv
    WHERE jv.jv_type = 'MONTHLY_AMORT'
    ORDER BY jv.period_seq
  `);

  // Get contract info
  const contract = await pool.request().query(
    'SELECT ibr, monthly_payment, term_months, rou_asset_value, lease_liability_commence FROM lease.contracts WHERE contract_id = 68'
  );
  const c = contract.recordset[0];
  const monthlyIBR = c.ibr / 12;

  // Get schedule data ordered by period
  const sched = await pool.request().query(`
    SELECT schedule_id, period_date, opening_liability, interest_expense, payment, principal, closing_liability, rou_nbv, depreciation, cumulative_depr
    FROM lease.amortisation_schedule
    WHERE contract_id = 68
    ORDER BY period_date
  `);

  let updated = 0;
  for (let i = 0; i < jvs.recordset.length; i++) {
    const jv = jvs.recordset[i];
    const schedRow = sched.recordset[i];
    if (!schedRow) continue;

    const openLiab = Number(schedRow.opening_liability);
    const intExp = Number(schedRow.interest_expense);
    const depr = Number(schedRow.depreciation);
    const principal = Number(schedRow.principal);
    const closingLiab = Number(schedRow.closing_liability);
    const cumDepr = Number(schedRow.cumulative_depr);
    const rouNbv = Number(schedRow.rou_nbv);

    const fmtNum = (n) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Interest calc explanation
    const intCalc = `Interest Expense Calculation (Period ${jv.period_seq}/${c.term_months}):\n\nOpening Lease Liability = ${fmtNum(openLiab)} QAR\nMonthly IBR = Annual IBR / 12 = ${(c.ibr * 100).toFixed(2)}% / 12 = ${(monthlyIBR * 100).toFixed(4)}%\n\nInterest Expense = Opening Liability × Monthly IBR\n= ${fmtNum(openLiab)} × ${(monthlyIBR * 100).toFixed(4)}%\n= ${fmtNum(intExp)} QAR\n\nClosing Liability = Opening - Principal\n= ${fmtNum(openLiab)} - ${fmtNum(principal)}\n= ${fmtNum(closingLiab)} QAR`;

    // Depreciation calc explanation
    const deprCalc = `Depreciation Calculation (Period ${jv.period_seq}/${c.term_months}):\n\nROU Asset Value = ${fmtNum(c.rou_asset_value)} QAR\nLease Term = ${c.term_months} months\n\nMonthly Depreciation = ROU Asset / Lease Term\n= ${fmtNum(c.rou_asset_value)} / ${c.term_months}\n= ${fmtNum(depr)} QAR (straight-line)\n\nCumulative Depreciation = ${fmtNum(cumDepr)} QAR\nROU NBV = ${fmtNum(rouNbv)} QAR`;

    // Update interest lines (1, 2)
    await pool.request()
      .input('jv_id', sql.Int, jv.jv_id)
      .input('calc', sql.NVarChar(sql.MAX), intCalc)
      .query(`UPDATE accounting.jv_lines SET calc_explanation = @calc WHERE jv_id = @jv_id AND line_seq IN (1, 2)`);

    // Update depreciation lines (3, 4)
    await pool.request()
      .input('jv_id2', sql.Int, jv.jv_id)
      .input('calc2', sql.NVarChar(sql.MAX), deprCalc)
      .query(`UPDATE accounting.jv_lines SET calc_explanation = @calc2 WHERE jv_id = @jv_id2 AND line_seq IN (3, 4)`);

    updated++;
  }

  console.log(`Updated calc_explanation for ${updated} JVs (${updated * 4} lines)`);

  // Verify
  const verify = await pool.request().query(`
    SELECT TOP 2 calc_explanation FROM accounting.jv_lines jvl
    JOIN accounting.journal_vouchers jv ON jv.jv_id = jvl.jv_id
    WHERE jv.jv_type = 'MONTHLY_AMORT' AND jvl.calc_explanation IS NOT NULL
    ORDER BY jv.period_seq, jvl.line_seq
  `);
  console.log('\nSample:');
  verify.recordset.forEach(r => console.log(r.calc_explanation.substring(0, 150)));

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
