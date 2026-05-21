/**
 * Creates the stored procedure: accounting.sp_GenerateMonthlyJVsForSelected
 * Generates monthly JVs for specifically selected amortisation schedule rows.
 * Marks those rows as 'ERP' after successful JV generation.
 * Skips rows that already have posting_status = 'ERP'.
 */
import sql from 'mssql';

const config = {
  server: process.env.MSSQL_HOST ?? '',
  port: Number(process.env.MSSQL_PORT ?? 1433),
  user: process.env.MSSQL_USER ?? '',
  password: process.env.MSSQL_PASSWORD ?? '',
  database: process.env.MSSQL_DATABASE ?? 'leasing',
  options: { encrypt: false, trustServerCertificate: true, requestTimeout: 30000 },
};

const SP_SQL = `
CREATE OR ALTER PROCEDURE accounting.sp_GenerateMonthlyJVsForSelected
  @schedule_ids_csv VARCHAR(MAX),
  @contract_id INT,
  @created_by VARCHAR(200)
AS BEGIN
  SET NOCOUNT ON;

  -- Parse CSV into table
  DECLARE @ids TABLE (schedule_id INT);
  INSERT INTO @ids
  SELECT CAST(value AS INT) FROM STRING_SPLIT(@schedule_ids_csv, ',') WHERE RTRIM(LTRIM(value)) != '';

  -- Get contract info
  DECLARE @cref VARCHAR(50), @cur VARCHAR(10), @atype VARCHAR(100);
  SELECT @cref = contract_ref, @cur = ISNULL(currency, 'QAR'), @atype = ISNULL(asset_type, 'Property')
  FROM lease.contracts WHERE contract_id = @contract_id;

  IF @cref IS NULL
  BEGIN RAISERROR('Contract not found', 16, 1); RETURN; END

  -- Collect eligible rows (not already ERP)
  DECLARE @t TABLE (
    schedule_id INT, period_date DATE, period_year INT, period_month INT,
    interest DECIMAL(18,4), principal DECIMAL(18,4), depreciation DECIMAL(18,4),
    payment DECIMAL(18,4)
  );
  INSERT INTO @t
  SELECT a.schedule_id, a.period_date, YEAR(a.period_date), MONTH(a.period_date),
    a.interest_expense, a.principal, a.depreciation, a.payment
  FROM lease.amortisation_schedule a
  INNER JOIN @ids i ON i.schedule_id = a.schedule_id
  WHERE a.contract_id = @contract_id
    AND (a.posting_status IS NULL OR a.posting_status NOT IN ('ERP'));

  DECLARE @total_eligible INT = (SELECT COUNT(*) FROM @t);
  DECLARE @total_requested INT = (SELECT COUNT(*) FROM @ids);
  DECLARE @skipped INT = @total_requested - @total_eligible;
  DECLARE @generated INT = 0;

  -- Process each eligible row
  DECLARE @sid INT, @pdate DATE, @pyear INT, @pmonth INT,
          @int DECIMAL(18,4), @prin DECIMAL(18,4), @depr DECIMAL(18,4), @pay DECIMAL(18,4);

  DECLARE c1 CURSOR LOCAL FAST_FORWARD FOR SELECT * FROM @t;
  OPEN c1;
  FETCH NEXT FROM c1 INTO @sid, @pdate, @pyear, @pmonth, @int, @prin, @depr, @pay;

  WHILE @@FETCH_STATUS = 0
  BEGIN
    -- Check if JV already exists for this contract/period (not rejected)
    IF NOT EXISTS (
      SELECT 1 FROM accounting.journal_vouchers
      WHERE contract_id = @contract_id AND jv_type = 'MONTHLY_AMORT'
        AND period_year = @pyear AND period_month = @pmonth
        AND status != 'Rejected'
    )
    BEGIN
      DECLARE @period_key VARCHAR(10) = FORMAT(@pdate, 'yyyyMM');
      DECLARE @jvn VARCHAR(30);
      EXEC accounting.sp_NextJVNumber @period_key, @jvn OUTPUT;

      DECLARE @tot DECIMAL(18,4) = ISNULL(@int, 0) + ISNULL(@depr, 0);

      -- Determine GL accounts by asset type
      DECLARE @rou_a VARCHAR(20)='10100', @acc_a VARCHAR(20)='10200',
              @liab_a VARCHAR(20)='21020', @int_a VARCHAR(20)='51010', @depr_a VARCHAR(20)='52010';
      DECLARE @rou_n VARCHAR(200)='Right-of-Use Asset - Property',
              @acc_n VARCHAR(200)='Accum. Depreciation - ROU Property',
              @liab_n VARCHAR(200)='Lease Liability - Property',
              @int_n VARCHAR(200)='Finance Cost - Lease Interest (Property)',
              @depr_n VARCHAR(200)='Depreciation - ROU Property';

      IF @atype LIKE '%Vehicle%'
      BEGIN
        SET @rou_a='10110'; SET @acc_a='10210'; SET @liab_a='21030'; SET @int_a='51020'; SET @depr_a='52020';
        SET @rou_n='Right-of-Use Asset - Vehicles'; SET @acc_n='Accum. Depreciation - ROU Vehicles';
        SET @liab_n='Lease Liability - Vehicles'; SET @int_n='Finance Cost - Lease Interest (Vehicles)';
        SET @depr_n='Depreciation - ROU Vehicles';
      END

      -- Insert JV header
      DECLARE @jid INT;
      INSERT INTO accounting.journal_vouchers
        (jv_number, jv_type, period_year, period_month, posting_date, description,
         contract_id, source_ref, source_type, currency, total_debit, total_credit, status, created_by, created_at)
      VALUES (@jvn, 'MONTHLY_AMORT', @pyear, @pmonth, EOMONTH(@pdate),
        'Monthly IFRS 16 Amortisation - ' + @cref + ' | ' + FORMAT(@pdate, 'MMM yyyy'),
        @contract_id, CAST(@sid AS VARCHAR), 'AMORTISATION', @cur, @tot, @tot, 'Posted', @created_by, GETUTCDATE());
      SET @jid = SCOPE_IDENTITY();

      -- Insert JV lines
      DECLARE @seq INT = 1;
      IF ISNULL(@int, 0) > 0
      BEGIN
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency)
        VALUES (@jid, @seq, @int_a, @int_n, 'Dr', @int, 'Interest expense - unwinding of discount', @cref, @cur);
        SET @seq = @seq + 1;
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency)
        VALUES (@jid, @seq, @liab_a, @liab_n, 'Cr', @int, 'Lease liability interest accrual', @cref, @cur);
        SET @seq = @seq + 1;
      END
      IF ISNULL(@depr, 0) > 0
      BEGIN
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency)
        VALUES (@jid, @seq, @depr_a, @depr_n, 'Dr', @depr, 'ROU asset depreciation - straight-line', @cref, @cur);
        SET @seq = @seq + 1;
        INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency)
        VALUES (@jid, @seq, @acc_a, @acc_n, 'Cr', @depr, 'Accumulated depreciation on ROU asset', @cref, @cur);
      END

      -- Mark the schedule row as ERP
      UPDATE lease.amortisation_schedule
      SET posting_status = 'ERP', posted_at = GETUTCDATE(), posted_by = @created_by
      WHERE schedule_id = @sid;

      SET @generated = @generated + 1;
    END
    ELSE
    BEGIN
      -- JV already exists, still mark as ERP to prevent re-selection
      UPDATE lease.amortisation_schedule
      SET posting_status = 'ERP', posted_at = GETUTCDATE(), posted_by = @created_by
      WHERE schedule_id = @sid AND (posting_status IS NULL OR posting_status != 'ERP');
      SET @skipped = @skipped + 1;
    END

    FETCH NEXT FROM c1 INTO @sid, @pdate, @pyear, @pmonth, @int, @prin, @depr, @pay;
  END
  CLOSE c1; DEALLOCATE c1;

  SELECT @generated AS generated_count, @skipped AS skipped_count;
END
`;

