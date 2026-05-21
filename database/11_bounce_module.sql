-- ============================================================
-- VodaLease Enterprise — Bounced Cheque Replacement & Penalty
-- All DML via Stored Procedures (SPP pattern)
-- ============================================================

-- ── 1. TABLES ────────────────────────────────────────────────

-- Flexible penalty configuration (admin-configurable)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='cheque' AND TABLE_NAME='bounce_penalty_config')
CREATE TABLE cheque.bounce_penalty_config (
    config_id           INT IDENTITY(1,1) PRIMARY KEY,
    penalty_code        VARCHAR(30)  NOT NULL UNIQUE,  -- e.g. FLAT_FEE, PCT_AMOUNT, BANK_CHARGE, NONE
    penalty_name        NVARCHAR(100) NOT NULL,
    description         NVARCHAR(500),
    -- Flat fee fields
    flat_amount         DECIMAL(18,2) DEFAULT 0,
    flat_currency       VARCHAR(3)   DEFAULT 'AED',
    -- Percentage fields
    pct_rate            DECIMAL(8,4) DEFAULT 0,        -- e.g. 2.5 = 2.5%
    pct_cap             DECIMAL(18,2) DEFAULT NULL,    -- max cap on percentage
    pct_floor           DECIMAL(18,2) DEFAULT NULL,    -- min floor on percentage
    -- GL accounts for penalty posting
    dr_gl_account       VARCHAR(20),                   -- Debit: Bounce Penalty Expense
    cr_gl_account       VARCHAR(20),                   -- Credit: Payable to Lessor / Bank
    cost_centre         VARCHAR(20),
    -- Replacement cheque rules
    replacement_delay_days  INT DEFAULT 0,             -- days after bounce to issue replacement
    require_approval        BIT DEFAULT 1,             -- require maker/checker for replacement
    notify_lessor           BIT DEFAULT 1,             -- auto-notify lessor on bounce
    notify_template         NVARCHAR(1000),            -- email/notification template text
    -- Applicability
    applies_to_amount_from  DECIMAL(18,2) DEFAULT 0,   -- apply this rule when cheque amount >= X
    applies_to_amount_to    DECIMAL(18,2) DEFAULT NULL, -- apply this rule when cheque amount <= Y (NULL = no cap)
    is_active           BIT DEFAULT 1,
    priority            INT DEFAULT 1,                 -- lower = higher priority when multiple rules match
    screen_id           VARCHAR(20) DEFAULT 'VFCHQBNCCFG001',
    created_by          INT,
    created_at          DATETIME2 DEFAULT GETDATE(),
    updated_at          DATETIME2 DEFAULT GETDATE()
);
GO

-- Full bounce event history
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='cheque' AND TABLE_NAME='bounce_events')
CREATE TABLE cheque.bounce_events (
    bounce_id               INT IDENTITY(1,1) PRIMARY KEY,
    bounce_ref              VARCHAR(30) NOT NULL UNIQUE,   -- BNC-YYYY-NNNNNN
    original_cheque_id      INT NOT NULL,                  -- FK to cheque.cheque_register
    original_cheque_number  VARCHAR(30),
    original_amount         DECIMAL(18,2),
    currency                VARCHAR(3),
    lessor_id               INT,
    lessor_name             NVARCHAR(200),
    bounce_date             DATE NOT NULL,
    bounce_reason           VARCHAR(100),                  -- INSUFFICIENT_FUNDS, SIGNATURE_MISMATCH, STALE, ACCOUNT_CLOSED, REFER_TO_DRAWER, OTHER
    bounce_reason_detail    NVARCHAR(500),
    bank_return_ref         VARCHAR(100),                  -- bank's own reference for the return
    -- Penalty applied
    config_id               INT,                           -- FK to bounce_penalty_config
    penalty_type            VARCHAR(30),                   -- snapshot of penalty_code at time of bounce
    penalty_amount          DECIMAL(18,2) DEFAULT 0,
    penalty_currency        VARCHAR(3),
    penalty_gl_posted       BIT DEFAULT 0,
    penalty_journal_ref     VARCHAR(50),
    -- Replacement cheque
    replacement_cheque_id   INT,                           -- FK to cheque.cheque_register (new cheque)
    replacement_cheque_number VARCHAR(30),
    replacement_amount      DECIMAL(18,2),                 -- may differ from original (original + penalty)
    replacement_issue_date  DATE,
    replacement_due_date    DATE,
    -- Workflow
    status                  VARCHAR(30) DEFAULT 'BOUNCED', -- BOUNCED, PENALTY_PENDING, REPLACEMENT_ISSUED, SETTLED, WAIVED
    maker_id                INT,
    checker_id              INT,
    checker_action          VARCHAR(20),                   -- APPROVED, REJECTED
    checker_notes           NVARCHAR(500),
    -- Waiver
    waiver_approved         BIT DEFAULT 0,
    waiver_reason           NVARCHAR(500),
    waiver_approved_by      INT,
    -- Audit
    screen_id               VARCHAR(20) DEFAULT 'VFCHQBNCEVT001',
    process_start_time      DATETIME2,
    process_end_time        DATETIME2,
    elapsed_ms              INT,
    created_by              INT,
    created_at              DATETIME2 DEFAULT GETDATE(),
    updated_at              DATETIME2 DEFAULT GETDATE()
);
GO

