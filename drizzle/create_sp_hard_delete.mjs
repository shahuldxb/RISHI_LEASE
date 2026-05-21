import sql from 'mssql';

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};

async function main() {
  const pool = await sql.connect(cfg);

  await pool.request().query(`DROP PROCEDURE IF EXISTS lease.sp_HardDeleteLease`);
  console.log('Dropped old SP if existed');

  await pool.request().query(`
    CREATE PROCEDURE lease.sp_HardDeleteLease
      @contract_id INT
    AS
    BEGIN
      SET NOCOUNT ON;

      -- Verify contract exists
      IF NOT EXISTS (SELECT 1 FROM lease.contracts WHERE contract_id = @contract_id)
      BEGIN
        RAISERROR('Contract not found', 16, 1);
        RETURN;
      END

      -- Get contract_ref for audit
      DECLARE @contract_ref NVARCHAR(50);
      SELECT @contract_ref = contract_ref FROM lease.contracts WHERE contract_id = @contract_id;

      BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Delete JV lines (child of journal_vouchers)
        DELETE jl FROM accounting.jv_lines jl
          INNER JOIN accounting.journal_vouchers jv ON jl.jv_id = jv.jv_id
          WHERE jv.contract_id = @contract_id;

        -- 2. Delete JV headers
        DELETE FROM accounting.journal_vouchers WHERE contract_id = @contract_id;

        -- 3. Delete all lease child tables
        DELETE FROM lease.amortisation_schedule WHERE contract_id = @contract_id;
        DELETE FROM lease.gl_postings WHERE contract_id = @contract_id;
        DELETE FROM lease.period_close WHERE contract_id = @contract_id;
        DELETE FROM lease.contract_documents WHERE contract_id = @contract_id;
        DELETE FROM lease.contract_metadata_values WHERE contract_id = @contract_id;
        DELETE FROM lease.contract_milestones WHERE contract_id = @contract_id;
        DELETE FROM lease.contract_modification_history WHERE contract_id = @contract_id;
        DELETE FROM lease.cost_centre_allocation WHERE contract_id = @contract_id;
        DELETE FROM lease.critical_dates WHERE contract_id = @contract_id;
        DELETE FROM lease.lease_classification WHERE contract_id = @contract_id;
        DELETE FROM lease.lease_escalations WHERE contract_id = @contract_id;
        DELETE FROM lease.lease_incentives WHERE contract_id = @contract_id;
        DELETE FROM lease.lease_lessee_details WHERE contract_id = @contract_id;
        DELETE FROM lease.lease_modifications WHERE contract_id = @contract_id;
        DELETE FROM lease.lease_options WHERE contract_id = @contract_id;
        DELETE FROM lease.lease_origination WHERE contract_id = @contract_id;
        DELETE FROM lease.lease_renewals WHERE contract_id = @contract_id;
        DELETE FROM lease.break_clauses WHERE contract_id = @contract_id;
        DELETE FROM lease.insurance_policies WHERE contract_id = @contract_id;
        DELETE FROM lease.maintenance_tickets WHERE contract_id = @contract_id;
        DELETE FROM lease.modifications WHERE contract_id = @contract_id;
        DELETE FROM lease.remeasurement_events WHERE contract_id = @contract_id;
        DELETE FROM lease.renewal_notifications WHERE contract_id = @contract_id;
        DELETE FROM lease.renewals WHERE contract_id = @contract_id;
        DELETE FROM lease.rent_reviews WHERE contract_id = @contract_id;
        DELETE FROM lease.security_deposits WHERE contract_id = @contract_id;
        DELETE FROM lease.short_term_exemptions WHERE contract_id = @contract_id;
        DELETE FROM lease.sub_leases WHERE contract_id = @contract_id;
        DELETE FROM lease.termination_requests WHERE contract_id = @contract_id;
        DELETE FROM lease.variable_rent WHERE contract_id = @contract_id;
        DELETE FROM lease.furnished_assets WHERE contract_id = @contract_id;
        DELETE FROM lease.esg_carbon WHERE contract_id = @contract_id;
        DELETE FROM lease.fx_revaluation_log WHERE contract_id = @contract_id;
        DELETE FROM lease.fx_translations WHERE contract_id = @contract_id;
        DELETE FROM lease.budget_lines WHERE contract_id = @contract_id;
        DELETE FROM lease.budget_variance WHERE contract_id = @contract_id;
        DELETE FROM lease.capital_projects WHERE contract_id = @contract_id;
        DELETE FROM lease.space_management WHERE contract_id = @contract_id;
        DELETE FROM lease.ti_allowances WHERE contract_id = @contract_id;
        DELETE FROM lease.loi_tracking WHERE contract_id = @contract_id;
        DELETE FROM lease.origination_requests WHERE contract_id = @contract_id;
        DELETE FROM lease.market_rent_benchmarks WHERE contract_id = @contract_id;
        DELETE FROM lease.transaction_drafts WHERE contract_id = @contract_id;
        DELETE FROM lease.ai_abstractions WHERE contract_id = @contract_id;
        DELETE FROM lease.asc842_amortisation WHERE contract_id = @contract_id;
        DELETE FROM lease.asc842_schedules WHERE contract_id = @contract_id;
        DELETE FROM lease.asc842_parallel WHERE contract_id = @contract_id;
        DELETE FROM lease.asset_deposit_deductions WHERE contract_id = @contract_id;
        DELETE FROM lease.asset_deposits WHERE contract_id = @contract_id;
        DELETE FROM lease.asset_checklist_items WHERE contract_id = @contract_id;
        DELETE FROM lease.asset_handover_checklists WHERE contract_id = @contract_id;
        DELETE FROM lease.bulk_operation_log WHERE contract_id = @contract_id;

        -- 4. Delete payables linked to this contract
        DELETE pl FROM payables.payment_run_lines pl
          INNER JOIN payables.invoices inv ON pl.invoice_id = inv.invoice_id
          WHERE inv.contract_id = @contract_id;
        DELETE FROM payables.invoices WHERE contract_id = @contract_id;

        -- 5. Delete workflow instances for this contract
        DELETE ut FROM workflow.user_tasks ut
          INNER JOIN workflow.process_instances pi ON ut.instance_id = pi.instance_id
          WHERE pi.business_key = CAST(@contract_id AS NVARCHAR(50)) AND pi.business_entity = 'Lease';
        DELETE FROM workflow.process_instances WHERE business_key = CAST(@contract_id AS NVARCHAR(50)) AND business_entity = 'Lease';

        -- 6. Delete maker-checker queue for this contract
        DELETE FROM security.maker_checker_queue WHERE record_id = CAST(@contract_id AS NVARCHAR(50)) AND record_type = 'Lease';

        -- 7. Delete the contract itself
        DELETE FROM lease.contracts WHERE contract_id = @contract_id;

        COMMIT TRANSACTION;

        SELECT 'SUCCESS' AS result, @contract_ref AS deleted_contract_ref;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
      END CATCH
    END
  `);
  console.log('SP lease.sp_HardDeleteLease created successfully');

  pool.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
