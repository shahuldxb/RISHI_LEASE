-- ============================================================
-- VodaLease Enterprise — Lessor Master & Asset Registry Module
-- All DML via Stored Procedures (SPP pattern)
-- ============================================================

-- ============================================================
-- SCHEMA
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'lessor')
    EXEC('CREATE SCHEMA lessor');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'asset')
    EXEC('CREATE SCHEMA asset');
GO

-- ============================================================
-- LESSOR TABLES
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='lessors' AND schema_id=SCHEMA_ID('lessor'))
CREATE TABLE lessor.lessors (
    lessor_id       INT IDENTITY(1,1) PRIMARY KEY,
    lessor_code     VARCHAR(20)  NOT NULL UNIQUE,  -- e.g. LSR-00001
    lessor_name     NVARCHAR(200) NOT NULL,
    lessor_type     VARCHAR(30)  NOT NULL DEFAULT 'Individual',  -- Individual, Company, Government, REIT, Trust
    registration_no NVARCHAR(100) NULL,
    tax_id          NVARCHAR(50)  NULL,
    country         VARCHAR(3)   NOT NULL DEFAULT 'AE',
    city            NVARCHAR(100) NULL,
    address_line1   NVARCHAR(300) NULL,
    address_line2   NVARCHAR(300) NULL,
    postal_code     VARCHAR(20)  NULL,
    website         NVARCHAR(200) NULL,
    credit_rating   VARCHAR(10)  NULL,  -- AAA, AA, A, BBB, etc.
    payment_terms   INT          NOT NULL DEFAULT 30,  -- days
    preferred_currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    status          VARCHAR(20)  NOT NULL DEFAULT 'Active',  -- Active, Inactive, Blacklisted
    blacklist_reason NVARCHAR(500) NULL,
    total_leases    INT          NOT NULL DEFAULT 0,
    total_liability DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_by      NVARCHAR(100) NULL,
    created_at      DATETIME2    NOT NULL DEFAULT GETUTCDATE(),
    updated_by      NVARCHAR(100) NULL,
    updated_at      DATETIME2    NOT NULL DEFAULT GETUTCDATE(),
    screen_id       VARCHAR(30)  NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='lessor_contacts' AND schema_id=SCHEMA_ID('lessor'))
CREATE TABLE lessor.lessor_contacts (
    contact_id      INT IDENTITY(1,1) PRIMARY KEY,
    lessor_id       INT          NOT NULL REFERENCES lessor.lessors(lessor_id),
    contact_type    VARCHAR(30)  NOT NULL DEFAULT 'Primary',  -- Primary, Finance, Legal, Operations, Emergency
    full_name       NVARCHAR(200) NOT NULL,
    job_title       NVARCHAR(100) NULL,
    department      NVARCHAR(100) NULL,
    email           NVARCHAR(200) NULL,
    phone_primary   VARCHAR(30)  NULL,
    phone_secondary VARCHAR(30)  NULL,
    whatsapp        VARCHAR(30)  NULL,
    is_primary      BIT          NOT NULL DEFAULT 0,
    is_active       BIT          NOT NULL DEFAULT 1,
    notes           NVARCHAR(500) NULL,
    created_at      DATETIME2    NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='lessor_bank_accounts' AND schema_id=SCHEMA_ID('lessor'))
CREATE TABLE lessor.lessor_bank_accounts (
    bank_acc_id     INT IDENTITY(1,1) PRIMARY KEY,
    lessor_id       INT          NOT NULL REFERENCES lessor.lessors(lessor_id),
    bank_name       NVARCHAR(200) NOT NULL,
    account_name    NVARCHAR(200) NOT NULL,
    account_number  NVARCHAR(50)  NOT NULL,
    iban            NVARCHAR(50)  NULL,
    swift_code      VARCHAR(20)  NULL,
    routing_number  VARCHAR(20)  NULL,
    currency        VARCHAR(3)   NOT NULL DEFAULT 'AED',
    account_type    VARCHAR(20)  NOT NULL DEFAULT 'Current',  -- Current, Savings, Fixed
    branch_name     NVARCHAR(200) NULL,
    branch_code     VARCHAR(20)  NULL,
    country         VARCHAR(3)   NOT NULL DEFAULT 'AE',
    is_primary      BIT          NOT NULL DEFAULT 0,
    is_active       BIT          NOT NULL DEFAULT 1,
    verified_by     NVARCHAR(100) NULL,
    verified_at     DATETIME2    NULL,
    created_at      DATETIME2    NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='lessor_documents' AND schema_id=SCHEMA_ID('lessor'))
CREATE TABLE lessor.lessor_documents (
    doc_id          INT IDENTITY(1,1) PRIMARY KEY,
    lessor_id       INT          NOT NULL REFERENCES lessor.lessors(lessor_id),
    doc_type        VARCHAR(50)  NOT NULL,  -- Trade Licence, TRN Certificate, MOA, POA, Passport, etc.
    doc_name        NVARCHAR(300) NOT NULL,
    doc_number      NVARCHAR(100) NULL,
    issue_date      DATE         NULL,
    expiry_date     DATE         NULL,
    issuing_authority NVARCHAR(200) NULL,
    file_path       NVARCHAR(500) NULL,
    file_size_kb    INT          NULL,
    is_verified     BIT          NOT NULL DEFAULT 0,
    verified_by     NVARCHAR(100) NULL,
    verified_at     DATETIME2    NULL,
    notes           NVARCHAR(500) NULL,
    uploaded_by     NVARCHAR(100) NULL,
    uploaded_at     DATETIME2    NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='lessor_notes' AND schema_id=SCHEMA_ID('lessor'))