-- Seed default penalty configurations
IF NOT EXISTS (SELECT 1 FROM cheque.bounce_penalty_config WHERE penalty_code = 'NONE')
INSERT INTO cheque.bounce_penalty_config
    (penalty_code, penalty_name, description, flat_amount, pct_rate, dr_gl_account, cr_gl_account, is_active, priority)
VALUES
    ('NONE',        'No Penalty',           'No penalty charged — waived by policy',                     0,     0,    NULL,   NULL,   1, 99),
    ('FLAT_FEE',    'Fixed Flat Fee',       'A fixed monetary penalty regardless of cheque amount',      250,   0,    '6310', '2130', 1, 2),
    ('PCT_AMOUNT',  'Percentage of Amount', 'Penalty as a percentage of the bounced cheque amount',      0,     2.5,  '6310', '2130', 1, 3),
    ('BANK_CHARGE', 'Bank Return Charge',   'Actual bank return charge passed through to lessor account',0,     0,    '6310', '2130', 1, 1),
    ('FLAT_PLUS_PCT','Flat Fee + Percentage','Combination: flat fee plus percentage of cheque amount',   100,   1.5,  '6310', '2130', 1, 4);
GO

-- Screen registry entries
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id = 'VFCHQBNCCFG001')
INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, description, is_active)
VALUES
    ('VFCHQBNCCFG001', 'Bounce Penalty Configuration', 'Cheque Inventory', 'Bounce Management',  'Configure flexible penalty rules for bounced cheques', 1),
    ('VFCHQBNCEVT001', 'Bounce Event Register',        'Cheque Inventory', 'Bounce Management',  'Record and manage bounced cheque events',              1),
    ('VFCHQBNCRPL001', 'Bounce Replacement Wizard',    'Cheque Inventory', 'Bounce Management',  'Issue replacement cheque after bounce with penalty',   1),
    ('VFCHQBNCHST001', 'Bounce History',               'Cheque Inventory', 'Bounce Management',  'Full audit history of all bounce events',              1);
GO

-- ── 2. STORED PROCEDURES ─────────────────────────────────────

-- sp_GetBouncePenaltyConfig
IF OBJECT_ID('sp_GetBouncePenaltyConfig') IS NOT NULL DROP PROCEDURE sp_GetBouncePenaltyConfig;
GO
CREATE PROCEDURE sp_GetBouncePenaltyConfig
    @ActiveOnly BIT = 1
AS BEGIN
    SET NOCOUNT ON;
    SELECT
        config_id, penalty_code, penalty_name, description,
        flat_amount, flat_currency, pct_rate, pct_cap, pct_floor,
        dr_gl_account, cr_gl_account, cost_centre,
        replacement_delay_days, require_approval, notify_lessor, notify_template,
        applies_to_amount_from, applies_to_amount_to,
        is_active, priority, screen_id, created_at, updated_at
    FROM cheque.bounce_penalty_config
    WHERE (@ActiveOnly = 0 OR is_active = 1)
    ORDER BY priority ASC, penalty_name ASC;
