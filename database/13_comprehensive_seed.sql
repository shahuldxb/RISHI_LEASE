-- ============================================================
-- COMPREHENSIVE SEED DATA v2 — VodaLease Enterprise
-- Column names verified against live database schema
-- ============================================================
SET NOCOUNT ON;
GO

-- ============================================================
-- SECURITY USERS
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM security.users WHERE email = 'ahmed.al-rashid@vodafone.com')
INSERT INTO security.users (open_id, name, email, role, login_method) VALUES
('SYS_AHMED001',  'Ahmed Al-Rashid',    'ahmed.al-rashid@vodafone.com',   'admin','email'),
('SYS_FATIMA002', 'Fatima Al-Zaabi',    'fatima.al-zaabi@vodafone.com',   'user', 'email'),
('SYS_KHALID003', 'Khalid Al-Mansoori','khalid.al-mansoori@vodafone.com', 'user', 'email'),
('SYS_SARA004',   'Sara Hassan',        'sara.hassan@vodafone.com',       'user', 'email'),
('SYS_OMAR005',   'Omar Al-Farsi',      'omar.al-farsi@vodafone.com',     'user', 'email');
GO

-- ============================================================
-- LEASE LESSORS
-- ============================================================
DELETE FROM lease.lessors;
GO
INSERT INTO lease.lessors (lessor_ref, legal_name, registration_no, tax_no, country, currency, contact_json, status) VALUES
('LSR-2021-000001','Emaar Properties PJSC',           'REG-AE-2001-0012345','TRN-100234567890003','AE','AED','{"name":"Mohammed Al-Emaar","phone":"+971-4-367-3333","email":"leasing@emaar.ae"}','Active'),
('LSR-2021-000002','DAMAC Real Estate Development',   'REG-AE-2002-0023456','TRN-100345678901114','AE','AED','{"name":"Rania Khalid","phone":"+971-4-301-9999","email":"commercial@damac.ae"}','Active'),
('LSR-2021-000003','Aldar Properties PJSC',           'REG-AE-2004-0034567','TRN-100456789012225','AE','AED','{"name":"Tariq Al-Aldar","phone":"+971-2-810-5555","email":"leasing@aldar.com"}','Active'),
('LSR-2021-000004','Nakheel PJSC',                    'REG-AE-2000-0045678','TRN-100567890123336','AE','AED','{"name":"Hessa Al-Nakheel","phone":"+971-4-390-3333","email":"commercial@nakheel.com"}','Active'),
('LSR-2022-000005','Dubai Properties Group',          'REG-AE-2005-0056789','TRN-100678901234447','AE','AED','{"name":"Saeed Al-Dubai","phone":"+971-4-818-8888","email":"leasing@dubaiproperties.ae"}','Active'),
('LSR-2022-000006','Majid Al Futtaim Properties',     'REG-AE-1992-0067890','TRN-100789012345558','AE','AED','{"name":"Lina Futtaim","phone":"+971-4-294-9999","email":"commercial@maf.ae"}','Active'),
('LSR-2022-000007','Union Properties PJSC',           'REG-AE-1993-0078901','TRN-100890123456669','AE','AED','{"name":"Khalid Union","phone":"+971-4-885-3333","email":"leasing@up.ae"}','Active'),
('LSR-2022-000008','Meraas Holding LLC',              'REG-AE-2007-0089012','TRN-100901234567770','AE','AED','{"name":"Aisha Meraas","phone":"+971-4-317-3333","email":"leasing@meraas.ae"}','Active'),
('LSR-2023-000009','Dubai South Properties',          'REG-AE-2014-0090123','TRN-101012345678881','AE','AED','{"name":"Faisal South","phone":"+971-4-818-9999","email":"commercial@dubaisouth.ae"}','Active'),
('LSR-2023-000010','Sobha Realty LLC',                'REG-AE-1995-0101234','TRN-101123456789992','AE','AED','{"name":"Priya Sobha","phone":"+971-4-368-6888","email":"leasing@sobharealty.com"}','Active'),
('LSR-2023-000011','Al Habtoor Group LLC',            'REG-AE-1970-0112345','TRN-101234567890003','AE','AED','{"name":"Walid Habtoor","phone":"+971-4-207-7777","email":"leasing@habtoor.com"}','Active'),
('LSR-2023-000012','Deyaar Development PJSC',         'REG-AE-2002-0123456','TRN-101345678901114','AE','AED','{"name":"Samar Deyaar","phone":"+971-4-818-2222","email":"commercial@deyaar.ae"}','Active'),
('LSR-2024-000013','Omniyat Properties LLC',          'REG-AE-2005-0134567','TRN-101456789012225','AE','AED','{"name":"Mahdi Omniyat","phone":"+971-4-440-8888","email":"leasing@omniyat.com"}','Active'),
('LSR-2024-000014','Select Group LLC',                'REG-AE-2003-0145678','TRN-101567890123336','AE','AED','{"name":"Nina Select","phone":"+971-4-447-7777","email":"commercial@selectgroup.ae"}','Active'),
('LSR-2024-000015','Azizi Developments LLC',          'REG-AE-2007-0156789','TRN-101678901234447','AE','AED','{"name":"Farhad Azizi","phone":"+971-4-430-8888","email":"leasing@azizidevelopments.com"}','Active');
GO

-- ============================================================
-- LEASE CONTRACTS (25 leases)
-- ============================================================
DELETE FROM lease.contracts;
GO
INSERT INTO lease.contracts
  (contract_ref, lessor_id, asset_type, asset_description, asset_tag, location_json,
   commencement_date, expiry_date, term_months, monthly_payment, currency,
   escalation_rate, ibr, deposit_amount, ifrs16_classification,
   renewal_option, renewal_certain, rou_asset_value, lease_liability_commence,
   status, maker_id, checker_id, approved_at, screen_id)
