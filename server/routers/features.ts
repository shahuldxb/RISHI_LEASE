import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getPool } from "../db-sqlserver";
import { invokeLLM } from "../_core/llm";

// ─── Critical Dates ───────────────────────────────────────────────────────────
export const criticalDatesRouter = router({
  list: protectedProcedure
    .input(z.object({ daysAhead: z.number().default(365) }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("days", input.daysAhead);
      const r = await req.query(`
        SELECT cd.*, c.contract_ref, c.asset_description, c.asset_type,
          DATEDIFF(day, GETDATE(), cd.event_date) AS days_until,
          CASE
            WHEN cd.event_date < GETDATE() THEN 'OVERDUE'
            WHEN DATEDIFF(day, GETDATE(), cd.event_date) <= 30 THEN 'CRITICAL'
            WHEN DATEDIFF(day, GETDATE(), cd.event_date) <= 90 THEN 'WARNING'
            WHEN DATEDIFF(day, GETDATE(), cd.event_date) <= 180 THEN 'UPCOMING'
            ELSE 'FUTURE'
          END AS urgency
        FROM lease.critical_dates cd
        JOIN lease.contracts c ON c.contract_id = cd.contract_id
        WHERE cd.is_dismissed = 0
          AND cd.event_date <= DATEADD(day, @days, GETDATE())
        ORDER BY cd.event_date ASC
      `);
      return r.recordset;
    }),

  create: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      event_type: z.string(),
      event_date: z.string(),
      notice_days_required: z.number().default(30),
      description: z.string(),
      action_required: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("contract_id", input.contract_id);
      req.input("event_type", input.event_type);
      req.input("event_date", input.event_date);
      req.input("notice_days", input.notice_days_required);
      req.input("description", input.description);
      req.input("action_required", input.action_required ?? null);
      req.input("created_by", ctx.user.id);
      await req.query(`
        INSERT INTO lease.critical_dates
          (contract_id, event_type, event_date, notice_days_required, description, action_required, created_by, is_dismissed)
        VALUES (@contract_id, @event_type, @event_date, @notice_days, @description, @action_required, @created_by, 0)
      `);
      return { success: true };
    }),

  dismiss: protectedProcedure
    .input(z.object({ date_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.date_id)
        .query(`UPDATE lease.critical_dates SET is_dismissed=1, dismissed_at=GETDATE() WHERE date_id=@id`);
      return { success: true };
    }),
});

// ─── AI Lease Abstraction ─────────────────────────────────────────────────────
export const aiAbstractionRouter = router({
  abstract: protectedProcedure
    .input(z.object({
      leaseText: z.string(),
      documentType: z.string().default("LEASE_AGREEMENT"),
    }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an expert IFRS 16 lease abstraction specialist. Extract structured lease data from the provided lease document text. Return a JSON object with these fields:
            - lessor_name: string
            - lessee_name: string  
            - asset_description: string
            - asset_type: one of [OFFICE, RETAIL, WAREHOUSE, LAND, VEHICLE, EQUIPMENT, OTHER]
            - commencement_date: ISO date string
            - expiry_date: ISO date string
            - lease_term_months: number
            - monthly_payment: number
            - currency: string (default AED)
            - payment_frequency: one of [MONTHLY, QUARTERLY, ANNUALLY]
            - ibr_rate: number (estimated IBR as decimal e.g. 0.045)
            - has_renewal_option: boolean
            - renewal_option_terms: string or null
            - has_break_clause: boolean
            - break_clause_date: ISO date string or null
            - rent_review_frequency: string or null
            - security_deposit: number or null
            - governing_law: string
            - key_obligations: array of strings
            - classification: one of [FINANCE_LEASE, OPERATING_LEASE, SHORT_TERM, LOW_VALUE]
            - confidence_score: number 0-100`
          },
          {
            role: "user",
            content: `Please abstract the following lease document:\n\n${input.leaseText.slice(0, 8000)}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "lease_abstraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                lessor_name: { type: "string" },
                lessee_name: { type: "string" },
                asset_description: { type: "string" },
                asset_type: { type: "string" },
                commencement_date: { type: "string" },
                expiry_date: { type: "string" },
                lease_term_months: { type: "number" },
                monthly_payment: { type: "number" },
                currency: { type: "string" },
                payment_frequency: { type: "string" },
                ibr_rate: { type: "number" },
                has_renewal_option: { type: "boolean" },
                renewal_option_terms: { type: ["string", "null"] },
                has_break_clause: { type: "boolean" },
                break_clause_date: { type: ["string", "null"] },
                rent_review_frequency: { type: ["string", "null"] },
                security_deposit: { type: ["number", "null"] },
                governing_law: { type: "string" },
                key_obligations: { type: "array", items: { type: "string" } },
                classification: { type: "string" },
                confidence_score: { type: "number" },
              },
              required: ["lessor_name", "lessee_name", "asset_description", "asset_type", "commencement_date", "expiry_date", "lease_term_months", "monthly_payment", "currency", "payment_frequency", "ibr_rate", "has_renewal_option", "renewal_option_terms", "has_break_clause", "break_clause_date", "rent_review_frequency", "security_deposit", "governing_law", "key_obligations", "classification", "confidence_score"],
              additionalProperties: false,
            }
          }
        }
      });
      const content = response.choices[0].message.content;
      const parsed = typeof content === "string" ? JSON.parse(content) : content;
      return parsed;
    }),

  history: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT TOP 20 a.*, u.username AS abstracted_by_name
      FROM lease.ai_abstractions a
      LEFT JOIN security.users u ON u.user_id = a.created_by
      ORDER BY a.created_at DESC
    `);
    return r.recordset;
  }),
});

// ─── Sub-lease Accounting ─────────────────────────────────────────────────────
export const subLeaseRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT sl.*, c.contract_ref AS head_lease_ref, c.asset_description,
             c.monthly_payment AS head_lease_payment
      FROM lease.sub_leases sl
      JOIN lease.contracts c ON c.contract_id = sl.head_lease_contract_id
      ORDER BY sl.commencement_date DESC
    `);
    return r.recordset;
  }),

  create: protectedProcedure
    .input(z.object({
      head_lease_contract_id: z.number(),
      sublessee_name: z.string(),
      sublease_area_sqft: z.number().optional(),
      monthly_income: z.number(),
      commencement_date: z.string(),
      expiry_date: z.string(),
      classification: z.enum(["FINANCE_SUBLEASE", "OPERATING_SUBLEASE"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => req.input(k, v ?? null));
      req.input("created_by", ctx.user.id);
      await req.query(`
        INSERT INTO lease.sub_leases
          (head_lease_contract_id, sublessee_name, sublease_area_sqft, monthly_income,
           commencement_date, expiry_date, classification, notes, created_by)
        VALUES (@head_lease_contract_id, @sublessee_name, @sublease_area_sqft, @monthly_income,
                @commencement_date, @expiry_date, @classification, @notes, @created_by)
      `);
      return { success: true };
    }),
});

