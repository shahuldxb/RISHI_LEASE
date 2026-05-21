-- ============================================================
-- Day-1 Initial Recognition JV
-- 1. Insert 6 missing GL codes
-- 2. Create sp_PostInitialRecognitionJV stored procedure
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1: Insert missing GL codes
-- ------------------------------------------------------------

-- 10150: ROU Asset — Initial Direct Costs (added to ROU on Day 1)
IF NOT EXISTS (SELECT 1 FROM accounting.gl_chart_of_accounts WHERE account_code = '10150')
    INSERT INTO accounting.gl_chart_of_accounts (account_code, account_name, account_type, parent_code, is_active)
    VALUES ('10150', 'ROU Asset — Initial Direct Costs', 'Asset', '10100', 1);

-- 20020: Accrued Initial Direct Costs (Cr side when IDC is not yet paid)
IF NOT EXISTS (SELECT 1 FROM accounting.gl_chart_of_accounts WHERE account_code = '20020')
    INSERT INTO accounting.gl_chart_of_accounts (account_code, account_name, account_type, parent_code, is_active)
    VALUES ('20020', 'Accrued Initial Direct Costs', 'Liability', '20010', 1);

-- 12020: Security Deposit Paid (Dr when security deposit is paid to lessor)
IF NOT EXISTS (SELECT 1 FROM accounting.gl_chart_of_accounts WHERE account_code = '12020')
    INSERT INTO accounting.gl_chart_of_accounts (account_code, account_name, account_type, parent_code, is_active)
    VALUES ('12020', 'Security Deposit — Lease', 'Asset', '12010', 1);

-- 20030: Lease Incentives Received (Cr — reduces ROU asset on Day 1)
IF NOT EXISTS (SELECT 1 FROM accounting.gl_chart_of_accounts WHERE account_code = '20030')
    INSERT INTO accounting.gl_chart_of_accounts (account_code, account_name, account_type, parent_code, is_active)
    VALUES ('20030', 'Lease Incentives Received', 'Liability', '20010', 1);

-- 52040: Depreciation — ROU Tower Sites (monthly expense)
IF NOT EXISTS (SELECT 1 FROM accounting.gl_chart_of_accounts WHERE account_code = '52040')
    INSERT INTO accounting.gl_chart_of_accounts (account_code, account_name, account_type, parent_code, is_active)
    VALUES ('52040', 'Depreciation — ROU Tower Sites', 'Expense', '52000', 1);

-- 51030: Finance Cost — Lease Interest (Tower Sites)
IF NOT EXISTS (SELECT 1 FROM accounting.gl_chart_of_accounts WHERE account_code = '51030')
    INSERT INTO accounting.gl_chart_of_accounts (account_code, account_name, account_type, parent_code, is_active)
    VALUES ('51030', 'Finance Cost — Lease Interest (Tower Sites)', 'Expense', '51000', 1);

-- ------------------------------------------------------------
-- STEP 2: Create sp_PostInitialRecognitionJV
-- Posts the Day-1 IFRS 16 Initial Recognition JV:
--   Dr Right-of-Use Asset     = rou_asset_value + idc
--   Cr Lease Liability        = lease_liability_commence
--   Cr Accrued IDC            = idc (if idc > 0)
--   Dr Security Deposit       = security_deposit (if > 0)
--   Cr Bank / Accruals        = security_deposit (if > 0)
--   Cr Lease Incentives       = lease_incentives (if > 0)
--   Dr ROU Asset (reduction)  = -lease_incentives (if > 0)
-- ------------------------------------------------------------

IF OBJECT_ID('accounting.sp_PostInitialRecognitionJV', 'P') IS NOT NULL
    DROP PROCEDURE accounting.sp_PostInitialRecognitionJV;
GO

CREATE PROCEDURE accounting.sp_PostInitialRecognitionJV
    @contract_id    INT,
    @posted_by      NVARCHAR(100) = 'SYSTEM'
