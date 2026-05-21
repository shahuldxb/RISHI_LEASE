-- ============================================================
-- VodaLease Enterprise — Journal Voucher (JV) Module
-- Schema: accounting
-- ============================================================

-- ── 1. Schema ─────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'accounting')
  EXEC('CREATE SCHEMA accounting');
GO

-- ── 2. Enhanced GL Chart of Accounts ──────────────────────
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='accounting' AND TABLE_NAME='gl_chart_of_accounts')
BEGIN
  CREATE TABLE accounting.gl_chart_of_accounts (
    account_id        INT IDENTITY(1,1) PRIMARY KEY,
    account_code      VARCHAR(20)  NOT NULL UNIQUE,
    account_name      VARCHAR(200) NOT NULL,
    account_type      VARCHAR(50)  NOT NULL, -- Asset, Liability, Equity, Revenue, Expense
    account_subtype   VARCHAR(100),          -- ROU Asset, Lease Liability, Finance Cost, etc.
    ifrs16_category   VARCHAR(100),          -- IFRS16_ROU, IFRS16_LIABILITY, IFRS16_INTEREST, IFRS16_DEPR, IFRS16_GAIN_LOSS, IFRS16_FX
    normal_balance    CHAR(2)      NOT NULL DEFAULT 'Dr', -- Dr or Cr
    currency          VARCHAR(10)  NOT NULL DEFAULT 'QAR',
    parent_account_id INT          NULL REFERENCES accounting.gl_chart_of_accounts(account_id),
    is_active         BIT          NOT NULL DEFAULT 1,
    description       VARCHAR(500),
    created_at        DATETIME2    NOT NULL DEFAULT GETUTCDATE(),
    updated_at        DATETIME2    NOT NULL DEFAULT GETUTCDATE()
  );
END
GO

-- Seed IFRS 16 GL accounts (enhanced COA)
IF NOT EXISTS (SELECT 1 FROM accounting.gl_chart_of_accounts WHERE account_code = '10100')
BEGIN
  INSERT INTO accounting.gl_chart_of_accounts
    (account_code, account_name, account_type, account_subtype, ifrs16_category, normal_balance, description)
  VALUES
  -- Balance Sheet — Assets
  ('10100', 'Right-of-Use Asset — Property',           'Asset',     'ROU Asset',              'IFRS16_ROU',       'Dr', 'IFRS 16 ROU asset for property leases'),
  ('10110', 'Right-of-Use Asset — Vehicles',           'Asset',     'ROU Asset',              'IFRS16_ROU',       'Dr', 'IFRS 16 ROU asset for vehicle leases'),
  ('10120', 'Right-of-Use Asset — Equipment',          'Asset',     'ROU Asset',              'IFRS16_ROU',       'Dr', 'IFRS 16 ROU asset for equipment leases'),
  ('10130', 'Right-of-Use Asset — IT Infrastructure',  'Asset',     'ROU Asset',              'IFRS16_ROU',       'Dr', 'IFRS 16 ROU asset for IT/telecom infrastructure'),
  ('10140', 'Right-of-Use Asset — Tower Sites',        'Asset',     'ROU Asset',              'IFRS16_ROU',       'Dr', 'IFRS 16 ROU asset for telecom tower sites'),
  ('10200', 'Accum. Depreciation — ROU Property',      'Asset',     'Accumulated Depr',       'IFRS16_ROU',       'Cr', 'Accumulated depreciation on ROU property assets'),
  ('10210', 'Accum. Depreciation — ROU Vehicles',      'Asset',     'Accumulated Depr',       'IFRS16_ROU',       'Cr', 'Accumulated depreciation on ROU vehicle assets'),
  ('10220', 'Accum. Depreciation — ROU Equipment',     'Asset',     'Accumulated Depr',       'IFRS16_ROU',       'Cr', 'Accumulated depreciation on ROU equipment assets'),
  ('10230', 'Accum. Depreciation — ROU IT Infra',      'Asset',     'Accumulated Depr',       'IFRS16_ROU',       'Cr', 'Accumulated depreciation on ROU IT infrastructure'),
  ('10240', 'Accum. Depreciation — ROU Tower Sites',   'Asset',     'Accumulated Depr',       'IFRS16_ROU',       'Cr', 'Accumulated depreciation on ROU tower site assets'),
  -- Balance Sheet — Liabilities
  ('21000', 'Lease Liability — Current (< 1 Year)',    'Liability', 'Lease Liability Current', 'IFRS16_LIABILITY', 'Cr', 'Current portion of IFRS 16 lease liability'),
  ('21010', 'Lease Liability — Non-Current (> 1 Year)','Liability', 'Lease Liability LT',      'IFRS16_LIABILITY', 'Cr', 'Non-current portion of IFRS 16 lease liability'),
  ('21020', 'Lease Liability — Property',              'Liability', 'Lease Liability',         'IFRS16_LIABILITY', 'Cr', 'IFRS 16 lease liability for property leases'),
  ('21030', 'Lease Liability — Vehicles',              'Liability', 'Lease Liability',         'IFRS16_LIABILITY', 'Cr', 'IFRS 16 lease liability for vehicle leases'),
  ('21040', 'Lease Liability — Equipment',             'Liability', 'Lease Liability',         'IFRS16_LIABILITY', 'Cr', 'IFRS 16 lease liability for equipment leases'),
  ('21050', 'Lease Liability — IT Infrastructure',     'Liability', 'Lease Liability',         'IFRS16_LIABILITY', 'Cr', 'IFRS 16 lease liability for IT/telecom infrastructure'),
  ('21060', 'Lease Liability — Tower Sites',           'Liability', 'Lease Liability',         'IFRS16_LIABILITY', 'Cr', 'IFRS 16 lease liability for telecom tower sites'),
  -- P&L — Finance Costs
  ('51000', 'Finance Cost — Lease Interest',           'Expense',   'Finance Cost',            'IFRS16_INTEREST',  'Dr', 'Interest expense on IFRS 16 lease liabilities'),
  ('51010', 'Finance Cost — Lease Interest (Property)','Expense',   'Finance Cost',            'IFRS16_INTEREST',  'Dr', 'Interest on property lease liabilities'),
  ('51020', 'Finance Cost — Lease Interest (Vehicles)','Expense',   'Finance Cost',            'IFRS16_INTEREST',  'Dr', 'Interest on vehicle lease liabilities'),
  -- P&L — Depreciation
  ('52000', 'Depreciation — ROU Asset',                'Expense',   'Depreciation',            'IFRS16_DEPR',      'Dr', 'Depreciation charge on ROU assets'),
  ('52010', 'Depreciation — ROU Property',             'Expense',   'Depreciation',            'IFRS16_DEPR',      'Dr', 'Depreciation on ROU property assets'),
  ('52020', 'Depreciation — ROU Vehicles',             'Expense',   'Depreciation',            'IFRS16_DEPR',      'Dr', 'Depreciation on ROU vehicle assets'),
  ('52030', 'Depreciation — ROU Equipment',            'Expense',   'Depreciation',            'IFRS16_DEPR',      'Dr', 'Depreciation on ROU equipment assets'),
  -- P&L — Gain/Loss
  ('61000', 'Gain on Lease Termination',               'Revenue',   'Gain/Loss',               'IFRS16_GAIN_LOSS', 'Cr', 'Gain recognised on early termination of lease'),
  ('61010', 'Loss on Lease Termination',               'Expense',   'Gain/Loss',               'IFRS16_GAIN_LOSS', 'Dr', 'Loss recognised on early termination of lease'),
  ('61020', 'Gain on Lease Modification',              'Revenue',   'Gain/Loss',               'IFRS16_GAIN_LOSS', 'Cr', 'Gain from favourable lease modification'),
  ('61030', 'Loss on Lease Modification',              'Expense',   'Gain/Loss',               'IFRS16_GAIN_LOSS', 'Dr', 'Loss from unfavourable lease modification'),
  -- FX
  ('71000', 'FX Revaluation Gain — Lease Liability',   'Revenue',   'FX',                      'IFRS16_FX',        'Cr', 'FX gain on revaluation of foreign currency lease liabilities'),
  ('71010', 'FX Revaluation Loss — Lease Liability',   'Expense',   'FX',                      'IFRS16_FX',        'Dr', 'FX loss on revaluation of foreign currency lease liabilities'),
  -- Bank / AP
  ('11000', 'Bank Account — QAR Operating',            'Asset',     'Bank',                    NULL,               'Dr', 'Primary QAR operating bank account'),
  ('11010', 'Bank Account — USD Operating',            'Asset',     'Bank',                    NULL,               'Dr', 'USD operating bank account'),
  ('20000', 'Accounts Payable — Lease Rent',           'Liability', 'Accounts Payable',        NULL,               'Cr', 'Payable to lessors for lease rent'),
  ('20010', 'Accrued Lease Expenses',                  'Liability', 'Accruals',                NULL,               'Cr', 'Accrued but unpaid lease expenses'),
  -- Prepayments
  ('12000', 'Prepaid Lease Expenses',                  'Asset',     'Prepayments',             NULL,               'Dr', 'Prepaid lease payments and deposits'),
  ('12010', 'Security Deposits — Leases',              'Asset',     'Deposits',                NULL,               'Dr', 'Security deposits paid to lessors');
