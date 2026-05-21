-- ============================================================
-- PERFORMANCE OPTIMIZATION: Covering Indexes & SP Rewrites
-- Targets: sp_GetLeaseRegister, sp_WriteAuditLog, sp_GetAuditLog,
--          sp_GetErrorLog, sp_GetRenewalDueLeases, sp_GetRenewalDueCount
-- ============================================================

-- ── 1. INDEXES FOR lease.contracts ──────────────────────────────
-- Covering index for sp_GetLeaseRegister (filter by status, asset_type, sort by created_at)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contracts_status_assettype_created')
  CREATE NONCLUSTERED INDEX IX_contracts_status_assettype_created
  ON lease.contracts (status, asset_type, created_at DESC)
  INCLUDE (contract_ref, asset_description, asset_tag, lessor_id, commencement_date,
           expiry_date, term_months, monthly_payment, currency, rou_asset_value,
           lease_liability_commence, ifrs16_classification, is_lto,
           maintenance_responsibility, maker_id, checker_id, approved_at);
GO

-- Index for sp_GetRenewalDueLeases/Count (lifecycle_status + end_date range)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contracts_lifecycle_enddate')
  CREATE NONCLUSTERED INDEX IX_contracts_lifecycle_enddate
  ON lease.contracts (lifecycle_status, end_date)
  INCLUDE (contract_id, contract_ref, asset_description, currency, monthly_payment, lessor_id);
GO

-- Index for contract_ref search (LIKE prefix search)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contracts_contractref')
  CREATE NONCLUSTERED INDEX IX_contracts_contractref
  ON lease.contracts (contract_ref)
  INCLUDE (status, asset_type, created_at);
GO

-- ── 2. INDEXES FOR compliance.audit_log ─────────────────────────
-- Covering index for sp_GetAuditLog (timestamp DESC with filters)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_auditlog_timestamp_desc')
  CREATE NONCLUSTERED INDEX IX_auditlog_timestamp_desc
  ON compliance.audit_log (timestamp_utc DESC)
  INCLUDE (log_id, audit_no, username, user_role, module, sub_module,
           action_type, record_table, record_id, outcome, screen_id, elapsed_ms, user_id);
GO

-- Index for sp_GetAuditLog module filter
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_auditlog_module_timestamp')
  CREATE NONCLUSTERED INDEX IX_auditlog_module_timestamp
  ON compliance.audit_log (module, timestamp_utc DESC)
  INCLUDE (log_id, audit_no, username, user_role, sub_module, action_type,
           record_table, record_id, outcome, screen_id, elapsed_ms);
GO

-- Index for sp_WriteAuditLog sequence generation (audit_no MAX)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_auditlog_auditno')
  CREATE NONCLUSTERED INDEX IX_auditlog_auditno
  ON compliance.audit_log (audit_no DESC);
GO

-- ── 3. INDEXES FOR compliance.error_log ─────────────────────────
-- Covering index for sp_GetErrorLog (timestamp DESC with filters)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_errorlog_timestamp_desc')
  CREATE NONCLUSTERED INDEX IX_errorlog_timestamp_desc
  ON compliance.error_log (timestamp_utc DESC)
  INCLUDE (error_id, error_no, severity, module, error_code, message,
           full_message, resolution_status, resolution_note, resolved_at, screen_id);
GO

-- Index for screen_id + severity filter
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_errorlog_screenid_severity')
  CREATE NONCLUSTERED INDEX IX_errorlog_screenid_severity
  ON compliance.error_log (screen_id, severity, timestamp_utc DESC)
  INCLUDE (error_id, error_no, module, error_code, message, resolution_status);
GO

-- ── 4. INDEXES FOR lease.renewals (subquery in renewal SPs) ─────
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_renewals_contractid_status')
  CREATE NONCLUSTERED INDEX IX_renewals_contractid_status
  ON lease.renewals (contract_id, status);
GO

-- ── 5. INDEXES FOR lease.renewal_notifications ──────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_renewal_notif_contractid_type')
  CREATE NONCLUSTERED INDEX IX_renewal_notif_contractid_type
  ON lease.renewal_notifications (contract_id, notif_type);
GO

-- ── 6. SEQUENCE TABLE FOR AUDIT LOG (eliminates MAX scan) ───────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('compliance.audit_sequence') AND type = 'U')
BEGIN
  CREATE TABLE compliance.audit_sequence (
    seq_year INT NOT NULL PRIMARY KEY,
    last_seq INT NOT NULL DEFAULT 0
  );
  -- Seed with current max from audit_log
  DECLARE @maxSeq INT;
  SELECT @maxSeq = ISNULL(MAX(TRY_CAST(RIGHT(audit_no, 6) AS INT)), 0) FROM compliance.audit_log;
  INSERT INTO compliance.audit_sequence (seq_year, last_seq) VALUES (YEAR(GETUTCDATE()), @maxSeq);
END
GO

