-- ============================================================
-- VodaLease Enterprise — SQL Server Schema & Tables
-- Database: leasing
-- All DML via Stored Procedures (SPP pattern)
-- ============================================================

USE leasing;
GO

-- ============================================================
-- SCHEMAS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'coa')       EXEC('CREATE SCHEMA coa');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'lease')     EXEC('CREATE SCHEMA lease');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'payables')  EXEC('CREATE SCHEMA payables');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'finance')   EXEC('CREATE SCHEMA finance');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'compliance') EXEC('CREATE SCHEMA compliance');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'mis')       EXEC('CREATE SCHEMA mis');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'security')  EXEC('CREATE SCHEMA security');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'workflow')  EXEC('CREATE SCHEMA workflow');
GO

-- ============================================================
-- COA — CHART OF ACCOUNTS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='accounts' AND schema_id=SCHEMA_ID('coa'))
CREATE TABLE coa.accounts (
    account_code        VARCHAR(10)     NOT NULL PRIMARY KEY,
    account_name        NVARCHAR(200)   NOT NULL,
    class               VARCHAR(20)     NOT NULL, -- Asset/Liability/Equity/Income/Expense
    type                VARCHAR(50)     NOT NULL,
    sub_type            VARCHAR(100),
    currency            CHAR(3)         DEFAULT 'USD',
    ifrs16_flag         BIT             DEFAULT 0,
    intercompany_flag   BIT             DEFAULT 0,
    status              VARCHAR(10)     DEFAULT 'Active',
    group_mapping_code  VARCHAR(20),
    created_by          INT,
    created_at          DATETIME2       DEFAULT GETUTCDATE(),
    valid_from          DATE,
    valid_to            DATE
);
GO

-- ============================================================
-- SECURITY — USERS & ROLES
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='users' AND schema_id=SCHEMA_ID('security'))
CREATE TABLE security.users (
    user_id             INT IDENTITY(1,1) PRIMARY KEY,
    open_id             VARCHAR(100)    NOT NULL UNIQUE,
    username            VARCHAR(100)    NOT NULL,
    email               VARCHAR(320),
    password_hash       VARCHAR(256),
    mfa_secret_enc      VARCHAR(512),
    role                VARCHAR(50)     NOT NULL DEFAULT 'ReadOnly',
    -- Roles: SuperAdmin, FinanceManager, LeaseMaker, LeaseChecker,
    --        FleetOfficer, PropertyOfficer, PayablesMaker, PayablesChecker,
    --        MISAnalyst, Auditor, ReadOnly, ITAdmin
    entity_permissions  NVARCHAR(MAX),  -- JSON array of entity IDs
    status              VARCHAR(20)     DEFAULT 'Active',
    last_login          DATETIME2,
    created_at          DATETIME2       DEFAULT GETUTCDATE(),
    updated_at          DATETIME2       DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- SECURITY — SCREEN REGISTRY
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='screen_registry' AND schema_id=SCHEMA_ID('security'))
CREATE TABLE security.screen_registry (
    screen_id           VARCHAR(20)     NOT NULL PRIMARY KEY,
    screen_name         NVARCHAR(200)   NOT NULL,
    module              VARCHAR(50)     NOT NULL,
    sub_module          VARCHAR(50),
    screen_type         VARCHAR(20),    -- List/Form/Dashboard/Report/Modeler
    route               VARCHAR(200),
    allowed_roles       NVARCHAR(500),  -- JSON array
    created_at          DATETIME2       DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- SECURITY — MAKER/CHECKER QUEUE
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='maker_checker_queue' AND schema_id=SCHEMA_ID('security'))
CREATE TABLE security.maker_checker_queue (
    queue_id            INT IDENTITY(1,1) PRIMARY KEY,
    queue_ref           VARCHAR(30)     NOT NULL UNIQUE, -- MCQ-YYYY-NNNNNN
    module              VARCHAR(50)     NOT NULL,
    record_type         VARCHAR(100)    NOT NULL,
    record_id           VARCHAR(50)     NOT NULL,
    record_summary      NVARCHAR(500),
    value               DECIMAL(18,2),
    currency            CHAR(3)         DEFAULT 'USD',
    submitted_by        INT             NOT NULL,
    submitted_at        DATETIME2       DEFAULT GETUTCDATE(),
    checker_id          INT,
    actioned_at         DATETIME2,
    outcome             VARCHAR(20),    -- Pending/Approved/Rejected
    rejection_reason    NVARCHAR(1000),
    sla_due_at          DATETIME2,
    screen_id           VARCHAR(20),
    FOREIGN KEY (submitted_by) REFERENCES security.users(user_id),
    FOREIGN KEY (checker_id)   REFERENCES security.users(user_id)
);
GO

