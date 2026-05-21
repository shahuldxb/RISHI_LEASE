-- ============================================================
-- VodaLease Enterprise — Seed Data
-- ============================================================
USE leasing;
GO

-- ============================================================
-- CHART OF ACCOUNTS — IFRS 16 Lessee Accounts
-- ============================================================
DELETE FROM coa.accounts WHERE account_code LIKE '1%' OR account_code LIKE '2%' OR account_code LIKE '3%' OR account_code LIKE '4%' OR account_code LIKE '5%' OR account_code LIKE '6%' OR account_code LIKE '7%';

INSERT INTO coa.accounts (account_code, account_name, class, type, sub_type, ifrs16_flag, status) VALUES
-- ASSETS
('1100', 'Current Assets', 'Asset', 'Current', NULL, 0, 'Active'),
('1110', 'Cash and Cash Equivalents', 'Asset', 'Current', 'Cash', 0, 'Active'),
('1120', 'Trade Receivables', 'Asset', 'Current', 'Receivable', 0, 'Active'),
('1130', 'Prepayments', 'Asset', 'Current', 'Prepayment', 0, 'Active'),
('1140', 'Property, Plant and Equipment', 'Asset', 'NonCurrent', 'PPE', 0, 'Active'),
('1141', 'Owned Buildings', 'Asset', 'NonCurrent', 'PPE', 0, 'Active'),
('1142', 'Owned Vehicles', 'Asset', 'NonCurrent', 'PPE', 0, 'Active'),
('1143', 'Owned Equipment', 'Asset', 'NonCurrent', 'PPE', 0, 'Active'),
-- ROU ASSETS (IFRS 16)
('1200', 'Right-of-Use Assets', 'Asset', 'NonCurrent', 'ROU', 1, 'Active'),
('1201', 'ROU — Tower Sites', 'Asset', 'NonCurrent', 'ROU', 1, 'Active'),
('1202', 'ROU — Data Centres', 'Asset', 'NonCurrent', 'ROU', 1, 'Active'),
('1203', 'ROU — Retail Outlets', 'Asset', 'NonCurrent', 'ROU', 1, 'Active'),
('1204', 'ROU — Corporate Offices', 'Asset', 'NonCurrent', 'ROU', 1, 'Active'),
('1205', 'ROU — Staff Apartments', 'Asset', 'NonCurrent', 'ROU', 1, 'Active'),
('1206', 'ROU — Fleet Vehicles', 'Asset', 'NonCurrent', 'ROU', 1, 'Active'),
('1207', 'ROU — Warehouses', 'Asset', 'NonCurrent', 'ROU', 1, 'Active'),
('1208', 'ROU — Network Equipment', 'Asset', 'NonCurrent', 'ROU', 1, 'Active'),
('1210', 'Accumulated Depreciation — ROU Assets', 'Asset', 'NonCurrent', 'AccumDepr', 1, 'Active'),
('1211', 'Accum Depr — ROU Tower Sites', 'Asset', 'NonCurrent', 'AccumDepr', 1, 'Active'),
('1212', 'Accum Depr — ROU Data Centres', 'Asset', 'NonCurrent', 'AccumDepr', 1, 'Active'),
('1213', 'Accum Depr — ROU Retail Outlets', 'Asset', 'NonCurrent', 'AccumDepr', 1, 'Active'),
('1214', 'Accum Depr — ROU Corporate Offices', 'Asset', 'NonCurrent', 'AccumDepr', 1, 'Active'),
('1215', 'Accum Depr — ROU Fleet Vehicles', 'Asset', 'NonCurrent', 'AccumDepr', 1, 'Active'),
('1216', 'Accum Depr — ROU Network Equipment', 'Asset', 'NonCurrent', 'AccumDepr', 1, 'Active'),
-- LIABILITIES
('2100', 'Current Liabilities', 'Liability', 'Current', NULL, 0, 'Active'),
('2110', 'Trade Payables', 'Liability', 'Current', 'Payable', 0, 'Active'),
('2120', 'Accrued Expenses', 'Liability', 'Current', 'Accrual', 0, 'Active'),
('2130', 'Lease Liability — Current', 'Liability', 'Current', 'LeaseLiability', 1, 'Active'),
('2131', 'Lease Liability Current — Tower Sites', 'Liability', 'Current', 'LeaseLiability', 1, 'Active'),
('2132', 'Lease Liability Current — Data Centres', 'Liability', 'Current', 'LeaseLiability', 1, 'Active'),
('2133', 'Lease Liability Current — Retail Outlets', 'Liability', 'Current', 'LeaseLiability', 1, 'Active'),
('2134', 'Lease Liability Current — Fleet', 'Liability', 'Current', 'LeaseLiability', 1, 'Active'),
('2140', 'Make-Good Provision', 'Liability', 'Current', 'Provision', 1, 'Active'),
('2141', 'Make-Good Provision — Property', 'Liability', 'Current', 'Provision', 1, 'Active'),
('2200', 'Non-Current Liabilities', 'Liability', 'NonCurrent', NULL, 0, 'Active'),
('2210', 'Lease Liability — Non-Current', 'Liability', 'NonCurrent', 'LeaseLiability', 1, 'Active'),
('2211', 'Lease Liability NC — Tower Sites', 'Liability', 'NonCurrent', 'LeaseLiability', 1, 'Active'),
('2212', 'Lease Liability NC — Data Centres', 'Liability', 'NonCurrent', 'LeaseLiability', 1, 'Active'),
('2213', 'Lease Liability NC — Retail Outlets', 'Liability', 'NonCurrent', 'LeaseLiability', 1, 'Active'),
('2214', 'Lease Liability NC — Fleet', 'Liability', 'NonCurrent', 'LeaseLiability', 1, 'Active'),
-- EQUITY
('3100', 'Share Capital', 'Equity', 'Capital', NULL, 0, 'Active'),
('3200', 'Retained Earnings', 'Equity', 'Retained', NULL, 0, 'Active'),
-- INCOME
('4010', 'Service Revenue', 'Income', 'Revenue', 'Telecom', 0, 'Active'),
('4020', 'Roaming Revenue', 'Income', 'Revenue', 'Telecom', 0, 'Active'),
('4073', 'Sublease Income', 'Income', 'Revenue', 'Sublease', 1, 'Active'),
-- EXPENSES — IFRS 16
('5100', 'IFRS 16 Depreciation — ROU Assets', 'Expense', 'Depreciation', 'IFRS16', 1, 'Active'),
('5101', 'Depr — ROU Tower Sites', 'Expense', 'Depreciation', 'IFRS16', 1, 'Active'),
('5102', 'Depr — ROU Data Centres', 'Expense', 'Depreciation', 'IFRS16', 1, 'Active'),
('5103', 'Depr — ROU Retail Outlets', 'Expense', 'Depreciation', 'IFRS16', 1, 'Active'),
('5104', 'Depr — ROU Corporate Offices', 'Expense', 'Depreciation', 'IFRS16', 1, 'Active'),
('5105', 'Depr — ROU Fleet Vehicles', 'Expense', 'Depreciation', 'IFRS16', 1, 'Active'),
('5106', 'Depr — ROU Network Equipment', 'Expense', 'Depreciation', 'IFRS16', 1, 'Active'),
('5200', 'IFRS 16 Interest Expense', 'Expense', 'Interest', 'IFRS16', 1, 'Active'),
('5201', 'Interest — Tower Site Leases', 'Expense', 'Interest', 'IFRS16', 1, 'Active'),
('5202', 'Interest — Data Centre Leases', 'Expense', 'Interest', 'IFRS16', 1, 'Active'),
('5203', 'Interest — Retail Outlet Leases', 'Expense', 'Interest', 'IFRS16', 1, 'Active'),
('5204', 'Interest — Fleet Leases', 'Expense', 'Interest', 'IFRS16', 1, 'Active'),
-- SHORT-TERM & LOW-VALUE
('5300', 'Short-Term Lease Expense', 'Expense', 'LeaseExpense', 'ShortTerm', 1, 'Active'),
('5301', 'Low-Value Lease Expense', 'Expense', 'LeaseExpense', 'LowValue', 1, 'Active'),
-- OPERATIONAL EXPENSES
('6010', 'Tower Site Operating Costs', 'Expense', 'Operating', 'Telecom', 0, 'Active'),
('6020', 'Network Maintenance', 'Expense', 'Operating', 'Telecom', 0, 'Active'),
('6030', 'Fleet Operating Costs', 'Expense', 'Operating', 'Fleet', 0, 'Active'),
('6040', 'Office Running Costs', 'Expense', 'Operating', 'Admin', 0, 'Active'),
('6050', 'Insurance Expense', 'Expense', 'Operating', 'Insurance', 0, 'Active'),
('6060', 'Maintenance and Repairs', 'Expense', 'Operating', 'Maintenance', 0, 'Active'),
-- FINANCE
('7010', 'Bank Charges', 'Expense', 'Finance', 'Banking', 0, 'Active'),
('7020', 'FX Gains and Losses', 'Expense', 'Finance', 'FX', 0, 'Active');
GO