END
GO

-- ── 3. System Settings (accounting period date) ───────────
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='accounting' AND TABLE_NAME='system_settings')
BEGIN
  CREATE TABLE accounting.system_settings (
    setting_key   VARCHAR(100) NOT NULL PRIMARY KEY,
    setting_value VARCHAR(500) NOT NULL,
    description   VARCHAR(500),
    updated_by    VARCHAR(200),
    updated_at    DATETIME2    NOT NULL DEFAULT GETUTCDATE()
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM accounting.system_settings WHERE setting_key = 'accounting_period_date')
  INSERT INTO accounting.system_settings (setting_key, setting_value, description)
  VALUES ('accounting_period_date', CONVERT(VARCHAR(10), GETUTCDATE(), 23), 'Current accounting period date used for monthly JV generation (YYYY-MM-DD)');
GO

IF NOT EXISTS (SELECT 1 FROM accounting.system_settings WHERE setting_key = 'default_currency')
  INSERT INTO accounting.system_settings (setting_key, setting_value, description)
  VALUES ('default_currency', 'QAR', 'Default currency for journal vouchers');
GO

-- ── 4. Journal Vouchers (JV header) ───────────────────────
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='accounting' AND TABLE_NAME='journal_vouchers')
BEGIN
  CREATE TABLE accounting.journal_vouchers (
    jv_id           INT IDENTITY(1,1) PRIMARY KEY,
    jv_number       VARCHAR(30)  NOT NULL UNIQUE,  -- JV-YYYYMM-XXXXX
    jv_type         VARCHAR(50)  NOT NULL,          -- INCEPTION, MONTHLY_AMORT, REMEASUREMENT, TERMINATION, PAYMENT, FX_REVAL, MANUAL, PERIOD_CLOSE
    period_year     INT          NOT NULL,
    period_month    INT          NOT NULL,
    posting_date    DATE         NOT NULL,
    description     VARCHAR(500) NOT NULL,
    contract_id     INT          NULL,              -- FK to lease.contracts (nullable for multi-lease JVs)
    source_ref      VARCHAR(100) NULL,              -- e.g. remeasurement_id, close_id, transaction_id
    source_type     VARCHAR(50)  NULL,              -- REMEASUREMENT, PERIOD_CLOSE, TRANSACTION, MANUAL
    currency        VARCHAR(10)  NOT NULL DEFAULT 'QAR',
    total_debit     DECIMAL(18,4) NOT NULL DEFAULT 0,
    total_credit    DECIMAL(18,4) NOT NULL DEFAULT 0,
    status          VARCHAR(20)  NOT NULL DEFAULT 'Draft', -- Draft, Submitted, Posted, Rejected
    rejection_reason VARCHAR(500) NULL,
    created_by      VARCHAR(200) NOT NULL,
    created_at      DATETIME2    NOT NULL DEFAULT GETUTCDATE(),
    submitted_at    DATETIME2    NULL,
    submitted_by    VARCHAR(200) NULL,
    posted_at       DATETIME2    NULL,
    posted_by       VARCHAR(200) NULL,
    rejected_at     DATETIME2    NULL,
    rejected_by     VARCHAR(200) NULL,
    notes           VARCHAR(1000) NULL
  );

  CREATE INDEX IX_jv_contract ON accounting.journal_vouchers(contract_id);
  CREATE INDEX IX_jv_period   ON accounting.journal_vouchers(period_year, period_month);
  CREATE INDEX IX_jv_status   ON accounting.journal_vouchers(status);
  CREATE INDEX IX_jv_type     ON accounting.journal_vouchers(jv_type);