-- ============================================================
-- SECURITY — DELEGATIONS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='delegations' AND schema_id=SCHEMA_ID('security'))
CREATE TABLE security.delegations (
    delegation_id       INT IDENTITY(1,1) PRIMARY KEY,
    delegator_id        INT             NOT NULL,
    delegate_id         INT             NOT NULL,
    valid_from          DATE            NOT NULL,
    valid_to            DATE            NOT NULL,
    modules             NVARCHAR(500),  -- JSON array
    created_by          INT,
    created_at          DATETIME2       DEFAULT GETUTCDATE(),
    FOREIGN KEY (delegator_id) REFERENCES security.users(user_id),
    FOREIGN KEY (delegate_id)  REFERENCES security.users(user_id)
);
GO

-- ============================================================
-- LEASE — LESSORS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='lessors' AND schema_id=SCHEMA_ID('lease'))
CREATE TABLE lease.lessors (
    lessor_id           INT IDENTITY(1,1) PRIMARY KEY,
    lessor_ref          VARCHAR(20)     NOT NULL UNIQUE, -- LSR-YYYY-NNNNNN
    legal_name          NVARCHAR(300)   NOT NULL,
    registration_no     VARCHAR(100),
    tax_no              VARCHAR(100),
    country             CHAR(2),
    currency            CHAR(3)         DEFAULT 'USD',
    bank_details_enc    NVARCHAR(MAX),  -- AES-256 encrypted JSON
    contact_json        NVARCHAR(MAX),  -- JSON: name, phone, email
    status              VARCHAR(20)     DEFAULT 'Active',
    created_by          INT,
    created_at          DATETIME2       DEFAULT GETUTCDATE(),
    updated_at          DATETIME2       DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- LEASE — CONTRACTS (Temporal Table)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='contracts' AND schema_id=SCHEMA_ID('lease'))
CREATE TABLE lease.contracts (
    contract_id             INT IDENTITY(1,1) PRIMARY KEY,
    contract_ref            VARCHAR(30)     NOT NULL UNIQUE, -- LSE-YYYY-NNNNNN
    lessor_id               INT             NOT NULL,
    asset_type              VARCHAR(50)     NOT NULL,
    -- Types: TowerSite/DataCentre/RetailOutlet/CorporateOffice/
    --        StaffApartment/Fleet/Warehouse/NetworkEquipment
    asset_description       NVARCHAR(500),
    asset_tag               VARCHAR(100),
    location_json           NVARCHAR(MAX),  -- JSON: address, lat, lng, country
    commencement_date       DATE            NOT NULL,
    expiry_date             DATE            NOT NULL,
    term_months             INT             NOT NULL,
    monthly_payment         DECIMAL(18,2)   NOT NULL,
    currency                CHAR(3)         DEFAULT 'USD',
    escalation_rate         DECIMAL(8,4)    DEFAULT 0,
    escalation_date         DATE,
    ibr                     DECIMAL(8,6)    NOT NULL,
    deposit_amount          DECIMAL(18,2)   DEFAULT 0,
    ifrs16_classification   VARCHAR(20)     DEFAULT 'Finance',
    renewal_option          BIT             DEFAULT 0,
    renewal_certain         BIT             DEFAULT 0,
    purchase_option         BIT             DEFAULT 0,
    purchase_certain        BIT             DEFAULT 0,
    make_good_obligation    BIT             DEFAULT 0,
    make_good_estimate      DECIMAL(18,2)   DEFAULT 0,
    initial_direct_costs    DECIMAL(18,2)   DEFAULT 0,
    lease_incentives        DECIMAL(18,2)   DEFAULT 0,
    rou_asset_value         DECIMAL(18,2),
    lease_liability_commence DECIMAL(18,2),
    -- LTO Fields
    is_lto                  BIT             DEFAULT 0,
    lto_purchase_price      DECIMAL(18,2),
    lto_deposit             DECIMAL(18,2),
    lto_net_financed        DECIMAL(18,2),
    lto_total_instalments   INT,
    lto_instalment_amount   DECIMAL(18,2),
    lto_frequency           VARCHAR(20),
    lto_finance_charge_rate DECIMAL(8,6),
    lto_balloon_amount      DECIMAL(18,2),
    lto_transfer_date       DATE,
    -- Maintenance
    maintenance_responsibility VARCHAR(20) DEFAULT 'Lessor', -- Lessor/Lessee/Shared
    -- Status & Workflow
    status                  VARCHAR(30)     DEFAULT 'Draft',
    -- Draft/Submitted/PendingChecker/Approved/Active/Modified/Terminated/Expired
    maker_id                INT,
    checker_id              INT,
    approved_at             DATETIME2,
    screen_id               VARCHAR(20),
    process_start_time      DATETIME2,
    process_end_time        DATETIME2,
    elapsed_ms              BIGINT,
    created_at              DATETIME2       DEFAULT GETUTCDATE(),
    updated_at              DATETIME2       DEFAULT GETUTCDATE(),
    FOREIGN KEY (lessor_id) REFERENCES lease.lessors(lessor_id),
    FOREIGN KEY (maker_id)  REFERENCES security.users(user_id),
    FOREIGN KEY (checker_id) REFERENCES security.users(user_id)
);
GO