END
GO

-- sp_SaveBouncePenaltyConfig (upsert)
IF OBJECT_ID('sp_SaveBouncePenaltyConfig') IS NOT NULL DROP PROCEDURE sp_SaveBouncePenaltyConfig;
GO
CREATE PROCEDURE sp_SaveBouncePenaltyConfig
    @ConfigId               INT = NULL,
    @PenaltyCode            VARCHAR(30),
    @PenaltyName            NVARCHAR(100),
    @Description            NVARCHAR(500) = NULL,
    @FlatAmount             DECIMAL(18,2) = 0,
    @FlatCurrency           VARCHAR(3) = 'AED',
    @PctRate                DECIMAL(8,4) = 0,
    @PctCap                 DECIMAL(18,2) = NULL,
    @PctFloor               DECIMAL(18,2) = NULL,
    @DrGLAccount            VARCHAR(20) = NULL,
    @CrGLAccount            VARCHAR(20) = NULL,
    @CostCentre             VARCHAR(20) = NULL,
    @ReplacementDelayDays   INT = 0,
    @RequireApproval        BIT = 1,
    @NotifyLessor           BIT = 1,
    @NotifyTemplate         NVARCHAR(1000) = NULL,
    @AppliesToAmountFrom    DECIMAL(18,2) = 0,
    @AppliesToAmountTo      DECIMAL(18,2) = NULL,
    @IsActive               BIT = 1,
    @Priority               INT = 1,
    @CreatedBy              INT = NULL
AS BEGIN
    SET NOCOUNT ON;
    IF @ConfigId IS NULL OR @ConfigId = 0
    BEGIN
        INSERT INTO cheque.bounce_penalty_config
            (penalty_code, penalty_name, description, flat_amount, flat_currency, pct_rate, pct_cap, pct_floor,
             dr_gl_account, cr_gl_account, cost_centre, replacement_delay_days, require_approval, notify_lessor,
             notify_template, applies_to_amount_from, applies_to_amount_to, is_active, priority, created_by)
        VALUES
            (@PenaltyCode, @PenaltyName, @Description, @FlatAmount, @FlatCurrency, @PctRate, @PctCap, @PctFloor,
             @DrGLAccount, @CrGLAccount, @CostCentre, @ReplacementDelayDays, @RequireApproval, @NotifyLessor,
             @NotifyTemplate, @AppliesToAmountFrom, @AppliesToAmountTo, @IsActive, @Priority, @CreatedBy);
        SELECT SCOPE_IDENTITY() AS config_id;
    END
    ELSE
    BEGIN
        UPDATE cheque.bounce_penalty_config SET
            penalty_name = @PenaltyName, description = @Description,
            flat_amount = @FlatAmount, flat_currency = @FlatCurrency,
            pct_rate = @PctRate, pct_cap = @PctCap, pct_floor = @PctFloor,
            dr_gl_account = @DrGLAccount, cr_gl_account = @CrGLAccount, cost_centre = @CostCentre,
            replacement_delay_days = @ReplacementDelayDays, require_approval = @RequireApproval,
            notify_lessor = @NotifyLessor, notify_template = @NotifyTemplate,
            applies_to_amount_from = @AppliesToAmountFrom, applies_to_amount_to = @AppliesToAmountTo,
            is_active = @IsActive, priority = @Priority, updated_at = GETDATE()
        WHERE config_id = @ConfigId;
        SELECT @ConfigId AS config_id;
    END
END
GO

