/**
 * VodaLease Enterprise — SQL Server Connection Pool & SPP Executor
 * ALL database access goes through this module via stored procedures.
 * No raw SQL queries are permitted in application code.
 *
 * Performance & Resilience features:
 *  - Optimized connection pool (max 30, min 5, aggressive keep-alive)
 *  - Auto-reconnect on socket hang up / connection lost
 *  - Exponential backoff retry (up to 3 attempts)
 *  - Pool keep-alive ping every 2 minutes to prevent idle disconnects
 *  - Graceful pool replacement on fatal errors
 *  - Query timing: any query > 500ms is logged to dbo.slow_queries
 *  - Automatic index recommendations from SQL Server DMVs
 *  - In-memory query stats for real-time monitoring
 */
import sql from 'mssql';
import { queryCache } from './query-cache';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION — Optimized for high-throughput lease operations
// ═══════════════════════════════════════════════════════════════

const SLOW_QUERY_THRESHOLD_MS = 500;  // Log queries slower than this
const CRITICAL_THRESHOLD_MS = 5000;   // Notify owner for queries slower than this
const HOURLY_SLOW_THRESHOLD = 10;     // Notify if more than this many slow queries per hour

const config: sql.config = {
  server: process.env.MSSQL_HOST || process.env.SQLSERVER_HOST || '',
  port: parseInt(process.env.MSSQL_PORT || '1433', 10),
  database: process.env.MSSQL_DATABASE || process.env.SQLSERVER_DB || 'leasing',
  user: process.env.MSSQL_USER || process.env.SQLSERVER_USER || '',
  password: process.env.MSSQL_PASSWORD || process.env.SQLSERVER_PASSWORD || '',
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectTimeout: 15000,         // Reduced from 30s — fail fast
    requestTimeout: 60000,         // Reduced from 120s — prevent runaway queries
    abortTransactionOnError: true, // Auto-rollback on error
    useUTC: true,
  },
  pool: {
    max: 30,                        // Increased from 20 — handle concurrent lease operations
    min: 5,                         // Increased from 2 — keep warm connections ready
    idleTimeoutMillis: 120000,      // Increased from 60s — reduce reconnection overhead
    acquireTimeoutMillis: 15000,    // Reduced from 30s — fail fast if pool exhausted
    createTimeoutMillis: 15000,     // Reduced from 30s
    destroyTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  },
};

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY QUERY PERFORMANCE STATS
// ═══════════════════════════════════════════════════════════════

interface QueryStat {
  procedureName: string;
  callCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  minDurationMs: number;
  slowCount: number;       // Times it exceeded threshold
  lastCalledAt: Date;
  avgDurationMs: number;
}

const queryStats = new Map<string, QueryStat>();
let totalQueriesExecuted = 0;
let totalSlowQueries = 0;

export function getQueryStats(): { stats: QueryStat[]; totalExecuted: number; totalSlow: number; cache: ReturnType<typeof queryCache.getStats> } {
  const stats = Array.from(queryStats.values())
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs);
  return { stats, totalExecuted: totalQueriesExecuted, totalSlow: totalSlowQueries, cache: queryCache.getStats() };
}

export function getPoolStatus(): { connected: boolean; size: number; available: number; pending: number; borrowed: number } {
  if (!_pool || !_pool.connected) {
    return { connected: false, size: 0, available: 0, pending: 0, borrowed: 0 };
  }
  return {
    connected: true,
    size: (_pool as any).size ?? config.pool!.max!,
    available: (_pool as any).available ?? 0,
    pending: (_pool as any).pending ?? 0,
    borrowed: (_pool as any).borrowed ?? 0,
  };
}

