-- ============================================================
-- Lessee Master Module
-- Schema: lessee
-- Tables: lessees, lessee_bank_accounts, lessee_signatories
-- ============================================================

-- Create schema
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'lessee')
  EXEC('CREATE SCHEMA lessee');
GO

-- ── Main lessee table ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('lessee.lessees'))
BEGIN
  CREATE TABLE lessee.lessees (
    lessee_id         INT IDENTITY(1,1) PRIMARY KEY,
    lessee_code       VARCHAR(30)   NOT NULL UNIQUE,
    lessee_name       NVARCHAR(200) NOT NULL,
    trade_name        NVARCHAR(200) NULL,
    entity_type       VARCHAR(30)   NOT NULL DEFAULT 'Company',  -- Company|Subsidiary|Branch|JV|Individual
    parent_company    NVARCHAR(200) NULL,
    registration_no   VARCHAR(100)  NULL,
    tax_vat_no        VARCHAR(100)  NULL,
    industry_sector   NVARCHAR(100) NULL,
    credit_rating     VARCHAR(20)   NULL,
    country           VARCHAR(100)  NOT NULL DEFAULT 'Qatar',
    city              NVARCHAR(100) NULL,
    address           NVARCHAR(500) NULL,
    po_box            VARCHAR(50)   NULL,
    contact_person    NVARCHAR(200) NULL,
    contact_email     VARCHAR(200)  NULL,
    contact_phone     VARCHAR(50)   NULL,
    website           VARCHAR(200)  NULL,
    status            VARCHAR(20)   NOT NULL DEFAULT 'Active',   -- Active|Inactive|Suspended
    notes             NVARCHAR(1000) NULL,
    created_by        INT           NULL,
    created_at        DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    updated_at        DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );
END
GO

-- ── Bank accounts ────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('lessee.lessee_bank_accounts'))
BEGIN
  CREATE TABLE lessee.lessee_bank_accounts (
    bank_account_id   INT IDENTITY(1,1) PRIMARY KEY,
    lessee_id         INT           NOT NULL REFERENCES lessee.lessees(lessee_id),
    bank_name         NVARCHAR(200) NOT NULL,
    account_name      NVARCHAR(200) NOT NULL,
    account_number    VARCHAR(50)   NOT NULL,
    iban              VARCHAR(50)   NULL,
    swift_bic         VARCHAR(20)   NULL,
    currency          CHAR(3)       NOT NULL DEFAULT 'QAR',
    branch            NVARCHAR(200) NULL,
    is_primary        BIT           NOT NULL DEFAULT 0,
    created_at        DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );
END
GO

-- ── Authorised signatories ───────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('lessee.lessee_signatories'))
BEGIN
  CREATE TABLE lessee.lessee_signatories (
    signatory_id      INT IDENTITY(1,1) PRIMARY KEY,
    lessee_id         INT           NOT NULL REFERENCES lessee.lessees(lessee_id),
    full_name         NVARCHAR(200) NOT NULL,
    designation       NVARCHAR(200) NULL,
    email             VARCHAR(200)  NULL,
    phone             VARCHAR(50)   NULL,
    authority_limit   DECIMAL(18,2) NULL,
    is_active         BIT           NOT NULL DEFAULT 1,
    created_at        DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );
END
GO

-- ── Add lessee_id FK to lease.leases (if column not exists) ──
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('lease.leases') AND name = 'lessee_id'
)
BEGIN
  ALTER TABLE lease.leases ADD lessee_id INT NULL REFERENCES lessee.lessees(lessee_id);
END
GO

-- ============================================================
-- STORED PROCEDURES
-- ============================================================

-- sp_GetLessees
IF OBJECT_ID('sp_GetLessees', 'P') IS NOT NULL DROP PROCEDURE sp_GetLessees;
GO
CREATE PROCEDURE sp_GetLessees
  @PageNumber   INT = 1,
  @PageSize     INT = 50,
  @SearchTerm   NVARCHAR(200) = NULL,
  @StatusFilter VARCHAR(20)   = NULL,
  @EntityType   VARCHAR(30)   = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
  SELECT
    l.lessee_id, l.lessee_code, l.lessee_name, l.trade_name,
    l.entity_type, l.parent_company, l.registration_no, l.tax_vat_no,
    l.industry_sector, l.credit_rating, l.country, l.city, l.address,
    l.po_box, l.contact_person, l.contact_email, l.contact_phone,
    l.website, l.status, l.notes, l.created_at, l.updated_at,
    COUNT(*) OVER() AS total_count
  FROM lessee.lessees l
  WHERE
    (@SearchTerm IS NULL OR l.lessee_name LIKE '%' + @SearchTerm + '%'
      OR l.lessee_code LIKE '%' + @SearchTerm + '%'
      OR l.trade_name LIKE '%' + @SearchTerm + '%')
    AND (@StatusFilter IS NULL OR l.status = @StatusFilter)
    AND (@EntityType IS NULL OR l.entity_type = @EntityType)
  ORDER BY l.lessee_name
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- sp_GetLesseeById
IF OBJECT_ID('sp_GetLesseeById', 'P') IS NOT NULL DROP PROCEDURE sp_GetLesseeById;
GO
CREATE PROCEDURE sp_GetLesseeById
  @LesseeId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT * FROM lessee.lessees WHERE lessee_id = @LesseeId;
  SELECT * FROM lessee.lessee_bank_accounts WHERE lessee_id = @LesseeId ORDER BY is_primary DESC, bank_account_id;
  SELECT * FROM lessee.lessee_signatories WHERE lessee_id = @LesseeId AND is_active = 1 ORDER BY signatory_id;
