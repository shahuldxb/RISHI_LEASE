-- ============================================================
-- VodaLease Enterprise: Slow Query Monitoring Infrastructure
-- Creates: dbo.slow_queries table, sp_LogSlowQuery, sp_GetSlowQueries,
--          sp_GetIndexRecommendations, sp_ApplyIndexRecommendation
-- ============================================================

-- 1. Create the slow_queries persistent table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'slow_queries' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.slow_queries (
        id              INT IDENTITY(1,1) PRIMARY KEY,
        procedure_name  NVARCHAR(255) NOT NULL,
        params_json     NVARCHAR(MAX) NULL,
        duration_ms     INT NOT NULL,
        executed_at     DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        caller_context  NVARCHAR(500) NULL,
        row_count       INT NULL,
        error_message   NVARCHAR(MAX) NULL,
        index_suggestion NVARCHAR(MAX) NULL,
        resolved        BIT NOT NULL DEFAULT 0,
        resolved_at     DATETIME2 NULL,
        notes           NVARCHAR(MAX) NULL
    );

    -- Index for quick lookups by procedure name and duration
    CREATE NONCLUSTERED INDEX IX_slow_queries_proc_duration
        ON dbo.slow_queries (procedure_name, duration_ms DESC)
        INCLUDE (executed_at, row_count);

    -- Index for time-based queries
    CREATE NONCLUSTERED INDEX IX_slow_queries_executed_at
        ON dbo.slow_queries (executed_at DESC)
        INCLUDE (procedure_name, duration_ms);

    PRINT 'Created table dbo.slow_queries with indexes';
END
ELSE
    PRINT 'Table dbo.slow_queries already exists';
GO

-- 2. Stored Procedure: Log a slow query
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_LogSlowQuery')
    DROP PROCEDURE sp_LogSlowQuery;
GO

CREATE PROCEDURE sp_LogSlowQuery
    @ProcedureName   NVARCHAR(255),
    @ParamsJson      NVARCHAR(MAX) = NULL,
    @DurationMs      INT,
    @CallerContext   NVARCHAR(500) = NULL,
    @RowCount        INT = NULL,
    @ErrorMessage    NVARCHAR(MAX) = NULL,
    @IndexSuggestion NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.slow_queries (
        procedure_name, params_json, duration_ms, executed_at,
        caller_context, row_count, error_message, index_suggestion
    )
    VALUES (
        @ProcedureName, @ParamsJson, @DurationMs, GETUTCDATE(),
        @CallerContext, @RowCount, @ErrorMessage, @IndexSuggestion
    );

    -- Return the ID for reference
    SELECT SCOPE_IDENTITY() AS slow_query_id;
END
GO

-- 3. Stored Procedure: Get slow queries (with filtering)
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_GetSlowQueries')
    DROP PROCEDURE sp_GetSlowQueries;
GO

CREATE PROCEDURE sp_GetSlowQueries
    @TopN            INT = 50,
    @ProcedureName   NVARCHAR(255) = NULL,
    @MinDurationMs   INT = 500,
    @DaysBack        INT = 7,
    @UnresolvedOnly  BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@TopN)
        id,
        procedure_name,
        params_json,
        duration_ms,
        executed_at,
        caller_context,
        row_count,
        error_message,
        index_suggestion,
        resolved,
        resolved_at,
        notes
    FROM dbo.slow_queries
    WHERE duration_ms >= @MinDurationMs
      AND executed_at >= DATEADD(DAY, -@DaysBack, GETUTCDATE())
      AND (@ProcedureName IS NULL OR procedure_name LIKE '%' + @ProcedureName + '%')
      AND (@UnresolvedOnly = 0 OR resolved = 0)
    ORDER BY duration_ms DESC, executed_at DESC;
END
GO

-- 4. Stored Procedure: Get aggregated slow query stats
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_GetSlowQueryStats')
    DROP PROCEDURE sp_GetSlowQueryStats;
GO

CREATE PROCEDURE sp_GetSlowQueryStats
    @DaysBack INT = 7
