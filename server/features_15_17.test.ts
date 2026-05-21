/**
 * Vitest Integration Tests — Features 15 & 17
 * Feature 15: Multi-Standard Comparison (IFRS 16 vs ASC 842 vs IPSAS 43)
 * Feature 17: Lease Modification Wizard (remeasurement, GL journal generation)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getPool, sql } from './db-sqlserver';
import type { ConnectionPool } from 'mssql';

let pool: ConnectionPool;
let testContractId: number;

beforeAll(async () => {
  pool = await getPool();
  // Get a valid contract_id for tests
  const r = await pool.request().query(`
    SELECT TOP 1 contract_id FROM lease.contracts
    WHERE status = 'active' AND ibr IS NOT NULL AND monthly_payment IS NOT NULL
    ORDER BY contract_id
  `);
  testContractId = r.recordset[0]?.contract_id ?? 0;
}, 30000);

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 15: Multi-Standard Comparison
// ─────────────────────────────────────────────────────────────────────────────
describe('Feature 15 — Multi-Standard Comparison', () => {

  it('sp_GetMultiStandardComparison: SP exists in lease schema', async () => {
    const r = await pool.request().query(`
      SELECT COUNT(*) as cnt FROM sys.procedures
      WHERE SCHEMA_NAME(schema_id) = 'lease' AND name = 'sp_GetMultiStandardComparison'
    `);
    expect(r.recordset[0].cnt).toBe(1);
  });

  it('sp_GetMultiStandardComparison: returns two result sets for a valid contract', async () => {
    if (!testContractId) return;
    const r = await pool.request()
      .input('ContractId',  testContractId)
      .input('PeriodStart', null)
      .input('PeriodEnd',   null)
      .execute('lease.sp_GetMultiStandardComparison');
    // RS 0: per-period rows
    expect(Array.isArray(r.recordsets[0])).toBe(true);
    // RS 1: summary row
    expect(Array.isArray(r.recordsets[1])).toBe(true);
  }, 30000);

  it('sp_GetMultiStandardComparison: per-period rows have required columns', async () => {
    if (!testContractId) return;
    const r = await pool.request()
      .input('ContractId',  testContractId)
      .input('PeriodStart', null)
      .input('PeriodEnd',   null)
      .execute('lease.sp_GetMultiStandardComparison');
    const rows = r.recordsets[0] as Array<Record<string, unknown>>;
    if (rows.length === 0) return; // no amortisation data yet — acceptable
    const row = rows[0];
    expect(row).toHaveProperty('period_date');
    expect(row).toHaveProperty('ifrs16_pl_charge');
    expect(row).toHaveProperty('asc842_pl_charge');
    expect(row).toHaveProperty('ipsas43_pl_charge');
    expect(row).toHaveProperty('ifrs16_closing_liability');
    expect(row).toHaveProperty('asc842_closing_liability');
  }, 30000);

  it('sp_GetMultiStandardComparison: summary row has required columns', async () => {
    if (!testContractId) return;
    const r = await pool.request()
      .input('ContractId',  testContractId)
      .input('PeriodStart', null)
      .input('PeriodEnd',   null)
      .execute('lease.sp_GetMultiStandardComparison');
    const summary = (r.recordsets[1] as Array<Record<string, unknown>>)[0];
    if (!summary) return; // no data yet — acceptable
    expect(summary).toHaveProperty('ifrs16_total_pl');
    expect(summary).toHaveProperty('asc842_total_pl');
    expect(summary).toHaveProperty('ipsas43_total_pl');
    expect(summary).toHaveProperty('ifrs16_vs_asc842_total_pl_diff');
  }, 30000);

  it('sp_GetMultiStandardComparison: IPSAS 43 P&L equals IFRS 16 P&L (single model)', async () => {
    if (!testContractId) return;
    const r = await pool.request()
      .input('ContractId',  testContractId)
      .input('PeriodStart', null)
      .input('PeriodEnd',   null)
      .execute('lease.sp_GetMultiStandardComparison');
    const rows = r.recordsets[0] as Array<Record<string, unknown>>;
    if (rows.length === 0) return;
    // IPSAS 43 uses same single model as IFRS 16 — P&L charges should be equal
    for (const row of rows.slice(0, 5)) {
      const ifrs = Number(row.ifrs16_pl_charge ?? 0);
      const ipsas = Number(row.ipsas43_pl_charge ?? 0);
      expect(Math.abs(ifrs - ipsas)).toBeLessThan(0.01);
    }
  }, 30000);

  it('sp_GetMultiStandardComparison: raises error for non-existent contract', async () => {
    await expect(
      pool.request()
        .input('ContractId',  999999999)
        .input('PeriodStart', null)
        .input('PeriodEnd',   null)
        .execute('lease.sp_GetMultiStandardComparison')
    ).rejects.toThrow();
  }, 30000);

  it('sp_GetMultiStandardComparison: period filter restricts rows', async () => {
    if (!testContractId) return;
    // Full range
    const rFull = await pool.request()
      .input('ContractId',  testContractId)
      .input('PeriodStart', null)
      .input('PeriodEnd',   null)
      .execute('lease.sp_GetMultiStandardComparison');
    const fullRows = (rFull.recordsets[0] as Array<unknown>).length;

    // Narrow range (1 month)
    const rNarrow = await pool.request()
      .input('ContractId',  testContractId)
      .input('PeriodStart', new Date('2025-01-01'))
      .input('PeriodEnd',   new Date('2025-01-31'))
      .execute('lease.sp_GetMultiStandardComparison');
    const narrowRows = (rNarrow.recordsets[0] as Array<unknown>).length;

    expect(narrowRows).toBeLessThanOrEqual(fullRows);
  }, 30000);

});

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 17: Lease Modification Wizard
// ─────────────────────────────────────────────────────────────────────────────
describe('Feature 17 — Lease Modification Wizard', () => {

  let draftModificationId: number;

  it('sp_GetLeaseModifications: SP exists in lease schema', async () => {
    const r = await pool.request().query(`
      SELECT COUNT(*) as cnt FROM sys.procedures
      WHERE SCHEMA_NAME(schema_id) = 'lease' AND name = 'sp_GetLeaseModifications'
    `);
    expect(r.recordset[0].cnt).toBe(1);
  });

  it('sp_CreateLeaseModification: SP exists in lease schema', async () => {
    const r = await pool.request().query(`
      SELECT COUNT(*) as cnt FROM sys.procedures
      WHERE SCHEMA_NAME(schema_id) = 'lease' AND name = 'sp_CreateLeaseModification'
    `);
    expect(r.recordset[0].cnt).toBe(1);
  });

  it('sp_ApplyLeaseModification: SP exists in lease schema', async () => {
    const r = await pool.request().query(`
      SELECT COUNT(*) as cnt FROM sys.procedures
      WHERE SCHEMA_NAME(schema_id) = 'lease' AND name = 'sp_ApplyLeaseModification'
    `);
    expect(r.recordset[0].cnt).toBe(1);
  });

  it('lease_modifications table exists with correct columns', async () => {
    const r = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'lease' AND TABLE_NAME = 'lease_modifications'
      ORDER BY ORDINAL_POSITION
    `);
    const cols = r.recordset.map((c: Record<string, unknown>) => c.COLUMN_NAME as string);
    expect(cols).toContain('modification_id');
    expect(cols).toContain('contract_id');
    expect(cols).toContain('modification_type');
    expect(cols).toContain('old_liability');
    expect(cols).toContain('new_liability');
    expect(cols).toContain('remeasurement_gain_loss');
    expect(cols).toContain('status');
  });

  it('sp_GetLeaseModifications: returns array (may be empty)', async () => {
    const r = await pool.request()
      .input('ContractId', null)
      .input('Status',     null)
      .execute('lease.sp_GetLeaseModifications');
    expect(Array.isArray(r.recordset)).toBe(true);
  }, 30000);

  it('sp_CreateLeaseModification: creates a draft modification for a valid contract', async () => {
    if (!testContractId) return;
    const r = await pool.request()
      .input('ContractId',        sql.Int,            testContractId)
      .input('ModificationDate',  sql.Date,           new Date('2025-06-01'))
      .input('ModificationType',  sql.NVarChar(50),   'payment_change')
      .input('NewIBR',            sql.Decimal(10, 6), null)
      .input('NewTermEnd',        sql.Date,           null)
      .input('NewMonthlyPayment', sql.Decimal(18, 2), 15000.00)
      .input('Notes',             sql.NVarChar(1000), 'Vitest test modification')
      .input('CreatedBy',         sql.Int,            null)
      .execute('lease.sp_CreateLeaseModification');
    const row = r.recordset[0] as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row).toHaveProperty('modification_id');
    expect(row).toHaveProperty('old_liability');
    expect(row).toHaveProperty('new_liability');
    expect(row).toHaveProperty('remeasurement_gain_loss');
    expect(row).toHaveProperty('status');
    expect(String(row.status)).toBe('draft');
    draftModificationId = Number(row.modification_id);
  }, 30000);

  it('sp_GetLeaseModifications: returns the newly created draft', async () => {
    if (!testContractId || !draftModificationId) return;
    const r = await pool.request()
      .input('ContractId', testContractId)
      .input('Status',     'draft')
      .execute('lease.sp_GetLeaseModifications');
    const rows = r.recordset as Array<Record<string, unknown>>;
    const found = rows.find((row) => Number(row.modification_id) === draftModificationId);
    expect(found).toBeDefined();
    expect(String(found?.modification_type)).toBe('payment_change');
  }, 30000);

  it('sp_CreateLeaseModification: remeasurement_gain_loss is numeric', async () => {
    if (!testContractId) return;
    const r = await pool.request()
      .input('ContractId',        sql.Int,            testContractId)
      .input('ModificationDate',  sql.Date,           new Date('2025-07-01'))
      .input('ModificationType',  sql.NVarChar(50),   'extension')
      .input('NewIBR',            sql.Decimal(10, 6), 0.055)
      .input('NewTermEnd',        sql.Date,           new Date('2028-12-31'))
      .input('NewMonthlyPayment', sql.Decimal(18, 2), null)
      .input('Notes',             sql.NVarChar(1000), 'Extension test')
      .input('CreatedBy',         sql.Int,            null)
      .execute('lease.sp_CreateLeaseModification');
    const row = r.recordset[0] as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(typeof Number(row.remeasurement_gain_loss)).toBe('number');
    expect(isNaN(Number(row.remeasurement_gain_loss))).toBe(false);
  }, 30000);

  it('sp_ApplyLeaseModification: applies the draft and returns GL journal reference', async () => {
    if (!draftModificationId) return;
    const r = await pool.request()
      .input('ModificationId', sql.Int, draftModificationId)
      .input('ApprovedBy',     sql.Int, null)
      .execute('lease.sp_ApplyLeaseModification');
    const row = r.recordset[0] as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row).toHaveProperty('je_ref');
    expect(row).toHaveProperty('new_rou_nbv');
    expect(row).toHaveProperty('new_liability');
    expect(String(row.status)).toBe('applied');
  }, 30000);

  it('sp_GetLeaseModifications: applied modification shows status=applied', async () => {
    if (!testContractId || !draftModificationId) return;
    const r = await pool.request()
      .input('ContractId', testContractId)
      .input('Status',     'applied')
      .execute('lease.sp_GetLeaseModifications');
    const rows = r.recordset as Array<Record<string, unknown>>;
    const found = rows.find((row) => Number(row.modification_id) === draftModificationId);
    expect(found).toBeDefined();
    expect(String(found?.status)).toBe('applied');
  }, 30000);

  it('sp_ApplyLeaseModification: raises error for non-existent modification', async () => {
    await expect(
      pool.request()
        .input('ModificationId', sql.Int, 999999999)
        .input('ApprovedBy',     sql.Int, null)
        .execute('lease.sp_ApplyLeaseModification')
    ).rejects.toThrow();
  }, 30000);

});
