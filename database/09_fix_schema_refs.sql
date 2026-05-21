-- ============================================================
-- VodaLease Enterprise — Schema Reference Fix
-- Fixes SPs to use actual schema names from the database
-- Actual schemas: security, compliance, lease, payables, bank, cheque, finance, coa, mis, workflow
-- ============================================================

USE leasing;
GO

-- ── 1. Fix sp_GetMakerCheckerQueue → security.maker_checker_queue ──
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
  FROM security.maker_checker_queue q
  LEFT JOIN security.users u1 ON q.maker_id = u1.user_id
  LEFT JOIN security.users u2 ON q.checker_id = u2.user_id
  WHERE (@Status IS NULL OR q.status = @Status)
    AND (@Module IS NULL OR q.module = @Module)
    AND (@CheckerId IS NULL OR q.checker_id = @CheckerId)
  ORDER BY q.submitted_at DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- ── 2. Fix sp_GetUserTasks → security.maker_checker_queue ────
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
  FROM security.maker_checker_queue q
  LEFT JOIN security.users u1 ON q.maker_id = u1.user_id
  WHERE (@Status IS NULL OR q.status = @Status)
    AND (@UserId IS NULL OR q.checker_id = @UserId OR q.maker_id = @UserId)
  ORDER BY q.submitted_at DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- ── 3. Fix sp_CompleteWorkflowTask → security.maker_checker_queue ──
IF OBJECT_ID('sp_CompleteWorkflowTask') IS NOT NULL DROP PROCEDURE sp_CompleteWorkflowTask;
GO
CREATE PROCEDURE sp_CompleteWorkflowTask
    @QueueId        INT,
    @CheckerId      INT,
    @Decision       VARCHAR(20),
    @Comments       NVARCHAR(500) = NULL
AS BEGIN
  SET NOCOUNT ON;
  UPDATE security.maker_checker_queue
  SET status = @Decision,
      checker_id = @CheckerId,
      reviewed_at = GETDATE(),
      rejection_reason = CASE WHEN @Decision = 'REJECTED' THEN @Comments ELSE NULL END
  WHERE queue_id = @QueueId;
  SELECT @QueueId AS queue_id, @Decision AS outcome;
END
GO

-- ── 4. Fix sp_GetAuditLog → compliance.audit_log ─────────────
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
  FROM compliance.audit_log a
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

-- ── 5. Fix sp_GetContractVersions → lease.modifications ──────
IF OBJECT_ID('sp_GetContractVersions') IS NOT NULL DROP PROCEDURE sp_GetContractVersions;
GO
CREATE PROCEDURE sp_GetContractVersions
    @ContractId     INT
AS BEGIN
  SET NOCOUNT ON;
  SELECT
    m.modification_id AS version_id,
    m.contract_id,
    ROW_NUMBER() OVER (PARTITION BY m.contract_id ORDER BY m.effective_date) AS version_number,
    m.modification_type AS change_type,
    m.description AS change_description,
    m.effective_date,
    m.new_monthly_payment AS monthly_payment,
    m.new_term_months AS term_months,
    m.new_rou_value AS rou_asset_value,
    m.new_lease_liability AS lease_liability,
    m.created_at,
    u.username AS created_by_name,
    c.contract_ref
  FROM lease.modifications m
  LEFT JOIN security.users u ON m.created_by = u.user_id
  LEFT JOIN lease.contracts c ON m.contract_id = c.contract_id
  WHERE m.contract_id = @ContractId
  ORDER BY m.effective_date DESC;
END
GO

-- ── 6. Fix sp_GetMCThresholds → security.mc_thresholds ───────
IF OBJECT_ID('sp_GetMCThresholds') IS NOT NULL DROP PROCEDURE sp_GetMCThresholds;
GO
CREATE PROCEDURE sp_GetMCThresholds
AS BEGIN
  SET NOCOUNT ON;
  SELECT
    t.threshold_id, t.module, t.min_amount, t.max_amount,
    t.approver_role, t.is_active, t.created_at
  FROM security.mc_thresholds t
  WHERE t.is_active = 1
  ORDER BY t.module, t.min_amount;
END
GO

-- ── 7. Fix sp_GetScreenRegistry → security.screen_registry ───
IF OBJECT_ID('sp_GetScreenRegistry') IS NOT NULL DROP PROCEDURE sp_GetScreenRegistry;
GO
CREATE PROCEDURE sp_GetScreenRegistry
AS BEGIN
  SET NOCOUNT ON;
  SELECT
    screen_id, screen_name, module_name, route_path,
    description, is_active, created_at
  FROM security.screen_registry
  WHERE is_active = 1
  ORDER BY module_name, screen_name;
END
GO

