/**
 * VodaLease Enterprise — Lease Management Router
 * All DB access via stored procedures through execSPP/execSPPOne
 */
import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { execSPP, execSPPOne, execSPPMulti, sql, getPool } from '../db-sqlserver';
import { writeAuditLog, writeErrorLog, extractClientInfo } from '../audit';
import { TRPCError } from '@trpc/server';
import { notifyOwner } from '../_core/notification';
import { queryCache } from '../query-cache';

export const leaseRouter = router({

  // ── LESSORS ─────────────────────────────────────────────
  getLessors: protectedProcedure
    .input(z.object({ search: z.string().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      return execSPP('sp_GetLessors', [
        { name: 'SearchTerm', type: sql.NVarChar(200), value: input.search || null },
        { name: 'Status', type: sql.VarChar(20), value: input.status || null },
      ]);
    }),

  createLessor: protectedProcedure
    .input(z.object({
      legalName: z.string().min(2),
      registrationNo: z.string().optional(),
      taxNo: z.string().optional(),
      country: z.string().length(2),
      currency: z.string().length(3),
      bankDetails: z.object({
        bankName: z.string().optional(),
        accountNo: z.string().optional(),
        swiftCode: z.string().optional(),
        iban: z.string().optional(),
      }).optional(),
      contacts: z.array(z.object({
        name: z.string(),
        role: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne<{ lessor_id: number; lessor_ref: string }>('sp_CreateLessor', [
          { name: 'LegalName', type: sql.NVarChar(300), value: input.legalName },
          { name: 'RegistrationNo', type: sql.VarChar(100), value: input.registrationNo || null },
          { name: 'TaxNo', type: sql.VarChar(100), value: input.taxNo || null },
          { name: 'Country', type: sql.Char(2), value: input.country },
          { name: 'Currency', type: sql.Char(3), value: input.currency },
          { name: 'BankDetailsEnc', type: sql.NVarChar(sql.MAX), value: input.bankDetails ? JSON.stringify(input.bankDetails) : null },
          { name: 'ContactJson', type: sql.NVarChar(sql.MAX), value: input.contacts ? JSON.stringify(input.contacts) : null },
          { name: 'CreatedBy', type: sql.Int, value: ctx.user!.id },
        ]);
        await writeAuditLog({
          userId: ctx.user!.id, username: ctx.user!.name || '', userRole: ctx.user!.role,
          module: 'Lease', subModule: 'Lessor', actionType: 'CREATE',
          recordTable: 'lease.lessors', recordId: String(result?.lessor_id),
          afterState: result, outcome: 'Success', screenId: 'VFLSELESREG0001P001', processStartTime: start,
        });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: 'Error', module: 'Lease', message: err.message, stackTrace: err.stack, screenId: 'VFLSELESREG0001P001' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
      }
    }),

  // ── LEASE REGISTER ──────────────────────────────────────
  getLeaseRegister: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(100),
      status: z.string().optional(),
      assetType: z.string().optional(),
      search: z.string().optional(),
      sortColumn: z.string().default('created_at'),
      sortDirection: z.enum(['ASC', 'DESC']).default('DESC'),
    }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_GetLeaseRegister', [
        { name: 'PageNumber', type: sql.Int, value: input.page },
        { name: 'PageSize', type: sql.Int, value: input.pageSize },
        { name: 'StatusFilter', type: sql.VarChar(30), value: input.status || null },
        { name: 'AssetType', type: sql.VarChar(50), value: input.assetType || null },
        { name: 'SearchTerm', type: sql.NVarChar(200), value: input.search || null },
        { name: 'SortColumn', type: sql.VarChar(50), value: input.sortColumn },
        { name: 'SortDirection', type: sql.VarChar(4), value: input.sortDirection },
      ]);
      const totalCount = rows.length > 0 ? (rows[0] as any).total_count : 0;
      return { rows, totalCount, page: input.page, pageSize: input.pageSize };
    }),

  getLeaseById: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .query(async ({ input }) => {
      const result = await execSPPOne('sp_GetLeaseById', [
        { name: 'ContractId', type: sql.Int, value: input.contractId },
      ]);
      if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lease not found' });
      return result;
    }),

  getAmortisationSchedule: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .query(async ({ input }) => {
      // SP returns 2 result sets: [0] contract header, [1] schedule rows
      let sets = await execSPPMulti('sp_GetAmortisationSchedule', [
        { name: 'ContractId', type: sql.Int, value: input.contractId },
      ]);
      let header   = sets[0]?.[0] ?? null;
      let schedule = sets[1] ?? [];
      // Auto-persist schedule if empty (contract has data but schedule not yet in DB)
      if (schedule.length === 0) {
        try {
          const pool = await getPool();
          const req = pool.request();
          req.input('ContractId', sql.Int, input.contractId);
          await req.execute('lease.sp_PersistAmortisationSchedule');
          // Re-fetch after persisting
          sets = await execSPPMulti('sp_GetAmortisationSchedule', [
            { name: 'ContractId', type: sql.Int, value: input.contractId },
          ]);
          header   = sets[0]?.[0] ?? null;
          schedule = sets[1] ?? [];
        } catch (e) {
          // If persist fails (e.g. no contract data), just return empty
          console.warn('[getAmortisationSchedule] Auto-persist failed:', (e as Error).message);
        }
      }
      return { header, schedule };
    }),

  persistAmortisationSchedule: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input('ContractId', sql.Int, input.contractId);
      const result = await req.execute('lease.sp_PersistAmortisationSchedule');
      return (result.recordset as any[])?.[0] ?? { rows_saved: 0, status: 'unknown' };
    }),

  getLeaseListForAmortisation: protectedProcedure
    .query(async () => {
      return execSPP('sp_GetLeaseListForAmortisation', []);
    }),

  getAmortisationScheduleAll: protectedProcedure
    .input(z.object({
      year:     z.number().default(0),
      viewMode: z.enum(['monthly', 'yearly']).default('monthly'),
    }))
    .query(async ({ input }) => {
      return execSPP('sp_GetAmortisationScheduleAll', [
        { name: 'Year',     type: sql.Int,          value: input.year },
        { name: 'ViewMode', type: sql.NVarChar(10),  value: input.viewMode },
      ]);
    }),

  getConsolidatedGLEntries: protectedProcedure
    .input(z.object({
      year:     z.number().default(0),
      viewMode: z.enum(['monthly', 'yearly']).default('monthly'),
    }))
    .query(async ({ input }) => {
      return execSPP('sp_GetConsolidatedGLEntries', [
        { name: 'Year',     type: sql.Int,          value: input.year },
        { name: 'ViewMode', type: sql.NVarChar(10),  value: input.viewMode },
      ]);
    }),

  // ── CREATE LEASE ────────────────────────────────────────
  createLease: protectedProcedure
    .input(z.object({
      lessorId: z.number(),
      assetType: z.string(),
      assetDescription: z.string(),
      assetTag: z.string().optional(),
      location: z.object({
        address: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
      }).optional(),
      commencementDate: z.string(),
      expiryDate: z.string(),
      termMonths: z.number(),
      monthlyPayment: z.number(),
      currency: z.string().length(3),
      escalationRate: z.number().default(0),
      escalationDate: z.string().optional(),
      ibr: z.number(),
      depositAmount: z.number().default(0),
      ifrs16Classification: z.enum(['Finance', 'Operating', 'ShortTerm', 'LowValue']).default('Finance'),
      renewalOption: z.boolean().default(false),
      renewalCertain: z.boolean().default(false),
      purchaseOption: z.boolean().default(false),
      purchaseCertain: z.boolean().default(false),
      makeGoodObligation: z.boolean().default(false),
      makeGoodEstimate: z.number().default(0),
      initialDirectCosts: z.number().default(0),
      leaseIncentives: z.number().default(0),
      isLTO: z.boolean().default(false),
      ltoPurchasePrice: z.number().optional(),
      ltoDeposit: z.number().optional(),
      ltoNetFinanced: z.number().optional(),
      ltoTotalInstalments: z.number().optional(),
      ltoInstalmentAmount: z.number().optional(),
      ltoFrequency: z.string().optional(),
      ltoFinanceChargeRate: z.number().optional(),
      ltoBalloonAmount: z.number().optional(),
      ltoTransferDate: z.string().optional(),
      maintenanceResponsibility: z.enum(['Vodafone', 'Lessor', 'Shared']).default('Lessor'),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne<{ contract_id: number; contract_ref: string }>('sp_CreateLease', [
          { name: 'LessorId', type: sql.Int, value: input.lessorId },
          { name: 'AssetType', type: sql.VarChar(50), value: input.assetType },
          { name: 'AssetDescription', type: sql.NVarChar(500), value: input.assetDescription },
          { name: 'AssetTag', type: sql.VarChar(100), value: input.assetTag || null },
          { name: 'LocationJson', type: sql.NVarChar(sql.MAX), value: input.location ? JSON.stringify(input.location) : null },
          { name: 'CommencementDate', type: sql.Date, value: input.commencementDate },
          { name: 'ExpiryDate', type: sql.Date, value: input.expiryDate },
          { name: 'TermMonths', type: sql.Int, value: input.termMonths },
          { name: 'MonthlyPayment', type: sql.Decimal(18, 2), value: input.monthlyPayment },
          { name: 'Currency', type: sql.Char(3), value: input.currency },
          { name: 'EscalationRate', type: sql.Decimal(8, 4), value: input.escalationRate },
          { name: 'EscalationDate', type: sql.Date, value: input.escalationDate || null },
          { name: 'IBR', type: sql.Decimal(8, 6), value: input.ibr },
          { name: 'DepositAmount', type: sql.Decimal(18, 2), value: input.depositAmount },
          { name: 'IFRS16Classification', type: sql.VarChar(20), value: input.ifrs16Classification },
          { name: 'RenewalOption', type: sql.Bit, value: input.renewalOption },
          { name: 'RenewalCertain', type: sql.Bit, value: input.renewalCertain },
          { name: 'PurchaseOption', type: sql.Bit, value: input.purchaseOption },
          { name: 'PurchaseCertain', type: sql.Bit, value: input.purchaseCertain },
          { name: 'MakeGoodObligation', type: sql.Bit, value: input.makeGoodObligation },
          { name: 'MakeGoodEstimate', type: sql.Decimal(18, 2), value: input.makeGoodEstimate },
          { name: 'InitialDirectCosts', type: sql.Decimal(18, 2), value: input.initialDirectCosts },
          { name: 'LeaseIncentives', type: sql.Decimal(18, 2), value: input.leaseIncentives },
          { name: 'IsLTO', type: sql.Bit, value: input.isLTO },
          { name: 'LTOPurchasePrice', type: sql.Decimal(18, 2), value: input.ltoPurchasePrice || null },
          { name: 'LTODeposit', type: sql.Decimal(18, 2), value: input.ltoDeposit || null },
          { name: 'LTONetFinanced', type: sql.Decimal(18, 2), value: input.ltoNetFinanced || null },
          { name: 'LTOTotalInstalments', type: sql.Int, value: input.ltoTotalInstalments || null },
          { name: 'LTOInstalmentAmount', type: sql.Decimal(18, 2), value: input.ltoInstalmentAmount || null },
          { name: 'LTOFrequency', type: sql.VarChar(20), value: input.ltoFrequency || null },
          { name: 'LTOFinanceChargeRate', type: sql.Decimal(8, 6), value: input.ltoFinanceChargeRate || null },
          { name: 'LTOBalloonAmount', type: sql.Decimal(18, 2), value: input.ltoBalloonAmount || null },
          { name: 'LTOTransferDate', type: sql.Date, value: input.ltoTransferDate || null },
          { name: 'MaintenanceResp', type: sql.VarChar(20), value: input.maintenanceResponsibility },
          { name: 'MakerId', type: sql.Int, value: ctx.user!.id },
          { name: 'ScreenId', type: sql.VarChar(20), value: 'VFLSENEWLSE0001P001' },
          { name: 'ProcessStartTime', type: sql.DateTime2, value: start },
        ]);
        await writeAuditLog({
          userId: ctx.user!.id, username: ctx.user!.name || '', userRole: ctx.user!.role,
          module: 'Lease', subModule: 'Origination', actionType: 'CREATE',
          recordTable: 'lease.contracts', recordId: String(result?.contract_id),
          afterState: { contract_ref: result?.contract_ref }, outcome: 'Success',
          screenId: 'VFLSENEWLSE0001P001', processStartTime: start,
        });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: 'Error', module: 'Lease', message: err.message, stackTrace: err.stack, screenId: 'VFLSENEWLSE0001P001' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
      }
    }),

  updateLease: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      assetType: z.string(),
      assetDescription: z.string(),
      assetTag: z.string().optional(),
      location: z.object({ address: z.string().optional(), country: z.string().optional(), coordinates: z.object({ lat: z.number(), lng: z.number() }).optional() }).optional(),
      commencementDate: z.string(),
      expiryDate: z.string(),
      termMonths: z.number(),
      monthlyPayment: z.number(),
      currency: z.string().length(3),
      ibr: z.number(),
      escalationRate: z.number().default(0),
      depositAmount: z.number().default(0),
      maintenanceResponsibility: z.enum(['Vodafone', 'Lessor', 'Shared']).default('Lessor'),
      isLTO: z.boolean().default(false),
      ltoPurchasePrice: z.number().optional(),
      ltoDeposit: z.number().optional(),
      ltoTotalInstalments: z.number().optional(),
      ltoFinanceChargeRate: z.number().optional(),
      ltoBalloonAmount: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne<{ contract_id: number; status: string }>('sp_UpdateLeaseContract', [
          { name: 'ContractId', type: sql.Int, value: input.contractId },
          { name: 'AssetType', type: sql.VarChar(50), value: input.assetType },
          { name: 'AssetDescription', type: sql.NVarChar(500), value: input.assetDescription },
          { name: 'AssetTag', type: sql.VarChar(100), value: input.assetTag || null },
          { name: 'LocationJson', type: sql.NVarChar(sql.MAX), value: input.location ? JSON.stringify(input.location) : null },
          { name: 'CommencementDate', type: sql.Date, value: input.commencementDate },
          { name: 'ExpiryDate', type: sql.Date, value: input.expiryDate },
          { name: 'TermMonths', type: sql.Int, value: input.termMonths },
          { name: 'MonthlyPayment', type: sql.Decimal(18, 2), value: input.monthlyPayment },
          { name: 'Currency', type: sql.Char(3), value: input.currency },
          { name: 'IBR', type: sql.Decimal(8, 6), value: input.ibr },
          { name: 'EscalationRate', type: sql.Decimal(8, 4), value: input.escalationRate },
          { name: 'DepositAmount', type: sql.Decimal(18, 2), value: input.depositAmount },
          { name: 'MaintenanceResp', type: sql.VarChar(20), value: input.maintenanceResponsibility },
          { name: 'IsLTO', type: sql.Bit, value: input.isLTO },
          { name: 'LTOPurchasePrice', type: sql.Decimal(18, 2), value: input.ltoPurchasePrice || null },
          { name: 'LTODeposit', type: sql.Decimal(18, 2), value: input.ltoDeposit || null },
          { name: 'LTOTotalInstalments', type: sql.Int, value: input.ltoTotalInstalments || null },
          { name: 'LTOFinanceChargeRate', type: sql.Decimal(8, 6), value: input.ltoFinanceChargeRate || null },
          { name: 'LTOBalloonAmount', type: sql.Decimal(18, 2), value: input.ltoBalloonAmount || null },
          { name: 'UpdatedBy', type: sql.Int, value: ctx.user!.id },
        ]);
        await writeAuditLog({
          userId: ctx.user!.id, username: ctx.user!.name || '', userRole: ctx.user!.role,
          module: 'Lease', subModule: 'Modification', actionType: 'UPDATE',
          recordTable: 'lease.contracts', recordId: String(input.contractId),
          afterState: { contract_id: input.contractId }, outcome: 'Success',
          screenId: 'VFLNEWLEA0001P001', processStartTime: start,
        });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: 'Error', module: 'Lease', message: err.message, stackTrace: err.stack, screenId: 'VFLNEWLEA0001P001' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
      }
    }),

  updateLeaseROU: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      rouAssetValue: z.number(),
      leaseLiabilityCommence: z.number(),
    }))
    .mutation(async ({ input }) => {
      await execSPPOne('sp_UpdateLeaseROU', [
        { name: 'ContractId', type: sql.Int, value: input.contractId },
        { name: 'ROUAssetValue', type: sql.Decimal(18, 2), value: input.rouAssetValue },
        { name: 'LeaseLiabilityCommence', type: sql.Decimal(18, 2), value: input.leaseLiabilityCommence },
      ]);
      return { success: true };
    }),

  saveAmortisationSchedule: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      schedule: z.array(z.object({
        period_date: z.string(),
        opening_liability: z.number(),
        interest_expense: z.number(),
        payment: z.number(),
        principal: z.number(),
        closing_liability: z.number(),
        rou_nbv: z.number(),
        depreciation: z.number(),
        cumulative_depr: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const result = await execSPPOne<{ rows_inserted: number }>('sp_SaveAmortisationSchedule', [
        { name: 'ContractId', type: sql.Int, value: input.contractId },
        { name: 'ScheduleJson', type: sql.NVarChar(sql.MAX), value: JSON.stringify(input.schedule) },
      ]);
      return result;
    }),

  submitForApproval: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const result = await execSPPOne<{ queue_ref: string }>('sp_SubmitLeaseForApproval', [
        { name: 'ContractId', type: sql.Int, value: input.contractId },
        { name: 'MakerId', type: sql.Int, value: ctx.user!.id },
        { name: 'ScreenId', type: sql.VarChar(20), value: 'VFLSENEWLSE0001P001' },
      ]);
      return result;
    }),

  approveRejectLease: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      outcome: z.enum(['Approved', 'Rejected']),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      const result = await execSPPOne<{ new_status: string }>('sp_ApproveRejectLease', [
        { name: 'ContractId', type: sql.Int, value: input.contractId },
        { name: 'CheckerId', type: sql.Int, value: ctx.user!.id },
        { name: 'Outcome', type: sql.VarChar(20), value: input.outcome },
        { name: 'Reason', type: sql.NVarChar(1000), value: input.reason || null },
        { name: 'ScreenId', type: sql.VarChar(20), value: 'VFMCQUEUE0001P001' },
      ]);
      await writeAuditLog({
        userId: ctx.user!.id, username: ctx.user!.name || '', userRole: ctx.user!.role,
        module: 'Lease', subModule: 'Approval', actionType: input.outcome.toUpperCase(),
        recordTable: 'lease.contracts', recordId: String(input.contractId),
        afterState: result, outcome: 'Success', screenId: 'VFMCQUEUE0001P001', processStartTime: start,
      });
      return result;
    }),

  // ── LESSEE DETAILS (Screen: VFLSNEWLS0002P001) ─────────
  upsertLesseeDetails: protectedProcedure
    .input(z.object({
      contractId:   z.number().int(),
      lesseeType:   z.enum(['Staff', 'Client', 'Other']),
      lesseeName:   z.string().min(1),
      staffNumber:  z.string().optional(),
      employeeId:   z.string().optional(),
      grade:        z.string().optional(),
      position:     z.string().optional(),
      department:   z.string().optional(),
      placeOfWork:  z.string().optional(),
      contactEmail: z.string().optional(),
      contactPhone: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const rows = await execSPP('sp_UpsertLeaseLesseeDetails', [
          { name: 'contract_id',   type: sql.Int,           value: input.contractId },
          { name: 'lessee_type',   type: sql.NVarChar(20),  value: input.lesseeType },
          { name: 'lessee_name',   type: sql.NVarChar(200), value: input.lesseeName },
          { name: 'staff_number',  type: sql.NVarChar(50),  value: input.staffNumber  ?? null },
          { name: 'employee_id',   type: sql.NVarChar(50),  value: input.employeeId   ?? null },
          { name: 'grade',         type: sql.NVarChar(50),  value: input.grade        ?? null },
          { name: 'position',      type: sql.NVarChar(100), value: input.position     ?? null },
          { name: 'department',    type: sql.NVarChar(100), value: input.department   ?? null },
          { name: 'place_of_work', type: sql.NVarChar(200), value: input.placeOfWork  ?? null },
          { name: 'contact_email', type: sql.NVarChar(200), value: input.contactEmail ?? null },
          { name: 'contact_phone', type: sql.NVarChar(50),  value: input.contactPhone ?? null },
        ]);
        await writeAuditLog({
          userId: ctx.user!.id, username: ctx.user!.name || '', userRole: ctx.user!.role,
          module: 'Lease', subModule: 'LesseeDetails', actionType: 'UPSERT',
          recordTable: 'lease.lease_lessee_details', recordId: String(input.contractId),
          afterState: rows[0] ?? {}, outcome: 'Success',
          screenId: 'VFLSNEWLS0002P001', processStartTime: start,
        });
        return rows[0] ?? null;
      } catch (err: any) {
        await writeErrorLog({ severity: 'Error', module: 'Lease', message: err.message, stackTrace: err.stack, screenId: 'VFLSNEWLS0002P001' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
      }
    }),

  getLesseeDetails: protectedProcedure
    .input(z.object({ contractId: z.number().int() }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_GetLeaseLesseeDetails', [
        { name: 'contract_id', type: sql.Int, value: input.contractId },
      ]);
      if (!rows.length) return null;
      const r = rows[0] as any;
      return {
        lesseeDetailId: r.lessee_detail_id as number,
        contractId:     r.contract_id      as number,
        lesseeType:     r.lessee_type      as string,
        lesseeName:     r.lessee_name      as string,
        staffNumber:    r.staff_number     as string | null,
        employeeId:     r.employee_id      as string | null,
        grade:          r.grade            as string | null,
        position:       r.position         as string | null,
        department:     r.department       as string | null,
        placeOfWork:    r.place_of_work    as string | null,
        contactEmail:   r.contact_email    as string | null,
        contactPhone:   r.contact_phone    as string | null,
        createdAt:      r.created_at       as string,
        updatedAt:      r.updated_at       as string,
      };
    }),

  // ── INSURANCE ───────────────────────────────────────────
  getInsurancePolicies: protectedProcedure
    .input(z.object({ contractId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      return execSPP('sp_GetInsurancePolicies', [
        { name: 'ContractId', type: sql.Int, value: input.contractId || null },
        { name: 'Status', type: sql.VarChar(20), value: input.status || null },
      ]);
    }),

  // ── MAINTENANCE ─────────────────────────────────────────
  getMaintenanceTickets: protectedProcedure
    .input(z.object({ contractId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      return execSPP('sp_GetMaintenanceTickets', [
        { name: 'ContractId', type: sql.Int, value: input.contractId || null },
        { name: 'Status', type: sql.VarChar(20), value: input.status || null },
      ]);
    }),

  // ── SOFT DELETE ──────────────────────────────────────────────────────────
  deleteLease: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await execSPP('sp_SoftDeleteContract', [
        { name: 'ContractId', type: sql.Int,         value: input.contractId },
        { name: 'MakerId',    type: sql.Int,         value: ctx.user.id },
        { name: 'ScreenId',   type: sql.VarChar(50), value: 'VFLSLSREG0001P001' },
      ]);
      return { success: true };
    }),

  // ── HARD DELETE (lease + JVs + all child records) ──────────────────────
  hardDeleteLease: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("contract_id", input.contractId);
      const result = await req.execute("lease.sp_HardDeleteLease");
      const row = (result.recordset as any[])?.[0] ?? null;
      // Invalidate all lease-related caches so the UI refreshes immediately
      queryCache.invalidateProcedure('sp_GetLeaseRegister');
      queryCache.invalidateProcedure('sp_GetLeaseById');
      queryCache.invalidateProcedure('sp_GetRenewalDueCount');
      queryCache.invalidateProcedure('sp_GetRenewalDueLeases');
      queryCache.invalidateProcedure('sp_GetDashboardInsights');
      queryCache.invalidateProcedure('sp_GetMISLeasePortfolio');
      queryCache.invalidateProcedure('sp_GetLeaseTransactionHistory');
      return row;
    }),

  // ── CALCULATE AMORTISATION (ALL LEASES) ─────────────────────────────────
  calculateAmortisationAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      const result = await execSPPOne('sp_CalculateAmortisationAll', [
        { name: 'MakerId',  type: sql.Int,         value: ctx.user.id },
        { name: 'ScreenId', type: sql.VarChar(50), value: 'VFLAMORT0001P001' },
      ]);
      return {
        contracts_processed: (result as any)?.contracts_processed ?? 0,
        rows_inserted:       (result as any)?.rows_inserted       ?? 0,
      };
    }),

  // ── LIFECYCLE: ORIGINATE ──────────────────────────────────────────────────
  originateLease: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const result = await execSPPOne('lease.sp_OriginateLease', [
        { name: 'ContractId', type: sql.Int,           value: input.contractId },
        { name: 'PostedBy',   type: sql.NVarChar(100), value: ctx.user.name ?? ctx.user.email ?? 'system' },
      ]);
      return result as { result: string; opening_liability: number; periods_generated: number };
    }),

  // ── LIFECYCLE: POST PERIOD ────────────────────────────────────────────────
  postPeriod: protectedProcedure
    .input(z.object({ contractId: z.number(), periodDate: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await execSPPOne('lease.sp_PostPeriod', [
        { name: 'ContractId', type: sql.Int,           value: input.contractId },
        { name: 'PeriodDate', type: sql.Date,          value: new Date(input.periodDate) },
        { name: 'PostedBy',   type: sql.NVarChar(100), value: ctx.user.name ?? ctx.user.email ?? 'system' },
      ]);
      return result as { result: string; period_posted: string; interest: number; payment: number; depreciation: number };
    }),

  // ── LIFECYCLE: MODIFY LEASE ───────────────────────────────────────────────
  modifyLease: protectedProcedure
    .input(z.object({
      contractId:        z.number(),
      newMonthlyPayment: z.number(),
      effectiveDate:     z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await execSPPOne('lease.sp_ModifyLease', [
        { name: 'ContractId',        type: sql.Int,           value: input.contractId },
        { name: 'NewMonthlyPayment', type: sql.Decimal(18,2), value: input.newMonthlyPayment },
        { name: 'EffectiveDate',     type: sql.Date,          value: new Date(input.effectiveDate) },
        { name: 'PostedBy',          type: sql.NVarChar(100), value: ctx.user.name ?? ctx.user.email ?? 'system' },
      ]);
      return result as { result: string; old_liability: number; new_liability: number; remeasurement_amount: number; periods_regenerated: number };
    }),

  // ── LIFECYCLE: CLOSE LEASE ────────────────────────────────────────────────
  closeLease: protectedProcedure
    .input(z.object({ contractId: z.number(), closeDate: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await execSPPOne('lease.sp_CloseLease', [
        { name: 'ContractId', type: sql.Int,           value: input.contractId },
        { name: 'CloseDate',  type: sql.Date,          value: new Date(input.closeDate) },
        { name: 'PostedBy',   type: sql.NVarChar(100), value: ctx.user.name ?? ctx.user.email ?? 'system' },
      ]);
      return result as { result: string; remaining_liability: number; rou_nbv: number; gain_loss: number };
    }),

  // ── LIFECYCLE: GET SCHEDULE WITH STATUS ──────────────────────────────────
  getLeaseLifecycle: protectedProcedure
    .input(z.object({ contractId: z.number().optional(), year: z.number().optional() }))
    .query(async ({ input }) => {
      return execSPP('lease.sp_GetLeaseLifecycle', [
        { name: 'ContractId', type: sql.Int, value: input.contractId ?? null },
        { name: 'Year',       type: sql.Int, value: input.year       ?? null },
      ]);
    }),

  // ── LIFECYCLE: GET GL POSTINGS LEDGER ────────────────────────────────────
  getGLPostings: protectedProcedure
    .input(z.object({
      contractId: z.number().optional(),
      jeRef:      z.string().optional(),
      fromDate:   z.string().optional(),
      toDate:     z.string().optional(),
    }))
    .query(async ({ input }) => {
      return execSPP('lease.sp_GetGLPostings', [
        { name: 'ContractId', type: sql.Int,           value: input.contractId ?? null },
        { name: 'JeRef',      type: sql.NVarChar(10),  value: input.jeRef      ?? null },
        { name: 'FromDate',   type: sql.Date,          value: input.fromDate ? new Date(input.fromDate) : null },
        { name: 'ToDate',     type: sql.Date,          value: input.toDate   ? new Date(input.toDate)   : null },
      ]);
    }),

  // ── FEATURE 1: IFRS 16 DISCLOSURE NOTES ─────────────────────────────────
  getDisclosureNotes: protectedProcedure
    .input(z.object({ reportingYear: z.number() }))
    .query(async ({ input }) => {
      const result = await execSPPMulti('sp_GetIFRS16DisclosureNotes', [
        { name: 'ReportingYear', type: sql.Int, value: input.reportingYear },
      ]);
      return {
        maturityAnalysis:        (result[0] ?? []) as Record<string, unknown>[],
        rouMovement:             (result[1] ?? []) as Record<string, unknown>[],
        liabilityReconciliation: (result[2]?.[0] ?? {}) as Record<string, unknown>,
        keyAssumptions:          (result[3]?.[0] ?? {}) as Record<string, unknown>,
      };
    }),

  // ── FEATURE 2: RENEWALS ──────────────────────────────────────────────────
  getRenewals: protectedProcedure
    .input(z.object({ status: z.string().optional(), contractId: z.number().optional() }))
    .query(async ({ input }) => {
      return execSPP('sp_GetRenewals', [
        { name: 'Status',     type: sql.NVarChar(20), value: input.status     ?? null },
        { name: 'ContractId', type: sql.Int,          value: input.contractId ?? null },
      ]);
    }),

  initiateRenewal: protectedProcedure
    .input(z.object({
      contractId:        z.number(),
      newExpiryDate:     z.string(),
      newMonthlyPayment: z.number(),
      newTermMonths:     z.number(),
      newIBR:            z.number(),
      notes:             z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await execSPPOne('sp_InitiateRenewal', [
        { name: 'ContractId',        type: sql.Int,           value: input.contractId },
        { name: 'NewExpiryDate',     type: sql.Date,          value: new Date(input.newExpiryDate) },
        { name: 'NewMonthlyPayment', type: sql.Decimal(18,2), value: input.newMonthlyPayment },
        { name: 'NewTermMonths',     type: sql.Int,           value: input.newTermMonths },
        { name: 'NewIBR',            type: sql.Decimal(8,6),  value: input.newIBR },
        { name: 'Notes',             type: sql.NVarChar(500), value: input.notes ?? null },
        { name: 'CreatedBy',         type: sql.NVarChar(100), value: ctx.user.name ?? 'system' },
      ]) as { result: string; renewal_id: number; message: string };
      if (result.result !== 'OK') throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      return result;
    }),

  approveRenewal: protectedProcedure
    .input(z.object({ renewalId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const result = await execSPPOne('sp_ApproveRenewal', [
        { name: 'RenewalId',  type: sql.Int,           value: input.renewalId },
        { name: 'ApprovedBy', type: sql.NVarChar(100), value: ctx.user.name ?? 'system' },
      ]) as { result: string; message: string };
      if (result.result !== 'OK') throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      return result;
    }),

  rejectRenewal: protectedProcedure
    .input(z.object({ renewalId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const result = await execSPPOne('sp_RejectRenewal', [
        { name: 'RenewalId',   type: sql.Int,           value: input.renewalId },
        { name: 'RejectedBy',  type: sql.NVarChar(100), value: ctx.user.name ?? 'system' },
      ]) as { result: string; message: string };
      if (result.result !== 'OK') throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      return result;
    }),

  // ── FEATURE 3: PERIOD-END CLOSE ──────────────────────────────────────────
  getPeriodCloseStatus: protectedProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      return execSPP('sp_GetPeriodCloseStatus', [
        { name: 'Year', type: sql.Int, value: input.year },
      ]);
    }),

  closePeriod: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await execSPPOne('sp_ClosePeriod', [
        { name: 'Year',     type: sql.Int,           value: input.year },
        { name: 'Month',    type: sql.Int,           value: input.month },
        { name: 'ClosedBy', type: sql.NVarChar(100), value: ctx.user.name ?? 'system' },
        { name: 'Notes',    type: sql.NVarChar(500), value: input.notes ?? null },
      ]) as { result: string; message: string };
      if (result.result !== 'OK') throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      return result;
    }),

  reopenPeriod: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const result = await execSPPOne('sp_ReopenPeriod', [
        { name: 'Year',       type: sql.Int,           value: input.year },
        { name: 'Month',      type: sql.Int,           value: input.month },
        { name: 'ReopenedBy', type: sql.NVarChar(100), value: ctx.user.name ?? 'system' },
      ]) as { result: string; message: string };
      if (result.result !== 'OK') throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      return result;
    }),

  // ── FEATURE 4: IAS 17 COMPARISON ─────────────────────────────────────────
  getIAS17Comparison: protectedProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const result = await execSPPMulti('sp_GetIAS17Comparison', [
        { name: 'Year', type: sql.Int, value: input.year },
      ]);
      return {
        leases:  (result[0] ?? []) as Record<string, unknown>[],
        summary: (result[1]?.[0] ?? {}) as Record<string, unknown>,
      };
    }),

  // ── FEATURE 5: FX REVALUATION ───────────────────────────────────────────
  getFXRates: protectedProcedure
    .input(z.object({ currency: z.string().optional() }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_GetFXRates', [
        { name: 'Currency', type: sql.NVarChar(3), value: input.currency ?? null },
      ]);
      return rows as Record<string, unknown>[];
    }),

  upsertFXRate: protectedProcedure
    .input(z.object({
      currency:    z.string().length(3),
      rateDate:    z.string(),
      closingRate: z.number().positive(),
      source:      z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await execSPPOne('sp_UpsertFXRate', [
        { name: 'Currency',    type: sql.NVarChar(3),    value: input.currency },
        { name: 'RateDate',    type: sql.Date,            value: new Date(input.rateDate) },
        { name: 'ClosingRate', type: sql.Decimal(18, 6),  value: input.closingRate },
        { name: 'Source',      type: sql.NVarChar(50),    value: input.source ?? null },
      ]) as { result: string; message: string };
      if (result.result !== 'OK') throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      return result;
    }),

  runFXRevaluation: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const result = await execSPPOne('sp_RunFXRevaluation', [
        { name: 'Year',     type: sql.Int,           value: input.year },
        { name: 'Month',    type: sql.Int,           value: input.month },
        { name: 'PostedBy', type: sql.NVarChar(100), value: ctx.user.name ?? 'system' },
      ]) as { result: string; message: string; revalued_count: number };
      if (result.result !== 'OK') throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      return result;
    }),

  getFXRevaluationLog: protectedProcedure
    .input(z.object({
      year:       z.number().optional(),
      month:      z.number().optional(),
      contractId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_GetFXRevaluationLog', [
        { name: 'Year',       type: sql.Int, value: input.year       ?? null },
        { name: 'Month',      type: sql.Int, value: input.month      ?? null },
        { name: 'ContractId', type: sql.Int, value: input.contractId ?? null },
      ]);
      return rows as Record<string, unknown>[];
    }),

  getFXRevaluationSummary: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(async ({ input }) => {
      const row = await execSPPOne('sp_GetFXRevaluationSummary', [
        { name: 'Year',  type: sql.Int, value: input.year },
        { name: 'Month', type: sql.Int, value: input.month },
      ]);
      return (row ?? {}) as Record<string, unknown>;
    }),

  // ── Feature 6: Renewal Due Badge Counter ─────────────────────────────────

  /** Returns count of active leases expiring within 90 days with no pending/approved renewal */
  getRenewalDueCount: protectedProcedure
    .query(async () => {
      const row = await execSPPOne('sp_GetRenewalDueCount', []);
      return { count: (row as any)?.renewal_due_count ?? 0 };
    }),

  /**
   * Checks for leases newly entering the 90-day window (not yet notified),
   * sends an owner notification for each, and marks them as notified.
   * Safe to call on every DashboardLayout mount — idempotent.
   */
  checkAndNotifyRenewalDue: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
      type RenewalDueLease = {
        contract_id: number;
        contract_ref: string;
        asset_description: string;
        currency: string;
        monthly_payment: number;
        expiry_date: string;
        days_remaining: number;
        lessor_name: string;
        lifecycle_status: string;
      };

      const leases = await execSPP('sp_GetRenewalDueLeases', []) as RenewalDueLease[];
      if (!leases || leases.length === 0) return { notified: 0 };

      const leaseLines = leases.map(l =>
        `• ${l.contract_ref} — ${l.lessor_name} | Expires: ${l.expiry_date} (${l.days_remaining} days remaining)`
      ).join('\n');

      const title = `⚠️ ${leases.length} Lease${leases.length > 1 ? 's' : ''} Due for Renewal (within 90 days)`;
      const content = [
        `The following lease${leases.length > 1 ? 's have' : ' has'} entered the 90-day renewal window and require${leases.length === 1 ? 's' : ''} action:`,
        '',
        leaseLines,
        '',
        'Please review and initiate renewal workflows in the Renewal Engine.',
      ].join('\n');

      try {
        await notifyOwner({ title, content });
      } catch (e) {
        await writeErrorLog({ severity: 'Warning', module: 'Lease', screenId: 'RENEWAL_BADGE', message: String(e) });
      }

      for (const lease of leases) {
        try {
          await execSPPOne('sp_MarkRenewalNotified', [
            { name: 'ContractId',    type: sql.Int,          value: lease.contract_id },
            { name: 'ContractRef',   type: sql.NVarChar(50), value: lease.contract_ref },
            { name: 'DaysRemaining', type: sql.Int,          value: lease.days_remaining },
            { name: 'ExpiryDate',    type: sql.Date,         value: new Date(lease.expiry_date) },
          ]);
        } catch (_) { /* continue even if one mark fails */ }
      }

      return { notified: leases.length };
      } catch (err: any) {
        // Never surface renewal-check errors to the frontend — log and return gracefully
        try { await writeErrorLog({ severity: 'Warning', module: 'Lease', screenId: 'RENEWAL_BADGE', message: err.message ?? String(err) }); } catch (_) {}
        return { notified: 0 };
      }
    }),

  // ── LEASE TRANSACTION CENTRE ─────────────────────────────────────────────

  getLeasesForTransaction: protectedProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_GetLeasesForTransaction', [
        { name: 'Search', type: sql.NVarChar(100), value: input.search ?? null },
      ]);
      return rows as Array<{
        contract_id: number; contract_ref: string; asset_description: string;
        asset_type: string; commencement_date: Date; expiry_date: Date;
        term_months: number; monthly_payment: number; currency: string;
        ibr: number; lifecycle_status: string; status: string;
        current_liability: number; current_rou_nbv: number;
        last_period_date: Date; remaining_months: number;
        lessor_name: string; pending_drafts: number;
      }>;
    }),

  previewModification: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      newMonthlyPayment: z.number(),
      effectiveDate: z.string(),
      newIBR: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const results = await execSPPMulti('sp_PreviewModification', [
        { name: 'ContractId',        type: sql.Int,           value: input.contractId },
        { name: 'NewMonthlyPayment', type: sql.Decimal(18,2), value: input.newMonthlyPayment },
        { name: 'EffectiveDate',     type: sql.Date,          value: new Date(input.effectiveDate) },
        { name: 'NewIBR',            type: sql.Decimal(8,6),  value: input.newIBR ?? null },
      ]);
      return {
        summary:  (results[0] ?? [])[0] as Record<string, unknown>,
        jeLines:  (results[1] ?? []) as Array<Record<string, unknown>>,
        schedule: (results[2] ?? []) as Array<Record<string, unknown>>,
      };
    }),

  previewTermination: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      terminationDate: z.string(),
    }))
    .query(async ({ input }) => {
      const results = await execSPPMulti('sp_PreviewTermination', [
        { name: 'ContractId',      type: sql.Int,  value: input.contractId },
        { name: 'TerminationDate', type: sql.Date, value: new Date(input.terminationDate) },
      ]);
      return {
        summary: (results[0] ?? [])[0] as Record<string, unknown>,
        jeLines: (results[1] ?? []) as Array<Record<string, unknown>>,
      };
    }),

  previewRenewal: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      newExpiryDate: z.string(),
      newMonthlyPayment: z.number(),
      newIBR: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const results = await execSPPMulti('sp_PreviewRenewal_v2', [
        { name: 'ContractId',        type: sql.Int,           value: input.contractId },
        { name: 'NewExpiryDate',     type: sql.Date,          value: new Date(input.newExpiryDate) },
        { name: 'NewMonthlyPayment', type: sql.Decimal(18,2), value: input.newMonthlyPayment },
        { name: 'NewIBR',            type: sql.Decimal(8,6),  value: input.newIBR ?? null },
      ]);
      return {
        summary:  (results[0] ?? [])[0] as Record<string, unknown>,
        jeLines:  (results[1] ?? []) as Array<Record<string, unknown>>,
        schedule: (results[2] ?? []) as Array<Record<string, unknown>>,
      };
    }),

  previewPurchase: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      purchaseDate: z.string(),
      purchasePrice: z.number(),
    }))
    .query(async ({ input }) => {
      const results = await execSPPMulti('sp_PreviewPurchase', [
        { name: 'ContractId',    type: sql.Int,           value: input.contractId },
        { name: 'PurchaseDate',  type: sql.Date,          value: new Date(input.purchaseDate) },
        { name: 'PurchasePrice', type: sql.Decimal(18,2), value: input.purchasePrice },
      ]);
      return {
        summary: (results[0] ?? [])[0] as Record<string, unknown>,
        jeLines: (results[1] ?? []) as Array<Record<string, unknown>>,
      };
    }),

  applyRenewal: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      newExpiryDate: z.string(),
      newMonthlyPayment: z.number(),
      newIBR: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const postedBy = ctx.user.name ?? ctx.user.openId;
      const result = await execSPPOne('sp_ApplyRenewal', [
        { name: 'ContractId',        type: sql.Int,           value: input.contractId },
        { name: 'NewExpiryDate',     type: sql.Date,          value: new Date(input.newExpiryDate) },
        { name: 'NewMonthlyPayment', type: sql.Decimal(18,2), value: input.newMonthlyPayment },
        { name: 'NewIBR',            type: sql.Decimal(8,6),  value: input.newIBR ?? null },
        { name: 'PostedBy',          type: sql.NVarChar(100), value: postedBy },
      ]);
      await writeAuditLog({
        userId: ctx.user.id, username: ctx.user.name ?? '',
        userRole: ctx.user.role ?? 'user',
        module: 'LeaseTransactionCentre', actionType: 'APPLY_RENEWAL',
        screenId: 'LTC', recordId: String(input.contractId),
        outcome: 'Success', processStartTime: new Date(),
      });
      return result as { result: string; je_ref: string; je_label: string };
    }),

  applyPurchase: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      purchaseDate: z.string(),
      purchasePrice: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const postedBy = ctx.user.name ?? ctx.user.openId;
      const result = await execSPPOne('sp_ApplyPurchase', [
        { name: 'ContractId',    type: sql.Int,           value: input.contractId },
        { name: 'PurchaseDate',  type: sql.Date,          value: new Date(input.purchaseDate) },
        { name: 'PurchasePrice', type: sql.Decimal(18,2), value: input.purchasePrice },
        { name: 'PostedBy',      type: sql.NVarChar(100), value: postedBy },
      ]);
      await writeAuditLog({
        userId: ctx.user.id, username: ctx.user.name ?? '',
        userRole: ctx.user.role ?? 'user',
        module: 'LeaseTransactionCentre', actionType: 'APPLY_PURCHASE',
        screenId: 'LTC', recordId: String(input.contractId),
        outcome: 'Success', processStartTime: new Date(),
      });
      return result as { result: string; je_ref: string; je_label: string };
    }),

  postLeaseTransaction: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      transactionType: z.enum(['Modification','Termination','Renewal']),
      effectiveDate: z.string(),
      newMonthlyPayment: z.number().optional(),
      newIBR: z.number().optional(),
      newExpiryDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const postedBy = ctx.user.name ?? ctx.user.openId;
      const result = await execSPPOne('sp_PostLeaseTransaction', [
        { name: 'ContractId',        type: sql.Int,           value: input.contractId },
        { name: 'TransactionType',   type: sql.NVarChar(20),  value: input.transactionType },
        { name: 'EffectiveDate',     type: sql.Date,          value: new Date(input.effectiveDate) },
        { name: 'NewMonthlyPayment', type: sql.Decimal(18,2), value: input.newMonthlyPayment ?? null },
        { name: 'NewIBR',            type: sql.Decimal(8,6),  value: input.newIBR ?? null },
        { name: 'NewExpiryDate',     type: sql.Date,          value: input.newExpiryDate ? new Date(input.newExpiryDate) : null },
        { name: 'Notes',             type: sql.NVarChar(500), value: input.notes ?? null },
        { name: 'PostedBy',          type: sql.NVarChar(100), value: postedBy },
      ]);
      await writeAuditLog({
        userId: ctx.user.id, username: ctx.user.name ?? '',
        userRole: ctx.user.role ?? 'user',
        module: 'LeaseTransactionCentre',
        actionType: `POST_${input.transactionType.toUpperCase()}`,
        screenId: 'LTC', recordId: String(input.contractId),
        outcome: 'Success', processStartTime: new Date(),
      });
      return result as { je_ref: string; je_num: string; je_label: string; posted_at: Date; posted_by: string };
    }),

  getLeaseTransactionHistory: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .query(async ({ input }) => {
      const results = await execSPPMulti('sp_GetLeaseTransactionHistory', [
        { name: 'ContractId', type: sql.Int, value: input.contractId },
      ]);
      return {
        drafts:   (results[0] ?? []) as Array<Record<string, unknown>>,
        postings: (results[1] ?? []) as Array<Record<string, unknown>>,
      };
    }),

  // ── FEATURE 8: FINANCIAL STATEMENTS (IAS 1) ─────────────────────────────────
  getBalanceSheet: protectedProcedure
    .input(z.object({ periodEnd: z.string() }))
    .query(async ({ ctx, input }) => {
      const t0 = new Date(); const screenId = 'VFLACCFNST0001P001';
      try {
        const results = await execSPPMulti('sp_GetBalanceSheet', [
          { name: 'PeriodEnd', type: sql.Date, value: new Date(input.periodEnd) },
        ]);
        await writeAuditLog({ userId: ctx.user.id, username: ctx.user.name ?? '', userRole: ctx.user.role ?? 'user', module: 'Accounting Engine', subModule: 'Financial Reporting', actionType: 'VIEW_BALANCE_SHEET', screenId, outcome: 'Success', processStartTime: t0 });
        return { lines: (results[0] ?? []) as Array<Record<string, unknown>>, summary: (results[1]?.[0] ?? {}) as Record<string, unknown> };
      } catch (err: unknown) { const e = err as Error; await writeErrorLog({ severity: 'Error', module: 'Accounting Engine', message: e.message, stackTrace: e.stack, screenId }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message }); }
    }),

  getIncomeStatement: protectedProcedure
    .input(z.object({ periodStart: z.string(), periodEnd: z.string() }))
    .query(async ({ ctx, input }) => {
      const t0 = new Date(); const screenId = 'VFLACCFNST0001P001';
      try {
        const results = await execSPPMulti('sp_GetIncomeStatement', [
          { name: 'PeriodStart', type: sql.Date, value: new Date(input.periodStart) },
          { name: 'PeriodEnd',   type: sql.Date, value: new Date(input.periodEnd) },
        ]);
        await writeAuditLog({ userId: ctx.user.id, username: ctx.user.name ?? '', userRole: ctx.user.role ?? 'user', module: 'Accounting Engine', subModule: 'Financial Reporting', actionType: 'VIEW_INCOME_STATEMENT', screenId, outcome: 'Success', processStartTime: t0 });
        return { lines: (results[0] ?? []) as Array<Record<string, unknown>>, summary: (results[1]?.[0] ?? {}) as Record<string, unknown> };
      } catch (err: unknown) { const e = err as Error; await writeErrorLog({ severity: 'Error', module: 'Accounting Engine', message: e.message, stackTrace: e.stack, screenId }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message }); }
    }),

  getCashFlowStatement: protectedProcedure
    .input(z.object({ periodStart: z.string(), periodEnd: z.string() }))
    .query(async ({ ctx, input }) => {
      const t0 = new Date(); const screenId = 'VFLACCFNST0001P001';
      try {
        const results = await execSPPMulti('sp_GetCashFlowStatement', [
          { name: 'PeriodStart', type: sql.Date, value: new Date(input.periodStart) },
          { name: 'PeriodEnd',   type: sql.Date, value: new Date(input.periodEnd) },
        ]);
        await writeAuditLog({ userId: ctx.user.id, username: ctx.user.name ?? '', userRole: ctx.user.role ?? 'user', module: 'Accounting Engine', subModule: 'Financial Reporting', actionType: 'VIEW_CASH_FLOW', screenId, outcome: 'Success', processStartTime: t0 });
        return { lines: (results[0] ?? []) as Array<Record<string, unknown>>, summary: (results[1]?.[0] ?? {}) as Record<string, unknown> };
      } catch (err: unknown) { const e = err as Error; await writeErrorLog({ severity: 'Error', module: 'Accounting Engine', message: e.message, stackTrace: e.stack, screenId }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message }); }
    }),

  // ── FEATURE 9: ROLL-FORWARD (IFRS 16 Para 53) ────────────────────────────────
  getROURollForward: protectedProcedure
    .input(z.object({ periodStart: z.string(), periodEnd: z.string() }))
    .query(async ({ ctx, input }) => {
      const t0 = new Date(); const screenId = 'VFLACCRLFW0001P001';
      try {
        const results = await execSPPMulti('sp_GetROURollForward', [
          { name: 'PeriodStart', type: sql.Date, value: new Date(input.periodStart) },
          { name: 'PeriodEnd',   type: sql.Date, value: new Date(input.periodEnd) },
        ]);
        await writeAuditLog({ userId: ctx.user.id, username: ctx.user.name ?? '', userRole: ctx.user.role ?? 'user', module: 'Accounting Engine', subModule: 'Financial Reporting', actionType: 'VIEW_ROU_ROLLFORWARD', screenId, outcome: 'Success', processStartTime: t0 });
        return { movements: (results[0] ?? []) as Array<Record<string, unknown>>, summary: (results[1]?.[0] ?? {}) as Record<string, unknown> };
      } catch (err: unknown) { const e = err as Error; await writeErrorLog({ severity: 'Error', module: 'Accounting Engine', message: e.message, stackTrace: e.stack, screenId }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message }); }
    }),

  getLiabilityRollForward: protectedProcedure
    .input(z.object({ periodStart: z.string(), periodEnd: z.string(), contractId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const t0 = new Date(); const screenId = 'VFLACCRLFW0001P001';
      try {
        const results = await execSPPMulti('sp_GetLiabilityRollForward', [
          { name: 'PeriodStart', type: sql.Date, value: new Date(input.periodStart) },
          { name: 'PeriodEnd',   type: sql.Date, value: new Date(input.periodEnd) },
        ]);
        let movements = (results[0] ?? []) as Array<Record<string, unknown>>;
        if (input.contractId) {
          const contract = await execSPPOne<Record<string, unknown>>('sp_GetLeaseById', [
            { name: 'ContractId', type: sql.Int, value: input.contractId },
          ]);
          const contractRef = String(contract?.contract_ref ?? '');
          movements = movements.filter((row) =>
            Number(row.contract_id) === input.contractId ||
            String(row.contract_ref ?? '') === contractRef ||
            String(row.row_type ?? '') === 'Total'
          );
          const nonTotal = movements.filter((row) => String(row.row_type ?? '') !== 'Total');
          const total = {
            total_opening: nonTotal.reduce((sum, row) => sum + Number(row.opening_balance ?? 0), 0),
            total_closing: nonTotal.reduce((sum, row) => sum + Number(row.closing_balance ?? 0), 0),
          };
          await writeAuditLog({ userId: ctx.user.id, username: ctx.user.name ?? '', userRole: ctx.user.role ?? 'user', module: 'Accounting Engine', subModule: 'Financial Reporting', actionType: 'VIEW_LIABILITY_ROLLFORWARD', screenId, outcome: 'Success', processStartTime: t0 });
          return { movements, summary: total };
        }
        await writeAuditLog({ userId: ctx.user.id, username: ctx.user.name ?? '', userRole: ctx.user.role ?? 'user', module: 'Accounting Engine', subModule: 'Financial Reporting', actionType: 'VIEW_LIABILITY_ROLLFORWARD', screenId, outcome: 'Success', processStartTime: t0 });
        return { movements, summary: (results[1]?.[0] ?? {}) as Record<string, unknown> };
      } catch (err: unknown) { const e = err as Error; await writeErrorLog({ severity: 'Error', module: 'Accounting Engine', message: e.message, stackTrace: e.stack, screenId }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message }); }
    }),

  // ── FEATURE 10: TRIAL BALANCE (IAS 1) ───────────────────────────────────────
  getTrialBalance: protectedProcedure
    .input(z.object({ periodEnd: z.string(), accountClass: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const t0 = new Date(); const screenId = 'VFLACCTBAL0001P001';
      try {
        const results = await execSPPMulti('sp_GetTrialBalance', [
          { name: 'PeriodEnd', type: sql.Date, value: new Date(input.periodEnd) },
        ]);
        await writeAuditLog({ userId: ctx.user.id, username: ctx.user.name ?? '', userRole: ctx.user.role ?? 'user', module: 'Accounting Engine', subModule: 'Financial Reporting', actionType: 'VIEW_TRIAL_BALANCE', screenId, outcome: 'Success', processStartTime: t0 });
        let lines = (results[0] ?? []) as Array<Record<string, unknown>>;
        if (input.accountClass && input.accountClass !== 'All') lines = lines.filter(l => l.account_class === input.accountClass);
        return { lines, totals: (results[1]?.[0] ?? {}) as Record<string, unknown> };
      } catch (err: unknown) { const e = err as Error; await writeErrorLog({ severity: 'Error', module: 'Accounting Engine', message: e.message, stackTrace: e.stack, screenId }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message }); }
    }),

  // ── FEATURE 11: EXEMPTION REGISTER (IFRS 16 Para 5) ─────────────────────────
  getExemptionRegister: protectedProcedure
    .input(z.object({ exemptionType: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const t0 = new Date(); const screenId = 'VFLLSEEXRG0001P001';
      try {
        const results = await execSPPMulti('sp_GetExemptionRegister', [
          { name: 'ExemptionType', type: sql.VarChar(20), value: input.exemptionType || null },
        ]);
        await writeAuditLog({ userId: ctx.user.id, username: ctx.user.name ?? '', userRole: ctx.user.role ?? 'user', module: 'Lease Management', subModule: 'Exemptions', actionType: 'VIEW_EXEMPTION_REGISTER', screenId, outcome: 'Success', processStartTime: t0 });
        return { leases: (results[0] ?? []) as Array<Record<string, unknown>>, summary: (results[1] ?? []) as Array<Record<string, unknown>> };
      } catch (err: unknown) { const e = err as Error; await writeErrorLog({ severity: 'Error', module: 'Lease Management', message: e.message, stackTrace: e.stack, screenId }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message }); }
    }),

  updateLeaseExemption: protectedProcedure
    .input(z.object({ contractId: z.number(), exemptionType: z.enum(['None', 'ShortTerm', 'LowValue']), exemptionReason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const t0 = new Date(); const screenId = 'VFLLSEEXRG0001P001';
      try {
        const result = await execSPPOne<Record<string, unknown>>('sp_UpdateLeaseExemption', [
          { name: 'ContractId',      type: sql.Int,           value: input.contractId },
          { name: 'ExemptionType',   type: sql.VarChar(20),   value: input.exemptionType },
          { name: 'ExemptionReason', type: sql.NVarChar(500), value: input.exemptionReason || null },
          { name: 'UpdatedBy',       type: sql.NVarChar(200), value: ctx.user.name ?? '' },
        ]);
        await writeAuditLog({ userId: ctx.user.id, username: ctx.user.name ?? '', userRole: ctx.user.role ?? 'user', module: 'Lease Management', subModule: 'Exemptions', actionType: 'UPDATE_EXEMPTION', screenId, recordTable: 'lease.contracts', recordId: String(input.contractId), afterState: { exemptionType: input.exemptionType, exemptionReason: input.exemptionReason }, outcome: 'Success', processStartTime: t0 });
        return result;
      } catch (err: unknown) { const e = err as Error; await writeErrorLog({ severity: 'Error', module: 'Lease Management', message: e.message, stackTrace: e.stack, screenId }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message }); }
    }),

  // ── FEATURE 17: Lease Modifications ─────────────────────────────────────────
  getLeaseModifications: protectedProcedure
    .input(z.object({ contractId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const screenId = 'VFLLSMOD0001P001';
      try {
        return await execSPP('lease.sp_GetLeaseModifications', [
          { name: 'ContractId', type: sql.Int,          value: input.contractId ?? null },
          { name: 'Status',     type: sql.NVarChar(20), value: input.status ?? null },
        ]);
      } catch (err: unknown) { const e = err as Error; await writeErrorLog({ severity: 'Error', module: 'Lease Management', message: e.message, stackTrace: e.stack, screenId }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message }); }
    }),

  createLeaseModification: protectedProcedure
    .input(z.object({
      contractId:        z.number(),
      modificationDate:  z.string(),
      modificationType:  z.enum(['extension', 'payment_change', 'scope_change', 'termination']),
      newIBR:            z.number().optional(),
      newTermEnd:        z.string().optional(),
      newMonthlyPayment: z.number().optional(),
      notes:             z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const t0 = new Date(); const screenId = 'VFLLSMOD0001P001';
      try {
        const result = await execSPPOne<Record<string, unknown>>('lease.sp_CreateLeaseModification', [
          { name: 'ContractId',        type: sql.Int,            value: input.contractId },
          { name: 'ModificationDate',  type: sql.Date,           value: new Date(input.modificationDate) },
          { name: 'ModificationType',  type: sql.NVarChar(50),   value: input.modificationType },
          { name: 'NewIBR',            type: sql.Decimal(10, 6), value: input.newIBR ?? null },
          { name: 'NewTermEnd',        type: sql.Date,           value: input.newTermEnd ? new Date(input.newTermEnd) : null },
          { name: 'NewMonthlyPayment', type: sql.Decimal(18, 2), value: input.newMonthlyPayment ?? null },
          { name: 'Notes',             type: sql.NVarChar(1000), value: input.notes ?? null },
          { name: 'CreatedBy',         type: sql.Int,            value: ctx.user.id },
        ]);
        await writeAuditLog({ userId: ctx.user.id, username: ctx.user.name ?? '', userRole: ctx.user.role ?? 'user', module: 'Lease Management', subModule: 'Modifications', actionType: 'CREATE_MODIFICATION', screenId, recordTable: 'lease.lease_modifications', recordId: String(input.contractId), afterState: input, outcome: 'Success', processStartTime: t0 });
        return result;
      } catch (err: unknown) { const e = err as Error; await writeErrorLog({ severity: 'Error', module: 'Lease Management', message: e.message, stackTrace: e.stack, screenId }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message }); }
    }),

  applyLeaseModification: protectedProcedure
    .input(z.object({ modificationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const t0 = new Date(); const screenId = 'VFLLSMOD0001P001';
      try {
        const result = await execSPPOne<Record<string, unknown>>('lease.sp_ApplyLeaseModification', [
          { name: 'ModificationId', type: sql.Int, value: input.modificationId },
          { name: 'ApprovedBy',     type: sql.Int, value: ctx.user.id },
        ]);
        await writeAuditLog({ userId: ctx.user.id, username: ctx.user.name ?? '', userRole: ctx.user.role ?? 'user', module: 'Lease Management', subModule: 'Modifications', actionType: 'APPLY_MODIFICATION', screenId, recordTable: 'lease.lease_modifications', recordId: String(input.modificationId), afterState: { modificationId: input.modificationId, status: 'applied' }, outcome: 'Success', processStartTime: t0 });
        return result;
      } catch (err: unknown) { const e = err as Error; await writeErrorLog({ severity: 'Error', module: 'Lease Management', message: e.message, stackTrace: e.stack, screenId }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message }); }
    }),

  // ── LEASE CHEQUES ────────────────────────────────────────────
  getLeaseCheques: protectedProcedure
    .input(z.object({ contractId: z.number().int() }))
    .query(async ({ input }) => {
      try {
        return await execSPP('sp_GetLeaseCheques', [
          { name: 'ContractId', type: sql.Int, value: input.contractId },
        ]);
      } catch {
        return [];
      }
    }),

  upsertLeaseCheques: protectedProcedure
    .input(z.object({
      contractId: z.number().int(),
      cheques: z.array(z.object({
        chequeId:      z.number().int().optional(),
        chequeNumber:  z.string().min(1),
        bankName:      z.string().min(1),
        bankAccountNo: z.string().optional(),
        payeeName:     z.string().min(1),
        amount:        z.number().positive(),
        currency:      z.string().length(3).default('QAR'),
        chequeDate:    z.string(),
        chequeType:    z.enum(['Rent', 'Security Deposit', 'Advance', 'Other']).default('Rent'),
        periodCovered: z.string().optional(),
        remarks:       z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const t0 = new Date();
      try {
        const result = await execSPPOne<{ saved_count: number }>('sp_UpsertLeaseCheques', [
          { name: 'ContractId',  type: sql.Int,              value: input.contractId },
          { name: 'ChequesJson', type: sql.NVarChar(sql.MAX), value: JSON.stringify(input.cheques) },
          { name: 'CreatedBy',   type: sql.Int,              value: ctx.user!.id },
        ]);
        await writeAuditLog({
          userId: ctx.user!.id, username: ctx.user!.name ?? '', userRole: ctx.user!.role ?? 'user',
          module: 'Lease', subModule: 'Cheques', actionType: 'UPSERT',
          recordTable: 'cheque.lease_cheques', recordId: String(input.contractId),
          afterState: { contractId: input.contractId, count: input.cheques.length },
          outcome: 'Success', screenId: 'VFLNEWLEA0001P001', processStartTime: t0,
        });
        return result;
      } catch (err: unknown) {
        const e = err as Error;
        await writeErrorLog({ severity: 'Error', module: 'Lease', message: e.message, stackTrace: e.stack, screenId: 'VFLNEWLEA0001P001' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message });
      }
    }),

  // ── Sub-Assets for Lease Detail Asset Tab ──────────────────────────────────
  getSubAssetsByContractId: protectedProcedure
    .input(z.object({ contractId: z.number().int() }))
    .query(async ({ input }) => {
      try {
        // Resolve contract_ref (leaseId string) from contractId
        const leaseRows = await execSPP('sp_GetLeaseById', [
          { name: 'ContractId', type: sql.Int, value: input.contractId },
        ]);
        const leaseId = (leaseRows[0] as any)?.contract_ref as string | null;
        if (!leaseId) return [];
        const rows = await execSPP('asset.sp_GetLeaseSubAssets', [
          { name: 'lease_id', type: sql.NVarChar(50), value: leaseId },
        ]);
        return rows.map((r: any) => ({
          leaseSubAssetId:   r.lease_sub_asset_id   as number,
          leaseId:           r.lease_id             as string,
          assetId:           r.asset_id             as number,
          assetCode:         r.asset_code           as string,
          setName:           r.set_name             as string,
          status:            r.status               as string,
          statusDate:        r.status_date          as string | null,
          reason:            r.reason               as string | null,
          replacedByCode:    r.replaced_by_code     as string | null,
          notes:             r.notes                as string | null,
          tagsWithSerials:   r.tags_with_serials    as string | null,
          owner:             r.owner                as string | null,
          createdBy:         r.created_by           as string,
          createdAt:         r.created_at           as string,
          updatedAt:         r.updated_at           as string | null,
        }));
      } catch (err: unknown) {
        const e = err as Error;
        await writeErrorLog({ severity: 'Error', module: 'Lease', message: e.message, stackTrace: e.stack, screenId: 'VFLLSEDET0001P001' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message });
      }
    }),

  logSubAssetDeviation: protectedProcedure
    .input(z.object({
      action:     z.string(),
      entityId:   z.number().int(),
      entityCode: z.string().optional(),
      entityName: z.string().optional(),
      beforeJson: z.string().optional(),
      afterJson:  z.string().optional(),
      screenId:   z.string().optional(),
      sessionRef: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const changedBy = (ctx.user as any)?.name ?? (ctx.user as any)?.email ?? 'system';
      await execSPP('sp_LogSubAssetTransaction', [
        { name: 'Action',      type: sql.NVarChar(50),          value: input.action },
        { name: 'EntityType',  type: sql.NVarChar(50),          value: 'LEASE_SUB_ASSET' },
        { name: 'EntityId',    type: sql.Int,                   value: input.entityId },
        { name: 'EntityCode',  type: sql.NVarChar(100),         value: input.entityCode ?? null },
        { name: 'EntityName',  type: sql.NVarChar(255),         value: input.entityName ?? null },
        { name: 'BeforeJson',  type: sql.NVarChar(sql.MAX),     value: input.beforeJson ?? null },
        { name: 'AfterJson',   type: sql.NVarChar(sql.MAX),     value: input.afterJson ?? null },
        { name: 'ChangedBy',   type: sql.NVarChar(100),         value: changedBy },
        { name: 'ScreenId',    type: sql.NVarChar(50),          value: input.screenId ?? 'VFLLSEDET0001P001' },
        { name: 'SessionRef',  type: sql.NVarChar(100),         value: input.sessionRef ?? null },
      ]).catch(() => {/* non-blocking */});
      return { ok: true };
    }),

  // ── MONTHLY JV POSTING (DEMO MODE) ──────────────────────────────────────
  postMonthlyEntries: protectedProcedure
    .input(z.object({
      contractIds: z.array(z.number()).min(1),
      monthsToPost: z.number().min(1).max(120).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        contractId: number;
        contractRef: string;
        monthsPosted: number;
        totalInterest: number;
        totalPrincipal: number;
        totalDepreciation: number;
        totalMonthsPosted: number;
        totalTermMonths: number;
        currentLiability: number;
        currentRouNbv: number;
        details: Array<{
          month_num: number;
          period_date: string;
          jv_payment_number: string;
          jv_depreciation_number: string;
          interest_amount: number;
          principal_amount: number;
          payment_amount: number;
          depreciation_amount: number;
          opening_liability: number;
          closing_liability: number;
          rou_nbv: number;
        }>;
        error?: string;
      }> = [];

      for (const contractId of input.contractIds) {
        try {
          const recordsets = await execSPPMulti('sp_PostMonthlyEntry', [
            { name: 'ContractId',  type: sql.Int, value: contractId },
            { name: 'MonthsToPost', type: sql.Int, value: input.monthsToPost },
          ]);
          const details = (recordsets[0] ?? []) as any[];
          const summary = (recordsets[1]?.[0] ?? {}) as any;
          
          // Get contract_ref from details or query
          const contractRef = details[0]?.contract_ref ?? `Contract-${contractId}`;
          
          results.push({
            contractId,
            contractRef,
            monthsPosted: summary.months_posted ?? 0,
            totalInterest: summary.total_interest ?? 0,
            totalPrincipal: summary.total_principal ?? 0,
            totalDepreciation: summary.total_depreciation ?? 0,
            totalMonthsPosted: summary.total_months_posted ?? 0,
            totalTermMonths: summary.total_term_months ?? 0,
            currentLiability: summary.current_liability ?? 0,
            currentRouNbv: summary.current_rou_nbv ?? 0,
            details: details.map((d: any) => ({
              month_num: d.month_num,
              period_date: d.period_date,
              jv_payment_number: d.jv_payment_number,
              jv_depreciation_number: d.jv_depreciation_number,
              interest_amount: d.interest_amount,
              principal_amount: d.principal_amount,
              payment_amount: d.payment_amount,
              depreciation_amount: d.depreciation_amount,
              opening_liability: d.opening_liability,
              closing_liability: d.closing_liability,
              rou_nbv: d.rou_nbv,
            })),
          });
        } catch (e: any) {
          results.push({
            contractId,
            contractRef: `Contract-${contractId}`,
            monthsPosted: 0,
            totalInterest: 0,
            totalPrincipal: 0,
            totalDepreciation: 0,
            totalMonthsPosted: 0,
            totalTermMonths: 0,
            currentLiability: 0,
            currentRouNbv: 0,
            details: [],
            error: e.message,
          });
        }
      }

      // Write audit log
      const totalMonthsPosted = results.reduce((s, r) => s + r.monthsPosted, 0);
      await writeAuditLog({
        userId: ctx.user.id, username: ctx.user.name ?? ctx.user.email ?? 'system', userRole: ctx.user.role ?? 'user',
        module: 'Accounting Engine', subModule: 'Monthly Posting',
        actionType: 'POST_MONTHLY_ENTRIES',
        recordTable: 'accounting.journal_vouchers', recordId: String(input.contractIds[0]),
        afterState: { contractIds: input.contractIds, monthsToPost: input.monthsToPost, totalMonthsPosted },
        outcome: 'Success', screenId: 'VFLAMORT0001P001', processStartTime: new Date(),
      }).catch(() => {});

      return { results, totalContractsProcessed: results.length, totalMonthsPosted };
    }),

  // ── GET LEASES FOR MONTHLY POSTING GRID ─────────────────────────────────
  getLeasesForPosting: protectedProcedure
    .query(async () => {
      // Get all active/draft contracts with their posting status
      const rows = await execSPP('sp_GetLeasesForPosting', []);
      return rows as Array<{
        contract_id: number;
        contract_ref: string;
        lessee_name: string;
        asset_type: string;
        commencement_date: string;
        term_months: number;
        monthly_payment: number;
        ibr: number;
        currency: string;
        rou_asset_value: number;
        lease_liability: number;
        months_posted: number;
        last_posted_date: string | null;
        status: string;
      }>;
    }),

  // ══════════════════════════════════════════════════════════════════
  // REPORTS MODULE
  // ══════════════════════════════════════════════════════════════════

  reportPortfolioSummary: protectedProcedure
    .input(z.object({ contractId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.contractId) {
        const pool = await getPool();
        const req = pool.request();
        req.input('ContractId', sql.Int, input.contractId);
        const result = await req.query(`
          SELECT TOP 1
            1 AS total_leases,
            CASE WHEN c.asset_type = 'Office' THEN 1 ELSE 0 END AS office_count,
            CASE WHEN c.asset_type = 'Vehicle' THEN 1 ELSE 0 END AS vehicle_count,
            CASE WHEN c.asset_type = 'Equipment' THEN 1 ELSE 0 END AS equipment_count,
            CASE WHEN c.asset_type NOT IN ('Office', 'Vehicle', 'Equipment') THEN 1 ELSE 0 END AS other_count,
            c.rou_asset_value AS total_rou_original,
            c.lease_liability_commence AS total_liability_original,
            c.monthly_payment AS total_monthly_payment,
            ISNULL((SELECT TOP 1 a.closing_liability FROM lease.amortisation_schedule a WHERE a.contract_id = c.contract_id ORDER BY a.period_date DESC), c.lease_liability_commence) AS current_total_liability,
            CASE WHEN c.currency = 'QAR' THEN 1 ELSE 0 END AS qar_count,
            CASE WHEN c.currency = 'AED' THEN 1 ELSE 0 END AS aed_count,
            CASE WHEN c.currency NOT IN ('QAR', 'AED') THEN 1 ELSE 0 END AS other_currency_count
          FROM lease.contracts c
          WHERE c.contract_id = @ContractId
        `);
        return (result.recordset[0] ?? {}) as Record<string, unknown>;
      }
      const results = await execSPP('sp_ReportPortfolioSummary', []);
      return (results[0] ?? {}) as Record<string, unknown>;
    }),

  reportROURollForward: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      currency: z.string().optional(),
      contractId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_ReportROURollForward', [
        { name: 'StartDate', type: sql.Date, value: input.startDate || null },
        { name: 'EndDate', type: sql.Date, value: input.endDate || null },
        { name: 'Currency', type: sql.VarChar(3), value: input.currency || null },
      ]);
      return input.contractId ? rows.filter((row: any) => Number(row.contract_id) === input.contractId) : rows;
    }),

  reportLiabilityRollForward: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      currency: z.string().optional(),
      contractId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_ReportLiabilityRollForward', [
        { name: 'StartDate', type: sql.Date, value: input.startDate || null },
        { name: 'EndDate', type: sql.Date, value: input.endDate || null },
        { name: 'Currency', type: sql.VarChar(3), value: input.currency || null },
      ]);
      return input.contractId ? rows.filter((row: any) => Number(row.contract_id) === input.contractId) : rows;
    }),

  reportMaturityAnalysis: protectedProcedure
    .input(z.object({
      asOfDate: z.string().optional(),
      currency: z.string().optional(),
      contractId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_ReportMaturityAnalysis', [
        { name: 'AsOfDate', type: sql.Date, value: input.asOfDate || null },
        { name: 'Currency', type: sql.VarChar(3), value: input.currency || null },
      ]);
      return input.contractId ? rows.filter((row: any) => Number(row.contract_id) === input.contractId) : rows;
    }),

  reportInterestExpense: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      currency: z.string().optional(),
      granularity: z.enum(['Monthly', 'Quarterly']).optional(),
      contractId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      if (input.contractId) {
        const pool = await getPool();
        const req = pool.request();
        req.input('ContractId', sql.Int, input.contractId);
        req.input('StartDate', sql.Date, input.startDate || null);
        req.input('EndDate', sql.Date, input.endDate || null);
        req.input('Currency', sql.VarChar(3), input.currency || null);
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
        return result.recordset;
      }
      return execSPP('sp_ReportInterestExpense', [
        { name: 'StartDate', type: sql.Date, value: input.startDate || null },
        { name: 'EndDate', type: sql.Date, value: input.endDate || null },
        { name: 'Currency', type: sql.VarChar(3), value: input.currency || null },
        { name: 'Granularity', type: sql.VarChar(10), value: input.granularity || 'Monthly' },
      ]);
    }),

  reportLeaseExpiry: protectedProcedure
    .input(z.object({
      daysAhead: z.number().optional(),
      currency: z.string().optional(),
      contractId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const rows = await execSPP('sp_ReportLeaseExpiry', [
        { name: 'DaysAhead', type: sql.Int, value: input.daysAhead || 365 },
        { name: 'Currency', type: sql.VarChar(3), value: input.currency || null },
      ]);
      return input.contractId ? rows.filter((row: any) => Number(row.contract_id) === input.contractId) : rows;
    }),

  reportCashForecast: protectedProcedure
    .input(z.object({
      months: z.number().optional(),
      currency: z.string().optional(),
      contractId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      if (input.contractId) {
        const pool = await getPool();
        const req = pool.request();
        req.input('ContractId', sql.Int, input.contractId);
        req.input('Months', sql.Int, input.months || 12);
        req.input('Currency', sql.VarChar(3), input.currency || null);
        const result = await req.query(`
          DECLARE @StartDate DATE = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) + 1, 0);
          DECLARE @EndDate DATE = DATEADD(MONTH, @Months, @StartDate);
          SELECT YEAR(a.period_date) AS period_year, MONTH(a.period_date) AS period_month,
            FORMAT(a.period_date, 'MMM yyyy') AS period_label, c.contract_id, c.contract_ref, c.currency,
            SUM(a.payment) AS total_payment, SUM(a.interest_expense) AS interest_portion,
            SUM(a.principal) AS principal_portion, COUNT(DISTINCT c.contract_id) AS lease_count
          FROM lease.amortisation_schedule a
          JOIN lease.contracts c ON c.contract_id = a.contract_id
          WHERE a.period_date >= @StartDate AND a.period_date < @EndDate
            AND c.contract_id = @ContractId
            AND (@Currency IS NULL OR c.currency = @Currency)
          GROUP BY YEAR(a.period_date), MONTH(a.period_date), FORMAT(a.period_date, 'MMM yyyy'), c.contract_id, c.contract_ref, c.currency
          ORDER BY YEAR(a.period_date), MONTH(a.period_date), c.currency
        `);
        return result.recordset;
      }
      return execSPP('sp_ReportCashForecast', [
        { name: 'Months', type: sql.Int, value: input.months || 12 },
        { name: 'Currency', type: sql.VarChar(3), value: input.currency || null },
      ]);
    }),
});