CREATE TABLE lessor.lessor_notes (
    note_id         INT IDENTITY(1,1) PRIMARY KEY,
    lessor_id       INT          NOT NULL REFERENCES lessor.lessors(lessor_id),
    note_type       VARCHAR(30)  NOT NULL DEFAULT 'General',  -- General, Legal, Financial, Dispute, Negotiation
    subject         NVARCHAR(300) NOT NULL,
    note_text       NVARCHAR(MAX) NOT NULL,
    is_private      BIT          NOT NULL DEFAULT 0,
    created_by      NVARCHAR(100) NOT NULL,
    created_at      DATETIME2    NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- ASSET TABLES
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='assets' AND schema_id=SCHEMA_ID('asset'))
CREATE TABLE asset.assets (
    asset_id        INT IDENTITY(1,1) PRIMARY KEY,
    asset_code      VARCHAR(20)  NOT NULL UNIQUE,  -- e.g. AST-00001
    asset_name      NVARCHAR(300) NOT NULL,
    asset_type      VARCHAR(50)  NOT NULL,  -- Tower Site, Data Centre, Retail Outlet, Office, Warehouse, Vehicle, Network Equipment, Land
    asset_subtype   NVARCHAR(100) NULL,
    description     NVARCHAR(MAX) NULL,
    -- Location
    country         VARCHAR(3)   NOT NULL DEFAULT 'AE',
    city            NVARCHAR(100) NULL,
    area            NVARCHAR(200) NULL,
    address_line1   NVARCHAR(300) NULL,
    address_line2   NVARCHAR(300) NULL,
    postal_code     VARCHAR(20)  NULL,
    latitude        DECIMAL(10,7) NULL,
    longitude       DECIMAL(10,7) NULL,
    -- Physical Details
    floor_area_sqm  DECIMAL(10,2) NULL,
    floors          INT          NULL,
    year_built      INT          NULL,
    condition_rating VARCHAR(20) NULL,  -- Excellent, Good, Fair, Poor
    -- Ownership & Status
    current_lessor_id INT        NULL REFERENCES lessor.lessors(lessor_id),
    current_lease_id  INT        NULL,  -- FK to lease.contracts (soft ref)
    status          VARCHAR(30)  NOT NULL DEFAULT 'Available',  -- Available, Leased, Under Maintenance, Decommissioned
    maintenance_responsibility VARCHAR(20) NOT NULL DEFAULT 'Lessor',  -- Lessor, Vodafone, Shared
    -- Financial
    estimated_market_value DECIMAL(18,2) NULL,
    last_valuation_date DATE     NULL,
    make_good_provision DECIMAL(18,2) NULL DEFAULT 0,
    -- Metadata
    tags            NVARCHAR(500) NULL,  -- comma-separated tags
    created_by      NVARCHAR(100) NULL,
    created_at      DATETIME2    NOT NULL DEFAULT GETUTCDATE(),
    updated_by      NVARCHAR(100) NULL,
    updated_at      DATETIME2    NOT NULL DEFAULT GETUTCDATE(),
    screen_id       VARCHAR(30)  NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='asset_documents' AND schema_id=SCHEMA_ID('asset'))
CREATE TABLE asset.asset_documents (
    doc_id          INT IDENTITY(1,1) PRIMARY KEY,
    asset_id        INT          NOT NULL REFERENCES asset.assets(asset_id),
    doc_type        VARCHAR(50)  NOT NULL,  -- Title Deed, Survey, Floor Plan, Inspection Report, Permit, Insurance, Photo
    doc_name        NVARCHAR(300) NOT NULL,
    doc_number      NVARCHAR(100) NULL,
    issue_date      DATE         NULL,
    expiry_date     DATE         NULL,
    file_path       NVARCHAR(500) NULL,
    file_size_kb    INT          NULL,
    notes           NVARCHAR(500) NULL,
    uploaded_by     NVARCHAR(100) NULL,
    uploaded_at     DATETIME2    NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='asset_maintenance_history' AND schema_id=SCHEMA_ID('asset'))
CREATE TABLE asset.asset_maintenance_history (
    maint_id        INT IDENTITY(1,1) PRIMARY KEY,
    asset_id        INT          NOT NULL REFERENCES asset.assets(asset_id),
    maint_type      VARCHAR(50)  NOT NULL,  -- Routine, Preventive, Corrective, Emergency, Inspection
    description     NVARCHAR(MAX) NOT NULL,
    performed_by    VARCHAR(30)  NOT NULL DEFAULT 'Vodafone',  -- Vodafone, Lessor, Third Party
    contractor_name NVARCHAR(200) NULL,
    cost_amount     DECIMAL(18,2) NULL DEFAULT 0,
    cost_currency   VARCHAR(3)   NOT NULL DEFAULT 'AED',
    is_recoverable  BIT          NOT NULL DEFAULT 0,  -- can be charged back to lessor
    recovery_status VARCHAR(20)  NULL DEFAULT 'N/A',  -- N/A, Pending, Recovered, Disputed
    scheduled_date  DATE         NULL,
    completed_date  DATE         NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'Scheduled',  -- Scheduled, In Progress, Completed, Cancelled
    notes           NVARCHAR(MAX) NULL,
    created_by      NVARCHAR(100) NULL,
    created_at      DATETIME2    NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='asset_insurance_links' AND schema_id=SCHEMA_ID('asset'))
