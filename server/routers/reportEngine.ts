/**
 * VodaLease Enterprise — AI Report Engine Router
 * Generates enterprise-level narrative reports using Azure OpenAI
 * Stores results in accounting.report_outputs for instant retrieval
 */
import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { invokeLLM } from '../_core/llm';
import { execSPP, execSPPMulti, sql, getPool } from '../db-sqlserver';
import { TRPCError } from '@trpc/server';

// ── Report Type Definitions ──────────────────────────────────────────
const REPORT_TYPES = [
  'portfolio_summary',
  'rou_roll_forward',
  'liability_roll_forward',
  'maturity_analysis',
  'interest_depreciation',
  'lease_expiry',
  'cash_forecast',
  'disclosure_pack',
] as const;

type ReportType = typeof REPORT_TYPES[number];

async function ensureReportOutputsTable() {
  const pool = await getPool();
  await pool.request().query(`
    IF SCHEMA_ID('accounting') IS NULL EXEC('CREATE SCHEMA accounting');
    IF OBJECT_ID('accounting.report_outputs', 'U') IS NULL
    BEGIN
      CREATE TABLE accounting.report_outputs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        report_type NVARCHAR(50) NOT NULL,
        content_markdown NVARCHAR(MAX) NOT NULL,
        parameters_json NVARCHAR(MAX) NULL,
        generated_by NVARCHAR(100) NULL,
        generated_at DATETIME2 NOT NULL CONSTRAINT DF_report_outputs_generated_at DEFAULT SYSUTCDATETIME(),
        from_date DATE NULL,
        to_date DATE NULL,
        currency NVARCHAR(10) NULL,
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_report_outputs_status DEFAULT 'ready'
      );
      CREATE INDEX IX_report_outputs_lookup ON accounting.report_outputs(report_type, status, generated_at DESC);
    END
  `);
}

// ── Enterprise Prompts ───────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior IFRS 16 lease accounting analyst at a Big 4 advisory firm. You produce enterprise-level narrative reports for CFOs, audit committees, and board members. Your reports are:
- Precise with numbers (always include currency and exact figures from the data)
- Structured with clear headings, tables, and bullet points in Markdown
- Analytical (identify trends, risks, anomalies, and actionable recommendations)
- Compliant with IFRS 16 terminology and paragraph references
- Professional tone suitable for board-level presentation

Always structure your report with:
1. Executive Summary (2-3 sentences)
2. Key Metrics table
3. Detailed Analysis sections
4. Risk Indicators / Observations
5. Recommendations / Action Items

Use Markdown formatting with tables, bold for key figures, and clear section headers.`;

const REPORT_PROMPTS: Record<ReportType, string> = {
  portfolio_summary: `Generate a **Portfolio Summary Report** for the lease portfolio. Analyse the data and produce:

1. **Executive Summary**: Total portfolio size, composition, and health status
2. **Key Metrics Table**: Total leases, Total ROU Asset, Total Lease Liability, Current vs Non-Current split, Monthly Payment obligation, Weighted Average Remaining Term, Weighted Average IBR
3. **Asset Type Analysis**: Breakdown by asset type (Office, Vehicle, Equipment, Land, Retail, Warehouse) with concentration percentages
4. **Currency Exposure**: Multi-currency breakdown with FX risk commentary
5. **Portfolio Health Indicators**: 
   - Lease concentration risk (any single lease > 20% of portfolio?)
   - Average remaining term vs original term (portfolio ageing)
   - Modification frequency (stability indicator)
6. **Recommendations**: Top 3 actions for portfolio optimisation

Reference IFRS 16 Para 53 disclosure requirements throughout.`,

  rou_roll_forward: `Generate a **Right-of-Use Asset Roll-Forward Report** (IFRS 16 Para 53(a)-(h)). Analyse the data and produce:

1. **Executive Summary**: Net movement in ROU assets for the period
2. **Roll-Forward Table**: Opening Balance → Additions → Depreciation Charge → Modifications (increases/decreases) → Impairment → Disposals → Closing Balance
3. **Movement Analysis**: 
   - Depreciation as % of opening (is it accelerating?)
   - Additions trend (new lease activity)
   - Modification impact (net increase or decrease in ROU)
