/**
 * Update sp_GetAmortisationScheduleAll to include lifecycle_status from lease.contracts
 */
import { getPool } from './server/db-sqlserver';
async function main() {
  const pool = await getPool();
  await pool.request().query(`
CREATE OR ALTER PROCEDURE dbo.sp_GetAmortisationScheduleAll
  @Year     INT = 0,
  @ViewMode NVARCHAR(10) = 'monthly'
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    c.contract_id,
    c.contract_ref,
    c.asset_description,
    c.ifrs16_classification,
    c.commencement_date,
    c.expiry_date,
    c.monthly_payment,
    c.term_months,
    c.ibr,
    c.currency,
    c.lifecycle_status,
    l.lessor_name,
    s.period_date,
    YEAR(s.period_date)  AS period_year,
    MONTH(s.period_date) AS period_month,
    DATENAME(MONTH, s.period_date) AS month_name,
    s.opening_liability,
    s.interest_expense,
    s.payment,
    s.principal,
    s.closing_liability,
    s.rou_nbv,
    s.depreciation,
    s.cumulative_depr,
    s.posting_status,
    s.posted_at,
    s.posted_by
  FROM lease.amortisation_schedule s
  JOIN lease.contracts c ON c.contract_id = s.contract_id
  LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
  WHERE c.status NOT IN ('Deleted','Terminated')
    AND (@Year = 0 OR YEAR(s.period_date) = @Year)
  ORDER BY c.contract_ref, s.period_date;
END
  `);
  console.log('✅ sp_GetAmortisationScheduleAll updated with lifecycle_status, posting_status');
  process.exit(0);
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