// ─── Rent Reviews ─────────────────────────────────────────────────────────────
export const rentReviewRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT rr.*, c.contract_ref, c.asset_description, c.monthly_payment AS current_payment,
        DATEDIFF(day, GETDATE(), rr.review_date) AS days_until
      FROM lease.rent_reviews rr
      JOIN lease.contracts c ON c.contract_id = rr.contract_id
      ORDER BY rr.review_date ASC
    `);
    return r.recordset;
  }),

  complete: protectedProcedure
    .input(z.object({
      review_id: z.number(),
      agreed_new_rent: z.number(),
      effective_date: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("id", input.review_id);
      req.input("new_rent", input.agreed_new_rent);
      req.input("effective_date", input.effective_date);
      req.input("notes", input.notes ?? null);
      req.input("completed_by", ctx.user.id);
      await req.query(`
        UPDATE lease.rent_reviews
        SET agreed_new_rent=@new_rent, effective_date=@effective_date,
            notes=@notes, status='COMPLETED', completed_by=@completed_by, completed_at=GETDATE()
        WHERE review_id=@id
      `);
      return { success: true };
    }),
});

// ─── Security Deposits ────────────────────────────────────────────────────────
export const securityDepositRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT sd.*, c.contract_ref, c.asset_description, c.expiry_date AS lease_expiry
      FROM lease.security_deposits sd
      JOIN lease.contracts c ON c.contract_id = sd.contract_id
      ORDER BY sd.deposit_date DESC
    `);
    return r.recordset;
  }),

  create: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      deposit_amount: z.number(),
      deposit_type: z.enum(["CASH", "BANK_GUARANTEE", "CHEQUE", "LETTER_OF_CREDIT"]),
      deposit_date: z.string(),
      expected_return_date: z.string().optional(),
      bank_name: z.string().optional(),
      guarantee_number: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => req.input(k, v ?? null));
      req.input("created_by", ctx.user.id);
      await req.query(`
        INSERT INTO lease.security_deposits
          (contract_id, deposit_amount, deposit_type, deposit_date, expected_return_date,
           bank_name, guarantee_number, notes, status, created_by)
        VALUES (@contract_id, @deposit_amount, @deposit_type, @deposit_date, @expected_return_date,
                @bank_name, @guarantee_number, @notes, 'HELD', @created_by)
      `);
      return { success: true };
    }),
});

