/**
 * Seed 20 Lessees + 20 Staff (additional to existing 15)
 * Qatar-based realistic entities
 */
import sql from 'mssql';

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};

const lessees = [
  { code: 'LSE-001', name: 'Qatar National Bank (QNB)', trade: 'QNB Group', type: 'Corporate', parent: null, reg: 'CR-QA-001234', vat: 'QA100001234', sector: 'Banking & Financial Services', rating: 'A+', country: 'Qatar', city: 'Doha', address: 'QNB Tower, Corniche Street, West Bay', po: '1000', contact: 'Abdulrahman Al-Thani', email: 'leasing@qnb.com.qa', phone: '+974 4440 7777' },
  { code: 'LSE-002', name: 'Qatar Petroleum (QatarEnergy)', trade: 'QatarEnergy', type: 'Government', parent: null, reg: 'CR-QA-000100', vat: 'QA100000100', sector: 'Oil & Gas', rating: 'AAA', country: 'Qatar', city: 'Doha', address: 'QatarEnergy Tower, West Bay', po: '3212', contact: 'Nasser Al-Jaber', email: 'facilities@qatarenergy.qa', phone: '+974 4440 1111' },
  { code: 'LSE-003', name: 'Hamad Medical Corporation', trade: 'HMC', type: 'Government', parent: null, reg: 'CR-QA-000200', vat: 'QA100000200', sector: 'Healthcare', rating: 'AA', country: 'Qatar', city: 'Doha', address: 'Hamad General Hospital, Al Rayyan Road', po: '3050', contact: 'Dr. Fatima Al-Dosari', email: 'estates@hamad.qa', phone: '+974 4439 4444' },
  { code: 'LSE-004', name: 'Qatar Airways Group', trade: 'Qatar Airways', type: 'Corporate', parent: null, reg: 'CR-QA-002345', vat: 'QA100002345', sector: 'Aviation & Transport', rating: 'A', country: 'Qatar', city: 'Doha', address: 'Qatar Airways Tower, Airport Road', po: '22550', contact: 'Ali Al-Khelaifi', email: 'property@qatarairways.com.qa', phone: '+974 4449 6000' },
  { code: 'LSE-005', name: 'Ooredoo Qatar', trade: 'Ooredoo', type: 'Corporate', parent: 'Ooredoo Group', reg: 'CR-QA-003456', vat: 'QA100003456', sector: 'Telecommunications', rating: 'A-', country: 'Qatar', city: 'Doha', address: 'Ooredoo Tower, West Bay', po: '217', contact: 'Mansoor Al-Mahmoud', email: 'realestate@ooredoo.qa', phone: '+974 4400 0000' },
  { code: 'LSE-006', name: 'Al Meera Consumer Goods', trade: 'Al Meera', type: 'Corporate', parent: null, reg: 'CR-QA-004567', vat: 'QA100004567', sector: 'Retail & FMCG', rating: 'BBB+', country: 'Qatar', city: 'Doha', address: 'Al Meera HQ, C-Ring Road', po: '3468', contact: 'Yousuf Al-Obaidly', email: 'leasing@almeera.com.qa', phone: '+974 4442 2000' },
  { code: 'LSE-007', name: 'Qatar Foundation', trade: 'QF', type: 'Non-Profit', parent: null, reg: 'CR-QA-000300', vat: 'QA100000300', sector: 'Education & Research', rating: 'AAA', country: 'Qatar', city: 'Doha', address: 'Education City, Al Luqta Street', po: '5825', contact: 'Sheikha Al-Misnad', email: 'facilities@qf.org.qa', phone: '+974 4454 0000' },
  { code: 'LSE-008', name: 'Ashghal (Public Works Authority)', trade: 'Ashghal', type: 'Government', parent: null, reg: 'CR-QA-000400', vat: 'QA100000400', sector: 'Infrastructure', rating: 'AA+', country: 'Qatar', city: 'Doha', address: 'Ashghal Tower, Corniche Street', po: '22188', contact: 'Eng. Saad Al-Muhannadi', email: 'admin@ashghal.gov.qa', phone: '+974 4495 5555' },
  { code: 'LSE-009', name: 'Nakilat (Qatar Gas Transport)', trade: 'Nakilat', type: 'Corporate', parent: null, reg: 'CR-QA-005678', vat: 'QA100005678', sector: 'Shipping & Logistics', rating: 'A', country: 'Qatar', city: 'Doha', address: 'Nakilat Tower, Lusail Marina', po: '22271', contact: 'Abdullah Al-Sulaiti', email: 'property@nakilat.com.qa', phone: '+974 4496 7777' },
  { code: 'LSE-010', name: 'Barwa Real Estate', trade: 'Barwa', type: 'Corporate', parent: null, reg: 'CR-QA-006789', vat: 'QA100006789', sector: 'Real Estate', rating: 'BBB', country: 'Qatar', city: 'Doha', address: 'Barwa Tower, West Bay', po: '27777', contact: 'Salman Al-Mohannadi', email: 'leasing@barwa.com.qa', phone: '+974 4494 4444' },
  { code: 'LSE-011', name: 'Industries Qatar (IQ)', trade: 'IQ', type: 'Corporate', parent: null, reg: 'CR-QA-007890', vat: 'QA100007890', sector: 'Petrochemicals', rating: 'A+', country: 'Qatar', city: 'Doha', address: 'IQ Tower, Mesaieed Industrial City', po: '3212', contact: 'Rashid Al-Naimi', email: 'admin@iq.com.qa', phone: '+974 4477 7777' },
  { code: 'LSE-012', name: 'Msheireb Properties', trade: 'Msheireb', type: 'Corporate', parent: 'Qatar Foundation', reg: 'CR-QA-008901', vat: 'QA100008901', sector: 'Real Estate Development', rating: 'A-', country: 'Qatar', city: 'Doha', address: 'Msheireb Downtown, Doha', po: '2828', contact: 'Noor Al-Suwaidi', email: 'leasing@msheireb.com', phone: '+974 4495 0000' },
  { code: 'LSE-013', name: 'Katara Hospitality', trade: 'Katara', type: 'Corporate', parent: null, reg: 'CR-QA-009012', vat: 'QA100009012', sector: 'Hospitality & Tourism', rating: 'A', country: 'Qatar', city: 'Doha', address: 'Katara Cultural Village, West Bay Lagoon', po: '4488', contact: 'Hamad Al-Attiyah', email: 'estates@katara.net', phone: '+974 4408 0000' },
  { code: 'LSE-014', name: 'Milaha (Qatar Navigation)', trade: 'Milaha', type: 'Corporate', parent: null, reg: 'CR-QA-010123', vat: 'QA100010123', sector: 'Maritime & Logistics', rating: 'BBB+', country: 'Qatar', city: 'Doha', address: 'Milaha Tower, Mina District', po: '153', contact: 'Khalifa Al-Hetmi', email: 'property@milaha.com', phone: '+974 4431 5555' },
  { code: 'LSE-015', name: 'Woqod (Qatar Fuel)', trade: 'Woqod', type: 'Corporate', parent: null, reg: 'CR-QA-011234', vat: 'QA100011234', sector: 'Energy Distribution', rating: 'A-', country: 'Qatar', city: 'Doha', address: 'Woqod Tower, C-Ring Road', po: '7777', contact: 'Saad Al-Mohannadi', email: 'facilities@woqod.com.qa', phone: '+974 4446 0000' },
  { code: 'LSE-016', name: 'Sidra Medicine', trade: 'Sidra', type: 'Non-Profit', parent: 'Qatar Foundation', reg: 'CR-QA-000500', vat: 'QA100000500', sector: 'Healthcare', rating: 'AA', country: 'Qatar', city: 'Doha', address: 'Sidra Medicine, Education City', po: '26999', contact: 'Dr. Aisha Al-Malki', email: 'estates@sidra.org', phone: '+974 4003 3333' },
  { code: 'LSE-017', name: 'Qatar Steel', trade: 'Qatar Steel', type: 'Corporate', parent: 'Industries Qatar', reg: 'CR-QA-012345', vat: 'QA100012345', sector: 'Manufacturing', rating: 'BBB', country: 'Qatar', city: 'Mesaieed', address: 'Mesaieed Industrial Area', po: '50090', contact: 'Eng. Faisal Al-Hajri', email: 'admin@qatarsteel.com.qa', phone: '+974 4477 0000' },
  { code: 'LSE-018', name: 'Mannai Corporation', trade: 'Mannai', type: 'Corporate', parent: null, reg: 'CR-QA-013456', vat: 'QA100013456', sector: 'Diversified Conglomerate', rating: 'BBB+', country: 'Qatar', city: 'Doha', address: 'Mannai HQ, Salwa Road', po: '76', contact: 'Bader Al-Mannai', email: 'property@mannai.com.qa', phone: '+974 4455 8888' },
  { code: 'LSE-019', name: 'Al Jazeera Media Network', trade: 'Al Jazeera', type: 'Corporate', parent: null, reg: 'CR-QA-014567', vat: 'QA100014567', sector: 'Media & Broadcasting', rating: 'A', country: 'Qatar', city: 'Doha', address: 'Al Jazeera HQ, West Bay', po: '23123', contact: 'Layla Al-Harthy', email: 'facilities@aljazeera.net', phone: '+974 4489 0000' },
  { code: 'LSE-020', name: 'Qatar Insurance Company (QIC)', trade: 'QIC', type: 'Corporate', parent: null, reg: 'CR-QA-015678', vat: 'QA100015678', sector: 'Insurance', rating: 'A-', country: 'Qatar', city: 'Doha', address: 'QIC Tower, West Bay', po: '666', contact: 'Sultan Al-Abdulla', email: 'leasing@qic.com.qa', phone: '+974 4496 2222' },
];

