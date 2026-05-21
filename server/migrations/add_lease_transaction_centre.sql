-- ============================================================
-- Lease Transaction Centre — SQL Migration
-- SPs: sp_GetLeasesForTransaction, sp_PreviewModification,
--      sp_PreviewTermination, sp_PreviewRenewal,
--      sp_PostLeaseTransaction, sp_GetLeaseTransactionHistory
-- Table: lease.transaction_drafts
-- ============================================================

-- ── 1. lease.transaction_drafts table ────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('lease.transaction_drafts'))
BEGIN
  CREATE TABLE lease.transaction_drafts (
    draft_id         INT IDENTITY(1,1) PRIMARY KEY,
    contract_id      INT            NOT NULL,
    transaction_type NVARCHAR(20)   NOT NULL CHECK (transaction_type IN ('Modification','Termination','Renewal')),
    input_params     NVARCHAR(MAX)  NULL,   -- JSON of input fields
    preview_result   NVARCHAR(MAX)  NULL,   -- JSON of preview output
    status           NVARCHAR(20)   NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Submitted','Approved','Rejected','Posted')),
    submitted_by     NVARCHAR(100)  NULL,
    submitted_at     DATETIME2      NULL,
    approved_by      NVARCHAR(100)  NULL,
    approved_at      DATETIME2      NULL,
    posted_je_ref    NVARCHAR(50)   NULL,
    notes            NVARCHAR(500)  NULL,
    created_by       NVARCHAR(100)  NOT NULL,
    created_at       DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updated_at       DATETIME2      NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE INDEX ix_txn_drafts_contract ON lease.transaction_drafts(contract_id);
  CREATE INDEX ix_txn_drafts_status   ON lease.transaction_drafts(status);
END
GO

-- ── 2. sp_GetLeasesForTransaction ────────────────────────────────────────
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
    -- Current carrying amounts from latest amortisation row
    ISNULL(a.closing_liability, c.lease_liability_commence) AS current_liability,
    ISNULL(a.rou_nbv,           c.rou_asset_value)          AS current_rou_nbv,
    ISNULL(a.period_date,       c.commencement_date)        AS last_period_date,
    -- Remaining term in months
    DATEDIFF(MONTH, GETDATE(), c.expiry_date) AS remaining_months,
    -- Lessor
    l.legal_name AS lessor_name,
    -- Pending draft count
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
         OR c.contract_ref LIKE '%' + @Search + '%'
         OR c.asset_description LIKE '%' + @Search + '%'
         OR l.legal_name LIKE '%' + @Search + '%')
  ORDER BY c.expiry_date ASC;
END
GO

-- ── 3. sp_PreviewModification ────────────────────────────────────────────
IF OBJECT_ID('sp_PreviewModification','P') IS NOT NULL DROP PROCEDURE sp_PreviewModification;
GO
CREATE PROCEDURE sp_PreviewModification
  @ContractId       INT,
  @NewMonthlyPayment DECIMAL(18,2),
  @EffectiveDate    DATE,
  @NewIBR           DECIMAL(8,6) = NULL   -- NULL = use existing IBR