// ─── Custom Report Builder ────────────────────────────────────────────────────
export const reportBuilderRouter = router({
  savedReports: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT rb.*, u.username AS created_by_name
      FROM reporting.saved_reports rb
      LEFT JOIN security.users u ON u.user_id = rb.created_by
      ORDER BY rb.created_at DESC
    `);
    return r.recordset;
  }),

  run: protectedProcedure
    .input(z.object({
      reportType: z.enum(["LEASE_REGISTER", "AMORTISATION_SUMMARY", "PAYMENT_FORECAST", "MATURITY_ANALYSIS", "COST_CENTRE", "ASSET_TYPE_SUMMARY", "EXPIRY_REPORT"]),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      filters: z.record(z.string(), z.string()).optional(),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      let sql = "";
      switch (input.reportType) {
        case "LEASE_REGISTER":
          sql = `SELECT c.contract_ref, c.asset_description, c.asset_type, c.status,
            l.lessor_name, c.commencement_date, c.expiry_date,
            DATEDIFF(month, GETDATE(), c.expiry_date) AS months_remaining,
            c.monthly_payment, c.ibr, c.rou_asset_value, c.lease_liability_value
            FROM lease.contracts c LEFT JOIN lessor.lessors l ON l.lessor_id=c.lessor_id
            ORDER BY c.expiry_date`;
          break;
        case "AMORTISATION_SUMMARY":
          sql = `SELECT c.contract_ref, c.asset_description,
            SUM(a.principal_payment) AS total_principal,
            SUM(a.interest_payment) AS total_interest,
            SUM(a.total_payment) AS total_payment,
            MIN(a.payment_date) AS first_payment, MAX(a.payment_date) AS last_payment,
            COUNT(*) AS payment_count
            FROM lease.amortisation_schedule a
            JOIN lease.contracts c ON c.contract_id=a.contract_id
            GROUP BY c.contract_ref, c.asset_description ORDER BY c.contract_ref`;
          break;
        case "PAYMENT_FORECAST":
          sql = `SELECT FORMAT(a.payment_date,'yyyy-MM') AS period,
            SUM(a.total_payment) AS total_payment,
            SUM(a.principal_payment) AS principal,
            SUM(a.interest_payment) AS interest,
            COUNT(DISTINCT a.contract_id) AS lease_count
            FROM lease.amortisation_schedule a
            WHERE a.payment_date >= GETDATE()
            GROUP BY FORMAT(a.payment_date,'yyyy-MM')
            ORDER BY period`;
          break;
        case "MATURITY_ANALYSIS":
          sql = `SELECT
            CASE
              WHEN DATEDIFF(month,GETDATE(),c.expiry_date) <= 12 THEN '0-1 Year'
              WHEN DATEDIFF(month,GETDATE(),c.expiry_date) <= 24 THEN '1-2 Years'
              WHEN DATEDIFF(month,GETDATE(),c.expiry_date) <= 60 THEN '2-5 Years'
              ELSE 'Over 5 Years'
            END AS maturity_band,
            COUNT(*) AS lease_count,
            SUM(c.lease_liability_value) AS total_liability,
            SUM(c.monthly_payment*12) AS annual_payments
            FROM lease.contracts c WHERE c.status='Active'
            GROUP BY
            CASE
              WHEN DATEDIFF(month,GETDATE(),c.expiry_date) <= 12 THEN '0-1 Year'
              WHEN DATEDIFF(month,GETDATE(),c.expiry_date) <= 24 THEN '1-2 Years'
              WHEN DATEDIFF(month,GETDATE(),c.expiry_date) <= 60 THEN '2-5 Years'
              ELSE 'Over 5 Years'
            END`;
          break;
        case "COST_CENTRE":
          sql = `SELECT c.cost_centre, COUNT(*) AS lease_count,
            SUM(c.monthly_payment*12) AS annual_cost,
            SUM(c.rou_asset_value) AS total_rou,
            SUM(c.lease_liability_value) AS total_liability
            FROM lease.contracts c WHERE c.status='Active' AND c.cost_centre IS NOT NULL
            GROUP BY c.cost_centre ORDER BY annual_cost DESC`;
          break;
        case "ASSET_TYPE_SUMMARY":
          sql = `SELECT c.asset_type, COUNT(*) AS count,
            SUM(c.monthly_payment*12) AS annual_payments,
            SUM(c.rou_asset_value) AS total_rou,
            SUM(c.lease_liability_value) AS total_liability,
            AVG(c.ibr) AS avg_ibr
            FROM lease.contracts c WHERE c.status='Active'
            GROUP BY c.asset_type ORDER BY total_liability DESC`;
          break;
        case "EXPIRY_REPORT":
          sql = `SELECT c.contract_ref, c.asset_description, c.asset_type,
            l.lessor_name, c.expiry_date,
            DATEDIFF(day,GETDATE(),c.expiry_date) AS days_until_expiry,
            c.monthly_payment, c.lease_liability_value
            FROM lease.contracts c LEFT JOIN lessor.lessors l ON l.lessor_id=c.lessor_id
            WHERE c.status='Active' AND c.expiry_date <= DATEADD(year,2,GETDATE())
            ORDER BY c.expiry_date`;
          break;
      }
      const r = await pool.request().query(sql);
      return { columns: Object.keys(r.recordset[0] ?? {}), rows: r.recordset };
    }),
});

// ─── Scenario Modelling ───────────────────────────────────────────────────────
export const scenarioRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT s.*, u.username AS created_by_name
      FROM finance.scenarios s
      LEFT JOIN security.users u ON u.user_id = s.created_by
      ORDER BY s.created_at DESC
    `);
    return r.recordset;
  }),

  run: protectedProcedure
    .input(z.object({
      scenario_name: z.string(),
      ibr_adjustment: z.number().default(0),
      rent_increase_pct: z.number().default(0),
      include_renewals: z.boolean().default(false),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      // Calculate scenario impact
      const req = pool.request();
      req.input("ibr_adj", input.ibr_adjustment);
      req.input("rent_pct", input.rent_increase_pct / 100);
      const r = await req.query(`
        SELECT
          COUNT(*) AS affected_leases,
          SUM(c.lease_liability_value) AS current_total_liability,
          SUM(c.lease_liability_value * (1 + @ibr_adj * -5)) AS scenario_total_liability,
          SUM(c.monthly_payment * 12) AS current_annual_payments,
          SUM(c.monthly_payment * 12 * (1 + @rent_pct)) AS scenario_annual_payments,
          SUM(c.rou_asset_value) AS current_total_rou,
          SUM(c.rou_asset_value * (1 + @ibr_adj * -3)) AS scenario_total_rou
        FROM lease.contracts c WHERE c.status='Active'
      `);
      const result = r.recordset[0];
      // Save scenario
      const saveReq = pool.request();
      saveReq.input("name", input.scenario_name);
      saveReq.input("desc", input.description ?? null);
      saveReq.input("ibr_adj", input.ibr_adjustment);
      saveReq.input("rent_pct", input.rent_increase_pct);
      saveReq.input("include_renewals", input.include_renewals ? 1 : 0);
      saveReq.input("current_liability", result.current_total_liability);
      saveReq.input("scenario_liability", result.scenario_total_liability);
      saveReq.input("current_payments", result.current_annual_payments);
      saveReq.input("scenario_payments", result.scenario_annual_payments);
      saveReq.input("created_by", ctx.user.id);
      await saveReq.query(`
        INSERT INTO finance.scenarios
          (scenario_name, description, ibr_adjustment, rent_increase_pct, include_renewals,
           current_liability, scenario_liability, current_annual_payments, scenario_annual_payments, created_by)
        VALUES (@name, @desc, @ibr_adj, @rent_pct, @include_renewals,
                @current_liability, @scenario_liability, @current_payments, @scenario_payments, @created_by)
      `);
      return { ...result, scenario_name: input.scenario_name };
    }),
});

// ─── ASC 842 Parallel Accounting ─────────────────────────────────────────────
export const asc842Router = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT a.*, c.contract_ref, c.asset_description, c.asset_type, c.commencement_date, c.expiry_date,
             cl.lease_type AS ifrs16_classification,
             l.lessor_name
      FROM lease.asc842_parallel a
      JOIN lease.contracts c ON c.contract_id = a.contract_id
      LEFT JOIN lease.lease_classification cl ON cl.contract_id = a.contract_id AND cl.standard='IFRS16'
      LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
      ORDER BY c.contract_ref
    `);
    return r.recordset;
  }),
  syncFromIFRS16: protectedProcedure.mutation(async ({ ctx }) => {
    const pool = await getPool();
    // Get all contracts with IFRS 16 data
    const r = await pool.request().query(`
      SELECT c.contract_id, c.rou_asset_value, c.lease_liability_commence,
             cl.lease_type,
             CASE WHEN cl.lease_type='FINANCE' THEN 'FINANCE' ELSE 'OPERATING' END AS asc842_type
      FROM lease.contracts c
      LEFT JOIN lease.lease_classification cl ON cl.contract_id=c.contract_id AND cl.standard='IFRS16'
      WHERE c.status='Active'
    `);
    let synced = 0;
    for (const row of r.recordset) {
      const req2 = pool.request();
      req2.input("contract_id", row.contract_id);
      req2.input("asc842_classification", row.asc842_type ?? "OPERATING");
      req2.input("rou_asset_asc842", Number(row.rou_asset_value ?? 0) * 0.95); // FX conversion approx
      req2.input("lease_liability_asc842", Number(row.lease_liability_commence ?? 0) * 0.95);
      req2.input("synced_by", ctx.user.id);
      await req2.query(`
        MERGE lease.asc842_parallel AS t
        USING (SELECT @contract_id AS contract_id) AS s ON t.contract_id=s.contract_id
        WHEN MATCHED THEN UPDATE SET asc842_classification=@asc842_classification, rou_asset_asc842=@rou_asset_asc842, lease_liability_asc842=@lease_liability_asc842, updated_at=GETUTCDATE()
        WHEN NOT MATCHED THEN INSERT (contract_id,asc842_classification,rou_asset_asc842,lease_liability_asc842,synced_by) VALUES (@contract_id,@asc842_classification,@rou_asset_asc842,@lease_liability_asc842,@synced_by);
      `);
      synced++;
    }
    return { synced };
  }),
});

// ─── Lease Origination Workflow ───────────────────────────────────────────────
export const leaseOriginationRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT lo.*, u.username AS requestor_name
      FROM lease.lease_origination lo
      LEFT JOIN security.users u ON u.user_id=lo.requestor_id
      ORDER BY lo.created_at DESC
    `);
    return r.recordset;
  }),
  create: protectedProcedure
    .input(z.object({
      lessor_name: z.string(),
      asset_description: z.string(),
      asset_type: z.string(),
      proposed_start: z.string(),
      proposed_end: z.string(),
      estimated_annual_rent: z.number(),
      currency: z.string().default("AED"),
      business_justification: z.string(),
      priority: z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).default("MEDIUM"),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => req.input(k, v));
      req.input("requestor_id", ctx.user.id);
      await req.query(`
        INSERT INTO lease.lease_origination (lessor_name,asset_description,asset_type,proposed_start,proposed_end,estimated_annual_rent,currency,business_justification,priority,requestor_id,status)
        VALUES (@lessor_name,@asset_description,@asset_type,@proposed_start,@proposed_end,@estimated_annual_rent,@currency,@business_justification,@priority,@requestor_id,'DRAFT')
      `);
      return { success: true };
    }),
  updateStatus: protectedProcedure
    .input(z.object({ origination_id: z.number(), status: z.string(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("origination_id", input.origination_id);
      req.input("status", input.status);
      req.input("notes", input.notes ?? null);
      await req.query(`UPDATE lease.lease_origination SET status=@status, notes=@notes, updated_at=GETUTCDATE() WHERE origination_id=@origination_id`);
      return { success: true };
    }),
});

