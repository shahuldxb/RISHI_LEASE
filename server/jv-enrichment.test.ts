import { describe, expect, it } from "vitest";
import { getPool, sql } from "./db-sqlserver";

describe("JV Enrichment — Staff Name & Lease Details", () => {
  it("fn_ResolveStaffId resolves known OAuth username to staff_id", async () => {
    const pool = await getPool();
    const result = await pool.request()
      .input("username", sql.NVarChar(200), "saleellzy")
      .query("SELECT security.fn_ResolveStaffId(@username) AS staff_id");
    const staffId = result.recordset[0]?.staff_id;
    expect(staffId).toBeTruthy();
    expect(typeof staffId).toBe("number");
  }, 30000);

  it("fn_ResolveStaffId returns NULL for unknown username", async () => {
    const pool = await getPool();
    const result = await pool.request()
      .input("username", sql.NVarChar(200), "nonexistent_user_xyz")
      .query("SELECT security.fn_ResolveStaffId(@username) AS staff_id");
    expect(result.recordset[0]?.staff_id).toBeNull();
  }, 30000);

  it("sp_ListJournalVouchers returns staff_name and lessor_name columns", async () => {
    const pool = await getPool();
    const result = await pool.request()
      .input("page", sql.Int, 1)
      .input("page_size", sql.Int, 5)
      .execute("accounting.sp_ListJournalVouchers");
    const rs = result.recordsets as any[][];
    // rs[0] = total count, rs[1] = JV rows, rs[2] = JV lines
    const rows = rs?.[1] ?? [];
    if (rows.length > 0) {
      const firstRow = rows[0];
      expect("staff_name" in firstRow).toBe(true);
      expect("lessor_name" in firstRow).toBe(true);
    }
    expect(Array.isArray(rows)).toBe(true);
  }, 30000);

  it("sp_GetJournalVoucher returns enriched fields", async () => {
    const pool = await getPool();
    const listResult = await pool.request()
      .input("page", sql.Int, 1)
      .input("page_size", sql.Int, 1)
      .execute("accounting.sp_ListJournalVouchers");
    // rs[0] = total count, rs[1] = JV rows
    const jvRows = (listResult.recordsets as any[][])?.[1] ?? [];
    if (jvRows.length === 0) return;
    const jvId = jvRows[0].jv_id;
    const result = await pool.request()
      .input("jv_id", sql.Int, jvId)
      .execute("accounting.sp_GetJournalVoucher");
    const rs = result.recordsets as any[][];
    const jv = rs?.[0]?.[0];
    expect(jv).toBeTruthy();
    expect("staff_name" in jv).toBe(true);
    expect("lessor_name" in jv).toBe(true);
    expect("accounting_period" in jv).toBe(true);
    expect("lease_start" in jv).toBe(true);
    expect("lease_end" in jv).toBe(true);
  }, 30000);

  it("All 4 JV generation SPs contain fn_ResolveStaffId", async () => {
    const pool = await getPool();
    const sps = [
      "accounting.sp_GenerateInceptionJV",
      "accounting.sp_GenerateMonthlyJVs",
      "accounting.sp_GenerateRemeasurementJV",
      "accounting.sp_GeneratePeriodCloseJV",
    ];
    for (const sp of sps) {
      const r = await pool.request().query(
        `SELECT OBJECT_DEFINITION(OBJECT_ID('${sp}')) AS def`
      );
      const def = r.recordset[0]?.def ?? "";
      expect(def).toContain("fn_ResolveStaffId");
    }
  }, 30000);
});
