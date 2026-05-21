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

  // Fix sp_ApplyRenewal - add period_year and period_month
  console.log('Fixing sp_ApplyRenewal...');
  let sp = (await pool.request().query(`SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.sp_ApplyRenewal')) as txt`)).recordset[0].txt;

  // Ensure ALTER
  if (sp.includes('CREATE PROCEDURE')) {
    sp = sp.replace('CREATE PROCEDURE', 'ALTER PROCEDURE');
  } else if (sp.indexOf('ALTER PROCEDURE') === -1) {
    sp = 'ALTER ' + sp.substring(sp.indexOf('PROCEDURE'));
  }

  // Line-by-line fix
  const lines = sp.split('\n');
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // Fix column lists that don't already have period_year
    if (line.includes('INSERT INTO accounting.journal_vouchers') && line.includes('period_seq') && line.indexOf('period_year') === -1) {
      line = line.replace('period_seq, total_debit, total_credit)', 'period_seq, period_year, period_month, total_debit, total_credit)');
    }
    // Fix VALUES for renewal JE (has NULL for period_seq)
    if (line.includes('@PostedBy, NULL, @LiabilityDelta, @LiabilityDelta)') && line.indexOf('YEAR') === -1) {
      line = line.replace('@PostedBy, NULL, @LiabilityDelta, @LiabilityDelta)', '@PostedBy, NULL, YEAR(@EffectiveDate), MONTH(@EffectiveDate), @LiabilityDelta, @LiabilityDelta)');
    }
    // Fix VALUES for monthly JVs
    if (line.includes('@PostedBy, @PeriodSeq, @Interest + @NewDepr, @Principal + @NewDepr)') && line.indexOf('YEAR') === -1) {
      line = line.replace('@PostedBy, @PeriodSeq, @Interest + @NewDepr, @Principal + @NewDepr)', '@PostedBy, @PeriodSeq, YEAR(@PeriodDate), MONTH(@PeriodDate), @Interest + @NewDepr, @Principal + @NewDepr)');
    }
    result.push(line);
  }

  const fixedSp = result.join('\n');
  await pool.request().query(fixedSp);
  console.log('✓ Fixed sp_ApplyRenewal');

  // Now apply renewal on contract 79 (Operations Centre — expiring 2026-06-30 → extend to 2028-06-30)
  console.log('\nApplying renewal on contract 79...');
  try {
    await pool.request()
      .input('ContractId', sql.Int, 79)
      .input('NewExpiryDate', sql.Date, new Date('2028-06-30'))
      .input('NewMonthlyPayment', sql.Decimal(18, 2), 58000)
      .input('NewIBR', sql.Decimal(8, 6), 0.0525)
      .input('PostedBy', sql.NVarChar(100), 'SeedScript')
      .execute('dbo.sp_ApplyRenewal');
    console.log('✓ Renewal applied on contract 79');
  } catch (e) {
    console.log('⚠ Renewal failed:', e.message.substring(0, 200));
  }

  // Apply a modification (rent increase) on contract 77 using sp_PreviewModification + sp_CreateLeaseModification
  // The sp_ApplyLeaseModification takes @ModificationId, @ApprovedBy
  // So we need to first create a modification record
  console.log('\nCreating modification for contract 77 (rent increase)...');
  try {
    // Check sp_CreateLeaseModification params
    const params = await pool.request().query(`SELECT p.name, t.name as type_name FROM sys.parameters p JOIN sys.types t ON p.user_type_id = t.user_type_id WHERE p.object_id = OBJECT_ID('dbo.sp_CreateLeaseModification') ORDER BY p.parameter_id`);
    console.log('sp_CreateLeaseModification params:', params.recordset.map(p => p.name + ' ' + p.type_name).join(', '));
  } catch (e) {
    console.log('⚠ Could not find sp_CreateLeaseModification:', e.message.substring(0, 100));
  }

  // Check lease_modifications table
  const modCols = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='lease_modifications' ORDER BY ORDINAL_POSITION`);
  console.log('\nlease_modifications columns:');
  modCols.recordset.forEach(c => console.log('  ' + c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE));

  // Final summary
  const summary = await pool.request().query(`
    SELECT 
      (SELECT COUNT(*) FROM lease.contracts WHERE contract_id >= 77) as contracts,
      (SELECT COUNT(*) FROM lease.amortisation_schedule WHERE contract_id >= 77) as amort_rows,
      (SELECT COUNT(*) FROM accounting.journal_vouchers) as total_jvs,
      (SELECT COUNT(*) FROM accounting.jv_lines) as total_jv_lines,
      (SELECT COUNT(*) FROM lease.gl_postings WHERE contract_id >= 77) as gl_postings
  `);
  console.log('\n=== CURRENT DATA SUMMARY ===');
  console.log(JSON.stringify(summary.recordset[0], null, 2));

  await pool.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
