-- ============================================================
-- VodaLease Enterprise — Stored Procedures (SPP)
-- ALL DML and SELECT operations via stored procedures
-- ============================================================

USE leasing;
GO

-- ============================================================
-- SP: Dashboard KPIs
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetDashboardKPIs
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        (SELECT COUNT(*) FROM lease.contracts WHERE status = 'Active') AS total_active_leases,
        (SELECT ISNULL(SUM(closing_liability),0) FROM lease.amortisation_schedule a
         INNER JOIN lease.contracts c ON a.contract_id = c.contract_id
         WHERE c.status = 'Active'
           AND a.period_date = (SELECT MAX(period_date) FROM lease.amortisation_schedule a2
                                WHERE a2.contract_id = a.contract_id)) AS total_lease_liability,
        (SELECT ISNULL(SUM(rou_nbv),0) FROM lease.amortisation_schedule a
         INNER JOIN lease.contracts c ON a.contract_id = c.contract_id
         WHERE c.status = 'Active'
           AND a.period_date = (SELECT MAX(period_date) FROM lease.amortisation_schedule a2
                                WHERE a2.contract_id = a.contract_id)) AS total_rou_nbv,
        (SELECT ISNULL(SUM(total),0) FROM payables.invoices
         WHERE due_date BETWEEN GETUTCDATE() AND DATEADD(DAY,30,GETUTCDATE())
           AND status NOT IN ('Paid','Cancelled')) AS payments_due_30d,
        (SELECT ISNULL(SUM(total),0) FROM payables.invoices
         WHERE due_date < GETUTCDATE() AND status NOT IN ('Paid','Cancelled')) AS overdue_payables,
        (SELECT ISNULL(SUM(depreciation),0) FROM lease.amortisation_schedule a
         INNER JOIN lease.contracts c ON a.contract_id = c.contract_id
         WHERE c.status = 'Active'
           AND YEAR(a.period_date) = YEAR(GETUTCDATE())) AS ytd_depreciation,
        (SELECT ISNULL(SUM(interest_expense),0) FROM lease.amortisation_schedule a
         INNER JOIN lease.contracts c ON a.contract_id = c.contract_id
         WHERE c.status = 'Active'
           AND YEAR(a.period_date) = YEAR(GETUTCDATE())) AS ytd_interest,
        (SELECT COUNT(*) FROM security.maker_checker_queue
         WHERE outcome = 'Pending') AS pending_approvals,
        (SELECT COUNT(*) FROM compliance.error_log
         WHERE resolution_status = 'Open' AND severity IN ('Error','Critical')) AS open_errors;
END;
GO

-- ============================================================
-- SP: Lease Register (Paginated)
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetLeaseRegister
    @PageNumber     INT = 1,
    @PageSize       INT = 100,
    @StatusFilter   VARCHAR(30) = NULL,
    @AssetType      VARCHAR(50) = NULL,
    @SearchTerm     NVARCHAR(200) = NULL,
    @SortColumn     VARCHAR(50) = 'created_at',
    @SortDirection  VARCHAR(4) = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
    SELECT
        c.contract_id, c.contract_ref, c.status,
        c.asset_type, c.asset_description, c.asset_tag,
        l.legal_name AS lessor_name, l.country AS lessor_country,
        c.commencement_date, c.expiry_date, c.term_months,
        c.monthly_payment, c.currency,
        c.rou_asset_value, c.lease_liability_commence,
        c.ifrs16_classification, c.is_lto,
        c.maintenance_responsibility,
        u1.username AS maker_name, u2.username AS checker_name,
        c.approved_at, c.created_at,
        COUNT(*) OVER() AS total_count
    FROM lease.contracts c
    INNER JOIN lease.lessors l ON c.lessor_id = l.lessor_id
    LEFT JOIN security.users u1 ON c.maker_id = u1.user_id
    LEFT JOIN security.users u2 ON c.checker_id = u2.user_id
    WHERE (@StatusFilter IS NULL OR c.status = @StatusFilter)
      AND (@AssetType IS NULL OR c.asset_type = @AssetType)
      AND (@SearchTerm IS NULL
           OR c.contract_ref LIKE '%' + @SearchTerm + '%'
           OR l.legal_name LIKE '%' + @SearchTerm + '%'
           OR c.asset_description LIKE '%' + @SearchTerm + '%')
    ORDER BY
        CASE WHEN @SortColumn = 'contract_ref' AND @SortDirection = 'ASC'  THEN c.contract_ref END ASC,
        CASE WHEN @SortColumn = 'contract_ref' AND @SortDirection = 'DESC' THEN c.contract_ref END DESC,
        CASE WHEN @SortColumn = 'expiry_date'  AND @SortDirection = 'ASC'  THEN c.expiry_date END ASC,
        CASE WHEN @SortColumn = 'expiry_date'  AND @SortDirection = 'DESC' THEN c.expiry_date END DESC,
        CASE WHEN @SortColumn = 'monthly_payment' AND @SortDirection = 'ASC'  THEN c.monthly_payment END ASC,
        CASE WHEN @SortColumn = 'monthly_payment' AND @SortDirection = 'DESC' THEN c.monthly_payment END DESC,
        c.created_at DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO

