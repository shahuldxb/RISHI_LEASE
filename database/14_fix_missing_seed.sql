-- Fix missing seed data — targets only empty tables
SET NOCOUNT ON;
GO

-- ============================================================
-- WORKFLOW PROCESS INSTANCES (0 rows)
-- ============================================================
DECLARE @lease_def INT = (SELECT TOP 1 definition_id FROM workflow.process_definitions WHERE process_key='LEASE_APPROVAL');
DECLARE @inv_def   INT = (SELECT TOP 1 definition_id FROM workflow.process_definitions WHERE process_key='INVOICE_APPROVAL');
DECLARE @pmt_def   INT = (SELECT TOP 1 definition_id FROM workflow.process_definitions WHERE process_key='PAYMENT_RUN');
IF @lease_def IS NULL SET @lease_def = 1;
IF @inv_def   IS NULL SET @inv_def   = 2;
IF @pmt_def   IS NULL SET @pmt_def   = 3;

INSERT INTO workflow.process_instances (instance_ref,definition_id,process_key,business_key,business_entity,variables_json,current_task,status,started_by,started_at,completed_at) VALUES
('WFI-2025-000001',@lease_def,'LEASE_APPROVAL','LSE-2025-000025','lease_contract','{"contract_id":25,"amount":96000,"currency":"AED"}','l1_checker_review','Active',1,'2025-04-20 09:00:00',NULL),
('WFI-2025-000002',@inv_def,  'INVOICE_APPROVAL','INV-2025-000021','invoice','{"invoice_id":21,"amount":46410,"currency":"AED"}','checker_review','Active',1,'2025-04-21 10:30:00',NULL),
('WFI-2025-000003',@inv_def,  'INVOICE_APPROVAL','INV-2025-000022','invoice','{"invoice_id":22,"amount":60900,"currency":"AED"}','checker_review','Active',1,'2025-04-21 11:00:00',NULL),
('WFI-2025-000004',@pmt_def,  'PAYMENT_RUN','PMT-2025-000004','payment_run','{"run_id":8,"amount":198450,"currency":"AED"}','checker_review','Active',1,'2025-04-22 08:00:00',NULL),
('WFI-2025-000005',@lease_def,'LEASE_APPROVAL','LSE-2022-000001','lease_contract','{"contract_id":1,"amount":45000,"currency":"AED"}','end','Completed',1,'2021-12-10 09:00:00','2021-12-15 14:30:00'),
('WFI-2025-000006',@inv_def,  'INVOICE_APPROVAL','INV-2024-000001','invoice','{"invoice_id":1,"amount":49875,"currency":"AED"}','end','Completed',1,'2024-01-06 09:00:00','2024-01-08 11:00:00'),
('WFI-2025-000007',@inv_def,  'INVOICE_APPROVAL','INV-2025-000023','invoice','{"invoice_id":23,"amount":137550,"currency":"AED"}','checker_review','Active',1,'2025-04-22 14:00:00',NULL),
('WFI-2025-000008',@pmt_def,  'PAYMENT_RUN','PMT-2025-000003','payment_run','{"run_id":7,"amount":510225,"currency":"AED"}','checker_review','Active',1,'2025-04-22 15:00:00',NULL);
GO

-- Fix user_tasks that reference the new instances
DELETE FROM workflow.user_tasks;
GO
INSERT INTO workflow.user_tasks (task_ref,instance_id,task_key,task_name,assigned_role,assigned_user_id,priority,due_date,sla_hours,status,claimed_by,claimed_at) VALUES
('TSK-2025-000001',1,'l1_checker_review','L1 Checker — Review Lease LSE-2025-000025','LeaseChecker',1,80,'2025-04-25 17:00:00',48,'Open',NULL,NULL),
('TSK-2025-000002',2,'checker_review','Invoice Checker — INV-2025-000021','PayablesChecker',1,60,'2025-04-24 17:00:00',24,'Claimed',1,'2025-04-21 14:00:00'),
('TSK-2025-000003',3,'checker_review','Invoice Checker — INV-2025-000022','PayablesChecker',1,60,'2025-04-24 17:00:00',24,'Open',NULL,NULL),
('TSK-2025-000004',4,'checker_review','Payment Run Approval — PMT-2025-000004','FinanceManager',1,90,'2025-04-25 12:00:00',24,'Open',NULL,NULL),
('TSK-2025-000005',7,'checker_review','Invoice Checker — INV-2025-000023','PayablesChecker',1,50,'2025-04-25 17:00:00',24,'Open',NULL,NULL),
('TSK-2025-000006',8,'checker_review','Payment Run Approval — PMT-2025-000003','FinanceManager',1,85,'2025-04-26 12:00:00',24,'Open',NULL,NULL),
('TSK-2021-000001',5,'l1_checker_review','L1 Checker — LSE-2022-000001','LeaseChecker',1,80,'2021-12-14 17:00:00',48,'Completed',1,'2021-12-12 09:00:00'),
('TSK-2024-000001',6,'checker_review','Invoice Checker — INV-2024-000001','PayablesChecker',1,60,'2024-01-09 17:00:00',24,'Completed',1,'2024-01-07 10:00:00');
GO

