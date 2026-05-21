/**
 * ESG Reporting Router — All DML via stored procedures.
 * Covers Environmental, Social, and Governance metrics with audit + error logging.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import sql from "mssql";
import { execSPP, execSPPOne, execSPPMulti } from "../db-sqlserver";
import { writeAuditLog, writeErrorLog } from "../audit";

// ─── Environmental (Carbon) ─────────────────────────────────────────────────

const environmentalInput = z.object({
  carbonId: z.number().optional(),
  contractId: z.number(),
  reportingYear: z.number(),
  reportingMonth: z.number().min(1).max(12),
  scope1Tonnes: z.number().nullable().optional(),
  scope2Tonnes: z.number().nullable().optional(),
  scope3Tonnes: z.number().nullable().optional(),
  energyKwh: z.number().nullable().optional(),
  waterM3: z.number().nullable().optional(),
  wasteTonnes: z.number().nullable().optional(),
  greenRating: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── Social ─────────────────────────────────────────────────────────────────

const socialInput = z.object({
  socialId: z.number().optional(),
  contractId: z.number(),
  reportingYear: z.number(),
  reportingMonth: z.number().min(1).max(12),
  workforceCount: z.number().nullable().optional(),
  healthIncidents: z.number().nullable().optional(),
  safetyScore: z.number().nullable().optional(),
  communityInvestmentQar: z.number().nullable().optional(),
  localEmploymentPct: z.number().nullable().optional(),
  trainingHours: z.number().nullable().optional(),
  diversityPct: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── Governance ─────────────────────────────────────────────────────────────

const governanceInput = z.object({
  governanceId: z.number().optional(),
  contractId: z.number(),
  reportingYear: z.number(),
  reportingMonth: z.number().min(1).max(12),
  approvalCompliancePct: z.number().nullable().optional(),
  relatedPartyFlag: z.boolean().optional(),
  relatedPartyDetails: z.string().nullable().optional(),
  boardReviewDate: z.string().nullable().optional(),
  auditFindings: z.number().nullable().optional(),
  regulatoryCompliance: z.string().nullable().optional(),
  ifrs16Adherence: z.string().nullable().optional(),
  policyViolations: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const SCREEN_ID = "VFLESGRPT0001P001";

export const esgRouter = router({
  // ─── List ──────────────────────────────────────────────────────────────────
  listEnvironmental: protectedProcedure
    .input(z.object({ year: z.number().optional(), contractId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return execSPP("sp_ListESGMetrics", [
        { name: "TableType", type: sql.VarChar(20), value: "environmental" },
        { name: "Year", type: sql.Int, value: input?.year ?? null },
        { name: "ContractId", type: sql.Int, value: input?.contractId ?? null },
      ]);
    }),

  listSocial: protectedProcedure
    .input(z.object({ year: z.number().optional(), contractId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return execSPP("sp_ListESGMetrics", [
        { name: "TableType", type: sql.VarChar(20), value: "social" },
        { name: "Year", type: sql.Int, value: input?.year ?? null },
        { name: "ContractId", type: sql.Int, value: input?.contractId ?? null },
      ]);
    }),

  listGovernance: protectedProcedure
    .input(z.object({ year: z.number().optional(), contractId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return execSPP("sp_ListESGMetrics", [
        { name: "TableType", type: sql.VarChar(20), value: "governance" },
        { name: "Year", type: sql.Int, value: input?.year ?? null },
        { name: "ContractId", type: sql.Int, value: input?.contractId ?? null },
      ]);
    }),

  // ─── Upsert Environmental ─────────────────────────────────────────────────
  upsertEnvironmental: protectedProcedure
    .input(environmentalInput)
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne("sp_UpsertESGEnvironmental", [
          { name: "CarbonId", type: sql.Int, value: input.carbonId ?? null },
          { name: "ContractId", type: sql.Int, value: input.contractId },
          { name: "ReportingYear", type: sql.Int, value: input.reportingYear },
          { name: "ReportingMonth", type: sql.Int, value: input.reportingMonth },
          { name: "Scope1Tonnes", type: sql.Decimal(14, 4), value: input.scope1Tonnes ?? null },
          { name: "Scope2Tonnes", type: sql.Decimal(14, 4), value: input.scope2Tonnes ?? null },
          { name: "Scope3Tonnes", type: sql.Decimal(14, 4), value: input.scope3Tonnes ?? null },
          { name: "EnergyKwh", type: sql.Decimal(14, 2), value: input.energyKwh ?? null },
          { name: "WaterM3", type: sql.Decimal(14, 2), value: input.waterM3 ?? null },
          { name: "WasteTonnes", type: sql.Decimal(14, 4), value: input.wasteTonnes ?? null },
          { name: "GreenRating", type: sql.VarChar(20), value: input.greenRating ?? null },
          { name: "Notes", type: sql.NVarChar(500), value: input.notes ?? null },
          { name: "CreatedBy", type: sql.Int, value: ctx.user!.id },
        ]);
        await writeAuditLog({
          userId: ctx.user!.id, username: ctx.user!.name || "", userRole: ctx.user!.role,
          module: "ESG", subModule: "Environmental", actionType: input.carbonId ? "UPDATE" : "CREATE",
          recordTable: "lease.esg_carbon", recordId: String(result?.record_id),
          afterState: input, outcome: "Success", screenId: SCREEN_ID, processStartTime: start,
        });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "ESG", message: err.message, stackTrace: err.stack, screenId: SCREEN_ID });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ─── Upsert Social ────────────────────────────────────────────────────────
  upsertSocial: protectedProcedure
    .input(socialInput)
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne("sp_UpsertESGSocial", [
          { name: "SocialId", type: sql.Int, value: input.socialId ?? null },
          { name: "ContractId", type: sql.Int, value: input.contractId },
          { name: "ReportingYear", type: sql.Int, value: input.reportingYear },
          { name: "ReportingMonth", type: sql.Int, value: input.reportingMonth },
          { name: "WorkforceCount", type: sql.Int, value: input.workforceCount ?? null },
          { name: "HealthIncidents", type: sql.Int, value: input.healthIncidents ?? 0 },
          { name: "SafetyScore", type: sql.Decimal(5, 2), value: input.safetyScore ?? null },
          { name: "CommunityInvestmentQar", type: sql.Decimal(14, 2), value: input.communityInvestmentQar ?? 0 },
          { name: "LocalEmploymentPct", type: sql.Decimal(5, 2), value: input.localEmploymentPct ?? null },
          { name: "TrainingHours", type: sql.Decimal(10, 2), value: input.trainingHours ?? 0 },
          { name: "DiversityPct", type: sql.Decimal(5, 2), value: input.diversityPct ?? null },
          { name: "Notes", type: sql.NVarChar(500), value: input.notes ?? null },
          { name: "CreatedBy", type: sql.Int, value: ctx.user!.id },
        ]);
        await writeAuditLog({
          userId: ctx.user!.id, username: ctx.user!.name || "", userRole: ctx.user!.role,
          module: "ESG", subModule: "Social", actionType: input.socialId ? "UPDATE" : "CREATE",
          recordTable: "lease.esg_social", recordId: String(result?.record_id),
          afterState: input, outcome: "Success", screenId: SCREEN_ID, processStartTime: start,
        });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "ESG", message: err.message, stackTrace: err.stack, screenId: SCREEN_ID });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ─── Upsert Governance ────────────────────────────────────────────────────
  upsertGovernance: protectedProcedure
    .input(governanceInput)
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne("sp_UpsertESGGovernance", [
          { name: "GovernanceId", type: sql.Int, value: input.governanceId ?? null },
          { name: "ContractId", type: sql.Int, value: input.contractId },
          { name: "ReportingYear", type: sql.Int, value: input.reportingYear },
          { name: "ReportingMonth", type: sql.Int, value: input.reportingMonth },
          { name: "ApprovalCompliancePct", type: sql.Decimal(5, 2), value: input.approvalCompliancePct ?? null },
          { name: "RelatedPartyFlag", type: sql.Bit, value: input.relatedPartyFlag ? 1 : 0 },
          { name: "RelatedPartyDetails", type: sql.NVarChar(500), value: input.relatedPartyDetails ?? null },
          { name: "BoardReviewDate", type: sql.Date, value: input.boardReviewDate ?? null },
          { name: "AuditFindings", type: sql.Int, value: input.auditFindings ?? 0 },
          { name: "RegulatoryCompliance", type: sql.VarChar(20), value: input.regulatoryCompliance ?? "Compliant" },
          { name: "IFRS16Adherence", type: sql.VarChar(20), value: input.ifrs16Adherence ?? "Full" },
          { name: "PolicyViolations", type: sql.Int, value: input.policyViolations ?? 0 },
          { name: "Notes", type: sql.NVarChar(500), value: input.notes ?? null },
          { name: "CreatedBy", type: sql.Int, value: ctx.user!.id },
        ]);
        await writeAuditLog({
          userId: ctx.user!.id, username: ctx.user!.name || "", userRole: ctx.user!.role,
          module: "ESG", subModule: "Governance", actionType: input.governanceId ? "UPDATE" : "CREATE",
          recordTable: "lease.esg_governance", recordId: String(result?.record_id),
          afterState: input, outcome: "Success", screenId: SCREEN_ID, processStartTime: start,
        });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "ESG", message: err.message, stackTrace: err.stack, screenId: SCREEN_ID });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ─── Delete ───────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ tableType: z.enum(["environmental", "social", "governance"]), recordId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const start = new Date();
      try {
        const result = await execSPPOne("sp_DeleteESGMetric", [
          { name: "TableType", type: sql.VarChar(20), value: input.tableType },
          { name: "RecordId", type: sql.Int, value: input.recordId },
        ]);
        await writeAuditLog({
          userId: ctx.user!.id, username: ctx.user!.name || "", userRole: ctx.user!.role,
          module: "ESG", subModule: input.tableType, actionType: "DELETE",
          recordTable: `lease.esg_${input.tableType === "environmental" ? "carbon" : input.tableType}`,
          recordId: String(input.recordId),
          outcome: "Success", screenId: SCREEN_ID, processStartTime: start,
        });
        return result;
      } catch (err: any) {
        await writeErrorLog({ severity: "Error", module: "ESG", message: err.message, stackTrace: err.stack, screenId: SCREEN_ID });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ─── Report Summary ───────────────────────────────────────────────────────
  report: protectedProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const recordsets = await execSPPMulti("sp_GetESGReport", [
        { name: "Year", type: sql.Int, value: input.year },
      ]);
      return {
        environmental: recordsets[0]?.[0] ?? null,
        social: recordsets[1]?.[0] ?? null,
        governance: recordsets[2]?.[0] ?? null,
        monthlyTrend: recordsets[3] ?? [],
      };
    }),
});
