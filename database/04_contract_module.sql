-- ============================================================
-- VodaLease Enterprise — Contract Management Module
-- All DML via Stored Procedures (SPP pattern)
-- ============================================================

-- ── TABLES ──────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='contract_versions' AND schema_id=SCHEMA_ID('lease'))
CREATE TABLE lease.contract_versions (
    version_id          INT IDENTITY(1,1) PRIMARY KEY,
    contract_id         INT NOT NULL,
    version_no          INT NOT NULL DEFAULT 1,
    version_type        VARCHAR(30) NOT NULL DEFAULT 'Original',  -- Original, Modification, Renewal, Termination
    effective_date      DATE NOT NULL,
    monthly_payment     DECIMAL(18,2) NOT NULL,
    expiry_date         DATE NOT NULL,
    term_months         INT NOT NULL,
    ibr                 DECIMAL(8,6) NOT NULL,
    rou_asset_value     DECIMAL(18,2),
    lease_liability     DECIMAL(18,2),
    escalation_rate     DECIMAL(8,4) DEFAULT 0,
    change_reason       NVARCHAR(1000),
    remeasurement_gain_loss DECIMAL(18,2) DEFAULT 0,
    created_by          INT NOT NULL,
    created_at          DATETIME2 DEFAULT GETUTCDATE(),
    approved_by         INT,
    approved_at         DATETIME2,
    status              VARCHAR(20) DEFAULT 'Draft',  -- Draft, Active, Superseded
    screen_id           VARCHAR(20),
    CONSTRAINT fk_cv_contract FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='contract_documents' AND schema_id=SCHEMA_ID('lease'))
CREATE TABLE lease.contract_documents (
    doc_id              INT IDENTITY(1,1) PRIMARY KEY,
    contract_id         INT NOT NULL,
    doc_type            VARCHAR(50) NOT NULL,  -- LeaseAgreement, Addendum, Insurance, FireCert, EnvPermit, MOT, Other
    doc_name            NVARCHAR(300) NOT NULL,
    doc_ref             VARCHAR(30) NOT NULL,  -- DOC-YYYY-NNNNNN
    storage_key         VARCHAR(500),
    storage_url         VARCHAR(1000),
    file_size_kb        INT,
    mime_type           VARCHAR(100),
    version_no          INT DEFAULT 1,
    expiry_date         DATE,
    expiry_alert_days   INT DEFAULT 30,
    ocr_extracted_json  NVARCHAR(MAX),
    uploaded_by         INT NOT NULL,
    uploaded_at         DATETIME2 DEFAULT GETUTCDATE(),
    is_current          BIT DEFAULT 1,
    notes               NVARCHAR(1000),
    CONSTRAINT fk_cd_contract FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='contract_milestones' AND schema_id=SCHEMA_ID('lease'))
CREATE TABLE lease.contract_milestones (
    milestone_id        INT IDENTITY(1,1) PRIMARY KEY,
    contract_id         INT NOT NULL,
    milestone_type      VARCHAR(50) NOT NULL,  -- RenewalDecision, ExpiryAlert, ReviewDate, RentReview, MakeGoodDue, InsuranceRenewal
    due_date            DATE NOT NULL,
    alert_days_before   INT DEFAULT 90,
    status              VARCHAR(20) DEFAULT 'Pending',  -- Pending, Actioned, Dismissed
    assigned_to_role    VARCHAR(50),
    notes               NVARCHAR(500),
    actioned_by         INT,
    actioned_at         DATETIME2,
    created_at          DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT fk_cm_contract FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='contract_terminations' AND schema_id=SCHEMA_ID('lease'))