function updateQueryStat(procedureName: string, durationMs: number, isSlow: boolean) {
  totalQueriesExecuted++;
  if (isSlow) totalSlowQueries++;

  const existing = queryStats.get(procedureName);
  if (existing) {
    existing.callCount++;
    existing.totalDurationMs += durationMs;
    existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
    existing.minDurationMs = Math.min(existing.minDurationMs, durationMs);
    existing.avgDurationMs = Math.round(existing.totalDurationMs / existing.callCount);
    if (isSlow) existing.slowCount++;
    existing.lastCalledAt = new Date();
  } else {
    queryStats.set(procedureName, {
      procedureName,
      callCount: 1,
      totalDurationMs: durationMs,
      maxDurationMs: durationMs,
      minDurationMs: durationMs,
      slowCount: isSlow ? 1 : 0,
      lastCalledAt: new Date(),
      avgDurationMs: durationMs,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// CONNECTION POOL MANAGEMENT
// ═══════════════════════════════════════════════════════════════

let _pool: sql.ConnectionPool | null = null;
let _connecting = false;
let _keepAliveTimer: ReturnType<typeof setInterval> | null = null;

async function createPool(): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool(config);

  pool.on('error', (err: Error) => {
    console.error('[SQLServer] Pool error:', err.message);
    // Mark pool as dead so next request recreates it
    _pool = null;
    if (_keepAliveTimer) {
      clearInterval(_keepAliveTimer);
      _keepAliveTimer = null;
    }
  });

  await pool.connect();
  console.log(`[SQLServer] Connection pool established (min: ${config.pool!.min}, max: ${config.pool!.max})`);

  // Keep-alive: ping every 2 minutes to prevent idle socket drops
  _keepAliveTimer = setInterval(async () => {
    try {
      if (_pool && _pool.connected) {
        await _pool.request().query('SELECT 1 AS ping');
      }
    } catch {
      // Pool will be recreated on next request
      _pool = null;
      if (_keepAliveTimer) {
        clearInterval(_keepAliveTimer);
        _keepAliveTimer = null;
      }
    }
  }, 2 * 60 * 1000); // 2 minutes (reduced from 4)

  return pool;
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (_pool && _pool.connected) return _pool;

  // Prevent concurrent reconnect storms
  if (_connecting) {
    // Wait up to 10s for the other caller to finish connecting
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (_pool && _pool.connected) return _pool;
    }
  }

  _connecting = true;
  try {
    _pool = await createPool();
    return _pool;
  } finally {
    _connecting = false;
  }
}

/** Sleep helper for retry backoff */
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Determine if an error is a transient connection error worth retrying */
function isTransient(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('socket hang up') ||
    msg.includes('connection lost') ||
    msg.includes('connection reset') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('connection closed') ||
    msg.includes('pool is draining') ||
    msg.includes('failed to connect')
  );
}

// ═══════════════════════════════════════════════════════════════
// SLOW QUERY LOGGING (Non-blocking, fire-and-forget)
// ═══════════════════════════════════════════════════════════════

let _slowQueryLogQueue: Array<{
  procedureName: string;
  paramsJson: string | null;
  durationMs: number;
  callerContext: string | null;
  rowCount: number | null;
  errorMessage: string | null;
}> = [];

let _flushTimer: ReturnType<typeof setTimeout> | null = null;

// ═══════════════════════════════════════════════════════════════
// CRITICAL SLOW QUERY NOTIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════

let _hourlySlowCount = 0;
let _hourlyResetTimer: ReturnType<typeof setInterval> | null = null;
let _lastCriticalNotificationAt = 0; // Prevent notification spam (5 min cooldown)
const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between notifications

// Reset hourly counter every hour
if (!_hourlyResetTimer) {
  _hourlyResetTimer = setInterval(() => {
    if (_hourlySlowCount > 0) {
      console.log(`[PerfMonitor] Hourly slow query count reset (was ${_hourlySlowCount})`);
    }
    _hourlySlowCount = 0;
  }, 60 * 60 * 1000);
}

async function sendCriticalSlowQueryAlert(procedureName: string, durationMs: number, reason: 'critical_duration' | 'hourly_threshold') {
  const now = Date.now();
  if (now - _lastCriticalNotificationAt < NOTIFICATION_COOLDOWN_MS) {
    console.warn(`[PerfMonitor] Skipping notification (cooldown active)`);
    return;
  }
  _lastCriticalNotificationAt = now;

  try {
    // Dynamic import to avoid circular dependency
    const { notifyOwner } = await import('./_core/notification');
    const title = reason === 'critical_duration'
      ? `⚠️ Critical Slow Query: ${procedureName} (${(durationMs / 1000).toFixed(1)}s)`
      : `⚠️ High Slow Query Rate: ${_hourlySlowCount} slow queries this hour`;
    const content = reason === 'critical_duration'
      ? `The stored procedure \`${procedureName}\` took ${durationMs}ms to execute, exceeding the critical threshold of ${CRITICAL_THRESHOLD_MS}ms.\n\nThis may indicate missing indexes, table locks, or excessive data volume. Check the Performance Monitor at /system/performance for details and index recommendations.`
      : `${_hourlySlowCount} queries exceeded the ${SLOW_QUERY_THRESHOLD_MS}ms threshold in the last hour. The most recent offender was \`${procedureName}\` at ${durationMs}ms.\n\nReview the Performance Monitor at /system/performance for the full list and apply recommended indexes.`;

    const sent = await notifyOwner({ title, content });
    if (sent) {
      console.log(`[PerfMonitor] Owner notified: ${title}`);
    }
  } catch (e: any) {
    console.warn(`[PerfMonitor] Failed to send notification: ${e.message}`);
  }
}

function enqueueSlowQueryLog(entry: typeof _slowQueryLogQueue[0]) {
  _slowQueryLogQueue.push(entry);

  // Batch flush: wait 1s to collect multiple slow queries, then flush all at once
  if (!_flushTimer) {
    _flushTimer = setTimeout(() => flushSlowQueryLogs(), 1000);
  }
}

async function flushSlowQueryLogs() {
  _flushTimer = null;
  if (_slowQueryLogQueue.length === 0) return;

  const batch = _slowQueryLogQueue.splice(0);

  try {
    const pool = await getPool();
    for (const entry of batch) {
      try {
        const request = pool.request();
        request.input('ProcedureName', sql.NVarChar(255), entry.procedureName);
        request.input('ParamsJson', sql.NVarChar(sql.MAX), entry.paramsJson);
        request.input('DurationMs', sql.Int, entry.durationMs);
        request.input('CallerContext', sql.NVarChar(500), entry.callerContext);
        request.input('RowCount', sql.Int, entry.rowCount);
        request.input('ErrorMessage', sql.NVarChar(sql.MAX), entry.errorMessage);
        request.input('IndexSuggestion', sql.NVarChar(sql.MAX), null);
        await request.execute('sp_LogSlowQuery');
      } catch (e: any) {
        // Non-blocking — log and continue
        console.warn(`[SlowQuery] Failed to log slow query for ${entry.procedureName}: ${e.message}`);
      }
    }
    if (batch.length > 0) {
      console.warn(`[SlowQuery] Logged ${batch.length} slow quer${batch.length === 1 ? 'y' : 'ies'}`);
    }
  } catch (e: any) {
    console.warn(`[SlowQuery] Flush failed: ${e.message}`);
    // Put entries back for next flush attempt
    _slowQueryLogQueue.unshift(...batch);
  }
}

// ═══════════════════════════════════════════════════════════════
// TYPE RESOLUTION & REQUEST BUILDING
// ═══════════════════════════════════════════════════════════════

export type SPPParam = {
  name: string;
  type: sql.ISqlTypeFactoryWithNoParams | sql.ISqlTypeFactoryWithLength | sql.ISqlTypeFactoryWithPrecisionScale | sql.ISqlTypeWithNoParams | string | any;
  value: any;
};

/**
 * Resolve a string type name (e.g. "Int", "NVarChar") to the correct mssql type object.
 */
function resolveType(type: any): any {
  if (typeof type !== 'string') return type;
  const map: Record<string, any> = {
    Int:        sql.Int,
    BigInt:     sql.BigInt,
    SmallInt:   sql.SmallInt,
    TinyInt:    sql.TinyInt,
    Bit:        sql.Bit,
    Float:      sql.Float,
    Real:       sql.Real,
    Decimal:    sql.Decimal,
    Numeric:    sql.Numeric,
    Money:      sql.Money,
    SmallMoney: sql.SmallMoney,
    VarChar:    sql.VarChar,
    NVarChar:   sql.NVarChar,
    Char:       sql.Char,
    NChar:      sql.NChar,
    Text:       sql.Text,
    NText:      sql.NText,
    DateTime:   sql.DateTime,
    DateTime2:  sql.DateTime2,
    Date:       sql.Date,
    Time:       sql.Time,
    UniqueIdentifier: sql.UniqueIdentifier,
    Xml:        sql.Xml,
    Binary:     sql.Binary,
    VarBinary:  sql.VarBinary,
  };
  return map[type] ?? sql.NVarChar;
}

function buildRequest(pool: sql.ConnectionPool, params: SPPParam[]): sql.Request {
  const request = pool.request();
  for (const param of params) {
    const resolvedType = resolveType(param.type);
    request.input(param.name, resolvedType, param.value ?? null);
  }
  return request;
}

/** Serialize params to JSON for slow query logging (sanitize sensitive data) */
function serializeParams(params: SPPParam[]): string | null {
  if (!params || params.length === 0) return null;
  try {
    const sanitized = params.map(p => ({
      name: p.name,
      value: p.name.toLowerCase().includes('password') || p.name.toLowerCase().includes('secret')
        ? '***'
        : (typeof p.value === 'object' && p.value !== null ? '[object]' : p.value),
    }));
    return JSON.stringify(sanitized);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// QUERY EXECUTION WITH TIMING & RETRY
// ═══════════════════════════════════════════════════════════════

/**
 * Execute with automatic retry on transient connection errors.
 * Includes query timing and slow query detection.
 */
async function execWithRetry<T>(
  fn: (pool: sql.ConnectionPool) => Promise<T>,
  procedureName: string,
  params: SPPParam[] = [],
  maxRetries = 3
): Promise<{ result: T; durationMs: number }> {
  let lastErr: Error | null = null;
  const startTime = performance.now();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const pool = await getPool();
      const result = await fn(pool);
      const durationMs = Math.round(performance.now() - startTime);

      // Track stats
      const isSlow = durationMs > SLOW_QUERY_THRESHOLD_MS;
      updateQueryStat(procedureName, durationMs, isSlow);

      // Log slow query to persistent table (non-blocking)
      if (isSlow) {
        console.warn(`[SlowQuery] ${procedureName} took ${durationMs}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`);
        _hourlySlowCount++;
        enqueueSlowQueryLog({
          procedureName,
          paramsJson: serializeParams(params),
          durationMs,
          callerContext: new Error().stack?.split('\n').slice(3, 5).join(' | ') || null,
          rowCount: Array.isArray(result) ? (result as any[]).length : null,
          errorMessage: null,
        });

        // Critical alert: query exceeded 5000ms
        if (durationMs > CRITICAL_THRESHOLD_MS) {
          sendCriticalSlowQueryAlert(procedureName, durationMs, 'critical_duration');
        }
        // Hourly threshold alert
        if (_hourlySlowCount === HOURLY_SLOW_THRESHOLD) {
          sendCriticalSlowQueryAlert(procedureName, durationMs, 'hourly_threshold');
        }
      }

      return { result, durationMs };
    } catch (err: any) {
      lastErr = err;
      if (isTransient(err)) {
        // Force pool recreation
        _pool = null;
        if (_keepAliveTimer) { clearInterval(_keepAliveTimer); _keepAliveTimer = null; }
        const backoff = attempt * 500;
        console.warn(`[SQLServer] Transient error (attempt ${attempt}/${maxRetries}), retrying in ${backoff}ms: ${err.message}`);
        await sleep(backoff);
      } else {
        // Non-transient error — log timing and throw
        const durationMs = Math.round(performance.now() - startTime);
        updateQueryStat(procedureName, durationMs, durationMs > SLOW_QUERY_THRESHOLD_MS);
        if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
          enqueueSlowQueryLog({
            procedureName,
            paramsJson: serializeParams(params),
            durationMs,
            callerContext: null,
            rowCount: null,
            errorMessage: err.message,
          });
        }
        throw err;
      }
    }
  }
  throw lastErr;
}

