-- ============================================================
-- VodaLease Enterprise — SP Fix Script
-- Fixes: missing tables, parameter name mismatches
-- ============================================================

USE leasing;
GO

-- ── 1. Create missing lease.contract_documents table ─────────
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='contract_documents')
BEGIN
  CREATE TABLE lease.contract_documents (
    document_id       INT IDENTITY(1,1) PRIMARY KEY,
    contract_id       INT NOT NULL REFERENCES lease.contracts(contract_id),
    document_type     VARCHAR(50) NOT NULL,  -- LEASE_AGREEMENT, AMENDMENT, INSURANCE, OTHER
    document_name     NVARCHAR(200) NOT NULL,
    storage_key       VARCHAR(500),
    storage_url       VARCHAR(1000),
    file_size_kb      INT,
    mime_type         VARCHAR(100),
    uploaded_by       INT REFERENCES security.users(user_id),
    upload_date       DATETIME2 DEFAULT GETDATE(),
    expiry_date       DATE,
    is_active         BIT DEFAULT 1,
    notes             NVARCHAR(500),
    created_at        DATETIME2 DEFAULT GETDATE()
  );
  PRINT 'Created lease.contract_documents';
END
GO

-- ── 2. Create missing lease.contract_milestones table ────────
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='contract_milestones')
BEGIN
  CREATE TABLE lease.contract_milestones (
    milestone_id      INT IDENTITY(1,1) PRIMARY KEY,
    contract_id       INT NOT NULL REFERENCES lease.contracts(contract_id),
    milestone_type    VARCHAR(50) NOT NULL,  -- REVIEW_DATE, BREAK_CLAUSE, RENT_REVIEW, EXPIRY_NOTICE
    milestone_date    DATE NOT NULL,
    description       NVARCHAR(500),
    status            VARCHAR(20) DEFAULT 'PENDING',  -- PENDING, COMPLETED, OVERDUE
    assigned_to       INT REFERENCES security.users(user_id),
    completed_date    DATE,
    notes             NVARCHAR(500),
    created_at        DATETIME2 DEFAULT GETDATE()
  );
  PRINT 'Created lease.contract_milestones';
END
GO

-- ── 3. Recreate sp_GetContracts without contract_documents join ──
IF OBJECT_ID('sp_GetContracts') IS NOT NULL DROP PROCEDURE sp_GetContracts;
GO
CREATE PROCEDURE sp_GetContracts
    @PageNumber     INT = 1,
    @PageSize       INT = 100,
    @StatusFilter   VARCHAR(30) = NULL,
    @AssetType      VARCHAR(50) = NULL,
    @SearchTerm     NVARCHAR(200) = NULL
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
  SELECT
    c.contract_id, c.contract_ref, c.status, c.asset_type, c.asset_description,
    c.asset_tag, l.legal_name AS lessor_name, l.country AS lessor_country,
    c.commencement_date, c.expiry_date, c.term_months, c.monthly_payment, c.currency,
    c.rou_asset_value, c.lease_liability_commence, c.ifrs16_classification, c.is_lto,
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
    AND (@SearchTerm IS NULL OR c.contract_ref LIKE '%' + @SearchTerm + '%'
         OR l.legal_name LIKE '%' + @SearchTerm + '%'
         OR c.asset_description LIKE '%' + @SearchTerm + '%')
  ORDER BY c.created_at DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- ── 4. Recreate sp_GetContractDocuments ──────────────────────
IF OBJECT_ID('sp_GetContractDocuments') IS NOT NULL DROP PROCEDURE sp_GetContractDocuments;
GO
CREATE PROCEDURE sp_GetContractDocuments
    @ContractId     INT = NULL
AS BEGIN
  SET NOCOUNT ON;
  SELECT
    d.document_id, d.contract_id, d.document_type, d.document_name,
    d.storage_url, d.file_size_kb, d.mime_type, d.expiry_date,
    d.upload_date, d.is_active, d.notes,
    u.username AS uploaded_by_name,
    c.contract_ref
  FROM lease.contract_documents d
  LEFT JOIN security.users u ON d.uploaded_by = u.user_id
  LEFT JOIN lease.contracts c ON d.contract_id = c.contract_id
  WHERE (@ContractId IS NULL OR d.contract_id = @ContractId)
    AND d.is_active = 1
  ORDER BY d.upload_date DESC;
