import sql from 'mssql';
import 'dotenv/config';

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  pool: { max: 3, min: 0, idleTimeoutMillis: 8000, acquireTimeoutMillis: 12000 }
};

const pool = await sql.connect(cfg);

// ── 1. Clear dependent tables first, then main tables ────────────────────────
console.log('Clearing old data...');
// Null out FK references in other tables that point to lessor.lessors
await pool.request().query('UPDATE asset.assets SET current_lessor_id = NULL WHERE current_lessor_id IS NOT NULL');
await pool.request().query('DELETE FROM lessor.lessor_contacts');
await pool.request().query('DELETE FROM lessor.lessor_bank_accounts');
await pool.request().query('DELETE FROM lessor.lessor_documents');
await pool.request().query('DELETE FROM lessor.lessor_notes');
await pool.request().query('DELETE FROM lessor.lessors');
await pool.request().query('DELETE FROM lessee.lessee_bank_accounts');
await pool.request().query('DELETE FROM lessee.lessee_signatories');
await pool.request().query('DELETE FROM lessee.lessees');
console.log('Old data cleared.');

// ── 2. Seed LESSOR = Vodafone Qatar + 4 subsidiaries ─────────────────────────
const lessors = [
  {
    code: 'VF-QA-001', name: 'Vodafone Qatar P.Q.S.C.', type: 'Corporate',
    reg: 'QA-CR-2009-00001', tax: 'QA-TAX-VFQ-001', country: 'QAT', city: 'Doha',
    addr: 'Vodafone Tower, West Bay, Doha, Qatar', postal: '23100',
    website: 'https://www.vodafone.qa', currency: 'QAR', credit: 'AAA',
    payment_terms: 30, status: 'Active'
  },
  {
    code: 'VF-QA-002', name: 'Vodafone Qatar Business Solutions W.L.L.', type: 'Subsidiary',
    reg: 'QA-CR-2012-00045', tax: 'QA-TAX-VBS-002', country: 'QAT', city: 'Doha',
    addr: 'Al Sadd Commercial District, Doha, Qatar', postal: '23101',
    website: 'https://business.vodafone.qa', currency: 'QAR', credit: 'AA+',
    payment_terms: 30, status: 'Active'
  },
  {
    code: 'VF-QA-003', name: 'Vodafone Qatar Retail LLC', type: 'Subsidiary',
    reg: 'QA-CR-2013-00078', tax: 'QA-TAX-VRT-003', country: 'QAT', city: 'Doha',
    addr: 'Villaggio Mall, Al Waab Street, Doha, Qatar', postal: '23102',
    website: 'https://retail.vodafone.qa', currency: 'QAR', credit: 'AA',
    payment_terms: 30, status: 'Active'
  },
  {
    code: 'VF-QA-004', name: 'Vodafone Qatar Infrastructure Services W.L.L.', type: 'Subsidiary',
    reg: 'QA-CR-2015-00112', tax: 'QA-TAX-VIS-004', country: 'QAT', city: 'Doha',
    addr: 'Industrial Area, Street 17, Doha, Qatar', postal: '23103',
    website: 'https://infra.vodafone.qa', currency: 'QAR', credit: 'AA',
    payment_terms: 45, status: 'Active'
  },
  {
    code: 'VF-INT-001', name: 'Vodafone International Holdings B.V.', type: 'Parent',
    reg: 'NL-KVK-34180173', tax: 'NL-VAT-NL854252779B01', country: 'NLD', city: 'Amsterdam',
    addr: 'Rivierstaete, Amsteldijk 166, 1079 LH Amsterdam', postal: '1079 LH',
    website: 'https://www.vodafone.com', currency: 'EUR', credit: 'AAA',
    payment_terms: 60, status: 'Active'
  }
];

for (const l of lessors) {
  const req = pool.request();
  req.input('code', l.code); req.input('name', l.name); req.input('type', l.type);
  req.input('reg', l.reg); req.input('tax', l.tax); req.input('country', l.country);
  req.input('city', l.city); req.input('addr', l.addr); req.input('postal', l.postal);
  req.input('website', l.website); req.input('currency', l.currency);
  req.input('credit', l.credit); req.input('terms', l.payment_terms);
  req.input('status', l.status);
  await req.query(`
    INSERT INTO lessor.lessors
      (lessor_code, lessor_name, lessor_type, registration_no, tax_id, country, city,
       address_line1, postal_code, website, preferred_currency, credit_rating,
       payment_terms, status, created_by)
    VALUES (@code, @name, @type, @reg, @tax, @country, @city,
            @addr, @postal, @website, @currency, @credit, @terms, @status, 1)
  `);
  console.log('Inserted lessor:', l.name);
}

