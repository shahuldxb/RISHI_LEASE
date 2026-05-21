import sql from 'mssql';

// Master items map (same as client/src/lib/masterItems.ts)
const MASTER_ITEMS = [
  { code: "FUR-SOF-001", name: "Sofa 3-Seater", category: "Furniture" },
  { code: "FUR-SOF-002", name: "Sofa 3-Seater", category: "Furniture" },
  { code: "FUR-SOF-003", name: "Sofa 2-Seater", category: "Furniture" },
  { code: "FUR-SOF-004", name: "Sofa 2-Seater", category: "Furniture" },
  { code: "FUR-SOF-005", name: "L-Shape Sectional Sofa", category: "Furniture" },
  { code: "FUR-SOF-006", name: "Sofa Armchair", category: "Furniture" },
  { code: "FUR-SOF-007", name: "Recliner Armchair", category: "Furniture" },
  { code: "FUR-SOF-008", name: "Ottoman / Footrest", category: "Furniture" },
  { code: "FUR-DIN-001", name: "Dining Table 4-Seater", category: "Furniture" },
  { code: "FUR-DIN-002", name: "Dining Table 6-Seater", category: "Furniture" },
  { code: "FUR-DIN-003", name: "Dining Table 8-Seater", category: "Furniture" },
  { code: "FUR-DIN-004", name: "Dining Chair", category: "Furniture" },
  { code: "FUR-DIN-005", name: "Dining Chair Padded", category: "Furniture" },
  { code: "FUR-DIN-006", name: "Bar Stool (set of 2)", category: "Furniture" },
  { code: "FUR-DIN-007", name: "Buffet / Sideboard", category: "Furniture" },
  { code: "FUR-BED-001", name: "Bed Frame King", category: "Furniture" },
  { code: "FUR-BED-002", name: "Bed Frame Queen", category: "Furniture" },
  { code: "FUR-BED-003", name: "Bed Frame Single", category: "Furniture" },
  { code: "FUR-BED-004", name: "Bed Frame King", category: "Furniture" },
  { code: "FUR-BED-005", name: "Bed Frame Queen", category: "Furniture" },
  { code: "FUR-BED-006", name: "Bunk Bed", category: "Furniture" },
  { code: "FUR-WAR-001", name: "Wardrobe 2-Door", category: "Storage & Wardrobes" },
  { code: "FUR-WAR-002", name: "Wardrobe 3-Door", category: "Storage & Wardrobes" },
  { code: "FUR-WAR-003", name: "Wardrobe 4-Door", category: "Storage & Wardrobes" },
  { code: "FUR-WAR-004", name: "Walk-in Wardrobe System", category: "Storage & Wardrobes" },
  { code: "FUR-WAR-005", name: "Chest of Drawers 4-Drawer", category: "Storage & Wardrobes" },
  { code: "FUR-WAR-006", name: "Chest of Drawers 6-Drawer", category: "Storage & Wardrobes" },
  { code: "FUR-WAR-007", name: "Bedside Table", category: "Storage & Wardrobes" },
  { code: "FUR-WAR-008", name: "TV Unit / Media Console", category: "Furniture" },
  { code: "FUR-WAR-009", name: "Bookshelf / Display Unit", category: "Storage & Wardrobes" },
  { code: "FUR-WAR-010", name: "Shoe Rack", category: "Storage & Wardrobes" },
  { code: "KIT-APP-001", name: "Refrigerator", category: "Kitchen Appliances" },
  { code: "KIT-APP-002", name: "Washing Machine", category: "Laundry" },
  { code: "KIT-APP-003", name: "Dryer", category: "Laundry" },
  { code: "KIT-APP-004", name: "Dishwasher", category: "Kitchen Appliances" },
  { code: "KIT-APP-005", name: "Microwave", category: "Kitchen Appliances" },
  { code: "KIT-APP-006", name: "Oven / Cooker", category: "Kitchen Appliances" },
  { code: "KIT-APP-007", name: "Cooker Hood / Extractor", category: "Kitchen Appliances" },
  { code: "KIT-APP-008", name: "Coffee Machine", category: "Kitchen Appliances" },
  { code: "KIT-APP-009", name: "Kettle", category: "Kitchen Appliances" },
  { code: "KIT-APP-010", name: "Toaster", category: "Kitchen Appliances" },
  { code: "ELC-TV-001", name: "TV 55\"", category: "Electronics" },
  { code: "ELC-TV-002", name: "TV 65\"", category: "Electronics" },
  { code: "ELC-TV-003", name: "TV 43\"", category: "Electronics" },
  { code: "ELC-TV-004", name: "TV 32\"", category: "Electronics" },
  { code: "ELC-TV-005", name: "Smart TV 55\"", category: "Electronics" },
  { code: "ELC-SND-001", name: "Soundbar", category: "Electronics" },
  { code: "ELC-SND-002", name: "Home Theatre System", category: "Electronics" },
  { code: "ELC-NET-001", name: "Wi-Fi Router", category: "Electronics" },
  { code: "CLG-AC-001", name: "Split AC 1.5 Ton", category: "Cooling & Heating" },
  { code: "CLG-AC-002", name: "Split AC 2 Ton", category: "Cooling & Heating" },
  { code: "CLG-FAN-001", name: "Ceiling Fan", category: "Cooling & Heating" },
  { code: "CLG-FAN-002", name: "Tower Fan", category: "Cooling & Heating" },
  { code: "LGT-001", name: "Floor Lamp", category: "Lighting & Fixtures" },
  { code: "LGT-002", name: "Table Lamp", category: "Lighting & Fixtures" },
  { code: "LGT-003", name: "Pendant Light", category: "Lighting & Fixtures" },
  { code: "LGT-004", name: "Chandelier", category: "Lighting & Fixtures" },
  { code: "OUT-001", name: "Outdoor Table & Chairs Set", category: "Outdoor & Garden" },
  { code: "OUT-002", name: "Sun Lounger", category: "Outdoor & Garden" },
  { code: "OUT-003", name: "BBQ Grill", category: "Outdoor & Garden" },
  { code: "OFF-001", name: "Study Desk", category: "Office & Study" },
  { code: "OFF-002", name: "Office Chair", category: "Office & Study" },
  { code: "OFF-003", name: "Bookshelf", category: "Office & Study" },
];