VALUES
('LSE-2022-000001',1,'TowerSite',      'Rooftop BTS Tower — Emaar Square Tower 1',       'TWR-DXB-001','{"address":"Emaar Square, Downtown Dubai","city":"Dubai","country":"AE","lat":25.1972,"lng":55.2744}','2022-01-01','2027-12-31',72, 45000,'AED',0.03,0.050000, 90000,'Finance',1,1,2710000,2710000,'Active',1,1,'2021-12-15','VFLSELST0001P001'),
('LSE-2022-000002',2,'TowerSite',      'Ground BTS Tower — DAMAC Hills Site B',           'TWR-DXB-002','{"address":"DAMAC Hills, Dubailand","city":"Dubai","country":"AE","lat":25.0285,"lng":55.2694}',  '2022-03-01','2028-02-28',72, 38500,'AED',0.03,0.050000, 77000,'Finance',1,1,2315000,2315000,'Active',1,1,'2022-02-10','VFLSELST0001P001'),
('LSE-2022-000003',3,'TowerSite',      'Rooftop BTS — Aldar HQ Building Abu Dhabi',       'TWR-AUH-001','{"address":"Al Raha Beach, Abu Dhabi","city":"Abu Dhabi","country":"AE","lat":24.4539,"lng":54.3773}','2022-06-01','2027-05-31',60, 42000,'AED',0.025,0.048000,84000,'Finance',1,0,2245000,2245000,'Active',1,1,'2022-05-20','VFLSELST0001P001'),
('LSE-2022-000004',4,'TowerSite',      'Palm Jumeirah Tower Site — Nakheel Mall Roof',    'TWR-DXB-003','{"address":"Palm Jumeirah, Dubai","city":"Dubai","country":"AE","lat":25.1124,"lng":55.1390}',   '2022-09-01','2028-08-31',72, 55000,'AED',0.03,0.052000,110000,'Finance',1,1,3310000,3310000,'Active',1,1,'2022-08-15','VFLSELST0001P001'),
('LSE-2021-000005',5,'CorporateOffice','Vodafone UAE HQ — Dubai Properties Tower 7',      'OFF-DXB-001','{"address":"Business Bay, Dubai","city":"Dubai","country":"AE","lat":25.1865,"lng":55.2637}',   '2021-07-01','2026-06-30',60,185000,'AED',0.04,0.045000,370000,'Finance',1,1,9820000,9820000,'Active',1,1,'2021-06-01','VFLSELST0001P001'),
('LSE-2021-000006',6,'CorporateOffice','Regional Office — Majid Al Futtaim Tower',        'OFF-DXB-002','{"address":"Al Wahda, Abu Dhabi","city":"Abu Dhabi","country":"AE","lat":24.4672,"lng":54.3706}','2021-10-01','2026-09-30',60,125000,'AED',0.035,0.046000,250000,'Finance',1,1,6620000,6620000,'Active',1,1,'2021-09-10','VFLSELST0001P001'),
('LSE-2023-000007',7,'CorporateOffice','Sharjah Branch Office — Union Properties Bldg',  'OFF-SHJ-001','{"address":"Al Majaz, Sharjah","city":"Sharjah","country":"AE","lat":25.3463,"lng":55.3888}',   '2023-01-01','2028-12-31',72, 65000,'AED',0.03,0.053000,130000,'Finance',1,0,3910000,3910000,'Active',1,1,'2022-12-15','VFLSELST0001P001'),
('LSE-2022-000008',8,'DataCentre',     'Primary DC — Meraas Al Quoz Data Hub',            'DC-DXB-001', '{"address":"Al Quoz Industrial, Dubai","city":"Dubai","country":"AE","lat":25.1458,"lng":55.2211}','2022-04-01','2032-03-31',120,320000,'AED',0.02,0.047000,640000,'Finance',1,1,29800000,29800000,'Active',1,1,'2022-03-10','VFLSELST0001P001'),
('LSE-2023-000009',9,'DataCentre',     'DR Site — Dubai South Data Centre',               'DC-DXB-002', '{"address":"Dubai South, Dubai","city":"Dubai","country":"AE","lat":24.8968,"lng":55.1615}',    '2023-07-01','2033-06-30',120,280000,'AED',0.02,0.055000,560000,'Finance',1,1,26100000,26100000,'Active',1,1,'2023-06-15','VFLSELST0001P001'),
('LSE-2021-000010',10,'RetailOutlet',  'Vodafone Store — Dubai Mall Level 1',             'RET-DXB-001','{"address":"Dubai Mall, Downtown Dubai","city":"Dubai","country":"AE","lat":25.1985,"lng":55.2796}','2021-01-01','2025-12-31',60, 95000,'AED',0.05,0.046000,190000,'Finance',1,1,5050000,5050000,'Active',1,1,'2020-12-01','VFLSELST0001P001'),
('LSE-2021-000011',11,'RetailOutlet',  'Vodafone Store — Mall of the Emirates',           'RET-DXB-002','{"address":"Mall of the Emirates, Al Barsha","city":"Dubai","country":"AE","lat":25.1181,"lng":55.2003}','2021-03-01','2026-02-28',60,88000,'AED',0.05,0.046000,176000,'Finance',1,1,4670000,4670000,'Active',1,1,'2021-02-10','VFLSELST0001P001'),
('LSE-2022-000012',12,'RetailOutlet',  'Vodafone Kiosk — Deyaar City Walk',               'RET-DXB-003','{"address":"City Walk, Al Wasl","city":"Dubai","country":"AE","lat":25.2054,"lng":55.2408}',   '2022-02-01','2025-01-31',36, 35000,'AED',0.04,0.050000, 70000,'Operating',0,0,1170000,1170000,'Active',1,1,'2022-01-20','VFLSELST0001P001'),
('LSE-2023-000013',13,'RetailOutlet',  'Vodafone Store — Omniyat One Za''abeel',          'RET-DXB-004','{"address":"Za''abeel, Dubai","city":"Dubai","country":"AE","lat":25.2285,"lng":55.3020}',    '2023-04-01','2028-03-31',60, 72000,'AED',0.04,0.054000,144000,'Finance',1,0,3820000,3820000,'Active',1,1,'2023-03-15','VFLSELST0001P001'),
('LSE-2022-000014',14,'StaffApartment','3BR Apartment — Select Group Marina Gate 1',      'APT-DXB-001','{"address":"Dubai Marina, Dubai","city":"Dubai","country":"AE","lat":25.0760,"lng":55.1302}',  '2022-05-01','2025-04-30',36, 18500,'AED',0.03,0.050000, 37000,'Operating',0,0, 618000, 618000,'Active',1,1,'2022-04-15','VFLSELST0001P001'),
('LSE-2022-000015',15,'StaffApartment','2BR Apartment — Azizi Riviera Meydan',            'APT-DXB-002','{"address":"Meydan, Dubai","city":"Dubai","country":"AE","lat":25.1587,"lng":55.3068}',       '2022-08-01','2025-07-31',36, 14000,'AED',0.03,0.050000, 28000,'Operating',0,0, 467000, 467000,'Active',1,1,'2022-07-20','VFLSELST0001P001'),
('LSE-2023-000016',1,'Fleet',          '2023 Toyota Land Cruiser — VF-UAE-001',           'FLT-001',    '{"address":"Vodafone HQ, Business Bay","city":"Dubai","country":"AE"}',                       '2023-01-01','2027-12-31',60,  8500,'AED',0.00,0.048000, 17000,'Finance',0,0, 450000, 450000,'Active',1,1,'2022-12-20','VFLSELST0001P001'),
('LSE-2023-000017',2,'Fleet',          '2023 Nissan Patrol — VF-UAE-002',                 'FLT-002',    '{"address":"Vodafone HQ, Business Bay","city":"Dubai","country":"AE"}',                       '2023-01-01','2027-12-31',60,  7800,'AED',0.00,0.048000, 15600,'Finance',0,0, 413000, 413000,'Active',1,1,'2022-12-20','VFLSELST0001P001'),
('LSE-2023-000018',3,'Fleet',          '2023 Ford F-150 Raptor — VF-UAE-003',             'FLT-003',    '{"address":"Vodafone HQ, Business Bay","city":"Dubai","country":"AE"}',                       '2023-03-01','2028-02-28',60,  6900,'AED',0.00,0.049000, 13800,'Finance',0,0, 365000, 365000,'Active',1,1,'2023-02-15','VFLSELST0001P001'),
('LSE-2022-000019',5,'Warehouse',      'Network Equipment Store — Dubai South Logistics', 'WHS-DXB-001','{"address":"Dubai South Logistics District","city":"Dubai","country":"AE","lat":24.9000,"lng":55.1500}','2022-11-01','2027-10-31',60,52000,'AED',0.025,0.050000,104000,'Finance',1,0,2760000,2760000,'Active',1,1,'2022-10-15','VFLSELST0001P001'),
('LSE-2023-000020',6,'Warehouse',      'Spare Parts Depot — Jebel Ali Free Zone',         'WHS-DXB-002','{"address":"Jebel Ali Free Zone, Dubai","city":"Dubai","country":"AE","lat":24.9857,"lng":55.0660}','2023-02-01','2028-01-31',60,48000,'AED',0.025,0.051000, 96000,'Finance',1,0,2550000,2550000,'Active',1,1,'2023-01-20','VFLSELST0001P001'),
('LSE-2023-000021',7,'NetworkEquipment','5G RAN Equipment Rack — Union Tower Rooftop',    'NET-DXB-001','{"address":"Union Square, Deira","city":"Dubai","country":"AE","lat":25.2697,"lng":55.3095}',  '2023-05-01','2026-04-30',36, 28000,'AED',0.00,0.052000, 56000,'Finance',0,0, 935000, 935000,'Active',1,1,'2023-04-15','VFLSELST0001P001'),
('LSE-2023-000022',8,'NetworkEquipment','Microwave Link Equipment — Meraas Bluewaters',   'NET-DXB-002','{"address":"Bluewaters Island, Dubai","city":"Dubai","country":"AE","lat":25.0820,"lng":55.1230}','2023-08-01','2026-07-31',36,22000,'AED',0.00,0.053000, 44000,'Finance',0,0, 733000, 733000,'Active',1,1,'2023-07-20','VFLSELST0001P001'),
('LSE-2021-000023',9,'RetailOutlet',   'Vodafone Store — Dubai South Expo City',          'RET-DXB-005','{"address":"Expo City, Dubai South","city":"Dubai","country":"AE","lat":24.9667,"lng":55.1500}','2021-10-01','2025-09-30',48, 41000,'AED',0.04,0.046000, 82000,'Finance',1,0,2180000,2180000,'Active',1,1,'2021-09-10','VFLSELST0001P001'),
('LSE-2022-000024',10,'CorporateOffice','Ajman Branch Office — Sobha Hartland Bldg',      'OFF-AJM-001','{"address":"Al Jurf, Ajman","city":"Ajman","country":"AE","lat":25.4052,"lng":55.5136}',      '2022-01-01','2025-12-31',48, 32000,'AED',0.03,0.050000, 64000,'Finance',0,0,1700000,1700000,'Active',1,1,'2021-12-15','VFLSELST0001P001'),
('LSE-2025-000025',11,'TowerSite',     'New 5G Tower Site — Al Habtoor City',             'TWR-DXB-004','{"address":"Al Habtoor City, Sheikh Zayed Road","city":"Dubai","country":"AE","lat":25.2048,"lng":55.2708}','2025-06-01','2031-05-31',72,48000,'AED',0.03,0.058000,96000,'Finance',1,1,2890000,2890000,'Submitted',1,NULL,NULL,'VFLSELST0001P001');
GO