END
GO

-- sp_UpsertLessee
IF OBJECT_ID('sp_UpsertLessee', 'P') IS NOT NULL DROP PROCEDURE sp_UpsertLessee;
GO
CREATE PROCEDURE sp_UpsertLessee
  @LesseeId       INT = NULL,
  @LesseeCode     VARCHAR(30),
  @LesseeName     NVARCHAR(200),
  @TradeName      NVARCHAR(200) = NULL,
  @EntityType     VARCHAR(30),
  @ParentCompany  NVARCHAR(200) = NULL,
  @RegistrationNo VARCHAR(100) = NULL,
  @TaxVatNo       VARCHAR(100) = NULL,
  @IndustrySector NVARCHAR(100) = NULL,
  @CreditRating   VARCHAR(20) = NULL,
  @Country        VARCHAR(100),
  @City           NVARCHAR(100) = NULL,
  @Address        NVARCHAR(500) = NULL,
  @PoBox          VARCHAR(50) = NULL,
  @ContactPerson  NVARCHAR(200) = NULL,
  @ContactEmail   VARCHAR(200) = NULL,
  @ContactPhone   VARCHAR(50) = NULL,
  @Website        VARCHAR(200) = NULL,
  @Status         VARCHAR(20),
  @Notes          NVARCHAR(1000) = NULL,
  @CreatedBy      INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF @LesseeId IS NULL
  BEGIN
    INSERT INTO lessee.lessees (
      lessee_code, lessee_name, trade_name, entity_type, parent_company,
      registration_no, tax_vat_no, industry_sector, credit_rating,
      country, city, address, po_box, contact_person, contact_email,
      contact_phone, website, status, notes, created_by
    ) VALUES (
      @LesseeCode, @LesseeName, @TradeName, @EntityType, @ParentCompany,
      @RegistrationNo, @TaxVatNo, @IndustrySector, @CreditRating,
      @Country, @City, @Address, @PoBox, @ContactPerson, @ContactEmail,
      @ContactPhone, @Website, @Status, @Notes, @CreatedBy
    );
    SELECT SCOPE_IDENTITY() AS lessee_id;
  END
  ELSE
  BEGIN
    UPDATE lessee.lessees SET
      lessee_code = @LesseeCode, lessee_name = @LesseeName, trade_name = @TradeName,
      entity_type = @EntityType, parent_company = @ParentCompany,
      registration_no = @RegistrationNo, tax_vat_no = @TaxVatNo,
      industry_sector = @IndustrySector, credit_rating = @CreditRating,
      country = @Country, city = @City, address = @Address, po_box = @PoBox,
      contact_person = @ContactPerson, contact_email = @ContactEmail,
      contact_phone = @ContactPhone, website = @Website,
      status = @Status, notes = @Notes, updated_at = GETUTCDATE()
    WHERE lessee_id = @LesseeId;
    SELECT @LesseeId AS lessee_id;
  END
END
GO

-- sp_DeleteLessee
IF OBJECT_ID('sp_DeleteLessee', 'P') IS NOT NULL DROP PROCEDURE sp_DeleteLessee;
GO
CREATE PROCEDURE sp_DeleteLessee
  @LesseeId INT
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE lessee.lessees SET status = 'Inactive', updated_at = GETUTCDATE()
  WHERE lessee_id = @LesseeId;
END
GO

-- sp_UpsertLesseeBankAccount
IF OBJECT_ID('sp_UpsertLesseeBankAccount', 'P') IS NOT NULL DROP PROCEDURE sp_UpsertLesseeBankAccount;
GO
CREATE PROCEDURE sp_UpsertLesseeBankAccount
  @BankAccountId  INT = NULL,
  @LesseeId       INT,
  @BankName       NVARCHAR(200),
  @AccountName    NVARCHAR(200),
  @AccountNumber  VARCHAR(50),
  @IBAN           VARCHAR(50) = NULL,
  @SwiftBic       VARCHAR(20) = NULL,
  @Currency       CHAR(3) = 'QAR',
  @Branch         NVARCHAR(200) = NULL,
  @IsPrimary      BIT = 0