-- ============================================================
-- MAKER/CHECKER QUEUE (no status column — use outcome=NULL for pending)
-- ============================================================
DELETE FROM security.maker_checker_queue;
GO
INSERT INTO security.maker_checker_queue (queue_ref,module,record_type,record_id,record_summary,value,currency,submitted_by,submitted_at,checker_id,actioned_at,outcome,sla_due_at) VALUES
('MCQ-2025-000001','Lease','Create',25,'New Lease LSE-2025-000025 — Al Habtoor City 5G Tower',96000,'AED',1,'2025-04-20 09:00:00',NULL,NULL,NULL,'2025-04-22 09:00:00'),
('MCQ-2025-000002','Invoice','Approve',21,'Invoice INV-2025-000021 — Aldar Properties AED 46,410',46410,'AED',1,'2025-04-21 10:30:00',NULL,NULL,NULL,'2025-04-23 10:30:00'),
('MCQ-2025-000003','Invoice','Approve',22,'Invoice INV-2025-000022 — Nakheel PJSC AED 60,900',60900,'AED',1,'2025-04-21 11:00:00',NULL,NULL,NULL,'2025-04-23 11:00:00'),
('MCQ-2025-000004','PaymentRun','Approve',8,'Payment Run PMT-2025-000004 — SWIFT AED 198,450',198450,'AED',1,'2025-04-22 08:00:00',NULL,NULL,NULL,'2025-04-24 08:00:00'),
('MCQ-2025-000005','Invoice','Approve',23,'Invoice INV-2025-000023 — Majid Al Futtaim AED 137,550',137550,'AED',1,'2025-04-22 14:00:00',NULL,NULL,NULL,'2025-04-24 14:00:00'),
('MCQ-2025-000006','PaymentRun','Approve',7,'Payment Run PMT-2025-000003 — EFT AED 510,225',510225,'AED',1,'2025-04-22 15:00:00',NULL,NULL,NULL,'2025-04-24 15:00:00'),
('MCQ-2024-000001','Invoice','Approve',1,'Invoice INV-2024-000001 — Emaar Properties AED 49,875',49875,'AED',1,'2024-01-06 09:00:00',1,'2024-01-08 11:00:00','Approved','2024-01-08 09:00:00'),
('MCQ-2024-000002','Invoice','Approve',3,'Invoice INV-2024-000003 — Dubai Properties AED 203,175',203175,'AED',1,'2024-01-10 09:00:00',1,'2024-01-12 10:00:00','Approved','2024-01-12 09:00:00'),
('MCQ-2024-000003','PaymentRun','Approve',1,'Payment Run PMT-2024-000001 — SWIFT AED 647,115',647115,'AED',1,'2024-01-26 09:00:00',1,'2024-01-27 14:00:00','Approved','2024-01-28 09:00:00');
GO

-- ============================================================
-- CHEQUE BOOKS (available_leaves is computed, omit it)
-- ============================================================
INSERT INTO cheque.cheque_books (bank_account_id,book_number,series_from,series_to,total_leaves,issued_leaves,voided_leaves,status,received_date) VALUES
(1,'ENBD-CHQ-2024-001','000101','000200',100,45,2,'Active',  '2024-01-15'),
(1,'ENBD-CHQ-2024-002','000201','000300',100, 8,0,'Active',  '2024-07-01'),
(2,'ADCB-CHQ-2024-001','100101','100200',100,22,1,'Active',  '2024-02-01'),
(3,'FAB-CHQ-2024-001', '200101','200200',100,15,0,'Active',  '2024-03-15'),
(1,'ENBD-CHQ-2023-001','000001','000100',100,98,2,'Exhausted','2023-01-10');
GO