const newStaff = [
  { num: 'VF-016', name: 'Yousef Al-Malki', desig: 'Senior Lease Analyst', dept: 'Corporate Real Estate', grade: 'G7', pos: 'Analyst', place: 'Doha HQ', email: 'y.almalki@vodafone.qa', phone: '+974 5500 1016' },
  { num: 'VF-017', name: 'Hessa Al-Thani', desig: 'Lease Administrator', dept: 'Corporate Real Estate', grade: 'G6', pos: 'Administrator', place: 'Doha HQ', email: 'h.althani@vodafone.qa', phone: '+974 5500 1017' },
  { num: 'VF-018', name: 'Bader Al-Dosari', desig: 'Fleet Manager', dept: 'Fleet & Logistics', grade: 'G8', pos: 'Manager', place: 'Doha HQ', email: 'b.aldosari@vodafone.qa', phone: '+974 5500 1018' },
  { num: 'VF-019', name: 'Moza Al-Suwaidi', desig: 'Finance Controller', dept: 'Finance', grade: 'G9', pos: 'Controller', place: 'Doha HQ', email: 'm.alsuwaidi@vodafone.qa', phone: '+974 5500 1019' },
  { num: 'VF-020', name: 'Rashid Al-Marri', desig: 'Tower Site Manager', dept: 'Network Infrastructure', grade: 'G8', pos: 'Manager', place: 'Al Wakra', email: 'r.almarri@vodafone.qa', phone: '+974 5500 1020' },
  { num: 'VF-021', name: 'Noora Al-Hajri', desig: 'Legal Counsel', dept: 'Legal', grade: 'G8', pos: 'Counsel', place: 'Doha HQ', email: 'n.alhajri@vodafone.qa', phone: '+974 5500 1021' },
  { num: 'VF-022', name: 'Abdulaziz Al-Kuwari', desig: 'IT Infrastructure Lead', dept: 'IT', grade: 'G8', pos: 'Lead', place: 'Doha HQ', email: 'a.alkuwari@vodafone.qa', phone: '+974 5500 1022' },
  { num: 'VF-023', name: 'Shaikha Al-Misnad', desig: 'Procurement Specialist', dept: 'Procurement', grade: 'G6', pos: 'Specialist', place: 'Doha HQ', email: 's.almisnad@vodafone.qa', phone: '+974 5500 1023' },
  { num: 'VF-024', name: 'Hamad Al-Khelaifi', desig: 'Facilities Coordinator', dept: 'Facilities Management', grade: 'G5', pos: 'Coordinator', place: 'Lusail', email: 'h.alkhelaifi@vodafone.qa', phone: '+974 5500 1024' },
  { num: 'VF-025', name: 'Amna Al-Attiyah', desig: 'IFRS 16 Specialist', dept: 'Finance', grade: 'G7', pos: 'Specialist', place: 'Doha HQ', email: 'a.alattiyah@vodafone.qa', phone: '+974 5500 1025' },
  { num: 'VF-026', name: 'Khalid Al-Rumaihi', desig: 'Retail Expansion Manager', dept: 'Retail', grade: 'G8', pos: 'Manager', place: 'Doha HQ', email: 'k.alrumaihi@vodafone.qa', phone: '+974 5500 1026' },
  { num: 'VF-027', name: 'Latifa Al-Naimi', desig: 'Compliance Officer', dept: 'Compliance', grade: 'G7', pos: 'Officer', place: 'Doha HQ', email: 'l.alnaimi@vodafone.qa', phone: '+974 5500 1027' },
  { num: 'VF-028', name: 'Sultan Al-Mohannadi', desig: 'Network Planning Engineer', dept: 'Network Infrastructure', grade: 'G7', pos: 'Engineer', place: 'Industrial Area', email: 's.almohannadi@vodafone.qa', phone: '+974 5500 1028' },
  { num: 'VF-029', name: 'Mariam Al-Emadi', desig: 'Treasury Analyst', dept: 'Finance', grade: 'G6', pos: 'Analyst', place: 'Doha HQ', email: 'm.alemadi@vodafone.qa', phone: '+974 5500 1029' },
  { num: 'VF-030', name: 'Faisal Al-Qahtani', desig: 'Property Valuation Specialist', dept: 'Corporate Real Estate', grade: 'G7', pos: 'Specialist', place: 'Doha HQ', email: 'f.alqahtani@vodafone.qa', phone: '+974 5500 1030' },
  { num: 'VF-031', name: 'Dana Al-Sulaiti', desig: 'HR Business Partner', dept: 'Human Resources', grade: 'G7', pos: 'Partner', place: 'Doha HQ', email: 'd.alsulaiti@vodafone.qa', phone: '+974 5500 1031' },
  { num: 'VF-032', name: 'Nayef Al-Obaidly', desig: 'Enterprise Account Manager', dept: 'Enterprise Sales', grade: 'G7', pos: 'Manager', place: 'Doha HQ', email: 'n.alobaidly@vodafone.qa', phone: '+974 5500 1032' },
  { num: 'VF-033', name: 'Jawaher Al-Khater', desig: 'Internal Auditor', dept: 'Internal Audit', grade: 'G7', pos: 'Auditor', place: 'Doha HQ', email: 'j.alkhater@vodafone.qa', phone: '+974 5500 1033' },
  { num: 'VF-034', name: 'Turki Al-Binali', desig: 'Data Centre Manager', dept: 'IT', grade: 'G8', pos: 'Manager', place: 'Mesaieed', email: 't.albinali@vodafone.qa', phone: '+974 5500 1034' },
  { num: 'VF-035', name: 'Reem Al-Abdulla', desig: 'ESG & Sustainability Lead', dept: 'Corporate Affairs', grade: 'G8', pos: 'Lead', place: 'Doha HQ', email: 'r.alabdulla@vodafone.qa', phone: '+974 5500 1035' },
];

