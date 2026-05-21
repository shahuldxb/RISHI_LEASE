/**
 * Migration: Create sub_asset_transactions table and stored procedures
 * Run once: npx tsx server/migrations/create_sub_asset_transactions.ts
 */
import { getPool, execRaw } from "../db-sqlserver";

async function run() {
  console.log("[Migration] Creating asset.sub_asset_transactions table...");

  // ── 1. Create table ──────────────────────────────────────────────────────
  await execRaw(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'asset' AND TABLE_NAME = 'sub_asset_transactions'
    )
    BEGIN
      CREATE TABLE asset.sub_asset_transactions (
        txn_id        BIGINT IDENTITY(1,1) PRIMARY KEY,
        action        VARCHAR(20)   NOT NULL,
        entity_type   VARCHAR(50)   NOT NULL,
        entity_id     INT           NULL,
        entity_code   NVARCHAR(50)  NULL,
        entity_name   NVARCHAR(200) NULL,
        before_json   NVARCHAR(MAX) NULL,
        after_json    NVARCHAR(MAX) NULL,
        changed_by    NVARCHAR(100) NOT NULL,
        changed_at    DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
        screen_id     VARCHAR(50)   NULL,
        ip_address    VARCHAR(50)   NULL,
        session_ref   NVARCHAR(100) NULL
      );
      PRINT 'Table asset.sub_asset_transactions created.';
    END
    ELSE
      PRINT 'Table asset.sub_asset_transactions already exists.';
  `);

  // ── 2. sp_LogSubAssetTransaction ─────────────────────────────────────────
  await execRaw(`
    IF OBJECT_ID('dbo.sp_LogSubAssetTransaction', 'P') IS NOT NULL
      DROP PROCEDURE dbo.sp_LogSubAssetTransaction;
  `);
  await execRaw(`
    CREATE PROCEDURE dbo.sp_LogSubAssetTransaction
      @Action       VARCHAR(20),
      @EntityType   VARCHAR(50),
      @EntityId     INT           = NULL,
      @EntityCode   NVARCHAR(50)  = NULL,
      @EntityName   NVARCHAR(200) = NULL,
      @BeforeJson   NVARCHAR(MAX) = NULL,
      @AfterJson    NVARCHAR(MAX) = NULL,
      @ChangedBy    NVARCHAR(100),
      @ScreenId     VARCHAR(50)   = NULL,
      @IpAddress    VARCHAR(50)   = NULL,
      @SessionRef   NVARCHAR(100) = NULL
    AS
    BEGIN
      SET NOCOUNT ON;
      INSERT INTO asset.sub_asset_transactions
        (action, entity_type, entity_id, entity_code, entity_name,
         before_json, after_json, changed_by, screen_id, ip_address, session_ref)
      VALUES
        (@Action, @EntityType, @EntityId, @EntityCode, @EntityName,
         @BeforeJson, @AfterJson, @ChangedBy, @ScreenId, @IpAddress, @SessionRef);

      SELECT SCOPE_IDENTITY() AS txn_id;
    END
  `);

  // ── 3. sp_GetSubAssetTransactions ────────────────────────────────────────
  await execRaw(`
    IF OBJECT_ID('dbo.sp_GetSubAssetTransactions', 'P') IS NOT NULL
      DROP PROCEDURE dbo.sp_GetSubAssetTransactions;
  `);
  await execRaw(`
    CREATE PROCEDURE dbo.sp_GetSubAssetTransactions
      @EntityId     INT           = NULL,
      @EntityType   VARCHAR(50)   = NULL,
      @Action       VARCHAR(20)   = NULL,
      @ChangedBy    NVARCHAR(100) = NULL,
      @DateFrom     DATETIME2     = NULL,
      @DateTo       DATETIME2     = NULL,
      @PageNumber   INT           = 1,
      @PageSize     INT           = 100
    AS
    BEGIN
      SET NOCOUNT ON;

      -- Total count
      SELECT COUNT(*) AS total_count
      FROM asset.sub_asset_transactions
      WHERE
        (@EntityId   IS NULL OR entity_id   = @EntityId)
        AND (@EntityType IS NULL OR entity_type = @EntityType)
        AND (@Action     IS NULL OR action      = @Action)
        AND (@ChangedBy  IS NULL OR changed_by LIKE '%' + @ChangedBy + '%')
        AND (@DateFrom   IS NULL OR changed_at >= @DateFrom)
        AND (@DateTo     IS NULL OR changed_at <= @DateTo);

      -- Paginated rows
      SELECT
        txn_id, action, entity_type, entity_id, entity_code, entity_name,
        before_json, after_json, changed_by, changed_at, screen_id, ip_address, session_ref
      FROM asset.sub_asset_transactions
      WHERE
        (@EntityId   IS NULL OR entity_id   = @EntityId)
        AND (@EntityType IS NULL OR entity_type = @EntityType)
        AND (@Action     IS NULL OR action      = @Action)
        AND (@ChangedBy  IS NULL OR changed_by LIKE '%' + @ChangedBy + '%')
        AND (@DateFrom   IS NULL OR changed_at >= @DateFrom)
        AND (@DateTo     IS NULL OR changed_at <= @DateTo)
      ORDER BY changed_at DESC
      OFFSET ((@PageNumber - 1) * @PageSize) ROWS
      FETCH NEXT @PageSize ROWS ONLY;
    END
  `);

  console.log("[Migration] Done — sp_LogSubAssetTransaction and sp_GetSubAssetTransactions created.");
  process.exit(0);
}

run().catch(e => { console.error("[Migration] FAILED:", e); process.exit(1); });
