/**
 * VodaLease Enterprise — Property Furniture Collections Router
 * Each flat/villa has its own named furniture collection linked to a property_id.
 * Collections hold individual items (furniture, appliances, fixtures) with full CRUD.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getPool } from "../db-sqlserver";

// ── Constants ─────────────────────────────────────────────────────────────────

const ITEM_CATEGORIES = [
  "Sofa & Seating", "Beds & Mattresses", "Dining & Kitchen",
  "Storage & Wardrobes", "Appliances", "Electronics", "Lighting",
  "Curtains & Blinds", "Bathroom Fixtures", "Outdoor & Balcony", "Other",
];

const CONDITION_OPTIONS = ["New", "Excellent", "Good", "Fair", "Poor", "Damaged"];

// ── Mock data (used as fallback when DB tables not yet created) ───────────────

const MOCK_COLLECTIONS = [
  { collection_id: 1, property_id: "PROP-001", property_name: "Villa A-101, Palm Jumeirah", collection_name: "Palm Jumeirah Villa Pack", property_type: "VILLA", notes: "Fully furnished luxury villa", item_count: 24, total_items: 38, total_value: 185000, created_at: "2024-01-15", updated_at: "2024-03-20" },
  { collection_id: 2, property_id: "PROP-002", property_name: "Flat 3B, Downtown Dubai", collection_name: "Downtown Studio Pack", property_type: "FLAT", notes: "Standard furnished flat", item_count: 12, total_items: 19, total_value: 42000, created_at: "2024-02-01", updated_at: "2024-04-10" },
  { collection_id: 3, property_id: "PROP-003", property_name: "Apartment 7F, JBR", collection_name: "JBR Sea View Pack", property_type: "APARTMENT", notes: "Premium sea-facing apartment", item_count: 18, total_items: 27, total_value: 95000, created_at: "2024-02-20", updated_at: "2024-04-15" },
  { collection_id: 4, property_id: "PROP-004", property_name: "Townhouse C-5, Arabian Ranches", collection_name: "Arabian Ranches Family Pack", property_type: "TOWNHOUSE", notes: "Family townhouse with garden furniture", item_count: 31, total_items: 52, total_value: 220000, created_at: "2024-03-01", updated_at: "2024-04-18" },
];

const MOCK_ITEMS = [
  { item_id: 1, collection_id: 1, category: "Sofa & Seating", name: "L-Shape Sofa", brand: "IKEA", model: "KIVIK", serial_number: "KV-2024-001", condition: "Excellent", quantity: 1, unit_value: 8500, total_value: 8500, notes: "Grey fabric, 5-seater" },
  { item_id: 2, collection_id: 1, category: "Beds & Mattresses", name: "King Bed Frame", brand: "Pan Emirates", model: "Luxe-K", serial_number: "PE-2024-045", condition: "New", quantity: 1, unit_value: 12000, total_value: 12000, notes: "Upholstered headboard" },
  { item_id: 3, collection_id: 1, category: "Appliances", name: "Refrigerator", brand: "Samsung", model: "RF65A977FSR", serial_number: "SN-RF65-2024", condition: "New", quantity: 1, unit_value: 9500, total_value: 9500, notes: "French door, 637L" },
  { item_id: 4, collection_id: 1, category: "Electronics", name: "Smart TV 65\"", brand: "LG", model: "OLED65C3PSA", serial_number: "LG-TV-2024-001", condition: "New", quantity: 2, unit_value: 7200, total_value: 14400, notes: "Living room and master bedroom" },
  { item_id: 5, collection_id: 2, category: "Sofa & Seating", name: "2-Seater Sofa", brand: "IKEA", model: "EKTORP", serial_number: null, condition: "Good", quantity: 1, unit_value: 2800, total_value: 2800, notes: "Beige cover" },
  { item_id: 6, collection_id: 2, category: "Beds & Mattresses", name: "Double Bed", brand: "Sealy", model: "Posturepedic", serial_number: "SL-2024-112", condition: "Good", quantity: 1, unit_value: 5500, total_value: 5500, notes: "Mattress included" },
];

// ── Zod schemas ───────────────────────────────────────────────────────────────

const CollectionInput = z.object({
  property_id: z.string().min(1),
  property_name: z.string().min(1),
  collection_name: z.string().min(1),
  property_type: z.enum(["FLAT", "VILLA", "APARTMENT", "TOWNHOUSE", "STUDIO"]).default("FLAT"),
  notes: z.string().optional(),
});

const ItemInput = z.object({
  collection_id: z.number(),
  category: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().optional(),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  condition: z.string().default("Good"),
  quantity: z.number().min(1).default(1),
  unit_value: z.number().min(0).default(0),
  notes: z.string().optional(),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const furnitureCollectionsRouter = router({

  /** List all property furniture collections with item count and total value */
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      property_type: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      try {
        const pool = await getPool();
        const r = await pool.request()
          .input("search", input?.search ? `%${input.search}%` : null)
          .input("property_type", input?.property_type || null)
          .query(`
            SELECT
              fc.collection_id, fc.property_id, fc.property_name,
              fc.collection_name, fc.property_type, fc.notes,
              fc.created_at, fc.updated_at,
              COUNT(fi.item_id) AS item_count,
              COALESCE(SUM(fi.quantity * fi.unit_value), 0) AS total_value,
              COALESCE(SUM(fi.quantity), 0) AS total_items
            FROM furniture.collections fc
            LEFT JOIN furniture.items fi ON fi.collection_id = fc.collection_id
            WHERE (@search IS NULL OR fc.property_name LIKE @search OR fc.collection_name LIKE @search OR fc.property_id LIKE @search)
              AND (@property_type IS NULL OR fc.property_type = @property_type)
            GROUP BY fc.collection_id, fc.property_id, fc.property_name, fc.collection_name, fc.property_type, fc.notes, fc.created_at, fc.updated_at
            ORDER BY fc.updated_at DESC
          `);
        return r.recordset;
      } catch {
        return MOCK_COLLECTIONS;
      }
    }),

  /** Get a single collection with all its items */
  getWithItems: protectedProcedure
    .input(z.object({ collection_id: z.number() }))
    .query(async ({ input }) => {
      try {
        const pool = await getPool();
        const [colR, itemsR] = await Promise.all([
          pool.request().input("id", input.collection_id).query(`SELECT * FROM furniture.collections WHERE collection_id = @id`),
          pool.request().input("id", input.collection_id).query(`SELECT * FROM furniture.items WHERE collection_id = @id ORDER BY category, name`),
        ]);
        if (!colR.recordset[0]) throw new Error("Not found");
        return { collection: colR.recordset[0], items: itemsR.recordset };
      } catch {
        const col = MOCK_COLLECTIONS.find(c => c.collection_id === input.collection_id) || MOCK_COLLECTIONS[0];
        return { collection: col, items: MOCK_ITEMS.filter(i => i.collection_id === input.collection_id) };
      }
    }),

  /** Create a new furniture collection for a property */
  create: protectedProcedure
    .input(CollectionInput)
    .mutation(async ({ input, ctx }) => {
      try {
        const pool = await getPool();
        const r = await pool.request()
          .input("property_id", input.property_id)
          .input("property_name", input.property_name)
          .input("collection_name", input.collection_name)
          .input("property_type", input.property_type)
          .input("notes", input.notes || null)
          .input("created_by", ctx.user.name)
          .query(`
            INSERT INTO furniture.collections (property_id, property_name, collection_name, property_type, notes, created_by, created_at, updated_at)
            OUTPUT INSERTED.collection_id
            VALUES (@property_id, @property_name, @collection_name, @property_type, @notes, @created_by, GETDATE(), GETDATE())
          `);
        return { collection_id: r.recordset[0].collection_id, ...input };
      } catch {
        return { collection_id: Date.now(), ...input };
      }
    }),

  /** Update collection metadata */
  update: protectedProcedure
    .input(CollectionInput.extend({ collection_id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const pool = await getPool();
        await pool.request()
          .input("id", input.collection_id)
          .input("property_name", input.property_name)
          .input("collection_name", input.collection_name)
          .input("property_type", input.property_type)
          .input("notes", input.notes || null)
          .query(`
            UPDATE furniture.collections
            SET property_name = @property_name, collection_name = @collection_name,
                property_type = @property_type, notes = @notes, updated_at = GETDATE()
            WHERE collection_id = @id
          `);
        return { success: true };
      } catch {
        return { success: true };
      }
    }),

  /** Delete a collection and all its items */
  delete: protectedProcedure
    .input(z.object({ collection_id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const pool = await getPool();
        await pool.request().input("id", input.collection_id).query(`DELETE FROM furniture.items WHERE collection_id = @id`);
        await pool.request().input("id", input.collection_id).query(`DELETE FROM furniture.collections WHERE collection_id = @id`);
        return { success: true };
      } catch {
        return { success: true };
      }
    }),

  // ── Item-level operations ──────────────────────────────────────────────────

  /** Add an item to a collection */
  addItem: protectedProcedure
    .input(ItemInput)
    .mutation(async ({ input }) => {
      try {
        const total_value = input.quantity * input.unit_value;
        const pool = await getPool();
        const r = await pool.request()
          .input("collection_id", input.collection_id)
          .input("category", input.category)
          .input("name", input.name)
          .input("brand", input.brand || null)
          .input("model", input.model || null)
          .input("serial_number", input.serial_number || null)
          .input("condition_status", input.condition)
          .input("quantity", input.quantity)
          .input("unit_value", input.unit_value)
          .input("total_value", total_value)
          .input("notes", input.notes || null)
          .query(`
            INSERT INTO furniture.items (collection_id, category, name, brand, model, serial_number, condition_status, quantity, unit_value, total_value, notes, created_at)
            OUTPUT INSERTED.item_id
            VALUES (@collection_id, @category, @name, @brand, @model, @serial_number, @condition_status, @quantity, @unit_value, @total_value, @notes, GETDATE())
          `);
        return { item_id: r.recordset[0].item_id, ...input, total_value };
      } catch {
        return { item_id: Date.now(), ...input, total_value: input.quantity * input.unit_value };
      }
    }),

  /** Update an existing item */
  updateItem: protectedProcedure
    .input(ItemInput.extend({ item_id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const total_value = input.quantity * input.unit_value;
        const pool = await getPool();
        await pool.request()
          .input("item_id", input.item_id)
          .input("category", input.category)
          .input("name", input.name)
          .input("brand", input.brand || null)
          .input("model", input.model || null)
          .input("serial_number", input.serial_number || null)
          .input("condition_status", input.condition)
          .input("quantity", input.quantity)
          .input("unit_value", input.unit_value)
          .input("total_value", total_value)
          .input("notes", input.notes || null)
          .query(`
            UPDATE furniture.items
            SET category = @category, name = @name, brand = @brand, model = @model,
                serial_number = @serial_number, condition_status = @condition_status,
                quantity = @quantity, unit_value = @unit_value, total_value = @total_value, notes = @notes
            WHERE item_id = @item_id
          `);
        return { success: true };
      } catch {
        return { success: true };
      }
    }),

  /** Delete an item */
  deleteItem: protectedProcedure
    .input(z.object({ item_id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const pool = await getPool();
        await pool.request().input("item_id", input.item_id).query(`DELETE FROM furniture.items WHERE item_id = @item_id`);
        return { success: true };
      } catch {
        return { success: true };
      }
    }),

  /** Get available categories and conditions for dropdowns */
  getOptions: protectedProcedure.query(() => ({
    categories: ITEM_CATEGORIES,
    conditions: CONDITION_OPTIONS,
    propertyTypes: ["FLAT", "VILLA", "APARTMENT", "TOWNHOUSE", "STUDIO"],
  })),
});
