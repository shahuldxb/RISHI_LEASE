-- ============================================================
-- FIX v2: sp_GetIFRS16DisclosureNotes — temp table approach
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
    -- Step A: last period_date per contract for prior year
    SELECT s.contract_id, MAX(s.period_date) AS last_prior_date
    INTO #prior_last
    FROM lease.amortisation_schedule s
    WHERE YEAR(s.period_date) = @ReportingYear - 1
    GROUP BY s.contract_id;

    -- Step B: last period_date per contract for current year
    SELECT s.contract_id, MAX(s.period_date) AS last_curr_date
    INTO #curr_last
    FROM lease.amortisation_schedule s
    WHERE YEAR(s.period_date) = @ReportingYear
    GROUP BY s.contract_id;

    -- Step C: prior year closing ROU
    SELECT s.contract_id, s.rou_nbv AS prior_rou
    INTO #prior_rou
    FROM lease.amortisation_schedule s
    JOIN #prior_last pl ON pl.contract_id = s.contract_id AND pl.last_prior_date = s.period_date;

    -- Step D: current year depreciation and closing ROU
    SELECT s.contract_id, SUM(s.depreciation) AS period_depr
    INTO #curr_depr
    FROM lease.amortisation_schedule s
    WHERE YEAR(s.period_date) = @ReportingYear
    GROUP BY s.contract_id;

    SELECT s.contract_id, s.rou_nbv AS closing_rou
    INTO #curr_rou
    FROM lease.amortisation_schedule s
    JOIN #curr_last cl ON cl.contract_id = s.contract_id AND cl.last_curr_date = s.period_date;

    SELECT
        c.ifrs16_classification                                 AS asset_class,
        COUNT(c.contract_id)                                    AS lease_count,
        ISNULL(SUM(pr.prior_rou), 0)                            AS opening_nbv,
        ISNULL(SUM(CASE WHEN YEAR(c.commencement_date)=@ReportingYear
                        THEN c.monthly_payment * c.term_months ELSE 0 END), 0) AS additions,
        ISNULL(SUM(cd.period_depr), 0)                          AS depreciation_charge,
        ISNULL(SUM(cr.closing_rou), 0)                          AS closing_nbv
    FROM lease.contracts c
    LEFT JOIN #prior_rou pr ON pr.contract_id = c.contract_id
    LEFT JOIN #curr_depr cd ON cd.contract_id = c.contract_id
    LEFT JOIN #curr_rou  cr ON cr.contract_id = c.contract_id
    WHERE c.status NOT IN ('Deleted','Terminated')
    GROUP BY c.ifrs16_classification
    ORDER BY c.ifrs16_classification;

    DROP TABLE #prior_last; DROP TABLE #curr_last;
    DROP TABLE #prior_rou;  DROP TABLE #curr_depr; DROP TABLE #curr_rou;

    -- ── 3. LEASE LIABILITY RECONCILIATION ────────────────────────────────
    -- Prior year closing liability
    SELECT s.contract_id, MAX(s.period_date) AS last_date
    INTO #pl_last
    FROM lease.amortisation_schedule s
    JOIN lease.contracts c ON c.contract_id = s.contract_id
    WHERE YEAR(s.period_date) = @ReportingYear - 1
      AND c.status NOT IN ('Deleted','Terminated')
    GROUP BY s.contract_id;

    SELECT s.contract_id, s.closing_liability AS prior_liab
    INTO #prior_liab
    FROM lease.amortisation_schedule s
    JOIN #pl_last pl ON pl.contract_id = s.contract_id AND pl.last_date = s.period_date;

    -- New leases commenced this year: opening liability
    SELECT s.contract_id, s.opening_liability AS new_liab
    INTO #new_leases
    FROM lease.amortisation_schedule s
    JOIN lease.contracts c ON c.contract_id = s.contract_id
    WHERE YEAR(c.commencement_date) = @ReportingYear
      AND c.status NOT IN ('Deleted','Terminated')
      AND s.period_date = c.commencement_date;

    -- Current year activity
    SELECT s.contract_id,
           SUM(s.interest_expense) AS interest_accrued,
           SUM(s.payment)          AS payments_made
    INTO #curr_act
    FROM lease.amortisation_schedule s
    JOIN lease.contracts c ON c.contract_id = s.contract_id
    WHERE YEAR(s.period_date) = @ReportingYear
      AND c.status NOT IN ('Deleted','Terminated')
    GROUP BY s.contract_id;

    -- Current year closing liability
    SELECT s.contract_id, MAX(s.period_date) AS last_date
    INTO #cl_last
    FROM lease.amortisation_schedule s
    JOIN lease.contracts c ON c.contract_id = s.contract_id
    WHERE YEAR(s.period_date) = @ReportingYear
      AND c.status NOT IN ('Deleted','Terminated')
    GROUP BY s.contract_id;

    SELECT s.contract_id, s.closing_liability AS curr_liab
    INTO #curr_liab
    FROM lease.amortisation_schedule s
    JOIN #cl_last cl ON cl.contract_id = s.contract_id AND cl.last_date = s.period_date;

    SELECT
        ISNULL(SUM(pl.prior_liab), 0)    AS opening_liability,
        ISNULL(SUM(nl.new_liab), 0)      AS new_leases,
        ISNULL(SUM(ca.interest_accrued), 0) AS interest_accrued,
        ISNULL(SUM(ca.payments_made), 0) AS payments_made,
        ISNULL(SUM(cl.curr_liab), 0)     AS closing_liability
    FROM (SELECT DISTINCT contract_id FROM lease.contracts WHERE status NOT IN ('Deleted','Terminated')) base
    LEFT JOIN #prior_liab pl ON pl.contract_id = base.contract_id
    LEFT JOIN #new_leases  nl ON nl.contract_id = base.contract_id
    LEFT JOIN #curr_act    ca ON ca.contract_id = base.contract_id
    LEFT JOIN #curr_liab   cl ON cl.contract_id = base.contract_id;

    DROP TABLE #pl_last; DROP TABLE #prior_liab; DROP TABLE #new_leases;
    DROP TABLE #curr_act; DROP TABLE #cl_last; DROP TABLE #curr_liab;

    -- ── 4. KEY ASSUMPTIONS ───────────────────────────────────────────────
    SELECT s.contract_id, MAX(s.closing_liability) AS closing_liability, MAX(s.rou_nbv) AS rou_nbv
    INTO #year_snap
    FROM lease.amortisation_schedule s
    WHERE YEAR(s.period_date) = @ReportingYear
    GROUP BY s.contract_id;

    SELECT
        COUNT(c.contract_id)                                                    AS total_leases,
        ROUND(SUM(c.ibr * c.monthly_payment * c.term_months)
              / NULLIF(SUM(c.monthly_payment * c.term_months), 0), 4)           AS weighted_avg_ibr,
        ROUND(AVG(CAST(DATEDIFF(MONTH, GETDATE(), c.expiry_date) AS FLOAT)), 1) AS avg_remaining_term_months,
        MIN(c.ibr)                                                              AS min_ibr,
        MAX(c.ibr)                                                              AS max_ibr,
        SUM(c.monthly_payment * 12)                                             AS total_annual_payments,
        ISNULL(SUM(ys.closing_liability), 0)                                    AS total_lease_liability,
        ISNULL(SUM(ys.rou_nbv), 0)                                              AS total_rou_nbv
    FROM lease.contracts c
    LEFT JOIN #year_snap ys ON ys.contract_id = c.contract_id
    WHERE c.status NOT IN ('Deleted','Terminated')
      AND c.lifecycle_status NOT IN ('Closed');

    DROP TABLE #year_snap;
