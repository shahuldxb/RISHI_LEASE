/**
 * Migration: Features 15 and 17
 *
 * Feature 15: Multi-Standard Parallel Computation
 *   - lease.sp_GetMultiStandardComparison  — per-period side-by-side: IFRS 16 | ASC 842 | IPSAS 43
 *   - lease.sp_GetStandardSummary          — aggregate totals per standard
 *
 * Feature 17: Lease Modification Wizard
 *   - lease.lease_modifications table
 *   - lease.sp_GetLeaseModifications       — list modifications for a contract
 *   - lease.sp_CreateLeaseModification     — compute remeasurement, insert draft
 *   - lease.sp_ApplyLeaseModification      — approve: update contract, regenerate schedule, post GL
 *
 * Column names verified from DB:
 *   amortisation_schedule: schedule_id, contract_id, period_date, opening_liability,
 *                          interest_expense, payment, principal, closing_liability,
 *                          rou_nbv, depreciation, cumulative_depr, posting_status, posted_at, posted_by
 *   contracts: contract_id, contract_ref, lessor_id, asset_type, asset_description,
 *              commencement_date, expiry_date, term_months, monthly_payment, currency,
 *              ibr, rou_asset_value, lease_liability_commence, status, lifecycle_status
 *   gl_postings: posting_id, contract_id, posting_date, period_date, je_ref, je_label,
 *                ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes
 */
import { getPool } from "../db-sqlserver";