-- ============================================================
-- CHEQUE REGISTER
-- ============================================================
INSERT INTO cheque.cheque_register (cheque_book_id,cheque_number,bank_account_id,payee_name,lessor_id,payment_run_id,invoice_ref,amount,currency,issue_date,presented_date,cleared_date,status,signature_type,signatory_1_id,signatory_2_id) VALUES
(1,'000101',1,'Emaar Properties PJSC',        1,1,'INV-2024-000001', 49875,'AED','2024-01-28','2024-01-30','2024-02-01','Cleared','Dual',1,3),
(1,'000102',1,'DAMAC Real Estate Development',2,1,'INV-2024-000002', 42315,'AED','2024-01-28','2024-01-31','2024-02-02','Cleared','Dual',1,3),
(1,'000103',1,'Dubai Properties Group',       5,1,'INV-2024-000003',203175,'AED','2024-01-28','2024-02-01','2024-02-03','Cleared','Dual',1,3),
(1,'000104',1,'Meraas Holding LLC',           8,1,'INV-2024-000004',351750,'AED','2024-01-28','2024-02-02','2024-02-04','Cleared','Dual',1,3),
(1,'000105',1,'Emaar Properties PJSC',        1,2,'INV-2024-000005', 49875,'AED','2024-02-26','2024-02-28','2024-03-01','Cleared','Dual',1,3),
(1,'000106',1,'Aldar Properties PJSC',        3,2,'INV-2024-000008', 46410,'AED','2024-02-26','2024-02-29','2024-03-02','Cleared','Dual',1,3),
(1,'000107',1,'Nakheel PJSC',                 4,3,'INV-2024-000009', 60900,'AED','2024-03-28','2024-03-30','2024-04-01','Cleared','Dual',1,3),
(1,'000108',1,'Majid Al Futtaim Properties',  6,3,'INV-2024-000010',137550,'AED','2024-03-28','2024-03-31','2024-04-02','Cleared','Dual',1,3),
(1,'000141',1,'Emaar Properties PJSC',        1,6,'INV-2025-000016', 49875,'AED','2025-04-25','2025-04-26',NULL,'Presented','Dual',1,3),
(1,'000142',1,'DAMAC Real Estate Development',2,6,'INV-2025-000017', 42315,'AED','2025-04-25','2025-04-26',NULL,'Presented','Dual',1,3),
(1,'000143',1,'Dubai Properties Group',       5,6,'INV-2025-000018',203175,'AED','2025-04-25',NULL,NULL,'Issued','Dual',1,3),
(1,'000144',1,'Meraas Holding LLC',           8,6,'INV-2025-000019',351750,'AED','2025-04-25',NULL,NULL,'Issued','Dual',1,3),
(1,'000145',1,'Dubai South Properties',       9,6,'INV-2025-000020',306600,'AED','2025-04-25',NULL,NULL,'Issued','Dual',1,3),
(1,'000130',1,'Sobha Realty LLC',            10,NULL,'INV-2025-000025',104475,'AED','2025-03-28','2025-03-30',NULL,'Bounced','Dual',1,3),
(1,'000120',1,'VOID — Damaged Leaf',        NULL,NULL,NULL,0,'AED','2024-06-15',NULL,NULL,'Void','Single',1,NULL);
GO

