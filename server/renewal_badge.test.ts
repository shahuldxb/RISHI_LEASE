/**
 * Feature 6: Renewal Due Badge Counter & Email Notification — vitest tests
 * Tests: getRenewalDueCount, checkAndNotifyRenewalDue
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the DB and notification layers ───────────────────────────────────
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
  writeAuditLog:     vi.fn(),
  writeErrorLog:     vi.fn(),
  extractClientInfo: vi.fn(() => ({ ip: '127.0.0.1', userAgent: 'test' })),
}));

vi.mock('./_core/notification', () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { execSPP, execSPPOne } from './db-sqlserver';
import { notifyOwner } from './_core/notification';
import { leaseRouter } from './routers/lease';

// ── Minimal mock context ───────────────────────────────────────────────────
const mockCtx = {
  user: { id: 1, name: 'Test User', role: 'admin' as const, openId: 'test' },
  req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any,
};

function makeCaller() {
  return leaseRouter.createCaller(mockCtx as any);
}

// ── getRenewalDueCount ─────────────────────────────────────────────────────
describe('getRenewalDueCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the count from the SP', async () => {
    vi.mocked(execSPPOne).mockResolvedValueOnce({ renewal_due_count: 5 });
    const caller = makeCaller();
    const result = await caller.getRenewalDueCount();
    expect(result.count).toBe(5);
  });

  it('returns 0 when SP returns null', async () => {
    vi.mocked(execSPPOne).mockResolvedValueOnce(null);
    const caller = makeCaller();
    const result = await caller.getRenewalDueCount();
    expect(result.count).toBe(0);
  });

  it('returns 0 when SP returns undefined count', async () => {
    vi.mocked(execSPPOne).mockResolvedValueOnce({});
    const caller = makeCaller();
    const result = await caller.getRenewalDueCount();
    expect(result.count).toBe(0);
  });

  it('returns large count correctly', async () => {
    vi.mocked(execSPPOne).mockResolvedValueOnce({ renewal_due_count: 142 });
    const caller = makeCaller();
    const result = await caller.getRenewalDueCount();
    expect(result.count).toBe(142);
  });
});

// ── checkAndNotifyRenewalDue ───────────────────────────────────────────────
describe('checkAndNotifyRenewalDue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns notified: 0 when no leases in the window', async () => {
    vi.mocked(execSPP).mockResolvedValueOnce([]);
    const caller = makeCaller();
    const result = await caller.checkAndNotifyRenewalDue();
    expect(result.notified).toBe(0);
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it('sends a notification and marks leases when 1 lease is due', async () => {
    const mockLeases = [{
      contract_id: 42,
      contract_ref: 'VF-2024-0042',
      asset_description: 'Office Space - Doha',
      currency: 'QAR',
      monthly_payment: 25000,
      expiry_date: '2026-07-15',
      days_remaining: 80,
      lessor_name: 'Qatar Properties LLC',
      lifecycle_status: 'Active',
    }];
    vi.mocked(execSPP).mockResolvedValueOnce(mockLeases);
    // sp_MarkRenewalNotified returns OK
    vi.mocked(execSPPOne).mockResolvedValue({ result: 'OK' });

    const caller = makeCaller();
    const result = await caller.checkAndNotifyRenewalDue();

    expect(result.notified).toBe(1);
    expect(notifyOwner).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(notifyOwner).mock.calls[0][0];
    expect(callArgs.title).toContain('1 Lease Due for Renewal');
    expect(callArgs.content).toContain('VF-2024-0042');
    expect(callArgs.content).toContain('Qatar Properties LLC');
    expect(callArgs.content).toContain('80 days remaining');
  });

  it('sends a single grouped notification for multiple leases', async () => {
    const mockLeases = [
      {
        contract_id: 10, contract_ref: 'VF-2024-0010', asset_description: 'Warehouse A',
        currency: 'QAR', monthly_payment: 15000, expiry_date: '2026-07-01',
        days_remaining: 66, lessor_name: 'Alpha Realty', lifecycle_status: 'Active',
      },
      {
        contract_id: 11, contract_ref: 'VF-2024-0011', asset_description: 'Office B',
        currency: 'USD', monthly_payment: 8000, expiry_date: '2026-07-20',
        days_remaining: 85, lessor_name: 'Beta Holdings', lifecycle_status: 'Modified',
      },
    ];
    vi.mocked(execSPP).mockResolvedValueOnce(mockLeases);
    vi.mocked(execSPPOne).mockResolvedValue({ result: 'OK' });

    const caller = makeCaller();
    const result = await caller.checkAndNotifyRenewalDue();

    expect(result.notified).toBe(2);
    expect(notifyOwner).toHaveBeenCalledOnce(); // single grouped notification
    const callArgs = vi.mocked(notifyOwner).mock.calls[0][0];
    expect(callArgs.title).toContain('2 Leases Due for Renewal');
    expect(callArgs.content).toContain('VF-2024-0010');
    expect(callArgs.content).toContain('VF-2024-0011');
  });

  it('still marks leases as notified even if notifyOwner throws', async () => {
    const mockLeases = [{
      contract_id: 99, contract_ref: 'VF-2024-0099', asset_description: 'Store C',
      currency: 'QAR', monthly_payment: 5000, expiry_date: '2026-07-10',
      days_remaining: 75, lessor_name: 'Gamma Corp', lifecycle_status: 'Active',
    }];
    vi.mocked(execSPP).mockResolvedValueOnce(mockLeases);
    vi.mocked(notifyOwner).mockRejectedValueOnce(new Error('Notification service unavailable'));
    vi.mocked(execSPPOne).mockResolvedValue({ result: 'OK' });

    const caller = makeCaller();
    // Should not throw even if notification fails
    const result = await caller.checkAndNotifyRenewalDue();
    expect(result.notified).toBe(1);
    // sp_MarkRenewalNotified should still be called
    expect(execSPPOne).toHaveBeenCalledWith('sp_MarkRenewalNotified', expect.any(Array));
  });

  it('marks each lease individually with correct params', async () => {
    const mockLeases = [{
      contract_id: 55, contract_ref: 'VF-2025-0055', asset_description: 'Data Centre',
      currency: 'QAR', monthly_payment: 100000, expiry_date: '2026-06-30',
      days_remaining: 65, lessor_name: 'DC Holdings', lifecycle_status: 'Active',
    }];
    vi.mocked(execSPP).mockResolvedValueOnce(mockLeases);
    vi.mocked(execSPPOne).mockResolvedValue({ result: 'OK' });

    const caller = makeCaller();
    await caller.checkAndNotifyRenewalDue();

    const markCall = vi.mocked(execSPPOne).mock.calls.find(
      c => c[0] === 'sp_MarkRenewalNotified'
    );
    expect(markCall).toBeDefined();
    const params = markCall![1] as Array<{ name: string; value: any }>;
    expect(params.find(p => p.name === 'ContractId')?.value).toBe(55);
    expect(params.find(p => p.name === 'ContractRef')?.value).toBe('VF-2025-0055');
    expect(params.find(p => p.name === 'DaysRemaining')?.value).toBe(65);
  });
});