-- sp_RecordBouncedCheque
IF OBJECT_ID('sp_RecordBouncedCheque') IS NOT NULL DROP PROCEDURE sp_RecordBouncedCheque;
GO
CREATE PROCEDURE sp_RecordBouncedCheque
    @ChequeId           INT,
    @BounceDate         DATE,
    @BounceReason       VARCHAR(100),
    @BounceReasonDetail NVARCHAR(500) = NULL,
    @BankReturnRef      VARCHAR(100) = NULL,
    @ConfigId           INT = NULL,          -- penalty config to apply (NULL = auto-select)
    @OverridePenalty    DECIMAL(18,2) = NULL, -- override calculated penalty (e.g. actual bank charge)
    @WaivePenalty       BIT = 0,
    @WaiverReason       NVARCHAR(500) = NULL,
    @MakerId            INT = NULL,
    @ScreenId           VARCHAR(20) = 'VFCHQBNCEVT001'
AS BEGIN
    SET NOCOUNT ON;
    DECLARE @StartTime DATETIME2 = GETDATE();
    DECLARE @BounceRef VARCHAR(30);
    DECLARE @PenaltyAmount DECIMAL(18,2) = 0;
    DECLARE @PenaltyType VARCHAR(30) = 'NONE';
    DECLARE @ChequeAmount DECIMAL(18,2);
    DECLARE @Currency VARCHAR(3);
    DECLARE @LessorId INT;
    DECLARE @ChequeNumber VARCHAR(30);

    -- Get cheque details
    SELECT @ChequeAmount = amount, @Currency = currency,
           @LessorId = payee_lessor_id, @ChequeNumber = cheque_number
    FROM cheque.cheque_register WHERE cheque_id = @ChequeId;

    -- Auto-select best matching penalty config if not provided
    IF @ConfigId IS NULL AND @WaivePenalty = 0
    BEGIN
        SELECT TOP 1 @ConfigId = config_id
        FROM cheque.bounce_penalty_config
        WHERE is_active = 1
          AND (@ChequeAmount >= applies_to_amount_from OR applies_to_amount_from = 0)
          AND (applies_to_amount_to IS NULL OR @ChequeAmount <= applies_to_amount_to)
          AND penalty_code <> 'NONE'
        ORDER BY priority ASC;
    END

    -- Calculate penalty
    IF @WaivePenalty = 0 AND @ConfigId IS NOT NULL
    BEGIN
        DECLARE @PctRate DECIMAL(8,4), @FlatAmt DECIMAL(18,2), @PctCap DECIMAL(18,2), @PctFloor DECIMAL(18,2);
        SELECT @PenaltyType = penalty_code, @FlatAmt = flat_amount, @PctRate = pct_rate,
               @PctCap = pct_cap, @PctFloor = pct_floor
        FROM cheque.bounce_penalty_config WHERE config_id = @ConfigId;

        IF @OverridePenalty IS NOT NULL
            SET @PenaltyAmount = @OverridePenalty;
        ELSE IF @PenaltyType = 'FLAT_FEE'
            SET @PenaltyAmount = @FlatAmt;
        ELSE IF @PenaltyType = 'PCT_AMOUNT'
        BEGIN
            SET @PenaltyAmount = @ChequeAmount * @PctRate / 100;
            IF @PctCap IS NOT NULL AND @PenaltyAmount > @PctCap SET @PenaltyAmount = @PctCap;
            IF @PctFloor IS NOT NULL AND @PenaltyAmount < @PctFloor SET @PenaltyAmount = @PctFloor;
        END
        ELSE IF @PenaltyType = 'BANK_CHARGE'
            SET @PenaltyAmount = ISNULL(@OverridePenalty, 0);
        ELSE IF @PenaltyType = 'FLAT_PLUS_PCT'
        BEGIN
            SET @PenaltyAmount = @FlatAmt + (@ChequeAmount * @PctRate / 100);
            IF @PctCap IS NOT NULL AND (@ChequeAmount * @PctRate / 100) > @PctCap
                SET @PenaltyAmount = @FlatAmt + @PctCap;
        END
    END
    ELSE IF @WaivePenalty = 1
        SET @PenaltyType = 'NONE';

    -- Generate bounce reference
    SET @BounceRef = 'BNC-' + CAST(YEAR(GETDATE()) AS VARCHAR(4)) + '-' +
                     RIGHT('000000' + CAST((SELECT ISNULL(MAX(bounce_id),0)+1 FROM cheque.bounce_events), VARCHAR(6)), 6);

    -- Mark original cheque as BOUNCED
    UPDATE cheque.cheque_register
    SET status = 'BOUNCED', updated_at = GETDATE()
    WHERE cheque_id = @ChequeId;

    -- Insert bounce event
    INSERT INTO cheque.bounce_events
        (bounce_ref, original_cheque_id, original_cheque_number, original_amount, currency,
         lessor_id, bounce_date, bounce_reason, bounce_reason_detail, bank_return_ref,
         config_id, penalty_type, penalty_amount, penalty_currency,
         waiver_approved, waiver_reason,
         status, maker_id, screen_id, process_start_time, created_by)
    VALUES
        (@BounceRef, @ChequeId, @ChequeNumber, @ChequeAmount, @Currency,
         @LessorId, @BounceDate, @BounceReason, @BounceReasonDetail, @BankReturnRef,
         @ConfigId, @PenaltyType, @PenaltyAmount, @Currency,
         @WaivePenalty, @WaiverReason,
         CASE WHEN @WaivePenalty = 1 THEN 'WAIVED' ELSE 'BOUNCED' END,
         @MakerId, @ScreenId, @StartTime, @MakerId);

    SELECT
        SCOPE_IDENTITY() AS bounce_id,
        @BounceRef AS bounce_ref,
        @PenaltyType AS penalty_type,
        @PenaltyAmount AS penalty_amount,
        @Currency AS currency;
