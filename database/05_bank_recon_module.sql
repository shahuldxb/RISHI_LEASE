-- ============================================================
-- VodaLease Enterprise — Bank Account Reconciliation Module
-- Auto-Matching Engine with configurable rules
-- All DML via Stored Procedures (SPP pattern)
-- ============================================================

-- ── SCHEMA ──────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'bank')
    EXEC('CREATE SCHEMA bank');
GO

-- ── TABLES ──────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='bank_accounts' AND schema_id=SCHEMA_ID('bank'))
CREATE TABLE bank.bank_accounts (
    account_id          INT IDENTITY(1,1) PRIMARY KEY,
    account_ref         VARCHAR(30) NOT NULL UNIQUE,  -- BNK-YYYY-NNNNNN
    bank_name           NVARCHAR(200) NOT NULL,
    account_name        NVARCHAR(200) NOT NULL,
    account_number      VARCHAR(50) NOT NULL,
    iban                VARCHAR(34),
    swift_bic           VARCHAR(11),
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    account_type        VARCHAR(30) DEFAULT 'Current',  -- Current, Savings, Escrow
    gl_account          VARCHAR(10),                    -- Linked GL account code
    current_balance     DECIMAL(18,2) DEFAULT 0,
    last_recon_date     DATE,
    last_statement_date DATE,
    status              VARCHAR(20) DEFAULT 'Active',
    created_by          INT,
    created_at          DATETIME2 DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='bank_statements' AND schema_id=SCHEMA_ID('bank'))