4. **Asset Class Breakdown**: Roll-forward by asset type
5. **Impairment Assessment**: Any indicators of impairment? (ROU > recoverable amount)
6. **Useful Life Analysis**: Remaining useful life vs lease term alignment
7. **Audit-Ready Disclosure**: Pre-formatted IFRS 16 Para 53(a) note text

All figures must match the data provided. Flag any anomalies.`,

  liability_roll_forward: `Generate a **Lease Liability Roll-Forward Report** (IFRS 16 Para 53(g)-(h)). Analyse the data and produce:

1. **Executive Summary**: Net change in lease liabilities and key drivers
2. **Roll-Forward Table**: Opening Balance → New Leases → Interest Accretion → Lease Payments (principal) → Modifications → Terminations → Closing Balance
3. **Cash Flow Impact Analysis**:
   - Total cash outflow (principal + interest)
   - Interest as % of total payment (effective cost of leasing)
   - Principal repayment rate (deleveraging speed)
4. **Refinancing Risk Assessment**:
   - Liabilities maturing within 12 months vs available liquidity
   - Concentration of maturities in any single quarter
5. **Interest Rate Sensitivity**: Impact of IBR changes on liability
6. **Current vs Non-Current Split**: With 12-month forward projection
7. **Audit-Ready Disclosure**: Pre-formatted IFRS 16 Para 53(g) note text

Highlight any material movements that require management attention.`,

  maturity_analysis: `Generate a **Lease Liability Maturity Analysis Report** (IFRS 16 Para 58 / IAS 1.61). Analyse the data and produce:

1. **Executive Summary**: Total undiscounted future lease payments and maturity profile
2. **Maturity Ladder Table**:
   | Band | Undiscounted Payments | % of Total | Cumulative % |
   - Less than 1 year
   - 1 to 2 years
   - 2 to 5 years
   - More than 5 years
   - Total undiscounted
   - Less: discount effect
   - Present value (= lease liability)
3. **Liquidity Risk Assessment**:
   - Front-loaded vs back-loaded profile
   - Peak payment quarters
   - Renewal cliff risk (multiple leases expiring simultaneously)
4. **Discount Reconciliation**: Undiscounted total vs PV (discount effect as %)
5. **Stress Testing**: What if IBR increases by 100bps? Impact on PV
6. **Renewal Strategy**: Which expiring leases should be renewed vs terminated?
7. **Audit-Ready Disclosure**: Pre-formatted IFRS 16 Para 58 maturity table

When the scope is All Leases, show the maturity ladder across all leases, then add a lease-level cash flow summary using any cash forecast rows provided in the raw data.

Important date rule:
- Renewal strategy uses lease expiry dates from maturity/lease rows.
- Cash flow summary uses only the provided cashForecast rows and the cashForecastHorizon value, which is generated through the selected lease ending period.
- Maturity ladder and cash flow should cover all selected leases and all generated periods.
- Maturity is yearly bucket-wise; cash flow is monthly.
- Label the section as "Cash Flow Summary Through Lease Ending Period: <cashForecastHorizon.label>".

This is a critical liquidity disclosure — ensure accuracy.`,

  interest_depreciation: `Generate an **Interest & Depreciation Expense Report** (P&L Impact Analysis). Analyse the data and produce:

1. **Executive Summary**: Total lease-related P&L impact for the period
2. **Expense Summary Table**:
   | Category | Current Period | Prior Period | Variance | Variance % |
   - Finance cost (interest on lease liabilities)
   - Depreciation of ROU assets
   - Total IFRS 16 P&L charge
   - Memo: Cash rent paid (for comparison)
3. **Monthly/Quarterly Trend Analysis**: 
   - Is interest declining period-over-period? (expected as liability reduces)
   - Is depreciation stable? (should be straight-line unless modifications)
   - Any spikes requiring explanation?
4. **Budget vs Actual**: If budget data available, show variance
5. **IFRS 16 vs IAS 17 Comparison**: 
   - Under old standard: straight-line rent expense
   - Under IFRS 16: front-loaded (interest + depreciation)
   - Net P&L impact of transition