-- ============================================================
-- SP: Get Lease By ID
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetLeaseById
    @ContractId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        c.*,
        l.legal_name AS lessor_name, l.registration_no, l.tax_no,
        l.country AS lessor_country, l.currency AS lessor_currency,
        l.contact_json, l.status AS lessor_status,
        u1.username AS maker_name, u1.email AS maker_email,
        u2.username AS checker_name, u2.email AS checker_email
    FROM lease.contracts c
    INNER JOIN lease.lessors l ON c.lessor_id = l.lessor_id
    LEFT JOIN security.users u1 ON c.maker_id = u1.user_id
    LEFT JOIN security.users u2 ON c.checker_id = u2.user_id
    WHERE c.contract_id = @ContractId;
END;
GO

-- ============================================================
-- SP: Create Lease
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_CreateLease
    @LessorId               INT,
    @AssetType              VARCHAR(50),
    @AssetDescription       NVARCHAR(500),
    @AssetTag               VARCHAR(100),
    @LocationJson           NVARCHAR(MAX),
    @CommencementDate       DATE,
    @ExpiryDate             DATE,
    @TermMonths             INT,
    @MonthlyPayment         DECIMAL(18,2),
    @Currency               CHAR(3),
    @EscalationRate         DECIMAL(8,4),
    @EscalationDate         DATE,
    @IBR                    DECIMAL(8,6),
    @DepositAmount          DECIMAL(18,2),
    @IFRS16Classification   VARCHAR(20),
    @RenewalOption          BIT,
    @RenewalCertain         BIT,
    @PurchaseOption         BIT,
    @PurchaseCertain        BIT,
    @MakeGoodObligation     BIT,
    @MakeGoodEstimate       DECIMAL(18,2),
    @InitialDirectCosts     DECIMAL(18,2),
    @LeaseIncentives        DECIMAL(18,2),
    @IsLTO                  BIT,
    @LTOPurchasePrice       DECIMAL(18,2),
    @LTODeposit             DECIMAL(18,2),
    @LTONetFinanced         DECIMAL(18,2),
    @LTOTotalInstalments    INT,
    @LTOInstalmentAmount    DECIMAL(18,2),
    @LTOFrequency           VARCHAR(20),
    @LTOFinanceChargeRate   DECIMAL(8,6),
    @LTOBalloonAmount       DECIMAL(18,2),
    @LTOTransferDate        DATE,
    @MaintenanceResp        VARCHAR(20),
    @MakerId                INT,
    @ScreenId               VARCHAR(20),
    @ProcessStartTime       DATETIME2
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ContractRef VARCHAR(30);
    DECLARE @Year INT = YEAR(GETUTCDATE());
    DECLARE @Seq INT;
    SELECT @Seq = ISNULL(MAX(contract_id),0) + 1 FROM lease.contracts;
    SET @ContractRef = 'LSE-' + CAST(@Year AS VARCHAR) + '-' + RIGHT('000000' + CAST(@Seq AS VARCHAR), 6);

    INSERT INTO lease.contracts (
        contract_ref, lessor_id, asset_type, asset_description, asset_tag,
        location_json, commencement_date, expiry_date, term_months,
        monthly_payment, currency, escalation_rate, escalation_date,
        ibr, deposit_amount, ifrs16_classification, renewal_option, renewal_certain,
        purchase_option, purchase_certain, make_good_obligation, make_good_estimate,
        initial_direct_costs, lease_incentives, is_lto, lto_purchase_price,
        lto_deposit, lto_net_financed, lto_total_instalments, lto_instalment_amount,
        lto_frequency, lto_finance_charge_rate, lto_balloon_amount, lto_transfer_date,
        maintenance_responsibility, status, maker_id, screen_id,
        process_start_time, process_end_time, elapsed_ms, created_at, updated_at
    ) VALUES (
        @ContractRef, @LessorId, @AssetType, @AssetDescription, @AssetTag,
        @LocationJson, @CommencementDate, @ExpiryDate, @TermMonths,
        @MonthlyPayment, @Currency, @EscalationRate, @EscalationDate,
        @IBR, @DepositAmount, @IFRS16Classification, @RenewalOption, @RenewalCertain,
        @PurchaseOption, @PurchaseCertain, @MakeGoodObligation, @MakeGoodEstimate,
        @InitialDirectCosts, @LeaseIncentives, @IsLTO, @LTOPurchasePrice,
        @LTODeposit, @LTONetFinanced, @LTOTotalInstalments, @LTOInstalmentAmount,
        @LTOFrequency, @LTOFinanceChargeRate, @LTOBalloonAmount, @LTOTransferDate,
        @MaintenanceResp, 'Draft', @MakerId, @ScreenId,
        @ProcessStartTime, GETUTCDATE(),
        DATEDIFF(MILLISECOND, @ProcessStartTime, GETUTCDATE()),
        GETUTCDATE(), GETUTCDATE()
    );

    SELECT SCOPE_IDENTITY() AS contract_id, @ContractRef AS contract_ref;
