-- ============================================================
-- VodaLease Enterprise — Final SP Fix (correct column names)
-- ============================================================

USE leasing;
GO

-- ── 1. sp_GetMakerCheckerQueue ────────────────────────────────
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
    q.queue_id, q.queue_ref, q.module, q.record_type AS entity_type,
    q.record_id AS entity_id, q.record_summary, q.value, q.currency,
    q.outcome AS status, q.submitted_at, q.actioned_at AS reviewed_at,
    q.rejection_reason, q.sla_due_at, q.screen_id,
    u1.username AS maker_name, u1.email AS maker_email,
    u2.username AS checker_name,
    COUNT(*) OVER() AS total_count
  FROM security.maker_checker_queue q
  LEFT JOIN security.users u1 ON q.submitted_by = u1.user_id
  LEFT JOIN security.users u2 ON q.checker_id = u2.user_id
  WHERE (@Status IS NULL OR q.outcome = @Status)
    AND (@Module IS NULL OR q.module = @Module)
    AND (@CheckerId IS NULL OR q.checker_id = @CheckerId)
  ORDER BY q.submitted_at DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- ── 2. sp_GetUserTasks ────────────────────────────────────────
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
    q.record_type AS entity_type, q.record_id AS entity_id,
    q.record_summary, q.value, q.currency,
    q.outcome AS status, q.submitted_at, q.sla_due_at,
    q.rejection_reason,
    u1.username AS maker_name,
    COUNT(*) OVER() AS total_count
  FROM security.maker_checker_queue q
  LEFT JOIN security.users u1 ON q.submitted_by = u1.user_id
  WHERE (@Status IS NULL OR q.outcome = @Status)
    AND (@UserId IS NULL OR q.checker_id = @UserId OR q.submitted_by = @UserId)
  ORDER BY q.submitted_at DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- ── 3. sp_CompleteWorkflowTask ────────────────────────────────
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
  SET outcome = @Decision,
      checker_id = @CheckerId,
      actioned_at = GETDATE(),
      rejection_reason = CASE WHEN @Decision = 'REJECTED' THEN @Comments ELSE NULL END
  WHERE queue_id = @QueueId;
  SELECT @QueueId AS queue_id, @Decision AS outcome;
END
GO

-- ── 4. sp_GetAuditLog ─────────────────────────────────────────
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
    a.log_id AS audit_id, a.audit_no, a.screen_id, a.module,
    a.sub_module, a.action_type, a.record_table AS entity_type,
    a.record_id AS entity_id,
    a.before_state AS old_values, a.after_state AS new_values,
    a.ip_address, a.browser_os AS user_agent,
    a.process_start_time, a.process_end_time, a.elapsed_ms,
    a.timestamp_utc AS created_at, a.outcome,
    a.username, a.user_role,
    COUNT(*) OVER() AS total_count
  FROM compliance.audit_log a
  WHERE (@ScreenId IS NULL OR a.screen_id = @ScreenId)
    AND (@Module IS NULL OR a.module = @Module)
    AND (@UserId IS NULL OR a.user_id = @UserId)
    AND (@ActionType IS NULL OR a.action_type = @ActionType)
    AND (@DateFrom IS NULL OR a.timestamp_utc >= @DateFrom)
    AND (@DateTo IS NULL OR a.timestamp_utc <= @DateTo)
  ORDER BY a.timestamp_utc DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- ── 5. sp_GetErrorLog ─────────────────────────────────────────
IF OBJECT_ID('sp_GetErrorLog') IS NOT NULL DROP PROCEDURE sp_GetErrorLog;
GO
CREATE PROCEDURE sp_GetErrorLog
    @ScreenId       VARCHAR(20) = NULL,
    @Severity       VARCHAR(20) = NULL,
    @Status         VARCHAR(20) = NULL,
    @PageNumber     INT = 1,
    @PageSize       INT = 100
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
  SELECT
    e.error_id, e.error_no, e.timestamp_utc, e.severity,
    e.module, e.error_code, e.message, e.full_message,
    e.resolution_status, e.resolution_note, e.resolved_at,
    e.screen_id,
    COUNT(*) OVER() AS total_count
  FROM compliance.error_log e
  WHERE (@ScreenId IS NULL OR e.screen_id = @ScreenId)
    AND (@Severity IS NULL OR e.severity = @Severity)
    AND (@Status IS NULL OR e.resolution_status = @Status)
  ORDER BY e.timestamp_utc DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- ── 6. sp_GetContractVersions (uses lease.modifications) ─────
