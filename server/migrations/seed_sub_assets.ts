/**
 * seed_sub_assets.ts
 * Seeds realistic sub-asset data for all leases across different asset types.
 * Each lease gets 2-4 sub-asset sets appropriate to its asset_type.
 */
import { getPool } from "../db-sqlserver";

async function main() {
  const pool = await getPool();

  // Get all contracts with their asset type
  const contracts = await pool.request().query(`
    SELECT contract_id, contract_ref, asset_type FROM lease.contracts ORDER BY contract_id
  `);

  // Asset sets by type — realistic furniture/equipment sets
  const assetSetsByType: Record<string, Array<{
    setName: string;
    items: Array<{ code: string; name: string; category: string; qty: number; serial: string; warrantyExpiry: string }>;
  }>> = {
    CorporateOffice: [
      {
        setName: "Executive Office Furniture Set",
        items: [
          { code: "FUR-DSK-001", name: "Executive Desk L-Shape", category: "Furniture", qty: 1, serial: "DSK-2023-001", warrantyExpiry: "2026-12-31" },
          { code: "FUR-CHR-001", name: "Executive Chair Leather", category: "Furniture", qty: 1, serial: "CHR-2023-001", warrantyExpiry: "2026-12-31" },
          { code: "FUR-CAB-001", name: "Filing Cabinet 4-Drawer", category: "Storage & Wardrobes", qty: 2, serial: "CAB-2023-001", warrantyExpiry: "2027-06-30" },
          { code: "FUR-SOF-002", name: "Reception Sofa 3-Seater", category: "Furniture", qty: 1, serial: "SOF-2023-001", warrantyExpiry: "2026-12-31" },
        ]
      },
      {
        setName: "IT Infrastructure Set",
        items: [
          { code: "IT-SRV-001", name: "Dell PowerEdge Server R740", category: "IT Equipment", qty: 2, serial: "SRV-2023-001", warrantyExpiry: "2026-06-30" },
          { code: "IT-SWT-001", name: "Cisco Catalyst 9300 Switch", category: "IT Equipment", qty: 3, serial: "SWT-2023-001", warrantyExpiry: "2026-06-30" },
          { code: "IT-UPS-001", name: "APC Smart-UPS 3000VA", category: "IT Equipment", qty: 2, serial: "UPS-2023-001", warrantyExpiry: "2025-12-31" },
        ]
      },
      {
        setName: "HVAC & Building Services",
        items: [
          { code: "HVAC-AC-001", name: "Daikin VRV System 10HP", category: "HVAC", qty: 2, serial: "AC-2022-001", warrantyExpiry: "2025-06-30" },
          { code: "HVAC-AHU-001", name: "Air Handling Unit 5000CFM", category: "HVAC", qty: 1, serial: "AHU-2022-001", warrantyExpiry: "2025-06-30" },
          { code: "HVAC-FCU-001", name: "Fan Coil Unit 4-Way", category: "HVAC", qty: 8, serial: "FCU-2022-001", warrantyExpiry: "2025-06-30" },
        ]
      },
    ],
    TowerSite: [
      {
        setName: "Telecom Equipment Set",
        items: [
          { code: "TEL-ANT-001", name: "Nokia AirScale Antenna 4T4R", category: "Telecom", qty: 3, serial: "ANT-2023-001", warrantyExpiry: "2027-12-31" },
          { code: "TEL-RRU-001", name: "Ericsson Radio Unit RRU 4449", category: "Telecom", qty: 3, serial: "RRU-2023-001", warrantyExpiry: "2027-12-31" },
          { code: "TEL-BBU-001", name: "Huawei BBU 5900 Baseband Unit", category: "Telecom", qty: 1, serial: "BBU-2023-001", warrantyExpiry: "2027-12-31" },
        ]
      },
      {
        setName: "Power & Backup Systems",
        items: [
          { code: "PWR-GEN-001", name: "Cummins Diesel Generator 100kVA", category: "Power", qty: 1, serial: "GEN-2022-001", warrantyExpiry: "2026-06-30" },
          { code: "PWR-BAT-001", name: "VRLA Battery Bank 48V 200Ah", category: "Power", qty: 4, serial: "BAT-2022-001", warrantyExpiry: "2025-12-31" },
          { code: "PWR-REC-001", name: "Rectifier Module 50A", category: "Power", qty: 2, serial: "REC-2022-001", warrantyExpiry: "2025-12-31" },
        ]
      },
      {
        setName: "Tower & Civil Infrastructure",
        items: [
          { code: "CIV-TWR-001", name: "Guyed Mast Tower 60m", category: "Civil", qty: 1, serial: "TWR-2021-001", warrantyExpiry: "2031-12-31" },
          { code: "CIV-FEN-001", name: "Security Fencing 2.4m Chain Link", category: "Civil", qty: 1, serial: "FEN-2021-001", warrantyExpiry: "2031-12-31" },
          { code: "CIV-SHL-001", name: "Equipment Shelter 3m x 3m", category: "Civil", qty: 1, serial: "SHL-2021-001", warrantyExpiry: "2031-12-31" },
        ]
      },
    ],
    DataCentre: [
      {
        setName: "Server & Compute Infrastructure",
        items: [
          { code: "DC-SRV-001", name: "HPE ProLiant DL380 Gen10", category: "IT Equipment", qty: 10, serial: "SRV-2023-DC1", warrantyExpiry: "2026-12-31" },
          { code: "DC-STG-001", name: "NetApp AFF A400 Storage Array", category: "IT Equipment", qty: 2, serial: "STG-2023-DC1", warrantyExpiry: "2026-12-31" },
          { code: "DC-SWT-001", name: "Arista 7050X3 ToR Switch", category: "IT Equipment", qty: 4, serial: "SWT-2023-DC1", warrantyExpiry: "2026-12-31" },
        ]
      },
      {
        setName: "Cooling & Power Distribution",
        items: [
          { code: "DC-CRH-001", name: "Schneider InRow RC Cooling 30kW", category: "HVAC", qty: 4, serial: "CRH-2022-DC1", warrantyExpiry: "2025-06-30" },
          { code: "DC-PDU-001", name: "Vertiv Geist PDU 32A 3-Phase", category: "Power", qty: 8, serial: "PDU-2022-DC1", warrantyExpiry: "2025-06-30" },
          { code: "DC-UPS-001", name: "Eaton 9PX UPS 10kVA", category: "Power", qty: 4, serial: "UPS-2022-DC1", warrantyExpiry: "2025-06-30" },
        ]
      },
    ],
    RetailOutlet: [
      {
        setName: "Retail Fixtures & Display",
        items: [
          { code: "RET-SHF-001", name: "Gondola Shelving Unit 2m", category: "Fixtures", qty: 12, serial: "SHF-2023-001", warrantyExpiry: "2028-12-31" },
          { code: "RET-CAS-001", name: "POS Counter with Drawer", category: "Fixtures", qty: 2, serial: "CAS-2023-001", warrantyExpiry: "2026-12-31" },
          { code: "RET-DSP-001", name: "Digital Display Screen 55\"", category: "Electronics", qty: 4, serial: "DSP-2023-001", warrantyExpiry: "2026-12-31" },
          { code: "RET-SEC-001", name: "CCTV Camera System 8-Channel", category: "Security", qty: 1, serial: "SEC-2023-001", warrantyExpiry: "2026-12-31" },
        ]
      },
      {
        setName: "Retail IT & POS Equipment",
        items: [
          { code: "RET-POS-001", name: "Ingenico iSC480 POS Terminal", category: "IT Equipment", qty: 3, serial: "POS-2023-001", warrantyExpiry: "2025-12-31" },
          { code: "RET-TAB-001", name: "Samsung Galaxy Tab A8 10.5\"", category: "IT Equipment", qty: 4, serial: "TAB-2023-001", warrantyExpiry: "2025-12-31" },
          { code: "RET-PRT-001", name: "Zebra ZD421 Label Printer", category: "IT Equipment", qty: 2, serial: "PRT-2023-001", warrantyExpiry: "2025-12-31" },
        ]
      },
    ],
    FleetVehicle: [
      {
        setName: "Vehicle Accessories & Equipment",
        items: [
          { code: "VEH-GPS-001", name: "Garmin Fleet 790 GPS Tracker", category: "Electronics", qty: 1, serial: "GPS-2023-001", warrantyExpiry: "2026-12-31" },
          { code: "VEH-CAM-001", name: "Dashcam Dual Channel 4K", category: "Electronics", qty: 1, serial: "CAM-2023-001", warrantyExpiry: "2025-12-31" },
          { code: "VEH-TLS-001", name: "Tool Kit Emergency Roadside", category: "Tools", qty: 1, serial: "TLS-2023-001", warrantyExpiry: "2028-12-31" },
        ]
      },
    ],
    Warehouse: [
      {
        setName: "Warehouse Equipment Set",
        items: [
          { code: "WH-FLT-001", name: "Toyota 8FBN18 Electric Forklift", category: "Heavy Equipment", qty: 2, serial: "FLT-2022-001", warrantyExpiry: "2026-06-30" },
          { code: "WH-RCK-001", name: "Selective Pallet Racking 5-Level", category: "Fixtures", qty: 20, serial: "RCK-2022-001", warrantyExpiry: "2032-12-31" },
          { code: "WH-CNV-001", name: "Conveyor Belt System 10m", category: "Heavy Equipment", qty: 1, serial: "CNV-2022-001", warrantyExpiry: "2026-06-30" },
        ]
      },
    ],
  };

  // Default set for unknown asset types
  const defaultSet = assetSetsByType.CorporateOffice;

  let seeded = 0;
  let skipped = 0;

  for (const contract of contracts.recordset) {
    const { contract_id, contract_ref, asset_type } = contract;

    // Check if this lease already has sub-assets
    const existing = await pool.request()
      .input("lease_id", contract_id.toString())
      .query("SELECT COUNT(*) as cnt FROM asset.lease_sub_assets WHERE lease_id = @lease_id");

    if (existing.recordset[0].cnt > 0) {
      skipped++;
      continue;
    }

    // Get the appropriate sets for this asset type
    const sets = assetSetsByType[asset_type] || defaultSet;

    // Pick 2 sets for this lease (or all if fewer)
    const setsToAttach = sets.slice(0, Math.min(2, sets.length));

    for (const set of setsToAttach) {
      // Build tags_with_serials JSON
      const tagsWithSerials = set.items.map(item => ({
        code: item.code,
        name: item.name,
        category: item.category,
        qty: item.qty,
        serialNumbers: [item.serial],
        leaseDate: new Date().toISOString().split("T")[0],
        warrantyExpiry: item.warrantyExpiry,
      }));

      // Use asset_id = 11 (existing asset) as the asset group reference
      // In production this would be a proper asset group ID
      const assetId = 11;

      await pool.request()
        .input("lease_id", contract_id.toString())
        .input("lease_ref", contract_ref)
        .input("asset_id", assetId)
        .input("asset_code", `AST-${String(assetId).padStart(5, "0")}`)
        .input("set_name", set.setName)
        .input("status", "Active")
        .input("status_date", new Date().toISOString().split("T")[0])
        .input("tags_with_serials", JSON.stringify(tagsWithSerials))
        .input("ownership", "Lease")
        .input("created_by", "seed-script")
        .query(`
          INSERT INTO asset.lease_sub_assets
            (lease_id, lease_ref, asset_id, asset_code, set_name, status, status_date, tags_with_serials, ownership, created_by, created_at)
          VALUES
            (@lease_id, @lease_ref, @asset_id, @asset_code, @set_name, @status, @status_date, @tags_with_serials, @ownership, @created_by, GETUTCDATE())
        `);

      // Log a transaction for each seeded sub-asset
      await pool.request()
        .input("action", "Attached")
        .input("entity_type", "lease_sub_asset")
        .input("entity_id", contract_id.toString())
        .input("entity_code", contract_ref)
        .input("entity_name", set.setName)
        .input("changed_by", "seed-script")
        .query(`
          INSERT INTO asset.sub_asset_transactions
            (action, entity_type, entity_id, entity_code, entity_name, changed_by, changed_at)
          VALUES
            (@action, @entity_type, @entity_id, @entity_code, @entity_name, @changed_by, GETUTCDATE())
        `);

      seeded++;
    }
  }

  console.log(`Seeded ${seeded} sub-asset sets across ${contracts.recordset.length} leases (${skipped} already had data)`);

  // Verify
  const total = await pool.request().query("SELECT COUNT(*) as cnt FROM asset.lease_sub_assets");
  console.log(`Total lease_sub_assets rows: ${total.recordset[0].cnt}`);

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
