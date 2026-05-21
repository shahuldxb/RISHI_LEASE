/**

* VodaLease Enterprise — Business Rules Router
 * CRUD operations for the dynamic business rules engine.
 * All DB access via stored procedures through RulesEngine class.
 */
import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { RulesEngine } from '../rulesEngine';
import { TRPCError } from '@trpc/server';

export const businessRulesRouter = router({
  // ── Get all rules for a specific screen ──────────────────
  getByScreen: protectedProcedure
    .input(z.object({
      screenId: z.string(),
      activeOnly: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      return await RulesEngine.loadRules(input.screenId, input.activeOnly);
    }),

  // ── Get all rules across all screens ─────────────────────
  getAll: protectedProcedure
    .query(async () => {
      return await RulesEngine.loadAllRules();
    }),

  // ── Get summary per screen ───────────────────────────────
  getSummary: protectedProcedure
    .query(async () => {
      return await RulesEngine.getRulesSummary();
    }),

  // ── Get rule categories ──────────────────────────────────
  getCategories: protectedProcedure
    .query(async () => {
      return await RulesEngine.getCategories();
    }),

  // ── Upsert (create or update) a rule ─────────────────────
  upsert: protectedProcedure
    .input(z.object({
      rule_id: z.number().optional(),
      screen_id: z.string(),
      screen_title: z.string().optional(),
      category_code: z.string(),
      rule_name: z.string(),
      rule_description: z.string().optional(),
      formula: z.string().optional(),
      formula_variables: z.string().optional(),
      jv_debit_account: z.string().optional(),
      jv_credit_account: z.string().optional(),
      jv_description: z.string().optional(),
      ifrs_reference: z.string().optional(),
      condition_expression: z.string().optional(),
      priority: z.number().optional(),
      is_active: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await RulesEngine.upsertRule({
        ...input,
        updated_by: ctx.user?.name || 'system',
      });
      if (!result) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to upsert rule' });
      }
      return result;
    }),

  // ── Toggle rule active/inactive ──────────────────────────
  toggle: protectedProcedure
    .input(z.object({
      rule_id: z.number(),
      is_active: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      await RulesEngine.toggleRule(input.rule_id, input.is_active, ctx.user?.name || 'system');
      return { success: true };
    }),

  // ── Delete all rules for a screen (before regeneration) ──
  deleteByScreen: protectedProcedure
    .input(z.object({ screenId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const count = await RulesEngine.deleteRulesForScreen(input.screenId, ctx.user?.name || 'system');
      return { deletedCount: count };
    }),

  // ── Get execution log for a screen ───────────────────────
  getExecutionLog: protectedProcedure
    .input(z.object({
      screenId: z.string(),
      top: z.number().default(100),
    }))
    .query(async ({ input }) => {
      return await RulesEngine.getExecutionLog(input.screenId, input.top);
    }),

  // ── Execute all rules for a screen (test/preview) ────────
  executeRules: protectedProcedure
    .input(z.object({
      screenId: z.string(),
      context: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input, ctx }) => {
      return await RulesEngine.executeAllRules(
        input.screenId,
        input.context,
        ctx.user?.name || 'system'
      );
    }),

  // ── Get JV patterns for a screen ─────────────────────────
  getJVPatterns: protectedProcedure
    .input(z.object({ screenId: z.string() }))
    .query(async ({ input }) => {
      return await RulesEngine.getJVPatterns(input.screenId);
    }),

  // ═══════════════════════════════════════════════════════════
  // GL CODE MANAGEMENT — Single source of truth for GL codes
  // ═══════════════════════════════════════════════════════════

  // ── Lookup a GL code (auto-creates if not found) ─────────
  lookupGLCode: protectedProcedure
    .input(z.object({
      screenId: z.string(),
      transactionType: z.string(),
      entryType: z.enum(['DEBIT', 'CREDIT']).default('DEBIT'),
      fallbackDebit: z.string().optional(),
      fallbackCredit: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await RulesEngine.lookupGLCode(
        input.screenId,
        input.transactionType,
        input.entryType,
        input.fallbackDebit,
        input.fallbackCredit
      );
    }),

  // ── Create or update a GL code rule ──────────────────────
  upsertGLCode: protectedProcedure
    .input(z.object({
      screenId: z.string(),
      transactionType: z.string(),
      debitGLCode: z.string(),
      creditGLCode: z.string(),
      description: z.string().optional(),
      ifrsReference: z.string().optional(),
      priority: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await RulesEngine.upsertGLCodeRule({
        ...input,
        updatedBy: ctx.user?.name || 'system',
      });
      if (!result) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to upsert GL code rule' });
      }
      return result;
    }),

  // ── Get all GL code rules (management view) ──────────────
  getAllGLCodes: protectedProcedure
    .query(async () => {
      return await RulesEngine.getAllGLCodeRules();
    }),

  // ── Get GL code rules for a specific screen ──────────────
  getGLCodesForScreen: protectedProcedure
    .input(z.object({ screenId: z.string() }))
    .query(async ({ input }) => {
      return await RulesEngine.getGLCodeRulesForScreen(input.screenId);
    }),

  // ── Seed default GL code rules (one-time setup) ──────────
  seedGLCodes: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await RulesEngine.seedDefaultGLCodeRules(ctx.user?.name || 'system');
      return { success: true, seededCount: count };
    }),
});
