import { z } from 'zod';
import sql from 'mssql';
import { router, protectedProcedure } from '../_core/trpc';
import { execSPP, execSPPOne, execSPPMulti } from '../db-sqlserver';

export const chequeRouter = router({

  // ── Dashboard KPIs ────────────────────────────────────────────
  getSummary: protectedProcedure.query(async () => {
    return execSPPMulti('sp_GetChequeInventorySummary');
  }),

  // ── Bank Accounts ─────────────────────────────────────────────
  getBankAccounts: protectedProcedure
    .input(z.object({ isActive: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      return execSPP('sp_GetBankAccountsForCheque', [
        { name: 'IsActive', type: sql.Bit, value: input?.isActive ?? true },
      ]);
    }),

  // ── Cheque Books ──────────────────────────────────────────────
  getChequeBooks: protectedProcedure
    .input(z.object({
      bankAccountId: z.number().optional(),
      status: z.enum(['Active','Exhausted','Cancelled','Lost']).optional(),
      pageNumber: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input }) => {
      return execSPP('sp_GetChequeBooks', [
        { name: 'BankAccountId', type: sql.Int,         value: input.bankAccountId ?? null },
        { name: 'Status',        type: sql.NVarChar(20), value: input.status ?? null },
        { name: 'PageNumber',    type: sql.Int,         value: input.pageNumber },
        { name: 'PageSize',      type: sql.Int,         value: input.pageSize },
      ]);
    }),

  createChequeBook: protectedProcedure
    .input(z.object({
      bankAccountId: z.number(),
      bookNumber:    z.string().min(1),
      seriesFrom:    z.string().min(1),
      seriesTo:      z.string().min(1),
      receivedDate:  z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      return execSPPOne('sp_CreateChequeBook', [
        { name: 'BankAccountId', type: sql.Int,          value: input.bankAccountId },
        { name: 'BookNumber',    type: sql.NVarChar(50),  value: input.bookNumber },
        { name: 'SeriesFrom',    type: sql.NVarChar(20),  value: input.seriesFrom },
        { name: 'SeriesTo',      type: sql.NVarChar(20),  value: input.seriesTo },
        { name: 'ReceivedDate',  type: sql.Date,          value: new Date(input.receivedDate) },
        { name: 'CreatedBy',     type: sql.NVarChar(100), value: ctx.user?.name ?? 'system' },
      ]);
    }),

  getNextAvailableCheque: protectedProcedure
    .input(z.object({ bankAccountId: z.number() }))
    .query(async ({ input }) => {
      return execSPPOne('sp_GetNextAvailableCheque', [
        { name: 'BankAccountId', type: sql.Int, value: input.bankAccountId },
      ]);
    }),

  // ── Cheque Register ───────────────────────────────────────────
  getChequeRegister: protectedProcedure
    .input(z.object({
      bankAccountId: z.number().optional(),
      status:        z.string().optional(),
      lessorId:      z.number().optional(),
      dateFrom:      z.string().optional(),
      dateTo:        z.string().optional(),
      search:        z.string().optional(),
      pageNumber:    z.number().default(1),
      pageSize:      z.number().default(20),
    }))
    .query(async ({ input }) => {
      return execSPP('sp_GetChequeRegister', [
        { name: 'BankAccountId', type: sql.Int,          value: input.bankAccountId ?? null },
        { name: 'Status',        type: sql.NVarChar(20),  value: input.status ?? null },
        { name: 'LessorId',      type: sql.Int,          value: input.lessorId ?? null },
        { name: 'DateFrom',      type: sql.Date,          value: input.dateFrom ? new Date(input.dateFrom) : null },
        { name: 'DateTo',        type: sql.Date,          value: input.dateTo ? new Date(input.dateTo) : null },
        { name: 'Search',        type: sql.NVarChar(100), value: input.search ?? null },
        { name: 'PageNumber',    type: sql.Int,          value: input.pageNumber },
        { name: 'PageSize',      type: sql.Int,          value: input.pageSize },
      ]);
    }),

  getChequeById: protectedProcedure
    .input(z.object({ chequeId: z.number() }))
    .query(async ({ input }) => {
      return execSPPOne('sp_GetChequeById', [
        { name: 'ChequeId', type: sql.Int, value: input.chequeId },
      ]);
    }),

  // ── Issue Cheque ──────────────────────────────────────────────
  issueCheque: protectedProcedure
    .input(z.object({
      chequeBookId:  z.number(),
      chequeNumber:  z.string(),
      bankAccountId: z.number(),
      payeeName:     z.string(),
      lessorId:      z.number().optional(),
      invoiceRef:    z.string().optional(),
      amount:        z.number().positive(),
      currency:      z.string().length(3).default('USD'),
      issueDate:     z.string(),
      signatureType: z.enum(['Single','Dual']).default('Single'),
      signatory1Id:  z.number().optional(),
      signatory2Id:  z.number().optional(),
      remarks:       z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return execSPPOne('sp_IssueCheque', [
        { name: 'ChequeBookId',  type: sql.Int,           value: input.chequeBookId },
        { name: 'ChequeNumber',  type: sql.NVarChar(20),  value: input.chequeNumber },
        { name: 'BankAccountId', type: sql.Int,           value: input.bankAccountId },
        { name: 'PayeeName',     type: sql.NVarChar(200), value: input.payeeName },
        { name: 'LessorId',      type: sql.Int,           value: input.lessorId ?? null },
        { name: 'InvoiceRef',    type: sql.NVarChar(50),  value: input.invoiceRef ?? null },
        { name: 'Amount',        type: sql.Decimal(18,2), value: input.amount },
        { name: 'Currency',      type: sql.NChar(3),      value: input.currency },
        { name: 'IssueDate',     type: sql.Date,          value: new Date(input.issueDate) },
        { name: 'SignatureType', type: sql.NVarChar(10),  value: input.signatureType },
        { name: 'Signatory1Id',  type: sql.Int,           value: input.signatory1Id ?? null },
        { name: 'Signatory2Id',  type: sql.Int,           value: input.signatory2Id ?? null },
        { name: 'Remarks',       type: sql.NVarChar(1000),value: input.remarks ?? null },
        { name: 'CreatedBy',     type: sql.NVarChar(100), value: ctx.user?.name ?? 'system' },
      ]);
    }),

  // ── Lifecycle Actions ─────────────────────────────────────────
  presentCheque: protectedProcedure
    .input(z.object({ chequeId: z.number(), presentedDate: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return execSPPOne('sp_PresentCheque', [
        { name: 'ChequeId',      type: sql.Int,  value: input.chequeId },
        { name: 'PresentedDate', type: sql.Date, value: new Date(input.presentedDate) },
        { name: 'UpdatedBy',     type: sql.NVarChar(100), value: ctx.user?.name ?? 'system' },
      ]);
    }),

  clearCheque: protectedProcedure
    .input(z.object({ chequeId: z.number(), clearedDate: z.string(), glClearedRef: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      return execSPPOne('sp_ClearCheque', [
        { name: 'ChequeId',     type: sql.Int,          value: input.chequeId },
        { name: 'ClearedDate',  type: sql.Date,         value: new Date(input.clearedDate) },
        { name: 'GlClearedRef', type: sql.NVarChar(50), value: input.glClearedRef ?? null },
        { name: 'UpdatedBy',    type: sql.NVarChar(100),value: ctx.user?.name ?? 'system' },
      ]);
    }),

  bounceCheque: protectedProcedure
    .input(z.object({
      chequeId:     z.number(),
      bouncedDate:  z.string(),
      bounceReason: z.string().min(1),
      bounceFee:    z.number().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      return execSPPOne('sp_BounceCheque', [
        { name: 'ChequeId',     type: sql.Int,           value: input.chequeId },
        { name: 'BouncedDate',  type: sql.Date,          value: new Date(input.bouncedDate) },
        { name: 'BounceReason', type: sql.NVarChar(500), value: input.bounceReason },
        { name: 'BounceFee',    type: sql.Decimal(18,2), value: input.bounceFee },
        { name: 'UpdatedBy',    type: sql.NVarChar(100), value: ctx.user?.name ?? 'system' },
      ]);
    }),

  voidCheque: protectedProcedure
    .input(z.object({ chequeId: z.number(), voidReason: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      return execSPPOne('sp_VoidCheque', [
        { name: 'ChequeId',   type: sql.Int,           value: input.chequeId },
        { name: 'VoidReason', type: sql.NVarChar(500), value: input.voidReason },
        { name: 'UpdatedBy',  type: sql.NVarChar(100), value: ctx.user?.name ?? 'system' },
      ]);
    }),

  reissueCheque: protectedProcedure
    .input(z.object({
      originalChequeId: z.number(),
      newChequeBookId:  z.number(),
      newChequeNumber:  z.string(),
      issueDate:        z.string(),
      signatory1Id:     z.number().optional(),
      signatory2Id:     z.number().optional(),
      signatureType:    z.enum(['Single','Dual']).default('Single'),
    }))
    .mutation(async ({ input, ctx }) => {
      return execSPPOne('sp_ReissueCheque', [
        { name: 'OriginalChequeId', type: sql.Int,          value: input.originalChequeId },
        { name: 'NewChequeBookId',  type: sql.Int,          value: input.newChequeBookId },
        { name: 'NewChequeNumber',  type: sql.NVarChar(20), value: input.newChequeNumber },
        { name: 'IssueDate',        type: sql.Date,         value: new Date(input.issueDate) },
        { name: 'Signatory1Id',     type: sql.Int,          value: input.signatory1Id ?? null },
        { name: 'Signatory2Id',     type: sql.Int,          value: input.signatory2Id ?? null },
        { name: 'SignatureType',    type: sql.NVarChar(10), value: input.signatureType },
        { name: 'CreatedBy',        type: sql.NVarChar(100),value: ctx.user?.name ?? 'system' },
      ]);
    }),

  // ── Stale Cheques ─────────────────────────────────────────────
  getStaleCheques: protectedProcedure
    .input(z.object({ staleDays: z.number().default(90) }).optional())
    .query(async ({ input }) => {
      return execSPP('sp_GetStaleCheques', [
        { name: 'StaleDays', type: sql.Int, value: input?.staleDays ?? 90 },
      ]);
    }),

  // ── Signatories ───────────────────────────────────────────────
  getSignatories: protectedProcedure
    .input(z.object({ isActive: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      return execSPP('sp_GetSignatories', [
        { name: 'IsActive', type: sql.Bit, value: input?.isActive ?? true },
      ]);
    }),

  upsertSignatory: protectedProcedure
    .input(z.object({
      signatoryId:    z.number().optional(),
      userName:       z.string().min(1),
      designation:    z.string().optional(),
      authorityLimit: z.number().default(0),
      isActive:       z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      return execSPPOne('sp_UpsertSignatory', [
        { name: 'SignatoryId',    type: sql.Int,           value: input.signatoryId ?? null },
        { name: 'UserName',       type: sql.NVarChar(100), value: input.userName },
        { name: 'Designation',    type: sql.NVarChar(100), value: input.designation ?? null },
        { name: 'AuthorityLimit', type: sql.Decimal(18,2), value: input.authorityLimit },
        { name: 'IsActive',       type: sql.Bit,           value: input.isActive },
      ]);
    }),
});
