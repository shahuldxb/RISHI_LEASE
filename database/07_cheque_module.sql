-- ============================================================
-- VodaLease Enterprise — Cheque Inventory Module
-- All DML via Stored Procedures (SPP pattern)
-- ============================================================

-- ── Schema ───────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'cheque')
  EXEC('CREATE SCHEMA cheque');
GO

-- ── Tables ───────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('cheque.bank_accounts'))
CREATE TABLE cheque.bank_accounts (
  account_id      INT IDENTITY(1,1) PRIMARY KEY,
  bank_name       NVARCHAR(100) NOT NULL,
  account_number  NVARCHAR(50)  NOT NULL UNIQUE,
  account_name    NVARCHAR(150) NOT NULL,
  currency        NCHAR(3)      NOT NULL DEFAULT 'USD',
  branch          NVARCHAR(100),
  swift_code      NVARCHAR(20),
  is_active       BIT           NOT NULL DEFAULT 1,
  created_at      DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
  updated_at      DATETIME2     NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('cheque.cheque_signatories'))
CREATE TABLE cheque.cheque_signatories (
  signatory_id    INT IDENTITY(1,1) PRIMARY KEY,
  user_name       NVARCHAR(100) NOT NULL,
  designation     NVARCHAR(100),
  authority_limit DECIMAL(18,2) NOT NULL DEFAULT 0,
  is_active       BIT           NOT NULL DEFAULT 1,
  created_at      DATETIME2     NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('cheque.cheque_books'))
CREATE TABLE cheque.cheque_books (
  book_id           INT IDENTITY(1,1) PRIMARY KEY,
  bank_account_id   INT           NOT NULL REFERENCES cheque.bank_accounts(account_id),
  book_number       NVARCHAR(50)  NOT NULL,
  series_from       NVARCHAR(20)  NOT NULL,
  series_to         NVARCHAR(20)  NOT NULL,
  total_leaves      INT           NOT NULL,
  issued_leaves     INT           NOT NULL DEFAULT 0,
  voided_leaves     INT           NOT NULL DEFAULT 0,
  available_leaves  AS (total_leaves - issued_leaves - voided_leaves) PERSISTED,
  status            NVARCHAR(20)  NOT NULL DEFAULT 'Active'
                    CHECK (status IN ('Active','Exhausted','Cancelled','Lost')),
  received_date     DATE          NOT NULL,
  screen_id         NVARCHAR(20),
  created_at        DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
  updated_at        DATETIME2     NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('cheque.cheque_register'))
CREATE TABLE cheque.cheque_register (
  cheque_id             INT IDENTITY(1,1) PRIMARY KEY,
  cheque_book_id        INT            NOT NULL REFERENCES cheque.cheque_books(book_id),
  cheque_number         NVARCHAR(20)   NOT NULL,
  bank_account_id       INT            NOT NULL REFERENCES cheque.bank_accounts(account_id),
  payee_name            NVARCHAR(200)  NOT NULL,
  lessor_id             INT,
  payment_run_id        INT,
  invoice_ref           NVARCHAR(50),
  amount                DECIMAL(18,2)  NOT NULL,
  currency              NCHAR(3)       NOT NULL DEFAULT 'USD',
  issue_date            DATE           NOT NULL,
  presented_date        DATE,
  cleared_date          DATE,
  bounced_date          DATE,
  voided_date           DATE,
  status                NVARCHAR(20)   NOT NULL DEFAULT 'Issued'
                        CHECK (status IN ('In Stock','Issued','Presented','Cleared','Bounced','Void','Stale','Replaced')),
  signature_type        NVARCHAR(10)   NOT NULL DEFAULT 'Single'
                        CHECK (signature_type IN ('Single','Dual')),
  signatory_1_id        INT            REFERENCES cheque.cheque_signatories(signatory_id),
  signatory_2_id        INT            REFERENCES cheque.cheque_signatories(signatory_id),
  void_reason           NVARCHAR(500),
  bounce_reason         NVARCHAR(500),
  bounce_fee            DECIMAL(18,2)  DEFAULT 0,
  replacement_cheque_id INT,
  original_cheque_id    INT,
  gl_posted             BIT            NOT NULL DEFAULT 0,
  gl_transit_ref        NVARCHAR(50),
  gl_cleared_ref        NVARCHAR(50),
  remarks               NVARCHAR(1000),
  screen_id             NVARCHAR(20),
  audit_no              NVARCHAR(20),
  created_by            NVARCHAR(100),
  created_at            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  updated_at            DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ── Seed bank accounts ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM cheque.bank_accounts WHERE account_number = 'ACC-001-MAIN')
