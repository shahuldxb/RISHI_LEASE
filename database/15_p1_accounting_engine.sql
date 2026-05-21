-- ============================================================
-- P1 Accounting Engine Tables
-- IBR Library, Lease Classification, Remeasurement,
-- CPI Escalation, Variable Rent, Exemptions
-- ============================================================

-- 1. IBR (Incremental Borrowing Rate) Library
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='ibr_rates')
CREATE TABLE lease.ibr_rates (
    ibr_id          INT IDENTITY(1,1) PRIMARY KEY,
    currency        CHAR(3)        NOT NULL DEFAULT 'AED',
    lease_term_min  INT            NOT NULL,  -- months
    lease_term_max  INT            NOT NULL,  -- months
    rate_pct        DECIMAL(8,4)   NOT NULL,  -- e.g. 4.5000
    effective_from  DATE           NOT NULL,
    effective_to    DATE           NULL,
    source          NVARCHAR(100)  NULL,      -- e.g. 'Central Bank UAE', 'Bloomberg'
    notes           NVARCHAR(500)  NULL,
    created_by      INT            NULL,
    created_at      DATETIME2      DEFAULT GETUTCDATE(),
    is_active       BIT            DEFAULT 1
);
GO

-- 2. Lease Classification Criteria (per contract)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='lease_classification')
CREATE TABLE lease.lease_classification (
    classification_id   INT IDENTITY(1,1) PRIMARY KEY,
    contract_id         INT            NOT NULL,
    standard            CHAR(10)       NOT NULL DEFAULT 'IFRS16', -- IFRS16 / ASC842
    -- IFRS 16 / ASC 842 five criteria
    transfers_ownership     BIT        DEFAULT 0,
    purchase_option_certain BIT        DEFAULT 0,
    major_part_of_life      BIT        DEFAULT 0,  -- >= 75% of economic life
    substantially_all_fv    BIT        DEFAULT 0,  -- >= 90% of fair value
    specialised_asset       BIT        DEFAULT 0,
    -- Derived result
    lease_type          NVARCHAR(20)   NULL,  -- 'Finance' / 'Operating'
    classification_date DATE           NULL,
    classified_by       INT            NULL,
    notes               NVARCHAR(1000) NULL,
    created_at          DATETIME2      DEFAULT GETUTCDATE(),
    updated_at          DATETIME2      DEFAULT GETUTCDATE(),
    CONSTRAINT FK_LeaseClass_Contract FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
GO

-- 3. Remeasurement Events
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='remeasurement_events')
CREATE TABLE lease.remeasurement_events (
    remeasurement_id    INT IDENTITY(1,1) PRIMARY KEY,
    contract_id         INT            NOT NULL,
    event_type          NVARCHAR(50)   NOT NULL, -- 'MODIFICATION','EXTENSION_EXERCISE','TERMINATION_PARTIAL','RATE_REVISION','CPI_UPDATE','SCOPE_CHANGE'
    event_date          DATE           NOT NULL,
    trigger_description NVARCHAR(500)  NULL,
    -- Before values
    old_liability       DECIMAL(18,2)  NULL,
    old_rou_asset       DECIMAL(18,2)  NULL,
    old_ibr             DECIMAL(8,4)   NULL,
    old_remaining_term  INT            NULL,
    -- After values
    new_liability       DECIMAL(18,2)  NULL,
    new_rou_asset       DECIMAL(18,2)  NULL,
    new_ibr             DECIMAL(8,4)   NULL,
    new_remaining_term  INT            NULL,
    -- Adjustment
    liability_adjustment    DECIMAL(18,2) NULL,
    rou_adjustment          DECIMAL(18,2) NULL,
    gl_journal_id           INT           NULL,
    status              NVARCHAR(20)   DEFAULT 'PENDING', -- PENDING/POSTED/REVERSED
    created_by          INT            NULL,
    created_at          DATETIME2      DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Remeasure_Contract FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
GO

-- 4. CPI / Escalation Index Table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='cpi_index')
CREATE TABLE lease.cpi_index (
    index_id        INT IDENTITY(1,1) PRIMARY KEY,
    index_name      NVARCHAR(100)  NOT NULL,  -- e.g. 'UAE CPI', 'UK RPI'
    country_code    CHAR(2)        NOT NULL DEFAULT 'AE',
    period_year     INT            NOT NULL,
    period_month    INT            NOT NULL,
    index_value     DECIMAL(12,4)  NOT NULL,
    yoy_change_pct  DECIMAL(8,4)   NULL,
    source          NVARCHAR(100)  NULL,
    published_date  DATE           NULL,
    created_at      DATETIME2      DEFAULT GETUTCDATE()
);
GO

