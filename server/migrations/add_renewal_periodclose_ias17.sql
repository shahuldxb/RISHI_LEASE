-- ============================================================
-- Feature 2: Lease Renewal Engine
-- ============================================================

-- Renewals table
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name='lease' AND t.name='renewals')
BEGIN
    CREATE TABLE lease.renewals (
        renewal_id          INT IDENTITY(1,1) PRIMARY KEY,
        contract_id         INT NOT NULL REFERENCES lease.contracts(contract_id),
        renewal_date        DATE NOT NULL DEFAULT GETDATE(),
        new_expiry_date     DATE NOT NULL,
        new_monthly_payment DECIMAL(18,2) NOT NULL,
        new_term_months     INT NOT NULL,
        new_ibr             DECIMAL(8,6) NOT NULL,
        notes               NVARCHAR(500) NULL,
        status              NVARCHAR(20) NOT NULL DEFAULT 'Pending'
                            CHECK (status IN ('Pending','Approved','Rejected')),
        created_by          NVARCHAR(100) NOT NULL DEFAULT 'system',
        created_at          DATETIME2 NOT NULL DEFAULT GETDATE(),
        approved_by         NVARCHAR(100) NULL,
        approved_at         DATETIME2 NULL
    );
END
GO

-- sp_GetRenewals
IF OBJECT_ID('dbo.sp_GetRenewals', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetRenewals;
GO
CREATE PROCEDURE dbo.sp_GetRenewals
    @Status NVARCHAR(20) = NULL,
    @ContractId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        r.renewal_id,
        r.contract_id,
        c.contract_ref,
        c.asset_description,
        c.lifecycle_status,
        c.expiry_date          AS current_expiry_date,
        c.monthly_payment      AS current_monthly_payment,
        c.ibr                  AS current_ibr,
        r.renewal_date,
        r.new_expiry_date,
        r.new_monthly_payment,
        r.new_term_months,
        r.new_ibr,
        r.notes,
        r.status,
        r.created_by,
        r.created_at,
        r.approved_by,
        r.approved_at,
        l.lessor_name,
        DATEDIFF(DAY, GETDATE(), c.expiry_date) AS days_to_expiry
    FROM lease.renewals r
    JOIN lease.contracts c ON c.contract_id = r.contract_id
    LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
    WHERE (@Status IS NULL OR r.status = @Status)
      AND (@ContractId IS NULL OR r.contract_id = @ContractId)
    ORDER BY r.created_at DESC;
END
GO

-- sp_InitiateRenewal
IF OBJECT_ID('dbo.sp_InitiateRenewal', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_InitiateRenewal;
GO
CREATE PROCEDURE dbo.sp_InitiateRenewal
    @ContractId         INT,
    @NewExpiryDate      DATE,
    @NewMonthlyPayment  DECIMAL(18,2),
    @NewTermMonths      INT,
    @NewIBR             DECIMAL(8,6),
    @Notes              NVARCHAR(500) = NULL,
    @CreatedBy          NVARCHAR(100) = 'system'
AS
BEGIN
    SET NOCOUNT ON;
    -- Validate contract exists and is active
    IF NOT EXISTS (SELECT 1 FROM lease.contracts WHERE contract_id=@ContractId AND lifecycle_status IN ('Active','Modified'))
    BEGIN
        SELECT 'ERROR' AS result, 'Contract not found or not in Active/Modified status' AS message;
        RETURN;
    END
    INSERT INTO lease.renewals (contract_id, new_expiry_date, new_monthly_payment, new_term_months, new_ibr, notes, created_by)
    VALUES (@ContractId, @NewExpiryDate, @NewMonthlyPayment, @NewTermMonths, @NewIBR, @Notes, @CreatedBy);
    SELECT 'OK' AS result, SCOPE_IDENTITY() AS renewal_id, 'Renewal initiated successfully' AS message;
END
GO

-- sp_ApproveRenewal
IF OBJECT_ID('dbo.sp_ApproveRenewal', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ApproveRenewal;
GO
CREATE PROCEDURE dbo.sp_ApproveRenewal
    @RenewalId  INT,
    @ApprovedBy NVARCHAR(100) = 'system'
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ContractId INT, @NewExpiry DATE, @NewPmt DECIMAL(18,2), @NewTerm INT, @NewIBR DECIMAL(8,6);
        SELECT @ContractId=contract_id, @NewExpiry=new_expiry_date,
               @NewPmt=new_monthly_payment, @NewTerm=new_term_months, @NewIBR=new_ibr
        FROM lease.renewals WHERE renewal_id=@RenewalId AND status='Pending';

        IF @ContractId IS NULL
        BEGIN
            SELECT 'ERROR' AS result, 'Renewal not found or already processed' AS message;
            ROLLBACK; RETURN;
        END

        -- Update contract with new terms
        UPDATE lease.contracts
        SET expiry_date     = @NewExpiry,
            monthly_payment = @NewPmt,
            term_months     = @NewTerm,
            ibr             = @NewIBR,
            lifecycle_status= 'Modified',
            modified_at     = GETDATE()
        WHERE contract_id = @ContractId;

        -- Mark old projected rows beyond current date as superseded
        DELETE FROM lease.amortisation_schedule
        WHERE contract_id = @ContractId
          AND posting_status = 'Projected'
          AND period_date > GETDATE();

        -- Generate new projected schedule for new term
        DECLARE @r DECIMAL(18,10) = @NewIBR / 12.0 / 100.0;
        DECLARE @PV DECIMAL(18,2) = @NewPmt * (1 - POWER(1.0 + @r, -@NewTerm)) / @r;
        DECLARE @i INT = 1;
        DECLARE @OpenLiab DECIMAL(18,2) = @PV;
        DECLARE @RouNBV   DECIMAL(18,2) = @PV;
        DECLARE @Depr     DECIMAL(18,2) = @PV / @NewTerm;
        DECLARE @StartDate DATE = DATEADD(MONTH, 1, EOMONTH(GETDATE()));

        WHILE @i <= @NewTerm
        BEGIN
            DECLARE @PeriodDate DATE = DATEADD(MONTH, @i - 1, @StartDate);
            DECLARE @Int  DECIMAL(18,2) = @OpenLiab * @r;
            DECLARE @Prin DECIMAL(18,2) = @NewPmt - @Int;
            DECLARE @CloseLiab DECIMAL(18,2) = @OpenLiab - @Prin;
            DECLARE @CumDepr DECIMAL(18,2) = @Depr * @i;

            INSERT INTO lease.amortisation_schedule
                (contract_id, period_date, opening_liability, interest_expense, payment, principal,
                 closing_liability, rou_nbv, depreciation, cumulative_depr, posting_status)
            VALUES
                (@ContractId, @PeriodDate, @OpenLiab, @Int, @NewPmt, @Prin,
                 @CloseLiab, @RouNBV - @Depr, @Depr, @CumDepr, 'Projected');

            SET @OpenLiab = @CloseLiab;
            SET @RouNBV   = @RouNBV - @Depr;
            SET @i = @i + 1;
        END

        -- Mark renewal as approved
        UPDATE lease.renewals
        SET status=@ApprovedBy, approved_by=@ApprovedBy, approved_at=GETDATE(), status='Approved'
        WHERE renewal_id=@RenewalId;

        COMMIT;
        SELECT 'OK' AS result, @ContractId AS contract_id, 'Renewal approved and schedule regenerated' AS message;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT 'ERROR' AS result, ERROR_MESSAGE() AS message;
    END CATCH
END
GO

-- sp_RejectRenewal
IF OBJECT_ID('dbo.sp_RejectRenewal', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_RejectRenewal;
GO
CREATE PROCEDURE dbo.sp_RejectRenewal
    @RenewalId  INT,
    @RejectedBy NVARCHAR(100) = 'system'
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE lease.renewals
    SET status='Rejected', approved_by=@RejectedBy, approved_at=GETDATE()
    WHERE renewal_id=@RenewalId AND status='Pending';
    SELECT 'OK' AS result, 'Renewal rejected' AS message;
END
GO

-- ============================================================
-- Feature 3: Period-End Close Lock
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name='lease' AND t.name='period_close')
BEGIN
    CREATE TABLE lease.period_close (
        close_id     INT IDENTITY(1,1) PRIMARY KEY,
        period_year  INT NOT NULL,
        period_month INT NOT NULL,
        closed_at    DATETIME2 NOT NULL DEFAULT GETDATE(),
        closed_by    NVARCHAR(100) NOT NULL DEFAULT 'system',
        notes        NVARCHAR(500) NULL,
        CONSTRAINT uq_period_close UNIQUE (period_year, period_month)
    );
END
GO

-- sp_GetPeriodCloseStatus
IF OBJECT_ID('dbo.sp_GetPeriodCloseStatus', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetPeriodCloseStatus;
GO
CREATE PROCEDURE dbo.sp_GetPeriodCloseStatus
    @Year INT
AS
BEGIN
    SET NOCOUNT ON;
    -- Return all 12 months with close status
    WITH months AS (
        SELECT 1 AS m UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
        UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8
        UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12
    )
    SELECT
        @Year                                                   AS period_year,
        m.m                                                     AS period_month,
        DATENAME(MONTH, DATEFROMPARTS(@Year, m.m, 1))           AS month_name,
        CASE WHEN pc.close_id IS NOT NULL THEN 1 ELSE 0 END     AS is_closed,
        pc.closed_at,
        pc.closed_by,
        pc.notes,
        -- Count of posted rows for this period
        (SELECT COUNT(*) FROM lease.amortisation_schedule s
         WHERE YEAR(s.period_date)=@Year AND MONTH(s.period_date)=m.m
           AND s.posting_status='Posted')                       AS posted_count,
        -- Count of projected rows for this period
        (SELECT COUNT(*) FROM lease.amortisation_schedule s
         WHERE YEAR(s.period_date)=@Year AND MONTH(s.period_date)=m.m
           AND s.posting_status='Projected')                    AS projected_count
    FROM months m
    LEFT JOIN lease.period_close pc ON pc.period_year=@Year AND pc.period_month=m.m
    ORDER BY m.m;
END
GO

-- sp_ClosePeriod
IF OBJECT_ID('dbo.sp_ClosePeriod', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ClosePeriod;
GO
CREATE PROCEDURE dbo.sp_ClosePeriod
    @Year     INT,
    @Month    INT,
    @ClosedBy NVARCHAR(100) = 'system',
    @Notes    NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        -- Check not already closed
        IF EXISTS (SELECT 1 FROM lease.period_close WHERE period_year=@Year AND period_month=@Month)
        BEGIN
            SELECT 'ERROR' AS result, 'Period already closed' AS message;
            ROLLBACK; RETURN;
        END
        -- Lock all Posted rows for this period
        UPDATE lease.amortisation_schedule
        SET posting_status = 'Locked'
        WHERE YEAR(period_date) = @Year
          AND MONTH(period_date) = @Month
          AND posting_status = 'Posted';

        -- Insert close record
        INSERT INTO lease.period_close (period_year, period_month, closed_by, notes)
        VALUES (@Year, @Month, @ClosedBy, @Notes);

        COMMIT;
        SELECT 'OK' AS result, 'Period closed and all Posted rows locked' AS message;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT 'ERROR' AS result, ERROR_MESSAGE() AS message;
    END CATCH
END
GO

-- sp_ReopenPeriod (admin override)
IF OBJECT_ID('dbo.sp_ReopenPeriod', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ReopenPeriod;
GO
CREATE PROCEDURE dbo.sp_ReopenPeriod
    @Year     INT,
    @Month    INT,
    @ReopenedBy NVARCHAR(100) = 'system'
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        -- Unlock Locked rows back to Posted
        UPDATE lease.amortisation_schedule
        SET posting_status = 'Posted'
        WHERE YEAR(period_date) = @Year
          AND MONTH(period_date) = @Month
          AND posting_status = 'Locked';
        -- Remove close record
        DELETE FROM lease.period_close WHERE period_year=@Year AND period_month=@Month;
        COMMIT;
        SELECT 'OK' AS result, 'Period reopened' AS message;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT 'ERROR' AS result, ERROR_MESSAGE() AS message;
    END CATCH
END
GO

-- ============================================================
-- Feature 4: IAS 17 vs IFRS 16 Comparative Report
-- ============================================================
IF OBJECT_ID('dbo.sp_GetIAS17Comparison', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetIAS17Comparison;
GO
CREATE PROCEDURE dbo.sp_GetIAS17Comparison
    @Year INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Per-lease comparison for the given year
    SELECT
        c.contract_id,
        c.contract_ref,
        c.asset_description,
        c.ifrs16_classification,
        c.monthly_payment,
        c.term_months,
        c.ibr,
        c.currency,
        l.lessor_name,
        -- IAS 17: straight-line rent expense = monthly_payment * 12 (for full year)
        -- For partial years, count actual periods in the year
        ISNULL((
            SELECT COUNT(*) * c.monthly_payment
            FROM lease.amortisation_schedule s2
            WHERE s2.contract_id = c.contract_id
              AND YEAR(s2.period_date) = @Year
        ), 0)                                                   AS ias17_rent_expense,
        -- IFRS 16: interest expense for the year
        ISNULL((
            SELECT SUM(s3.interest_expense)
            FROM lease.amortisation_schedule s3
            WHERE s3.contract_id = c.contract_id
              AND YEAR(s3.period_date) = @Year
        ), 0)                                                   AS ifrs16_interest_expense,
        -- IFRS 16: depreciation for the year
        ISNULL((
            SELECT SUM(s4.depreciation)
            FROM lease.amortisation_schedule s4
            WHERE s4.contract_id = c.contract_id
              AND YEAR(s4.period_date) = @Year
        ), 0)                                                   AS ifrs16_depreciation,
        -- IFRS 16 total P&L charge
        ISNULL((
            SELECT SUM(s5.interest_expense) + SUM(s5.depreciation)
            FROM lease.amortisation_schedule s5
            WHERE s5.contract_id = c.contract_id
              AND YEAR(s5.period_date) = @Year
        ), 0)                                                   AS ifrs16_total_charge,
        -- Difference: positive = IFRS 16 higher charge (front-loaded)
        ISNULL((
            SELECT SUM(s6.interest_expense) + SUM(s6.depreciation) - COUNT(*) * c.monthly_payment
            FROM lease.amortisation_schedule s6
            WHERE s6.contract_id = c.contract_id
              AND YEAR(s6.period_date) = @Year
        ), 0)                                                   AS pl_difference,
        -- Balance sheet impact: lease liability at year-end
        ISNULL((
            SELECT TOP 1 s7.closing_liability
            FROM lease.amortisation_schedule s7
            WHERE s7.contract_id = c.contract_id
              AND YEAR(s7.period_date) = @Year
            ORDER BY s7.period_date DESC
        ), 0)                                                   AS bs_lease_liability,
        -- Balance sheet impact: ROU asset at year-end
        ISNULL((
            SELECT TOP 1 s8.rou_nbv
            FROM lease.amortisation_schedule s8
            WHERE s8.contract_id = c.contract_id
              AND YEAR(s8.period_date) = @Year
            ORDER BY s8.period_date DESC
        ), 0)                                                   AS bs_rou_asset
    FROM lease.contracts c
    LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
    WHERE c.status NOT IN ('Deleted', 'Terminated')
      AND EXISTS (
          SELECT 1 FROM lease.amortisation_schedule s
          WHERE s.contract_id = c.contract_id AND YEAR(s.period_date) = @Year
      )
    ORDER BY c.contract_ref;

    -- Summary totals
    SELECT
        SUM(ISNULL((
            SELECT COUNT(*) * c2.monthly_payment
            FROM lease.amortisation_schedule s2
            WHERE s2.contract_id = c2.contract_id AND YEAR(s2.period_date) = @Year
        ), 0))                                                  AS total_ias17_expense,
        SUM(ISNULL((
            SELECT SUM(s3.interest_expense)
            FROM lease.amortisation_schedule s3
            WHERE s3.contract_id = c2.contract_id AND YEAR(s3.period_date) = @Year
        ), 0))                                                  AS total_ifrs16_interest,
        SUM(ISNULL((
            SELECT SUM(s4.depreciation)
            FROM lease.amortisation_schedule s4
            WHERE s4.contract_id = c2.contract_id AND YEAR(s4.period_date) = @Year
        ), 0))                                                  AS total_ifrs16_depreciation,
        SUM(ISNULL((
            SELECT SUM(s5.interest_expense) + SUM(s5.depreciation)
            FROM lease.amortisation_schedule s5
            WHERE s5.contract_id = c2.contract_id AND YEAR(s5.period_date) = @Year
        ), 0))                                                  AS total_ifrs16_charge,
        SUM(ISNULL((
            SELECT TOP 1 s6.closing_liability
            FROM lease.amortisation_schedule s6
            WHERE s6.contract_id = c2.contract_id AND YEAR(s6.period_date) = @Year
            ORDER BY s6.period_date DESC
        ), 0))                                                  AS total_lease_liability,
        SUM(ISNULL((
            SELECT TOP 1 s7.rou_nbv
            FROM lease.amortisation_schedule s7
            WHERE s7.contract_id = c2.contract_id AND YEAR(s7.period_date) = @Year
            ORDER BY s7.period_date DESC
        ), 0))                                                  AS total_rou_asset
    FROM lease.contracts c2
    WHERE c2.status NOT IN ('Deleted', 'Terminated')
      AND EXISTS (
          SELECT 1 FROM lease.amortisation_schedule s
          WHERE s.contract_id = c2.contract_id AND YEAR(s.period_date) = @Year
      );
END
GO
