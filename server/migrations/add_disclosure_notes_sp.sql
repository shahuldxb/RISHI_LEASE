-- ============================================================
-- IFRS 16 Disclosure Notes Generator
-- sp_GetIFRS16DisclosureNotes
-- Returns 4 result sets:
--   1. Maturity Analysis (undiscounted cash flows by band)
--   2. ROU Asset Movement (opening, additions, depreciation, closing)
--   3. Lease Liability Reconciliation (opening, additions, interest, payments, closing)
--   4. Key Assumptions (weighted avg IBR, weighted avg remaining term)
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
    -- Undiscounted future lease payments grouped by maturity band
    -- as at year-end (IFRS 16 para 58(a))
    SELECT
        maturity_band,
        SUM(undiscounted_payment)  AS undiscounted_payment,
        SUM(discounted_liability)  AS discounted_liability,
        COUNT(DISTINCT contract_id) AS lease_count
    FROM (
        SELECT
            s.contract_id,
            s.payment                                        AS undiscounted_payment,
            s.closing_liability                              AS discounted_liability,
            CASE
                WHEN s.period_date <= DATEADD(YEAR, 1, @YearEnd)  THEN 'Less than 1 year'
                WHEN s.period_date <= DATEADD(YEAR, 2, @YearEnd)  THEN '1 to 2 years'
                WHEN s.period_date <= DATEADD(YEAR, 3, @YearEnd)  THEN '2 to 3 years'
                WHEN s.period_date <= DATEADD(YEAR, 4, @YearEnd)  THEN '3 to 4 years'
                WHEN s.period_date <= DATEADD(YEAR, 5, @YearEnd)  THEN '4 to 5 years'
                ELSE 'More than 5 years'
            END AS maturity_band
        FROM lease.amortisation_schedule s
        JOIN lease.contracts c ON c.contract_id = s.contract_id
        WHERE s.period_date > @YearEnd
          AND c.status NOT IN ('Deleted', 'Terminated')
          AND c.lifecycle_status NOT IN ('Closed')
    ) t
    GROUP BY maturity_band
    ORDER BY
        CASE maturity_band
            WHEN 'Less than 1 year'  THEN 1
            WHEN '1 to 2 years'      THEN 2
            WHEN '2 to 3 years'      THEN 3
            WHEN '3 to 4 years'      THEN 4
            WHEN '4 to 5 years'      THEN 5
            ELSE 6
        END;

    -- ── 2. ROU ASSET MOVEMENT ─────────────────────────────────────────────
    -- Per asset class (IFRS 16 para 53(j))
    SELECT
        c.ifrs16_classification                          AS asset_class,
        COUNT(DISTINCT c.contract_id)                    AS lease_count,
        -- Opening NBV = rou_nbv at last period of prior year
        ISNULL(SUM(prior.rou_nbv), 0)                    AS opening_nbv,
        -- Additions = initial ROU for leases commenced in the year
        ISNULL(SUM(CASE WHEN YEAR(c.commencement_date) = @ReportingYear
                        THEN c.monthly_payment * c.term_months ELSE 0 END), 0) AS additions,
        -- Depreciation = sum of depreciation for the year
        ISNULL(SUM(curr.period_depr), 0)                 AS depreciation_charge,
        -- Closing NBV = rou_nbv at last period of the year
        ISNULL(SUM(curr.closing_rou), 0)                 AS closing_nbv
    FROM lease.contracts c
    LEFT JOIN (
        -- Prior year closing ROU
        SELECT contract_id, rou_nbv
        FROM lease.amortisation_schedule s1
        WHERE period_date = (
            SELECT MAX(s2.period_date)
            FROM lease.amortisation_schedule s2
            WHERE s2.contract_id = s1.contract_id
              AND YEAR(s2.period_date) = @ReportingYear - 1
        )
    ) prior ON prior.contract_id = c.contract_id
    LEFT JOIN (
        -- Current year totals
        SELECT
            contract_id,
            SUM(depreciation) AS period_depr,
            MAX(CASE WHEN period_date = (
                SELECT MAX(s3.period_date)
                FROM lease.amortisation_schedule s3
                WHERE s3.contract_id = s.contract_id
                  AND YEAR(s3.period_date) = @ReportingYear
            ) THEN rou_nbv ELSE NULL END) AS closing_rou
        FROM lease.amortisation_schedule s
        WHERE YEAR(period_date) = @ReportingYear
        GROUP BY contract_id
    ) curr ON curr.contract_id = c.contract_id
    WHERE c.status NOT IN ('Deleted', 'Terminated')
    GROUP BY c.ifrs16_classification
    ORDER BY c.ifrs16_classification;

    -- ── 3. LEASE LIABILITY RECONCILIATION ────────────────────────────────
    -- (IFRS 16 para 53(a)-(e))
    SELECT
        -- Opening liability = closing_liability at last period of prior year
        ISNULL((
            SELECT SUM(s.closing_liability)
            FROM lease.amortisation_schedule s
            JOIN lease.contracts c ON c.contract_id = s.contract_id
            WHERE c.status NOT IN ('Deleted','Terminated')
              AND s.period_date = (
                  SELECT MAX(s2.period_date)
                  FROM lease.amortisation_schedule s2
                  WHERE s2.contract_id = s.contract_id
                    AND YEAR(s2.period_date) = @ReportingYear - 1
              )
        ), 0)                                            AS opening_liability,
        -- New leases commenced in year: initial PV
        ISNULL((
            SELECT SUM(s.opening_liability)
            FROM lease.amortisation_schedule s
            JOIN lease.contracts c ON c.contract_id = s.contract_id
            WHERE YEAR(c.commencement_date) = @ReportingYear
              AND s.period_date = c.commencement_date
              AND c.status NOT IN ('Deleted','Terminated')
        ), 0)                                            AS new_leases,
        -- Interest accrued during year
        ISNULL((
            SELECT SUM(s.interest_expense)
            FROM lease.amortisation_schedule s
            JOIN lease.contracts c ON c.contract_id = s.contract_id
            WHERE YEAR(s.period_date) = @ReportingYear
              AND c.status NOT IN ('Deleted','Terminated')
        ), 0)                                            AS interest_accrued,
        -- Payments made during year
        ISNULL((
            SELECT SUM(s.payment)
            FROM lease.amortisation_schedule s
            JOIN lease.contracts c ON c.contract_id = s.contract_id
            WHERE YEAR(s.period_date) = @ReportingYear
              AND c.status NOT IN ('Deleted','Terminated')
        ), 0)                                            AS payments_made,
        -- Closing liability = closing_liability at last period of current year
        ISNULL((
            SELECT SUM(s.closing_liability)
            FROM lease.amortisation_schedule s
            JOIN lease.contracts c ON c.contract_id = s.contract_id
            WHERE c.status NOT IN ('Deleted','Terminated')
              AND s.period_date = (
                  SELECT MAX(s2.period_date)
                  FROM lease.amortisation_schedule s2
                  WHERE s2.contract_id = s.contract_id
                    AND YEAR(s2.period_date) = @ReportingYear
              )
        ), 0)                                            AS closing_liability;

    -- ── 4. KEY ASSUMPTIONS ───────────────────────────────────────────────
    -- Weighted average IBR and remaining term (IFRS 16 para 59(a))
    SELECT
        COUNT(c.contract_id)                             AS total_leases,
        ROUND(
            SUM(c.ibr * c.monthly_payment * c.term_months)
            / NULLIF(SUM(c.monthly_payment * c.term_months), 0)
        , 4)                                             AS weighted_avg_ibr,
        ROUND(
            AVG(CAST(DATEDIFF(MONTH, GETDATE(), c.expiry_date) AS FLOAT))
        , 1)                                             AS avg_remaining_term_months,
        MIN(c.ibr)                                       AS min_ibr,
        MAX(c.ibr)                                       AS max_ibr,
        SUM(c.monthly_payment * 12)                      AS total_annual_payments,
        SUM(
            (SELECT ISNULL(MAX(s.closing_liability), 0)
             FROM lease.amortisation_schedule s
             WHERE s.contract_id = c.contract_id
               AND YEAR(s.period_date) = @ReportingYear)
        )                                                AS total_lease_liability,
        SUM(
            (SELECT ISNULL(MAX(s.rou_nbv), 0)
             FROM lease.amortisation_schedule s
             WHERE s.contract_id = c.contract_id
               AND YEAR(s.period_date) = @ReportingYear)
        )                                                AS total_rou_nbv
    FROM lease.contracts c
    WHERE c.status NOT IN ('Deleted', 'Terminated')
      AND c.lifecycle_status NOT IN ('Closed');
END
GO