CREATE TABLE asset.asset_insurance_links (
    link_id         INT IDENTITY(1,1) PRIMARY KEY,
    asset_id        INT          NOT NULL REFERENCES asset.assets(asset_id),
    policy_number   NVARCHAR(100) NOT NULL,
    insurer_name    NVARCHAR(200) NOT NULL,
    coverage_type   VARCHAR(50)  NOT NULL,  -- Property, Liability, Fire, Flood, All Risk
    sum_insured     DECIMAL(18,2) NULL,
    currency        VARCHAR(3)   NOT NULL DEFAULT 'AED',
    premium_amount  DECIMAL(18,2) NULL,
    start_date      DATE         NOT NULL,
    end_date        DATE         NOT NULL,
    is_mandatory    BIT          NOT NULL DEFAULT 1,
    insured_by      VARCHAR(20)  NOT NULL DEFAULT 'Vodafone',  -- Vodafone, Lessor
    notes           NVARCHAR(500) NULL,
    created_at      DATETIME2    NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- INDEXES
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_lessors_status' AND object_id=OBJECT_ID('lessor.lessors'))
    CREATE INDEX IX_lessors_status ON lessor.lessors(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_lessors_name' AND object_id=OBJECT_ID('lessor.lessors'))
    CREATE INDEX IX_lessors_name ON lessor.lessors(lessor_name);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_assets_status' AND object_id=OBJECT_ID('asset.assets'))
    CREATE INDEX IX_assets_status ON asset.assets(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_assets_type' AND object_id=OBJECT_ID('asset.assets'))
    CREATE INDEX IX_assets_type ON asset.assets(asset_type);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_assets_lessor' AND object_id=OBJECT_ID('asset.assets'))
    CREATE INDEX IX_assets_lessor ON asset.assets(current_lessor_id);
GO

-- ============================================================
-- STORED PROCEDURES — LESSOR
-- ============================================================

-- sp_GetLessors
IF OBJECT_ID('dbo.sp_GetLessors', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetLessors;
GO
CREATE PROCEDURE dbo.sp_GetLessors
    @SearchTerm     NVARCHAR(200) = NULL,
    @Status         VARCHAR(20)   = NULL,
    @LessorType     VARCHAR(30)   = NULL,
    @Country        VARCHAR(3)    = NULL,
    @PageNumber     INT           = 1,
    @PageSize       INT           = 20
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;

    SELECT
        l.lessor_id, l.lessor_code, l.lessor_name, l.lessor_type,
        l.registration_no, l.tax_id, l.country, l.city,
        l.credit_rating, l.payment_terms, l.preferred_currency,
        l.status, l.total_leases, l.total_liability,
        l.created_at, l.updated_at,
        -- Primary contact
        (SELECT TOP 1 full_name FROM lessor.lessor_contacts
         WHERE lessor_id = l.lessor_id AND is_primary = 1) AS primary_contact_name,
        (SELECT TOP 1 email FROM lessor.lessor_contacts
         WHERE lessor_id = l.lessor_id AND is_primary = 1) AS primary_contact_email,
        (SELECT TOP 1 phone_primary FROM lessor.lessor_contacts
         WHERE lessor_id = l.lessor_id AND is_primary = 1) AS primary_contact_phone,
        -- Asset count
        (SELECT COUNT(*) FROM asset.assets WHERE current_lessor_id = l.lessor_id) AS asset_count,
        -- Total rows for pagination
        COUNT(*) OVER() AS total_rows
    FROM lessor.lessors l
    WHERE
        (@SearchTerm IS NULL OR l.lessor_name LIKE '%' + @SearchTerm + '%'
            OR l.lessor_code LIKE '%' + @SearchTerm + '%'
            OR l.registration_no LIKE '%' + @SearchTerm + '%')
        AND (@Status IS NULL OR l.status = @Status)
        AND (@LessorType IS NULL OR l.lessor_type = @LessorType)
        AND (@Country IS NULL OR l.country = @Country)
    ORDER BY l.lessor_name
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- sp_GetLessorDetail
IF OBJECT_ID('dbo.sp_GetLessorDetail', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetLessorDetail;
GO
CREATE PROCEDURE dbo.sp_GetLessorDetail
    @LessorId INT
AS
BEGIN
    SET NOCOUNT ON;
    -- Main record
    SELECT * FROM lessor.lessors WHERE lessor_id = @LessorId;
    -- Contacts
    SELECT * FROM lessor.lessor_contacts WHERE lessor_id = @LessorId ORDER BY is_primary DESC, contact_type;
    -- Bank accounts
    SELECT * FROM lessor.lessor_bank_accounts WHERE lessor_id = @LessorId ORDER BY is_primary DESC;
    -- Documents
    SELECT * FROM lessor.lessor_documents WHERE lessor_id = @LessorId ORDER BY uploaded_at DESC;
    -- Notes
    SELECT * FROM lessor.lessor_notes WHERE lessor_id = @LessorId ORDER BY created_at DESC;
    -- Assets currently leased from this lessor
    SELECT
        a.asset_id, a.asset_code, a.asset_name, a.asset_type,
        a.city, a.status, a.floor_area_sqm, a.condition_rating,
        a.estimated_market_value
    FROM asset.assets a
    WHERE a.current_lessor_id = @LessorId
    ORDER BY a.asset_name;
END
GO

-- sp_UpsertLessor
IF OBJECT_ID('dbo.sp_UpsertLessor', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_UpsertLessor;
GO
CREATE PROCEDURE dbo.sp_UpsertLessor
    @LessorId           INT           = NULL,
    @LessorName         NVARCHAR(200),
    @LessorType         VARCHAR(30)   = 'Individual',
    @RegistrationNo     NVARCHAR(100) = NULL,
    @TaxId              NVARCHAR(50)  = NULL,
    @Country            VARCHAR(3)    = 'AE',
    @City               NVARCHAR(100) = NULL,
    @AddressLine1       NVARCHAR(300) = NULL,
    @AddressLine2       NVARCHAR(300) = NULL,
    @PostalCode         VARCHAR(20)   = NULL,
    @Website            NVARCHAR(200) = NULL,
    @CreditRating       VARCHAR(10)   = NULL,
    @PaymentTerms       INT           = 30,
    @PreferredCurrency  VARCHAR(3)    = 'AED',
    @Status             VARCHAR(20)   = 'Active',
    @BlacklistReason    NVARCHAR(500) = NULL,
    @CreatedBy          NVARCHAR(100) = NULL,
    @ScreenId           VARCHAR(30)   = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @LessorId IS NULL OR @LessorId = 0
    BEGIN
        -- Generate lessor code
        DECLARE @NewCode VARCHAR(20);
        DECLARE @NextId INT = (SELECT ISNULL(MAX(lessor_id), 0) + 1 FROM lessor.lessors);
        SET @NewCode = 'LSR-' + RIGHT('00000' + CAST(@NextId AS VARCHAR), 5);

        INSERT INTO lessor.lessors (
            lessor_code, lessor_name, lessor_type, registration_no, tax_id,
            country, city, address_line1, address_line2, postal_code,
            website, credit_rating, payment_terms, preferred_currency,
            status, blacklist_reason, created_by, screen_id
        ) VALUES (
            @NewCode, @LessorName, @LessorType, @RegistrationNo, @TaxId,
            @Country, @City, @AddressLine1, @AddressLine2, @PostalCode,
            @Website, @CreditRating, @PaymentTerms, @PreferredCurrency,
            @Status, @BlacklistReason, @CreatedBy, @ScreenId
        );
        SELECT SCOPE_IDENTITY() AS lessor_id, @NewCode AS lessor_code;
    END
    ELSE
    BEGIN
        UPDATE lessor.lessors SET
            lessor_name = @LessorName, lessor_type = @LessorType,
            registration_no = @RegistrationNo, tax_id = @TaxId,
            country = @Country, city = @City,
            address_line1 = @AddressLine1, address_line2 = @AddressLine2,
            postal_code = @PostalCode, website = @Website,
            credit_rating = @CreditRating, payment_terms = @PaymentTerms,
            preferred_currency = @PreferredCurrency, status = @Status,
            blacklist_reason = @BlacklistReason,
            updated_by = @CreatedBy, updated_at = GETUTCDATE(), screen_id = @ScreenId
        WHERE lessor_id = @LessorId;
        SELECT @LessorId AS lessor_id;
    END
END
GO

-- sp_DeleteLessor
IF OBJECT_ID('dbo.sp_DeleteLessor', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_DeleteLessor;
GO
CREATE PROCEDURE dbo.sp_DeleteLessor
    @LessorId INT,
    @DeletedBy NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    -- Soft delete only if no active leases
    IF EXISTS (SELECT 1 FROM asset.assets WHERE current_lessor_id = @LessorId)
    BEGIN
        SELECT 0 AS success, 'Cannot delete lessor with active assets' AS message;
        RETURN;
    END
    UPDATE lessor.lessors SET status = 'Inactive', updated_by = @DeletedBy, updated_at = GETUTCDATE()
    WHERE lessor_id = @LessorId;
    SELECT 1 AS success, 'Lessor deactivated' AS message;
END
GO

-- sp_UpsertLessorContact
IF OBJECT_ID('dbo.sp_UpsertLessorContact', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_UpsertLessorContact;
GO
CREATE PROCEDURE dbo.sp_UpsertLessorContact
    @ContactId      INT           = NULL,
    @LessorId       INT,
    @ContactType    VARCHAR(30)   = 'Primary',
    @FullName       NVARCHAR(200),
    @JobTitle       NVARCHAR(100) = NULL,
    @Department     NVARCHAR(100) = NULL,
    @Email          NVARCHAR(200) = NULL,
    @PhonePrimary   VARCHAR(30)   = NULL,
    @PhoneSecondary VARCHAR(30)   = NULL,
    @Whatsapp       VARCHAR(30)   = NULL,
    @IsPrimary      BIT           = 0,
    @Notes          NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @IsPrimary = 1
        UPDATE lessor.lessor_contacts SET is_primary = 0 WHERE lessor_id = @LessorId;

    IF @ContactId IS NULL OR @ContactId = 0
    BEGIN
        INSERT INTO lessor.lessor_contacts (
            lessor_id, contact_type, full_name, job_title, department,
            email, phone_primary, phone_secondary, whatsapp, is_primary, notes
        ) VALUES (
            @LessorId, @ContactType, @FullName, @JobTitle, @Department,
            @Email, @PhonePrimary, @PhoneSecondary, @Whatsapp, @IsPrimary, @Notes
        );
        SELECT SCOPE_IDENTITY() AS contact_id;
    END
    ELSE
    BEGIN
        UPDATE lessor.lessor_contacts SET
            contact_type = @ContactType, full_name = @FullName, job_title = @JobTitle,
            department = @Department, email = @Email, phone_primary = @PhonePrimary,
            phone_secondary = @PhoneSecondary, whatsapp = @Whatsapp,
            is_primary = @IsPrimary, notes = @Notes
        WHERE contact_id = @ContactId AND lessor_id = @LessorId;
        SELECT @ContactId AS contact_id;
    END
END
GO

-- sp_DeleteLessorContact
IF OBJECT_ID('dbo.sp_DeleteLessorContact', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_DeleteLessorContact;
GO
CREATE PROCEDURE dbo.sp_DeleteLessorContact
    @ContactId INT, @LessorId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM lessor.lessor_contacts WHERE contact_id = @ContactId AND lessor_id = @LessorId;
    SELECT @@ROWCOUNT AS rows_deleted;
END
GO

-- sp_UpsertLessorBankAccount
IF OBJECT_ID('dbo.sp_UpsertLessorBankAccount', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_UpsertLessorBankAccount;
GO
CREATE PROCEDURE dbo.sp_UpsertLessorBankAccount
    @BankAccId      INT           = NULL,
    @LessorId       INT,
    @BankName       NVARCHAR(200),
    @AccountName    NVARCHAR(200),
    @AccountNumber  NVARCHAR(50),
    @IBAN           NVARCHAR(50)  = NULL,
    @SwiftCode      VARCHAR(20)   = NULL,
    @RoutingNumber  VARCHAR(20)   = NULL,
    @Currency       VARCHAR(3)    = 'AED',
    @AccountType    VARCHAR(20)   = 'Current',
    @BranchName     NVARCHAR(200) = NULL,
    @BranchCode     VARCHAR(20)   = NULL,
    @Country        VARCHAR(3)    = 'AE',
    @IsPrimary      BIT           = 0,
    @VerifiedBy     NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @IsPrimary = 1
        UPDATE lessor.lessor_bank_accounts SET is_primary = 0 WHERE lessor_id = @LessorId;

    IF @BankAccId IS NULL OR @BankAccId = 0
    BEGIN
        INSERT INTO lessor.lessor_bank_accounts (
            lessor_id, bank_name, account_name, account_number, iban,
            swift_code, routing_number, currency, account_type,
            branch_name, branch_code, country, is_primary,
            verified_by, verified_at
        ) VALUES (
            @LessorId, @BankName, @AccountName, @AccountNumber, @IBAN,
            @SwiftCode, @RoutingNumber, @Currency, @AccountType,
            @BranchName, @BranchCode, @Country, @IsPrimary,
            @VerifiedBy, CASE WHEN @VerifiedBy IS NOT NULL THEN GETUTCDATE() ELSE NULL END
        );
        SELECT SCOPE_IDENTITY() AS bank_acc_id;
    END
    ELSE
    BEGIN
        UPDATE lessor.lessor_bank_accounts SET
            bank_name = @BankName, account_name = @AccountName,
            account_number = @AccountNumber, iban = @IBAN,
            swift_code = @SwiftCode, routing_number = @RoutingNumber,
            currency = @Currency, account_type = @AccountType,
            branch_name = @BranchName, branch_code = @BranchCode,
            country = @Country, is_primary = @IsPrimary,
            verified_by = @VerifiedBy,
            verified_at = CASE WHEN @VerifiedBy IS NOT NULL THEN GETUTCDATE() ELSE verified_at END
        WHERE bank_acc_id = @BankAccId AND lessor_id = @LessorId;
        SELECT @BankAccId AS bank_acc_id;
    END
END
GO

-- sp_DeleteLessorBankAccount
IF OBJECT_ID('dbo.sp_DeleteLessorBankAccount', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_DeleteLessorBankAccount;
GO
CREATE PROCEDURE dbo.sp_DeleteLessorBankAccount
    @BankAccId INT, @LessorId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM lessor.lessor_bank_accounts WHERE bank_acc_id = @BankAccId AND lessor_id = @LessorId;
    SELECT @@ROWCOUNT AS rows_deleted;
END
GO

-- sp_AddLessorDocument
IF OBJECT_ID('dbo.sp_AddLessorDocument', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_AddLessorDocument;
GO
CREATE PROCEDURE dbo.sp_AddLessorDocument
    @LessorId       INT,
    @DocType        VARCHAR(50),
    @DocName        NVARCHAR(300),
    @DocNumber      NVARCHAR(100) = NULL,
    @IssueDate      DATE          = NULL,
    @ExpiryDate     DATE          = NULL,
    @IssuingAuth    NVARCHAR(200) = NULL,
    @FilePath       NVARCHAR(500) = NULL,
    @FileSizeKb     INT           = NULL,
    @Notes          NVARCHAR(500) = NULL,
    @UploadedBy     NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO lessor.lessor_documents (
        lessor_id, doc_type, doc_name, doc_number, issue_date, expiry_date,
        issuing_authority, file_path, file_size_kb, notes, uploaded_by
    ) VALUES (
        @LessorId, @DocType, @DocName, @DocNumber, @IssueDate, @ExpiryDate,
        @IssuingAuth, @FilePath, @FileSizeKb, @Notes, @UploadedBy
    );
    SELECT SCOPE_IDENTITY() AS doc_id;
END
GO

-- sp_AddLessorNote
IF OBJECT_ID('dbo.sp_AddLessorNote', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_AddLessorNote;
GO
CREATE PROCEDURE dbo.sp_AddLessorNote
    @LessorId   INT,
    @NoteType   VARCHAR(30)   = 'General',
    @Subject    NVARCHAR(300),
    @NoteText   NVARCHAR(MAX),
    @IsPrivate  BIT           = 0,
    @CreatedBy  NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO lessor.lessor_notes (lessor_id, note_type, subject, note_text, is_private, created_by)
    VALUES (@LessorId, @NoteType, @Subject, @NoteText, @IsPrivate, @CreatedBy);
    SELECT SCOPE_IDENTITY() AS note_id;
END
GO

-- ============================================================
-- STORED PROCEDURES — ASSET
-- ============================================================

-- sp_GetAssets
IF OBJECT_ID('dbo.sp_GetAssets', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetAssets;
GO
CREATE PROCEDURE dbo.sp_GetAssets
    @SearchTerm     NVARCHAR(200) = NULL,
    @AssetType      VARCHAR(50)   = NULL,
    @Status         VARCHAR(30)   = NULL,
    @Country        VARCHAR(3)    = NULL,
    @LessorId       INT           = NULL,
    @MaintenanceResp VARCHAR(20)  = NULL,
    @PageNumber     INT           = 1,
    @PageSize       INT           = 20
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;

    SELECT
        a.asset_id, a.asset_code, a.asset_name, a.asset_type, a.asset_subtype,
        a.country, a.city, a.area, a.floor_area_sqm, a.condition_rating,
        a.status, a.maintenance_responsibility,
        a.estimated_market_value, a.make_good_provision,
        a.current_lessor_id, a.current_lease_id,
        a.tags, a.created_at, a.updated_at,
        -- Lessor name
        l.lessor_name AS current_lessor_name,
        l.lessor_code AS current_lessor_code,
        -- Active insurance count
        (SELECT COUNT(*) FROM asset.asset_insurance_links ai
         WHERE ai.asset_id = a.asset_id AND ai.end_date >= CAST(GETUTCDATE() AS DATE)) AS active_insurance_count,
        -- Pending maintenance count
        (SELECT COUNT(*) FROM asset.asset_maintenance_history am
         WHERE am.asset_id = a.asset_id AND am.status IN ('Scheduled','In Progress')) AS pending_maintenance_count,
        -- Document count
        (SELECT COUNT(*) FROM asset.asset_documents ad WHERE ad.asset_id = a.asset_id) AS document_count,
        -- Total rows
        COUNT(*) OVER() AS total_rows
    FROM asset.assets a
    LEFT JOIN lessor.lessors l ON a.current_lessor_id = l.lessor_id
    WHERE
        (@SearchTerm IS NULL OR a.asset_name LIKE '%' + @SearchTerm + '%'
            OR a.asset_code LIKE '%' + @SearchTerm + '%'
            OR a.city LIKE '%' + @SearchTerm + '%'
            OR a.area LIKE '%' + @SearchTerm + '%')
        AND (@AssetType IS NULL OR a.asset_type = @AssetType)
        AND (@Status IS NULL OR a.status = @Status)
        AND (@Country IS NULL OR a.country = @Country)
        AND (@LessorId IS NULL OR a.current_lessor_id = @LessorId)
        AND (@MaintenanceResp IS NULL OR a.maintenance_responsibility = @MaintenanceResp)
    ORDER BY a.asset_name
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- sp_GetAssetDetail
IF OBJECT_ID('dbo.sp_GetAssetDetail', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetAssetDetail;
GO
CREATE PROCEDURE dbo.sp_GetAssetDetail
    @AssetId INT
AS
BEGIN
    SET NOCOUNT ON;
    -- Main asset record with lessor info
    SELECT a.*, l.lessor_name, l.lessor_code, l.lessor_type, l.status AS lessor_status
    FROM asset.assets a
    LEFT JOIN lessor.lessors l ON a.current_lessor_id = l.lessor_id
    WHERE a.asset_id = @AssetId;
    -- Documents
    SELECT * FROM asset.asset_documents WHERE asset_id = @AssetId ORDER BY uploaded_at DESC;
    -- Maintenance history
    SELECT * FROM asset.asset_maintenance_history WHERE asset_id = @AssetId ORDER BY created_at DESC;
    -- Insurance links
    SELECT * FROM asset.asset_insurance_links WHERE asset_id = @AssetId ORDER BY start_date DESC;
END
GO

-- sp_GetAssetLeaseHistory
IF OBJECT_ID('dbo.sp_GetAssetLeaseHistory', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetAssetLeaseHistory;
GO
CREATE PROCEDURE dbo.sp_GetAssetLeaseHistory
    @AssetId INT
AS
BEGIN
    SET NOCOUNT ON;
    -- Return lease history from lease.contracts if asset_id column exists
    -- Fallback to empty result set with correct columns
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('lease.contracts') AND name = 'asset_id')
    BEGIN
        SELECT
            c.contract_id, c.contract_ref, c.status,
            c.commencement_date, c.expiry_date,
            c.lease_term_months, c.monthly_payment,
            c.total_lease_liability, c.rou_asset_value,
            l.lessor_name
        FROM lease.contracts c
        LEFT JOIN lessor.lessors l ON c.lessor_id = l.lessor_id
        WHERE c.asset_id = @AssetId
        ORDER BY c.commencement_date DESC;
    END
    ELSE
    BEGIN
        SELECT
            NULL AS contract_id, NULL AS contract_ref, NULL AS status,
            NULL AS commencement_date, NULL AS expiry_date,
            NULL AS lease_term_months, NULL AS monthly_payment,
            NULL AS total_lease_liability, NULL AS rou_asset_value,
            NULL AS lessor_name
        WHERE 1 = 0;
    END
END
GO

-- sp_UpsertAsset
IF OBJECT_ID('dbo.sp_UpsertAsset', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_UpsertAsset;
GO
CREATE PROCEDURE dbo.sp_UpsertAsset
    @AssetId                INT           = NULL,
    @AssetName              NVARCHAR(300),
    @AssetType              VARCHAR(50),
    @AssetSubtype           NVARCHAR(100) = NULL,
    @Description            NVARCHAR(MAX) = NULL,
    @Country                VARCHAR(3)    = 'AE',
    @City                   NVARCHAR(100) = NULL,
    @Area                   NVARCHAR(200) = NULL,
    @AddressLine1           NVARCHAR(300) = NULL,
    @AddressLine2           NVARCHAR(300) = NULL,
    @PostalCode             VARCHAR(20)   = NULL,
    @Latitude               DECIMAL(10,7) = NULL,
    @Longitude              DECIMAL(10,7) = NULL,
    @FloorAreaSqm           DECIMAL(10,2) = NULL,
    @Floors                 INT           = NULL,
    @YearBuilt              INT           = NULL,
    @ConditionRating        VARCHAR(20)   = NULL,
    @CurrentLessorId        INT           = NULL,
    @Status                 VARCHAR(30)   = 'Available',
    @MaintenanceResponsibility VARCHAR(20) = 'Lessor',
    @EstimatedMarketValue   DECIMAL(18,2) = NULL,
    @LastValuationDate      DATE          = NULL,
    @MakeGoodProvision      DECIMAL(18,2) = 0,
    @Tags                   NVARCHAR(500) = NULL,
    @CreatedBy              NVARCHAR(100) = NULL,
    @ScreenId               VARCHAR(30)   = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @AssetId IS NULL OR @AssetId = 0
    BEGIN
        DECLARE @NewCode VARCHAR(20);
        DECLARE @NextId INT = (SELECT ISNULL(MAX(asset_id), 0) + 1 FROM asset.assets);
        SET @NewCode = 'AST-' + RIGHT('00000' + CAST(@NextId AS VARCHAR), 5);

        INSERT INTO asset.assets (
            asset_code, asset_name, asset_type, asset_subtype, description,
            country, city, area, address_line1, address_line2, postal_code,
            latitude, longitude, floor_area_sqm, floors, year_built, condition_rating,
            current_lessor_id, status, maintenance_responsibility,
            estimated_market_value, last_valuation_date, make_good_provision,
            tags, created_by, screen_id
        ) VALUES (
            @NewCode, @AssetName, @AssetType, @AssetSubtype, @Description,
            @Country, @City, @Area, @AddressLine1, @AddressLine2, @PostalCode,
            @Latitude, @Longitude, @FloorAreaSqm, @Floors, @YearBuilt, @ConditionRating,
            @CurrentLessorId, @Status, @MaintenanceResponsibility,
            @EstimatedMarketValue, @LastValuationDate, @MakeGoodProvision,
            @Tags, @CreatedBy, @ScreenId
        );
        SELECT SCOPE_IDENTITY() AS asset_id, @NewCode AS asset_code;
    END
    ELSE
    BEGIN
        UPDATE asset.assets SET
            asset_name = @AssetName, asset_type = @AssetType, asset_subtype = @AssetSubtype,
            description = @Description, country = @Country, city = @City, area = @Area,
            address_line1 = @AddressLine1, address_line2 = @AddressLine2, postal_code = @PostalCode,
            latitude = @Latitude, longitude = @Longitude,
            floor_area_sqm = @FloorAreaSqm, floors = @Floors, year_built = @YearBuilt,
            condition_rating = @ConditionRating, current_lessor_id = @CurrentLessorId,
            status = @Status, maintenance_responsibility = @MaintenanceResponsibility,
            estimated_market_value = @EstimatedMarketValue, last_valuation_date = @LastValuationDate,
            make_good_provision = @MakeGoodProvision, tags = @Tags,
            updated_by = @CreatedBy, updated_at = GETUTCDATE(), screen_id = @ScreenId
        WHERE asset_id = @AssetId;
        SELECT @AssetId AS asset_id;
    END
END
GO

-- sp_DeleteAsset
IF OBJECT_ID('dbo.sp_DeleteAsset', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_DeleteAsset;
GO
CREATE PROCEDURE dbo.sp_DeleteAsset
    @AssetId INT, @DeletedBy NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM asset.assets WHERE asset_id = @AssetId AND status = 'Leased')
    BEGIN
        SELECT 0 AS success, 'Cannot delete an asset that is currently leased' AS message;
        RETURN;
    END
    UPDATE asset.assets SET status = 'Decommissioned', updated_by = @DeletedBy, updated_at = GETUTCDATE()
    WHERE asset_id = @AssetId;
    SELECT 1 AS success, 'Asset decommissioned' AS message;
END
GO

-- sp_AddAssetDocument
IF OBJECT_ID('dbo.sp_AddAssetDocument', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_AddAssetDocument;
GO
CREATE PROCEDURE dbo.sp_AddAssetDocument
    @AssetId        INT,
    @DocType        VARCHAR(50),
    @DocName        NVARCHAR(300),
    @DocNumber      NVARCHAR(100) = NULL,
    @IssueDate      DATE          = NULL,
    @ExpiryDate     DATE          = NULL,
    @FilePath       NVARCHAR(500) = NULL,
    @FileSizeKb     INT           = NULL,
    @Notes          NVARCHAR(500) = NULL,
    @UploadedBy     NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO asset.asset_documents (
        asset_id, doc_type, doc_name, doc_number, issue_date, expiry_date,
        file_path, file_size_kb, notes, uploaded_by
    ) VALUES (
        @AssetId, @DocType, @DocName, @DocNumber, @IssueDate, @ExpiryDate,
        @FilePath, @FileSizeKb, @Notes, @UploadedBy
    );
    SELECT SCOPE_IDENTITY() AS doc_id;
END
GO

-- sp_AddAssetMaintenance
IF OBJECT_ID('dbo.sp_AddAssetMaintenance', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_AddAssetMaintenance;
GO
CREATE PROCEDURE dbo.sp_AddAssetMaintenance
    @AssetId        INT,
    @MaintType      VARCHAR(50),
    @Description    NVARCHAR(MAX),
    @PerformedBy    VARCHAR(30)   = 'Vodafone',
    @ContractorName NVARCHAR(200) = NULL,
    @CostAmount     DECIMAL(18,2) = 0,
    @CostCurrency   VARCHAR(3)    = 'AED',
    @IsRecoverable  BIT           = 0,
    @ScheduledDate  DATE          = NULL,
    @CompletedDate  DATE          = NULL,
    @Status         VARCHAR(20)   = 'Scheduled',
    @Notes          NVARCHAR(MAX) = NULL,
    @CreatedBy      NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO asset.asset_maintenance_history (
        asset_id, maint_type, description, performed_by, contractor_name,
        cost_amount, cost_currency, is_recoverable,
        scheduled_date, completed_date, status, notes, created_by
    ) VALUES (
        @AssetId, @MaintType, @Description, @PerformedBy, @ContractorName,
        @CostAmount, @CostCurrency, @IsRecoverable,
        @ScheduledDate, @CompletedDate, @Status, @Notes, @CreatedBy
    );
    SELECT SCOPE_IDENTITY() AS maint_id;
END
GO

-- sp_AddAssetInsurance
IF OBJECT_ID('dbo.sp_AddAssetInsurance', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_AddAssetInsurance;
GO
CREATE PROCEDURE dbo.sp_AddAssetInsurance
    @AssetId        INT,
    @PolicyNumber   NVARCHAR(100),
    @InsurerName    NVARCHAR(200),
    @CoverageType   VARCHAR(50),
    @SumInsured     DECIMAL(18,2) = NULL,
    @Currency       VARCHAR(3)    = 'AED',
    @PremiumAmount  DECIMAL(18,2) = NULL,
    @StartDate      DATE,
    @EndDate        DATE,
    @IsMandatory    BIT           = 1,
    @InsuredBy      VARCHAR(20)   = 'Vodafone',
    @Notes          NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO asset.asset_insurance_links (
        asset_id, policy_number, insurer_name, coverage_type,
        sum_insured, currency, premium_amount, start_date, end_date,
        is_mandatory, insured_by, notes
    ) VALUES (
        @AssetId, @PolicyNumber, @InsurerName, @CoverageType,
        @SumInsured, @Currency, @PremiumAmount, @StartDate, @EndDate,
        @IsMandatory, @InsuredBy, @Notes
    );
    SELECT SCOPE_IDENTITY() AS link_id;
END
GO

-- sp_GetLessorAssets
IF OBJECT_ID('dbo.sp_GetLessorAssets', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetLessorAssets;
GO
CREATE PROCEDURE dbo.sp_GetLessorAssets
    @LessorId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        a.asset_id, a.asset_code, a.asset_name, a.asset_type,
        a.city, a.area, a.floor_area_sqm, a.condition_rating,
        a.status, a.maintenance_responsibility,
        a.estimated_market_value, a.make_good_provision,
        a.current_lease_id,
        (SELECT COUNT(*) FROM asset.asset_insurance_links ai
         WHERE ai.asset_id = a.asset_id AND ai.end_date >= CAST(GETUTCDATE() AS DATE)) AS active_insurance_count
    FROM asset.assets a
    WHERE a.current_lessor_id = @LessorId
    ORDER BY a.asset_name;
END
GO

-- Register screens in screen_registry
IF EXISTS (SELECT 1 FROM sys.tables WHERE name='screen_registry' AND schema_id=SCHEMA_ID('security'))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id = 'VFLSELESSMST0001P001')
        INSERT INTO security.screen_registry (screen_id, screen_name, module, description, created_at)
        VALUES ('VFLSELESSMST0001P001', 'Lessor Master', 'Lessor', 'Lessor master register with contacts, bank accounts, assets, documents and notes', GETUTCDATE());
    IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id = 'VFLSEASTREG0001P001')
        INSERT INTO security.screen_registry (screen_id, screen_name, module, description, created_at)
        VALUES ('VFLSEASTREG0001P001', 'Asset Registry', 'Asset', 'Asset master register with lease history, maintenance, insurance and documents', GETUTCDATE());
END
GO

PRINT 'Lessor Master & Asset Registry module deployed successfully';
GO
