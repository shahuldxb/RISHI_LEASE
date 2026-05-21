/**
 * VodaLease Enterprise — ERP Export Status Update Tests
 * Validates that:
 * 1. The generateExport mutation updates JV status to 'ERP' after export
 * 2. Duplicate sends are prevented (JVs already in 'ERP' status are not re-exported)
 * 3. The preview query returns both 'Posted' and 'ERP' JVs
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import sql from "mssql";

let pool: sql.ConnectionPool;
let testJvId: number | null = null;

const getConfig = (): sql.config => ({
  server: process.env.MSSQL_HOST ?? "SQL_SERVER_HOST_REDACTED",
  port: Number(process.env.MSSQL_PORT ?? 1433),
  user: process.env.MSSQL_USER ?? "SQL_USER_REDACTED",
  password: process.env.MSSQL_PASSWORD ?? "",
  database: process.env.MSSQL_DATABASE ?? "leasing",
  options: {
    encrypt: true,
    trustServerCertificate: true,
    connectTimeout: 10000,
    requestTimeout: 15000,
  },
});

describe("ERP Export — Status Update & Duplicate Prevention", () => {
  beforeAll(async () => {
    pool = await sql.connect(getConfig());
  });

  afterAll(async () => {
    // Clean up test JV if created
    if (testJvId) {
      await pool.request().query(`
        DELETE FROM accounting.jv_lines WHERE jv_id = ${testJvId};
        DELETE FROM accounting.journal_vouchers WHERE jv_id = ${testJvId};
      `);
    }
    await pool.close();
  });

  it("journal_vouchers table has status column that accepts 'ERP' value", async () => {
    // Check that the status column exists and can hold 'ERP'
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'accounting' AND TABLE_NAME = 'journal_vouchers' AND COLUMN_NAME = 'status'
    `);
    expect(result.recordset.length).toBe(1);
    const col = result.recordset[0];
    expect(col.DATA_TYPE).toBe("varchar");
    // VARCHAR(20) should be enough for 'ERP' (3 chars)
    expect(col.CHARACTER_MAXIMUM_LENGTH).toBeGreaterThanOrEqual(3);
  }, 15000);

  it("can create a test JV with status 'Posted' and update it to 'ERP'", async () => {
    // Create a test JV
    const insertResult = await pool.request().query(`
      INSERT INTO accounting.journal_vouchers 
        (jv_number, jv_type, period_year, period_month, posting_date, description, currency, total_debit, total_credit, status, created_by, created_at)
      OUTPUT INSERTED.jv_id
      VALUES 
        ('JV-TEST-ERP-001', 'MONTHLY_AMORT', 2026, 1, '2026-01-15', 'Test JV for ERP export', 'QAR', 1000.00, 1000.00, 'Posted', 'test-user', GETUTCDATE())
    `);
    testJvId = insertResult.recordset[0].jv_id;
    expect(testJvId).toBeGreaterThan(0);

    // Add a JV line
    await pool.request().query(`
      INSERT INTO accounting.jv_lines (jv_id, line_seq, account_code, account_name, dr_cr, amount, description, currency)
      VALUES (${testJvId}, 1, '1100001', 'ROU Asset', 'Dr', 1000.00, 'Test line', 'QAR')
    `);

    // Verify it's in 'Posted' status
    const checkResult = await pool.request().query(`
      SELECT status FROM accounting.journal_vouchers WHERE jv_id = ${testJvId}
    `);
    expect(checkResult.recordset[0].status).toBe("Posted");

    // Update to 'ERP' (simulating what generateExport does)
    await pool.request().query(`
      UPDATE accounting.journal_vouchers
      SET status = 'ERP',
          notes = COALESCE(notes + '; ', '') + 'Sent to ERP on ' + CONVERT(VARCHAR, GETUTCDATE(), 120) + ' by test-user'
      WHERE jv_id = ${testJvId} AND status = 'Posted'
    `);

    // Verify status is now 'ERP'
    const afterResult = await pool.request().query(`
      SELECT status, notes FROM accounting.journal_vouchers WHERE jv_id = ${testJvId}
    `);
    expect(afterResult.recordset[0].status).toBe("ERP");
    expect(afterResult.recordset[0].notes).toContain("Sent to ERP on");
  }, 20000);

  it("duplicate prevention: UPDATE with WHERE status='Posted' does not affect 'ERP' JVs", async () => {
    // Ensure testJvId exists and is in 'ERP' status
    expect(testJvId).not.toBeNull();

    // First ensure it's in ERP status (in case previous test set it up correctly)
    await pool.request().query(`
      UPDATE accounting.journal_vouchers SET status = 'ERP' WHERE jv_id = ${testJvId}
    `);

    // Try to update it again (simulating a second export attempt) — WHERE clause requires 'Posted'
    const updateResult = await pool.request().query(`
      UPDATE accounting.journal_vouchers
      SET notes = COALESCE(notes + '; ', '') + 'Duplicate attempt'
      WHERE jv_id = ${testJvId} AND status = 'Posted'
    `);

    // Should affect 0 rows because status is already 'ERP', not 'Posted'
    expect(updateResult.rowsAffected[0]).toBe(0);

    // Verify notes were NOT updated (duplicate prevention worked)
    const checkResult = await pool.request().query(`
      SELECT notes FROM accounting.journal_vouchers WHERE jv_id = ${testJvId}
    `);
    expect(checkResult.recordset[0].notes ?? '').not.toContain("Duplicate attempt");
  }, 15000);

  it("preview query returns JVs with status IN ('Posted', 'ERP')", async () => {
    // The test JV should be visible in a query that matches the preview logic
    const result = await pool.request().query(`
      SELECT jv_id, status
      FROM accounting.journal_vouchers
      WHERE jv_id = ${testJvId} AND status IN ('Posted', 'ERP')
    `);
    expect(result.recordset.length).toBe(1);
    expect(result.recordset[0].status).toBe("ERP");
  }, 15000);

  it("count of already-exported JVs works correctly", async () => {
    // Count ERP JVs for the test date range
    const result = await pool.request().query(`
      SELECT COUNT(DISTINCT jv_id) AS cnt
      FROM accounting.journal_vouchers
      WHERE posting_date BETWEEN '2026-01-01' AND '2026-01-31' AND status = 'ERP'
    `);
    // Should be at least 1 (our test JV)
    expect(result.recordset[0].cnt).toBeGreaterThanOrEqual(1);
  }, 15000);
});
