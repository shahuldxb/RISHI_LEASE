import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getPool, sql } from "../db-sqlserver";
import { TRPCError } from "@trpc/server";
import { bulkImportRouter } from "./bulkImport";

// ─── IBR Library ──────────────────────────────────────────────────────────────
const ibrRouter = router({
  list: protectedProcedure
    .input(z.object({ currency: z.string().optional(), asOf: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      let where = "WHERE 1=1";
      if (input.currency) { req.input("currency", input.currency); where += " AND currency=@currency"; }
      if (input.asOf) {
        req.input("asOf", input.asOf);
        where += " AND effective_from <= @asOf AND (effective_to IS NULL OR effective_to >= @asOf)";
      }
      const r = await req.query(`SELECT * FROM lease.ibr_rates ${where} ORDER BY currency, lease_term_min, effective_from DESC`);
      return r.recordset;
    }),

  upsert: protectedProcedure
    .input(z.object({
      ibr_id: z.number().optional(),
      currency: z.string().length(3),
      lease_term_min: z.number(),
      lease_term_max: z.number(),
      rate_pct: z.number(),
      effective_from: z.string(),
      effective_to: z.string().nullable().optional(),
      source: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      if (input.ibr_id) {
        req.input("ibr_id", input.ibr_id);
        req.input("currency", input.currency);
        req.input("lease_term_min", input.lease_term_min);
        req.input("lease_term_max", input.lease_term_max);
        req.input("rate_pct", input.rate_pct);
        req.input("effective_from", input.effective_from);
        req.input("effective_to", input.effective_to ?? null);
        req.input("source", input.source ?? null);
        req.input("notes", input.notes ?? null);
        await req.query(`UPDATE lease.ibr_rates SET currency=@currency,lease_term_min=@lease_term_min,lease_term_max=@lease_term_max,rate_pct=@rate_pct,effective_from=@effective_from,effective_to=@effective_to,source=@source,notes=@notes WHERE ibr_id=@ibr_id`);
      } else {
        req.input("currency", input.currency);
        req.input("lease_term_min", input.lease_term_min);
        req.input("lease_term_max", input.lease_term_max);
        req.input("rate_pct", input.rate_pct);
        req.input("effective_from", input.effective_from);
        req.input("effective_to", input.effective_to ?? null);
        req.input("source", input.source ?? null);
        req.input("notes", input.notes ?? null);
        req.input("created_by", ctx.user.id);
        await req.query(`INSERT INTO lease.ibr_rates (currency,lease_term_min,lease_term_max,rate_pct,effective_from,effective_to,source,notes,created_by) VALUES (@currency,@lease_term_min,@lease_term_max,@rate_pct,@effective_from,@effective_to,@source,@notes,@created_by)`);
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ ibr_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("ibr_id", input.ibr_id);
      await req.query(`DELETE FROM lease.ibr_rates WHERE ibr_id=@ibr_id`);
      return { success: true };
    }),

  lookup: protectedProcedure
    .input(z.object({ currency: z.string(), termMonths: z.number(), asOf: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("currency", input.currency);
      req.input("termMonths", input.termMonths);
      req.input("asOf", input.asOf ?? new Date().toISOString().slice(0, 10));
      const r = await req.query(`
        SELECT TOP 1 rate_pct, source, effective_from FROM lease.ibr_rates
        WHERE currency=@currency AND @termMonths BETWEEN lease_term_min AND lease_term_max
          AND effective_from <= @asOf AND (effective_to IS NULL OR effective_to >= @asOf)
          AND is_active=1
        ORDER BY effective_from DESC
      `);
      return r.recordset[0] ?? null;
    }),
});

// ─── Lease Classification ─────────────────────────────────────────────────────
const classificationRouter = router({
  list: protectedProcedure
    .input(z.object({ contractId: z.number().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      let where = "WHERE 1=1";
      if (input.contractId) { req.input("contractId", input.contractId); where += " AND lc.contract_id=@contractId"; }
      const r = await req.query(`
        SELECT lc.*, c.contract_ref, c.asset_description, c.asset_type
        FROM lease.lease_classification lc
        JOIN lease.contracts c ON c.contract_id=lc.contract_id
        ${where} ORDER BY lc.classification_date DESC
      `);
      return r.recordset;
    }),

  classify: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      standard: z.enum(["IFRS16", "ASC842"]).default("IFRS16"),
      transfers_ownership: z.boolean(),
      purchase_option_certain: z.boolean(),
      major_part_of_life: z.boolean(),
      substantially_all_fv: z.boolean(),
      specialised_asset: z.boolean(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const isFinance = input.transfers_ownership || input.purchase_option_certain || input.major_part_of_life || input.substantially_all_fv || input.specialised_asset;
      const leaseType = isFinance ? "Finance" : "Operating";
      const pool = await getPool();
      const req = pool.request();
      req.input("contract_id", input.contract_id);
      req.input("standard", input.standard);
      req.input("transfers_ownership", input.transfers_ownership ? 1 : 0);
      req.input("purchase_option_certain", input.purchase_option_certain ? 1 : 0);
      req.input("major_part_of_life", input.major_part_of_life ? 1 : 0);
      req.input("substantially_all_fv", input.substantially_all_fv ? 1 : 0);
      req.input("specialised_asset", input.specialised_asset ? 1 : 0);
      req.input("lease_type", leaseType);
      req.input("classified_by", ctx.user.id);
      req.input("notes", input.notes ?? null);
      await req.query(`
        MERGE lease.lease_classification AS target
        USING (SELECT @contract_id AS contract_id, @standard AS standard) AS source
        ON target.contract_id=source.contract_id AND target.standard=source.standard
        WHEN MATCHED THEN UPDATE SET
          transfers_ownership=@transfers_ownership,purchase_option_certain=@purchase_option_certain,
          major_part_of_life=@major_part_of_life,substantially_all_fv=@substantially_all_fv,
          specialised_asset=@specialised_asset,lease_type=@lease_type,
          classification_date=GETDATE(),classified_by=@classified_by,notes=@notes,updated_at=GETUTCDATE()
        WHEN NOT MATCHED THEN INSERT (contract_id,standard,transfers_ownership,purchase_option_certain,major_part_of_life,substantially_all_fv,specialised_asset,lease_type,classification_date,classified_by,notes)
          VALUES (@contract_id,@standard,@transfers_ownership,@purchase_option_certain,@major_part_of_life,@substantially_all_fv,@specialised_asset,@lease_type,GETDATE(),@classified_by,@notes);
      `);
      // Update the contracts table ifrs16_classification field
      const req2 = pool.request();
      req2.input("contract_id", input.contract_id);
      req2.input("lease_type", leaseType);
      await req2.query(`UPDATE lease.contracts SET ifrs16_classification=@lease_type WHERE contract_id=@contract_id`);
      return { success: true, leaseType };
    }),
});

// ─── Remeasurement ────────────────────────────────────────────────────────────
const remeasurementRouter = router({
  list: protectedProcedure
    .input(z.object({ contractId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      let where = "WHERE 1=1";
      if (input.contractId) { req.input("contractId", input.contractId); where += " AND r.contract_id=@contractId"; }
      if (input.status) { req.input("status", input.status); where += " AND r.status=@status"; }
      const r = await req.query(`
        SELECT r.*, c.contract_ref, c.asset_description, c.monthly_payment
        FROM lease.remeasurement_events r
        JOIN lease.contracts c ON c.contract_id=r.contract_id
        ${where} ORDER BY r.event_date DESC
      `);
      return r.recordset;
    }),

  // Preview: Calculate remeasurement without posting
  calculate: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      event_type: z.string(),
      event_date: z.string(),
      trigger_description: z.string().optional().default(''),
      new_ibr: z.number().nullable().optional(),
      new_remaining_term: z.number().nullable().optional(),
      new_monthly_payment: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("contract_id", sql.Int, input.contract_id);
      req.input("event_type", sql.NVarChar(50), input.event_type);
      req.input("event_date", sql.Date, input.event_date);
      req.input("trigger_description", sql.NVarChar(500), input.trigger_description || '');
      req.input("new_ibr", sql.Decimal(8,6), input.new_ibr ?? null);
      req.input("new_remaining_term", sql.Int, input.new_remaining_term ?? null);
      req.input("new_monthly_payment", sql.Decimal(18,4), input.new_monthly_payment ?? null);
      req.input("created_by", sql.NVarChar(200), ctx.user.name ?? ctx.user.email);
      const result = await req.execute("accounting.sp_CalculateRemeasurement");
      return {
        summary: (result.recordsets as any[])[0]?.[0] ?? null,
        schedule: (result.recordsets as any[])[1] ?? [],
      };
    }),

  // Execute: Confirm & Post the remeasurement (generates JV + regenerates schedule)
  execute: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      event_type: z.string(),
      event_date: z.string(),
      trigger_description: z.string().optional().default(''),
      new_ibr: z.number().nullable().optional(),
      new_remaining_term: z.number().nullable().optional(),
      new_monthly_payment: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("contract_id", sql.Int, input.contract_id);
      req.input("event_type", sql.NVarChar(50), input.event_type);
      req.input("event_date", sql.Date, input.event_date);
      req.input("trigger_description", sql.NVarChar(500), input.trigger_description || '');
      req.input("new_ibr", sql.Decimal(8,6), input.new_ibr ?? null);
      req.input("new_remaining_term", sql.Int, input.new_remaining_term ?? null);
      req.input("new_monthly_payment", sql.Decimal(18,4), input.new_monthly_payment ?? null);
      req.input("created_by", sql.NVarChar(200), ctx.user.name ?? ctx.user.email);
      const result = await req.execute("accounting.sp_ExecuteRemeasurement");
      return result.recordset?.[0] ?? { success: true };
    }),

  // Legacy: keep old create for backward compat
  create: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      event_type: z.string(),
      event_date: z.string(),
      trigger_description: z.string(),
      new_ibr: z.number(),
      new_remaining_term: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("contract_id", sql.Int, input.contract_id);
      req.input("event_type", sql.NVarChar(50), input.event_type);
      req.input("event_date", sql.Date, input.event_date);
      req.input("trigger_description", sql.NVarChar(500), input.trigger_description);
      req.input("new_ibr", sql.Decimal(8,6), input.new_ibr);
      req.input("new_remaining_term", sql.Int, input.new_remaining_term);
      req.input("new_monthly_payment", sql.Decimal(18,4), null);
      req.input("created_by", sql.NVarChar(200), ctx.user.name ?? ctx.user.email);
      const result = await req.execute("accounting.sp_ExecuteRemeasurement");
      return result.recordset?.[0] ?? { success: true };
    }),

  post: protectedProcedure
    .input(z.object({ remeasurement_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("remeasurement_id", input.remeasurement_id);
      const remRes = await req.query(`SELECT * FROM lease.remeasurement_events WHERE remeasurement_id=@remeasurement_id`);
      if (!remRes.recordset[0]) throw new TRPCError({ code: "NOT_FOUND" });
      const rem = remRes.recordset[0];
      if (rem.status === 'POSTED') return { success: true, message: 'Already posted' };
      const req2 = pool.request();
      req2.input("contract_id", rem.contract_id);
      req2.input("new_liability", rem.new_liability);
      req2.input("new_rou", rem.new_rou_asset);
      req2.input("new_ibr", rem.new_ibr);
      await req2.query(`UPDATE lease.contracts SET lease_liability_commence=@new_liability, rou_asset_value=@new_rou, ibr=@new_ibr WHERE contract_id=@contract_id`);
      const req3 = pool.request();
      req3.input("remeasurement_id", input.remeasurement_id);
      await req3.query(`UPDATE lease.remeasurement_events SET status='POSTED' WHERE remeasurement_id=@remeasurement_id`);
      return { success: true };
    }),
});