INSERT INTO cheque.bank_accounts (bank_name, account_number, account_name, currency, branch, swift_code)
VALUES
  ('Standard Chartered Bank', 'ACC-001-MAIN',  'Vodafone Main Operating Account',   'USD', 'Head Office', 'SCBLUS33'),
  ('Barclays Bank',           'ACC-002-OPEX',  'Vodafone OPEX Disbursement Account', 'USD', 'City Branch',  'BARCGB22'),
  ('Stanbic Bank',            'ACC-003-LOCAL', 'Vodafone Local Currency Account',    'GHS', 'Accra Main',   'SBICGHAC');
GO

-- ── Seed signatories ──────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM cheque.cheque_signatories WHERE user_name = 'CFO')
INSERT INTO cheque.cheque_signatories (user_name, designation, authority_limit)
VALUES
  ('CFO',              'Chief Financial Officer',       9999999.00),
  ('Finance Director', 'Finance Director',              500000.00),
  ('Treasury Manager', 'Treasury Manager',              100000.00),
  ('Finance Manager',  'Finance Manager',                50000.00);
GO

-- ── Seed screen registry for cheque module ────────────────────
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id = 'VFCHQDASH0001P001')
INSERT INTO security.screen_registry (screen_id, screen_name, module, description, is_active)
VALUES
  ('VFCHQDASH0001P001',  'Cheque Dashboard',         'Cheque',  'Cheque inventory KPI dashboard',             1),
  ('VFCHQBOOK0001P001',  'Cheque Book Register',      'Cheque',  'Register and manage cheque books',           1),
  ('VFCHQREG0001P001',   'Cheque Register',           'Cheque',  'Full cheque issuance register',              1),
  ('VFCHQISS0001P001',   'Issue Cheque',              'Cheque',  'Issue a new cheque to a lessor',             1),
  ('VFCHQDET0001P001',   'Cheque Detail',             'Cheque',  'Full cheque lifecycle and GL detail',        1),
  ('VFCHQBNC0001P001',   'Bounce Handling',           'Cheque',  'Record and handle bounced cheques',          1),
  ('VFCHQVOID0001P001',  'Void / Stop Payment',       'Cheque',  'Void a cheque and reverse GL',               1),
  ('VFCHQSTALE0001P001', 'Stale Cheque Alerts',       'Cheque',  'Cheques not presented within 90 days',      1),
  ('VFCHQSIGN0001P001',  'Signatory Management',      'Cheque',  'Manage authorised cheque signatories',       1);
GO

-- ============================================================
-- STORED PROCEDURES
-- ============================================================