-- ── 8. Fix sp_GetDashboardKPIs to use correct table refs ──────
IF OBJECT_ID('sp_GetDashboardKPIs') IS NOT NULL DROP PROCEDURE sp_GetDashboardKPIs;
GO
CREATE PROCEDURE sp_GetDashboardKPIs
AS BEGIN
  SET NOCOUNT ON;
  SELECT
    (SELECT COUNT(*) FROM lease.contracts WHERE status = 'ACTIVE') AS total_active_leases,
    (SELECT ISNULL(SUM(lease_liability_commence), 0) FROM lease.contracts WHERE status = 'ACTIVE') AS total_lease_liability,
    (SELECT ISNULL(SUM(rou_asset_value), 0) FROM lease.contracts WHERE status = 'ACTIVE') AS total_rou_nbv,
    (SELECT ISNULL(SUM(monthly_payment), 0) FROM lease.contracts WHERE status = 'ACTIVE' AND DATEDIFF(DAY, GETDATE(), expiry_date) <= 30) AS payments_due_30d,
    (SELECT COUNT(*) FROM payables.invoices WHERE status = 'OVERDUE') AS overdue_payables,
    (SELECT ISNULL(SUM(a.depreciation_charge), 0) FROM lease.amortisation_schedule a INNER JOIN lease.contracts c ON a.contract_id = c.contract_id WHERE YEAR(a.period_date) = YEAR(GETDATE())) AS ytd_depreciation,
    (SELECT ISNULL(SUM(a.interest_charge), 0) FROM lease.amortisation_schedule a INNER JOIN lease.contracts c ON a.contract_id = c.contract_id WHERE YEAR(a.period_date) = YEAR(GETDATE())) AS ytd_interest,
    (SELECT COUNT(*) FROM security.maker_checker_queue WHERE status = 'PENDING') AS pending_approvals,
    (SELECT COUNT(*) FROM compliance.error_log WHERE resolved_at IS NULL) AS open_errors;
END
GO

-- ── 9. Fix sp_ApproveRejectLease → security.maker_checker_queue ──
IF OBJECT_ID('sp_ApproveRejectLease') IS NOT NULL DROP PROCEDURE sp_ApproveRejectLease;
GO
CREATE PROCEDURE sp_ApproveRejectLease
    @ContractId     INT,
    @CheckerId      INT,
    @Decision       VARCHAR(20),
    @Comments       NVARCHAR(500) = NULL
AS BEGIN
  SET NOCOUNT ON;
  UPDATE lease.contracts
  SET status = CASE WHEN @Decision = 'APPROVED' THEN 'ACTIVE' ELSE 'REJECTED' END,
      checker_id = @CheckerId,
      approved_at = CASE WHEN @Decision = 'APPROVED' THEN GETDATE() ELSE NULL END
  WHERE contract_id = @ContractId;

  UPDATE security.maker_checker_queue
  SET status = @Decision,
      checker_id = @CheckerId,
      reviewed_at = GETDATE(),
      rejection_reason = CASE WHEN @Decision = 'REJECTED' THEN @Comments ELSE NULL END
  WHERE entity_id = @ContractId AND entity_type = 'CONTRACT' AND status = 'PENDING';

  SELECT @ContractId AS contract_id, @Decision AS outcome;
END
GO

-- ── 10. Fix sp_SubmitLeaseForApproval ─────────────────────────
IF OBJECT_ID('sp_SubmitLeaseForApproval') IS NOT NULL DROP PROCEDURE sp_SubmitLeaseForApproval;
GO
CREATE PROCEDURE sp_SubmitLeaseForApproval
    @ContractId     INT,
    @MakerId        INT
AS BEGIN
  SET NOCOUNT ON;
  UPDATE lease.contracts
  SET status = 'PENDING_APPROVAL', maker_id = @MakerId
  WHERE contract_id = @ContractId;

  DECLARE @Ref VARCHAR(30) = 'MCQ-' + FORMAT(GETDATE(),'yyyy') + '-' + RIGHT('000000' + CAST(@ContractId AS VARCHAR), 6);
  INSERT INTO security.maker_checker_queue
    (queue_ref, module, entity_type, entity_id, action_type, maker_id, status, priority)
  VALUES
    (@Ref, 'Lease', 'CONTRACT', @ContractId, 'APPROVE_LEASE', @MakerId, 'PENDING', 'NORMAL');

  SELECT @ContractId AS contract_id, @Ref AS queue_ref;
END
GO

-- ── 11. Fix sp_ApproveInvoice → compliance.audit_log ─────────
IF OBJECT_ID('sp_ApproveInvoice') IS NOT NULL DROP PROCEDURE sp_ApproveInvoice;
GO
CREATE PROCEDURE sp_ApproveInvoice
    @InvoiceId      INT,
    @CheckerId      INT,
    @Decision       VARCHAR(20),
    @Comments       NVARCHAR(500) = NULL
AS BEGIN
  SET NOCOUNT ON;
  UPDATE payables.invoices
  SET status = CASE WHEN @Decision = 'APPROVED' THEN 'APPROVED' ELSE 'REJECTED' END,
      checker_id = @CheckerId,
      approved_at = CASE WHEN @Decision = 'APPROVED' THEN GETDATE() ELSE NULL END,
      rejection_reason = CASE WHEN @Decision = 'REJECTED' THEN @Comments ELSE NULL END
  WHERE invoice_id = @InvoiceId;

  SELECT @InvoiceId AS invoice_id, @Decision AS outcome;
END
GO

PRINT 'All schema reference fixes applied successfully.';
GO
