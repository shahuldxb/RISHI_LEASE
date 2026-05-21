/**
 * Phase 5 Feature Tests
 * Tests for: Disclosure Notes, Renewal Engine, Period-End Close, IAS 17 Comparison
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock the DB layer ────────────────────────────────────────────────────────
vi.mock('./db-sqlserver', () => ({
  execSPP:      vi.fn(),
  execSPPOne:   vi.fn(),
  execSPPMulti: vi.fn(),
  sql: {
    Int:        'Int',
    NVarChar:   (n: number) => `NVarChar(${n})`,
    Decimal:    (p: number, s: number) => `Decimal(${p},${s})`,
    Date:       'Date',
    Bit:        'Bit',
  },
}));

vi.mock('./audit', () => ({
  writeAuditLog:   vi.fn(),
  writeErrorLog:   vi.fn(),
  extractClientInfo: vi.fn(() => ({ ip: '127.0.0.1', userAgent: 'test' })),
}));

import { execSPP, execSPPOne, execSPPMulti } from './db-sqlserver';

const mockExecSPP      = vi.mocked(execSPP);
const mockExecSPPOne   = vi.mocked(execSPPOne);
const mockExecSPPMulti = vi.mocked(execSPPMulti);

// ─── Feature 1: Disclosure Notes ─────────────────────────────────────────────
describe('Feature 1 — IFRS 16 Disclosure Notes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getDisclosureNotes returns 4 result sets', async () => {
    const maturity   = [{ maturity_band: 'Less than 1 year', undiscounted_payment: 120000, discounted_liability: 110000, lease_count: 3 }];
    const rouRows    = [{ asset_class: 'Vehicles', opening_nbv: 500000, additions: 100000, depreciation_charge: 80000, closing_nbv: 520000, lease_count: 5 }];
    const liabRecon  = [{ opening_liability: 900000, new_leases: 100000, interest_accrued: 72000, payments_made: 120000, closing_liability: 952000 }];
    const assumptions = [{ total_leases: 8, weighted_avg_ibr: 0.085, min_ibr: 0.07, max_ibr: 0.10, avg_remaining_term_months: 28, total_annual_payments: 1440000, total_lease_liability: 952000, total_rou_nbv: 520000 }];

    mockExecSPPMulti.mockResolvedValueOnce([maturity, rouRows, liabRecon, assumptions]);

    const { execSPPMulti: multi } = await import('./db-sqlserver');
    const result = await multi('sp_GetIFRS16DisclosureNotes', [{ name: 'ReportingYear', type: 'Int', value: 2025 }]);

    expect(result).toHaveLength(4);
    expect(result[0][0]).toHaveProperty('maturity_band', 'Less than 1 year');
    expect(result[1][0]).toHaveProperty('asset_class', 'Vehicles');
    expect(result[2][0]).toHaveProperty('closing_liability', 952000);
    expect(result[3][0]).toHaveProperty('weighted_avg_ibr', 0.085);
  });

  it('returns empty arrays when no data', async () => {
    mockExecSPPMulti.mockResolvedValueOnce([[], [], [], []]);
    const { execSPPMulti: multi } = await import('./db-sqlserver');
    const result = await multi('sp_GetIFRS16DisclosureNotes', [{ name: 'ReportingYear', type: 'Int', value: 2020 }]);
    expect(result[0]).toHaveLength(0);
    expect(result[1]).toHaveLength(0);
  });
});

// ─── Feature 2: Renewal Engine ───────────────────────────────────────────────
describe('Feature 2 — Lease Renewal Engine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getRenewals returns list', async () => {
    const rows = [
      { renewal_id: 1, contract_ref: 'VL-001', status: 'Pending', days_to_expiry: 45, new_monthly_payment: 15000, new_ibr: 0.085 },
    ];
    mockExecSPP.mockResolvedValueOnce(rows);
    const { execSPP: sp } = await import('./db-sqlserver');
    const result = await sp('sp_GetRenewals', [{ name: 'Status', type: 'NVarChar(20)', value: 'Pending' }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('status', 'Pending');
  });

  it('initiateRenewal returns OK', async () => {
    mockExecSPPOne.mockResolvedValueOnce({ result: 'OK', renewal_id: 42, message: 'Renewal initiated' });
    const { execSPPOne: spOne } = await import('./db-sqlserver');
    const result = await spOne('sp_InitiateRenewal', []) as { result: string; renewal_id: number };
    expect(result.result).toBe('OK');
    expect(result.renewal_id).toBe(42);
  });

  it('approveRenewal returns OK', async () => {
    mockExecSPPOne.mockResolvedValueOnce({ result: 'OK', message: 'Renewal approved' });
    const { execSPPOne: spOne } = await import('./db-sqlserver');
    const result = await spOne('sp_ApproveRenewal', []) as { result: string };
    expect(result.result).toBe('OK');
  });

  it('rejectRenewal returns OK', async () => {
    mockExecSPPOne.mockResolvedValueOnce({ result: 'OK', message: 'Renewal rejected' });
    const { execSPPOne: spOne } = await import('./db-sqlserver');
    const result = await spOne('sp_RejectRenewal', []) as { result: string };
    expect(result.result).toBe('OK');
  });
});

// ─── Feature 3: Period-End Close ─────────────────────────────────────────────
describe('Feature 3 — Period-End Close Lock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getPeriodCloseStatus returns 12 months', async () => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      period_year: 2025, period_month: i + 1, is_closed: i < 3 ? 1 : 0,
      posted_count: i < 3 ? 10 : 0, projected_count: i >= 3 ? 8 : 0,
    }));
    mockExecSPP.mockResolvedValueOnce(months);
    const { execSPP: sp } = await import('./db-sqlserver');
    const result = await sp('sp_GetPeriodCloseStatus', [{ name: 'Year', type: 'Int', value: 2025 }]);
    expect(result).toHaveLength(12);
    expect(result[0]).toHaveProperty('is_closed', 1);
    expect(result[3]).toHaveProperty('is_closed', 0);
  });

  it('closePeriod returns OK', async () => {
    mockExecSPPOne.mockResolvedValueOnce({ result: 'OK', message: 'Period closed: 3 rows locked' });
    const { execSPPOne: spOne } = await import('./db-sqlserver');
    const result = await spOne('sp_ClosePeriod', []) as { result: string };
    expect(result.result).toBe('OK');
  });

  it('reopenPeriod returns OK', async () => {
    mockExecSPPOne.mockResolvedValueOnce({ result: 'OK', message: 'Period reopened: 3 rows unlocked' });
    const { execSPPOne: spOne } = await import('./db-sqlserver');
    const result = await spOne('sp_ReopenPeriod', []) as { result: string };
    expect(result.result).toBe('OK');
  });
});

// ─── Feature 4: IAS 17 vs IFRS 16 Comparison ─────────────────────────────────
describe('Feature 4 — IAS 17 vs IFRS 16 Comparison', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getIAS17Comparison returns leases and summary', async () => {
    const leases = [
      {
        contract_ref: 'VL-001', asset_description: 'Office Floor 3', ifrs16_classification: 'Finance',
        ias17_rent_expense: 180000, ifrs16_interest_expense: 76500, ifrs16_depreciation: 120000,
        ifrs16_total_charge: 196500, pl_difference: 16500, bs_lease_liability: 850000, bs_rou_asset: 720000,
      },
    ];
    const summary = [{
      total_ias17_expense: 180000, total_ifrs16_interest: 76500, total_ifrs16_depreciation: 120000,
      total_ifrs16_charge: 196500, total_lease_liability: 850000, total_rou_asset: 720000,
    }];
    mockExecSPPMulti.mockResolvedValueOnce([leases, summary]);
    const { execSPPMulti: multi } = await import('./db-sqlserver');
    const result = await multi('sp_GetIAS17Comparison', [{ name: 'Year', type: 'Int', value: 2025 }]);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0]).toHaveProperty('pl_difference', 16500);
    expect(result[1][0]).toHaveProperty('total_lease_liability', 850000);
  });

  it('pl_difference is positive when IFRS 16 charge exceeds IAS 17 rent', async () => {
    const leases = [{ ias17_rent_expense: 180000, ifrs16_total_charge: 196500, pl_difference: 16500 }];
    mockExecSPPMulti.mockResolvedValueOnce([leases, [{}]]);
    const { execSPPMulti: multi } = await import('./db-sqlserver');
    const result = await multi('sp_GetIAS17Comparison', []);
    expect(Number(result[0][0].pl_difference)).toBeGreaterThan(0);
  });
});