END
GO

-- ── 5. JV Lines (debit/credit entries) ────────────────────
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='accounting' AND TABLE_NAME='jv_lines')
BEGIN
  CREATE TABLE accounting.jv_lines (
    line_id         INT IDENTITY(1,1) PRIMARY KEY,
    jv_id           INT          NOT NULL REFERENCES accounting.journal_vouchers(jv_id) ON DELETE CASCADE,
    line_seq        INT          NOT NULL DEFAULT 1,
    account_code    VARCHAR(20)  NOT NULL,
    account_name    VARCHAR(200) NOT NULL,
    dr_cr           CHAR(2)      NOT NULL, -- Dr or Cr
    amount          DECIMAL(18,4) NOT NULL,
    description     VARCHAR(500),
    cost_centre     VARCHAR(100),
    contract_ref    VARCHAR(50),
    currency        VARCHAR(10)  NOT NULL DEFAULT 'QAR',
    fx_rate         DECIMAL(18,6) NULL DEFAULT 1.0,
    base_amount     DECIMAL(18,4) NULL,   -- amount in base currency (QAR)
    calc_explanation VARCHAR(2000) NULL   -- blackboard-style calculation explanation
  );

  CREATE INDEX IX_jvlines_jv ON accounting.jv_lines(jv_id);
END
GO

-- ── 6. JV Number Sequence ──────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='accounting' AND TABLE_NAME='jv_sequence')
BEGIN
  CREATE TABLE accounting.jv_sequence (
    period_key  VARCHAR(10) NOT NULL PRIMARY KEY, -- YYYYMM
    last_seq    INT         NOT NULL DEFAULT 0
  );
END
GO

-- ── 7. Stored Procedures ───────────────────────────────────

-- SP: Generate next JV number
IF OBJECT_ID('accounting.sp_NextJVNumber', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_NextJVNumber;
GO
CREATE PROCEDURE accounting.sp_NextJVNumber
  @period_key VARCHAR(10),
  @jv_number  VARCHAR(30) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM accounting.jv_sequence WHERE period_key = @period_key)
    INSERT INTO accounting.jv_sequence (period_key, last_seq) VALUES (@period_key, 0);

  UPDATE accounting.jv_sequence SET last_seq = last_seq + 1 WHERE period_key = @period_key;
  SELECT @jv_number = 'JV-' + @period_key + '-' + RIGHT('00000' + CAST(last_seq AS VARCHAR), 5)
  FROM accounting.jv_sequence WHERE period_key = @period_key;
END
GO