-- ============================================================
-- AMORTISATION SCHEDULE (contract 1, 24 months)
-- ============================================================
DELETE FROM lease.amortisation_schedule WHERE contract_id = 1;
GO
DECLARE @liability DECIMAL(18,2) = 2710000.00;
DECLARE @rou DECIMAL(18,2) = 2710000.00;
DECLARE @rate DECIMAL(10,8) = 0.05/12;
DECLARE @depr DECIMAL(18,2) = 2710000.00/72;
DECLARE @cum DECIMAL(18,2) = 0;
DECLARE @n INT = 0;
WHILE @n < 24
BEGIN
    DECLARE @interest DECIMAL(18,2) = ROUND(@liability * @rate, 2);
    DECLARE @principal DECIMAL(18,2) = 45000.00 - @interest;
    SET @cum = @cum + @depr;
    INSERT INTO lease.amortisation_schedule (contract_id,period_date,opening_liability,interest_expense,payment,principal,closing_liability,rou_nbv,depreciation,cumulative_depr)
    VALUES (1, DATEADD(MONTH,@n,'2022-01-01'), @liability, @interest, 45000.00, @principal, @liability-@principal, @rou-@cum, @depr, @cum);
    SET @liability = @liability - @principal;
    SET @n = @n + 1;
END
GO

-- ============================================================
-- PAYABLES — INVOICES
-- ============================================================
DELETE FROM payables.invoices;
GO
INSERT INTO payables.invoices (invoice_ref,lessor_id,contract_id,invoice_number,invoice_date,period_month,period_year,rent_amount,service_charge,vat,total,currency,gl_account,cost_centre,due_date,status,maker_id,checker_id) VALUES
('INV-2024-000001',1,1,'EMR-2024-0101','2024-01-05',1,2024,45000,2500,2375,49875,'AED','6001001','CC-NETWORK','2024-01-31','Paid',1,1),
('INV-2024-000002',2,2,'DAM-2024-0201','2024-01-08',1,2024,38500,1800,2015,42315,'AED','6001001','CC-NETWORK','2024-01-31','Paid',1,1),
('INV-2024-000003',5,5,'DPG-2024-0101','2024-01-10',1,2024,185000,8500,9675,203175,'AED','6001002','CC-HEADOFFICE','2024-01-31','Paid',1,1),
('INV-2024-000004',8,8,'MER-2024-0101','2024-01-12',1,2024,320000,15000,16750,351750,'AED','6001003','CC-IT','2024-01-31','Paid',1,1),
('INV-2024-000005',1,1,'EMR-2024-0201','2024-02-05',2,2024,45000,2500,2375,49875,'AED','6001001','CC-NETWORK','2024-02-29','Paid',1,1),
('INV-2024-000006',2,2,'DAM-2024-0301','2024-02-08',2,2024,38500,1800,2015,42315,'AED','6001001','CC-NETWORK','2024-02-29','Paid',1,1),
('INV-2024-000007',5,5,'DPG-2024-0201','2024-02-10',2,2024,185000,8500,9675,203175,'AED','6001002','CC-HEADOFFICE','2024-02-29','Paid',1,1),
('INV-2024-000008',3,3,'ALD-2024-0101','2024-02-12',2,2024,42000,2200,2210,46410,'AED','6001001','CC-NETWORK','2024-02-29','Paid',1,1),
('INV-2024-000009',4,4,'NAK-2024-0101','2024-03-05',3,2024,55000,3000,2900,60900,'AED','6001001','CC-NETWORK','2024-03-31','Paid',1,1),
('INV-2024-000010',6,6,'MAF-2024-0101','2024-03-08',3,2024,125000,6000,6550,137550,'AED','6001002','CC-ABUDHABI','2024-03-31','Paid',1,1),
('INV-2024-000011',1,1,'EMR-2024-1001','2024-10-05',10,2024,45000,2500,2375,49875,'AED','6001001','CC-NETWORK','2024-10-31','Paid',1,1),
('INV-2024-000012',2,2,'DAM-2024-1001','2024-10-08',10,2024,38500,1800,2015,42315,'AED','6001001','CC-NETWORK','2024-10-31','Paid',1,1),
('INV-2024-000013',5,5,'DPG-2024-1001','2024-10-10',10,2024,185000,8500,9675,203175,'AED','6001002','CC-HEADOFFICE','2024-10-31','Paid',1,1),
('INV-2024-000014',8,8,'MER-2024-1001','2024-10-12',10,2024,320000,15000,16750,351750,'AED','6001003','CC-IT','2024-10-31','Paid',1,1),
('INV-2024-000015',9,9,'DSP-2024-1001','2024-10-15',10,2024,280000,12000,14600,306600,'AED','6001003','CC-IT','2024-10-31','Paid',1,1),
('INV-2025-000001',1,1,'EMR-2025-0101','2025-01-05',1,2025,45000,2500,2375,49875,'AED','6001001','CC-NETWORK','2025-01-31','Paid',1,1),
('INV-2025-000002',2,2,'DAM-2025-0101','2025-01-08',1,2025,38500,1800,2015,42315,'AED','6001001','CC-NETWORK','2025-01-31','Paid',1,1),
('INV-2025-000003',5,5,'DPG-2025-0101','2025-01-10',1,2025,185000,8500,9675,203175,'AED','6001002','CC-HEADOFFICE','2025-01-31','Paid',1,1),
('INV-2025-000004',8,8,'MER-2025-0101','2025-01-12',1,2025,320000,15000,16750,351750,'AED','6001003','CC-IT','2025-01-31','Paid',1,1),
('INV-2025-000005',3,3,'ALD-2025-0101','2025-01-15',1,2025,42000,2200,2210,46410,'AED','6001001','CC-NETWORK','2025-01-31','Paid',1,1),
('INV-2025-000016',1,1,'EMR-2025-0401','2025-04-05',4,2025,45000,2500,2375,49875,'AED','6001001','CC-NETWORK','2025-04-30','Approved',1,1),
('INV-2025-000017',2,2,'DAM-2025-0401','2025-04-08',4,2025,38500,1800,2015,42315,'AED','6001001','CC-NETWORK','2025-04-30','Approved',1,1),
('INV-2025-000018',5,5,'DPG-2025-0401','2025-04-10',4,2025,185000,8500,9675,203175,'AED','6001002','CC-HEADOFFICE','2025-04-30','Approved',1,1),
('INV-2025-000019',8,8,'MER-2025-0401','2025-04-12',4,2025,320000,15000,16750,351750,'AED','6001003','CC-IT','2025-04-30','Approved',1,1),
('INV-2025-000020',9,9,'DSP-2025-0401','2025-04-15',4,2025,280000,12000,14600,306600,'AED','6001003','CC-IT','2025-04-30','Approved',1,1),
('INV-2025-000021',3,3,'ALD-2025-0401','2025-04-15',4,2025,42000,2200,2210,46410,'AED','6001001','CC-NETWORK','2025-04-30','Submitted',1,NULL),
('INV-2025-000022',4,4,'NAK-2025-0401','2025-04-16',4,2025,55000,3000,2900,60900,'AED','6001001','CC-NETWORK','2025-04-30','Submitted',1,NULL),
('INV-2025-000023',6,6,'MAF-2025-0401','2025-04-17',4,2025,125000,6000,6550,137550,'AED','6001002','CC-ABUDHABI','2025-04-30','Draft',1,NULL),
('INV-2025-000024',7,7,'UNP-2025-0401','2025-04-18',4,2025,65000,3200,3410,71610,'AED','6001002','CC-SHARJAH','2025-04-30','Draft',1,NULL),
('INV-2025-000025',10,10,'SOB-2025-0301','2025-03-05',3,2025,95000,4500,4975,104475,'AED','6001004','CC-RETAIL','2025-03-31','Overdue',1,1),
('INV-2025-000026',11,11,'HAB-2025-0301','2025-03-08',3,2025,88000,4200,4610,96810,'AED','6001004','CC-RETAIL','2025-03-31','Overdue',1,1),
('INV-2025-000027',12,12,'DEY-2025-0201','2025-02-10',2,2025,35000,1500,1825,38325,'AED','6001004','CC-RETAIL','2025-02-28','Disputed',1,1);
GO