END
GO

-- sp_IssueBounceReplacement
IF OBJECT_ID('sp_IssueBounceReplacement') IS NOT NULL DROP PROCEDURE sp_IssueBounceReplacement;
GO
CREATE PROCEDURE sp_IssueBounceReplacement
    @BounceId               INT,
    @ReplacementBookId      INT,           -- cheque book to draw replacement from
    @ReplacementAmount      DECIMAL(18,2), -- original + penalty (or custom)
    @IncludePenaltyInCheque BIT = 1,       -- if 1, replacement cheque = original + penalty
    @ReplacementIssueDate   DATE = NULL,
    @ReplacementDueDate     DATE = NULL,
    @CheckerId              INT = NULL,
    @CheckerNotes           NVARCHAR(500) = NULL,
    @MakerId                INT = NULL,
    @ScreenId               VARCHAR(20) = 'VFCHQBNCRPL001'
AS BEGIN
    SET NOCOUNT ON;
    DECLARE @StartTime DATETIME2 = GETDATE();
    DECLARE @NextChequeNumber VARCHAR(30);
    DECLARE @LessorId INT;
    DECLARE @OriginalAmount DECIMAL(18,2);
    DECLARE @PenaltyAmount DECIMAL(18,2);
    DECLARE @Currency VARCHAR(3);
    DECLARE @NewChequeId INT;
    DECLARE @BounceRef VARCHAR(30);

    -- Get bounce event details
    SELECT @LessorId = lessor_id, @OriginalAmount = original_amount,
           @PenaltyAmount = penalty_amount, @Currency = currency, @BounceRef = bounce_ref
    FROM cheque.bounce_events WHERE bounce_id = @BounceId;

    -- Determine replacement amount
    IF @IncludePenaltyInCheque = 1
        SET @ReplacementAmount = @OriginalAmount + @PenaltyAmount;

    -- Get next available cheque number from the specified book
    SELECT TOP 1 @NextChequeNumber = CAST(series_from + issued_leaves AS VARCHAR(30))
    FROM cheque.cheque_books WHERE book_id = @ReplacementBookId AND status = 'ACTIVE';

    -- Issue the replacement cheque in the register
    INSERT INTO cheque.cheque_register
        (cheque_book_id, cheque_number, payee_lessor_id, amount, currency,
         issue_date, due_date, status, memo, screen_id, created_by)
    VALUES
        (@ReplacementBookId, @NextChequeNumber, @LessorId, @ReplacementAmount, @Currency,
         ISNULL(@ReplacementIssueDate, CAST(GETDATE() AS DATE)),
         @ReplacementDueDate, 'ISSUED',
         'Replacement for bounced cheque - Bounce Ref: ' + @BounceRef,
         @ScreenId, @MakerId);

    SET @NewChequeId = SCOPE_IDENTITY();

    -- Update book leaf count
    UPDATE cheque.cheque_books
    SET issued_leaves = issued_leaves + 1,
        available_leaves = available_leaves - 1,
        status = CASE WHEN available_leaves - 1 <= 0 THEN 'EXHAUSTED' ELSE status END
    WHERE book_id = @ReplacementBookId;

    -- Update bounce event with replacement details
    UPDATE cheque.bounce_events SET
        replacement_cheque_id = @NewChequeId,
        replacement_cheque_number = @NextChequeNumber,
        replacement_amount = @ReplacementAmount,
        replacement_issue_date = ISNULL(@ReplacementIssueDate, CAST(GETDATE() AS DATE)),
        replacement_due_date = @ReplacementDueDate,
        checker_id = @CheckerId,
        checker_action = CASE WHEN @CheckerId IS NOT NULL THEN 'APPROVED' ELSE NULL END,
        checker_notes = @CheckerNotes,
        status = 'REPLACEMENT_ISSUED',
        process_end_time = GETDATE(),
        elapsed_ms = DATEDIFF(MILLISECOND, @StartTime, GETDATE()),
        updated_at = GETDATE()
    WHERE bounce_id = @BounceId;

    SELECT
        @NewChequeId AS replacement_cheque_id,
        @NextChequeNumber AS replacement_cheque_number,
        @ReplacementAmount AS replacement_amount,
        'REPLACEMENT_ISSUED' AS status;
