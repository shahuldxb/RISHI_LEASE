import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getPool } from "../db-sqlserver";

export const journalVoucherRouter = router({
  // ── List JVs ──────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      jv_type: z.string().optional(),
      period_year: z.number().int().optional(),
      period_month: z.number().int().optional(),
      contract_id: z.number().int().optional(),
      search: z.string().optional(),
      page: z.number().int().default(1),
      page_size: z.number().int().default(50),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("status", input.status ?? null);
      req.input("jv_type", input.jv_type ?? null);
      req.input("period_year", input.period_year ?? null);
      req.input("period_month", input.period_month ?? null);
      req.input("contract_id", input.contract_id ?? null);
      req.input("search", input.search ?? null);
      req.input("page", input.page);
      req.input("page_size", input.page_size);
      const result = await req.execute("accounting.sp_ListJournalVouchers");
      const rs = result.recordsets as any[][];
      const total = rs?.[0]?.[0]?.total ?? 0;
      const rows = rs?.[1] ?? [];
      const allLines = rs?.[2] ?? [];
      return { rows, allLines, total };
    }),

  // ── Get single JV with lines ──────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ jv_id: z.number().int() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("jv_id", input.jv_id);
      const result = await req.execute("accounting.sp_GetJournalVoucher");
      const rs = result.recordsets as any[][];
      const jv = rs?.[0]?.[0] ?? null;
      const lines = rs?.[1] ?? [];
      return { jv, lines };
    }),

  // ── Generate Inception JV ─────────────────────────────────────────────────
  generateInception: protectedProcedure
    .input(z.object({ contract_id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("contract_id", input.contract_id);
      req.input("created_by", ctx.user.name ?? ctx.user.email);
      const result = await req.execute("accounting.sp_GenerateInceptionJV");
      return (result.recordset as any[])?.[0] ?? null;
    }),

  // ── Generate Monthly JVs ──────────────────────────────────────────────────
  generateMonthly: protectedProcedure
    .input(z.object({
      period_year: z.number().int(),
      period_month: z.number().int().min(1).max(12),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("period_year", input.period_year);
      req.input("period_month", input.period_month);
      req.input("created_by", ctx.user.name ?? ctx.user.email);
      try {
        const result = await req.execute("accounting.sp_GenerateMonthlyJVs");
        return (result.recordset as any[])?.[0] ?? { generated_count: 0 };
      } catch (e: any) {
        const msg = e.precedingErrors?.[0]?.originalError?.info?.message || e.message || 'Unknown SP error';
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg });
      }
    }),

  // ── Generate Monthly JVs for Selected Schedule Rows ────────────────────────
  generateMonthlySelected: protectedProcedure
    .input(z.object({
      schedule_ids: z.array(z.number().int()).min(1).max(500),
      contract_id: z.number().int(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("schedule_ids_csv", input.schedule_ids.join(","));
      req.input("contract_id", input.contract_id);
      req.input("created_by", ctx.user.name ?? ctx.user.email);
      try {
        const result = await req.execute("accounting.sp_GenerateMonthlyJVsForSelected");
        return (result.recordset as any[])?.[0] ?? { generated_count: 0, skipped_count: 0 };
      } catch (e: any) {
        const msg = e.precedingErrors?.[0]?.originalError?.info?.message || e.message || 'Unknown SP error';
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg });
      }
    }),

  // ── Generate Remeasurement JV ─────────────────────────────────────────────
  generateRemeasurement: protectedProcedure
    .input(z.object({ remeasurement_id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("remeasurement_id", input.remeasurement_id);
      req.input("created_by", ctx.user.name ?? ctx.user.email);
      const result = await req.execute("accounting.sp_GenerateRemeasurementJV");
      return (result.recordset as any[])?.[0] ?? null;
    }),

  // ── Generate Period Close JV ──────────────────────────────────────────────
  generatePeriodClose: protectedProcedure
    .input(z.object({ period_year: z.number().int(), period_month: z.number().int().min(1).max(12) }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("period_year", input.period_year);
      req.input("period_month", input.period_month);
      req.input("created_by", ctx.user.name ?? ctx.user.email);
      try {
        const result = await req.execute("accounting.sp_GenerateMonthlyJVs");
        return (result.recordset as any[])?.[0] ?? { generated_count: 0 };
      } catch (e: any) {
        const msg = e.precedingErrors?.[0]?.originalError?.info?.message || e.message || 'Unknown SP error';
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg });
      }
    }),

  // ── Post JV ───────────────────────────────────────────────────────────────
  post: protectedProcedure
    .input(z.object({ jv_id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("jv_id", input.jv_id);
      req.input("posted_by", ctx.user.name ?? ctx.user.email);
      const result = await req.execute("accounting.sp_PostJournalVoucher");
      return (result.recordset as any[])?.[0] ?? null;
    }),

  // ── Reject JV ─────────────────────────────────────────────────────────────
  reject: protectedProcedure
    .input(z.object({
      jv_id: z.number().int(),
      rejection_reason: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("jv_id", input.jv_id);
      req.input("rejected_by", ctx.user.name ?? ctx.user.email);
      req.input("rejection_reason", input.rejection_reason);
      const result = await req.execute("accounting.sp_RejectJournalVoucher");
      return (result.recordset as any[])?.[0] ?? null;
    }),

  // ── Batch Post ────────────────────────────────────────────────────────────
  batchPost: protectedProcedure
    .input(z.object({ jv_ids: z.array(z.number().int()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("jv_ids_csv", input.jv_ids.join(","));
      req.input("posted_by", ctx.user.name ?? ctx.user.email);
      const result = await req.execute("accounting.sp_BatchPostJVs");
      return (result.recordset as any[])?.[0] ?? { posted_count: 0, failed_count: 0 };
    }),

  // ── System Settings ───────────────────────────────────────────────────────
  getSettings: protectedProcedure
    .query(async () => {
      const pool = await getPool();
      const result = await pool.request().execute("accounting.sp_GetSystemSettings");
      const rows = (result.recordset as any[]) ?? [];
      const settings: Record<string, string> = {};
      for (const r of rows) settings[r.setting_key] = r.setting_value;
      return settings;
    }),

  updateSetting: protectedProcedure
    .input(z.object({
      setting_key: z.string(),
      setting_value: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("setting_key", input.setting_key);
      req.input("setting_value", input.setting_value);
      req.input("updated_by", ctx.user.name ?? ctx.user.email);
      const result = await req.execute("accounting.sp_UpdateSystemSetting");
      return (result.recordset as any[])?.[0] ?? null;
    }),

  // ── Day-1 Initial Recognition JV ──────────────────────────────────────────
  postInitialRecognitionJV: protectedProcedure
    .input(z.object({ contract_id: z.number().int() }))
    .mutation(async ({ input }) => {
      try {
        const pool = await getPool();
        const req = pool.request();
        req.input("contract_id", input.contract_id);
        const result = await req.execute("accounting.sp_PostInitialRecognitionJV");
        const row = (result.recordset as any[])?.[0] ?? null;
        if (!row) throw new Error('SP returned no result for contract ' + input.contract_id);
        return row;
      } catch (err: any) {
        console.error('[postInitialRecognitionJV] Error:', err.message, err.stack);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to post Day-1 JV for contract ' + input.contract_id });
      }
    }),

  // ── Get Initial JV for Amortization Master ──────────────────────────────────
  getInitialJV: protectedProcedure
    .input(z.object({ contract_id: z.number().int() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      // Get the inception JV header
      const headerResult = await pool.request().query(`
        SELECT TOP 1 jv.jv_id, jv.jv_number, jv.jv_type, jv.contract_id, jv.status,
               jv.period_year, jv.period_month, jv.posting_date, jv.description,
               jv.total_debit, jv.total_credit, jv.currency, jv.created_by,
               c.contract_ref, c.commencement_date, c.term_months, c.monthly_payment,
               c.ibr, c.rou_asset_value, c.lease_liability_commence,
               COALESCE(ld.lessee_name, 'N/A') AS lessee_name,
               COALESCE(ld.staff_number, '') AS lessee_number
        FROM accounting.journal_vouchers jv
        INNER JOIN lease.contracts c ON c.contract_id = jv.contract_id
        LEFT JOIN lease.lease_lessee_details ld ON ld.contract_id = c.contract_id
        WHERE jv.contract_id = ${input.contract_id}
          AND jv.jv_type IN ('INCEPTION', 'Initial Recognition')
        ORDER BY jv.jv_id DESC
      `);
      const header = (headerResult.recordset as any[])?.[0] ?? null;
      if (!header) return { header: null, lines: [] };

      // Get lines for this JV
      const linesResult = await pool.request().query(`
        SELECT line_id, line_seq, dr_cr, account_code, account_name, amount,
               description, currency, calc_explanation
        FROM accounting.jv_lines
        WHERE jv_id = ${header.jv_id}
        ORDER BY line_seq
      `);
      return { header, lines: (linesResult.recordset as any[]) ?? [] };
    }),

  // ── Chart of Accounts ─────────────────────────────────────────────────────
  getChartOfAccounts: protectedProcedure
    .input(z.object({ ifrs16_only: z.boolean().default(false) }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("ifrs16_only", input.ifrs16_only ? 1 : 0);
      const result = await req.execute("accounting.sp_GetChartOfAccounts");
      return (result.recordset as any[]) ?? [];
    }),
});