-- 5. Lease Escalation Schedule (CPI/Fixed linked)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='lease_escalations')
CREATE TABLE lease.lease_escalations (
    escalation_id       INT IDENTITY(1,1) PRIMARY KEY,
    contract_id         INT            NOT NULL,
    escalation_type     NVARCHAR(20)   NOT NULL, -- 'CPI','FIXED_PCT','FIXED_AMT','MARKET_REVIEW'
    review_date         DATE           NOT NULL,
    base_rent           DECIMAL(18,2)  NULL,
    escalation_rate_pct DECIMAL(8,4)   NULL,
    escalation_amount   DECIMAL(18,2)  NULL,
    new_rent            DECIMAL(18,2)  NULL,
    cpi_index_id        INT            NULL,
    status              NVARCHAR(20)   DEFAULT 'PENDING', -- PENDING/APPLIED/OVERRIDDEN
    applied_date        DATE           NULL,
    applied_by          INT            NULL,
    notes               NVARCHAR(500)  NULL,
    created_at          DATETIME2      DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Escalation_Contract FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
GO

-- 6. Variable / Contingent Rent
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='variable_rent')
CREATE TABLE lease.variable_rent (
    variable_rent_id    INT IDENTITY(1,1) PRIMARY KEY,
    contract_id         INT            NOT NULL,
    period_start        DATE           NOT NULL,
    period_end          DATE           NOT NULL,
    basis               NVARCHAR(100)  NOT NULL, -- e.g. 'Revenue %', 'Turnover', 'Units'
    rate_pct            DECIMAL(8,4)   NULL,
    actual_amount       DECIMAL(18,2)  NULL,
    estimated_amount    DECIMAL(18,2)  NULL,
    invoice_id          INT            NULL,
    notes               NVARCHAR(500)  NULL,
    created_at          DATETIME2      DEFAULT GETUTCDATE(),
    CONSTRAINT FK_VarRent_Contract FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
GO

-- 7. Short-term Lease Exemptions
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='short_term_exemptions')
CREATE TABLE lease.short_term_exemptions (
    exemption_id        INT IDENTITY(1,1) PRIMARY KEY,
    contract_id         INT            NOT NULL,
    exemption_type      NVARCHAR(20)   NOT NULL DEFAULT 'SHORT_TERM', -- SHORT_TERM / LOW_VALUE
    asset_class         NVARCHAR(100)  NULL,
    annual_expense      DECIMAL(18,2)  NULL,
    period_start        DATE           NULL,
    period_end          DATE           NULL,
    justification       NVARCHAR(1000) NULL,
    approved_by         INT            NULL,
    approved_date       DATE           NULL,
    is_active           BIT            DEFAULT 1,
    created_at          DATETIME2      DEFAULT GETUTCDATE(),
    CONSTRAINT FK_STExemption_Contract FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
GO

-- 8. ASC 842 Parallel Accounting
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='asc842_schedules')
CREATE TABLE lease.asc842_schedules (
    asc842_id           INT IDENTITY(1,1) PRIMARY KEY,
    contract_id         INT            NOT NULL,
    lease_type          NVARCHAR(20)   NOT NULL DEFAULT 'Operating', -- Operating / Finance
    commencement_date   DATE           NOT NULL,
    end_date            DATE           NOT NULL,
    ibr_rate            DECIMAL(8,4)   NOT NULL,
    initial_liability   DECIMAL(18,2)  NOT NULL,
    initial_rou_asset   DECIMAL(18,2)  NOT NULL,
    created_at          DATETIME2      DEFAULT GETUTCDATE(),
    updated_at          DATETIME2      DEFAULT GETUTCDATE(),
    CONSTRAINT FK_ASC842_Contract FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
GO

-- 9. ASC 842 Amortisation Schedule
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='asc842_amortisation')
CREATE TABLE lease.asc842_amortisation (
    row_id              INT IDENTITY(1,1) PRIMARY KEY,
    asc842_id           INT            NOT NULL,
    contract_id         INT            NOT NULL,
    period_date         DATE           NOT NULL,
    opening_liability   DECIMAL(18,2)  NOT NULL,
    interest_expense    DECIMAL(18,2)  NOT NULL,
    lease_payment       DECIMAL(18,2)  NOT NULL,
    closing_liability   DECIMAL(18,2)  NOT NULL,
    rou_opening         DECIMAL(18,2)  NOT NULL,
    rou_amortisation    DECIMAL(18,2)  NOT NULL,
    rou_closing         DECIMAL(18,2)  NOT NULL,
    CONSTRAINT FK_ASC842Amort_Schedule FOREIGN KEY (asc842_id) REFERENCES lease.asc842_schedules(asc842_id)
);
GO

