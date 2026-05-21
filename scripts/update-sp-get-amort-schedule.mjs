/**
 * Update sp_GetAmortisationSchedule to return 2 result sets:
 * [0] = contract header info
 * [1] = schedule rows with schedule_id and posting_status
 */
import sql from 'mssql';
import 'dotenv/config';

const config = {
  server: process.env.MSSQL_HOST ?? '',
  port: Number(process.env.MSSQL_PORT ?? 1433),
  user: process.env.MSSQL_USER ?? '',
  password: process.env.MSSQL_PASSWORD ?? '',
  database: process.env.MSSQL_DATABASE ?? 'leasing',
  options: { encrypt: false, trustServerCertificate: true, requestTimeout: 30000 },
};

const SP_SQL = `
CREATE OR ALTER PROCEDURE dbo.sp_GetAmortisationSchedule
    @ContractId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Result set 0: contract header
    SELECT
        c.contract_id,
        c.contract_ref AS lease_number,
        c.currency,
        c.lease_liability_commence AS initial_liability,
        COALESCE(
          (SELECT TOP 1 closing_liability FROM lease.amortisation_schedule
           WHERE contract_id = @ContractId ORDER BY period_date DESC),
          c.lease_liability_commence
        ) AS current_liability,
        c.rou_asset_value AS initial_rou,
        COALESCE(
          (SELECT TOP 1 rou_nbv FROM lease.amortisation_schedule
           WHERE contract_id = @ContractId ORDER BY period_date DESC),
          c.rou_asset_value
        ) AS current_rou_nbv
    FROM lease.contracts c
    WHERE c.contract_id = @ContractId;

    -- Result set 1: schedule rows (includes schedule_id and posting_status)
    SELECT
        schedule_id,
        contract_id,
        ROW_NUMBER() OVER (ORDER BY period_date) AS period_no,
        period_date,
        opening_liability,
        interest_expense,
        payment,
        principal,
        closing_liability,
        rou_nbv,
        depreciation,
        COALESCE(posting_status, 'Pending') AS posting_status,
        posted_at,
        posted_by
    FROM lease.amortisation_schedule
    WHERE contract_id = @ContractId
    ORDER BY period_date;
END;
`;

async function main() {
  const pool = await sql.connect(config);
  console.log('Connected. Updating SP: dbo.sp_GetAmortisationSchedule ...');
  await pool.request().batch(SP_SQL);
  console.log('SP updated successfully (now returns 2 result sets with schedule_id & posting_status).');
  await pool.close();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
