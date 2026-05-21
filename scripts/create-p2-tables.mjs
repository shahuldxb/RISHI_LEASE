import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const config = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};

async function run() {
  const pool = await sql.connect(config);

  const tables = [
    // Critical dates
    `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='critical_dates' AND schema_id=SCHEMA_ID('lease'))
    CREATE TABLE lease.critical_dates (
      date_id INT IDENTITY PRIMARY KEY,
      contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
      event_type NVARCHAR(50) NOT NULL,
      event_date DATE NOT NULL,
      notice_days_required INT DEFAULT 30,
      description NVARCHAR(500),
      action_required NVARCHAR(1000),
      is_dismissed BIT DEFAULT 0,
      dismissed_at DATETIME2,
      created_by INT,
      created_at DATETIME2 DEFAULT GETDATE()
    )`,

    // Sub-leases
    `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='sub_leases' AND schema_id=SCHEMA_ID('lease'))
    CREATE TABLE lease.sub_leases (
      sublease_id INT IDENTITY PRIMARY KEY,
      head_lease_contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
      sublessee_name NVARCHAR(200) NOT NULL,
      sublease_area_sqft DECIMAL(10,2),
      monthly_income DECIMAL(15,2) NOT NULL,
      commencement_date DATE NOT NULL,
      expiry_date DATE NOT NULL,
      classification NVARCHAR(30) DEFAULT 'OPERATING_SUBLEASE',
      notes NVARCHAR(1000),
      status NVARCHAR(20) DEFAULT 'Active',
      created_by INT,
      created_at DATETIME2 DEFAULT GETDATE()
    )`,

    // Rent reviews
    `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='rent_reviews' AND schema_id=SCHEMA_ID('lease'))
    CREATE TABLE lease.rent_reviews (
      review_id INT IDENTITY PRIMARY KEY,
      contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
      review_date DATE NOT NULL,
      review_type NVARCHAR(30) DEFAULT 'MARKET_REVIEW',
      current_rent DECIMAL(15,2),
      agreed_new_rent DECIMAL(15,2),
      effective_date DATE,
      status NVARCHAR(20) DEFAULT 'PENDING',
      notes NVARCHAR(1000),
      completed_by INT,
      completed_at DATETIME2,
      created_at DATETIME2 DEFAULT GETDATE()
    )`,

    // Security deposits
    `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='security_deposits' AND schema_id=SCHEMA_ID('lease'))
    CREATE TABLE lease.security_deposits (
      deposit_id INT IDENTITY PRIMARY KEY,
      contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
      deposit_amount DECIMAL(15,2) NOT NULL,
      deposit_type NVARCHAR(30) NOT NULL,
      deposit_date DATE NOT NULL,
      expected_return_date DATE,
      actual_return_date DATE,
      bank_name NVARCHAR(200),
      guarantee_number NVARCHAR(100),
      notes NVARCHAR(1000),
      status NVARCHAR(20) DEFAULT 'HELD',
      created_by INT,
      created_at DATETIME2 DEFAULT GETDATE()
    )`,

    // AI abstractions log
    `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='ai_abstractions' AND schema_id=SCHEMA_ID('lease'))
    CREATE TABLE lease.ai_abstractions (
      abstraction_id INT IDENTITY PRIMARY KEY,
      document_name NVARCHAR(300),
      document_type NVARCHAR(50),
      extracted_data NVARCHAR(MAX),
      confidence_score INT,
      status NVARCHAR(20) DEFAULT 'DRAFT',
      contract_id INT,
      created_by INT,
      created_at DATETIME2 DEFAULT GETDATE()
    )`,

    // Saved reports
    `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='saved_reports' AND schema_id=SCHEMA_ID('reporting'))
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name='reporting')
        EXEC('CREATE SCHEMA reporting');
      CREATE TABLE reporting.saved_reports (
        report_id INT IDENTITY PRIMARY KEY,
        report_name NVARCHAR(200) NOT NULL,
        report_type NVARCHAR(50) NOT NULL,
        filters NVARCHAR(MAX),
        schedule NVARCHAR(50),
        last_run DATETIME2,
        created_by INT,
        created_at DATETIME2 DEFAULT GETDATE()
      )
    END`,

    // Scenarios
    `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='scenarios' AND schema_id=SCHEMA_ID('finance'))
    CREATE TABLE finance.scenarios (
      scenario_id INT IDENTITY PRIMARY KEY,
      scenario_name NVARCHAR(200) NOT NULL,
      description NVARCHAR(1000),
      ibr_adjustment DECIMAL(8,4) DEFAULT 0,
      rent_increase_pct DECIMAL(8,4) DEFAULT 0,
      include_renewals BIT DEFAULT 0,
      current_liability DECIMAL(18,2),
      scenario_liability DECIMAL(18,2),
      current_annual_payments DECIMAL(18,2),
      scenario_annual_payments DECIMAL(18,2),
      created_by INT,
      created_at DATETIME2 DEFAULT GETDATE()
    )`,
  ];

  for (const sql_stmt of tables) {
    try {
      await pool.request().query(sql_stmt);
      const name = sql_stmt.match(/CREATE TABLE (\S+)/)?.[1] ?? 'unknown';
      console.log(`✓ ${name}`);
    } catch (e) {
      console.error(`✗ ${e.message.slice(0, 100)}`);
    }
  }

  // Seed critical dates from existing contracts
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM lease.critical_dates)
      INSERT INTO lease.critical_dates (contract_id, event_type, event_date, notice_days_required, description, action_required, created_by)
      SELECT TOP 15
        c.contract_id,
        CASE ROW_NUMBER() OVER (ORDER BY c.contract_id) % 5
          WHEN 0 THEN 'EXPIRY'
          WHEN 1 THEN 'RENEWAL_OPTION'
          WHEN 2 THEN 'RENT_REVIEW'
          WHEN 3 THEN 'BREAK_OPTION'
          ELSE 'INSURANCE_RENEWAL'
        END,
        CASE ROW_NUMBER() OVER (ORDER BY c.contract_id) % 5
          WHEN 0 THEN c.expiry_date
          WHEN 1 THEN DATEADD(month, -6, c.expiry_date)
          WHEN 2 THEN DATEADD(month, 12, c.commencement_date)
          WHEN 3 THEN DATEADD(month, 18, c.commencement_date)
          ELSE DATEADD(month, 11, c.commencement_date)
        END,
        90,
        'Auto-generated from lease commencement',
        'Review and take appropriate action',
        1
      FROM lease.contracts c WHERE c.status='Active'
    `);
    console.log('✓ Critical dates seeded');
  } catch (e) {
    console.error('Seed critical dates:', e.message.slice(0, 100));
  }

  // Seed rent reviews
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM lease.rent_reviews)
      INSERT INTO lease.rent_reviews (contract_id, review_date, review_type, current_rent, status)
      SELECT TOP 8
        c.contract_id,
        DATEADD(month, 12, c.commencement_date),
        'MARKET_REVIEW',
        c.monthly_payment,
        CASE WHEN DATEADD(month, 12, c.commencement_date) < GETDATE() THEN 'OVERDUE' ELSE 'PENDING' END
      FROM lease.contracts c WHERE c.status='Active'
    `);
    console.log('✓ Rent reviews seeded');
  } catch (e) {
    console.error('Seed rent reviews:', e.message.slice(0, 100));
  }

  // Seed security deposits
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM lease.security_deposits)
      INSERT INTO lease.security_deposits (contract_id, deposit_amount, deposit_type, deposit_date, bank_name, status)
      SELECT TOP 10
        c.contract_id,
        c.monthly_payment * 3,
        CASE ROW_NUMBER() OVER (ORDER BY c.contract_id) % 3
          WHEN 0 THEN 'BANK_GUARANTEE'
          WHEN 1 THEN 'CASH'
          ELSE 'CHEQUE'
        END,
        c.commencement_date,
        CASE ROW_NUMBER() OVER (ORDER BY c.contract_id) % 3
          WHEN 0 THEN 'Emirates NBD'
          WHEN 1 THEN 'ADCB'
          ELSE 'FAB'
        END,
        'HELD'
      FROM lease.contracts c WHERE c.status='Active'
    `);
    console.log('✓ Security deposits seeded');
  } catch (e) {
    console.error('Seed security deposits:', e.message.slice(0, 100));
  }

  // Seed sub-leases
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM lease.sub_leases)
      INSERT INTO lease.sub_leases (head_lease_contract_id, sublessee_name, sublease_area_sqft, monthly_income, commencement_date, expiry_date, classification)
      SELECT TOP 3
        c.contract_id,
        CASE ROW_NUMBER() OVER (ORDER BY c.contract_id)
          WHEN 1 THEN 'Accenture Middle East LLC'
          WHEN 2 THEN 'IBM UAE FZ-LLC'
          ELSE 'Oracle Corporation UAE'
        END,
        500,
        c.monthly_payment * 0.3,
        c.commencement_date,
        DATEADD(year, 2, c.commencement_date),
        'OPERATING_SUBLEASE'
      FROM lease.contracts c WHERE c.status='Active' AND c.asset_type='OFFICE'
    `);
    console.log('✓ Sub-leases seeded');
  } catch (e) {
    console.error('Seed sub-leases:', e.message.slice(0, 100));
  }

  await pool.close();
  console.log('Done!');
}

run().catch(console.error);
