/**
 * ESG Module — DB Setup
 * Creates tables for Social & Governance metrics, and SPs for all ESG CRUD + reporting.
 */
import sql from 'mssql';

const config = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};

async function main() {
  const pool = await sql.connect(config);

  // ─── 1. Create Social Metrics Table ───────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='esg_social')
    CREATE TABLE lease.esg_social (
      social_id        INT IDENTITY(1,1) PRIMARY KEY,
      contract_id      INT NOT NULL,
      reporting_year   INT NOT NULL,
      reporting_month  INT NOT NULL,
      workforce_count  INT NULL,
      health_incidents INT NULL DEFAULT 0,
      safety_score     DECIMAL(5,2) NULL,
      community_investment_qar DECIMAL(14,2) NULL DEFAULT 0,
      local_employment_pct DECIMAL(5,2) NULL,
      training_hours   DECIMAL(10,2) NULL DEFAULT 0,
      diversity_pct    DECIMAL(5,2) NULL,
      notes            NVARCHAR(500) NULL,
      created_by       INT NULL,
      created_at       DATETIME2 DEFAULT GETUTCDATE(),
      updated_at       DATETIME2 DEFAULT GETUTCDATE()
    );
  `);
  console.log('✓ lease.esg_social table ready');

  // ─── 2. Create Governance Metrics Table ───────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='esg_governance')
    CREATE TABLE lease.esg_governance (
      governance_id    INT IDENTITY(1,1) PRIMARY KEY,
      contract_id      INT NOT NULL,
      reporting_year   INT NOT NULL,
      reporting_month  INT NOT NULL,
      approval_compliance_pct DECIMAL(5,2) NULL,
      related_party_flag BIT DEFAULT 0,
      related_party_details NVARCHAR(500) NULL,
      board_review_date DATE NULL,
      audit_findings   INT NULL DEFAULT 0,
      regulatory_compliance VARCHAR(20) NULL DEFAULT 'Compliant',
      ifrs16_adherence VARCHAR(20) NULL DEFAULT 'Full',
      policy_violations INT NULL DEFAULT 0,
      notes            NVARCHAR(500) NULL,
      created_by       INT NULL,
      created_at       DATETIME2 DEFAULT GETUTCDATE(),
      updated_at       DATETIME2 DEFAULT GETUTCDATE()
    );
  `);
  console.log('✓ lease.esg_governance table ready');

  // ─── 3. SP: Upsert Environmental (Carbon) Metric ─────────────────────────
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_UpsertESGEnvironmental', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_UpsertESGEnvironmental;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_UpsertESGEnvironmental
      @CarbonId INT = NULL,
      @ContractId INT,
      @ReportingYear INT,
      @ReportingMonth INT,
      @Scope1Tonnes DECIMAL(14,4) = NULL,
      @Scope2Tonnes DECIMAL(14,4) = NULL,
      @Scope3Tonnes DECIMAL(14,4) = NULL,
      @EnergyKwh DECIMAL(14,2) = NULL,
      @WaterM3 DECIMAL(14,2) = NULL,
      @WasteTonnes DECIMAL(14,4) = NULL,
      @GreenRating VARCHAR(20) = NULL,
      @Notes NVARCHAR(500) = NULL,
      @CreatedBy INT = NULL
    AS
    BEGIN
      SET NOCOUNT ON;
      IF @CarbonId IS NOT NULL AND EXISTS (SELECT 1 FROM lease.esg_carbon WHERE carbon_id = @CarbonId)
      BEGIN
        UPDATE lease.esg_carbon SET
          contract_id = @ContractId,
          reporting_year = @ReportingYear,
          reporting_month = @ReportingMonth,
          scope1_tonnes = @Scope1Tonnes,
          scope2_tonnes = @Scope2Tonnes,
          scope3_tonnes = @Scope3Tonnes,
          energy_kwh = @EnergyKwh,
          water_m3 = @WaterM3,
          waste_tonnes = @WasteTonnes,
          green_rating = @GreenRating,
          notes = @Notes,
          updated_at = GETUTCDATE()
        WHERE carbon_id = @CarbonId;
        SELECT @CarbonId AS record_id, 'UPDATE' AS action;
      END
      ELSE
      BEGIN
        INSERT INTO lease.esg_carbon (contract_id, reporting_year, reporting_month, scope1_tonnes, scope2_tonnes, scope3_tonnes, energy_kwh, water_m3, waste_tonnes, green_rating, notes, created_by, created_at, updated_at)
        VALUES (@ContractId, @ReportingYear, @ReportingMonth, @Scope1Tonnes, @Scope2Tonnes, @Scope3Tonnes, @EnergyKwh, @WaterM3, @WasteTonnes, @GreenRating, @Notes, @CreatedBy, GETUTCDATE(), GETUTCDATE());
        SELECT SCOPE_IDENTITY() AS record_id, 'INSERT' AS action;
      END
    END
  `);
  console.log('✓ sp_UpsertESGEnvironmental created');

  // ─── 4. SP: Upsert Social Metric ─────────────────────────────────────────
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_UpsertESGSocial', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_UpsertESGSocial;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_UpsertESGSocial
      @SocialId INT = NULL,
      @ContractId INT,
      @ReportingYear INT,
      @ReportingMonth INT,
      @WorkforceCount INT = NULL,
      @HealthIncidents INT = 0,
      @SafetyScore DECIMAL(5,2) = NULL,
      @CommunityInvestmentQar DECIMAL(14,2) = 0,
      @LocalEmploymentPct DECIMAL(5,2) = NULL,
      @TrainingHours DECIMAL(10,2) = 0,
      @DiversityPct DECIMAL(5,2) = NULL,
      @Notes NVARCHAR(500) = NULL,
      @CreatedBy INT = NULL
    AS
    BEGIN
      SET NOCOUNT ON;
      IF @SocialId IS NOT NULL AND EXISTS (SELECT 1 FROM lease.esg_social WHERE social_id = @SocialId)
      BEGIN
        UPDATE lease.esg_social SET
          contract_id = @ContractId,
          reporting_year = @ReportingYear,
          reporting_month = @ReportingMonth,
          workforce_count = @WorkforceCount,
          health_incidents = @HealthIncidents,
          safety_score = @SafetyScore,
          community_investment_qar = @CommunityInvestmentQar,
          local_employment_pct = @LocalEmploymentPct,
          training_hours = @TrainingHours,
          diversity_pct = @DiversityPct,
          notes = @Notes,
          updated_at = GETUTCDATE()
        WHERE social_id = @SocialId;
        SELECT @SocialId AS record_id, 'UPDATE' AS action;
      END
      ELSE
      BEGIN
        INSERT INTO lease.esg_social (contract_id, reporting_year, reporting_month, workforce_count, health_incidents, safety_score, community_investment_qar, local_employment_pct, training_hours, diversity_pct, notes, created_by, created_at, updated_at)
        VALUES (@ContractId, @ReportingYear, @ReportingMonth, @WorkforceCount, @HealthIncidents, @SafetyScore, @CommunityInvestmentQar, @LocalEmploymentPct, @TrainingHours, @DiversityPct, @Notes, @CreatedBy, GETUTCDATE(), GETUTCDATE());
        SELECT SCOPE_IDENTITY() AS record_id, 'INSERT' AS action;
      END
    END
  `);
  console.log('✓ sp_UpsertESGSocial created');

  // ─── 5. SP: Upsert Governance Metric ──────────────────────────────────────
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_UpsertESGGovernance', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_UpsertESGGovernance;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_UpsertESGGovernance
      @GovernanceId INT = NULL,
      @ContractId INT,
      @ReportingYear INT,
      @ReportingMonth INT,
      @ApprovalCompliancePct DECIMAL(5,2) = NULL,
      @RelatedPartyFlag BIT = 0,
      @RelatedPartyDetails NVARCHAR(500) = NULL,
      @BoardReviewDate DATE = NULL,
      @AuditFindings INT = 0,
      @RegulatoryCompliance VARCHAR(20) = 'Compliant',
      @IFRS16Adherence VARCHAR(20) = 'Full',
      @PolicyViolations INT = 0,
      @Notes NVARCHAR(500) = NULL,
      @CreatedBy INT = NULL
    AS
    BEGIN
      SET NOCOUNT ON;
      IF @GovernanceId IS NOT NULL AND EXISTS (SELECT 1 FROM lease.esg_governance WHERE governance_id = @GovernanceId)
      BEGIN
        UPDATE lease.esg_governance SET
          contract_id = @ContractId,
          reporting_year = @ReportingYear,
          reporting_month = @ReportingMonth,
          approval_compliance_pct = @ApprovalCompliancePct,
          related_party_flag = @RelatedPartyFlag,
          related_party_details = @RelatedPartyDetails,
          board_review_date = @BoardReviewDate,
          audit_findings = @AuditFindings,
          regulatory_compliance = @RegulatoryCompliance,
          ifrs16_adherence = @IFRS16Adherence,
          policy_violations = @PolicyViolations,
          notes = @Notes,
          updated_at = GETUTCDATE()
        WHERE governance_id = @GovernanceId;
        SELECT @GovernanceId AS record_id, 'UPDATE' AS action;
      END
      ELSE
      BEGIN
        INSERT INTO lease.esg_governance (contract_id, reporting_year, reporting_month, approval_compliance_pct, related_party_flag, related_party_details, board_review_date, audit_findings, regulatory_compliance, ifrs16_adherence, policy_violations, notes, created_by, created_at, updated_at)
        VALUES (@ContractId, @ReportingYear, @ReportingMonth, @ApprovalCompliancePct, @RelatedPartyFlag, @RelatedPartyDetails, @BoardReviewDate, @AuditFindings, @RegulatoryCompliance, @IFRS16Adherence, @PolicyViolations, @Notes, @CreatedBy, GETUTCDATE(), GETUTCDATE());
        SELECT SCOPE_IDENTITY() AS record_id, 'INSERT' AS action;
      END
    END
  `);
  console.log('✓ sp_UpsertESGGovernance created');

  // ─── 6. SP: Delete ESG Metric ─────────────────────────────────────────────
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_DeleteESGMetric', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_DeleteESGMetric;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_DeleteESGMetric
      @TableType VARCHAR(20),  -- 'environmental', 'social', 'governance'
      @RecordId INT
    AS
    BEGIN
      SET NOCOUNT ON;
      IF @TableType = 'environmental'
        DELETE FROM lease.esg_carbon WHERE carbon_id = @RecordId;
      ELSE IF @TableType = 'social'
        DELETE FROM lease.esg_social WHERE social_id = @RecordId;
      ELSE IF @TableType = 'governance'
        DELETE FROM lease.esg_governance WHERE governance_id = @RecordId;
      SELECT @@ROWCOUNT AS rows_affected;
    END
  `);
  console.log('✓ sp_DeleteESGMetric created');

  // ─── 7. SP: List ESG Metrics ──────────────────────────────────────────────
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_ListESGMetrics', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_ListESGMetrics;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_ListESGMetrics
      @TableType VARCHAR(20),  -- 'environmental', 'social', 'governance'
      @Year INT = NULL,
      @ContractId INT = NULL
    AS
    BEGIN
      SET NOCOUNT ON;
      IF @TableType = 'environmental'
        SELECT ec.*, c.contract_ref, c.asset_description, c.asset_type, c.total_area_sqm
        FROM lease.esg_carbon ec
        JOIN lease.contracts c ON c.contract_id = ec.contract_id
        WHERE (@Year IS NULL OR ec.reporting_year = @Year)
          AND (@ContractId IS NULL OR ec.contract_id = @ContractId)
        ORDER BY ec.reporting_year DESC, ec.reporting_month DESC;
      ELSE IF @TableType = 'social'
        SELECT es.*, c.contract_ref, c.asset_description, c.asset_type
        FROM lease.esg_social es
        JOIN lease.contracts c ON c.contract_id = es.contract_id
        WHERE (@Year IS NULL OR es.reporting_year = @Year)
          AND (@ContractId IS NULL OR es.contract_id = @ContractId)
        ORDER BY es.reporting_year DESC, es.reporting_month DESC;
      ELSE IF @TableType = 'governance'
        SELECT eg.*, c.contract_ref, c.asset_description, c.asset_type
        FROM lease.esg_governance eg
        JOIN lease.contracts c ON c.contract_id = eg.contract_id
        WHERE (@Year IS NULL OR eg.reporting_year = @Year)
          AND (@ContractId IS NULL OR eg.contract_id = @ContractId)
        ORDER BY eg.reporting_year DESC, eg.reporting_month DESC;
    END
  `);
  console.log('✓ sp_ListESGMetrics created');

  // ─── 8. SP: ESG Report Summary ───────────────────────────────────────────
  await pool.request().query(`
    IF OBJECT_ID('dbo.sp_GetESGReport', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetESGReport;
  `);
  await pool.request().query(`
    CREATE PROCEDURE dbo.sp_GetESGReport
      @Year INT
    AS
    BEGIN
      SET NOCOUNT ON;
      -- Resultset 1: Environmental Summary
      SELECT
        ISNULL(SUM(scope1_tonnes), 0) AS total_scope1,
        ISNULL(SUM(scope2_tonnes), 0) AS total_scope2,
        ISNULL(SUM(scope3_tonnes), 0) AS total_scope3,
        ISNULL(SUM(scope1_tonnes + scope2_tonnes + scope3_tonnes), 0) AS total_carbon,
        ISNULL(SUM(energy_kwh), 0) AS total_energy_kwh,
        ISNULL(SUM(water_m3), 0) AS total_water_m3,
        ISNULL(SUM(waste_tonnes), 0) AS total_waste_tonnes,
        COUNT(DISTINCT contract_id) AS leases_reported,
        COUNT(DISTINCT CASE WHEN green_rating IS NOT NULL AND green_rating != '' THEN contract_id END) AS green_certified_count
      FROM lease.esg_carbon
      WHERE reporting_year = @Year;

      -- Resultset 2: Social Summary
      SELECT
        ISNULL(SUM(workforce_count), 0) AS total_workforce,
        ISNULL(SUM(health_incidents), 0) AS total_incidents,
        ISNULL(AVG(safety_score), 0) AS avg_safety_score,
        ISNULL(SUM(community_investment_qar), 0) AS total_community_investment,
        ISNULL(AVG(local_employment_pct), 0) AS avg_local_employment,
        ISNULL(SUM(training_hours), 0) AS total_training_hours,
        ISNULL(AVG(diversity_pct), 0) AS avg_diversity,
        COUNT(DISTINCT contract_id) AS leases_reported
      FROM lease.esg_social
      WHERE reporting_year = @Year;

      -- Resultset 3: Governance Summary
      SELECT
        ISNULL(AVG(approval_compliance_pct), 0) AS avg_approval_compliance,
        ISNULL(SUM(CAST(related_party_flag AS INT)), 0) AS related_party_count,
        ISNULL(SUM(audit_findings), 0) AS total_audit_findings,
        ISNULL(SUM(policy_violations), 0) AS total_policy_violations,
        COUNT(DISTINCT contract_id) AS leases_reported,
        COUNT(DISTINCT CASE WHEN regulatory_compliance = 'Compliant' THEN contract_id END) AS compliant_count,
        COUNT(DISTINCT CASE WHEN ifrs16_adherence = 'Full' THEN contract_id END) AS full_ifrs16_count
      FROM lease.esg_governance
      WHERE reporting_year = @Year;

      -- Resultset 4: Monthly trend (environmental)
      SELECT
        reporting_month,
        ISNULL(SUM(scope1_tonnes + scope2_tonnes + scope3_tonnes), 0) AS monthly_carbon,
        ISNULL(SUM(energy_kwh), 0) AS monthly_energy
      FROM lease.esg_carbon
      WHERE reporting_year = @Year
      GROUP BY reporting_month
      ORDER BY reporting_month;
    END
  `);
  console.log('✓ sp_GetESGReport created');

  console.log('\n✅ All ESG tables and stored procedures created successfully!');
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