END
GO

-- ── 5. Recreate sp_GetContractMilestones ─────────────────────
IF OBJECT_ID('sp_GetContractMilestones') IS NOT NULL DROP PROCEDURE sp_GetContractMilestones;
GO
CREATE PROCEDURE sp_GetContractMilestones
    @ContractId     INT = NULL,
    @Status         VARCHAR(20) = NULL
AS BEGIN
  SET NOCOUNT ON;
  SELECT
    m.milestone_id, m.contract_id, m.milestone_type, m.milestone_date,
    m.description, m.status, m.completed_date, m.notes, m.created_at,
    u.username AS assigned_to_name,
    c.contract_ref, c.asset_description
  FROM lease.contract_milestones m
  LEFT JOIN security.users u ON m.assigned_to = u.user_id
  LEFT JOIN lease.contracts c ON m.contract_id = c.contract_id
  WHERE (@ContractId IS NULL OR m.contract_id = @ContractId)
    AND (@Status IS NULL OR m.status = @Status)
  ORDER BY m.milestone_date ASC;
END
GO

-- ── 6. Recreate sp_AttachContractDocument ────────────────────
IF OBJECT_ID('sp_AttachContractDocument') IS NOT NULL DROP PROCEDURE sp_AttachContractDocument;
GO
CREATE PROCEDURE sp_AttachContractDocument
    @ContractId     INT,
    @DocumentType   VARCHAR(50),
    @DocumentName   NVARCHAR(200),
    @StorageKey     VARCHAR(500) = NULL,
    @StorageUrl     VARCHAR(1000) = NULL,
    @FileSizeKb     INT = NULL,
    @MimeType       VARCHAR(100) = NULL,
    @ExpiryDate     DATE = NULL,
    @Notes          NVARCHAR(500) = NULL,
    @UploadedBy     INT = NULL
AS BEGIN
  SET NOCOUNT ON;
  INSERT INTO lease.contract_documents
    (contract_id, document_type, document_name, storage_key, storage_url, file_size_kb, mime_type, expiry_date, notes, uploaded_by)
  VALUES
    (@ContractId, @DocumentType, @DocumentName, @StorageKey, @StorageUrl, @FileSizeKb, @MimeType, @ExpiryDate, @Notes, @UploadedBy);
  SELECT SCOPE_IDENTITY() AS document_id;
END
GO

-- ── 7. Recreate sp_GetMakerCheckerQueue with correct params ──
IF OBJECT_ID('sp_GetMakerCheckerQueue') IS NOT NULL DROP PROCEDURE sp_GetMakerCheckerQueue;
GO
CREATE PROCEDURE sp_GetMakerCheckerQueue
    @Status         VARCHAR(20) = 'PENDING',
    @Module         VARCHAR(50) = NULL,
    @CheckerId      INT = NULL,
    @PageNumber     INT = 1,
    @PageSize       INT = 50
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
  SELECT
    q.queue_id, q.queue_ref, q.module, q.entity_type, q.entity_id,
    q.action_type, q.status, q.submitted_at, q.reviewed_at,
    q.rejection_reason, q.priority,
    u1.username AS maker_name, u1.email AS maker_email,
    u2.username AS checker_name,
    COUNT(*) OVER() AS total_count
  FROM workflow.maker_checker_queue q
  LEFT JOIN security.users u1 ON q.maker_id = u1.user_id
  LEFT JOIN security.users u2 ON q.checker_id = u2.user_id
  WHERE (@Status IS NULL OR q.status = @Status)
    AND (@Module IS NULL OR q.module = @Module)
    AND (@CheckerId IS NULL OR q.checker_id = @CheckerId)
  ORDER BY q.submitted_at DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- ── 8. Recreate sp_GetAuditLog with correct params ───────────