-- ── 7. OPTIMIZED sp_WriteAuditLog (uses sequence table) ─────────
CREATE OR ALTER PROCEDURE dbo.sp_WriteAuditLog
    @UserId         INT,
    @Username       VARCHAR(100),
    @UserRole       VARCHAR(50),
    @IPAddress      VARCHAR(45) = NULL,
    @DeviceFingerprint VARCHAR(200) = NULL,
    @BrowserOS      VARCHAR(200) = NULL,
    @Module         VARCHAR(50),
    @SubModule      VARCHAR(50) = NULL,
    @ActionType     VARCHAR(50),
    @RecordTable    VARCHAR(100) = NULL,
    @RecordId       VARCHAR(50) = NULL,
    @BeforeState    NVARCHAR(MAX) = NULL,
    @AfterState     NVARCHAR(MAX) = NULL,
    @Outcome        VARCHAR(20),
    @ScreenId       VARCHAR(20),
    @ProcessStartTime DATETIME2,
    @ProcessEndTime DATETIME2 = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @AuditNo VARCHAR(30);
    DECLARE @Seq INT;
    DECLARE @Year INT = YEAR(GETUTCDATE());

    -- Atomic sequence increment (no table scan)
    UPDATE compliance.audit_sequence
    SET @Seq = last_seq = last_seq + 1
    WHERE seq_year = @Year;

    -- If year row doesn't exist yet, create it
    IF @@ROWCOUNT = 0
    BEGIN
      INSERT INTO compliance.audit_sequence (seq_year, last_seq) VALUES (@Year, 1);
      SET @Seq = 1;
    END

    SET @AuditNo = 'AUD-' + CAST(@Year AS VARCHAR) + '-' + RIGHT('000000' + CAST(@Seq AS VARCHAR), 6);

    -- Set end time if not provided
    IF @ProcessEndTime IS NULL SET @ProcessEndTime = GETUTCDATE();

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

-- ── 8. OPTIMIZED sp_GetLeaseRegister (with OPTION RECOMPILE for dynamic filters) ──
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
    FROM lease.contracts c WITH (NOLOCK)
    INNER JOIN lease.lessors l WITH (NOLOCK) ON c.lessor_id = l.lessor_id
    LEFT JOIN security.users u1 WITH (NOLOCK) ON c.maker_id = u1.user_id
    LEFT JOIN security.users u2 WITH (NOLOCK) ON c.checker_id = u2.user_id
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
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
    OPTION (RECOMPILE);
END;
GO

-- ── 9. OPTIMIZED sp_GetRenewalDueCount (with NOLOCK) ────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetRenewalDueCount
AS
BEGIN
  SET NOCOUNT ON;
  SELECT COUNT(*) AS renewal_due_count
  FROM lease.contracts c WITH (NOLOCK)
  WHERE c.lifecycle_status IN ('Active', 'Modified')
    AND c.end_date IS NOT NULL
    AND CAST(c.end_date AS DATE) BETWEEN CAST(GETUTCDATE() AS DATE)
                                     AND CAST(DATEADD(DAY, 90, GETUTCDATE()) AS DATE)
    AND NOT EXISTS (
      SELECT 1 FROM lease.renewals r WITH (NOLOCK)
      WHERE r.contract_id = c.contract_id
        AND r.status IN ('Pending', 'Approved')
    );
END
GO

-- ── 10. OPTIMIZED sp_GetRenewalDueLeases (with NOLOCK) ──────────
CREATE OR ALTER PROCEDURE dbo.sp_GetRenewalDueLeases
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    c.contract_id,
    c.contract_ref,
    c.asset_description,
    c.currency,
    c.monthly_payment,
    c.end_date AS expiry_date,
    DATEDIFF(DAY, CAST(GETUTCDATE() AS DATE), CAST(c.end_date AS DATE)) AS days_remaining,
    ISNULL(l.lessor_name, 'Unknown Lessor') AS lessor_name,
    c.lifecycle_status
  FROM lease.contracts c WITH (NOLOCK)
  LEFT JOIN lease.lessors l WITH (NOLOCK) ON c.lessor_id = l.lessor_id
  WHERE c.lifecycle_status IN ('Active', 'Modified')
    AND c.end_date IS NOT NULL
    AND CAST(c.end_date AS DATE) BETWEEN CAST(GETUTCDATE() AS DATE)
                                     AND CAST(DATEADD(DAY, 90, GETUTCDATE()) AS DATE)
    AND NOT EXISTS (
      SELECT 1 FROM lease.renewals r WITH (NOLOCK)
      WHERE r.contract_id = c.contract_id
        AND r.status IN ('Pending', 'Approved')
    )
    AND NOT EXISTS (
      SELECT 1 FROM lease.renewal_notifications n WITH (NOLOCK)
      WHERE n.contract_id = c.contract_id
        AND n.notif_type = '90_DAY_RENEWAL'
    )
  ORDER BY days_remaining ASC;
END
GO

-- ── 11. STORED PROCEDURE TO APPLY INDEX (for admin UI) ──────────
IF OBJECT_ID('dbo.sp_ApplyIndex', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ApplyIndex;
GO
CREATE PROCEDURE dbo.sp_ApplyIndex
    @CreateStatement NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    -- Safety check: only allow CREATE INDEX statements
    IF @CreateStatement NOT LIKE 'CREATE%INDEX%'
    BEGIN
      RAISERROR('Only CREATE INDEX statements are allowed', 16, 1);
      RETURN;
    END
    EXEC sp_executesql @CreateStatement;
    SELECT 'Index created successfully' AS result;
END
GO

PRINT '✅ All performance indexes created and SPs optimized';
GO