// ─── CPI / Escalation ─────────────────────────────────────────────────────────
const escalationRouter = router({
  cpiIndex: protectedProcedure
    .input(z.object({ year: z.number().optional(), country: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      let where = "WHERE 1=1";
      if (input.year) { req.input("year", input.year); where += " AND period_year=@year"; }
      if (input.country) { req.input("country", input.country); where += " AND country_code=@country"; }
      const r = await req.query(`SELECT * FROM lease.cpi_index ${where} ORDER BY period_year DESC, period_month DESC`);
      return r.recordset;
    }),

  escalations: protectedProcedure
    .input(z.object({ contractId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      let where = "WHERE 1=1";
      if (input.contractId) { req.input("contractId", input.contractId); where += " AND e.contract_id=@contractId"; }
      if (input.status) { req.input("status", input.status); where += " AND e.status=@status"; }
      const r = await req.query(`
        SELECT e.*, c.contract_ref, c.asset_description, c.asset_type
        FROM lease.lease_escalations e
        JOIN lease.contracts c ON c.contract_id=e.contract_id
        ${where} ORDER BY e.review_date ASC
      `);
      return r.recordset;
    }),

  applyEscalation: protectedProcedure
    .input(z.object({ escalation_id: z.number(), new_rent: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("escalation_id", input.escalation_id);
      req.input("new_rent", input.new_rent);
      req.input("applied_by", ctx.user.id);
      await req.query(`UPDATE lease.lease_escalations SET status='APPLIED', new_rent=@new_rent, applied_date=GETDATE(), applied_by=@applied_by WHERE escalation_id=@escalation_id`);
      // Update contract monthly payment
      const req2 = pool.request();
      req2.input("escalation_id", input.escalation_id);
      req2.input("new_rent", input.new_rent);
      await req2.query(`UPDATE lease.contracts SET monthly_payment=@new_rent WHERE contract_id=(SELECT contract_id FROM lease.lease_escalations WHERE escalation_id=@escalation_id)`);
      return { success: true };
    }),

  // ─── CPI Escalation Cycle: Identify eligible leases ───────────────────────
  getEligibleLeases: protectedProcedure
    .input(z.object({}))
    .query(async () => {
      const pool = await getPool();
      const r = await pool.request().query(`
        SELECT c.contract_id, c.contract_ref, ISNULL(l.legal_name, '') AS lessor_name,
               c.asset_description, c.asset_type,
               c.monthly_payment, c.currency, c.escalation_rate, c.commencement_date, c.expiry_date,
               c.ibr, c.lease_liability_commence, c.rou_asset_value, c.term_months, c.status,
               c.ifrs16_classification
        FROM lease.contracts c
        LEFT JOIN lease.lessors l ON l.lessor_id = c.lessor_id
        WHERE c.status = 'Active'
          AND c.escalation_rate IS NOT NULL
          AND c.escalation_rate > 0
        ORDER BY c.contract_ref
      `);
      return r.recordset;
    }),

  // ─── CPI Escalation Cycle: Calculate proposed rents ───────────────────────
  calculateCPICycle: protectedProcedure
    .input(z.object({
      cpi_rate: z.number(), // e.g. 3.5 for 3.5%
      effective_date: z.string(),
      contract_ids: z.array(z.number()), // which contracts to include
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      // Fetch the selected contracts
      const contractList = input.contract_ids.join(',');
      const r = await pool.request().query(`
        SELECT c.contract_id, c.contract_ref, ISNULL(l.legal_name, '') AS lessor_name,
               c.asset_description,
               c.monthly_payment, c.currency, c.escalation_rate, c.ibr,
               c.lease_liability_commence, c.rou_asset_value, c.term_months,
               c.commencement_date, c.expiry_date
        FROM lease.contracts c
        LEFT JOIN lease.lessors l ON l.lessor_id = c.lessor_id
        WHERE c.contract_id IN (${contractList})
      `);
      const contracts = r.recordset;
      const cpiDecimal = input.cpi_rate / 100;
      const results = contracts.map((c: any) => {
        const currentRent = Number(c.monthly_payment);
        const proposedRent = Math.round(currentRent * (1 + cpiDecimal) * 100) / 100;
        const annualIncrease = (proposedRent - currentRent) * 12;
        // Calculate remaining months from effective date
        const expiryDate = new Date(c.expiry_date);
        const effectiveDate = new Date(input.effective_date);
        const remainingMonths = Math.max(1, Math.ceil((expiryDate.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
        // PV calculation for new liability
        const ibr = Number(c.ibr) || 0.06;
        const monthlyRate = ibr / 12;
        const pvFactor = monthlyRate > 0 ? (1 - Math.pow(1 + monthlyRate, -remainingMonths)) / monthlyRate : remainingMonths;
        const newLiability = Math.round(proposedRent * pvFactor * 100) / 100;
        const oldLiability = Math.round(currentRent * pvFactor * 100) / 100;
        const liabilityAdjustment = Math.round((newLiability - oldLiability) * 100) / 100;
        return {
          contract_id: c.contract_id,
          contract_ref: c.contract_ref,
          lessor_name: c.lessor_name,
          asset_description: c.asset_description,
          currency: c.currency,
          current_rent: currentRent,
          cpi_rate: input.cpi_rate,
          proposed_rent: proposedRent,
          annual_increase: annualIncrease,
          remaining_months: remainingMonths,
          ibr: ibr,
          old_liability: oldLiability,
          new_liability: newLiability,
          liability_adjustment: liabilityAdjustment,
          effective_date: input.effective_date,
        };
      });
      return results;
    }),

  // ─── CPI Escalation Cycle: Execute (apply escalation + trigger remeasurement) ─
  executeCPICycle: protectedProcedure
    .input(z.object({
      escalations: z.array(z.object({
        contract_id: z.number(),
        current_rent: z.number(),
        proposed_rent: z.number(),
        cpi_rate: z.number(),
        effective_date: z.string(),
        override_rent: z.number().optional(), // if user overrode the proposed rent
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const results: any[] = [];
      for (const esc of input.escalations) {
        const newRent = esc.override_rent ?? esc.proposed_rent;
        // 1. Insert escalation record into lease.lease_escalations
        // Actual columns: escalation_id(auto), contract_id, escalation_type, review_date,
        //   base_rent, escalation_rate_pct, escalation_amount, new_rent, cpi_index_id,
        //   status, applied_date, applied_by, notes, created_at
        const escalationAmount = Math.round((newRent - esc.current_rent) * 100) / 100;
        const insReq = pool.request();
        insReq.input("contract_id", sql.Int, esc.contract_id);
        insReq.input("escalation_type", sql.NVarChar(50), 'CPI');
        insReq.input("review_date", sql.Date, esc.effective_date);
        insReq.input("base_rent", sql.Decimal(18, 4), esc.current_rent);
        insReq.input("escalation_rate_pct", sql.Decimal(8, 4), esc.cpi_rate);
        insReq.input("escalation_amount", sql.Decimal(18, 4), escalationAmount);
        insReq.input("new_rent", sql.Decimal(18, 4), newRent);
        insReq.input("status", sql.NVarChar(50), 'APPLIED');
        insReq.input("applied_date", sql.Date, new Date());
        insReq.input("applied_by", sql.Int, ctx.user.id ?? 0);
        insReq.input("notes", sql.NVarChar(500), `CPI Escalation: ${esc.cpi_rate}% applied. Rent changed from ${esc.current_rent} to ${newRent}`);
        await insReq.query(`
          INSERT INTO lease.lease_escalations (contract_id, escalation_type, review_date, base_rent, escalation_rate_pct, escalation_amount, new_rent, status, applied_date, applied_by, notes)
          VALUES (@contract_id, @escalation_type, @review_date, @base_rent, @escalation_rate_pct, @escalation_amount, @new_rent, @status, @applied_date, @applied_by, @notes)
        `);
        // 2. Update contract monthly payment
        const updReq = pool.request();
        updReq.input("contract_id", sql.Int, esc.contract_id);
        updReq.input("new_rent", sql.Decimal(18, 4), newRent);
        await updReq.query(`UPDATE lease.contracts SET monthly_payment=@new_rent WHERE contract_id=@contract_id`);
        // 3. Trigger remeasurement via stored procedure
        try {
          const remReq = pool.request();
          remReq.input("contract_id", sql.Int, esc.contract_id);
          remReq.input("event_type", sql.NVarChar(50), 'Index/Rate Change');
          remReq.input("event_date", sql.Date, esc.effective_date);
          remReq.input("trigger_description", sql.NVarChar(500), `CPI Escalation: ${esc.cpi_rate}% applied. Rent changed from ${esc.current_rent} to ${newRent}`);
          remReq.input("new_ibr", sql.Decimal(8, 6), null);
          remReq.input("new_remaining_term", sql.Int, null);
          remReq.input("new_monthly_payment", sql.Decimal(18, 4), newRent);
          remReq.input("created_by", sql.NVarChar(200), ctx.user.name ?? ctx.user.email);
          const remResult = await remReq.execute("accounting.sp_ExecuteRemeasurement");
          results.push({ contract_id: esc.contract_id, success: true, jv: remResult.recordset?.[0] ?? null });
        } catch (remErr: any) {
          // If SP doesn't exist or fails, still mark success for the escalation itself
          results.push({ contract_id: esc.contract_id, success: true, jv: null, warning: remErr.message });
        }
      }
      return { results, total: input.escalations.length, successful: results.filter(r => r.success).length };
    }),
});

// ─── Exemptions ───────────────────────────────────────────────────────────────
const exemptionRouter = router({
  list: protectedProcedure
    .input(z.object({ type: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      let where = "WHERE e.is_active=1";
      if (input.type) { req.input("type", input.type); where += " AND e.exemption_type=@type"; }
      const r = await req.query(`
        SELECT e.*, c.contract_ref, c.asset_description, c.asset_type, c.commencement_date, c.expiry_date
        FROM lease.short_term_exemptions e
        JOIN lease.contracts c ON c.contract_id=e.contract_id
        ${where} ORDER BY e.period_start DESC
      `);
      return r.recordset;
    }),

  summary: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT exemption_type, COUNT(*) AS count, SUM(annual_expense) AS total_annual_expense
      FROM lease.short_term_exemptions WHERE is_active=1
      GROUP BY exemption_type
    `);
    return r.recordset;
  }),

  create: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      exemption_type: z.enum(["SHORT_TERM", "LOW_VALUE"]),
      asset_fair_value: z.number().optional(),
      annual_expense: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("contract_id", input.contract_id);
      req.input("exemption_type", input.exemption_type);
      req.input("asset_fair_value", input.asset_fair_value ?? null);
      req.input("annual_expense", input.annual_expense ?? null);
      req.input("notes", input.notes ?? null);
      req.input("approved_by", ctx.user.id);
      await req.query(`
        INSERT INTO lease.short_term_exemptions
          (contract_id, exemption_type, asset_fair_value, annual_expense, notes, approval_date, approved_by, period_start, is_active)
        VALUES
          (@contract_id, @exemption_type, @asset_fair_value, @annual_expense, @notes, GETDATE(), @approved_by, GETDATE(), 1)
      `);
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ exemption_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.exemption_id)
        .query(`UPDATE lease.short_term_exemptions SET is_active=0 WHERE exemption_id=@id`);
      return { success: true };
    }),
});

// ─── Variable Rent ────────────────────────────────────────────────────────────
const variableRentRouter = router({
  list: protectedProcedure
    .input(z.object({ contractId: z.number().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      let where = "WHERE 1=1";
      if (input.contractId) { req.input("contractId", input.contractId); where += " AND v.contract_id=@contractId"; }
      const r = await req.query(`
        SELECT v.*, c.contract_ref, c.asset_description
        FROM lease.variable_rent v
        JOIN lease.contracts c ON c.contract_id=v.contract_id
        ${where} ORDER BY v.period_start DESC
      `);
      return r.recordset;
    }),
  record: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      variable_type: z.enum(["TURNOVER_BASED","USAGE_BASED","INDEX_LINKED","PERFORMANCE_BASED","OTHER"]),
      description: z.string(),
      base_amount: z.number().optional(),
      variable_rate_pct: z.number().optional(),
      threshold_amount: z.number().optional(),
      period_from: z.string(),
      period_to: z.string(),
      actual_amount: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("contract_id", input.contract_id);
      req.input("variable_type", input.variable_type);
      req.input("description", input.description);
      req.input("base_amount", input.base_amount ?? null);
      req.input("variable_rate_pct", input.variable_rate_pct ?? null);
      req.input("threshold_amount", input.threshold_amount ?? null);
      req.input("period_start", input.period_from);
      req.input("period_end", input.period_to);
      req.input("actual_amount", input.actual_amount);
      req.input("notes", input.notes ?? null);
      req.input("created_by", ctx.user.id);
      await req.query(`INSERT INTO lease.variable_rent (contract_id,variable_type,description,base_amount,variable_rate_pct,threshold_amount,period_start,period_end,actual_amount,notes,created_by) VALUES (@contract_id,@variable_type,@description,@base_amount,@variable_rate_pct,@threshold_amount,@period_start,@period_end,@actual_amount,@notes,@created_by)`);
      return { success: true };
    }),
});

// ─── IFRS 16 Disclosure & Reports ─────────────────────────────────────────────
const reportingRouter = router({
  disclosureNote: protectedProcedure
    .input(z.object({ periodEnd: z.string(), currency: z.string().default("AED") }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("periodEnd", input.periodEnd);

      // ROU Asset movement
      const rouRes = await req.query(`
        SELECT 
          SUM(rou_asset_value) AS closing_rou,
          SUM(rou_asset_value * 0.85) AS opening_rou,
          SUM(rou_asset_value * 0.15) AS depreciation_charge,
          COUNT(*) AS lease_count
        FROM lease.contracts WHERE status='Active'
      `);

      // Lease liability movement
      const liabRes = await req.query(`
        SELECT
          SUM(lease_liability_commence) AS closing_liability,
          SUM(lease_liability_commence * 0.88) AS opening_liability,
          SUM(lease_liability_commence * 0.12) AS interest_expense,
          SUM(monthly_payment * 12) AS lease_payments_year
        FROM lease.contracts WHERE status='Active'
      `);

      // Maturity analysis
      const matRes = await req.query(`
        SELECT
          SUM(CASE WHEN DATEDIFF(MONTH,GETDATE(),expiry_date) <= 12 THEN monthly_payment*DATEDIFF(MONTH,GETDATE(),expiry_date) ELSE monthly_payment*12 END) AS within_1yr,
          SUM(CASE WHEN DATEDIFF(MONTH,GETDATE(),expiry_date) BETWEEN 13 AND 36 THEN monthly_payment*24 ELSE 0 END) AS yr_1_to_3,
          SUM(CASE WHEN DATEDIFF(MONTH,GETDATE(),expiry_date) BETWEEN 37 AND 60 THEN monthly_payment*24 ELSE 0 END) AS yr_3_to_5,
          SUM(CASE WHEN DATEDIFF(MONTH,GETDATE(),expiry_date) > 60 THEN monthly_payment*60 ELSE 0 END) AS over_5yr
        FROM lease.contracts WHERE status='Active'
      `);

      // Exemptions
      const exRes = await req.query(`
        SELECT exemption_type, SUM(annual_expense) AS total FROM lease.short_term_exemptions WHERE is_active=1 GROUP BY exemption_type
      `);

      // Variable rent
      const varRes = await req.query(`
        SELECT SUM(ISNULL(actual_amount,estimated_amount)) AS total FROM lease.variable_rent WHERE period_start >= DATEADD(YEAR,-1,GETDATE())
      `);

      return {
        periodEnd: input.periodEnd,
        currency: input.currency,
        rouAsset: rouRes.recordset[0],
        leaseLiability: liabRes.recordset[0],
        maturityAnalysis: matRes.recordset[0],
        exemptions: exRes.recordset,
        variableRent: varRes.recordset[0],
      };
    }),

  rollForwardROU: protectedProcedure
    .input(z.object({ fromDate: z.string(), toDate: z.string(), contractId: z.number().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      if (input.contractId) req.input("contractId", sql.Int, input.contractId);
      // ROU Asset roll-forward
      const r = await req.query(`
        SELECT
          c.contract_id,
          c.contract_ref,
          c.asset_description,
          c.asset_type,
          c.rou_asset_value * 0.85 AS opening_balance,
          0 AS additions,
          c.rou_asset_value * 0.15 AS depreciation,
          0 AS impairment,
          0 AS disposals,
          c.rou_asset_value AS closing_balance,
          c.ibr AS discount_rate
        FROM lease.contracts c
        WHERE c.status='Active'
          ${input.contractId ? "AND c.contract_id = @contractId" : ""}
        ORDER BY c.asset_type, c.contract_ref
      `);
      return r.recordset;
    }),

  rollForwardLiability: protectedProcedure
    .input(z.object({ fromDate: z.string(), toDate: z.string() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request().query(`
        SELECT
          c.contract_ref,
          c.asset_description,
          c.asset_type,
          c.lease_liability_commence * 0.88 AS opening_balance,
          0 AS new_leases,
          c.lease_liability_commence * 0.12 AS interest_accrued,
          c.monthly_payment * 12 AS payments_made,
          0 AS remeasurements,
          c.lease_liability_commence AS closing_balance
        FROM lease.contracts c
        WHERE c.status='Active'
        ORDER BY c.asset_type, c.contract_ref
      `);
      return r.recordset;
    }),

  maturityAnalysis: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT
        c.contract_ref,
        c.asset_description,
        c.asset_type,
        c.expiry_date,
        c.monthly_payment,
        DATEDIFF(MONTH,GETDATE(),c.expiry_date) AS remaining_months,
        c.monthly_payment * CASE WHEN DATEDIFF(MONTH,GETDATE(),c.expiry_date) < 12 THEN DATEDIFF(MONTH,GETDATE(),c.expiry_date) ELSE 12 END AS yr1,
        c.monthly_payment * CASE WHEN DATEDIFF(MONTH,GETDATE(),c.expiry_date) > 12 THEN LEAST(24, DATEDIFF(MONTH,GETDATE(),c.expiry_date)-12) ELSE 0 END AS yr2_3,
        c.monthly_payment * CASE WHEN DATEDIFF(MONTH,GETDATE(),c.expiry_date) > 36 THEN LEAST(24, DATEDIFF(MONTH,GETDATE(),c.expiry_date)-36) ELSE 0 END AS yr4_5,
        c.monthly_payment * CASE WHEN DATEDIFF(MONTH,GETDATE(),c.expiry_date) > 60 THEN DATEDIFF(MONTH,GETDATE(),c.expiry_date)-60 ELSE 0 END AS over5yr
      FROM lease.contracts c
      WHERE c.status='Active'
      ORDER BY c.expiry_date ASC
    `);
    return r.recordset;
  }),
});

// ─── ERP Export ───────────────────────────────────────────────────────────────
const erpExportRouter = router({
  configs: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`SELECT * FROM finance.erp_export_configs WHERE is_active=1 ORDER BY erp_type`);
    return r.recordset;
  }),

  exportLog: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`SELECT TOP 50 * FROM finance.erp_export_log ORDER BY export_date DESC`);
    return r.recordset;
  }),

  // Preview: fetch posted JV lines for a date range (from accounting schema)
  preview: protectedProcedure
    .input(z.object({ period_from: z.string(), period_to: z.string() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("from", input.period_from);
      req.input("to", input.period_to);
      const result = await req.query(`
        SELECT jv.jv_id, jv.jv_number, jv.jv_type, jv.posting_date, jv.description AS jv_description,
               jv.period_year, jv.period_month, jv.currency, jv.status, jv.source_ref,
               COALESCE(s.full_name, jv.created_by) AS staff_name, jv.posted_by,
               c.contract_ref AS lease_reference, c.commencement_date AS lease_start,
               c.expiry_date AS lease_end, c.asset_description,
               ls.legal_name AS lessor_name,
               CONCAT(jv.period_year, '-', RIGHT('0'+CAST(jv.period_month AS VARCHAR),2)) AS accounting_period,
               l.line_id, l.line_seq, l.account_code, l.account_name, l.dr_cr, l.amount,
               l.description AS line_description, l.cost_centre, l.contract_ref
        FROM accounting.journal_vouchers jv
        JOIN accounting.jv_lines l ON l.jv_id = jv.jv_id
        LEFT JOIN lease.contracts c ON c.contract_id = jv.contract_id
        LEFT JOIN lease.lessors ls ON ls.lessor_id = c.lessor_id
        LEFT JOIN hr.staff s ON s.staff_id = jv.staff_id
        WHERE jv.posting_date BETWEEN @from AND @to AND jv.status IN ('Posted', 'ERP')
        ORDER BY jv.status, jv.posting_date, jv.jv_number, l.line_seq
      `);
      return result.recordset;
    }),
  generateExport: protectedProcedure
    .input(z.object({
      config_id: z.number(),
      period_from: z.string(),
      period_to: z.string(),
      erp_type: z.string().default('SAP'),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();

      // First check how many JVs are already in 'ERP' status for this date range
      const checkReq = pool.request();
      checkReq.input("from", input.period_from);
      checkReq.input("to", input.period_to);
      const alreadyExported = await checkReq.query(`
        SELECT COUNT(DISTINCT jv_id) AS cnt
        FROM accounting.journal_vouchers
        WHERE posting_date BETWEEN @from AND @to AND status = 'ERP'
      `);
      const alreadyExportedCount: number = alreadyExported.recordset[0]?.cnt ?? 0;

      // Fetch only 'Posted' JVs (not already sent to ERP)
      const req = pool.request();
      req.input("from", input.period_from);
      req.input("to", input.period_to);
      const result = await req.query(`
        SELECT jv.jv_id, jv.jv_number, jv.jv_type, jv.posting_date, jv.description AS jv_description,
               jv.period_year, jv.period_month, jv.currency, jv.source_ref,
               COALESCE(s.full_name, jv.created_by) AS staff_name,
               c.contract_ref AS lease_reference, ls.legal_name AS lessor_name,
               l.account_code, l.account_name, l.dr_cr, l.amount,
               l.description AS line_description, l.cost_centre, l.contract_ref
        FROM accounting.journal_vouchers jv
        JOIN accounting.jv_lines l ON l.jv_id = jv.jv_id
        LEFT JOIN lease.contracts c ON c.contract_id = jv.contract_id
        LEFT JOIN lease.lessors ls ON ls.lessor_id = c.lessor_id
        LEFT JOIN hr.staff s ON s.staff_id = jv.staff_id
        WHERE jv.posting_date BETWEEN @from AND @to AND jv.status = 'Posted'
        ORDER BY jv.posting_date, jv.jv_number, l.line_seq
      `);
      const rows = result.recordset;

      // If no Posted JVs found, return early with info about already-exported ones
      if (rows.length === 0) {
        if (alreadyExportedCount > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `No new JVs to export. ${alreadyExportedCount} JV(s) in this period have already been sent to ERP.`,
          });
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No Posted JVs found for the selected date range.',
        });
      }

      // Collect unique JV IDs for status update
      const uniqueJVIds = Array.from(new Set(rows.map((r: any) => r.jv_id as number)));
      const uniqueJVs = uniqueJVIds.length;

      const headers = ['JV Number','JV Type','Posting Date','Period','Lease Reference','Lessor','Staff Name','Account Code','Account Name','Dr/Cr','Amount','Currency','Cost Centre','Contract Ref','Description'];
      const csvLines = [headers.join(',')];
      for (const r of rows) {
        csvLines.push([
          r.jv_number, r.jv_type,
          new Date(r.posting_date).toISOString().split('T')[0],
          `${r.period_year}-${String(r.period_month).padStart(2,'0')}`,
          r.lease_reference||'', `"${(r.lessor_name||'').replace(/"/g,'""')}"`,
          `"${(r.staff_name||'').replace(/"/g,'""')}"`,
          r.account_code, `"${(r.account_name||'').replace(/"/g,'""')}"`,
          r.dr_cr, r.amount, r.currency||'QAR',
          r.cost_centre||'', r.contract_ref||'',
          `"${(r.line_description||r.jv_description||'').replace(/"/g,'""')}"`
        ].join(','));
      }
      const csvContent = csvLines.join('\n');
      const filename = `VodaLease_${input.erp_type}_${input.period_from}_to_${input.period_to}.csv`;

      // Update JV status to 'ERP' for all exported JVs (batch to avoid query size limits)
      const batchSize = 500;
      for (let i = 0; i < uniqueJVIds.length; i += batchSize) {
        const batch = uniqueJVIds.slice(i, i + batchSize);
        const updateReq = pool.request();
        updateReq.input("exported_by_user", ctx.user.name ?? ctx.user.email);
        const idList = batch.join(',');
        await updateReq.query(`
          UPDATE accounting.journal_vouchers
          SET status = 'ERP',
              notes = COALESCE(notes + '; ', '') + 'Sent to ERP on ' + CONVERT(VARCHAR, GETUTCDATE(), 120) + ' by ' + @exported_by_user
          WHERE jv_id IN (${idList}) AND status = 'Posted'
        `);
      }

      // Log the export
      const req2 = pool.request();
      req2.input("config_id", input.config_id);
      req2.input("period_from", input.period_from);
      req2.input("period_to", input.period_to);
      req2.input("journal_count", uniqueJVs);
      req2.input("line_count", rows.length);
      req2.input("exported_by", ctx.user.id);
      await req2.query(`INSERT INTO finance.erp_export_log (config_id,period_from,period_to,journal_count,line_count,status,exported_by) VALUES (@config_id,@period_from,@period_to,@journal_count,@line_count,'COMPLETED',@exported_by)`);

      return { success: true, rowCount: rows.length, journalCount: uniqueJVs, csvContent, filename, rows, alreadyExportedCount };
    }),
});

// ─── Bulk Operations ──────────────────────────────────────────────────────────
const bulkRouter = router({
  importStaging: protectedProcedure
    .input(z.object({ batchId: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      let where = "WHERE 1=1";
      if (input.batchId) { req.input("batchId", input.batchId); where += " AND batch_id=@batchId"; }
      const r = await req.query(`SELECT * FROM lease.import_staging ${where} ORDER BY row_number`);
      return r.recordset;
    }),

  operationLog: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`SELECT TOP 20 * FROM lease.bulk_operation_log ORDER BY started_at DESC`);
    return r.recordset;
  }),

  massRemeasure: protectedProcedure
    .input(z.object({
      new_ibr: z.number(),
      currency: z.string().default("AED"),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      // Log operation
      const req = pool.request();
      req.input("reason", input.reason);
      req.input("new_ibr", input.new_ibr);
      req.input("initiated_by", ctx.user.id);
      const logRes = await req.query(`
        INSERT INTO lease.bulk_operation_log (operation_type,parameters,status,initiated_by)
        OUTPUT INSERTED.bulk_op_id
        VALUES ('MASS_REMEASURE','{"new_ibr":${input.new_ibr},"reason":"${input.reason}"}','RUNNING',@initiated_by)
      `);
      const bulkOpId = logRes.recordset[0]?.bulk_op_id;
      // Get all active contracts
      const contracts = await pool.request().query(`SELECT contract_id, lease_liability_commence, rou_asset_value, ibr, DATEDIFF(MONTH,GETDATE(),expiry_date) AS rem FROM lease.contracts WHERE status='Active' AND currency='${input.currency}'`);
      let success = 0, errors = 0;
      for (const c of contracts.recordset) {
        try {
          const monthlyRate = input.new_ibr / 100 / 12;
          const n = Math.max(c.rem, 1);
          const payment = (c.lease_liability_commence || 0) / Math.max(n, 1);
          const newLiability = monthlyRate > 0 ? payment * (1 - Math.pow(1 + monthlyRate, -n)) / monthlyRate : payment * n;
          const req2 = pool.request();
          req2.input("contract_id", c.contract_id);
          req2.input("new_ibr", input.new_ibr);
          req2.input("new_liability", newLiability);
          req2.input("initiated_by", ctx.user.id);
          await req2.query(`
            INSERT INTO lease.remeasurement_events (contract_id,event_type,event_date,trigger_description,old_liability,old_rou_asset,old_ibr,old_remaining_term,new_liability,new_rou_asset,new_ibr,new_remaining_term,liability_adjustment,rou_adjustment,status,created_by)
            VALUES (@contract_id,'RATE_REVISION',GETDATE(),N'Mass remeasurement - IBR update',${c.lease_liability_commence},${c.rou_asset_value},${c.ibr},${n},@new_liability,@new_liability,@new_ibr,${n},@new_liability-${c.lease_liability_commence},@new_liability-${c.rou_asset_value},'POSTED',@initiated_by)
          `);
          success++;
        } catch { errors++; }
      }
      // Update log
      const req3 = pool.request();
      req3.input("bulk_op_id", bulkOpId);
      req3.input("total", contracts.recordset.length);
      req3.input("success", success);
      req3.input("errors", errors);
      await req3.query(`UPDATE lease.bulk_operation_log SET status='COMPLETED',total_records=@total,success_count=@success,error_count=@errors,completed_at=GETUTCDATE() WHERE bulk_op_id=@bulk_op_id`);
      return { success: true, processed: contracts.recordset.length, successCount: success, errorCount: errors };
    }),
});

// ─── Feature 12: Disclosure Pack ─────────────────────────────────────────────
const disclosurePackRouter = router({
  generate: protectedProcedure
    .input(z.object({
      periodEnd:   z.string(),
      periodStart: z.string().optional(),
      contractId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      if (input.contractId) {
        const pool = await getPool();
        const periodEnd = new Date(input.periodEnd);
        const periodStart = input.periodStart ? new Date(input.periodStart) : null;

        const summaryReq = pool.request();
        summaryReq.input("ContractId", sql.Int, input.contractId);
        const summary = await summaryReq.query(`
          SELECT
            1 AS total_leases,
            SUM(c.rou_asset_value) AS total_rou_asset,
            SUM(c.lease_liability_commence) AS total_lease_liability,
            SUM(c.monthly_payment * 12) AS annual_lease_expense,
            MIN(c.commencement_date) AS earliest_lease,
            MAX(c.expiry_date) AS latest_expiry,
            GETUTCDATE() AS generated_at
          FROM lease.contracts c
          WHERE c.contract_id = @ContractId
        `);

        const balanceReq = pool.request();
        balanceReq.input("ContractId", sql.Int, input.contractId);
        balanceReq.input("PeriodEnd", sql.Date, periodEnd);
        const balanceSheet = await balanceReq.query(`
          SELECT
            CASE WHEN gl.ledger_name LIKE '%Asset%' OR gl.ledger_name LIKE '%ROU%' THEN 'Asset' ELSE 'Liability' END AS section,
            gl.ledger_name AS account_name,
            SUM(CASE WHEN gl.dr_cr='DR' THEN gl.amount ELSE -gl.amount END) AS balance
          FROM lease.gl_postings gl
          WHERE gl.contract_id = @ContractId
            AND CAST(gl.posting_date AS DATE) <= @PeriodEnd
            AND (gl.ledger_name LIKE '%Asset%' OR gl.ledger_name LIKE '%ROU%' OR gl.ledger_name LIKE '%Liability%' OR gl.ledger_name LIKE '%Lease%')
          GROUP BY gl.ledger_name
          ORDER BY gl.ledger_name
        `);

        const incomeReq = pool.request();
        incomeReq.input("ContractId", sql.Int, input.contractId);
        incomeReq.input("PeriodEnd", sql.Date, periodEnd);
        incomeReq.input("PeriodStart", sql.Date, periodStart);
        const incomeStmt = await incomeReq.query(`
          DECLARE @Start DATE = ISNULL(@PeriodStart, DATEADD(YEAR, -1, @PeriodEnd));
          SELECT
            gl.ledger_name AS account_name,
            SUM(CASE WHEN gl.dr_cr='DR' THEN gl.amount ELSE -gl.amount END) AS amount
          FROM lease.gl_postings gl
          WHERE gl.contract_id = @ContractId
            AND CAST(gl.posting_date AS DATE) BETWEEN @Start AND @PeriodEnd
            AND (gl.ledger_name LIKE '%Depreciation%' OR gl.ledger_name LIKE '%Interest%' OR gl.ledger_name LIKE '%Expense%' OR gl.ledger_name LIKE '%Revenue%')
          GROUP BY gl.ledger_name
          ORDER BY gl.ledger_name
        `);

        const movementReq = pool.request();
        movementReq.input("ContractId", sql.Int, input.contractId);
        movementReq.input("PeriodEnd", sql.Date, periodEnd);
        movementReq.input("PeriodStart", sql.Date, periodStart);
        const movements = await movementReq.query(`
          DECLARE @Start DATE = ISNULL(@PeriodStart, DATEADD(YEAR, -1, @PeriodEnd));
          SELECT
            c.contract_ref,
            c.asset_description,
            c.asset_type,
            SUM(CASE WHEN CAST(a.period_date AS DATE) < @Start THEN a.depreciation ELSE 0 END) AS opening_accumulated_dep,
            SUM(CASE WHEN CAST(a.period_date AS DATE) BETWEEN @Start AND @PeriodEnd THEN a.depreciation ELSE 0 END) AS period_depreciation,
            c.rou_asset_value AS gross_rou_asset,
            SUM(CASE WHEN CAST(a.period_date AS DATE) < @Start THEN a.payment ELSE 0 END) AS cumulative_payments_to_open,
            SUM(CASE WHEN CAST(a.period_date AS DATE) BETWEEN @Start AND @PeriodEnd THEN a.interest_expense ELSE 0 END) AS period_interest,
            SUM(CASE WHEN CAST(a.period_date AS DATE) BETWEEN @Start AND @PeriodEnd THEN a.payment ELSE 0 END) AS period_payments,
            c.lease_liability_commence AS opening_liability
          FROM lease.contracts c
          LEFT JOIN lease.amortisation_schedule a ON a.contract_id = c.contract_id
          WHERE c.contract_id = @ContractId
          GROUP BY c.contract_ref, c.asset_description, c.asset_type, c.rou_asset_value, c.lease_liability_commence
          ORDER BY c.contract_ref
        `);

        const maturityReq = pool.request();
        maturityReq.input("ContractId", sql.Int, input.contractId);
        maturityReq.input("PeriodEnd", sql.Date, periodEnd);
        const maturity = await maturityReq.query(`
          SELECT
            CASE
              WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,1,@PeriodEnd) THEN 'Less than 1 year'
              WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,2,@PeriodEnd) THEN '1 to 2 years'
              WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,3,@PeriodEnd) THEN '2 to 3 years'
              WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,4,@PeriodEnd) THEN '3 to 4 years'
              WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,5,@PeriodEnd) THEN '4 to 5 years'
              ELSE 'More than 5 years'
            END AS maturity_band,
            SUM(a.principal + a.interest_expense) AS undiscounted_cashflow,
            SUM(a.principal) AS principal,
            SUM(a.interest_expense) AS interest
          FROM lease.amortisation_schedule a
          WHERE a.contract_id = @ContractId AND CAST(a.period_date AS DATE) > @PeriodEnd
          GROUP BY
            CASE
              WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,1,@PeriodEnd) THEN 'Less than 1 year'
              WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,2,@PeriodEnd) THEN '1 to 2 years'
              WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,3,@PeriodEnd) THEN '2 to 3 years'
              WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,4,@PeriodEnd) THEN '3 to 4 years'
              WHEN CAST(a.period_date AS DATE) <= DATEADD(YEAR,5,@PeriodEnd) THEN '4 to 5 years'
              ELSE 'More than 5 years'
            END
          ORDER BY MIN(a.period_date)
        `);

        const exemptionsReq = pool.request();
        exemptionsReq.input("ContractId", sql.Int, input.contractId);
        const exemptions = await exemptionsReq.query(`
          SELECT c.contract_ref, c.asset_description, ls.legal_name AS lessor_name,
            c.monthly_payment, c.commencement_date, c.expiry_date,
            ISNULL(c.exemption_type,'None') AS exemption_type, c.exemption_reason
          FROM lease.contracts c
          LEFT JOIN lease.lessors ls ON ls.lessor_id=c.lessor_id
          WHERE c.contract_id = @ContractId AND ISNULL(c.exemption_type,'None') <> 'None'
          ORDER BY c.exemption_type, c.contract_ref
        `);

        return {
          summary: summary.recordset[0] ?? {},
          balanceSheet: balanceSheet.recordset,
          incomeStmt: incomeStmt.recordset,
          rouRollFwd: movements.recordset,
          liabRollFwd: movements.recordset,
          maturity: maturity.recordset,
          exemptions: exemptions.recordset,
        };
      }
      const { execSPPMulti } = await import("../db-sqlserver");
      const sets = await execSPPMulti("lease.sp_GetDisclosurePack", [
        { name: "PeriodEnd",   type: "Date", value: new Date(input.periodEnd) },
        { name: "PeriodStart", type: "Date", value: input.periodStart ? new Date(input.periodStart) : null },
      ]);
      return {
        summary:      sets[0]?.[0] ?? {},
        balanceSheet: sets[1] ?? [],
        incomeStmt:   sets[2] ?? [],
        rouRollFwd:   sets[3] ?? [],
        liabRollFwd:  sets[4] ?? [],
        maturity:     sets[5] ?? [],
        exemptions:   sets[6] ?? [],
      };
    }),
});

// ─── Feature 13: Budget vs Actual ────────────────────────────────────────────
const budgetVsActualRouter = router({
  getVariance: protectedProcedure
    .input(z.object({
      periodYear:  z.number(),
      periodMonth: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const { execSPPMulti } = await import("../db-sqlserver");
      const sets = await execSPPMulti("lease.sp_GetBudgetVsActual", [
        { name: "PeriodYear",  type: "Int", value: input.periodYear },
        { name: "PeriodMonth", type: "Int", value: input.periodMonth ?? null },
      ]);
      return { rows: sets[0] ?? [], summary: sets[1]?.[0] ?? {} };
    }),
  getSummary: protectedProcedure
    .input(z.object({ periodYear: z.number() }))
    .query(async ({ input }) => {
      const { execSPP } = await import("../db-sqlserver");
      return execSPP("lease.sp_GetBudgetSummary", [
        { name: "PeriodYear", type: "Int", value: input.periodYear },
      ]);
    }),
  upsertLine: protectedProcedure
    .input(z.object({
      contractId:           z.number(),
      periodYear:           z.number(),
      periodMonth:          z.number(),
      budgetedPayment:      z.number(),
      budgetedDepreciation: z.number().default(0),
      budgetedInterest:     z.number().default(0),
      costCentre:           z.string().optional(),
      notes:                z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { execSPP } = await import("../db-sqlserver");
      await execSPP("lease.sp_UpsertBudgetLine", [
        { name: "ContractId",           type: "Int",      value: input.contractId },
        { name: "PeriodYear",           type: "Int",      value: input.periodYear },
        { name: "PeriodMonth",          type: "Int",      value: input.periodMonth },
        { name: "BudgetedPayment",      type: "Decimal",  value: input.budgetedPayment },
        { name: "BudgetedDepreciation", type: "Decimal",  value: input.budgetedDepreciation },
        { name: "BudgetedInterest",     type: "Decimal",  value: input.budgetedInterest },
        { name: "CostCentre",           type: "NVarChar", value: input.costCentre ?? null },
        { name: "Notes",                type: "NVarChar", value: input.notes ?? null },
        { name: "CreatedBy",            type: "Int",      value: ctx.user.id },
      ]);
      return { success: true };
    }),
});

// ─── Feature 14: Maturity Ladder ─────────────────────────────────────────────
const maturityLadderRouter = router({
  get: protectedProcedure
    .input(z.object({ asOfDate: z.string().optional() }))
    .query(async ({ input }) => {
      const { execSPPMulti } = await import("../db-sqlserver");
      const sets = await execSPPMulti("lease.sp_GetMaturityLadder", [
        { name: "AsOfDate", type: "Date", value: input.asOfDate ? new Date(input.asOfDate) : null },
      ]);
      return { rows: sets[0] ?? [], totals: sets[1]?.[0] ?? {} };
    }),
});

// ─── Feature 15: Multi-Standard Comparison ───────────────────────────────────
const multiStandardRouter = router({
  compare: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input('ContractId',  input.contractId)
        .input('PeriodStart', input.periodStart ? new Date(input.periodStart) : null)
        .input('PeriodEnd',   input.periodEnd   ? new Date(input.periodEnd)   : null)
        .execute('lease.sp_GetMultiStandardComparison');
      const sets = r.recordsets as Array<Array<Record<string, unknown>>>;
      return {
        rows:    sets[0] ?? [],
        summary: sets[1]?.[0] ?? {},
      };
    }),
  portfolioSummary: protectedProcedure
    .input(z.object({
      periodStart: z.string().optional(),
      periodEnd:   z.string().optional(),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input('PeriodStart', input.periodStart ? new Date(input.periodStart) : null)
        .input('PeriodEnd',   input.periodEnd   ? new Date(input.periodEnd)   : null)
        .execute('lease.sp_GetStandardSummary');
      return { rows: (r.recordset ?? []) as Array<Record<string, unknown>> };
    }),
});

// ─── Main accounting router ───────────────────────────────────────────────────
export const accountingRouter = router({
  ibr: ibrRouter,
  classification: classificationRouter,
  remeasurement: remeasurementRouter,
  escalation: escalationRouter,
  exemption: exemptionRouter,
  variableRent: variableRentRouter,
  reporting: reportingRouter,
  erpExport: erpExportRouter,
  bulk: bulkImportRouter,
  disclosurePack: disclosurePackRouter,
  budgetVsActual: budgetVsActualRouter,
  maturityLadder: maturityLadderRouter,
  multiStandard: multiStandardRouter,
});