END;
GO

-- ============================================================
-- SP: Submit Lease for Approval
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_SubmitLeaseForApproval
    @ContractId     INT,
    @MakerId        INT,
    @ScreenId       VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @QueueRef VARCHAR(30);
    DECLARE @Seq INT;
    SELECT @Seq = ISNULL(MAX(queue_id),0) + 1 FROM security.maker_checker_queue;
    SET @QueueRef = 'MCQ-' + CAST(YEAR(GETUTCDATE()) AS VARCHAR) + '-' + RIGHT('000000' + CAST(@Seq AS VARCHAR), 6);

    UPDATE lease.contracts SET status = 'Submitted', updated_at = GETUTCDATE()
    WHERE contract_id = @ContractId;

    DECLARE @Summary NVARCHAR(500);
    DECLARE @Value DECIMAL(18,2);
    DECLARE @Currency CHAR(3);
    SELECT @Summary = 'Lease: ' + contract_ref + ' | ' + asset_type + ' | ' + asset_description,
           @Value = lease_liability_commence, @Currency = currency
    FROM lease.contracts WHERE contract_id = @ContractId;

    INSERT INTO security.maker_checker_queue (
        queue_ref, module, record_type, record_id, record_summary,
        value, currency, submitted_by, outcome, sla_due_at, screen_id
    ) VALUES (
        @QueueRef, 'Lease', 'LeaseContract', CAST(@ContractId AS VARCHAR),
        @Summary, @Value, @Currency, @MakerId, 'Pending',
        DATEADD(HOUR, 24, GETUTCDATE()), @ScreenId
    );

    SELECT @QueueRef AS queue_ref;
END;
GO

-- ============================================================
-- SP: Approve / Reject Lease
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_ApproveRejectLease
    @ContractId     INT,
    @CheckerId      INT,
    @Outcome        VARCHAR(20),  -- Approved/Rejected
    @Reason         NVARCHAR(1000),
    @ScreenId       VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @NewStatus VARCHAR(30) = CASE WHEN @Outcome = 'Approved' THEN 'Active' ELSE 'Draft' END;

    UPDATE lease.contracts
    SET status = @NewStatus, checker_id = @CheckerId,
        approved_at = CASE WHEN @Outcome = 'Approved' THEN GETUTCDATE() ELSE NULL END,
        updated_at = GETUTCDATE()
    WHERE contract_id = @ContractId;

    UPDATE security.maker_checker_queue
    SET outcome = @Outcome, checker_id = @CheckerId,
        actioned_at = GETUTCDATE(), rejection_reason = @Reason
    WHERE record_id = CAST(@ContractId AS VARCHAR) AND record_type = 'LeaseContract'
      AND outcome = 'Pending';

    SELECT @NewStatus AS new_status;
END;
GO

-- ============================================================
-- SP: Get Lessors
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetLessors
    @SearchTerm NVARCHAR(200) = NULL,
    @Status     VARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT lessor_id, lessor_ref, legal_name, registration_no, tax_no,
           country, currency, contact_json, status, created_at
    FROM lease.lessors
    WHERE (@SearchTerm IS NULL OR legal_name LIKE '%' + @SearchTerm + '%'
           OR lessor_ref LIKE '%' + @SearchTerm + '%')
      AND (@Status IS NULL OR status = @Status)
    ORDER BY legal_name;
