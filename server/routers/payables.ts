/**
 * VodaLease Enterprise — Payables Router
 */
import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { execSPP, execSPPOne, sql } from '../db-sqlserver';
import { writeAuditLog, writeErrorLog } from '../audit';
import { TRPCError } from '@trpc/server';

export const payablesRouter = router({

  getInvoiceRegister: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(100),
      status: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_GetInvoiceRegister', [
        { name: 'PageNumber', type: sql.Int, value: input.page },
        { name: 'PageSize', type: sql.Int, value: input.pageSize },
        { name: 'StatusFilter', type: sql.VarChar(30), value: input.status || null },
        { name: 'SearchTerm', type: sql.NVarChar(200), value: input.search || null },
      ]);
      const totalCount = rows.length > 0 ? (rows[0] as any).total_count : 0;
      return { rows, totalCount, page: input.page, pageSize: input.pageSize };
    }),

  createInvoice: protectedProcedure
    .input(z.object({
      lessorId: z.number(),
      contractId: z.number().optional(),
      invoiceNumber: z.string(),
      invoiceDate: z.string(),
      periodMonth: z.number().min(1).max(12),
      periodYear: z.number(),
      rentAmount: z.number().default(0),
      serviceCharge: z.number().default(0),
      vat: z.number().default(0),
      total: z.number(),
      currency: z.string().length(3),
      glAccount: z.string().optional(),
      costCentre: z.string().optional(),
      dueDate: z.string(),
      ocrExtractedData: z.any().optional(),
      discrepancyFlag: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne<{ invoice_id: number; invoice_ref: string }>('sp_CreateInvoice', [
          { name: 'LessorId', type: sql.Int, value: input.lessorId },
          { name: 'ContractId', type: sql.Int, value: input.contractId || null },
          { name: 'InvoiceNumber', type: sql.VarChar(100), value: input.invoiceNumber },
          { name: 'InvoiceDate', type: sql.Date, value: input.invoiceDate },
          { name: 'PeriodMonth', type: sql.Int, value: input.periodMonth },
          { name: 'PeriodYear', type: sql.Int, value: input.periodYear },
          { name: 'RentAmount', type: sql.Decimal(18, 2), value: input.rentAmount },
          { name: 'ServiceCharge', type: sql.Decimal(18, 2), value: input.serviceCharge },
          { name: 'VAT', type: sql.Decimal(18, 2), value: input.vat },
          { name: 'Total', type: sql.Decimal(18, 2), value: input.total },
          { name: 'Currency', type: sql.Char(3), value: input.currency },
          { name: 'GLAccount', type: sql.VarChar(10), value: input.glAccount || null },
          { name: 'CostCentre', type: sql.VarChar(20), value: input.costCentre || null },
          { name: 'DueDate', type: sql.Date, value: input.dueDate },
          { name: 'OCRExtractedJson', type: sql.NVarChar(sql.MAX), value: input.ocrExtractedData ? JSON.stringify(input.ocrExtractedData) : null },
          { name: 'DiscrepancyFlag', type: sql.Bit, value: input.discrepancyFlag },
          { name: 'MakerId', type: sql.Int, value: ctx.user!.id },
          { name: 'ScreenId', type: sql.VarChar(20), value: 'VFPAYINVNEW0001P001' },
        ]);
        await writeAuditLog({
          userId: ctx.user!.id, username: ctx.user!.name || '', userRole: ctx.user!.role,
          module: 'Payables', subModule: 'Invoice', actionType: 'CREATE',
          recordTable: 'payables.invoices', recordId: String(result?.invoice_id),
          afterState: result, outcome: 'Success', screenId: 'VFPAYINVNEW0001P001', processStartTime: start,
        });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: 'Error', module: 'Payables', message: err.message, stackTrace: err.stack, screenId: 'VFPAYINVNEW0001P001' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
      }
    }),

  approveInvoice: protectedProcedure
    .input(z.object({
      invoiceId: z.number(),
      outcome: z.enum(['Approved', 'Rejected']),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      const result = await execSPPOne<{ new_status: string }>('sp_ApproveInvoice', [
        { name: 'InvoiceId', type: sql.Int, value: input.invoiceId },
        { name: 'CheckerId', type: sql.Int, value: ctx.user!.id },
        { name: 'Outcome', type: sql.VarChar(20), value: input.outcome },
        { name: 'Reason', type: sql.NVarChar(1000), value: input.reason || null },
        { name: 'ScreenId', type: sql.VarChar(20), value: 'VFPAYINVREG0001P001' },
      ]);
      await writeAuditLog({
        userId: ctx.user!.id, username: ctx.user!.name || '', userRole: ctx.user!.role,
        module: 'Payables', subModule: 'Invoice', actionType: input.outcome.toUpperCase(),
        recordTable: 'payables.invoices', recordId: String(input.invoiceId),
        afterState: result, outcome: 'Success', screenId: 'VFPAYINVREG0001P001', processStartTime: start,
      });
      return result;
    }),

  createPaymentRun: protectedProcedure
    .input(z.object({
      runDate: z.string(),
      currency: z.string().length(3),
      bankFileFormat: z.enum(['SWIFT', 'EFT']).default('SWIFT'),
      invoices: z.array(z.object({ invoice_id: z.number(), amount: z.number() })),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      const total = input.invoices.reduce((s, i) => s + i.amount, 0);
      try {
        const result = await execSPPOne<{ run_id: number; run_ref: string }>('sp_CreatePaymentRun', [
          { name: 'RunDate', type: sql.Date, value: input.runDate },
          { name: 'TotalAmount', type: sql.Decimal(18, 2), value: total },
          { name: 'Currency', type: sql.Char(3), value: input.currency },
          { name: 'BankFileFormat', type: sql.VarChar(10), value: input.bankFileFormat },
          { name: 'InvoiceIdsJson', type: sql.NVarChar(sql.MAX), value: JSON.stringify(input.invoices) },
          { name: 'MakerId', type: sql.Int, value: ctx.user!.id },
          { name: 'ScreenId', type: sql.VarChar(20), value: 'VFPAYPAYRUN0001P001' },
        ]);
        await writeAuditLog({
          userId: ctx.user!.id, username: ctx.user!.name || '', userRole: ctx.user!.role,
          module: 'Payables', subModule: 'PaymentRun', actionType: 'CREATE',
          recordTable: 'payables.payment_runs', recordId: String(result?.run_id),
          afterState: { run_ref: result?.run_ref, total, invoiceCount: input.invoices.length },
          outcome: 'Success', screenId: 'VFPAYPAYRUN0001P001', processStartTime: start,
        });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: 'Error', module: 'Payables', message: err.message, stackTrace: err.stack, screenId: 'VFPAYPAYRUN0001P001' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
      }
    }),
});
