/**
 * Seed Data Script — Creates 12 realistic leases, originates them, and generates monthly JVs.
 * Then applies modifications/renewals on some to create full lifecycle data for reports.
 */
import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
};

const leases = [
  // Offices — QAR
  { lessorId: 16, assetType: 'Office', desc: 'Head Office — West Bay Tower, Floor 22', tag: 'OFF-WB-22', commence: '2024-01-01', expiry: '2027-12-31', term: 48, payment: 85000, currency: 'QAR', ibr: 5.50, escalation: 3.0, deposit: 170000, classification: 'Operating' },
  { lessorId: 17, assetType: 'Office', desc: 'Branch Office — Lusail Marina, Unit 5B', tag: 'OFF-LM-5B', commence: '2024-06-01', expiry: '2027-05-31', term: 36, payment: 42000, currency: 'QAR', ibr: 5.25, escalation: 2.5, deposit: 84000, classification: 'Operating' },
  { lessorId: 18, assetType: 'Office', desc: 'Operations Centre — Al Sadd, Building 7', tag: 'OFF-AS-07', commence: '2023-07-01', expiry: '2026-06-30', term: 36, payment: 55000, currency: 'QAR', ibr: 4.75, escalation: 2.0, deposit: 110000, classification: 'Operating' },
  // Offices — AED
  { lessorId: 1, assetType: 'Office', desc: 'Dubai Regional Office — DIFC Gate Village', tag: 'OFF-DXB-GV', commence: '2024-03-01', expiry: '2028-02-29', term: 48, payment: 120000, currency: 'AED', ibr: 5.00, escalation: 3.0, deposit: 240000, classification: 'Operating' },
  { lessorId: 3, assetType: 'Office', desc: 'Abu Dhabi Office — Al Reem Island', tag: 'OFF-AUH-RI', commence: '2025-01-01', expiry: '2027-12-31', term: 36, payment: 65000, currency: 'AED', ibr: 4.50, escalation: 2.0, deposit: 130000, classification: 'Operating' },
  // Vehicles — QAR
  { lessorId: 19, assetType: 'Vehicle', desc: 'Fleet — Toyota Land Cruiser (x4)', tag: 'VEH-TLC-001', commence: '2024-04-01', expiry: '2027-03-31', term: 36, payment: 18000, currency: 'QAR', ibr: 6.00, escalation: 0, deposit: 36000, classification: 'Finance' },
  { lessorId: 19, assetType: 'Vehicle', desc: 'Fleet — Nissan Patrol (x2)', tag: 'VEH-NP-001', commence: '2025-01-01', expiry: '2027-12-31', term: 36, payment: 12000, currency: 'QAR', ibr: 6.25, escalation: 0, deposit: 24000, classification: 'Finance' },
  // Equipment — QAR
  { lessorId: 16, assetType: 'Equipment', desc: 'IT Server Rack — Data Centre', tag: 'EQP-DC-001', commence: '2024-01-01', expiry: '2026-12-31', term: 36, payment: 28000, currency: 'QAR', ibr: 5.75, escalation: 0, deposit: 56000, classification: 'Finance' },
  { lessorId: 17, assetType: 'Equipment', desc: 'Printing & Scanning Equipment', tag: 'EQP-PS-001', commence: '2024-09-01', expiry: '2027-08-31', term: 36, payment: 8500, currency: 'QAR', ibr: 5.50, escalation: 0, deposit: 17000, classification: 'Operating' },
  // Warehouse — AED
  { lessorId: 6, assetType: 'Warehouse', desc: 'Logistics Warehouse — Jebel Ali Free Zone', tag: 'WH-JAFZ-01', commence: '2023-10-01', expiry: '2028-09-30', term: 60, payment: 95000, currency: 'AED', ibr: 4.25, escalation: 2.5, deposit: 285000, classification: 'Operating' },
  // Retail — AED
  { lessorId: 8, assetType: 'Retail', desc: 'Retail Showroom — City Walk', tag: 'RTL-CW-01', commence: '2024-02-01', expiry: '2029-01-31', term: 60, payment: 150000, currency: 'AED', ibr: 4.75, escalation: 3.0, deposit: 450000, classification: 'Operating' },
  // Land — QAR
  { lessorId: 18, assetType: 'Land', desc: 'Industrial Plot — Ras Laffan', tag: 'LND-RL-001', commence: '2023-01-01', expiry: '2032-12-31', term: 120, payment: 35000, currency: 'QAR', ibr: 4.00, escalation: 1.5, deposit: 420000, classification: 'Operating' },
];