async function main() {
  const pool = await sql.connect(config);
  console.log('Connected. Creating SP: accounting.sp_GenerateMonthlyJVsForSelected ...');
  await pool.request().query(SP_SQL);
  console.log('SP created successfully.');

  // Also ensure posting_status column exists on amortisation_schedule
  const colCheck = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'lease' AND TABLE_NAME = 'amortisation_schedule' AND COLUMN_NAME = 'posting_status'
  `);
  if (colCheck.recordset.length === 0) {
    console.log('Adding posting_status column to lease.amortisation_schedule...');
    await pool.request().query(`
      ALTER TABLE lease.amortisation_schedule ADD posting_status VARCHAR(20) NULL;
    `);
    console.log('Column added.');
  } else {
    console.log('posting_status column already exists.');
  }

  // Ensure posted_at and posted_by columns exist
  const colCheck2 = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'lease' AND TABLE_NAME = 'amortisation_schedule' AND COLUMN_NAME = 'posted_at'
  `);
  if (colCheck2.recordset.length === 0) {
    console.log('Adding posted_at and posted_by columns...');
    await pool.request().query(`
      ALTER TABLE lease.amortisation_schedule ADD posted_at DATETIME2 NULL;
      ALTER TABLE lease.amortisation_schedule ADD posted_by VARCHAR(200) NULL;
    `);
    console.log('Columns added.');
  } else {
    console.log('posted_at/posted_by columns already exist.');
  }

  await pool.close();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
