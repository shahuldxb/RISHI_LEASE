/**
 * Feature 8 — IFRS Financial Reporting: Integration Tests
 * Tests: getBalanceSheet, getIncomeStatement, getCashFlowStatement,
 *        getROURollForward, getLiabilityRollForward, getTrialBalance,
 *        getExemptionRegister, updateLeaseExemption
 *
 * Uses real DB (same pattern as lease_transaction_centre.test.ts).
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

const PERIOD_START = '2025-01-01';
const PERIOD_END   = '2025-12-31';

describe('Feature 8 — IFRS Financial Reporting', () => {
  const ctx = createAdminContext();
  const caller = appRouter.createCaller(ctx);

  // ── getBalanceSheet ──────────────────────────────────────────────────────
  describe('getBalanceSheet', () => {
    it('returns lines and summary objects', async () => {
      const result = await caller.lease.getBalanceSheet({ periodEnd: PERIOD_END });
      expect(result).toHaveProperty('lines');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.lines)).toBe(true);
    }, 30000);

    it('each balance sheet line has required fields when data exists', async () => {
      const result = await caller.lease.getBalanceSheet({ periodEnd: PERIOD_END });
      for (const line of result.lines) {
        expect(line).toHaveProperty('account_class');
        expect(line).toHaveProperty('account_name');
        expect(line).toHaveProperty('balance');
      }
    }, 15000);

    it('accepts different period-end dates without throwing', async () => {
      const result = await caller.lease.getBalanceSheet({ periodEnd: '2026-03-31' });
      expect(result).toHaveProperty('lines');
      expect(Array.isArray(result.lines)).toBe(true);
    }, 15000);
  });

  // ── getIncomeStatement ───────────────────────────────────────────────────
  describe('getIncomeStatement', () => {
    it('returns lines and summary objects', async () => {
      const result = await caller.lease.getIncomeStatement({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      });
      expect(result).toHaveProperty('lines');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.lines)).toBe(true);
    }, 15000);

    it('each income statement line has required fields when data exists', async () => {
      const result = await caller.lease.getIncomeStatement({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      });
      for (const line of result.lines) {
        expect(line).toHaveProperty('account_name');
        expect(line).toHaveProperty('amount');
      }
    }, 15000);

    it('returns empty lines for a future period without throwing', async () => {
      const result = await caller.lease.getIncomeStatement({
        periodStart: '2030-01-01',
        periodEnd: '2030-12-31',
      });
      expect(Array.isArray(result.lines)).toBe(true);
    }, 15000);
  });

  // ── getCashFlowStatement ─────────────────────────────────────────────────
  describe('getCashFlowStatement', () => {
    it('returns lines and summary objects', async () => {
      const result = await caller.lease.getCashFlowStatement({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      });
      expect(result).toHaveProperty('lines');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.lines)).toBe(true);
    }, 15000);

    it('each cash flow line has required fields when data exists', async () => {
      const result = await caller.lease.getCashFlowStatement({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      });
      for (const line of result.lines) {
        expect(line).toHaveProperty('account_name');
        expect(line).toHaveProperty('amount');
      }
    }, 15000);
  });

  // ── getROURollForward ────────────────────────────────────────────────────
  describe('getROURollForward', () => {
    it('returns movements array and summary object', async () => {
      const result = await caller.lease.getROURollForward({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      });
      expect(result).toHaveProperty('movements');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.movements)).toBe(true);
    }, 15000);

    it('each ROU movement has required fields when data exists', async () => {
      const result = await caller.lease.getROURollForward({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      });
      for (const m of result.movements) {
        expect(m).toHaveProperty('contract_ref');
        expect(m).toHaveProperty('opening_balance');
        expect(m).toHaveProperty('closing_balance');
      }
    }, 15000);
  });

  // ── getLiabilityRollForward ──────────────────────────────────────────────
  describe('getLiabilityRollForward', () => {
    it('returns movements array and summary object', async () => {
      const result = await caller.lease.getLiabilityRollForward({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      });
      expect(result).toHaveProperty('movements');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.movements)).toBe(true);
    }, 15000);

    it('each liability movement has required fields when data exists', async () => {
      const result = await caller.lease.getLiabilityRollForward({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      });
      for (const m of result.movements) {
        expect(m).toHaveProperty('contract_ref');
        expect(m).toHaveProperty('opening_balance');
        expect(m).toHaveProperty('closing_balance');
      }
    }, 15000);
  });

  // ── getTrialBalance ──────────────────────────────────────────────────────
  describe('getTrialBalance', () => {
    it('returns lines array and totals object', async () => {
      const result = await caller.lease.getTrialBalance({ periodEnd: PERIOD_END });
      expect(result).toHaveProperty('lines');
      expect(result).toHaveProperty('totals');
      expect(Array.isArray(result.lines)).toBe(true);
    }, 15000);

    it('each trial balance line has required fields when data exists', async () => {
      const result = await caller.lease.getTrialBalance({ periodEnd: PERIOD_END });
      for (const line of result.lines) {
        expect(line).toHaveProperty('account_name');
        expect(line).toHaveProperty('debit_balance');
        expect(line).toHaveProperty('credit_balance');
      }
    }, 15000);

    it('filters by accountClass without throwing', async () => {
      const result = await caller.lease.getTrialBalance({
        periodEnd: PERIOD_END,
        accountClass: 'Asset',
      });
      expect(Array.isArray(result.lines)).toBe(true);
      // All returned lines should be Asset class if any exist
      for (const line of result.lines) {
        expect(line.account_class).toBe('Asset');
      }
    }, 15000);
  });

  // ── getExemptionRegister ─────────────────────────────────────────────────
  describe('getExemptionRegister', () => {
    it('returns leases array and summary array', async () => {
      const result = await caller.lease.getExemptionRegister({});
      expect(result).toHaveProperty('leases');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.leases)).toBe(true);
      expect(Array.isArray(result.summary)).toBe(true);
    }, 15000);

    it('each exemption lease has required fields when data exists', async () => {
      const result = await caller.lease.getExemptionRegister({});
      for (const lease of result.leases) {
        expect(lease).toHaveProperty('contract_id');
        expect(lease).toHaveProperty('contract_ref');
        expect(lease).toHaveProperty('exemption_type');
      }
    }, 15000);

    it('filters by exemptionType without throwing', async () => {
      const result = await caller.lease.getExemptionRegister({ exemptionType: 'ShortTerm' });
      expect(Array.isArray(result.leases)).toBe(true);
    }, 15000);

    it('filters by LowValue exemption type without throwing', async () => {
      const result = await caller.lease.getExemptionRegister({ exemptionType: 'LowValue' });
      expect(Array.isArray(result.leases)).toBe(true);
    }, 15000);
  });

  // ── updateLeaseExemption ─────────────────────────────────────────────────
  describe('updateLeaseExemption', () => {
    it('updates exemption for an existing contract without throwing', async () => {
      // Get a valid contract first
      const exemptions = await caller.lease.getExemptionRegister({});
      if (exemptions.leases.length === 0) {
        console.log('No leases in exemption register — skipping updateLeaseExemption test');
        return;
      }
      const contractId = exemptions.leases[0]?.contract_id as number;
      const result = await caller.lease.updateLeaseExemption({
        contractId,
        exemptionType: 'None',
        exemptionReason: 'Test reset via vitest',
      });
      // SP returns a result row or null — either is acceptable
      expect(result === null || typeof result === 'object').toBe(true);
    }, 15000);

    it('sets ShortTerm exemption for an existing contract', async () => {
      const exemptions = await caller.lease.getExemptionRegister({});
      if (exemptions.leases.length === 0) {
        console.log('No leases — skipping ShortTerm exemption test');
        return;
      }
      const contractId = exemptions.leases[0]?.contract_id as number;
      const result = await caller.lease.updateLeaseExemption({
        contractId,
        exemptionType: 'ShortTerm',
        exemptionReason: 'Lease term under 12 months — vitest',
      });
      expect(result === null || typeof result === 'object').toBe(true);
    }, 15000);
  });
});
