-- Fix sp_GetRenewalDueCount and sp_GetRenewalDueLeases with correct column names
-- lease.contracts uses expiry_date (not end_date)
-- lease.lessors uses legal_name (not lessor_name)

IF OBJECT_ID('dbo.sp_GetRenewalDueCount', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetRenewalDueCount;
GO
CREATE PROCEDURE dbo.sp_GetRenewalDueCount
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS renewal_due_count
  FROM lease.contracts c
  WHERE c.lifecycle_status IN ('Active', 'Modified')
    AND c.expiry_date IS NOT NULL
    AND CAST(c.expiry_date AS DATE) BETWEEN CAST(GETUTCDATE() AS DATE)
                                        AND CAST(DATEADD(DAY, 90, GETUTCDATE()) AS DATE)
    AND NOT EXISTS (
      SELECT 1 FROM lease.renewals r
      WHERE r.contract_id = c.contract_id
        AND r.status IN ('Pending', 'Approved')
    );
END
GO

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
    c.expiry_date,
    DATEDIFF(DAY, CAST(GETUTCDATE() AS DATE), CAST(c.expiry_date AS DATE)) AS days_remaining,
    ISNULL(l.legal_name, 'Unknown Lessor')   AS lessor_name,
    c.lifecycle_status
  FROM lease.contracts c
  LEFT JOIN lease.lessors l ON c.lessor_id = l.lessor_id
  WHERE c.lifecycle_status IN ('Active', 'Modified')
    AND c.expiry_date IS NOT NULL
    AND CAST(c.expiry_date AS DATE) BETWEEN CAST(GETUTCDATE() AS DATE)
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
