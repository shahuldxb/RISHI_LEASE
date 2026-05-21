/**
 * Fix sp_PostLeaseTransaction:
 * 1. The SP inserts into lease.gl_postings without explicitly including posted_at in the column list.
 *    The column has DEFAULT GETUTCDATE() but the constraint may be missing/not applied.
 *    Fix: Add posted_at = GETUTCDATE() explicitly to all INSERT INTO lease.gl_postings statements.
 * 2. The SP inserts into lease.transaction_drafts without created_at/updated_at.
 *    Fix: Add created_at = GETUTCDATE(), updated_at = GETUTCDATE() to the INSERT.
 * 3. Ensure DEFAULT constraints exist on both tables.
 */
import sql from 'mssql';
const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: false, trustServerCertificate: true }
};

async function main() {
  const pool = await sql.connect(config);

  // Step 1: Ensure DEFAULT constraint exists on posted_at
  console.log('Step 1: Ensuring DEFAULT constraint on lease.gl_postings.posted_at...');
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.default_constraints dc
      JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
      WHERE dc.parent_object_id = OBJECT_ID('lease.gl_postings')
        AND c.name = 'posted_at'
    )
    BEGIN
      ALTER TABLE lease.gl_postings ADD CONSTRAINT DF_gl_postings_posted_at DEFAULT GETUTCDATE() FOR posted_at;
      PRINT 'Added DEFAULT constraint on posted_at';
    END
    ELSE
      PRINT 'DEFAULT constraint already exists on posted_at';
  `);
  console.log('✅ DEFAULT constraint ensured.');

  // Step 2: Drop and recreate sp_PostLeaseTransaction with posted_at explicitly included
  console.log('Step 2: Recreating sp_PostLeaseTransaction with explicit posted_at...');
  await pool.request().query(`
    IF OBJECT_ID('sp_PostLeaseTransaction','P') IS NOT NULL DROP PROCEDURE sp_PostLeaseTransaction;
  `);

  await pool.request().query(`
CREATE PROCEDURE sp_PostLeaseTransaction
  @ContractId        INT,
  @TransactionType   NVARCHAR(20),
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

      DECLARE @ModCurrentLiability DECIMAL(18,2), @ModCurrentRouNBV DECIMAL(18,2);
      SELECT TOP 1 @ModCurrentLiability = closing_liability, @ModCurrentRouNBV = rou_nbv
      FROM lease.amortisation_schedule
      WHERE contract_id = @ContractId AND period_date <= @EffectiveDate
      ORDER BY period_date DESC;

      IF @ModCurrentLiability IS NULL
        SELECT @ModCurrentLiability = lease_liability_commence, @ModCurrentRouNBV = rou_asset_value
        FROM lease.contracts WHERE contract_id = @ContractId;

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

      -- Post JE-4 lines (with explicit posted_at)
      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '2101', 'Lease Liability',
        CASE WHEN @ModLiabilityDelta > 0 THEN 'Cr' ELSE 'Dr' END, ABS(@ModLiabilityDelta), @PostedBy, GETUTCDATE(), @Notes);

      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '1601', 'Right-of-Use Asset',
        CASE WHEN @ModRouDelta > 0 THEN 'Dr' ELSE 'Cr' END, ABS(@ModRouDelta), @PostedBy, GETUTCDATE(), @Notes);

      IF @ModGainLoss <> 0
        INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
        VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '7201', 'Remeasurement Gain/Loss on Lease',
          'Cr', ABS(@ModGainLoss), @PostedBy, GETUTCDATE(), @Notes);

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

      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '2101', 'Lease Liability', 'Dr', @TrmCurrentLiability, @PostedBy, GETUTCDATE(), @Notes);

      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '1601', 'Right-of-Use Asset', 'Cr', @TrmCurrentRouNBV, @PostedBy, GETUTCDATE(), @Notes);

      IF @TrmGainLoss <> 0
        INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
        VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '7201', 'Gain/Loss on Lease Termination',
          CASE WHEN @TrmGainLoss > 0 THEN 'Dr' ELSE 'Cr' END, ABS(@TrmGainLoss), @PostedBy, GETUTCDATE(), @Notes);

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

      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '2101', 'Lease Liability',
        CASE WHEN @RenLiabilityDelta > 0 THEN 'Cr' ELSE 'Dr' END, ABS(@RenLiabilityDelta), @PostedBy, GETUTCDATE(), @Notes);

      INSERT INTO lease.gl_postings (contract_id, posting_date, period_date, je_ref, je_label, ledger_no, ledger_name, dr_cr, amount, posted_by, posted_at, notes)
      VALUES (@ContractId, GETUTCDATE(), @EffectiveDate, @JeNum, @JeLabel, '1601', 'Right-of-Use Asset',
        CASE WHEN @RenLiabilityDelta > 0 THEN 'Dr' ELSE 'Cr' END, ABS(@RenLiabilityDelta), @PostedBy, GETUTCDATE(), @Notes);

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
  `);
  console.log('✅ sp_PostLeaseTransaction recreated with explicit posted_at in all INSERT statements.');

  await pool.close();
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
