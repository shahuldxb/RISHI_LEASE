/**
 * Migration: Add lease.lease_lessee_details table + SPs
 * Screen: VFLSNEWLS0002P001 — Lessee Details step in New Lease wizard
 */
import { getPool } from "../db-sqlserver";
async function run() {
  const pool = await getPool();
  const steps: { name: string; sql: string }[] = [

    // ── 1. Create lease.lease_lessee_details table ─────────────────────────
    {
      name: "Create lease.lease_lessee_details table",
      sql: `
        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = 'lease' AND TABLE_NAME = 'lease_lessee_details'
        )
        BEGIN
          CREATE TABLE lease.lease_lessee_details (
            lessee_detail_id  INT           IDENTITY(1,1) PRIMARY KEY,
            contract_id       INT           NOT NULL,
            lessee_type       NVARCHAR(20)  NOT NULL DEFAULT 'Staff',
            lessee_name       NVARCHAR(200) NOT NULL,
            staff_number      NVARCHAR(50)  NULL,
            employee_id       NVARCHAR(50)  NULL,
            grade             NVARCHAR(50)  NULL,
            position          NVARCHAR(100) NULL,
            department        NVARCHAR(100) NULL,
            place_of_work     NVARCHAR(200) NULL,
            contact_email     NVARCHAR(200) NULL,
            contact_phone     NVARCHAR(50)  NULL,
            created_at        DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
            updated_at        DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
            CONSTRAINT FK_LesseeDetails_Lease FOREIGN KEY (contract_id)
              REFERENCES lease.contracts(contract_id) ON DELETE CASCADE
          );
          CREATE INDEX IX_LesseeDetails_ContractId ON lease.lease_lessee_details(contract_id);
          PRINT 'Created lease.lease_lessee_details table';
        END
        ELSE
          PRINT 'lease.lease_lessee_details already exists — skipped';
      `,
    },

    // ── 2. sp_UpsertLeaseLesseeDetails ─────────────────────────────────────
    {
      name: "Create dbo.sp_UpsertLeaseLesseeDetails",
      sql: `
        IF OBJECT_ID('dbo.sp_UpsertLeaseLesseeDetails', 'P') IS NOT NULL
          DROP PROCEDURE dbo.sp_UpsertLeaseLesseeDetails;
      `,
    },
    {
      name: "Create dbo.sp_UpsertLeaseLesseeDetails body",
      sql: `
        CREATE PROCEDURE dbo.sp_UpsertLeaseLesseeDetails
          @contract_id    INT,
          @lessee_type    NVARCHAR(20),
          @lessee_name    NVARCHAR(200),
          @staff_number   NVARCHAR(50)  = NULL,
          @employee_id    NVARCHAR(50)  = NULL,
          @grade          NVARCHAR(50)  = NULL,
          @position       NVARCHAR(100) = NULL,
          @department     NVARCHAR(100) = NULL,
          @place_of_work  NVARCHAR(200) = NULL,
          @contact_email  NVARCHAR(200) = NULL,
          @contact_phone  NVARCHAR(50)  = NULL
        AS
        BEGIN
          SET NOCOUNT ON;
          IF EXISTS (SELECT 1 FROM lease.lease_lessee_details WHERE contract_id = @contract_id)
          BEGIN
            UPDATE lease.lease_lessee_details SET
              lessee_type   = @lessee_type,
              lessee_name   = @lessee_name,
              staff_number  = @staff_number,
              employee_id   = @employee_id,
              grade         = @grade,
              position      = @position,
              department    = @department,
              place_of_work = @place_of_work,
              contact_email = @contact_email,
              contact_phone = @contact_phone,
              updated_at    = GETUTCDATE()
            WHERE contract_id = @contract_id;
          END
          ELSE
          BEGIN
            INSERT INTO lease.lease_lessee_details
              (contract_id, lessee_type, lessee_name, staff_number, employee_id,
               grade, position, department, place_of_work, contact_email, contact_phone)
            VALUES
              (@contract_id, @lessee_type, @lessee_name, @staff_number, @employee_id,
               @grade, @position, @department, @place_of_work, @contact_email, @contact_phone);
          END
          SELECT
            lessee_detail_id, contract_id, lessee_type, lessee_name, staff_number,
            employee_id, grade, position, department, place_of_work,
            contact_email, contact_phone, created_at, updated_at
          FROM lease.lease_lessee_details
          WHERE contract_id = @contract_id;
        END
      `,
    },

    // ── 3. sp_GetLeaseLesseeDetails ────────────────────────────────────────
    {
      name: "Drop dbo.sp_GetLeaseLesseeDetails if exists",
      sql: `
        IF OBJECT_ID('dbo.sp_GetLeaseLesseeDetails', 'P') IS NOT NULL
          DROP PROCEDURE dbo.sp_GetLeaseLesseeDetails;
      `,
    },
    {
      name: "Create dbo.sp_GetLeaseLesseeDetails",
      sql: `
        CREATE PROCEDURE dbo.sp_GetLeaseLesseeDetails
          @contract_id INT
        AS
        BEGIN
          SET NOCOUNT ON;
          SELECT
            lessee_detail_id, contract_id, lessee_type, lessee_name, staff_number,
            employee_id, grade, position, department, place_of_work,
            contact_email, contact_phone, created_at, updated_at
          FROM lease.lease_lessee_details
          WHERE contract_id = @contract_id;
        END
      `,
    },
  ];

  for (const step of steps) {
    try {
      await pool.request().query(step.sql);
      console.log(`✅ ${step.name}`);
    } catch (err: any) {
      console.error(`❌ ${step.name}: ${err.message}`);
      throw err;
    }
  }
  console.log("\n✅ Migration complete: lease.lease_lessee_details + SPs");
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