async function main() {
  const pool = await sql.connect(config);
  console.log('Connected. Creating leases...');

  const contractIds = [];

  for (const l of leases) {
    try {
      const result = await pool.request()
        .input('LessorId', sql.Int, l.lessorId)
        .input('AssetType', sql.VarChar(50), l.assetType)
        .input('AssetDescription', sql.NVarChar(500), l.desc)
        .input('AssetTag', sql.VarChar(100), l.tag)
        .input('LocationJson', sql.NVarChar(sql.MAX), JSON.stringify({ region: l.currency === 'QAR' ? 'Qatar' : 'UAE', city: l.tag.includes('DXB') ? 'Dubai' : l.tag.includes('AUH') ? 'Abu Dhabi' : 'Doha' }))
        .input('CommencementDate', sql.Date, new Date(l.commence))
        .input('ExpiryDate', sql.Date, new Date(l.expiry))
        .input('TermMonths', sql.Int, l.term)
        .input('MonthlyPayment', sql.Decimal(18, 2), l.payment)
        .input('Currency', sql.Char(3), l.currency)
        .input('EscalationRate', sql.Decimal(5, 2), l.escalation)
        .input('EscalationDate', sql.Date, l.escalation > 0 ? new Date(new Date(l.commence).getFullYear() + 1, new Date(l.commence).getMonth(), 1) : null)
        .input('IBR', sql.Decimal(10, 6), l.ibr)
        .input('DepositAmount', sql.Decimal(18, 2), l.deposit)
        .input('IFRS16Classification', sql.VarChar(20), l.classification)
        .input('RenewalOption', sql.Bit, l.term >= 48 ? 1 : 0)
        .input('RenewalCertain', sql.Bit, 0)
        .input('PurchaseOption', sql.Bit, l.classification === 'Finance' ? 1 : 0)
        .input('PurchaseCertain', sql.Bit, 0)
        .input('MakeGoodObligation', sql.Bit, l.assetType === 'Office' ? 1 : 0)
        .input('MakeGoodEstimate', sql.Decimal(18, 2), l.assetType === 'Office' ? l.payment * 2 : 0)
        .input('InitialDirectCosts', sql.Decimal(18, 2), l.payment * 0.5)
        .input('LeaseIncentives', sql.Decimal(18, 2), 0)
        .input('IsLTO', sql.Bit, l.classification === 'Finance' ? 1 : 0)
        .input('LTOPurchasePrice', sql.Decimal(18, 2), l.classification === 'Finance' ? l.payment * l.term * 0.1 : 0)
        .input('LTODeposit', sql.Decimal(18, 2), l.classification === 'Finance' ? l.deposit : 0)
        .input('LTONetFinanced', sql.Decimal(18, 2), 0)
        .input('LTOTotalInstalments', sql.Int, l.classification === 'Finance' ? l.term : 0)
        .input('LTOInstalmentAmount', sql.Decimal(18, 2), l.classification === 'Finance' ? l.payment : 0)
        .input('LTOFrequency', sql.VarChar(20), l.classification === 'Finance' ? 'Monthly' : null)
        .input('LTOFinanceChargeRate', sql.Decimal(10, 6), l.classification === 'Finance' ? l.ibr : 0)
        .input('LTOBalloonAmount', sql.Decimal(18, 2), 0)
        .input('LTOTransferDate', sql.Date, null)
        .input('MaintenanceResp', sql.VarChar(20), 'Lessee')
        .input('MakerId', sql.Int, 1)
        .input('ScreenId', sql.VarChar(20), 'SEED')
        .input('ProcessStartTime', sql.DateTime2, new Date())
        .execute('dbo.sp_CreateLease');

      const contractId = result.recordset?.[0]?.contract_id;
      if (contractId) {
        contractIds.push(contractId);
        console.log(`  ✓ Created: ${l.tag} → contract_id=${contractId}`);
      } else {
        console.log(`  ✓ Created: ${l.tag} (no ID returned, checking...)`);
        const check = await pool.request().query(`SELECT TOP 1 contract_id FROM lease.contracts WHERE asset_tag='${l.tag}' ORDER BY contract_id DESC`);
        if (check.recordset[0]) {
          contractIds.push(check.recordset[0].contract_id);
          console.log(`    → Found contract_id=${check.recordset[0].contract_id}`);
        }
      }
    } catch (e) {
      console.error(`  ✗ Failed: ${l.tag} — ${e.message}`);
    }
  }

  console.log(`\nCreated ${contractIds.length} leases. Now submitting and approving...`);

  // Submit and approve each lease
  for (const cid of contractIds) {
    try {
      await pool.request()
        .input('ContractId', sql.Int, cid)
        .input('MakerId', sql.Int, 1)
        .execute('dbo.sp_SubmitLeaseForApproval');
      console.log(`  ✓ Submitted contract_id=${cid}`);
    } catch (e) {
      console.log(`  ⚠ Submit ${cid}: ${e.message}`);
    }

    try {
      await pool.request()
        .input('ContractId', sql.Int, cid)
        .input('CheckerId', sql.Int, 2)
        .input('Decision', sql.VarChar(20), 'Approved')
        .input('Comments', sql.NVarChar(500), 'Auto-approved for seed data')
        .execute('dbo.sp_ApproveRejectLease');
      console.log(`  ✓ Approved contract_id=${cid}`);
    } catch (e) {
      console.log(`  ⚠ Approve ${cid}: ${e.message}`);
    }
  }

  console.log('\nOriginating leases (JE-1 + amort schedule)...');
  for (const cid of contractIds) {
    try {
      await pool.request()
        .input('ContractId', sql.Int, cid)
        .input('PostedBy', sql.NVarChar(100), 'SeedScript')
        .execute('lease.sp_OriginateLease');
      console.log(`  ✓ Originated contract_id=${cid}`);
    } catch (e) {
      console.log(`  ⚠ Originate ${cid}: ${e.message}`);
    }
  }

  console.log('\nGenerating monthly JVs for all periods up to today...');
  for (const cid of contractIds) {
    try {
      // Get all schedule IDs up to today
      const schedRows = await pool.request().query(
        `SELECT schedule_id FROM lease.amortisation_schedule WHERE contract_id=${cid} AND period_date <= GETDATE() ORDER BY period_date`
      );
      if (schedRows.recordset.length > 0) {
        const csv = schedRows.recordset.map(r => r.schedule_id).join(',');
        await pool.request()
          .input('schedule_ids_csv', sql.VarChar(sql.MAX), csv)
          .input('contract_id', sql.Int, cid)
          .input('created_by', sql.VarChar(200), 'SeedScript')
          .execute('accounting.sp_GenerateMonthlyJVsForSelected');
        console.log(`  ✓ Generated ${schedRows.recordset.length} monthly JVs for contract_id=${cid}`);
      } else {
        console.log(`  ⚠ No periods due yet for contract_id=${cid}`);
      }
    } catch (e) {
      console.log(`  ⚠ GenJVs ${cid}: ${e.message}`);
    }
  }

  // Apply a modification (rent increase) on the 1st office lease
  console.log('\nApplying modification (rent increase) on first office lease...');
  if (contractIds.length > 0) {
    try {
      await pool.request()
        .input('ContractId', sql.Int, contractIds[0])
        .input('EffectiveDate', sql.Date, new Date('2025-07-01'))
        .input('NewMonthlyPayment', sql.Decimal(18, 2), 92000) // increase from 85000
        .input('NewIBR', sql.Decimal(8, 6), 0.055)
        .input('PostedBy', sql.NVarChar(100), 'SeedScript')
        .execute('dbo.sp_ApplyLeaseModification');
      console.log('  ✓ Modification applied on contract_id=' + contractIds[0]);
    } catch (e) {
      console.log(`  ⚠ Modification: ${e.message}`);
    }
  }

  // Apply a renewal on the 3rd lease (Operations Centre expiring 2026-06-30 → extend to 2028-06-30)
  console.log('\nApplying renewal on Operations Centre lease...');
  if (contractIds.length > 2) {
    try {
      await pool.request()
        .input('ContractId', sql.Int, contractIds[2])
        .input('NewExpiryDate', sql.Date, new Date('2028-06-30'))
        .input('NewMonthlyPayment', sql.Decimal(18, 2), 58000) // slight increase
        .input('NewIBR', sql.Decimal(8, 6), 0.0525)
        .input('PostedBy', sql.NVarChar(100), 'SeedScript')
        .execute('dbo.sp_ApplyRenewal');
      console.log('  ✓ Renewal applied on contract_id=' + contractIds[2]);
    } catch (e) {
      console.log(`  ⚠ Renewal: ${e.message}`);
    }
  }

  // Summary
  const summary = await pool.request().query(`
    SELECT 
      COUNT(*) as total_contracts,
      SUM(CASE WHEN lifecycle_status = 'Originated' THEN 1 ELSE 0 END) as originated,
      (SELECT COUNT(*) FROM lease.amortisation_schedule) as total_amort_rows,
      (SELECT COUNT(*) FROM accounting.journal_vouchers) as total_jvs,
      (SELECT COUNT(*) FROM lease.gl_postings) as total_gl_postings
    FROM lease.contracts
  `);
  console.log('\n=== SEED DATA SUMMARY ===');
  console.log(JSON.stringify(summary.recordset[0], null, 2));

  await pool.close();
  console.log('\nDone!');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
