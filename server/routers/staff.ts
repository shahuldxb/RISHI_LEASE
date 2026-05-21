import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getPool } from "../db-sqlserver";
import * as sql from "mssql";

// ─── Staff Router ─────────────────────────────────────────────────────────────
export const staffRouter = router({

  // ── list: paginated staff list ──────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      pageNumber: z.number().int().min(1).default(1),
      pageSize:   z.number().int().min(1).max(200).default(50),
      searchTerm: z.string().optional(),
      entity:     z.string().optional(),
      status:     z.string().optional(),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req  = pool.request();
      req.input("PageNumber", sql.Int,         input.pageNumber);
      req.input("PageSize",   sql.Int,         input.pageSize);
      req.input("SearchTerm", sql.NVarChar(200), input.searchTerm ?? null);
      req.input("Entity",     sql.NVarChar(200), input.entity     ?? null);
      req.input("Status",     sql.VarChar(20),   input.status     ?? null);
      const result = await req.execute("hr.sp_GetStaffList");
      const rows = (result.recordset ?? []) as any[];
      const total = rows[0]?.total_count ?? 0;
      return {
        total,
        rows: rows.map(r => ({
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
          status:      (r.status      ?? "Active") as string,
          createdAt:   r.created_at   as Date,
        })),
      };
    }),

  // ── upsert: create or update a staff record ─────────────────────────────────
  upsert: protectedProcedure
    .input(z.object({
      staffId:     z.number().int().optional(),
      staffNumber: z.string().min(1),
      fullName:    z.string().min(1),
      designation: z.string().optional(),
      department:  z.string().optional(),
      grade:       z.string().optional(),
      position:    z.string().optional(),
      placeOfWork: z.string().optional(),
      email:       z.string().optional(),
      phone:       z.string().optional(),
      entity:      z.string().optional(),
      status:      z.enum(["Active", "Inactive", "On Leave"]).default("Active"),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req  = pool.request();
      req.input("StaffId",     sql.Int,          input.staffId    ?? null);
      req.input("StaffNumber", sql.VarChar(50),   input.staffNumber);
      req.input("FullName",    sql.NVarChar(200), input.fullName);
      req.input("Designation", sql.NVarChar(200), input.designation ?? null);
      req.input("Department",  sql.NVarChar(200), input.department  ?? null);
      req.input("Grade",       sql.VarChar(20),   input.grade       ?? null);
      req.input("Position",    sql.NVarChar(200), input.position    ?? null);
      req.input("PlaceOfWork", sql.NVarChar(300), input.placeOfWork ?? null);
      req.input("Email",       sql.VarChar(200),  input.email       ?? null);
      req.input("Phone",       sql.VarChar(50),   input.phone       ?? null);
      req.input("Entity",      sql.NVarChar(200), input.entity      ?? null);
      req.input("Status",      sql.VarChar(20),   input.status);
      const result = await req.execute("hr.sp_UpsertStaff");
      return { staffId: result.recordset?.[0]?.staff_id as number };
    }),

  // ── delete: remove a staff record ───────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ staffId: z.number().int() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const req  = pool.request();
      req.input("StaffId", sql.Int, input.staffId);
      await req.execute("hr.sp_DeleteStaff");
      return { success: true };
    }),

  // ── dropdown: lightweight list for Select dropdowns ─────────────────────────
  dropdown: protectedProcedure
    .input(z.object({ searchTerm: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req  = pool.request();
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