AS
BEGIN
  SET NOCOUNT ON;

  -- Get current contract data
  DECLARE @IBR               DECIMAL(8,6),
          @ExpiryDate        DATE,
          @Currency          CHAR(3),
          @CurrentLiability  DECIMAL(18,2),
          @CurrentRouNBV     DECIMAL(18,2),
          @OldMonthlyPayment DECIMAL(18,2),
          @ContractRef       NVARCHAR(50);

  SELECT
    @IBR               = ISNULL(@NewIBR, c.ibr),
    @ExpiryDate        = c.expiry_date,
    @Currency          = c.currency,
    @OldMonthlyPayment = c.monthly_payment,
    @ContractRef       = c.contract_ref
  FROM lease.contracts c
  WHERE c.contract_id = @ContractId;

  -- Get current carrying amounts at effective date
  SELECT TOP 1
    @CurrentLiability = closing_liability,
    @CurrentRouNBV    = rou_nbv
  FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId
    AND period_date <= @EffectiveDate
  ORDER BY period_date DESC;

  IF @CurrentLiability IS NULL
    SELECT @CurrentLiability = lease_liability_commence, @CurrentRouNBV = rou_asset_value
    FROM lease.contracts WHERE contract_id = @ContractId;

  -- Remaining months from effective date
  DECLARE @RemainingMonths INT = DATEDIFF(MONTH, @EffectiveDate, @ExpiryDate);
  IF @RemainingMonths < 1 SET @RemainingMonths = 1;

  -- New PV = PV of new monthly payments over remaining term at new IBR
  DECLARE @MonthlyRate DECIMAL(18,10) = @IBR / 12.0;
  DECLARE @NewPV DECIMAL(18,2);

  IF @MonthlyRate = 0
    SET @NewPV = ROUND(@NewMonthlyPayment * @RemainingMonths, 2)
  ELSE
    SET @NewPV = ROUND(@NewMonthlyPayment * (1 - POWER(1 + @MonthlyRate, -@RemainingMonths)) / @MonthlyRate, 2);

  -- Remeasurement amounts
  DECLARE @LiabilityDelta     DECIMAL(18,2) = @NewPV - @CurrentLiability;
  DECLARE @RouDelta           DECIMAL(18,2) = @LiabilityDelta;  -- IFRS 16 Para 45: adjust ROU by same amount
  DECLARE @NewRouNBV          DECIMAL(18,2) = @CurrentRouNBV + @RouDelta;
  DECLARE @RemeasurementGL    DECIMAL(18,2) = 0;  -- Gain/loss only if ROU goes negative

  IF @NewRouNBV < 0
  BEGIN
    SET @RemeasurementGL = @NewRouNBV;  -- negative = gain (reduce expense)
    SET @NewRouNBV = 0;
  END

  -- Build new amortisation schedule preview (first 6 rows)
  DECLARE @PreviewPeriod INT = 1;
  DECLARE @PreviewOpening DECIMAL(18,2) = @NewPV;
  DECLARE @PreviewRows TABLE (
    period_no INT, period_date DATE,
    opening_liability DECIMAL(18,2), interest_expense DECIMAL(18,2),
    payment DECIMAL(18,2), principal DECIMAL(18,2), closing_liability DECIMAL(18,2),
    rou_nbv DECIMAL(18,2), depreciation DECIMAL(18,2)
  );

  DECLARE @PreviewRouNBV DECIMAL(18,2) = @NewRouNBV;
  DECLARE @PreviewDepr   DECIMAL(18,2) = ROUND(@NewRouNBV / @RemainingMonths, 2);

  WHILE @PreviewPeriod <= CASE WHEN @RemainingMonths < 6 THEN @RemainingMonths ELSE 6 END
  BEGIN
    DECLARE @PreviewInterest DECIMAL(18,2) = ROUND(@PreviewOpening * @MonthlyRate, 2);
    DECLARE @PreviewPrincipal DECIMAL(18,2) = @NewMonthlyPayment - @PreviewInterest;
    DECLARE @PreviewClosing DECIMAL(18,2) = @PreviewOpening - @PreviewPrincipal;
    IF @PreviewClosing < 0 SET @PreviewClosing = 0;
    DECLARE @PreviewRouRow DECIMAL(18,2) = @PreviewRouNBV - @PreviewDepr;
    IF @PreviewRouRow < 0 SET @PreviewRouRow = 0;

    INSERT INTO @PreviewRows VALUES (
      @PreviewPeriod,
      DATEADD(MONTH, @PreviewPeriod - 1, @EffectiveDate),
      @PreviewOpening, @PreviewInterest,
      @NewMonthlyPayment, @PreviewPrincipal, @PreviewClosing,
      @PreviewRouNBV, @PreviewDepr
    );

    SET @PreviewOpening = @PreviewClosing;
    SET @PreviewRouNBV  = @PreviewRouRow;
    SET @PreviewPeriod  = @PreviewPeriod + 1;
  END

  -- Result set 1: Summary
  SELECT
    @ContractId          AS contract_id,
    @ContractRef         AS contract_ref,
    @OldMonthlyPayment   AS old_monthly_payment,
    @NewMonthlyPayment   AS new_monthly_payment,
    @EffectiveDate       AS effective_date,
    @IBR                 AS ibr_used,
    @RemainingMonths     AS remaining_months,
    @CurrentLiability    AS current_liability,
    @NewPV               AS new_pv,
    @LiabilityDelta      AS liability_delta,
    @CurrentRouNBV       AS current_rou_nbv,
    @NewRouNBV           AS new_rou_nbv,
    @RouDelta            AS rou_delta,
    @RemeasurementGL     AS remeasurement_gain_loss,
    @Currency            AS currency;

  -- Result set 2: JE-4 preview lines
  SELECT line_no, account_code, account_name, dr_cr, amount, description FROM (
    SELECT 1 AS line_no, '2101' AS account_code, 'Lease Liability' AS account_name,
      CASE WHEN @LiabilityDelta > 0 THEN 'Cr' ELSE 'Dr' END AS dr_cr,
      ABS(@LiabilityDelta) AS amount, 'Remeasured lease liability' AS description
    UNION ALL
    SELECT 2, '1601', 'Right-of-Use Asset',
      CASE WHEN @RouDelta > 0 THEN 'Dr' ELSE 'Cr' END,
      ABS(@RouDelta), 'Adjusted ROU asset carrying amount'
    WHERE @RemeasurementGL = 0
    UNION ALL
    SELECT 2, '1601', 'Right-of-Use Asset',
      'Cr', @CurrentRouNBV, 'Derecognise ROU asset (fully absorbed)'
    WHERE @RemeasurementGL < 0
    UNION ALL
    SELECT 3, '7201', 'Remeasurement Gain/Loss on Lease',
      'Cr', ABS(@RemeasurementGL), 'Gain on lease modification'
    WHERE @RemeasurementGL < 0
  ) je ORDER BY line_no;

  -- Result set 3: Schedule preview
  SELECT * FROM @PreviewRows ORDER BY period_no;