CREATE TABLE bank.bank_statements (
    statement_id        INT IDENTITY(1,1) PRIMARY KEY,
    statement_ref       VARCHAR(30) NOT NULL UNIQUE,   -- STM-YYYY-NNNNNN
    account_id          INT NOT NULL,
    statement_date      DATE NOT NULL,
    period_from         DATE NOT NULL,
    period_to           DATE NOT NULL,
    opening_balance     DECIMAL(18,2) NOT NULL,
    closing_balance     DECIMAL(18,2) NOT NULL,
    total_debits        DECIMAL(18,2) DEFAULT 0,
    total_credits       DECIMAL(18,2) DEFAULT 0,
    transaction_count   INT DEFAULT 0,
    file_format         VARCHAR(10),                   -- MT940, CSV, OFX, Manual
    storage_key         VARCHAR(500),
    imported_by         INT,
    imported_at         DATETIME2 DEFAULT GETUTCDATE(),
    status              VARCHAR(20) DEFAULT 'Imported', -- Imported, InRecon, Reconciled
    CONSTRAINT fk_bs_account FOREIGN KEY (account_id) REFERENCES bank.bank_accounts(account_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='bank_transactions' AND schema_id=SCHEMA_ID('bank'))
CREATE TABLE bank.bank_transactions (
    txn_id              INT IDENTITY(1,1) PRIMARY KEY,
    statement_id        INT NOT NULL,
    account_id          INT NOT NULL,
    txn_date            DATE NOT NULL,
    value_date          DATE,
    txn_type            CHAR(1) NOT NULL,              -- D=Debit, C=Credit
    amount              DECIMAL(18,2) NOT NULL,
    currency            CHAR(3) NOT NULL,
    narrative           NVARCHAR(500),
    reference           VARCHAR(200),
    counterparty        NVARCHAR(200),
    bank_ref            VARCHAR(100),                  -- Bank's own transaction reference
    recon_status        VARCHAR(20) DEFAULT 'Unmatched', -- Unmatched, Matched, ManualMatch, Exception, Excluded
    match_id            INT,                           -- FK to recon_matches
    match_confidence    DECIMAL(5,2),
    match_method        VARCHAR(30),                   -- ExactAmount, RefMatch, Tolerance, Aggregated, Split, AIAssisted
    imported_at         DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT fk_bt_statement FOREIGN KEY (statement_id) REFERENCES bank.bank_statements(statement_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='recon_sessions' AND schema_id=SCHEMA_ID('bank'))
CREATE TABLE bank.recon_sessions (
    session_id          INT IDENTITY(1,1) PRIMARY KEY,
    session_ref         VARCHAR(30) NOT NULL UNIQUE,   -- REC-YYYY-NNNNNN
    account_id          INT NOT NULL,
    statement_id        INT NOT NULL,
    period_from         DATE NOT NULL,
    period_to           DATE NOT NULL,
    opening_balance     DECIMAL(18,2) NOT NULL,
    closing_balance_bank DECIMAL(18,2) NOT NULL,
    closing_balance_gl  DECIMAL(18,2),
    difference          DECIMAL(18,2),
    total_bank_txns     INT DEFAULT 0,
    matched_count       INT DEFAULT 0,
    unmatched_bank      INT DEFAULT 0,
    unmatched_gl        INT DEFAULT 0,
    exceptions_count    INT DEFAULT 0,
    auto_match_run_at   DATETIME2,
    status              VARCHAR(20) DEFAULT 'Open',    -- Open, InProgress, PendingApproval, Closed
    maker_id            INT,
    checker_id          INT,
    closed_at           DATETIME2,
    gl_journal_ref      VARCHAR(30),
    screen_id           VARCHAR(20),
    created_at          DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT fk_rs_account FOREIGN KEY (account_id) REFERENCES bank.bank_accounts(account_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='recon_matches' AND schema_id=SCHEMA_ID('bank'))
CREATE TABLE bank.recon_matches (
    match_id            INT IDENTITY(1,1) PRIMARY KEY,
    session_id          INT NOT NULL,
    match_ref           VARCHAR(30) NOT NULL,          -- MCH-YYYY-NNNNNN
    match_type          VARCHAR(20) NOT NULL,          -- OneToOne, OneToMany, ManyToOne, ManyToMany
    match_method        VARCHAR(30) NOT NULL,          -- ExactAmount, RefMatch, Tolerance, Aggregated, Split, AIAssisted, Manual
    confidence_score    DECIMAL(5,2) NOT NULL DEFAULT 100,
    bank_txn_ids        NVARCHAR(500) NOT NULL,        -- JSON array of bank_transactions.txn_id
    gl_entry_ids        NVARCHAR(500) NOT NULL,        -- JSON array of GL entry IDs
    bank_amount         DECIMAL(18,2) NOT NULL,
    gl_amount           DECIMAL(18,2) NOT NULL,
    difference          DECIMAL(18,2) DEFAULT 0,
    tolerance_applied   BIT DEFAULT 0,
    matched_by          INT,                           -- NULL = auto, user_id = manual
    matched_at          DATETIME2 DEFAULT GETUTCDATE(),
    status              VARCHAR(20) DEFAULT 'Accepted', -- Proposed, Accepted, Rejected
    notes               NVARCHAR(500),
    CONSTRAINT fk_rm_session FOREIGN KEY (session_id) REFERENCES bank.recon_sessions(session_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='recon_exceptions' AND schema_id=SCHEMA_ID('bank'))
CREATE TABLE bank.recon_exceptions (
    exception_id        INT IDENTITY(1,1) PRIMARY KEY,
    session_id          INT NOT NULL,
    exception_ref       VARCHAR(30) NOT NULL,
    exception_type      VARCHAR(30) NOT NULL,          -- BankOnly, GLOnly, AmountDiff, DuplicateBank, DuplicateGL
    bank_txn_id         INT,
    gl_entry_id         INT,
    bank_amount         DECIMAL(18,2),
    gl_amount           DECIMAL(18,2),
    difference          DECIMAL(18,2),
    description         NVARCHAR(500),
    resolution          VARCHAR(30) DEFAULT 'Pending', -- Pending, Matched, Journalised, Excluded, Escalated
    resolved_by         INT,
    resolved_at         DATETIME2,
    resolution_notes    NVARCHAR(500),
    created_at          DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT fk_re_session FOREIGN KEY (session_id) REFERENCES bank.recon_sessions(session_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='recon_rules' AND schema_id=SCHEMA_ID('bank'))
CREATE TABLE bank.recon_rules (
    rule_id             INT IDENTITY(1,1) PRIMARY KEY,
    rule_name           VARCHAR(100) NOT NULL,
    rule_type           VARCHAR(30) NOT NULL,          -- ExactAmount, RefMatch, Tolerance, Aggregated, Split, AIAssisted
    priority            INT NOT NULL DEFAULT 10,       -- Lower = higher priority
    is_active           BIT DEFAULT 1,
    date_tolerance_days INT DEFAULT 3,
    amount_tolerance    DECIMAL(18,2) DEFAULT 0,
    amount_tolerance_pct DECIMAL(5,2) DEFAULT 0,
    ref_pattern         NVARCHAR(200),                 -- Regex pattern for reference matching
    min_confidence      DECIMAL(5,2) DEFAULT 80,
    auto_accept_threshold DECIMAL(5,2) DEFAULT 95,     -- Auto-accept if confidence >= this
    description         NVARCHAR(500),
    created_by          INT,
    updated_at          DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- ── SEQUENCES ────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name='bank_seq' AND schema_id=SCHEMA_ID('bank'))
    CREATE SEQUENCE bank.bank_seq START WITH 1 INCREMENT BY 1;
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name='stmt_seq' AND schema_id=SCHEMA_ID('bank'))
    CREATE SEQUENCE bank.stmt_seq START WITH 1 INCREMENT BY 1;
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name='recon_seq' AND schema_id=SCHEMA_ID('bank'))
    CREATE SEQUENCE bank.recon_seq START WITH 1 INCREMENT BY 1;
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name='match_seq' AND schema_id=SCHEMA_ID('bank'))
    CREATE SEQUENCE bank.match_seq START WITH 1 INCREMENT BY 1;
GO

-- ── SEED DEFAULT MATCHING RULES ──────────────────────────────
IF NOT EXISTS (SELECT 1 FROM bank.recon_rules WHERE rule_type='ExactAmount')
INSERT INTO bank.recon_rules (rule_name, rule_type, priority, date_tolerance_days, amount_tolerance, amount_tolerance_pct, auto_accept_threshold, description)
VALUES
('Exact Amount & Date',   'ExactAmount',  1, 3,    0,    0,    99, 'Bank amount exactly equals GL amount within 3 days'),
('Reference Match',       'RefMatch',     2, 5,    0,    0,    95, 'Bank narrative contains payment run ref or invoice ref'),
('Amount Tolerance',      'Tolerance',    3, 3,    0.50, 0,    85, 'Amount within 0.50 absolute tolerance'),
('Percentage Tolerance',  'Tolerance',    4, 3,    0,    0.01, 80, 'Amount within 1% tolerance'),
('Aggregated Match',      'Aggregated',   5, 5,    0,    0,    90, 'One bank line matches sum of multiple GL lines'),
('Split Match',           'Split',        6, 5,    0,    0,    90, 'One GL line matches multiple bank lines'),
('AI Narrative Match',    'AIAssisted',   7, 7,    0,    0.02, 75, 'GPT-4o analyses narrative for fuzzy lessor name match');
GO

-- ── REGISTER SCREENS ─────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKACCREG0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFBNKACCREG0001P001','Bank Account Register','BankRecon','Accounts','/bank/accounts','Register and manage bank accounts');
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKSTMIMP0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFBNKSTMIMP0001P001','Bank Statement Import','BankRecon','Import','/bank/import','Import MT940/CSV/OFX bank statements');
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKRECONWS0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFBNKRECONWS0001P001','Reconciliation Workspace','BankRecon','Workspace','/bank/recon/:id','Split-pane reconciliation workspace');
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKAUTOMCH0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFBNKAUTOMCH0001P001','Auto-Match Results','BankRecon','AutoMatch','/bank/recon/:id/matches','Auto-matched items with confidence scores');
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKUNMTCH0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFBNKUNMTCH0001P001','Unmatched Items Queue','BankRecon','Exceptions','/bank/recon/:id/exceptions','Exceptions with AI suggested matches');
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKRECSUM0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFBNKRECSUM0001P001','Reconciliation Summary','BankRecon','Summary','/bank/recon/:id/summary','Closing balance proof and difference analysis');
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKRECHST0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFBNKRECHST0001P001','Reconciliation History','BankRecon','History','/bank/history','All closed sessions with drill-down');
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKRULCFG0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFBNKRULCFG0001P001','Matching Rules Config','BankRecon','Rules','/bank/rules','Configure auto-match rules and tolerances');
GO

-- ── STORED PROCEDURES ────────────────────────────────────────

CREATE OR ALTER PROCEDURE sp_GetBankAccounts
    @Status VARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        ba.*,
        (SELECT COUNT(*) FROM bank.recon_sessions rs
         WHERE rs.account_id = ba.account_id AND rs.status = 'Open') AS open_sessions,
        (SELECT TOP 1 closing_balance_bank FROM bank.recon_sessions
         WHERE account_id = ba.account_id AND status = 'Closed'
         ORDER BY period_to DESC) AS last_recon_balance
    FROM bank.bank_accounts ba
    WHERE (@Status IS NULL OR ba.status = @Status)
    ORDER BY ba.bank_name, ba.account_name;
END
GO

CREATE OR ALTER PROCEDURE sp_CreateBankAccount
    @BankName       NVARCHAR(200),
    @AccountName    NVARCHAR(200),
    @AccountNumber  VARCHAR(50),
    @IBAN           VARCHAR(34) = NULL,
    @SwiftBIC       VARCHAR(11) = NULL,
    @Currency       CHAR(3) = 'USD',
    @AccountType    VARCHAR(30) = 'Current',
    @GLAccount      VARCHAR(10) = NULL,
    @CreatedBy      INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Seq INT = NEXT VALUE FOR bank.bank_seq;
    DECLARE @Ref VARCHAR(30) = 'BNK-' + FORMAT(YEAR(GETUTCDATE()),'0000') + '-' + FORMAT(@Seq,'000000');

    INSERT INTO bank.bank_accounts (account_ref, bank_name, account_name, account_number, iban, swift_bic, currency, account_type, gl_account, created_by)
    VALUES (@Ref, @BankName, @AccountName, @AccountNumber, @IBAN, @SwiftBIC, @Currency, @AccountType, @GLAccount, @CreatedBy);

    SELECT SCOPE_IDENTITY() AS account_id, @Ref AS account_ref;
END
GO

CREATE OR ALTER PROCEDURE sp_ImportBankStatement
    @AccountId      INT,
    @StatementDate  DATE,
    @PeriodFrom     DATE,
    @PeriodTo       DATE,
    @OpeningBalance DECIMAL(18,2),
    @ClosingBalance DECIMAL(18,2),
    @FileFormat     VARCHAR(10),
    @StorageKey     VARCHAR(500) = NULL,
    @TransactionsJson NVARCHAR(MAX),   -- JSON array of transactions
    @ImportedBy     INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @Seq INT = NEXT VALUE FOR bank.stmt_seq;
        DECLARE @Ref VARCHAR(30) = 'STM-' + FORMAT(YEAR(GETUTCDATE()),'0000') + '-' + FORMAT(@Seq,'000000');

        INSERT INTO bank.bank_statements (statement_ref, account_id, statement_date, period_from, period_to, opening_balance, closing_balance, file_format, storage_key, imported_by)
        VALUES (@Ref, @AccountId, @StatementDate, @PeriodFrom, @PeriodTo, @OpeningBalance, @ClosingBalance, @FileFormat, @StorageKey, @ImportedBy);

        DECLARE @StmtId INT = SCOPE_IDENTITY();

        -- Bulk insert transactions from JSON
        INSERT INTO bank.bank_transactions (statement_id, account_id, txn_date, value_date, txn_type, amount, currency, narrative, reference, counterparty, bank_ref)
        SELECT
            @StmtId, @AccountId,
            CAST(JSON_VALUE(t.value, '$.txn_date') AS DATE),
            TRY_CAST(JSON_VALUE(t.value, '$.value_date') AS DATE),
            JSON_VALUE(t.value, '$.txn_type'),
            CAST(JSON_VALUE(t.value, '$.amount') AS DECIMAL(18,2)),
            ISNULL(JSON_VALUE(t.value, '$.currency'), 'USD'),
            JSON_VALUE(t.value, '$.narrative'),
            JSON_VALUE(t.value, '$.reference'),
            JSON_VALUE(t.value, '$.counterparty'),
            JSON_VALUE(t.value, '$.bank_ref')
        FROM OPENJSON(@TransactionsJson) t;

        DECLARE @TxnCount INT = @@ROWCOUNT;

        -- Update statement totals
        UPDATE bank.bank_statements SET
            transaction_count = @TxnCount,
            total_debits  = (SELECT ISNULL(SUM(amount),0) FROM bank.bank_transactions WHERE statement_id=@StmtId AND txn_type='D'),
            total_credits = (SELECT ISNULL(SUM(amount),0) FROM bank.bank_transactions WHERE statement_id=@StmtId AND txn_type='C')
        WHERE statement_id = @StmtId;

        -- Update account last statement date
        UPDATE bank.bank_accounts SET last_statement_date = @StatementDate WHERE account_id = @AccountId;

        COMMIT TRANSACTION;
        SELECT @StmtId AS statement_id, @Ref AS statement_ref, @TxnCount AS transactions_imported;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE sp_CreateReconSession
    @AccountId      INT,
    @StatementId    INT,
    @MakerId        INT,
    @ScreenId       VARCHAR(20) = 'VFBNKRECONWS0001P001'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Seq INT = NEXT VALUE FOR bank.recon_seq;
    DECLARE @Ref VARCHAR(30) = 'REC-' + FORMAT(YEAR(GETUTCDATE()),'0000') + '-' + FORMAT(@Seq,'000000');

    DECLARE @PeriodFrom DATE, @PeriodTo DATE, @OpenBal DECIMAL(18,2), @CloseBal DECIMAL(18,2), @TxnCount INT;
    SELECT @PeriodFrom=period_from, @PeriodTo=period_to, @OpenBal=opening_balance, @CloseBal=closing_balance, @TxnCount=transaction_count
    FROM bank.bank_statements WHERE statement_id=@StatementId;

    INSERT INTO bank.recon_sessions (session_ref, account_id, statement_id, period_from, period_to, opening_balance, closing_balance_bank, total_bank_txns, status, maker_id, screen_id)
    VALUES (@Ref, @AccountId, @StatementId, @PeriodFrom, @PeriodTo, @OpenBal, @CloseBal, @TxnCount, 'Open', @MakerId, @ScreenId);

    UPDATE bank.bank_statements SET status='InRecon' WHERE statement_id=@StatementId;

    SELECT SCOPE_IDENTITY() AS session_id, @Ref AS session_ref;
END
GO

CREATE OR ALTER PROCEDURE sp_RunAutoMatch
    @SessionId  INT,
    @UserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @AccountId INT, @PeriodFrom DATE, @PeriodTo DATE, @StatementId INT;
        SELECT @AccountId=account_id, @PeriodFrom=period_from, @PeriodTo=period_to, @StatementId=statement_id
        FROM bank.recon_sessions WHERE session_id=@SessionId;

        DECLARE @MatchedCount INT = 0;
        DECLARE @Seq INT;

        -- ── RULE 1: Exact Amount + Date (±3 days) ────────────────
        INSERT INTO bank.recon_matches (session_id, match_ref, match_type, match_method, confidence_score, bank_txn_ids, gl_entry_ids, bank_amount, gl_amount, difference, matched_by)
        SELECT
            @SessionId,
            'MCH-' + FORMAT(YEAR(GETUTCDATE()),'0000') + '-' + FORMAT(NEXT VALUE FOR bank.match_seq,'000000'),
            'OneToOne', 'ExactAmount', 99.00,
            '[' + CAST(bt.txn_id AS VARCHAR) + ']',
            '[' + CAST(gl.line_id AS VARCHAR) + ']',
            bt.amount, ABS(gl.amount), ABS(bt.amount - ABS(gl.amount)), NULL
        FROM bank.bank_transactions bt
        CROSS APPLY (
            SELECT TOP 1 gl.line_id, gl.amount
            FROM finance.gl_lines gl
            JOIN finance.gl_journals j ON gl.journal_id = j.journal_id
            WHERE ABS(gl.amount) = bt.amount
              AND j.transaction_date BETWEEN DATEADD(DAY,-3,bt.txn_date) AND DATEADD(DAY,3,bt.txn_date)
              AND j.status = 'Posted'
              AND NOT EXISTS (SELECT 1 FROM bank.recon_matches rm WHERE rm.gl_entry_ids LIKE '%' + CAST(gl.line_id AS VARCHAR) + '%' AND rm.session_id=@SessionId AND rm.status='Accepted')
        ) gl
        WHERE bt.statement_id = @StatementId
          AND bt.recon_status = 'Unmatched';

        SET @MatchedCount = @MatchedCount + @@ROWCOUNT;

        -- Mark bank txns as matched (Rule 1)
        UPDATE bt SET bt.recon_status='Matched', bt.match_method='ExactAmount', bt.match_confidence=99, bt.match_id=rm.match_id
        FROM bank.bank_transactions bt
        JOIN bank.recon_matches rm ON rm.bank_txn_ids = '[' + CAST(bt.txn_id AS VARCHAR) + ']'
        WHERE rm.session_id=@SessionId AND rm.match_method='ExactAmount' AND bt.recon_status='Unmatched';

        -- ── RULE 2: Reference Match ───────────────────────────────
        INSERT INTO bank.recon_matches (session_id, match_ref, match_type, match_method, confidence_score, bank_txn_ids, gl_entry_ids, bank_amount, gl_amount, difference, matched_by)
        SELECT
            @SessionId,
            'MCH-' + FORMAT(YEAR(GETUTCDATE()),'0000') + '-' + FORMAT(NEXT VALUE FOR bank.match_seq,'000000'),
            'OneToOne', 'RefMatch', 95.00,
            '[' + CAST(bt.txn_id AS VARCHAR) + ']',
            '[' + CAST(gl.line_id AS VARCHAR) + ']',
            bt.amount, ABS(gl.amount), ABS(bt.amount - ABS(gl.amount)), NULL
        FROM bank.bank_transactions bt
        CROSS APPLY (
            SELECT TOP 1 gl.line_id, gl.amount, j.description
            FROM finance.gl_lines gl
            JOIN finance.gl_journals j ON gl.journal_id = j.journal_id
            WHERE (bt.narrative LIKE '%' + j.journal_ref + '%' OR bt.reference LIKE '%' + j.journal_ref + '%')
              AND j.status = 'Posted'
              AND ABS(ABS(gl.amount) - bt.amount) <= 1.00
              AND NOT EXISTS (SELECT 1 FROM bank.recon_matches rm WHERE rm.gl_entry_ids LIKE '%' + CAST(gl.line_id AS VARCHAR) + '%' AND rm.session_id=@SessionId AND rm.status='Accepted')
        ) gl
        WHERE bt.statement_id = @StatementId
          AND bt.recon_status = 'Unmatched';

        SET @MatchedCount = @MatchedCount + @@ROWCOUNT;

        UPDATE bt SET bt.recon_status='Matched', bt.match_method='RefMatch', bt.match_confidence=95, bt.match_id=rm.match_id
        FROM bank.bank_transactions bt
        JOIN bank.recon_matches rm ON rm.bank_txn_ids = '[' + CAST(bt.txn_id AS VARCHAR) + ']'
        WHERE rm.session_id=@SessionId AND rm.match_method='RefMatch' AND bt.recon_status='Unmatched';

        -- ── RULE 3: Tolerance Match (±0.50) ──────────────────────
        INSERT INTO bank.recon_matches (session_id, match_ref, match_type, match_method, confidence_score, bank_txn_ids, gl_entry_ids, bank_amount, gl_amount, difference, tolerance_applied, matched_by)
        SELECT
            @SessionId,
            'MCH-' + FORMAT(YEAR(GETUTCDATE()),'0000') + '-' + FORMAT(NEXT VALUE FOR bank.match_seq,'000000'),
            'OneToOne', 'Tolerance', 85.00,
            '[' + CAST(bt.txn_id AS VARCHAR) + ']',
            '[' + CAST(gl.line_id AS VARCHAR) + ']',
            bt.amount, ABS(gl.amount), ABS(bt.amount - ABS(gl.amount)), 1, NULL
        FROM bank.bank_transactions bt
        CROSS APPLY (
            SELECT TOP 1 gl.line_id, gl.amount
            FROM finance.gl_lines gl
            JOIN finance.gl_journals j ON gl.journal_id = j.journal_id
            WHERE ABS(ABS(gl.amount) - bt.amount) <= 0.50
              AND ABS(ABS(gl.amount) - bt.amount) > 0
              AND j.transaction_date BETWEEN DATEADD(DAY,-3,bt.txn_date) AND DATEADD(DAY,3,bt.txn_date)
              AND j.status = 'Posted'
              AND NOT EXISTS (SELECT 1 FROM bank.recon_matches rm WHERE rm.gl_entry_ids LIKE '%' + CAST(gl.line_id AS VARCHAR) + '%' AND rm.session_id=@SessionId AND rm.status='Accepted')
        ) gl
        WHERE bt.statement_id = @StatementId
          AND bt.recon_status = 'Unmatched';

        SET @MatchedCount = @MatchedCount + @@ROWCOUNT;

        UPDATE bt SET bt.recon_status='Matched', bt.match_method='Tolerance', bt.match_confidence=85, bt.match_id=rm.match_id
        FROM bank.bank_transactions bt
        JOIN bank.recon_matches rm ON rm.bank_txn_ids = '[' + CAST(bt.txn_id AS VARCHAR) + ']'
        WHERE rm.session_id=@SessionId AND rm.match_method='Tolerance' AND bt.recon_status='Unmatched';

        -- ── Update session stats ──────────────────────────────────
        UPDATE bank.recon_sessions SET
            matched_count    = (SELECT COUNT(*) FROM bank.bank_transactions WHERE statement_id=@StatementId AND recon_status IN ('Matched','ManualMatch')),
            unmatched_bank   = (SELECT COUNT(*) FROM bank.bank_transactions WHERE statement_id=@StatementId AND recon_status='Unmatched'),
            auto_match_run_at = GETUTCDATE(),
            status = 'InProgress'
        WHERE session_id = @SessionId;

        COMMIT TRANSACTION;

        SELECT
            @SessionId AS session_id,
            @MatchedCount AS newly_matched,
            (SELECT COUNT(*) FROM bank.bank_transactions WHERE statement_id=@StatementId AND recon_status='Unmatched') AS still_unmatched,
            (SELECT COUNT(*) FROM bank.bank_transactions WHERE statement_id=@StatementId AND recon_status IN ('Matched','ManualMatch')) AS total_matched;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE sp_GetReconSession
    @SessionId INT
AS
BEGIN
    SET NOCOUNT ON;
    -- Session header
    SELECT rs.*, ba.bank_name, ba.account_name, ba.account_number, ba.currency,
           bs.statement_date, bs.file_format
    FROM bank.recon_sessions rs
    JOIN bank.bank_accounts ba ON rs.account_id = ba.account_id
    JOIN bank.bank_statements bs ON rs.statement_id = bs.statement_id
    WHERE rs.session_id = @SessionId;

    -- Match summary by method
    SELECT match_method, COUNT(*) AS match_count,
           AVG(confidence_score) AS avg_confidence,
           SUM(ABS(difference)) AS total_difference
    FROM bank.recon_matches
    WHERE session_id = @SessionId AND status = 'Accepted'
    GROUP BY match_method;
END
GO

CREATE OR ALTER PROCEDURE sp_GetUnmatchedItems
    @SessionId  INT,
    @ItemType   VARCHAR(10) = 'Both'  -- Bank, GL, Both
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @StatementId INT, @PeriodFrom DATE, @PeriodTo DATE;
    SELECT @StatementId=statement_id, @PeriodFrom=period_from, @PeriodTo=period_to
    FROM bank.recon_sessions WHERE session_id=@SessionId;

    IF @ItemType IN ('Bank','Both')
    SELECT 'Bank' AS item_source, bt.txn_id AS item_id, bt.txn_date AS item_date,
           bt.txn_type, bt.amount, bt.narrative, bt.reference, bt.counterparty,
           bt.recon_status, bt.match_confidence
    FROM bank.bank_transactions bt
    WHERE bt.statement_id = @StatementId AND bt.recon_status = 'Unmatched'
    ORDER BY bt.txn_date;

    IF @ItemType IN ('GL','Both')
    SELECT 'GL' AS item_source, gl.line_id AS item_id, j.transaction_date AS item_date,
           CASE WHEN gl.amount < 0 THEN 'D' ELSE 'C' END AS txn_type,
           ABS(gl.amount) AS amount, j.description AS narrative, j.journal_ref AS reference,
           NULL AS counterparty, 'Unmatched' AS recon_status, NULL AS match_confidence
    FROM finance.gl_lines gl
    JOIN finance.gl_journals j ON gl.journal_id = j.journal_id
    WHERE j.transaction_date BETWEEN @PeriodFrom AND @PeriodTo
      AND j.status = 'Posted'
      AND NOT EXISTS (
          SELECT 1 FROM bank.recon_matches rm
          WHERE rm.session_id = @SessionId
            AND rm.gl_entry_ids LIKE '%' + CAST(gl.line_id AS VARCHAR) + '%'
            AND rm.status = 'Accepted'
      )
    ORDER BY j.transaction_date;
END
GO

CREATE OR ALTER PROCEDURE sp_ManualMatch
    @SessionId      INT,
    @BankTxnIds     NVARCHAR(500),   -- JSON array
    @GLEntryIds     NVARCHAR(500),   -- JSON array
    @Notes          NVARCHAR(500) = NULL,
    @MatchedBy      INT,
    @ScreenId       VARCHAR(20) = 'VFBNKRECONWS0001P001'
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @Seq INT = NEXT VALUE FOR bank.match_seq;
        DECLARE @Ref VARCHAR(30) = 'MCH-' + FORMAT(YEAR(GETUTCDATE()),'0000') + '-' + FORMAT(@Seq,'000000');

        -- Calculate amounts
        DECLARE @BankAmt DECIMAL(18,2) = 0, @GLAmt DECIMAL(18,2) = 0;

        SELECT @BankAmt = ISNULL(SUM(amount),0)
        FROM bank.bank_transactions
        WHERE txn_id IN (SELECT CAST(value AS INT) FROM OPENJSON(@BankTxnIds));

        SELECT @GLAmt = ISNULL(SUM(ABS(amount)),0)
        FROM finance.gl_lines
        WHERE line_id IN (SELECT CAST(value AS INT) FROM OPENJSON(@GLEntryIds));

        DECLARE @MatchType VARCHAR(20) = 'OneToOne';
        DECLARE @BankCount INT = (SELECT COUNT(*) FROM OPENJSON(@BankTxnIds));
        DECLARE @GLCount INT = (SELECT COUNT(*) FROM OPENJSON(@GLEntryIds));
        IF @BankCount > 1 AND @GLCount = 1 SET @MatchType = 'ManyToOne';
        IF @BankCount = 1 AND @GLCount > 1 SET @MatchType = 'OneToMany';
        IF @BankCount > 1 AND @GLCount > 1 SET @MatchType = 'ManyToMany';

        INSERT INTO bank.recon_matches (session_id, match_ref, match_type, match_method, confidence_score, bank_txn_ids, gl_entry_ids, bank_amount, gl_amount, difference, matched_by, notes, status)
        VALUES (@SessionId, @Ref, @MatchType, 'Manual', 100, @BankTxnIds, @GLEntryIds, @BankAmt, @GLAmt, ABS(@BankAmt-@GLAmt), @MatchedBy, @Notes, 'Accepted');

        DECLARE @MatchId INT = SCOPE_IDENTITY();

        -- Mark bank transactions as manually matched
        UPDATE bank.bank_transactions
        SET recon_status='ManualMatch', match_method='Manual', match_confidence=100, match_id=@MatchId
        WHERE txn_id IN (SELECT CAST(value AS INT) FROM OPENJSON(@BankTxnIds));

        -- Update session stats
        UPDATE bank.recon_sessions SET
            matched_count = (SELECT COUNT(*) FROM bank.bank_transactions bt
                             JOIN bank.bank_statements bs ON bt.statement_id=bs.statement_id
                             WHERE bs.statement_id=(SELECT statement_id FROM bank.recon_sessions WHERE session_id=@SessionId)
                               AND bt.recon_status IN ('Matched','ManualMatch')),
            unmatched_bank = (SELECT COUNT(*) FROM bank.bank_transactions bt
                              JOIN bank.bank_statements bs ON bt.statement_id=bs.statement_id
                              WHERE bs.statement_id=(SELECT statement_id FROM bank.recon_sessions WHERE session_id=@SessionId)
                                AND bt.recon_status='Unmatched')
        WHERE session_id=@SessionId;

        COMMIT TRANSACTION;
        SELECT @MatchId AS match_id, @Ref AS match_ref, @MatchType AS match_type,
               @BankAmt AS bank_amount, @GLAmt AS gl_amount, ABS(@BankAmt-@GLAmt) AS difference;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE sp_CloseReconSession
    @SessionId      INT,
    @CheckerId      INT,
    @GLJournalRef   VARCHAR(30) = NULL,
    @ScreenId       VARCHAR(20) = 'VFBNKRECSUM0001P001'
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @UnmatchedCount INT;
        SELECT @UnmatchedCount = unmatched_bank FROM bank.recon_sessions WHERE session_id=@SessionId;

        IF @UnmatchedCount > 0 AND @GLJournalRef IS NULL
        BEGIN
            RAISERROR('Cannot close session: %d unmatched items remain. Post reconciling journal first.', 16, 1, @UnmatchedCount);
            RETURN;
        END

        UPDATE bank.recon_sessions SET
            status = 'Closed',
            checker_id = @CheckerId,
            closed_at = GETUTCDATE(),
            gl_journal_ref = @GLJournalRef
        WHERE session_id = @SessionId;

        -- Update bank account last recon date
        UPDATE ba SET ba.last_recon_date = rs.period_to, ba.current_balance = rs.closing_balance_bank
        FROM bank.bank_accounts ba
        JOIN bank.recon_sessions rs ON ba.account_id = rs.account_id
        WHERE rs.session_id = @SessionId;

        -- Mark statement as reconciled
        UPDATE bank.bank_statements SET status='Reconciled'
        WHERE statement_id = (SELECT statement_id FROM bank.recon_sessions WHERE session_id=@SessionId);

        COMMIT TRANSACTION;
        SELECT @SessionId AS session_id, 'Closed' AS status, GETUTCDATE() AS closed_at;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE sp_GetReconHistory
    @AccountId  INT = NULL,
    @Status     VARCHAR(20) = NULL,
    @PageNumber INT = 1,
    @PageSize   INT = 50
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber-1)*@PageSize;
    SELECT
        rs.*, ba.bank_name, ba.account_name, ba.currency,
        u1.username AS maker_name, u2.username AS checker_name,
        COUNT(*) OVER() AS total_count
    FROM bank.recon_sessions rs
    JOIN bank.bank_accounts ba ON rs.account_id = ba.account_id
    LEFT JOIN security.users u1 ON rs.maker_id = u1.user_id
    LEFT JOIN security.users u2 ON rs.checker_id = u2.user_id
    WHERE (@AccountId IS NULL OR rs.account_id = @AccountId)
      AND (@Status IS NULL OR rs.status = @Status)
    ORDER BY rs.created_at DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE sp_GetReconRules
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM bank.recon_rules ORDER BY priority ASC;
END
GO

CREATE OR ALTER PROCEDURE sp_UpsertReconRule
    @RuleId             INT = NULL,
    @RuleName           VARCHAR(100),
    @RuleType           VARCHAR(30),
    @Priority           INT,
    @IsActive           BIT,
    @DateToleranceDays  INT = 3,
    @AmountTolerance    DECIMAL(18,2) = 0,
    @AmountTolerancePct DECIMAL(5,2) = 0,
    @RefPattern         NVARCHAR(200) = NULL,
    @MinConfidence      DECIMAL(5,2) = 80,
    @AutoAcceptThreshold DECIMAL(5,2) = 95,
    @Description        NVARCHAR(500) = NULL,
    @UpdatedBy          INT
AS
BEGIN
    SET NOCOUNT ON;
    IF @RuleId IS NULL
    BEGIN
        INSERT INTO bank.recon_rules (rule_name, rule_type, priority, is_active, date_tolerance_days, amount_tolerance, amount_tolerance_pct, ref_pattern, min_confidence, auto_accept_threshold, description, created_by)
        VALUES (@RuleName, @RuleType, @Priority, @IsActive, @DateToleranceDays, @AmountTolerance, @AmountTolerancePct, @RefPattern, @MinConfidence, @AutoAcceptThreshold, @Description, @UpdatedBy);
        SELECT SCOPE_IDENTITY() AS rule_id;
    END
    ELSE
    BEGIN
        UPDATE bank.recon_rules SET
            rule_name=@RuleName, rule_type=@RuleType, priority=@Priority, is_active=@IsActive,
            date_tolerance_days=@DateToleranceDays, amount_tolerance=@AmountTolerance,
            amount_tolerance_pct=@AmountTolerancePct, ref_pattern=@RefPattern,
            min_confidence=@MinConfidence, auto_accept_threshold=@AutoAcceptThreshold,
            description=@Description, updated_at=GETUTCDATE()
        WHERE rule_id=@RuleId;
        SELECT @RuleId AS rule_id;
    END
END
GO

CREATE OR ALTER PROCEDURE sp_GetReconMatches
    @SessionId  INT,
    @Status     VARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT rm.*,
           (SELECT STRING_AGG(CAST(bt.txn_date AS VARCHAR) + ' ' + bt.narrative, ' | ')
            FROM bank.bank_transactions bt
            WHERE bt.txn_id IN (SELECT CAST(value AS INT) FROM OPENJSON(rm.bank_txn_ids))) AS bank_narratives
    FROM bank.recon_matches rm
    WHERE rm.session_id = @SessionId
      AND (@Status IS NULL OR rm.status = @Status)
    ORDER BY rm.confidence_score DESC, rm.matched_at DESC;
END
GO