CREATE TABLE lease.contract_terminations (
    termination_id      INT IDENTITY(1,1) PRIMARY KEY,
    contract_id         INT NOT NULL,
    termination_ref     VARCHAR(30) NOT NULL,  -- TRM-YYYY-NNNNNN
    termination_date    DATE NOT NULL,
    reason              VARCHAR(50) NOT NULL,  -- EarlyExit, Expiry, LessorDefault, Buyout, LTO_Complete
    contractual_penalty DECIMAL(18,2) DEFAULT 0,
    remaining_liability DECIMAL(18,2) DEFAULT 0,
    buyout_cost         DECIMAL(18,2) DEFAULT 0,
    recommended_action  VARCHAR(20),  -- Terminate, Buyout
    rou_nbv_at_term     DECIMAL(18,2) DEFAULT 0,
    gain_loss_on_term   DECIMAL(18,2) DEFAULT 0,
    final_payment       DECIMAL(18,2) DEFAULT 0,
    status              VARCHAR(20) DEFAULT 'Draft',
    maker_id            INT,
    checker_id          INT,
    approved_at         DATETIME2,
    gl_journal_ref      VARCHAR(30),
    screen_id           VARCHAR(20),
    created_at          DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT fk_ct_contract FOREIGN KEY (contract_id) REFERENCES lease.contracts(contract_id)
);

-- Register contract screens
IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTLST0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFLSECNTLST0001P001','Contract List','Contract','Register','/contracts','Contract register with full lifecycle management');

IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTDET0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFLSECNTDET0001P001','Contract Detail','Contract','Detail','/contracts/:id','Full contract detail with tabs');

IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTMOD0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFLSECNTMOD0001P001','Contract Modification','Contract','Modification','/contracts/:id/modify','IFRS 16 remeasurement on contract change');

IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTREN0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFLSECNTREN0001P001','Contract Renewal','Contract','Renewal','/contracts/:id/renew','Contract renewal with new amortisation');

IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTTRM0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFLSECNTTRM0001P001','Contract Termination','Contract','Termination','/contracts/:id/terminate','Termination penalty vs buyout analysis');

IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTHST0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFLSECNTHST0001P001','Contract Version History','Contract','History','/contracts/:id/history','Full version timeline with diff viewer');

IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTDOC0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFLSECNTDOC0001P001','Contract Document Vault','Contract','Documents','/contracts/:id/documents','Document upload, OCR, version control');

IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTMIL0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route_path, description)
    VALUES ('VFLSECNTMIL0001P001','Contract Milestones','Contract','Milestones','/contracts/:id/milestones','Renewal, review, and compliance milestones');

GO

-- ── STORED PROCEDURES ────────────────────────────────────────

