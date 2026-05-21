import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { execSPP, execSPPMulti } from '../db-sqlserver';
import sql from 'mssql';

export const bounceReconRouter = router({

  // ── Penalty Configuration ──────────────────────────────────────────────
  getPenaltyConfigs: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional().default(true) }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_GetBouncePenaltyConfig', [
        { name: 'ActiveOnly', type: sql.Bit, value: input.activeOnly ? 1 : 0 },
      ]);
      return { configs: rows };
    }),

  savePenaltyConfig: protectedProcedure
    .input(z.object({
      configId: z.number().optional(),
      configName: z.string().min(1),
      penaltyCode: z.enum(['FLAT_FEE', 'PCT_AMOUNT', 'FLAT_PLUS_PCT', 'BANK_CHARGE', 'NONE']),
      flatAmount: z.number().optional().default(0),
      pctRate: z.number().optional().default(0),
      pctCap: z.number().optional(),
      pctFloor: z.number().optional(),
      appliesFromAmount: z.number().optional().default(0),
      appliesToAmount: z.number().optional(),
      drGlAccount: z.string().optional(),
      crGlAccount: z.string().optional(),
      costCentre: z.string().optional(),
      priority: z.number().optional().default(10),
      isActive: z.boolean().optional().default(true),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rows = await execSPP('sp_SaveBouncePenaltyConfig', [
        { name: 'ConfigId', type: sql.Int, value: input.configId ?? null },
        { name: 'ConfigName', type: sql.VarChar(200), value: input.configName },
        { name: 'PenaltyCode', type: sql.VarChar(30), value: input.penaltyCode },
        { name: 'FlatAmount', type: sql.Decimal(18, 2), value: input.flatAmount },
        { name: 'PctRate', type: sql.Decimal(8, 4), value: input.pctRate },
        { name: 'PctCap', type: sql.Decimal(18, 2), value: input.pctCap ?? null },
        { name: 'PctFloor', type: sql.Decimal(18, 2), value: input.pctFloor ?? null },
        { name: 'AppliesToAmountFrom', type: sql.Decimal(18, 2), value: input.appliesFromAmount },
        { name: 'AppliesToAmountTo', type: sql.Decimal(18, 2), value: input.appliesToAmount ?? null },
        { name: 'DrGlAccount', type: sql.VarChar(20), value: input.drGlAccount ?? null },
        { name: 'CrGlAccount', type: sql.VarChar(20), value: input.crGlAccount ?? null },
        { name: 'CostCentre', type: sql.VarChar(20), value: input.costCentre ?? null },
        { name: 'Priority', type: sql.Int, value: input.priority },
        { name: 'IsActive', type: sql.Bit, value: input.isActive ? 1 : 0 },
        { name: 'Notes', type: sql.NVarChar(1000), value: input.notes ?? null },
        { name: 'MakerId', type: sql.Int, value: ctx.user?.id ?? null },
      ]);
      return rows[0] ?? { success: true };
    }),

  // ── Record a Bounced Cheque ────────────────────────────────────────────
  recordBounce: protectedProcedure
    .input(z.object({
      chequeId: z.number(),
      bounceDate: z.string(),
      bounceReason: z.enum([
        'INSUFFICIENT_FUNDS', 'ACCOUNT_CLOSED', 'SIGNATURE_MISMATCH',
        'STALE_CHEQUE', 'STOP_PAYMENT', 'AMOUNT_MISMATCH', 'OTHER'
      ]),
      bounceReasonDetail: z.string().optional(),
      bankReturnRef: z.string().optional(),
      configId: z.number().optional(),
      overridePenalty: z.number().optional(),
      waivePenalty: z.boolean().optional().default(false),
      waiverReason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rows = await execSPP('sp_RecordBouncedCheque', [
        { name: 'ChequeId', type: sql.Int, value: input.chequeId },
        { name: 'BounceDate', type: sql.Date, value: new Date(input.bounceDate) },
        { name: 'BounceReason', type: sql.VarChar(100), value: input.bounceReason },
        { name: 'BounceReasonDetail', type: sql.NVarChar(500), value: input.bounceReasonDetail ?? null },
        { name: 'BankReturnRef', type: sql.VarChar(100), value: input.bankReturnRef ?? null },
        { name: 'ConfigId', type: sql.Int, value: input.configId ?? null },
        { name: 'OverridePenalty', type: sql.Decimal(18, 2), value: input.overridePenalty ?? null },
        { name: 'WaivePenalty', type: sql.Bit, value: input.waivePenalty ? 1 : 0 },
        { name: 'WaiverReason', type: sql.NVarChar(500), value: input.waiverReason ?? null },
        { name: 'MakerId', type: sql.Int, value: ctx.user?.id ?? null },
      ]);
      return rows[0];
    }),

  // ── Get Penalty Preview before recording ──────────────────────────────
  previewPenalty: protectedProcedure
    .input(z.object({
      chequeAmount: z.number(),
      configId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const configs = await execSPP('sp_GetBouncePenaltyConfig', [
        { name: 'ActiveOnly', type: sql.Bit, value: 1 },
      ]);
      const cfg = input.configId
        ? configs.find((c: any) => c.config_id === input.configId)
        : configs.find((c: any) =>
            c.penalty_code !== 'NONE' &&
            input.chequeAmount >= (c.applies_to_amount_from ?? 0) &&
            (c.applies_to_amount_to == null || input.chequeAmount <= c.applies_to_amount_to)
          );
      if (!cfg) return { penalty_amount: 0, penalty_type: 'NONE', config_name: 'No penalty applicable' };
      let penalty = 0;
      if (cfg.penalty_code === 'FLAT_FEE') penalty = cfg.flat_amount;
      else if (cfg.penalty_code === 'PCT_AMOUNT') {
        penalty = input.chequeAmount * cfg.pct_rate / 100;
        if (cfg.pct_cap && penalty > cfg.pct_cap) penalty = cfg.pct_cap;
        if (cfg.pct_floor && penalty < cfg.pct_floor) penalty = cfg.pct_floor;
      } else if (cfg.penalty_code === 'FLAT_PLUS_PCT') {
        const pct = input.chequeAmount * cfg.pct_rate / 100;
        penalty = cfg.flat_amount + (cfg.pct_cap && pct > cfg.pct_cap ? cfg.pct_cap : pct);
      } else if (cfg.penalty_code === 'BANK_CHARGE') {
        penalty = 0; // bank charge is entered manually
      }
      return {
        penalty_amount: Math.round(penalty * 100) / 100,
        penalty_type: cfg.penalty_code,
        config_name: cfg.config_name,
        config_id: cfg.config_id,
        total_with_penalty: Math.round((input.chequeAmount + penalty) * 100) / 100,
      };
    }),

  // ── Get Bounce History ─────────────────────────────────────────────────
  getBounceHistory: protectedProcedure
    .input(z.object({
      lessorId: z.number().optional(),
      status: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.number().optional().default(1),
      pageSize: z.number().optional().default(20),
    }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_GetBounceHistory', [
        { name: 'LessorId', type: sql.Int, value: input.lessorId ?? null },
        { name: 'Status', type: sql.VarChar(30), value: input.status ?? null },
        { name: 'DateFrom', type: sql.Date, value: input.dateFrom ? new Date(input.dateFrom) : null },
        { name: 'DateTo', type: sql.Date, value: input.dateTo ? new Date(input.dateTo) : null },
        { name: 'PageNumber', type: sql.Int, value: input.page },
        { name: 'PageSize', type: sql.Int, value: input.pageSize },
      ]);
      return { bounces: rows, total: rows.length };
    }),

  // ── GL Preview ─────────────────────────────────────────────────────────
  getGLPreview: protectedProcedure
    .input(z.object({ bounceId: z.number() }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_GetBounceGLPreview', [
        { name: 'BounceId', type: sql.Int, value: input.bounceId },
      ]);
      return { entries: rows };
    }),

  // ── Post GL Entry ──────────────────────────────────────────────────────
  postGLEntry: protectedProcedure
    .input(z.object({ bounceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const rows = await execSPP('sp_PostBounceGLEntry', [
        { name: 'BounceId', type: sql.Int, value: input.bounceId },
        { name: 'PostedBy', type: sql.Int, value: ctx.user?.id ?? null },
      ]);
      return rows[0];
    }),

  // ── Issue Replacement Cheque ───────────────────────────────────────────
  issueReplacement: protectedProcedure
    .input(z.object({
      bounceId: z.number(),
      replacementBookId: z.number(),
      replacementAmount: z.number(),
      includePenaltyInCheque: z.boolean().optional().default(true),
      replacementIssueDate: z.string().optional(),
      replacementDueDate: z.string().optional(),
      checkerId: z.number().optional(),
      checkerNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rows = await execSPP('sp_IssueBounceReplacement', [
        { name: 'BounceId', type: sql.Int, value: input.bounceId },
        { name: 'ReplacementBookId', type: sql.Int, value: input.replacementBookId },
        { name: 'ReplacementAmount', type: sql.Decimal(18, 2), value: input.replacementAmount },
        { name: 'IncludePenaltyInCheque', type: sql.Bit, value: input.includePenaltyInCheque ? 1 : 0 },
        { name: 'ReplacementIssueDate', type: sql.Date, value: input.replacementIssueDate ? new Date(input.replacementIssueDate) : null },
        { name: 'ReplacementDueDate', type: sql.Date, value: input.replacementDueDate ? new Date(input.replacementDueDate) : null },
        { name: 'CheckerId', type: sql.Int, value: input.checkerId ?? null },
        { name: 'CheckerNotes', type: sql.NVarChar(500), value: input.checkerNotes ?? null },
        { name: 'MakerId', type: sql.Int, value: ctx.user?.id ?? null },
      ]);
      return rows[0];
    }),

  // ── Waive Bounce Penalty ───────────────────────────────────────────────
  waiveBounce: protectedProcedure
    .input(z.object({
      bounceId: z.number(),
      waiverReason: z.string().min(1),
      waivedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rows = await execSPP('sp_WaiveBounce', [
        { name: 'BounceId', type: sql.Int, value: input.bounceId },
        { name: 'WaiverReason', type: sql.NVarChar(500), value: input.waiverReason },
        { name: 'WaivedBy', type: sql.Int, value: input.waivedBy ?? ctx.user?.id ?? null },
      ]);
      return rows[0] ?? { success: true };
    }),
});