-- SP: List Journal Vouchers
IF OBJECT_ID('accounting.sp_ListJournalVouchers', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_ListJournalVouchers;
GO
CREATE PROCEDURE accounting.sp_ListJournalVouchers
  @status       VARCHAR(20)  = NULL,
  @jv_type      VARCHAR(50)  = NULL,
  @period_year  INT          = NULL,
  @period_month INT          = NULL,
  @contract_id  INT          = NULL,
  @search       VARCHAR(200) = NULL,
  @page         INT          = 1,
  @page_size    INT          = 50
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @offset INT = (@page - 1) * @page_size;

  SELECT
    jv.jv_id, jv.jv_number, jv.jv_type, jv.period_year, jv.period_month,
    jv.posting_date, jv.description, jv.contract_id,
    c.contract_ref, c.asset_description,
    jv.source_ref, jv.source_type, jv.currency,
    jv.total_debit, jv.total_credit, jv.status,
    jv.rejection_reason, jv.created_by, jv.created_at,
    jv.posted_at, jv.posted_by, jv.notes,
    COUNT(*) OVER() AS total_count
  FROM accounting.journal_vouchers jv
  LEFT JOIN lease.contracts c ON c.contract_id = jv.contract_id
  WHERE
    (@status      IS NULL OR jv.status      = @status)
    AND (@jv_type IS NULL OR jv.jv_type     = @jv_type)
    AND (@period_year  IS NULL OR jv.period_year  = @period_year)
    AND (@period_month IS NULL OR jv.period_month = @period_month)
    AND (@contract_id  IS NULL OR jv.contract_id  = @contract_id)
    AND (@search IS NULL OR jv.jv_number LIKE '%' + @search + '%'
         OR jv.description LIKE '%' + @search + '%'
         OR c.contract_ref LIKE '%' + @search + '%')
  ORDER BY jv.created_at DESC
  OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
END
GO

-- SP: Get JV by ID with lines
IF OBJECT_ID('accounting.sp_GetJournalVoucher', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_GetJournalVoucher;
GO
CREATE PROCEDURE accounting.sp_GetJournalVoucher
  @jv_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    jv.*, c.contract_ref, c.asset_description, c.currency AS contract_currency
  FROM accounting.journal_vouchers jv
  LEFT JOIN lease.contracts c ON c.contract_id = jv.contract_id
  WHERE jv.jv_id = @jv_id;

  SELECT l.*, a.account_type, a.account_subtype, a.ifrs16_category
  FROM accounting.jv_lines l
  LEFT JOIN accounting.gl_chart_of_accounts a ON a.account_code = l.account_code
  WHERE l.jv_id = @jv_id
  ORDER BY l.line_seq;
END
GO

-- SP: Post JV
IF OBJECT_ID('accounting.sp_PostJournalVoucher', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_PostJournalVoucher;
GO
CREATE PROCEDURE accounting.sp_PostJournalVoucher
  @jv_id    INT,
  @posted_by VARCHAR(200)
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM accounting.journal_vouchers WHERE jv_id = @jv_id AND status IN ('Draft','Submitted'))
  BEGIN
    RAISERROR('JV not found or already posted/rejected', 16, 1); RETURN;
  END

  -- Validate balanced entry
  DECLARE @debit DECIMAL(18,4), @credit DECIMAL(18,4);
  SELECT @debit  = SUM(CASE WHEN dr_cr='Dr' THEN amount ELSE 0 END),
         @credit = SUM(CASE WHEN dr_cr='Cr' THEN amount ELSE 0 END)
  FROM accounting.jv_lines WHERE jv_id = @jv_id;

  IF ABS(ISNULL(@debit,0) - ISNULL(@credit,0)) > 0.01
  BEGIN
    RAISERROR('JV is not balanced. Debit and credit totals must match.', 16, 1); RETURN;
  END

  UPDATE accounting.journal_vouchers
  SET status = 'Posted', posted_at = GETUTCDATE(), posted_by = @posted_by,
      total_debit = ISNULL(@debit,0), total_credit = ISNULL(@credit,0)
  WHERE jv_id = @jv_id;

  SELECT jv_id, jv_number, status FROM accounting.journal_vouchers WHERE jv_id = @jv_id;
END
GO

-- SP: Reject JV
IF OBJECT_ID('accounting.sp_RejectJournalVoucher', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_RejectJournalVoucher;
GO
CREATE PROCEDURE accounting.sp_RejectJournalVoucher
  @jv_id           INT,
  @rejected_by     VARCHAR(200),
  @rejection_reason VARCHAR(500)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE accounting.journal_vouchers
  SET status = 'Rejected', rejected_at = GETUTCDATE(),
      rejected_by = @rejected_by, rejection_reason = @rejection_reason
  WHERE jv_id = @jv_id AND status IN ('Draft','Submitted');

  SELECT jv_id, jv_number, status FROM accounting.journal_vouchers WHERE jv_id = @jv_id;
END
GO

-- SP: Generate Inception JV for a lease
IF OBJECT_ID('accounting.sp_GenerateInceptionJV', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_GenerateInceptionJV;
GO
CREATE PROCEDURE accounting.sp_GenerateInceptionJV
  @contract_id INT,
  @created_by  VARCHAR(200)
AS
BEGIN
  SET NOCOUNT ON;

  -- Check not already generated
  IF EXISTS (SELECT 1 FROM accounting.journal_vouchers WHERE contract_id = @contract_id AND jv_type = 'INCEPTION' AND status != 'Rejected')
  BEGIN
    RAISERROR('Inception JV already exists for this contract', 16, 1); RETURN;
  END

  DECLARE @pv_amount DECIMAL(18,4), @contract_ref VARCHAR(50), @asset_desc VARCHAR(200),
          @currency VARCHAR(10), @start_date DATE, @asset_type VARCHAR(100);

  SELECT
    @pv_amount    = ISNULL(present_value, ISNULL(total_lease_value, 0)),
    @contract_ref = contract_ref,
    @asset_desc   = asset_description,
    @currency     = ISNULL(currency, 'QAR'),
    @start_date   = lease_start_date,
    @asset_type   = ISNULL(asset_type, 'Property')
  FROM lease.contracts WHERE contract_id = @contract_id;

  IF @pv_amount IS NULL OR @pv_amount = 0
  BEGIN
    RAISERROR('Contract has no present value — cannot generate inception JV', 16, 1); RETURN;
  END

  -- Determine account codes based on asset type
  DECLARE @rou_account VARCHAR(20) = '10100', @rou_name VARCHAR(200) = 'Right-of-Use Asset — Property';
  DECLARE @liab_account VARCHAR(20) = '21020', @liab_name VARCHAR(200) = 'Lease Liability — Property';

  IF @asset_type LIKE '%Vehicle%' OR @asset_type LIKE '%Car%'
  BEGIN SET @rou_account = '10110'; SET @rou_name = 'Right-of-Use Asset — Vehicles';
        SET @liab_account = '21030'; SET @liab_name = 'Lease Liability — Vehicles'; END
  ELSE IF @asset_type LIKE '%Equipment%' OR @asset_type LIKE '%Machinery%'
  BEGIN SET @rou_account = '10120'; SET @rou_name = 'Right-of-Use Asset — Equipment';
        SET @liab_account = '21040'; SET @liab_name = 'Lease Liability — Equipment'; END
  ELSE IF @asset_type LIKE '%IT%' OR @asset_type LIKE '%Telecom%' OR @asset_type LIKE '%Network%'
  BEGIN SET @rou_account = '10130'; SET @rou_name = 'Right-of-Use Asset — IT Infrastructure';
        SET @liab_account = '21050'; SET @liab_name = 'Lease Liability — IT Infrastructure'; END
  ELSE IF @asset_type LIKE '%Tower%' OR @asset_type LIKE '%Site%'
  BEGIN SET @rou_account = '10140'; SET @rou_name = 'Right-of-Use Asset — Tower Sites';
        SET @liab_account = '21060'; SET @liab_name = 'Lease Liability — Tower Sites'; END

  DECLARE @period_key VARCHAR(10) = FORMAT(ISNULL(@start_date, GETUTCDATE()), 'yyyyMM');
  DECLARE @jv_number VARCHAR(30);
  EXEC accounting.sp_NextJVNumber @period_key, @jv_number OUTPUT;

  DECLARE @jv_id INT;
  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit, status, created_by)
  VALUES
    (@jv_number, 'INCEPTION',
     YEAR(ISNULL(@start_date, GETUTCDATE())), MONTH(ISNULL(@start_date, GETUTCDATE())),
     ISNULL(@start_date, GETUTCDATE()),
     'IFRS 16 Day-1 Inception Entry — ' + @contract_ref + ' | ' + @asset_desc,
     @contract_id, CAST(@contract_id AS VARCHAR), 'CONTRACT',
     @currency, @pv_amount, @pv_amount, 'Draft', @created_by);
  SET @jv_id = SCOPE_IDENTITY();

  -- Dr ROU Asset
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
  VALUES (@jv_id, 1, @rou_account, @rou_name, 'Dr', @pv_amount,
    'Recognition of Right-of-Use Asset at PV of lease payments',
    @contract_ref, @currency,
    'ROU Asset = PV of future lease payments discounted at IBR. PV = ' + CAST(@pv_amount AS VARCHAR) + ' ' + @currency + '. Contract: ' + @contract_ref);

  -- Cr Lease Liability
  INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
  VALUES (@jv_id, 2, @liab_account, @liab_name, 'Cr', @pv_amount,
    'Recognition of Lease Liability at PV of lease payments',
    @contract_ref, @currency,
    'Lease Liability = PV of future lease payments = ' + CAST(@pv_amount AS VARCHAR) + ' ' + @currency + '. Equal and opposite to ROU Asset. Contract: ' + @contract_ref);

  SELECT @jv_id AS jv_id, @jv_number AS jv_number;
END
GO

-- SP: Generate Monthly Amortisation JVs for a period
IF OBJECT_ID('accounting.sp_GenerateMonthlyJVs', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_GenerateMonthlyJVs;
GO
CREATE PROCEDURE accounting.sp_GenerateMonthlyJVs
  @period_year  INT,
  @period_month INT,
  @created_by   VARCHAR(200)
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @period_date DATE = DATEFROMPARTS(@period_year, @period_month, 1);
  DECLARE @period_key VARCHAR(10) = FORMAT(@period_date, 'yyyyMM');
  DECLARE @generated INT = 0;

  -- Loop through amortisation schedule rows for this period
  DECLARE @schedule_id INT, @contract_id INT, @interest DECIMAL(18,4),
          @principal DECIMAL(18,4), @depreciation DECIMAL(18,4),
          @payment DECIMAL(18,4), @contract_ref VARCHAR(50),
          @asset_desc VARCHAR(200), @currency VARCHAR(10), @asset_type VARCHAR(100);

  DECLARE amort_cursor CURSOR FOR
    SELECT a.schedule_id, a.contract_id, a.interest_expense, a.principal,
           a.depreciation, a.payment, c.contract_ref, c.asset_description,
           ISNULL(c.currency,'QAR'), ISNULL(c.asset_type,'Property')
    FROM lease.amortisation_schedule a
    JOIN lease.contracts c ON c.contract_id = a.contract_id
    WHERE YEAR(a.period_date) = @period_year AND MONTH(a.period_date) = @period_month
      AND (a.posting_status IS NULL OR a.posting_status != 'Posted')
      AND NOT EXISTS (
        SELECT 1 FROM accounting.journal_vouchers jv
        WHERE jv.contract_id = a.contract_id AND jv.jv_type = 'MONTHLY_AMORT'
          AND jv.period_year = @period_year AND jv.period_month = @period_month
          AND jv.status != 'Rejected'
      );

  OPEN amort_cursor;
  FETCH NEXT FROM amort_cursor INTO @schedule_id, @contract_id, @interest, @principal, @depreciation, @payment, @contract_ref, @asset_desc, @currency, @asset_type;

  WHILE @@FETCH_STATUS = 0
  BEGIN
    DECLARE @jv_number VARCHAR(30);
    EXEC accounting.sp_NextJVNumber @period_key, @jv_number OUTPUT;

    DECLARE @total_dr DECIMAL(18,4) = ISNULL(@interest,0) + ISNULL(@depreciation,0);
    DECLARE @total_cr DECIMAL(18,4) = ISNULL(@interest,0) + ISNULL(@depreciation,0);

    -- Determine accounts
    DECLARE @rou_acc VARCHAR(20) = '10100', @rou_n VARCHAR(200) = 'Right-of-Use Asset — Property';
    DECLARE @accum_acc VARCHAR(20) = '10200', @accum_n VARCHAR(200) = 'Accum. Depreciation — ROU Property';
    DECLARE @liab_acc VARCHAR(20) = '21020', @liab_n VARCHAR(200) = 'Lease Liability — Property';
    DECLARE @int_acc VARCHAR(20) = '51010', @int_n VARCHAR(200) = 'Finance Cost — Lease Interest (Property)';
    DECLARE @depr_acc VARCHAR(20) = '52010', @depr_n VARCHAR(200) = 'Depreciation — ROU Property';

    IF @asset_type LIKE '%Vehicle%' BEGIN
      SET @rou_acc='10110'; SET @rou_n='Right-of-Use Asset — Vehicles';
      SET @accum_acc='10210'; SET @accum_n='Accum. Depreciation — ROU Vehicles';
      SET @liab_acc='21030'; SET @liab_n='Lease Liability — Vehicles';
      SET @int_acc='51020'; SET @int_n='Finance Cost — Lease Interest (Vehicles)';
      SET @depr_acc='52020'; SET @depr_n='Depreciation — ROU Vehicles';
    END

    DECLARE @jv_id2 INT;
    INSERT INTO accounting.journal_vouchers
      (jv_number, jv_type, period_year, period_month, posting_date, description,
       contract_id, source_ref, source_type, currency, total_debit, total_credit, status, created_by)
    VALUES
      (@jv_number, 'MONTHLY_AMORT', @period_year, @period_month,
       EOMONTH(@period_date),
       'Monthly IFRS 16 Amortisation — ' + @contract_ref + ' | ' + FORMAT(@period_date,'MMM yyyy'),
       @contract_id, CAST(@schedule_id AS VARCHAR), 'AMORTISATION',
       @currency, @total_dr, @total_cr, 'Draft', @created_by);
    SET @jv_id2 = SCOPE_IDENTITY();

    DECLARE @seq INT = 1;

    -- Dr Finance Cost (Interest)
    IF ISNULL(@interest,0) > 0
    BEGIN
      INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
      VALUES (@jv_id2, @seq, @int_acc, @int_n, 'Dr', @interest,
        'Interest expense — unwinding of discount on lease liability',
        @contract_ref, @currency,
        'Interest = Opening Liability × IBR / 12. Interest = ' + CAST(@interest AS VARCHAR) + ' ' + @currency + '. Period: ' + FORMAT(@period_date,'MMM yyyy'));
      SET @seq = @seq + 1;

      -- Cr Lease Liability (interest accrual)
      INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
      VALUES (@jv_id2, @seq, @liab_acc, @liab_n, 'Cr', @interest,
        'Lease liability increase — interest accrual',
        @contract_ref, @currency,
        'Lease liability increases by interest accrued = ' + CAST(@interest AS VARCHAR) + ' ' + @currency);
      SET @seq = @seq + 1;
    END

    -- Dr Depreciation Expense
    IF ISNULL(@depreciation,0) > 0
    BEGIN
      INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
      VALUES (@jv_id2, @seq, @depr_acc, @depr_n, 'Dr', @depreciation,
        'ROU asset depreciation — straight-line over lease term',
        @contract_ref, @currency,
        'Depreciation = ROU Asset Cost / Lease Term (months). Depreciation = ' + CAST(@depreciation AS VARCHAR) + ' ' + @currency + '. Period: ' + FORMAT(@period_date,'MMM yyyy'));
      SET @seq = @seq + 1;

      -- Cr Accumulated Depreciation
      INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
      VALUES (@jv_id2, @seq, @accum_acc, @accum_n, 'Cr', @depreciation,
        'Accumulated depreciation on ROU asset',
        @contract_ref, @currency,
        'Accumulated depreciation increases by ' + CAST(@depreciation AS VARCHAR) + ' ' + @currency);
      SET @seq = @seq + 1;
    END

    SET @generated = @generated + 1;
    FETCH NEXT FROM amort_cursor INTO @schedule_id, @contract_id, @interest, @principal, @depreciation, @payment, @contract_ref, @asset_desc, @currency, @asset_type;
  END

  CLOSE amort_cursor;
  DEALLOCATE amort_cursor;

  SELECT @generated AS generated_count;
END
GO

-- SP: Push Remeasurement entry to JV
IF OBJECT_ID('accounting.sp_GenerateRemeasurementJV', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_GenerateRemeasurementJV;
GO
CREATE PROCEDURE accounting.sp_GenerateRemeasurementJV
  @remeasurement_id INT,
  @created_by       VARCHAR(200)
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (SELECT 1 FROM accounting.journal_vouchers WHERE source_ref = CAST(@remeasurement_id AS VARCHAR) AND source_type = 'REMEASUREMENT' AND status != 'Rejected')
  BEGIN
    RAISERROR('JV already exists for this remeasurement event', 16, 1); RETURN;
  END

  DECLARE @contract_id INT, @event_type VARCHAR(100), @event_date DATE,
          @liab_adj DECIMAL(18,4), @rou_adj DECIMAL(18,4),
          @contract_ref VARCHAR(50), @currency VARCHAR(10), @trigger_desc VARCHAR(500);

  SELECT
    @contract_id   = r.contract_id,
    @event_type    = r.event_type,
    @event_date    = r.event_date,
    @liab_adj      = r.liability_adjustment,
    @rou_adj       = r.rou_adjustment,
    @trigger_desc  = r.trigger_description,
    @contract_ref  = c.contract_ref,
    @currency      = ISNULL(c.currency,'QAR')
  FROM lease.remeasurement_events r
  JOIN lease.contracts c ON c.contract_id = r.contract_id
  WHERE r.remeasurement_id = @remeasurement_id;

  DECLARE @period_key VARCHAR(10) = FORMAT(ISNULL(@event_date, GETUTCDATE()), 'yyyyMM');
  DECLARE @jv_number VARCHAR(30);
  EXEC accounting.sp_NextJVNumber @period_key, @jv_number OUTPUT;

  DECLARE @abs_liab DECIMAL(18,4) = ABS(ISNULL(@liab_adj,0));
  DECLARE @abs_rou  DECIMAL(18,4) = ABS(ISNULL(@rou_adj,0));
  DECLARE @total    DECIMAL(18,4) = @abs_liab + @abs_rou;

  DECLARE @jv_id INT;
  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit, status, created_by)
  VALUES
    (@jv_number, 'REMEASUREMENT',
     YEAR(ISNULL(@event_date, GETUTCDATE())), MONTH(ISNULL(@event_date, GETUTCDATE())),
     ISNULL(@event_date, GETUTCDATE()),
     'IFRS 16 Remeasurement — ' + @event_type + ' | ' + @contract_ref + ' | ' + ISNULL(@trigger_desc,''),
     @contract_id, CAST(@remeasurement_id AS VARCHAR), 'REMEASUREMENT',
     @currency, @total, @total, 'Draft', @created_by);
  SET @jv_id = SCOPE_IDENTITY();

  DECLARE @seq INT = 1;

  -- Lease Liability adjustment
  IF @liab_adj > 0 -- liability increased
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@jv_id, @seq, '10100', 'Right-of-Use Asset — Property', 'Dr', @abs_liab,
      'ROU Asset remeasurement — liability increase', @contract_ref, @currency,
      'Remeasurement: Liability increased by ' + CAST(@abs_liab AS VARCHAR) + '. ROU Asset adjusted upward by same amount per IFRS 16.45.');
    SET @seq = @seq + 1;
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@jv_id, @seq, '21020', 'Lease Liability — Property', 'Cr', @abs_liab,
      'Lease Liability remeasurement — increase', @contract_ref, @currency,
      'Lease Liability increased by ' + CAST(@abs_liab AS VARCHAR) + ' due to: ' + ISNULL(@trigger_desc,'remeasurement event'));
    SET @seq = @seq + 1;
  END
  ELSE IF @liab_adj < 0 -- liability decreased
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@jv_id, @seq, '21020', 'Lease Liability — Property', 'Dr', @abs_liab,
      'Lease Liability remeasurement — decrease', @contract_ref, @currency,
      'Lease Liability decreased by ' + CAST(@abs_liab AS VARCHAR) + ' due to: ' + ISNULL(@trigger_desc,'remeasurement event'));
    SET @seq = @seq + 1;
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, contract_ref, currency, calc_explanation)
    VALUES (@jv_id, @seq, '10100', 'Right-of-Use Asset — Property', 'Cr', @abs_liab,
      'ROU Asset remeasurement — liability decrease', @contract_ref, @currency,
      'ROU Asset adjusted downward by ' + CAST(@abs_liab AS VARCHAR) + ' per IFRS 16.45.');
    SET @seq = @seq + 1;
  END

  SELECT @jv_id AS jv_id, @jv_number AS jv_number;