-- ============================================================
-- LEASE — AMORTISATION SCHEDULE
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='amortisation_schedule' AND schema_id=SCHEMA_ID('lease'))
CREATE TABLE lease.amortisation_schedule (
    schedule_id         INT IDENTITY(1,1) PRIMARY KEY,
    contract_id         INT             NOT NULL,
    period_date         DATE            NOT NULL,
    opening_liability   DECIMAL(18,2)   NOT NULL,
    interest_expense    DECIMAL(18,2)   NOT NULL,
    payment             DECIMAL(18,2)   NOT NULL,
    principal           DECIMAL(18,2)   NOT NULL,
    closing_liability   DECIMAL(18,2)   NOT NULL,
    rou_nbv             DECIMAL(18,2)   NOT NULL,
    depreciation        DECIMAL(18,2)   NOT NULL,
    cumulative_depr     DECIMAL(18,2)   NOT NULL,
    FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
GO

-- ============================================================
-- LEASE — MODIFICATIONS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='modifications' AND schema_id=SCHEMA_ID('lease'))
CREATE TABLE lease.modifications (
    modification_id     INT IDENTITY(1,1) PRIMARY KEY,
    mod_ref             VARCHAR(30)     NOT NULL UNIQUE,
    contract_id         INT             NOT NULL,
    modification_date   DATE            NOT NULL,
    modification_type   VARCHAR(50)     NOT NULL,
    old_terms_json      NVARCHAR(MAX),
    new_terms_json      NVARCHAR(MAX),
    liability_adjustment DECIMAL(18,2),
    rou_adjustment      DECIMAL(18,2),
    gl_journal_id       INT,
    status              VARCHAR(20)     DEFAULT 'Draft',
    maker_id            INT,
    checker_id          INT,
    screen_id           VARCHAR(20),
    created_at          DATETIME2       DEFAULT GETUTCDATE(),
    FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
GO

-- ============================================================
-- PAYABLES — INVOICES
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='invoices' AND schema_id=SCHEMA_ID('payables'))
CREATE TABLE payables.invoices (
    invoice_id          INT IDENTITY(1,1) PRIMARY KEY,
    invoice_ref         VARCHAR(30)     NOT NULL UNIQUE, -- INV-YYYY-NNNNNN
    lessor_id           INT             NOT NULL,
    contract_id         INT,
    invoice_number      VARCHAR(100),
    invoice_date        DATE            NOT NULL,
    period_month        INT,
    period_year         INT,
    rent_amount         DECIMAL(18,2)   DEFAULT 0,
    service_charge      DECIMAL(18,2)   DEFAULT 0,
    vat                 DECIMAL(18,2)   DEFAULT 0,
    total               DECIMAL(18,2)   NOT NULL,
    currency            CHAR(3)         DEFAULT 'USD',
    gl_account          VARCHAR(10),
    cost_centre         VARCHAR(20),
    due_date            DATE,
    status              VARCHAR(30)     DEFAULT 'Draft',
    -- Draft/Submitted/Approved/Scheduled/Paid/Overdue/Disputed
    ocr_extracted_json  NVARCHAR(MAX),
    discrepancy_flag    BIT             DEFAULT 0,
    discrepancy_notes   NVARCHAR(1000),
    maker_id            INT,
    checker_id          INT,
    screen_id           VARCHAR(20),
    process_start_time  DATETIME2,
    process_end_time    DATETIME2,
    elapsed_ms          BIGINT,
    created_at          DATETIME2       DEFAULT GETUTCDATE(),
    updated_at          DATETIME2       DEFAULT GETUTCDATE(),
    FOREIGN KEY (lessor_id)   REFERENCES lease.lessors(lessor_id),
    FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
GO

-- ============================================================
-- PAYABLES — PAYMENT RUNS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='payment_runs' AND schema_id=SCHEMA_ID('payables'))
CREATE TABLE payables.payment_runs (
    run_id              INT IDENTITY(1,1) PRIMARY KEY,
    run_ref             VARCHAR(30)     NOT NULL UNIQUE, -- PMT-YYYY-NNNNNN
    run_date            DATE            NOT NULL,
    total_amount        DECIMAL(18,2)   NOT NULL,
    currency            CHAR(3)         DEFAULT 'USD',
    bank_file_format    VARCHAR(10)     DEFAULT 'SWIFT', -- SWIFT/EFT
    bank_file_reference VARCHAR(100),
    bank_file_url       VARCHAR(500),
    status              VARCHAR(20)     DEFAULT 'Draft',
    maker_id            INT,
    checker_id          INT,
    approved_at         DATETIME2,
    screen_id           VARCHAR(20),
    created_at          DATETIME2       DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='payment_run_lines' AND schema_id=SCHEMA_ID('payables'))