/**
 * Execute a stored procedure and return the first recordset.
 * This is the ONLY way to access the database in VodaLease Enterprise.
 * Includes server-side caching for read-heavy queries.
 */
export async function execSPP<T = Record<string, any>>(
  procedureName: string,
  params: SPPParam[] = []
): Promise<T[]> {
  // Check cache first for cacheable procedures
  const cacheStart = performance.now();
  const cached = queryCache.get<T[]>(procedureName, params);
  if (cached !== null) {
    const cacheMs = Math.round(performance.now() - cacheStart);
    if (cacheMs < 5) { // Only log periodically to avoid spam
      // Cache hit — sub-millisecond response
    }
    return cached;
  }

  const { result } = await execWithRetry(async (pool) => {
    const request = buildRequest(pool, params);
    const res = await request.execute(procedureName);
    return (res.recordset || []) as T[];
  }, procedureName, params);

  // Auto-invalidate related caches if this was a write procedure
  if (!queryCache.shouldCache(procedureName)) {
    queryCache.onWriteProcedure(procedureName);
  } else {
    // Store in cache (read procedures only)
    queryCache.set(procedureName, params, result);
  }

  return result;
}

/**
 * Execute a stored procedure and return ALL recordsets (for multi-result SPs).
 */
export async function execSPPMulti(
  procedureName: string,
  params: SPPParam[] = []
): Promise<sql.IRecordSet<Record<string, any>>[]> {
  const { result } = await execWithRetry(async (pool) => {
    const request = buildRequest(pool, params);
    const res = await request.execute(procedureName);
    return (Array.isArray(res.recordsets) ? res.recordsets : Object.values(res.recordsets)) as sql.IRecordSet<Record<string, any>>[];
  }, procedureName, params);
  return result;
}

/**
 * Execute a stored procedure and return the first row of the first recordset.
 */
export async function execSPPOne<T = Record<string, any>>(
  procedureName: string,
  params: SPPParam[] = []
): Promise<T | null> {
  const rows = await execSPP<T>(procedureName, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute raw SQL (DDL / batch statements). Use ONLY for migrations and setup.
 * Application logic MUST use stored procedures via execSPP.
 */
export async function execRaw(sql_text: string): Promise<void> {
  const { result } = await execWithRetry(async (pool) => {
    await pool.request().batch(sql_text);
  }, 'RAW_SQL', []);
  return result;
}

// Re-export sql types for convenience
export { sql };
