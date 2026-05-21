import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

// Feature routers — all DB access via SQL Server Stored Procedures
import { leaseRouter }     from "./routers/lease";
import { payablesRouter }  from "./routers/payables";
import { workflowRouter, complianceRouter, misRouter } from "./routers/workflow";
import { genaiRouter }     from "./routers/genai";
import { bankReconRouter } from "./routers/bankRecon";
import { chequeRouter }    from "./routers/cheque";
import { bounceReconRouter } from "./routers/bounceRecon";
import { lessorRouter, assetRouter } from "./routers/lessorAsset";
import { accountingRouter } from "./routers/accounting";
import { furnishedAssetsRouter, assetDepositRouter, handoverChecklistRouter } from "./routers/furnishedAssets";
import { masterContractsRouter } from "./routers/masterContracts";
import { aiFillRouter }         from "./routers/aiFill";
import { contractDmsRouter }    from "./routers/contractDms";
import { lesseeRouter }         from "./routers/lessee";
import { staffRouter }          from "./routers/staff";
import { journalVoucherRouter } from "./routers/journalVoucher";
import { esgRouter }            from "./routers/esg";
import { transactionEngineRouter } from "./routers/transactionEngine";
import { businessRulesRouter } from "./routers/businessRules";
import { glConfigurationRouter } from "./routers/glConfiguration";
import { performanceRouter } from './routers/performance';
import { reportEngineRouter } from './routers/reportEngine';
import { protectedProcedure }   from "./_core/trpc";
import { z }                    from "zod";
import { getPool }              from "./db-sqlserver";

const screenMetaRouter = router({
  get: protectedProcedure
    .input(z.object({ screenId: z.string() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("screenId", input.screenId);
      const r = await req.query(`SELECT screen_id,screen_name,module,sub_module,screen_type,route,stored_procedures,db_tables,computation_techniques,accounting_standards FROM security.screen_registry WHERE screen_id=@screenId`);
      return r.recordset[0] ?? null;
    }),
});
import { furnitureCollectionsRouter } from "./routers/furnitureCollections";
import { vendorRouter, brokerRouter, loiRouter, tiAllowanceRouter, deskBookingRouter, workOrderRouter, notificationSettingsRouter, ssoConfigRouter, apiWebhookRouter, leaseModificationRouter, leaseRenewalRouter, glJournalRouter, leaseComparisonRouter, eSignatureRouter } from "./routers/ops";
import { criticalDatesRouter, aiAbstractionRouter, subLeaseRouter, rentReviewRouter, securityDepositRouter, asc842Router, leaseOriginationRouter, leaseOptionsRouter, breakClauseRouter, leaseIncentiveRouter, budgetVarianceRouter, costCentreRouter, marketRentRouter, spaceManagementRouter, capitalProjectsRouter, esgCarbonRouter, multiEntityRouter, fxAccountingRouter, lessorCreditRouter, emailAlertsRouter, scheduledReportsRouter, terminationRouter, bouncePenaltyRouter, leaseOriginationNewRouter } from "./routers/features";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── Domain Routers ─────────────────────────────────────────
  lease:       leaseRouter,
  payables:    payablesRouter,
  workflow:    workflowRouter,
  genai:       genaiRouter,
  bankRecon:   bankReconRouter,
  cheque:      chequeRouter,
  bounceRecon: bounceReconRouter,
  lessor:      lessorRouter,
  asset:       assetRouter,
  compliance:  complianceRouter,
  mis:         misRouter,
  accounting:  accountingRouter,
  criticalDates: criticalDatesRouter,
  aiAbstraction: aiAbstractionRouter,
  subLease:    subLeaseRouter,
  rentReview:  rentReviewRouter,
  securityDeposit: securityDepositRouter,
  asc842:      asc842Router,
  leaseOrigination: leaseOriginationRouter,
  leaseOptions: leaseOptionsRouter,
  breakClause: breakClauseRouter,
  leaseIncentive: leaseIncentiveRouter,
  budgetVariance: budgetVarianceRouter,
  costCentre:  costCentreRouter,
  marketRent:  marketRentRouter,
  spaceManagement: spaceManagementRouter,
  capitalProjects: capitalProjectsRouter,
  esgCarbon:   esgCarbonRouter,
  esg:         esgRouter,
  multiEntity: multiEntityRouter,
  fxAccounting: fxAccountingRouter,
  lessorCredit: lessorCreditRouter,
  emailAlerts: emailAlertsRouter,
  scheduledReports: scheduledReportsRouter,
  termination:  terminationRouter,
  bouncePenalty: bouncePenaltyRouter,
  leaseOriginationNew: leaseOriginationNewRouter,
  furnishedAssets: furnishedAssetsRouter,
  assetDeposit:    assetDepositRouter,
  handoverChecklist: handoverChecklistRouter,
  masterContracts: masterContractsRouter,
  aiFill:          aiFillRouter,
  contractDms:     contractDmsRouter,
  lessee:          lesseeRouter,
  journalVoucher:  journalVoucherRouter,
  transactionEngine: transactionEngineRouter,
  furnitureCollections: furnitureCollectionsRouter,
  vendor:       vendorRouter,
  broker:       brokerRouter,
  loi:          loiRouter,
  tiAllowance:  tiAllowanceRouter,
  deskBooking:  deskBookingRouter,
  workOrder:    workOrderRouter,
  notificationSettings: notificationSettingsRouter,
  ssoConfig:    ssoConfigRouter,
  apiWebhook:   apiWebhookRouter,
  leaseModification: leaseModificationRouter,
  leaseRenewal: leaseRenewalRouter,
  glJournal:    glJournalRouter,
  leaseComparison: leaseComparisonRouter,
  eSignature:   eSignatureRouter,
  screenMeta:   screenMetaRouter,
  staff:        staffRouter,
  businessRules: businessRulesRouter,
  glConfiguration: glConfigurationRouter,
  performance: performanceRouter,
  reportEngine: reportEngineRouter,
});

export type AppRouter = typeof appRouter;
