import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getPool } from "../db-sqlserver";

// ─── Transaction Engine Router ────────────────────────────────────────────────
// Runs test scenarios for each IFRS 16 accounting function, posts JV entries,
// and returns results for the step-through UI.
export const transactionEngineRouter = router({

  // ── List all scenarios (optionally filtered by function type) ─────────────
  listScenarios: protectedProcedure
    .input(z.object({ function_type: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("function_type", input.function_type ?? null);
      const result = await req.execute("accounting.sp_ListTxnScenarios");
      return (result.recordset as any[]) ?? [];
    }),

  // ── Get JV lines for a specific JV ───────────────────────────────────────
  getJVLines: protectedProcedure
    .input(z.object({ jv_id: z.number().int() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("jv_id", input.jv_id);
      const result = await req.execute("accounting.sp_GetJournalVoucher");
      const rs = result.recordsets as any[][];
      return { jv: rs?.[0]?.[0] ?? null, lines: rs?.[1] ?? [] };
    }),

  // ── Get contracts for dropdown ────────────────────────────────────────────
  getContracts: protectedProcedure
    .query(async () => {
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT TOP 50
          c.contract_id,
          c.contract_ref,
          c.asset_type,
          c.asset_description,
          c.monthly_payment,
          c.currency,
          c.ibr,
          c.term_months,
          c.rou_asset_value,
          c.lease_liability_commence,
          c.commencement_date,
          c.expiry_date,
          c.status,
          l.legal_name AS lessor_name
        FROM lease.contracts c
        LEFT JOIN lease.lessors l ON l.lessor_id = c.lessor_id
        WHERE c.status IN ('Active','Draft','Pending')
        ORDER BY c.contract_id
      `);
      return (result.recordset as any[]) ?? [];
    }),

  // ── Run: Initial Recognition ──────────────────────────────────────────────
  runInitialRecognition: protectedProcedure
    .input(z.object({ contract_id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      try {
        const req = pool.request();
        req.input("contract_id", input.contract_id);
        req.input("created_by", ctx.user.name ?? ctx.user.email);
        const result = await req.execute("accounting.sp_TxnInitialRecognition");
        const row = (result.recordset as any[])?.[0] ?? {};

        // Save scenario
        const saveReq = pool.request();
        saveReq.input("function_type", "INITIAL_RECOGNITION");
        saveReq.input("scenario_name", `Initial Recognition — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify({ contract_id: input.contract_id }));
        saveReq.input("result_json", JSON.stringify(row));
        saveReq.input("jv_id", row.jv_id ?? null);
        saveReq.input("test_status", "PASS");
        saveReq.input("error_message", null);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");

        return { success: true, ...row };
      } catch (e: any) {
        const saveReq = pool.request();
        saveReq.input("function_type", "INITIAL_RECOGNITION");
        saveReq.input("scenario_name", `Initial Recognition — Contract #${input.contract_id} [FAILED]`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify({ contract_id: input.contract_id }));
        saveReq.input("result_json", null);
        saveReq.input("jv_id", null);
        saveReq.input("test_status", "FAIL");
        saveReq.input("error_message", e.message);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");
        throw e;
      }
    }),

  // ── Run: Interest Accrual ─────────────────────────────────────────────────
  runInterestAccrual: protectedProcedure
    .input(z.object({
      contract_id: z.number().int(),
      period_year: z.number().int(),
      period_month: z.number().int().min(1).max(12),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      try {
        const req = pool.request();
        req.input("contract_id", input.contract_id);
        req.input("period_year", input.period_year);
        req.input("period_month", input.period_month);
        req.input("created_by", ctx.user.name ?? ctx.user.email);
        const result = await req.execute("accounting.sp_TxnInterestAccrual");
        const row = (result.recordset as any[])?.[0] ?? {};

        const saveReq = pool.request();
        saveReq.input("function_type", "INTEREST_ACCRUAL");
        saveReq.input("scenario_name", `Interest Accrual ${input.period_year}-${String(input.period_month).padStart(2,'0')} — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", JSON.stringify(row));
        saveReq.input("jv_id", row.jv_id ?? null);
        saveReq.input("test_status", "PASS");
        saveReq.input("error_message", null);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");

        return { success: true, ...row };
      } catch (e: any) {
        const saveReq = pool.request();
        saveReq.input("function_type", "INTEREST_ACCRUAL");
        saveReq.input("scenario_name", `Interest Accrual [FAILED] — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", null);
        saveReq.input("jv_id", null);
        saveReq.input("test_status", "FAIL");
        saveReq.input("error_message", e.message);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");
        throw e;
      }
    }),

  // ── Run: Depreciation ─────────────────────────────────────────────────────
  runDepreciation: protectedProcedure
    .input(z.object({
      contract_id: z.number().int(),
      period_year: z.number().int(),
      period_month: z.number().int().min(1).max(12),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      try {
        const req = pool.request();
        req.input("contract_id", input.contract_id);
        req.input("period_year", input.period_year);
        req.input("period_month", input.period_month);
        req.input("created_by", ctx.user.name ?? ctx.user.email);
        const result = await req.execute("accounting.sp_TxnDepreciation");
        const row = (result.recordset as any[])?.[0] ?? {};

        const saveReq = pool.request();
        saveReq.input("function_type", "DEPRECIATION");
        saveReq.input("scenario_name", `ROU Depreciation ${input.period_year}-${String(input.period_month).padStart(2,'0')} — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", JSON.stringify(row));
        saveReq.input("jv_id", row.jv_id ?? null);
        saveReq.input("test_status", "PASS");
        saveReq.input("error_message", null);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");

        return { success: true, ...row };
      } catch (e: any) {
        const saveReq = pool.request();
        saveReq.input("function_type", "DEPRECIATION");
        saveReq.input("scenario_name", `Depreciation [FAILED] — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", null);
        saveReq.input("jv_id", null);
        saveReq.input("test_status", "FAIL");
        saveReq.input("error_message", e.message);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");
        throw e;
      }
    }),

  // ── Run: Lease Payment ────────────────────────────────────────────────────
  runLeasePayment: protectedProcedure
    .input(z.object({
      contract_id: z.number().int(),
      period_year: z.number().int(),
      period_month: z.number().int().min(1).max(12),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      try {
        const req = pool.request();
        req.input("contract_id", input.contract_id);
        req.input("period_year", input.period_year);
        req.input("period_month", input.period_month);
        req.input("created_by", ctx.user.name ?? ctx.user.email);
        const result = await req.execute("accounting.sp_TxnLeasePayment");
        const row = (result.recordset as any[])?.[0] ?? {};

        const saveReq = pool.request();
        saveReq.input("function_type", "LEASE_PAYMENT");
        saveReq.input("scenario_name", `Lease Payment ${input.period_year}-${String(input.period_month).padStart(2,'0')} — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", JSON.stringify(row));
        saveReq.input("jv_id", row.jv_id ?? null);
        saveReq.input("test_status", "PASS");
        saveReq.input("error_message", null);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");

        return { success: true, ...row };
      } catch (e: any) {
        const saveReq = pool.request();
        saveReq.input("function_type", "LEASE_PAYMENT");
        saveReq.input("scenario_name", `Lease Payment [FAILED] — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", null);
        saveReq.input("jv_id", null);
        saveReq.input("test_status", "FAIL");
        saveReq.input("error_message", e.message);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");
        throw e;
      }
    }),

  // ── Run: Modification ─────────────────────────────────────────────────────
  runModification: protectedProcedure
    .input(z.object({
      contract_id: z.number().int(),
      new_monthly_payment: z.number(),
      new_term_months: z.number().int(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      try {
        const req = pool.request();
        req.input("contract_id", input.contract_id);
        req.input("new_monthly_payment", input.new_monthly_payment);
        req.input("new_term_months", input.new_term_months);
        req.input("created_by", ctx.user.name ?? ctx.user.email);
        const result = await req.execute("accounting.sp_TxnModification");
        const row = (result.recordset as any[])?.[0] ?? {};

        const saveReq = pool.request();
        saveReq.input("function_type", "MODIFICATION");
        saveReq.input("scenario_name", `Modification Remeasurement — Contract #${input.contract_id} PMT=${input.new_monthly_payment} Term=${input.new_term_months}m`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", JSON.stringify(row));
        saveReq.input("jv_id", row.jv_id ?? null);
        saveReq.input("test_status", "PASS");
        saveReq.input("error_message", null);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");

        return { success: true, ...row };
      } catch (e: any) {
        const saveReq = pool.request();
        saveReq.input("function_type", "MODIFICATION");
        saveReq.input("scenario_name", `Modification [FAILED] — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", null);
        saveReq.input("jv_id", null);
        saveReq.input("test_status", "FAIL");
        saveReq.input("error_message", e.message);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");
        throw e;
      }
    }),

  // ── Run: Termination ──────────────────────────────────────────────────────
  runTermination: protectedProcedure
    .input(z.object({
      contract_id: z.number().int(),
      remaining_liability: z.number(),
      remaining_rou: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      try {
        const req = pool.request();
        req.input("contract_id", input.contract_id);
        req.input("remaining_liability", input.remaining_liability);
        req.input("remaining_rou", input.remaining_rou);
        req.input("created_by", ctx.user.name ?? ctx.user.email);
        const result = await req.execute("accounting.sp_TxnTermination");
        const row = (result.recordset as any[])?.[0] ?? {};

        const saveReq = pool.request();
        saveReq.input("function_type", "TERMINATION");
        saveReq.input("scenario_name", `Termination Derecognition — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", JSON.stringify(row));
        saveReq.input("jv_id", row.jv_id ?? null);
        saveReq.input("test_status", "PASS");
        saveReq.input("error_message", null);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");

        return { success: true, ...row };
      } catch (e: any) {
        const saveReq = pool.request();
        saveReq.input("function_type", "TERMINATION");
        saveReq.input("scenario_name", `Termination [FAILED] — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", null);
        saveReq.input("jv_id", null);
        saveReq.input("test_status", "FAIL");
        saveReq.input("error_message", e.message);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");
        throw e;
      }
    }),

  // ── Run: FX Revaluation ───────────────────────────────────────────────────
  runFXRevaluation: protectedProcedure
    .input(z.object({
      contract_id: z.number().int(),
      old_fx_rate: z.number(),
      new_fx_rate: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      try {
        const req = pool.request();
        req.input("contract_id", input.contract_id);
        req.input("old_fx_rate", input.old_fx_rate);
        req.input("new_fx_rate", input.new_fx_rate);
        req.input("created_by", ctx.user.name ?? ctx.user.email);
        const result = await req.execute("accounting.sp_TxnFXRevaluation");
        const row = (result.recordset as any[])?.[0] ?? {};

        const saveReq = pool.request();
        saveReq.input("function_type", "FX_REVALUATION");
        saveReq.input("scenario_name", `FX Revaluation — Contract #${input.contract_id} Old=${input.old_fx_rate} New=${input.new_fx_rate}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", JSON.stringify(row));
        saveReq.input("jv_id", row.jv_id ?? null);
        saveReq.input("test_status", "PASS");
        saveReq.input("error_message", null);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");

        return { success: true, ...row };
      } catch (e: any) {
        const saveReq = pool.request();
        saveReq.input("function_type", "FX_REVALUATION");
        saveReq.input("scenario_name", `FX Revaluation [FAILED] — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", null);
        saveReq.input("jv_id", null);
        saveReq.input("test_status", "FAIL");
        saveReq.input("error_message", e.message);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");
        throw e;
      }
    }),

  // ── Run: Period-End Close ─────────────────────────────────────────────────
  runPeriodClose: protectedProcedure
    .input(z.object({
      contract_id: z.number().int(),
      period_year: z.number().int(),
      period_month: z.number().int().min(1).max(12),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      try {
        const req = pool.request();
        req.input("contract_id", input.contract_id);
        req.input("period_year", input.period_year);
        req.input("period_month", input.period_month);
        req.input("created_by", ctx.user.name ?? ctx.user.email);
        const result = await req.execute("accounting.sp_TxnPeriodClose");
        const row = (result.recordset as any[])?.[0] ?? {};

        const saveReq = pool.request();
        saveReq.input("function_type", "PERIOD_CLOSE");
        saveReq.input("scenario_name", `Period-End Close ${input.period_year}-${String(input.period_month).padStart(2,'0')} — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", JSON.stringify(row));
        saveReq.input("jv_id", row.jv_id ?? null);
        saveReq.input("test_status", "PASS");
        saveReq.input("error_message", null);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");

        return { success: true, ...row };
      } catch (e: any) {
        const saveReq = pool.request();
        saveReq.input("function_type", "PERIOD_CLOSE");
        saveReq.input("scenario_name", `Period-End Close [FAILED] — Contract #${input.contract_id}`);
        saveReq.input("contract_id", input.contract_id);
        saveReq.input("params_json", JSON.stringify(input));
        saveReq.input("result_json", null);
        saveReq.input("jv_id", null);
        saveReq.input("test_status", "FAIL");
        saveReq.input("error_message", e.message);
        saveReq.input("run_by", ctx.user.name ?? ctx.user.email);
        await saveReq.execute("accounting.sp_SaveTxnScenario");
        throw e;
      }
    }),

  // ── Post a JV (change status from Draft → Posted) ─────────────────────────
  postJV: protectedProcedure
    .input(z.object({ jv_id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("jv_id", input.jv_id);
      req.input("posted_by", ctx.user.name ?? ctx.user.email);
      const result = await req.execute("accounting.sp_PostJournalVoucher");
      return (result.recordset as any[])?.[0] ?? { success: true };
    }),
});