AS
BEGIN
  SET NOCOUNT ON;
  IF @IsPrimary = 1
    UPDATE lessee.lessee_bank_accounts SET is_primary = 0 WHERE lessee_id = @LesseeId;
  IF @BankAccountId IS NULL
    INSERT INTO lessee.lessee_bank_accounts (lessee_id, bank_name, account_name, account_number, iban, swift_bic, currency, branch, is_primary)
    VALUES (@LesseeId, @BankName, @AccountName, @AccountNumber, @IBAN, @SwiftBic, @Currency, @Branch, @IsPrimary);
  ELSE
    UPDATE lessee.lessee_bank_accounts SET
      bank_name = @BankName, account_name = @AccountName, account_number = @AccountNumber,
      iban = @IBAN, swift_bic = @SwiftBic, currency = @Currency, branch = @Branch, is_primary = @IsPrimary
    WHERE bank_account_id = @BankAccountId;
END
GO

-- sp_UpsertLesseeSignatory
IF OBJECT_ID('sp_UpsertLesseeSignatory', 'P') IS NOT NULL DROP PROCEDURE sp_UpsertLesseeSignatory;
GO
CREATE PROCEDURE sp_UpsertLesseeSignatory
  @SignatoryId    INT = NULL,
  @LesseeId       INT,
  @FullName       NVARCHAR(200),
  @Designation    NVARCHAR(200) = NULL,
  @Email          VARCHAR(200) = NULL,
  @Phone          VARCHAR(50) = NULL,
  @AuthorityLimit DECIMAL(18,2) = NULL,
  @IsActive       BIT = 1
AS
BEGIN
  SET NOCOUNT ON;
  IF @SignatoryId IS NULL
    INSERT INTO lessee.lessee_signatories (lessee_id, full_name, designation, email, phone, authority_limit, is_active)
    VALUES (@LesseeId, @FullName, @Designation, @Email, @Phone, @AuthorityLimit, @IsActive);
  ELSE
    UPDATE lessee.lessee_signatories SET
      full_name = @FullName, designation = @Designation, email = @Email,
      phone = @Phone, authority_limit = @AuthorityLimit, is_active = @IsActive
    WHERE signatory_id = @SignatoryId;
END
GO

-- sp_GetLesseeDropdown (for lease form dropdowns)
IF OBJECT_ID('sp_GetLesseeDropdown', 'P') IS NOT NULL DROP PROCEDURE sp_GetLesseeDropdown;
GO
CREATE PROCEDURE sp_GetLesseeDropdown
AS
BEGIN
  SET NOCOUNT ON;
  SELECT lessee_id, lessee_code, lessee_name, entity_type, status
  FROM lessee.lessees
  WHERE status = 'Active'
  ORDER BY lessee_name;
END
GO

