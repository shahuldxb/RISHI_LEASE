/**
 * VodaLease Enterprise — Bank Reconciliation & Auto-Matching Router
 * All DB access via SQL Server Stored Procedures (SPP pattern)
 * Screen IDs embedded in all audit logs and API headers
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { execSPP, execSPPMulti, execSPPOne, sql } from "../db-sqlserver";
import { writeAuditLog, writeErrorLog } from "../audit";
import { TRPCError } from "@trpc/server";

const SCREEN_ACCOUNTS   = "VFBNKACCREG0001P001";
const SCREEN_IMPORT     = "VFBNKSTMIMP0001P001";
const SCREEN_WORKSPACE  = "VFBNKRECONWS0001P001";
const SCREEN_AUTOMATCH  = "VFBNKAUTOMCH0001P001";
const SCREEN_UNMATCHED  = "VFBNKUNMTCH0001P001";
const SCREEN_SUMMARY    = "VFBNKRECSUM0001P001";
const SCREEN_HISTORY    = "VFBNKRECHST0001P001";
const SCREEN_RULES      = "VFBNKRULCFG0001P001";

export const bankReconRouter = router({

  // ── Bank Accounts ─────────────────────────────────────────
  listAccounts: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const rows = await execSPP("sp_GetBankAccounts", [
          { name: "Status", type: sql.VarChar(20), value: input.status ?? null },
        ]);
        return { accounts: rows, screenId: SCREEN_ACCOUNTS };
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_ACCOUNTS });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  createAccount: protectedProcedure
    .input(z.object({
      bankName:      z.string().min(2),
      accountName:   z.string().min(2),
      accountNumber: z.string().min(4),
      iban:          z.string().optional(),
      swiftBic:      z.string().optional(),
      currency:      z.string().length(3).default("USD"),
      accountType:   z.string().default("Current"),
      glAccount:     z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne<{ account_id: number; account_ref: string }>("sp_CreateBankAccount", [
          { name: "BankName",      type: sql.NVarChar(200), value: input.bankName },
          { name: "AccountName",   type: sql.NVarChar(200), value: input.accountName },
          { name: "AccountNumber", type: sql.VarChar(50),   value: input.accountNumber },
          { name: "IBAN",          type: sql.VarChar(34),   value: input.iban ?? null },
          { name: "SwiftBIC",      type: sql.VarChar(11),   value: input.swiftBic ?? null },
          { name: "Currency",      type: sql.Char(3),       value: input.currency },
          { name: "AccountType",   type: sql.VarChar(30),   value: input.accountType },
          { name: "GLAccount",     type: sql.VarChar(10),   value: input.glAccount ?? null },
          { name: "CreatedBy",     type: sql.Int,           value: ctx.user!.id },
        ]);
        await writeAuditLog({ userId: ctx.user!.id, username: ctx.user!.name || "", userRole: ctx.user!.role, module: "BankRecon", subModule: "Accounts", actionType: "CREATE", recordTable: "bank.bank_accounts", recordId: String(result?.account_id), afterState: result, outcome: "Success", screenId: SCREEN_ACCOUNTS, processStartTime: start });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_ACCOUNTS });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ── Statement Import ───────────────────────────────────────
  importStatement: protectedProcedure
    .input(z.object({
      accountId:      z.number().int(),
      statementDate:  z.string(),
      periodFrom:     z.string(),
      periodTo:       z.string(),
      openingBalance: z.number(),
      closingBalance: z.number(),
      fileFormat:     z.enum(["MT940", "CSV", "OFX", "Manual"]),
      storageKey:     z.string().optional(),
      transactions:   z.array(z.object({
        txn_date:     z.string(),
        value_date:   z.string().optional(),
        txn_type:     z.enum(["D", "C"]),
        amount:       z.number(),
        currency:     z.string().default("USD"),
        narrative:    z.string().optional(),
        reference:    z.string().optional(),
        counterparty: z.string().optional(),
        bank_ref:     z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne<{ statement_id: number; statement_ref: string; transactions_imported: number }>("sp_ImportBankStatement", [
          { name: "AccountId",        type: sql.Int,                  value: input.accountId },
          { name: "StatementDate",    type: sql.Date,                 value: new Date(input.statementDate) },
          { name: "PeriodFrom",       type: sql.Date,                 value: new Date(input.periodFrom) },
          { name: "PeriodTo",         type: sql.Date,                 value: new Date(input.periodTo) },
          { name: "OpeningBalance",   type: sql.Decimal(18, 2),       value: input.openingBalance },
          { name: "ClosingBalance",   type: sql.Decimal(18, 2),       value: input.closingBalance },
          { name: "FileFormat",       type: sql.VarChar(10),          value: input.fileFormat },
          { name: "StorageKey",       type: sql.VarChar(500),         value: input.storageKey ?? null },
          { name: "TransactionsJson", type: sql.NVarChar(sql.MAX),    value: JSON.stringify(input.transactions) },
          { name: "ImportedBy",       type: sql.Int,                  value: ctx.user!.id },
        ]);
        await writeAuditLog({ userId: ctx.user!.id, username: ctx.user!.name || "", userRole: ctx.user!.role, module: "BankRecon", subModule: "Import", actionType: "CREATE", recordTable: "bank.bank_statements", recordId: String(result?.statement_id), afterState: result, outcome: "Success", screenId: SCREEN_IMPORT, processStartTime: start });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_IMPORT });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ── Reconciliation Sessions ────────────────────────────────
  createSession: protectedProcedure
    .input(z.object({
      accountId:   z.number().int(),
      statementId: z.number().int(),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne<{ session_id: number; session_ref: string }>("sp_CreateReconSession", [
          { name: "AccountId",   type: sql.Int,       value: input.accountId },
          { name: "StatementId", type: sql.Int,       value: input.statementId },
          { name: "MakerId",     type: sql.Int,       value: ctx.user!.id },
          { name: "ScreenId",    type: sql.VarChar(20), value: SCREEN_WORKSPACE },
        ]);
        await writeAuditLog({ userId: ctx.user!.id, username: ctx.user!.name || "", userRole: ctx.user!.role, module: "BankRecon", subModule: "Session", actionType: "CREATE", recordTable: "bank.recon_sessions", recordId: String(result?.session_id), afterState: result, outcome: "Success", screenId: SCREEN_WORKSPACE, processStartTime: start });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_WORKSPACE });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .query(async ({ input, ctx }) => {
      try {
        const [header, matchSummary] = await execSPPMulti("sp_GetReconSession", [
          { name: "SessionId", type: sql.Int, value: input.sessionId },
        ]);
        return { session: header?.[0] ?? null, matchSummary: matchSummary ?? [], screenId: SCREEN_WORKSPACE };
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_WORKSPACE });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ── Auto-Matching Engine ───────────────────────────────────
  runAutoMatch: protectedProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne<{ session_id: number; newly_matched: number; still_unmatched: number; total_matched: number }>("sp_RunAutoMatch", [
          { name: "SessionId", type: sql.Int, value: input.sessionId },
          { name: "UserId",    type: sql.Int, value: ctx.user!.id },
        ]);
        await writeAuditLog({ userId: ctx.user!.id, username: ctx.user!.name || "", userRole: ctx.user!.role, module: "BankRecon", subModule: "AutoMatch", actionType: "EXECUTE", recordTable: "bank.recon_sessions", recordId: String(input.sessionId), afterState: result, outcome: "Success", screenId: SCREEN_AUTOMATCH, processStartTime: start });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_AUTOMATCH });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  getMatches: protectedProcedure
    .input(z.object({ sessionId: z.number().int(), status: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      try {
        const rows = await execSPP("sp_GetReconMatches", [
          { name: "SessionId", type: sql.Int,       value: input.sessionId },
          { name: "Status",    type: sql.VarChar(20), value: input.status ?? null },
        ]);
        return { matches: rows, screenId: SCREEN_AUTOMATCH };
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_AUTOMATCH });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ── Unmatched Items ────────────────────────────────────────
  getUnmatchedItems: protectedProcedure
    .input(z.object({ sessionId: z.number().int(), itemType: z.enum(["Bank","GL","Both"]).default("Both") }))
    .query(async ({ input, ctx }) => {
      try {
        const results = await execSPPMulti("sp_GetUnmatchedItems", [
          { name: "SessionId", type: sql.Int,       value: input.sessionId },
          { name: "ItemType",  type: sql.VarChar(10), value: input.itemType },
        ]);
        return { bankItems: results[0] ?? [], glItems: results[1] ?? [], screenId: SCREEN_UNMATCHED };
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_UNMATCHED });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ── Manual Match ───────────────────────────────────────────
  manualMatch: protectedProcedure
    .input(z.object({
      sessionId:  z.number().int(),
      bankTxnIds: z.array(z.number().int()),
      glEntryIds: z.array(z.number().int()),
      notes:      z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne<{ match_id: number; match_ref: string; match_type: string; bank_amount: number; gl_amount: number; difference: number }>("sp_ManualMatch", [
          { name: "SessionId",  type: sql.Int,              value: input.sessionId },
          { name: "BankTxnIds", type: sql.NVarChar(500),    value: JSON.stringify(input.bankTxnIds) },
          { name: "GLEntryIds", type: sql.NVarChar(500),    value: JSON.stringify(input.glEntryIds) },
          { name: "Notes",      type: sql.NVarChar(500),    value: input.notes ?? null },
          { name: "MatchedBy",  type: sql.Int,              value: ctx.user!.id },
          { name: "ScreenId",   type: sql.VarChar(20),      value: SCREEN_WORKSPACE },
        ]);
        await writeAuditLog({ userId: ctx.user!.id, username: ctx.user!.name || "", userRole: ctx.user!.role, module: "BankRecon", subModule: "ManualMatch", actionType: "CREATE", recordTable: "bank.recon_matches", recordId: String(result?.match_id), afterState: result, outcome: "Success", screenId: SCREEN_WORKSPACE, processStartTime: start });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_WORKSPACE });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ── Close Session ──────────────────────────────────────────
  closeSession: protectedProcedure
    .input(z.object({
      sessionId:    z.number().int(),
      glJournalRef: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne<{ session_id: number; status: string; closed_at: Date }>("sp_CloseReconSession", [
          { name: "SessionId",    type: sql.Int,       value: input.sessionId },
          { name: "CheckerId",    type: sql.Int,       value: ctx.user!.id },
          { name: "GLJournalRef", type: sql.VarChar(30), value: input.glJournalRef ?? null },
          { name: "ScreenId",     type: sql.VarChar(20), value: SCREEN_SUMMARY },
        ]);
        await writeAuditLog({ userId: ctx.user!.id, username: ctx.user!.name || "", userRole: ctx.user!.role, module: "BankRecon", subModule: "Session", actionType: "CLOSE", recordTable: "bank.recon_sessions", recordId: String(input.sessionId), afterState: result, outcome: "Success", screenId: SCREEN_SUMMARY, processStartTime: start });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_SUMMARY });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ── History ────────────────────────────────────────────────
  getHistory: protectedProcedure
    .input(z.object({
      accountId:  z.number().int().optional(),
      status:     z.string().optional(),
      pageNumber: z.number().int().default(1),
      pageSize:   z.number().int().default(50),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const rows = await execSPP("sp_GetReconHistory", [
          { name: "AccountId",  type: sql.Int,       value: input.accountId ?? null },
          { name: "Status",     type: sql.VarChar(20), value: input.status ?? null },
          { name: "PageNumber", type: sql.Int,       value: input.pageNumber },
          { name: "PageSize",   type: sql.Int,       value: input.pageSize },
        ]);
        return { sessions: rows, total: rows[0]?.total_count ?? 0, screenId: SCREEN_HISTORY };
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_HISTORY });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ── Matching Rules ─────────────────────────────────────────
  getRules: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const rows = await execSPP("sp_GetReconRules", []);
        return { rules: rows, screenId: SCREEN_RULES };
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_RULES });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  upsertRule: protectedProcedure
    .input(z.object({
      ruleId:              z.number().int().optional(),
      ruleName:            z.string().min(3),
      ruleType:            z.enum(["ExactAmount","RefMatch","Tolerance","Aggregated","Split","AIAssisted"]),
      priority:            z.number().int(),
      isActive:            z.boolean().default(true),
      dateToleranceDays:   z.number().int().default(3),
      amountTolerance:     z.number().default(0),
      amountTolerancePct:  z.number().default(0),
      refPattern:          z.string().optional(),
      minConfidence:       z.number().default(80),
      autoAcceptThreshold: z.number().default(95),
      description:         z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne<{ rule_id: number }>("sp_UpsertReconRule", [
          { name: "RuleId",              type: sql.Int,           value: input.ruleId ?? null },
          { name: "RuleName",            type: sql.VarChar(100),  value: input.ruleName },
          { name: "RuleType",            type: sql.VarChar(30),   value: input.ruleType },
          { name: "Priority",            type: sql.Int,           value: input.priority },
          { name: "IsActive",            type: sql.Bit,           value: input.isActive ? 1 : 0 },
          { name: "DateToleranceDays",   type: sql.Int,           value: input.dateToleranceDays },
          { name: "AmountTolerance",     type: sql.Decimal(18,2), value: input.amountTolerance },
          { name: "AmountTolerancePct",  type: sql.Decimal(5,2),  value: input.amountTolerancePct },
          { name: "RefPattern",          type: sql.NVarChar(200), value: input.refPattern ?? null },
          { name: "MinConfidence",       type: sql.Decimal(5,2),  value: input.minConfidence },
          { name: "AutoAcceptThreshold", type: sql.Decimal(5,2),  value: input.autoAcceptThreshold },
          { name: "Description",         type: sql.NVarChar(500), value: input.description ?? null },
          { name: "UpdatedBy",           type: sql.Int,           value: ctx.user!.id },
        ]);
        await writeAuditLog({ userId: ctx.user!.id, username: ctx.user!.name || "", userRole: ctx.user!.role, module: "BankRecon", subModule: "Rules", actionType: input.ruleId ? "UPDATE" : "CREATE", recordTable: "bank.recon_rules", recordId: String(result?.rule_id), afterState: result, outcome: "Success", screenId: SCREEN_RULES, processStartTime: start });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "BankRecon", message: err.message, stackTrace: err.stack, screenId: SCREEN_RULES });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),
});
