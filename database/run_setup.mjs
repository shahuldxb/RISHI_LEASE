import sql from 'mssql';

const config = {
  server: 'SQL_SERVER_HOST_REDACTED',
  database: 'leasing',
  user: 'SQL_USER_REDACTED',
  password: 'SQL_PASSWORD_REDACTED',
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectTimeout: 30000,
    requestTimeout: 300000
  }
};

async function exec(pool, statement, label = '') {
  try {
    await pool.request().query(statement);
    if (label) console.log(`  ✓ ${label}`);
    return true;
  } catch (err) {
    if (err.message.includes('already exists') || err.message.includes('There is already') || err.message.includes('Duplicate key')) {
      if (label) console.log(`  ~ ${label} (already exists)`);
      return true;
    }
    console.error(`  ✗ ${label || statement.substring(0, 60)}: ${err.message}`);
    return false;
  }
}

async function run() {
  const pool = await sql.connect(config);
  console.log('Connected to SQL Server leasing database\n');

  // ── SCHEMAS ──────────────────────────────────────────────
  console.log('Creating schemas...');
  for (const s of ['coa','lease','payables','finance','compliance','mis','security','workflow']) {
    await exec(pool, `IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name='${s}') EXEC('CREATE SCHEMA ${s}')`, `schema: ${s}`);
  }

  // ── COA ──────────────────────────────────────────────────
  console.log('\nCreating coa.accounts...');
  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='accounts' AND schema_id=SCHEMA_ID('coa'))
    CREATE TABLE coa.accounts (
      account_code VARCHAR(10) NOT NULL PRIMARY KEY,
      account_name NVARCHAR(200) NOT NULL,
      class VARCHAR(20) NOT NULL,
      type VARCHAR(50) NOT NULL,
      sub_type VARCHAR(100),
      currency CHAR(3) DEFAULT 'USD',
      ifrs16_flag BIT DEFAULT 0,
      intercompany_flag BIT DEFAULT 0,
      status VARCHAR(10) DEFAULT 'Active',
      group_mapping_code VARCHAR(20),
      created_by INT,
      created_at DATETIME2 DEFAULT GETUTCDATE(),
      valid_from DATE,
      valid_to DATE
    )`, 'coa.accounts');

  // ── SECURITY ─────────────────────────────────────────────
  console.log('\nCreating security tables...');
  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='users' AND schema_id=SCHEMA_ID('security'))
    CREATE TABLE security.users (
      user_id INT IDENTITY(1,1) PRIMARY KEY,
      open_id VARCHAR(100) NOT NULL UNIQUE,
      username VARCHAR(100) NOT NULL,
      email VARCHAR(320),
      password_hash VARCHAR(256),
      mfa_secret_enc VARCHAR(512),
      role VARCHAR(50) NOT NULL DEFAULT 'ReadOnly',
      entity_permissions NVARCHAR(MAX),
      status VARCHAR(20) DEFAULT 'Active',
      last_login DATETIME2,
      created_at DATETIME2 DEFAULT GETUTCDATE(),
      updated_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'security.users');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='screen_registry' AND schema_id=SCHEMA_ID('security'))
    CREATE TABLE security.screen_registry (
      screen_id VARCHAR(20) NOT NULL PRIMARY KEY,
      screen_name NVARCHAR(200) NOT NULL,
      module VARCHAR(50) NOT NULL,
      sub_module VARCHAR(50),
      screen_type VARCHAR(20),
      route VARCHAR(200),
      allowed_roles NVARCHAR(500),
      created_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'security.screen_registry');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='mc_thresholds' AND schema_id=SCHEMA_ID('security'))
    CREATE TABLE security.mc_thresholds (
      threshold_id INT IDENTITY(1,1) PRIMARY KEY,
      module VARCHAR(50) NOT NULL,
      role VARCHAR(50) NOT NULL,
      max_amount DECIMAL(18,2),
      currency CHAR(3) DEFAULT 'USD',
      is_active BIT DEFAULT 1,
      updated_by INT,
      updated_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'security.mc_thresholds');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='maker_checker_queue' AND schema_id=SCHEMA_ID('security'))
    CREATE TABLE security.maker_checker_queue (
      queue_id INT IDENTITY(1,1) PRIMARY KEY,
      queue_ref VARCHAR(30) NOT NULL UNIQUE,
      module VARCHAR(50) NOT NULL,
      record_type VARCHAR(100) NOT NULL,
      record_id VARCHAR(50) NOT NULL,
      record_summary NVARCHAR(500),
      value DECIMAL(18,2),
      currency CHAR(3) DEFAULT 'USD',
      submitted_by INT NOT NULL,
      submitted_at DATETIME2 DEFAULT GETUTCDATE(),
      checker_id INT,
      actioned_at DATETIME2,
      outcome VARCHAR(20) DEFAULT 'Pending',
      rejection_reason NVARCHAR(1000),
      sla_due_at DATETIME2,
      screen_id VARCHAR(20)
    )`, 'security.maker_checker_queue');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='delegations' AND schema_id=SCHEMA_ID('security'))
    CREATE TABLE security.delegations (
      delegation_id INT IDENTITY(1,1) PRIMARY KEY,
      delegator_id INT NOT NULL,
      delegate_id INT NOT NULL,
      valid_from DATE NOT NULL,
      valid_to DATE NOT NULL,
      modules NVARCHAR(500),
      created_by INT,
      created_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'security.delegations');

  // ── LEASE ─────────────────────────────────────────────────
  console.log('\nCreating lease tables...');
  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='lessors' AND schema_id=SCHEMA_ID('lease'))
    CREATE TABLE lease.lessors (
      lessor_id INT IDENTITY(1,1) PRIMARY KEY,
      lessor_ref VARCHAR(20) NOT NULL UNIQUE,
      legal_name NVARCHAR(300) NOT NULL,
      registration_no VARCHAR(100),
      tax_no VARCHAR(100),
      country CHAR(2),
      currency CHAR(3) DEFAULT 'USD',
      bank_details_enc NVARCHAR(MAX),
      contact_json NVARCHAR(MAX),
      status VARCHAR(20) DEFAULT 'Active',
      created_by INT,
      created_at DATETIME2 DEFAULT GETUTCDATE(),
      updated_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'lease.lessors');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='contracts' AND schema_id=SCHEMA_ID('lease'))
    CREATE TABLE lease.contracts (
      contract_id INT IDENTITY(1,1) PRIMARY KEY,
      contract_ref VARCHAR(30) NOT NULL UNIQUE,
      lessor_id INT NOT NULL,
      asset_type VARCHAR(50) NOT NULL,
      asset_description NVARCHAR(500),
      asset_tag VARCHAR(100),
      location_json NVARCHAR(MAX),
      commencement_date DATE NOT NULL,
      expiry_date DATE NOT NULL,
      term_months INT NOT NULL,
      monthly_payment DECIMAL(18,2) NOT NULL,
      currency CHAR(3) DEFAULT 'USD',
      escalation_rate DECIMAL(8,4) DEFAULT 0,
      escalation_date DATE,
      ibr DECIMAL(8,6) NOT NULL,
      deposit_amount DECIMAL(18,2) DEFAULT 0,
      ifrs16_classification VARCHAR(20) DEFAULT 'Finance',
      renewal_option BIT DEFAULT 0,
      renewal_certain BIT DEFAULT 0,
      purchase_option BIT DEFAULT 0,
      purchase_certain BIT DEFAULT 0,
      make_good_obligation BIT DEFAULT 0,
      make_good_estimate DECIMAL(18,2) DEFAULT 0,
      initial_direct_costs DECIMAL(18,2) DEFAULT 0,
      lease_incentives DECIMAL(18,2) DEFAULT 0,
      rou_asset_value DECIMAL(18,2),
      lease_liability_commence DECIMAL(18,2),
      is_lto BIT DEFAULT 0,
      lto_purchase_price DECIMAL(18,2),
      lto_deposit DECIMAL(18,2),
      lto_net_financed DECIMAL(18,2),
      lto_total_instalments INT,
      lto_instalment_amount DECIMAL(18,2),
      lto_frequency VARCHAR(20),
      lto_finance_charge_rate DECIMAL(8,6),
      lto_balloon_amount DECIMAL(18,2),
      lto_transfer_date DATE,
      maintenance_responsibility VARCHAR(20) DEFAULT 'Lessor',
      status VARCHAR(30) DEFAULT 'Draft',
      maker_id INT,
      checker_id INT,
      approved_at DATETIME2,
      screen_id VARCHAR(20),
      process_start_time DATETIME2,
      process_end_time DATETIME2,
      elapsed_ms BIGINT,
      created_at DATETIME2 DEFAULT GETUTCDATE(),
      updated_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'lease.contracts');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='amortisation_schedule' AND schema_id=SCHEMA_ID('lease'))
    CREATE TABLE lease.amortisation_schedule (
      schedule_id INT IDENTITY(1,1) PRIMARY KEY,
      contract_id INT NOT NULL,
      period_date DATE NOT NULL,
      opening_liability DECIMAL(18,2) NOT NULL,
      interest_expense DECIMAL(18,2) NOT NULL,
      payment DECIMAL(18,2) NOT NULL,
      principal DECIMAL(18,2) NOT NULL,
      closing_liability DECIMAL(18,2) NOT NULL,
      rou_nbv DECIMAL(18,2) NOT NULL,
      depreciation DECIMAL(18,2) NOT NULL,
      cumulative_depr DECIMAL(18,2) NOT NULL
    )`, 'lease.amortisation_schedule');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='modifications' AND schema_id=SCHEMA_ID('lease'))
    CREATE TABLE lease.modifications (
      modification_id INT IDENTITY(1,1) PRIMARY KEY,
      mod_ref VARCHAR(30) NOT NULL UNIQUE,
      contract_id INT NOT NULL,
      modification_date DATE NOT NULL,
      modification_type VARCHAR(50) NOT NULL,
      old_terms_json NVARCHAR(MAX),
      new_terms_json NVARCHAR(MAX),
      liability_adjustment DECIMAL(18,2),
      rou_adjustment DECIMAL(18,2),
      gl_journal_id INT,
      status VARCHAR(20) DEFAULT 'Draft',
      maker_id INT,
      checker_id INT,
      screen_id VARCHAR(20),
      created_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'lease.modifications');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='insurance_policies' AND schema_id=SCHEMA_ID('lease'))
    CREATE TABLE lease.insurance_policies (
      policy_id INT IDENTITY(1,1) PRIMARY KEY,
      policy_ref VARCHAR(30) NOT NULL UNIQUE,
      contract_id INT,
      provider_name NVARCHAR(200) NOT NULL,
      policy_number VARCHAR(100) NOT NULL,
      coverage_type VARCHAR(100),
      premium_amount DECIMAL(18,2),
      currency CHAR(3) DEFAULT 'USD',
      valid_from DATE NOT NULL,
      valid_to DATE NOT NULL,
      renewal_alert_days INT DEFAULT 30,
      status VARCHAR(20) DEFAULT 'Active',
      document_url VARCHAR(500),
      created_by INT,
      created_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'lease.insurance_policies');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='maintenance_tickets' AND schema_id=SCHEMA_ID('lease'))
    CREATE TABLE lease.maintenance_tickets (
      ticket_id INT IDENTITY(1,1) PRIMARY KEY,
      ticket_ref VARCHAR(30) NOT NULL UNIQUE,
      contract_id INT NOT NULL,
      issue_type VARCHAR(100),
      description NVARCHAR(1000),
      responsible_party VARCHAR(20) DEFAULT 'Lessor',
      reported_by INT,
      reported_at DATETIME2 DEFAULT GETUTCDATE(),
      sla_due_at DATETIME2,
      resolved_at DATETIME2,
      resolution_notes NVARCHAR(1000),
      cost_recovery_amount DECIMAL(18,2),
      cost_recovery_invoice_id INT,
      status VARCHAR(20) DEFAULT 'Open',
      screen_id VARCHAR(20)
    )`, 'lease.maintenance_tickets');

  // ── PAYABLES ──────────────────────────────────────────────
  console.log('\nCreating payables tables...');
  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='invoices' AND schema_id=SCHEMA_ID('payables'))
    CREATE TABLE payables.invoices (
      invoice_id INT IDENTITY(1,1) PRIMARY KEY,
      invoice_ref VARCHAR(30) NOT NULL UNIQUE,
      lessor_id INT NOT NULL,
      contract_id INT,
      invoice_number VARCHAR(100),
      invoice_date DATE NOT NULL,
      period_month INT,
      period_year INT,
      rent_amount DECIMAL(18,2) DEFAULT 0,
      service_charge DECIMAL(18,2) DEFAULT 0,
      vat DECIMAL(18,2) DEFAULT 0,
      total DECIMAL(18,2) NOT NULL,
      currency CHAR(3) DEFAULT 'USD',
      gl_account VARCHAR(10),
      cost_centre VARCHAR(20),
      due_date DATE,
      status VARCHAR(30) DEFAULT 'Draft',
      ocr_extracted_json NVARCHAR(MAX),
      discrepancy_flag BIT DEFAULT 0,
      discrepancy_notes NVARCHAR(1000),
      maker_id INT,
      checker_id INT,
      screen_id VARCHAR(20),
      process_start_time DATETIME2,
      process_end_time DATETIME2,
      elapsed_ms BIGINT,
      created_at DATETIME2 DEFAULT GETUTCDATE(),
      updated_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'payables.invoices');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='payment_runs' AND schema_id=SCHEMA_ID('payables'))
    CREATE TABLE payables.payment_runs (
      run_id INT IDENTITY(1,1) PRIMARY KEY,
      run_ref VARCHAR(30) NOT NULL UNIQUE,
      run_date DATE NOT NULL,
      total_amount DECIMAL(18,2) NOT NULL,
      currency CHAR(3) DEFAULT 'USD',
      bank_file_format VARCHAR(10) DEFAULT 'SWIFT',
      bank_file_reference VARCHAR(100),
      bank_file_url VARCHAR(500),
      status VARCHAR(20) DEFAULT 'Draft',
      maker_id INT,
      checker_id INT,
      approved_at DATETIME2,
      screen_id VARCHAR(20),
      created_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'payables.payment_runs');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='payment_run_lines' AND schema_id=SCHEMA_ID('payables'))
    CREATE TABLE payables.payment_run_lines (
      line_id INT IDENTITY(1,1) PRIMARY KEY,
      run_id INT NOT NULL,
      invoice_id INT NOT NULL,
      amount DECIMAL(18,2) NOT NULL,
      currency CHAR(3) DEFAULT 'USD',
      lessor_bank_ref VARCHAR(200)
    )`, 'payables.payment_run_lines');

  // ── FINANCE ───────────────────────────────────────────────
  console.log('\nCreating finance tables...');
  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='gl_journals' AND schema_id=SCHEMA_ID('finance'))
    CREATE TABLE finance.gl_journals (
      journal_id INT IDENTITY(1,1) PRIMARY KEY,
      journal_ref VARCHAR(30) NOT NULL UNIQUE,
      reference VARCHAR(100),
      transaction_date DATE NOT NULL,
      period VARCHAR(7),
      source VARCHAR(50),
      description NVARCHAR(500),
      currency CHAR(3) DEFAULT 'USD',
      status VARCHAR(20) DEFAULT 'Draft',
      maker_id INT,
      checker_id INT,
      posted_at DATETIME2,
      screen_id VARCHAR(20),
      process_start_time DATETIME2,
      process_end_time DATETIME2,
      elapsed_ms BIGINT,
      created_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'finance.gl_journals');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='gl_lines' AND schema_id=SCHEMA_ID('finance'))
    CREATE TABLE finance.gl_lines (
      line_id INT IDENTITY(1,1) PRIMARY KEY,
      journal_id INT NOT NULL,
      account_code VARCHAR(10) NOT NULL,
      description NVARCHAR(300),
      cost_centre VARCHAR(20),
      debit DECIMAL(18,2) DEFAULT 0,
      credit DECIMAL(18,2) DEFAULT 0,
      department VARCHAR(50),
      project_code VARCHAR(50)
    )`, 'finance.gl_lines');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='budgets' AND schema_id=SCHEMA_ID('finance'))
    CREATE TABLE finance.budgets (
      budget_id INT IDENTITY(1,1) PRIMARY KEY,
      account_code VARCHAR(10) NOT NULL,
      cost_centre VARCHAR(20),
      period_year INT NOT NULL,
      period_month INT NOT NULL,
      budget_amount DECIMAL(18,2) NOT NULL,
      currency CHAR(3) DEFAULT 'USD',
      version INT DEFAULT 1,
      approved_by INT,
      created_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'finance.budgets');

  // ── COMPLIANCE ────────────────────────────────────────────
  console.log('\nCreating compliance tables...');
  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='audit_log' AND schema_id=SCHEMA_ID('compliance'))
    CREATE TABLE compliance.audit_log (
      log_id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
      audit_no VARCHAR(30) NOT NULL UNIQUE,
      timestamp_utc DATETIME2 DEFAULT GETUTCDATE(),
      timestamp_local DATETIME2,
      user_id INT,
      username VARCHAR(100),
      user_role VARCHAR(50),
      ip_address VARCHAR(45),
      device_fingerprint VARCHAR(200),
      browser_os VARCHAR(200),
      module VARCHAR(50),
      sub_module VARCHAR(50),
      action_type VARCHAR(50),
      record_table VARCHAR(100),
      record_id VARCHAR(50),
      before_state NVARCHAR(MAX),
      after_state NVARCHAR(MAX),
      outcome VARCHAR(20),
      row_hash CHAR(64),
      prev_row_hash CHAR(64),
      screen_id VARCHAR(20),
      process_start_time DATETIME2,
      process_end_time DATETIME2,
      elapsed_ms BIGINT
    )`, 'compliance.audit_log');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='error_log' AND schema_id=SCHEMA_ID('compliance'))
    CREATE TABLE compliance.error_log (
      error_id INT IDENTITY(1,1) PRIMARY KEY,
      error_no VARCHAR(30) NOT NULL UNIQUE,
      timestamp_utc DATETIME2 DEFAULT GETUTCDATE(),
      severity VARCHAR(20) NOT NULL,
      module VARCHAR(50),
      error_code VARCHAR(50),
      message NVARCHAR(500),
      full_message NVARCHAR(MAX),
      stack_trace NVARCHAR(MAX),
      user_context NVARCHAR(MAX),
      job_context NVARCHAR(MAX),
      resolution_status VARCHAR(20) DEFAULT 'Open',
      assigned_to INT,
      resolution_note NVARCHAR(1000),
      resolved_at DATETIME2,
      screen_id VARCHAR(20)
    )`, 'compliance.error_log');

  // ── MIS ───────────────────────────────────────────────────
  console.log('\nCreating mis tables...');
  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='daily_snapshot' AND schema_id=SCHEMA_ID('mis'))
    CREATE TABLE mis.daily_snapshot (
      snapshot_id INT IDENTITY(1,1) PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      total_active_leases INT DEFAULT 0,
      total_rou_nbv DECIMAL(18,2) DEFAULT 0,
      total_liability_current DECIMAL(18,2) DEFAULT 0,
      total_liability_noncurrent DECIMAL(18,2) DEFAULT 0,
      payments_due_30d DECIMAL(18,2) DEFAULT 0,
      overdue_payables DECIMAL(18,2) DEFAULT 0,
      ytd_depreciation DECIMAL(18,2) DEFAULT 0,
      ytd_interest DECIMAL(18,2) DEFAULT 0,
      kpi_json NVARCHAR(MAX),
      created_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'mis.daily_snapshot');

  // ── WORKFLOW ──────────────────────────────────────────────
  console.log('\nCreating workflow tables...');
  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='process_definitions' AND schema_id=SCHEMA_ID('workflow'))
    CREATE TABLE workflow.process_definitions (
      definition_id INT IDENTITY(1,1) PRIMARY KEY,
      process_key VARCHAR(100) NOT NULL,
      version INT DEFAULT 1,
      name NVARCHAR(200),
      bpmn_xml NVARCHAR(MAX),
      is_active BIT DEFAULT 1,
      created_by INT,
      created_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'workflow.process_definitions');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='process_instances' AND schema_id=SCHEMA_ID('workflow'))
    CREATE TABLE workflow.process_instances (
      instance_id INT IDENTITY(1,1) PRIMARY KEY,
      instance_ref VARCHAR(30) NOT NULL UNIQUE,
      definition_id INT NOT NULL,
      process_key VARCHAR(100) NOT NULL,
      business_key VARCHAR(100),
      business_entity VARCHAR(50),
      variables_json NVARCHAR(MAX),
      current_task VARCHAR(100),
      status VARCHAR(20) DEFAULT 'Running',
      started_by INT,
      started_at DATETIME2 DEFAULT GETUTCDATE(),
      completed_at DATETIME2,
      screen_id VARCHAR(20)
    )`, 'workflow.process_instances');

  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='user_tasks' AND schema_id=SCHEMA_ID('workflow'))
    CREATE TABLE workflow.user_tasks (
      task_id INT IDENTITY(1,1) PRIMARY KEY,
      task_ref VARCHAR(30) NOT NULL UNIQUE,
      instance_id INT NOT NULL,
      task_key VARCHAR(100) NOT NULL,
      task_name NVARCHAR(200),
      assigned_role VARCHAR(50),
      assigned_user_id INT,
      priority INT DEFAULT 50,
      due_date DATETIME2,
      sla_hours INT DEFAULT 24,
      status VARCHAR(20) DEFAULT 'Open',
      claimed_by INT,
      claimed_at DATETIME2,
      completed_by INT,
      completed_at DATETIME2,
      outcome VARCHAR(50),
      comment NVARCHAR(1000),
      screen_id VARCHAR(20),
      created_at DATETIME2 DEFAULT GETUTCDATE()
    )`, 'workflow.user_tasks');

  // ── STORED PROCEDURES ─────────────────────────────────────
  console.log('\nCreating stored procedures...');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetDashboardKPIs AS
    BEGIN
      SET NOCOUNT ON;
      SELECT
        (SELECT COUNT(*) FROM lease.contracts WHERE status='Active') AS total_active_leases,
        (SELECT ISNULL(SUM(closing_liability),0) FROM lease.amortisation_schedule a
         INNER JOIN lease.contracts c ON a.contract_id=c.contract_id
         WHERE c.status='Active'
           AND a.period_date=(SELECT MAX(period_date) FROM lease.amortisation_schedule a2 WHERE a2.contract_id=a.contract_id)) AS total_lease_liability,
        (SELECT ISNULL(SUM(rou_nbv),0) FROM lease.amortisation_schedule a
         INNER JOIN lease.contracts c ON a.contract_id=c.contract_id
         WHERE c.status='Active'
           AND a.period_date=(SELECT MAX(period_date) FROM lease.amortisation_schedule a2 WHERE a2.contract_id=a.contract_id)) AS total_rou_nbv,
        (SELECT ISNULL(SUM(total),0) FROM payables.invoices
         WHERE due_date BETWEEN GETUTCDATE() AND DATEADD(DAY,30,GETUTCDATE()) AND status NOT IN ('Paid','Cancelled')) AS payments_due_30d,
        (SELECT ISNULL(SUM(total),0) FROM payables.invoices
         WHERE due_date < GETUTCDATE() AND status NOT IN ('Paid','Cancelled')) AS overdue_payables,
        (SELECT ISNULL(SUM(depreciation),0) FROM lease.amortisation_schedule a
         INNER JOIN lease.contracts c ON a.contract_id=c.contract_id
         WHERE c.status='Active' AND YEAR(a.period_date)=YEAR(GETUTCDATE())) AS ytd_depreciation,
        (SELECT ISNULL(SUM(interest_expense),0) FROM lease.amortisation_schedule a
         INNER JOIN lease.contracts c ON a.contract_id=c.contract_id
         WHERE c.status='Active' AND YEAR(a.period_date)=YEAR(GETUTCDATE())) AS ytd_interest,
        (SELECT COUNT(*) FROM security.maker_checker_queue WHERE outcome='Pending') AS pending_approvals,
        (SELECT COUNT(*) FROM compliance.error_log WHERE resolution_status='Open' AND severity IN ('Error','Critical')) AS open_errors;
    END`, 'sp_GetDashboardKPIs');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetLeaseRegister
      @PageNumber INT=1, @PageSize INT=100, @StatusFilter VARCHAR(30)=NULL,
      @AssetType VARCHAR(50)=NULL, @SearchTerm NVARCHAR(200)=NULL,
      @SortColumn VARCHAR(50)='created_at', @SortDirection VARCHAR(4)='DESC'
    AS BEGIN
      SET NOCOUNT ON;
      DECLARE @Offset INT=(@PageNumber-1)*@PageSize;
      SELECT c.contract_id,c.contract_ref,c.status,c.asset_type,c.asset_description,
        c.asset_tag,l.legal_name AS lessor_name,l.country AS lessor_country,
        c.commencement_date,c.expiry_date,c.term_months,c.monthly_payment,c.currency,
        c.rou_asset_value,c.lease_liability_commence,c.ifrs16_classification,c.is_lto,
        c.maintenance_responsibility,u1.username AS maker_name,u2.username AS checker_name,
        c.approved_at,c.created_at,COUNT(*) OVER() AS total_count
      FROM lease.contracts c
      INNER JOIN lease.lessors l ON c.lessor_id=l.lessor_id
      LEFT JOIN security.users u1 ON c.maker_id=u1.user_id
      LEFT JOIN security.users u2 ON c.checker_id=u2.user_id
      WHERE (@StatusFilter IS NULL OR c.status=@StatusFilter)
        AND (@AssetType IS NULL OR c.asset_type=@AssetType)
        AND (@SearchTerm IS NULL OR c.contract_ref LIKE '%'+@SearchTerm+'%' OR l.legal_name LIKE '%'+@SearchTerm+'%')
      ORDER BY c.created_at DESC
      OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
    END`, 'sp_GetLeaseRegister');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetLeaseById @ContractId INT AS
    BEGIN
      SET NOCOUNT ON;
      SELECT c.*,l.legal_name AS lessor_name,l.registration_no,l.tax_no,
        l.country AS lessor_country,l.currency AS lessor_currency,l.contact_json,
        u1.username AS maker_name,u2.username AS checker_name
      FROM lease.contracts c
      INNER JOIN lease.lessors l ON c.lessor_id=l.lessor_id
      LEFT JOIN security.users u1 ON c.maker_id=u1.user_id
      LEFT JOIN security.users u2 ON c.checker_id=u2.user_id
      WHERE c.contract_id=@ContractId;
    END`, 'sp_GetLeaseById');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_CreateLease
      @LessorId INT, @AssetType VARCHAR(50), @AssetDescription NVARCHAR(500),
      @AssetTag VARCHAR(100), @LocationJson NVARCHAR(MAX), @CommencementDate DATE,
      @ExpiryDate DATE, @TermMonths INT, @MonthlyPayment DECIMAL(18,2), @Currency CHAR(3),
      @EscalationRate DECIMAL(8,4), @EscalationDate DATE, @IBR DECIMAL(8,6),
      @DepositAmount DECIMAL(18,2), @IFRS16Classification VARCHAR(20),
      @RenewalOption BIT, @RenewalCertain BIT, @PurchaseOption BIT, @PurchaseCertain BIT,
      @MakeGoodObligation BIT, @MakeGoodEstimate DECIMAL(18,2), @InitialDirectCosts DECIMAL(18,2),
      @LeaseIncentives DECIMAL(18,2), @IsLTO BIT, @LTOPurchasePrice DECIMAL(18,2),
      @LTODeposit DECIMAL(18,2), @LTONetFinanced DECIMAL(18,2), @LTOTotalInstalments INT,
      @LTOInstalmentAmount DECIMAL(18,2), @LTOFrequency VARCHAR(20), @LTOFinanceChargeRate DECIMAL(8,6),
      @LTOBalloonAmount DECIMAL(18,2), @LTOTransferDate DATE, @MaintenanceResp VARCHAR(20),
      @MakerId INT, @ScreenId VARCHAR(20), @ProcessStartTime DATETIME2
    AS BEGIN
      SET NOCOUNT ON;
      DECLARE @Seq INT; SELECT @Seq=ISNULL(MAX(contract_id),0)+1 FROM lease.contracts;
      DECLARE @ContractRef VARCHAR(30)='LSE-'+CAST(YEAR(GETUTCDATE()) AS VARCHAR)+'-'+RIGHT('000000'+CAST(@Seq AS VARCHAR),6);
      INSERT INTO lease.contracts (contract_ref,lessor_id,asset_type,asset_description,asset_tag,
        location_json,commencement_date,expiry_date,term_months,monthly_payment,currency,
        escalation_rate,escalation_date,ibr,deposit_amount,ifrs16_classification,
        renewal_option,renewal_certain,purchase_option,purchase_certain,
        make_good_obligation,make_good_estimate,initial_direct_costs,lease_incentives,
        is_lto,lto_purchase_price,lto_deposit,lto_net_financed,lto_total_instalments,
        lto_instalment_amount,lto_frequency,lto_finance_charge_rate,lto_balloon_amount,lto_transfer_date,
        maintenance_responsibility,status,maker_id,screen_id,process_start_time,process_end_time,elapsed_ms)
      VALUES (@ContractRef,@LessorId,@AssetType,@AssetDescription,@AssetTag,
        @LocationJson,@CommencementDate,@ExpiryDate,@TermMonths,@MonthlyPayment,@Currency,
        @EscalationRate,@EscalationDate,@IBR,@DepositAmount,@IFRS16Classification,
        @RenewalOption,@RenewalCertain,@PurchaseOption,@PurchaseCertain,
        @MakeGoodObligation,@MakeGoodEstimate,@InitialDirectCosts,@LeaseIncentives,
        @IsLTO,@LTOPurchasePrice,@LTODeposit,@LTONetFinanced,@LTOTotalInstalments,
        @LTOInstalmentAmount,@LTOFrequency,@LTOFinanceChargeRate,@LTOBalloonAmount,@LTOTransferDate,
        @MaintenanceResp,'Draft',@MakerId,@ScreenId,@ProcessStartTime,GETUTCDATE(),
        DATEDIFF(MILLISECOND,@ProcessStartTime,GETUTCDATE()));
      SELECT SCOPE_IDENTITY() AS contract_id,@ContractRef AS contract_ref;
    END`, 'sp_CreateLease');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_UpdateLeaseROU
      @ContractId INT, @ROUAssetValue DECIMAL(18,2), @LeaseLiabilityCommence DECIMAL(18,2)
    AS BEGIN
      SET NOCOUNT ON;
      UPDATE lease.contracts SET rou_asset_value=@ROUAssetValue,
        lease_liability_commence=@LeaseLiabilityCommence, updated_at=GETUTCDATE()
      WHERE contract_id=@ContractId;
    END`, 'sp_UpdateLeaseROU');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_SubmitLeaseForApproval @ContractId INT, @MakerId INT, @ScreenId VARCHAR(20) AS
    BEGIN
      SET NOCOUNT ON;
      DECLARE @Seq INT; SELECT @Seq=ISNULL(MAX(queue_id),0)+1 FROM security.maker_checker_queue;
      DECLARE @QueueRef VARCHAR(30)='MCQ-'+CAST(YEAR(GETUTCDATE()) AS VARCHAR)+'-'+RIGHT('000000'+CAST(@Seq AS VARCHAR),6);
      UPDATE lease.contracts SET status='Submitted',updated_at=GETUTCDATE() WHERE contract_id=@ContractId;
      DECLARE @Summary NVARCHAR(500); DECLARE @Value DECIMAL(18,2); DECLARE @Currency CHAR(3);
      SELECT @Summary='Lease: '+contract_ref+' | '+asset_type,@Value=lease_liability_commence,@Currency=currency
      FROM lease.contracts WHERE contract_id=@ContractId;
      INSERT INTO security.maker_checker_queue (queue_ref,module,record_type,record_id,record_summary,value,currency,submitted_by,outcome,sla_due_at,screen_id)
      VALUES (@QueueRef,'Lease','LeaseContract',CAST(@ContractId AS VARCHAR),@Summary,@Value,@Currency,@MakerId,'Pending',DATEADD(HOUR,24,GETUTCDATE()),@ScreenId);
      SELECT @QueueRef AS queue_ref;
    END`, 'sp_SubmitLeaseForApproval');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_ApproveRejectLease @ContractId INT, @CheckerId INT, @Outcome VARCHAR(20), @Reason NVARCHAR(1000), @ScreenId VARCHAR(20) AS
    BEGIN
      SET NOCOUNT ON;
      DECLARE @NewStatus VARCHAR(30)=CASE WHEN @Outcome='Approved' THEN 'Active' ELSE 'Draft' END;
      UPDATE lease.contracts SET status=@NewStatus,checker_id=@CheckerId,
        approved_at=CASE WHEN @Outcome='Approved' THEN GETUTCDATE() ELSE NULL END,updated_at=GETUTCDATE()
      WHERE contract_id=@ContractId;
      UPDATE security.maker_checker_queue SET outcome=@Outcome,checker_id=@CheckerId,actioned_at=GETUTCDATE(),rejection_reason=@Reason
      WHERE record_id=CAST(@ContractId AS VARCHAR) AND record_type='LeaseContract' AND outcome='Pending';
      SELECT @NewStatus AS new_status;
    END`, 'sp_ApproveRejectLease');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetLessors @SearchTerm NVARCHAR(200)=NULL, @Status VARCHAR(20)=NULL AS
    BEGIN
      SET NOCOUNT ON;
      SELECT lessor_id,lessor_ref,legal_name,registration_no,tax_no,country,currency,contact_json,status,created_at
      FROM lease.lessors
      WHERE (@SearchTerm IS NULL OR legal_name LIKE '%'+@SearchTerm+'%' OR lessor_ref LIKE '%'+@SearchTerm+'%')
        AND (@Status IS NULL OR status=@Status)
      ORDER BY legal_name;
    END`, 'sp_GetLessors');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_CreateLessor
      @LegalName NVARCHAR(300), @RegistrationNo VARCHAR(100), @TaxNo VARCHAR(100),
      @Country CHAR(2), @Currency CHAR(3), @BankDetailsEnc NVARCHAR(MAX),
      @ContactJson NVARCHAR(MAX), @CreatedBy INT
    AS BEGIN
      SET NOCOUNT ON;
      DECLARE @Seq INT; SELECT @Seq=ISNULL(MAX(lessor_id),0)+1 FROM lease.lessors;
      DECLARE @LessorRef VARCHAR(20)='LSR-'+CAST(YEAR(GETUTCDATE()) AS VARCHAR)+'-'+RIGHT('000000'+CAST(@Seq AS VARCHAR),6);
      INSERT INTO lease.lessors (lessor_ref,legal_name,registration_no,tax_no,country,currency,bank_details_enc,contact_json,created_by)
      VALUES (@LessorRef,@LegalName,@RegistrationNo,@TaxNo,@Country,@Currency,@BankDetailsEnc,@ContactJson,@CreatedBy);
      SELECT SCOPE_IDENTITY() AS lessor_id,@LessorRef AS lessor_ref;
    END`, 'sp_CreateLessor');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_SaveAmortisationSchedule @ContractId INT, @ScheduleJson NVARCHAR(MAX) AS
    BEGIN
      SET NOCOUNT ON;
      DELETE FROM lease.amortisation_schedule WHERE contract_id=@ContractId;
      INSERT INTO lease.amortisation_schedule (contract_id,period_date,opening_liability,interest_expense,payment,principal,closing_liability,rou_nbv,depreciation,cumulative_depr)
      SELECT @ContractId,CAST(JSON_VALUE(v.value,'$.period_date') AS DATE),
        CAST(JSON_VALUE(v.value,'$.opening_liability') AS DECIMAL(18,2)),
        CAST(JSON_VALUE(v.value,'$.interest_expense') AS DECIMAL(18,2)),
        CAST(JSON_VALUE(v.value,'$.payment') AS DECIMAL(18,2)),
        CAST(JSON_VALUE(v.value,'$.principal') AS DECIMAL(18,2)),
        CAST(JSON_VALUE(v.value,'$.closing_liability') AS DECIMAL(18,2)),
        CAST(JSON_VALUE(v.value,'$.rou_nbv') AS DECIMAL(18,2)),
        CAST(JSON_VALUE(v.value,'$.depreciation') AS DECIMAL(18,2)),
        CAST(JSON_VALUE(v.value,'$.cumulative_depr') AS DECIMAL(18,2))
      FROM OPENJSON(@ScheduleJson) v;
      SELECT @@ROWCOUNT AS rows_inserted;
    END`, 'sp_SaveAmortisationSchedule');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetAmortisationSchedule @ContractId INT AS
    BEGIN SET NOCOUNT ON; SELECT * FROM lease.amortisation_schedule WHERE contract_id=@ContractId ORDER BY period_date; END`, 'sp_GetAmortisationSchedule');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetInvoiceRegister @PageNumber INT=1, @PageSize INT=100, @StatusFilter VARCHAR(30)=NULL, @SearchTerm NVARCHAR(200)=NULL AS
    BEGIN
      SET NOCOUNT ON;
      DECLARE @Offset INT=(@PageNumber-1)*@PageSize;
      SELECT i.invoice_id,i.invoice_ref,i.invoice_number,i.invoice_date,i.period_month,i.period_year,
        i.total,i.currency,i.due_date,i.status,i.discrepancy_flag,
        l.legal_name AS lessor_name,c.contract_ref,c.asset_type,u1.username AS maker_name,
        COUNT(*) OVER() AS total_count
      FROM payables.invoices i
      INNER JOIN lease.lessors l ON i.lessor_id=l.lessor_id
      LEFT JOIN lease.contracts c ON i.contract_id=c.contract_id
      LEFT JOIN security.users u1 ON i.maker_id=u1.user_id
      WHERE (@StatusFilter IS NULL OR i.status=@StatusFilter)
        AND (@SearchTerm IS NULL OR i.invoice_ref LIKE '%'+@SearchTerm+'%' OR l.legal_name LIKE '%'+@SearchTerm+'%')
      ORDER BY i.created_at DESC OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
    END`, 'sp_GetInvoiceRegister');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_CreateInvoice
      @LessorId INT, @ContractId INT, @InvoiceNumber VARCHAR(100), @InvoiceDate DATE,
      @PeriodMonth INT, @PeriodYear INT, @RentAmount DECIMAL(18,2), @ServiceCharge DECIMAL(18,2),
      @VAT DECIMAL(18,2), @Total DECIMAL(18,2), @Currency CHAR(3), @GLAccount VARCHAR(10),
      @CostCentre VARCHAR(20), @DueDate DATE, @OCRExtractedJson NVARCHAR(MAX),
      @DiscrepancyFlag BIT, @MakerId INT, @ScreenId VARCHAR(20)
    AS BEGIN
      SET NOCOUNT ON;
      DECLARE @Seq INT; SELECT @Seq=ISNULL(MAX(invoice_id),0)+1 FROM payables.invoices;
      DECLARE @InvoiceRef VARCHAR(30)='INV-'+CAST(YEAR(GETUTCDATE()) AS VARCHAR)+'-'+RIGHT('000000'+CAST(@Seq AS VARCHAR),6);
      INSERT INTO payables.invoices (invoice_ref,lessor_id,contract_id,invoice_number,invoice_date,period_month,period_year,
        rent_amount,service_charge,vat,total,currency,gl_account,cost_centre,due_date,
        ocr_extracted_json,discrepancy_flag,maker_id,screen_id,process_start_time,process_end_time,elapsed_ms)
      VALUES (@InvoiceRef,@LessorId,@ContractId,@InvoiceNumber,@InvoiceDate,@PeriodMonth,@PeriodYear,
        @RentAmount,@ServiceCharge,@VAT,@Total,@Currency,@GLAccount,@CostCentre,@DueDate,
        @OCRExtractedJson,@DiscrepancyFlag,@MakerId,@ScreenId,GETUTCDATE(),GETUTCDATE(),0);
      SELECT SCOPE_IDENTITY() AS invoice_id,@InvoiceRef AS invoice_ref;
    END`, 'sp_CreateInvoice');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_ApproveInvoice @InvoiceId INT, @CheckerId INT, @Outcome VARCHAR(20), @Reason NVARCHAR(1000), @ScreenId VARCHAR(20) AS
    BEGIN
      SET NOCOUNT ON;
      DECLARE @NewStatus VARCHAR(30)=CASE WHEN @Outcome='Approved' THEN 'Approved' ELSE 'Draft' END;
      UPDATE payables.invoices SET status=@NewStatus,checker_id=@CheckerId,updated_at=GETUTCDATE() WHERE invoice_id=@InvoiceId;
      SELECT @NewStatus AS new_status;
    END`, 'sp_ApproveInvoice');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_CreatePaymentRun
      @RunDate DATE, @TotalAmount DECIMAL(18,2), @Currency CHAR(3), @BankFileFormat VARCHAR(10),
      @InvoiceIdsJson NVARCHAR(MAX), @MakerId INT, @ScreenId VARCHAR(20)
    AS BEGIN
      SET NOCOUNT ON;
      DECLARE @Seq INT; SELECT @Seq=ISNULL(MAX(run_id),0)+1 FROM payables.payment_runs;
      DECLARE @RunRef VARCHAR(30)='PMT-'+CAST(YEAR(GETUTCDATE()) AS VARCHAR)+'-'+RIGHT('000000'+CAST(@Seq AS VARCHAR),6);
      INSERT INTO payables.payment_runs (run_ref,run_date,total_amount,currency,bank_file_format,status,maker_id,screen_id)
      VALUES (@RunRef,@RunDate,@TotalAmount,@Currency,@BankFileFormat,'Draft',@MakerId,@ScreenId);
      DECLARE @RunId INT=SCOPE_IDENTITY();
      INSERT INTO payables.payment_run_lines (run_id,invoice_id,amount,currency)
      SELECT @RunId,CAST(JSON_VALUE(v.value,'$.invoice_id') AS INT),CAST(JSON_VALUE(v.value,'$.amount') AS DECIMAL(18,2)),@Currency FROM OPENJSON(@InvoiceIdsJson) v;
      SELECT @RunId AS run_id,@RunRef AS run_ref;
    END`, 'sp_CreatePaymentRun');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetMakerCheckerQueue @CheckerId INT=NULL, @Module VARCHAR(50)=NULL, @Outcome VARCHAR(20)='Pending', @PageNumber INT=1, @PageSize INT=50 AS
    BEGIN
      SET NOCOUNT ON;
      DECLARE @Offset INT=(@PageNumber-1)*@PageSize;
      SELECT q.queue_id,q.queue_ref,q.module,q.record_type,q.record_id,q.record_summary,q.value,q.currency,
        u.username AS submitted_by_name,q.submitted_at,q.outcome,q.sla_due_at,
        CASE WHEN q.sla_due_at<GETUTCDATE() THEN 'Red' WHEN q.sla_due_at<DATEADD(HOUR,4,GETUTCDATE()) THEN 'Amber' ELSE 'Green' END AS sla_status,
        DATEDIFF(MINUTE,q.submitted_at,GETUTCDATE()) AS minutes_pending,COUNT(*) OVER() AS total_count
      FROM security.maker_checker_queue q
      INNER JOIN security.users u ON q.submitted_by=u.user_id
      WHERE (@Module IS NULL OR q.module=@Module) AND (@Outcome IS NULL OR q.outcome=@Outcome)
      ORDER BY q.sla_due_at ASC OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
    END`, 'sp_GetMakerCheckerQueue');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_WriteAuditLog
      @UserId INT, @Username VARCHAR(100), @UserRole VARCHAR(50), @IPAddress VARCHAR(45),
      @DeviceFingerprint VARCHAR(200), @BrowserOS VARCHAR(200), @Module VARCHAR(50),
      @SubModule VARCHAR(50), @ActionType VARCHAR(50), @RecordTable VARCHAR(100),
      @RecordId VARCHAR(50), @BeforeState NVARCHAR(MAX), @AfterState NVARCHAR(MAX),
      @Outcome VARCHAR(20), @ScreenId VARCHAR(20), @ProcessStartTime DATETIME2, @ProcessEndTime DATETIME2
    AS BEGIN
      SET NOCOUNT ON;
      DECLARE @Seq INT; SELECT @Seq=ISNULL(MAX(CAST(RIGHT(audit_no,6) AS INT)),0)+1 FROM compliance.audit_log;
      DECLARE @AuditNo VARCHAR(30)='AUD-'+CAST(YEAR(GETUTCDATE()) AS VARCHAR)+'-'+RIGHT('000000'+CAST(@Seq AS VARCHAR),6);
      INSERT INTO compliance.audit_log (audit_no,user_id,username,user_role,ip_address,device_fingerprint,browser_os,module,sub_module,action_type,record_table,record_id,before_state,after_state,outcome,screen_id,process_start_time,process_end_time,elapsed_ms)
      VALUES (@AuditNo,@UserId,@Username,@UserRole,@IPAddress,@DeviceFingerprint,@BrowserOS,@Module,@SubModule,@ActionType,@RecordTable,@RecordId,@BeforeState,@AfterState,@Outcome,@ScreenId,@ProcessStartTime,@ProcessEndTime,DATEDIFF(MILLISECOND,@ProcessStartTime,@ProcessEndTime));
      SELECT @AuditNo AS audit_no;
    END`, 'sp_WriteAuditLog');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetAuditLog @Module VARCHAR(50)=NULL, @UserId INT=NULL, @ActionType VARCHAR(50)=NULL, @FromDate DATETIME2=NULL, @ToDate DATETIME2=NULL, @PageNumber INT=1, @PageSize INT=100 AS
    BEGIN
      SET NOCOUNT ON;
      DECLARE @Offset INT=(@PageNumber-1)*@PageSize;
      SELECT log_id,audit_no,timestamp_utc,username,user_role,module,sub_module,action_type,record_table,record_id,outcome,screen_id,elapsed_ms,COUNT(*) OVER() AS total_count
      FROM compliance.audit_log
      WHERE (@Module IS NULL OR module=@Module) AND (@UserId IS NULL OR user_id=@UserId)
        AND (@ActionType IS NULL OR action_type=@ActionType)
        AND (@FromDate IS NULL OR timestamp_utc>=@FromDate) AND (@ToDate IS NULL OR timestamp_utc<=@ToDate)
      ORDER BY timestamp_utc DESC OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
    END`, 'sp_GetAuditLog');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_WriteErrorLog @Severity VARCHAR(20), @Module VARCHAR(50), @ErrorCode VARCHAR(50), @Message NVARCHAR(500), @FullMessage NVARCHAR(MAX), @StackTrace NVARCHAR(MAX), @UserContext NVARCHAR(MAX), @JobContext NVARCHAR(MAX), @ScreenId VARCHAR(20) AS
    BEGIN
      SET NOCOUNT ON;
      DECLARE @Seq INT; SELECT @Seq=ISNULL(MAX(error_id),0)+1 FROM compliance.error_log;
      DECLARE @ErrorNo VARCHAR(30)='ERR-'+CAST(YEAR(GETUTCDATE()) AS VARCHAR)+'-'+RIGHT('000000'+CAST(@Seq AS VARCHAR),6);
      INSERT INTO compliance.error_log (error_no,severity,module,error_code,message,full_message,stack_trace,user_context,job_context,screen_id)
      VALUES (@ErrorNo,@Severity,@Module,@ErrorCode,@Message,@FullMessage,@StackTrace,@UserContext,@JobContext,@ScreenId);
      SELECT @ErrorNo AS error_no;
    END`, 'sp_WriteErrorLog');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_PostGLJournal @TransactionDate DATE, @Period VARCHAR(7), @Source VARCHAR(50), @Description NVARCHAR(500), @Currency CHAR(3), @LinesJson NVARCHAR(MAX), @MakerId INT, @ScreenId VARCHAR(20) AS
    BEGIN
      SET NOCOUNT ON;
      DECLARE @Seq INT; SELECT @Seq=ISNULL(MAX(journal_id),0)+1 FROM finance.gl_journals;
      DECLARE @JournalRef VARCHAR(30)='JNL-'+CAST(YEAR(GETUTCDATE()) AS VARCHAR)+'-'+RIGHT('000000'+CAST(@Seq AS VARCHAR),6);
      INSERT INTO finance.gl_journals (journal_ref,transaction_date,period,source,description,currency,status,maker_id,screen_id,process_start_time)
      VALUES (@JournalRef,@TransactionDate,@Period,@Source,@Description,@Currency,'Draft',@MakerId,@ScreenId,GETUTCDATE());
      DECLARE @JournalId INT=SCOPE_IDENTITY();
      INSERT INTO finance.gl_lines (journal_id,account_code,description,cost_centre,debit,credit,department,project_code)
      SELECT @JournalId,JSON_VALUE(v.value,'$.account_code'),JSON_VALUE(v.value,'$.description'),JSON_VALUE(v.value,'$.cost_centre'),
        CAST(ISNULL(JSON_VALUE(v.value,'$.debit'),0) AS DECIMAL(18,2)),CAST(ISNULL(JSON_VALUE(v.value,'$.credit'),0) AS DECIMAL(18,2)),
        JSON_VALUE(v.value,'$.department'),JSON_VALUE(v.value,'$.project_code')
      FROM OPENJSON(@LinesJson) v;
      SELECT @JournalId AS journal_id,@JournalRef AS journal_ref;
    END`, 'sp_PostGLJournal');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_UpsertUser @OpenId VARCHAR(100), @Username VARCHAR(100), @Email VARCHAR(320), @Role VARCHAR(50)='ReadOnly' AS
    BEGIN
      SET NOCOUNT ON;
      IF EXISTS (SELECT 1 FROM security.users WHERE open_id=@OpenId)
        UPDATE security.users SET username=@Username,email=@Email,last_login=GETUTCDATE(),updated_at=GETUTCDATE() WHERE open_id=@OpenId;
      ELSE
        INSERT INTO security.users (open_id,username,email,role) VALUES (@OpenId,@Username,@Email,@Role);
      SELECT user_id,open_id,username,email,role,status FROM security.users WHERE open_id=@OpenId;
    END`, 'sp_UpsertUser');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetUserTasks @UserId INT, @UserRole VARCHAR(50), @Status VARCHAR(20)='Open' AS
    BEGIN
      SET NOCOUNT ON;
      SELECT t.task_id,t.task_ref,t.task_name,t.task_key,t.assigned_role,t.priority,t.due_date,t.status,t.created_at,t.sla_hours,
        pi.instance_ref,pi.process_key,pi.business_key,pi.business_entity,
        CASE WHEN t.due_date<GETUTCDATE() THEN 'Red' WHEN t.due_date<DATEADD(HOUR,4,GETUTCDATE()) THEN 'Amber' ELSE 'Green' END AS sla_status
      FROM workflow.user_tasks t
      INNER JOIN workflow.process_instances pi ON t.instance_id=pi.instance_id
      WHERE t.status=@Status AND (t.assigned_user_id=@UserId OR t.assigned_role=@UserRole)
      ORDER BY t.priority DESC,t.due_date ASC;
    END`, 'sp_GetUserTasks');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_CompleteWorkflowTask @TaskId INT, @UserId INT, @Outcome VARCHAR(50), @Comment NVARCHAR(1000), @ScreenId VARCHAR(20) AS
    BEGIN
      SET NOCOUNT ON;
      UPDATE workflow.user_tasks SET status='Completed',completed_by=@UserId,completed_at=GETUTCDATE(),outcome=@Outcome,comment=@Comment,screen_id=@ScreenId WHERE task_id=@TaskId;
      SELECT @@ROWCOUNT AS rows_updated;
    END`, 'sp_CompleteWorkflowTask');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetInsurancePolicies @ContractId INT=NULL, @Status VARCHAR(20)=NULL AS
    BEGIN
      SET NOCOUNT ON;
      SELECT p.policy_id,p.policy_ref,p.provider_name,p.policy_number,p.coverage_type,p.premium_amount,p.currency,
        p.valid_from,p.valid_to,p.renewal_alert_days,p.status,c.contract_ref,c.asset_description,
        DATEDIFF(DAY,GETUTCDATE(),p.valid_to) AS days_to_expiry
      FROM lease.insurance_policies p
      LEFT JOIN lease.contracts c ON p.contract_id=c.contract_id
      WHERE (@ContractId IS NULL OR p.contract_id=@ContractId) AND (@Status IS NULL OR p.status=@Status)
      ORDER BY p.valid_to ASC;
    END`, 'sp_GetInsurancePolicies');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetMaintenanceTickets @ContractId INT=NULL, @Status VARCHAR(20)=NULL AS
    BEGIN
      SET NOCOUNT ON;
      SELECT t.ticket_id,t.ticket_ref,t.issue_type,t.description,t.responsible_party,t.status,t.reported_at,t.sla_due_at,
        t.resolved_at,t.cost_recovery_amount,c.contract_ref,c.asset_description,c.asset_type,u.username AS reported_by_name
      FROM lease.maintenance_tickets t
      INNER JOIN lease.contracts c ON t.contract_id=c.contract_id
      LEFT JOIN security.users u ON t.reported_by=u.user_id
      WHERE (@ContractId IS NULL OR t.contract_id=@ContractId) AND (@Status IS NULL OR t.status=@Status)
      ORDER BY t.reported_at DESC;
    END`, 'sp_GetMaintenanceTickets');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetMCThresholds AS
    BEGIN SET NOCOUNT ON; SELECT threshold_id,module,role,max_amount,currency,is_active,updated_at FROM security.mc_thresholds WHERE is_active=1 ORDER BY module,max_amount; END`, 'sp_GetMCThresholds');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetPortfolioAnalytics AS
    BEGIN
      SET NOCOUNT ON;
      SELECT FORMAT(expiry_date,'yyyy-MM') AS month,COUNT(*) AS lease_count,SUM(monthly_payment) AS monthly_value
      FROM lease.contracts WHERE status='Active' AND expiry_date BETWEEN GETUTCDATE() AND DATEADD(MONTH,24,GETUTCDATE())
      GROUP BY FORMAT(expiry_date,'yyyy-MM') ORDER BY month;
    END`, 'sp_GetPortfolioAnalytics');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetCashFlowForecast @Months INT=12 AS
    BEGIN
      SET NOCOUNT ON;
      SELECT FORMAT(a.period_date,'yyyy-MM') AS period,SUM(a.payment) AS total_payment,SUM(a.interest_expense) AS total_interest,
        SUM(a.principal) AS total_principal,COUNT(DISTINCT a.contract_id) AS lease_count
      FROM lease.amortisation_schedule a
      INNER JOIN lease.contracts c ON a.contract_id=c.contract_id
      WHERE c.status='Active' AND a.period_date BETWEEN GETUTCDATE() AND DATEADD(MONTH,@Months,GETUTCDATE())
      GROUP BY FORMAT(a.period_date,'yyyy-MM') ORDER BY period;
    END`, 'sp_GetCashFlowForecast');

  await exec(pool, `
    CREATE OR ALTER PROCEDURE dbo.sp_GetScreenRegistry AS
    BEGIN SET NOCOUNT ON; SELECT * FROM security.screen_registry ORDER BY module,sub_module; END`, 'sp_GetScreenRegistry');

  // ── SEED DATA ─────────────────────────────────────────────
  console.log('\nSeeding data...');

  // COA
  const coaData = [
    ['1110','Cash and Cash Equivalents','Asset','Current','Cash',0],
    ['1120','Trade Receivables','Asset','Current','Receivable',0],
    ['1200','Right-of-Use Assets','Asset','NonCurrent','ROU',1],
    ['1201','ROU — Tower Sites','Asset','NonCurrent','ROU',1],
    ['1202','ROU — Data Centres','Asset','NonCurrent','ROU',1],
    ['1203','ROU — Retail Outlets','Asset','NonCurrent','ROU',1],
    ['1204','ROU — Corporate Offices','Asset','NonCurrent','ROU',1],
    ['1205','ROU — Staff Apartments','Asset','NonCurrent','ROU',1],
    ['1206','ROU — Fleet Vehicles','Asset','NonCurrent','ROU',1],
    ['1207','ROU — Warehouses','Asset','NonCurrent','ROU',1],
    ['1208','ROU — Network Equipment','Asset','NonCurrent','ROU',1],
    ['1210','Accumulated Depreciation — ROU Assets','Asset','NonCurrent','AccumDepr',1],
    ['2130','Lease Liability — Current','Liability','Current','LeaseLiability',1],
    ['2140','Make-Good Provision','Liability','Current','Provision',1],
    ['2141','Make-Good Provision — Property','Liability','Current','Provision',1],
    ['2210','Lease Liability — Non-Current','Liability','NonCurrent','LeaseLiability',1],
    ['3200','Retained Earnings','Equity','Retained',null,0],
    ['4010','Service Revenue','Income','Revenue','Telecom',0],
    ['4073','Sublease Income','Income','Revenue','Sublease',1],
    ['5100','IFRS 16 Depreciation — ROU Assets','Expense','Depreciation','IFRS16',1],
    ['5101','Depr — ROU Tower Sites','Expense','Depreciation','IFRS16',1],
    ['5102','Depr — ROU Data Centres','Expense','Depreciation','IFRS16',1],
    ['5103','Depr — ROU Retail Outlets','Expense','Depreciation','IFRS16',1],
    ['5104','Depr — ROU Corporate Offices','Expense','Depreciation','IFRS16',1],
    ['5105','Depr — ROU Fleet Vehicles','Expense','Depreciation','IFRS16',1],
    ['5106','Depr — ROU Network Equipment','Expense','Depreciation','IFRS16',1],
    ['5200','IFRS 16 Interest Expense','Expense','Interest','IFRS16',1],
    ['5201','Interest — Tower Site Leases','Expense','Interest','IFRS16',1],
    ['5202','Interest — Data Centre Leases','Expense','Interest','IFRS16',1],
    ['5203','Interest — Retail Outlet Leases','Expense','Interest','IFRS16',1],
    ['5204','Interest — Fleet Leases','Expense','Interest','IFRS16',1],
    ['5300','Short-Term Lease Expense','Expense','LeaseExpense','ShortTerm',1],
    ['5301','Low-Value Lease Expense','Expense','LeaseExpense','LowValue',1],
    ['6050','Insurance Expense','Expense','Operating','Insurance',0],
    ['6060','Maintenance and Repairs','Expense','Operating','Maintenance',0],
  ];

  for (const [code, name, cls, type, sub, ifrs16] of coaData) {
    await exec(pool,
      `IF NOT EXISTS (SELECT 1 FROM coa.accounts WHERE account_code='${code}')
       INSERT INTO coa.accounts (account_code,account_name,class,type,sub_type,ifrs16_flag) VALUES ('${code}','${name}','${cls}','${type}',${sub ? `'${sub}'` : 'NULL'},${ifrs16})`,
      `COA: ${code}`);
  }

  // Screen Registry
  const screens = [
    ['VFLSEDASH0001P001','Main Dashboard','Dashboard',null,'Dashboard','/'],
    ['VFLSEREGSC0001P001','Lease Register','Lease','Register','List','/leases'],
    ['VFLSENEWLSE0001P001','New Lease Origination','Lease','Origination','Form','/leases/new'],
    ['VFLSEDETAIL0001P001','Lease Detail','Lease','Detail','Form','/leases/:id'],
    ['VFLSEAMORT0001P001','Amortisation Schedule','Lease','Amortisation','List','/leases/:id/schedule'],
    ['VFLSEMODIFY0001P001','Lease Modification','Lease','Modification','Form','/leases/:id/modify'],
    ['VFLSELESREG0001P001','Lessor Register','Lease','Lessor','List','/lessors'],
    ['VFPAYINVREG0001P001','Invoice Register','Payables','Invoice','List','/payables/invoices'],
    ['VFPAYINVNEW0001P001','New Invoice','Payables','Invoice','Form','/payables/invoices/new'],
    ['VFPAYPAYRUN0001P001','Payment Run','Payables','PaymentRun','Form','/payables/payment-runs'],
    ['VFFINGLREG0001P001','GL Journal Register','Finance','GL','List','/finance/journals'],
    ['VFMCQUEUE0001P001','Maker/Checker Queue','Workflow','MakerChecker','List','/workflow/queue'],
    ['VFWKFDSCS0001P001','Workflow Dashboard','Workflow','BPMN','Dashboard','/workflow'],
    ['VFWKFTASKS0002P001','My Task Inbox','Workflow','Tasks','List','/workflow/tasks'],
    ['VFWKFMODS0004P001','BPMN Process Modeler','Workflow','Modeler','Modeler','/workflow/modeler'],
    ['VFMISPORT0001P001','Portfolio Health Dashboard','MIS','Portfolio','Dashboard','/mis/portfolio'],
    ['VFMISGENAI0001P001','GenAI Query Panel','MIS','GenAI','Dashboard','/mis/genai'],
    ['VFMISANOM0001P001','Anomaly Detection Queue','MIS','Anomaly','List','/mis/anomalies'],
    ['VFINSREG0001P001','Insurance Policy Register','Operations','Insurance','List','/operations/insurance'],
    ['VFLSEMNT0001P001','Maintenance Tickets','Operations','Maintenance','List','/operations/maintenance'],
    ['VFESGREP0001P001','ESG Sustainability Dashboard','Operations','ESG','Dashboard','/operations/esg'],
    ['VFALTCENSC0001P001','Alert Centre','Compliance','Alerts','List','/compliance/alerts'],
    ['VFAUDLOG0001P001','Audit Log','Compliance','Audit','List','/compliance/audit'],
    ['VFERRLOG0001P001','Error Log','Compliance','Errors','List','/compliance/errors'],
    ['VFSECUSR0001P001','User Management','Security','Users','List','/security/users'],
  ];
  for (const [id, name, mod, sub, type, route] of screens) {
    await exec(pool,
      `IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='${id}')
       INSERT INTO security.screen_registry (screen_id,screen_name,module,sub_module,screen_type,route) VALUES ('${id}','${name}','${mod}',${sub ? `'${sub}'` : 'NULL'},'${type}','${route}')`,
      `Screen: ${id}`);
  }

  // MC Thresholds
  const thresholds = [
    ['Lease','LeaseChecker',100000],['Lease','FinanceManager',500000],['Lease','CFO',2000000],
    ['Invoice','PayablesChecker',50000],['Invoice','FinanceManager',500000],
    ['PaymentRun','PayablesChecker',100000],['PaymentRun','FinanceManager',1000000],
  ];
  for (const [mod, role, amt] of thresholds) {
    await exec(pool,
      `IF NOT EXISTS (SELECT 1 FROM security.mc_thresholds WHERE module='${mod}' AND role='${role}')
       INSERT INTO security.mc_thresholds (module,role,max_amount,currency) VALUES ('${mod}','${role}',${amt},'USD')`,
      `Threshold: ${mod}/${role}`);
  }

  // BPMN Definitions
  const workflows = [
    ['LEASE_APPROVAL','Lease Contract Approval'],
    ['INVOICE_APPROVAL','Invoice Approval'],
    ['PAYMENT_RUN','Payment Run Approval'],
    ['LEASE_MODIFICATION','Lease Modification'],
    ['LTO_TRANSFER','LTO Ownership Transfer'],
    ['LEASE_RENEWAL','Lease Renewal'],
    ['LEASE_TERMINATION','Lease Termination'],
  ];
  for (const [key, name] of workflows) {
    await exec(pool,
      `IF NOT EXISTS (SELECT 1 FROM workflow.process_definitions WHERE process_key='${key}')
       INSERT INTO workflow.process_definitions (process_key,version,name,bpmn_xml,is_active) VALUES ('${key}',1,'${name}','<definitions/>',1)`,
      `Workflow: ${key}`);
  }

  // Final verification
  const tables = await pool.request().query(
    "SELECT TABLE_SCHEMA+'.'+TABLE_NAME as tbl FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY tbl"
  );
  const sps = await pool.request().query(
    "SELECT name FROM sys.procedures ORDER BY name"
  );
  console.log(`\n✅ Setup Complete!`);
  console.log(`   Tables: ${tables.recordset.length}`);
  tables.recordset.forEach(r => console.log(`     ${r.tbl}`));
  console.log(`   Stored Procedures: ${sps.recordset.length}`);
  sps.recordset.forEach(r => console.log(`     ${r.name}`));

  await sql.close();
}

run().catch(err => { console.error(err); process.exit(1); });