END
GO

-- ── 4. sp_PreviewTermination ─────────────────────────────────────────────
IF OBJECT_ID('sp_PreviewTermination','P') IS NOT NULL DROP PROCEDURE sp_PreviewTermination;
GO
CREATE PROCEDURE sp_PreviewTermination
  @ContractId       INT,
  @TerminationDate  DATE
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @ContractRef    NVARCHAR(50),
          @Currency       CHAR(3),
          @CurrentLiability DECIMAL(18,2),
          @CurrentRouNBV  DECIMAL(18,2),
          @LessorName     NVARCHAR(200),
          @ExpiryDate     DATE;

  SELECT
    @ContractRef  = c.contract_ref,
    @Currency     = c.currency,
    @ExpiryDate   = c.expiry_date,
    @LessorName   = l.legal_name
  FROM lease.contracts c
  LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
  WHERE c.contract_id = @ContractId;

  -- Get carrying amounts at termination date
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

  -- Gain/Loss on termination = ROU NBV - Lease Liability (if positive = loss, if negative = gain)
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

-- ── 5. sp_PreviewRenewal ─────────────────────────────────────────────────
IF OBJECT_ID('sp_PreviewRenewal','P') IS NOT NULL DROP PROCEDURE sp_PreviewRenewal;
GO
CREATE PROCEDURE sp_PreviewRenewal
  @ContractId        INT,
  @NewExpiryDate     DATE,
  @NewMonthlyPayment DECIMAL(18,2),
  @NewIBR            DECIMAL(8,6) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @ContractRef       NVARCHAR(50),
          @Currency          CHAR(3),
          @OldExpiryDate     DATE,
          @CurrentLiability  DECIMAL(18,2),
          @CurrentRouNBV     DECIMAL(18,2),
          @IBR               DECIMAL(8,6),
          @OldMonthlyPayment DECIMAL(18,2);

  SELECT
    @ContractRef       = c.contract_ref,
    @Currency          = c.currency,
    @OldExpiryDate     = c.expiry_date,
    @IBR               = ISNULL(@NewIBR, c.ibr),
    @OldMonthlyPayment = c.monthly_payment
  FROM lease.contracts c
  WHERE c.contract_id = @ContractId;

  -- Current carrying amounts
  SELECT TOP 1
    @CurrentLiability = closing_liability,
    @CurrentRouNBV    = rou_nbv
  FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId
  ORDER BY period_date DESC;

  IF @CurrentLiability IS NULL
    SELECT @CurrentLiability = lease_liability_commence, @CurrentRouNBV = rou_asset_value
    FROM lease.contracts WHERE contract_id = @ContractId;

  DECLARE @NewTermMonths  INT = DATEDIFF(MONTH, GETDATE(), @NewExpiryDate);
  IF @NewTermMonths < 1 SET @NewTermMonths = 1;

  DECLARE @MonthlyRate DECIMAL(18,10) = @IBR / 12.0;
  DECLARE @NewPV DECIMAL(18,2);

  IF @MonthlyRate = 0
    SET @NewPV = ROUND(@NewMonthlyPayment * @NewTermMonths, 2)
  ELSE
    SET @NewPV = ROUND(@NewMonthlyPayment * (1 - POWER(1 + @MonthlyRate, -@NewTermMonths)) / @MonthlyRate, 2);

  DECLARE @LiabilityDelta DECIMAL(18,2) = @NewPV - @CurrentLiability;
  DECLARE @NewRouNBV      DECIMAL(18,2) = @CurrentRouNBV + @LiabilityDelta;
  IF @NewRouNBV < 0 SET @NewRouNBV = 0;

  -- Result set 1: Summary
  SELECT
    @ContractId        AS contract_id,
    @ContractRef       AS contract_ref,
    @OldExpiryDate     AS old_expiry_date,
    @NewExpiryDate     AS new_expiry_date,
    @OldMonthlyPayment AS old_monthly_payment,
    @NewMonthlyPayment AS new_monthly_payment,
    @IBR               AS ibr_used,
    @NewTermMonths     AS new_term_months,
    @CurrentLiability  AS current_liability,
    @NewPV             AS new_pv,
    @LiabilityDelta    AS liability_delta,
    @CurrentRouNBV     AS current_rou_nbv,
    @NewRouNBV         AS new_rou_nbv,
    @Currency          AS currency;

  -- Result set 2: JE-7 preview lines
  SELECT line_no, account_code, account_name, dr_cr, amount, description FROM (
    SELECT 1 AS line_no, '2101' AS account_code, 'Lease Liability' AS account_name,
      CASE WHEN @LiabilityDelta > 0 THEN 'Cr' ELSE 'Dr' END AS dr_cr,
      ABS(@LiabilityDelta) AS amount, 'Renewal remeasurement — lease liability' AS description
    UNION ALL
    SELECT 2, '1601', 'Right-of-Use Asset',
      CASE WHEN @LiabilityDelta > 0 THEN 'Dr' ELSE 'Cr' END,
      ABS(@LiabilityDelta), 'Renewal remeasurement — ROU asset'
  ) je ORDER BY line_no;
