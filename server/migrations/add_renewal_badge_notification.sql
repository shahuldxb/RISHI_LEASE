-- ============================================================
-- Feature 6: Renewal Due Badge Counter & Email Notification
-- ============================================================

-- 1. Notification tracking table (prevents duplicate emails)
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'lease' AND t.name = 'renewal_notifications')
BEGIN
  CREATE TABLE lease.renewal_notifications (
    notif_id       INT IDENTITY(1,1) PRIMARY KEY,
    contract_id    INT           NOT NULL,
    contract_ref   NVARCHAR(50)  NOT NULL,
    notified_at    DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    days_remaining INT           NOT NULL,
    expiry_date    DATE          NOT NULL,
    notif_type     NVARCHAR(30)  NOT NULL DEFAULT '90_DAY_RENEWAL',
    CONSTRAINT uq_renewal_notif UNIQUE (contract_id, notif_type)
  );
END
GO

-- 2. sp_GetRenewalDueCount
-- Returns count of active leases expiring within 90 days with no Pending/Approved renewal
IF OBJECT_ID('dbo.sp_GetRenewalDueCount', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetRenewalDueCount;
GO
CREATE PROCEDURE dbo.sp_GetRenewalDueCount
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS renewal_due_count
  FROM lease.contracts c
  WHERE c.lifecycle_status IN ('Active', 'Modified')
    AND c.end_date IS NOT NULL
    AND CAST(c.end_date AS DATE) BETWEEN CAST(GETUTCDATE() AS DATE)
                                     AND CAST(DATEADD(DAY, 90, GETUTCDATE()) AS DATE)
    AND NOT EXISTS (
      SELECT 1 FROM lease.renewals r
      WHERE r.contract_id = c.contract_id
        AND r.status IN ('Pending', 'Approved')
    );
END
GO

-- 3. sp_GetRenewalDueLeases
-- Returns leases entering the 90-day window that have NOT yet been notified
IF OBJECT_ID('dbo.sp_GetRenewalDueLeases', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetRenewalDueLeases;
GO
CREATE PROCEDURE dbo.sp_GetRenewalDueLeases
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    c.contract_id,
    c.contract_ref,
    c.asset_description,
    c.currency,
    c.monthly_payment,
    c.end_date                                          AS expiry_date,
    DATEDIFF(DAY, CAST(GETUTCDATE() AS DATE), CAST(c.end_date AS DATE)) AS days_remaining,
    ISNULL(l.lessor_name, 'Unknown Lessor')             AS lessor_name,
    c.lifecycle_status
  FROM lease.contracts c
  LEFT JOIN lease.lessors l ON c.lessor_id = l.lessor_id
  WHERE c.lifecycle_status IN ('Active', 'Modified')
    AND c.end_date IS NOT NULL
    AND CAST(c.end_date AS DATE) BETWEEN CAST(GETUTCDATE() AS DATE)
                                     AND CAST(DATEADD(DAY, 90, GETUTCDATE()) AS DATE)
    AND NOT EXISTS (
      SELECT 1 FROM lease.renewals r
      WHERE r.contract_id = c.contract_id
        AND r.status IN ('Pending', 'Approved')
    )
    AND NOT EXISTS (
      SELECT 1 FROM lease.renewal_notifications n
      WHERE n.contract_id = c.contract_id
        AND n.notif_type = '90_DAY_RENEWAL'
    )
  ORDER BY days_remaining ASC;
END
GO

-- 4. sp_MarkRenewalNotified
-- Marks a contract as notified so duplicate emails are not sent
IF OBJECT_ID('dbo.sp_MarkRenewalNotified', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_MarkRenewalNotified;
GO
CREATE PROCEDURE dbo.sp_MarkRenewalNotified
  @ContractId    INT,
  @ContractRef   NVARCHAR(50),
  @DaysRemaining INT,
  @ExpiryDate    DATE
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (
    SELECT 1 FROM lease.renewal_notifications
    WHERE contract_id = @ContractId AND notif_type = '90_DAY_RENEWAL'
  )
  BEGIN
    INSERT INTO lease.renewal_notifications
      (contract_id, contract_ref, days_remaining, expiry_date, notif_type)
    VALUES
      (@ContractId, @ContractRef, @DaysRemaining, @ExpiryDate, '90_DAY_RENEWAL');
  END

  SELECT 'OK' AS result;
END
GO