-- ============================================================
-- PAYMENT RUNS
-- ============================================================
DELETE FROM payables.payment_run_lines;
DELETE FROM payables.payment_runs;
GO
INSERT INTO payables.payment_runs (run_ref,run_date,total_amount,currency,bank_file_format,bank_file_reference,status,maker_id,checker_id,approved_at) VALUES
('PMT-2024-000001','2024-01-28',647115,'AED','SWIFT','SWIFT-2024-JAN-001','Approved',1,1,'2024-01-27'),
('PMT-2024-000002','2024-02-26',341775,'AED','SWIFT','SWIFT-2024-FEB-001','Approved',1,1,'2024-02-25'),
('PMT-2024-000003','2024-03-28',198450,'AED','EFT','EFT-2024-MAR-001','Approved',1,1,'2024-03-27'),
('PMT-2024-000004','2024-10-28',647115,'AED','SWIFT','SWIFT-2024-OCT-001','Approved',1,1,'2024-10-27'),
('PMT-2025-000001','2025-01-28',693525,'AED','SWIFT','SWIFT-2025-JAN-001','Approved',1,1,'2025-01-27'),
('PMT-2025-000002','2025-04-25',647265,'AED','SWIFT','SWIFT-2025-APR-001','Approved',1,1,'2025-04-24'),
('PMT-2025-000003','2025-04-28',510225,'AED','EFT',NULL,'Draft',1,NULL,NULL),
('PMT-2025-000004','2025-04-30',198450,'AED','SWIFT',NULL,'Submitted',1,NULL,NULL);
GO
INSERT INTO payables.payment_run_lines (run_id,invoice_id,amount) VALUES
(1,1,49875),(1,2,42315),(1,3,203175),(1,4,351750),
(2,5,49875),(2,6,42315),(2,7,203175),(2,8,46410),
(5,16,49875),(5,17,42315),(5,18,203175),(5,19,351750),(5,20,46410),
(6,21,49875),(6,22,42315),(6,23,203175),(6,24,351750);
GO

-- ============================================================
-- GL JOURNALS (using actual columns)
-- ============================================================
DELETE FROM finance.gl_lines;
DELETE FROM finance.gl_journals;
GO
INSERT INTO finance.gl_journals (journal_ref,reference,transaction_date,period,source,description,currency,status,posted_at,screen_id) VALUES
('JNL-2025-000001','IFRS16-MAR-2025','2025-03-31','2025-03','IFRS16','IFRS 16 Monthly Journals — March 2025','AED','Posted','2025-04-01','VFGLREG0001P001'),
('JNL-2025-000002','DEPR-MAR-2025',  '2025-03-31','2025-03','DEPR',  'ROU Asset Depreciation — March 2025',  'AED','Posted','2025-04-01','VFGLREG0001P001'),
('JNL-2025-000003','PMT-MAR-2025',   '2025-03-31','2025-03','PAYMENT','Lease Payments — March 2025',          'AED','Posted','2025-04-01','VFGLREG0001P001'),
('JNL-2025-000004','IFRS16-FEB-2025','2025-02-28','2025-02','IFRS16','IFRS 16 Monthly Journals — February 2025','AED','Posted','2025-03-01','VFGLREG0001P001'),
('JNL-2025-000005','DEPR-FEB-2025',  '2025-02-28','2025-02','DEPR',  'ROU Asset Depreciation — February 2025','AED','Posted','2025-03-01','VFGLREG0001P001'),
('JNL-2025-000006','IFRS16-JAN-2025','2025-01-31','2025-01','IFRS16','IFRS 16 Monthly Journals — January 2025','AED','Posted','2025-02-01','VFGLREG0001P001'),
('JNL-2025-000007','COMM-LSE-025',   '2025-04-01','2025-04','COMMENCE','New Lease Commencement — LSE-2025-000025','AED','Draft',NULL,'VFGLREG0001P001'),
('JNL-2024-000001','IFRS16-DEC-2024','2024-12-31','2024-12','IFRS16','IFRS 16 Monthly Journals — December 2024','AED','Posted','2025-01-02','VFGLREG0001P001'),
('JNL-2024-000002','YEAREND-2024',   '2024-12-31','2024-12','YEAREND','Year-End IFRS 16 Adjustment — FY2024','AED','Posted','2025-01-05','VFGLREG0001P001');
GO
INSERT INTO finance.gl_lines (journal_id,account_code,description,cost_centre,debit,credit) VALUES
(1,'2001001','Lease Liability — Principal Repayment','CC-ALL',0,1250000),
(1,'6002001','Finance Charge — Interest Expense','CC-ALL',600000,0),
(1,'1001001','Cash at Bank — Main Account','CC-ALL',0,600000),
(1,'2001001','Lease Liability — Principal Reduction','CC-ALL',1250000,0),
(2,'6003001','Depreciation — ROU Assets','CC-ALL',680000,0),
(2,'1002001','ROU Asset — Accumulated Depreciation','CC-ALL',0,680000),
(3,'2001002','Accounts Payable — Lessors','CC-ALL',1850000,0),
(3,'1001001','Cash at Bank — Main Account','CC-ALL',0,1850000),
(7,'1003001','ROU Asset — Buildings','CC-NETWORK',96000,0),
(7,'2001001','Lease Liability — Non-Current','CC-NETWORK',0,96000);
GO

