/**
 * Fix posting_status column:
 * 1. Drop the old CHECK constraint that only allows Projected/Posted/Locked
 * 2. Add new CHECK constraint that also allows ERP and Pending
 * 3. Update sp_SaveAmortisationSchedule to include posting_status = 'Projected' in INSERT
 * 4. Update sp_GetAmortisationSchedule to return 2 result sets
 */
import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: false, trustServerCertificate: true }
};

async function main() {
  const pool = await sql.connect(config);

  // 1. Drop old CHECK constraint
  console.log('Dropping old CHECK constraint on posting_status...');
  await pool.request().query(`
    DECLARE @constraintName NVARCHAR(200);
    SELECT @constraintName = cc.name
    FROM sys.check_constraints cc
    JOIN sys.columns c ON cc.parent_object_id = c.object_id AND cc.parent_column_id = c.column_id
    WHERE c.object_id = OBJECT_ID('lease.amortisation_schedule') AND c.name = 'posting_status';

    IF @constraintName IS NOT NULL
    BEGIN
      EXEC('ALTER TABLE lease.amortisation_schedule DROP CONSTRAINT ' + @constraintName);
      PRINT 'Dropped constraint: ' + @constraintName;
    END
    ELSE
      PRINT 'No CHECK constraint found on posting_status';
  `);

  // 2. Add new CHECK constraint that includes ERP and Pending
  console.log('Adding new CHECK constraint...');
  await pool.request().query(`
    ALTER TABLE lease.amortisation_schedule
    ADD CONSTRAINT chk_posting_status_v2
    CHECK (posting_status IN ('Projected','Posted','Locked','ERP','Pending'));
  `);
  console.log('New CHECK constraint added (allows Projected, Posted, Locked, ERP, Pending).');

  // 3. Update sp_SaveAmortisationSchedule to include posting_status
  console.log('Updating sp_SaveAmortisationSchedule...');
  await pool.request().query(`
    CREATE OR ALTER PROCEDURE dbo.sp_SaveAmortisationSchedule
      @ContractId     INT,
      @ScheduleJson   NVARCHAR(MAX)
    AS
    BEGIN
      SET NOCOUNT ON;

      -- Only delete rows that are NOT in ERP status (preserve ERP rows)
      DELETE FROM lease.amortisation_schedule
      WHERE contract_id = @ContractId AND (posting_status != 'ERP' OR posting_status IS NULL);

      INSERT INTO lease.amortisation_schedule (
        contract_id, period_date, opening_liability, interest_expense,
        payment, principal, closing_liability, rou_nbv, depreciation, cumulative_depr, posting_status
      )
      SELECT @ContractId,
             CAST(JSON_VALUE(v.value, '$.period_date') AS DATE),
             CAST(JSON_VALUE(v.value, '$.opening_liability') AS DECIMAL(18,2)),
             CAST(JSON_VALUE(v.value, '$.interest_expense') AS DECIMAL(18,2)),
             CAST(JSON_VALUE(v.value, '$.payment') AS DECIMAL(18,2)),
             CAST(JSON_VALUE(v.value, '$.principal') AS DECIMAL(18,2)),
             CAST(JSON_VALUE(v.value, '$.closing_liability') AS DECIMAL(18,2)),
             CAST(JSON_VALUE(v.value, '$.rou_nbv') AS DECIMAL(18,2)),
             CAST(JSON_VALUE(v.value, '$.depreciation') AS DECIMAL(18,2)),
             CAST(JSON_VALUE(v.value, '$.cumulative_depr') AS DECIMAL(18,2)),
             'Projected'
      FROM OPENJSON(@ScheduleJson) v
      WHERE NOT EXISTS (
        SELECT 1 FROM lease.amortisation_schedule ex
        WHERE ex.contract_id = @ContractId
          AND ex.period_date = CAST(JSON_VALUE(v.value, '$.period_date') AS DATE)
          AND ex.posting_status = 'ERP'
      );

      SELECT @@ROWCOUNT AS rows_inserted;
    END;
  `);
  console.log('sp_SaveAmortisationSchedule updated (now includes posting_status = Projected).');

  // 4. Also fix any existing NULL posting_status rows
  console.log('Fixing any existing NULL posting_status rows...');
  const result = await pool.request().query(`
    UPDATE lease.amortisation_schedule
    SET posting_status = 'Projected'
    WHERE posting_status IS NULL;
    SELECT @@ROWCOUNT AS fixed_count;
  `);
  console.log(`Fixed ${result.recordset[0].fixed_count} rows with NULL posting_status.`);

  await pool.close();
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
