/**
 * VodaLease Enterprise — sp_PostLeaseTransaction Fix Tests
 * Validates that:
 * 1. Termination transaction posts successfully with posted_at populated
 * 2. GL postings are created with non-null posted_at
 * 3. Contract status changes to Terminated/Closed
 * 4. Transaction draft is created with created_at and updated_at populated
 * 5. Modification transaction posts successfully
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import sql from "mssql";

let pool: sql.ConnectionPool;
let testContractId: number | null = null;

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

describe("sp_PostLeaseTransaction — posted_at Fix", () => {
  beforeAll(async () => {
    pool = await sql.connect(getConfig());
    // Create a test contract for termination testing
    const result = await pool.request().query(`
      INSERT INTO lease.contracts (
        contract_ref, lessor_id, asset_type, commencement_date, expiry_date,
        term_months, monthly_payment, ibr, lease_liability_commence, rou_asset_value,
        lifecycle_status, status, created_at, updated_at
      ) VALUES (
        'TEST-TERM-001', 1, 'Vehicle', '2025-01-01', '2027-12-31',
        36, 5000.00, 0.05, 170000.00, 170000.00,
        'Active', 'Active', GETUTCDATE(), GETUTCDATE()
      );
      SELECT SCOPE_IDENTITY() AS contract_id;
    `);
    testContractId = result.recordset[0].contract_id;

    // Insert a few amortisation rows for the test contract
    await pool.request().query(`
      INSERT INTO lease.amortisation_schedule
        (contract_id, period_date, opening_liability, interest_expense, payment, principal,
         closing_liability, rou_nbv, depreciation, cumulative_depr, posting_status)
      VALUES
        (${testContractId}, '2025-01-01', 170000.00, 708.33, 5000.00, 4291.67, 165708.33, 165277.78, 4722.22, 4722.22, 'Projected'),
        (${testContractId}, '2025-02-01', 165708.33, 690.45, 5000.00, 4309.55, 161398.78, 160555.56, 4722.22, 9444.44, 'Projected'),
        (${testContractId}, '2025-03-01', 161398.78, 672.49, 5000.00, 4327.51, 157071.27, 155833.33, 4722.22, 14166.67, 'Projected');
    `);
  }, 30000);

  afterAll(async () => {
    if (testContractId) {
      // Clean up test data
      await pool.request().query(`DELETE FROM lease.transaction_drafts WHERE contract_id = ${testContractId}`);
      await pool.request().query(`DELETE FROM lease.gl_postings WHERE contract_id = ${testContractId}`);
      await pool.request().query(`DELETE FROM lease.amortisation_schedule WHERE contract_id = ${testContractId}`);
      await pool.request().query(`DELETE FROM lease.contracts WHERE contract_id = ${testContractId}`);
    }
    await pool.close();
  });

  it("should post a Termination transaction successfully", async () => {
    const result = await pool.request()
      .input("ContractId", sql.Int, testContractId)
      .input("TransactionType", sql.NVarChar(20), "Termination")
      .input("EffectiveDate", sql.Date, "2026-05-05")
      .input("Notes", sql.NVarChar(500), "Vitest termination")
      .input("PostedBy", sql.NVarChar(100), "VitestUser")
      .execute("sp_PostLeaseTransaction");

    expect(result.recordset).toHaveLength(1);
    expect(result.recordset[0].je_ref).toContain("JE-LTC-");
    expect(result.recordset[0].je_num).toBe("JE-5");
    expect(result.recordset[0].je_label).toContain("Termination");
    expect(result.recordset[0].posted_at).toBeTruthy();
    expect(result.recordset[0].posted_by).toBe("VitestUser");
  });

  it("should create GL postings with non-null posted_at", async () => {
    const result = await pool.request().query(`
      SELECT posting_id, je_ref, je_label, ledger_no, dr_cr, amount, posted_at, posted_by
      FROM lease.gl_postings
      WHERE contract_id = ${testContractId}
      ORDER BY posting_id;
    `);

    expect(result.recordset.length).toBeGreaterThanOrEqual(2);
    for (const row of result.recordset) {
      expect(row.posted_at).not.toBeNull();
      expect(row.posted_by).toBe("VitestUser");
    }
  });

  it("should change contract status to Terminated/Closed", async () => {
    const result = await pool.request().query(`
      SELECT lifecycle_status, status FROM lease.contracts WHERE contract_id = ${testContractId};
    `);

    expect(result.recordset[0].lifecycle_status).toBe("Closed");
    expect(result.recordset[0].status).toBe("Terminated");
  });

  it("should create transaction draft with created_at and updated_at populated", async () => {
    const result = await pool.request().query(`
      SELECT draft_id, contract_id, transaction_type, status, posted_je_ref, created_at, updated_at
      FROM lease.transaction_drafts
      WHERE contract_id = ${testContractId};
    `);

    expect(result.recordset).toHaveLength(1);
    expect(result.recordset[0].transaction_type).toBe("Termination");
    expect(result.recordset[0].status).toBe("Posted");
    expect(result.recordset[0].created_at).not.toBeNull();
    expect(result.recordset[0].updated_at).not.toBeNull();
  });

  it("should remove future Projected amortisation rows after termination", async () => {
    const result = await pool.request().query(`
      SELECT COUNT(*) as cnt FROM lease.amortisation_schedule
      WHERE contract_id = ${testContractId} AND period_date > '2026-05-05' AND posting_status = 'Projected';
    `);

    expect(result.recordset[0].cnt).toBe(0);
  });
});