-- sp_GetContracts: Paginated contract list with full details
CREATE OR ALTER PROCEDURE sp_GetContracts
    @PageNumber     INT = 1,
    @PageSize       INT = 100,
    @StatusFilter   VARCHAR(30) = NULL,
    @AssetType      VARCHAR(50) = NULL,
    @SearchTerm     NVARCHAR(200) = NULL,
    @ExpiryDays     INT = NULL,   -- Filter contracts expiring within N days
    @SortColumn     VARCHAR(50) = 'created_at',
    @SortDirection  VARCHAR(4) = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;

    SELECT
        c.contract_id, c.contract_ref, c.status,
        c.asset_type, c.asset_description, c.asset_tag,
        c.location_json,
        l.legal_name AS lessor_name, l.lessor_ref,
        c.commencement_date, c.expiry_date, c.term_months,
        DATEDIFF(DAY, GETUTCDATE(), c.expiry_date) AS days_to_expiry,
        c.monthly_payment, c.currency,
        c.rou_asset_value, c.lease_liability_commence,
        c.ifrs16_classification, c.is_lto,
        c.maintenance_responsibility,
        c.escalation_rate, c.ibr,
        c.renewal_option, c.renewal_certain,
        c.purchase_option, c.make_good_obligation,
        c.make_good_estimate,
        -- Current amortisation snapshot
        (SELECT TOP 1 closing_liability FROM lease.amortisation_schedule
         WHERE contract_id = c.contract_id AND period_date <= CAST(GETUTCDATE() AS DATE)
         ORDER BY period_date DESC) AS current_liability,
        (SELECT TOP 1 rou_nbv FROM lease.amortisation_schedule
         WHERE contract_id = c.contract_id AND period_date <= CAST(GETUTCDATE() AS DATE)
         ORDER BY period_date DESC) AS current_rou_nbv,
        -- Document count
        (SELECT COUNT(*) FROM lease.contract_documents WHERE contract_id = c.contract_id AND is_current = 1) AS doc_count,
        -- Expiring documents
        (SELECT COUNT(*) FROM lease.contract_documents
         WHERE contract_id = c.contract_id AND is_current = 1
           AND expiry_date IS NOT NULL AND expiry_date <= DATEADD(DAY, 30, GETUTCDATE())) AS expiring_docs,
        -- Open milestones
        (SELECT COUNT(*) FROM lease.contract_milestones
         WHERE contract_id = c.contract_id AND status = 'Pending'
           AND due_date <= DATEADD(DAY, 90, GETUTCDATE())) AS pending_milestones,
        c.created_at, c.maker_id,
        COUNT(*) OVER() AS total_count
    FROM lease.contracts c
    JOIN lease.lessors l ON c.lessor_id = l.lessor_id
    WHERE
        (@StatusFilter IS NULL OR c.status = @StatusFilter)
        AND (@AssetType IS NULL OR c.asset_type = @AssetType)
        AND (@ExpiryDays IS NULL OR DATEDIFF(DAY, GETUTCDATE(), c.expiry_date) <= @ExpiryDays)
        AND (@SearchTerm IS NULL OR
             c.contract_ref LIKE '%' + @SearchTerm + '%' OR
             c.asset_description LIKE '%' + @SearchTerm + '%' OR
             l.legal_name LIKE '%' + @SearchTerm + '%' OR
             c.asset_tag LIKE '%' + @SearchTerm + '%')
    ORDER BY
        CASE WHEN @SortColumn='contract_ref' AND @SortDirection='ASC' THEN c.contract_ref END ASC,
        CASE WHEN @SortColumn='contract_ref' AND @SortDirection='DESC' THEN c.contract_ref END DESC,
        CASE WHEN @SortColumn='expiry_date' AND @SortDirection='ASC' THEN c.expiry_date END ASC,
        CASE WHEN @SortColumn='expiry_date' AND @SortDirection='DESC' THEN c.expiry_date END DESC,
        CASE WHEN @SortColumn='monthly_payment' AND @SortDirection='ASC' THEN c.monthly_payment END ASC,
        CASE WHEN @SortColumn='monthly_payment' AND @SortDirection='DESC' THEN c.monthly_payment END DESC,
        CASE WHEN @SortDirection='ASC' THEN c.created_at END ASC,
        c.created_at DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- sp_GetContractById: Full contract detail with all related data
CREATE OR ALTER PROCEDURE sp_GetContractById
    @ContractId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Main contract record
    SELECT
        c.*,
        l.legal_name AS lessor_name, l.lessor_ref, l.country AS lessor_country,
        l.currency AS lessor_currency,
        l.bank_details_enc, l.contact_json AS lessor_contacts,
        DATEDIFF(DAY, GETUTCDATE(), c.expiry_date) AS days_to_expiry,
        (SELECT TOP 1 closing_liability FROM lease.amortisation_schedule
         WHERE contract_id = c.contract_id AND period_date <= CAST(GETUTCDATE() AS DATE)
         ORDER BY period_date DESC) AS current_liability,
        (SELECT TOP 1 rou_nbv FROM lease.amortisation_schedule
         WHERE contract_id = c.contract_id AND period_date <= CAST(GETUTCDATE() AS DATE)
         ORDER BY period_date DESC) AS current_rou_nbv,
        (SELECT SUM(payment) FROM lease.amortisation_schedule
         WHERE contract_id = c.contract_id AND period_date > CAST(GETUTCDATE() AS DATE)) AS remaining_payments_total
    FROM lease.contracts c
    JOIN lease.lessors l ON c.lessor_id = l.lessor_id
    WHERE c.contract_id = @ContractId;

    -- Version history
    SELECT * FROM lease.contract_versions
    WHERE contract_id = @ContractId
    ORDER BY version_no DESC;

    -- Documents
    SELECT * FROM lease.contract_documents
    WHERE contract_id = @ContractId AND is_current = 1
    ORDER BY uploaded_at DESC;

    -- Milestones
    SELECT * FROM lease.contract_milestones
    WHERE contract_id = @ContractId
    ORDER BY due_date ASC;

    -- Insurance policies
    SELECT * FROM lease.insurance_policies
    WHERE contract_id = @ContractId AND status = 'Active'
    ORDER BY expiry_date ASC;

    -- Maintenance tickets
    SELECT TOP 10 * FROM lease.maintenance_tickets
    WHERE contract_id = @ContractId
    ORDER BY created_at DESC;