IF OBJECT_ID('sp_GetAuditLog') IS NOT NULL DROP PROCEDURE sp_GetAuditLog;
GO
CREATE PROCEDURE sp_GetAuditLog
    @ScreenId       VARCHAR(20) = NULL,
    @Module         VARCHAR(50) = NULL,
    @UserId         INT = NULL,
    @ActionType     VARCHAR(50) = NULL,
    @DateFrom       DATETIME2 = NULL,
    @DateTo         DATETIME2 = NULL,
    @PageNumber     INT = 1,
    @PageSize       INT = 100
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
  SELECT
    a.audit_id, a.audit_no, a.screen_id, a.module, a.action_type,
    a.entity_type, a.entity_id, a.description,
    a.old_values, a.new_values,
    a.ip_address, a.user_agent,
    a.process_start_time, a.process_end_time, a.elapsed_ms,
    a.created_at,
    u.username, u.email,
    COUNT(*) OVER() AS total_count
  FROM security.audit_log a
  LEFT JOIN security.users u ON a.user_id = u.user_id
  WHERE (@ScreenId IS NULL OR a.screen_id = @ScreenId)
    AND (@Module IS NULL OR a.module = @Module)
    AND (@UserId IS NULL OR a.user_id = @UserId)
    AND (@ActionType IS NULL OR a.action_type = @ActionType)
    AND (@DateFrom IS NULL OR a.created_at >= @DateFrom)
    AND (@DateTo IS NULL OR a.created_at <= @DateTo)
  ORDER BY a.created_at DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- ── 9. Create sp_GetContractVersions if missing ──────────────
IF OBJECT_ID('sp_GetContractVersions') IS NOT NULL DROP PROCEDURE sp_GetContractVersions;
GO
CREATE PROCEDURE sp_GetContractVersions
    @ContractId     INT
AS BEGIN
  SET NOCOUNT ON;
  SELECT
    v.version_id, v.contract_id, v.version_number, v.change_type,
    v.change_description, v.effective_date, v.monthly_payment,
    v.term_months, v.rou_asset_value, v.lease_liability,
    v.created_at,
    u.username AS created_by_name,
    c.contract_ref
  FROM lease.contract_versions v
  LEFT JOIN security.users u ON v.created_by = u.user_id
  LEFT JOIN lease.contracts c ON v.contract_id = c.contract_id
  WHERE v.contract_id = @ContractId
  ORDER BY v.version_number DESC;
END
GO

-- ── 10. Create sp_GetExpiringDocuments ───────────────────────
IF OBJECT_ID('sp_GetExpiringDocuments') IS NOT NULL DROP PROCEDURE sp_GetExpiringDocuments;
GO
CREATE PROCEDURE sp_GetExpiringDocuments
    @DaysAhead      INT = 90
AS BEGIN
  SET NOCOUNT ON;
  SELECT
    d.document_id, d.contract_id, d.document_type, d.document_name,
    d.expiry_date, d.storage_url,
    DATEDIFF(DAY, GETDATE(), d.expiry_date) AS days_until_expiry,
    c.contract_ref, c.asset_description,
    l.legal_name AS lessor_name
  FROM lease.contract_documents d
  INNER JOIN lease.contracts c ON d.contract_id = c.contract_id
  INNER JOIN lease.lessors l ON c.lessor_id = l.lessor_id
  WHERE d.expiry_date IS NOT NULL
    AND d.expiry_date <= DATEADD(DAY, @DaysAhead, GETDATE())
    AND d.expiry_date >= GETDATE()
    AND d.is_active = 1
  ORDER BY d.expiry_date ASC;
END
GO

-- ── 11. Create sp_GetInsurancePolicies ───────────────────────
IF OBJECT_ID('sp_GetInsurancePolicies') IS NOT NULL DROP PROCEDURE sp_GetInsurancePolicies;
GO
CREATE PROCEDURE sp_GetInsurancePolicies
    @ContractId     INT = NULL,
    @Status         VARCHAR(20) = NULL
