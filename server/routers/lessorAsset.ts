import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { execSPP, execSPPMulti, getPool, SPPParam } from "../db-sqlserver";
import { invokeLLM } from "../_core/llm";

let leaseSubAssetAttachProcReady = false;

async function ensureLeaseSubAssetAttachProcedure() {
  if (leaseSubAssetAttachProcReady) return;
  const pool = await getPool();
  await pool.request().query(`
    CREATE OR ALTER PROCEDURE asset.sp_AttachSubAssetToLease
      @lease_id          NVARCHAR(50),
      @lease_ref         NVARCHAR(100) = NULL,
      @asset_id          INT,
      @asset_code        NVARCHAR(50),
      @set_name          NVARCHAR(255),
      @created_by        NVARCHAR(100) = NULL,
      @tags_with_serials NVARCHAR(MAX) = NULL,
      @lessee_name       NVARCHAR(255) = NULL
    AS
    BEGIN
      SET NOCOUNT ON;

      IF EXISTS (
        SELECT 1 FROM asset.lease_sub_assets
        WHERE lease_id = @lease_id AND asset_id = @asset_id
          AND (set_name = @set_name OR (set_name IS NULL AND @set_name IS NULL))
          AND status NOT IN ('Returned','WriteOff','Condemned')
      )
      BEGIN
        SELECT -1 AS lease_sub_asset_id, 'Already attached' AS message;
        RETURN;
      END

      INSERT INTO asset.lease_sub_assets
        (lease_id, lease_ref, asset_id, asset_code, set_name, status, status_date, created_by, created_at, tags_with_serials, owner)
      VALUES
        (@lease_id, @lease_ref, @asset_id, @asset_code, @set_name, 'Active', GETUTCDATE(), @created_by, GETUTCDATE(), @tags_with_serials, @lessee_name);

      SELECT CONVERT(INT, SCOPE_IDENTITY()) AS lease_sub_asset_id, 'OK' AS message;
    END
  `);
  leaseSubAssetAttachProcReady = true;
}