6. **Forecast**: Projected expense for next 4 quarters based on current portfolio
7. **Key Ratios**: Interest coverage, lease expense as % of revenue (if available)

Emphasise the front-loading effect of IFRS 16 for management understanding.`,

  lease_expiry: `Generate a **Lease Expiry & Renewal Action Report**. Analyse the data and produce:

1. **Executive Summary**: Number of leases expiring and total liability at risk
2. **Expiry Dashboard Table**:
   | Urgency | Lease | Asset | Expiry Date | Days Remaining | Monthly Rent | Action Required |
   - Critical (< 90 days)
   - Warning (90-180 days)
   - Planning (180-365 days)
   - Monitoring (> 365 days)
3. **Financial Impact of Expiry**:
   - Total monthly payment ceasing if not renewed
   - Liability reduction on expiry
   - ROU asset fully depreciated? (should be zero at expiry)
4. **Renewal Recommendations** (for each expiring lease):
   - Renew: if location/asset is strategic
   - Renegotiate: if market rents have changed
   - Terminate: if no longer needed
   - Relocate: if better alternatives exist
5. **Negotiation Points**: Market rent benchmarks, leverage factors
6. **Timeline**: Critical dates and decision deadlines (notice periods)
7. **Budget Impact**: Renewal at current vs market rates

This is an operational action report — be specific with recommendations.`,

  cash_forecast: `Generate a **Cash Payment Forecast Report** (Treasury Planning). Analyse the data and produce:

1. **Executive Summary**: Total cash outflow over forecast period and peak months
2. **Monthly Cash Forecast Table**:
   | Month | Lease Payments | Interest Portion | Principal Portion | Cumulative |
   (for each month in the forecast period)
3. **Payment Concentration Analysis**:
   - Which months have highest outflows? Why?
   - Any payment clustering (multiple leases paying same day?)
   - Quarterly aggregation for treasury planning
4. **Currency Breakdown**: Payments by currency with FX risk
5. **Cash Flow vs Budget**: Variance analysis if budget available
6. **Liquidity Planning**:
   - Minimum cash reserve required to cover 3-month rolling payments
   - Payment holiday opportunities (if any leases allow deferral)
7. **Optimisation Opportunities**:
   - Payment date alignment (consolidate to reduce admin)
   - Early termination savings (NPV of remaining vs termination cost)
   - Refinancing at lower IBR (if rates have dropped)

When the scope is All Leases, show cash flow for all leases with monthly totals and lease counts, then include a compact maturity ladder summary where maturity rows are provided.

Important date rule:
- The cash forecast period runs through the selected lease ending period.
- Use cashForecastHorizon.label exactly when describing the cash flow period.

This report supports treasury cash management — be precise with dates and amounts.`,
  disclosure_pack: `Generate an **IFRS 16 Disclosure Pack Narrative** for the selected lease or overall lease portfolio and active disclosure section. Analyse the data and produce:

1. **Executive Summary**: Lease, reporting period, and disclosure readiness
2. **Disclosure Metrics Table**: ROU asset, lease liability, P&L impact, maturity exposure, and exemption status where available
3. **Section Analysis**: Explain the active disclosure tab using IFRS 16 language
4. **Audit Observations**: Completeness, unusual balances, missing postings, and reconciliation points
5. **Disclosure Note Draft**: Short auditor-ready wording for the selected lease

