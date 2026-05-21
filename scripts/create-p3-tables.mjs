import sql from "mssql";
import dotenv from "dotenv";
dotenv.config();

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || "1433"),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};

async function run() {
  const pool = await sql.connect(cfg);
  const tables = [
    // ASC 842
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='asc842_parallel')
     CREATE TABLE lease.asc842_parallel (
       asc842_id INT IDENTITY PRIMARY KEY,
       contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
       asc842_classification VARCHAR(20) NOT NULL DEFAULT 'OPERATING',
       rou_asset_asc842 DECIMAL(18,2),
       lease_liability_asc842 DECIMAL(18,2),
       synced_by INT,
       updated_at DATETIME2 DEFAULT GETUTCDATE(),
       CONSTRAINT uq_asc842_contract UNIQUE (contract_id)
     )`,
    // Lease Origination
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='lease_origination')
     CREATE TABLE lease.lease_origination (
       origination_id INT IDENTITY PRIMARY KEY,
       lessor_name NVARCHAR(200) NOT NULL,
       asset_description NVARCHAR(300) NOT NULL,
       asset_type VARCHAR(50),
       proposed_start DATE,
       proposed_end DATE,
       estimated_annual_rent DECIMAL(18,2),
       currency CHAR(3) DEFAULT 'AED',
       business_justification NVARCHAR(MAX),
       priority VARCHAR(20) DEFAULT 'MEDIUM',
       status VARCHAR(30) DEFAULT 'DRAFT',
       requestor_id INT,
       notes NVARCHAR(MAX),
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Lease Options
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='lease_options')
     CREATE TABLE lease.lease_options (
       option_id INT IDENTITY PRIMARY KEY,
       contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
       option_type VARCHAR(30) NOT NULL,
       exercise_deadline DATE NOT NULL,
       notice_period_days INT DEFAULT 90,
       new_term_months INT,
       new_rent DECIMAL(18,2),
       purchase_price DECIMAL(18,2),
       reasonably_certain BIT DEFAULT 0,
       status VARCHAR(20) DEFAULT 'ACTIVE',
       exercise_date DATE,
       notes NVARCHAR(MAX),
       created_by INT,
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Break Clauses
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='break_clauses')
     CREATE TABLE lease.break_clauses (
       break_id INT IDENTITY PRIMARY KEY,
       contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
       break_date DATE NOT NULL,
       notice_deadline DATE NOT NULL,
       penalty_amount DECIMAL(18,2),
       conditions NVARCHAR(MAX),
       status VARCHAR(20) DEFAULT 'ACTIVE',
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Lease Incentives
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='lease_incentives')
     CREATE TABLE lease.lease_incentives (
       incentive_id INT IDENTITY PRIMARY KEY,
       contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
       incentive_type VARCHAR(40) NOT NULL,
       amount DECIMAL(18,2) NOT NULL,
       start_date DATE NOT NULL,
       end_date DATE NOT NULL,
       amortisation_method VARCHAR(30) DEFAULT 'STRAIGHT_LINE',
       gl_account VARCHAR(30),
       description NVARCHAR(300),
       created_by INT,
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Budget Variance
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='budget_variance')
     CREATE TABLE lease.budget_variance (
       variance_id INT IDENTITY PRIMARY KEY,
       contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
       budget_year INT NOT NULL,
       budget_month INT NOT NULL,
       budgeted_amount DECIMAL(18,2) NOT NULL,
       actual_amount DECIMAL(18,2) NOT NULL,
       variance_amount DECIMAL(18,2),
       variance_pct DECIMAL(10,4),
       cost_centre VARCHAR(50),
       notes NVARCHAR(500),
       created_by INT,
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Cost Centre Allocation
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='cost_centre_allocation')
     CREATE TABLE lease.cost_centre_allocation (
       allocation_id INT IDENTITY PRIMARY KEY,
       contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
       cost_centre_code VARCHAR(30) NOT NULL,
       cost_centre_name NVARCHAR(100) NOT NULL,
       allocation_pct DECIMAL(8,4) NOT NULL,
       effective_from DATE NOT NULL,
       effective_to DATE,
       created_by INT,
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Market Rent Benchmarks
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='market_rent_benchmarks')
     CREATE TABLE lease.market_rent_benchmarks (
       benchmark_id INT IDENTITY PRIMARY KEY,
       contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
       market_annual_rent DECIMAL(18,2) NOT NULL,
       source NVARCHAR(200) NOT NULL,
       benchmark_date DATE NOT NULL,
       comparable_address NVARCHAR(300),
       notes NVARCHAR(500),
       created_by INT,
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Space Management
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='space_management')
     CREATE TABLE lease.space_management (
       space_id INT IDENTITY PRIMARY KEY,
       contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
       building_name NVARCHAR(200) NOT NULL,
       floor_number VARCHAR(20),
       total_area_sqm DECIMAL(10,2) NOT NULL,
       occupied_area_sqm DECIMAL(10,2),
       capacity_desks INT,
       occupied_desks INT,
       space_type VARCHAR(30) DEFAULT 'OFFICE',
       created_by INT,
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Capital Projects
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='capital_projects')
     CREATE TABLE lease.capital_projects (
       project_id INT IDENTITY PRIMARY KEY,
       contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
       project_name NVARCHAR(200) NOT NULL,
       project_type VARCHAR(30) DEFAULT 'FIT_OUT',
       budget_amount DECIMAL(18,2) NOT NULL,
       committed_amount DECIMAL(18,2),
       actual_spend DECIMAL(18,2),
       start_date DATE NOT NULL,
       expected_completion DATE NOT NULL,
       status VARCHAR(20) DEFAULT 'PLANNED',
       project_manager NVARCHAR(100),
       notes NVARCHAR(MAX),
       created_by INT,
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // ESG Carbon
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='esg_carbon')
     CREATE TABLE lease.esg_carbon (
       carbon_id INT IDENTITY PRIMARY KEY,
       contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
       reporting_year INT NOT NULL,
       reporting_month INT NOT NULL,
       scope1_tonnes DECIMAL(10,3),
       scope2_tonnes DECIMAL(10,3),
       scope3_tonnes DECIMAL(10,3),
       energy_kwh DECIMAL(14,2),
       water_m3 DECIMAL(14,2),
       waste_tonnes DECIMAL(10,3),
       green_rating VARCHAR(20),
       notes NVARCHAR(500),
       created_by INT,
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Multi-Entity
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='entities')
     CREATE TABLE lease.entities (
       entity_id INT IDENTITY PRIMARY KEY,
       entity_code VARCHAR(20) NOT NULL UNIQUE,
       entity_name NVARCHAR(200) NOT NULL,
       country CHAR(2) DEFAULT 'AE',
       currency CHAR(3) DEFAULT 'AED',
       functional_currency CHAR(3) DEFAULT 'AED',
       is_consolidation_entity BIT DEFAULT 0,
       parent_entity_id INT,
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // FX Translations
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='fx_translations')
     CREATE TABLE lease.fx_translations (
       translation_id INT IDENTITY PRIMARY KEY,
       contract_id INT NOT NULL REFERENCES lease.contracts(contract_id),
       from_currency CHAR(3) NOT NULL,
       to_currency CHAR(3) NOT NULL,
       exchange_rate DECIMAL(14,6) NOT NULL,
       translation_date DATE NOT NULL,
       rou_asset_fc DECIMAL(18,2),
       lease_liability_fc DECIMAL(18,2),
       rou_asset_lc DECIMAL(18,2),
       lease_liability_lc DECIMAL(18,2),
       created_by INT,
       created_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Lessor Credit Scores
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lessor' AND t.name='credit_scores')
     CREATE TABLE lessor.credit_scores (
       score_id INT IDENTITY PRIMARY KEY,
       lessor_id INT NOT NULL REFERENCES lessor.lessors(lessor_id),
       payment_history_score DECIMAL(5,2),
       financial_stability_score DECIMAL(5,2),
       dispute_history_score DECIMAL(5,2),
       compliance_score DECIMAL(5,2),
       overall_score DECIMAL(5,2),
       credit_rating VARCHAR(5),
       score_date DATE NOT NULL,
       notes NVARCHAR(500),
       scored_by INT,
       created_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Alert Configs
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='alert_configs')
     CREATE TABLE lease.alert_configs (
       config_id INT IDENTITY PRIMARY KEY,
       event_type VARCHAR(50) NOT NULL,
       days_before INT NOT NULL,
       recipient_roles NVARCHAR(200),
       email_template NVARCHAR(MAX),
       is_active BIT DEFAULT 1,
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
    // Scheduled Reports
    `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='lease' AND t.name='scheduled_reports')
     CREATE TABLE lease.scheduled_reports (
       schedule_id INT IDENTITY PRIMARY KEY,
       report_name NVARCHAR(200) NOT NULL,
       report_type VARCHAR(50) NOT NULL,
       cron_expression VARCHAR(100) NOT NULL,
       recipients NVARCHAR(500),
       output_format VARCHAR(10) DEFAULT 'PDF',
       is_active BIT DEFAULT 1,
       parameters NVARCHAR(MAX),
       last_run_at DATETIME2,
       next_run_at DATETIME2,
       run_count INT DEFAULT 0,
       created_by INT,
       created_at DATETIME2 DEFAULT GETUTCDATE(),
       updated_at DATETIME2 DEFAULT GETUTCDATE()
     )`,
  ];

  let ok = 0, fail = 0;
  for (const t of tables) {
    try {
      await pool.request().query(t);
      ok++;
    } catch (e) {
      console.error("FAIL:", e.message.slice(0, 100));
      fail++;
    }
  }
  console.log(`Done: ${ok} tables created/verified, ${fail} failed`);

  // Seed some data
  const seeds = [
    // Alert configs
    `IF NOT EXISTS (SELECT 1 FROM lease.alert_configs WHERE event_type='LEASE_EXPIRY')
     INSERT INTO lease.alert_configs (event_type,days_before,recipient_roles,is_active) VALUES
     ('LEASE_EXPIRY',180,'admin,finance,legal',1),
     ('LEASE_EXPIRY',90,'admin,finance,legal',1),
     ('LEASE_EXPIRY',30,'admin,finance,legal',1),
     ('RENT_REVIEW',60,'finance,admin',1),
     ('OPTION_EXERCISE',120,'legal,admin',1),
     ('BREAK_CLAUSE_NOTICE',90,'legal,admin',1),
     ('PAYMENT_DUE',7,'finance',1),
     ('INSURANCE_EXPIRY',60,'admin',1)`,
    // Scheduled reports
    `IF NOT EXISTS (SELECT 1 FROM lease.scheduled_reports WHERE report_name='Monthly IFRS 16 Disclosure')
     INSERT INTO lease.scheduled_reports (report_name,report_type,cron_expression,recipients,output_format,is_active) VALUES
     ('Monthly IFRS 16 Disclosure','IFRS16_DISCLOSURE','0 8 1 * *','finance@vodafone.com','PDF',1),
     ('Quarterly Roll-Forward Report','ROLL_FORWARD','0 8 1 */3 *','cfo@vodafone.com,finance@vodafone.com','EXCEL',1),
     ('Weekly Critical Dates','CRITICAL_DATES','0 8 * * 1','admin@vodafone.com','PDF',1),
     ('Monthly Payment Schedule','PAYMENT_SCHEDULE','0 7 25 * *','finance@vodafone.com','EXCEL',1),
     ('Annual ESG Carbon Report','ESG_CARBON','0 8 1 1 *','sustainability@vodafone.com','PDF',1)`,
    // Entities
    `IF NOT EXISTS (SELECT 1 FROM lease.entities WHERE entity_code='VF-AE')
     INSERT INTO lease.entities (entity_code,entity_name,country,currency,functional_currency,is_consolidation_entity) VALUES
     ('VF-AE','Vodafone UAE LLC','AE','AED','AED',1),
     ('VF-SA','Vodafone Saudi Arabia','SA','SAR','SAR',0),
     ('VF-KW','Vodafone Kuwait','KW','KWD','KWD',0),
     ('VF-BH','Vodafone Bahrain','BH','BHD','BHD',0),
     ('VF-QA','Vodafone Qatar','QA','QAR','QAR',0)`,
  ];

  for (const s of seeds) {
    try { await pool.request().query(s); } catch (e) { console.error("Seed fail:", e.message.slice(0,80)); }
  }
  console.log("Seed data inserted");
  await pool.close();
}

run().catch(console.error);
