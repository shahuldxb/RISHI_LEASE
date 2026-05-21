/**
 * Create Report Stored Procedures
 * These SPs power the Reports module with roll-forwards, maturity, expense, expiry, and cash forecast.
 */
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

  // ═══════════════════════════════════════════════════════════════
  // SP 1: ROU Asset Roll-Forward
  // ═══════════════════════════════════════════════════════════════
  console.log('Creating sp_ReportROURollForward...');
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_ReportROURollForward', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ReportROURollForward;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_ReportROURollForward
      @StartDate DATE = NULL,
      @EndDate DATE = NULL,
      @Currency VARCHAR(3) = NULL
    AS BEGIN
      SET NOCOUNT ON;
      IF @StartDate IS NULL SET @StartDate = DATEFROMPARTS(YEAR(GETDATE()), 1, 1);
      IF @EndDate IS NULL SET @EndDate = GETDATE();

      SELECT 
        c.contract_id,
        c.contract_ref,
        c.asset_type,
        c.currency,
        c.asset_description,
        c.rou_asset_value AS original_rou,
        -- Opening ROU NBV = ROU - cumulative depreciation up to start date
        c.rou_asset_value - ISNULL((
          SELECT SUM(a.depreciation) FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.period_date < @StartDate AND a.posting_status = 'Sent'
        ), 0) AS opening_nbv,
        -- Additions in period (new leases originated in period)
        CASE WHEN c.commencement_date BETWEEN @StartDate AND @EndDate THEN c.rou_asset_value ELSE 0 END AS additions,
        -- Depreciation in period
        ISNULL((
          SELECT SUM(a.depreciation) FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.period_date BETWEEN @StartDate AND @EndDate AND a.posting_status = 'Sent'
        ), 0) AS depreciation_period,
        -- Modifications (ROU changes from lease_modifications in period)
        ISNULL((
          SELECT SUM(ISNULL(m.new_rou_nbv, 0) - ISNULL(m.old_rou_nbv, 0)) 
          FROM lease.lease_modifications m 
          WHERE m.contract_id = c.contract_id AND m.modification_date BETWEEN @StartDate AND @EndDate AND m.status = 'Applied'
        ), 0) AS modifications,
        -- Closing ROU NBV
        c.rou_asset_value - ISNULL((
          SELECT SUM(a.depreciation) FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.period_date <= @EndDate AND a.posting_status = 'Sent'
        ), 0) + ISNULL((
          SELECT SUM(ISNULL(m.new_rou_nbv, 0) - ISNULL(m.old_rou_nbv, 0)) 
          FROM lease.lease_modifications m 
          WHERE m.contract_id = c.contract_id AND m.modification_date <= @EndDate AND m.status = 'Applied'
        ), 0) AS closing_nbv
      FROM lease.contracts c
      WHERE c.contract_id >= 77
        AND c.lifecycle_status IN ('Active', 'Originated')
        AND (@Currency IS NULL OR c.currency = @Currency)
      ORDER BY c.asset_type, c.contract_ref;
    END
  `);
  console.log('  ✓ sp_ReportROURollForward');

  // ═══════════════════════════════════════════════════════════════
  // SP 2: Lease Liability Roll-Forward
  // ═══════════════════════════════════════════════════════════════
  console.log('Creating sp_ReportLiabilityRollForward...');
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_ReportLiabilityRollForward', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ReportLiabilityRollForward;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_ReportLiabilityRollForward
      @StartDate DATE = NULL,
      @EndDate DATE = NULL,
      @Currency VARCHAR(3) = NULL
    AS BEGIN
      SET NOCOUNT ON;
      IF @StartDate IS NULL SET @StartDate = DATEFROMPARTS(YEAR(GETDATE()), 1, 1);
      IF @EndDate IS NULL SET @EndDate = GETDATE();

      SELECT 
        c.contract_id,
        c.contract_ref,
        c.asset_type,
        c.currency,
        c.asset_description,
        c.lease_liability_commence AS original_liability,
        -- Opening liability = last closing_liability before start date
        ISNULL((
          SELECT TOP 1 a.closing_liability FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.period_date < @StartDate AND a.posting_status = 'Sent'
          ORDER BY a.period_date DESC
        ), c.lease_liability_commence) AS opening_liability,
        -- Interest accretion in period
        ISNULL((
          SELECT SUM(a.interest_expense) FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.period_date BETWEEN @StartDate AND @EndDate AND a.posting_status = 'Sent'
        ), 0) AS interest_accretion,
        -- Payments in period (principal portion)
        ISNULL((
          SELECT SUM(a.principal) FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.period_date BETWEEN @StartDate AND @EndDate AND a.posting_status = 'Sent'
        ), 0) AS payments,
        -- Modifications (liability changes)
        ISNULL((
          SELECT SUM(ISNULL(m.new_liability, 0) - ISNULL(m.old_liability, 0)) 
          FROM lease.lease_modifications m 
          WHERE m.contract_id = c.contract_id AND m.modification_date BETWEEN @StartDate AND @EndDate AND m.status = 'Applied'
        ), 0) AS modifications,
        -- Closing liability
        ISNULL((
          SELECT TOP 1 a.closing_liability FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.period_date <= @EndDate AND a.posting_status = 'Sent'
          ORDER BY a.period_date DESC
        ), c.lease_liability_commence) AS closing_liability
      FROM lease.contracts c
      WHERE c.contract_id >= 77
        AND c.lifecycle_status IN ('Active', 'Originated')
        AND (@Currency IS NULL OR c.currency = @Currency)
      ORDER BY c.asset_type, c.contract_ref;
    END
  `);
  console.log('  ✓ sp_ReportLiabilityRollForward');

  // ═══════════════════════════════════════════════════════════════
  // SP 3: Maturity Analysis (undiscounted future payments by band)
  // ═══════════════════════════════════════════════════════════════
  console.log('Creating sp_ReportMaturityAnalysis...');
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_ReportMaturityAnalysis', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ReportMaturityAnalysis;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_ReportMaturityAnalysis
      @AsOfDate DATE = NULL,
      @Currency VARCHAR(3) = NULL
    AS BEGIN
      SET NOCOUNT ON;
      IF @AsOfDate IS NULL SET @AsOfDate = GETDATE();

      SELECT 
        c.contract_id,
        c.contract_ref,
        c.asset_type,
        c.currency,
        c.monthly_payment,
        c.expiry_date,
        -- Less than 1 year
        ISNULL((
          SELECT COUNT(*) * c.monthly_payment FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.period_date > @AsOfDate AND a.period_date <= DATEADD(YEAR, 1, @AsOfDate)
        ), 0) AS band_lt_1yr,
        -- 1-2 years
        ISNULL((
          SELECT COUNT(*) * c.monthly_payment FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.period_date > DATEADD(YEAR, 1, @AsOfDate) AND a.period_date <= DATEADD(YEAR, 2, @AsOfDate)
        ), 0) AS band_1_2yr,
        -- 2-5 years
        ISNULL((
          SELECT COUNT(*) * c.monthly_payment FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.period_date > DATEADD(YEAR, 2, @AsOfDate) AND a.period_date <= DATEADD(YEAR, 5, @AsOfDate)
        ), 0) AS band_2_5yr,
        -- More than 5 years
        ISNULL((
          SELECT COUNT(*) * c.monthly_payment FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.period_date > DATEADD(YEAR, 5, @AsOfDate)
        ), 0) AS band_gt_5yr,
        -- Total undiscounted
        (SELECT COUNT(*) FROM lease.amortisation_schedule a WHERE a.contract_id = c.contract_id AND a.period_date > @AsOfDate) * c.monthly_payment AS total_undiscounted
      FROM lease.contracts c
      WHERE c.contract_id >= 77
        AND c.lifecycle_status IN ('Active', 'Originated')
        AND c.expiry_date > @AsOfDate
        AND (@Currency IS NULL OR c.currency = @Currency)
      ORDER BY c.expiry_date;
    END
  `);
  console.log('  ✓ sp_ReportMaturityAnalysis');

  // ═══════════════════════════════════════════════════════════════
  // SP 4: Interest Expense Report
  // ═══════════════════════════════════════════════════════════════
  console.log('Creating sp_ReportInterestExpense...');
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_ReportInterestExpense', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ReportInterestExpense;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_ReportInterestExpense
      @StartDate DATE = NULL,
      @EndDate DATE = NULL,
      @Currency VARCHAR(3) = NULL,
      @Granularity VARCHAR(10) = 'Monthly' -- Monthly or Quarterly
    AS BEGIN
      SET NOCOUNT ON;
      IF @StartDate IS NULL SET @StartDate = DATEFROMPARTS(YEAR(GETDATE()), 1, 1);
      IF @EndDate IS NULL SET @EndDate = GETDATE();

      IF @Granularity = 'Monthly'
      BEGIN
        SELECT 
          YEAR(a.period_date) AS period_year,
          MONTH(a.period_date) AS period_month,
          FORMAT(a.period_date, 'MMM yyyy') AS period_label,
          c.currency,
          SUM(a.interest_expense) AS total_interest,
          SUM(a.depreciation) AS total_depreciation,
          SUM(a.payment) AS total_payment,
          COUNT(DISTINCT c.contract_id) AS lease_count
        FROM lease.amortisation_schedule a
        JOIN lease.contracts c ON c.contract_id = a.contract_id
        WHERE a.period_date BETWEEN @StartDate AND @EndDate
          AND a.posting_status = 'Sent'
          AND c.contract_id >= 77
          AND (@Currency IS NULL OR c.currency = @Currency)
        GROUP BY YEAR(a.period_date), MONTH(a.period_date), FORMAT(a.period_date, 'MMM yyyy'), c.currency
        ORDER BY YEAR(a.period_date), MONTH(a.period_date), c.currency;
      END
      ELSE
      BEGIN
        SELECT 
          YEAR(a.period_date) AS period_year,
          CEILING(CAST(MONTH(a.period_date) AS FLOAT) / 3) AS quarter,
          'Q' + CAST(CEILING(CAST(MONTH(a.period_date) AS FLOAT) / 3) AS VARCHAR) + ' ' + CAST(YEAR(a.period_date) AS VARCHAR) AS period_label,
          c.currency,
          SUM(a.interest_expense) AS total_interest,
          SUM(a.depreciation) AS total_depreciation,
          SUM(a.payment) AS total_payment,
          COUNT(DISTINCT c.contract_id) AS lease_count
        FROM lease.amortisation_schedule a
        JOIN lease.contracts c ON c.contract_id = a.contract_id
        WHERE a.period_date BETWEEN @StartDate AND @EndDate
          AND a.posting_status = 'Sent'
          AND c.contract_id >= 77
          AND (@Currency IS NULL OR c.currency = @Currency)
        GROUP BY YEAR(a.period_date), CEILING(CAST(MONTH(a.period_date) AS FLOAT) / 3), c.currency
        ORDER BY YEAR(a.period_date), CEILING(CAST(MONTH(a.period_date) AS FLOAT) / 3), c.currency;
      END
    END
  `);
  console.log('  ✓ sp_ReportInterestExpense');

  // ═══════════════════════════════════════════════════════════════
  // SP 5: Lease Expiry Report
  // ═══════════════════════════════════════════════════════════════
  console.log('Creating sp_ReportLeaseExpiry...');
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_ReportLeaseExpiry', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ReportLeaseExpiry;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_ReportLeaseExpiry
      @DaysAhead INT = 365,
      @Currency VARCHAR(3) = NULL
    AS BEGIN
      SET NOCOUNT ON;
      DECLARE @CutoffDate DATE = DATEADD(DAY, @DaysAhead, GETDATE());

      SELECT 
        c.contract_id,
        c.contract_ref,
        c.asset_type,
        c.asset_description,
        c.currency,
        c.monthly_payment,
        c.expiry_date,
        DATEDIFF(DAY, GETDATE(), c.expiry_date) AS days_remaining,
        CASE 
          WHEN DATEDIFF(DAY, GETDATE(), c.expiry_date) <= 30 THEN 'Critical'
          WHEN DATEDIFF(DAY, GETDATE(), c.expiry_date) <= 90 THEN 'Urgent'
          WHEN DATEDIFF(DAY, GETDATE(), c.expiry_date) <= 180 THEN 'Attention'
          ELSE 'Normal'
        END AS urgency,
        c.renewal_option,
        c.renewal_certain,
        -- Current liability balance
        ISNULL((
          SELECT TOP 1 a.closing_liability FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.posting_status = 'Sent'
          ORDER BY a.period_date DESC
        ), c.lease_liability_commence) AS current_liability,
        -- Current ROU NBV
        c.rou_asset_value - ISNULL((
          SELECT SUM(a.depreciation) FROM lease.amortisation_schedule a 
          WHERE a.contract_id = c.contract_id AND a.posting_status = 'Sent'
        ), 0) AS current_rou_nbv
      FROM lease.contracts c
      WHERE c.contract_id >= 77
        AND c.lifecycle_status IN ('Active', 'Originated')
        AND c.expiry_date <= @CutoffDate
        AND c.expiry_date >= GETDATE()
        AND (@Currency IS NULL OR c.currency = @Currency)
      ORDER BY c.expiry_date ASC;
    END
  `);
  console.log('  ✓ sp_ReportLeaseExpiry');

  // ═══════════════════════════════════════════════════════════════
  // SP 6: Cash Payment Forecast (next 12 months)
  // ═══════════════════════════════════════════════════════════════
  console.log('Creating sp_ReportCashForecast...');
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_ReportCashForecast', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ReportCashForecast;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_ReportCashForecast
      @Months INT = 12,
      @Currency VARCHAR(3) = NULL
    AS BEGIN
      SET NOCOUNT ON;
      DECLARE @StartDate DATE = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) + 1, 0); -- First of next month
      DECLARE @EndDate DATE = DATEADD(MONTH, @Months, @StartDate);

      SELECT 
        YEAR(a.period_date) AS period_year,
        MONTH(a.period_date) AS period_month,
        FORMAT(a.period_date, 'MMM yyyy') AS period_label,
        c.currency,
        SUM(a.payment) AS total_payment,
        SUM(a.interest_expense) AS interest_portion,
        SUM(a.principal) AS principal_portion,
        COUNT(DISTINCT c.contract_id) AS lease_count
      FROM lease.amortisation_schedule a
      JOIN lease.contracts c ON c.contract_id = a.contract_id
      WHERE a.period_date >= @StartDate
        AND a.period_date < @EndDate
        AND c.contract_id >= 77
        AND c.lifecycle_status IN ('Active', 'Originated')
        AND (@Currency IS NULL OR c.currency = @Currency)
      GROUP BY YEAR(a.period_date), MONTH(a.period_date), FORMAT(a.period_date, 'MMM yyyy'), c.currency
      ORDER BY YEAR(a.period_date), MONTH(a.period_date), c.currency;
    END
  `);
  console.log('  ✓ sp_ReportCashForecast');

  // ═══════════════════════════════════════════════════════════════
  // SP 7: Portfolio Summary (for dashboard cards)
  // ═══════════════════════════════════════════════════════════════
  console.log('Creating sp_ReportPortfolioSummary...');
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_ReportPortfolioSummary', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ReportPortfolioSummary;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_ReportPortfolioSummary
    AS BEGIN
      SET NOCOUNT ON;
      SELECT 
        COUNT(*) AS total_leases,
        SUM(CASE WHEN asset_type = 'Office' THEN 1 ELSE 0 END) AS office_count,
        SUM(CASE WHEN asset_type = 'Vehicle' THEN 1 ELSE 0 END) AS vehicle_count,
        SUM(CASE WHEN asset_type = 'Equipment' THEN 1 ELSE 0 END) AS equipment_count,
        SUM(CASE WHEN asset_type NOT IN ('Office', 'Vehicle', 'Equipment') THEN 1 ELSE 0 END) AS other_count,
        SUM(rou_asset_value) AS total_rou_original,
        SUM(lease_liability_commence) AS total_liability_original,
        SUM(monthly_payment) AS total_monthly_payment,
        -- Current total liability
        (SELECT SUM(sub.closing_liability) FROM (
          SELECT c2.contract_id, 
            ISNULL((SELECT TOP 1 a.closing_liability FROM lease.amortisation_schedule a 
              WHERE a.contract_id = c2.contract_id AND a.posting_status = 'Sent' ORDER BY a.period_date DESC
            ), c2.lease_liability_commence) AS closing_liability
          FROM lease.contracts c2 WHERE c2.contract_id >= 77 AND c2.lifecycle_status IN ('Active', 'Originated')
        ) sub) AS current_total_liability,
        -- Leases by currency
        SUM(CASE WHEN currency = 'QAR' THEN 1 ELSE 0 END) AS qar_count,
        SUM(CASE WHEN currency = 'AED' THEN 1 ELSE 0 END) AS aed_count,
        SUM(CASE WHEN currency NOT IN ('QAR', 'AED') THEN 1 ELSE 0 END) AS other_currency_count
      FROM lease.contracts
      WHERE contract_id >= 77
        AND lifecycle_status IN ('Active', 'Originated');
    END
  `);
  console.log('  ✓ sp_ReportPortfolioSummary');

  // Test one SP
  console.log('\nTesting sp_ReportPortfolioSummary...');
  const test = await pool.request().execute('dbo.sp_ReportPortfolioSummary');
  console.log(JSON.stringify(test.recordset[0], null, 2));

  await pool.close();
  console.log('\nDone! All report SPs created.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