END
GO

-- sp_GetContractVersions: Version history with diff data
CREATE OR ALTER PROCEDURE sp_GetContractVersions
    @ContractId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        cv.*,
        u.username AS created_by_name,
        a.username AS approved_by_name
    FROM lease.contract_versions cv
    LEFT JOIN security.users u ON cv.created_by = u.user_id
    LEFT JOIN security.users a ON cv.approved_by = a.user_id
    WHERE cv.contract_id = @ContractId
    ORDER BY cv.version_no DESC;
END
GO

-- sp_CreateContractVersion: Record a new version on modification/renewal
CREATE OR ALTER PROCEDURE sp_CreateContractVersion
    @ContractId         INT,
    @VersionType        VARCHAR(30),
    @EffectiveDate      DATE,
    @MonthlyPayment     DECIMAL(18,2),
    @ExpiryDate         DATE,
    @TermMonths         INT,
    @IBR                DECIMAL(8,6),
    @ROUAssetValue      DECIMAL(18,2) = NULL,
    @LeaseLiability     DECIMAL(18,2) = NULL,
    @EscalationRate     DECIMAL(8,4) = 0,
    @ChangeReason       NVARCHAR(1000) = NULL,
    @RemeasurementGL    DECIMAL(18,2) = 0,
    @CreatedBy          INT,
    @ScreenId           VARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NextVersion INT;
    SELECT @NextVersion = ISNULL(MAX(version_no), 0) + 1
    FROM lease.contract_versions
    WHERE contract_id = @ContractId;

    -- Mark previous active version as superseded
    UPDATE lease.contract_versions
    SET status = 'Superseded'
    WHERE contract_id = @ContractId AND status = 'Active';

    INSERT INTO lease.contract_versions (
        contract_id, version_no, version_type, effective_date,
        monthly_payment, expiry_date, term_months, ibr,
        rou_asset_value, lease_liability, escalation_rate,
        change_reason, remeasurement_gain_loss, created_by,
        status, screen_id
    ) VALUES (
        @ContractId, @NextVersion, @VersionType, @EffectiveDate,
        @MonthlyPayment, @ExpiryDate, @TermMonths, @IBR,
        @ROUAssetValue, @LeaseLiability, @EscalationRate,
        @ChangeReason, @RemeasurementGL, @CreatedBy,
        'Active', @ScreenId
    );

    SELECT SCOPE_IDENTITY() AS version_id, @NextVersion AS version_no;
END
GO

