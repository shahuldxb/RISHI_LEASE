/**
 * FX Revaluation — vitest tests
 * Tests the 5 tRPC procedures: getFXRates, upsertFXRate, runFXRevaluation,
 * getFXRevaluationLog, getFXRevaluationSummary
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ── Mock the DB layer ──────────────────────────────────────────────────────
vi.mock('./db-sqlserver', () => ({
  execSPP:      vi.fn(),
  execSPPOne:   vi.fn(),
  execSPPMulti: vi.fn(),
  sql: {
    NVarChar: (n?: number) => ({ type: 'NVarChar', n }),
    VarChar:  (n?: number) => ({ type: 'VarChar', n }),
    Int:      { type: 'Int' },
    Bit:      { type: 'Bit' },
    Date:     { type: 'Date' },
    Decimal:  (p: number, s: number) => ({ type: 'Decimal', p, s }),
    Char:     (n?: number) => ({ type: 'Char', n }),
    MAX:      -1,
  },
}));

vi.mock('./audit', () => ({
  writeAuditLog: vi.fn(),
  writeErrorLog: vi.fn(),
  extractClientInfo: vi.fn(() => ({ ip: '127.0.0.1', userAgent: 'test' })),
}));

import { execSPP, execSPPOne } from './db-sqlserver';
import { leaseRouter } from './routers/lease';

// ── Minimal mock context ───────────────────────────────────────────────────
const mockCtx = {
  user: { id: 1, name: 'Test User', role: 'admin' as const, openId: 'test' },
  req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any,
};

function makeCaller() {
  return leaseRouter.createCaller(mockCtx as any);
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('FX Revaluation — getFXRates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all rates when no currency filter', async () => {
    const mockRates = [
      { rate_id: 1, currency: 'USD', rate_date: '2026-04-26', closing_rate: 3.641, source: 'Manual' },
      { rate_id: 2, currency: 'EUR', rate_date: '2026-04-26', closing_rate: 3.982, source: 'Manual' },
    ];
    vi.mocked(execSPP).mockResolvedValueOnce(mockRates);
    const caller = makeCaller();
    const result = await caller.getFXRates({});
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ currency: 'USD' });
  });

  it('filters by currency when provided', async () => {
    const mockRates = [
      { rate_id: 1, currency: 'USD', rate_date: '2026-04-26', closing_rate: 3.641, source: 'Manual' },
    ];
    vi.mocked(execSPP).mockResolvedValueOnce(mockRates);
    const caller = makeCaller();
    const result = await caller.getFXRates({ currency: 'USD' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ currency: 'USD', closing_rate: 3.641 });
  });
});

describe('FX Revaluation — upsertFXRate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves a new FX rate successfully', async () => {
    vi.mocked(execSPPOne).mockResolvedValueOnce({ result: 'OK', message: 'FX rate saved' });
    const caller = makeCaller();
    const result = await caller.upsertFXRate({
      currency: 'USD',
      rateDate: '2026-04-26',
      closingRate: 3.641,
      source: 'Bloomberg',
    });
    expect(result.result).toBe('OK');
  });

  it('throws BAD_REQUEST when SP returns error', async () => {
    vi.mocked(execSPPOne).mockResolvedValueOnce({ result: 'ERROR', message: 'Duplicate rate' });
    const caller = makeCaller();
    await expect(
      caller.upsertFXRate({ currency: 'USD', rateDate: '2026-04-26', closingRate: 3.641 })
    ).rejects.toThrow(TRPCError);
  });

  it('rejects invalid currency code (not 3 chars)', async () => {
    const caller = makeCaller();
    await expect(
      caller.upsertFXRate({ currency: 'US', rateDate: '2026-04-26', closingRate: 3.641 })
    ).rejects.toThrow();
  });

  it('rejects non-positive closing rate', async () => {
    const caller = makeCaller();
    await expect(
      caller.upsertFXRate({ currency: 'USD', rateDate: '2026-04-26', closingRate: -1 })
    ).rejects.toThrow();
  });
});

describe('FX Revaluation — runFXRevaluation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs revaluation and returns count', async () => {
    vi.mocked(execSPPOne).mockResolvedValueOnce({
      result: 'OK',
      message: 'FX revaluation posted for 3 lease(s)',
      revalued_count: 3,
    });
    const caller = makeCaller();
    const result = await caller.runFXRevaluation({ year: 2026, month: 4 });
    expect(result.result).toBe('OK');
    expect(result.revalued_count).toBe(3);
  });

  it('returns OK with zero count when no non-QAR leases found', async () => {
    vi.mocked(execSPPOne).mockResolvedValueOnce({
      result: 'OK',
      message: 'No non-QAR leases with available rates found for this period',
      revalued_count: 0,
    });
    const caller = makeCaller();
    const result = await caller.runFXRevaluation({ year: 2026, month: 4 });
    expect(result.result).toBe('OK');
    expect(result.revalued_count).toBe(0);
  });

  it('throws BAD_REQUEST when SP returns ERROR', async () => {
    vi.mocked(execSPPOne).mockResolvedValueOnce({
      result: 'ERROR',
      message: 'Transaction rolled back',
      revalued_count: 0,
    });
    const caller = makeCaller();
    await expect(
      caller.runFXRevaluation({ year: 2026, month: 4 })
    ).rejects.toThrow(TRPCError);
  });
});

describe('FX Revaluation — getFXRevaluationLog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns log entries for a period', async () => {
    const mockLog = [
      {
        reval_id: 1, contract_id: 42, contract_ref: 'VF-2024-0042',
        period_year: 2026, period_month: 4, currency: 'USD',
        original_amount_fc: 100000, closing_rate: 3.641,
        revalued_amount_lc: 364100, prev_carrying_lc: 360000,
        fx_gain_loss: 4100, je_ref: 'JE8-2026-04-42',
        posted_by: 'Test User', posted_at: '2026-04-26T10:00:00',
      },
    ];
    vi.mocked(execSPP).mockResolvedValueOnce(mockLog);
    const caller = makeCaller();
    const result = await caller.getFXRevaluationLog({ year: 2026, month: 4 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ currency: 'USD', fx_gain_loss: 4100 });
  });

  it('returns empty array when no entries', async () => {
    vi.mocked(execSPP).mockResolvedValueOnce([]);
    const caller = makeCaller();
    const result = await caller.getFXRevaluationLog({ year: 2020, month: 1 });
    expect(result).toHaveLength(0);
  });
});

describe('FX Revaluation — getFXRevaluationSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns summary KPIs for a period', async () => {
    const mockSummary = {
      total_leases_revalued: 3,
      total_fx_gain: 12500,
      total_fx_loss: 3200,
      net_fx_impact: 9300,
      total_revalued_liability_lc: 1450000,
      currencies_revalued: 2,
    };
    vi.mocked(execSPPOne).mockResolvedValueOnce(mockSummary);
    const caller = makeCaller();
    const result = await caller.getFXRevaluationSummary({ year: 2026, month: 4 });
    expect(result).toMatchObject({ total_leases_revalued: 3, net_fx_impact: 9300 });
  });

  it('returns empty object when no revaluation run yet', async () => {
    vi.mocked(execSPPOne).mockResolvedValueOnce(null);
    const caller = makeCaller();
    const result = await caller.getFXRevaluationSummary({ year: 2020, month: 1 });
    expect(result).toEqual({});
  });
});
