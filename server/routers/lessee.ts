/**
 * VodaLease Enterprise — Lessee Master Router
 * All DML via stored procedures.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getPool, sql } from "../db-sqlserver";

// ─── Input Schemas ────────────────────────────────────────────────────────────

const LesseeUpsertInput = z.object({
  lesseeId:       z.number().int().optional(),
  lesseeCode:     z.string().min(1).max(30),
  lesseeName:     z.string().min(1).max(200),
  tradeName:      z.string().max(200).optional(),
  entityType:     z.enum(["Real Estate", "Car Fleet", "Company", "Subsidiary", "Branch", "JV", "Individual"]),
  parentCompany:  z.string().max(200).optional(),
  registrationNo: z.string().max(100).optional(),
  taxVatNo:       z.string().max(100).optional(),
  industrySector: z.string().max(100).optional(),
  creditRating:   z.string().max(20).optional(),
  country:        z.string().min(1).max(100),
  city:           z.string().max(100).optional(),
  address:        z.string().max(500).optional(),
  poBox:          z.string().max(50).optional(),
  contactPerson:  z.string().max(200).optional(),
  contactEmail:   z.string().email().max(200).optional(),
  contactPhone:   z.string().max(50).optional(),
  website:        z.string().max(200).optional(),
  status:         z.enum(["Active", "Inactive", "Suspended"]),
  notes:          z.string().max(1000).optional(),
});

const BankAccountInput = z.object({
  bankAccountId:  z.number().int().optional(),
  lesseeId:       z.number().int(),
  bankName:       z.string().min(1).max(200),
  accountName:    z.string().min(1).max(200),
  accountNumber:  z.string().min(1).max(50),
  iban:           z.string().max(50).optional(),
  swiftBic:       z.string().max(20).optional(),
  currency:       z.string().length(3).default("QAR"),
  branch:         z.string().max(200).optional(),
  isPrimary:      z.boolean().default(false),
});

const SignatoryInput = z.object({
  signatoryId:    z.number().int().optional(),
  lesseeId:       z.number().int(),
  fullName:       z.string().min(1).max(200),
  designation:    z.string().max(200).optional(),
  email:          z.string().email().max(200).optional(),
  phone:          z.string().max(50).optional(),
  authorityLimit: z.number().optional(),
  isActive:       z.boolean().default(true),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const lesseeRouter = router({

  // List lessees with pagination, search, filter
  getLessees: protectedProcedure
    .input(z.object({
      page:       z.number().int().min(1).default(1),
      pageSize:   z.number().int().min(1).max(200).default(50),
      search:     z.string().optional(),
      status:     z.string().optional(),
      entityType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const result = await pool.request()
        .input("PageNumber",   sql.Int,          input.page)
        .input("PageSize",     sql.Int,          input.pageSize)
        .input("SearchTerm",   sql.NVarChar(200), input.search   ?? null)
        .input("StatusFilter", sql.VarChar(20),   input.status   ?? null)
        .input("EntityType",   sql.VarChar(30),   input.entityType ?? null)
        .execute("sp_GetLessees");
      const rows = result.recordset ?? [];
      const totalCount = rows[0]?.total_count ?? 0;
      return { rows, totalCount, page: input.page, pageSize: input.pageSize };
    }),

  // Get single lessee with bank accounts and signatories
  getLesseeById: protectedProcedure
    .input(z.object({ lesseeId: z.number().int() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const result = await pool.request()
        .input("LesseeId", sql.Int, input.lesseeId)
        .execute("sp_GetLesseeById");
      const rs = result.recordsets as any[];
      const lessee       = rs[0]?.[0] ?? null;
      const bankAccounts = rs[1] ?? [];
      const signatories  = rs[2] ?? [];
      return { lessee, bankAccounts, signatories };
    }),

  // Create or update a lessee
  upsertLessee: protectedProcedure
    .input(LesseeUpsertInput)
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const result = await pool.request()
        .input("LesseeId",       sql.Int,           input.lesseeId      ?? null)
        .input("LesseeCode",     sql.VarChar(30),   input.lesseeCode)
        .input("LesseeName",     sql.NVarChar(200), input.lesseeName)
        .input("TradeName",      sql.NVarChar(200), input.tradeName     ?? null)
        .input("EntityType",     sql.VarChar(30),   input.entityType)
        .input("ParentCompany",  sql.NVarChar(200), input.parentCompany ?? null)
        .input("RegistrationNo", sql.VarChar(100),  input.registrationNo ?? null)
        .input("TaxVatNo",       sql.VarChar(100),  input.taxVatNo      ?? null)
        .input("IndustrySector", sql.NVarChar(100), input.industrySector ?? null)
        .input("CreditRating",   sql.VarChar(20),   input.creditRating  ?? null)
        .input("Country",        sql.VarChar(100),  input.country)
        .input("City",           sql.NVarChar(100), input.city          ?? null)
        .input("Address",        sql.NVarChar(500), input.address       ?? null)
        .input("PoBox",          sql.VarChar(50),   input.poBox         ?? null)
        .input("ContactPerson",  sql.NVarChar(200), input.contactPerson ?? null)
        .input("ContactEmail",   sql.VarChar(200),  input.contactEmail  ?? null)
        .input("ContactPhone",   sql.VarChar(50),   input.contactPhone  ?? null)
        .input("Website",        sql.VarChar(200),  input.website       ?? null)
        .input("Status",         sql.VarChar(20),   input.status)
        .input("Notes",          sql.NVarChar(1000),input.notes         ?? null)
        .input("CreatedBy",      sql.Int,           ctx.user.id)
        .execute("sp_UpsertLessee");
      return { lesseeId: result.recordset?.[0]?.lessee_id };
    }),

  // Soft-delete (sets status = Inactive)
  deleteLessee: protectedProcedure
    .input(z.object({ lesseeId: z.number().int() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("LesseeId", sql.Int, input.lesseeId)
        .execute("sp_DeleteLessee");
      return { success: true };
    }),

  // Dropdown list for lease forms
  getLesseeDropdown: protectedProcedure
    .query(async () => {
      const pool = await getPool();
      const result = await pool.request().execute("sp_GetLesseeDropdown");
      return result.recordset ?? [];
    }),

  // ── Bank Accounts ──────────────────────────────────────────────────────────

  upsertBankAccount: protectedProcedure
    .input(BankAccountInput)
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("BankAccountId",  sql.Int,           input.bankAccountId ?? null)
        .input("LesseeId",       sql.Int,           input.lesseeId)
        .input("BankName",       sql.NVarChar(200), input.bankName)
        .input("AccountName",    sql.NVarChar(200), input.accountName)
        .input("AccountNumber",  sql.VarChar(50),   input.accountNumber)
        .input("IBAN",           sql.VarChar(50),   input.iban          ?? null)
        .input("SwiftBic",       sql.VarChar(20),   input.swiftBic      ?? null)
        .input("Currency",       sql.Char(3),       input.currency)
        .input("Branch",         sql.NVarChar(200), input.branch        ?? null)
        .input("IsPrimary",      sql.Bit,           input.isPrimary ? 1 : 0)
        .execute("sp_UpsertLesseeBankAccount");
      return { success: true };
    }),

  deleteBankAccount: protectedProcedure
    .input(z.object({ bankAccountId: z.number().int() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .query(`DELETE FROM lessee.lessee_bank_accounts WHERE bank_account_id = ${input.bankAccountId}`);
      return { success: true };
    }),

  // ── Signatories ────────────────────────────────────────────────────────────

  upsertSignatory: protectedProcedure
    .input(SignatoryInput)
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("SignatoryId",    sql.Int,            input.signatoryId    ?? null)
        .input("LesseeId",       sql.Int,            input.lesseeId)
        .input("FullName",       sql.NVarChar(200),  input.fullName)
        .input("Designation",    sql.NVarChar(200),  input.designation    ?? null)
        .input("Email",          sql.VarChar(200),   input.email          ?? null)
        .input("Phone",          sql.VarChar(50),    input.phone          ?? null)
        .input("AuthorityLimit", sql.Decimal(18, 2), input.authorityLimit ?? null)
        .input("IsActive",       sql.Bit,            input.isActive ? 1 : 0)
        .execute("sp_UpsertLesseeSignatory");
      return { success: true };
    }),

  deleteSignatory: protectedProcedure
    .input(z.object({ signatoryId: z.number().int() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .query(`UPDATE lessee.lessee_signatories SET is_active = 0 WHERE signatory_id = ${input.signatoryId}`);
      return { success: true };
    }),
});