async function run() {
  const pool = await sql.connect(cfg);

  // Insert 20 lessees
  console.log('📋 Inserting 20 lessees...\n');
  for (const l of lessees) {
    try {
      await pool.request()
        .input('code', sql.VarChar(30), l.code)
        .input('name', sql.NVarChar(200), l.name)
        .input('trade', sql.NVarChar(200), l.trade)
        .input('type', sql.VarChar(30), l.type)
        .input('parent', sql.NVarChar(200), l.parent)
        .input('reg', sql.VarChar(100), l.reg)
        .input('vat', sql.VarChar(100), l.vat)
        .input('sector', sql.NVarChar(100), l.sector)
        .input('rating', sql.VarChar(20), l.rating)
        .input('country', sql.VarChar(100), l.country)
        .input('city', sql.NVarChar(100), l.city)
        .input('address', sql.NVarChar(500), l.address)
        .input('po', sql.VarChar(50), l.po)
        .input('contact', sql.NVarChar(200), l.contact)
        .input('email', sql.VarChar(200), l.email)
        .input('phone', sql.VarChar(50), l.phone)
        .query(`INSERT INTO lessee.lessees (lessee_code, lessee_name, trade_name, entity_type, parent_company, registration_no, tax_vat_no, industry_sector, credit_rating, country, city, address, po_box, contact_person, contact_email, contact_phone, status, created_at, updated_at)
          VALUES (@code, @name, @trade, @type, @parent, @reg, @vat, @sector, @rating, @country, @city, @address, @po, @contact, @email, @phone, 'Active', GETUTCDATE(), GETUTCDATE())`);
      console.log(`  ✓ ${l.code} ${l.name}`);
    } catch (e) {
      console.log(`  ✗ ${l.code}: ${e.message.substring(0, 80)}`);
    }
  }

  // Insert 20 new staff
  console.log('\n👥 Inserting 20 staff...\n');
  for (const s of newStaff) {
    try {
      await pool.request()
        .input('num', sql.VarChar(30), s.num)
        .input('name', sql.NVarChar(200), s.name)
        .input('desig', sql.NVarChar(200), s.desig)
        .input('dept', sql.NVarChar(200), s.dept)
        .input('grade', sql.VarChar(20), s.grade)
        .input('pos', sql.NVarChar(200), s.pos)
        .input('place', sql.NVarChar(200), s.place)
        .input('email', sql.VarChar(200), s.email)
        .input('phone', sql.VarChar(50), s.phone)
        .input('entity', sql.NVarChar(200), 'Vodafone Qatar')
        .query(`INSERT INTO hr.staff (staff_number, full_name, designation, department, grade, position, place_of_work, email, phone, entity, status, created_at)
          VALUES (@num, @name, @desig, @dept, @grade, @pos, @place, @email, @phone, @entity, 'Active', GETUTCDATE())`);
      console.log(`  ✓ ${s.num} ${s.name} — ${s.dept}`);
    } catch (e) {
      console.log(`  ✗ ${s.num}: ${e.message.substring(0, 80)}`);
    }
  }

  // Verify
  const lc = await pool.request().query('SELECT COUNT(*) as cnt FROM lessee.lessees');
  const sc = await pool.request().query('SELECT COUNT(*) as cnt FROM hr.staff');
  console.log(`\n✅ Total lessees: ${lc.recordset[0].cnt}`);
  console.log(`✅ Total staff: ${sc.recordset[0].cnt}`);

  pool.close();
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