AS
BEGIN
    SET NOCOUNT ON;

    -- Aggregated stats per procedure
    SELECT
        procedure_name,
        COUNT(*) AS occurrence_count,
        AVG(duration_ms) AS avg_duration_ms,
        MAX(duration_ms) AS max_duration_ms,
        MIN(duration_ms) AS min_duration_ms,
        SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END) AS error_count,
        MAX(executed_at) AS last_occurred
    FROM dbo.slow_queries
    WHERE executed_at >= DATEADD(DAY, -@DaysBack, GETUTCDATE())
    GROUP BY procedure_name
    ORDER BY occurrence_count DESC, avg_duration_ms DESC;

    -- Overall summary
    SELECT
        COUNT(*) AS total_slow_queries,
        AVG(duration_ms) AS overall_avg_ms,
        MAX(duration_ms) AS overall_max_ms,
        COUNT(DISTINCT procedure_name) AS unique_procedures,
        SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) AS resolved_count,
        SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) AS unresolved_count
    FROM dbo.slow_queries
    WHERE executed_at >= DATEADD(DAY, -@DaysBack, GETUTCDATE());
END
GO

-- 5. Stored Procedure: Get index recommendations from SQL Server DMVs
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_GetIndexRecommendations')
    DROP PROCEDURE sp_GetIndexRecommendations;
GO

CREATE PROCEDURE sp_GetIndexRecommendations
    @TopN INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    -- Missing index recommendations from SQL Server DMVs
    SELECT TOP (@TopN)
        OBJECT_NAME(mid.object_id) AS table_name,
        mid.equality_columns,
        mid.inequality_columns,
        mid.included_columns,
        migs.user_seeks,
        migs.user_scans,
        migs.avg_total_user_cost,
        migs.avg_user_impact,
        ROUND(migs.avg_total_user_cost * migs.avg_user_impact * (migs.user_seeks + migs.user_scans), 2) AS improvement_measure,
        'CREATE NONCLUSTERED INDEX [IX_' + OBJECT_NAME(mid.object_id) + '_perf_' + CAST(mid.index_handle AS VARCHAR(10)) + '] ON ' +
            mid.statement + ' (' +
            ISNULL(mid.equality_columns, '') +
            CASE WHEN mid.equality_columns IS NOT NULL AND mid.inequality_columns IS NOT NULL THEN ', ' ELSE '' END +
            ISNULL(mid.inequality_columns, '') +
            ')' +
            ISNULL(' INCLUDE (' + mid.included_columns + ')', '') AS create_index_statement
    FROM sys.dm_db_missing_index_groups mig
    INNER JOIN sys.dm_db_missing_index_group_stats migs ON mig.index_group_handle = migs.group_handle
    INNER JOIN sys.dm_db_missing_index_details mid ON mig.index_handle = mid.index_handle
    WHERE mid.database_id = DB_ID()
    ORDER BY improvement_measure DESC;
END
GO

-- 6. Stored Procedure: Mark slow query as resolved
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_ResolveSlowQuery')
    DROP PROCEDURE sp_ResolveSlowQuery;
GO

CREATE PROCEDURE sp_ResolveSlowQuery
    @SlowQueryId INT,
    @Notes       NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.slow_queries
    SET resolved = 1,
        resolved_at = GETUTCDATE(),
        notes = ISNULL(@Notes, notes)
    WHERE id = @SlowQueryId;

    SELECT @@ROWCOUNT AS rows_affected;
END
GO

-- 7. Stored Procedure: Purge old slow query records (retention policy)
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_PurgeSlowQueries')
    DROP PROCEDURE sp_PurgeSlowQueries;
GO

CREATE PROCEDURE sp_PurgeSlowQueries
    @RetentionDays INT = 90
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.slow_queries
    WHERE executed_at < DATEADD(DAY, -@RetentionDays, GETUTCDATE())
      AND resolved = 1;

    SELECT @@ROWCOUNT AS rows_purged;
END
GO

PRINT 'All slow query monitoring stored procedures created successfully.';
GO
