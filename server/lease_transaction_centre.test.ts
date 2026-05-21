/**
 * Lease Transaction Centre — Integration Tests
 * Uses real DB (same pattern as auth.logout.test.ts).
 * Assertions are flexible to handle variable DB state.
 */
import { describe, it, expect } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

type AuthenticatedUser = NonNullable<TrpcContext['user']>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: 'test-admin-001',
    email: 'admin@vodalease.test',
    name: 'Test Admin',
    loginMethod: 'manus',
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: { clearCookie: () => {} } as TrpcContext['res'],
  };
}

describe('Lease Transaction Centre', () => {
  const ctx = createAdminContext();
  const caller = appRouter.createCaller(ctx);

  // ── getLeasesForTransaction ────────────────────────────────────────────────
  describe('getLeasesForTransaction', () => {
    it('returns an array (may be empty if no active leases)', async () => {
      const result = await caller.lease.getLeasesForTransaction({});
      expect(Array.isArray(result)).toBe(true);
    }, 15000);

    it('accepts a search term without throwing', async () => {
      const result = await caller.lease.getLeasesForTransaction({ search: 'office' });
      expect(Array.isArray(result)).toBe(true);
    });

    it('each lease row has required fields when data exists', async () => {
      const result = await caller.lease.getLeasesForTransaction({});
      for (const row of result) {
        expect(row).toHaveProperty('contract_id');
        expect(row).toHaveProperty('contract_ref');
        expect(row).toHaveProperty('lifecycle_status');
        expect(row).toHaveProperty('monthly_payment');
        expect(row).toHaveProperty('currency');
      }
    });
  });

  // ── previewModification ────────────────────────────────────────────────────
  describe('previewModification', () => {
    it('returns summary, jeLines, and schedule for a valid contract', async () => {
      // Get a valid contract first
      const leases = await caller.lease.getLeasesForTransaction({});
      if (leases.length === 0) {
        console.log('No active leases — skipping previewModification test');
        return;
      }
      const contractId = leases[0].contract_id as number;
      const result = await caller.lease.previewModification({
        contractId,
        newMonthlyPayment: (leases[0].monthly_payment as number) * 1.1,
        effectiveDate: new Date().toISOString().split('T')[0],
      });
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('jeLines');
      expect(result).toHaveProperty('schedule');
      expect(Array.isArray(result.jeLines)).toBe(true);
      expect(Array.isArray(result.schedule)).toBe(true);
    });
  });

  // ── previewTermination ─────────────────────────────────────────────────────
  describe('previewTermination', () => {
    it('returns summary and jeLines for a valid contract', async () => {
      const leases = await caller.lease.getLeasesForTransaction({});
      if (leases.length === 0) {
        console.log('No active leases — skipping previewTermination test');
        return;
      }
      const contractId = leases[0].contract_id as number;
      const result = await caller.lease.previewTermination({
        contractId,
        terminationDate: new Date().toISOString().split('T')[0],
      });
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('jeLines');
      expect(Array.isArray(result.jeLines)).toBe(true);
    });
  });

  // ── previewRenewal ─────────────────────────────────────────────────────────
  describe('previewRenewal', () => {
    it('returns summary and jeLines for a valid contract', async () => {
      const leases = await caller.lease.getLeasesForTransaction({});
      if (leases.length === 0) {
        console.log('No active leases — skipping previewRenewal test');
        return;
      }
      const contractId = leases[0].contract_id as number;
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 3);
      const result = await caller.lease.previewRenewal({
        contractId,
        newExpiryDate: futureDate.toISOString().split('T')[0],
        newMonthlyPayment: (leases[0].monthly_payment as number) * 1.05,
      });
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('jeLines');
      expect(Array.isArray(result.jeLines)).toBe(true);
    });
  });

  // ── getLeaseTransactionHistory ─────────────────────────────────────────────
  describe('getLeaseTransactionHistory', () => {
    it('returns drafts and postings arrays for any contractId', async () => {
      const result = await caller.lease.getLeaseTransactionHistory({ contractId: 1 });
      expect(result).toHaveProperty('drafts');
      expect(result).toHaveProperty('postings');
      expect(Array.isArray(result.drafts)).toBe(true);
      expect(Array.isArray(result.postings)).toBe(true);
    });

    it('returns empty arrays for a non-existent contractId', async () => {
      const result = await caller.lease.getLeaseTransactionHistory({ contractId: 999999 });
      expect(result.drafts).toHaveLength(0);
      expect(result.postings).toHaveLength(0);
    });

    it('each posting has required fields when data exists', async () => {
      const leases = await caller.lease.getLeasesForTransaction({});
      if (leases.length === 0) return;
      const contractId = leases[0].contract_id as number;
      const result = await caller.lease.getLeaseTransactionHistory({ contractId });
      for (const posting of result.postings) {
        expect(posting).toHaveProperty('je_ref');
        expect(posting).toHaveProperty('je_label');
        expect(posting).toHaveProperty('amount');
        expect(posting).toHaveProperty('dr_cr');
      }
    });
  });
});