-- ── sp_GetBankAccountsForCheque ───────────────────────────────
IF OBJECT_ID('dbo.sp_GetBankAccountsForCheque', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetBankAccountsForCheque;
GO
CREATE PROCEDURE dbo.sp_GetBankAccountsForCheque
  @IsActive BIT = 1
AS
BEGIN
  SET NOCOUNT ON;
  SELECT account_id, bank_name, account_number, account_name, currency, branch, swift_code, is_active
  FROM cheque.bank_accounts
  WHERE (@IsActive IS NULL OR is_active = @IsActive)
  ORDER BY bank_name;
END;
GO

-- ── sp_GetChequeBooks ─────────────────────────────────────────
IF OBJECT_ID('dbo.sp_GetChequeBooks', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetChequeBooks;
GO
CREATE PROCEDURE dbo.sp_GetChequeBooks
  @BankAccountId INT = NULL,
  @Status        NVARCHAR(20) = NULL,
  @PageNumber    INT = 1,
  @PageSize      INT = 20
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    cb.book_id, cb.book_number, cb.series_from, cb.series_to,
    cb.total_leaves, cb.issued_leaves, cb.voided_leaves, cb.available_leaves,
    cb.status, cb.received_date,
    ba.bank_name, ba.account_number, ba.account_name, ba.currency,
    COUNT(*) OVER() AS total_count
  FROM cheque.cheque_books cb
  JOIN cheque.bank_accounts ba ON ba.account_id = cb.bank_account_id
  WHERE (@BankAccountId IS NULL OR cb.bank_account_id = @BankAccountId)
    AND (@Status IS NULL OR cb.status = @Status)
  ORDER BY cb.received_date DESC
  OFFSET (@PageNumber - 1) * @PageSize ROWS
  FETCH NEXT @PageSize ROWS ONLY;
END;
GO

-- ── sp_CreateChequeBook ───────────────────────────────────────
IF OBJECT_ID('dbo.sp_CreateChequeBook', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_CreateChequeBook;
GO
CREATE PROCEDURE dbo.sp_CreateChequeBook
  @BankAccountId INT,
  @BookNumber    NVARCHAR(50),
  @SeriesFrom    NVARCHAR(20),
  @SeriesTo      NVARCHAR(20),
  @ReceivedDate  DATE,
  @ScreenId      NVARCHAR(20) = 'VFCHQBOOK0001P001',
  @CreatedBy     NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @TotalLeaves INT = CAST(@SeriesTo AS BIGINT) - CAST(@SeriesFrom AS BIGINT) + 1;
  INSERT INTO cheque.cheque_books (bank_account_id, book_number, series_from, series_to, total_leaves, received_date, screen_id)
  VALUES (@BankAccountId, @BookNumber, @SeriesFrom, @SeriesTo, @TotalLeaves, @ReceivedDate, @ScreenId);
  SELECT SCOPE_IDENTITY() AS book_id, @TotalLeaves AS total_leaves;
END;
GO

-- ── sp_GetNextAvailableCheque ─────────────────────────────────
IF OBJECT_ID('dbo.sp_GetNextAvailableCheque', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetNextAvailableCheque;
GO
CREATE PROCEDURE dbo.sp_GetNextAvailableCheque
  @BankAccountId INT
AS
BEGIN
  SET NOCOUNT ON;
  -- Find the active book with available leaves
  SELECT TOP 1
    cb.book_id, cb.book_number, cb.series_from, cb.series_to, cb.available_leaves,
    ba.bank_name, ba.account_number, ba.currency,
    -- Next cheque number = series_from + issued_leaves (zero-padded to same length as series_from)
    RIGHT(REPLICATE('0', LEN(cb.series_from)) + CAST(CAST(cb.series_from AS BIGINT) + cb.issued_leaves AS NVARCHAR(20)), LEN(cb.series_from)) AS next_cheque_number
  FROM cheque.cheque_books cb
  JOIN cheque.bank_accounts ba ON ba.account_id = cb.bank_account_id
  WHERE cb.bank_account_id = @BankAccountId
    AND cb.status = 'Active'
    AND cb.available_leaves > 0
  ORDER BY cb.received_date ASC;
END;
GO

-- ── sp_IssueCheque ────────────────────────────────────────────
IF OBJECT_ID('dbo.sp_IssueCheque', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_IssueCheque;
GO
CREATE PROCEDURE dbo.sp_IssueCheque
  @ChequeBookId   INT,
  @ChequeNumber   NVARCHAR(20),
  @BankAccountId  INT,
  @PayeeName      NVARCHAR(200),
  @LessorId       INT = NULL,
  @InvoiceRef     NVARCHAR(50) = NULL,
  @Amount         DECIMAL(18,2),
  @Currency       NCHAR(3) = 'USD',
  @IssueDate      DATE,
  @SignatureType  NVARCHAR(10) = 'Single',
  @Signatory1Id   INT = NULL,
  @Signatory2Id   INT = NULL,
  @Remarks        NVARCHAR(1000) = NULL,
  @ScreenId       NVARCHAR(20) = 'VFCHQISS0001P001',
  @CreatedBy      NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRANSACTION;
  BEGIN TRY
    -- Validate cheque book has leaves
    IF NOT EXISTS (SELECT 1 FROM cheque.cheque_books WHERE book_id = @ChequeBookId AND available_leaves > 0 AND status = 'Active')
      THROW 50001, 'No available leaves in this cheque book.', 1;

    -- Validate cheque number not already used
    IF EXISTS (SELECT 1 FROM cheque.cheque_register WHERE cheque_number = @ChequeNumber AND bank_account_id = @BankAccountId)
      THROW 50002, 'Cheque number already issued from this account.', 1;

    DECLARE @AuditNo NVARCHAR(20) = 'AUD-' + FORMAT(GETUTCDATE(),'yyyy') + '-' + RIGHT('000000' + CAST(NEXT VALUE FOR sys.identity_cache AS NVARCHAR), 6);

    INSERT INTO cheque.cheque_register (
      cheque_book_id, cheque_number, bank_account_id, payee_name, lessor_id,
      invoice_ref, amount, currency, issue_date, status,
      signature_type, signatory_1_id, signatory_2_id, remarks,
      screen_id, audit_no, created_by
    ) VALUES (
      @ChequeBookId, @ChequeNumber, @BankAccountId, @PayeeName, @LessorId,
      @InvoiceRef, @Amount, @Currency, @IssueDate, 'Issued',
      @SignatureType, @Signatory1Id, @Signatory2Id, @Remarks,
      @ScreenId, @AuditNo, @CreatedBy
    );

    -- Update book issued_leaves count
    UPDATE cheque.cheque_books
    SET issued_leaves = issued_leaves + 1,
        status = CASE WHEN (available_leaves - 1) = 0 THEN 'Exhausted' ELSE status END,
        updated_at = GETUTCDATE()
    WHERE book_id = @ChequeBookId;

    SELECT SCOPE_IDENTITY() AS cheque_id, @AuditNo AS audit_no;
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO

-- ── sp_PresentCheque ─────────────────────────────────────────
IF OBJECT_ID('dbo.sp_PresentCheque', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_PresentCheque;
GO
CREATE PROCEDURE dbo.sp_PresentCheque
  @ChequeId       INT,
  @PresentedDate  DATE,
  @UpdatedBy      NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE cheque.cheque_register
  SET status = 'Presented', presented_date = @PresentedDate, updated_at = GETUTCDATE()
  WHERE cheque_id = @ChequeId AND status = 'Issued';
  SELECT @@ROWCOUNT AS rows_affected;
END;
GO

-- ── sp_ClearCheque ────────────────────────────────────────────
IF OBJECT_ID('dbo.sp_ClearCheque', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ClearCheque;
GO
CREATE PROCEDURE dbo.sp_ClearCheque
  @ChequeId     INT,
  @ClearedDate  DATE,
  @GlClearedRef NVARCHAR(50) = NULL,
  @UpdatedBy    NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE cheque.cheque_register
  SET status = 'Cleared', cleared_date = @ClearedDate,
      gl_cleared_ref = @GlClearedRef, updated_at = GETUTCDATE()
  WHERE cheque_id = @ChequeId AND status IN ('Issued','Presented');
  SELECT @@ROWCOUNT AS rows_affected;
END;
GO

-- ── sp_BounceCheque ───────────────────────────────────────────
IF OBJECT_ID('dbo.sp_BounceCheque', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_BounceCheque;
GO
CREATE PROCEDURE dbo.sp_BounceCheque
  @ChequeId     INT,
  @BouncedDate  DATE,
  @BounceReason NVARCHAR(500),
  @BounceFee    DECIMAL(18,2) = 0,
  @UpdatedBy    NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE cheque.cheque_register
  SET status = 'Bounced', bounced_date = @BouncedDate,
      bounce_reason = @BounceReason, bounce_fee = @BounceFee,
      updated_at = GETUTCDATE()
  WHERE cheque_id = @ChequeId AND status IN ('Issued','Presented');
  SELECT @@ROWCOUNT AS rows_affected;
END;
GO

-- ── sp_VoidCheque ─────────────────────────────────────────────
IF OBJECT_ID('dbo.sp_VoidCheque', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_VoidCheque;
GO
CREATE PROCEDURE dbo.sp_VoidCheque
  @ChequeId   INT,
  @VoidReason NVARCHAR(500),
  @UpdatedBy  NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRANSACTION;
  BEGIN TRY
    UPDATE cheque.cheque_register
    SET status = 'Void', voided_date = CAST(GETUTCDATE() AS DATE),
        void_reason = @VoidReason, updated_at = GETUTCDATE()
    WHERE cheque_id = @ChequeId AND status IN ('Issued','Presented','Bounced');

    -- Increment voided_leaves in the book
    UPDATE cb SET voided_leaves = voided_leaves + 1, updated_at = GETUTCDATE()
    FROM cheque.cheque_books cb
    JOIN cheque.cheque_register cr ON cr.cheque_book_id = cb.book_id
    WHERE cr.cheque_id = @ChequeId;

    SELECT @@ROWCOUNT AS rows_affected;
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO

-- ── sp_ReissueCheque ──────────────────────────────────────────
IF OBJECT_ID('dbo.sp_ReissueCheque', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ReissueCheque;
GO
CREATE PROCEDURE dbo.sp_ReissueCheque
  @OriginalChequeId INT,
  @NewChequeBookId  INT,
  @NewChequeNumber  NVARCHAR(20),
  @IssueDate        DATE,
  @Signatory1Id     INT = NULL,
  @Signatory2Id     INT = NULL,
  @SignatureType    NVARCHAR(10) = 'Single',
  @CreatedBy        NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRANSACTION;
  BEGIN TRY
    -- Get original cheque details
    DECLARE @PayeeName NVARCHAR(200), @LessorId INT, @Amount DECIMAL(18,2),
            @Currency NCHAR(3), @InvoiceRef NVARCHAR(50), @BankAccountId INT;

    SELECT @PayeeName = payee_name, @LessorId = lessor_id, @Amount = amount,
           @Currency = currency, @InvoiceRef = invoice_ref, @BankAccountId = bank_account_id
    FROM cheque.cheque_register WHERE cheque_id = @OriginalChequeId;

    -- Issue replacement
    DECLARE @AuditNo NVARCHAR(20) = 'AUD-' + FORMAT(GETUTCDATE(),'yyyy') + '-RPL-' + CAST(@OriginalChequeId AS NVARCHAR);

    INSERT INTO cheque.cheque_register (
      cheque_book_id, cheque_number, bank_account_id, payee_name, lessor_id,
      invoice_ref, amount, currency, issue_date, status,
      signature_type, signatory_1_id, signatory_2_id,
      original_cheque_id, screen_id, audit_no, created_by
    ) VALUES (
      @NewChequeBookId, @NewChequeNumber, @BankAccountId, @PayeeName, @LessorId,
      @InvoiceRef, @Amount, @Currency, @IssueDate, 'Issued',
      @SignatureType, @Signatory1Id, @Signatory2Id,
      @OriginalChequeId, 'VFCHQBNC0001P001', @AuditNo, @CreatedBy
    );

    DECLARE @NewChequeId INT = SCOPE_IDENTITY();

    -- Link replacement back to original
    UPDATE cheque.cheque_register
    SET replacement_cheque_id = @NewChequeId, status = 'Replaced', updated_at = GETUTCDATE()
    WHERE cheque_id = @OriginalChequeId;

    -- Update book leaf count
    UPDATE cheque.cheque_books
    SET issued_leaves = issued_leaves + 1,
        status = CASE WHEN (available_leaves - 1) = 0 THEN 'Exhausted' ELSE status END,
        updated_at = GETUTCDATE()
    WHERE book_id = @NewChequeBookId;

    SELECT @NewChequeId AS new_cheque_id, @AuditNo AS audit_no;
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO

-- ── sp_GetChequeRegister ──────────────────────────────────────
IF OBJECT_ID('dbo.sp_GetChequeRegister', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetChequeRegister;
GO
CREATE PROCEDURE dbo.sp_GetChequeRegister
  @BankAccountId INT = NULL,
  @Status        NVARCHAR(20) = NULL,
  @LessorId      INT = NULL,
  @DateFrom      DATE = NULL,
  @DateTo        DATE = NULL,
  @Search        NVARCHAR(100) = NULL,
  @PageNumber    INT = 1,
  @PageSize      INT = 20
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    cr.cheque_id, cr.cheque_number, cr.payee_name, cr.amount, cr.currency,
    cr.issue_date, cr.presented_date, cr.cleared_date, cr.bounced_date, cr.voided_date,
    cr.status, cr.signature_type, cr.invoice_ref, cr.bounce_reason, cr.void_reason,
    cr.bounce_fee, cr.gl_posted, cr.audit_no, cr.remarks,
    ba.bank_name, ba.account_number,
    cb.book_number,
    s1.user_name AS signatory_1_name,
    s2.user_name AS signatory_2_name,
    cr.replacement_cheque_id, cr.original_cheque_id,
    COUNT(*) OVER() AS total_count
  FROM cheque.cheque_register cr
  JOIN cheque.bank_accounts ba ON ba.account_id = cr.bank_account_id
  JOIN cheque.cheque_books cb ON cb.book_id = cr.cheque_book_id
  LEFT JOIN cheque.cheque_signatories s1 ON s1.signatory_id = cr.signatory_1_id
  LEFT JOIN cheque.cheque_signatories s2 ON s2.signatory_id = cr.signatory_2_id
  WHERE (@BankAccountId IS NULL OR cr.bank_account_id = @BankAccountId)
    AND (@Status IS NULL OR cr.status = @Status)
    AND (@LessorId IS NULL OR cr.lessor_id = @LessorId)
    AND (@DateFrom IS NULL OR cr.issue_date >= @DateFrom)
    AND (@DateTo IS NULL OR cr.issue_date <= @DateTo)
    AND (@Search IS NULL OR cr.cheque_number LIKE '%' + @Search + '%'
         OR cr.payee_name LIKE '%' + @Search + '%'
         OR cr.invoice_ref LIKE '%' + @Search + '%')
  ORDER BY cr.issue_date DESC, cr.cheque_id DESC
  OFFSET (@PageNumber - 1) * @PageSize ROWS
  FETCH NEXT @PageSize ROWS ONLY;
END;
GO

-- ── sp_GetChequeById ──────────────────────────────────────────
IF OBJECT_ID('dbo.sp_GetChequeById', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetChequeById;
GO
CREATE PROCEDURE dbo.sp_GetChequeById
  @ChequeId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    cr.*, ba.bank_name, ba.account_number, ba.account_name,
    cb.book_number, cb.series_from, cb.series_to,
    s1.user_name AS signatory_1_name, s1.designation AS signatory_1_designation,
    s2.user_name AS signatory_2_name, s2.designation AS signatory_2_designation
  FROM cheque.cheque_register cr
  JOIN cheque.bank_accounts ba ON ba.account_id = cr.bank_account_id
  JOIN cheque.cheque_books cb ON cb.book_id = cr.cheque_book_id
  LEFT JOIN cheque.cheque_signatories s1 ON s1.signatory_id = cr.signatory_1_id
  LEFT JOIN cheque.cheque_signatories s2 ON s2.signatory_id = cr.signatory_2_id
  WHERE cr.cheque_id = @ChequeId;
END;
GO

-- ── sp_GetChequeInventorySummary ──────────────────────────────
IF OBJECT_ID('dbo.sp_GetChequeInventorySummary', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetChequeInventorySummary;
GO
CREATE PROCEDURE dbo.sp_GetChequeInventorySummary
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    SUM(CASE WHEN status = 'Issued'    THEN 1 ELSE 0 END) AS total_issued,
    SUM(CASE WHEN status = 'Presented' THEN 1 ELSE 0 END) AS total_presented,
    SUM(CASE WHEN status = 'Cleared'   THEN 1 ELSE 0 END) AS total_cleared,
    SUM(CASE WHEN status = 'Bounced'   THEN 1 ELSE 0 END) AS total_bounced,
    SUM(CASE WHEN status = 'Void'      THEN 1 ELSE 0 END) AS total_voided,
    SUM(CASE WHEN status = 'Replaced'  THEN 1 ELSE 0 END) AS total_replaced,
    SUM(CASE WHEN status = 'Issued' AND issue_date <= DATEADD(DAY,-90,CAST(GETUTCDATE() AS DATE)) THEN 1 ELSE 0 END) AS total_stale,
    SUM(CASE WHEN status IN ('Issued','Presented') THEN amount ELSE 0 END) AS total_in_transit_amount,
    SUM(CASE WHEN status = 'Bounced' THEN bounce_fee ELSE 0 END) AS total_bounce_fees,
    COUNT(*) AS total_cheques
  FROM cheque.cheque_register;

  -- Book inventory summary
  SELECT
    ba.bank_name, ba.account_number,
    SUM(cb.total_leaves) AS total_leaves,
    SUM(cb.issued_leaves) AS issued_leaves,
    SUM(cb.available_leaves) AS available_leaves,
    SUM(cb.voided_leaves) AS voided_leaves,
    COUNT(cb.book_id) AS total_books,
    SUM(CASE WHEN cb.status = 'Active' THEN 1 ELSE 0 END) AS active_books
  FROM cheque.bank_accounts ba
  LEFT JOIN cheque.cheque_books cb ON cb.bank_account_id = ba.account_id
  WHERE ba.is_active = 1
  GROUP BY ba.account_id, ba.bank_name, ba.account_number;
END;
GO

-- ── sp_GetStaleCheques ────────────────────────────────────────
IF OBJECT_ID('dbo.sp_GetStaleCheques', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetStaleCheques;
GO
CREATE PROCEDURE dbo.sp_GetStaleCheques
  @StaleDays INT = 90
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    cr.cheque_id, cr.cheque_number, cr.payee_name, cr.amount, cr.currency,
    cr.issue_date, cr.status,
    DATEDIFF(DAY, cr.issue_date, CAST(GETUTCDATE() AS DATE)) AS days_outstanding,
    ba.bank_name, ba.account_number
  FROM cheque.cheque_register cr
  JOIN cheque.bank_accounts ba ON ba.account_id = cr.bank_account_id
  WHERE cr.status = 'Issued'
    AND cr.issue_date <= DATEADD(DAY, -@StaleDays, CAST(GETUTCDATE() AS DATE))
  ORDER BY cr.issue_date ASC;
END;
GO

-- ── sp_GetSignatories ─────────────────────────────────────────
IF OBJECT_ID('dbo.sp_GetSignatories', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetSignatories;
GO
CREATE PROCEDURE dbo.sp_GetSignatories
  @IsActive BIT = 1
AS
BEGIN
  SET NOCOUNT ON;
  SELECT signatory_id, user_name, designation, authority_limit, is_active
  FROM cheque.cheque_signatories
  WHERE (@IsActive IS NULL OR is_active = @IsActive)
  ORDER BY authority_limit DESC;
END;
GO

-- ── sp_UpsertSignatory ────────────────────────────────────────
IF OBJECT_ID('dbo.sp_UpsertSignatory', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_UpsertSignatory;
GO
CREATE PROCEDURE dbo.sp_UpsertSignatory
  @SignatoryId    INT = NULL,
  @UserName       NVARCHAR(100),
  @Designation    NVARCHAR(100),
  @AuthorityLimit DECIMAL(18,2),
  @IsActive       BIT = 1
AS
BEGIN
  SET NOCOUNT ON;
  IF @SignatoryId IS NULL OR @SignatoryId = 0
  BEGIN
    INSERT INTO cheque.cheque_signatories (user_name, designation, authority_limit, is_active)
    VALUES (@UserName, @Designation, @AuthorityLimit, @IsActive);
    SELECT SCOPE_IDENTITY() AS signatory_id;
  END
  ELSE
  BEGIN
    UPDATE cheque.cheque_signatories
    SET user_name = @UserName, designation = @Designation,
        authority_limit = @AuthorityLimit, is_active = @IsActive
    WHERE signatory_id = @SignatoryId;
    SELECT @SignatoryId AS signatory_id;
  END;
END;
GO

PRINT 'Cheque Inventory Module — All objects created successfully.';
GO