-- sp_ModifyContract: IFRS 16 remeasurement on contract change
CREATE OR ALTER PROCEDURE sp_ModifyContract
    @ContractId             INT,
    @ModificationDate       DATE,
    @NewMonthlyPayment      DECIMAL(18,2),
    @NewExpiryDate          DATE,
    @NewTermMonths          INT,
    @NewIBR                 DECIMAL(8,6),
    @NewROUAssetValue       DECIMAL(18,2),
    @NewLeaseLiability      DECIMAL(18,2),
    @RemeasurementGainLoss  DECIMAL(18,2),
    @ChangeReason           NVARCHAR(1000),
    @MakerId                INT,
    @ScreenId               VARCHAR(20) = 'VFLSECNTMOD0001P001'
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        -- Update the main contract record
        UPDATE lease.contracts SET
            monthly_payment = @NewMonthlyPayment,
            expiry_date = @NewExpiryDate,
            term_months = @NewTermMonths,
            ibr = @NewIBR,
            rou_asset_value = @NewROUAssetValue,
            lease_liability_commence = @NewLeaseLiability,
            status = 'PendingApproval',
            updated_at = GETUTCDATE()
        WHERE contract_id = @ContractId;

        -- Record the modification
        INSERT INTO lease.modifications (
            contract_id, modification_date, new_monthly_payment,
            new_expiry_date, new_term_months, new_ibr,
            new_rou_asset_value, new_lease_liability,
            remeasurement_gain_loss, change_reason,
            maker_id, status, screen_id
        ) VALUES (
            @ContractId, @ModificationDate, @NewMonthlyPayment,
            @NewExpiryDate, @NewTermMonths, @NewIBR,
            @NewROUAssetValue, @NewLeaseLiability,
            @RemeasurementGainLoss, @ChangeReason,
            @MakerId, 'PendingApproval', @ScreenId
        );

        DECLARE @ModId INT = SCOPE_IDENTITY();

        -- Create new version record
        EXEC sp_CreateContractVersion
            @ContractId = @ContractId,
            @VersionType = 'Modification',
            @EffectiveDate = @ModificationDate,
            @MonthlyPayment = @NewMonthlyPayment,
            @ExpiryDate = @NewExpiryDate,
            @TermMonths = @NewTermMonths,
            @IBR = @NewIBR,
            @ROUAssetValue = @NewROUAssetValue,
            @LeaseLiability = @NewLeaseLiability,
            @ChangeReason = @ChangeReason,
            @RemeasurementGL = @RemeasurementGainLoss,
            @CreatedBy = @MakerId,
            @ScreenId = @ScreenId;

        COMMIT TRANSACTION;
        SELECT @ModId AS modification_id,
               'MOD-' + FORMAT(YEAR(GETUTCDATE()), '0000') + '-' + FORMAT(@ModId, '000000') AS modification_ref;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

-- sp_RenewContract: Contract renewal with new terms
CREATE OR ALTER PROCEDURE sp_RenewContract
    @ContractId             INT,
    @RenewalStartDate       DATE,
    @NewExpiryDate          DATE,
    @NewTermMonths          INT,
    @NewMonthlyPayment      DECIMAL(18,2),
    @NewIBR                 DECIMAL(8,6),
    @NewROUAssetValue       DECIMAL(18,2),
    @NewLeaseLiability      DECIMAL(18,2),
    @RenewalNotes           NVARCHAR(1000) = NULL,
    @MakerId                INT,
    @ScreenId               VARCHAR(20) = 'VFLSECNTREN0001P001'
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        UPDATE lease.contracts SET
            commencement_date = @RenewalStartDate,
            expiry_date = @NewExpiryDate,
            term_months = @NewTermMonths,
            monthly_payment = @NewMonthlyPayment,
            ibr = @NewIBR,
            rou_asset_value = @NewROUAssetValue,
            lease_liability_commence = @NewLeaseLiability,
            status = 'PendingApproval',
            updated_at = GETUTCDATE()
        WHERE contract_id = @ContractId;

        EXEC sp_CreateContractVersion
            @ContractId = @ContractId,
            @VersionType = 'Renewal',
            @EffectiveDate = @RenewalStartDate,
            @MonthlyPayment = @NewMonthlyPayment,
            @ExpiryDate = @NewExpiryDate,
            @TermMonths = @NewTermMonths,
            @IBR = @NewIBR,
            @ROUAssetValue = @NewROUAssetValue,
            @LeaseLiability = @NewLeaseLiability,
            @ChangeReason = @RenewalNotes,
            @CreatedBy = @MakerId,
            @ScreenId = @ScreenId;

        COMMIT TRANSACTION;
        SELECT @ContractId AS contract_id, 'Renewal submitted for approval' AS message;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