-- ============================================================
-- WORKFLOW PROCESS INSTANCES & TASKS
-- ============================================================
DELETE FROM workflow.user_tasks;
DELETE FROM workflow.process_instances;
GO
-- Get definition_id for LEASE_APPROVAL and INVOICE_APPROVAL
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
-- MAKER/CHECKER QUEUE (actual columns)
-- ============================================================
DELETE FROM security.maker_checker_queue;
GO
INSERT INTO security.maker_checker_queue (queue_ref,module,record_type,record_id,record_summary,value,currency,submitted_by,submitted_at,status,checker_id,actioned_at,outcome,sla_due_at) VALUES
('MCQ-2025-000001','Lease','Create',25,'New Lease LSE-2025-000025 — Al Habtoor City 5G Tower',96000,'AED',1,'2025-04-20 09:00:00','Pending',NULL,NULL,NULL,'2025-04-22 09:00:00'),
('MCQ-2025-000002','Invoice','Approve',21,'Invoice INV-2025-000021 — Aldar Properties AED 46,410',46410,'AED',1,'2025-04-21 10:30:00','Pending',NULL,NULL,NULL,'2025-04-23 10:30:00'),
('MCQ-2025-000003','Invoice','Approve',22,'Invoice INV-2025-000022 — Nakheel PJSC AED 60,900',60900,'AED',1,'2025-04-21 11:00:00','Pending',NULL,NULL,NULL,'2025-04-23 11:00:00'),
('MCQ-2025-000004','PaymentRun','Approve',8,'Payment Run PMT-2025-000004 — SWIFT AED 198,450',198450,'AED',1,'2025-04-22 08:00:00','Pending',NULL,NULL,NULL,'2025-04-24 08:00:00'),
('MCQ-2025-000005','Invoice','Approve',23,'Invoice INV-2025-000023 — Majid Al Futtaim AED 137,550',137550,'AED',1,'2025-04-22 14:00:00','Pending',NULL,NULL,NULL,'2025-04-24 14:00:00'),
('MCQ-2025-000006','PaymentRun','Approve',7,'Payment Run PMT-2025-000003 — EFT AED 510,225',510225,'AED',1,'2025-04-22 15:00:00','Pending',NULL,NULL,NULL,'2025-04-24 15:00:00'),
('MCQ-2024-000001','Invoice','Approve',1,'Invoice INV-2024-000001 — Emaar Properties AED 49,875',49875,'AED',1,'2024-01-06 09:00:00','Approved',1,'2024-01-08 11:00:00','Approved','2024-01-08 09:00:00'),
('MCQ-2024-000002','Invoice','Approve',3,'Invoice INV-2024-000003 — Dubai Properties AED 203,175',203175,'AED',1,'2024-01-10 09:00:00','Approved',1,'2024-01-12 10:00:00','Approved','2024-01-12 09:00:00'),
('MCQ-2024-000003','PaymentRun','Approve',1,'Payment Run PMT-2024-000001 — SWIFT AED 647,115',647115,'AED',1,'2024-01-26 09:00:00','Approved',1,'2024-01-27 14:00:00','Approved','2024-01-28 09:00:00');
GO

-- ============================================================
-- CHEQUE MODULE (actual columns)
-- ============================================================
DELETE FROM cheque.cheque_register;
DELETE FROM cheque.cheque_books;
DELETE FROM cheque.cheque_signatories;
DELETE FROM cheque.bank_accounts;
GO
INSERT INTO cheque.bank_accounts (bank_name,account_number,account_name,currency,branch,swift_code,is_active) VALUES
('Emirates NBD',         '1012345678901','Vodafone UAE Main Account',   'AED','Downtown Dubai Branch','EBILAEAD',1),
('Abu Dhabi Commercial Bank','2023456789012','Vodafone UAE Payroll',    'AED','Abu Dhabi Main Branch','ADCBAEAA',1),
('First Abu Dhabi Bank', '3034567890123','Vodafone UAE Operations',     'AED','DIFC Branch',          'NBADAEAA',1);
GO
INSERT INTO cheque.cheque_signatories (user_name,designation,authority_limit,is_active) VALUES
('Ahmed Al-Rashid',    'Chief Financial Officer',  5000000,1),
('Fatima Al-Zaabi',    'Finance Director',         2000000,1),
('Khalid Al-Mansoori', 'Treasury Manager',          500000,1),
('Sara Hassan',        'Senior Finance Officer',    200000,1);
GO
INSERT INTO cheque.cheque_books (bank_account_id,book_number,series_from,series_to,total_leaves,issued_leaves,voided_leaves,available_leaves,status,received_date) VALUES
(1,'ENBD-CHQ-2024-001','000101','000200',100,45,2,53,'Active',  '2024-01-15'),
(1,'ENBD-CHQ-2024-002','000201','000300',100, 8,0,92,'Active',  '2024-07-01'),
(2,'ADCB-CHQ-2024-001','100101','100200',100,22,1,77,'Active',  '2024-02-01'),
(3,'FAB-CHQ-2024-001', '200101','200200',100,15,0,85,'Active',  '2024-03-15'),
(1,'ENBD-CHQ-2023-001','000001','000100',100,98,2, 0,'Exhausted','2023-01-10');
GO
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
-- BANK RECONCILIATION MODULE (actual columns)
-- ============================================================
DELETE FROM bank.recon_matches;
DELETE FROM bank.recon_exceptions;
DELETE FROM bank.recon_sessions;
DELETE FROM bank.bank_transactions;
DELETE FROM bank.bank_statements;
DELETE FROM bank.recon_rules;
DELETE FROM bank.bank_accounts;
GO
INSERT INTO bank.bank_accounts (account_ref,bank_name,account_name,account_number,iban,swift_bic,currency,account_type,gl_account,current_balance,last_recon_date,status) VALUES
('BNK-2021-000001','Emirates NBD',              'Vodafone UAE Main Account',    '1012345678901','AE070260001012345678901','EBILAEAD','AED','Current','1001001',12500000,'2025-03-31','Active'),
('BNK-2021-000002','Abu Dhabi Commercial Bank', 'Vodafone UAE Payroll',         '2023456789012','AE280030002023456789012','ADCBAEAA','AED','Current','1001002', 3200000,'2025-03-31','Active'),
('BNK-2022-000003','First Abu Dhabi Bank',      'Vodafone UAE Operations',      '3034567890123','AE460350003034567890123','NBADAEAA','AED','Current','1001003', 5800000,'2025-03-31','Active');
GO
INSERT INTO bank.bank_statements (statement_ref,account_id,statement_date,period_from,period_to,opening_balance,closing_balance,total_debits,total_credits,transaction_count,file_format,status) VALUES
('ENBD-STMT-2025-03',1,'2025-03-31','2025-03-01','2025-03-31',14200000,12500000,2395000,695000,10,'MT940','Imported'),
('ENBD-STMT-2025-02',1,'2025-02-28','2025-02-01','2025-02-28',15800000,14200000,2100000,500000, 9,'MT940','Reconciled'),
('ADCB-STMT-2025-03',2,'2025-03-31','2025-03-01','2025-03-31', 3500000, 3200000,1200000,900000, 6,'CSV','Imported'),
('FAB-STMT-2025-03', 3,'2025-03-31','2025-03-01','2025-03-31', 6200000, 5800000, 850000,450000, 5,'OFX','Imported');
GO
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
(1,1,'2025-03-31','2025-03-31','Credit',1260000,'AED','INTEREST EARNED — MARCH 2025',        'INT-2025-03', 'Emirates NBD',                    'Matched');
GO
INSERT INTO bank.recon_sessions (session_ref,account_id,statement_id,period_from,period_to,opening_balance,closing_balance_bank,closing_balance_gl,difference,total_bank_txns,matched_count,unmatched_bank,unmatched_gl,status,maker_id) VALUES
('RECON-2025-03-001',1,1,'2025-03-01','2025-03-31',14200000,12500000,12500000,0,10,8,2,0,'Open',1),
('RECON-2025-02-001',1,2,'2025-02-01','2025-02-28',15800000,14200000,14200000,0, 9,9,0,0,'Closed',1);
GO
INSERT INTO bank.recon_rules (rule_name,rule_type,priority,is_active,date_tolerance_days,amount_tolerance,amount_tolerance_pct,min_confidence,auto_accept_threshold,description) VALUES
('Exact Amount + Reference', 'ExactMatch',   1,1,0,   0,0,  100,100,'Exact amount and reference match'),
('Amount + Date 3 Days',     'DateTolerance',2,1,3,   0,0,  90, 90, 'Same amount within 3 days'),
('Reference Contains',       'RefContains',  3,1,0,   0,0,  80, 85, 'Bank narrative contains GL reference'),
('Amount Tolerance 0.50',    'AmtTolerance', 4,1,3, 0.5,0,  75, 80, 'Amount within AED 0.50 tolerance'),
('AI Narrative Match',       'AIMatch',      5,1,5,  50,0,  60, 70, 'AI-assisted fuzzy narrative matching');
GO