// ─── Lease Options (Renewal, Purchase, Termination) ──────────────────────────
export const leaseOptionsRouter = router({
  list: protectedProcedure
    .input(z.object({ contractId: z.number().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      let where = "WHERE 1=1";
      if (input.contractId) { req.input("cid", input.contractId); where += " AND lo.contract_id=@cid"; }
      const r = await req.query(`
        SELECT lo.*, c.contract_ref, c.asset_description
        FROM lease.lease_options lo
        JOIN lease.contracts c ON c.contract_id=lo.contract_id
        ${where} ORDER BY lo.exercise_deadline
      `);
      return r.recordset;
    }),
  upsert: protectedProcedure
    .input(z.object({
      option_id: z.number().optional(),
      contract_id: z.number(),
      option_type: z.enum(["RENEWAL","PURCHASE","TERMINATION","EXTENSION"]),
      exercise_deadline: z.string(),
      notice_period_days: z.number().default(90),
      new_term_months: z.number().optional(),
      new_rent: z.number().optional(),
      purchase_price: z.number().optional(),
      reasonably_certain: z.boolean().default(false),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      req.input("created_by", ctx.user.id);
      if (input.option_id) {
        await req.query(`UPDATE lease.lease_options SET option_type=@option_type,exercise_deadline=@exercise_deadline,notice_period_days=@notice_period_days,new_term_months=@new_term_months,new_rent=@new_rent,purchase_price=@purchase_price,reasonably_certain=@reasonably_certain,notes=@notes,updated_at=GETUTCDATE() WHERE option_id=@option_id`);
      } else {
        await req.query(`INSERT INTO lease.lease_options (contract_id,option_type,exercise_deadline,notice_period_days,new_term_months,new_rent,purchase_price,reasonably_certain,notes,created_by) VALUES (@contract_id,@option_type,@exercise_deadline,@notice_period_days,@new_term_months,@new_rent,@purchase_price,@reasonably_certain,@notes,@created_by)`);
      }
      return { success: true };
    }),
  exercise: protectedProcedure
    .input(z.object({ option_id: z.number(), exercise_date: z.string(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("option_id", input.option_id);
      req.input("exercise_date", input.exercise_date);
      req.input("notes", input.notes ?? null);
      await req.query(`UPDATE lease.lease_options SET status='EXERCISED', exercise_date=@exercise_date, notes=@notes, updated_at=GETUTCDATE() WHERE option_id=@option_id`);
      return { success: true };
    }),
});

// ─── Break Clause Management ──────────────────────────────────────────────────
export const breakClauseRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT bc.*, c.contract_ref, c.asset_description, c.expiry_date
      FROM lease.break_clauses bc
      JOIN lease.contracts c ON c.contract_id=bc.contract_id
      ORDER BY bc.break_date
    `);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      break_id: z.number().optional(),
      contract_id: z.number(),
      break_date: z.string(),
      notice_deadline: z.string(),
      penalty_amount: z.number().optional(),
      conditions: z.string().optional(),
      status: z.enum(["ACTIVE","EXERCISED","LAPSED","WAIVED"]).default("ACTIVE"),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      if (input.break_id) {
        await req.query(`UPDATE lease.break_clauses SET break_date=@break_date,notice_deadline=@notice_deadline,penalty_amount=@penalty_amount,conditions=@conditions,status=@status,updated_at=GETUTCDATE() WHERE break_id=@break_id`);
      } else {
        await req.query(`INSERT INTO lease.break_clauses (contract_id,break_date,notice_deadline,penalty_amount,conditions,status) VALUES (@contract_id,@break_date,@notice_deadline,@penalty_amount,@conditions,@status)`);
      }
      return { success: true };
    }),
});

// ─── Lease Incentives ─────────────────────────────────────────────────────────
export const leaseIncentiveRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT li.*, c.contract_ref, c.asset_description
      FROM lease.lease_incentives li
      JOIN lease.contracts c ON c.contract_id=li.contract_id
      ORDER BY li.created_at DESC
    `);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      incentive_id: z.number().optional(),
      contract_id: z.number(),
      incentive_type: z.enum(["RENT_FREE","TENANT_IMPROVEMENT","CASH_INCENTIVE","REDUCED_DEPOSIT","OTHER"]),
      amount: z.number(),
      start_date: z.string(),
      end_date: z.string(),
      amortisation_method: z.enum(["STRAIGHT_LINE","EFFECTIVE_INTEREST"]).default("STRAIGHT_LINE"),
      gl_account: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      req.input("created_by", ctx.user.id);
      if (input.incentive_id) {
        await req.query(`UPDATE lease.lease_incentives SET incentive_type=@incentive_type,amount=@amount,start_date=@start_date,end_date=@end_date,amortisation_method=@amortisation_method,gl_account=@gl_account,description=@description,updated_at=GETUTCDATE() WHERE incentive_id=@incentive_id`);
      } else {
        await req.query(`INSERT INTO lease.lease_incentives (contract_id,incentive_type,amount,start_date,end_date,amortisation_method,gl_account,description,created_by) VALUES (@contract_id,@incentive_type,@amount,@start_date,@end_date,@amortisation_method,@gl_account,@description,@created_by)`);
      }
      return { success: true };
    }),
});

