import { execRaw } from "../db-sqlserver";

async function run() {
  console.log("Creating asset.lease_sub_assets table and stored procedures...");

  // ── 1. Create table ────────────────────────────────────────────────────────
  await execRaw(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'asset' AND TABLE_NAME = 'lease_sub_assets'
    )
    BEGIN
      CREATE TABLE asset.lease_sub_assets (
        lease_sub_asset_id  INT           IDENTITY(1,1) PRIMARY KEY,
        lease_id            NVARCHAR(50)  NOT NULL,
        lease_ref           NVARCHAR(100) NULL,
        asset_id            INT           NOT NULL,
        asset_code          NVARCHAR(50)  NOT NULL,
        set_name            NVARCHAR(200) NOT NULL,
        status              NVARCHAR(20)  NOT NULL DEFAULT 'Active'
                              CHECK (status IN ('Active','Cancelled','Returned','BackIn','Replaced')),
        status_date         DATE          NULL,
        reason              NVARCHAR(500) NULL,
        replaced_by_asset_id INT          NULL,
        replaced_by_code    NVARCHAR(50)  NULL,
        notes               NVARCHAR(1000) NULL,
        created_by          NVARCHAR(200) NOT NULL DEFAULT 'system',
        created_at          DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
        updated_by          NVARCHAR(200) NULL,
        updated_at          DATETIME2     NULL
      );
      PRINT 'Table asset.lease_sub_assets created.';
    END
    ELSE
      PRINT 'Table asset.lease_sub_assets already exists.';
  `);

  // ── 2. sp_AttachSubAssetToLease ───────────────────────────────────────────
  await execRaw(`
    IF OBJECT_ID('asset.sp_AttachSubAssetToLease', 'P') IS NOT NULL
      DROP PROCEDURE asset.sp_AttachSubAssetToLease;
  `);
  await execRaw(`
    CREATE PROCEDURE asset.sp_AttachSubAssetToLease
      @lease_id          NVARCHAR(50),
      @lease_ref         NVARCHAR(100),
      @asset_id          INT,
      @asset_code        NVARCHAR(50),
      @set_name          NVARCHAR(200),
      @tags_with_serials NVARCHAR(MAX) = NULL,
      @created_by        NVARCHAR(200)
    AS
    BEGIN
      SET NOCOUNT ON;
      -- Prevent duplicate active attachment on the same lease
      IF EXISTS (
        SELECT 1 FROM asset.lease_sub_assets
        WHERE lease_id = @lease_id AND asset_id = @asset_id AND status = 'Active'
      )
      BEGIN
        SELECT -1 AS lease_sub_asset_id, 'Already attached' AS message;
        RETURN;
      END

      INSERT INTO asset.lease_sub_assets
        (lease_id, lease_ref, asset_id, asset_code, set_name, tags_with_serials, status, status_date, created_by, created_at)
      VALUES
        (@lease_id, @lease_ref, @asset_id, @asset_code, @set_name, @tags_with_serials, 'Active', CAST(GETUTCDATE() AS DATE), @created_by, GETUTCDATE());

      SELECT SCOPE_IDENTITY() AS lease_sub_asset_id, 'OK' AS message;
    END
  `);

  // ── 3. sp_UpdateSubAssetStatus ────────────────────────────────────────────
  await execRaw(`
    IF OBJECT_ID('asset.sp_UpdateSubAssetStatus', 'P') IS NOT NULL
      DROP PROCEDURE asset.sp_UpdateSubAssetStatus;
  `);
  await execRaw(`
    CREATE PROCEDURE asset.sp_UpdateSubAssetStatus
      @lease_sub_asset_id   INT,
      @new_status           NVARCHAR(20),
      @status_date          DATE,
      @reason               NVARCHAR(500),
      @replaced_by_asset_id INT,
      @replaced_by_code     NVARCHAR(50),
      @notes                NVARCHAR(1000),
      @updated_by           NVARCHAR(200)
    AS
    BEGIN
      SET NOCOUNT ON;
      UPDATE asset.lease_sub_assets SET
        status              = @new_status,
        status_date         = @status_date,
        reason              = @reason,
        replaced_by_asset_id= @replaced_by_asset_id,
        replaced_by_code    = @replaced_by_code,
        notes               = @notes,
        updated_by          = @updated_by,
        updated_at          = GETUTCDATE()
      WHERE lease_sub_asset_id = @lease_sub_asset_id;

      SELECT @@ROWCOUNT AS rows_affected;
    END
  `);

  // ── 4. sp_GetLeaseSubAssets ───────────────────────────────────────────────
  await execRaw(`
    IF OBJECT_ID('asset.sp_GetLeaseSubAssets', 'P') IS NOT NULL
      DROP PROCEDURE asset.sp_GetLeaseSubAssets;
  `);
  await execRaw(`
    CREATE PROCEDURE asset.sp_GetLeaseSubAssets
      @lease_id NVARCHAR(50)
    AS
    BEGIN
      SET NOCOUNT ON;
      SELECT
        lsa.lease_sub_asset_id,
        lsa.lease_id,
        lsa.lease_ref,
        lsa.asset_id,
        lsa.asset_code,
        lsa.set_name,
        lsa.status,
        CONVERT(NVARCHAR(10), lsa.status_date, 120) AS status_date,
        lsa.reason,
        lsa.replaced_by_asset_id,
        lsa.replaced_by_code,
        lsa.notes,
        lsa.created_by,
        CONVERT(NVARCHAR(30), lsa.created_at, 120) AS created_at,
        lsa.updated_by,
        CONVERT(NVARCHAR(30), lsa.updated_at, 120) AS updated_at,
        -- Join back to get latest set name from asset.assets (SUB_ASSET_GROUP records)
        ISNULL(a.asset_name, lsa.set_name) AS current_set_name,
        a.tags AS set_tags
      FROM asset.lease_sub_assets lsa
      LEFT JOIN asset.assets a ON a.asset_id = lsa.asset_id
      WHERE lsa.lease_id = @lease_id
      ORDER BY lsa.created_at DESC;
    END
  `);

  // ── 5. sp_GetLeaseListForSubAsset ─────────────────────────────────────────
  await execRaw(`
    IF OBJECT_ID('asset.sp_GetLeaseListForSubAsset', 'P') IS NOT NULL
      DROP PROCEDURE asset.sp_GetLeaseListForSubAsset;
  `);
  await execRaw(`
    CREATE PROCEDURE asset.sp_GetLeaseListForSubAsset
    AS
    BEGIN
      SET NOCOUNT ON;
      -- Try to pull from the lease register table; fall back gracefully if not available
      IF OBJECT_ID('lease.lease_register', 'U') IS NOT NULL
      BEGIN
        SELECT TOP 200
          CAST(lease_id AS NVARCHAR(50)) AS lease_id,
          ISNULL(lease_ref, CAST(lease_id AS NVARCHAR(50))) AS lease_ref,
          ISNULL(asset_name, '') AS asset_name,
          ISNULL(lessor_name, '') AS lessor_name,
          ISNULL(status, 'Active') AS status
        FROM lease.lease_register
        WHERE status NOT IN ('Terminated','Expired')
        ORDER BY lease_id DESC;
      END
      ELSE
      BEGIN
        -- Return leases that already have sub-assets attached
        SELECT DISTINCT
          lease_id,
          ISNULL(lease_ref, lease_id) AS lease_ref,
          '' AS asset_name,
          '' AS lessor_name,
          'Active' AS status
        FROM asset.lease_sub_assets
        ORDER BY lease_id DESC;
      END
    END
  `);

  console.log("All lease_sub_assets objects created successfully.");
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