Use only the provided lease data. When the scope is All Leases, summarise the portfolio and key concentrations. State clearly when a section has no source rows.`,
};

// ── Helper: Fetch report data from SPs ───────────────────────────────
async function fetchReportData(reportType: ReportType, params: { startDate?: string; endDate?: string; currency?: string; contractId?: number }): Promise<string> {
  let data: unknown[];
  const filterByContract = (rows: unknown[]) => {
    if (!params.contractId) return rows;
    return rows.filter((row: any) => Number(row?.contract_id) === params.contractId);
  };
  const describeCashForecastHorizon = (rows: unknown[]) => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const periods = rows
      .map((row: any) => ({
        year: Number(row?.period_year),
        month: Number(row?.period_month),
      }))
      .filter((period) => Number.isInteger(period.year) && Number.isInteger(period.month) && period.month >= 1 && period.month <= 12)
      .filter((period, index, allPeriods) =>
        allPeriods.findIndex((candidate) => candidate.year === period.year && candidate.month === period.month) === index
      )
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));

    if (periods.length === 0) {
      return {
        label: "No cash forecast rows",
        start: null,
        end: null,
        months: 0,
      };
    }

    const first = periods[0];
    const last = periods[periods.length - 1];
    return {
      label: `${monthNames[first.month - 1]} ${first.year} to ${monthNames[last.month - 1]} ${last.year}`,
      start: `${first.year}-${String(first.month).padStart(2, "0")}`,
      end: `${last.year}-${String(last.month).padStart(2, "0")}`,
      months: periods.length,
    };
  };
  const fetchCashForecastThroughLeaseEnd = async () => {
    const pool = await getPool();
    const req = pool.request();
    req.input('ContractId', sql.Int, params.contractId ?? null);
    req.input('Currency', sql.VarChar(3), params.currency || null);
    const result = await req.query(`
      DECLARE @StartDate DATE = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) + 1, 0);
      DECLARE @LeaseEndDate DATE = (
        SELECT MAX(c.expiry_date)
        FROM lease.contracts c
        WHERE (@ContractId IS NULL OR c.contract_id = @ContractId)
          AND (@Currency IS NULL OR c.currency = @Currency)
      );
      DECLARE @EndDateExclusive DATE = DATEADD(DAY, 1, EOMONTH(ISNULL(@LeaseEndDate, @StartDate)));

      SELECT YEAR(a.period_date) AS period_year, MONTH(a.period_date) AS period_month,
        FORMAT(a.period_date, 'MMM yyyy') AS period_label,
        c.contract_id, c.contract_ref, c.asset_description, c.asset_type, c.expiry_date, c.currency,
        SUM(a.payment) AS total_payment, SUM(a.interest_expense) AS interest_portion,
        SUM(a.principal) AS principal_portion, 1 AS lease_count
      FROM lease.amortisation_schedule a
      JOIN lease.contracts c ON c.contract_id = a.contract_id
      WHERE a.period_date >= @StartDate AND a.period_date < @EndDateExclusive
        AND (@ContractId IS NULL OR c.contract_id = @ContractId)
        AND (@Currency IS NULL OR c.currency = @Currency)
      GROUP BY YEAR(a.period_date), MONTH(a.period_date), FORMAT(a.period_date, 'MMM yyyy'),
        c.contract_id, c.contract_ref, c.asset_description, c.asset_type, c.expiry_date, c.currency
      ORDER BY YEAR(a.period_date), MONTH(a.period_date), c.contract_ref, c.currency
    `);
    return {
      rows: result.recordset,
    };
  };

  switch (reportType) {
    case 'portfolio_summary':
      if (params.contractId) {
        const pool = await getPool();
        const req = pool.request();
        req.input('ContractId', sql.Int, params.contractId);
        const result = await req.query(`
          SELECT TOP 1 c.*, ls.legal_name AS lessor_name,
            ISNULL((SELECT TOP 1 a.closing_liability FROM lease.amortisation_schedule a WHERE a.contract_id = c.contract_id ORDER BY a.period_date DESC), c.lease_liability_commence) AS current_liability,
            c.rou_asset_value - ISNULL((SELECT SUM(a.depreciation) FROM lease.amortisation_schedule a WHERE a.contract_id = c.contract_id), 0) AS current_rou_nbv
          FROM lease.contracts c
          LEFT JOIN lease.lessors ls ON ls.lessor_id = c.lessor_id
          WHERE c.contract_id = @ContractId
        `);
        data = result.recordset;
      } else {
        data = await execSPP('sp_ReportPortfolioSummary', []);
      }
      break;
    case 'rou_roll_forward':
      data = filterByContract(await execSPP('sp_ReportROURollForward', [
        { name: 'StartDate', type: sql.Date, value: params.startDate || null },
        { name: 'EndDate', type: sql.Date, value: params.endDate || null },
        { name: 'Currency', type: sql.VarChar(3), value: params.currency || null },
      ]));
      break;
    case 'liability_roll_forward':
      data = filterByContract(await execSPP('sp_ReportLiabilityRollForward', [
        { name: 'StartDate', type: sql.Date, value: params.startDate || null },
        { name: 'EndDate', type: sql.Date, value: params.endDate || null },
        { name: 'Currency', type: sql.VarChar(3), value: params.currency || null },
      ]));
      break;
    case 'maturity_analysis':
      {
        const maturityRows = filterByContract(await execSPP('sp_ReportMaturityAnalysis', [
          { name: 'AsOfDate', type: sql.Date, value: params.endDate || null },
          { name: 'Currency', type: sql.VarChar(3), value: params.currency || null },
        ]));
        const cashForecast = await fetchCashForecastThroughLeaseEnd();
        const cashRows = cashForecast.rows;
        data = [{
          scope: params.contractId ? `Contract ID ${params.contractId}` : 'All Leases',
          dateUsage: "Maturity ladder/renewal strategy uses lease expiry dates. Cash forecast runs through the selected lease ending period.",
          cashForecastHorizon: describeCashForecastHorizon(cashRows),
          maturityLadder: maturityRows,
          cashForecast: cashRows,
        }];
      }
      break;
    case 'interest_depreciation':
      if (params.contractId) {
        const pool = await getPool();
        const req = pool.request();
        req.input('ContractId', sql.Int, params.contractId);
        req.input('StartDate', sql.Date, params.startDate || null);
        req.input('EndDate', sql.Date, params.endDate || null);
        req.input('Currency', sql.VarChar(3), params.currency || null);
        const result = await req.query(`
          DECLARE @Start DATE = ISNULL(@StartDate, DATEFROMPARTS(YEAR(GETDATE()), 1, 1));
          DECLARE @End DATE = ISNULL(@EndDate, GETDATE());
          SELECT YEAR(a.period_date) AS period_year, MONTH(a.period_date) AS period_month,
            FORMAT(a.period_date, 'MMM yyyy') AS period_label, c.contract_id, c.contract_ref, c.currency,
            SUM(a.interest_expense) AS total_interest, SUM(a.depreciation) AS total_depreciation,
            SUM(a.payment) AS total_payment, COUNT(DISTINCT c.contract_id) AS lease_count
          FROM lease.amortisation_schedule a
          JOIN lease.contracts c ON c.contract_id = a.contract_id
          WHERE a.period_date BETWEEN @Start AND @End
            AND c.contract_id = @ContractId
            AND (@Currency IS NULL OR c.currency = @Currency)
          GROUP BY YEAR(a.period_date), MONTH(a.period_date), FORMAT(a.period_date, 'MMM yyyy'), c.contract_id, c.contract_ref, c.currency
          ORDER BY YEAR(a.period_date), MONTH(a.period_date), c.currency
        `);
        data = result.recordset;
      } else {
        data = await execSPP('sp_ReportInterestExpense', [
          { name: 'StartDate', type: sql.Date, value: params.startDate || null },
          { name: 'EndDate', type: sql.Date, value: params.endDate || null },
          { name: 'Currency', type: sql.VarChar(3), value: params.currency || null },
          { name: 'Granularity', type: sql.VarChar(10), value: 'Monthly' },
        ]);
      }
      break;
    case 'lease_expiry':
      data = filterByContract(await execSPP('sp_ReportLeaseExpiry', [
        { name: 'DaysAhead', type: sql.Int, value: 365 },
        { name: 'Currency', type: sql.VarChar(3), value: params.currency || null },
      ]));
      break;
    case 'cash_forecast':
      {
        const cashForecast = await fetchCashForecastThroughLeaseEnd();
        const cashRows = cashForecast.rows;
        const maturityRows = filterByContract(await execSPP('sp_ReportMaturityAnalysis', [
          { name: 'AsOfDate', type: sql.Date, value: params.endDate || null },
          { name: 'Currency', type: sql.VarChar(3), value: params.currency || null },
        ]));
        data = [{
          scope: params.contractId ? `Contract ID ${params.contractId}` : 'All Leases',
          dateUsage: "Cash forecast runs through the selected lease ending period. Maturity ladder/renewal strategy uses lease expiry dates.",
          cashForecastHorizon: describeCashForecastHorizon(cashRows),
          cashForecast: cashRows,
          maturityLadder: maturityRows,
        }];
      }
      break;
    case 'disclosure_pack':
      if (!params.contractId) {
        const sets = await execSPPMulti("lease.sp_GetDisclosurePack", [
          { name: "PeriodEnd", type: sql.Date, value: params.endDate ? new Date(params.endDate) : new Date() },
          { name: "PeriodStart", type: sql.Date, value: params.startDate ? new Date(params.startDate) : null },
        ]);
        data = [{
          scope: 'All Leases',
          summary: sets[0]?.[0] ?? {},
          balanceSheet: sets[1] ?? [],
          incomeStmt: sets[2] ?? [],
          rouRollFwd: sets[3] ?? [],
          liabRollFwd: sets[4] ?? [],
          maturity: sets[5] ?? [],
          exemptions: sets[6] ?? [],
        }];
        break;
      }
      {
        const pool = await getPool();
        const req = pool.request();
        req.input('ContractId', sql.Int, params.contractId);
        req.input('StartDate', sql.Date, params.startDate || null);
        req.input('EndDate', sql.Date, params.endDate || null);
        const result = await req.query(`
          DECLARE @Start DATE = ISNULL(@StartDate, DATEADD(YEAR, -1, ISNULL(@EndDate, GETDATE())));
          DECLARE @End DATE = ISNULL(@EndDate, GETDATE());
          SELECT c.contract_id, c.contract_ref, c.asset_description, c.asset_type, c.currency,
            c.rou_asset_value, c.lease_liability_commence, c.monthly_payment,
            c.commencement_date, c.expiry_date, c.exemption_type, c.exemption_reason,
            SUM(CASE WHEN a.period_date BETWEEN @Start AND @End THEN a.depreciation ELSE 0 END) AS period_depreciation,
            SUM(CASE WHEN a.period_date BETWEEN @Start AND @End THEN a.interest_expense ELSE 0 END) AS period_interest,
            SUM(CASE WHEN a.period_date BETWEEN @Start AND @End THEN a.payment ELSE 0 END) AS period_payments,
            SUM(CASE WHEN a.period_date > @End THEN a.principal + a.interest_expense ELSE 0 END) AS future_undiscounted_cashflow
          FROM lease.contracts c
          LEFT JOIN lease.amortisation_schedule a ON a.contract_id = c.contract_id
          WHERE c.contract_id = @ContractId
          GROUP BY c.contract_id, c.contract_ref, c.asset_description, c.asset_type, c.currency,
            c.rou_asset_value, c.lease_liability_commence, c.monthly_payment,
            c.commencement_date, c.expiry_date, c.exemption_type, c.exemption_reason
        `);
        data = result.recordset;
      }
      break;
  }

  return JSON.stringify(data, null, 2);
}

// ── Router ───────────────────────────────────────────────────────────
export const reportEngineRouter = router({

  // Generate a new AI report
  generateReport: protectedProcedure
    .input(z.object({
      reportType: z.enum(REPORT_TYPES),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      currency: z.string().optional(),
      contractId: z.number().int().optional(),
      contractRef: z.string().optional(),
      section: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { reportType, startDate, endDate, currency, contractId, contractRef, section } = input;

      // 1. Fetch live data from SP
      const rawData = await fetchReportData(reportType, { startDate, endDate, currency, contractId });

      // 2. Build the prompt
      const userPrompt = `${REPORT_PROMPTS[reportType]}

