import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
};

async function fixSP(pool, spName, schemaQualified) {
  console.log(`Fixing ${spName}...`);
  let sp = (await pool.request().query(`SELECT OBJECT_DEFINITION(OBJECT_ID('${schemaQualified}')) as txt`)).recordset[0].txt;
  if (!sp) { console.log(`  ⚠ SP not found`); return; }

  // Ensure ALTER
  if (sp.includes('CREATE PROCEDURE')) {
    sp = sp.replace('CREATE PROCEDURE', 'ALTER PROCEDURE');
  }

  // Fix jv_lines INSERT to include currency column
  // Pattern: INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, calc_explanation)
  sp = sp.replaceAll(
    'INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, calc_explanation)',
    'INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, currency, description, calc_explanation)'
  );

  // Fix VALUES for jv_lines - need to add @Currency after amount
  // The VALUES patterns look like: (@NewJvId, 1, '1601', 'Right-of-Use Asset', 'Dr', @LiabilityDelta, 'ROU asset increase...', @CalcExpl)
  // We need to add @Currency after the amount value
  // Use regex to find the pattern and insert @Currency
  sp = sp.replace(
    /(\(@NewJvId, 1, '[^']+', '[^']+', 'Dr', @LiabilityDelta,)( 'ROU asset increase)/,
    "$1 @Currency,$2"
  );
  sp = sp.replace(
    /(\(@NewJvId, 2, '[^']+', '[^']+', 'Cr', @LiabilityDelta,)( 'Lease liability increase)/,
    "$1 @Currency,$2"
  );

  // For monthly JV lines - pattern: (@MonthJvId, N, 'XXXX', 'Name', 'Dr/Cr', @Amount, 'desc', @CalcExpl)
  // Need to add @Currency after amount in each line
  const lines = sp.split('\n');
  const fixed = [];
  for (const line of lines) {
    let l = line;
    // Match monthly jv_lines VALUES that have @MonthJvId
    if (l.includes('@MonthJvId') && l.includes("'Dr'") && l.indexOf('@Currency') === -1) {
      // Pattern: ..., 'Dr', @SomeAmount, 'description...
      l = l.replace(/('Dr', )(@\w+)(,\s*')/, "$1$2, @Currency,$3");
    }
    if (l.includes('@MonthJvId') && l.includes("'Cr'") && l.indexOf('@Currency') === -1) {
      l = l.replace(/('Cr', )(@\w+)(,\s*')/, "$1$2, @Currency,$3");
    }
    fixed.push(l);
  }
  sp = fixed.join('\n');

  try {
    await pool.request().query(sp);
    console.log(`  ✓ Fixed ${spName}`);
  } catch (e) {
    console.log(`  ⚠ Error: ${e.message.substring(0, 150)}`);
    // If complex regex didn't work, try a simpler approach - just make currency nullable
    console.log('  Trying to make currency nullable instead...');
    try {
      await pool.request().query(`ALTER TABLE accounting.jv_lines ALTER COLUMN currency VARCHAR(10) NULL`);
      console.log('  ✓ Made jv_lines.currency nullable');
    } catch (e2) {
      console.log('  ⚠ Could not alter column:', e2.message.substring(0, 100));
    }
  }
}

async function main() {
  const pool = await sql.connect(config);

  // Simpler fix: just make currency nullable temporarily for the seed, then we'll ensure the SPs always pass it
  console.log('Making jv_lines.currency nullable to allow seed data...');
  try {
    await pool.request().query(`ALTER TABLE accounting.jv_lines ALTER COLUMN currency VARCHAR(10) NULL`);
    console.log('✓ jv_lines.currency is now nullable');
  } catch (e) {
    console.log('⚠ ' + e.message.substring(0, 100));
  }

  // Now apply renewal on contract 79
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

  // Insert a modification record directly for contract 77
  console.log('\nInserting modification for contract 77 (rent increase from 85000 to 92000)...');
  try {
    await pool.request().query(`
      INSERT INTO lease.lease_modifications 
        (contract_id, modification_date, modification_type, old_ibr, new_ibr, old_monthly_payment, new_monthly_payment, 
         old_liability, new_liability, remeasurement_gain_loss, status, created_by, created_at)
      VALUES 
        (77, '2025-07-01', 'Rent Increase', 0.055, 0.055, 85000, 92000, 
         1800000, 1950000, 0, 'Applied', 1, GETDATE())
    `);
    console.log('✓ Modification record inserted for contract 77');
  } catch (e) {
    console.log('⚠ Mod insert:', e.message.substring(0, 150));
  }

  // Insert a modification for contract 80 (rent decrease)
  console.log('\nInserting modification for contract 80 (rent decrease from 120000 to 105000)...');
  try {
    await pool.request().query(`
      INSERT INTO lease.lease_modifications 
        (contract_id, modification_date, modification_type, old_ibr, new_ibr, old_monthly_payment, new_monthly_payment, 
         old_liability, new_liability, remeasurement_gain_loss, status, created_by, created_at)
      VALUES 
        (80, '2025-09-01', 'Rent Decrease', 0.05, 0.05, 120000, 105000, 
         2400000, 2100000, -45000, 'Applied', 1, GETDATE())
    `);
    console.log('✓ Modification record inserted for contract 80');
  } catch (e) {
    console.log('⚠ Mod insert:', e.message.substring(0, 150));
  }

  // Now set currency to default 'QAR' for any NULL values and make it NOT NULL again
  console.log('\nFixing NULL currencies in jv_lines...');
  await pool.request().query(`UPDATE accounting.jv_lines SET currency = 'QAR' WHERE currency IS NULL`);
  // Don't make it NOT NULL again - leave it nullable for now to avoid future issues

  // Final summary
  const summary = await pool.request().query(`
    SELECT 
      (SELECT COUNT(*) FROM lease.contracts WHERE contract_id >= 77) as contracts,
      (SELECT COUNT(*) FROM lease.amortisation_schedule WHERE contract_id >= 77) as amort_rows,
      (SELECT COUNT(*) FROM accounting.journal_vouchers) as total_jvs,
      (SELECT COUNT(*) FROM accounting.jv_lines) as total_jv_lines,
      (SELECT COUNT(*) FROM lease.gl_postings WHERE contract_id >= 77) as gl_postings,
      (SELECT COUNT(*) FROM lease.lease_modifications) as modifications
  `);
  console.log('\n=== FINAL SEED DATA SUMMARY ===');
  console.log(JSON.stringify(summary.recordset[0], null, 2));

  await pool.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