// ─── Lessor Router ────────────────────────────────────────────────────────────
export const lessorRouter = router({

  getLessors: protectedProcedure
    .input(z.object({
      searchTerm:  z.string().optional(),
      status:      z.enum(["Active","Inactive","Blacklisted"]).optional(),
      lessorType:  z.string().optional(),
      country:     z.string().optional(),
      pageNumber:  z.number().int().min(1).default(1),
      pageSize:    z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "SearchTerm",  type: "NVarChar", value: input.searchTerm ?? null },
        { name: "Status",      type: "VarChar",  value: input.status ?? null },
        { name: "LessorType",  type: "VarChar",  value: input.lessorType ?? null },
        { name: "Country",     type: "VarChar",  value: input.country ?? null },
        { name: "PageNumber",  type: "Int",      value: input.pageNumber },
        { name: "PageSize",    type: "Int",      value: input.pageSize },
      ];
      const rows = await execSPP("sp_GetLessors", params);
      const total = rows[0]?.total_rows ?? 0;
      return { lessors: rows, total, pageNumber: input.pageNumber, pageSize: input.pageSize };
    }),

  getLessorDetail: protectedProcedure
    .input(z.object({ lessorId: z.number().int() }))
    .query(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "LessorId", type: "Int", value: input.lessorId },
      ];
      const results = await execSPPMulti("sp_GetLessorDetail", params);
      return {
        lessor:       results[0]?.[0] ?? null,
        contacts:     results[1] ?? [],
        bankAccounts: results[2] ?? [],
        documents:    results[3] ?? [],
        notes:        results[4] ?? [],
        assets:       results[5] ?? [],
      };
    }),

  upsertLessor: protectedProcedure
    .input(z.object({
      lessorId:             z.number().int().optional(),
      lessorName:           z.string().min(2),
      lessorType:           z.enum(["Individual","Company","Government","REIT","Trust"]).default("Company"),
      registrationNo:       z.string().optional(),
      taxId:                z.string().optional(),
      country:              z.string().length(2).default("AE"),
      city:                 z.string().optional(),
      addressLine1:         z.string().optional(),
      addressLine2:         z.string().optional(),
      postalCode:           z.string().optional(),
      website:              z.string().optional(),
      creditRating:         z.string().optional(),
      paymentTerms:         z.number().int().default(30),
      preferredCurrency:    z.string().length(3).default("AED"),
      status:               z.enum(["Active","Inactive","Blacklisted"]).default("Active"),
      blacklistReason:      z.string().optional(),
      // Lessee fields
      lesseeType:           z.enum(["Staff","Client","Other"]).optional(),
      lesseeName:           z.string().optional(),
      staffNumber:          z.string().optional(),
      grade:                z.string().optional(),
      position:             z.string().optional(),
      placeOfWork:          z.string().optional(),
      lesseeDepartment:     z.string().optional(),
      employeeId:           z.string().optional(),
      lesseeContactEmail:   z.string().email().optional().or(z.literal("")),
      lesseeContactPhone:   z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "LessorId",            type: "Int",      value: input.lessorId ?? null },
        { name: "LessorName",          type: "NVarChar",  value: input.lessorName },
        { name: "LessorType",          type: "VarChar",   value: input.lessorType },
        { name: "RegistrationNo",      type: "NVarChar",  value: input.registrationNo ?? null },
        { name: "TaxId",               type: "NVarChar",  value: input.taxId ?? null },
        { name: "Country",             type: "VarChar",   value: input.country },
        { name: "City",                type: "NVarChar",  value: input.city ?? null },
        { name: "AddressLine1",        type: "NVarChar",  value: input.addressLine1 ?? null },
        { name: "AddressLine2",        type: "NVarChar",  value: input.addressLine2 ?? null },
        { name: "PostalCode",          type: "VarChar",   value: input.postalCode ?? null },
        { name: "Website",             type: "NVarChar",  value: input.website ?? null },
        { name: "CreditRating",        type: "VarChar",   value: input.creditRating ?? null },
        { name: "PaymentTerms",        type: "Int",       value: input.paymentTerms },
        { name: "PreferredCurrency",   type: "VarChar",   value: input.preferredCurrency },
        { name: "Status",              type: "VarChar",   value: input.status },
        { name: "BlacklistReason",     type: "NVarChar",  value: input.blacklistReason ?? null },
        { name: "CreatedBy",           type: "NVarChar",  value: ctx.user?.name ?? "system" },
        { name: "ScreenId",            type: "VarChar",   value: "VFLSELESSMST0001P001" },
        { name: "LesseeType",          type: "NVarChar",  value: input.lesseeType ?? null },
        { name: "LesseeName",          type: "NVarChar",  value: input.lesseeName ?? null },
        { name: "StaffNumber",         type: "NVarChar",  value: input.staffNumber ?? null },
        { name: "Grade",               type: "NVarChar",  value: input.grade ?? null },
        { name: "Position",            type: "NVarChar",  value: input.position ?? null },
        { name: "PlaceOfWork",         type: "NVarChar",  value: input.placeOfWork ?? null },
        { name: "Department",          type: "NVarChar",  value: input.lesseeDepartment ?? null },
        { name: "EmployeeId",          type: "NVarChar",  value: input.employeeId ?? null },
        { name: "LesseeContactEmail",  type: "NVarChar",  value: input.lesseeContactEmail || null },
        { name: "LesseeContactPhone",  type: "NVarChar",  value: input.lesseeContactPhone ?? null },
      ];
      const rows = await execSPP("sp_UpsertLessor", params);
      return rows[0];
    }),

  deleteLessor: protectedProcedure
    .input(z.object({ lessorId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "LessorId",  type: "Int",     value: input.lessorId },
        { name: "DeletedBy", type: "NVarChar", value: ctx.user?.name ?? "system" },
      ];
      const rows = await execSPP("sp_DeleteLessor", params);
      return rows[0];
    }),

  upsertContact: protectedProcedure
    .input(z.object({
      contactId:      z.number().int().optional(),
      lessorId:       z.number().int(),
      contactType:    z.enum(["Primary","Finance","Legal","Operations","Emergency"]).default("Primary"),
      fullName:       z.string().min(2),
      jobTitle:       z.string().optional(),
      department:     z.string().optional(),
      email:          z.string().email().optional(),
      phonePrimary:   z.string().optional(),
      phoneSecondary: z.string().optional(),
      whatsapp:       z.string().optional(),
      isPrimary:      z.boolean().default(false),
      notes:          z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "ContactId",      type: "Int",      value: input.contactId ?? null },
        { name: "LessorId",       type: "Int",      value: input.lessorId },
        { name: "ContactType",    type: "VarChar",  value: input.contactType },
        { name: "FullName",       type: "NVarChar", value: input.fullName },
        { name: "JobTitle",       type: "NVarChar", value: input.jobTitle ?? null },
        { name: "Department",     type: "NVarChar", value: input.department ?? null },
        { name: "Email",          type: "NVarChar", value: input.email ?? null },
        { name: "PhonePrimary",   type: "VarChar",  value: input.phonePrimary ?? null },
        { name: "PhoneSecondary", type: "VarChar",  value: input.phoneSecondary ?? null },
        { name: "Whatsapp",       type: "VarChar",  value: input.whatsapp ?? null },
        { name: "IsPrimary",      type: "Bit",      value: input.isPrimary ? 1 : 0 },
        { name: "Notes",          type: "NVarChar", value: input.notes ?? null },
      ];
      const rows = await execSPP("sp_UpsertLessorContact", params);
      return rows[0];
    }),

  deleteContact: protectedProcedure
    .input(z.object({ contactId: z.number().int(), lessorId: z.number().int() }))
    .mutation(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "ContactId", type: "Int", value: input.contactId },
        { name: "LessorId",  type: "Int", value: input.lessorId },
      ];
      const rows = await execSPP("sp_DeleteLessorContact", params);
      return rows[0];
    }),

  upsertBankAccount: protectedProcedure
    .input(z.object({
      bankAccId:     z.number().int().optional(),
      lessorId:      z.number().int(),
      bankName:      z.string().min(2),
      accountName:   z.string().min(2),
      accountNumber: z.string().min(4),
      iban:          z.string().optional(),
      swiftCode:     z.string().optional(),
      routingNumber: z.string().optional(),
      currency:      z.string().length(3).default("AED"),
      accountType:   z.enum(["Current","Savings","Fixed"]).default("Current"),
      branchName:    z.string().optional(),
      branchCode:    z.string().optional(),
      country:       z.string().length(2).default("AE"),
      isPrimary:     z.boolean().default(false),
      verifiedBy:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "BankAccId",     type: "Int",      value: input.bankAccId ?? null },
        { name: "LessorId",      type: "Int",      value: input.lessorId },
        { name: "BankName",      type: "NVarChar", value: input.bankName },
        { name: "AccountName",   type: "NVarChar", value: input.accountName },
        { name: "AccountNumber", type: "NVarChar", value: input.accountNumber },
        { name: "IBAN",          type: "NVarChar", value: input.iban ?? null },
        { name: "SwiftCode",     type: "VarChar",  value: input.swiftCode ?? null },
        { name: "RoutingNumber", type: "VarChar",  value: input.routingNumber ?? null },
        { name: "Currency",      type: "VarChar",  value: input.currency },
        { name: "AccountType",   type: "VarChar",  value: input.accountType },
        { name: "BranchName",    type: "NVarChar", value: input.branchName ?? null },
        { name: "BranchCode",    type: "VarChar",  value: input.branchCode ?? null },
        { name: "Country",       type: "VarChar",  value: input.country },
        { name: "IsPrimary",     type: "Bit",      value: input.isPrimary ? 1 : 0 },
        { name: "VerifiedBy",    type: "NVarChar", value: input.verifiedBy ?? null },
      ];
      const rows = await execSPP("sp_UpsertLessorBankAccount", params);
      return rows[0];
    }),

  deleteBankAccount: protectedProcedure
    .input(z.object({ bankAccId: z.number().int(), lessorId: z.number().int() }))
    .mutation(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "BankAccId", type: "Int", value: input.bankAccId },
        { name: "LessorId",  type: "Int", value: input.lessorId },
      ];
      const rows = await execSPP("sp_DeleteLessorBankAccount", params);
      return rows[0];
    }),

  addDocument: protectedProcedure
    .input(z.object({
      lessorId:     z.number().int(),
      docType:      z.string(),
      docName:      z.string(),
      docNumber:    z.string().optional(),
      issueDate:    z.string().optional(),
      expiryDate:   z.string().optional(),
      issuingAuth:  z.string().optional(),
      filePath:     z.string().optional(),
      fileSizeKb:   z.number().int().optional(),
      notes:        z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "LessorId",   type: "Int",      value: input.lessorId },
        { name: "DocType",    type: "VarChar",  value: input.docType },
        { name: "DocName",    type: "NVarChar", value: input.docName },
        { name: "DocNumber",  type: "NVarChar", value: input.docNumber ?? null },
        { name: "IssueDate",  type: "Date",     value: input.issueDate ?? null },
        { name: "ExpiryDate", type: "Date",     value: input.expiryDate ?? null },
        { name: "IssuingAuth",type: "NVarChar", value: input.issuingAuth ?? null },
        { name: "FilePath",   type: "NVarChar", value: input.filePath ?? null },
        { name: "FileSizeKb", type: "Int",      value: input.fileSizeKb ?? null },
        { name: "Notes",      type: "NVarChar", value: input.notes ?? null },
        { name: "UploadedBy", type: "NVarChar", value: ctx.user?.name ?? "system" },
      ];
      const rows = await execSPP("sp_AddLessorDocument", params);
      return rows[0];
    }),

  addNote: protectedProcedure
    .input(z.object({
      lessorId:  z.number().int(),
      noteType:  z.enum(["General","Legal","Financial","Dispute","Negotiation"]).default("General"),
      subject:   z.string().min(2),
      noteText:  z.string().min(2),
      isPrivate: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "LessorId",  type: "Int",      value: input.lessorId },
        { name: "NoteType",  type: "VarChar",  value: input.noteType },
        { name: "Subject",   type: "NVarChar", value: input.subject },
        { name: "NoteText",  type: "NVarChar", value: input.noteText },
        { name: "IsPrivate", type: "Bit",      value: input.isPrivate ? 1 : 0 },
        { name: "CreatedBy", type: "NVarChar", value: ctx.user?.name ?? "system" },
      ];
      const rows = await execSPP("sp_AddLessorNote", params);
      return rows[0];
    }),

  getLessorAssets: protectedProcedure
    .input(z.object({ lessorId: z.number().int() }))
    .query(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "LessorId", type: "Int", value: input.lessorId },
      ];
      return await execSPP("sp_GetLessorAssets", params);
    }),

  // ── getLesseeList: all lessors that have a lessee name set ────────────────
  getLesseeList: publicProcedure.query(async () => {
    const rows = await execSPP("dbo.sp_GetLesseeList", []);
    return rows.map((r: any) => ({
      lessorId:     r.lessor_id     as number,
      lesseeName:   r.lessee_name   as string,
      lesseeType:   (r.lessee_type  ?? "Staff") as string,
      staffNumber:  (r.staff_number ?? "")       as string,
      employeeId:   (r.employee_id  ?? "")       as string,
      grade:        (r.grade        ?? "")       as string,
      position:     (r.position     ?? "")       as string,
      department:   (r.department   ?? "")       as string,
      placeOfWork:  (r.place_of_work ?? "")      as string,
      contactEmail: (r.contact_email ?? "")      as string,
      contactPhone: (r.contact_phone ?? "")      as string,
      lessorName:   (r.lessor_name  ?? "")       as string,
      lessorCode:   (r.lessor_code  ?? "")       as string,
    }));
  }),

  // ── getLeaseByLessee: given lessorId, returns their linked lease contract ────
  getLeaseByLessee: publicProcedure
    .input(z.object({ lessorId: z.number() }))
    .query(async ({ input }) => {
      const rows = await execSPP("dbo.sp_GetLeaseByLessee", [
        { name: "LessorId", type: "Int", value: input.lessorId },
      ]);
      if (!rows || rows.length === 0) return null;
      const r = rows[0];
      return {
        contractId:       r.contract_id       as number,
        leaseRef:         (r.lease_ref        ?? "") as string,
        assetName:        (r.asset_name       ?? "") as string,
        assetType:        (r.asset_type       ?? "") as string,
        status:           (r.status           ?? "") as string,
        commencementDate: r.commencement_date  ?? null,
        expiryDate:       r.expiry_date        ?? null,
        currency:         (r.currency         ?? "QAR") as string,
        monthlyPayment:   (r.monthly_payment  ?? 0)  as number,
        lessorName:       (r.lessor_name      ?? "") as string,
        lesseeName:       (r.lessee_name      ?? "") as string,
        lesseeType:       (r.lessee_type      ?? "") as string,
        staffNumber:      (r.staff_number     ?? "") as string,
        position:         (r.position         ?? "") as string,
        department:       (r.department       ?? "") as string,
      };
    }),

  // ── getLessorDropdown: minimal list for form dropdowns ────────────────────
  getLessorDropdown: protectedProcedure
    .query(async () => {
      const rows = await execSPP("sp_GetLessors", [
        { name: "SearchTerm", type: "NVarChar", value: null },
        { name: "Status",     type: "VarChar",  value: "Active" },
        { name: "LessorType", type: "VarChar",  value: null },
        { name: "Country",    type: "VarChar",  value: null },
        { name: "PageNumber", type: "Int",      value: 1 },
        { name: "PageSize",   type: "Int",      value: 100 },
      ]);
      return rows.map((r: any) => ({
        lessorId:   r.lessor_id   as number,
        lessorCode: (r.lessor_code ?? "") as string,
        lessorName: (r.lessor_name ?? r.company_name ?? "") as string,
        country:    (r.country ?? "") as string,
      }));
    }),

  // ── getStaffDropdown: staff list for form dropdowns ───────────────────────
  getStaffDropdown: protectedProcedure
    .input(z.object({ searchTerm: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      req.input("SearchTerm", input.searchTerm ?? null);
      const result = await req.execute("hr.sp_GetStaffDropdown");
      const rows = (result.recordset ?? []) as any[];
      return rows.map(r => ({
        staffId:     r.staff_id     as number,
        staffNumber: (r.staff_number ?? "") as string,
        fullName:    (r.full_name   ?? "") as string,
        designation: (r.designation ?? "") as string,
        department:  (r.department  ?? "") as string,
        grade:       (r.grade       ?? "") as string,
        position:    (r.position    ?? "") as string,
        placeOfWork: (r.place_of_work ?? "") as string,
        email:       (r.email       ?? "") as string,
        phone:       (r.phone       ?? "") as string,
        entity:      (r.entity      ?? "") as string,
      }));
    }),

});