-- ============================================================
-- SEED DATA — 5 Vodafone subsidiary variations
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM lessee.lessees WHERE lessee_code = 'VF-QA-001')
BEGIN
  INSERT INTO lessee.lessees (
    lessee_code, lessee_name, trade_name, entity_type, parent_company,
    registration_no, tax_vat_no, industry_sector, credit_rating,
    country, city, address, po_box, contact_person, contact_email,
    contact_phone, website, status, notes
  ) VALUES
  -- 1. Vodafone Qatar P.Q.S.C. — the main listed entity
  (
    'VF-QA-001',
    'Vodafone Qatar P.Q.S.C.',
    'Vodafone Qatar',
    'Company',
    'Vodafone Group Plc',
    'CR-00034567',
    'VAT-10023456789',
    'Telecommunications',
    'AA',
    'Qatar', 'Doha',
    'Vodafone Tower, Al Wahda Street, West Bay, Doha, Qatar',
    'P.O. Box 24444',
    'Ahmed Al-Mahmoud',
    'ahmed.almahmoud@vodafone.qa',
    '+974 4444 0000',
    'https://www.vodafone.qa',
    'Active',
    'Primary listed entity on Qatar Stock Exchange. Holds all telecom licences.'
  ),
  -- 2. Vodafone Qatar Business Solutions W.L.L. — B2B arm
  (
    'VF-QA-002',
    'Vodafone Qatar Business Solutions W.L.L.',
    'Vodafone Business Qatar',
    'Subsidiary',
    'Vodafone Qatar P.Q.S.C.',
    'CR-00078901',
    'VAT-10034567890',
    'Telecommunications',
    'AA',
    'Qatar', 'Doha',
    'Al Sadd Commercial Complex, Al Sadd Street, Doha, Qatar',
    'P.O. Box 24445',
    'Sara Al-Kuwari',
    'sara.alkuwari@vodafonebusiness.qa',
    '+974 4444 1100',
    'https://business.vodafone.qa',
    'Active',
    'Wholly-owned subsidiary handling enterprise and B2B accounts.'
  ),
  -- 3. Vodafone Qatar Retail LLC — retail stores operations
  (
    'VF-QA-003',
    'Vodafone Qatar Retail LLC',
    'Vodafone Stores Qatar',
    'Subsidiary',
    'Vodafone Qatar P.Q.S.C.',
    'CR-00091234',
    'VAT-10045678901',
    'Retail',
    'A+',
    'Qatar', 'Doha',
    'Villaggio Mall, Level 1, Al Waab Street, Doha, Qatar',
    'P.O. Box 24446',
    'Mohammed Al-Thani',
    'mohammed.althani@vodafoneretail.qa',
    '+974 4444 2200',
    'https://www.vodafone.qa/stores',
    'Active',
    'Manages all Vodafone branded retail outlets across Qatar.'
  ),
  -- 4. Vodafone International Holdings B.V. — Dutch holding company
  (
    'VF-INT-001',
    'Vodafone International Holdings B.V.',
    'Vodafone International',
    'JV',
    'Vodafone Group Plc',
    'KVK-34180173',
    'NL-VAT-NL820646660B01',
    'Telecommunications',
    'AAA',
    'Netherlands', 'Amsterdam',
    'Rivierstaete, Amsteldijk 166, 1079 LH Amsterdam, Netherlands',
    NULL,
    'Erik van der Berg',
    'erik.vandenberg@vodafone.com',
    '+31 20 555 9000',
    'https://www.vodafone.com',
    'Active',
    'Intermediate holding entity for Vodafone Group international investments including Qatar.'
  ),
  -- 5. Vodafone Qatar Infrastructure Services W.L.L. — towers & infra
  (
    'VF-QA-004',
    'Vodafone Qatar Infrastructure Services W.L.L.',
    'VF Infra Qatar',
    'Branch',
    'Vodafone Qatar P.Q.S.C.',
    'CR-00102345',
    'VAT-10056789012',
    'Infrastructure',
    'A',
    'Qatar', 'Doha',
    'Industrial Area, Street 40, Doha, Qatar',
    'P.O. Box 24447',
    'Khalid Al-Dosari',
    'khalid.aldosari@vfinfra.qa',
    '+974 4444 3300',
    NULL,
    'Active',
    'Manages tower infrastructure, data centres, and network facilities leased by Vodafone Qatar.'
  );
END
GO

-- Seed bank accounts for VF-QA-001
IF NOT EXISTS (SELECT 1 FROM lessee.lessee_bank_accounts WHERE lessee_id = (SELECT lessee_id FROM lessee.lessees WHERE lessee_code = 'VF-QA-001'))
BEGIN
  DECLARE @VfQa001 INT = (SELECT lessee_id FROM lessee.lessees WHERE lessee_code = 'VF-QA-001');
  INSERT INTO lessee.lessee_bank_accounts (lessee_id, bank_name, account_name, account_number, iban, swift_bic, currency, branch, is_primary)
  VALUES
    (@VfQa001, 'Qatar National Bank', 'Vodafone Qatar P.Q.S.C.', '0012345678901', 'QA58QNBA000000012345678901', 'QNBAQAQA', 'QAR', 'West Bay Branch', 1),
    (@VfQa001, 'Commercial Bank of Qatar', 'Vodafone Qatar P.Q.S.C.', '0098765432100', 'QA22CBQA000000098765432100', 'CBQAQAQA', 'USD', 'Doha Main Branch', 0);
END
GO

-- Seed signatories for VF-QA-001
IF NOT EXISTS (SELECT 1 FROM lessee.lessee_signatories WHERE lessee_id = (SELECT lessee_id FROM lessee.lessees WHERE lessee_code = 'VF-QA-001'))
BEGIN
  DECLARE @VfQa001Sig INT = (SELECT lessee_id FROM lessee.lessees WHERE lessee_code = 'VF-QA-001');
  INSERT INTO lessee.lessee_signatories (lessee_id, full_name, designation, email, phone, authority_limit, is_active)
  VALUES
    (@VfQa001Sig, 'Sheikh Hamad Al-Thani', 'Chief Executive Officer', 'ceo@vodafone.qa', '+974 5555 0001', 50000000.00, 1),
    (@VfQa001Sig, 'Fatima Al-Naimi', 'Chief Financial Officer', 'cfo@vodafone.qa', '+974 5555 0002', 25000000.00, 1),
    (@VfQa001Sig, 'Omar Al-Rashid', 'Head of Real Estate & Facilities', 'realestate@vodafone.qa', '+974 5555 0003', 5000000.00, 1);
END
GO
