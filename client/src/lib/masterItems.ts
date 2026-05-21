// ─────────────────────────────────────────────────────────────────────────────
// MASTER ITEM LIBRARY — shared between AssetRegistry and SubAssetTransactionLog
// ─────────────────────────────────────────────────────────────────────────────
export type ItemCategory = "Furniture" | "Bedding & Linen" | "Kitchen Appliances" | "Laundry" | "Cooling & Heating" | "Electronics" | "Lighting & Fixtures" | "Outdoor & Garden" | "Storage & Wardrobes" | "Office & Study";

export interface MasterItem {
  code: string;
  name: string;
  brand?: string;
  spec?: string;
  category: ItemCategory;
  subCategory: string;
  priceQAR: number;
}

export const MASTER_ITEMS: MasterItem[] = [
  // ── FURNITURE → Sofas ──────────────────────────────────────────────────────
  { code: "FUR-SOF-001", name: "Sofa 3-Seater", brand: "IKEA", spec: "Fabric, Grey", category: "Furniture", subCategory: "Sofas", priceQAR: 2800 },
  { code: "FUR-SOF-002", name: "Sofa 3-Seater", brand: "Home Centre", spec: "Leather, Brown", category: "Furniture", subCategory: "Sofas", priceQAR: 3500 },
  { code: "FUR-SOF-003", name: "Sofa 2-Seater", brand: "IKEA", spec: "Fabric, Beige", category: "Furniture", subCategory: "Sofas", priceQAR: 1900 },
  { code: "FUR-SOF-004", name: "Sofa 2-Seater", brand: "Pan Emirates", spec: "Velvet, Navy", category: "Furniture", subCategory: "Sofas", priceQAR: 2200 },
  { code: "FUR-SOF-005", name: "L-Shape Sectional Sofa", brand: "Home Centre", spec: "Fabric, Charcoal", category: "Furniture", subCategory: "Sofas", priceQAR: 4800 },
  { code: "FUR-SOF-006", name: "Sofa Armchair", brand: "IKEA", spec: "Fabric, Light Grey", category: "Furniture", subCategory: "Sofas", priceQAR: 950 },
  { code: "FUR-SOF-007", name: "Recliner Armchair", brand: "Pan Emirates", spec: "Leather, Black", category: "Furniture", subCategory: "Sofas", priceQAR: 2100 },
  { code: "FUR-SOF-008", name: "Ottoman / Footrest", brand: "IKEA", spec: "Fabric, Beige", category: "Furniture", subCategory: "Sofas", priceQAR: 450 },
  // ── FURNITURE → Dining ─────────────────────────────────────────────────────
  { code: "FUR-DIN-001", name: "Dining Table 4-Seater", brand: "IKEA", spec: "Wood, White", category: "Furniture", subCategory: "Dining", priceQAR: 1200 },
  { code: "FUR-DIN-002", name: "Dining Table 6-Seater", brand: "Home Centre", spec: "Wood, Walnut", category: "Furniture", subCategory: "Dining", priceQAR: 2400 },
  { code: "FUR-DIN-003", name: "Dining Table 8-Seater", brand: "Pan Emirates", spec: "Glass Top, Chrome", category: "Furniture", subCategory: "Dining", priceQAR: 3800 },
  { code: "FUR-DIN-004", name: "Dining Chair", brand: "IKEA", spec: "Wood, White (set of 4)", category: "Furniture", subCategory: "Dining", priceQAR: 800 },
  { code: "FUR-DIN-005", name: "Dining Chair Padded", brand: "Home Centre", spec: "Fabric, Grey (set of 4)", category: "Furniture", subCategory: "Dining", priceQAR: 1100 },
  { code: "FUR-DIN-006", name: "Bar Stool (set of 2)", brand: "IKEA", spec: "Metal, Black", category: "Furniture", subCategory: "Dining", priceQAR: 550 },
  { code: "FUR-DIN-007", name: "Buffet / Sideboard", brand: "Pan Emirates", spec: "Wood, Walnut", category: "Furniture", subCategory: "Dining", priceQAR: 1800 },
  // ── FURNITURE → Beds ───────────────────────────────────────────────────────
  { code: "FUR-BED-001", name: "Bed Frame King", brand: "IKEA", spec: "Wood, White 180x200cm", category: "Furniture", subCategory: "Beds", priceQAR: 2200 },
  { code: "FUR-BED-002", name: "Bed Frame Queen", brand: "IKEA", spec: "Wood, White 160x200cm", category: "Furniture", subCategory: "Beds", priceQAR: 1800 },
  { code: "FUR-BED-003", name: "Bed Frame Single", brand: "IKEA", spec: "Wood, White 90x200cm", category: "Furniture", subCategory: "Beds", priceQAR: 950 },
  { code: "FUR-BED-004", name: "Bed Frame King", brand: "Home Centre", spec: "Upholstered, Grey 180x200cm", category: "Furniture", subCategory: "Beds", priceQAR: 3200 },
  { code: "FUR-BED-005", name: "Bed Frame Queen", brand: "Pan Emirates", spec: "Leather, Brown 160x200cm", category: "Furniture", subCategory: "Beds", priceQAR: 2600 },
  { code: "FUR-BED-006", name: "Bunk Bed", brand: "IKEA", spec: "Wood, White 90x200cm x2", category: "Furniture", subCategory: "Beds", priceQAR: 1600 },
  { code: "FUR-BED-007", name: "Mattress King", brand: "Sealy", spec: "Memory Foam 180x200cm", category: "Furniture", subCategory: "Beds", priceQAR: 3500 },
  { code: "FUR-BED-008", name: "Mattress Queen", brand: "Sealy", spec: "Memory Foam 160x200cm", category: "Furniture", subCategory: "Beds", priceQAR: 2800 },
  { code: "FUR-BED-009", name: "Mattress Single", brand: "Sealy", spec: "Foam 90x200cm", category: "Furniture", subCategory: "Beds", priceQAR: 1100 },
  { code: "FUR-BED-010", name: "Bedside Table", brand: "IKEA", spec: "Wood, White", category: "Furniture", subCategory: "Beds", priceQAR: 380 },
  // ── STORAGE & WARDROBES ─────────────────────────────────────────────────────
  { code: "FUR-WAR-001", name: "Wardrobe 2-Door", brand: "IKEA", spec: "Wood, White 100cm", category: "Storage & Wardrobes", subCategory: "Wardrobes", priceQAR: 1400 },
  { code: "FUR-WAR-002", name: "Wardrobe 3-Door", brand: "IKEA", spec: "Wood, White 150cm", category: "Storage & Wardrobes", subCategory: "Wardrobes", priceQAR: 1900 },
  { code: "FUR-WAR-003", name: "Wardrobe 4-Door Mirrored", brand: "Home Centre", spec: "White, Mirror Doors 200cm", category: "Storage & Wardrobes", subCategory: "Wardrobes", priceQAR: 2800 },
  { code: "FUR-WAR-004", name: "Walk-in Wardrobe System", brand: "IKEA PAX", spec: "White, Modular", category: "Storage & Wardrobes", subCategory: "Wardrobes", priceQAR: 4500 },
  { code: "FUR-WAR-005", name: "Chest of Drawers 4-Drawer", brand: "IKEA", spec: "Wood, White", category: "Storage & Wardrobes", subCategory: "Wardrobes", priceQAR: 850 },
  { code: "FUR-WAR-006", name: "Chest of Drawers 6-Drawer", brand: "Home Centre", spec: "Wood, Oak", category: "Storage & Wardrobes", subCategory: "Wardrobes", priceQAR: 1200 },
  { code: "FUR-WAR-007", name: "Cupboard / Cabinet", brand: "IKEA", spec: "Wood, White 80cm", category: "Storage & Wardrobes", subCategory: "Wardrobes", priceQAR: 750 },
  { code: "FUR-WAR-008", name: "Bookshelf 5-Tier", brand: "IKEA", spec: "Wood, White", category: "Storage & Wardrobes", subCategory: "Wardrobes", priceQAR: 480 },
  // ── FURNITURE → Living Room ─────────────────────────────────────────────────
  { code: "FUR-LIV-001", name: "Coffee Table", brand: "IKEA", spec: "Glass Top, Chrome", category: "Furniture", subCategory: "Living Room", priceQAR: 650 },
  { code: "FUR-LIV-002", name: "Coffee Table", brand: "Home Centre", spec: "Wood, Walnut", category: "Furniture", subCategory: "Living Room", priceQAR: 850 },
  { code: "FUR-LIV-003", name: "Side Table", brand: "IKEA", spec: "Metal, Gold", category: "Furniture", subCategory: "Living Room", priceQAR: 280 },
  { code: "FUR-LIV-004", name: "Console Table", brand: "Pan Emirates", spec: "Wood, White", category: "Furniture", subCategory: "Living Room", priceQAR: 750 },
  { code: "FUR-LIV-005", name: "Display Cabinet", brand: "Home Centre", spec: "Glass Door, White", category: "Furniture", subCategory: "Living Room", priceQAR: 1600 },
  { code: "FUR-LIV-006", name: "Floor Mirror", brand: "IKEA", spec: "Full Length 40x160cm", category: "Furniture", subCategory: "Living Room", priceQAR: 420 },
  { code: "FUR-LIV-007", name: "Wall Mirror", brand: "Home Centre", spec: "Round 80cm Dia", category: "Furniture", subCategory: "Living Room", priceQAR: 350 },
  { code: "FUR-LIV-008", name: "TV Unit / Media Console", brand: "IKEA", spec: "Wood, White 150cm", category: "Furniture", subCategory: "Living Room", priceQAR: 950 },
  { code: "FUR-LIV-009", name: "TV Unit / Media Console", brand: "Pan Emirates", spec: "Wood, Walnut 180cm", category: "Furniture", subCategory: "Living Room", priceQAR: 1400 },
  // ── BEDDING & LINEN ─────────────────────────────────────────────────────────
  { code: "BED-LIN-001", name: "Duvet Set King", brand: "Spaces", spec: "Cotton 300TC, White", category: "Bedding & Linen", subCategory: "Duvets & Covers", priceQAR: 380 },
  { code: "BED-LIN-002", name: "Duvet Set Queen", brand: "Spaces", spec: "Cotton 300TC, White", category: "Bedding & Linen", subCategory: "Duvets & Covers", priceQAR: 320 },
  { code: "BED-LIN-003", name: "Pillow (set of 2)", brand: "Sealy", spec: "Memory Foam", category: "Bedding & Linen", subCategory: "Pillows", priceQAR: 220 },
  { code: "BED-LIN-004", name: "Bed Sheet Set King", brand: "Spaces", spec: "Cotton 400TC, White", category: "Bedding & Linen", subCategory: "Sheets", priceQAR: 180 },
  { code: "BED-LIN-005", name: "Bed Sheet Set Queen", brand: "Spaces", spec: "Cotton 400TC, White", category: "Bedding & Linen", subCategory: "Sheets", priceQAR: 150 },
  { code: "BED-LIN-006", name: "Towel Set (6pc)", brand: "Trident", spec: "Cotton, White", category: "Bedding & Linen", subCategory: "Towels", priceQAR: 120 },
  { code: "BED-LIN-007", name: "Bath Mat", brand: "IKEA", spec: "Cotton, White", category: "Bedding & Linen", subCategory: "Towels", priceQAR: 45 },
  { code: "BED-LIN-008", name: "Curtains (pair)", brand: "Home Centre", spec: "Blackout, Grey 140x260cm", category: "Bedding & Linen", subCategory: "Curtains", priceQAR: 380 },
  { code: "BED-LIN-009", name: "Curtains (pair)", brand: "IKEA", spec: "Sheer, White 145x250cm", category: "Bedding & Linen", subCategory: "Curtains", priceQAR: 180 },
  { code: "BED-LIN-010", name: "Roller Blinds", brand: "Blinds Qatar", spec: "Blackout, 120cm", category: "Bedding & Linen", subCategory: "Curtains", priceQAR: 280 },
  // ── KITCHEN APPLIANCES ──────────────────────────────────────────────────────
  { code: "KIT-REF-001", name: "Refrigerator 2-Door", brand: "LG", spec: "450L, Silver, No-Frost", category: "Kitchen Appliances", subCategory: "Refrigerators", priceQAR: 2800 },
  { code: "KIT-REF-002", name: "Refrigerator 2-Door", brand: "Samsung", spec: "500L, Black, No-Frost", category: "Kitchen Appliances", subCategory: "Refrigerators", priceQAR: 3200 },
  { code: "KIT-REF-003", name: "Refrigerator French Door", brand: "LG", spec: "600L, Silver, InstaView", category: "Kitchen Appliances", subCategory: "Refrigerators", priceQAR: 5500 },
  { code: "KIT-REF-004", name: "Refrigerator French Door", brand: "Samsung", spec: "680L, Black, Family Hub", category: "Kitchen Appliances", subCategory: "Refrigerators", priceQAR: 7200 },
  { code: "KIT-REF-005", name: "Refrigerator Side-by-Side", brand: "Whirlpool", spec: "570L, Silver", category: "Kitchen Appliances", subCategory: "Refrigerators", priceQAR: 4200 },
  { code: "KIT-REF-006", name: "Mini Fridge", brand: "Hisense", spec: "90L, Silver", category: "Kitchen Appliances", subCategory: "Refrigerators", priceQAR: 650 },
  { code: "KIT-OVN-001", name: "Microwave Oven", brand: "LG", spec: "25L, Stainless Steel", category: "Kitchen Appliances", subCategory: "Ovens", priceQAR: 380 },
  { code: "KIT-OVN-002", name: "Microwave Oven", brand: "Samsung", spec: "28L, Black, Convection", category: "Kitchen Appliances", subCategory: "Ovens", priceQAR: 550 },
  { code: "KIT-OVN-003", name: "Built-in Oven", brand: "Bosch", spec: "60cm, 71L, Stainless", category: "Kitchen Appliances", subCategory: "Ovens", priceQAR: 2800 },
  { code: "KIT-OVN-004", name: "Freestanding Cooker", brand: "Beko", spec: "60cm, Gas Hob + Electric Oven", category: "Kitchen Appliances", subCategory: "Ovens", priceQAR: 1800 },
  { code: "KIT-OVN-005", name: "Air Fryer", brand: "Philips", spec: "5.6L, Digital", category: "Kitchen Appliances", subCategory: "Ovens", priceQAR: 480 },
  { code: "KIT-DIS-001", name: "Dishwasher", brand: "Bosch", spec: "60cm, 14 Place Settings, A++", category: "Kitchen Appliances", subCategory: "Dishwashers", priceQAR: 2400 },
  { code: "KIT-DIS-002", name: "Dishwasher", brand: "Samsung", spec: "60cm, 13 Place Settings", category: "Kitchen Appliances", subCategory: "Dishwashers", priceQAR: 1900 },
  { code: "KIT-SML-001", name: "Coffee Machine", brand: "Nespresso", spec: "Vertuo, Black", category: "Kitchen Appliances", subCategory: "Small Appliances", priceQAR: 650 },
  { code: "KIT-SML-002", name: "Kettle", brand: "Philips", spec: "1.7L, Stainless Steel", category: "Kitchen Appliances", subCategory: "Small Appliances", priceQAR: 120 },
  { code: "KIT-SML-003", name: "Toaster", brand: "Philips", spec: "4-Slice, Stainless Steel", category: "Kitchen Appliances", subCategory: "Small Appliances", priceQAR: 150 },
  { code: "KIT-SML-004", name: "Blender", brand: "Philips", spec: "2L, 1200W", category: "Kitchen Appliances", subCategory: "Small Appliances", priceQAR: 280 },
  { code: "KIT-SML-005", name: "Rice Cooker", brand: "Panasonic", spec: "1.8L, Fuzzy Logic", category: "Kitchen Appliances", subCategory: "Small Appliances", priceQAR: 220 },
  // ── LAUNDRY ─────────────────────────────────────────────────────────────────
  { code: "LAU-WAS-001", name: "Washing Machine Front-Load", brand: "LG", spec: "8kg, 1400rpm, A+++", category: "Laundry", subCategory: "Washing Machines", priceQAR: 2200 },
  { code: "LAU-WAS-002", name: "Washing Machine Front-Load", brand: "Samsung", spec: "9kg, 1400rpm, EcoBubble", category: "Laundry", subCategory: "Washing Machines", priceQAR: 2600 },
  { code: "LAU-WAS-003", name: "Washing Machine Front-Load", brand: "Bosch", spec: "8kg, 1200rpm, A+++", category: "Laundry", subCategory: "Washing Machines", priceQAR: 2800 },
  { code: "LAU-WAS-004", name: "Washing Machine Front-Load", brand: "Whirlpool", spec: "10kg, 1400rpm", category: "Laundry", subCategory: "Washing Machines", priceQAR: 2400 },
  { code: "LAU-WAS-005", name: "Washing Machine Front-Load", brand: "Beko", spec: "8kg, 1200rpm, A++", category: "Laundry", subCategory: "Washing Machines", priceQAR: 1800 },
  { code: "LAU-WAS-006", name: "Washing Machine Top-Load", brand: "Samsung", spec: "11kg, Digital Inverter", category: "Laundry", subCategory: "Washing Machines", priceQAR: 1600 },
  { code: "LAU-WAS-007", name: "Washing Machine Top-Load", brand: "LG", spec: "9kg, Smart Inverter", category: "Laundry", subCategory: "Washing Machines", priceQAR: 1400 },
  { code: "LAU-DRY-001", name: "Dryer", brand: "LG", spec: "8kg, Heat Pump, A+++", category: "Laundry", subCategory: "Dryers", priceQAR: 2800 },
  { code: "LAU-DRY-002", name: "Dryer", brand: "Samsung", spec: "9kg, Heat Pump", category: "Laundry", subCategory: "Dryers", priceQAR: 3200 },
  { code: "LAU-DRY-003", name: "Dryer", brand: "Bosch", spec: "8kg, Condenser, A++", category: "Laundry", subCategory: "Dryers", priceQAR: 2600 },
  { code: "LAU-CMB-001", name: "Washer-Dryer Combo", brand: "LG", spec: "8kg Wash / 5kg Dry", category: "Laundry", subCategory: "Combos", priceQAR: 3500 },
  { code: "LAU-CMB-002", name: "Washer-Dryer Combo", brand: "Samsung", spec: "9kg Wash / 6kg Dry", category: "Laundry", subCategory: "Combos", priceQAR: 3800 },
  { code: "LAU-IRN-001", name: "Steam Iron", brand: "Philips", spec: "2600W, 45g/min", category: "Laundry", subCategory: "Ironing", priceQAR: 180 },
  { code: "LAU-IRN-002", name: "Garment Steamer", brand: "Philips", spec: "1800W, 1.2L", category: "Laundry", subCategory: "Ironing", priceQAR: 280 },
  // ── COOLING & HEATING ───────────────────────────────────────────────────────
  { code: "COL-ACS-001", name: "Split AC 1.0 Ton", brand: "LG", spec: "1.0T, 12000 BTU, Inverter, A++", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 1400 },
  { code: "COL-ACS-002", name: "Split AC 1.5 Ton", brand: "LG", spec: "1.5T, 18000 BTU, Inverter, A++", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 1800 },
  { code: "COL-ACS-003", name: "Split AC 2.0 Ton", brand: "LG", spec: "2.0T, 24000 BTU, Inverter, A++", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 2400 },
  { code: "COL-ACS-004", name: "Split AC 2.5 Ton", brand: "LG", spec: "2.5T, 30000 BTU, Inverter", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 3200 },
  { code: "COL-ACS-005", name: "Split AC 1.5 Ton", brand: "Samsung", spec: "1.5T, 18000 BTU, WindFree", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 2200 },
  { code: "COL-ACS-006", name: "Split AC 2.0 Ton", brand: "Samsung", spec: "2.0T, 24000 BTU, WindFree", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 2800 },
  { code: "COL-ACS-007", name: "Split AC 1.5 Ton", brand: "Daikin", spec: "1.5T, 18000 BTU, Inverter, R32", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 2400 },
  { code: "COL-ACS-008", name: "Split AC 2.0 Ton", brand: "Daikin", spec: "2.0T, 24000 BTU, Inverter, R32", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 3000 },
  { code: "COL-ACS-009", name: "Split AC 1.5 Ton", brand: "Carrier", spec: "1.5T, 18000 BTU, Inverter", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 2000 },
  { code: "COL-ACS-010", name: "Split AC 2.0 Ton", brand: "Carrier", spec: "2.0T, 24000 BTU, Inverter", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 2600 },
  { code: "COL-ACS-011", name: "Split AC 1.5 Ton", brand: "Midea", spec: "1.5T, 18000 BTU, Inverter", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 1600 },
  { code: "COL-ACS-012", name: "Split AC 2.0 Ton", brand: "Midea", spec: "2.0T, 24000 BTU, Inverter", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 2100 },
  { code: "COL-ACS-013", name: "Cassette AC 2.0 Ton", brand: "Daikin", spec: "2.0T, 4-Way Cassette, Inverter", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 4500 },
  { code: "COL-ACS-014", name: "Cassette AC 3.0 Ton", brand: "LG", spec: "3.0T, 4-Way Cassette, Inverter", category: "Cooling & Heating", subCategory: "Air Conditioners", priceQAR: 5800 },
  { code: "COL-FAN-001", name: "Ceiling Fan", brand: "Panasonic", spec: "56 inch, 5-Blade, Remote", category: "Cooling & Heating", subCategory: "Fans", priceQAR: 380 },
  { code: "COL-FAN-002", name: "Tower Fan", brand: "Dyson", spec: "AM07, Bladeless", category: "Cooling & Heating", subCategory: "Fans", priceQAR: 1800 },
  { code: "COL-FAN-003", name: "Stand Fan", brand: "Panasonic", spec: "16 inch, 5-Speed", category: "Cooling & Heating", subCategory: "Fans", priceQAR: 180 },
  { code: "COL-HTR-001", name: "Water Heater", brand: "Ariston", spec: "50L, Electric", category: "Cooling & Heating", subCategory: "Water Heaters", priceQAR: 650 },
  { code: "COL-HTR-002", name: "Water Heater", brand: "Ariston", spec: "80L, Electric", category: "Cooling & Heating", subCategory: "Water Heaters", priceQAR: 850 },
  { code: "COL-HTR-003", name: "Instant Water Heater", brand: "Rheem", spec: "Tankless, 11kW", category: "Cooling & Heating", subCategory: "Water Heaters", priceQAR: 1200 },
  // ── ELECTRONICS ─────────────────────────────────────────────────────────────
  { code: "ELE-TV-001", name: "Smart TV 43\"", brand: "Samsung", spec: "43\" QLED 4K, Tizen OS", category: "Electronics", subCategory: "Televisions", priceQAR: 1800 },
  { code: "ELE-TV-002", name: "Smart TV 55\"", brand: "Samsung", spec: "55\" QLED 4K, Tizen OS", category: "Electronics", subCategory: "Televisions", priceQAR: 2800 },
  { code: "ELE-TV-003", name: "Smart TV 65\"", brand: "Samsung", spec: "65\" QLED 4K, Tizen OS", category: "Electronics", subCategory: "Televisions", priceQAR: 4200 },
  { code: "ELE-TV-004", name: "Smart TV 75\"", brand: "Samsung", spec: "75\" QLED 4K, Tizen OS", category: "Electronics", subCategory: "Televisions", priceQAR: 6500 },
  { code: "ELE-TV-005", name: "Smart TV 55\"", brand: "LG", spec: "55\" OLED 4K, webOS", category: "Electronics", subCategory: "Televisions", priceQAR: 3800 },
  { code: "ELE-TV-006", name: "Smart TV 65\"", brand: "LG", spec: "65\" OLED 4K, webOS", category: "Electronics", subCategory: "Televisions", priceQAR: 5500 },
  { code: "ELE-TV-007", name: "Smart TV 75\"", brand: "LG", spec: "75\" OLED 4K, webOS", category: "Electronics", subCategory: "Televisions", priceQAR: 8200 },
  { code: "ELE-TV-008", name: "Smart TV 55\"", brand: "Sony", spec: "55\" Bravia XR OLED, Google TV", category: "Electronics", subCategory: "Televisions", priceQAR: 4500 },
  { code: "ELE-TV-009", name: "Smart TV 65\"", brand: "Sony", spec: "65\" Bravia XR OLED, Google TV", category: "Electronics", subCategory: "Televisions", priceQAR: 6800 },
  { code: "ELE-TV-010", name: "Smart TV 43\"", brand: "TCL", spec: "43\" 4K HDR, Google TV", category: "Electronics", subCategory: "Televisions", priceQAR: 1200 },
  { code: "ELE-SND-001", name: "Soundbar 2.1", brand: "Samsung", spec: "300W, Dolby Atmos", category: "Electronics", subCategory: "Audio", priceQAR: 1200 },
  { code: "ELE-SND-002", name: "Soundbar 5.1", brand: "Samsung", spec: "500W, Dolby Atmos, Wireless Sub", category: "Electronics", subCategory: "Audio", priceQAR: 2200 },
  { code: "ELE-SND-003", name: "Soundbar 2.1", brand: "LG", spec: "300W, Meridian Audio", category: "Electronics", subCategory: "Audio", priceQAR: 1400 },
  { code: "ELE-SND-004", name: "Bluetooth Speaker", brand: "JBL", spec: "Charge 5, Waterproof", category: "Electronics", subCategory: "Audio", priceQAR: 450 },
  { code: "ELE-NET-001", name: "Wi-Fi Router", brand: "TP-Link", spec: "AX3000, Wi-Fi 6, Dual Band", category: "Electronics", subCategory: "Networking", priceQAR: 380 },
  { code: "ELE-NET-002", name: "Wi-Fi Mesh System", brand: "TP-Link Deco", spec: "AX5400, 3-Pack", category: "Electronics", subCategory: "Networking", priceQAR: 1200 },
  { code: "ELE-NET-003", name: "Smart Home Hub", brand: "Amazon", spec: "Echo Show 10, 10.1\" Display", category: "Electronics", subCategory: "Networking", priceQAR: 650 },
  // ── LIGHTING & FIXTURES ─────────────────────────────────────────────────────
  { code: "LIG-FLR-001", name: "Floor Lamp", brand: "IKEA", spec: "Arc, White, E27", category: "Lighting & Fixtures", subCategory: "Lamps", priceQAR: 280 },
  { code: "LIG-FLR-002", name: "Table Lamp", brand: "Home Centre", spec: "Ceramic Base, Linen Shade", category: "Lighting & Fixtures", subCategory: "Lamps", priceQAR: 180 },
  { code: "LIG-CEI-001", name: "Ceiling Light", brand: "Philips", spec: "LED Panel, 24W, 60x60cm", category: "Lighting & Fixtures", subCategory: "Ceiling Lights", priceQAR: 220 },
  { code: "LIG-CEI-002", name: "Chandelier", brand: "Home Centre", spec: "Crystal, 6-Arm, E14", category: "Lighting & Fixtures", subCategory: "Ceiling Lights", priceQAR: 850 },
  { code: "LIG-OUT-001", name: "Outdoor Wall Light", brand: "Philips", spec: "LED, IP44, Anthracite", category: "Lighting & Fixtures", subCategory: "Outdoor Lights", priceQAR: 180 },
  // ── OFFICE & STUDY ──────────────────────────────────────────────────────────
  { code: "OFF-DSK-001", name: "Office Desk", brand: "IKEA", spec: "140x60cm, White", category: "Office & Study", subCategory: "Desks", priceQAR: 650 },
  { code: "OFF-DSK-002", name: "L-Shape Desk", brand: "IKEA", spec: "160x110cm, White", category: "Office & Study", subCategory: "Desks", priceQAR: 950 },
  { code: "OFF-CHR-001", name: "Office Chair", brand: "IKEA", spec: "Ergonomic, Mesh Back", category: "Office & Study", subCategory: "Chairs", priceQAR: 850 },
  { code: "OFF-CHR-002", name: "Office Chair", brand: "Herman Miller", spec: "Aeron, Size B", category: "Office & Study", subCategory: "Chairs", priceQAR: 4800 },
  { code: "OFF-SHF-001", name: "Filing Cabinet 3-Drawer", brand: "IKEA", spec: "Metal, Grey", category: "Office & Study", subCategory: "Storage", priceQAR: 680 },
  { code: "OFF-SHF-002", name: "Printer Stand", brand: "IKEA", spec: "Wood, White", category: "Office & Study", subCategory: "Storage", priceQAR: 280 },
  // ── OUTDOOR & GARDEN ────────────────────────────────────────────────────────
  { code: "OUT-SET-001", name: "Outdoor Dining Set 4-Seater", brand: "Home Centre", spec: "Rattan, Grey", category: "Outdoor & Garden", subCategory: "Outdoor Furniture", priceQAR: 2800 },
  { code: "OUT-SET-002", name: "Outdoor Lounge Set", brand: "IKEA", spec: "Rattan, Beige, 3pc", category: "Outdoor & Garden", subCategory: "Outdoor Furniture", priceQAR: 3200 },
  { code: "OUT-SET-003", name: "Sun Lounger", brand: "Home Centre", spec: "Aluminium, Beige", category: "Outdoor & Garden", subCategory: "Outdoor Furniture", priceQAR: 850 },
  { code: "OUT-BBQ-001", name: "BBQ Grill", brand: "Weber", spec: "Gas, 3-Burner, Stainless", category: "Outdoor & Garden", subCategory: "BBQ & Grills", priceQAR: 2200 },
];


/** Look up a master item by its item code. Returns undefined if not found. */
export function lookupItem(code: string): MasterItem | undefined {
  return MASTER_ITEMS.find(i => i.code === code);
}

/** Build a lookup map for O(1) access */
export const MASTER_ITEMS_MAP: Map<string, MasterItem> = new Map(
  MASTER_ITEMS.map(i => [i.code, i])
);