// ─── Asset Router ─────────────────────────────────────────────────────────────
export const assetRouter = router({

  getAssets: protectedProcedure
    .input(z.object({
      searchTerm:       z.string().optional(),
      assetType:        z.string().optional(),
      status:           z.string().optional(),
      country:          z.string().optional(),
      lessorId:         z.number().int().optional(),
      maintenanceResp:  z.string().optional(),
      pageNumber:       z.number().int().min(1).default(1),
      pageSize:         z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "SearchTerm",     type: "NVarChar", value: input.searchTerm ?? null },
        { name: "AssetType",      type: "VarChar",  value: input.assetType ?? null },
        { name: "Status",         type: "VarChar",  value: input.status ?? null },
        { name: "Country",        type: "VarChar",  value: input.country ?? null },
        { name: "LessorId",       type: "Int",      value: input.lessorId ?? null },
        { name: "MaintenanceResp",type: "VarChar",  value: input.maintenanceResp ?? null },
        { name: "PageNumber",     type: "Int",      value: input.pageNumber },
        { name: "PageSize",       type: "Int",      value: input.pageSize },
      ];
      const rows = await execSPP("sp_GetAssets", params);
      const total = rows[0]?.total_rows ?? 0;
      return { assets: rows, total, pageNumber: input.pageNumber, pageSize: input.pageSize };
    }),

  getAssetDetail: protectedProcedure
    .input(z.object({ assetId: z.number().int() }))
    .query(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "AssetId", type: "Int", value: input.assetId },
      ];
      const results = await execSPPMulti("sp_GetAssetDetail", params);
      return {
        asset:        results[0]?.[0] ?? null,
        documents:    results[1] ?? [],
        maintenance:  results[2] ?? [],
        insurance:    results[3] ?? [],
      };
    }),

  getAssetLeaseHistory: protectedProcedure
    .input(z.object({ assetId: z.number().int() }))
    .query(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "AssetId", type: "Int", value: input.assetId },
      ];
      return await execSPP("sp_GetAssetLeaseHistory", params);
    }),

  upsertAsset: protectedProcedure
    .input(z.object({
      assetId:                   z.number().int().optional(),
      assetName:                 z.string().min(2),
      assetType:                 z.enum(["Tower Site","Data Centre","Retail Outlet","Office","Warehouse","Vehicle","Network Equipment","Land","Other"]),
      assetSubtype:              z.string().optional(),
      description:               z.string().optional(),
      country:                   z.string().length(2).default("AE"),
      city:                      z.string().optional(),
      area:                      z.string().optional(),
      addressLine1:              z.string().optional(),
      addressLine2:              z.string().optional(),
      postalCode:                z.string().optional(),
      latitude:                  z.number().optional(),
      longitude:                 z.number().optional(),
      floorAreaSqm:              z.number().optional(),
      floors:                    z.number().int().optional(),
      yearBuilt:                 z.number().int().optional(),
      conditionRating:           z.enum(["Excellent","Good","Fair","Poor"]).optional(),
      currentLessorId:           z.number().int().optional(),
      status:                    z.enum(["Available","Leased","Under Maintenance","Decommissioned"]).default("Available"),
      maintenanceResponsibility: z.enum(["Lessor","Vodafone","Shared"]).default("Lessor"),
      estimatedMarketValue:      z.number().optional(),
      lastValuationDate:         z.string().optional(),
      makeGoodProvision:         z.number().default(0),
      tags:                      z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "AssetId",                   type: "Int",      value: input.assetId ?? null },
        { name: "AssetName",                 type: "NVarChar", value: input.assetName },
        { name: "AssetType",                 type: "VarChar",  value: input.assetType },
        { name: "AssetSubtype",              type: "NVarChar", value: input.assetSubtype ?? null },
        { name: "Description",               type: "NVarChar", value: input.description ?? null },
        { name: "Country",                   type: "VarChar",  value: input.country },
        { name: "City",                      type: "NVarChar", value: input.city ?? null },
        { name: "Area",                      type: "NVarChar", value: input.area ?? null },
        { name: "AddressLine1",              type: "NVarChar", value: input.addressLine1 ?? null },
        { name: "AddressLine2",              type: "NVarChar", value: input.addressLine2 ?? null },
        { name: "PostalCode",                type: "VarChar",  value: input.postalCode ?? null },
        { name: "Latitude",                  type: "Decimal",  value: input.latitude ?? null },
        { name: "Longitude",                 type: "Decimal",  value: input.longitude ?? null },
        { name: "FloorAreaSqm",              type: "Decimal",  value: input.floorAreaSqm ?? null },
        { name: "Floors",                    type: "Int",      value: input.floors ?? null },
        { name: "YearBuilt",                 type: "Int",      value: input.yearBuilt ?? null },
        { name: "ConditionRating",           type: "VarChar",  value: input.conditionRating ?? null },
        { name: "CurrentLessorId",           type: "Int",      value: input.currentLessorId ?? null },
        { name: "Status",                    type: "VarChar",  value: input.status },
        { name: "MaintenanceResponsibility", type: "VarChar",  value: input.maintenanceResponsibility },
        { name: "EstimatedMarketValue",      type: "Decimal",  value: input.estimatedMarketValue ?? null },
        { name: "LastValuationDate",         type: "Date",     value: input.lastValuationDate ?? null },
        { name: "MakeGoodProvision",         type: "Decimal",  value: input.makeGoodProvision },
        { name: "Tags",                      type: "NVarChar", value: input.tags ?? null },
        { name: "CreatedBy",                 type: "NVarChar", value: ctx.user?.name ?? "system" },
        { name: "ScreenId",                  type: "VarChar",  value: "VFLSEASTREG0001P001" },
      ];
      const rows = await execSPP("sp_UpsertAsset", params);
      return rows[0];
    }),

  deleteAsset: protectedProcedure
    .input(z.object({ assetId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "AssetId",   type: "Int",     value: input.assetId },
        { name: "DeletedBy", type: "NVarChar", value: ctx.user?.name ?? "system" },
      ];
      const rows = await execSPP("sp_DeleteAsset", params);
      return rows[0];
    }),

  // ── Sub-Asset Groups (furniture/appliance sets) ─────────────────────────
  getSubAssetGroups: protectedProcedure
    .query(async () => {
      const params: SPPParam[] = [
        { name: "SearchTerm",     type: "NVarChar", value: null },
        { name: "AssetType",      type: "VarChar",  value: "SUB_ASSET_GROUP" },
        { name: "Status",         type: "VarChar",  value: null },
        { name: "Country",        type: "VarChar",  value: null },
        { name: "LessorId",       type: "Int",      value: null },
        { name: "MaintenanceResp",type: "VarChar",  value: null },
        { name: "PageNumber",     type: "Int",      value: 1 },
        { name: "PageSize",       type: "Int",      value: 500 },
      ];
      const rows = await execSPP("sp_GetAssets", params);
      return rows.map((r: Record<string, unknown>) => ({
        assetId:     r.asset_id as number,
        assetCode:   r.asset_code as string,
        setName:     r.asset_name as string,
        description: (r.description as string | null) ?? "",
        tags:        (r.tags as string | null) ?? "[]",
        lessorId:    (r.lessor_id as number | null) ?? null,
        lessorName:  (r.lessor_name as string | null) ?? "",
        createdAt:   r.created_at as string,
        updatedAt:   r.updated_at as string,
      }));
    }),

  getSubAssetGroupsByLessor: protectedProcedure
    .input(z.object({ lessorId: z.number().int().optional() }))
    .query(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "SearchTerm",     type: "NVarChar", value: null },
        { name: "AssetType",      type: "VarChar",  value: "SUB_ASSET_GROUP" },
        { name: "Status",         type: "VarChar",  value: null },
        { name: "Country",        type: "VarChar",  value: null },
        { name: "LessorId",       type: "Int",      value: input.lessorId ?? null },
        { name: "MaintenanceResp",type: "VarChar",  value: null },
        { name: "PageNumber",     type: "Int",      value: 1 },
        { name: "PageSize",       type: "Int",      value: 500 },
      ];
      const rows = await execSPP("sp_GetAssets", params);
      return rows.map((r: Record<string, unknown>) => ({
        assetId:     r.asset_id as number,
        assetCode:   r.asset_code as string,
        setName:     r.asset_name as string,
        description: (r.description as string | null) ?? "",
        tags:        (r.tags as string | null) ?? "[]",
        lessorId:    (r.lessor_id as number | null) ?? null,
        lessorName:  (r.lessor_name as string | null) ?? "",
        createdAt:   r.created_at as string,
        updatedAt:   r.updated_at as string,
      }));
    }),

  upsertSubAssetGroup: protectedProcedure
    .input(z.object({
      assetId:     z.number().int().optional(),
      setName:     z.string().min(1),
      description: z.string().optional(),
      tags:        z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "AssetId",                   type: "Int",      value: input.assetId ?? null },
        { name: "AssetName",                 type: "NVarChar", value: input.setName },
        { name: "AssetType",                 type: "VarChar",  value: "SUB_ASSET_GROUP" },
        { name: "AssetSubtype",              type: "NVarChar", value: null },
        { name: "Description",               type: "NVarChar", value: input.description ?? null },
        { name: "Country",                   type: "VarChar",  value: "QA" },
        { name: "City",                      type: "NVarChar", value: "Doha" },
        { name: "Area",                      type: "NVarChar", value: null },
        { name: "AddressLine1",              type: "NVarChar", value: null },
        { name: "AddressLine2",              type: "NVarChar", value: null },
        { name: "PostalCode",                type: "VarChar",  value: null },
        { name: "Latitude",                  type: "Decimal",  value: null },
        { name: "Longitude",                 type: "Decimal",  value: null },
        { name: "FloorAreaSqm",              type: "Decimal",  value: null },
        { name: "Floors",                    type: "Int",      value: null },
        { name: "YearBuilt",                 type: "Int",      value: null },
        { name: "ConditionRating",           type: "VarChar",  value: null },
        { name: "CurrentLessorId",           type: "Int",      value: null },
        { name: "Status",                    type: "VarChar",  value: "Available" },
        { name: "MaintenanceResponsibility", type: "VarChar",  value: "Lessor" },
        { name: "EstimatedMarketValue",      type: "Decimal",  value: null },
        { name: "LastValuationDate",         type: "Date",     value: null },
        { name: "MakeGoodProvision",         type: "Decimal",  value: 0 },
        { name: "Tags",                      type: "NVarChar", value: input.tags ?? null },
        { name: "CreatedBy",                 type: "NVarChar", value: ctx.user?.name ?? "system" },
        { name: "ScreenId",                  type: "VarChar",  value: "VFLSASSET001" },
      ];
      const rows = await execSPP("sp_UpsertAsset", params);
      return rows[0] as { asset_id: number; asset_code: string };
    }),

  deleteSubAssetGroup: protectedProcedure
    .input(z.object({ assetId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "AssetId",   type: "Int",      value: input.assetId },
        { name: "DeletedBy", type: "NVarChar", value: ctx.user?.name ?? "system" },
      ];
      const rows = await execSPP("sp_DeleteAsset", params);
      return rows[0];
    }),

  addDocument: protectedProcedure
    .input(z.object({
      assetId:    z.number().int(),
      docType:    z.string(),
      docName:    z.string(),
      docNumber:  z.string().optional(),
      issueDate:  z.string().optional(),
      expiryDate: z.string().optional(),
      filePath:   z.string().optional(),
      fileSizeKb: z.number().int().optional(),
      notes:      z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "AssetId",    type: "Int",      value: input.assetId },
        { name: "DocType",    type: "VarChar",  value: input.docType },
        { name: "DocName",    type: "NVarChar", value: input.docName },
        { name: "DocNumber",  type: "NVarChar", value: input.docNumber ?? null },
        { name: "IssueDate",  type: "Date",     value: input.issueDate ?? null },
        { name: "ExpiryDate", type: "Date",     value: input.expiryDate ?? null },
        { name: "FilePath",   type: "NVarChar", value: input.filePath ?? null },
        { name: "FileSizeKb", type: "Int",      value: input.fileSizeKb ?? null },
        { name: "Notes",      type: "NVarChar", value: input.notes ?? null },
        { name: "UploadedBy", type: "NVarChar", value: ctx.user?.name ?? "system" },
      ];
      const rows = await execSPP("sp_AddAssetDocument", params);
      return rows[0];
    }),

  addMaintenance: protectedProcedure
    .input(z.object({
      assetId:        z.number().int(),
      maintType:      z.enum(["Routine","Preventive","Corrective","Emergency","Inspection"]),
      description:    z.string().min(2),
      performedBy:    z.enum(["Vodafone","Lessor","Third Party"]).default("Vodafone"),
      contractorName: z.string().optional(),
      costAmount:     z.number().default(0),
      costCurrency:   z.string().length(3).default("AED"),
      isRecoverable:  z.boolean().default(false),
      scheduledDate:  z.string().optional(),
      completedDate:  z.string().optional(),
      status:         z.enum(["Scheduled","In Progress","Completed","Cancelled"]).default("Scheduled"),
      notes:          z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "AssetId",        type: "Int",      value: input.assetId },
        { name: "MaintType",      type: "VarChar",  value: input.maintType },
        { name: "Description",    type: "NVarChar", value: input.description },
        { name: "PerformedBy",    type: "VarChar",  value: input.performedBy },
        { name: "ContractorName", type: "NVarChar", value: input.contractorName ?? null },
        { name: "CostAmount",     type: "Decimal",  value: input.costAmount },
        { name: "CostCurrency",   type: "VarChar",  value: input.costCurrency },
        { name: "IsRecoverable",  type: "Bit",      value: input.isRecoverable ? 1 : 0 },
        { name: "ScheduledDate",  type: "Date",     value: input.scheduledDate ?? null },
        { name: "CompletedDate",  type: "Date",     value: input.completedDate ?? null },
        { name: "Status",         type: "VarChar",  value: input.status },
        { name: "Notes",          type: "NVarChar", value: input.notes ?? null },
        { name: "CreatedBy",      type: "NVarChar", value: ctx.user?.name ?? "system" },
      ];
      const rows = await execSPP("sp_AddAssetMaintenance", params);
      return rows[0];
    }),

  addInsurance: protectedProcedure
    .input(z.object({
      assetId:       z.number().int(),
      policyNumber:  z.string(),
      insurerName:   z.string(),
      coverageType:  z.enum(["Property","Liability","Fire","Flood","All Risk","Other"]),
      sumInsured:    z.number().optional(),
      currency:      z.string().length(3).default("AED"),
      premiumAmount: z.number().optional(),
      startDate:     z.string(),
      endDate:       z.string(),
      isMandatory:   z.boolean().default(true),
      insuredBy:     z.enum(["Vodafone","Lessor"]).default("Vodafone"),
      notes:         z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "AssetId",       type: "Int",      value: input.assetId },
        { name: "PolicyNumber",  type: "NVarChar", value: input.policyNumber },
        { name: "InsurerName",   type: "NVarChar", value: input.insurerName },
        { name: "CoverageType",  type: "VarChar",  value: input.coverageType },
        { name: "SumInsured",    type: "Decimal",  value: input.sumInsured ?? null },
        { name: "Currency",      type: "VarChar",  value: input.currency },
        { name: "PremiumAmount", type: "Decimal",  value: input.premiumAmount ?? null },
        { name: "StartDate",     type: "Date",     value: input.startDate },
        { name: "EndDate",       type: "Date",     value: input.endDate },
        { name: "IsMandatory",   type: "Bit",      value: input.isMandatory ? 1 : 0 },
        { name: "InsuredBy",     type: "VarChar",  value: input.insuredBy },
        { name: "Notes",         type: "NVarChar", value: input.notes ?? null },
      ];
      const rows = await execSPP("sp_AddAssetInsurance", params);
      return rows[0];
    }),

  // ── Sub-Asset Transaction Log ───────────────────────────────────────────
  logSubAssetTxn: protectedProcedure
    .input(z.object({
      action:      z.string(),           // INSERT | UPDATE | DELETE | ITEM_ADD | ITEM_EDIT | ITEM_DELETE
      entityType:  z.string(),           // SET | LIBRARY_ITEM
      entityId:    z.number().int().optional(),
      entityCode:  z.string().optional(),
      entityName:  z.string().optional(),
      beforeJson:  z.string().optional(),
      afterJson:   z.string().optional(),
      screenId:    z.string().optional(),
      sessionRef:  z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "Action",     type: "VarChar",  value: input.action },
        { name: "EntityType", type: "VarChar",  value: input.entityType },
        { name: "EntityId",   type: "Int",      value: input.entityId ?? null },
        { name: "EntityCode", type: "NVarChar", value: input.entityCode ?? null },
        { name: "EntityName", type: "NVarChar", value: input.entityName ?? null },
        { name: "BeforeJson", type: "NVarChar", value: input.beforeJson ?? null },
        { name: "AfterJson",  type: "NVarChar", value: input.afterJson ?? null },
        { name: "ChangedBy",  type: "NVarChar", value: ctx.user?.name ?? "system" },
        { name: "ScreenId",   type: "VarChar",  value: input.screenId ?? "VFLSASSET001" },
        { name: "IpAddress",  type: "VarChar",  value: null },
        { name: "SessionRef", type: "NVarChar", value: input.sessionRef ?? null },
      ];
      const rows = await execSPP("sp_LogSubAssetTransaction", params);
      return rows[0] as { txn_id: number };
    }),

  getSubAssetTxns: protectedProcedure
    .input(z.object({
      entityId:   z.number().int().optional(),
      entityType: z.string().optional(),
      action:     z.string().optional(),
      changedBy:  z.string().optional(),
      dateFrom:   z.string().optional(),
      dateTo:     z.string().optional(),
      page:       z.number().int().default(1),
      pageSize:   z.number().int().default(100),
    }))
    .query(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "EntityId",   type: "Int",      value: input.entityId ?? null },
        { name: "EntityType", type: "VarChar",  value: input.entityType ?? null },
        { name: "Action",     type: "VarChar",  value: input.action ?? null },
        { name: "ChangedBy",  type: "NVarChar", value: input.changedBy ?? null },
        { name: "DateFrom",   type: "DateTime2",value: input.dateFrom ?? null },
        { name: "DateTo",     type: "DateTime2",value: input.dateTo ?? null },
        { name: "PageNumber", type: "Int",      value: input.page },
        { name: "PageSize",   type: "Int",      value: input.pageSize },
      ];
      const sets = await execSPPMulti("sp_GetSubAssetTransactions", params);
      const total = (sets[0]?.[0] as any)?.total_count ?? 0;
      const rows  = (sets[1] ?? []) as Record<string, unknown>[];      return {
        total,
        rows: rows.map(r => ({
          txnId:      r.txn_id      as number,
          action:     r.action      as string,
          entityType: r.entity_type as string,
          entityId:   r.entity_id   as number | null,
          entityCode: r.entity_code as string | null,
          entityName: r.entity_name as string | null,
          beforeJson: r.before_json as string | null,
          afterJson:  r.after_json  as string | null,
          changedBy:  r.changed_by  as string,
          changedAt:  r.changed_at  as string,
          screenId:   r.screen_id   as string | null,
          sessionRef: r.session_ref as string | null,
        })),
      };
    }),

  // ── Lease Sub-Asset Lifecycle ─────────────────────────────────────────────

  attachSubAssetToLease: protectedProcedure
    .input(z.object({
      leaseId:        z.string(),
      leaseRef:       z.string().optional(),
      assetId:        z.number().int(),
      assetCode:      z.string(),
      setName:        z.string(),
      tagsWithSerials: z.string().optional(), // JSON: [{code,name,category,qty,serialNumbers[],attachDate}]
      lesseeName:     z.string().optional(),  // lessee name → stored as owner on attach
    }))
    .mutation(async ({ input, ctx }) => {
      await ensureLeaseSubAssetAttachProcedure();
      const createdBy = (ctx.user as any)?.name ?? (ctx.user as any)?.email ?? "system";
      const params: SPPParam[] = [
        { name: "lease_id",          type: "NVarChar", value: input.leaseId },
        { name: "lease_ref",         type: "NVarChar", value: input.leaseRef ?? null },
        { name: "asset_id",          type: "Int",      value: input.assetId },
        { name: "asset_code",        type: "NVarChar", value: input.assetCode },
        { name: "set_name",          type: "NVarChar", value: input.setName },
        { name: "created_by",        type: "NVarChar", value: createdBy },
        { name: "tags_with_serials", type: "NVarChar", value: input.tagsWithSerials ?? null },
        { name: "lessee_name",       type: "NVarChar", value: input.lesseeName ?? null },
      ];
      const rows = await execSPP("asset.sp_AttachSubAssetToLease", params);
      const leaseSubAssetId = rows[0]?.lease_sub_asset_id as number;
      const message = rows[0]?.message as string;
      // Log ATTACH transaction
      if (message === "OK" && leaseSubAssetId) {
        const txnParams: SPPParam[] = [
          { name: "Action",      type: "NVarChar", value: "ATTACH" },
          { name: "EntityType", type: "NVarChar", value: "LEASE_SET" },
          { name: "EntityId",   type: "Int",      value: input.assetId },
          { name: "EntityCode", type: "NVarChar", value: input.assetCode },
          { name: "EntityName", type: "NVarChar", value: `${input.setName} → Lease ${input.leaseRef ?? input.leaseId}` },
          { name: "BeforeJson", type: "NVarChar", value: null },
          { name: "AfterJson",  type: "NVarChar", value: input.tagsWithSerials ?? null },
          { name: "ChangedBy",  type: "NVarChar", value: createdBy },
          { name: "ScreenId",   type: "NVarChar", value: "VFLLSASSET001" },
          { name: "SessionRef", type: "NVarChar", value: `lease:${input.leaseId}` },
        ];
        await execSPP("sp_LogSubAssetTransaction", txnParams).catch(() => {/* non-blocking */});
      }
      return { leaseSubAssetId, message };
    }),

  updateSubAssetStatus: protectedProcedure
    .input(z.object({
      leaseSubAssetId:   z.number().int(),
      newStatus:         z.enum(["Active","Cancelled","Returned","BackIn","Replaced","WriteOff","Condemned"]),
      statusDate:        z.string(),
      reason:            z.string().optional(),
      replacedByAssetId: z.number().int().optional(),
      replacedByCode:    z.string().optional(),
      notes:             z.string().optional(),
      lessorName:        z.string().optional(), // passed on Returned → stored as owner
      lesseeName:        z.string().optional(), // passed on BackIn → stored as owner
    }))
    .mutation(async ({ input, ctx }) => {
      const updatedBy = (ctx.user as any)?.name ?? (ctx.user as any)?.email ?? "system";
      const params: SPPParam[] = [
        { name: "lease_sub_asset_id",   type: "Int",      value: input.leaseSubAssetId },
        { name: "new_status",           type: "NVarChar", value: input.newStatus },
        { name: "reason",               type: "NVarChar", value: input.reason ?? null },
        { name: "notes",                type: "NVarChar", value: input.notes ?? null },
        { name: "replaced_by_asset_id", type: "Int",      value: input.replacedByAssetId ?? null },
        { name: "updated_by",           type: "NVarChar", value: updatedBy },
        { name: "lessor_name",          type: "NVarChar", value: input.lessorName ?? null },
        { name: "lessee_name",          type: "NVarChar", value: input.lesseeName ?? null },
      ];
      const rows = await execSPP("asset.sp_UpdateSubAssetStatus", params);
      return { rowsAffected: rows[0]?.rows_affected as number };
    }),
  updateLeaseSubAssetTags: protectedProcedure
    .input(z.object({
      leaseSubAssetId: z.number().int(),
      tagsWithSerials: z.string(), // JSON array of items
    }))
    .mutation(async ({ input, ctx }) => {
      const updatedBy = (ctx.user as any)?.name ?? (ctx.user as any)?.email ?? "system";
      const params: SPPParam[] = [
        { name: "lease_sub_asset_id", type: "Int",      value: input.leaseSubAssetId },
        { name: "tags_with_serials",  type: "NVarChar", value: input.tagsWithSerials },
        { name: "updated_by",         type: "NVarChar", value: updatedBy },
      ];
      const rows = await execSPP("asset.sp_UpdateLeaseSubAssetTags", params);
      // Log ITEM_EDIT transaction
      const txnParams: SPPParam[] = [
        { name: "Action",      type: "NVarChar", value: "ITEM_EDIT" },
        { name: "EntityType", type: "NVarChar", value: "LEASE_SET" },
        { name: "EntityId",   type: "Int",      value: input.leaseSubAssetId },
        { name: "EntityCode", type: "NVarChar", value: null },
        { name: "EntityName", type: "NVarChar", value: "Items updated" },
        { name: "BeforeJson", type: "NVarChar", value: null },
        { name: "AfterJson",  type: "NVarChar", value: input.tagsWithSerials },
        { name: "ChangedBy",  type: "NVarChar", value: updatedBy },
        { name: "ScreenId",   type: "NVarChar", value: "VFLSEASTTXN0001P001" },
        { name: "SessionRef", type: "NVarChar", value: null },
      ];
      await execSPP("sp_LogSubAssetTransaction", txnParams).catch(() => {/* non-blocking */});
      return { rowsAffected: rows[0]?.rows_affected as number };
    }),
  getLeaseSubAssets: protectedProcedure
    .input(z.object({ leaseId: z.string() }))
    .query(async ({ input }) => {
      const params: SPPParam[] = [
        { name: "lease_id", type: "NVarChar", value: input.leaseId },
      ];
      const rows = await execSPP("asset.sp_GetLeaseSubAssets", params);
      return rows.map(r => ({
        leaseSubAssetId:   r.lease_sub_asset_id   as number,
        leaseId:           r.lease_id             as string,
        leaseRef:          r.lease_ref            as string | null,
        assetId:           r.asset_id             as number,
        assetCode:         r.asset_code           as string,
        setName:           r.set_name             as string,
        status:            r.status               as string,
        statusDate:        r.status_date          as string | null,
        reason:            r.reason               as string | null,
        replacedByAssetId: r.replaced_by_asset_id as number | null,
        replacedByCode:    r.replaced_by_code     as string | null,
        notes:             r.notes                as string | null,
        createdBy:         r.created_by           as string,
        createdAt:         r.created_at           as string,
        updatedBy:         r.updated_by           as string | null,
        updatedAt:         r.updated_at           as string | null,
        tagsWithSerials:   r.tags_with_serials    as string | null,
        setTags:           r.set_tags             as string | null,
        owner:             r.owner                as string | null,
      }));
    }),

  getLeaseList: protectedProcedure
    .query(async () => {
      const rows = await execSPP("asset.sp_GetLeaseListForSubAsset", []);
      return rows.map(r => ({
        leaseId:    r.lease_id    as string,
        leaseRef:   r.lease_ref   as string,
        assetName:  r.asset_name  as string,
        lessorName: r.lessor_name as string,
        lesseeName: (r.lessee_name as string) || "",
        status:     r.status      as string,
      }));
    }),

  getExpiringWarranties: protectedProcedure
    .input(z.object({ daysAhead: z.number().int().default(30) }))
    .query(async ({ input }) => {
      const rows = await execSPP("asset.sp_GetExpiringWarranties", [
        { name: "days_ahead", type: "Int", value: input.daysAhead },
      ]);
      // Parse tags_with_serials JSON and filter items with warrantyExpiry within daysAhead
      const today = new Date();
      const cutoff = new Date(today.getTime() + input.daysAhead * 86400000);
      const alerts: Array<{
        leaseSubAssetId: number; leaseId: string; leaseRef: string;
        assetCode: string; setName: string; itemName: string;
        serialNumber: string; warrantyExpiry: string; daysLeft: number;
      }> = [];
      for (const r of rows) {
        const tags = r.tags_with_serials as string | null;
        if (!tags) continue;
        let items: any[];
        try { items = JSON.parse(tags); } catch { continue; }
        for (const item of items) {
          if (!item.warrantyExpiry) continue;
          const expDate = new Date(item.warrantyExpiry);
          if (expDate <= cutoff) {
            const daysLeft = Math.ceil((expDate.getTime() - today.getTime()) / 86400000);
            for (const sn of (item.serialNumbers ?? [""])) {
              alerts.push({
                leaseSubAssetId: r.lease_sub_asset_id as number,
                leaseId:         r.lease_id           as string,
                leaseRef:        r.lease_ref          as string,
                assetCode:       r.asset_code         as string,
                setName:         r.set_name           as string,
                itemName:        item.name            as string,
                serialNumber:    sn                   as string,
                warrantyExpiry:  item.warrantyExpiry  as string,
                daysLeft,
              });
            }
          }
        }
      }
      return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
    }),

  getLeaseInventoryForExport: protectedProcedure
    .input(z.object({ leaseId: z.string() }))
    .query(async ({ input }) => {
      const rows = await execSPP("asset.sp_GetLeaseInventoryForExport", [
        { name: "lease_id", type: "NVarChar", value: input.leaseId },
      ]);
      return rows.map(r => ({
        leaseSubAssetId: r.lease_sub_asset_id as number,
        leaseId:         r.lease_id           as string,
        leaseRef:        r.lease_ref          as string,
        assetCode:       r.asset_code         as string,
        setName:         r.set_name           as string,
        status:          r.status             as string,
        statusDate:      r.status_date        as string | null,
        tagsWithSerials: r.tags_with_serials  as string | null,
        createdBy:       r.created_by         as string,
        createdAt:       r.created_at         as string,
      }));
    }),
  addSubAssetItem: protectedProcedure
    .input(z.object({
      leaseSubAssetId: z.number().int(),
      code:            z.string(),
      name:            z.string(),
      category:        z.string(),
      subCategory:     z.string().optional(),
      brand:           z.string().optional(),
      model:           z.string().optional(),
      spec:            z.string().optional(),
      qty:             z.number().int().min(1),
      serialNumbers:   z.array(z.string()),
      attachDate:      z.string(),
      warrantyExpiry:  z.string().optional(),
      priceQAR:        z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const updatedBy = ctx.user?.name ?? ctx.user?.email ?? "system";
      const itemJson = JSON.stringify({
        code:           input.code,
        name:           input.name,
        category:       input.category,
        subCategory:    input.subCategory ?? "",
        brand:          input.brand ?? "",
        model:          input.model ?? "",
        spec:           input.spec ?? "",
        qty:            input.qty,
        serialNumbers:  input.serialNumbers,
        attachDate:     input.attachDate,
        warrantyExpiry: input.warrantyExpiry ?? "",
        priceQAR:       input.priceQAR ?? 0,
      });
      const params: SPPParam[] = [
        { name: "lease_sub_asset_id", type: "Int",      value: input.leaseSubAssetId },
        { name: "item_json",          type: "NVarChar", value: itemJson },
        { name: "updated_by",         type: "NVarChar", value: updatedBy },
      ];
      const rows = await execSPP("asset.sp_AddSubAssetItem", params);
      // Log ADD_ITEM transaction
      await execSPP("asset.sp_LogSubAssetTransaction", [
        { name: "Action",     type: "VarChar",  value: "ADD_ITEM" },
        { name: "EntityType", type: "VarChar",  value: "LEASE_SUB_ASSET" },
        { name: "EntityId",   type: "Int",      value: input.leaseSubAssetId },
        { name: "EntityCode", type: "NVarChar", value: input.code },
        { name: "EntityName", type: "NVarChar", value: input.name },
        { name: "BeforeJson", type: "NVarChar", value: null },
        { name: "AfterJson",  type: "NVarChar", value: itemJson },
        { name: "ChangedBy",  type: "NVarChar", value: updatedBy },
        { name: "ScreenId",   type: "VarChar",  value: "VFLSEASTTXN0001P001" },
        { name: "IpAddress",  type: "VarChar",  value: null },
      ]).catch(() => {/* non-blocking */});
      return {
        leaseSubAssetId: rows[0]?.lease_sub_asset_id as number,
        tagsWithSerials: rows[0]?.tags_with_serials  as string,
        message:         rows[0]?.message            as string,
      };
    }),

  changeSubAssetOwnership: protectedProcedure
    .input(z.object({
      leaseSubAssetId: z.number().int(),
      ownership:       z.enum(["Lease", "Lessor"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const params: SPPParam[] = [
        { name: "LeaseSubAssetId", type: "Int",      value: input.leaseSubAssetId },
        { name: "Ownership",       type: "NVarChar", value: input.ownership },
        { name: "ChangedBy",       type: "NVarChar", value: ctx.user?.name ?? "system" },
      ];
      await execSPP("asset.sp_ChangeSubAssetOwnership", params);
      // Log ownership change
      await execSPP("asset.sp_LogSubAssetTransaction", [
        { name: "Action",       type: "VarChar",  value: "OWNERSHIP_CHANGE" },
        { name: "EntityType",   type: "VarChar",  value: "LEASE_SUB_ASSET" },
        { name: "EntityId",     type: "Int",      value: input.leaseSubAssetId },
        { name: "EntityCode",   type: "NVarChar", value: null },
        { name: "EntityName",   type: "NVarChar", value: null },
        { name: "BeforeJson",   type: "NVarChar", value: null },
        { name: "AfterJson",    type: "NVarChar", value: JSON.stringify({ ownership: input.ownership }) },
        { name: "ChangedBy",    type: "NVarChar", value: ctx.user?.name ?? "system" },
        { name: "ScreenId",     type: "VarChar",  value: "VFLSEASTTXN0001P001" },
        { name: "IpAddress",    type: "VarChar",  value: null },
      ]);
       return { ok: true };
    }),

  aiGenerateSerials: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        code:     z.string(),
        name:     z.string(),
        category: z.string(),
        qty:      z.number().int().min(1),
      })),
      attachDate: z.string(), // YYYY-MM-DD
    }))
    .mutation(async ({ input }) => {
      const prompt = `You are a property management system assistant. Generate realistic serial numbers and warranty expiry dates for the following furniture/appliance items being attached to a lease.

Attach Date: ${input.attachDate}
Warranty Expiry: exactly 1 year after attach date = ${new Date(new Date(input.attachDate).setFullYear(new Date(input.attachDate).getFullYear() + 1)).toISOString().slice(0, 10)}

Items:
${input.items.map((it, i) => `${i + 1}. Code: ${it.code}, Name: ${it.name}, Category: ${it.category}, Qty: ${it.qty}`).join('\n')}

For each item, generate ${input.items.map(it => it.qty).join('+')} serial numbers total (one per unit). Serial number format: use the item code as prefix, then a dash, then a 6-digit alphanumeric string (e.g. FUR-SOF-001-A3X9K2). Return a JSON array with one object per item in the same order, each with: { "code": string, "serialNumbers": string[], "warrantyExpiry": string (YYYY-MM-DD, 1 year from attach date) }`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a property management assistant. Always respond with valid JSON only, no markdown." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "serial_fill",
            strict: true,
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      code:           { type: "string" },
                      serialNumbers:  { type: "array", items: { type: "string" } },
                      warrantyExpiry: { type: "string" },
                    },
                    required: ["code", "serialNumbers", "warrantyExpiry"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["items"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = (response.choices[0]?.message?.content ?? "{}") as string;
      const parsed = JSON.parse(content);
      return parsed as { items: { code: string; serialNumbers: string[]; warrantyExpiry: string }[] };
    }),
});
