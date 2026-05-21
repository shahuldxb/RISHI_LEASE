import sql from 'mssql';

const config = { server:'SQL_SERVER_HOST_REDACTED', database:'leasing', user:'SQL_USER_REDACTED', password:'SQL_PASSWORD_REDACTED', options:{trustServerCertificate:true,encrypt:false} };
const pool = await sql.connect(config);
console.log('Connected. Fixing stored procedures...\n');

const fixes = [

// Fix sp_GetContractById — screen_registry uses 'route' not 'route_path', 'allowed_roles' not 'description'
// Fix sp_GetContracts — no issue, just re-create with correct screen insert syntax
// Fix screen inserts: column is 'route' not 'route_path', no 'description' column
`CREATE OR ALTER PROCEDURE sp_GetContractById
    @ContractId INT
AS
BEGIN
    SET NOCOUNT ON;
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

    SELECT * FROM lease.contract_versions WHERE contract_id=@ContractId ORDER BY version_no DESC;
    SELECT * FROM lease.contract_documents WHERE contract_id=@ContractId AND is_current=1 ORDER BY uploaded_at DESC;
    SELECT * FROM lease.contract_milestones WHERE contract_id=@ContractId ORDER BY due_date ASC;
    SELECT * FROM lease.insurance_policies WHERE contract_id=@ContractId AND status='Active' ORDER BY expiry_date ASC;
    SELECT TOP 10 * FROM lease.maintenance_tickets WHERE contract_id=@ContractId ORDER BY created_at DESC;
END`,

// Fix sp_ModifyContract — modifications table uses old_terms_json/new_terms_json, not individual columns
`CREATE OR ALTER PROCEDURE sp_ModifyContract
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
        DECLARE @OldTerms NVARCHAR(MAX);
        SELECT @OldTerms = (SELECT monthly_payment, expiry_date, term_months, ibr, rou_asset_value, lease_liability_commence
                            FROM lease.contracts WHERE contract_id=@ContractId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

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

        DECLARE @NewTerms NVARCHAR(MAX) = (SELECT @NewMonthlyPayment AS monthly_payment, @NewExpiryDate AS expiry_date, @NewTermMonths AS term_months, @NewIBR AS ibr, @NewROUAssetValue AS rou_asset_value, @NewLeaseLiability AS lease_liability FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

        INSERT INTO lease.modifications (contract_id, modification_date, modification_type, old_terms_json, new_terms_json, liability_adjustment, rou_adjustment, status, maker_id, screen_id)
        VALUES (@ContractId, @ModificationDate, 'Remeasurement', @OldTerms, @NewTerms, @RemeasurementGainLoss, @RemeasurementGainLoss, 'PendingApproval', @MakerId, @ScreenId);

        DECLARE @ModId INT = SCOPE_IDENTITY();

        EXEC sp_CreateContractVersion
            @ContractId=@ContractId, @VersionType='Modification', @EffectiveDate=@ModificationDate,
            @MonthlyPayment=@NewMonthlyPayment, @ExpiryDate=@NewExpiryDate, @TermMonths=@NewTermMonths,
            @IBR=@NewIBR, @ROUAssetValue=@NewROUAssetValue, @LeaseLiability=@NewLeaseLiability,
            @ChangeReason=@ChangeReason, @RemeasurementGL=@RemeasurementGainLoss,
            @CreatedBy=@MakerId, @ScreenId=@ScreenId;

        COMMIT TRANSACTION;
        SELECT @ModId AS modification_id, 'MOD-'+FORMAT(YEAR(GETUTCDATE()),'0000')+'-'+FORMAT(@ModId,'000000') AS modification_ref;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END`,

// Fix sp_RunAutoMatch — finance.gl_lines uses 'debit_amount'/'credit_amount' or check actual columns
// First let's fix the screen registry inserts — use 'route' not 'route_path', no 'description'
`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTLST0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFLSECNTLST0001P001','Contract List','Contract','Register','/contracts')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTDET0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFLSECNTDET0001P001','Contract Detail','Contract','Detail','/contracts/:id')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTMOD0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFLSECNTMOD0001P001','Contract Modification','Contract','Modification','/contracts/:id/modify')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTREN0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFLSECNTREN0001P001','Contract Renewal','Contract','Renewal','/contracts/:id/renew')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTTRM0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFLSECNTTRM0001P001','Contract Termination','Contract','Termination','/contracts/:id/terminate')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTHST0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFLSECNTHST0001P001','Contract Version History','Contract','History','/contracts/:id/history')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTDOC0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFLSECNTDOC0001P001','Contract Document Vault','Contract','Documents','/contracts/:id/documents')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFLSECNTMIL0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFLSECNTMIL0001P001','Contract Milestones','Contract','Milestones','/contracts/:id/milestones')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKACCREG0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFBNKACCREG0001P001','Bank Account Register','BankRecon','Accounts','/bank/accounts')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKSTMIMP0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFBNKSTMIMP0001P001','Bank Statement Import','BankRecon','Import','/bank/import')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKRECONWS0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFBNKRECONWS0001P001','Reconciliation Workspace','BankRecon','Workspace','/bank/recon/:id')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKAUTOMCH0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFBNKAUTOMCH0001P001','Auto-Match Results','BankRecon','AutoMatch','/bank/recon/:id/matches')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKUNMTCH0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFBNKUNMTCH0001P001','Unmatched Items Queue','BankRecon','Exceptions','/bank/recon/:id/exceptions')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKRECSUM0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFBNKRECSUM0001P001','Reconciliation Summary','BankRecon','Summary','/bank/recon/:id/summary')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKRECHST0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFBNKRECHST0001P001','Reconciliation History','BankRecon','History','/bank/history')`,

`IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id='VFBNKRULCFG0001P001')
    INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, route)
    VALUES ('VFBNKRULCFG0001P001','Matching Rules Config','BankRecon','Rules','/bank/rules')`,
];

let ok = 0, fail = 0;
for (const stmt of fixes) {
  try {
    await pool.request().query(stmt);
    ok++;
  } catch(e) {
    const msg = e.message || '';
    if (msg.includes('already exists') || msg.includes('There is already')) { ok++; }
    else { console.error('FAIL:', msg.substring(0,150)); fail++; }
  }
}
console.log(`Fixes applied: ${ok} OK, ${fail} failed`);

// Verify screens
const screens = await pool.request().query(`SELECT screen_id, screen_name FROM security.screen_registry WHERE module IN ('Contract','BankRecon') ORDER BY module, screen_id`);
console.log('\nRegistered screens:');
screens.recordset.forEach(r => console.log(`  ✓ ${r.screen_id} — ${r.screen_name}`));

await sql.close();
console.log('\n✅ Fix script complete!');
