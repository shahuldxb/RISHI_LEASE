/**
 * Create lease.sp_PersistAmortisationSchedule
 * This SP computes the amortisation schedule from contract data and persists it to the DB.
 * It reads contract parameters (PV, IBR, term, payment, ROU, commencement date) and
 * generates the full monthly schedule, inserting it into lease.amortisation_schedule.
 */
import sql from 'mssql';
import 'dotenv/config';

const config = {
  server: process.env.MSSQL_HOST ?? '',
  port: Number(process.env.MSSQL_PORT ?? 1433),
  user: process.env.MSSQL_USER ?? '',
  password: process.env.MSSQL_PASSWORD ?? '',
  database: process.env.MSSQL_DATABASE ?? 'leasing',
  options: { encrypt: false, trustServerCertificate: true, requestTimeout: 60000 },
};

const SP_SQL = `
CREATE OR ALTER PROCEDURE lease.sp_PersistAmortisationSchedule
    @ContractId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Get contract details
    DECLARE @pv DECIMAL(18,4), @ibr DECIMAL(10,6), @term INT, @payment DECIMAL(18,4),
            @rou DECIMAL(18,4), @start_date DATE;
    
    SELECT @pv = ISNULL(lease_liability_commence, 0),
           @ibr = ISNULL(ibr, 0.07),
           @term = ISNULL(term_months, 36),
           @payment = ISNULL(monthly_payment, 0),
           @rou = ISNULL(rou_asset_value, ISNULL(lease_liability_commence, 0)),
           @start_date = commencement_date
    FROM lease.contracts
    WHERE contract_id = @ContractId;

    IF @pv = 0 OR @term = 0
    BEGIN
        SELECT 0 AS rows_saved, 'No PV or term found' AS status;
        RETURN;
    END

    -- Delete existing schedule for this contract (only non-ERP rows, or all if re-computing)
    DELETE FROM lease.amortisation_schedule 
    WHERE contract_id = @ContractId 
      AND (posting_status IS NULL OR posting_status NOT IN ('ERP'));

    -- Generate schedule
    DECLARE @monthly_rate DECIMAL(18,10) = @ibr / 12.0;
    DECLARE @monthly_depr DECIMAL(18,4) = @rou / @term;
    DECLARE @opening DECIMAL(18,4) = @pv;
    DECLARE @period INT = 1;
    DECLARE @period_date DATE = @start_date;
    DECLARE @cum_depr DECIMAL(18,4) = 0;

    WHILE @period <= @term
    BEGIN
        DECLARE @interest DECIMAL(18,4) = ROUND(@opening * @monthly_rate, 2);
        DECLARE @principal DECIMAL(18,4) = @payment - @interest;
        DECLARE @closing DECIMAL(18,4) = @opening - @principal;
        DECLARE @depr DECIMAL(18,4) = @monthly_depr;
        SET @cum_depr = @cum_depr + @depr;
        DECLARE @rou_nbv DECIMAL(18,4) = @rou - @cum_depr;

        -- Only insert if this period doesn't already exist with ERP status
        IF NOT EXISTS (
            SELECT 1 FROM lease.amortisation_schedule 
            WHERE contract_id = @ContractId 
              AND period_date = @period_date 
              AND posting_status = 'ERP'
        )
        BEGIN
            INSERT INTO lease.amortisation_schedule (
                contract_id, period_date, opening_liability, interest_expense,
                payment, principal, closing_liability, rou_nbv, depreciation, cumulative_depr, posting_status
            )
            VALUES (
                @ContractId, @period_date, @opening, @interest,
                @payment, @principal, @closing, @rou_nbv, @depr, @cum_depr, 'Pending'
            );
        END

        SET @opening = @closing;
        SET @period = @period + 1;
        SET @period_date = DATEADD(MONTH, 1, @period_date);
    END

    SELECT @term AS rows_saved, 'success' AS status;
END;
`;

async function main() {
  const pool = await sql.connect(config);
  console.log('Connected. Creating SP: lease.sp_PersistAmortisationSchedule ...');
  await pool.request().batch(SP_SQL);
  console.log('SP created successfully.');

  // Also ensure the lease schema exists
  try {
    await pool.request().batch(`IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name='lease') EXEC('CREATE SCHEMA lease')`);
  } catch (e) { /* schema already exists */ }

  // Test with contract 58 (the one user is looking at)
  console.log('Testing with contract_id = 58...');
  const req = pool.request();
  req.input('ContractId', sql.Int, 58);
  const result = await req.execute('lease.sp_PersistAmortisationSchedule');
  console.log('Result:', result.recordset?.[0]);

  await pool.close();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
