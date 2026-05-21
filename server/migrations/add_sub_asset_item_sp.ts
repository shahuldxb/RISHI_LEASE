import { execRaw } from "../db-sqlserver";

async function run() {
  console.log("Creating asset.sp_AddSubAssetItem stored procedure...");

  // Drop if exists
  await execRaw(`
    IF OBJECT_ID('asset.sp_AddSubAssetItem', 'P') IS NOT NULL
      DROP PROCEDURE asset.sp_AddSubAssetItem;
  `);

  // Create the SP — appends a new ItemWithSerial JSON object to tags_with_serials
  await execRaw(`
    CREATE PROCEDURE asset.sp_AddSubAssetItem
      @lease_sub_asset_id  INT,
      @item_json           NVARCHAR(MAX),   -- single ItemWithSerial JSON object
      @updated_by          NVARCHAR(200) = 'system'
    AS
    BEGIN
      SET NOCOUNT ON;

      DECLARE @current_tags NVARCHAR(MAX);
      DECLARE @new_tags     NVARCHAR(MAX);

      -- Get current tags_with_serials
      SELECT @current_tags = tags_with_serials
      FROM asset.lease_sub_assets
      WHERE lease_sub_asset_id = @lease_sub_asset_id;

      IF @current_tags IS NULL OR LTRIM(RTRIM(@current_tags)) = '' OR LTRIM(RTRIM(@current_tags)) = 'null'
        SET @current_tags = '[]';

      -- Validate it is a JSON array
      IF ISJSON(@current_tags) = 0
        SET @current_tags = '[]';

      -- Append new item to the array
      -- Remove trailing ] and append the new item
      SET @new_tags = LEFT(@current_tags, LEN(@current_tags) - 1);
      IF @new_tags = '['
        SET @new_tags = '[' + @item_json + ']';
      ELSE
        SET @new_tags = @new_tags + ',' + @item_json + ']';

      -- Update the row
      UPDATE asset.lease_sub_assets
      SET
        tags_with_serials = @new_tags,
        updated_by        = @updated_by,
        updated_at        = GETUTCDATE()
      WHERE lease_sub_asset_id = @lease_sub_asset_id;

      SELECT
        lease_sub_asset_id,
        tags_with_serials,
        'OK' AS message
      FROM asset.lease_sub_assets
      WHERE lease_sub_asset_id = @lease_sub_asset_id;
    END
  `);

  console.log("asset.sp_AddSubAssetItem created successfully.");
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