-- sp_TerminateContract: Full termination with penalty/buyout analysis
CREATE OR ALTER PROCEDURE sp_TerminateContract
    @ContractId             INT,
    @TerminationDate        DATE,
    @Reason                 VARCHAR(50),
    @ContractualPenalty     DECIMAL(18,2) = 0,
    @RemainingLiability     DECIMAL(18,2) = 0,
    @BuyoutCost             DECIMAL(18,2) = 0,
    @RecommendedAction      VARCHAR(20) = 'Terminate',
    @ROUNBVAtTerm           DECIMAL(18,2) = 0,
    @GainLossOnTerm         DECIMAL(18,2) = 0,
    @FinalPayment           DECIMAL(18,2) = 0,
    @MakerId                INT,
    @ScreenId               VARCHAR(20) = 'VFLSECNTTRM0001P001'
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @TrmRef VARCHAR(30);
        DECLARE @TrmId INT;

        INSERT INTO lease.contract_terminations (
            contract_id, termination_ref, termination_date, reason,
            contractual_penalty, remaining_liability, buyout_cost,
            recommended_action, rou_nbv_at_term, gain_loss_on_term,
            final_payment, status, maker_id, screen_id
        ) VALUES (
            @ContractId,
            'TRM-' + FORMAT(YEAR(GETUTCDATE()), '0000') + '-' + FORMAT(NEXT VALUE FOR lease.contract_seq, '000000'),
            @TerminationDate, @Reason,
            @ContractualPenalty, @RemainingLiability, @BuyoutCost,
            @RecommendedAction, @ROUNBVAtTerm, @GainLossOnTerm,
            @FinalPayment, 'PendingApproval', @MakerId, @ScreenId
        );
        SET @TrmId = SCOPE_IDENTITY();

        UPDATE lease.contracts SET
            status = 'PendingTermination',
            updated_at = GETUTCDATE()
        WHERE contract_id = @ContractId;

        COMMIT TRANSACTION;
        SELECT @TrmId AS termination_id,
               'TRM-' + FORMAT(YEAR(GETUTCDATE()), '0000') + '-' + FORMAT(@TrmId, '000000') AS termination_ref;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

-- sp_GetContractDocuments: Document vault for a contract
CREATE OR ALTER PROCEDURE sp_GetContractDocuments
    @ContractId INT,
    @DocType    VARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        cd.*,
        u.username AS uploaded_by_name,
        CASE WHEN cd.expiry_date IS NOT NULL AND cd.expiry_date <= DATEADD(DAY, 30, GETUTCDATE())
             THEN 1 ELSE 0 END AS is_expiring_soon,
        DATEDIFF(DAY, GETUTCDATE(), cd.expiry_date) AS days_to_expiry
    FROM lease.contract_documents cd
    LEFT JOIN security.users u ON cd.uploaded_by = u.user_id
    WHERE cd.contract_id = @ContractId
      AND cd.is_current = 1
      AND (@DocType IS NULL OR cd.doc_type = @DocType)
    ORDER BY cd.doc_type, cd.uploaded_at DESC;
END
GO

-- sp_AttachContractDocument: Upload a document to the vault
CREATE OR ALTER PROCEDURE sp_AttachContractDocument
    @ContractId         INT,
    @DocType            VARCHAR(50),
    @DocName            NVARCHAR(300),
    @StorageKey         VARCHAR(500),
    @StorageUrl         VARCHAR(1000),
    @FileSizeKB         INT = NULL,
    @MimeType           VARCHAR(100) = NULL,
    @ExpiryDate         DATE = NULL,
    @ExpiryAlertDays    INT = 30,
    @OCRExtractedJson   NVARCHAR(MAX) = NULL,
    @UploadedBy         INT,
    @Notes              NVARCHAR(1000) = NULL,
    @ScreenId           VARCHAR(20) = 'VFLSECNTDOC0001P001'