-- ============================================================
-- LESSOR MODULE (new schema)
-- ============================================================
DELETE FROM lessor.lessor_notes;
DELETE FROM lessor.lessor_documents;
DELETE FROM lessor.lessor_bank_accounts;
DELETE FROM lessor.lessor_contacts;
DELETE FROM lessor.lessors;
GO
INSERT INTO lessor.lessors (lessor_code,lessor_name,lessor_type,registration_no,tax_id,country,city,address_line1,credit_rating,payment_terms,preferred_currency,status,total_leases,total_liability) VALUES
('LSR-00001','Emaar Properties PJSC',           'Company',   'REG-AE-2001-0012345','TRN-100234567890003','AE','Dubai',    'Emaar Square, Downtown Dubai',         'A+', 30,'AED','Active',4, 2850000),
('LSR-00002','DAMAC Real Estate Development',   'Company',   'REG-AE-2002-0023456','TRN-100345678901114','AE','Dubai',    'DAMAC Executive Heights, TECOM',       'A',  30,'AED','Active',3, 1950000),
('LSR-00003','Aldar Properties PJSC',           'Company',   'REG-AE-2004-0034567','TRN-100456789012225','AE','Abu Dhabi','Al Raha Beach, Abu Dhabi',             'A+', 30,'AED','Active',2, 1680000),
('LSR-00004','Nakheel PJSC',                    'Government','REG-AE-2000-0045678','TRN-100567890123336','AE','Dubai',    'Palm Jumeirah, Dubai',                  'AA', 15,'AED','Active',2, 2200000),
('LSR-00005','Dubai Properties Group',          'Company',   'REG-AE-2005-0056789','TRN-100678901234447','AE','Dubai',    'Business Bay, Dubai',                  'A',  30,'AED','Active',3, 7400000),
('LSR-00006','Majid Al Futtaim Properties',     'Company',   'REG-AE-1992-0067890','TRN-100789012345558','AE','Dubai',    'Mall of the Emirates, Al Barsha',      'AA-',30,'AED','Active',2, 5000000),
('LSR-00007','Union Properties PJSC',           'Company',   'REG-AE-1993-0078901','TRN-100890123456669','AE','Sharjah',  'Al Majaz, Sharjah',                    'BBB+',30,'AED','Active',2,3700000),
('LSR-00008','Meraas Holding LLC',              'Company',   'REG-AE-2007-0089012','TRN-100901234567770','AE','Dubai',    'Al Quoz Industrial, Dubai',            'A',  30,'AED','Active',2,12800000),
('LSR-00009','Dubai South Properties',          'Government','REG-AE-2014-0090123','TRN-101012345678881','AE','Dubai',    'Dubai South, Dubai',                   'AA', 15,'AED','Active',2,11200000),
('LSR-00010','Sobha Realty LLC',                'Company',   'REG-AE-1995-0101234','TRN-101123456789992','AE','Dubai',    'Sobha Hartland, MBR City',             'A-', 30,'AED','Active',2, 3800000);
GO
INSERT INTO lessor.lessor_contacts (lessor_id,contact_type,full_name,job_title,department,email,phone_primary,phone_secondary,is_primary,is_active) VALUES
(1,'Primary','Mohammed Al-Emaar',  'Head of Commercial Leasing','Commercial','m.alemaar@emaar.ae',        '+971-4-367-3333','+971-50-123-4567',1,1),
(1,'Finance','Reem Al-Hashimi',    'Lease Administrator',       'Commercial','r.alhashimi@emaar.ae',      '+971-4-367-3334','+971-50-234-5678',0,1),
(2,'Primary','Rania Khalid',       'Commercial Director',       'Commercial','r.khalid@damac.ae',         '+971-4-301-9999','+971-55-345-6789',1,1),
(3,'Primary','Tariq Al-Aldar',     'Leasing Manager',           'Leasing',   't.alaldar@aldar.com',       '+971-2-810-5555','+971-50-456-7890',1,1),
(4,'Primary','Hessa Al-Nakheel',   'Commercial Leasing Head',   'Commercial','h.alnakheel@nakheel.com',   '+971-4-390-3333','+971-50-567-8901',1,1),
(5,'Primary','Saeed Al-Dubai',     'Portfolio Manager',         'Leasing',   's.aldubai@dubaiproperties.ae','+971-4-818-8888','+971-55-678-9012',1,1),
(6,'Primary','Lina Futtaim',       'Head of Leasing',           'Commercial','l.futtaim@maf.ae',          '+971-4-294-9999','+971-50-789-0123',1,1),
(7,'Primary','Khalid Union',       'Leasing Director',          'Leasing',   'k.union@up.ae',             '+971-4-885-3333','+971-55-890-1234',1,1),
(8,'Primary','Aisha Meraas',       'Commercial Leasing Manager','Commercial','a.meraas@meraas.ae',        '+971-4-317-3333','+971-50-901-2345',1,1),
(9,'Primary','Faisal South',       'Head of Commercial',        'Commercial','f.south@dubaisouth.ae',     '+971-4-818-9999','+971-55-012-3456',1,1),
(10,'Primary','Priya Sobha',       'Leasing Manager',           'Leasing',   'p.sobha@sobharealty.com',   '+971-4-368-6888','+971-50-123-4568',1,1);
GO
INSERT INTO lessor.lessor_bank_accounts (lessor_id,bank_name,account_name,account_number,iban,swift_code,currency,account_type,is_primary,is_active) VALUES
(1,'Emirates NBD',              'Emaar Properties PJSC',            '9012345678901','AE070260009012345678901','EBILAEAD','AED','Current',1,1),
(2,'Dubai Islamic Bank',        'DAMAC Real Estate Development',    '9023456789012','AE310240009023456789012','DUIBAEAD','AED','Current',1,1),
(3,'First Abu Dhabi Bank',      'Aldar Properties PJSC',            '9034567890123','AE460350009034567890123','NBADAEAA','AED','Current',1,1),
(4,'Emirates NBD',              'Nakheel PJSC',                     '9045678901234','AE070260009045678901234','EBILAEAD','AED','Current',1,1),
(5,'Abu Dhabi Commercial Bank', 'Dubai Properties Group',           '9056789012345','AE280030009056789012345','ADCBAEAA','AED','Current',1,1),
(6,'Mashreq Bank',              'Majid Al Futtaim Properties',      '9067890123456','AE200330009067890123456','BOMLAEAD','AED','Current',1,1),
(7,'Sharjah Islamic Bank',      'Union Properties PJSC',            '9078901234567','AE690410009078901234567','SIBLAEAJ','AED','Current',1,1),
(8,'Emirates NBD',              'Meraas Holding LLC',               '9089012345678','AE070260009089012345678','EBILAEAD','AED','Current',1,1),
(9,'First Abu Dhabi Bank',      'Dubai South Properties',           '9090123456789','AE460350009090123456789','NBADAEAA','AED','Current',1,1),
(10,'Mashreq Bank',             'Sobha Realty LLC',                 '9101234567890','AE200330009101234567890','BOMLAEAD','AED','Current',1,1);
GO