END
GO

-- ── 6. sp_PostLeaseTransaction ───────────────────────────────────────────
IF OBJECT_ID('sp_PostLeaseTransaction','P') IS NOT NULL DROP PROCEDURE sp_PostLeaseTransaction;
GO
CREATE PROCEDURE sp_PostLeaseTransaction
  @ContractId        INT,
  @TransactionType   NVARCHAR(20),   -- 'Modification' | 'Termination' | 'Renewal'
  @EffectiveDate     DATE,
  @NewMonthlyPayment DECIMAL(18,2)  = NULL,
  @NewIBR            DECIMAL(8,6)   = NULL,
  @NewExpiryDate     DATE           = NULL,
  @Notes             NVARCHAR(500)  = NULL,
  @PostedBy          NVARCHAR(100)  = 'System'
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRANSACTION;
  BEGIN TRY

    DECLARE @JeRef    NVARCHAR(50),
            @JeLabel  NVARCHAR(200),
            @JeNum    NVARCHAR(10);

    -- Generate JE reference
    DECLARE @PostingCount INT = (SELECT COUNT(*) FROM lease.gl_postings WHERE contract_id = @ContractId) + 1;
    SET @JeRef = 'JE-LTC-' + CAST(@ContractId AS NVARCHAR) + '-' + CAST(@PostingCount AS NVARCHAR);

    IF @TransactionType = 'Modification'
    BEGIN
      SET @JeNum   = 'JE-4';
      SET @JeLabel = 'Lease Modification — Remeasurement';

      -- Get current carrying amounts
      DECLARE @ModCurrentLiability DECIMAL(18,2), @ModCurrentRouNBV DECIMAL(18,2);
      SELECT TOP 1 @ModCurrentLiability = closing_liability, @ModCurrentRouNBV = rou_nbv
      FROM lease.amortisation_schedule
      WHERE contract_id = @ContractId AND period_date <= @EffectiveDate
      ORDER BY period_date DESC;

      IF @ModCurrentLiability IS NULL
        SELECT @ModCurrentLiability = lease_liability_commence, @ModCurrentRouNBV = rou_asset_value
        FROM lease.contracts WHERE contract_id = @ContractId;

      -- Compute new PV
      DECLARE @ModIBR          DECIMAL(8,6)  = ISNULL(@NewIBR, (SELECT ibr FROM lease.contracts WHERE contract_id = @ContractId));
      DECLARE @ModExpiry        DATE          = ISNULL(@NewExpiryDate, (SELECT expiry_date FROM lease.contracts WHERE contract_id = @ContractId));
      DECLARE @ModRemaining     INT           = DATEDIFF(MONTH, @EffectiveDate, @ModExpiry);
      IF @ModRemaining < 1 SET @ModRemaining = 1;
      DECLARE @ModMonthlyRate   DECIMAL(18,10) = @ModIBR / 12.0;
      DECLARE @ModNewPV         DECIMAL(18,2);
      IF @ModMonthlyRate = 0
        SET @ModNewPV = ROUND(@NewMonthlyPayment * @ModRemaining, 2)
      ELSE
        SET @ModNewPV = ROUND(@NewMonthlyPayment * (1 - POWER(1 + @ModMonthlyRate, -@ModRemaining)) / @ModMonthlyRate, 2);

      DECLARE @ModLiabilityDelta DECIMAL(18,2) = @ModNewPV - @ModCurrentLiability;
      DECLARE @ModRouDelta       DECIMAL(18,2) = @ModLiabilityDelta;
      DECLARE @ModNewRouNBV      DECIMAL(18,2) = @ModCurrentRouNBV + @ModRouDelta;
      DECLARE @ModGainLoss       DECIMAL(18,2) = 0;
      IF @ModNewRouNBV < 0 BEGIN SET @ModGainLoss = @ModNewRouNBV; SET @ModNewRouNBV = 0; END

      -- Post JE-4 lines
      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '2101', 'Lease Liability',
        CASE WHEN @ModLiabilityDelta > 0 THEN 'Cr' ELSE 'Dr' END, ABS(@ModLiabilityDelta), @PostedBy, @Notes);

      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '1601', 'Right-of-Use Asset',
        CASE WHEN @ModRouDelta > 0 THEN 'Dr' ELSE 'Cr' END, ABS(@ModRouDelta), @PostedBy, @Notes);

      IF @ModGainLoss <> 0
        INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, notes)
        VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '7201', 'Remeasurement Gain/Loss on Lease',
          'Cr', ABS(@ModGainLoss), @PostedBy, @Notes);

      -- Delete future Projected rows and regenerate
      DELETE FROM lease.amortisation_schedule
      WHERE contract_id = @ContractId AND period_date > @EffectiveDate AND posting_status = 'Projected';

      -- Regenerate schedule from effective date
      DECLARE @ModPeriod     INT = 1;
      DECLARE @ModOpening    DECIMAL(18,2) = @ModNewPV;
      DECLARE @ModRouNBV     DECIMAL(18,2) = @ModNewRouNBV;
      DECLARE @ModDepr       DECIMAL(18,2) = CASE WHEN @ModRemaining > 0 THEN ROUND(@ModNewRouNBV / @ModRemaining, 2) ELSE 0 END;
      DECLARE @ModCumDepr    DECIMAL(18,2) = 0;

      WHILE @ModPeriod <= @ModRemaining
      BEGIN
        DECLARE @ModInterest   DECIMAL(18,2) = ROUND(@ModOpening * @ModMonthlyRate, 2);
        DECLARE @ModPrincipal  DECIMAL(18,2) = @NewMonthlyPayment - @ModInterest;
        DECLARE @ModClosing    DECIMAL(18,2) = @ModOpening - @ModPrincipal;
        IF @ModClosing < 0 SET @ModClosing = 0;
        DECLARE @ModRouRow     DECIMAL(18,2) = @ModRouNBV - @ModDepr;
        IF @ModRouRow < 0 SET @ModRouRow = 0;
        SET @ModCumDepr = @ModCumDepr + @ModDepr;

        INSERT INTO lease.amortisation_schedule
          (contract_id, period_date, opening_liability, interest_expense, payment, principal,
           closing_liability, rou_nbv, depreciation, cumulative_depr, posting_status)
        VALUES (
          @ContractId,
          DATEADD(MONTH, @ModPeriod - 1, @EffectiveDate),
          ROUND(@ModOpening, 2), @ModInterest, ROUND(@NewMonthlyPayment, 2), @ModPrincipal,
          @ModClosing, @ModRouNBV, ROUND(@ModDepr, 2), @ModCumDepr, 'Projected'
        );

        SET @ModOpening = @ModClosing;
        SET @ModRouNBV  = @ModRouRow;
        SET @ModPeriod  = @ModPeriod + 1;
      END

      -- Update contract
      UPDATE lease.contracts
      SET monthly_payment  = @NewMonthlyPayment,
          ibr              = ISNULL(@NewIBR, ibr),
          expiry_date      = ISNULL(@NewExpiryDate, expiry_date),
          lifecycle_status = 'Modified',
          modified_at      = GETUTCDATE(),
          updated_at       = GETUTCDATE()
      WHERE contract_id = @ContractId;

    END
    ELSE IF @TransactionType = 'Termination'
    BEGIN
      SET @JeNum   = 'JE-5';
      SET @JeLabel = 'Lease Termination — Derecognition';

      DECLARE @TrmCurrentLiability DECIMAL(18,2), @TrmCurrentRouNBV DECIMAL(18,2);
      SELECT TOP 1 @TrmCurrentLiability = closing_liability, @TrmCurrentRouNBV = rou_nbv
      FROM lease.amortisation_schedule
      WHERE contract_id = @ContractId AND period_date <= @EffectiveDate
      ORDER BY period_date DESC;

      IF @TrmCurrentLiability IS NULL
        SELECT @TrmCurrentLiability = lease_liability_commence, @TrmCurrentRouNBV = rou_asset_value
        FROM lease.contracts WHERE contract_id = @ContractId;

      DECLARE @TrmGainLoss DECIMAL(18,2) = @TrmCurrentRouNBV - @TrmCurrentLiability;

      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '2101', 'Lease Liability', 'Dr', @TrmCurrentLiability, @PostedBy, @Notes);

      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '1601', 'Right-of-Use Asset', 'Cr', @TrmCurrentRouNBV, @PostedBy, @Notes);

      IF @TrmGainLoss <> 0
        INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, notes)
        VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '7201', 'Gain/Loss on Lease Termination',
          CASE WHEN @TrmGainLoss > 0 THEN 'Dr' ELSE 'Cr' END, ABS(@TrmGainLoss), @PostedBy, @Notes);

      -- Remove all future Projected rows
      DELETE FROM lease.amortisation_schedule
      WHERE contract_id = @ContractId AND period_date > @EffectiveDate AND posting_status = 'Projected';

      UPDATE lease.contracts
      SET lifecycle_status = 'Closed',
          expiry_date      = @EffectiveDate,
          status           = 'Terminated',
          updated_at       = GETUTCDATE()
      WHERE contract_id = @ContractId;

    END
    ELSE IF @TransactionType = 'Renewal'
    BEGIN
      SET @JeNum   = 'JE-7';
      SET @JeLabel = 'Lease Renewal — Remeasurement';

      DECLARE @RenCurrentLiability DECIMAL(18,2), @RenCurrentRouNBV DECIMAL(18,2);
      SELECT TOP 1 @RenCurrentLiability = closing_liability, @RenCurrentRouNBV = rou_nbv
      FROM lease.amortisation_schedule
      WHERE contract_id = @ContractId
      ORDER BY period_date DESC;

      IF @RenCurrentLiability IS NULL
        SELECT @RenCurrentLiability = lease_liability_commence, @RenCurrentRouNBV = rou_asset_value
        FROM lease.contracts WHERE contract_id = @ContractId;

      DECLARE @RenIBR        DECIMAL(8,6)  = ISNULL(@NewIBR, (SELECT ibr FROM lease.contracts WHERE contract_id = @ContractId));
      DECLARE @RenTermMonths INT           = DATEDIFF(MONTH, @EffectiveDate, @NewExpiryDate);
      IF @RenTermMonths < 1 SET @RenTermMonths = 1;
      DECLARE @RenMonthlyRate DECIMAL(18,10) = @RenIBR / 12.0;
      DECLARE @RenNewPV       DECIMAL(18,2);
      IF @RenMonthlyRate = 0
        SET @RenNewPV = ROUND(@NewMonthlyPayment * @RenTermMonths, 2)
      ELSE
        SET @RenNewPV = ROUND(@NewMonthlyPayment * (1 - POWER(1 + @RenMonthlyRate, -@RenTermMonths)) / @RenMonthlyRate, 2);

      DECLARE @RenLiabilityDelta DECIMAL(18,2) = @RenNewPV - @RenCurrentLiability;
      DECLARE @RenNewRouNBV      DECIMAL(18,2) = @RenCurrentRouNBV + @RenLiabilityDelta;
      IF @RenNewRouNBV < 0 SET @RenNewRouNBV = 0;

      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '2101', 'Lease Liability',
        CASE WHEN @RenLiabilityDelta > 0 THEN 'Cr' ELSE 'Dr' END, ABS(@RenLiabilityDelta), @PostedBy, @Notes);

      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '1601', 'Right-of-Use Asset',
        CASE WHEN @RenLiabilityDelta > 0 THEN 'Dr' ELSE 'Cr' END, ABS(@RenLiabilityDelta), @PostedBy, @Notes);

      -- Delete all Projected rows and regenerate
      DELETE FROM lease.amortisation_schedule
      WHERE contract_id = @ContractId AND posting_status = 'Projected';

      DECLARE @RenPeriod    INT = 1;
      DECLARE @RenOpening   DECIMAL(18,2) = @RenNewPV;
      DECLARE @RenRouNBV    DECIMAL(18,2) = @RenNewRouNBV;
      DECLARE @RenDepr      DECIMAL(18,2) = CASE WHEN @RenTermMonths > 0 THEN ROUND(@RenNewRouNBV / @RenTermMonths, 2) ELSE 0 END;
      DECLARE @RenCumDepr   DECIMAL(18,2) = 0;

      WHILE @RenPeriod <= @RenTermMonths
      BEGIN
        DECLARE @RenInterest  DECIMAL(18,2) = ROUND(@RenOpening * @RenMonthlyRate, 2);
        DECLARE @RenPrincipal DECIMAL(18,2) = @NewMonthlyPayment - @RenInterest;
        DECLARE @RenClosing   DECIMAL(18,2) = @RenOpening - @RenPrincipal;
        IF @RenClosing < 0 SET @RenClosing = 0;
        DECLARE @RenRouRow    DECIMAL(18,2) = @RenRouNBV - @RenDepr;
        IF @RenRouRow < 0 SET @RenRouRow = 0;
        SET @RenCumDepr = @RenCumDepr + @RenDepr;

        INSERT INTO lease.amortisation_schedule
          (contract_id, period_date, opening_liability, interest_expense, payment, principal,
           closing_liability, rou_nbv, depreciation, cumulative_depr, posting_status)
        VALUES (
          @ContractId,
          DATEADD(MONTH, @RenPeriod - 1, @EffectiveDate),
          ROUND(@RenOpening, 2), @RenInterest, ROUND(@NewMonthlyPayment, 2), @RenPrincipal,
          @RenClosing, @RenRouNBV, ROUND(@RenDepr, 2), @RenCumDepr, 'Projected'
        );

        SET @RenOpening = @RenClosing;
        SET @RenRouNBV  = @RenRouRow;
        SET @RenPeriod  = @RenPeriod + 1;
      END

      UPDATE lease.contracts
      SET monthly_payment  = @NewMonthlyPayment,
          ibr              = ISNULL(@NewIBR, ibr),
          expiry_date      = @NewExpiryDate,
          term_months      = @RenTermMonths,
          lifecycle_status = 'Modified',
          modified_at      = GETUTCDATE(),
          updated_at       = GETUTCDATE()
      WHERE contract_id = @ContractId;
    END

    -- Insert into transaction_drafts as Posted record
    INSERT INTO lease.transaction_drafts
      (contract_id, transaction_type, status, posted_je_ref, notes, created_by, submitted_by, submitted_at, approved_by, approved_at)
    VALUES
      (@ContractId, @TransactionType, 'Posted', @JeRef, @Notes, @PostedBy, @PostedBy, GETUTCDATE(), @PostedBy, GETUTCDATE());

    COMMIT TRANSACTION;
    SELECT @JeRef AS je_ref, @JeNum AS je_num, @JeLabel AS je_label, GETUTCDATE() AS posted_at, @PostedBy AS posted_by;

  END TRY
  BEGIN CATCH
    ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END
