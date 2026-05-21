-- Register screen IDs for the 4 new IFRS financial reporting screens
-- Columns: screen_id, screen_name, module, sub_module, screen_type, route, allowed_roles, created_at

IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id = 'VFLACCFNST0001P001')
  INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, screen_type, route, created_at)
  VALUES ('VFLACCFNST0001P001', 'Financial Statements', 'Accounting Engine', 'Financial Reporting',
    'Report', '/accounting/financial-statements', GETDATE());

IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id = 'VFLACCRLFW0001P001')
  INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, screen_type, route, created_at)
  VALUES ('VFLACCRLFW0001P001', 'Roll-Forward Report', 'Accounting Engine', 'Financial Reporting',
    'Report', '/accounting/roll-forward', GETDATE());

IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id = 'VFLACCTBAL0001P001')
  INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, screen_type, route, created_at)
  VALUES ('VFLACCTBAL0001P001', 'Trial Balance', 'Accounting Engine', 'Financial Reporting',
    'Report', '/accounting/trial-balance', GETDATE());

IF NOT EXISTS (SELECT 1 FROM security.screen_registry WHERE screen_id = 'VFLLSEEXRG0001P001')
  INSERT INTO security.screen_registry (screen_id, screen_name, module, sub_module, screen_type, route, created_at)
  VALUES ('VFLLSEEXRG0001P001', 'Exemption Register', 'Lease Management', 'Exemptions',
    'List', '/leases/exemption-register', GETDATE());
GO