END
GO

-- SP: Generate Period-Close JV
IF OBJECT_ID('accounting.sp_GeneratePeriodCloseJV', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_GeneratePeriodCloseJV;
GO
CREATE PROCEDURE accounting.sp_GeneratePeriodCloseJV
  @close_id   INT,
  @created_by VARCHAR(200)
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (SELECT 1 FROM accounting.journal_vouchers WHERE source_ref = CAST(@close_id AS VARCHAR) AND source_type = 'PERIOD_CLOSE' AND status != 'Rejected')
  BEGIN
    RAISERROR('JV already exists for this period close', 16, 1); RETURN;
  END

  DECLARE @period_year INT, @period_month INT, @closed_by VARCHAR(200), @notes VARCHAR(500);
  SELECT @period_year = period_year, @period_month = period_month,
         @closed_by = closed_by, @notes = notes
  FROM lease.period_close WHERE close_id = @close_id;

  DECLARE @period_date DATE = DATEFROMPARTS(@period_year, @period_month, 1);
  DECLARE @period_key VARCHAR(10) = FORMAT(@period_date, 'yyyyMM');
  DECLARE @jv_number VARCHAR(30);
  EXEC accounting.sp_NextJVNumber @period_key, @jv_number OUTPUT;

  -- Aggregate all amortisation for the period
  DECLARE @total_interest DECIMAL(18,4), @total_depr DECIMAL(18,4);
  SELECT
    @total_interest = SUM(interest_expense),
    @total_depr     = SUM(depreciation)
  FROM lease.amortisation_schedule
  WHERE YEAR(period_date) = @period_year AND MONTH(period_date) = @period_month;

  DECLARE @total DECIMAL(18,4) = ISNULL(@total_interest,0) + ISNULL(@total_depr,0);

  DECLARE @jv_id INT;
  INSERT INTO accounting.journal_vouchers
    (jv_number, jv_type, period_year, period_month, posting_date, description,
     contract_id, source_ref, source_type, currency, total_debit, total_credit, status, created_by, notes)
  VALUES
    (@jv_number, 'PERIOD_CLOSE', @period_year, @period_month,
     EOMONTH(@period_date),
     'Period-End Close — Consolidated IFRS 16 Entries | ' + FORMAT(@period_date,'MMM yyyy'),
     NULL, CAST(@close_id AS VARCHAR), 'PERIOD_CLOSE',
     'QAR', @total, @total, 'Draft', @created_by, ISNULL(@notes,''));
  SET @jv_id = SCOPE_IDENTITY();

  IF ISNULL(@total_interest,0) > 0
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, calc_explanation)
    VALUES (@jv_id, 1, '51000', 'Finance Cost — Lease Interest', 'Dr', @total_interest,
      'Consolidated interest expense for ' + FORMAT(@period_date,'MMM yyyy'), 'QAR',
      'Sum of interest_expense across all active leases for period ' + FORMAT(@period_date,'MMM yyyy') + ' = ' + CAST(@total_interest AS VARCHAR) + ' QAR');
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, calc_explanation)
    VALUES (@jv_id, 2, '21000', 'Lease Liability — Current (< 1 Year)', 'Cr', @total_interest,
      'Consolidated lease liability interest accrual', 'QAR',
      'Lease liability increases by total interest accrued = ' + CAST(@total_interest AS VARCHAR) + ' QAR');
  END

  IF ISNULL(@total_depr,0) > 0
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, calc_explanation)
    VALUES (@jv_id, 3, '52000', 'Depreciation — ROU Asset', 'Dr', @total_depr,
      'Consolidated ROU depreciation for ' + FORMAT(@period_date,'MMM yyyy'), 'QAR',
      'Sum of depreciation across all active leases for period ' + FORMAT(@period_date,'MMM yyyy') + ' = ' + CAST(@total_depr AS VARCHAR) + ' QAR');
    INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency, calc_explanation)
    VALUES (@jv_id, 4, '10200', 'Accum. Depreciation — ROU Property', 'Cr', @total_depr,
      'Consolidated accumulated depreciation increase', 'QAR',
      'Accumulated depreciation increases by ' + CAST(@total_depr AS VARCHAR) + ' QAR');
  END

  SELECT @jv_id AS jv_id, @jv_number AS jv_number;