CREATE TABLE payables.payment_run_lines (
    line_id             INT IDENTITY(1,1) PRIMARY KEY,
    run_id              INT             NOT NULL,
    invoice_id          INT             NOT NULL,
    amount              DECIMAL(18,2)   NOT NULL,
    currency            CHAR(3)         DEFAULT 'USD',
    lessor_bank_ref     VARCHAR(200),
    FOREIGN KEY (run_id)     REFERENCES payables.payment_runs(run_id),
    FOREIGN KEY (invoice_id) REFERENCES payables.invoices(invoice_id)
);
GO

-- ============================================================
-- FINANCE — GL JOURNALS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='gl_journals' AND schema_id=SCHEMA_ID('finance'))
CREATE TABLE finance.gl_journals (
    journal_id          INT IDENTITY(1,1) PRIMARY KEY,
    journal_ref         VARCHAR(30)     NOT NULL UNIQUE, -- JNL-YYYY-NNNNNN
    reference           VARCHAR(100),
    transaction_date    DATE            NOT NULL,
    period              VARCHAR(7),     -- YYYY-MM
    source              VARCHAR(50),    -- IFRS16/Manual/Payables/Modification
    description         NVARCHAR(500),
    currency            CHAR(3)         DEFAULT 'USD',
    status              VARCHAR(20)     DEFAULT 'Draft',
    maker_id            INT,
    checker_id          INT,
    posted_at           DATETIME2,
    screen_id           VARCHAR(20),
    process_start_time  DATETIME2,
    process_end_time    DATETIME2,
    elapsed_ms          BIGINT,
    created_at          DATETIME2       DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='gl_lines' AND schema_id=SCHEMA_ID('finance'))
CREATE TABLE finance.gl_lines (
    line_id             INT IDENTITY(1,1) PRIMARY KEY,
    journal_id          INT             NOT NULL,
    account_code        VARCHAR(10)     NOT NULL,
    description         NVARCHAR(300),
    cost_centre         VARCHAR(20),
    debit               DECIMAL(18,2)   DEFAULT 0,
    credit              DECIMAL(18,2)   DEFAULT 0,
    department          VARCHAR(50),
    project_code        VARCHAR(50),
    FOREIGN KEY (journal_id)   REFERENCES finance.gl_journals(journal_id),
    FOREIGN KEY (account_code) REFERENCES coa.accounts(account_code)
);
GO

-- ============================================================
-- FINANCE — BUDGETS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='budgets' AND schema_id=SCHEMA_ID('finance'))
CREATE TABLE finance.budgets (
    budget_id           INT IDENTITY(1,1) PRIMARY KEY,
    account_code        VARCHAR(10)     NOT NULL,
    cost_centre         VARCHAR(20),
    period_year         INT             NOT NULL,
    period_month        INT             NOT NULL,
    budget_amount       DECIMAL(18,2)   NOT NULL,
    currency            CHAR(3)         DEFAULT 'USD',
    version             INT             DEFAULT 1,
    approved_by         INT,
    created_at          DATETIME2       DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- COMPLIANCE — AUDIT LOG (Tamper-Evident)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='audit_log' AND schema_id=SCHEMA_ID('compliance'))