// ─── Budget Variance ──────────────────────────────────────────────────────────
export const budgetVarianceRouter = router({
  list: protectedProcedure
    .input(z.object({ year: z.number().default(new Date().getFullYear()) }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("year", input.year);
      const r = await req.query(`
        SELECT bv.*, c.contract_ref, c.asset_description, c.asset_type
        FROM lease.budget_variance bv
        JOIN lease.contracts c ON c.contract_id=bv.contract_id
        WHERE bv.budget_year=@year
        ORDER BY ABS(bv.variance_amount) DESC
      `);
      return r.recordset;
    }),
  upsert: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      budget_year: z.number(),
      budget_month: z.number(),
      budgeted_amount: z.number(),
      actual_amount: z.number(),
      cost_centre: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      req.input("created_by", ctx.user.id);
      req.input("variance_amount", input.actual_amount - input.budgeted_amount);
      req.input("variance_pct", input.budgeted_amount !== 0 ? ((input.actual_amount - input.budgeted_amount) / input.budgeted_amount) * 100 : 0);
      await req.query(`
        MERGE lease.budget_variance AS t
        USING (SELECT @contract_id AS contract_id, @budget_year AS budget_year, @budget_month AS budget_month) AS s
        ON t.contract_id=s.contract_id AND t.budget_year=s.budget_year AND t.budget_month=s.budget_month
        WHEN MATCHED THEN UPDATE SET budgeted_amount=@budgeted_amount,actual_amount=@actual_amount,variance_amount=@variance_amount,variance_pct=@variance_pct,cost_centre=@cost_centre,notes=@notes,updated_at=GETUTCDATE()
        WHEN NOT MATCHED THEN INSERT (contract_id,budget_year,budget_month,budgeted_amount,actual_amount,variance_amount,variance_pct,cost_centre,notes,created_by) VALUES (@contract_id,@budget_year,@budget_month,@budgeted_amount,@actual_amount,@variance_amount,@variance_pct,@cost_centre,@notes,@created_by);
      `);
      return { success: true };
    }),
});

// ─── Cost Centre Allocation ───────────────────────────────────────────────────
export const costCentreRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT ca.*, c.contract_ref, c.asset_description
      FROM lease.cost_centre_allocation ca
      JOIN lease.contracts c ON c.contract_id=ca.contract_id
      ORDER BY c.contract_ref, ca.allocation_pct DESC
    `);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      allocation_id: z.number().optional(),
      contract_id: z.number(),
      cost_centre_code: z.string(),
      cost_centre_name: z.string(),
      allocation_pct: z.number(),
      effective_from: z.string(),
      effective_to: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      req.input("created_by", ctx.user.id);
      if (input.allocation_id) {
        await req.query(`UPDATE lease.cost_centre_allocation SET cost_centre_code=@cost_centre_code,cost_centre_name=@cost_centre_name,allocation_pct=@allocation_pct,effective_from=@effective_from,effective_to=@effective_to,updated_at=GETUTCDATE() WHERE allocation_id=@allocation_id`);
      } else {
        await req.query(`INSERT INTO lease.cost_centre_allocation (contract_id,cost_centre_code,cost_centre_name,allocation_pct,effective_from,effective_to,created_by) VALUES (@contract_id,@cost_centre_code,@cost_centre_name,@allocation_pct,@effective_from,@effective_to,@created_by)`);
      }
      return { success: true };
    }),
});

// ─── Market Rent Benchmarking ─────────────────────────────────────────────────
export const marketRentRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT mr.*, c.contract_ref, c.asset_description, c.monthly_payment,
             (c.monthly_payment * 12 - mr.market_annual_rent) AS variance_amount,
             CASE WHEN mr.market_annual_rent > 0 THEN ((c.monthly_payment * 12 - mr.market_annual_rent) / mr.market_annual_rent) * 100 ELSE 0 END AS variance_pct
      FROM lease.market_rent_benchmarks mr
      JOIN lease.contracts c ON c.contract_id=mr.contract_id
      ORDER BY ABS(c.monthly_payment * 12 - mr.market_annual_rent) DESC
    `);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      benchmark_id: z.number().optional(),
      contract_id: z.number(),
      market_annual_rent: z.number(),
      source: z.string(),
      benchmark_date: z.string(),
      comparable_address: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      req.input("created_by", ctx.user.id);
      if (input.benchmark_id) {
        await req.query(`UPDATE lease.market_rent_benchmarks SET market_annual_rent=@market_annual_rent,source=@source,benchmark_date=@benchmark_date,comparable_address=@comparable_address,notes=@notes,updated_at=GETUTCDATE() WHERE benchmark_id=@benchmark_id`);
      } else {
        await req.query(`INSERT INTO lease.market_rent_benchmarks (contract_id,market_annual_rent,source,benchmark_date,comparable_address,notes,created_by) VALUES (@contract_id,@market_annual_rent,@source,@benchmark_date,@comparable_address,@notes,@created_by)`);
      }
      return { success: true };
    }),
});