-- ============================================================
-- ASSET MODULE (actual columns)
-- ============================================================
DELETE FROM asset.asset_maintenance_history;
DELETE FROM asset.asset_insurance_links;
DELETE FROM asset.asset_documents;
DELETE FROM asset.assets;
GO
INSERT INTO asset.assets (asset_code,asset_name,asset_type,asset_subtype,description,country,city,area,address_line1,latitude,longitude,condition_rating,current_lessor_id,current_lease_id,status,estimated_market_value) VALUES
('AST-TWR-001','Rooftop BTS Tower — Emaar Square',      'TowerSite',       'Macro Cell',   'Huawei AAU5613 5G NR antenna array on rooftop',    'AE','Dubai',    'Downtown Dubai',        'Emaar Square Tower 1 Rooftop',  25.1972,55.2744,4,1,1,'Active', 285000),
('AST-TWR-002','Ground BTS Tower — DAMAC Hills',        'TowerSite',       'Macro Cell',   'Ericsson AIR6449 on 30m ground tower',             'AE','Dubai',    'Dubailand',             'DAMAC Hills Site B',            25.0285,55.2694,4,2,2,'Active', 245000),
('AST-TWR-003','Rooftop BTS — Aldar HQ Abu Dhabi',      'TowerSite',       'Macro Cell',   'Nokia AirScale on Aldar HQ building rooftop',      'AE','Abu Dhabi','Al Raha Beach',         'Aldar HQ Building',             24.4539,54.3773,4,3,3,'Active', 268000),
('AST-OFF-001','Vodafone UAE HQ Office Fit-Out',         'CorporateOffice', 'Fit-Out',      'Full office fit-out 3,200 sqm Grade A space',     'AE','Dubai',    'Business Bay',          'Dubai Properties Tower 7',      25.1865,55.2637,5,5,5,'Active', 850000),
('AST-DC-001', 'Primary Data Centre Equipment',          'DataCentre',      'Tier III',     'Dell PowerEdge server racks, Emerson UPS, cooling','AE','Dubai',    'Al Quoz Industrial',    'Meraas Al Quoz Data Hub',       25.1458,55.2211,5,8,8,'Active',1250000),
('AST-FLT-001','2023 Toyota Land Cruiser VF-UAE-001',    'Fleet',           'SUV',          'White Toyota Land Cruiser GXR V8 2023',            'AE','Dubai',    'Business Bay',          'Vodafone HQ Parking',           25.1865,55.2637,4,1,16,'Active',285000),
('AST-FLT-002','2023 Nissan Patrol VF-UAE-002',          'Fleet',           'SUV',          'White Nissan Patrol SE 2023',                      'AE','Dubai',    'Business Bay',          'Vodafone HQ Parking',           25.1865,55.2637,4,2,17,'Active',265000),
('AST-RET-001','Dubai Mall Store Fit-Out',               'RetailOutlet',    'Fit-Out',      'Vodafone branded retail fit-out 180 sqm',          'AE','Dubai',    'Downtown Dubai',        'Dubai Mall Level 1',            25.1985,55.2796,4,10,10,'Active',420000),
('AST-NET-001','5G RAN Equipment — Union Tower',         'NetworkEquipment','5G NR',        'Huawei AAU5613 5G NR complete RAN solution',       'AE','Dubai',    'Deira',                 'Union Square Tower Rooftop',    25.2697,55.3095,5,7,21,'Active',380000),
('AST-WHS-001','Dubai South Warehouse Racking System',   'Warehouse',       'Storage',      'Mecalux pallet racking 2,400 sqm warehouse',       'AE','Dubai',    'Dubai South',           'Dubai South Logistics District',24.9000,55.1500,4,5,19,'Active',185000);
GO
INSERT INTO asset.asset_maintenance_history (asset_id,maint_type,description,performed_by,contractor_name,cost_amount,cost_currency,is_recoverable,recovery_status,scheduled_date,completed_date,status) VALUES
(1,'Preventive','Annual BTS tower inspection and antenna alignment',     'Huawei Field Services','Huawei Technologies',  8500,'AED',0,'NA','2024-06-15','2024-06-15','Completed'),
(1,'Corrective','Power amplifier replacement — unit failure',            'Huawei Field Services','Huawei Technologies', 12000,'AED',1,'Recovered','2025-01-20','2025-01-20','Completed'),
(2,'Preventive','Annual BTS inspection and software upgrade',            'Ericsson Field Services','Ericsson AB',         7200,'AED',0,'NA','2024-07-10','2024-07-10','Completed'),
(5,'Preventive','DC cooling system service and UPS battery replacement', 'Emerson Network Power','Emerson Electric',   45000,'AED',0,'NA','2024-09-01','2024-09-01','Completed'),
(6,'Preventive','Vehicle service — 20,000km oil change and inspection',  'Al-Futtaim Toyota','Al-Futtaim Motors',       2800,'AED',0,'NA','2025-03-15','2025-03-15','Completed'),
(7,'Preventive','Vehicle service — 15,000km oil change',                 'Arabian Automobiles','Arabian Automobiles',   2500,'AED',0,'NA','2025-02-20','2025-02-20','Completed'),
(9,'Preventive','5G equipment firmware upgrade to latest version',       'Huawei Field Services','Huawei Technologies', 15000,'AED',0,'NA','2024-11-01','2024-11-01','Completed');
GO