CREATE TABLE compliance.audit_log (
    log_id              UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    audit_no            VARCHAR(30)     NOT NULL UNIQUE, -- AUD-YYYY-NNNNNN
    timestamp_utc       DATETIME2       DEFAULT GETUTCDATE(),
    timestamp_local     DATETIME2,
    user_id             INT,
    username            VARCHAR(100),
    user_role           VARCHAR(50),
    ip_address          VARCHAR(45),
    device_fingerprint  VARCHAR(200),
    browser_os          VARCHAR(200),
    module              VARCHAR(50),
    sub_module          VARCHAR(50),
    action_type         VARCHAR(50),
    record_table        VARCHAR(100),
    record_id           VARCHAR(50),
    before_state        NVARCHAR(MAX),  -- JSON
    after_state         NVARCHAR(MAX),  -- JSON
    outcome             VARCHAR(20),    -- Success/Failed/Blocked
    row_hash            CHAR(64),       -- SHA-256
    prev_row_hash       CHAR(64),
    screen_id           VARCHAR(20),
    process_start_time  DATETIME2,
    process_end_time    DATETIME2,
    elapsed_ms          BIGINT
);
GO

-- ============================================================
-- COMPLIANCE — ERROR LOG
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='error_log' AND schema_id=SCHEMA_ID('compliance'))
CREATE TABLE compliance.error_log (
    error_id            INT IDENTITY(1,1) PRIMARY KEY,
    error_no            VARCHAR(30)     NOT NULL UNIQUE, -- ERR-YYYY-NNNNNN
    timestamp_utc       DATETIME2       DEFAULT GETUTCDATE(),
    severity            VARCHAR(20)     NOT NULL, -- Info/Warning/Error/Critical
    module              VARCHAR(50),
    error_code          VARCHAR(50),
    message             NVARCHAR(500),
    full_message        NVARCHAR(MAX),
    stack_trace         NVARCHAR(MAX),
    user_context        NVARCHAR(MAX),  -- JSON
    job_context         NVARCHAR(MAX),  -- JSON
    resolution_status   VARCHAR(20)     DEFAULT 'Open',
    assigned_to         INT,
    resolution_note     NVARCHAR(1000),
    resolved_at         DATETIME2,
    screen_id           VARCHAR(20)
);
GO

-- ============================================================
-- WORKFLOW — PROCESS DEFINITIONS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='process_definitions' AND schema_id=SCHEMA_ID('workflow'))
CREATE TABLE workflow.process_definitions (
    definition_id       INT IDENTITY(1,1) PRIMARY KEY,
    process_key         VARCHAR(100)    NOT NULL,
    version             INT             DEFAULT 1,
    name                NVARCHAR(200),
    bpmn_xml            NVARCHAR(MAX),  -- Full BPMN 2.0 XML
    is_active           BIT             DEFAULT 1,
    created_by          INT,
    created_at          DATETIME2       DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- WORKFLOW — PROCESS INSTANCES
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='process_instances' AND schema_id=SCHEMA_ID('workflow'))
CREATE TABLE workflow.process_instances (
    instance_id         INT IDENTITY(1,1) PRIMARY KEY,
    instance_ref        VARCHAR(30)     NOT NULL UNIQUE, -- WFI-YYYY-NNNNNN
    definition_id       INT             NOT NULL,
    process_key         VARCHAR(100)    NOT NULL,
    business_key        VARCHAR(100),   -- e.g. contract_ref
    business_entity     VARCHAR(50),    -- Lease/Invoice/PaymentRun
    variables_json      NVARCHAR(MAX),  -- JSON process variables
    current_task        VARCHAR(100),
    status              VARCHAR(20)     DEFAULT 'Running',
    started_by          INT,
    started_at          DATETIME2       DEFAULT GETUTCDATE(),
    completed_at        DATETIME2,
    screen_id           VARCHAR(20),
    FOREIGN KEY (definition_id) REFERENCES workflow.process_definitions(definition_id)
);
GO

-- ============================================================
-- WORKFLOW — USER TASKS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='user_tasks' AND schema_id=SCHEMA_ID('workflow'))
CREATE TABLE workflow.user_tasks (
    task_id             INT IDENTITY(1,1) PRIMARY KEY,
    task_ref            VARCHAR(30)     NOT NULL UNIQUE, -- TSK-YYYY-NNNNNN
    instance_id         INT             NOT NULL,
    task_key            VARCHAR(100)    NOT NULL,
    task_name           NVARCHAR(200),
    assigned_role       VARCHAR(50),
    assigned_user_id    INT,
    priority            INT             DEFAULT 50,
    due_date            DATETIME2,
    sla_hours           INT             DEFAULT 24,
    status              VARCHAR(20)     DEFAULT 'Open',
    claimed_by          INT,
    claimed_at          DATETIME2,
    completed_by        INT,
    completed_at        DATETIME2,
    outcome             VARCHAR(50),
    comment             NVARCHAR(1000),
    screen_id           VARCHAR(20),
    created_at          DATETIME2       DEFAULT GETUTCDATE(),
    FOREIGN KEY (instance_id) REFERENCES workflow.process_instances(instance_id)
);
GO