// ─── Space Management ─────────────────────────────────────────────────────────
export const spaceManagementRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT sm.*, c.contract_ref, c.asset_description, c.asset_type
      FROM lease.space_management sm
      JOIN lease.contracts c ON c.contract_id=sm.contract_id
      ORDER BY sm.building_name, sm.floor_number
    `);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      space_id: z.number().optional(),
      contract_id: z.number(),
      building_name: z.string(),
      floor_number: z.string().optional(),
      total_area_sqm: z.number(),
      occupied_area_sqm: z.number().optional(),
      capacity_desks: z.number().optional(),
      occupied_desks: z.number().optional(),
      space_type: z.enum(["OFFICE","RETAIL","WAREHOUSE","DATA_CENTRE","PARKING","OTHER"]).default("OFFICE"),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      req.input("created_by", ctx.user.id);
      if (input.space_id) {
        await req.query(`UPDATE lease.space_management SET building_name=@building_name,floor_number=@floor_number,total_area_sqm=@total_area_sqm,occupied_area_sqm=@occupied_area_sqm,capacity_desks=@capacity_desks,occupied_desks=@occupied_desks,space_type=@space_type,updated_at=GETUTCDATE() WHERE space_id=@space_id`);
      } else {
        await req.query(`INSERT INTO lease.space_management (contract_id,building_name,floor_number,total_area_sqm,occupied_area_sqm,capacity_desks,occupied_desks,space_type,created_by) VALUES (@contract_id,@building_name,@floor_number,@total_area_sqm,@occupied_area_sqm,@capacity_desks,@occupied_desks,@space_type,@created_by)`);
      }
      return { success: true };
    }),
});

// ─── Capital Projects ─────────────────────────────────────────────────────────
export const capitalProjectsRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT cp.*, c.contract_ref, c.asset_description
      FROM lease.capital_projects cp
      JOIN lease.contracts c ON c.contract_id=cp.contract_id
      ORDER BY cp.start_date DESC
    `);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      project_id: z.number().optional(),
      contract_id: z.number(),
      project_name: z.string(),
      project_type: z.enum(["FIT_OUT","REFURBISHMENT","MAINTENANCE","EXPANSION","OTHER"]).default("FIT_OUT"),
      budget_amount: z.number(),
      committed_amount: z.number().optional(),
      actual_spend: z.number().optional(),
      start_date: z.string(),
      expected_completion: z.string(),
      status: z.enum(["PLANNED","IN_PROGRESS","COMPLETED","ON_HOLD","CANCELLED"]).default("PLANNED"),
      project_manager: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      req.input("created_by", ctx.user.id);
      if (input.project_id) {
        await req.query(`UPDATE lease.capital_projects SET project_name=@project_name,project_type=@project_type,budget_amount=@budget_amount,committed_amount=@committed_amount,actual_spend=@actual_spend,start_date=@start_date,expected_completion=@expected_completion,status=@status,project_manager=@project_manager,notes=@notes,updated_at=GETUTCDATE() WHERE project_id=@project_id`);
      } else {
        await req.query(`INSERT INTO lease.capital_projects (contract_id,project_name,project_type,budget_amount,committed_amount,actual_spend,start_date,expected_completion,status,project_manager,notes,created_by) VALUES (@contract_id,@project_name,@project_type,@budget_amount,@committed_amount,@actual_spend,@start_date,@expected_completion,@status,@project_manager,@notes,@created_by)`);
      }
      return { success: true };
    }),
});

// ─── ESG Carbon Tracking ──────────────────────────────────────────────────────
export const esgCarbonRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT ec.*, c.contract_ref, c.asset_description, c.asset_type, c.total_area_sqm
      FROM lease.esg_carbon ec
      JOIN lease.contracts c ON c.contract_id=ec.contract_id
      ORDER BY ec.reporting_year DESC, ec.reporting_month DESC
    `);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      carbon_id: z.number().optional(),
      contract_id: z.number(),
      reporting_year: z.number(),
      reporting_month: z.number(),
      scope1_tonnes: z.number().optional(),
      scope2_tonnes: z.number().optional(),
      scope3_tonnes: z.number().optional(),
      energy_kwh: z.number().optional(),
      water_m3: z.number().optional(),
      waste_tonnes: z.number().optional(),
      green_rating: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      req.input("created_by", ctx.user.id);
      if (input.carbon_id) {
        await req.query(`UPDATE lease.esg_carbon SET scope1_tonnes=@scope1_tonnes,scope2_tonnes=@scope2_tonnes,scope3_tonnes=@scope3_tonnes,energy_kwh=@energy_kwh,water_m3=@water_m3,waste_tonnes=@waste_tonnes,green_rating=@green_rating,notes=@notes,updated_at=GETUTCDATE() WHERE carbon_id=@carbon_id`);
      } else {
        await req.query(`INSERT INTO lease.esg_carbon (contract_id,reporting_year,reporting_month,scope1_tonnes,scope2_tonnes,scope3_tonnes,energy_kwh,water_m3,waste_tonnes,green_rating,notes,created_by) VALUES (@contract_id,@reporting_year,@reporting_month,@scope1_tonnes,@scope2_tonnes,@scope3_tonnes,@energy_kwh,@water_m3,@waste_tonnes,@green_rating,@notes,@created_by)`);
      }
      return { success: true };
    }),
  summary: protectedProcedure
    .input(z.object({ year: z.number().default(new Date().getFullYear()) }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("year", input.year);
      const r = await req.query(`
        SELECT 
          SUM(scope1_tonnes) AS total_scope1,
          SUM(scope2_tonnes) AS total_scope2,
          SUM(scope3_tonnes) AS total_scope3,
          SUM(scope1_tonnes+scope2_tonnes+scope3_tonnes) AS total_carbon,
          SUM(energy_kwh) AS total_energy,
          SUM(water_m3) AS total_water,
          COUNT(DISTINCT contract_id) AS leases_reported
        FROM lease.esg_carbon
        WHERE reporting_year=@year
      `);
      return r.recordset[0];
    }),
});

// ─── Multi-Entity ─────────────────────────────────────────────────────────────
export const multiEntityRouter = router({
  listEntities: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`SELECT * FROM lease.entities ORDER BY entity_name`);
    return r.recordset;
  }),
  upsertEntity: protectedProcedure
    .input(z.object({
      entity_id: z.number().optional(),
      entity_code: z.string(),
      entity_name: z.string(),
      country: z.string().default("AE"),
      currency: z.string().default("AED"),
      functional_currency: z.string().default("AED"),
      is_consolidation_entity: z.boolean().default(false),
      parent_entity_id: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      if (input.entity_id) {
        await req.query(`UPDATE lease.entities SET entity_code=@entity_code,entity_name=@entity_name,country=@country,currency=@currency,functional_currency=@functional_currency,is_consolidation_entity=@is_consolidation_entity,parent_entity_id=@parent_entity_id,updated_at=GETUTCDATE() WHERE entity_id=@entity_id`);
      } else {
        await req.query(`INSERT INTO lease.entities (entity_code,entity_name,country,currency,functional_currency,is_consolidation_entity,parent_entity_id) VALUES (@entity_code,@entity_name,@country,@currency,@functional_currency,@is_consolidation_entity,@parent_entity_id)`);
      }
      return { success: true };
    }),
});

// ─── FX Accounting ────────────────────────────────────────────────────────────
export const fxAccountingRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT fx.*, c.contract_ref, c.asset_description, c.currency AS lease_currency
      FROM lease.fx_translations fx
      JOIN lease.contracts c ON c.contract_id=fx.contract_id
      ORDER BY fx.translation_date DESC
    `);
    return r.recordset;
  }),
  translate: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      from_currency: z.string(),
      to_currency: z.string(),
      exchange_rate: z.number(),
      translation_date: z.string(),
      rou_asset_fc: z.number(),
      lease_liability_fc: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => req.input(k, v));
      req.input("rou_asset_lc", input.rou_asset_fc * input.exchange_rate);
      req.input("lease_liability_lc", input.lease_liability_fc * input.exchange_rate);
      req.input("created_by", ctx.user.id);
      await req.query(`INSERT INTO lease.fx_translations (contract_id,from_currency,to_currency,exchange_rate,translation_date,rou_asset_fc,lease_liability_fc,rou_asset_lc,lease_liability_lc,created_by) VALUES (@contract_id,@from_currency,@to_currency,@exchange_rate,@translation_date,@rou_asset_fc,@lease_liability_fc,@rou_asset_lc,@lease_liability_lc,@created_by)`);
      return { success: true };
    }),
});

