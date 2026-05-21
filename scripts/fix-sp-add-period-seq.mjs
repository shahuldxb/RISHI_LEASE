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

  // Replace CREATE with CREATE OR ALTER
  def = def.replace('CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  // 1. Add @period_seq variable if not present
  if (def.indexOf('@period_seq') === -1) {
    def = def.replace(
      'DECLARE @jid INT, @jvn NVARCHAR(30)',
      'DECLARE @jid INT, @jvn NVARCHAR(30), @period_seq INT'
    );
  }

  // 2. Add period_seq calculation before INSERT if not present
  if (def.indexOf('Calculate next period_seq') === -1) {
    def = def.replace(
      'INSERT INTO accounting.journal_vouchers',
      `-- Calculate next period_seq for this contract
          SELECT @period_seq = ISNULL(MAX(period_seq), 0) + 1
          FROM accounting.journal_vouchers
          WHERE contract_id = @contract_id AND jv_type = 'MONTHLY_AMORT';

          INSERT INTO accounting.journal_vouchers`
    );
  }

  // 3. Add period_seq to column list if not already there
  if (def.indexOf('created_at, period_seq)') === -1) {
    def = def.replace(
      'status, created_by, created_at)',
      'status, created_by, created_at, period_seq)'
    );
  }

  // 4. Add @period_seq to VALUES
  if (def.indexOf('@period_seq);') === -1) {
    def = def.replace(
      "'ERP', @created_by, GETUTCDATE());",
      "'ERP', @created_by, GETUTCDATE(), @period_seq);"
    );
  }

  // Execute the updated SP
  await pool.request().batch(def);
  console.log('SP updated with period_seq support');

  // Verify existing data
  const verify = await pool.request().query(`
    SELECT jv_id, jv_number, period_seq FROM accounting.journal_vouchers 
    WHERE contract_id = 68 AND jv_type = 'MONTHLY_AMORT'
    ORDER BY period_seq
  `);
  console.log('First 5 monthly JVs with period_seq:');
  console.log(JSON.stringify(verify.recordset.slice(0, 5), null, 2));

  await pool.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