-- ============================================================
-- SCREEN REGISTRY
-- ============================================================
DELETE FROM security.screen_registry;
INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, screen_type, route, allowed_roles) VALUES
('VFLSEDASH0001P001', 'Main Dashboard', 'Dashboard', NULL, 'Dashboard', '/', '["SuperAdmin","FinanceManager","LeaseMaker","LeaseChecker","MISAnalyst","ReadOnly"]'),
('VFLSEREGSC0001P001', 'Lease Register', 'Lease', 'Register', 'List', '/leases', '["SuperAdmin","FinanceManager","LeaseMaker","LeaseChecker","PropertyOfficer","FleetOfficer","ReadOnly"]'),
('VFLSENEWLSE0001P001', 'New Lease Origination', 'Lease', 'Origination', 'Form', '/leases/new', '["SuperAdmin","FinanceManager","LeaseMaker","PropertyOfficer","FleetOfficer"]'),
('VFLSEDETAIL0001P001', 'Lease Detail', 'Lease', 'Detail', 'Form', '/leases/:id', '["SuperAdmin","FinanceManager","LeaseMaker","LeaseChecker","PropertyOfficer","FleetOfficer","ReadOnly"]'),
('VFLSEAMORT0001P001', 'Amortisation Schedule', 'Lease', 'Amortisation', 'List', '/leases/:id/schedule', '["SuperAdmin","FinanceManager","LeaseMaker","LeaseChecker","ReadOnly"]'),
('VFLSEMODIFY0001P001', 'Lease Modification', 'Lease', 'Modification', 'Form', '/leases/:id/modify', '["SuperAdmin","FinanceManager","LeaseMaker"]'),
('VFLSETERM0001P001', 'Lease Termination', 'Lease', 'Termination', 'Form', '/leases/:id/terminate', '["SuperAdmin","FinanceManager"]'),
('VFLSELESREG0001P001', 'Lessor Register', 'Lease', 'Lessor', 'List', '/lessors', '["SuperAdmin","FinanceManager","LeaseMaker","ReadOnly"]'),
('VFPAYINVREG0001P001', 'Invoice Register', 'Payables', 'Invoice', 'List', '/payables/invoices', '["SuperAdmin","FinanceManager","PayablesMaker","PayablesChecker","ReadOnly"]'),
('VFPAYINVNEW0001P001', 'New Invoice', 'Payables', 'Invoice', 'Form', '/payables/invoices/new', '["SuperAdmin","FinanceManager","PayablesMaker"]'),
('VFPAYPAYRUN0001P001', 'Payment Run', 'Payables', 'PaymentRun', 'Form', '/payables/payment-runs', '["SuperAdmin","FinanceManager","PayablesMaker","PayablesChecker"]'),
('VFFINGLREG0001P001', 'GL Journal Register', 'Finance', 'GL', 'List', '/finance/journals', '["SuperAdmin","FinanceManager","ReadOnly"]'),
('VFFINBUDGET0001P001', 'Budget Management', 'Finance', 'Budget', 'List', '/finance/budgets', '["SuperAdmin","FinanceManager"]'),
('VFMCQUEUE0001P001', 'Maker/Checker Queue', 'Workflow', 'MakerChecker', 'List', '/workflow/queue', '["SuperAdmin","FinanceManager","LeaseChecker","PayablesChecker"]'),
('VFWKFDSCS0001P001', 'Workflow Dashboard', 'Workflow', 'BPMN', 'Dashboard', '/workflow', '["SuperAdmin","FinanceManager"]'),
('VFWKFTASKS0002P001', 'My Task Inbox', 'Workflow', 'Tasks', 'List', '/workflow/tasks', '["SuperAdmin","FinanceManager","LeaseMaker","LeaseChecker","PayablesMaker","PayablesChecker"]'),
('VFWKFACTNS0003P001', 'Task Action Panel', 'Workflow', 'Tasks', 'Form', '/workflow/tasks/:id', '["SuperAdmin","FinanceManager","LeaseMaker","LeaseChecker","PayablesMaker","PayablesChecker"]'),
('VFWKFMODS0004P001', 'BPMN Process Modeler', 'Workflow', 'Modeler', 'Modeler', '/workflow/modeler', '["SuperAdmin"]'),
('VFWKFESCL0006P001', 'Escalation Management', 'Workflow', 'Escalation', 'List', '/workflow/escalations', '["SuperAdmin","FinanceManager"]'),
('VFMISPORT0001P001', 'Portfolio Health Dashboard', 'MIS', 'Portfolio', 'Dashboard', '/mis/portfolio', '["SuperAdmin","FinanceManager","MISAnalyst","ReadOnly"]'),
('VFMISCOST0001P001', 'Cost Performance', 'MIS', 'Cost', 'Dashboard', '/mis/cost', '["SuperAdmin","FinanceManager","MISAnalyst","ReadOnly"]'),
('VFMISMATURITY0001P001', 'Lease Maturity Pipeline', 'MIS', 'Maturity', 'Dashboard', '/mis/maturity', '["SuperAdmin","FinanceManager","MISAnalyst","ReadOnly"]'),
('VFMISCASH0001P001', 'Cash Flow Forecast', 'MIS', 'CashFlow', 'Dashboard', '/mis/cashflow', '["SuperAdmin","FinanceManager","MISAnalyst","ReadOnly"]'),
('VFMISGENAI0001P001', 'GenAI Query Panel', 'MIS', 'GenAI', 'Dashboard', '/mis/genai', '["SuperAdmin","FinanceManager","MISAnalyst"]'),
('VFMISANOM0001P001', 'Anomaly Detection Queue', 'MIS', 'Anomaly', 'List', '/mis/anomalies', '["SuperAdmin","FinanceManager","MISAnalyst"]'),
('VFMISRPTBLD0001P001', 'Custom Report Builder', 'MIS', 'Reports', 'Form', '/mis/reports', '["SuperAdmin","FinanceManager","MISAnalyst"]'),
('VFINSREG0001P001', 'Insurance Policy Register', 'Operations', 'Insurance', 'List', '/operations/insurance', '["SuperAdmin","FinanceManager","PropertyOfficer","ReadOnly"]'),
('VFLSEMNT0001P001', 'Maintenance Tickets', 'Operations', 'Maintenance', 'List', '/operations/maintenance', '["SuperAdmin","FinanceManager","PropertyOfficer","FleetOfficer"]'),
('VFESGREP0001P001', 'ESG Sustainability Dashboard', 'Operations', 'ESG', 'Dashboard', '/operations/esg', '["SuperAdmin","FinanceManager","MISAnalyst","ReadOnly"]'),
('VFALTCENSC0001P001', 'Alert Centre', 'Compliance', 'Alerts', 'List', '/compliance/alerts', '["SuperAdmin","FinanceManager","LeaseMaker","LeaseChecker","PayablesMaker","PayablesChecker"]'),
('VFAUDLOG0001P001', 'Audit Log', 'Compliance', 'Audit', 'List', '/compliance/audit', '["SuperAdmin","Auditor","FinanceManager"]'),
('VFERRLOG0001P001', 'Error Log', 'Compliance', 'Errors', 'List', '/compliance/errors', '["SuperAdmin","ITAdmin","FinanceManager"]'),
('VFSECUSR0001P001', 'User Management', 'Security', 'Users', 'List', '/security/users', '["SuperAdmin","ITAdmin"]'),
('VFSECRBAC0001P001', 'RBAC Configuration', 'Security', 'RBAC', 'Form', '/security/rbac', '["SuperAdmin"]'),
('VFSECTHRESH0001P001', 'MC Threshold Configuration', 'Security', 'Thresholds', 'Form', '/security/thresholds', '["SuperAdmin","FinanceManager"]');
GO