END
GO

-- sp_GetBounceHistory
IF OBJECT_ID('sp_GetBounceHistory') IS NOT NULL DROP PROCEDURE sp_GetBounceHistory;
GO
CREATE PROCEDURE sp_GetBounceHistory
    @LessorId       INT = NULL,
    @Status         VARCHAR(30) = NULL,
    @DateFrom       DATE = NULL,
    @DateTo         DATE = NULL,
    @PageNumber     INT = 1,
    @PageSize       INT = 50
AS BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
    SELECT
        be.bounce_id, be.bounce_ref, be.original_cheque_number,
        be.original_amount, be.currency,
        be.bounce_date, be.bounce_reason, be.bounce_reason_detail,
        be.bank_return_ref,
        be.penalty_type, be.penalty_amount, be.penalty_gl_posted,
        be.replacement_cheque_number, be.replacement_amount, be.replacement_issue_date,
        be.status, be.waiver_approved, be.waiver_reason,
        be.checker_action, be.checker_notes,
        be.created_at,
        bpc.penalty_name,
        -- Lessor name from lessors table if it exists
        ISNULL((SELECT TOP 1 lessor_name FROM lease.lessors WHERE lessor_id = be.lessor_id), 'Unknown') AS lessor_name,
        COUNT(*) OVER() AS total_count
    FROM cheque.bounce_events be
    LEFT JOIN cheque.bounce_penalty_config bpc ON be.config_id = bpc.config_id
    WHERE (@LessorId IS NULL OR be.lessor_id = @LessorId)
      AND (@Status IS NULL OR be.status = @Status)
      AND (@DateFrom IS NULL OR be.bounce_date >= @DateFrom)
      AND (@DateTo IS NULL OR be.bounce_date <= @DateTo)
    ORDER BY be.created_at DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- sp_GetBounceGLPreview (shows what GL entries will be posted)
IF OBJECT_ID('sp_GetBounceGLPreview') IS NOT NULL DROP PROCEDURE sp_GetBounceGLPreview;
GO
CREATE PROCEDURE sp_GetBounceGLPreview
    @BounceId INT