END
GO

-- ============================================================
-- FIX v2: sp_GetIAS17Comparison — temp table approach
-- ============================================================
IF OBJECT_ID('dbo.sp_GetIAS17Comparison', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetIAS17Comparison;
GO
CREATE PROCEDURE dbo.sp_GetIAS17Comparison
    @Year INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Pre-aggregate all per-contract year totals
    SELECT
        s.contract_id,
        COUNT(*)                AS period_count,
        SUM(s.interest_expense) AS total_interest,
        SUM(s.depreciation)     AS total_depreciation
    INTO #year_agg
    FROM lease.amortisation_schedule s
    WHERE YEAR(s.period_date) = @Year
    GROUP BY s.contract_id;

    -- Last period per contract for year-end snapshot
    SELECT s.contract_id, MAX(s.period_date) AS last_date
    INTO #last_period
    FROM lease.amortisation_schedule s
    WHERE YEAR(s.period_date) = @Year
    GROUP BY s.contract_id;

    SELECT s.contract_id, s.closing_liability, s.rou_nbv
    INTO #year_end_snap
    FROM lease.amortisation_schedule s
    JOIN #last_period lp ON lp.contract_id = s.contract_id AND lp.last_date = s.period_date;

    -- Per-lease comparison
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
        ISNULL(ya.period_count * c.monthly_payment, 0)              AS ias17_rent_expense,
        ISNULL(ya.total_interest, 0)                                AS ifrs16_interest_expense,
        ISNULL(ya.total_depreciation, 0)                            AS ifrs16_depreciation,
        ISNULL(ya.total_interest + ya.total_depreciation, 0)        AS ifrs16_total_charge,
        ISNULL(ya.total_interest + ya.total_depreciation
               - ya.period_count * c.monthly_payment, 0)            AS pl_difference,
        ISNULL(yes2.closing_liability, 0)                           AS bs_lease_liability,
        ISNULL(yes2.rou_nbv, 0)                                     AS bs_rou_asset
    FROM lease.contracts c
    LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
    INNER JOIN #year_agg ya ON ya.contract_id = c.contract_id
    LEFT JOIN #year_end_snap yes2 ON yes2.contract_id = c.contract_id
    WHERE c.status NOT IN ('Deleted','Terminated')
    ORDER BY c.contract_ref;

    -- Summary totals
    SELECT
        SUM(ya.period_count * c.monthly_payment)                    AS total_ias17_expense,
        SUM(ya.total_interest)                                      AS total_ifrs16_interest,
        SUM(ya.total_depreciation)                                  AS total_ifrs16_depreciation,
        SUM(ya.total_interest + ya.total_depreciation)              AS total_ifrs16_charge,
        SUM(ISNULL(yes2.closing_liability, 0))                      AS total_lease_liability,
        SUM(ISNULL(yes2.rou_nbv, 0))                                AS total_rou_asset
    FROM lease.contracts c
    INNER JOIN #year_agg ya ON ya.contract_id = c.contract_id
    LEFT JOIN #year_end_snap yes2 ON yes2.contract_id = c.contract_id
    WHERE c.status NOT IN ('Deleted','Terminated');

    DROP TABLE #year_agg; DROP TABLE #last_period; DROP TABLE #year_end_snap;
END
GO