END;
GO

-- ============================================================
-- SP: Create Lessor
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_CreateLessor
    @LegalName      NVARCHAR(300),
    @RegistrationNo VARCHAR(100),
    @TaxNo          VARCHAR(100),
    @Country        CHAR(2),
    @Currency       CHAR(3),
    @BankDetailsEnc NVARCHAR(MAX),
    @ContactJson    NVARCHAR(MAX),
    @CreatedBy      INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @LessorRef VARCHAR(20);
    DECLARE @Seq INT;
    SELECT @Seq = ISNULL(MAX(lessor_id),0) + 1 FROM lease.lessors;
    SET @LessorRef = 'LSR-' + CAST(YEAR(GETUTCDATE()) AS VARCHAR) + '-' + RIGHT('000000' + CAST(@Seq AS VARCHAR), 6);

    INSERT INTO lease.lessors (lessor_ref, legal_name, registration_no, tax_no,
        country, currency, bank_details_enc, contact_json, created_by)
    VALUES (@LessorRef, @LegalName, @RegistrationNo, @TaxNo,
        @Country, @Currency, @BankDetailsEnc, @ContactJson, @CreatedBy);

    SELECT SCOPE_IDENTITY() AS lessor_id, @LessorRef AS lessor_ref;
END;
GO

-- ============================================================
-- SP: Save Amortisation Schedule
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_SaveAmortisationSchedule
    @ContractId     INT,
    @ScheduleJson   NVARCHAR(MAX)  -- JSON array of schedule rows
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM lease.amortisation_schedule WHERE contract_id = @ContractId;

    INSERT INTO lease.amortisation_schedule (
        contract_id, period_date, opening_liability, interest_expense,
        payment, principal, closing_liability, rou_nbv, depreciation, cumulative_depr
    )
    SELECT @ContractId,
           CAST(JSON_VALUE(v.value, '$.period_date') AS DATE),
           CAST(JSON_VALUE(v.value, '$.opening_liability') AS DECIMAL(18,2)),
           CAST(JSON_VALUE(v.value, '$.interest_expense') AS DECIMAL(18,2)),
           CAST(JSON_VALUE(v.value, '$.payment') AS DECIMAL(18,2)),
           CAST(JSON_VALUE(v.value, '$.principal') AS DECIMAL(18,2)),
           CAST(JSON_VALUE(v.value, '$.closing_liability') AS DECIMAL(18,2)),
           CAST(JSON_VALUE(v.value, '$.rou_nbv') AS DECIMAL(18,2)),
           CAST(JSON_VALUE(v.value, '$.depreciation') AS DECIMAL(18,2)),
           CAST(JSON_VALUE(v.value, '$.cumulative_depr') AS DECIMAL(18,2))
    FROM OPENJSON(@ScheduleJson) v;

    SELECT @@ROWCOUNT AS rows_inserted;
END;
GO

-- ============================================================
-- SP: Get Amortisation Schedule
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetAmortisationSchedule
    @ContractId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM lease.amortisation_schedule
    WHERE contract_id = @ContractId
    ORDER BY period_date;
END;
GO

-- ============================================================
-- SP: Get Invoice Register (Paginated)
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetInvoiceRegister
    @PageNumber     INT = 1,
    @PageSize       INT = 100,
    @StatusFilter   VARCHAR(30) = NULL,
    @SearchTerm     NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
    SELECT
        i.invoice_id, i.invoice_ref, i.invoice_number, i.invoice_date,
        i.period_month, i.period_year, i.total, i.currency, i.due_date,
        i.status, i.discrepancy_flag,
        l.legal_name AS lessor_name,
        c.contract_ref, c.asset_type,
        u1.username AS maker_name,
        COUNT(*) OVER() AS total_count
    FROM payables.invoices i
    INNER JOIN lease.lessors l ON i.lessor_id = l.lessor_id
    LEFT JOIN lease.contracts c ON i.contract_id = c.contract_id
    LEFT JOIN security.users u1 ON i.maker_id = u1.user_id
    WHERE (@StatusFilter IS NULL OR i.status = @StatusFilter)
      AND (@SearchTerm IS NULL
           OR i.invoice_ref LIKE '%' + @SearchTerm + '%'
           OR l.legal_name LIKE '%' + @SearchTerm + '%'
           OR i.invoice_number LIKE '%' + @SearchTerm + '%')
    ORDER BY i.created_at DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO

-- ============================================================
-- SP: Create Invoice
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_CreateInvoice
    @LessorId       INT,
    @ContractId     INT,
    @InvoiceNumber  VARCHAR(100),
    @InvoiceDate    DATE,
    @PeriodMonth    INT,
    @PeriodYear     INT,
    @RentAmount     DECIMAL(18,2),
    @ServiceCharge  DECIMAL(18,2),
    @VAT            DECIMAL(18,2),
    @Total          DECIMAL(18,2),
    @Currency       CHAR(3),
    @GLAccount      VARCHAR(10),
    @CostCentre     VARCHAR(20),
    @DueDate        DATE,
    @OCRExtractedJson NVARCHAR(MAX),
    @DiscrepancyFlag BIT,
    @MakerId        INT,
    @ScreenId       VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InvoiceRef VARCHAR(30);
    DECLARE @Seq INT;
    SELECT @Seq = ISNULL(MAX(invoice_id),0) + 1 FROM payables.invoices;
    SET @InvoiceRef = 'INV-' + CAST(YEAR(GETUTCDATE()) AS VARCHAR) + '-' + RIGHT('000000' + CAST(@Seq AS VARCHAR), 6);

    INSERT INTO payables.invoices (
        invoice_ref, lessor_id, contract_id, invoice_number, invoice_date,
        period_month, period_year, rent_amount, service_charge, vat, total,
        currency, gl_account, cost_centre, due_date, ocr_extracted_json,
        discrepancy_flag, maker_id, screen_id, process_start_time,
        process_end_time, elapsed_ms
    ) VALUES (
        @InvoiceRef, @LessorId, @ContractId, @InvoiceNumber, @InvoiceDate,
        @PeriodMonth, @PeriodYear, @RentAmount, @ServiceCharge, @VAT, @Total,
        @Currency, @GLAccount, @CostCentre, @DueDate, @OCRExtractedJson,
        @DiscrepancyFlag, @MakerId, @ScreenId, GETUTCDATE(), GETUTCDATE(), 0
    );

    SELECT SCOPE_IDENTITY() AS invoice_id, @InvoiceRef AS invoice_ref;
END;
GO

-- ============================================================
-- SP: Approve Invoice
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_ApproveInvoice
    @InvoiceId      INT,
    @CheckerId      INT,
    @Outcome        VARCHAR(20),
    @Reason         NVARCHAR(1000),
    @ScreenId       VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @NewStatus VARCHAR(30) = CASE WHEN @Outcome = 'Approved' THEN 'Approved' ELSE 'Draft' END;
    UPDATE payables.invoices
    SET status = @NewStatus, checker_id = @CheckerId, updated_at = GETUTCDATE()
    WHERE invoice_id = @InvoiceId;
    SELECT @NewStatus AS new_status;
END;
GO

-- ============================================================
-- SP: Create Payment Run
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_CreatePaymentRun
    @RunDate        DATE,
    @TotalAmount    DECIMAL(18,2),
    @Currency       CHAR(3),
    @BankFileFormat VARCHAR(10),
    @InvoiceIdsJson NVARCHAR(MAX),  -- JSON array of {invoice_id, amount}
    @MakerId        INT,
    @ScreenId       VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @RunRef VARCHAR(30);
    DECLARE @Seq INT;
    SELECT @Seq = ISNULL(MAX(run_id),0) + 1 FROM payables.payment_runs;
    SET @RunRef = 'PMT-' + CAST(YEAR(GETUTCDATE()) AS VARCHAR) + '-' + RIGHT('000000' + CAST(@Seq AS VARCHAR), 6);

    INSERT INTO payables.payment_runs (run_ref, run_date, total_amount, currency,
        bank_file_format, status, maker_id, screen_id)
    VALUES (@RunRef, @RunDate, @TotalAmount, @Currency, @BankFileFormat, 'Draft', @MakerId, @ScreenId);

    DECLARE @RunId INT = SCOPE_IDENTITY();

    INSERT INTO payables.payment_run_lines (run_id, invoice_id, amount, currency)
    SELECT @RunId,
           CAST(JSON_VALUE(v.value, '$.invoice_id') AS INT),
           CAST(JSON_VALUE(v.value, '$.amount') AS DECIMAL(18,2)),
           @Currency
    FROM OPENJSON(@InvoiceIdsJson) v;

    SELECT @RunId AS run_id, @RunRef AS run_ref;
END;
GO