AS BEGIN
    SET NOCOUNT ON;
    SELECT
        be.bounce_ref,
        be.original_amount,
        be.penalty_amount,
        be.penalty_type,
        be.currency,
        bpc.dr_gl_account,
        bpc.cr_gl_account,
        bpc.cost_centre,
        -- GL lines preview
        'DR' AS dr_cr_1, bpc.dr_gl_account AS gl_account_1,
        'Bounce Penalty Expense - ' + be.bounce_ref AS description_1,
        be.penalty_amount AS amount_1,
        'CR' AS dr_cr_2, bpc.cr_gl_account AS gl_account_2,
        'Bounce Penalty Payable - ' + be.bounce_ref AS description_2,
        be.penalty_amount AS amount_2
    FROM cheque.bounce_events be
    LEFT JOIN cheque.bounce_penalty_config bpc ON be.config_id = bpc.config_id
    WHERE be.bounce_id = @BounceId;
END
GO

-- sp_PostBounceGLEntry
IF OBJECT_ID('sp_PostBounceGLEntry') IS NOT NULL DROP PROCEDURE sp_PostBounceGLEntry;
GO
CREATE PROCEDURE sp_PostBounceGLEntry
    @BounceId   INT,
    @PostedBy   INT = NULL
AS BEGIN
    SET NOCOUNT ON;
    DECLARE @JournalRef VARCHAR(50);
    DECLARE @PenaltyAmount DECIMAL(18,2);
    DECLARE @DrGL VARCHAR(20), @CrGL VARCHAR(20), @CC VARCHAR(20);
    DECLARE @BounceRef VARCHAR(30), @Currency VARCHAR(3);

    SELECT @PenaltyAmount = be.penalty_amount, @BounceRef = be.bounce_ref,
           @Currency = be.currency, @DrGL = bpc.dr_gl_account, @CrGL = bpc.cr_gl_account,
           @CC = bpc.cost_centre
    FROM cheque.bounce_events be
    LEFT JOIN cheque.bounce_penalty_config bpc ON be.config_id = bpc.config_id
    WHERE be.bounce_id = @BounceId;

    IF @PenaltyAmount > 0
    BEGIN
        SET @JournalRef = 'JV-BNC-' + CAST(YEAR(GETDATE()) AS VARCHAR(4)) + '-' +
                          RIGHT('000000' + CAST(@BounceId AS VARCHAR(6)), 6);

        -- Post to GL journals if table exists
        IF OBJECT_ID('finance.gl_journals') IS NOT NULL
        BEGIN
            INSERT INTO finance.gl_journals
                (journal_ref, journal_date, description, dr_account, cr_account,
                 amount, currency, cost_centre, source_module, source_ref, posted_by)
            VALUES
                (@JournalRef, CAST(GETDATE() AS DATE),
                 'Bounce Penalty - ' + @BounceRef,
                 @DrGL, @CrGL, @PenaltyAmount, @Currency, @CC,
                 'CHEQUE_BOUNCE', @BounceRef, @PostedBy);
        END

        UPDATE cheque.bounce_events
        SET penalty_gl_posted = 1, penalty_journal_ref = @JournalRef,
            status = CASE WHEN status = 'BOUNCED' THEN 'PENALTY_PENDING' ELSE status END,
            updated_at = GETDATE()
        WHERE bounce_id = @BounceId;

        SELECT @JournalRef AS journal_ref, @PenaltyAmount AS amount_posted;
    END
    ELSE
        SELECT NULL AS journal_ref, 0 AS amount_posted;
END
GO

-- sp_WaiveBounce
IF OBJECT_ID('sp_WaiveBounce') IS NOT NULL DROP PROCEDURE sp_WaiveBounce;
GO
CREATE PROCEDURE sp_WaiveBounce
    @BounceId       INT,
    @WaiverReason   NVARCHAR(500),
    @ApprovedBy     INT
AS BEGIN
    SET NOCOUNT ON;
    UPDATE cheque.bounce_events SET
        waiver_approved = 1,
        waiver_reason = @WaiverReason,
        waiver_approved_by = @ApprovedBy,
        penalty_amount = 0,
        status = 'WAIVED',
        updated_at = GETDATE()
    WHERE bounce_id = @BounceId;
    SELECT @BounceId AS bounce_id, 'WAIVED' AS status;
END
GO

PRINT 'Bounce module SQL executed successfully.';
