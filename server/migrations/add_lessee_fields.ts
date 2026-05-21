/**
 * Migration: Add lessee fields to lessor.lessors table
 * Adds: lessee_name, lessee_type, staff_number, grade, position,
 *       place_of_work, department, employee_id, contact_email, contact_phone
 * Also recreates sp_GetLessors, sp_UpsertLessor, sp_GetLessorDetail
 * to include the new lessee fields.
 */
import { execRaw, execSPP } from "../db-sqlserver";

async function run() {
  // ── 1. ALTER lessor.lessors — add lessee columns ──────────────────────────
  console.log("Step 1: Adding lessee columns to lessor.lessors...");
  await execRaw(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('lessor.lessors') AND name = 'lessee_type')
      ALTER TABLE lessor.lessors ADD lessee_type NVARCHAR(30) NULL;
  `);
  await execRaw(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('lessor.lessors') AND name = 'lessee_name')
      ALTER TABLE lessor.lessors ADD lessee_name NVARCHAR(200) NULL;
  `);
  await execRaw(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('lessor.lessors') AND name = 'staff_number')
      ALTER TABLE lessor.lessors ADD staff_number NVARCHAR(50) NULL;
  `);
  await execRaw(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('lessor.lessors') AND name = 'grade')
      ALTER TABLE lessor.lessors ADD grade NVARCHAR(50) NULL;
  `);
  await execRaw(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('lessor.lessors') AND name = 'position')
      ALTER TABLE lessor.lessors ADD position NVARCHAR(100) NULL;
  `);
  await execRaw(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('lessor.lessors') AND name = 'place_of_work')
      ALTER TABLE lessor.lessors ADD place_of_work NVARCHAR(200) NULL;
  `);
  await execRaw(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('lessor.lessors') AND name = 'department')
      ALTER TABLE lessor.lessors ADD department NVARCHAR(100) NULL;
  `);
  await execRaw(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('lessor.lessors') AND name = 'employee_id')
      ALTER TABLE lessor.lessors ADD employee_id NVARCHAR(50) NULL;
  `);
  await execRaw(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('lessor.lessors') AND name = 'lessee_contact_email')
      ALTER TABLE lessor.lessors ADD lessee_contact_email NVARCHAR(200) NULL;
  `);
  await execRaw(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('lessor.lessors') AND name = 'lessee_contact_phone')
      ALTER TABLE lessor.lessors ADD lessee_contact_phone NVARCHAR(50) NULL;
  `);
  console.log("Step 1 done.");

  // ── 2. Recreate sp_GetLessors ─────────────────────────────────────────────
  console.log("Step 2: Recreating sp_GetLessors...");
  await execRaw(`
    IF OBJECT_ID('dbo.sp_GetLessors', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetLessors;
  `);
  await execRaw(`
    CREATE PROCEDURE dbo.sp_GetLessors
      @SearchTerm  NVARCHAR(200) = NULL,
      @Status      VARCHAR(20)   = NULL,
      @LessorType  VARCHAR(30)   = NULL,
      @Country     VARCHAR(3)    = NULL,
      @PageNumber  INT           = 1,
      @PageSize    INT           = 20
    AS
    BEGIN
      SET NOCOUNT ON;
      DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
      SELECT
        l.lessor_id, l.lessor_code, l.lessor_name, l.lessor_type,
        l.registration_no, l.tax_id, l.country, l.city,
        l.address_line1, l.address_line2, l.postal_code, l.website,
        l.credit_rating, l.payment_terms, l.preferred_currency,
        l.status, l.blacklist_reason, l.total_leases, l.total_liability,
        l.created_at, l.updated_at,
        -- Lessee fields
        l.lessee_type, l.lessee_name, l.staff_number, l.grade,
        l.position, l.place_of_work, l.department, l.employee_id,
        l.lessee_contact_email, l.lessee_contact_phone,
        COUNT(*) OVER() AS total_rows
      FROM lessor.lessors l
      WHERE
        (@SearchTerm IS NULL OR l.lessor_name LIKE '%' + @SearchTerm + '%'
            OR l.lessor_code LIKE '%' + @SearchTerm + '%'
            OR l.registration_no LIKE '%' + @SearchTerm + '%'
            OR l.lessee_name LIKE '%' + @SearchTerm + '%'
            OR l.staff_number LIKE '%' + @SearchTerm + '%')
        AND (@Status IS NULL OR l.status = @Status)
        AND (@LessorType IS NULL OR l.lessor_type = @LessorType)
        AND (@Country IS NULL OR l.country = @Country)
      ORDER BY l.lessor_name
      OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
    END
  `);
  console.log("Step 2 done.");

  // ── 3. Recreate sp_GetLessorDetail ────────────────────────────────────────
  console.log("Step 3: Recreating sp_GetLessorDetail...");
  await execRaw(`
    IF OBJECT_ID('dbo.sp_GetLessorDetail', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetLessorDetail;
  `);
  await execRaw(`
    CREATE PROCEDURE dbo.sp_GetLessorDetail
      @LessorId INT
    AS
    BEGIN
      SET NOCOUNT ON;
      -- Main record (includes new lessee fields)
      SELECT
        l.lessor_id, l.lessor_code, l.lessor_name, l.lessor_type,
        l.registration_no, l.tax_id, l.country, l.city,
        l.address_line1, l.address_line2, l.postal_code, l.website,
        l.credit_rating, l.payment_terms, l.preferred_currency,
        l.status, l.blacklist_reason, l.total_leases, l.total_liability,
        l.created_by, l.created_at, l.updated_by, l.updated_at, l.screen_id,
        l.lessee_type, l.lessee_name, l.staff_number, l.grade,
        l.position, l.place_of_work, l.department, l.employee_id,
        l.lessee_contact_email, l.lessee_contact_phone
      FROM lessor.lessors l
      WHERE l.lessor_id = @LessorId;
      -- Contacts
      SELECT * FROM lessor.lessor_contacts WHERE lessor_id = @LessorId ORDER BY is_primary DESC, contact_type;
      -- Bank accounts
      SELECT * FROM lessor.lessor_bank_accounts WHERE lessor_id = @LessorId ORDER BY is_primary DESC;
      -- Documents
      SELECT * FROM lessor.lessor_documents WHERE lessor_id = @LessorId ORDER BY uploaded_at DESC;
      -- Notes
      SELECT * FROM lessor.lessor_notes WHERE lessor_id = @LessorId ORDER BY created_at DESC;
      -- Assets currently leased from this lessor
      SELECT
        a.asset_id, a.asset_code, a.asset_name, a.asset_type,
        a.city, a.status, a.floor_area_sqm, a.condition_rating,
        a.estimated_market_value
      FROM asset.assets a
      WHERE a.current_lessor_id = @LessorId
      ORDER BY a.asset_name;
    END
  `);
  console.log("Step 3 done.");

  // ── 4. Recreate sp_UpsertLessor ───────────────────────────────────────────
  console.log("Step 4: Recreating sp_UpsertLessor...");
  await execRaw(`
    IF OBJECT_ID('dbo.sp_UpsertLessor', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_UpsertLessor;
  `);
  await execRaw(`
    CREATE PROCEDURE dbo.sp_UpsertLessor
      @LessorId             INT           = NULL,
      @LessorName           NVARCHAR(200),
      @LessorType           VARCHAR(30)   = 'Individual',
      @RegistrationNo       NVARCHAR(100) = NULL,
      @TaxId                NVARCHAR(50)  = NULL,
      @Country              VARCHAR(3)    = 'AE',
      @City                 NVARCHAR(100) = NULL,
      @AddressLine1         NVARCHAR(300) = NULL,
      @AddressLine2         NVARCHAR(300) = NULL,
      @PostalCode           VARCHAR(20)   = NULL,
      @Website              NVARCHAR(200) = NULL,
      @CreditRating         VARCHAR(10)   = NULL,
      @PaymentTerms         INT           = 30,
      @PreferredCurrency    VARCHAR(3)    = 'AED',
      @Status               VARCHAR(20)   = 'Active',
      @BlacklistReason      NVARCHAR(500) = NULL,
      @CreatedBy            NVARCHAR(100) = NULL,
      @ScreenId             VARCHAR(30)   = NULL,
      -- Lessee fields
      @LesseeType           NVARCHAR(30)  = NULL,
      @LesseeName           NVARCHAR(200) = NULL,
      @StaffNumber          NVARCHAR(50)  = NULL,
      @Grade                NVARCHAR(50)  = NULL,
      @Position             NVARCHAR(100) = NULL,
      @PlaceOfWork          NVARCHAR(200) = NULL,
      @Department           NVARCHAR(100) = NULL,
      @EmployeeId           NVARCHAR(50)  = NULL,
      @LesseeContactEmail   NVARCHAR(200) = NULL,
      @LesseeContactPhone   NVARCHAR(50)  = NULL
    AS
    BEGIN
      SET NOCOUNT ON;
      IF @LessorId IS NULL OR @LessorId = 0
      BEGIN
        DECLARE @NewCode VARCHAR(20);
        DECLARE @NextId INT = (SELECT ISNULL(MAX(lessor_id), 0) + 1 FROM lessor.lessors);
        SET @NewCode = 'LSR-' + RIGHT('00000' + CAST(@NextId AS VARCHAR), 5);
        INSERT INTO lessor.lessors (
          lessor_code, lessor_name, lessor_type, registration_no, tax_id,
          country, city, address_line1, address_line2, postal_code,
          website, credit_rating, payment_terms, preferred_currency,
          status, blacklist_reason, created_by, screen_id,
          lessee_type, lessee_name, staff_number, grade, position,
          place_of_work, department, employee_id,
          lessee_contact_email, lessee_contact_phone
        ) VALUES (
          @NewCode, @LessorName, @LessorType, @RegistrationNo, @TaxId,
          @Country, @City, @AddressLine1, @AddressLine2, @PostalCode,
          @Website, @CreditRating, @PaymentTerms, @PreferredCurrency,
          @Status, @BlacklistReason, @CreatedBy, @ScreenId,
          @LesseeType, @LesseeName, @StaffNumber, @Grade, @Position,
          @PlaceOfWork, @Department, @EmployeeId,
          @LesseeContactEmail, @LesseeContactPhone
        );
        SELECT SCOPE_IDENTITY() AS lessor_id, @NewCode AS lessor_code;
      END
      ELSE
      BEGIN
        UPDATE lessor.lessors SET
          lessor_name = @LessorName, lessor_type = @LessorType,
          registration_no = @RegistrationNo, tax_id = @TaxId,
          country = @Country, city = @City,
          address_line1 = @AddressLine1, address_line2 = @AddressLine2,
          postal_code = @PostalCode, website = @Website,
          credit_rating = @CreditRating, payment_terms = @PaymentTerms,
          preferred_currency = @PreferredCurrency, status = @Status,
          blacklist_reason = @BlacklistReason,
          updated_by = @CreatedBy, updated_at = GETUTCDATE(), screen_id = @ScreenId,
          lessee_type = @LesseeType, lessee_name = @LesseeName,
          staff_number = @StaffNumber, grade = @Grade, position = @Position,
          place_of_work = @PlaceOfWork, department = @Department,
          employee_id = @EmployeeId,
          lessee_contact_email = @LesseeContactEmail,
          lessee_contact_phone = @LesseeContactPhone
        WHERE lessor_id = @LessorId;
        SELECT @LessorId AS lessor_id;
      END
    END
  `);
  console.log("Step 4 done.");

  // ── 5. Add owner column to asset.lease_sub_assets ─────────────────────────
  console.log("Step 5: Adding owner column to asset.lease_sub_assets...");
  await execRaw(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('asset.lease_sub_assets') AND name = 'owner')
      ALTER TABLE asset.lease_sub_assets ADD owner NVARCHAR(255) NULL;
  `);
  console.log("Step 5 done.");

  // ── 6. Recreate sp_AttachSubAssetToLease (add @lessee_name → owner) ───────
  console.log("Step 6: Recreating sp_AttachSubAssetToLease...");
  await execRaw(`
    IF OBJECT_ID('asset.sp_AttachSubAssetToLease', 'P') IS NOT NULL
      DROP PROCEDURE asset.sp_AttachSubAssetToLease;
  `);
  await execRaw(`
    CREATE PROCEDURE asset.sp_AttachSubAssetToLease
      @lease_id          NVARCHAR(50),
      @lease_ref         NVARCHAR(100) = NULL,
      @asset_id          INT,
      @asset_code        NVARCHAR(50),
      @set_name          NVARCHAR(200) = NULL,
      @created_by        NVARCHAR(100) = NULL,
      @tags_with_serials NVARCHAR(MAX) = NULL,
      @lessee_name       NVARCHAR(255) = NULL
    AS
    BEGIN
      SET NOCOUNT ON;
      -- Prevent exact duplicate (same lease + asset + set_name)
      IF EXISTS (
        SELECT 1 FROM asset.lease_sub_assets
        WHERE lease_id = @lease_id AND asset_id = @asset_id
          AND (set_name = @set_name OR (set_name IS NULL AND @set_name IS NULL))
          AND status NOT IN ('Returned','WriteOff','Condemned')
      )
      BEGIN
        SELECT -1 AS lease_sub_asset_id, 'Already attached' AS message;
        RETURN;
      END
      INSERT INTO asset.lease_sub_assets
        (lease_id, lease_ref, asset_id, asset_code, set_name, status, status_date, created_by, created_at, tags_with_serials, owner)
      VALUES
        (@lease_id, @lease_ref, @asset_id, @asset_code, @set_name, 'Active', GETUTCDATE(), @created_by, GETUTCDATE(), @tags_with_serials, @lessee_name);
      SELECT SCOPE_IDENTITY() AS lease_sub_asset_id, 'OK' AS message;
    END
  `);
  console.log("Step 6 done.");

  // ── 7. Recreate sp_UpdateSubAssetStatus (set owner on Returned/BackIn) ────
  console.log("Step 7: Recreating sp_UpdateSubAssetStatus...");
  await execRaw(`
    IF OBJECT_ID('asset.sp_UpdateSubAssetStatus', 'P') IS NOT NULL
      DROP PROCEDURE asset.sp_UpdateSubAssetStatus;
  `);
  await execRaw(`
    CREATE PROCEDURE asset.sp_UpdateSubAssetStatus
      @lease_sub_asset_id INT,
      @new_status         NVARCHAR(50),
      @reason             NVARCHAR(500)  = NULL,
      @notes              NVARCHAR(1000) = NULL,
      @replaced_by_asset_id INT          = NULL,
      @updated_by         NVARCHAR(100)  = NULL,
      @lessor_name        NVARCHAR(255)  = NULL,
      @lessee_name        NVARCHAR(255)  = NULL
    AS
    BEGIN
      SET NOCOUNT ON;
      DECLARE @owner NVARCHAR(255) = NULL;
      IF @new_status = 'Returned'
        SET @owner = @lessor_name;
      ELSE IF @new_status = 'BackIn'
        SET @owner = @lessee_name;
      UPDATE asset.lease_sub_assets SET
        status               = @new_status,
        status_date          = GETUTCDATE(),
        reason               = @reason,
        notes                = @notes,
        replaced_by_asset_id = CASE WHEN @replaced_by_asset_id IS NOT NULL THEN @replaced_by_asset_id ELSE replaced_by_asset_id END,
        updated_at           = GETUTCDATE(),
        owner                = CASE WHEN @owner IS NOT NULL THEN @owner ELSE owner END
      WHERE lease_sub_asset_id = @lease_sub_asset_id;
      SELECT @lease_sub_asset_id AS lease_sub_asset_id, @new_status AS new_status, 'OK' AS message;
    END
  `);
  console.log("Step 7 done.");

  // ── 8. Recreate sp_GetLeaseSubAssets (return owner column) ────────────────
  console.log("Step 8: Recreating sp_GetLeaseSubAssets...");
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
        ISNULL(c.contract_ref, lsa.lease_id) AS lease_ref,
        lsa.asset_id,
        a.asset_code,
        ISNULL(lsa.set_name, a.asset_name) AS set_name,
        lsa.status,
        CONVERT(NVARCHAR(20), lsa.status_date, 23) AS status_date,
        lsa.reason,
        lsa.replaced_by_asset_id,
        ra.asset_code AS replaced_by_code,
        lsa.notes,
        lsa.created_by,
        CONVERT(NVARCHAR(20), lsa.created_at, 23) AS created_at,
        lsa.updated_at,
        a.tags AS set_tags,
        lsa.tags_with_serials,
        lsa.owner
      FROM asset.lease_sub_assets lsa
      INNER JOIN asset.assets a ON lsa.asset_id = a.asset_id
      LEFT JOIN asset.assets ra ON lsa.replaced_by_asset_id = ra.asset_id
      LEFT JOIN lease.contracts c ON TRY_CAST(lsa.lease_id AS INT) = c.contract_id
      WHERE lsa.lease_id = @lease_id
      ORDER BY lsa.created_at DESC;
    END
  `);
  console.log("Step 8 done.");

  // ── 9. Recreate sp_GetLeaseListForSubAsset (return lessor_name) ────────────
  console.log("Step 9: Recreating sp_GetLeaseListForSubAsset...");
  await execRaw(`
    IF OBJECT_ID('asset.sp_GetLeaseListForSubAsset', 'P') IS NOT NULL
      DROP PROCEDURE asset.sp_GetLeaseListForSubAsset;
  `);
  await execRaw(`
    CREATE PROCEDURE asset.sp_GetLeaseListForSubAsset
    AS
    BEGIN
      SET NOCOUNT ON;
      SELECT TOP 200
        CAST(c.contract_id AS NVARCHAR(50)) AS lease_id,
        ISNULL(c.contract_ref, CAST(c.contract_id AS NVARCHAR(50))) AS lease_ref,
        ISNULL(c.asset_description, '') AS asset_name,
        ISNULL(l.legal_name, '') AS lessor_name,
        ISNULL(c.status, 'Active') AS status
      FROM lease.contracts c
      LEFT JOIN lease.lessors l ON c.lessor_id = l.lessor_id
      WHERE c.status NOT IN ('Terminated','Expired')
      ORDER BY c.contract_id DESC;
    END
  `);
  console.log("Step 9 done.");

  console.log("All migrations completed successfully.");
  process.exit(0);
}
run().catch(e => { console.error("Migration failed:", e); process.exit(1); });
