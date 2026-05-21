import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 30000,
  connectionTimeout: 15000,
};

async function run() {
  const pool = await sql.connect(cfg);
  console.log('Connected');

  const stmts = [
    // 1. Create accounting schema
    `IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'accounting') EXEC('CREATE SCHEMA accounting')`,

    // 2. Create gl_chart_of_accounts
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='accounting' AND TABLE_NAME='gl_chart_of_accounts')
    CREATE TABLE accounting.gl_chart_of_accounts (
      account_id INT IDENTITY(1,1) PRIMARY KEY, account_code VARCHAR(20) NOT NULL UNIQUE,
      account_name VARCHAR(200) NOT NULL, account_type VARCHAR(50) NOT NULL,
      account_subtype VARCHAR(100), ifrs16_category VARCHAR(100),
      normal_balance CHAR(2) NOT NULL DEFAULT 'Dr', currency VARCHAR(10) NOT NULL DEFAULT 'QAR',
      parent_account_id INT NULL, is_active BIT NOT NULL DEFAULT 1,
      description VARCHAR(500), created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    )`,

    // 3. Seed COA — assets
    `IF NOT EXISTS (SELECT 1 FROM accounting.gl_chart_of_accounts WHERE account_code='10100')
    INSERT INTO accounting.gl_chart_of_accounts (account_code,account_name,account_type,account_subtype,ifrs16_category,normal_balance,description) VALUES
    ('10100','Right-of-Use Asset — Property','Asset','ROU Asset','IFRS16_ROU','Dr','IFRS 16 ROU asset for property leases'),
    ('10110','Right-of-Use Asset — Vehicles','Asset','ROU Asset','IFRS16_ROU','Dr','IFRS 16 ROU asset for vehicle leases'),
    ('10120','Right-of-Use Asset — Equipment','Asset','ROU Asset','IFRS16_ROU','Dr','IFRS 16 ROU asset for equipment leases'),
    ('10130','Right-of-Use Asset — IT Infrastructure','Asset','ROU Asset','IFRS16_ROU','Dr','IFRS 16 ROU asset for IT/telecom infrastructure'),
    ('10140','Right-of-Use Asset — Tower Sites','Asset','ROU Asset','IFRS16_ROU','Dr','IFRS 16 ROU asset for telecom tower sites'),
    ('10200','Accum. Depreciation — ROU Property','Asset','Accumulated Depr','IFRS16_ROU','Cr','Accumulated depreciation on ROU property assets'),
    ('10210','Accum. Depreciation — ROU Vehicles','Asset','Accumulated Depr','IFRS16_ROU','Cr','Accumulated depreciation on ROU vehicle assets'),
    ('10220','Accum. Depreciation — ROU Equipment','Asset','Accumulated Depr','IFRS16_ROU','Cr','Accumulated depreciation on ROU equipment assets'),
    ('10230','Accum. Depreciation — ROU IT Infra','Asset','Accumulated Depr','IFRS16_ROU','Cr','Accumulated depreciation on ROU IT infrastructure'),
    ('10240','Accum. Depreciation — ROU Tower Sites','Asset','Accumulated Depr','IFRS16_ROU','Cr','Accumulated depreciation on ROU tower site assets'),
    ('11000','Bank Account — QAR Operating','Asset','Bank',NULL,'Dr','Primary QAR operating bank account'),
    ('11010','Bank Account — USD Operating','Asset','Bank',NULL,'Dr','USD operating bank account'),
    ('12000','Prepaid Lease Expenses','Asset','Prepayments',NULL,'Dr','Prepaid lease payments and deposits'),
    ('12010','Security Deposits — Leases','Asset','Deposits',NULL,'Dr','Security deposits paid to lessors')`,

    // 4. Seed COA — liabilities
    `IF NOT EXISTS (SELECT 1 FROM accounting.gl_chart_of_accounts WHERE account_code='21000')
    INSERT INTO accounting.gl_chart_of_accounts (account_code,account_name,account_type,account_subtype,ifrs16_category,normal_balance,description) VALUES
    ('21000','Lease Liability — Current (< 1 Year)','Liability','Lease Liability Current','IFRS16_LIABILITY','Cr','Current portion of IFRS 16 lease liability'),
    ('21010','Lease Liability — Non-Current (> 1 Year)','Liability','Lease Liability LT','IFRS16_LIABILITY','Cr','Non-current portion of IFRS 16 lease liability'),
    ('21020','Lease Liability — Property','Liability','Lease Liability','IFRS16_LIABILITY','Cr','IFRS 16 lease liability for property leases'),
    ('21030','Lease Liability — Vehicles','Liability','Lease Liability','IFRS16_LIABILITY','Cr','IFRS 16 lease liability for vehicle leases'),
    ('21040','Lease Liability — Equipment','Liability','Lease Liability','IFRS16_LIABILITY','Cr','IFRS 16 lease liability for equipment leases'),
    ('21050','Lease Liability — IT Infrastructure','Liability','Lease Liability','IFRS16_LIABILITY','Cr','IFRS 16 lease liability for IT/telecom infrastructure'),
    ('21060','Lease Liability — Tower Sites','Liability','Lease Liability','IFRS16_LIABILITY','Cr','IFRS 16 lease liability for telecom tower sites'),
    ('20000','Accounts Payable — Lease Rent','Liability','Accounts Payable',NULL,'Cr','Payable to lessors for lease rent'),
    ('20010','Accrued Lease Expenses','Liability','Accruals',NULL,'Cr','Accrued but unpaid lease expenses')`,

    // 5. Seed COA — expenses/revenue
    `IF NOT EXISTS (SELECT 1 FROM accounting.gl_chart_of_accounts WHERE account_code='51000')
    INSERT INTO accounting.gl_chart_of_accounts (account_code,account_name,account_type,account_subtype,ifrs16_category,normal_balance,description) VALUES
    ('51000','Finance Cost — Lease Interest','Expense','Finance Cost','IFRS16_INTEREST','Dr','Interest expense on IFRS 16 lease liabilities'),
    ('51010','Finance Cost — Lease Interest (Property)','Expense','Finance Cost','IFRS16_INTEREST','Dr','Interest on property lease liabilities'),
    ('51020','Finance Cost — Lease Interest (Vehicles)','Expense','Finance Cost','IFRS16_INTEREST','Dr','Interest on vehicle lease liabilities'),
    ('52000','Depreciation — ROU Asset','Expense','Depreciation','IFRS16_DEPR','Dr','Depreciation charge on ROU assets'),
    ('52010','Depreciation — ROU Property','Expense','Depreciation','IFRS16_DEPR','Dr','Depreciation on ROU property assets'),
    ('52020','Depreciation — ROU Vehicles','Expense','Depreciation','IFRS16_DEPR','Dr','Depreciation on ROU vehicle assets'),
    ('52030','Depreciation — ROU Equipment','Expense','Depreciation','IFRS16_DEPR','Dr','Depreciation on ROU equipment assets'),
    ('61000','Gain on Lease Termination','Revenue','Gain/Loss','IFRS16_GAIN_LOSS','Cr','Gain recognised on early termination of lease'),
    ('61010','Loss on Lease Termination','Expense','Gain/Loss','IFRS16_GAIN_LOSS','Dr','Loss recognised on early termination of lease'),
    ('61020','Gain on Lease Modification','Revenue','Gain/Loss','IFRS16_GAIN_LOSS','Cr','Gain from favourable lease modification'),
    ('61030','Loss on Lease Modification','Expense','Gain/Loss','IFRS16_GAIN_LOSS','Dr','Loss from unfavourable lease modification'),
    ('71000','FX Revaluation Gain — Lease Liability','Revenue','FX','IFRS16_FX','Cr','FX gain on revaluation of foreign currency lease liabilities'),
    ('71010','FX Revaluation Loss — Lease Liability','Expense','FX','IFRS16_FX','Dr','FX loss on revaluation of foreign currency lease liabilities')`,

    // 6. System settings table
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='accounting' AND TABLE_NAME='system_settings')
    CREATE TABLE accounting.system_settings (
      setting_key VARCHAR(100) NOT NULL PRIMARY KEY, setting_value VARCHAR(500) NOT NULL,
      description VARCHAR(500), updated_by VARCHAR(200),
      updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    )`,

    `IF NOT EXISTS (SELECT 1 FROM accounting.system_settings WHERE setting_key='accounting_period_date')
    INSERT INTO accounting.system_settings (setting_key,setting_value,description) VALUES
    ('accounting_period_date',CONVERT(VARCHAR(10),GETUTCDATE(),23),'Current accounting period date used for monthly JV generation (YYYY-MM-DD)'),
    ('default_currency','QAR','Default currency for journal vouchers')`,

    // 7. Journal vouchers table
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='accounting' AND TABLE_NAME='journal_vouchers')
    CREATE TABLE accounting.journal_vouchers (
      jv_id INT IDENTITY(1,1) PRIMARY KEY,
      jv_number VARCHAR(30) NOT NULL UNIQUE,
      jv_type VARCHAR(50) NOT NULL,
      period_year INT NOT NULL, period_month INT NOT NULL,
      posting_date DATE NOT NULL,
      description VARCHAR(500) NOT NULL,
      contract_id INT NULL,
      source_ref VARCHAR(100) NULL, source_type VARCHAR(50) NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'QAR',
      total_debit DECIMAL(18,4) NOT NULL DEFAULT 0,
      total_credit DECIMAL(18,4) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'Draft',
      rejection_reason VARCHAR(500) NULL,
      created_by VARCHAR(200) NOT NULL,
      created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
      submitted_at DATETIME2 NULL, submitted_by VARCHAR(200) NULL,
      posted_at DATETIME2 NULL, posted_by VARCHAR(200) NULL,
      rejected_at DATETIME2 NULL, rejected_by VARCHAR(200) NULL,
      notes VARCHAR(1000) NULL
    )`,

    `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_jv_contract') CREATE INDEX IX_jv_contract ON accounting.journal_vouchers(contract_id)`,
    `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_jv_period') CREATE INDEX IX_jv_period ON accounting.journal_vouchers(period_year,period_month)`,
    `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_jv_status') CREATE INDEX IX_jv_status ON accounting.journal_vouchers(status)`,

    // 8. JV Lines table
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='accounting' AND TABLE_NAME='jv_lines')
    CREATE TABLE accounting.jv_lines (
      line_id INT IDENTITY(1,1) PRIMARY KEY,
      jv_id INT NOT NULL REFERENCES accounting.journal_vouchers(jv_id) ON DELETE CASCADE,
      line_seq INT NOT NULL DEFAULT 1,
      account_code VARCHAR(20) NOT NULL,
      account_name VARCHAR(200) NOT NULL,
      dr_cr CHAR(2) NOT NULL,
      amount DECIMAL(18,4) NOT NULL,
      description VARCHAR(500),
      cost_centre VARCHAR(100),
      contract_ref VARCHAR(50),
      currency VARCHAR(10) NOT NULL DEFAULT 'QAR',
      fx_rate DECIMAL(18,6) NULL DEFAULT 1.0,
      base_amount DECIMAL(18,4) NULL,
      calc_explanation VARCHAR(2000) NULL
    )`,

    `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_jvlines_jv') CREATE INDEX IX_jvlines_jv ON accounting.jv_lines(jv_id)`,

    // 9. JV Sequence table
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='accounting' AND TABLE_NAME='jv_sequence')
    CREATE TABLE accounting.jv_sequence (
      period_key VARCHAR(10) NOT NULL PRIMARY KEY,
      last_seq INT NOT NULL DEFAULT 0
    )`,
  ];

  for (let i = 0; i < stmts.length; i++) {
    try {
      await pool.request().query(stmts[i]);
      console.log(`[${i+1}/${stmts.length}] OK`);
    } catch(e) {
      console.error(`[${i+1}/${stmts.length}] FAIL: ${e.message.substring(0,100)}`);
    }
  }

  // Verify
  const r = await pool.request().query(`SELECT COUNT(*) AS cnt FROM accounting.gl_chart_of_accounts`);
  console.log('COA rows:', r.recordset[0].cnt);
  const r2 = await pool.request().query(`SELECT setting_key, setting_value FROM accounting.system_settings`);
  console.log('Settings:', r2.recordset);
  const r3 = await pool.request().query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='accounting' ORDER BY TABLE_NAME`);
  console.log('Tables:', r3.recordset.map(x=>x.TABLE_NAME));

  await pool.close();
  console.log('Done');
}

run().catch(e => { console.error(e.message); process.exit(1); });
