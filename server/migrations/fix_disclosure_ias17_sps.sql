-- ============================================================
-- FIX: sp_GetIFRS16DisclosureNotes (avoid nested aggregates)
-- ============================================================
IF OBJECT_ID('dbo.sp_GetIFRS16DisclosureNotes', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_GetIFRS16DisclosureNotes;
GO

CREATE PROCEDURE dbo.sp_GetIFRS16DisclosureNotes
    @ReportingYear INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @YearStart DATE = DATEFROMPARTS(@ReportingYear, 1, 1);
    DECLARE @YearEnd   DATE = DATEFROMPARTS(@ReportingYear, 12, 31);

    -- ── 1. MATURITY ANALYSIS ──────────────────────────────────────────────
    SELECT
        maturity_band,
        SUM(undiscounted_payment)   AS undiscounted_payment,
        SUM(discounted_liability)   AS discounted_liability,
        COUNT(DISTINCT contract_id) AS lease_count
    FROM (
        SELECT
            s.contract_id,
            s.payment           AS undiscounted_payment,
            s.closing_liability AS discounted_liability,
            CASE
                WHEN s.period_date <= DATEADD(YEAR,1,@YearEnd) THEN 'Less than 1 year'
                WHEN s.period_date <= DATEADD(YEAR,2,@YearEnd) THEN '1 to 2 years'
                WHEN s.period_date <= DATEADD(YEAR,3,@YearEnd) THEN '2 to 3 years'
                WHEN s.period_date <= DATEADD(YEAR,4,@YearEnd) THEN '3 to 4 years'
                WHEN s.period_date <= DATEADD(YEAR,5,@YearEnd) THEN '4 to 5 years'
                ELSE 'More than 5 years'
            END AS maturity_band
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE s.period_date > @YearEnd
          AND c.status NOT IN ('Deleted','Terminated')
          AND c.lifecycle_status NOT IN ('Closed')
    ) t
    GROUP BY maturity_band
    ORDER BY
        CASE maturity_band
            WHEN 'Less than 1 year' THEN 1 WHEN '1 to 2 years' THEN 2
            WHEN '2 to 3 years'     THEN 3 WHEN '3 to 4 years' THEN 4
            WHEN '4 to 5 years'     THEN 5 ELSE 6
        END;

    -- ── 2. ROU ASSET MOVEMENT ─────────────────────────────────────────────
    -- Use CTEs to avoid nested aggregates
    WITH prior_rou AS (
        SELECT s.contract_id, s.rou_nbv
        FROM lease.amortisation_schedule s
        WHERE YEAR(s.period_date) = @ReportingYear - 1
          AND s.period_date = (
              SELECT MAX(s2.period_date) FROM lease.amortisation_schedule s2
              WHERE s2.contract_id = s.contract_id AND YEAR(s2.period_date) = @ReportingYear - 1
          )
    ),
    curr_rou AS (
        SELECT
            s.contract_id,
            SUM(s.depreciation) AS period_depr,
            MAX(CASE WHEN s.period_date = (
                SELECT MAX(s3.period_date) FROM lease.amortisation_schedule s3
                WHERE s3.contract_id = s.contract_id AND YEAR(s3.period_date) = @ReportingYear
            ) THEN s.rou_nbv ELSE NULL END) AS closing_rou
        FROM lease.amortisation_schedule s
        WHERE YEAR(s.period_date) = @ReportingYear
        GROUP BY s.contract_id
    )
    SELECT
        c.ifrs16_classification                                 AS asset_class,
        COUNT(c.contract_id)                                    AS lease_count,
        ISNULL(SUM(pr.rou_nbv), 0)                              AS opening_nbv,
        ISNULL(SUM(CASE WHEN YEAR(c.commencement_date)=@ReportingYear
                        THEN c.monthly_payment * c.term_months ELSE 0 END), 0) AS additions,
        ISNULL(SUM(cr.period_depr), 0)                          AS depreciation_charge,
        ISNULL(SUM(cr.closing_rou), 0)                          AS closing_nbv
    FROM lease.contracts c
    LEFT JOIN prior_rou pr ON pr.contract_id = c.contract_id
    LEFT JOIN curr_rou  cr ON cr.contract_id = c.contract_id
    WHERE c.status NOT IN ('Deleted','Terminated')
    GROUP BY c.ifrs16_classification
    ORDER BY c.ifrs16_classification;

    -- ── 3. LEASE LIABILITY RECONCILIATION ────────────────────────────────
    WITH prior_liab AS (
        SELECT s.contract_id, s.closing_liability
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE c.status NOT IN ('Deleted','Terminated')
          AND YEAR(s.period_date) = @ReportingYear - 1
          AND s.period_date = (
              SELECT MAX(s2.period_date) FROM lease.amortisation_schedule s2
              WHERE s2.contract_id = s.contract_id AND YEAR(s2.period_date) = @ReportingYear - 1
          )
    ),
    new_leases AS (
        SELECT s.contract_id, s.opening_liability
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE YEAR(c.commencement_date) = @ReportingYear
          AND c.status NOT IN ('Deleted','Terminated')
          AND s.period_date = c.commencement_date
    ),
    curr_activity AS (
        SELECT s.contract_id,
               SUM(s.interest_expense) AS interest_accrued,
               SUM(s.payment)          AS payments_made
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE YEAR(s.period_date) = @ReportingYear
          AND c.status NOT IN ('Deleted','Terminated')
        GROUP BY s.contract_id
    ),
    curr_liab AS (
        SELECT s.contract_id, s.closing_liability
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE c.status NOT IN ('Deleted','Terminated')
          AND YEAR(s.period_date) = @ReportingYear
          AND s.period_date = (
              SELECT MAX(s2.period_date) FROM lease.amortisation_schedule s2
              WHERE s2.contract_id = s.contract_id AND YEAR(s2.period_date) = @ReportingYear
          )
    )
    SELECT
        ISNULL(SUM(pl.closing_liability), 0)  AS opening_liability,
        ISNULL(SUM(nl.opening_liability), 0)  AS new_leases,
        ISNULL(SUM(ca.interest_accrued), 0)   AS interest_accrued,
        ISNULL(SUM(ca.payments_made), 0)      AS payments_made,
        ISNULL(SUM(cl.closing_liability), 0)  AS closing_liability
    FROM (SELECT DISTINCT contract_id FROM lease.contracts WHERE status NOT IN ('Deleted','Terminated')) base
    LEFT JOIN prior_liab  pl ON pl.contract_id = base.contract_id
    LEFT JOIN new_leases  nl ON nl.contract_id = base.contract_id
    LEFT JOIN curr_activity ca ON ca.contract_id = base.contract_id
    LEFT JOIN curr_liab   cl ON cl.contract_id = base.contract_id;

    -- ── 4. KEY ASSUMPTIONS ───────────────────────────────────────────────
    WITH totals AS (
        SELECT
            c.contract_id,
            c.ibr,
            c.monthly_payment,
            c.term_months,
            c.expiry_date,
            DATEDIFF(MONTH, GETDATE(), c.expiry_date) AS remaining_months
        FROM lease.contracts c
        WHERE c.status NOT IN ('Deleted','Terminated')
          AND c.lifecycle_status NOT IN ('Closed')
    ),
    year_liab AS (
        SELECT s.contract_id, MAX(s.closing_liability) AS closing_liability, MAX(s.rou_nbv) AS rou_nbv
        FROM lease.amortisation_schedule s
        WHERE YEAR(s.period_date) = @ReportingYear
        GROUP BY s.contract_id
    )
    SELECT
        COUNT(t.contract_id)                                                    AS total_leases,
        ROUND(SUM(t.ibr * t.monthly_payment * t.term_months)
              / NULLIF(SUM(t.monthly_payment * t.term_months), 0), 4)           AS weighted_avg_ibr,
        ROUND(AVG(CAST(t.remaining_months AS FLOAT)), 1)                        AS avg_remaining_term_months,
        MIN(t.ibr)                                                              AS min_ibr,
        MAX(t.ibr)                                                              AS max_ibr,
        SUM(t.monthly_payment * 12)                                             AS total_annual_payments,
        ISNULL(SUM(yl.closing_liability), 0)                                    AS total_lease_liability,
        ISNULL(SUM(yl.rou_nbv), 0)                                              AS total_rou_nbv
    FROM totals t
    LEFT JOIN year_liab yl ON yl.contract_id = t.contract_id;
END
GO

-- ============================================================
-- FIX: sp_ApproveRenewal (duplicate SET status column)
-- ============================================================
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
        SET expiry_date      = @NewExpiry,
            monthly_payment  = @NewPmt,
            term_months      = @NewTerm,
            ibr              = @NewIBR,
            lifecycle_status = 'Modified',
            modified_at      = GETDATE()
        WHERE contract_id = @ContractId;

        -- Remove old projected rows beyond current date
        DELETE FROM lease.amortisation_schedule
        WHERE contract_id = @ContractId
          AND posting_status = 'Projected'
          AND period_date > GETDATE();

        -- Generate new projected schedule
        DECLARE @r DECIMAL(18,10) = @NewIBR / 12.0 / 100.0;
        DECLARE @PV DECIMAL(18,2);
        IF @r = 0
            SET @PV = @NewPmt * @NewTerm;
        ELSE
            SET @PV = @NewPmt * (1 - POWER(CAST(1.0 + @r AS FLOAT), -@NewTerm)) / @r;

        DECLARE @i INT = 1;
        DECLARE @OpenLiab DECIMAL(18,2) = @PV;
        DECLARE @RouNBV   DECIMAL(18,2) = @PV;
        DECLARE @Depr     DECIMAL(18,2) = ROUND(@PV / @NewTerm, 2);
        DECLARE @StartDate DATE = DATEADD(MONTH, 1, EOMONTH(GETDATE()));

        WHILE @i <= @NewTerm
        BEGIN
            DECLARE @PeriodDate DATE = DATEADD(MONTH, @i - 1, @StartDate);
            DECLARE @Int       DECIMAL(18,2) = ROUND(@OpenLiab * @r, 2);
            DECLARE @Prin      DECIMAL(18,2) = @NewPmt - @Int;
            DECLARE @CloseLiab DECIMAL(18,2) = @OpenLiab - @Prin;
            DECLARE @CumDepr   DECIMAL(18,2) = @Depr * @i;

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

        -- Mark renewal as approved (single SET, no duplicate)
        UPDATE lease.renewals
        SET status      = 'Approved',
            approved_by = @ApprovedBy,
            approved_at = GETDATE()
        WHERE renewal_id = @RenewalId;

        COMMIT;
        SELECT 'OK' AS result, @ContractId AS contract_id, 'Renewal approved and schedule regenerated' AS message;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT 'ERROR' AS result, ERROR_MESSAGE() AS message;
    END CATCH
END
GO

-- ============================================================
-- FIX: sp_GetIAS17Comparison (avoid nested aggregates via CTEs)
-- ============================================================
IF OBJECT_ID('dbo.sp_GetIAS17Comparison', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetIAS17Comparison;
GO
CREATE PROCEDURE dbo.sp_GetIAS17Comparison
    @Year INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Pre-aggregate all per-contract year totals in one CTE
    WITH year_totals AS (
        SELECT
            s.contract_id,
            COUNT(*)                AS period_count,
            SUM(s.interest_expense) AS total_interest,
            SUM(s.depreciation)     AS total_depreciation,
            MAX(CASE WHEN s.period_date = (
                SELECT MAX(s2.period_date) FROM lease.amortisation_schedule s2
                WHERE s2.contract_id = s.contract_id AND YEAR(s2.period_date) = @Year
            ) THEN s.closing_liability ELSE NULL END) AS closing_liability,
            MAX(CASE WHEN s.period_date = (
                SELECT MAX(s2.period_date) FROM lease.amortisation_schedule s2
                WHERE s2.contract_id = s.contract_id AND YEAR(s2.period_date) = @Year
            ) THEN s.rou_nbv ELSE NULL END) AS closing_rou_nbv
        FROM lease.amortisation_schedule s
        WHERE YEAR(s.period_date) = @Year
        GROUP BY s.contract_id
    )
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
        -- IAS 17: straight-line rent = periods in year × monthly_payment
        ISNULL(yt.period_count * c.monthly_payment, 0)              AS ias17_rent_expense,
        -- IFRS 16 components
        ISNULL(yt.total_interest, 0)                                AS ifrs16_interest_expense,
        ISNULL(yt.total_depreciation, 0)                            AS ifrs16_depreciation,
        ISNULL(yt.total_interest + yt.total_depreciation, 0)        AS ifrs16_total_charge,
        -- P&L difference (positive = IFRS 16 higher)
        ISNULL(yt.total_interest + yt.total_depreciation
               - yt.period_count * c.monthly_payment, 0)            AS pl_difference,
        -- Balance sheet
        ISNULL(yt.closing_liability, 0)                             AS bs_lease_liability,
        ISNULL(yt.closing_rou_nbv, 0)                               AS bs_rou_asset
    FROM lease.contracts c
    LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
    INNER JOIN year_totals yt ON yt.contract_id = c.contract_id
    WHERE c.status NOT IN ('Deleted','Terminated')
    ORDER BY c.contract_ref;

    -- Summary totals (second result set)
    WITH year_totals2 AS (
        SELECT
            s.contract_id,
            COUNT(*)                AS period_count,
            SUM(s.interest_expense) AS total_interest,
            SUM(s.depreciation)     AS total_depreciation,
            MAX(CASE WHEN s.period_date = (
                SELECT MAX(s2.period_date) FROM lease.amortisation_schedule s2
                WHERE s2.contract_id = s.contract_id AND YEAR(s2.period_date) = @Year
            ) THEN s.closing_liability ELSE NULL END) AS closing_liability,
            MAX(CASE WHEN s.period_date = (
                SELECT MAX(s2.period_date) FROM lease.amortisation_schedule s2
                WHERE s2.contract_id = s.contract_id AND YEAR(s2.period_date) = @Year
            ) THEN s.rou_nbv ELSE NULL END) AS closing_rou_nbv
        FROM lease.amortisation_schedule s
        WHERE YEAR(s.period_date) = @Year
        GROUP BY s.contract_id
    )
    SELECT
        SUM(yt2.period_count * c2.monthly_payment)                  AS total_ias17_expense,
        SUM(yt2.total_interest)                                     AS total_ifrs16_interest,
        SUM(yt2.total_depreciation)                                 AS total_ifrs16_depreciation,
        SUM(yt2.total_interest + yt2.total_depreciation)            AS total_ifrs16_charge,
        SUM(ISNULL(yt2.closing_liability, 0))                       AS total_lease_liability,
        SUM(ISNULL(yt2.closing_rou_nbv, 0))                         AS total_rou_asset
    FROM lease.contracts c2
    INNER JOIN year_totals2 yt2 ON yt2.contract_id = c2.contract_id
    WHERE c2.status NOT IN ('Deleted','Terminated');
END
GO
