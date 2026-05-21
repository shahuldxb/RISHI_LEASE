import { useState, useMemo, useEffect } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Plus, Minus, Trash2, CheckCircle2, Package, Search, Edit2, Tag, Loader2, Pencil, X, ScrollText
} from "lucide-react";
import { useLocation } from "wouter";

// ─────────────────────────────────────────────────────────────────────────────
// MASTER ITEM LIBRARY — 300+ items with QAR prices
// ─────────────────────────────────────────────────────────────────────────────
type Category = "Furniture" | "Bedding & Linen" | "Kitchen Appliances" | "Laundry" | "Cooling & Heating" | "Electronics" | "Lighting & Fixtures" | "Outdoor & Garden" | "Storage & Wardrobes" | "Office & Study";
type SubCategory = string;

interface MasterItem {
  code: string;
  name: string;
  brand?: string;
  spec?: string;
  category: Category;
  subCategory: SubCategory;
  priceQAR: number;
}

const MASTER_ITEMS: MasterItem[] = [
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

const SUB_CATEGORY_MAP: Record<Category, string[]> = {
  "Furniture": ["Sofas", "Living Room", "Dining", "Beds", "Desks", "Chairs", "Storage"],
  "Storage & Wardrobes": ["Wardrobes", "Storage"],
  "Bedding & Linen": ["Duvets & Covers", "Sheets", "Pillows", "Towels"],
  "Kitchen Appliances": ["Refrigerators", "Ovens", "Dishwashers", "Small Appliances"],
  "Laundry": ["Washing Machines", "Dryers", "Combos", "Ironing"],
  "Cooling & Heating": ["Air Conditioners", "Fans", "Water Heaters"],
  "Electronics": ["Televisions", "Audio", "Networking"],
  "Lighting & Fixtures": ["Ceiling Lights", "Lamps", "Curtains", "Outdoor Lights"],
  "Office & Study": ["Desks", "Chairs", "Storage"],
  "Outdoor & Garden": ["Outdoor Furniture", "BBQ & Grills"],
};
const CATEGORIES: Category[] = [
  "Furniture", "Storage & Wardrobes", "Bedding & Linen",
  "Kitchen Appliances", "Laundry", "Cooling & Heating",
  "Electronics", "Lighting & Fixtures", "Office & Study", "Outdoor & Garden",
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface SetLine {
  item: MasterItem;
  qty: number;
  serialNumbers: string[];
  leaseDate: string;
  warrantyExpiry: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AssetRegistry() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  // ── DB queries / mutations ───────────────────────────────────────────────
  const { data: savedSetsRaw = [], isLoading: loadingSets } = trpc.asset.getSubAssetGroups.useQuery();
  const upsertMutation = trpc.asset.upsertSubAssetGroup.useMutation({
    onSuccess: () => { utils.asset.getSubAssetGroups.invalidate(); },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });
  const deleteMutation = trpc.asset.deleteSubAssetGroup.useMutation({
    onSuccess: () => { utils.asset.getSubAssetGroups.invalidate(); },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });
  const logTxnMutation = trpc.asset.logSubAssetTxn.useMutation();

  // Parse saved sets from DB rows
  const savedSets = useMemo(() => savedSetsRaw.map(r => {
    let lines: SetLine[] = [];
    try {
      const parsed = JSON.parse(r.tags || "[]") as Array<{
        code: string; qty: number; serialNumbers: string[]; leaseDate: string; warrantyExpiry: string;
      }>;
      lines = parsed.flatMap(p => {
        const item = MASTER_ITEMS.find(m => m.code === p.code);
        if (!item) return [];
        return [{ item, qty: p.qty, serialNumbers: p.serialNumbers ?? [], leaseDate: p.leaseDate ?? "", warrantyExpiry: p.warrantyExpiry ?? "" }];
      });
    } catch { /* ignore */ }
    return { assetId: r.assetId, assetCode: r.assetCode, name: r.setName, description: r.description, lines };
  }), [savedSetsRaw]);

  // ── Custom items (persisted in localStorage) ───────────────────────────
  const [deletedMasterCodes, setDeletedMasterCodes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("vfl_deleted_master") || "[]"); } catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem("vfl_deleted_master", JSON.stringify(deletedMasterCodes));
  }, [deletedMasterCodes]);
  const [customItems, setCustomItems] = useState<MasterItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("vfl_custom_items") || "[]"); } catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem("vfl_custom_items", JSON.stringify(customItems));
  }, [customItems]);
  // ── Item Library form state ───────────────────────────────────────────────
  type LibFormMode = "idle" | "add" | "edit";
  const [libFormMode, setLibFormMode] = useState<LibFormMode>("idle");
  const [libEditCode, setLibEditCode] = useState<string | null>(null);
  const EMPTY_LIB_FORM = { name: "", category: "Furniture" as Category, subCategory: "", brand: "", spec: "", priceQAR: "" };
  const [libForm, setLibForm] = useState(EMPTY_LIB_FORM);
  // ── Library filters ──────────────────────────────────────────────────────
  const [libCategory, setLibCategory] = useState<string>("all");
  const [libSubCat, setLibSubCat] = useState<string>("all");
  const [libSearch, setLibSearch] = useState("");

  // ── Selected set ─────────────────────────────────────────────────────────
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);

  // ── Builder state ────────────────────────────────────────────────────────
  type BuilderMode = "idle" | "new" | "edit";
  const [builderMode, setBuilderMode] = useState<BuilderMode>("idle");
  const [draftLines, setDraftLines] = useState<SetLine[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const subCategories = useMemo(() => {
    if (libCategory === "all") return [];
    return Array.from(new Set(MASTER_ITEMS.filter(i => i.category === libCategory).map(i => i.subCategory)));
  }, [libCategory]);

  const allItems = useMemo(() => [
    ...MASTER_ITEMS.filter(m => !deletedMasterCodes.includes(m.code)),
    ...customItems,
  ], [customItems, deletedMasterCodes]);
  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      if (libCategory !== "all" && item.category !== libCategory) return false;
      if (libSubCat !== "all" && item.subCategory !== libSubCat) return false;
      if (libSearch) {
        const q = libSearch.toLowerCase();
        return item.name.toLowerCase().includes(q) || (item.brand ?? "").toLowerCase().includes(q) || (item.spec ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [allItems, libCategory, libSubCat, libSearch]);
  // ── Item Library CRUD handlers ────────────────────────────────────────────
  function openAddLibItem() {
    setLibForm(EMPTY_LIB_FORM);
    setLibEditCode(null);
    setLibFormMode("add");
  }
  function openEditLibItem(item: MasterItem) {
    setLibForm({ name: item.name, category: item.category, subCategory: item.subCategory, brand: item.brand ?? "", spec: item.spec ?? "", priceQAR: String(item.priceQAR) });
    setLibEditCode(item.code);
    setLibFormMode("edit");
  }  function deleteLibItem(code: string) {
    const isCustom = customItems.some(i => i.code === code);
    const itemToDelete = allItems.find(i => i.code === code);
    if (isCustom) {
      setCustomItems(prev => prev.filter(i => i.code !== code));
    } else {
      setDeletedMasterCodes(prev => [...prev, code]);
    }
    // Log the item deletion
    logTxnMutation.mutate({
      action:     "ITEM_DELETE",
      entityType: "LIBRARY_ITEM",
      entityCode: code,
      entityName: itemToDelete?.name ?? code,
      beforeJson: itemToDelete ? JSON.stringify(itemToDelete) : undefined,
      afterJson:  undefined,
      screenId:   "VFLSASSET001",
    });
    toast.success("Item removed from library");
  }
  function saveLibItem() {
    if (!libForm.name.trim()) { toast.error("Item name is required"); return; }
    if (!libForm.subCategory.trim()) { toast.error("Sub-category is required"); return; }
    const price = parseFloat(libForm.priceQAR);
    if (isNaN(price) || price <= 0) { toast.error("Enter a valid price"); return; }
    if (libFormMode === "edit" && libEditCode) {
      const beforeItem = allItems.find(i => i.code === libEditCode);
      const updatedItem = { ...beforeItem, name: libForm.name.trim(), category: libForm.category, subCategory: libForm.subCategory.trim(), brand: libForm.brand.trim() || undefined, spec: libForm.spec.trim() || undefined, priceQAR: price };
      setCustomItems(prev => prev.map(i => i.code === libEditCode
        ? { ...i, name: libForm.name.trim(), category: libForm.category, subCategory: libForm.subCategory.trim(), brand: libForm.brand.trim() || undefined, spec: libForm.spec.trim() || undefined, priceQAR: price }
        : i
      ));
      logTxnMutation.mutate({
        action: "ITEM_EDIT", entityType: "LIBRARY_ITEM",
        entityCode: libEditCode, entityName: libForm.name.trim(),
        beforeJson: beforeItem ? JSON.stringify(beforeItem) : undefined,
        afterJson: JSON.stringify(updatedItem), screenId: "VFLSASSET001",
      });
      toast.success("Item updated");
    } else {
      const code = `CUST-${Date.now()}`;
      const newItem = { code, name: libForm.name.trim(), category: libForm.category, subCategory: libForm.subCategory.trim(), brand: libForm.brand.trim() || undefined, spec: libForm.spec.trim() || undefined, priceQAR: price };
      setCustomItems(prev => [...prev, newItem]);
      logTxnMutation.mutate({
        action: "ITEM_ADD", entityType: "LIBRARY_ITEM",
        entityCode: code, entityName: libForm.name.trim(),
        beforeJson: undefined, afterJson: JSON.stringify(newItem), screenId: "VFLSASSET001",
      });
      toast.success("Item added to library");
    }
    setLibFormMode("idle");
    setLibEditCode(null);
  }

  const selectedSet = savedSets.find(s => s.assetId === selectedAssetId) ?? null;
  const totalItems = draftLines.reduce((s, l) => s + l.qty, 0);
  const totalValue = draftLines.reduce((s, l) => s + l.qty * l.item.priceQAR, 0);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function addToDraft(item: MasterItem) {
    if (builderMode === "idle") {
      toast.info("Click 'New Set' to start building a set first.");
      return;
    }
    setDraftLines(prev => {
      const existing = prev.find(l => l.item.code === item.code);
      if (existing) {
        return prev.map(l =>
          l.item.code === item.code
            ? { ...l, qty: l.qty + 1, serialNumbers: [...l.serialNumbers, ""] }
            : l
        );
      }
      return [...prev, { item, qty: 1, serialNumbers: [""], leaseDate: "", warrantyExpiry: "" }];
    });
  }

  function removeFromDraft(code: string) {
    setDraftLines(prev => prev.filter(l => l.item.code !== code));
  }

  function changeQty(code: string, delta: number) {
    setDraftLines(prev => prev.map(l => {
      if (l.item.code !== code) return l;
      const newQty = Math.max(1, l.qty + delta);
      const sns = [...l.serialNumbers];
      while (sns.length < newQty) sns.push("");
      while (sns.length > newQty) sns.pop();
      return { ...l, qty: newQty, serialNumbers: sns };
    }));
  }

  function updateSerial(code: string, idx: number, val: string) {
    setDraftLines(prev => prev.map(l => {
      if (l.item.code !== code) return l;
      const sns = [...l.serialNumbers];
      sns[idx] = val;
      return { ...l, serialNumbers: sns };
    }));
  }

  function updateDate(code: string, field: "leaseDate" | "warrantyExpiry", val: string) {
    setDraftLines(prev => prev.map(l =>
      l.item.code === code ? { ...l, [field]: val } : l
    ));
  }

  function startNew() {
    setBuilderMode("new");
    setDraftLines([]);
    setDraftName("");
    setDraftDesc("");
    setEditingAssetId(null);
  }

  function startEdit(set: typeof savedSets[number]) {
    setBuilderMode("edit");
    setDraftLines(set.lines.map(l => ({ ...l })));
    setDraftName(set.name);
    setDraftDesc(set.description);
    setEditingAssetId(set.assetId);
  }

  function cancelDraft() {
    setBuilderMode("idle");
    setDraftLines([]);
    setDraftName("");
    setDraftDesc("");
    setEditingAssetId(null);
  }

  async function saveSet() {
    if (!draftName.trim()) { toast.error("Set name is required"); return; }
    if (draftLines.length === 0) { toast.error("Add at least one item"); return; }
    const tagsJson = JSON.stringify(draftLines.map(l => ({
      code: l.item.code, name: l.item.name, category: l.item.category, qty: l.qty, serialNumbers: l.serialNumbers, leaseDate: l.leaseDate, warrantyExpiry: l.warrantyExpiry,
    })));
    // Capture before-state for UPDATE
    const beforeSet = editingAssetId ? savedSets.find(s => s.assetId === editingAssetId) : null;
    const beforeJson = beforeSet ? JSON.stringify({ name: beforeSet.name, description: beforeSet.description, lines: beforeSet.lines.map(l => ({ code: l.item.code, qty: l.qty, serialNumbers: l.serialNumbers })) }) : null;
    try {
      const result = await upsertMutation.mutateAsync({
        assetId: editingAssetId ?? undefined,
        setName: draftName.trim(),
        description: draftDesc.trim(),
        tags: tagsJson,
      });
      const action = builderMode === "new" ? "INSERT" : "UPDATE";
      const afterJson = JSON.stringify({ name: draftName.trim(), description: draftDesc.trim(), assetCode: result?.asset_code, lines: draftLines.map(l => ({ code: l.item.code, name: l.item.name, qty: l.qty, serialNumbers: l.serialNumbers, leaseDate: l.leaseDate, warrantyExpiry: l.warrantyExpiry })) });
      logTxnMutation.mutate({
        action,
        entityType: "SET",
        entityId:   result?.asset_id ?? editingAssetId ?? undefined,
        entityCode: result?.asset_code ?? undefined,
        entityName: draftName.trim(),
        beforeJson: beforeJson ?? undefined,
        afterJson,
        screenId:   "VFLSASSET001",
      });
      toast.success(builderMode === "new" ? `Set "${draftName}" saved as ${result?.asset_code ?? ""}` : "Set updated successfully");
      cancelDraft();
    } catch { /* handled by onError */ }
  }

  async function deleteSet(assetId: number) {
    // Capture before-state for DELETE log
    const setToDelete = savedSets.find(s => s.assetId === assetId);
    const beforeJson = setToDelete ? JSON.stringify({ name: setToDelete.name, description: setToDelete.description, assetCode: setToDelete.assetCode, lines: setToDelete.lines.map(l => ({ code: l.item.code, name: l.item.name, qty: l.qty })) }) : undefined;
    try {
      await deleteMutation.mutateAsync({ assetId });
      logTxnMutation.mutate({
        action:     "DELETE",
        entityType: "SET",
        entityId:   assetId,
        entityCode: setToDelete?.assetCode ?? undefined,
        entityName: setToDelete?.name ?? undefined,
        beforeJson,
        afterJson:  undefined,
        screenId:   "VFLSASSET001",
      });
      if (selectedAssetId === assetId) setSelectedAssetId(null);
      toast.success("Set deleted");
    } catch { /* handled by onError */ }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="flex flex-col h-full gap-4 p-4 overflow-auto">
        <ScreenHeader screenId="VFLSASSET001" screenType="asset_registry" title="Sub-Asset Registry" formType="asset_registry" onAIFormFill={() => {}} />

        {/* ── TOP: Saved Sets Panel ─────────────────────────────────────── */}
        <Card className="bg-[#13161f] border-white/10 shrink-0">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Package className="h-4 w-4 text-red-400" />
                Sub-Asset Groups
                {loadingSets && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-border"
                  onClick={() => setLocation("/sub-asset-registry/transactions")}>
                  <ScrollText className="h-3.5 w-3.5" /> Transaction Log
                </Button>
                <Button size="sm" className="h-8 bg-red-600 hover:bg-red-700 text-white gap-1.5"
                  onClick={startNew} disabled={builderMode !== "idle"}>
                  <Plus className="h-3.5 w-3.5" /> New Set
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {savedSets.length === 0 && !loadingSets ? (
              <p className="text-xs text-muted-foreground py-2">No sets created yet. Click "New Set" to build your first asset set.</p>
            ) : (
              <div className="space-y-3">
                {/* Dropdown selector */}
                <div className="flex items-center gap-3">
                  <Select
                    value={selectedAssetId !== null ? String(selectedAssetId) : "none"}
                    onValueChange={v => setSelectedAssetId(v === "none" ? null : Number(v))}
                  >
                    <SelectTrigger className="bg-[#1a1d2e] border-white/10 text-gray-200 h-9 w-80">
                      <SelectValue placeholder="Select a saved set…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Select a set —</SelectItem>
                      {savedSets.map(s => (
                        <SelectItem key={s.assetId} value={String(s.assetId)}>
                          <span className="font-mono text-xs text-amber-400 mr-2">{s.assetCode}</span>
                          {s.name}
                          <span className="ml-2 text-muted-foreground text-xs">({s.lines.reduce((a, l) => a + l.qty, 0)} items)</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedSet && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 border-white/10 text-gray-300 gap-1"
                        onClick={() => startEdit(selectedSet)} disabled={builderMode !== "idle"}>
                        <Edit2 className="h-3 w-3" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 border-red-500/30 text-red-400 gap-1 hover:bg-red-500/10"
                        onClick={() => deleteSet(selectedSet.assetId)}
                        disabled={deleteMutation.isPending}>
                        {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
                {/* Selected set preview */}
                {selectedSet && (
                  <div className="bg-[#1a1d2e] rounded-lg p-3 border border-white/5 overflow-auto">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className="bg-amber-500/20 text-amber-400 font-mono text-xs">{selectedSet.assetCode}</Badge>
                      <span className="text-sm font-semibold text-white">{selectedSet.name}</span>
                      {selectedSet.description && <span className="text-xs text-muted-foreground">{selectedSet.description}</span>}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {selectedSet.lines.reduce((a, l) => a + l.qty, 0)} units · QAR {selectedSet.lines.reduce((a, l) => a + l.qty * l.item.priceQAR, 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 w-full">
                      {selectedSet.lines.map(l => (
                        <div key={l.item.code} className="flex flex-col gap-0.5 bg-[#13161f] rounded-lg px-3 py-2 border border-white/5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-medium text-gray-200 truncate">{l.item.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1 h-4 border-white/10 text-gray-400 shrink-0">×{l.qty}</Badge>
                          </div>
                          {l.item.brand && <span className="text-[10px] text-blue-400">{l.item.brand}</span>}
                          {l.item.spec && <span className="text-[10px] text-muted-foreground truncate">{l.item.spec}</span>}
                          <span className="text-[10px] font-semibold text-amber-400 mt-0.5">QAR {(l.qty * l.item.priceQAR).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── BOTTOM: Item Library + Set Builder ───────────────────────── */}
        <div className="flex gap-4 flex-1 min-h-0">

          {/* Left: Item Library */}
          <Card className="bg-[#13161f] border-white/10 flex flex-col flex-1 min-w-0">
            <CardHeader className="pb-2 pt-4 px-4 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Tag className="h-4 w-4 text-blue-400" />
                  Item Library
                  <Badge variant="outline" className="border-white/10 text-gray-400 text-xs">{filteredItems.length} items</Badge>
                </CardTitle>
                <Button size="sm" variant="outline" className="h-7 border-white/20 text-gray-300 hover:bg-white/10 gap-1 text-xs"
                  onClick={openAddLibItem} disabled={libFormMode !== "idle"}>
                  <Plus className="h-3 w-3" /> Add Item
                </Button>
              </div>
              {/* Filters */}
              <div className="flex gap-2 mt-2 flex-wrap">
                <Select value={libCategory} onValueChange={v => { setLibCategory(v); setLibSubCat("all"); }}>
                  <SelectTrigger className="bg-[#1a1d2e] border-white/10 text-gray-200 h-8 w-48 text-xs">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                {subCategories.length > 0 && (
                  <Select value={libSubCat} onValueChange={setLibSubCat}>
                    <SelectTrigger className="bg-[#1a1d2e] border-white/10 text-gray-200 h-8 w-44 text-xs">
                      <SelectValue placeholder="All Sub-Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sub-Categories</SelectItem>
                      {subCategories.map(sc => <SelectItem key={sc} value={sc}>{sc}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 h-8 pl-7 text-xs"
                    placeholder="Search items…" value={libSearch} onChange={e => setLibSearch(e.target.value)} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto px-4 pb-4">
              {/* Inline Add/Edit Item Form */}
              {libFormMode !== "idle" && (
                <div className="mb-3 p-3 rounded-lg bg-[#1a1d2e] border border-blue-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-blue-300">{libFormMode === "add" ? "Add New Item" : "Edit Item"}</span>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-white"
                      onClick={() => { setLibFormMode("idle"); setLibEditCode(null); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Item Name *</Label>
                      <Input className="bg-[#0e1120] border-white/10 text-gray-200 h-7 text-xs mt-0.5"
                        value={libForm.name} onChange={e => setLibForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sofa 3-Seater" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Category *</Label>
                      <Select value={libForm.category} onValueChange={v => setLibForm(f => ({ ...f, category: v as Category, subCategory: "" }))}>
                        <SelectTrigger className="bg-[#0e1120] border-white/10 text-gray-200 h-7 text-xs mt-0.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Sub-Category *</Label>
                      <Select value={libForm.subCategory} onValueChange={v => setLibForm(f => ({ ...f, subCategory: v }))}>
                        <SelectTrigger className="bg-[#0e1120] border-white/10 text-gray-200 h-7 text-xs mt-0.5">
                          <SelectValue placeholder="Select sub-category" />
                        </SelectTrigger>
                        <SelectContent>
                          {(SUB_CATEGORY_MAP[libForm.category] ?? []).map(sc => (
                            <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Brand</Label>
                      <Input className="bg-[#0e1120] border-white/10 text-gray-200 h-7 text-xs mt-0.5"
                        value={libForm.brand} onChange={e => setLibForm(f => ({ ...f, brand: e.target.value }))} placeholder="e.g. IKEA" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Spec / Model</Label>
                      <Input className="bg-[#0e1120] border-white/10 text-gray-200 h-7 text-xs mt-0.5"
                        value={libForm.spec} onChange={e => setLibForm(f => ({ ...f, spec: e.target.value }))} placeholder="e.g. Fabric, Grey" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Price (QAR) *</Label>
                      <Input className="bg-[#0e1120] border-white/10 text-gray-200 h-7 text-xs mt-0.5" type="number" min="0"
                        value={libForm.priceQAR} onChange={e => setLibForm(f => ({ ...f, priceQAR: e.target.value }))} placeholder="e.g. 2800" />
                    </div>
                    <div className="col-span-2 flex justify-end gap-2 mt-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                        onClick={() => { setLibFormMode("idle"); setLibEditCode(null); }}>Cancel</Button>
                      <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={saveLibItem}>{libFormMode === "add" ? "Add to Library" : "Save Changes"}</Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5">
                {filteredItems.map(item => {
                  const isCustom = customItems.some(c => c.code === item.code);
                  return (
                    <div key={item.code} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a1d2e] border border-white/5 hover:border-red-500/30 hover:bg-red-500/5 transition-colors group">
                      <button className="flex-1 min-w-0 text-left" onClick={() => addToDraft(item)}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-200 truncate">{item.name}</span>
                          {item.brand && <span className="text-[10px] text-blue-400 shrink-0">{item.brand}</span>}
                          {isCustom && <span className="text-[10px] text-green-400 shrink-0">custom</span>}
                        </div>
                        {item.spec && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{item.spec}</p>}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs font-semibold text-amber-400">QAR {item.priceQAR.toLocaleString()}</span>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-blue-400"
                          onClick={e => { e.stopPropagation(); openEditLibItem(item); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400"
                          onClick={e => { e.stopPropagation(); deleteLibItem(item.code); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-green-400"
                          onClick={() => addToDraft(item)}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {filteredItems.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center col-span-2">No items match the current filter.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right: Set Builder */}
          <Card className="bg-[#13161f] border-white/10 flex flex-col w-[420px] shrink-0">
            <CardHeader className="pb-2 pt-4 px-4 shrink-0">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                {builderMode === "idle" ? "Set Builder" : builderMode === "new" ? "New Set" : "Edit Set"}
              </CardTitle>
            </CardHeader>
            {builderMode === "idle" ? (
              <CardContent className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-4 pb-4">
                <Package className="h-10 w-10 text-muted-foreground opacity-30" />
                <p className="text-xs text-muted-foreground">Click <strong>New Set</strong> above to start building,<br />or select a saved set and click <strong>Edit</strong>.</p>
              </CardContent>
            ) : (
              <>
                <CardContent className="flex-1 overflow-y-auto px-4 pb-2">
                  {/* Set name & description */}
                  <div className="space-y-2 mb-3">
                    <div>
                      <Label className="text-xs text-gray-400">Set Name *</Label>
                      <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 h-8 text-xs mt-1"
                        placeholder="e.g. 3BR Villa Standard Package"
                        value={draftName} onChange={e => setDraftName(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Description</Label>
                      <Input className="bg-[#1a1d2e] border-white/10 text-gray-200 h-8 text-xs mt-1"
                        placeholder="Optional notes"
                        value={draftDesc} onChange={e => setDraftDesc(e.target.value)} />
                    </div>
                  </div>
                  {/* Save/Cancel buttons at top */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{draftLines.length} item types · <strong className="text-white">{totalItems}</strong> units</span>
                    <span className="text-xs font-semibold text-amber-400">QAR {totalValue.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <Button variant="outline" size="sm" className="flex-1 h-8 border-white/10 text-gray-300" onClick={cancelDraft}>Cancel</Button>
                    <Button size="sm" className="flex-1 h-8 bg-red-600 hover:bg-red-700 text-white gap-1.5"
                      onClick={saveSet} disabled={upsertMutation.isPending}>
                      {upsertMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {builderMode === "new" ? "Save Set" : "Update Set"}
                    </Button>
                  </div>
                  <Separator className="bg-white/5 mb-3" />
                  {draftLines.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Click items from the library to add them here.</p>
                  ) : (
                    <div className="space-y-3">
                      {draftLines.map(line => (
                        <div key={line.item.code} className="bg-[#1a1d2e] rounded-lg p-2.5 border border-white/5">
                          {/* Item header */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-200 truncate">{line.item.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{line.item.brand} · {line.item.spec}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="icon" variant="ghost" className="h-5 w-5 text-gray-400 hover:text-white"
                                onClick={() => changeQty(line.item.code, -1)}><Minus className="h-3 w-3" /></Button>
                              <span className="text-xs font-mono w-5 text-center text-white">{line.qty}</span>
                              <Button size="icon" variant="ghost" className="h-5 w-5 text-gray-400 hover:text-white"
                                onClick={() => changeQty(line.item.code, 1)}><Plus className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-5 w-5 text-red-400 hover:text-red-300 ml-1"
                                onClick={() => removeFromDraft(line.item.code)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-amber-400">QAR {line.item.priceQAR.toLocaleString()} × {line.qty} = QAR {(line.item.priceQAR * line.qty).toLocaleString()}</span>
                          </div>

                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>

              </>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