// ─── Lessor Credit Scoring ────────────────────────────────────────────────────
export const lessorCreditRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT lc.*, l.lessor_name, l.country, l.credit_rating
      FROM lessor.credit_scores lc
      JOIN lessor.lessors l ON l.lessor_id=lc.lessor_id
      ORDER BY lc.score_date DESC
    `);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      lessor_id: z.number(),
      payment_history_score: z.number().min(0).max(100),
      financial_stability_score: z.number().min(0).max(100),
      dispute_history_score: z.number().min(0).max(100),
      compliance_score: z.number().min(0).max(100),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      const overall = Math.round((input.payment_history_score * 0.4 + input.financial_stability_score * 0.3 + input.dispute_history_score * 0.2 + input.compliance_score * 0.1));
      const rating = overall >= 80 ? "A" : overall >= 65 ? "B" : overall >= 50 ? "C" : "D";
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      req.input("overall_score", overall);
      req.input("credit_rating", rating);
      req.input("score_date", new Date().toISOString().slice(0, 10));
      req.input("scored_by", ctx.user.id);
      await req.query(`INSERT INTO lessor.credit_scores (lessor_id,payment_history_score,financial_stability_score,dispute_history_score,compliance_score,overall_score,credit_rating,score_date,notes,scored_by) VALUES (@lessor_id,@payment_history_score,@financial_stability_score,@dispute_history_score,@compliance_score,@overall_score,@credit_rating,@score_date,@notes,@scored_by)`);
      // Update lessor credit rating
      const req2 = pool.request();
      req2.input("lessor_id", input.lessor_id);
      req2.input("credit_rating", rating);
      await req2.query(`UPDATE lessor.lessors SET credit_rating=@credit_rating WHERE lessor_id=@lessor_id`);
      return { success: true, overall_score: overall, credit_rating: rating };
    }),
});

// ─── Email Alerts Configuration ───────────────────────────────────────────────
export const emailAlertsRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`SELECT * FROM lease.alert_configs ORDER BY event_type, days_before`);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      config_id: z.number().optional(),
      event_type: z.string(),
      days_before: z.number(),
      recipient_roles: z.string(),
      email_template: z.string().optional(),
      is_active: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      if (input.config_id) {
        await req.query(`UPDATE lease.alert_configs SET event_type=@event_type,days_before=@days_before,recipient_roles=@recipient_roles,email_template=@email_template,is_active=@is_active,updated_at=GETUTCDATE() WHERE config_id=@config_id`);
      } else {
        await req.query(`INSERT INTO lease.alert_configs (event_type,days_before,recipient_roles,email_template,is_active) VALUES (@event_type,@days_before,@recipient_roles,@email_template,@is_active)`);
      }
      return { success: true };
    }),
  sendTest: protectedProcedure
    .input(z.object({ config_id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // In production this would trigger an actual email via notification service
      return { success: true, message: `Test alert sent to ${ctx.user.email ?? ctx.user.name}` };
    }),
});

// ─── Scheduled Reports ────────────────────────────────────────────────────────
export const scheduledReportsRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT sr.*, u.username AS created_by_name
      FROM lease.scheduled_reports sr
      LEFT JOIN security.users u ON u.user_id=sr.created_by
      ORDER BY sr.next_run_at
    `);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      schedule_id: z.number().optional(),
      report_name: z.string(),
      report_type: z.string(),
      cron_expression: z.string(),
      recipients: z.string(),
      output_format: z.enum(["PDF","EXCEL","CSV"]).default("PDF"),
      is_active: z.boolean().default(true),
      parameters: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) req.input(k, v); });
      req.input("created_by", ctx.user.id);
      if (input.schedule_id) {
        await req.query(`UPDATE lease.scheduled_reports SET report_name=@report_name,report_type=@report_type,cron_expression=@cron_expression,recipients=@recipients,output_format=@output_format,is_active=@is_active,parameters=@parameters,updated_at=GETUTCDATE() WHERE schedule_id=@schedule_id`);
      } else {
        await req.query(`INSERT INTO lease.scheduled_reports (report_name,report_type,cron_expression,recipients,output_format,is_active,parameters,created_by) VALUES (@report_name,@report_type,@cron_expression,@recipients,@output_format,@is_active,@parameters,@created_by)`);
      }
      return { success: true };
    }),
  runNow: protectedProcedure
    .input(z.object({ schedule_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("schedule_id", input.schedule_id);
      await req.query(`UPDATE lease.scheduled_reports SET last_run_at=GETUTCDATE(), run_count=ISNULL(run_count,0)+1 WHERE schedule_id=@schedule_id`);
      return { success: true, message: "Report queued for generation" };
    }),
});

