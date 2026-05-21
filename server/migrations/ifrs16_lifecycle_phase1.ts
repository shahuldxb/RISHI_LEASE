import { getPool } from "../db-sqlserver";

async function main() {
  const pool = await getPool();
  const req = () => pool.request();

  console.log("Phase 1: IFRS 16 Lifecycle Engine — Schema Changes");

  // ── 1. Add lifecycle_status to lease.contracts ─────────────────────────
  await req().query(`
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('lease.contracts') AND name = 'lifecycle_status'
)
  ALTER TABLE lease.contracts
    ADD lifecycle_status NVARCHAR(20) NOT NULL DEFAULT 'Draft'
    CONSTRAINT chk_lifecycle_status CHECK (lifecycle_status IN ('Draft','Active','Modified','Closed'));
`);
  console.log("✅ lifecycle_status column added to lease.contracts");

  // ── 2. Add originated_at and modified_at to lease.contracts ────────────
  await req().query(`
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('lease.contracts') AND name = 'originated_at'
)
  ALTER TABLE lease.contracts ADD originated_at DATETIME2 NULL;
`);
  await req().query(`
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('lease.contracts') AND name = 'modified_at'
)
  ALTER TABLE lease.contracts ADD modified_at DATETIME2 NULL;
`);
  console.log("✅ originated_at, modified_at columns added to lease.contracts");

  // ── 3. Add posting_status and posted_at to lease.amortisation_schedule ─
  await req().query(`
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('lease.amortisation_schedule') AND name = 'posting_status'
)
  ALTER TABLE lease.amortisation_schedule
    ADD posting_status NVARCHAR(20) NOT NULL DEFAULT 'Projected'
    CONSTRAINT chk_posting_status CHECK (posting_status IN ('Projected','Posted','Locked'));
`);
  await req().query(`
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('lease.amortisation_schedule') AND name = 'posted_at'
)
  ALTER TABLE lease.amortisation_schedule ADD posted_at DATETIME2 NULL;
`);
  await req().query(`
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('lease.amortisation_schedule') AND name = 'posted_by'
)
  ALTER TABLE lease.amortisation_schedule ADD posted_by NVARCHAR(100) NULL;
`);
  console.log("✅ posting_status, posted_at, posted_by columns added to lease.amortisation_schedule");

  // ── 4. Create lease.gl_postings table ──────────────────────────────────
  await req().query(`
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('lease.gl_postings'))
BEGIN
  CREATE TABLE lease.gl_postings (
    posting_id       INT IDENTITY(1,1) PRIMARY KEY,
    contract_id      INT           NOT NULL,
    posting_date     DATE          NOT NULL,
    period_date      DATE          NULL,          -- NULL for JE-1 (commencement)
    je_ref           NVARCHAR(10)  NOT NULL,       -- JE-1, JE-2, JE-3, JE-4, JE-5, JE-6
    je_label         NVARCHAR(200) NOT NULL,
    ledger_no        NVARCHAR(20)  NOT NULL,
    ledger_name      NVARCHAR(200) NOT NULL,
    dr_cr            NVARCHAR(2)   NOT NULL CHECK (dr_cr IN ('Dr','Cr')),
    amount           DECIMAL(18,2) NOT NULL,
    posted_by        NVARCHAR(100) NOT NULL,
    posted_at        DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    notes            NVARCHAR(500) NULL
  );
  CREATE INDEX ix_gl_postings_contract ON lease.gl_postings(contract_id);
  CREATE INDEX ix_gl_postings_period   ON lease.gl_postings(period_date);
  CREATE INDEX ix_gl_postings_je_ref   ON lease.gl_postings(je_ref);
END
`);
  console.log("✅ lease.gl_postings table created");

  // ── 5. Mark existing Active leases (those with amortisation rows) as Active
  await req().query(`
UPDATE lease.contracts
SET lifecycle_status = 'Active',
    originated_at    = GETUTCDATE()
WHERE contract_id IN (
  SELECT DISTINCT contract_id FROM lease.amortisation_schedule
)
AND lifecycle_status = 'Draft';
`);

  // ── 6. Mark existing amortisation rows as Posted (they were calculated before)
  await req().query(`
UPDATE lease.amortisation_schedule
SET posting_status = 'Posted',
    posted_at      = GETUTCDATE(),
    posted_by      = 'system-migration'
WHERE posting_status = 'Projected';
`);
  console.log("✅ Existing leases marked Active; existing schedule rows marked Posted");

  console.log("\n✅ Phase 1 complete — schema ready for lifecycle engine");
  process.exit(0);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
