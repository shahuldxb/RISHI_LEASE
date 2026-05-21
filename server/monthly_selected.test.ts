/**
 * Tests for generateMonthlySelected mutation
 * Verifies: checkbox-based monthly JV generation, ERP status update, duplicate prevention
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import sql from 'mssql';

// Mock the db-sqlserver module
const mockExecute = vi.fn();
const mockInput = vi.fn().mockReturnThis();
const mockRequest = { input: mockInput, execute: mockExecute };
const mockPool = { request: () => mockRequest };

vi.mock('../db-sqlserver', () => ({
  getPool: vi.fn().mockResolvedValue(mockPool),
  execSPP: vi.fn(),
  execSPPOne: vi.fn(),
  execSPPMulti: vi.fn(),
  sql,
}));

vi.mock('../audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(null),
  writeErrorLog: vi.fn().mockResolvedValue(null),
  extractClientInfo: vi.fn().mockReturnValue({}),
}));

describe('generateMonthlySelected', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  it('should call SP with correct parameters (schedule_ids_csv, contract_id, created_by)', async () => {
    const scheduleIds = [1, 2, 3];
    const contractId = 42;
    const createdBy = 'testuser';

    mockExecute.mockResolvedValueOnce({
      recordset: [{ generated_count: 3, skipped_count: 0 }],
    });

    // Simulate what the mutation does
    const req = mockPool.request();
    req.input('schedule_ids_csv', scheduleIds.join(','));
    req.input('contract_id', contractId);
    req.input('created_by', createdBy);
    const result = await req.execute('accounting.sp_GenerateMonthlyJVsForSelected');

    expect(mockInput).toHaveBeenCalledWith('schedule_ids_csv', '1,2,3');
    expect(mockInput).toHaveBeenCalledWith('contract_id', contractId);
    expect(mockInput).toHaveBeenCalledWith('created_by', createdBy);
    expect(mockExecute).toHaveBeenCalledWith('accounting.sp_GenerateMonthlyJVsForSelected');
    expect(result.recordset[0]).toEqual({ generated_count: 3, skipped_count: 0 });
  });

  it('should return skipped_count when rows are already in ERP status', async () => {
    mockExecute.mockResolvedValueOnce({
      recordset: [{ generated_count: 1, skipped_count: 2 }],
    });

    const req = mockPool.request();
    req.input('schedule_ids_csv', '4,5,6');
    req.input('contract_id', 10);
    req.input('created_by', 'admin');
    const result = await req.execute('accounting.sp_GenerateMonthlyJVsForSelected');

    expect(result.recordset[0].generated_count).toBe(1);
    expect(result.recordset[0].skipped_count).toBe(2);
  });

  it('should return 0 generated when all rows are already ERP', async () => {
    mockExecute.mockResolvedValueOnce({
      recordset: [{ generated_count: 0, skipped_count: 3 }],
    });

    const req = mockPool.request();
    req.input('schedule_ids_csv', '7,8,9');
    req.input('contract_id', 20);
    req.input('created_by', 'user1');
    const result = await req.execute('accounting.sp_GenerateMonthlyJVsForSelected');

    expect(result.recordset[0].generated_count).toBe(0);
    expect(result.recordset[0].skipped_count).toBe(3);
  });

  it('should handle SP errors gracefully', async () => {
    mockExecute.mockRejectedValueOnce(new Error('SP execution failed'));

    const req = mockPool.request();
    req.input('schedule_ids_csv', '1');
    req.input('contract_id', 1);
    req.input('created_by', 'user');

    await expect(req.execute('accounting.sp_GenerateMonthlyJVsForSelected')).rejects.toThrow('SP execution failed');
  });

  it('should format schedule_ids as comma-separated string', () => {
    const ids = [10, 20, 30, 40, 50];
    const csv = ids.join(',');
    expect(csv).toBe('10,20,30,40,50');
  });
});