-- ============================================================
-- MAKER/CHECKER THRESHOLDS (Configurable)
-- ============================================================
DELETE FROM security.mc_thresholds;
INSERT INTO security.mc_thresholds (module, role, max_amount, currency) VALUES
('Lease', 'LeaseChecker', 100000, 'USD'),
('Lease', 'FinanceManager', 500000, 'USD'),
('Lease', 'CFO', 2000000, 'USD'),
('Lease', 'Board', NULL, 'USD'),
('Invoice', 'PayablesChecker', 50000, 'USD'),
('Invoice', 'FinanceManager', 500000, 'USD'),
('PaymentRun', 'PayablesChecker', 100000, 'USD'),
('PaymentRun', 'FinanceManager', 1000000, 'USD');
GO

-- ============================================================
-- BPMN PROCESS DEFINITIONS (Seed core workflows)
-- ============================================================
DELETE FROM workflow.process_definitions;
INSERT INTO workflow.process_definitions (process_key, version, name, bpmn_xml, is_active) VALUES
('LEASE_APPROVAL', 1, 'Lease Contract Approval', '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="LEASE_APPROVAL" isExecutable="true"><startEvent id="start"/><userTask id="checker_review" name="Checker Review"/><exclusiveGateway id="decision"/><endEvent id="approved"/><endEvent id="rejected"/></process></definitions>', 1),
('INVOICE_APPROVAL', 1, 'Invoice Approval', '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="INVOICE_APPROVAL" isExecutable="true"><startEvent id="start"/><userTask id="checker_review" name="Invoice Checker Review"/><endEvent id="end"/></process></definitions>', 1),
('PAYMENT_RUN', 1, 'Payment Run Approval', '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="PAYMENT_RUN" isExecutable="true"><startEvent id="start"/><userTask id="checker_review" name="Payment Run Approval"/><serviceTask id="generate_file" name="Generate Bank File"/><endEvent id="end"/></process></definitions>', 1),
('LEASE_MODIFICATION', 1, 'Lease Modification', '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="LEASE_MODIFICATION" isExecutable="true"><startEvent id="start"/><userTask id="review" name="Modification Review"/><endEvent id="end"/></process></definitions>', 1),
('LTO_TRANSFER', 1, 'LTO Ownership Transfer', '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="LTO_TRANSFER" isExecutable="true"><startEvent id="start"/><userTask id="legal_review" name="Legal Title Transfer"/><serviceTask id="reclassify" name="Reclassify to PPE"/><endEvent id="end"/></process></definitions>', 1);
GO

PRINT 'Seed data inserted successfully.';
GO
