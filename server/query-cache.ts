/**
 * VodaLease Enterprise — Server-Side Query Cache
 * 
 * Eliminates redundant DB round-trips for read-heavy queries.
 * Uses TTL-based in-memory caching with automatic invalidation.
 * 
 * Strategy:
 *  - Cache GET/READ queries with configurable TTL
 *  - Auto-invalidate on WRITE operations to the same table
 *  - LRU eviction when cache exceeds max entries
 *  - Cache hit/miss stats for monitoring
 */

interface CacheEntry<T = any> {
  data: T;
  expiresAt: number;
  hitCount: number;
  createdAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: string;
}

const MAX_CACHE_ENTRIES = 200;
const DEFAULT_TTL_MS = 30_000; // 30 seconds default

// TTL per procedure (ms) — tuned for each query's freshness requirements
const PROCEDURE_TTL: Record<string, number> = {
  // Dashboard queries — 60s cache (data changes infrequently)
  'sp_GetLeaseRegister': 60_000,
  'sp_GetRenewalDueCount': 120_000,
  'sp_GetRenewalDueLeases': 120_000,
  'sp_GetErrorLog': 30_000,
  'sp_GetAuditLog': 30_000,
  'sp_GetSlowQueries': 15_000,
  'sp_GetSlowQueryStats': 15_000,
  'sp_GetIndexRecommendations': 300_000, // 5 min — DMVs change slowly
  // Lease detail queries — 30s cache
  'sp_GetLeaseById': 30_000,
  'sp_GetLeaseLesseeDetails': 30_000,
  'sp_GetContractVersions': 60_000,
  // Configuration queries — 5 min cache (rarely changes)
  'sp_GetAllGLCodeRules': 300_000,
  'sp_GetBusinessRules': 300_000,
  'sp_GetAllThresholds': 300_000,
  'sp_GetScreenRegistry': 300_000,
  // MIS/Dashboard — 2 min cache
  'sp_GetDashboardInsights': 120_000,
  'sp_GetMISLeasePortfolio': 120_000,
  'sp_GetMISExpiryTimeline': 120_000,
};

// Procedures that should NEVER be cached (write operations)
const NO_CACHE_PROCEDURES = new Set([
  'sp_WriteAuditLog',
  'sp_WriteErrorLog',
  'sp_LogSlowQuery',
  'sp_ResolveSlowQuery',
  'sp_PurgeSlowQueries',
  'sp_ApplyIndex',
  'sp_UpsertGLCodeRule',
  'sp_UpsertBusinessRule',
  'sp_CreateLease',
  'sp_UpdateLease',
  'sp_ApproveLease',
  'sp_HardDeleteLease',
  'lease.sp_HardDeleteLease',
  'sp_PostMonthlyEntry',
  'sp_GenerateInceptionJV',
  'sp_GenerateMonthlyJVs',
  'sp_GenerateRemeasurementJV',
  'sp_GeneratePeriodCloseJV',
  'sp_CalculateAmortisationAll',
]);

// Write procedure → tables it modifies (for auto-invalidation)
const WRITE_INVALIDATION: Record<string, string[]> = {
  'sp_CreateLease': ['lease.contracts'],
  'sp_UpdateLease': ['lease.contracts'],
  'sp_ApproveLease': ['lease.contracts'],
  'sp_HardDeleteLease': ['lease.contracts'],
  'lease.sp_HardDeleteLease': ['lease.contracts'],
  'sp_PostMonthlyEntry': ['lease.contracts'],
  'sp_GenerateInceptionJV': ['lease.contracts'],
  'sp_GenerateMonthlyJVs': ['lease.contracts'],
  'sp_CalculateAmortisationAll': ['lease.contracts'],
  'sp_UpsertGLCodeRule': ['compliance.gl_code_rules'],
  'sp_UpsertBusinessRule': ['compliance.business_rules'],
  'sp_WriteAuditLog': ['compliance.audit_log'],
  'sp_WriteErrorLog': ['compliance.error_log'],
};

// Table → procedure mapping for invalidation
const TABLE_INVALIDATION: Record<string, string[]> = {
  'lease.contracts': ['sp_GetLeaseRegister', 'sp_GetRenewalDueCount', 'sp_GetRenewalDueLeases', 'sp_GetLeaseById', 'sp_GetDashboardInsights', 'sp_GetMISLeasePortfolio'],
  'compliance.audit_log': ['sp_GetAuditLog'],
  'compliance.error_log': ['sp_GetErrorLog'],
  'compliance.gl_code_rules': ['sp_GetAllGLCodeRules'],
  'compliance.business_rules': ['sp_GetBusinessRules'],
};

class QueryCache {
  private cache = new Map<string, CacheEntry>();
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0, hitRate: '0%' };

  /**
   * Generate a cache key from procedure name and params
   */
  private makeKey(procedureName: string, params: any[]): string {
    const paramStr = params.map(p => `${p.name}=${p.value}`).join('|');
    return `${procedureName}::${paramStr}`;
  }

  /**
   * Check if a procedure should be cached
   */
  shouldCache(procedureName: string): boolean {
    return !NO_CACHE_PROCEDURES.has(procedureName);
  }

  /**
   * Get cached result if available and not expired
   */
  get<T>(procedureName: string, params: any[]): T | null {
    if (!this.shouldCache(procedureName)) return null;

    const key = this.makeKey(procedureName, params);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      // Expired — remove and miss
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.size = this.cache.size;
      this.updateHitRate();
      return null;
    }

    // Cache hit
    entry.hitCount++;
    this.stats.hits++;
    this.updateHitRate();
    return entry.data as T;
  }

  /**
   * Store result in cache
   */
  set<T>(procedureName: string, params: any[], data: T): void {
    if (!this.shouldCache(procedureName)) return;

    const key = this.makeKey(procedureName, params);
    const ttl = PROCEDURE_TTL[procedureName] || DEFAULT_TTL_MS;

    // LRU eviction if at capacity
    if (this.cache.size >= MAX_CACHE_ENTRIES && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      hitCount: 0,
      createdAt: Date.now(),
    });
    this.stats.size = this.cache.size;
  }

  /**
   * Called after a write procedure executes — auto-invalidates related read caches
   */
  onWriteProcedure(procedureName: string): void {
    const tables = WRITE_INVALIDATION[procedureName];
    if (tables) {
      for (const table of tables) {
        this.invalidateTable(table);
      }
    }
  }

  /**
   * Invalidate cache entries for a specific procedure
   */
  invalidateProcedure(procedureName: string): number {
    let count = 0;
    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      if (key.startsWith(procedureName + '::')) {
        this.cache.delete(key);
        count++;
      }
    }
    this.stats.size = this.cache.size;
    return count;
  }

  /**
   * Invalidate all cached queries related to a table
   */
  invalidateTable(tableName: string): number {
    const procedures = TABLE_INVALIDATION[tableName] || [];
    let count = 0;
    for (const proc of procedures) {
      count += this.invalidateProcedure(proc);
    }
    return count;
  }

  /**
   * Invalidate all cache entries (nuclear option)
   */
  invalidateAll(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { entries: Array<{ key: string; hitCount: number; ttlRemaining: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key: key.substring(0, 60),
        hitCount: entry.hitCount,
        ttlRemaining: Math.max(0, Math.round((entry.expiresAt - now) / 1000)),
      }))
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 20);

    return { ...this.stats, entries };
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? `${Math.round((this.stats.hits / total) * 100)}%` : '0%';
  }
}

// Singleton instance
export const queryCache = new QueryCache();
