-- ============================================================
-- Contract DMS Migration
-- Tables: contract_metadata_templates, contract_metadata_fields,
--         contract_documents, contract_milestones,
--         contract_metadata_values, contract_document_versions
-- ============================================================

-- 1. Metadata Templates (define field schemas per contract type)
CREATE TABLE IF NOT EXISTS contract_metadata_templates (
  template_id    INT AUTO_INCREMENT PRIMARY KEY,
  template_name  VARCHAR(120) NOT NULL,
  contract_type  VARCHAR(80)  NOT NULL,  -- Commercial, Residential, Equipment, Land, Vehicle, Other
  description    TEXT,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_by     INT,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Metadata Field Definitions (fields belonging to a template)
CREATE TABLE IF NOT EXISTS contract_metadata_fields (
  field_id       INT AUTO_INCREMENT PRIMARY KEY,
  template_id    INT NOT NULL,
  field_name     VARCHAR(120) NOT NULL,
  field_label    VARCHAR(120) NOT NULL,
  field_type     ENUM('text','number','currency','date','boolean','dropdown','textarea') NOT NULL DEFAULT 'text',
  dropdown_options TEXT,               -- JSON array of strings for dropdown type
  is_required    TINYINT(1) NOT NULL DEFAULT 0,
  display_order  INT NOT NULL DEFAULT 0,
  placeholder    VARCHAR(200),
  help_text      VARCHAR(500),
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES contract_metadata_templates(template_id) ON DELETE CASCADE
);

-- 3. Contract Documents (multiple documents per contract/lease)
CREATE TABLE IF NOT EXISTS contract_documents (
  doc_id         INT AUTO_INCREMENT PRIMARY KEY,
  lease_id       INT NOT NULL,
  doc_type       VARCHAR(80) NOT NULL DEFAULT 'Other',
  -- doc_type options: Original Contract, Addendum, Floor Plan, Insurance Certificate,
  --                   Handover Report, Termination Notice, Correspondence, Other
  doc_name       VARCHAR(255) NOT NULL,
  file_key       VARCHAR(500) NOT NULL,   -- S3 storage key
  file_url       VARCHAR(1000) NOT NULL,  -- /manus-storage/...
  file_size      INT,                     -- bytes
  mime_type      VARCHAR(100),
  version_number INT NOT NULL DEFAULT 1,
  version_notes  TEXT,
  signatory_name VARCHAR(200),
  signed_date    DATE,
  expiry_date    DATE,
  is_current     TINYINT(1) NOT NULL DEFAULT 1,
  uploaded_by    INT,
  uploaded_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. Contract Milestones (contractual obligations timeline)
CREATE TABLE IF NOT EXISTS contract_milestones (
  milestone_id   INT AUTO_INCREMENT PRIMARY KEY,
  lease_id       INT NOT NULL,
  milestone_type VARCHAR(80) NOT NULL,
  -- types: Rent Free End, Fit-Out Deadline, Break Clause Notice, Renewal Decision,
  --        Registration Deadline, Insurance Renewal, Inspection Due, Custom
  title          VARCHAR(255) NOT NULL,
  due_date       DATE NOT NULL,
  description    TEXT,
  status         ENUM('Pending','Completed','Overdue','Dismissed') NOT NULL DEFAULT 'Pending',
  completed_date DATE,
  completed_by   INT,
  alert_days_before INT NOT NULL DEFAULT 30,
  created_by     INT,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. Contract Metadata Values (per-contract values for template fields)
CREATE TABLE IF NOT EXISTS contract_metadata_values (
  value_id       INT AUTO_INCREMENT PRIMARY KEY,
  lease_id       INT NOT NULL,
  template_id    INT NOT NULL,
  field_id       INT NOT NULL,
  field_value    TEXT,
  updated_by     INT,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lease_field (lease_id, field_id),
  FOREIGN KEY (template_id) REFERENCES contract_metadata_templates(template_id),
  FOREIGN KEY (field_id)    REFERENCES contract_metadata_fields(field_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contract_docs_lease    ON contract_documents(lease_id);
CREATE INDEX IF NOT EXISTS idx_contract_miles_lease   ON contract_milestones(lease_id);
CREATE INDEX IF NOT EXISTS idx_contract_meta_lease    ON contract_metadata_values(lease_id);
CREATE INDEX IF NOT EXISTS idx_contract_meta_template ON contract_metadata_values(template_id);
