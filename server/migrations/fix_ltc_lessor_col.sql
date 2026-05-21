-- Fix sp_GetLeasesForTransaction and sp_PreviewTermination: use lessor_name not legal_name

IF OBJECT_ID('sp_GetLeasesForTransaction','P') IS NOT NULL DROP PROCEDURE sp_GetLeasesForTransaction;
GO
CREATE PROCEDURE sp_GetLeasesForTransaction
  @Search NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    c.contract_id,
    c.contract_ref,
    c.asset_description,
    c.asset_type,
    c.commencement_date,
    c.expiry_date,
    c.term_months,
    c.monthly_payment,
    c.currency,
    c.ibr,
    c.lifecycle_status,
    c.status,
    ISNULL(a.closing_liability, c.lease_liability_commence) AS current_liability,
    ISNULL(a.rou_nbv,           c.rou_asset_value)          AS current_rou_nbv,
    ISNULL(a.period_date,       c.commencement_date)        AS last_period_date,
    DATEDIFF(MONTH, GETDATE(), c.expiry_date)               AS remaining_months,
    l.lessor_name,
    (SELECT COUNT(*) FROM lease.transaction_drafts td
     WHERE td.contract_id = c.contract_id AND td.status IN ('Draft','Submitted')) AS pending_drafts
  FROM lease.contracts c
  LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
  OUTER APPLY (
    SELECT TOP 1 closing_liability, rou_nbv, period_date
    FROM lease.amortisation_schedule
    WHERE contract_id = c.contract_id
    ORDER BY period_date DESC
  ) a
  WHERE c.lifecycle_status IN ('Active','Modified')
    AND c.status NOT IN ('Terminated','Closed')
    AND (@Search IS NULL
         OR c.contract_ref    LIKE '%' + @Search + '%'
         OR c.asset_description LIKE '%' + @Search + '%'
         OR l.lessor_name     LIKE '%' + @Search + '%')
  ORDER BY c.expiry_date ASC;
END
GO

IF OBJECT_ID('sp_PreviewTermination','P') IS NOT NULL DROP PROCEDURE sp_PreviewTermination;
GO
CREATE PROCEDURE sp_PreviewTermination
  @ContractId       INT,
  @TerminationDate  DATE
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @ContractRef      NVARCHAR(50),
          @Currency         CHAR(3),
          @CurrentLiability DECIMAL(18,2),
          @CurrentRouNBV    DECIMAL(18,2),
          @LessorName       NVARCHAR(200),
          @ExpiryDate       DATE;

  SELECT
    @ContractRef  = c.contract_ref,
    @Currency     = c.currency,
    @ExpiryDate   = c.expiry_date,
    @LessorName   = l.lessor_name
  FROM lease.contracts c
  LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
  WHERE c.contract_id = @ContractId;

  SELECT TOP 1
    @CurrentLiability = closing_liability,
    @CurrentRouNBV    = rou_nbv
  FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId
    AND period_date <= @TerminationDate
  ORDER BY period_date DESC;

  IF @CurrentLiability IS NULL
    SELECT @CurrentLiability = lease_liability_commence, @CurrentRouNBV = rou_asset_value
    FROM lease.contracts WHERE contract_id = @ContractId;

  DECLARE @GainLoss DECIMAL(18,2) = @CurrentRouNBV - @CurrentLiability;

  -- Result set 1: Summary
  SELECT
    @ContractId       AS contract_id,
    @ContractRef      AS contract_ref,
    @LessorName       AS lessor_name,
    @TerminationDate  AS termination_date,
    @ExpiryDate       AS original_expiry_date,
    DATEDIFF(MONTH, @TerminationDate, @ExpiryDate) AS months_early,
    @CurrentLiability AS lease_liability_derecognised,
    @CurrentRouNBV    AS rou_asset_derecognised,
    @GainLoss         AS gain_loss_on_termination,
    CASE WHEN @GainLoss > 0 THEN 'Loss' WHEN @GainLoss < 0 THEN 'Gain' ELSE 'Nil' END AS gain_loss_type,
    @Currency         AS currency;

  -- Result set 2: JE-5 preview lines
  SELECT line_no, account_code, account_name, dr_cr, amount, description FROM (
    SELECT 1 AS line_no, '2101' AS account_code, 'Lease Liability' AS account_name,
      'Dr' AS dr_cr, @CurrentLiability AS amount, 'Derecognise lease liability' AS description
    UNION ALL
    SELECT 2, '1601', 'Right-of-Use Asset', 'Cr', @CurrentRouNBV, 'Derecognise ROU asset'
    UNION ALL
    SELECT 3, '7201', 'Gain/Loss on Lease Termination',
      CASE WHEN @GainLoss > 0 THEN 'Dr' ELSE 'Cr' END,
      ABS(@GainLoss),
      CASE WHEN @GainLoss > 0 THEN 'Loss on early termination' ELSE 'Gain on early termination' END
    WHERE @GainLoss <> 0
  ) je ORDER BY line_no;
END
GO