IF OBJECT_ID('sp_GetContractVersions') IS NOT NULL DROP PROCEDURE sp_GetContractVersions;
GO
CREATE PROCEDURE sp_GetContractVersions
    @ContractId     INT
AS BEGIN
  SET NOCOUNT ON;
  SELECT
    m.modification_id AS version_id,
    m.contract_id,
    ROW_NUMBER() OVER (PARTITION BY m.contract_id ORDER BY m.modification_date) AS version_number,
    m.modification_type AS change_type,
    m.modification_date AS effective_date,
    m.old_terms_json, m.new_terms_json,
    m.liability_adjustment, m.rou_adjustment,
    m.status, m.created_at,
    u.username AS created_by_name,
    c.contract_ref
  FROM lease.modifications m
  LEFT JOIN security.users u ON m.maker_id = u.user_id
  LEFT JOIN lease.contracts c ON m.contract_id = c.contract_id
  WHERE m.contract_id = @ContractId
  ORDER BY m.modification_date DESC;
END
GO

-- ── 7. sp_GetMCThresholds ─────────────────────────────────────
IF OBJECT_ID('sp_GetMCThresholds') IS NOT NULL DROP PROCEDURE sp_GetMCThresholds;
GO
CREATE PROCEDURE sp_GetMCThresholds
AS BEGIN
  SET NOCOUNT ON;
  SELECT
    t.threshold_id, t.module, t.role AS approver_role,
    t.max_amount, t.currency, t.is_active, t.updated_at AS created_at
  FROM security.mc_thresholds t
  WHERE t.is_active = 1
  ORDER BY t.module, t.max_amount;
END
GO

-- ── 8. sp_GetScreenRegistry ───────────────────────────────────
IF OBJECT_ID('sp_GetScreenRegistry') IS NOT NULL DROP PROCEDURE sp_GetScreenRegistry;
GO
CREATE PROCEDURE sp_GetScreenRegistry
AS BEGIN
  SET NOCOUNT ON;
  SELECT
    screen_id, screen_name, module, sub_module,
    screen_type, route, allowed_roles, created_at
  FROM security.screen_registry
  ORDER BY module, screen_name;
END
GO

-- ── 9. sp_GetDashboardKPIs ────────────────────────────────────
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
    (SELECT ISNULL(SUM(a.depreciation_charge), 0) FROM lease.amortisation_schedule a WHERE YEAR(a.period_date) = YEAR(GETDATE())) AS ytd_depreciation,
    (SELECT ISNULL(SUM(a.interest_charge), 0) FROM lease.amortisation_schedule a WHERE YEAR(a.period_date) = YEAR(GETDATE())) AS ytd_interest,
    (SELECT COUNT(*) FROM security.maker_checker_queue WHERE outcome = 'PENDING') AS pending_approvals,
    (SELECT COUNT(*) FROM compliance.error_log WHERE resolution_status = 'OPEN') AS open_errors;
END
GO

-- ── 10. sp_ApproveRejectLease ─────────────────────────────────
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
  SET outcome = @Decision,
      checker_id = @CheckerId,
      actioned_at = GETDATE(),
      rejection_reason = CASE WHEN @Decision = 'REJECTED' THEN @Comments ELSE NULL END
  WHERE record_id = @ContractId AND record_type = 'CONTRACT' AND outcome = 'PENDING';

  SELECT @ContractId AS contract_id, @Decision AS outcome;
END
GO

-- ── 11. sp_SubmitLeaseForApproval ─────────────────────────────
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
    (queue_ref, module, record_type, record_id, record_summary, submitted_by, outcome)
  VALUES
    (@Ref, 'Lease', 'CONTRACT', @ContractId, 'Lease Approval', @MakerId, 'PENDING');

  SELECT @ContractId AS contract_id, @Ref AS queue_ref;
END
GO

-- ── 12. sp_ApproveInvoice ─────────────────────────────────────
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
      approved_at = CASE WHEN @Decision = 'APPROVED' THEN GETDATE() ELSE NULL END
  WHERE invoice_id = @InvoiceId;

  SELECT @InvoiceId AS invoice_id, @Decision AS outcome;
END
GO

PRINT 'All final SP fixes applied.';
GO
