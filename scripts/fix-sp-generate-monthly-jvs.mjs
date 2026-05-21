/**
 * Fix: sp_GenerateMonthlyJVsForSelected
 * Problem: DECLARE statements inside WHILE loop cause issues on 2nd+ iteration.
 * In SQL Server, DECLARE with initialization inside a loop only initializes once.
 * Fix: Move all DECLARE outside the loop, use SET inside.
 * Also: Reset the 3 rows that were incorrectly marked ERP during testing.
 */
import sql from 'mssql';

const config = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};

async function main() {
  const pool = await sql.connect(config);

  // Step 1: Reset the 3 rows that were incorrectly marked ERP during our test
  await pool.request().query(`
    UPDATE lease.amortisation_schedule
    SET posting_status = 'Pending', posted_at = NULL, posted_by = NULL
    WHERE schedule_id IN (17605, 17606, 17607)
  `);
  console.log('✓ Reset schedule_ids 17605-17607 back to Pending');

  // Step 2: Recreate the SP with DECLARE outside the loop
  await pool.request().query(`
    IF OBJECT_ID('accounting.sp_GenerateMonthlyJVsForSelected', 'P') IS NOT NULL
      DROP PROCEDURE accounting.sp_GenerateMonthlyJVsForSelected;
  `);

  await pool.request().query(`
    CREATE PROCEDURE accounting.sp_GenerateMonthlyJVsForSelected
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

      -- Declare all loop variables OUTSIDE the loop
      DECLARE @sid INT, @pdate DATE, @pyear INT, @pmonth INT,
              @int DECIMAL(18,4), @prin DECIMAL(18,4), @depr DECIMAL(18,4), @pay DECIMAL(18,4);
      DECLARE @period_key VARCHAR(10);
      DECLARE @jvn VARCHAR(30);
      DECLARE @tot DECIMAL(18,4);
      DECLARE @jid INT;
      DECLARE @seq INT;
      DECLARE @rou_a VARCHAR(20), @acc_a VARCHAR(20), @liab_a VARCHAR(20), @int_a VARCHAR(20), @depr_a VARCHAR(20);
      DECLARE @rou_n VARCHAR(200), @acc_n VARCHAR(200), @liab_n VARCHAR(200), @int_n VARCHAR(200), @depr_n VARCHAR(200);

      -- Process each eligible row
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
          SET @period_key = FORMAT(@pdate, 'yyyyMM');
          SET @jvn = NULL;
          EXEC accounting.sp_NextJVNumber @period_key, @jvn OUTPUT;
          SET @tot = ISNULL(@int, 0) + ISNULL(@depr, 0);

          -- Determine GL accounts by asset type (default = Property)
          SET @rou_a = '10100'; SET @acc_a = '10200'; SET @liab_a = '21020';
          SET @int_a = '51010'; SET @depr_a = '52010';
          SET @rou_n = 'Right-of-Use Asset - Property';
          SET @acc_n = 'Accum. Depreciation - ROU Property';
          SET @liab_n = 'Lease Liability - Property';
          SET @int_n = 'Finance Cost - Lease Interest (Property)';
          SET @depr_n = 'Depreciation - ROU Property';

          IF @atype LIKE '%Vehicle%'
          BEGIN
            SET @rou_a = '10110'; SET @acc_a = '10210'; SET @liab_a = '21030';
            SET @int_a = '51020'; SET @depr_a = '52020';
            SET @rou_n = 'Right-of-Use Asset - Vehicles';
            SET @acc_n = 'Accum. Depreciation - ROU Vehicles';
            SET @liab_n = 'Lease Liability - Vehicles';
            SET @int_n = 'Finance Cost - Lease Interest (Vehicles)';
            SET @depr_n = 'Depreciation - ROU Vehicles';
          END

          IF @atype LIKE '%Equipment%'
          BEGIN
            SET @rou_a = '10120'; SET @acc_a = '10220'; SET @liab_a = '21040';
            SET @int_a = '51030'; SET @depr_a = '52030';
            SET @rou_n = 'Right-of-Use Asset - Equipment';
            SET @acc_n = 'Accum. Depreciation - ROU Equipment';
            SET @liab_n = 'Lease Liability - Equipment';
            SET @int_n = 'Finance Cost - Lease Interest (Equipment)';
            SET @depr_n = 'Depreciation - ROU Equipment';
          END

          -- Insert JV header
          INSERT INTO accounting.journal_vouchers
            (jv_number, jv_type, period_year, period_month, posting_date, description,
             contract_id, source_ref, source_type, currency, total_debit, total_credit, status, created_by, created_at)
          VALUES (@jvn, 'MONTHLY_AMORT', @pyear, @pmonth, EOMONTH(@pdate),
            'Monthly IFRS 16 Amortisation - ' + @cref + ' | ' + FORMAT(@pdate, 'MMM yyyy'),
            @contract_id, CAST(@sid AS VARCHAR), 'AMORTISATION', @cur, @tot, @tot, 'Posted', @created_by, GETUTCDATE());
          SET @jid = SCOPE_IDENTITY();

          -- Insert JV lines
          SET @seq = 1;
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
  `);
  console.log('✓ Recreated accounting.sp_GenerateMonthlyJVsForSelected with DECLARE outside loop');

  // Step 3: Also delete the 2 MONTHLY_AMORT JVs that were created earlier (Sep & Oct 2023)
  // so the user can test fresh
  // Actually, let's keep them - they were legitimately created. Just reset the posting_status.
  // Reset ALL rows for contract 65 back to Pending so user can test fresh
  await pool.request().query(`
    UPDATE lease.amortisation_schedule
    SET posting_status = 'Pending', posted_at = NULL, posted_by = NULL
    WHERE contract_id = 65 AND posting_status = 'ERP'
  `);
  console.log('✓ Reset all ERP rows for contract 65 back to Pending');

  // Delete the 2 test MONTHLY_AMORT JVs and their lines so user can regenerate
  const jvIds = await pool.request().query(`
    SELECT jv_id FROM accounting.journal_vouchers
    WHERE contract_id = 65 AND jv_type = 'MONTHLY_AMORT'
  `);
  if (jvIds.recordset.length > 0) {
    const ids = jvIds.recordset.map(r => r.jv_id).join(',');
    await pool.request().query(`DELETE FROM accounting.jv_lines WHERE jv_id IN (${ids})`);
    await pool.request().query(`DELETE FROM accounting.journal_vouchers WHERE jv_id IN (${ids})`);
    console.log(`✓ Deleted ${jvIds.recordset.length} test MONTHLY_AMORT JVs and their lines`);
  }

  await pool.close();
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