-- ============================================================
-- INSURANCE POLICIES (actual columns)
-- ============================================================
DELETE FROM lease.insurance_policies;
GO
INSERT INTO lease.insurance_policies (policy_ref,contract_id,provider_name,policy_number,coverage_type,premium_amount,currency,valid_from,valid_to,renewal_alert_days,status) VALUES
('POL-2022-000001',1, 'AXA Gulf',           'AXA-2022-PR-001','Property All Risk',    125000,'AED','2022-01-01','2026-12-31',90,'Active'),
('POL-2022-000002',2, 'Oman Insurance',     'OIC-2022-PR-001','Property All Risk',     98000,'AED','2022-03-01','2027-02-28',90,'Active'),
('POL-2022-000003',3, 'AXA Gulf',           'AXA-2022-PR-002','Property All Risk',    108000,'AED','2022-06-01','2027-05-31',90,'Active'),
('POL-2021-000004',5, 'RSA Insurance',      'RSA-2021-OC-001','Office Contents',       85000,'AED','2021-07-01','2026-06-30',90,'Active'),
('POL-2022-000005',8, 'AIG Middle East',    'AIG-2022-DC-001','Data Centre All Risk', 380000,'AED','2022-04-01','2032-03-31',90,'Active'),
('POL-2023-000006',9, 'Zurich Insurance',   'ZUR-2023-DC-001','Data Centre All Risk', 320000,'AED','2023-07-01','2033-06-30',90,'Active'),
('POL-2023-000007',16,'AXA Gulf',           'AXA-2023-MT-001','Comprehensive Motor',    8500,'AED','2023-01-01','2025-12-31',60,'Active'),
('POL-2023-000008',17,'AXA Gulf',           'AXA-2023-MT-002','Comprehensive Motor',    7800,'AED','2023-01-01','2025-12-31',60,'Active'),
('POL-2021-000009',23,'Oman Insurance',     'OIC-2021-PR-002','Property All Risk',     52000,'AED','2021-10-01','2025-09-30',90,'Expiring'),
('POL-2021-000010',10,'RSA Insurance',      'RSA-2021-RC-001','Retail Contents',       38000,'AED','2021-01-01','2025-12-31',60,'Active');
GO

-- ============================================================
-- MAINTENANCE TICKETS (actual columns)
-- ============================================================
DELETE FROM lease.maintenance_tickets;
GO
INSERT INTO lease.maintenance_tickets (ticket_ref,contract_id,issue_type,description,responsible_party,reported_by,reported_at,sla_due_at,resolved_at,resolution_notes,status) VALUES
('TKT-2025-000001',1, 'Electrical', 'Power fluctuation at BTS tower — affecting signal quality',              'Lessor','Network Ops', '2025-04-15 08:00:00','2025-04-18 08:00:00',NULL,NULL,'Open'),
('TKT-2025-000002',5, 'HVAC',       'Air conditioning unit failure in server room — HQ 3rd floor',           'Lessee','IT Dept',     '2025-04-18 09:00:00','2025-04-19 09:00:00',NULL,NULL,'In Progress'),
('TKT-2025-000003',8, 'Security',   'CCTV camera offline — DC entrance gate 2',                              'Lessee','Security Ops','2025-04-10 10:00:00','2025-04-17 10:00:00','2025-04-14 15:00:00','Camera replaced, system tested and operational','Resolved'),
('TKT-2025-000004',2, 'Structural', 'Water seepage on rooftop near BTS equipment',                           'Lessor','Network Ops', '2025-04-12 08:00:00','2025-04-20 08:00:00',NULL,NULL,'Open'),
('TKT-2025-000005',10,'Plumbing',   'Water leak in retail store back office',                                 'Lessor','Retail Ops',  '2025-04-05 09:00:00','2025-04-10 09:00:00','2025-04-08 14:00:00','Pipe repaired, area dried and inspected','Resolved'),
('TKT-2025-000006',16,'Mechanical', 'Vehicle — unusual engine noise, requires inspection',                    'Lessee','Fleet Mgmt',  '2025-04-20 10:00:00','2025-04-25 10:00:00',NULL,NULL,'Open'),
('TKT-2024-000001',9, 'Electrical', 'Generator fuel leak — DR site',                                         'Lessee','IT Dept',     '2024-11-15 07:00:00','2024-11-16 07:00:00','2024-11-16 12:00:00','Fuel line replaced, generator tested OK','Resolved'),
('TKT-2024-000002',3, 'Structural', 'Antenna mounting bracket corrosion — Abu Dhabi tower',                  'Lessor','Network Ops', '2024-09-20 08:00:00','2024-10-05 08:00:00','2024-10-03 16:00:00','Brackets replaced with galvanised steel','Resolved');
GO

-- ============================================================
-- MIS DAILY SNAPSHOT
-- ============================================================
DELETE FROM mis.daily_snapshot;
GO
DECLARE @d DATE = DATEADD(DAY,-30,CAST(GETUTCDATE() AS DATE));
WHILE @d <= CAST(GETUTCDATE() AS DATE)
BEGIN
    INSERT INTO mis.daily_snapshot (snapshot_date,total_active_leases,total_rou_nbv,total_liability_current,total_liability_noncurrent,payments_due_30d,overdue_payables,ytd_depreciation,ytd_interest,kpi_json)
    VALUES (@d, 24,
        162000000 + CAST(RAND(CHECKSUM(NEWID()))*500000-250000 AS DECIMAL(18,2)),
        18500000  + CAST(RAND(CHECKSUM(NEWID()))*200000-100000 AS DECIMAL(18,2)),
        169000000 + CAST(RAND(CHECKSUM(NEWID()))*1000000-500000 AS DECIMAL(18,2)),
        1850000   + CAST(RAND(CHECKSUM(NEWID()))*100000-50000 AS DECIMAL(18,2)),
        201285,
        DATEDIFF(MONTH,'2025-01-01',@d)*680000,
        DATEDIFF(MONTH,'2025-01-01',@d)*620000,
        '{"active_leases":24,"pending_approval":1,"overdue_invoices":2,"expiring_90d":3}');
    SET @d = DATEADD(DAY,1,@d);
END
GO

-- ============================================================
-- AUDIT LOG
-- ============================================================
INSERT INTO compliance.audit_log (timestamp_utc,timestamp_local,user_id,username,user_role,ip_address,module,sub_module,action_type,record_table,record_id,before_state,after_state,outcome,screen_id) VALUES
(GETUTCDATE(),GETDATE(),1,'saleellzy','admin','10.0.1.45','Lease','Contracts','CREATE','lease.contracts',25,NULL,'{"contract_ref":"LSE-2025-000025","status":"Submitted"}','Success','VFLSELST0001P001'),
(GETUTCDATE(),GETDATE(),1,'saleellzy','admin','10.0.1.45','Payables','Invoices','CREATE','payables.invoices',21,NULL,'{"invoice_ref":"INV-2025-000021","status":"Submitted"}','Success','VFPAYINV0001P001'),
(GETUTCDATE(),GETDATE(),1,'saleellzy','admin','10.0.1.45','Payables','Invoices','APPROVE','payables.invoices',1,'{"status":"Submitted"}','{"status":"Approved","checker_id":1}','Success','VFPAYINV0001P001'),
(GETUTCDATE(),GETDATE(),1,'saleellzy','admin','10.0.1.45','Payables','PaymentRuns','CREATE','payables.payment_runs',8,NULL,'{"run_ref":"PMT-2025-000004","status":"Submitted"}','Success','VFPAYPMTRUN0001P001'),
(GETUTCDATE(),GETDATE(),1,'saleellzy','admin','10.0.1.45','Security','Users','LOGIN','security.users',1,NULL,'{"login_method":"email","ip":"10.0.1.45"}','Success','VFSECUSR0001P001');
GO

PRINT 'Comprehensive seed data v2 inserted successfully.';
GO
