import { getPool } from "../db-sqlserver";

async function main() {
  const pool = await getPool();
  const req = () => pool.request();

  console.log("Phase 2: IFRS 16 Lifecycle Engine — Stored Procedures");

  // ── sp_OriginateLease ──────────────────────────────────────────────────
  // Posts JE-1 (ROU Asset Dr / Lease Liability Cr), generates projected schedule,
  // sets lifecycle_status = 'Active'. Can only run once per lease.
  await req().query(`
IF OBJECT_ID('lease.sp_OriginateLease','P') IS NOT NULL DROP PROCEDURE lease.sp_OriginateLease;
`);
  await req().query(`
CREATE PROCEDURE lease.sp_OriginateLease
  @ContractId   INT,
  @PostedBy     NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;

  -- Guard: already originated
  IF EXISTS (SELECT 1 FROM lease.contracts WHERE contract_id = @ContractId AND lifecycle_status <> 'Draft')
  BEGIN
    RAISERROR('Lease %d has already been originated (status is not Draft).', 16, 1, @ContractId);
    RETURN;
  END

  DECLARE
    @MonthlyPayment   DECIMAL(18,2),
    @IBR              DECIMAL(10,6),
    @TermMonths       INT,
    @CommenceDate     DATE,
    @ContractRef      NVARCHAR(50),
    @r                DECIMAL(20,10),
    @OpeningLiability DECIMAL(18,2),
    @ROUAsset         DECIMAL(18,2);

  SELECT
    @MonthlyPayment = monthly_payment,
    @IBR            = ibr,
    @TermMonths     = term_months,
    @CommenceDate   = commencement_date,
    @ContractRef    = contract_ref
  FROM lease.contracts
  WHERE contract_id = @ContractId;

  -- Monthly rate
  SET @r = @IBR / 100.0 / 12.0;

  -- PV of annuity: PMT × (1 − (1+r)^−n) / r
  IF @r = 0
    SET @OpeningLiability = @MonthlyPayment * @TermMonths
  ELSE
    SET @OpeningLiability = @MonthlyPayment * (1.0 - POWER(1.0 + @r, -@TermMonths)) / @r;

  SET @ROUAsset = @OpeningLiability;

  -- ── Post JE-1: Lease Commencement ──
  INSERT INTO lease.gl_postings
    (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by)
  VALUES
    (@ContractId, @CommenceDate, NULL, 'JE-1', 'Lease Commencement — ROU Asset Recognition',
     '1400-001', 'Right-of-Use Asset', 'Dr', @ROUAsset, @PostedBy),
    (@ContractId, @CommenceDate, NULL, 'JE-1', 'Lease Commencement — Lease Liability Recognition',
     '2200-001', 'Lease Liability — IFRS 16', 'Cr', @OpeningLiability, @PostedBy);

  -- ── Generate projected amortisation schedule ──
  DELETE FROM lease.amortisation_schedule WHERE contract_id = @ContractId;

  DECLARE
    @Period         INT = 1,
    @PeriodDate     DATE = @CommenceDate,
    @OpenBal        DECIMAL(18,2) = @OpeningLiability,
    @Interest       DECIMAL(18,2),
    @Principal      DECIMAL(18,2),
    @CloseBal       DECIMAL(18,2),
    @Depreciation   DECIMAL(18,2),
    @AccumDepr      DECIMAL(18,2) = 0,
    @MonthlyDepr    DECIMAL(18,2);

  SET @MonthlyDepr = @ROUAsset / @TermMonths;

  WHILE @Period <= @TermMonths
  BEGIN
    SET @Interest    = ROUND(@OpenBal * @r, 2);
    SET @Principal   = @MonthlyPayment - @Interest;
    SET @CloseBal    = @OpenBal - @Principal;
    SET @AccumDepr   = @AccumDepr + @MonthlyDepr;
    SET @Depreciation = @MonthlyDepr;

    -- Clamp closing balance to 0 on last period
    IF @Period = @TermMonths SET @CloseBal = 0;

    INSERT INTO lease.amortisation_schedule
      (contract_id, period_date, opening_liability, interest_expense,
       payment, principal, closing_liability,
       depreciation, rou_nbv, posting_status, posted_at, posted_by)
    VALUES
      (@ContractId, @PeriodDate,
       @OpenBal, @Interest, @MonthlyPayment, @Principal, @CloseBal,
       @Depreciation, @ROUAsset - @AccumDepr,
       'Projected', NULL, NULL);

    SET @OpenBal    = @CloseBal;
    SET @Period     = @Period + 1;
    SET @PeriodDate = DATEADD(MONTH, 1, @PeriodDate);
  END

  -- ── Update lease status ──
  UPDATE lease.contracts
  SET lifecycle_status     = 'Active',
      originated_at        = GETUTCDATE(),
      lease_liability_commence = @OpeningLiability,
      rou_asset_value      = @ROUAsset
  WHERE contract_id = @ContractId;

  SELECT 'Originated' AS result, @OpeningLiability AS opening_liability, @TermMonths AS periods_generated;
END
`);
  console.log("✅ sp_OriginateLease created");

  // ── sp_PostPeriod ──────────────────────────────────────────────────────
  // Posts JE-2 (Interest), JE-3 (Payment), JE-4 (Depreciation) for one month.
  // Marks that period as Posted. Cannot re-post.
  await req().query(`
IF OBJECT_ID('lease.sp_PostPeriod','P') IS NOT NULL DROP PROCEDURE lease.sp_PostPeriod;
`);
  await req().query(`
CREATE PROCEDURE lease.sp_PostPeriod
  @ContractId   INT,
  @PeriodDate   DATE,
  @PostedBy     NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;

  -- Guard: lease must be Active or Modified
  IF NOT EXISTS (
    SELECT 1 FROM lease.contracts
    WHERE contract_id = @ContractId AND lifecycle_status IN ('Active','Modified')
  )
  BEGIN
    RAISERROR('Lease %d is not in Active or Modified status.', 16, 1, @ContractId);
    RETURN;
  END

  -- Guard: period must exist and be Projected
  IF NOT EXISTS (
    SELECT 1 FROM lease.amortisation_schedule
    WHERE contract_id = @ContractId
      AND CAST(period_date AS DATE) = @PeriodDate
      AND posting_status = 'Projected'
  )
  BEGIN
    DECLARE @PeriodStr NVARCHAR(20) = CONVERT(NVARCHAR(20), @PeriodDate, 23);
    RAISERROR('Period %s for lease %d is not found or already posted.', 16, 1, @PeriodStr, @ContractId);
    RETURN;
  END

  DECLARE
    @Interest     DECIMAL(18,2),
    @Payment      DECIMAL(18,2),
    @Principal    DECIMAL(18,2),
    @Depreciation DECIMAL(18,2),
    @OpenBal      DECIMAL(18,2);

  SELECT
    @Interest     = interest_expense,
    @Payment      = payment,
    @Principal    = principal,
    @Depreciation = depreciation,
    @OpenBal      = opening_liability
  FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId AND CAST(period_date AS DATE) = @PeriodDate;

  -- ── JE-2: Interest Accrual ──
  INSERT INTO lease.gl_postings
    (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by)
  VALUES
    (@ContractId, GETUTCDATE(), @PeriodDate, 'JE-2', 'Finance Cost — Interest Accrual',
     '6100-001', 'Interest Expense — IFRS 16', 'Dr', @Interest, @PostedBy),
    (@ContractId, GETUTCDATE(), @PeriodDate, 'JE-2', 'Finance Cost — Interest Accrual',
     '2200-001', 'Lease Liability — IFRS 16', 'Cr', @Interest, @PostedBy);

  -- ── JE-3: Lease Payment ──
  INSERT INTO lease.gl_postings
    (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by)
  VALUES
    (@ContractId, GETUTCDATE(), @PeriodDate, 'JE-3', 'Lease Payment — Cash Settlement',
     '2200-001', 'Lease Liability — IFRS 16', 'Dr', @Payment, @PostedBy),
    (@ContractId, GETUTCDATE(), @PeriodDate, 'JE-3', 'Lease Payment — Cash Settlement',
     '1010-001', 'Bank / Cash Account', 'Cr', @Payment, @PostedBy);

  -- ── JE-4: ROU Asset Depreciation ──
  INSERT INTO lease.gl_postings
    (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by)
  VALUES
    (@ContractId, GETUTCDATE(), @PeriodDate, 'JE-4', 'ROU Asset Depreciation',
     '7100-001', 'Depreciation Expense — ROU Asset', 'Dr', @Depreciation, @PostedBy),
    (@ContractId, GETUTCDATE(), @PeriodDate, 'JE-4', 'ROU Asset Depreciation',
     '1600-002', 'Accumulated Depreciation — ROU Asset', 'Cr', @Depreciation, @PostedBy);

  -- ── Mark period as Posted ──
  UPDATE lease.amortisation_schedule
  SET posting_status = 'Posted',
      posted_at      = GETUTCDATE(),
      posted_by      = @PostedBy
  WHERE contract_id = @ContractId AND CAST(period_date AS DATE) = @PeriodDate;

  SELECT 'Posted' AS result, @PeriodDate AS period_posted,
         @Interest AS interest, @Payment AS payment, @Depreciation AS depreciation;
END
`);
  console.log("✅ sp_PostPeriod created");

  // ── sp_ModifyLease ─────────────────────────────────────────────────────
  // Posts JE-6 (remeasurement), regenerates remaining Projected periods.
  await req().query(`
IF OBJECT_ID('lease.sp_ModifyLease','P') IS NOT NULL DROP PROCEDURE lease.sp_ModifyLease;
`);
  await req().query(`
CREATE PROCEDURE lease.sp_ModifyLease
  @ContractId       INT,
  @NewMonthlyPayment DECIMAL(18,2),
  @EffectiveDate    DATE,
  @PostedBy         NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;

  -- Guard: lease must be Active or Modified
  IF NOT EXISTS (
    SELECT 1 FROM lease.contracts
    WHERE contract_id = @ContractId AND lifecycle_status IN ('Active','Modified')
  )
  BEGIN
    RAISERROR('Lease %d is not in Active or Modified status.', 16, 1, @ContractId);
    RETURN;
  END

  DECLARE
    @IBR              DECIMAL(10,6),
    @r                DECIMAL(20,10),
    @OldOpenBal       DECIMAL(18,2),
    @NewOpenBal       DECIMAL(18,2),
    @Difference       DECIMAL(18,2),
    @RemainingPeriods INT,
    @ROUAsset         DECIMAL(18,2);

  SELECT @IBR = ibr FROM lease.contracts WHERE contract_id = @ContractId;
  SET @r = @IBR / 100.0 / 12.0;

  -- Get opening balance of the first Projected period on or after effective date
  SELECT @OldOpenBal = MIN(opening_liability), @RemainingPeriods = COUNT(*)
  FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId
    AND CAST(period_date AS DATE) >= @EffectiveDate
    AND posting_status = 'Projected';

  -- Recalculate new PV with new payment
  IF @r = 0
    SET @NewOpenBal = @NewMonthlyPayment * @RemainingPeriods
  ELSE
    SET @NewOpenBal = @NewMonthlyPayment * (1.0 - POWER(1.0 + @r, -@RemainingPeriods)) / @r;

  SET @Difference = @NewOpenBal - @OldOpenBal;

  -- ── JE-6: Remeasurement ──
  IF @Difference > 0
  BEGIN
    -- Increase: Dr ROU Asset, Cr Lease Liability
    INSERT INTO lease.gl_postings
      (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by)
    VALUES
      (@ContractId, @EffectiveDate, @EffectiveDate, 'JE-6', 'Lease Modification — Remeasurement (Increase)',
       '1400-001', 'Right-of-Use Asset', 'Dr', ABS(@Difference), @PostedBy),
      (@ContractId, @EffectiveDate, @EffectiveDate, 'JE-6', 'Lease Modification — Remeasurement (Increase)',
       '2200-001', 'Lease Liability — IFRS 16', 'Cr', ABS(@Difference), @PostedBy);
  END
  ELSE IF @Difference < 0
  BEGIN
    -- Decrease: Dr Lease Liability, Cr ROU Asset
    INSERT INTO lease.gl_postings
      (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by)
    VALUES
      (@ContractId, @EffectiveDate, @EffectiveDate, 'JE-6', 'Lease Modification — Remeasurement (Decrease)',
       '2200-001', 'Lease Liability — IFRS 16', 'Dr', ABS(@Difference), @PostedBy),
      (@ContractId, @EffectiveDate, @EffectiveDate, 'JE-6', 'Lease Modification — Remeasurement (Decrease)',
       '1400-001', 'Right-of-Use Asset', 'Cr', ABS(@Difference), @PostedBy);
  END

  -- ── Regenerate remaining Projected periods ──
  DELETE FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId
    AND CAST(period_date AS DATE) >= @EffectiveDate
    AND posting_status = 'Projected';

  DECLARE
    @Period       INT = 1,
    @PeriodDate   DATE = @EffectiveDate,
    @OpenBal      DECIMAL(18,2) = @NewOpenBal,
    @Interest     DECIMAL(18,2),
    @Principal    DECIMAL(18,2),
    @CloseBal     DECIMAL(18,2),
    @MonthlyDepr  DECIMAL(18,2),
    @AccumDepr    DECIMAL(18,2) = 0;

  SET @MonthlyDepr = @NewOpenBal / @RemainingPeriods;

  WHILE @Period <= @RemainingPeriods
  BEGIN
    SET @Interest  = ROUND(@OpenBal * @r, 2);
    SET @Principal = @NewMonthlyPayment - @Interest;
    SET @CloseBal  = @OpenBal - @Principal;
    SET @AccumDepr = @AccumDepr + @MonthlyDepr;
    IF @Period = @RemainingPeriods SET @CloseBal = 0;

    INSERT INTO lease.amortisation_schedule
      (contract_id, period_date, opening_liability, interest_expense,
       payment, principal, closing_liability,
       depreciation, rou_nbv, posting_status, posted_at, posted_by)
    VALUES
      (@ContractId, @PeriodDate,
       @OpenBal, @Interest, @NewMonthlyPayment, @Principal, @CloseBal,
       @MonthlyDepr, @NewOpenBal - @AccumDepr,
       'Projected', NULL, NULL);

    SET @OpenBal    = @CloseBal;
    SET @Period     = @Period + 1;
    SET @PeriodDate = DATEADD(MONTH, 1, @PeriodDate);
  END

  -- ── Update lease ──
  UPDATE lease.contracts
  SET monthly_payment  = @NewMonthlyPayment,
      lifecycle_status = 'Modified',
      modified_at      = GETUTCDATE()
  WHERE contract_id = @ContractId;

  SELECT 'Modified' AS result, @OldOpenBal AS old_liability, @NewOpenBal AS new_liability,
         @Difference AS remeasurement_amount, @RemainingPeriods AS periods_regenerated;
END
`);
  console.log("✅ sp_ModifyLease created");

  // ── sp_CloseLease ──────────────────────────────────────────────────────
  // Posts JE-5 (derecognition), sets lifecycle_status = 'Closed'.
  await req().query(`
IF OBJECT_ID('lease.sp_CloseLease','P') IS NOT NULL DROP PROCEDURE lease.sp_CloseLease;
`);
  await req().query(`
CREATE PROCEDURE lease.sp_CloseLease
  @ContractId   INT,
  @CloseDate    DATE,
  @PostedBy     NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;

  -- Guard: lease must be Active or Modified
  IF NOT EXISTS (
    SELECT 1 FROM lease.contracts
    WHERE contract_id = @ContractId AND lifecycle_status IN ('Active','Modified')
  )
  BEGIN
    RAISERROR('Lease %d is not in Active or Modified status.', 16, 1, @ContractId);
    RETURN;
  END

  -- Get last posted closing balance (remaining liability)
  DECLARE
    @RemainingLiability DECIMAL(18,2),
    @ROUOriginal        DECIMAL(18,2),
    @AccumDepr          DECIMAL(18,2),
    @ROUNbv             DECIMAL(18,2),
    @GainLoss           DECIMAL(18,2);

  SELECT @RemainingLiability = ISNULL(
    (SELECT TOP 1 closing_liability FROM lease.amortisation_schedule
     WHERE contract_id = @ContractId AND posting_status = 'Posted'
     ORDER BY period_date DESC), 0);

  SELECT @ROUOriginal = rou_asset_value FROM lease.contracts WHERE contract_id = @ContractId;

  SELECT @AccumDepr = ISNULL(SUM(depreciation), 0)
  FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId AND posting_status = 'Posted';

  SET @ROUNbv   = @ROUOriginal - @AccumDepr;
  SET @GainLoss = @RemainingLiability - @ROUNbv;  -- positive = gain, negative = loss

  -- ── JE-5: Derecognition ──
  INSERT INTO lease.gl_postings
    (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by)
  VALUES
    -- Derecognise Lease Liability (Dr)
    (@ContractId, @CloseDate, @CloseDate, 'JE-5', 'Lease Closure — Derecognition',
     '2200-001', 'Lease Liability — IFRS 16', 'Dr', @RemainingLiability, @PostedBy),
    -- Derecognise Accumulated Depreciation (Dr)
    (@ContractId, @CloseDate, @CloseDate, 'JE-5', 'Lease Closure — Derecognition',
     '1600-002', 'Accumulated Depreciation — ROU Asset', 'Dr', @AccumDepr, @PostedBy),
    -- Derecognise ROU Asset (Cr)
    (@ContractId, @CloseDate, @CloseDate, 'JE-5', 'Lease Closure — Derecognition',
     '1400-001', 'Right-of-Use Asset', 'Cr', @ROUOriginal, @PostedBy);

  -- Post Gain or Loss
  IF @GainLoss > 0
    INSERT INTO lease.gl_postings
      (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by)
    VALUES
      (@ContractId, @CloseDate, @CloseDate, 'JE-5', 'Lease Closure — Gain on Termination',
       '8100-001', 'Gain on Lease Termination', 'Cr', @GainLoss, @PostedBy);
  ELSE IF @GainLoss < 0
    INSERT INTO lease.gl_postings
      (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by)
    VALUES
      (@ContractId, @CloseDate, @CloseDate, 'JE-5', 'Lease Closure — Loss on Termination',
       '8200-001', 'Loss on Lease Termination', 'Dr', ABS(@GainLoss), @PostedBy);

  -- ── Delete remaining Projected periods ──
  DELETE FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId AND posting_status = 'Projected';

  -- ── Update lease status ──
  UPDATE lease.contracts
  SET lifecycle_status = 'Closed',
      expiry_date      = @CloseDate
  WHERE contract_id = @ContractId;

  SELECT 'Closed' AS result,
         @RemainingLiability AS remaining_liability,
         @ROUNbv AS rou_nbv,
         @GainLoss AS gain_loss;
END
`);
  console.log("✅ sp_CloseLease created");

  // ── sp_GetLeaseLifecycle ───────────────────────────────────────────────
  // Returns schedule rows with posting_status, plus lifecycle_status of the lease.
  await req().query(`
IF OBJECT_ID('lease.sp_GetLeaseLifecycle','P') IS NOT NULL DROP PROCEDURE lease.sp_GetLeaseLifecycle;
`);
  await req().query(`
CREATE PROCEDURE lease.sp_GetLeaseLifecycle
  @ContractId INT = NULL,
  @Year       INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    c.contract_id,
    c.contract_ref,
    c.lifecycle_status,
    c.originated_at,
    c.modified_at,
    c.monthly_payment,
    c.ibr,
    c.term_months,
    c.commencement_date,
    c.expiry_date,
    a.schedule_id,
    a.period_date,
    a.opening_liability,
    a.interest_expense,
    a.payment,
    a.principal,
    a.closing_liability,
    a.depreciation,
    a.rou_nbv,
    a.posting_status,
    a.posted_at,
    a.posted_by
  FROM lease.contracts c
  LEFT JOIN lease.amortisation_schedule a ON a.contract_id = c.contract_id
  WHERE c.status NOT IN ('Deleted','Terminated')
    AND (@ContractId IS NULL OR c.contract_id = @ContractId)
    AND (@Year IS NULL OR YEAR(a.period_date) = @Year OR a.period_date IS NULL)
  ORDER BY c.contract_ref, a.period_date;
END
`);
  console.log("✅ sp_GetLeaseLifecycle created");

  // ── sp_GetGLPostings ───────────────────────────────────────────────────
  await req().query(`
IF OBJECT_ID('lease.sp_GetGLPostings','P') IS NOT NULL DROP PROCEDURE lease.sp_GetGLPostings;
`);
  await req().query(`
CREATE PROCEDURE lease.sp_GetGLPostings
  @ContractId INT = NULL,
  @JeRef      NVARCHAR(10) = NULL,
  @FromDate   DATE = NULL,
  @ToDate     DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    p.posting_id,
    p.contract_id,
    c.contract_ref,
    p.posting_date,
    p.period_date,
    p.je_ref,
    p.je_label,
    p.ledger_no,
    p.ledger_name,
    p.dr_cr,
    p.amount,
    p.posted_by,
    p.posted_at,
    p.notes
  FROM lease.gl_postings p
  JOIN lease.contracts c ON c.contract_id = p.contract_id
  WHERE (@ContractId IS NULL OR p.contract_id = @ContractId)
    AND (@JeRef      IS NULL OR p.je_ref = @JeRef)
    AND (@FromDate   IS NULL OR p.posting_date >= @FromDate)
    AND (@ToDate     IS NULL OR p.posting_date <= @ToDate)
  ORDER BY p.posted_at DESC, p.posting_id;
END
`);
  console.log("✅ sp_GetGLPostings created");

  console.log("\n✅ Phase 2 complete — all lifecycle SPs ready");
  process.exit(0);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