---

**RAW DATA FROM DATABASE** (use these exact figures in your report):

\`\`\`json
${rawData}
\`\`\`

**Report Parameters:**
- Period: ${startDate || 'Inception'} to ${endDate || 'Today'}
- Lease: ${contractRef || (contractId ? `Contract ID ${contractId}` : 'All leases')}
- Active Section: ${section || reportType}
- Currency Filter: ${currency || 'All currencies'}
- Generated: ${new Date().toISOString()}
- Entity: VodaLease Enterprise (Qatar)

Generate the full report now in Markdown format.`;

      // 3. Call Azure OpenAI
      const llmResponse = await invokeLLM({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: 4096,
      });

      const content = typeof llmResponse.choices[0]?.message?.content === 'string'
        ? llmResponse.choices[0].message.content
        : Array.isArray(llmResponse.choices[0]?.message?.content)
          ? llmResponse.choices[0].message.content.map((p: any) => p.type === 'text' ? p.text : '').join('')
          : '';

      if (!content) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI failed to generate report content' });
      }

      // 4. Store in database
      await ensureReportOutputsTable();
      const pool = await getPool();
      const req = pool.request();
      req.input('reportType', sql.NVarChar(50), reportType);
      req.input('content', sql.NVarChar(sql.MAX), content);
      req.input('params', sql.NVarChar(sql.MAX), JSON.stringify({ startDate, endDate, currency, contractId, contractRef, section }));
      req.input('generatedBy', sql.NVarChar(100), ctx.user?.name || ctx.user?.openId || 'system');
      req.input('fromDate', sql.Date, startDate || null);
      req.input('toDate', sql.Date, endDate || null);
      req.input('currency', sql.NVarChar(10), currency || 'ALL');

      await req.query(`
        INSERT INTO accounting.report_outputs 
          (report_type, content_markdown, parameters_json, generated_by, from_date, to_date, currency, status)
        VALUES 
          (@reportType, @content, @params, @generatedBy, @fromDate, @toDate, @currency, 'ready')
      `);

      return { success: true, content, generatedAt: new Date().toISOString() };
    }),

  // Get the latest generated report for a type
  getLatestReport: protectedProcedure
    .input(z.object({
      reportType: z.enum(REPORT_TYPES),
      contractId: z.number().int().optional(),
      section: z.string().optional(),
    }))
    .query(async ({ input }) => {
      await ensureReportOutputsTable();
      const pool = await getPool();
      const req = pool.request();
      req.input('reportType', sql.NVarChar(50), input.reportType);
      let filters = `report_type = @reportType AND status = 'ready'`;
      if (input.contractId != null) {
        req.input('contractId', sql.NVarChar(30), String(input.contractId));
        filters += ` AND JSON_VALUE(parameters_json, '$.contractId') = @contractId`;
      } else {
        filters += ` AND JSON_VALUE(parameters_json, '$.contractId') IS NULL`;
      }
      if (input.section) {
        req.input('section', sql.NVarChar(100), input.section);
        filters += ` AND JSON_VALUE(parameters_json, '$.section') = @section`;
      }

      const result = await req.query(`
        SELECT TOP 1 id, report_type, generated_at, content_markdown, parameters_json, generated_by, from_date, to_date, currency, status
        FROM accounting.report_outputs
        WHERE ${filters}
        ORDER BY generated_at DESC
      `);

      return result.recordset[0] || null;
    }),

  // List all generated reports (history)
  listReports: protectedProcedure
    .input(z.object({
      reportType: z.enum(REPORT_TYPES).optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      await ensureReportOutputsTable();
      const pool = await getPool();
      const req = pool.request();

      let query = `
        SELECT id, report_type, generated_at, generated_by, from_date, to_date, currency, status,
               LEN(content_markdown) as content_length
        FROM accounting.report_outputs
      `;

      if (input.reportType) {
        req.input('reportType', sql.NVarChar(50), input.reportType);
        query += ` WHERE report_type = @reportType`;
      }

      query += ` ORDER BY generated_at DESC`;

      if (input.limit) {
        query = query.replace('SELECT ', `SELECT TOP ${input.limit} `);
      }

      const result = await req.query(query);
      return result.recordset;
    }),

  // Get a specific report by ID
  getReportById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      await ensureReportOutputsTable();
      const pool = await getPool();
      const req = pool.request();
      req.input('id', sql.Int, input.id);

      const result = await req.query(`
        SELECT id, report_type, generated_at, content_markdown, parameters_json, generated_by, from_date, to_date, currency, status
        FROM accounting.report_outputs
        WHERE id = @id
      `);

      return result.recordset[0] || null;
    }),
});