END
GO

-- SP: Get System Settings
IF OBJECT_ID('accounting.sp_GetSystemSettings', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_GetSystemSettings;
GO
CREATE PROCEDURE accounting.sp_GetSystemSettings
AS
BEGIN
  SET NOCOUNT ON;
  SELECT setting_key, setting_value, description, updated_by, updated_at
  FROM accounting.system_settings;
END
GO

-- SP: Update System Setting
IF OBJECT_ID('accounting.sp_UpdateSystemSetting', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_UpdateSystemSetting;
GO
CREATE PROCEDURE accounting.sp_UpdateSystemSetting
  @setting_key   VARCHAR(100),
  @setting_value VARCHAR(500),
  @updated_by    VARCHAR(200)
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM accounting.system_settings WHERE setting_key = @setting_key)
    UPDATE accounting.system_settings
    SET setting_value = @setting_value, updated_by = @updated_by, updated_at = GETUTCDATE()
    WHERE setting_key = @setting_key;
  ELSE
    INSERT INTO accounting.system_settings (setting_key, setting_value, updated_by)
    VALUES (@setting_key, @setting_value, @updated_by);

  SELECT setting_key, setting_value FROM accounting.system_settings WHERE setting_key = @setting_key;
END
GO

-- SP: Get GL Chart of Accounts
IF OBJECT_ID('accounting.sp_GetChartOfAccounts', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_GetChartOfAccounts;
GO
CREATE PROCEDURE accounting.sp_GetChartOfAccounts
  @ifrs16_only BIT = 0
AS
BEGIN
  SET NOCOUNT ON;
  SELECT account_id, account_code, account_name, account_type, account_subtype,
         ifrs16_category, normal_balance, currency, is_active, description
  FROM accounting.gl_chart_of_accounts
  WHERE is_active = 1
    AND (@ifrs16_only = 0 OR ifrs16_category IS NOT NULL)
  ORDER BY account_code;
END
GO

-- SP: Batch Post JVs
IF OBJECT_ID('accounting.sp_BatchPostJVs', 'P') IS NOT NULL DROP PROCEDURE accounting.sp_BatchPostJVs;
GO
CREATE PROCEDURE accounting.sp_BatchPostJVs
  @jv_ids_csv  VARCHAR(MAX),
  @posted_by   VARCHAR(200)
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @posted_count INT = 0;
  DECLARE @failed_count INT = 0;

  -- Parse CSV of JV IDs
  DECLARE @jv_id INT;
  DECLARE @xml XML = CAST('<i>' + REPLACE(@jv_ids_csv, ',', '</i><i>') + '</i>' AS XML);

  DECLARE id_cursor CURSOR FOR
    SELECT CAST(T.c.value('.', 'VARCHAR(20)') AS INT)
    FROM @xml.nodes('//i') T(c);

  OPEN id_cursor;
  FETCH NEXT FROM id_cursor INTO @jv_id;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    BEGIN TRY
      EXEC accounting.sp_PostJournalVoucher @jv_id, @posted_by;
      SET @posted_count = @posted_count + 1;
    END TRY
    BEGIN CATCH
      SET @failed_count = @failed_count + 1;
    END CATCH
    FETCH NEXT FROM id_cursor INTO @jv_id;
  END
  CLOSE id_cursor;
  DEALLOCATE id_cursor;

  SELECT @posted_count AS posted_count, @failed_count AS failed_count;
END
GO