-- 10. ERP Export Configuration
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='finance' AND TABLE_NAME='erp_export_configs')
CREATE TABLE finance.erp_export_configs (
    config_id           INT IDENTITY(1,1) PRIMARY KEY,
    config_name         NVARCHAR(100)  NOT NULL,
    erp_type            NVARCHAR(50)   NOT NULL, -- 'SAP','ORACLE','DYNAMICS','NETSUITE','CUSTOM'
    export_format       NVARCHAR(20)   NOT NULL DEFAULT 'CSV', -- CSV/XML/IDOC/JSON
    gl_account_mapping  NVARCHAR(MAX)  NULL, -- JSON mapping
    cost_centre_mapping NVARCHAR(MAX)  NULL,
    date_format         NVARCHAR(20)   DEFAULT 'YYYY-MM-DD',
    delimiter           CHAR(1)        DEFAULT ',',
    include_header      BIT            DEFAULT 1,
    is_active           BIT            DEFAULT 1,
    created_by          INT            NULL,
    created_at          DATETIME2      DEFAULT GETUTCDATE()
);
GO

-- 11. ERP Export Log
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='finance' AND TABLE_NAME='erp_export_log')
CREATE TABLE finance.erp_export_log (
    export_id           INT IDENTITY(1,1) PRIMARY KEY,
    config_id           INT            NULL,
    export_date         DATETIME2      DEFAULT GETUTCDATE(),
    period_from         DATE           NULL,
    period_to           DATE           NULL,
    journal_count       INT            DEFAULT 0,
    line_count          INT            DEFAULT 0,
    file_name           NVARCHAR(255)  NULL,
    file_url            NVARCHAR(500)  NULL,
    status              NVARCHAR(20)   DEFAULT 'GENERATED', -- GENERATED/SENT/FAILED
    exported_by         INT            NULL,
    notes               NVARCHAR(500)  NULL
);
GO

-- 12. Bulk Operation Log
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='bulk_operation_log')
CREATE TABLE lease.bulk_operation_log (
    bulk_op_id          INT IDENTITY(1,1) PRIMARY KEY,
    operation_type      NVARCHAR(50)   NOT NULL, -- 'MASS_REMEASURE','CPI_UPDATE','BULK_IMPORT','BULK_EXPORT'
    total_records       INT            DEFAULT 0,
    success_count       INT            DEFAULT 0,
    error_count         INT            DEFAULT 0,
    parameters          NVARCHAR(MAX)  NULL, -- JSON
    error_details       NVARCHAR(MAX)  NULL, -- JSON array of errors
    status              NVARCHAR(20)   DEFAULT 'RUNNING', -- RUNNING/COMPLETED/FAILED
    started_at          DATETIME2      DEFAULT GETUTCDATE(),
    completed_at        DATETIME2      NULL,
    initiated_by        INT            NULL
);
GO

-- 13. Lease Import Staging
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='import_staging')
CREATE TABLE lease.import_staging (
    staging_id          INT IDENTITY(1,1) PRIMARY KEY,
    batch_id            NVARCHAR(50)   NOT NULL,
    row_number          INT            NOT NULL,
    raw_data            NVARCHAR(MAX)  NULL, -- JSON of original row
    lessor_name         NVARCHAR(200)  NULL,
    asset_description   NVARCHAR(500)  NULL,
    commencement_date   NVARCHAR(20)   NULL,
    end_date            NVARCHAR(20)   NULL,
    monthly_payment     NVARCHAR(50)   NULL,
    ibr_rate            NVARCHAR(20)   NULL,
    currency            NVARCHAR(10)   NULL,
    lease_type          NVARCHAR(20)   NULL,
    validation_status   NVARCHAR(20)   DEFAULT 'PENDING', -- PENDING/VALID/ERROR
    validation_errors   NVARCHAR(MAX)  NULL,
    contract_id         INT            NULL, -- set after successful import
    imported_at         DATETIME2      NULL,
    created_at          DATETIME2      DEFAULT GETUTCDATE()
);
GO

PRINT 'P1 accounting engine tables created successfully';