-- ============================================================
-- BANK TRANSACTIONS
-- ============================================================
INSERT INTO bank.bank_transactions (statement_id,account_id,txn_date,value_date,txn_type,amount,currency,narrative,reference,counterparty,recon_status) VALUES
(1,1,'2025-03-03','2025-03-03','Debit',  49875,'AED','LEASE PMT — EMAAR PROPERTIES',        'REF-EMR-0301','Emaar Properties PJSC',        'Matched'),
(1,1,'2025-03-03','2025-03-03','Debit',  42315,'AED','LEASE PMT — DAMAC REAL ESTATE',        'REF-DAM-0301','DAMAC Real Estate Development',  'Matched'),
(1,1,'2025-03-05','2025-03-05','Debit', 203175,'AED','LEASE PMT — DUBAI PROPERTIES GROUP',   'REF-DPG-0301','Dubai Properties Group',          'Matched'),
(1,1,'2025-03-05','2025-03-05','Debit', 351750,'AED','LEASE PMT — MERAAS HOLDING',           'REF-MER-0301','Meraas Holding LLC',              'Matched'),
(1,1,'2025-03-10','2025-03-10','Debit', 306600,'AED','LEASE PMT — DUBAI SOUTH PROPERTIES',   'REF-DSP-0301','Dubai South Properties',          'Matched'),
(1,1,'2025-03-15','2025-03-15','Debit',1200000,'AED','SALARY TRANSFER — MARCH 2025',         'SAL-2025-03', 'WPS Payroll',                     'Unmatched'),
(1,1,'2025-03-20','2025-03-20','Debit', 285000,'AED','VENDOR PMT — ERICSSON MIDDLE EAST',    'VND-ERI-0301','Ericsson Middle East',            'Unmatched'),
(1,1,'2025-03-25','2025-03-25','Credit',2000000,'AED','INTERCO TRANSFER FROM VODAFONE EGYPT','ICO-EGY-0301','Vodafone Egypt',                  'Matched'),
(1,1,'2025-03-28','2025-03-28','Debit',   1285,'AED','BANK CHARGES — MARCH 2025',            'CHG-2025-03', 'Emirates NBD',                    'Matched'),
(1,1,'2025-03-31','2025-03-31','Credit',1260000,'AED','INTEREST EARNED — MARCH 2025',        'INT-2025-03', 'Emirates NBD',                    'Matched'),
-- Feb statement transactions
(2,1,'2025-02-03','2025-02-03','Debit',  49875,'AED','LEASE PMT — EMAAR PROPERTIES',        'REF-EMR-0201','Emaar Properties PJSC',           'Matched'),
(2,1,'2025-02-03','2025-02-03','Debit',  42315,'AED','LEASE PMT — DAMAC REAL ESTATE',        'REF-DAM-0201','DAMAC Real Estate Development',   'Matched'),
(2,1,'2025-02-05','2025-02-05','Debit', 203175,'AED','LEASE PMT — DUBAI PROPERTIES GROUP',   'REF-DPG-0201','Dubai Properties Group',           'Matched'),
(2,1,'2025-02-05','2025-02-05','Debit', 351750,'AED','LEASE PMT — MERAAS HOLDING',           'REF-MER-0201','Meraas Holding LLC',               'Matched'),
(2,1,'2025-02-10','2025-02-10','Debit', 306600,'AED','LEASE PMT — DUBAI SOUTH PROPERTIES',   'REF-DSP-0201','Dubai South Properties',           'Matched'),
(2,1,'2025-02-15','2025-02-15','Debit',1200000,'AED','SALARY TRANSFER — FEBRUARY 2025',      'SAL-2025-02', 'WPS Payroll',                     'Matched'),
(2,1,'2025-02-25','2025-02-25','Credit',2000000,'AED','INTERCO TRANSFER FROM VODAFONE EGYPT','ICO-EGY-0201','Vodafone Egypt',                  'Matched'),
(2,1,'2025-02-28','2025-02-28','Debit',   1285,'AED','BANK CHARGES — FEBRUARY 2025',         'CHG-2025-02', 'Emirates NBD',                    'Matched'),
(2,1,'2025-02-28','2025-02-28','Credit', 255000,'AED','INTEREST EARNED — FEBRUARY 2025',     'INT-2025-02', 'Emirates NBD',                    'Matched');
GO

-- ============================================================
-- RECON SESSIONS (if not already there)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM bank.recon_sessions WHERE session_ref='RECON-2025-03-001')
INSERT INTO bank.recon_sessions (session_ref,account_id,statement_id,period_from,period_to,opening_balance,closing_balance_bank,closing_balance_gl,difference,total_bank_txns,matched_count,unmatched_bank,unmatched_gl,status,maker_id) VALUES
('RECON-2025-03-001',1,1,'2025-03-01','2025-03-31',14200000,12500000,12500000,0,10,8,2,0,'Open',1);
GO
IF NOT EXISTS (SELECT 1 FROM bank.recon_sessions WHERE session_ref='RECON-2025-02-001')
INSERT INTO bank.recon_sessions (session_ref,account_id,statement_id,period_from,period_to,opening_balance,closing_balance_bank,closing_balance_gl,difference,total_bank_txns,matched_count,unmatched_bank,unmatched_gl,status,maker_id) VALUES
('RECON-2025-02-001',1,2,'2025-02-01','2025-02-28',15800000,14200000,14200000,0,9,9,0,0,'Closed',1);
GO

PRINT 'Fix seed data inserted successfully.';
GO