GO

-- ── 7. sp_GetLeaseTransactionHistory ─────────────────────────────────────
IF OBJECT_ID('sp_GetLeaseTransactionHistory','P') IS NOT NULL DROP PROCEDURE sp_GetLeaseTransactionHistory;
GO
CREATE PROCEDURE sp_GetLeaseTransactionHistory
  @ContractId INT
AS
BEGIN
  SET NOCOUNT ON;

  -- Transaction drafts / postings
  SELECT
    td.draft_id,
    td.transaction_type,
    td.status,
    td.posted_je_ref,
    td.notes,
    td.created_by,
    td.created_at,
    td.submitted_by,
    td.submitted_at,
    td.approved_by,
    td.approved_at
  FROM lease.transaction_drafts td
  WHERE td.contract_id = @ContractId
  ORDER BY td.created_at DESC;

  -- GL postings for this contract
  SELECT
    gp.posting_id,
    gp.posting_date,
    gp.period_date,
    gp.je_ref,
    gp.je_label,
    gp.ledger_no,
    gp.ledger_name,
    gp.dr_cr,
    gp.amount,
    gp.posted_by,
    gp.posted_at,
    gp.notes
  FROM lease.gl_postings gp
  WHERE gp.contract_id = @ContractId
  ORDER BY gp.posted_at DESC;
END
GO