AS BEGIN
  SET NOCOUNT ON;
  -- Return from contract_documents where type = 'INSURANCE'
  SELECT
    d.document_id AS policy_id,
    d.contract_id,
    d.document_name AS policy_name,
    d.document_type AS coverage_type,
    d.expiry_date AS policy_end_date,
    d.upload_date AS policy_start_date,
    d.notes AS provider_name,
    d.storage_url,
    CASE WHEN d.expiry_date < GETDATE() THEN 'EXPIRED'
         WHEN d.expiry_date <= DATEADD(DAY, 30, GETDATE()) THEN 'EXPIRING_SOON'
         ELSE 'ACTIVE' END AS status,
    c.contract_ref, c.asset_description,
    l.legal_name AS lessor_name
  FROM lease.contract_documents d
  INNER JOIN lease.contracts c ON d.contract_id = c.contract_id
  INNER JOIN lease.lessors l ON c.lessor_id = l.lessor_id
  WHERE d.document_type = 'INSURANCE'
    AND d.is_active = 1
    AND (@ContractId IS NULL OR d.contract_id = @ContractId)
  ORDER BY d.expiry_date ASC;
END
GO

-- ── 12. Create sp_GetMaintenanceTickets ──────────────────────
IF OBJECT_ID('sp_GetMaintenanceTickets') IS NOT NULL DROP PROCEDURE sp_GetMaintenanceTickets;
GO
CREATE PROCEDURE sp_GetMaintenanceTickets
    @ContractId     INT = NULL,
    @Status         VARCHAR(20) = NULL,
    @PageNumber     INT = 1,
    @PageSize       INT = 50
AS BEGIN
  SET NOCOUNT ON;
  -- Return maintenance notes from contract_milestones where type = 'MAINTENANCE'
  DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
  SELECT
    m.milestone_id AS ticket_id,
    m.contract_id,
    m.description AS issue_description,
    m.milestone_type AS ticket_type,
    m.status,
    m.milestone_date AS reported_date,
    m.completed_date AS resolved_date,
    m.notes,
    u.username AS assigned_to_name,
    c.contract_ref, c.asset_description, c.maintenance_responsibility,
    l.legal_name AS lessor_name,
    COUNT(*) OVER() AS total_count
  FROM lease.contract_milestones m
  LEFT JOIN security.users u ON m.assigned_to = u.user_id
  LEFT JOIN lease.contracts c ON m.contract_id = c.contract_id
  LEFT JOIN lease.lessors l ON c.lessor_id = l.lessor_id
  WHERE (@ContractId IS NULL OR m.contract_id = @ContractId)
    AND (@Status IS NULL OR m.status = @Status)
  ORDER BY m.milestone_date DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- ── 13. Create sp_GetUserTasks ───────────────────────────────
IF OBJECT_ID('sp_GetUserTasks') IS NOT NULL DROP PROCEDURE sp_GetUserTasks;
GO
CREATE PROCEDURE sp_GetUserTasks
    @UserId         INT = NULL,
    @Status         VARCHAR(20) = 'PENDING',
    @PageNumber     INT = 1,
    @PageSize       INT = 50
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
  SELECT
    q.queue_id AS task_id, q.queue_ref AS task_ref, q.module,
    q.entity_type, q.entity_id, q.action_type,
    q.status, q.submitted_at, q.priority,
    q.rejection_reason,
    u1.username AS maker_name,
    COUNT(*) OVER() AS total_count
  FROM workflow.maker_checker_queue q
  LEFT JOIN security.users u1 ON q.maker_id = u1.user_id
  WHERE (@Status IS NULL OR q.status = @Status)
    AND (@UserId IS NULL OR q.checker_id = @UserId OR q.maker_id = @UserId)
  ORDER BY q.submitted_at DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- ── 14. Create sp_CompleteWorkflowTask ───────────────────────
IF OBJECT_ID('sp_CompleteWorkflowTask') IS NOT NULL DROP PROCEDURE sp_CompleteWorkflowTask;
GO
CREATE PROCEDURE sp_CompleteWorkflowTask
    @QueueId        INT,
    @CheckerId      INT,
    @Decision       VARCHAR(20),   -- APPROVED / REJECTED
    @Comments       NVARCHAR(500) = NULL
AS BEGIN
  SET NOCOUNT ON;
  UPDATE workflow.maker_checker_queue
  SET status = @Decision,
      checker_id = @CheckerId,
      reviewed_at = GETDATE(),
      rejection_reason = CASE WHEN @Decision = 'REJECTED' THEN @Comments ELSE NULL END
  WHERE queue_id = @QueueId;
  SELECT @QueueId AS queue_id, @Decision AS outcome;
END
GO

PRINT 'All SP fixes applied successfully.';
GO
