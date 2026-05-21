/**
 * VodaLease — Zeroise Transactional Data
 * Truncates all transactional/operational tables in correct FK dependency order.
 * PRESERVES: GL chart of accounts, screen_registry, system_settings, hr.staff,
 *            lessor.lessors (and sub-tables), accounting.txn_scenarios,
 *            workflow.process_definitions, security.mc_thresholds,
 *            finance.erp_export_configs, lease.ibr_rates, lease.fx_rates,
 *            lease.cpi_index, lease.alert_configs, dbo.lease_alert_configs
 */
import sql from 'mssql';

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  pool: { max: 5, min: 0, idleTimeoutMillis: 10000 },
};

async function run() {
  const pool = await sql.connect(cfg);

  // Tables to truncate in leaf-to-root order (children before parents)
  const truncateOrder = [
    // Accounting / JV lines first
    'accounting.jv_lines',
    'accounting.journal_vouchers',
    'accounting.jv_sequence',

    // Payables
    'payables.payment_run_lines',
    'payables.payment_runs',
    'payables.invoices',

    // Cheque
    'cheque.bounce_events',
    'cheque.cheque_register',
    'cheque.cheque_books',
    'cheque.cheque_signatories',
    'cheque.bank_accounts',

    // Bank reconciliation
    'bank.recon_exceptions',
    'bank.recon_matches',
    'bank.recon_rules',
    'bank.recon_sessions',
    'bank.bank_transactions',
    'bank.bank_statements',
    'bank.bank_accounts',

    // Lease sub-tables (children of lease.contracts)
    'lease.amortisation_schedule',
    'lease.asc842_amortisation',
    'lease.asc842_schedules',
    'lease.asc842_parallel',
    'lease.asset_checklist_items',
    'lease.asset_deposit_deductions',
    'lease.asset_deposits',
    'lease.asset_handover_checklists',
    'lease.break_clauses',
    'lease.budget_lines',
    'lease.budget_variance',
    'lease.bulk_operation_log',
    'lease.capital_projects',
    'lease.contract_documents',
    'lease.contract_metadata_values',
    'lease.contract_milestones',
    'lease.contract_modification_history',
    'lease.cost_centre_allocation',
    'lease.critical_dates',
    'lease.esg_carbon',
    'lease.furnished_assets',
    'lease.fx_revaluation_log',
    'lease.fx_translations',
    'lease.gl_postings',
    'lease.insurance_policies',
    'lease.lease_classification',
    'lease.lease_escalations',
    'lease.lease_incentives',
    'lease.lease_lessee_details',
    'lease.lease_modifications',
    'lease.lease_options',
    'lease.lease_origination',
    'lease.lease_renewals',
    'lease.loi_tracking',
    'lease.maintenance_tickets',
    'lease.market_rent_benchmarks',
    'lease.modifications',
    'lease.origination_requests',
    'lease.period_close',
    'lease.remeasurement_events',
    'lease.renewal_notifications',
    'lease.renewals',
    'lease.rent_reviews',
    'lease.security_deposits',
    'lease.short_term_exemptions',
    'lease.space_management',
    'lease.sub_leases',
    'lease.termination_requests',
    'lease.ti_allowances',
    'lease.transaction_drafts',
    'lease.variable_rent',
    'lease.ai_abstractions',
    'lease.import_staging',

    // Lease contracts (parent)
    'lease.contracts',
    'lease.entities',

    // Asset tables
    'asset.sub_asset_transactions',
    'asset.lease_sub_assets',
    'asset.asset_documents',
    'asset.asset_insurance_links',
    'asset.asset_maintenance_history',
    'asset.assets',

    // Lessee tables
    'lessee.lessee_bank_accounts',
    'lessee.lessee_signatories',
    'lessee.lessees',

    // Finance / GL
    'finance.gl_lines',
    'finance.gl_journals',
    'finance.budgets',
    'finance.erp_export_log',
    'finance.scenarios',

    // Workflow / Security
    'workflow.user_tasks',
    'workflow.process_instances',
    'security.maker_checker_queue',
    'security.delegations',
    'security.api_webhooks',

    // MIS
    'mis.daily_snapshot',

    // Ops
    'ops.work_orders',
    'ops.esignature_requests',
    'ops.desk_bookings',
    'ops.brokers',
    'ops.vendors',

    // Reporting
    'reporting.saved_reports',

    // Compliance logs
    'compliance.audit_log',
    'compliance.error_log',

    // Contract metadata (dbo)
    'dbo.contract_metadata_values',
  ];

  console.log('🗑️  Zeroing transactional data...\n');

  // Disable FK checks by using DELETE with no FK violations (truncate order handles it)
  for (const table of truncateOrder) {
    try {
      await pool.request().query(`DELETE FROM ${table}`);
      console.log(`  ✓ Cleared ${table}`);
    } catch (err) {
      // Try TRUNCATE if DELETE fails due to identity
      try {
        await pool.request().query(`TRUNCATE TABLE ${table}`);
        console.log(`  ✓ Truncated ${table}`);
      } catch (err2) {
        console.log(`  ⚠ Skipped ${table}: ${err2.message.substring(0, 80)}`);
      }
    }
  }

  // Reset JV sequence counter
  try {
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM accounting.jv_sequence)
        UPDATE accounting.jv_sequence SET last_number = 0
      ELSE
        INSERT INTO accounting.jv_sequence (last_number) VALUES (0)
    `);
    console.log('\n  ✓ Reset JV sequence to 0');
  } catch (e) {
    console.log('  ⚠ JV sequence reset skipped:', e.message.substring(0, 60));
  }

  // Verify counts
  console.log('\n📊 Verification:');
  const checkTables = [
    'lease.contracts', 'lease.amortisation_schedule',
    'accounting.journal_vouchers', 'payables.invoices',
    'cheque.cheque_register', 'lease.insurance_policies',
    'lease.maintenance_tickets', 'compliance.audit_log',
    'security.maker_checker_queue', 'workflow.process_instances',
  ];
  for (const t of checkTables) {
    const r = await pool.request().query(`SELECT COUNT(*) as cnt FROM ${t}`);
    console.log(`  ${t}: ${r.recordset[0].cnt} rows`);
  }

  // Confirm preserved tables
  console.log('\n✅ Preserved (unchanged):');
  const preserved = [
    'accounting.gl_chart_of_accounts',
    'security.screen_registry',
    'accounting.system_settings',
    'hr.staff',
    'lessor.lessors',
    'workflow.process_definitions',
    'security.mc_thresholds',
  ];
  for (const t of preserved) {
    const r = await pool.request().query(`SELECT COUNT(*) as cnt FROM ${t}`);
    console.log(`  ${t}: ${r.recordset[0].cnt} rows`);
  }

  await pool.close();
  console.log('\n✅ Zeroise complete.');
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
