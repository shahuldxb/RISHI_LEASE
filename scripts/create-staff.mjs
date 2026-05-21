/**
 * Creates hr.staff table and seeds with Vodafone Qatar employees
 */
import sql from "mssql";
import dotenv from "dotenv";
dotenv.config();

const cfg = {
  server: process.env.MSSQL_HOST,
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  port: parseInt(process.env.MSSQL_PORT || "1433"),
  options: { encrypt: true, trustServerCertificate: true },
  pool: { max: 3, min: 0, idleTimeoutMillis: 10000 },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

async function run() {
  const pool = await sql.connect(cfg);

  // Create schema
  await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'hr') EXEC('CREATE SCHEMA hr')`);
  console.log("Schema hr ready");

  // Create table
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='hr' AND TABLE_NAME='staff')
    CREATE TABLE hr.staff (
      staff_id        INT IDENTITY(1,1) PRIMARY KEY,
      staff_number    VARCHAR(30)   NOT NULL UNIQUE,
      full_name       NVARCHAR(200) NOT NULL,
      designation     NVARCHAR(200) NULL,
      department      NVARCHAR(200) NULL,
      grade           VARCHAR(20)   NULL,
      position        NVARCHAR(200) NULL,
      place_of_work   NVARCHAR(200) NULL,
      email           VARCHAR(200)  NULL,
      phone           VARCHAR(50)   NULL,
      entity          NVARCHAR(200) NULL,
      status          VARCHAR(20)   NOT NULL DEFAULT 'Active',
      created_at      DATETIME2     NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log("Table hr.staff ready");

  // Seed data — Vodafone Qatar employees
  const staff = [
    { num: "VQ-EMP-00101", name: "Mohammed Al-Thani",       desig: "Senior Manager — Real Estate",      dept: "Corporate Real Estate",   grade: "M3", pos: "Senior Manager",       work: "Vodafone Qatar HQ, West Bay, Doha",          email: "m.althani@vodafone.qa",       phone: "+974 5511 2201", entity: "Vodafone Qatar P.Q.S.C." },
    { num: "VQ-EMP-00102", name: "Fatima Al-Kuwari",        desig: "Fleet Manager",                      dept: "Fleet & Logistics",        grade: "M2", pos: "Fleet Manager",        work: "Vodafone Qatar Operations Centre, Doha",     email: "f.alkuwari@vodafone.qa",      phone: "+974 5511 2202", entity: "Vodafone Qatar P.Q.S.C." },
    { num: "VQ-EMP-00103", name: "Ahmed Al-Subaie",         desig: "Finance Director — Leasing",         dept: "Finance",                  grade: "D1", pos: "Finance Director",     work: "Vodafone Qatar HQ, West Bay, Doha",          email: "a.alsubaie@vodafone.qa",      phone: "+974 5511 2203", entity: "Vodafone Qatar P.Q.S.C." },
    { num: "VQ-EMP-00104", name: "Sara Al-Mannai",          desig: "Lease Administrator",                dept: "Corporate Real Estate",    grade: "P2", pos: "Administrator",        work: "Vodafone Qatar HQ, West Bay, Doha",          email: "s.almannai@vodafone.qa",      phone: "+974 5511 2204", entity: "Vodafone Qatar P.Q.S.C." },
    { num: "VQ-EMP-00105", name: "Khalid Al-Emadi",         desig: "Head of Facilities",                 dept: "Facilities Management",    grade: "M4", pos: "Head of Facilities",   work: "Vodafone Qatar Tech Park, Education City",   email: "k.alemadi@vodafone.qa",       phone: "+974 5511 2205", entity: "Vodafone Qatar P.Q.S.C." },
    { num: "VQ-EMP-00106", name: "Noura Al-Ansari",         desig: "Legal Counsel — Contracts",          dept: "Legal",                    grade: "M3", pos: "Legal Counsel",        work: "Vodafone Qatar HQ, West Bay, Doha",          email: "n.alansari@vodafone.qa",      phone: "+974 5511 2206", entity: "Vodafone Qatar P.Q.S.C." },
    { num: "VQ-EMP-00107", name: "Hamad Al-Hajri",          desig: "IT Infrastructure Manager",          dept: "IT",                       grade: "M2", pos: "IT Manager",           work: "Vodafone Qatar Data Centre, Industrial Area", email: "h.alhajri@vodafone.qa",       phone: "+974 5511 2207", entity: "Vodafone Qatar P.Q.S.C." },
    { num: "VQ-BS-00201",  name: "Tariq Al-Fardan",         desig: "Business Solutions Director",        dept: "Business Solutions",       grade: "D1", pos: "Director",             work: "Vodafone Business Hub, C-Ring Road, Doha",   email: "t.alfardan@vfbusiness.qa",    phone: "+974 5522 3301", entity: "Vodafone Qatar Business Solutions" },
    { num: "VQ-BS-00202",  name: "Maryam Al-Naimi",         desig: "Account Manager — Enterprise",       dept: "Enterprise Sales",         grade: "P3", pos: "Account Manager",     work: "Vodafone Business Hub, C-Ring Road, Doha",   email: "m.alnaimi@vfbusiness.qa",     phone: "+974 5522 3302", entity: "Vodafone Qatar Business Solutions" },
    { num: "VQ-RT-00301",  name: "Jassim Al-Rumaihi",       desig: "Retail Operations Manager",          dept: "Retail",                   grade: "M2", pos: "Retail Manager",      work: "Vodafone Retail HQ, Landmark Mall, Doha",    email: "j.alrumaihi@vfretail.qa",     phone: "+974 5533 4401", entity: "Vodafone Qatar Retail" },
    { num: "VQ-RT-00302",  name: "Aisha Al-Qahtani",        desig: "Store Manager — City Centre",        dept: "Retail",                   grade: "P2", pos: "Store Manager",       work: "City Centre Mall, Doha",                     email: "a.alqahtani@vfretail.qa",     phone: "+974 5533 4402", entity: "Vodafone Qatar Retail" },
    { num: "VQ-INF-00401", name: "Omar Al-Khulaifi",        desig: "Infrastructure Director",            dept: "Network Infrastructure",   grade: "D1", pos: "Director",            work: "Vodafone Qatar Tower, Lusail City",           email: "o.alkhulaifi@vfinfra.qa",     phone: "+974 5544 5501", entity: "Vodafone Qatar Infrastructure Services" },
    { num: "VQ-INF-00402", name: "Reem Al-Mohannadi",       desig: "Tower Lease Manager",                dept: "Network Infrastructure",   grade: "M2", pos: "Lease Manager",       work: "Vodafone Qatar Tower, Lusail City",           email: "r.almohannadi@vfinfra.qa",    phone: "+974 5544 5502", entity: "Vodafone Qatar Infrastructure Services" },
    { num: "VQ-INT-00501", name: "David Thompson",          desig: "International Leasing Manager",      dept: "International Operations", grade: "M3", pos: "Leasing Manager",     work: "Vodafone International, The Pearl, Doha",    email: "d.thompson@vfinternational.qa", phone: "+974 5555 6601", entity: "Vodafone International Holdings" },
    { num: "VQ-INT-00502", name: "Elena Papadopoulos",      desig: "Treasury & Lease Accounting",        dept: "Finance",                  grade: "M2", pos: "Treasury Manager",    work: "Vodafone International, The Pearl, Doha",    email: "e.papadopoulos@vfinternational.qa", phone: "+974 5555 6602", entity: "Vodafone International Holdings" },
  ];

  for (const s of staff) {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM hr.staff WHERE staff_number = '${s.num}')
      INSERT INTO hr.staff (staff_number, full_name, designation, department, grade, position, place_of_work, email, phone, entity, status)
      VALUES (N'${s.num}', N'${s.name}', N'${s.desig}', N'${s.dept}', N'${s.grade}', N'${s.pos}', N'${s.work}', N'${s.email}', N'${s.phone}', N'${s.entity}', 'Active')
    `);
    console.log(`  Seeded: ${s.num} — ${s.name}`);
  }

  // Create stored procedure for dropdown
  await pool.request().query(`
    IF OBJECT_ID('hr.sp_GetStaffDropdown', 'P') IS NOT NULL DROP PROCEDURE hr.sp_GetStaffDropdown
  `);
  await pool.request().query(`
    CREATE PROCEDURE hr.sp_GetStaffDropdown
      @SearchTerm NVARCHAR(200) = NULL
    AS
    BEGIN
      SET NOCOUNT ON;
      SELECT
        staff_id,
        staff_number,
        full_name,
        designation,
        department,
        grade,
        position,
        place_of_work,
        email,
        phone,
        entity,
        status
      FROM hr.staff
      WHERE status = 'Active'
        AND (@SearchTerm IS NULL OR full_name LIKE '%' + @SearchTerm + '%' OR staff_number LIKE '%' + @SearchTerm + '%')
      ORDER BY entity, full_name;
    END
  `);
  console.log("SP hr.sp_GetStaffDropdown created");

  // Create stored procedure for full staff list (CRUD)
  await pool.request().query(`
    IF OBJECT_ID('hr.sp_GetStaffList', 'P') IS NOT NULL DROP PROCEDURE hr.sp_GetStaffList
  `);
  await pool.request().query(`
    CREATE PROCEDURE hr.sp_GetStaffList
      @PageNumber INT = 1,
      @PageSize   INT = 50,
      @SearchTerm NVARCHAR(200) = NULL,
      @Entity     NVARCHAR(200) = NULL,
      @Status     VARCHAR(20)   = NULL
    AS
    BEGIN
      SET NOCOUNT ON;
      SELECT
        staff_id, staff_number, full_name, designation, department,
        grade, position, place_of_work, email, phone, entity, status, created_at,
        COUNT(*) OVER() AS total_count
      FROM hr.staff
      WHERE (@SearchTerm IS NULL OR full_name LIKE '%' + @SearchTerm + '%' OR staff_number LIKE '%' + @SearchTerm + '%' OR department LIKE '%' + @SearchTerm + '%')
        AND (@Entity IS NULL OR entity = @Entity)
        AND (@Status IS NULL OR status = @Status)
      ORDER BY entity, full_name
      OFFSET (@PageNumber - 1) * @PageSize ROWS
      FETCH NEXT @PageSize ROWS ONLY;
    END
  `);
  console.log("SP hr.sp_GetStaffList created");

  await pool.close();
  console.log("\nDone — hr.staff table created and seeded with 15 Vodafone Qatar employees.");
}

run().catch(e => { console.error(e.message); process.exit(1); });