AS
BEGIN
    SET NOCOUNT ON;

    -- Supersede previous version of same doc type
    UPDATE lease.contract_documents
    SET is_current = 0
    WHERE contract_id = @ContractId AND doc_type = @DocType AND is_current = 1;

    DECLARE @NextVersion INT;
    SELECT @NextVersion = ISNULL(MAX(version_no), 0) + 1
    FROM lease.contract_documents
    WHERE contract_id = @ContractId AND doc_type = @DocType;

    DECLARE @DocRef VARCHAR(30) = 'DOC-' + FORMAT(YEAR(GETUTCDATE()), '0000') + '-' + FORMAT(NEXT VALUE FOR lease.doc_seq, '000000');

    INSERT INTO lease.contract_documents (
        contract_id, doc_type, doc_name, doc_ref, storage_key, storage_url,
        file_size_kb, mime_type, version_no, expiry_date, expiry_alert_days,
        ocr_extracted_json, uploaded_by, is_current, notes
    ) VALUES (
        @ContractId, @DocType, @DocName, @DocRef, @StorageKey, @StorageUrl,
        @FileSizeKB, @MimeType, @NextVersion, @ExpiryDate, @ExpiryAlertDays,
        @OCRExtractedJson, @UploadedBy, 1, @Notes
    );

    SELECT SCOPE_IDENTITY() AS doc_id, @DocRef AS doc_ref, @NextVersion AS version_no;
END
GO

-- sp_GetContractMilestones: Get upcoming milestones
CREATE OR ALTER PROCEDURE sp_GetContractMilestones
    @ContractId     INT = NULL,
    @Status         VARCHAR(20) = 'Pending',
    @DueDays        INT = 180
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        cm.*,
        c.contract_ref, c.asset_description, c.asset_type,
        l.legal_name AS lessor_name,
        DATEDIFF(DAY, GETUTCDATE(), cm.due_date) AS days_until_due
    FROM lease.contract_milestones cm
    JOIN lease.contracts c ON cm.contract_id = c.contract_id
    JOIN lease.lessors l ON c.lessor_id = l.lessor_id
    WHERE
        (@ContractId IS NULL OR cm.contract_id = @ContractId)
        AND (@Status IS NULL OR cm.status = @Status)
        AND cm.due_date <= DATEADD(DAY, @DueDays, GETUTCDATE())
    ORDER BY cm.due_date ASC;
END
GO

-- sp_GetExpiringDocuments: Documents expiring soon across all contracts
CREATE OR ALTER PROCEDURE sp_GetExpiringDocuments
    @AlertDays INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        cd.doc_id, cd.contract_id, cd.doc_type, cd.doc_name, cd.doc_ref,
        cd.expiry_date,
        DATEDIFF(DAY, GETUTCDATE(), cd.expiry_date) AS days_to_expiry,
        c.contract_ref, c.asset_description, c.asset_type,
        l.legal_name AS lessor_name
    FROM lease.contract_documents cd
    JOIN lease.contracts c ON cd.contract_id = c.contract_id
    JOIN lease.lessors l ON c.lessor_id = l.lessor_id
    WHERE cd.is_current = 1
      AND cd.expiry_date IS NOT NULL
      AND cd.expiry_date <= DATEADD(DAY, @AlertDays, GETUTCDATE())
      AND cd.expiry_date >= CAST(GETUTCDATE() AS DATE)
    ORDER BY cd.expiry_date ASC;
END
GO

-- Create sequences for document and contract references if not exist
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'contract_seq' AND schema_id = SCHEMA_ID('lease'))
    CREATE SEQUENCE lease.contract_seq START WITH 1 INCREMENT BY 1;

IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'doc_seq' AND schema_id = SCHEMA_ID('lease'))
    CREATE SEQUENCE lease.doc_seq START WITH 1 INCREMENT BY 1;
