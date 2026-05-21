/**
 * Direct seed script — no GO batches, runs each statement programmatically
 */
import sql from 'mssql';

const config = {
  server: 'SQL_SERVER_HOST_REDACTED',
  database: 'leasing',
  user: 'SQL_USER_REDACTED',
  password: 'SQL_PASSWORD_REDACTED',
  options: { trustServerCertificate: true, encrypt: false, connectTimeout: 30000, requestTimeout: 120000 },
};

async function run(pool, label, query) {
  try {
    await pool.request().query(query);
    console.log(`✓ ${label}`);
  } catch (e) {
    console.error(`✗ ${label}: ${e.message.substring(0, 120)}`);
  }
}

async function main() {
  console.log('Connecting...');
  const pool = await sql.connect(config);
  console.log('Connected!\n');

  // ── WORKFLOW PROCESS INSTANCES ──────────────────────────────────────────
  const leaseDefId = (await pool.request().query(`SELECT TOP 1 definition_id FROM workflow.process_definitions WHERE process_key='LEASE_APPROVAL'`)).recordset[0]?.definition_id ?? 1;
  const invDefId   = (await pool.request().query(`SELECT TOP 1 definition_id FROM workflow.process_definitions WHERE process_key='INVOICE_APPROVAL'`)).recordset[0]?.definition_id ?? 2;
  const pmtDefId   = (await pool.request().query(`SELECT TOP 1 definition_id FROM workflow.process_definitions WHERE process_key='PAYMENT_RUN'`)).recordset[0]?.definition_id ?? 3;
  console.log(`Process def IDs: LEASE=${leaseDefId}, INVOICE=${invDefId}, PAYMENT=${pmtDefId}`);

  await run(pool, 'Clear process_instances', `DELETE FROM workflow.process_instances`);
  await run(pool, 'Insert WFI-2025-000001', `INSERT INTO workflow.process_instances (instance_ref,definition_id,process_key,business_key,business_entity,variables_json,current_task,status,started_by,started_at) VALUES ('WFI-2025-000001',${leaseDefId},'LEASE_APPROVAL','LSE-2025-000025','lease_contract','{"contract_id":25,"amount":96000}','l1_checker_review','Active',1,'2025-04-20 09:00:00')`);
  await run(pool, 'Insert WFI-2025-000002', `INSERT INTO workflow.process_instances (instance_ref,definition_id,process_key,business_key,business_entity,variables_json,current_task,status,started_by,started_at) VALUES ('WFI-2025-000002',${invDefId},'INVOICE_APPROVAL','INV-2025-000021','invoice','{"invoice_id":21,"amount":46410}','checker_review','Active',1,'2025-04-21 10:30:00')`);
  await run(pool, 'Insert WFI-2025-000003', `INSERT INTO workflow.process_instances (instance_ref,definition_id,process_key,business_key,business_entity,variables_json,current_task,status,started_by,started_at) VALUES ('WFI-2025-000003',${invDefId},'INVOICE_APPROVAL','INV-2025-000022','invoice','{"invoice_id":22,"amount":60900}','checker_review','Active',1,'2025-04-21 11:00:00')`);
  await run(pool, 'Insert WFI-2025-000004', `INSERT INTO workflow.process_instances (instance_ref,definition_id,process_key,business_key,business_entity,variables_json,current_task,status,started_by,started_at) VALUES ('WFI-2025-000004',${pmtDefId},'PAYMENT_RUN','PMT-2025-000004','payment_run','{"run_id":8,"amount":198450}','checker_review','Active',1,'2025-04-22 08:00:00')`);
  await run(pool, 'Insert WFI-2025-000005', `INSERT INTO workflow.process_instances (instance_ref,definition_id,process_key,business_key,business_entity,variables_json,current_task,status,started_by,started_at,completed_at) VALUES ('WFI-2025-000005',${leaseDefId},'LEASE_APPROVAL','LSE-2022-000001','lease_contract','{"contract_id":1}','end','Completed',1,'2021-12-10 09:00:00','2021-12-15 14:30:00')`);
  await run(pool, 'Insert WFI-2025-000006', `INSERT INTO workflow.process_instances (instance_ref,definition_id,process_key,business_key,business_entity,variables_json,current_task,status,started_by,started_at,completed_at) VALUES ('WFI-2025-000006',${invDefId},'INVOICE_APPROVAL','INV-2024-000001','invoice','{"invoice_id":1}','end','Completed',1,'2024-01-06 09:00:00','2024-01-08 11:00:00')`);
  await run(pool, 'Insert WFI-2025-000007', `INSERT INTO workflow.process_instances (instance_ref,definition_id,process_key,business_key,business_entity,variables_json,current_task,status,started_by,started_at) VALUES ('WFI-2025-000007',${invDefId},'INVOICE_APPROVAL','INV-2025-000023','invoice','{"invoice_id":23,"amount":137550}','checker_review','Active',1,'2025-04-22 14:00:00')`);
  await run(pool, 'Insert WFI-2025-000008', `INSERT INTO workflow.process_instances (instance_ref,definition_id,process_key,business_key,business_entity,variables_json,current_task,status,started_by,started_at) VALUES ('WFI-2025-000008',${pmtDefId},'PAYMENT_RUN','PMT-2025-000003','payment_run','{"run_id":7,"amount":510225}','checker_review','Active',1,'2025-04-22 15:00:00')`);

  // ── USER TASKS (re-insert with correct instance IDs) ─────────────────────
  // Get the actual instance IDs
  const instances = (await pool.request().query(`SELECT instance_id, instance_ref FROM workflow.process_instances ORDER BY instance_id`)).recordset;
  const imap = {};
  instances.forEach(i => { imap[i.instance_ref] = i.instance_id; });
  console.log('Instance map:', JSON.stringify(imap));

  await run(pool, 'Clear user_tasks', `DELETE FROM workflow.user_tasks`);
  await run(pool, 'Insert TSK-2025-000001', `INSERT INTO workflow.user_tasks (task_ref,instance_id,task_key,task_name,assigned_role,assigned_user_id,priority,due_date,sla_hours,status) VALUES ('TSK-2025-000001',${imap['WFI-2025-000001']},'l1_checker_review','L1 Checker — Review Lease LSE-2025-000025','LeaseChecker',1,80,'2025-04-25 17:00:00',48,'Open')`);
  await run(pool, 'Insert TSK-2025-000002', `INSERT INTO workflow.user_tasks (task_ref,instance_id,task_key,task_name,assigned_role,assigned_user_id,priority,due_date,sla_hours,status,claimed_by,claimed_at) VALUES ('TSK-2025-000002',${imap['WFI-2025-000002']},'checker_review','Invoice Checker — INV-2025-000021','PayablesChecker',1,60,'2025-04-24 17:00:00',24,'Claimed',1,'2025-04-21 14:00:00')`);
  await run(pool, 'Insert TSK-2025-000003', `INSERT INTO workflow.user_tasks (task_ref,instance_id,task_key,task_name,assigned_role,assigned_user_id,priority,due_date,sla_hours,status) VALUES ('TSK-2025-000003',${imap['WFI-2025-000003']},'checker_review','Invoice Checker — INV-2025-000022','PayablesChecker',1,60,'2025-04-24 17:00:00',24,'Open')`);
  await run(pool, 'Insert TSK-2025-000004', `INSERT INTO workflow.user_tasks (task_ref,instance_id,task_key,task_name,assigned_role,assigned_user_id,priority,due_date,sla_hours,status) VALUES ('TSK-2025-000004',${imap['WFI-2025-000004']},'checker_review','Payment Run Approval — PMT-2025-000004','FinanceManager',1,90,'2025-04-25 12:00:00',24,'Open')`);
  await run(pool, 'Insert TSK-2025-000005', `INSERT INTO workflow.user_tasks (task_ref,instance_id,task_key,task_name,assigned_role,assigned_user_id,priority,due_date,sla_hours,status) VALUES ('TSK-2025-000005',${imap['WFI-2025-000007']},'checker_review','Invoice Checker — INV-2025-000023','PayablesChecker',1,50,'2025-04-25 17:00:00',24,'Open')`);
  await run(pool, 'Insert TSK-2025-000006', `INSERT INTO workflow.user_tasks (task_ref,instance_id,task_key,task_name,assigned_role,assigned_user_id,priority,due_date,sla_hours,status) VALUES ('TSK-2025-000006',${imap['WFI-2025-000008']},'checker_review','Payment Run Approval — PMT-2025-000003','FinanceManager',1,85,'2025-04-26 12:00:00',24,'Open')`);
  await run(pool, 'Insert TSK-completed-1', `INSERT INTO workflow.user_tasks (task_ref,instance_id,task_key,task_name,assigned_role,assigned_user_id,priority,due_date,sla_hours,status,claimed_by,claimed_at,completed_by,completed_at,outcome) VALUES ('TSK-2021-000001',${imap['WFI-2025-000005']},'l1_checker_review','L1 Checker — LSE-2022-000001','LeaseChecker',1,80,'2021-12-14 17:00:00',48,'Completed',1,'2021-12-12 09:00:00',1,'2021-12-15 14:00:00','Approved')`);
  await run(pool, 'Insert TSK-completed-2', `INSERT INTO workflow.user_tasks (task_ref,instance_id,task_key,task_name,assigned_role,assigned_user_id,priority,due_date,sla_hours,status,claimed_by,claimed_at,completed_by,completed_at,outcome) VALUES ('TSK-2024-000001',${imap['WFI-2025-000006']},'checker_review','Invoice Checker — INV-2024-000001','PayablesChecker',1,60,'2024-01-09 17:00:00',24,'Completed',1,'2024-01-07 10:00:00',1,'2024-01-08 11:00:00','Approved')`);

  // ── CHEQUE BOOKS ─────────────────────────────────────────────────────────
  // Get cheque bank_account IDs
  const cbAccounts = (await pool.request().query(`SELECT account_id, bank_name FROM cheque.bank_accounts ORDER BY account_id`)).recordset;
  console.log('Cheque accounts:', cbAccounts.map(a => `${a.account_id}:${a.bank_name}`).join(', '));
  const acc1 = cbAccounts[0]?.account_id ?? 1;
  const acc2 = cbAccounts[1]?.account_id ?? 2;
  const acc3 = cbAccounts[2]?.account_id ?? 3;

  await run(pool, 'Insert cheque_book ENBD-2024-001', `INSERT INTO cheque.cheque_books (bank_account_id,book_number,series_from,series_to,total_leaves,issued_leaves,voided_leaves,status,received_date) VALUES (${acc1},'ENBD-CHQ-2024-001','000101','000200',100,45,2,'Active','2024-01-15')`);
  await run(pool, 'Insert cheque_book ENBD-2024-002', `INSERT INTO cheque.cheque_books (bank_account_id,book_number,series_from,series_to,total_leaves,issued_leaves,voided_leaves,status,received_date) VALUES (${acc1},'ENBD-CHQ-2024-002','000201','000300',100,8,0,'Active','2024-07-01')`);
  await run(pool, 'Insert cheque_book ADCB-2024-001', `INSERT INTO cheque.cheque_books (bank_account_id,book_number,series_from,series_to,total_leaves,issued_leaves,voided_leaves,status,received_date) VALUES (${acc2},'ADCB-CHQ-2024-001','100101','100200',100,22,1,'Active','2024-02-01')`);
  await run(pool, 'Insert cheque_book FAB-2024-001',  `INSERT INTO cheque.cheque_books (bank_account_id,book_number,series_from,series_to,total_leaves,issued_leaves,voided_leaves,status,received_date) VALUES (${acc3},'FAB-CHQ-2024-001','200101','200200',100,15,0,'Active','2024-03-15')`);
  await run(pool, 'Insert cheque_book ENBD-2023-001', `INSERT INTO cheque.cheque_books (bank_account_id,book_number,series_from,series_to,total_leaves,issued_leaves,voided_leaves,status,received_date) VALUES (${acc1},'ENBD-CHQ-2023-001','000001','000100',100,98,2,'Exhausted','2023-01-10')`);

  // Get book IDs
  const books = (await pool.request().query(`SELECT book_id, book_number FROM cheque.cheque_books ORDER BY book_id`)).recordset;
  const book1 = books.find(b => b.book_number === 'ENBD-CHQ-2024-001')?.book_id ?? 1;
  console.log(`Cheque book 1 ID: ${book1}`);

  // Get signatory IDs
  const sigs = (await pool.request().query(`SELECT signatory_id FROM cheque.cheque_signatories ORDER BY signatory_id`)).recordset;
  const sig1 = sigs[0]?.signatory_id ?? 1;
  const sig3 = sigs[2]?.signatory_id ?? 3;

  // ── CHEQUE REGISTER ───────────────────────────────────────────────────────
  const cheques = [
    [book1,'000101',acc1,'Emaar Properties PJSC',1,1,'INV-2024-000001',49875,'AED','2024-01-28','2024-01-30','2024-02-01','Cleared'],
    [book1,'000102',acc1,'DAMAC Real Estate Development',2,1,'INV-2024-000002',42315,'AED','2024-01-28','2024-01-31','2024-02-02','Cleared'],
    [book1,'000103',acc1,'Dubai Properties Group',5,1,'INV-2024-000003',203175,'AED','2024-01-28','2024-02-01','2024-02-03','Cleared'],
    [book1,'000104',acc1,'Meraas Holding LLC',8,1,'INV-2024-000004',351750,'AED','2024-01-28','2024-02-02','2024-02-04','Cleared'],
    [book1,'000105',acc1,'Emaar Properties PJSC',1,2,'INV-2024-000005',49875,'AED','2024-02-26','2024-02-28','2024-03-01','Cleared'],
    [book1,'000106',acc1,'Aldar Properties PJSC',3,2,'INV-2024-000008',46410,'AED','2024-02-26','2024-02-29','2024-03-02','Cleared'],
    [book1,'000107',acc1,'Nakheel PJSC',4,3,'INV-2024-000009',60900,'AED','2024-03-28','2024-03-30','2024-04-01','Cleared'],
    [book1,'000108',acc1,'Majid Al Futtaim Properties',6,3,'INV-2024-000010',137550,'AED','2024-03-28','2024-03-31','2024-04-02','Cleared'],
    [book1,'000141',acc1,'Emaar Properties PJSC',1,6,'INV-2025-000016',49875,'AED','2025-04-25','2025-04-26',null,'Presented'],
    [book1,'000142',acc1,'DAMAC Real Estate Development',2,6,'INV-2025-000017',42315,'AED','2025-04-25','2025-04-26',null,'Presented'],
    [book1,'000143',acc1,'Dubai Properties Group',5,6,'INV-2025-000018',203175,'AED','2025-04-25',null,null,'Issued'],
    [book1,'000144',acc1,'Meraas Holding LLC',8,6,'INV-2025-000019',351750,'AED','2025-04-25',null,null,'Issued'],
    [book1,'000145',acc1,'Dubai South Properties',9,6,'INV-2025-000020',306600,'AED','2025-04-25',null,null,'Issued'],
    [book1,'000130',acc1,'Sobha Realty LLC',10,null,'INV-2025-000025',104475,'AED','2025-03-28','2025-03-30',null,'Bounced'],
  ];

  for (const [bid,cnum,baid,payee,lid,prid,iref,amt,cur,iss,pres,clr,stat] of cheques) {
    const presVal = pres ? `'${pres}'` : 'NULL';
    const clrVal  = clr  ? `'${clr}'`  : 'NULL';
    const pridVal = prid ? prid : 'NULL';
    await run(pool, `Cheque ${cnum}`, `INSERT INTO cheque.cheque_register (cheque_book_id,cheque_number,bank_account_id,payee_name,lessor_id,payment_run_id,invoice_ref,amount,currency,issue_date,presented_date,cleared_date,status,signature_type,signatory_1_id,signatory_2_id) VALUES (${bid},'${cnum}',${baid},'${payee}',${lid},${pridVal},'${iref}',${amt},'${cur}','${iss}',${presVal},${clrVal},'${stat}','Dual',${sig1},${sig3})`);
  }

  // Void cheque
  await run(pool, 'Void cheque 000120', `INSERT INTO cheque.cheque_register (cheque_book_id,cheque_number,bank_account_id,payee_name,amount,currency,issue_date,status,signature_type,signatory_1_id) VALUES (${book1},'000120',${acc1},'VOID — Damaged Leaf',0,'AED','2024-06-15','Void','Single',${sig1})`);

  // ── BANK TRANSACTIONS ─────────────────────────────────────────────────────
  const bankAccounts = (await pool.request().query(`SELECT account_id, account_ref FROM bank.bank_accounts ORDER BY account_id`)).recordset;
  const ba1 = bankAccounts[0]?.account_id ?? 1;
  const stmts = (await pool.request().query(`SELECT statement_id, statement_ref FROM bank.bank_statements ORDER BY statement_id`)).recordset;
  const st1 = stmts.find(s => s.statement_ref === 'ENBD-STMT-2025-03')?.statement_id ?? 1;
  const st2 = stmts.find(s => s.statement_ref === 'ENBD-STMT-2025-02')?.statement_id ?? 2;
  console.log(`Bank account 1: ${ba1}, Statement Mar: ${st1}, Feb: ${st2}`);

  const txns = [
    [st1,ba1,'2025-03-03','2025-03-03','Debit',  49875,'AED','LEASE PMT — EMAAR PROPERTIES',        'REF-EMR-0301','Emaar Properties PJSC',        'Matched'],
    [st1,ba1,'2025-03-03','2025-03-03','Debit',  42315,'AED','LEASE PMT — DAMAC REAL ESTATE',        'REF-DAM-0301','DAMAC Real Estate Development',  'Matched'],
    [st1,ba1,'2025-03-05','2025-03-05','Debit', 203175,'AED','LEASE PMT — DUBAI PROPERTIES GROUP',   'REF-DPG-0301','Dubai Properties Group',          'Matched'],
    [st1,ba1,'2025-03-05','2025-03-05','Debit', 351750,'AED','LEASE PMT — MERAAS HOLDING',           'REF-MER-0301','Meraas Holding LLC',              'Matched'],
    [st1,ba1,'2025-03-10','2025-03-10','Debit', 306600,'AED','LEASE PMT — DUBAI SOUTH PROPERTIES',   'REF-DSP-0301','Dubai South Properties',          'Matched'],
    [st1,ba1,'2025-03-15','2025-03-15','Debit',1200000,'AED','SALARY TRANSFER — MARCH 2025',         'SAL-2025-03', 'WPS Payroll',                     'Unmatched'],
    [st1,ba1,'2025-03-20','2025-03-20','Debit', 285000,'AED','VENDOR PMT — ERICSSON MIDDLE EAST',    'VND-ERI-0301','Ericsson Middle East',            'Unmatched'],
    [st1,ba1,'2025-03-25','2025-03-25','Credit',2000000,'AED','INTERCO TRANSFER FROM VODAFONE EGYPT','ICO-EGY-0301','Vodafone Egypt',                  'Matched'],
    [st1,ba1,'2025-03-28','2025-03-28','Debit',   1285,'AED','BANK CHARGES — MARCH 2025',            'CHG-2025-03', 'Emirates NBD',                    'Matched'],
    [st1,ba1,'2025-03-31','2025-03-31','Credit',1260000,'AED','INTEREST EARNED — MARCH 2025',        'INT-2025-03', 'Emirates NBD',                    'Matched'],
    [st2,ba1,'2025-02-03','2025-02-03','Debit',  49875,'AED','LEASE PMT — EMAAR PROPERTIES',        'REF-EMR-0201','Emaar Properties PJSC',           'Matched'],
    [st2,ba1,'2025-02-03','2025-02-03','Debit',  42315,'AED','LEASE PMT — DAMAC REAL ESTATE',        'REF-DAM-0201','DAMAC Real Estate Development',   'Matched'],
    [st2,ba1,'2025-02-05','2025-02-05','Debit', 203175,'AED','LEASE PMT — DUBAI PROPERTIES GROUP',   'REF-DPG-0201','Dubai Properties Group',           'Matched'],
    [st2,ba1,'2025-02-05','2025-02-05','Debit', 351750,'AED','LEASE PMT — MERAAS HOLDING',           'REF-MER-0201','Meraas Holding LLC',               'Matched'],
    [st2,ba1,'2025-02-10','2025-02-10','Debit', 306600,'AED','LEASE PMT — DUBAI SOUTH PROPERTIES',   'REF-DSP-0201','Dubai South Properties',           'Matched'],
    [st2,ba1,'2025-02-15','2025-02-15','Debit',1200000,'AED','SALARY TRANSFER — FEBRUARY 2025',      'SAL-2025-02', 'WPS Payroll',                     'Matched'],
    [st2,ba1,'2025-02-25','2025-02-25','Credit',2000000,'AED','INTERCO TRANSFER FROM VODAFONE EGYPT','ICO-EGY-0201','Vodafone Egypt',                  'Matched'],
    [st2,ba1,'2025-02-28','2025-02-28','Debit',   1285,'AED','BANK CHARGES — FEBRUARY 2025',         'CHG-2025-02', 'Emirates NBD',                    'Matched'],
    [st2,ba1,'2025-02-28','2025-02-28','Credit', 255000,'AED','INTEREST EARNED — FEBRUARY 2025',     'INT-2025-02', 'Emirates NBD',                    'Matched'],
  ];

  for (const [sid,aid,td,vd,tt,amt,cur,nar,ref,cpty,rs] of txns) {
    await run(pool, `Txn ${ref}`, `INSERT INTO bank.bank_transactions (statement_id,account_id,txn_date,value_date,txn_type,amount,currency,narrative,reference,counterparty,recon_status) VALUES (${sid},${aid},'${td}','${vd}','${tt}',${amt},'${cur}','${nar}','${ref}','${cpty}','${rs}')`);
  }

  // ── FINAL COUNT ───────────────────────────────────────────────────────────
  console.log('\n=== Final row counts ===');
  const tables = ['workflow.process_instances','workflow.user_tasks','security.maker_checker_queue','cheque.cheque_books','cheque.cheque_register','bank.bank_transactions','bank.recon_sessions','lease.lessors','lease.contracts','payables.invoices','payables.payment_runs','lessor.lessors','asset.assets','mis.daily_snapshot'];
  for (const t of tables) {
    const r = await pool.request().query(`SELECT COUNT(*) as cnt FROM ${t}`);
    console.log(`  ${t}: ${r.recordset[0].cnt}`);
  }

  await pool.close();
  console.log('\nDone!');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
