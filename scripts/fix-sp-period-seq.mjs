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

  // Get the full SP definition
  const spDef = await pool.request().query(`SELECT OBJECT_DEFINITION(OBJECT_ID('accounting.sp_GenerateMonthlyJVsForSelected')) AS def`);
  let def = spDef.recordset[0].def;

  // 1. Add DECLARE @period_seq INT after DECLARE @jid INT;
  const oldDeclare = 'DECLARE @jid INT;';
  const newDeclare = 'DECLARE @jid INT;\n        DECLARE @period_seq INT;';
  def = def.replace(oldDeclare, newDeclare);
  console.log('✅ Added DECLARE @period_seq');

  // 2. Add period_seq to the INSERT column list (do this BEFORE adding the calc)
  const oldCols = 'status, created_by, created_at)';
  const newCols = 'status, created_by, created_at, period_seq)';
  def = def.replace(oldCols, newCols);
  console.log('✅ Added period_seq to INSERT column list');

  // 3. Add @period_seq to VALUES
  const oldValues = `'ERP', @created_by, GETUTCDATE());`;
  const newValues = `'ERP', @created_by, GETUTCDATE(), @period_seq);`;
  def = def.replace(oldValues, newValues);
  console.log('✅ Added @period_seq to VALUES');

  // 4. Before the INSERT, add the period_seq calculation
  const insertMarker = 'INSERT INTO accounting.journal_vouchers';
  const insertIdx = def.indexOf(insertMarker);
  if (insertIdx === -1) {
    throw new Error('Cannot find INSERT INTO accounting.journal_vouchers');
  }
  
  const periodSeqCalc = `SELECT @period_seq = ISNULL(MAX(period_seq), 0) + 1 FROM accounting.journal_vouchers WHERE contract_id = @contract_id AND jv_type = 'MONTHLY_AMORT';\n\n          `;
  def = def.substring(0, insertIdx) + periodSeqCalc + def.substring(insertIdx);
  console.log('✅ Added period_seq calculation before INSERT');

  // Replace CREATE PROCEDURE with ALTER PROCEDURE
  def = def.replace(/CREATE\s+PROCEDURE/i, 'ALTER PROCEDURE');

  // Execute the modified SP
  try {
    await pool.request().batch(def);
    console.log('\n✅ SP updated successfully with period_seq!');
  } catch (err) {
    console.error('\n❌ Error updating SP:', err.message);
  }

  // Verify
  const verify = await pool.request().query(`SELECT OBJECT_DEFINITION(OBJECT_ID('accounting.sp_GenerateMonthlyJVsForSelected')) AS def`);
  const newDefCheck = verify.recordset[0].def;
  console.log('\nVerification:');
  console.log('  Has @period_seq DECLARE:', newDefCheck.includes('@period_seq'));
  console.log('  Has period_seq in INSERT:', newDefCheck.includes('period_seq)'));
  console.log('  Has @period_seq in VALUES:', newDefCheck.includes('@period_seq);'));
  console.log('  Has SELECT @period_seq:', newDefCheck.includes('SELECT @period_seq'));

  await pool.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