-- ============================================================
-- SP: Get Maker/Checker Queue
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMakerCheckerQueue
    @CheckerId      INT = NULL,
    @Module         VARCHAR(50) = NULL,
    @Outcome        VARCHAR(20) = 'Pending',
    @PageNumber     INT = 1,
    @PageSize       INT = 50
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
    SELECT
        q.queue_id, q.queue_ref, q.module, q.record_type, q.record_id,
        q.record_summary, q.value, q.currency,
        u.username AS submitted_by_name, q.submitted_at,
        q.outcome, q.sla_due_at,
        CASE WHEN q.sla_due_at < GETUTCDATE() THEN 'Red'
             WHEN q.sla_due_at < DATEADD(HOUR,4,GETUTCDATE()) THEN 'Amber'
             ELSE 'Green' END AS sla_status,
        DATEDIFF(MINUTE, q.submitted_at, GETUTCDATE()) AS minutes_pending,
        COUNT(*) OVER() AS total_count
    FROM security.maker_checker_queue q
    INNER JOIN security.users u ON q.submitted_by = u.user_id
    WHERE (@Module IS NULL OR q.module = @Module)
      AND (@Outcome IS NULL OR q.outcome = @Outcome)
    ORDER BY q.sla_due_at ASC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO

-- ============================================================
-- SP: Write Audit Log
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_WriteAuditLog
    @UserId         INT,
    @Username       VARCHAR(100),
    @UserRole       VARCHAR(50),
    @IPAddress      VARCHAR(45),
    @DeviceFingerprint VARCHAR(200),
    @BrowserOS      VARCHAR(200),
    @Module         VARCHAR(50),
    @SubModule      VARCHAR(50),
    @ActionType     VARCHAR(50),
    @RecordTable    VARCHAR(100),
    @RecordId       VARCHAR(50),
    @BeforeState    NVARCHAR(MAX),
    @AfterState     NVARCHAR(MAX),
    @Outcome        VARCHAR(20),
    @ScreenId       VARCHAR(20),
    @ProcessStartTime DATETIME2,
    @ProcessEndTime DATETIME2
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @AuditNo VARCHAR(30);
    DECLARE @Seq INT;
    SELECT @Seq = ISNULL(MAX(CAST(RIGHT(audit_no,6) AS INT)),0) + 1 FROM compliance.audit_log;
    SET @AuditNo = 'AUD-' + CAST(YEAR(GETUTCDATE()) AS VARCHAR) + '-' + RIGHT('000000' + CAST(@Seq AS VARCHAR), 6);

    INSERT INTO compliance.audit_log (
        audit_no, user_id, username, user_role, ip_address, device_fingerprint,
        browser_os, module, sub_module, action_type, record_table, record_id,
        before_state, after_state, outcome, screen_id,
        process_start_time, process_end_time, elapsed_ms
    ) VALUES (
        @AuditNo, @UserId, @Username, @UserRole, @IPAddress, @DeviceFingerprint,
        @BrowserOS, @Module, @SubModule, @ActionType, @RecordTable, @RecordId,
        @BeforeState, @AfterState, @Outcome, @ScreenId,
        @ProcessStartTime, @ProcessEndTime,
        DATEDIFF(MILLISECOND, @ProcessStartTime, @ProcessEndTime)
    );

    SELECT @AuditNo AS audit_no;
END;
GO

-- ============================================================
-- SP: Get Audit Log
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetAuditLog
    @Module         VARCHAR(50) = NULL,
    @UserId         INT = NULL,
    @ActionType     VARCHAR(50) = NULL,
    @FromDate       DATETIME2 = NULL,
    @ToDate         DATETIME2 = NULL,
    @PageNumber     INT = 1,
    @PageSize       INT = 100
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
    SELECT
        log_id, audit_no, timestamp_utc, username, user_role,
        module, sub_module, action_type, record_table, record_id,
        outcome, screen_id, elapsed_ms,
        COUNT(*) OVER() AS total_count
    FROM compliance.audit_log
    WHERE (@Module IS NULL OR module = @Module)
      AND (@UserId IS NULL OR user_id = @UserId)
      AND (@ActionType IS NULL OR action_type = @ActionType)
      AND (@FromDate IS NULL OR timestamp_utc >= @FromDate)
      AND (@ToDate IS NULL OR timestamp_utc <= @ToDate)
    ORDER BY timestamp_utc DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO

-- ============================================================
-- SP: Write Error Log
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_WriteErrorLog
    @Severity       VARCHAR(20),
    @Module         VARCHAR(50),
    @ErrorCode      VARCHAR(50),
    @Message        NVARCHAR(500),
    @FullMessage    NVARCHAR(MAX),
    @StackTrace     NVARCHAR(MAX),
    @UserContext    NVARCHAR(MAX),
    @JobContext     NVARCHAR(MAX),
    @ScreenId       VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ErrorNo VARCHAR(30);
    DECLARE @Seq INT;
    SELECT @Seq = ISNULL(MAX(error_id),0) + 1 FROM compliance.error_log;
    SET @ErrorNo = 'ERR-' + CAST(YEAR(GETUTCDATE()) AS VARCHAR) + '-' + RIGHT('000000' + CAST(@Seq AS VARCHAR), 6);

    INSERT INTO compliance.error_log (
        error_no, severity, module, error_code, message, full_message,
        stack_trace, user_context, job_context, screen_id
    ) VALUES (
        @ErrorNo, @Severity, @Module, @ErrorCode, @Message, @FullMessage,
        @StackTrace, @UserContext, @JobContext, @ScreenId
    );

    SELECT @ErrorNo AS error_no;
END;
GO

-- ============================================================
-- SP: Post GL Journal
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_PostGLJournal
    @TransactionDate DATE,
    @Period         VARCHAR(7),
    @Source         VARCHAR(50),
    @Description    NVARCHAR(500),
    @Currency       CHAR(3),
    @LinesJson      NVARCHAR(MAX), -- JSON array of GL lines
    @MakerId        INT,
    @ScreenId       VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @JournalRef VARCHAR(30);
    DECLARE @Seq INT;
    SELECT @Seq = ISNULL(MAX(journal_id),0) + 1 FROM finance.gl_journals;
    SET @JournalRef = 'JNL-' + CAST(YEAR(GETUTCDATE()) AS VARCHAR) + '-' + RIGHT('000000' + CAST(@Seq AS VARCHAR), 6);

    INSERT INTO finance.gl_journals (journal_ref, transaction_date, period, source,
        description, currency, status, maker_id, screen_id, process_start_time)
    VALUES (@JournalRef, @TransactionDate, @Period, @Source,
        @Description, @Currency, 'Draft', @MakerId, @ScreenId, GETUTCDATE());

    DECLARE @JournalId INT = SCOPE_IDENTITY();

    INSERT INTO finance.gl_lines (journal_id, account_code, description, cost_centre,
        debit, credit, department, project_code)
    SELECT @JournalId,
           JSON_VALUE(v.value, '$.account_code'),
           JSON_VALUE(v.value, '$.description'),
           JSON_VALUE(v.value, '$.cost_centre'),
           CAST(ISNULL(JSON_VALUE(v.value, '$.debit'), 0) AS DECIMAL(18,2)),
           CAST(ISNULL(JSON_VALUE(v.value, '$.credit'), 0) AS DECIMAL(18,2)),
           JSON_VALUE(v.value, '$.department'),
           JSON_VALUE(v.value, '$.project_code')
    FROM OPENJSON(@LinesJson) v;

    SELECT @JournalId AS journal_id, @JournalRef AS journal_ref;
END;
GO

-- ============================================================
-- SP: Get Portfolio Analytics
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetPortfolioAnalytics
AS
BEGIN
    SET NOCOUNT ON;
    -- Maturity Profile (next 24 months)
    SELECT
        FORMAT(expiry_date, 'yyyy-MM') AS month,
        COUNT(*) AS lease_count,
        SUM(monthly_payment) AS monthly_value
    FROM lease.contracts
    WHERE status = 'Active'
      AND expiry_date BETWEEN GETUTCDATE() AND DATEADD(MONTH, 24, GETUTCDATE())
    GROUP BY FORMAT(expiry_date, 'yyyy-MM')
    ORDER BY month;
END;
GO

-- ============================================================
-- SP: Get Cash Flow Forecast
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetCashFlowForecast
    @Months INT = 12
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        FORMAT(a.period_date, 'yyyy-MM') AS period,
        SUM(a.payment) AS total_payment,
        SUM(a.interest_expense) AS total_interest,
        SUM(a.principal) AS total_principal,
        COUNT(DISTINCT a.contract_id) AS lease_count
    FROM lease.amortisation_schedule a
    INNER JOIN lease.contracts c ON a.contract_id = c.contract_id
    WHERE c.status = 'Active'
      AND a.period_date BETWEEN GETUTCDATE() AND DATEADD(MONTH, @Months, GETUTCDATE())
    GROUP BY FORMAT(a.period_date, 'yyyy-MM')
    ORDER BY period;