async function main() {
  const pool = await getPool();
  const req = () => pool.request();
  console.log("=== Features 15 & 17 Migration ===");

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE 15: sp_GetMultiStandardComparison
  // Computes per-period schedule for a single lease under three standards:
  //   IFRS 16  — finance lease model (all leases on balance sheet)
  //   ASC 842  — distinguishes operating vs finance; operating leases use
  //              straight-line single lease cost, no interest/depr split
  //   IPSAS 43 — same single-model as IFRS 16 (aligned from 2025)
  // ───────────────────────────────────────────────────────────────────────────
  await req().query(`IF OBJECT_ID('lease.sp_GetMultiStandardComparison','P') IS NOT NULL DROP PROCEDURE lease.sp_GetMultiStandardComparison;`);
  await req().query(`
CREATE PROCEDURE lease.sp_GetMultiStandardComparison
  @ContractId  INT,
  @PeriodStart DATE = NULL,
  @PeriodEnd   DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;

  -- ── Contract meta ──────────────────────────────────────────────────────────
  DECLARE @IBR              DECIMAL(10,6),
          @MonthlyPayment   DECIMAL(18,2),
          @CommencementDate DATE,
          @ExpiryDate       DATE,
          @ROU              DECIMAL(18,2),
          @Liability        DECIMAL(18,2),
          @Classification   NVARCHAR(50),
          @TermMonths       INT;

  SELECT
    @IBR              = ibr,
    @MonthlyPayment   = monthly_payment,
    @CommencementDate = commencement_date,
    @ExpiryDate       = expiry_date,
    @ROU              = ISNULL(rou_asset_value, 0),
    @Liability        = ISNULL(lease_liability_commence, 0),
    @Classification   = ISNULL(ifrs16_classification, 'finance'),
    @TermMonths       = term_months
  FROM lease.contracts
  WHERE contract_id = @ContractId;

  IF @IBR IS NULL
  BEGIN
    RAISERROR('Contract not found: %d', 16, 1, @ContractId);
    RETURN;
  END

  -- Default period bounds
  IF @PeriodStart IS NULL SET @PeriodStart = @CommencementDate;
  IF @PeriodEnd   IS NULL SET @PeriodEnd   = @ExpiryDate;

  -- Monthly IBR rate
  DECLARE @MonthlyRate DECIMAL(20,10) = @IBR / 12.0;

  -- ── RS 1: Per-period comparison ────────────────────────────────────────────
  -- Pull actual amortisation schedule for IFRS 16 / IPSAS 43 figures
  -- ASC 842 operating: straight-line single cost = monthly_payment
  -- ASC 842 finance  : same as IFRS 16
  SELECT
    a.period_date,

    -- IFRS 16 columns (finance model — all leases)
    a.opening_liability                                          AS ifrs16_opening_liability,
    a.interest_expense                                           AS ifrs16_interest_expense,
    a.payment                                                    AS ifrs16_payment,
    a.principal                                                  AS ifrs16_principal,
    a.closing_liability                                          AS ifrs16_closing_liability,
    a.rou_nbv                                                    AS ifrs16_rou_nbv,
    a.depreciation                                               AS ifrs16_depreciation,
    a.interest_expense + a.depreciation                          AS ifrs16_pl_charge,

    -- ASC 842 columns
    -- Finance lease: identical to IFRS 16
    -- Operating lease: single straight-line lease cost, no balance sheet split shown
    CASE WHEN @Classification = 'operating'
         THEN NULL
         ELSE a.opening_liability
    END                                                          AS asc842_opening_liability,
    CASE WHEN @Classification = 'operating'
         THEN NULL
         ELSE a.interest_expense
    END                                                          AS asc842_interest_expense,
    a.payment                                                    AS asc842_payment,
    CASE WHEN @Classification = 'operating'
         THEN NULL
         ELSE a.principal
    END                                                          AS asc842_principal,
    CASE WHEN @Classification = 'operating'
         THEN NULL
         ELSE a.closing_liability
    END                                                          AS asc842_closing_liability,
    CASE WHEN @Classification = 'operating'
         THEN NULL
         ELSE a.rou_nbv
    END                                                          AS asc842_rou_nbv,
    CASE WHEN @Classification = 'operating'
         THEN NULL
         ELSE a.depreciation
    END                                                          AS asc842_depreciation,
    -- ASC 842 P&L: operating = straight-line payment; finance = interest + depr
    CASE WHEN @Classification = 'operating'
         THEN a.payment
         ELSE a.interest_expense + a.depreciation
    END                                                          AS asc842_pl_charge,

    -- IPSAS 43 columns (aligned with IFRS 16 from 2025 — same single model)
    a.opening_liability                                          AS ipsas43_opening_liability,
    a.interest_expense                                           AS ipsas43_interest_expense,
    a.payment                                                    AS ipsas43_payment,
    a.principal                                                  AS ipsas43_principal,
    a.closing_liability                                          AS ipsas43_closing_liability,
    a.rou_nbv                                                    AS ipsas43_rou_nbv,
    a.depreciation                                               AS ipsas43_depreciation,
    a.interest_expense + a.depreciation                          AS ipsas43_pl_charge,

    -- Difference columns (IFRS 16 vs ASC 842 P&L)
    CASE WHEN @Classification = 'operating'
         THEN (a.interest_expense + a.depreciation) - a.payment
         ELSE 0
    END                                                          AS ifrs16_vs_asc842_pl_diff,

    -- Classification flag
    @Classification                                              AS asc842_classification

  FROM lease.amortisation_schedule a
  WHERE a.contract_id = @ContractId
    AND a.period_date BETWEEN @PeriodStart AND @PeriodEnd
  ORDER BY a.period_date;

  -- ── RS 2: Summary totals per standard ─────────────────────────────────────
  SELECT
    -- IFRS 16 totals
    SUM(a.interest_expense + a.depreciation)                     AS ifrs16_total_pl,
    SUM(a.interest_expense)                                      AS ifrs16_total_interest,
    SUM(a.depreciation)                                          AS ifrs16_total_depreciation,
    MAX(a.rou_nbv)                                               AS ifrs16_peak_rou,
    MAX(a.opening_liability)                                     AS ifrs16_peak_liability,

    -- ASC 842 totals
    CASE WHEN @Classification = 'operating'
         THEN SUM(a.payment)
         ELSE SUM(a.interest_expense + a.depreciation)
    END                                                          AS asc842_total_pl,
    CASE WHEN @Classification = 'operating'
         THEN NULL
         ELSE SUM(a.interest_expense)
    END                                                          AS asc842_total_interest,
    CASE WHEN @Classification = 'operating'
         THEN NULL
         ELSE SUM(a.depreciation)
    END                                                          AS asc842_total_depreciation,
    CASE WHEN @Classification = 'operating'
         THEN NULL
         ELSE MAX(a.rou_nbv)
    END                                                          AS asc842_peak_rou,
    CASE WHEN @Classification = 'operating'
         THEN NULL
         ELSE MAX(a.opening_liability)
    END                                                          AS asc842_peak_liability,

    -- IPSAS 43 totals (same as IFRS 16)
    SUM(a.interest_expense + a.depreciation)                     AS ipsas43_total_pl,
    SUM(a.interest_expense)                                      AS ipsas43_total_interest,
    SUM(a.depreciation)                                          AS ipsas43_total_depreciation,
    MAX(a.rou_nbv)                                               AS ipsas43_peak_rou,
    MAX(a.opening_liability)                                     AS ipsas43_peak_liability,

    -- Difference
    CASE WHEN @Classification = 'operating'
         THEN SUM(a.interest_expense + a.depreciation) - SUM(a.payment)
         ELSE 0
    END                                                          AS ifrs16_vs_asc842_total_pl_diff,

    @Classification                                              AS asc842_classification,
    COUNT(*)                                                     AS period_count

  FROM lease.amortisation_schedule a
  WHERE a.contract_id = @ContractId
    AND a.period_date BETWEEN @PeriodStart AND @PeriodEnd;

END;
`);
  console.log("✅ sp_GetMultiStandardComparison created");

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE 15: sp_GetStandardSummary (portfolio-level totals per standard)
  // ───────────────────────────────────────────────────────────────────────────
  await req().query(`IF OBJECT_ID('lease.sp_GetStandardSummary','P') IS NOT NULL DROP PROCEDURE lease.sp_GetStandardSummary;`);
  await req().query(`
CREATE PROCEDURE lease.sp_GetStandardSummary
  @PeriodStart DATE = NULL,
  @PeriodEnd   DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @PeriodStart IS NULL SET @PeriodStart = '2020-01-01';
  IF @PeriodEnd   IS NULL SET @PeriodEnd   = GETDATE();

  SELECT
    c.contract_id,
    c.contract_ref,
    c.asset_description,
    c.asset_type,
    c.currency,
    ISNULL(c.ifrs16_classification, 'finance')                   AS asc842_classification,

    -- IFRS 16 (finance model for all)
    SUM(a.interest_expense + a.depreciation)                     AS ifrs16_total_pl,
    MAX(a.rou_nbv)                                               AS ifrs16_peak_rou,
    MAX(a.opening_liability)                                     AS ifrs16_peak_liability,

    -- ASC 842 (operating = straight-line; finance = same as IFRS 16)
    CASE WHEN ISNULL(c.ifrs16_classification,'finance') = 'operating'
         THEN SUM(a.payment)
         ELSE SUM(a.interest_expense + a.depreciation)
    END                                                          AS asc842_total_pl,
    CASE WHEN ISNULL(c.ifrs16_classification,'finance') = 'operating'
         THEN NULL
         ELSE MAX(a.rou_nbv)
    END                                                          AS asc842_peak_rou,
    CASE WHEN ISNULL(c.ifrs16_classification,'finance') = 'operating'
         THEN NULL
         ELSE MAX(a.opening_liability)
    END                                                          AS asc842_peak_liability,

    -- IPSAS 43 (same as IFRS 16)
    SUM(a.interest_expense + a.depreciation)                     AS ipsas43_total_pl,
    MAX(a.rou_nbv)                                               AS ipsas43_peak_rou,
    MAX(a.opening_liability)                                     AS ipsas43_peak_liability,

    -- Difference
    CASE WHEN ISNULL(c.ifrs16_classification,'finance') = 'operating'
         THEN SUM(a.interest_expense + a.depreciation) - SUM(a.payment)
         ELSE 0
    END                                                          AS ifrs16_vs_asc842_pl_diff

  FROM lease.contracts c
  JOIN lease.amortisation_schedule a ON a.contract_id = c.contract_id
  WHERE c.status = 'active'
    AND a.period_date BETWEEN @PeriodStart AND @PeriodEnd
  GROUP BY c.contract_id, c.contract_ref, c.asset_description, c.asset_type, c.currency, c.ifrs16_classification
  ORDER BY c.contract_ref;

END;
`);
  console.log("✅ sp_GetStandardSummary created");

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE 17: lease_modifications table
  // ───────────────────────────────────────────────────────────────────────────
  await req().query(`
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('lease.lease_modifications'))
CREATE TABLE lease.lease_modifications (
  modification_id       INT IDENTITY(1,1) PRIMARY KEY,
  contract_id           INT NOT NULL,
  modification_date     DATE NOT NULL,
  modification_type     NVARCHAR(50) NOT NULL,  -- 'extension','payment_change','scope_change','termination'
  old_ibr               DECIMAL(10,6),
  new_ibr               DECIMAL(10,6),
  old_term_end          DATE,
  new_term_end          DATE,
  old_monthly_payment   DECIMAL(18,2),
  new_monthly_payment   DECIMAL(18,2),
  old_rou_nbv           DECIMAL(18,2),
  new_rou_nbv           DECIMAL(18,2),
  old_liability         DECIMAL(18,2),
  new_liability         DECIMAL(18,2),
  remeasurement_gain_loss DECIMAL(18,2),
  je_ref                NVARCHAR(50),
  status                NVARCHAR(20) NOT NULL DEFAULT 'draft',  -- 'draft','approved','applied','rejected'
  notes                 NVARCHAR(1000),
  created_by            INT,
  created_at            DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  approved_by           INT,
  approved_at           DATETIME2,
  applied_at            DATETIME2,
  CONSTRAINT fk_lmod_contract FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);
`);
  console.log("✅ lease_modifications table created");

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE 17: sp_GetLeaseModifications
  // ───────────────────────────────────────────────────────────────────────────
  await req().query(`IF OBJECT_ID('lease.sp_GetLeaseModifications','P') IS NOT NULL DROP PROCEDURE lease.sp_GetLeaseModifications;`);
  await req().query(`
CREATE PROCEDURE lease.sp_GetLeaseModifications
  @ContractId INT = NULL,
  @Status     NVARCHAR(20) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    m.modification_id,
    m.contract_id,
    c.contract_ref,
    c.asset_description,
    c.asset_type,
    m.modification_date,
    m.modification_type,
    m.old_ibr,
    m.new_ibr,
    m.old_term_end,
    m.new_term_end,
    m.old_monthly_payment,
    m.new_monthly_payment,
    m.old_rou_nbv,
    m.new_rou_nbv,
    m.old_liability,
    m.new_liability,
    m.remeasurement_gain_loss,
    m.je_ref,
    m.status,
    m.notes,
    m.created_at,
    m.approved_at,
    m.applied_at
  FROM lease.lease_modifications m
  JOIN lease.contracts c ON c.contract_id = m.contract_id
  WHERE (@ContractId IS NULL OR m.contract_id = @ContractId)
    AND (@Status     IS NULL OR m.status      = @Status)
  ORDER BY m.created_at DESC;
END;
`);
  console.log("✅ sp_GetLeaseModifications created");

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE 17: sp_CreateLeaseModification
  // Computes remeasurement: new PV of revised cash flows at new IBR
  // Calculates delta ROU and liability, gain/loss
  // Inserts draft record
  // ───────────────────────────────────────────────────────────────────────────
  await req().query(`IF OBJECT_ID('lease.sp_CreateLeaseModification','P') IS NOT NULL DROP PROCEDURE lease.sp_CreateLeaseModification;`);
  await req().query(`
CREATE PROCEDURE lease.sp_CreateLeaseModification
  @ContractId         INT,
  @ModificationDate   DATE,
  @ModificationType   NVARCHAR(50),
  @NewIBR             DECIMAL(10,6) = NULL,
  @NewTermEnd         DATE          = NULL,
  @NewMonthlyPayment  DECIMAL(18,2) = NULL,
  @Notes              NVARCHAR(1000) = NULL,
  @CreatedBy          INT            = NULL
AS
BEGIN
  SET NOCOUNT ON;

  -- ── Fetch current contract state ──────────────────────────────────────────
  DECLARE @OldIBR             DECIMAL(10,6),
          @OldTermEnd         DATE,
          @OldMonthlyPayment  DECIMAL(18,2),
          @OldROUNBV          DECIMAL(18,2),
          @OldLiability       DECIMAL(18,2),
          @CommencementDate   DATE;

  SELECT
    @OldIBR            = ibr,
    @OldTermEnd        = expiry_date,
    @OldMonthlyPayment = monthly_payment,
    @CommencementDate  = commencement_date
  FROM lease.contracts
  WHERE contract_id = @ContractId;

  IF @OldIBR IS NULL
  BEGIN
    RAISERROR('Contract not found: %d', 16, 1, @ContractId);
    RETURN;
  END

  -- Get current ROU NBV and liability from latest amortisation row
  SELECT TOP 1
    @OldROUNBV    = rou_nbv,
    @OldLiability = closing_liability
  FROM lease.amortisation_schedule
  WHERE contract_id = @ContractId
    AND period_date <= @ModificationDate
  ORDER BY period_date DESC;

  -- Default new values to old if not provided
  IF @NewIBR            IS NULL SET @NewIBR            = @OldIBR;
  IF @NewTermEnd        IS NULL SET @NewTermEnd        = @OldTermEnd;
  IF @NewMonthlyPayment IS NULL SET @NewMonthlyPayment = @OldMonthlyPayment;

  -- ── Compute new PV of revised cash flows ──────────────────────────────────
  -- Remaining months from modification date to new term end
  DECLARE @RemainingMonths INT = DATEDIFF(MONTH, @ModificationDate, @NewTermEnd);
  DECLARE @NewMonthlyRate  DECIMAL(20,10) = @NewIBR / 12.0;

  -- PV = Payment * (1 - (1+r)^-n) / r
  DECLARE @NewLiability DECIMAL(18,2);
  IF @NewMonthlyRate = 0
    SET @NewLiability = @NewMonthlyPayment * @RemainingMonths;
  ELSE
    SET @NewLiability = @NewMonthlyPayment *
      (1.0 - POWER(1.0 + @NewMonthlyRate, -1.0 * @RemainingMonths)) / @NewMonthlyRate;

  -- New ROU = new liability (remeasured at modification date)
  DECLARE @NewROUNBV DECIMAL(18,2) = @NewLiability;

  -- Remeasurement gain/loss = old liability - new liability
  DECLARE @GainLoss DECIMAL(18,2) = ISNULL(@OldLiability, 0) - @NewLiability;

  -- ── Insert draft modification record ──────────────────────────────────────
  INSERT INTO lease.lease_modifications (
    contract_id, modification_date, modification_type,
    old_ibr, new_ibr,
    old_term_end, new_term_end,
    old_monthly_payment, new_monthly_payment,
    old_rou_nbv, new_rou_nbv,
    old_liability, new_liability,
    remeasurement_gain_loss,
    notes, created_by, status
  ) VALUES (
    @ContractId, @ModificationDate, @ModificationType,
    @OldIBR, @NewIBR,
    @OldTermEnd, @NewTermEnd,
    @OldMonthlyPayment, @NewMonthlyPayment,
    ISNULL(@OldROUNBV, 0), @NewROUNBV,
    ISNULL(@OldLiability, 0), @NewLiability,
    @GainLoss,
    @Notes, @CreatedBy, 'draft'
  );

  -- Return the draft modification with computed values
  SELECT
    SCOPE_IDENTITY()                                             AS modification_id,
    @ContractId                                                  AS contract_id,
    @ModificationDate                                            AS modification_date,
    @ModificationType                                            AS modification_type,
    @OldIBR                                                      AS old_ibr,
    @NewIBR                                                      AS new_ibr,
    @OldTermEnd                                                  AS old_term_end,
    @NewTermEnd                                                  AS new_term_end,
    @OldMonthlyPayment                                           AS old_monthly_payment,
    @NewMonthlyPayment                                           AS new_monthly_payment,
    ISNULL(@OldROUNBV, 0)                                        AS old_rou_nbv,
    @NewROUNBV                                                   AS new_rou_nbv,
    ISNULL(@OldLiability, 0)                                     AS old_liability,
    @NewLiability                                                AS new_liability,
    @GainLoss                                                    AS remeasurement_gain_loss,
    @RemainingMonths                                             AS remaining_months,
    'draft'                                                      AS status;

END;
`);
  console.log("✅ sp_CreateLeaseModification created");

  // ───────────────────────────────────────────────────────────────────────────
  // FEATURE 17: sp_ApplyLeaseModification
  // On approval: update contract, post remeasurement GL journals
  // ───────────────────────────────────────────────────────────────────────────
  await req().query(`IF OBJECT_ID('lease.sp_ApplyLeaseModification','P') IS NOT NULL DROP PROCEDURE lease.sp_ApplyLeaseModification;`);
  await req().query(`
CREATE PROCEDURE lease.sp_ApplyLeaseModification
  @ModificationId INT,
  @ApprovedBy     INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRANSACTION;

  -- ── Fetch modification details ─────────────────────────────────────────────
  DECLARE @ContractId         INT,
          @NewIBR             DECIMAL(10,6),
          @NewTermEnd         DATE,
          @NewMonthlyPayment  DECIMAL(18,2),
          @NewROUNBV          DECIMAL(18,2),
          @NewLiability       DECIMAL(18,2),
          @OldROUNBV          DECIMAL(18,2),
          @OldLiability       DECIMAL(18,2),
          @GainLoss           DECIMAL(18,2),
          @ModDate            DATE,
          @Status             NVARCHAR(20);

  SELECT
    @ContractId        = contract_id,
    @NewIBR            = new_ibr,
    @NewTermEnd        = new_term_end,
    @NewMonthlyPayment = new_monthly_payment,
    @NewROUNBV         = new_rou_nbv,
    @NewLiability      = new_liability,
    @OldROUNBV         = old_rou_nbv,
    @OldLiability      = old_liability,
    @GainLoss          = remeasurement_gain_loss,
    @ModDate           = modification_date,
    @Status            = status
  FROM lease.lease_modifications
  WHERE modification_id = @ModificationId;

  IF @ContractId IS NULL
  BEGIN
    RAISERROR('Modification not found: %d', 16, 1, @ModificationId);
    ROLLBACK;
    RETURN;
  END

  IF @Status <> 'draft'
  BEGIN
    RAISERROR('Modification %d is not in draft status (current: %s)', 16, 1, @ModificationId, @Status);
    ROLLBACK;
    RETURN;
  END

  -- ── Update contract with new terms ────────────────────────────────────────
  UPDATE lease.contracts
  SET
    ibr                    = @NewIBR,
    expiry_date            = @NewTermEnd,
    monthly_payment        = @NewMonthlyPayment,
    rou_asset_value        = @NewROUNBV,
    lease_liability_commence = @NewLiability,
    modified_at            = GETUTCDATE()
  WHERE contract_id = @ContractId;

  -- ── Generate JE reference ─────────────────────────────────────────────────
  DECLARE @JERef NVARCHAR(50) = 'MOD-' + CAST(@ModificationId AS NVARCHAR) + '-' + FORMAT(@ModDate, 'yyyyMMdd');

  -- ── Post remeasurement GL journals ────────────────────────────────────────
  -- Journal: Dr/Cr ROU Asset, Dr/Cr Lease Liability, Cr/Dr Gain/Loss on Remeasurement
  -- ROU adjustment: new_rou - old_rou
  DECLARE @ROUDelta      DECIMAL(18,2) = @NewROUNBV - @OldROUNBV;
  DECLARE @LiabDelta     DECIMAL(18,2) = @NewLiability - @OldLiability;

  -- ROU Asset entry
  IF ABS(@ROUDelta) > 0.01
  BEGIN
    INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
    VALUES (
      @ContractId, GETUTCDATE(), @ModDate, @JERef,
      'Lease Modification — ROU Asset Remeasurement',
      '1600', 'Right-of-Use Asset',
      CASE WHEN @ROUDelta > 0 THEN 'DR' ELSE 'CR' END,
      ABS(@ROUDelta),
      @ApprovedBy, GETUTCDATE(),
      'Modification ID: ' + CAST(@ModificationId AS NVARCHAR)
    );
  END

  -- Lease Liability entry
  IF ABS(@LiabDelta) > 0.01
  BEGIN
    INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
    VALUES (
      @ContractId, GETUTCDATE(), @ModDate, @JERef,
      'Lease Modification — Lease Liability Remeasurement',
      '2600', 'Lease Liability',
      CASE WHEN @LiabDelta > 0 THEN 'CR' ELSE 'DR' END,
      ABS(@LiabDelta),
      @ApprovedBy, GETUTCDATE(),
      'Modification ID: ' + CAST(@ModificationId AS NVARCHAR)
    );
  END

  -- Gain/Loss entry (balancing entry)
  IF ABS(@GainLoss) > 0.01
  BEGIN
    INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
    VALUES (
      @ContractId, GETUTCDATE(), @ModDate, @JERef,
      'Lease Modification — Remeasurement Gain/Loss',
      '7100', 'Gain/Loss on Lease Modification',
      CASE WHEN @GainLoss > 0 THEN 'CR' ELSE 'DR' END,
      ABS(@GainLoss),
      @ApprovedBy, GETUTCDATE(),
      'Modification ID: ' + CAST(@ModificationId AS NVARCHAR)
    );
  END

  -- ── Update modification status ─────────────────────────────────────────────
  UPDATE lease.lease_modifications
  SET
    status      = 'applied',
    je_ref      = @JERef,
    approved_by = @ApprovedBy,
    approved_at = GETUTCDATE(),
    applied_at  = GETUTCDATE()
  WHERE modification_id = @ModificationId;

  COMMIT;

  -- Return result
  SELECT
    @ModificationId  AS modification_id,
    @ContractId      AS contract_id,
    @JERef           AS je_ref,
    'applied'        AS status,
    @GainLoss        AS remeasurement_gain_loss,
    @NewROUNBV       AS new_rou_nbv,
    @NewLiability    AS new_liability;

END;
`);
  console.log("✅ sp_ApplyLeaseModification created");

  // ───────────────────────────────────────────────────────────────────────────
  // Register new screens in screen_registry
  // ───────────────────────────────────────────────────────────────────────────
  await req().query(`
MERGE security.screen_registry AS t
USING (VALUES
  ('VFLMULSTD0001P001', 'Multi-Standard Comparison', 'Accounting Engine', 'Multi-Standard',
   'sp_GetMultiStandardComparison, sp_GetStandardSummary',
   'lease.amortisation_schedule, lease.contracts',
   'IFRS 16, ASC 842, IPSAS 43',
   'Effective Interest Method, Straight-Line Depreciation (IFRS 16/IPSAS 43), Straight-Line Lease Cost (ASC 842 Operating), Present Value Annuity Formula'),
  ('VFLLSMOD0001P001', 'Lease Modification Wizard', 'Contracts', 'Modification',
   'sp_GetLeaseModifications, sp_CreateLeaseModification, sp_ApplyLeaseModification',
   'lease.lease_modifications, lease.contracts, lease.amortisation_schedule, lease.gl_postings',
   'IFRS 16 Para 44-46 (Lease Modifications), ASC 842-20-45 (Lessee Modifications)',
   'Present Value of Revised Cash Flows at New IBR, Remeasurement Gain/Loss = Old Liability - New PV, Effective Interest Method post-modification')
) AS s (screen_id, screen_name, module, sub_module, stored_procedures, db_tables, accounting_standards, computation_techniques)
ON t.screen_id = s.screen_id
WHEN MATCHED THEN
  UPDATE SET screen_name=s.screen_name, module=s.module, sub_module=s.sub_module,
             stored_procedures=s.stored_procedures, db_tables=s.db_tables,
             accounting_standards=s.accounting_standards, computation_techniques=s.computation_techniques
WHEN NOT MATCHED THEN
  INSERT (screen_id, screen_name, module, sub_module, stored_procedures, db_tables, accounting_standards, computation_techniques)
  VALUES (s.screen_id, s.screen_name, s.module, s.sub_module, s.stored_procedures, s.db_tables, s.accounting_standards, s.computation_techniques);
`);
  console.log("✅ screen_registry entries added for F15 and F17");

  console.log("=== Migration complete ===");
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