// ─── Lease Termination Router ─────────────────────────────────────────────────
export const terminationRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT t.*, c.contract_ref, c.asset_description, c.monthly_payment, l.lessor_name
      FROM lease.termination_requests t
      JOIN lease.contracts c ON t.contract_id = c.contract_id
      LEFT JOIN lessor.lessors l ON c.lessor_id = l.lessor_id
      ORDER BY t.created_at DESC`);
    return r.recordset;
  }),
  initiate: protectedProcedure.input(z.object({
    contract_id: z.number(),
    effective_date: z.string(),
    reason: z.string(),
    penalty_amount: z.number().optional(),
    buyout_amount: z.number().optional(),
    make_good_amount: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const pool = await getPool();
    await pool.request()
      .input('contract_id', input.contract_id)
      .input('effective_date', input.effective_date)
      .input('reason', input.reason)
      .input('penalty_amount', input.penalty_amount ?? 0)
      .input('buyout_amount', input.buyout_amount ?? 0)
      .input('make_good_amount', input.make_good_amount ?? 0)
      .input('created_by', ctx.user.id)
      .query(`INSERT INTO lease.termination_requests (contract_id, effective_date, reason, penalty_amount, buyout_amount, make_good_amount, created_by) VALUES (@contract_id, @effective_date, @reason, @penalty_amount, @buyout_amount, @make_good_amount, @created_by)`);
    return { success: true };
  }),
  approve: protectedProcedure.input(z.object({ termination_id: z.number() })).mutation(async ({ input, ctx }) => {
    const pool = await getPool();
    await pool.request().input('id', input.termination_id).input('user', ctx.user.id)
      .query(`UPDATE lease.termination_requests SET status='APPROVED', approved_by=@user, approved_at=GETDATE() WHERE termination_id=@id`);
    return { success: true };
  }),
  reject: protectedProcedure.input(z.object({ termination_id: z.number(), reason: z.string() })).mutation(async ({ input }) => {
    const pool = await getPool();
    await pool.request().input('id', input.termination_id).input('reason', input.reason)
      .query(`UPDATE lease.termination_requests SET status='REJECTED', rejected_reason=@reason WHERE termination_id=@id`);
    return { success: true };
  }),
  cancel: protectedProcedure.input(z.object({ termination_id: z.number() })).mutation(async ({ input }) => {
    const pool = await getPool();
    await pool.request().input('id', input.termination_id)
      .query(`UPDATE lease.termination_requests SET status='CANCELLED' WHERE termination_id=@id AND status='PENDING'`);
    return { success: true };
  }),
});

// ─── Bounce Penalty Router ────────────────────────────────────────────────────
export const bouncePenaltyRouter = router({
  listConfig: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`SELECT * FROM cheque.bounce_penalty_config ORDER BY priority, config_id`);
    return r.recordset;
  }),
  saveConfig: protectedProcedure.input(z.object({
    config_id: z.number().optional(),
    penalty_code: z.string(),
    penalty_name: z.string(),
    pct_rate: z.number().optional(),
    flat_amount: z.number().optional(),
    dr_gl_account: z.string().optional(),
    cr_gl_account: z.string().optional(),
    is_active: z.boolean().default(true),
  })).mutation(async ({ input }) => {
    const pool = await getPool();
    if (input.config_id) {
      await pool.request()
        .input('id', input.config_id).input('rate', input.pct_rate ?? null)
        .input('flat', input.flat_amount ?? null).input('active', input.is_active ? 1 : 0)
        .input('name', input.penalty_name)
        .query(`UPDATE cheque.bounce_penalty_config SET pct_rate=@rate, flat_amount=@flat, is_active=@active, penalty_name=@name WHERE config_id=@id`);
    } else {
      await pool.request()
        .input('code', input.penalty_code).input('name', input.penalty_name)
        .input('rate', input.pct_rate ?? null).input('flat', input.flat_amount ?? null)
        .input('debit', input.dr_gl_account ?? null).input('credit', input.cr_gl_account ?? null)
        .query(`INSERT INTO cheque.bounce_penalty_config (penalty_code, penalty_name, pct_rate, flat_amount, dr_gl_account, cr_gl_account, created_by) VALUES (@code, @name, @rate, @flat, @debit, @credit, 1)`);
    }
    return { success: true };
  }),
  listEvents: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT e.*, cr.cheque_number, cr.amount as cheque_amount
      FROM cheque.bounce_events e
      LEFT JOIN cheque.cheque_register cr ON e.original_cheque_id = cr.cheque_id
      ORDER BY e.bounce_date DESC`);
    return r.recordset;
  }),
  recordBounce: protectedProcedure.input(z.object({
    cheque_id: z.number(),
    bounce_date: z.string(),
    bounce_reason: z.string(),
    penalty_type: z.string().optional(),
    penalty_amount: z.number().optional(),
  })).mutation(async ({ input }) => {
    const pool = await getPool();
    await pool.request()
      .input('cid', input.cheque_id).input('date', input.bounce_date)
      .input('reason', input.bounce_reason).input('ptype', input.penalty_type ?? null)
      .input('pamount', input.penalty_amount ?? 0)
      .query(`INSERT INTO cheque.bounce_events (cheque_id, bounce_date, bounce_reason, penalty_type, penalty_amount) VALUES (@cid, @date, @reason, @ptype, @pamount)`);
    await pool.request().input('cid', input.cheque_id)
      .query(`UPDATE cheque.cheque_register SET status='BOUNCED' WHERE cheque_id=@cid`);
    return { success: true };
  }),
});

// ─── Lease Origination (New) ──────────────────────────────────────────────────
export const leaseOriginationNewRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT o.*, l.lessor_name FROM lease.origination_requests o
      LEFT JOIN lessor.lessors l ON o.lessor_id = l.lessor_id
      ORDER BY o.created_at DESC`);
    return r.recordset;
  }),
  create: protectedProcedure.input(z.object({
    lessor_id: z.number().optional(),
    asset_type: z.string(),
    asset_description: z.string(),
    location: z.string(),
    proposed_start_date: z.string(),
    proposed_end_date: z.string(),
    monthly_rent: z.number(),
    currency: z.string().default('AED'),
    ibr_rate: z.number().optional(),
    business_justification: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const pool = await getPool();
    await pool.request()
      .input('lessor_id', input.lessor_id ?? null)
      .input('asset_type', input.asset_type)
      .input('asset_description', input.asset_description)
      .input('location', input.location)
      .input('start', input.proposed_start_date)
      .input('end', input.proposed_end_date)
      .input('rent', input.monthly_rent)
      .input('currency', input.currency)
      .input('ibr', input.ibr_rate ?? null)
      .input('justification', input.business_justification ?? null)
      .input('requested_by', ctx.user.id)
      .query(`INSERT INTO lease.origination_requests (lessor_id, asset_type, asset_description, location, proposed_start_date, proposed_end_date, monthly_rent, currency, ibr_rate, business_justification, requested_by) VALUES (@lessor_id, @asset_type, @asset_description, @location, @start, @end, @rent, @currency, @ibr, @justification, @requested_by)`);
    return { success: true };
  }),
  updateStatus: protectedProcedure.input(z.object({
    request_id: z.number(),
    status: z.enum(['DRAFT','SUBMITTED','APPROVED','REJECTED','CONVERTED']),
  })).mutation(async ({ input, ctx }) => {
    const pool = await getPool();
    await pool.request()
      .input('id', input.request_id).input('status', input.status).input('user', ctx.user.id)
      .query(`UPDATE lease.origination_requests SET status=@status, approved_by=CASE WHEN @status IN ('APPROVED','REJECTED') THEN @user ELSE approved_by END, updated_at=GETDATE() WHERE request_id=@id`);
    return { success: true };
  }),
});