END;
GO

-- ============================================================
-- SP: Upsert User
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_UpsertUser
    @OpenId     VARCHAR(100),
    @Username   VARCHAR(100),
    @Email      VARCHAR(320),
    @Role       VARCHAR(50) = 'ReadOnly'
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM security.users WHERE open_id = @OpenId)
    BEGIN
        UPDATE security.users
        SET username = @Username, email = @Email, last_login = GETUTCDATE(), updated_at = GETUTCDATE()
        WHERE open_id = @OpenId;
    END
    ELSE
    BEGIN
        INSERT INTO security.users (open_id, username, email, role)
        VALUES (@OpenId, @Username, @Email, @Role);
    END
    SELECT user_id, open_id, username, email, role, status FROM security.users WHERE open_id = @OpenId;
END;
GO

-- ============================================================
-- SP: Get Workflow Tasks for User
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetUserTasks
    @UserId     INT,
    @UserRole   VARCHAR(50),
    @Status     VARCHAR(20) = 'Open'
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        t.task_id, t.task_ref, t.task_name, t.task_key,
        t.assigned_role, t.priority, t.due_date, t.status,
        t.created_at, t.sla_hours,
        pi.instance_ref, pi.process_key, pi.business_key, pi.business_entity,
        CASE WHEN t.due_date < GETUTCDATE() THEN 'Red'
             WHEN t.due_date < DATEADD(HOUR,4,GETUTCDATE()) THEN 'Amber'
             ELSE 'Green' END AS sla_status
    FROM workflow.user_tasks t
    INNER JOIN workflow.process_instances pi ON t.instance_id = pi.instance_id
    WHERE t.status = @Status
      AND (t.assigned_user_id = @UserId OR t.assigned_role = @UserRole)
    ORDER BY t.priority DESC, t.due_date ASC;
END;
GO

-- ============================================================
-- SP: Complete Workflow Task
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_CompleteWorkflowTask
    @TaskId     INT,
    @UserId     INT,
    @Outcome    VARCHAR(50),
    @Comment    NVARCHAR(1000),
    @ScreenId   VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE workflow.user_tasks
    SET status = 'Completed', completed_by = @UserId,
        completed_at = GETUTCDATE(), outcome = @Outcome,
        comment = @Comment, screen_id = @ScreenId
    WHERE task_id = @TaskId;
    SELECT @@ROWCOUNT AS rows_updated;
END;
GO

-- ============================================================
-- SP: Get Insurance Policies
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetInsurancePolicies
    @ContractId INT = NULL,
    @Status     VARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        p.policy_id, p.policy_ref, p.provider_name, p.policy_number,
        p.coverage_type, p.premium_amount, p.currency,
        p.valid_from, p.valid_to, p.renewal_alert_days, p.status,
        c.contract_ref, c.asset_description,
        DATEDIFF(DAY, GETUTCDATE(), p.valid_to) AS days_to_expiry
    FROM lease.insurance_policies p
    LEFT JOIN lease.contracts c ON p.contract_id = c.contract_id
    WHERE (@ContractId IS NULL OR p.contract_id = @ContractId)
      AND (@Status IS NULL OR p.status = @Status)
    ORDER BY p.valid_to ASC;
END;
GO

-- ============================================================
-- SP: Get Maintenance Tickets
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMaintenanceTickets
    @ContractId INT = NULL,
    @Status     VARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        t.ticket_id, t.ticket_ref, t.issue_type, t.description,
        t.responsible_party, t.status, t.reported_at, t.sla_due_at,
        t.resolved_at, t.cost_recovery_amount,
        c.contract_ref, c.asset_description, c.asset_type,
        u.username AS reported_by_name
    FROM lease.maintenance_tickets t
    INNER JOIN lease.contracts c ON t.contract_id = c.contract_id
    LEFT JOIN security.users u ON t.reported_by = u.user_id
    WHERE (@ContractId IS NULL OR t.contract_id = @ContractId)
      AND (@Status IS NULL OR t.status = @Status)
    ORDER BY t.reported_at DESC;
END;
GO

-- ============================================================
-- SP: Get MC Thresholds
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMCThresholds
AS
BEGIN
    SET NOCOUNT ON;
    SELECT threshold_id, module, role, max_amount, currency, is_active, updated_at
    FROM security.mc_thresholds
    WHERE is_active = 1
    ORDER BY module, max_amount;
END;
GO

PRINT 'All stored procedures created successfully.';
GO