-- ============================================================
-- OPERATIONAL — INSURANCE POLICIES
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='insurance_policies' AND schema_id=SCHEMA_ID('lease'))
CREATE TABLE lease.insurance_policies (
    policy_id           INT IDENTITY(1,1) PRIMARY KEY,
    policy_ref          VARCHAR(30)     NOT NULL UNIQUE,
    contract_id         INT,
    provider_name       NVARCHAR(200)   NOT NULL,
    policy_number       VARCHAR(100)    NOT NULL,
    coverage_type       VARCHAR(100),   -- Property/Fleet/Liability/All-Risk
    premium_amount      DECIMAL(18,2),
    currency            CHAR(3)         DEFAULT 'USD',
    valid_from          DATE            NOT NULL,
    valid_to            DATE            NOT NULL,
    renewal_alert_days  INT             DEFAULT 30,
    status              VARCHAR(20)     DEFAULT 'Active',
    document_url        VARCHAR(500),
    created_by          INT,
    created_at          DATETIME2       DEFAULT GETUTCDATE(),
    FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
GO

-- ============================================================
-- OPERATIONAL — MAINTENANCE TICKETS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='maintenance_tickets' AND schema_id=SCHEMA_ID('lease'))
CREATE TABLE lease.maintenance_tickets (
    ticket_id           INT IDENTITY(1,1) PRIMARY KEY,
    ticket_ref          VARCHAR(30)     NOT NULL UNIQUE, -- MNT-YYYY-NNNNNN
    contract_id         INT             NOT NULL,
    issue_type          VARCHAR(100),
    description         NVARCHAR(1000),
    responsible_party   VARCHAR(20)     DEFAULT 'Lessor', -- Lessor/Lessee
    reported_by         INT,
    reported_at         DATETIME2       DEFAULT GETUTCDATE(),
    sla_due_at          DATETIME2,
    resolved_at         DATETIME2,
    resolution_notes    NVARCHAR(1000),
    cost_recovery_amount DECIMAL(18,2),
    cost_recovery_invoice_id INT,
    status              VARCHAR(20)     DEFAULT 'Open',
    screen_id           VARCHAR(20),
    FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
GO

-- ============================================================
-- MIS — DAILY SNAPSHOT
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='daily_snapshot' AND schema_id=SCHEMA_ID('mis'))
CREATE TABLE mis.daily_snapshot (
    snapshot_id         INT IDENTITY(1,1) PRIMARY KEY,
    snapshot_date       DATE            NOT NULL,
    total_active_leases INT             DEFAULT 0,
    total_rou_nbv       DECIMAL(18,2)   DEFAULT 0,
    total_liability_current DECIMAL(18,2) DEFAULT 0,
    total_liability_noncurrent DECIMAL(18,2) DEFAULT 0,
    payments_due_30d    DECIMAL(18,2)   DEFAULT 0,
    overdue_payables    DECIMAL(18,2)   DEFAULT 0,
    ytd_depreciation    DECIMAL(18,2)   DEFAULT 0,
    ytd_interest        DECIMAL(18,2)   DEFAULT 0,
    kpi_json            NVARCHAR(MAX),
    created_at          DATETIME2       DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- CONFIGURATION — MAKER/CHECKER THRESHOLDS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='mc_thresholds' AND schema_id=SCHEMA_ID('security'))
CREATE TABLE security.mc_thresholds (
    threshold_id        INT IDENTITY(1,1) PRIMARY KEY,
    module              VARCHAR(50)     NOT NULL,
    role                VARCHAR(50)     NOT NULL,
    max_amount          DECIMAL(18,2),  -- NULL = unlimited
    currency            CHAR(3)         DEFAULT 'USD',
    is_active           BIT             DEFAULT 1,
    updated_by          INT,
    updated_at          DATETIME2       DEFAULT GETUTCDATE()
);
GO

PRINT 'All schemas and tables created successfully.';
GO