AS
BEGIN
    SET NOCOUNT ON;

    -- --------------------------------------------------------
    -- 1. Fetch contract details
    -- --------------------------------------------------------
    DECLARE
        @contract_ref           NVARCHAR(50),
        @commencement_date      DATE,
        @asset_type             NVARCHAR(100),
        @currency               NVARCHAR(10),
        @rou_asset_value        DECIMAL(18,2),
        @lease_liability        DECIMAL(18,2),
        @idc                    DECIMAL(18,2),
        @security_deposit       DECIMAL(18,2),
        @lease_incentives       DECIMAL(18,2);

    SELECT
        @contract_ref       = contract_ref,
        @commencement_date  = commencement_date,
        @asset_type         = asset_type,
        @currency           = ISNULL(currency, 'QAR'),
        @rou_asset_value    = ISNULL(rou_asset_value, 0),
        @lease_liability    = ISNULL(lease_liability_commence, 0),
        @idc                = ISNULL(initial_direct_costs, 0),
        @security_deposit   = ISNULL(security_deposit, 0),
        @lease_incentives   = ISNULL(lease_incentives, 0)
    FROM lease.contracts
    WHERE contract_id = @contract_id;

    IF @contract_ref IS NULL
    BEGIN
        RAISERROR('Contract not found: %d', 16, 1, @contract_id);
        RETURN;
    END

    -- --------------------------------------------------------
    -- 2. Check if Initial Recognition JV already exists
    -- --------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM accounting.journal_vouchers
        WHERE contract_id = @contract_id
          AND jv_type = 'Initial Recognition'
    )
    BEGIN
        -- Already posted — return the existing JV number
        SELECT jv_number AS existing_jv_number, 'ALREADY_EXISTS' AS result
        FROM accounting.journal_vouchers
        WHERE contract_id = @contract_id AND jv_type = 'Initial Recognition';
        RETURN;
    END

    -- --------------------------------------------------------
    -- 3. Determine GL accounts based on asset type
    -- --------------------------------------------------------
    DECLARE
        @rou_account        NVARCHAR(10),
        @liability_account  NVARCHAR(10);

    SET @rou_account = CASE
        WHEN @asset_type LIKE '%Vehicle%' OR @asset_type LIKE '%Fleet%' THEN '10110'
        WHEN @asset_type LIKE '%Equipment%'                              THEN '10120'
        WHEN @asset_type LIKE '%IT%' OR @asset_type LIKE '%Infra%'      THEN '10130'
        WHEN @asset_type LIKE '%Tower%'                                  THEN '10140'
        ELSE '10100'  -- Property (default)
    END;

    SET @liability_account = CASE
        WHEN @asset_type LIKE '%Vehicle%' OR @asset_type LIKE '%Fleet%' THEN '21030'
        WHEN @asset_type LIKE '%Equipment%'                              THEN '21040'
        WHEN @asset_type LIKE '%IT%' OR @asset_type LIKE '%Infra%'      THEN '21050'
        WHEN @asset_type LIKE '%Tower%'                                  THEN '21060'
        ELSE '21020'  -- Property (default)
    END;

    -- --------------------------------------------------------
    -- 4. Generate JV number
    -- --------------------------------------------------------
    DECLARE @period NVARCHAR(7);
    SET @period = FORMAT(@commencement_date, 'yyyy-MM');

    DECLARE @jv_seq INT;
    SELECT @jv_seq = ISNULL(MAX(CAST(SUBSTRING(jv_number, 10, 5) AS INT)), 0) + 1
    FROM accounting.journal_vouchers
    WHERE jv_number LIKE 'JV-' + FORMAT(@commencement_date, 'yyyyMM') + '-%';

    DECLARE @jv_number NVARCHAR(30);
    SET @jv_number = 'JV-' + FORMAT(@commencement_date, 'yyyyMM') + '-' + RIGHT('00000' + CAST(@jv_seq AS NVARCHAR), 5);

    -- --------------------------------------------------------
    -- 5. Insert JV header
    -- --------------------------------------------------------
    DECLARE @jv_id INT;

    INSERT INTO accounting.journal_vouchers
        (jv_number, jv_type, jv_date, period, contract_id, description,
         currency, total_debit, total_credit, status, created_by, created_at)
    VALUES
        (@jv_number, 'Initial Recognition', @commencement_date, @period,
         @contract_id,
         'IFRS 16 Day-1 Initial Recognition — ' + @contract_ref,
         @currency,
         @rou_asset_value + @idc + @security_deposit,
         @lease_liability + @idc + @security_deposit - @lease_incentives,
         'Draft',
         @posted_by,
         GETUTCDATE());

    SET @jv_id = SCOPE_IDENTITY();

    -- --------------------------------------------------------
    -- 6. Insert JV lines
    -- --------------------------------------------------------
    DECLARE @line INT = 1;

    -- Line 1: Dr Right-of-Use Asset (full ROU value including IDC, net of incentives)
    DECLARE @rou_dr DECIMAL(18,2) = @rou_asset_value + @idc - @lease_incentives;
    INSERT INTO accounting.jv_lines
        (jv_id, line_number, dr_cr, account_code, amount, description)
    VALUES
        (@jv_id, @line, 'Dr', @rou_account,
         @rou_dr,
         'Right-of-Use Asset — initial recognition at commencement date (PV of payments + IDC - incentives)');
    SET @line = @line + 1;

    -- Line 2: Cr Lease Liability (PV of future lease payments)
    INSERT INTO accounting.jv_lines
        (jv_id, line_number, dr_cr, account_code, amount, description)
    VALUES
        (@jv_id, @line, 'Cr', @liability_account,
         @lease_liability,
         'Lease Liability — present value of future lease payments discounted at IBR');
    SET @line = @line + 1;

    -- Line 3 (conditional): Cr Accrued IDC if IDC > 0
    IF @idc > 0
    BEGIN
        INSERT INTO accounting.jv_lines
            (jv_id, line_number, dr_cr, account_code, amount, description)
        VALUES
            (@jv_id, @line, 'Cr', '20020',
             @idc,
             'Accrued Initial Direct Costs — legal fees, broker commission, registration fees');
        SET @line = @line + 1;
    END

    -- Line 4 (conditional): Cr Lease Incentives if > 0
    IF @lease_incentives > 0
    BEGIN
        INSERT INTO accounting.jv_lines
            (jv_id, line_number, dr_cr, account_code, amount, description)
        VALUES
            (@jv_id, @line, 'Cr', '20030',
             @lease_incentives,
             'Lease Incentives Received — reduces the ROU asset value');
        SET @line = @line + 1;
    END

    -- Line 5 (conditional): Dr Security Deposit if > 0
    IF @security_deposit > 0
    BEGIN
        INSERT INTO accounting.jv_lines
            (jv_id, line_number, dr_cr, account_code, amount, description)
        VALUES
            (@jv_id, @line, 'Dr', '12020',
             @security_deposit,
             'Security Deposit Paid to Lessor — refundable at lease end');
        SET @line = @line + 1;

        INSERT INTO accounting.jv_lines
            (jv_id, line_number, dr_cr, account_code, amount, description)
        VALUES
            (@jv_id, @line, 'Cr', '11000',
             @security_deposit,
             'Bank — payment of security deposit to lessor');
        SET @line = @line + 1;
    END

    -- --------------------------------------------------------
    -- 7. Return the new JV details
    -- --------------------------------------------------------
    SELECT
        @jv_id      AS jv_id,
        @jv_number  AS jv_number,
        @period     AS period,
        @rou_dr     AS rou_debit,
        @lease_liability AS liability_credit,
        'CREATED'   AS result;
END
GO