// ── 3. Seed LESSEE = Real Estate + Car Fleet companies ───────────────────────
const lessees = [
  // Real Estate
  {
    code: 'LSE-RE-001', name: 'Barwa Real Estate Company Q.P.S.C.', trade: 'Barwa',
    type: 'Real Estate', parent: null, reg: 'QA-CR-2005-00234', tax: 'QA-TAX-BRE-001',
    sector: 'Real Estate', credit: 'A+', country: 'Qatar', city: 'Doha',
    addr: 'Barwa Tower, Al Corniche Street, Doha, Qatar', po_box: '7178',
    contact: 'Mohammed Al-Sulaiti', email: 'leasing@barwa.com.qa', phone: '+974 4455 6677',
    website: 'https://www.barwa.com.qa', status: 'Active'
  },
  {
    code: 'LSE-RE-002', name: 'Ezdan Holding Group Q.P.S.C.', trade: 'Ezdan',
    type: 'Real Estate', parent: null, reg: 'QA-CR-2006-00345', tax: 'QA-TAX-EZD-002',
    sector: 'Real Estate', credit: 'A', country: 'Qatar', city: 'Al Wakrah',
    addr: 'Ezdan Village, Al Wakrah, Qatar', po_box: '14212',
    contact: 'Khalid Al-Obaidly', email: 'leasing@ezdanholding.com', phone: '+974 4477 8899',
    website: 'https://www.ezdanholding.com', status: 'Active'
  },
  {
    code: 'LSE-RE-003', name: 'Aldar Properties PJSC', trade: 'Aldar',
    type: 'Real Estate', parent: null, reg: 'AE-ADX-2004-00123', tax: 'AE-TRN-100234567800003',
    sector: 'Real Estate', credit: 'A+', country: 'UAE', city: 'Abu Dhabi',
    addr: 'Aldar HQ, Al Raha Beach, Abu Dhabi, UAE', po_box: '51133',
    contact: 'Fatima Al-Hameli', email: 'corporate.leasing@aldar.com', phone: '+971 2 810 5555',
    website: 'https://www.aldar.com', status: 'Active'
  },
  {
    code: 'LSE-RE-004', name: 'Emaar Properties PJSC', trade: 'Emaar',
    type: 'Real Estate', parent: null, reg: 'AE-DFM-1997-00001', tax: 'AE-TRN-100123456700003',
    sector: 'Real Estate', credit: 'AA-', country: 'UAE', city: 'Dubai',
    addr: 'Emaar Square, Downtown Dubai, Dubai, UAE', po_box: '9440',
    contact: 'Ahmed Al-Maktoum', email: 'leasing@emaar.ae', phone: '+971 4 367 3333',
    website: 'https://www.emaar.com', status: 'Active'
  },
  // Car Fleet
  {
    code: 'LSE-CF-001', name: 'Al Futtaim Fleet Management LLC', trade: 'Al Futtaim Fleet',
    type: 'Car Fleet', parent: 'Al Futtaim Group', reg: 'AE-DED-2001-00567', tax: 'AE-TRN-100345678900003',
    sector: 'Automotive Fleet', credit: 'A', country: 'UAE', city: 'Dubai',
    addr: 'Al Futtaim Auto Centre, Festival City, Dubai, UAE', po_box: '152',
    contact: 'Omar Al-Futtaim', email: 'fleet.leasing@alfuttaim.ae', phone: '+971 4 213 5000',
    website: 'https://www.alfuttaim.ae', status: 'Active'
  },
  {
    code: 'LSE-CF-002', name: 'Agility Fleet Solutions W.L.L.', trade: 'Agility Fleet',
    type: 'Car Fleet', parent: 'Agility Public Warehousing Company', reg: 'KW-MOC-2003-00789', tax: 'KW-TAX-AGF-001',
    sector: 'Logistics & Fleet', credit: 'BBB+', country: 'Kuwait', city: 'Kuwait City',
    addr: 'Agility Logistics Park, Shuwaikh Industrial Area, Kuwait', po_box: '25473',
    contact: 'Tarek Al-Sabah', email: 'fleet@agility.com', phone: '+965 2221 5000',
    website: 'https://www.agility.com', status: 'Active'
  },
  {
    code: 'LSE-CF-003', name: 'FAST Telco Fleet Services LLC', trade: 'FAST Fleet',
    type: 'Car Fleet', parent: null, reg: 'QA-CR-2010-00456', tax: 'QA-TAX-FFS-001',
    sector: 'Telecom Fleet', credit: 'BBB', country: 'Qatar', city: 'Doha',
    addr: 'Industrial Area, Zone 58, Doha, Qatar', po_box: '31456',
    contact: 'Nasser Al-Qahtani', email: 'fleet@fasttelco.qa', phone: '+974 4433 2211',
    website: 'https://www.fasttelco.qa', status: 'Active'
  }
];

for (const l of lessees) {
  const req = pool.request();
  req.input('code', l.code); req.input('name', l.name); req.input('trade', l.trade);
  req.input('type', l.type); req.input('parent', l.parent);
  req.input('reg', l.reg); req.input('tax', l.tax); req.input('sector', l.sector);
  req.input('credit', l.credit); req.input('country', l.country); req.input('city', l.city);
  req.input('addr', l.addr); req.input('po_box', l.po_box);
  req.input('contact', l.contact); req.input('email', l.email); req.input('phone', l.phone);
  req.input('website', l.website); req.input('status', l.status);
  await req.query(`
    INSERT INTO lessee.lessees
      (lessee_code, lessee_name, trade_name, entity_type, parent_company,
       registration_no, tax_vat_no, industry_sector, credit_rating,
       country, city, address, po_box, contact_person, contact_email,
       contact_phone, website, status, created_by)
    VALUES (@code, @name, @trade, @type, @parent,
            @reg, @tax, @sector, @credit,
            @country, @city, @addr, @po_box, @contact, @email,
            @phone, @website, @status, 1)
  `);
  console.log('Inserted lessee:', l.name);
}

await pool.close();
console.log('\nDone! Lessor = Vodafone (5 rows), Lessee = Real Estate + Car Fleet (7 rows)');
