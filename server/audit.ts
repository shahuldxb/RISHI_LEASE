/**
 * VodaLease Enterprise — Audit & Error Logging Service
 * All audit and error entries are written via stored procedures.
 */
import { execSPPOne, sql } from './db-sqlserver';
import type { Request } from 'express';

export interface AuditEntry {
  userId: number;
  username: string;
  userRole: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  browserOs?: string;
  module: string;
  subModule?: string;
  actionType: string;
  recordTable?: string;
  recordId?: string;
  beforeState?: object | null;
  afterState?: object | null;
  outcome: 'Success' | 'Failure' | 'Pending';
  screenId: string;
  processStartTime: Date;
}

export async function writeAuditLog(entry: AuditEntry): Promise<string | null> {
  try {
    const result = await execSPPOne<{ audit_no: string }>('sp_WriteAuditLog', [
      { name: 'UserId', type: sql.Int, value: entry.userId },
      { name: 'Username', type: sql.VarChar(100), value: entry.username },
      { name: 'UserRole', type: sql.VarChar(50), value: entry.userRole },
      { name: 'IPAddress', type: sql.VarChar(45), value: entry.ipAddress || null },
      { name: 'DeviceFingerprint', type: sql.VarChar(200), value: entry.deviceFingerprint || null },
      { name: 'BrowserOS', type: sql.VarChar(200), value: entry.browserOs || null },
      { name: 'Module', type: sql.VarChar(50), value: entry.module },
      { name: 'SubModule', type: sql.VarChar(50), value: entry.subModule || null },
      { name: 'ActionType', type: sql.VarChar(50), value: entry.actionType },
      { name: 'RecordTable', type: sql.VarChar(100), value: entry.recordTable || null },
      { name: 'RecordId', type: sql.VarChar(50), value: entry.recordId || null },
      { name: 'BeforeState', type: sql.NVarChar(sql.MAX), value: entry.beforeState ? JSON.stringify(entry.beforeState) : null },
      { name: 'AfterState', type: sql.NVarChar(sql.MAX), value: entry.afterState ? JSON.stringify(entry.afterState) : null },
      { name: 'Outcome', type: sql.VarChar(20), value: entry.outcome },
      { name: 'ScreenId', type: sql.VarChar(20), value: entry.screenId },
      { name: 'ProcessStartTime', type: sql.DateTime2, value: entry.processStartTime },
      { name: 'ProcessEndTime', type: sql.DateTime2, value: new Date() },
    ]);
    return result?.audit_no || null;
  } catch (err) {
    console.error('[AuditLog] Failed to write audit entry:', err);
    return null;
  }
}

export async function writeErrorLog(params: {
  severity: 'Info' | 'Warning' | 'Error' | 'Critical';
  module: string;
  errorCode?: string;
  message: string;
  fullMessage?: string;
  stackTrace?: string;
  userContext?: object;
  jobContext?: object;
  screenId?: string;
}): Promise<string | null> {
  try {
    const result = await execSPPOne<{ error_no: string }>('sp_WriteErrorLog', [
      { name: 'Severity', type: sql.VarChar(20), value: params.severity },
      { name: 'Module', type: sql.VarChar(50), value: params.module },
      { name: 'ErrorCode', type: sql.VarChar(50), value: params.errorCode || null },
      { name: 'Message', type: sql.NVarChar(500), value: params.message },
      { name: 'FullMessage', type: sql.NVarChar(sql.MAX), value: params.fullMessage || params.message },
      { name: 'StackTrace', type: sql.NVarChar(sql.MAX), value: params.stackTrace || null },
      { name: 'UserContext', type: sql.NVarChar(sql.MAX), value: params.userContext ? JSON.stringify(params.userContext) : null },
      { name: 'JobContext', type: sql.NVarChar(sql.MAX), value: params.jobContext ? JSON.stringify(params.jobContext) : null },
      { name: 'ScreenId', type: sql.VarChar(20), value: params.screenId || null },
    ]);
    return result?.error_no || null;
  } catch (err) {
    console.error('[ErrorLog] Failed to write error entry:', err);
    return null;
  }
}

export function extractClientInfo(req: Request) {
  return {
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '',
    deviceFingerprint: req.headers['x-device-fingerprint'] as string || '',
    browserOs: req.headers['user-agent'] || '',
    screenId: req.headers['x-screen-id'] as string || '',
  };
}

// ── Simplified wrappers for rulesEngine / glConfiguration ──────────────────────
// Accept positional args for convenience, mapping to the full structured signatures.

export async function simpleAuditLog(
  table: string, action: string, user: string, message: string, details?: object
): Promise<string | null> {
  return writeAuditLog({
    userId: 0,
    username: user,
    userRole: 'system',
    module: 'RulesEngine',
    subModule: table,
    actionType: action,
    recordTable: table,
    recordId: details && 'rule_id' in details ? String((details as any).rule_id) : undefined,
    beforeState: null,
    afterState: details ?? null,
    outcome: 'Success',
    screenId: details && 'screen_id' in details ? String((details as any).screen_id) : 'SYSTEM',
    processStartTime: new Date(),
  });
}

export async function simpleErrorLog(
  source: string, message: string, module: string, context?: object
): Promise<string | null> {
  return writeErrorLog({
    severity: 'Error',
    module,
    errorCode: source,
    message,
    fullMessage: message,
    stackTrace: new Error().stack,
    userContext: context ?? undefined,
    screenId: context && 'screenId' in context ? String((context as any).screenId) : undefined,
  });
}