const MASTER_MAP = new Map(MASTER_ITEMS.map(i => [i.code, i]));

const cfg = {
  server: process.env.MSSQL_HOST,
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  port: Number(process.env.MSSQL_PORT),
  options: { encrypt: true, trustServerCertificate: true }
};

const pool = await sql.connect(cfg);
const r = await pool.request().query("SELECT asset_id, asset_code, tags FROM asset.assets WHERE asset_type = 'SUB_ASSET_GROUP'");

let updated = 0;
for (const row of r.recordset) {
  let tags = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch { continue; }
  
  let changed = false;
  const newTags = tags.map(t => {
    const master = MASTER_MAP.get(t.code);
    if (master && (!t.name || !t.category)) {
      changed = true;
      return { ...t, name: t.name || master.name, category: t.category || master.category };
    }
    return t;
  });
  
  if (changed) {
    await pool.request()
      .input('tags', sql.NVarChar(sql.MAX), JSON.stringify(newTags))
      .input('assetId', sql.Int, row.asset_id)
      .query("UPDATE asset.assets SET tags = @tags WHERE asset_id = @assetId");
    console.log(`Updated asset_id=${row.asset_id} (${row.asset_code})`);
    updated++;
  } else {
    console.log(`Skipped asset_id=${row.asset_id} (${row.asset_code}) - already has name/category`);
  }
}

console.log(`Done. Updated ${updated} records.`);
await sql.close();
