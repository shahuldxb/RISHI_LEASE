import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getPool } from "../db-sqlserver";

// ─── Furnished Assets Router ──────────────────────────────────────────────────
// Manages furniture, appliances, and equipment that come with leased properties.
// Tracks per-asset condition, estimated value, and links to handover checklists.

export const furnishedAssetsRouter = router({

  // ── Asset Inventory ──────────────────────────────────────────────────────────
  listByLease: protectedProcedure
    .input(z.object({ contract_id: z.number() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("cid", input.contract_id)
        .query(`
          SELECT fa.*, c.contract_ref, c.asset_description AS property_name
          FROM lease.furnished_assets fa
          JOIN lease.contracts c ON c.contract_id = fa.contract_id
          WHERE fa.contract_id = @cid
          ORDER BY fa.asset_category, fa.asset_name
        `);
      return r.recordset;
    }),

  listAll: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      condition: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("cat", input.category ?? null)
        .input("cond", input.condition ?? null)
        .input("search", input.search ? `%${input.search}%` : null)
        .query(`
          SELECT fa.*, c.contract_ref, c.asset_description AS property_name,
                 l.lessor_name
          FROM lease.furnished_assets fa
          JOIN lease.contracts c ON c.contract_id = fa.contract_id
          LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
          WHERE (@cat IS NULL OR fa.asset_category = @cat)
            AND (@cond IS NULL OR fa.condition_at_handover = @cond)
            AND (@search IS NULL OR fa.asset_name LIKE @search OR fa.serial_number LIKE @search OR fa.brand LIKE @search)
          ORDER BY c.contract_ref, fa.asset_category, fa.asset_name
        `);
      return r.recordset;
    }),

  create: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      asset_category: z.enum(["FURNITURE","APPLIANCE","ELECTRONICS","FIXTURE","KITCHEN","BEDROOM","BATHROOM","OUTDOOR","OTHER"]),
      asset_name: z.string(),
      brand: z.string().optional(),
      model: z.string().optional(),
      serial_number: z.string().optional(),
      condition_at_handover: z.enum(["NEW","EXCELLENT","GOOD","FAIR","POOR"]).default("GOOD"),
      estimated_value: z.number().optional(),
      quantity: z.number().default(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      await pool.request()
        .input("contract_id", input.contract_id)
        .input("asset_category", input.asset_category)
        .input("asset_name", input.asset_name)
        .input("brand", input.brand ?? null)
        .input("model", input.model ?? null)
        .input("serial_number", input.serial_number ?? null)
        .input("condition_at_handover", input.condition_at_handover)
        .input("estimated_value", input.estimated_value ?? null)
        .input("quantity", input.quantity)
        .input("notes", input.notes ?? null)
        .input("created_by", ctx.user.id)
        .query(`
          INSERT INTO lease.furnished_assets
            (contract_id, asset_category, asset_name, brand, model, serial_number,
             condition_at_handover, estimated_value, quantity, notes, created_by)
          VALUES
            (@contract_id, @asset_category, @asset_name, @brand, @model, @serial_number,
             @condition_at_handover, @estimated_value, @quantity, @notes, @created_by)
        `);
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      asset_id: z.number(),
      asset_name: z.string().optional(),
      brand: z.string().optional(),
      model: z.string().optional(),
      serial_number: z.string().optional(),
      condition_at_handover: z.enum(["NEW","EXCELLENT","GOOD","FAIR","POOR"]).optional(),
      estimated_value: z.number().optional(),
      quantity: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.asset_id)
        .input("name", input.asset_name ?? null)
        .input("brand", input.brand ?? null)
        .input("model", input.model ?? null)
        .input("serial", input.serial_number ?? null)
        .input("cond", input.condition_at_handover ?? null)
        .input("val", input.estimated_value ?? null)
        .input("qty", input.quantity ?? null)
        .input("notes", input.notes ?? null)
        .query(`
          UPDATE lease.furnished_assets SET
            asset_name = COALESCE(@name, asset_name),
            brand = COALESCE(@brand, brand),
            model = COALESCE(@model, model),
            serial_number = COALESCE(@serial, serial_number),
            condition_at_handover = COALESCE(@cond, condition_at_handover),
            estimated_value = COALESCE(@val, estimated_value),
            quantity = COALESCE(@qty, quantity),
            notes = COALESCE(@notes, notes),
            updated_at = GETDATE()
          WHERE asset_id = @id
        `);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ asset_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.asset_id)
        .query(`DELETE FROM lease.furnished_assets WHERE asset_id = @id`);
      return { success: true };
    }),

  getSummary: protectedProcedure
    .input(z.object({ contract_id: z.number() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("cid", input.contract_id)
        .query(`
          SELECT
            COUNT(*) AS total_items,
            SUM(quantity) AS total_units,
            SUM(ISNULL(estimated_value, 0) * quantity) AS total_value,
            SUM(CASE WHEN condition_at_handover IN ('NEW','EXCELLENT') THEN 1 ELSE 0 END) AS premium_condition,
            SUM(CASE WHEN condition_at_handover IN ('FAIR','POOR') THEN 1 ELSE 0 END) AS needs_attention
          FROM lease.furnished_assets
          WHERE contract_id = @cid
        `);
      return r.recordset[0];
    }),
});

// ─── Asset Deposit Router ─────────────────────────────────────────────────────
// Asset deposits are separate from security deposits — they cover the replacement
// value of furnished items and are refunded after return inspection.

export const assetDepositRouter = router({

  listAll: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      contract_id: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("status", input.status ?? null)
        .input("cid", input.contract_id ?? null)
        .query(`
          SELECT ad.*, c.contract_ref, c.asset_description AS property_name,
                 l.lessor_name,
                 (SELECT SUM(deduction_amount) FROM lease.asset_deposit_deductions dd WHERE dd.deposit_id = ad.deposit_id AND dd.status = 'APPROVED') AS total_deductions,
                 (ad.deposit_amount - ISNULL((SELECT SUM(deduction_amount) FROM lease.asset_deposit_deductions dd WHERE dd.deposit_id = ad.deposit_id AND dd.status = 'APPROVED'), 0)) AS net_refundable
          FROM lease.asset_deposits ad
          JOIN lease.contracts c ON c.contract_id = ad.contract_id
          LEFT JOIN lessor.lessors l ON l.lessor_id = c.lessor_id
          WHERE (@status IS NULL OR ad.status = @status)
            AND (@cid IS NULL OR ad.contract_id = @cid)
          ORDER BY ad.deposit_date DESC
        `);
      return r.recordset;
    }),

  getByLease: protectedProcedure
    .input(z.object({ contract_id: z.number() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("cid", input.contract_id)
        .query(`
          SELECT ad.*,
            (SELECT SUM(deduction_amount) FROM lease.asset_deposit_deductions dd WHERE dd.deposit_id = ad.deposit_id AND dd.status = 'APPROVED') AS total_deductions
          FROM lease.asset_deposits ad
          WHERE ad.contract_id = @cid
          ORDER BY ad.deposit_date DESC
        `);
      return r.recordset;
    }),

  create: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      deposit_amount: z.number(),
      deposit_currency: z.string().default("AED"),
      deposit_date: z.string(),
      deposit_type: z.enum(["CASH","CHEQUE","BANK_TRANSFER","CREDIT_CARD"]),
      bank_ref: z.string().optional(),
      cheque_number: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      await pool.request()
        .input("contract_id", input.contract_id)
        .input("deposit_amount", input.deposit_amount)
        .input("deposit_currency", input.deposit_currency)
        .input("deposit_date", input.deposit_date)
        .input("deposit_type", input.deposit_type)
        .input("bank_ref", input.bank_ref ?? null)
        .input("cheque_number", input.cheque_number ?? null)
        .input("notes", input.notes ?? null)
        .input("created_by", ctx.user.id)
        .query(`
          INSERT INTO lease.asset_deposits
            (contract_id, deposit_amount, deposit_currency, deposit_date, deposit_type,
             bank_ref, cheque_number, notes, status, created_by)
          VALUES
            (@contract_id, @deposit_amount, @deposit_currency, @deposit_date, @deposit_type,
             @bank_ref, @cheque_number, @notes, 'HELD', @created_by)
        `);
      return { success: true };
    }),

  release: protectedProcedure
    .input(z.object({
      deposit_id: z.number(),
      released_amount: z.number(),
      release_date: z.string(),
      release_notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.deposit_id)
        .input("amount", input.released_amount)
        .input("date", input.release_date)
        .input("notes", input.release_notes ?? null)
        .input("user", ctx.user.id)
        .query(`
          UPDATE lease.asset_deposits SET
            status = 'RELEASED',
            released_amount = @amount,
            release_date = @date,
            release_notes = @notes,
            released_by = @user,
            updated_at = GETDATE()
          WHERE deposit_id = @id
        `);
      return { success: true };
    }),

  addDeduction: protectedProcedure
    .input(z.object({
      deposit_id: z.number(),
      asset_id: z.number().optional(),
      deduction_reason: z.string(),
      deduction_amount: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      await pool.request()
        .input("deposit_id", input.deposit_id)
        .input("asset_id", input.asset_id ?? null)
        .input("reason", input.deduction_reason)
        .input("amount", input.deduction_amount)
        .input("notes", input.notes ?? null)
        .input("created_by", ctx.user.id)
        .query(`
          INSERT INTO lease.asset_deposit_deductions
            (deposit_id, asset_id, deduction_reason, deduction_amount, notes, status, created_by)
          VALUES
            (@deposit_id, @asset_id, @reason, @amount, @notes, 'PENDING', @created_by)
        `);
      return { success: true };
    }),

  approveDeduction: protectedProcedure
    .input(z.object({
      deduction_id: z.number(),
      approved: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.deduction_id)
        .input("status", input.approved ? "APPROVED" : "REJECTED")
        .input("user", ctx.user.id)
        .query(`
          UPDATE lease.asset_deposit_deductions SET
            status = @status,
            approved_by = @user,
            approved_date = GETDATE()
          WHERE deduction_id = @id
        `);
      return { success: true };
    }),

  getDeductions: protectedProcedure
    .input(z.object({ deposit_id: z.number() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("id", input.deposit_id)
        .query(`
          SELECT dd.*, fa.asset_name, fa.asset_category, u.username AS approved_by_name
          FROM lease.asset_deposit_deductions dd
          LEFT JOIN lease.furnished_assets fa ON fa.asset_id = dd.asset_id
          LEFT JOIN security.users u ON u.user_id = dd.approved_by
          WHERE dd.deposit_id = @id
          ORDER BY dd.created_at DESC
        `);
      return r.recordset;
    }),
});

// ─── Handover Checklist Router ────────────────────────────────────────────────
// Digital handover and return checklists with per-asset condition assessment.

export const handoverChecklistRouter = router({

  listByLease: protectedProcedure
    .input(z.object({ contract_id: z.number() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("cid", input.contract_id)
        .query(`
          SELECT hc.*, u.username AS conducted_by_name,
                 (SELECT COUNT(*) FROM lease.asset_checklist_items ci WHERE ci.checklist_id = hc.checklist_id) AS item_count,
                 (SELECT SUM(ISNULL(repair_cost_estimate,0)) FROM lease.asset_checklist_items ci WHERE ci.checklist_id = hc.checklist_id AND ci.deduct_from_deposit = 1) AS total_deduction_estimate
          FROM lease.asset_handover_checklists hc
          LEFT JOIN security.users u ON u.user_id = hc.conducted_by
          WHERE hc.contract_id = @cid
          ORDER BY hc.conducted_date DESC
        `);
      return r.recordset;
    }),

  listAll: protectedProcedure
    .input(z.object({
      checklist_type: z.enum(["HANDOVER","RETURN"]).optional(),
      signed_off: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("type", input.checklist_type ?? null)
        .input("signed", input.signed_off !== undefined ? (input.signed_off ? 1 : 0) : null)
        .query(`
          SELECT hc.*, c.contract_ref, c.asset_description AS property_name,
                 u.username AS conducted_by_name,
                 (SELECT COUNT(*) FROM lease.asset_checklist_items ci WHERE ci.checklist_id = hc.checklist_id) AS item_count,
                 (SELECT SUM(ISNULL(repair_cost_estimate,0)) FROM lease.asset_checklist_items ci WHERE ci.checklist_id = hc.checklist_id AND ci.deduct_from_deposit = 1) AS total_deduction_estimate
          FROM lease.asset_handover_checklists hc
          JOIN lease.contracts c ON c.contract_id = hc.contract_id
          LEFT JOIN security.users u ON u.user_id = hc.conducted_by
          WHERE (@type IS NULL OR hc.checklist_type = @type)
            AND (@signed IS NULL OR hc.signed_off = @signed)
          ORDER BY hc.conducted_date DESC
        `);
      return r.recordset;
    }),

  create: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      checklist_type: z.enum(["HANDOVER","RETURN"]),
      conducted_date: z.string(),
      overall_condition: z.enum(["EXCELLENT","GOOD","FAIR","POOR","DAMAGED"]).default("GOOD"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("contract_id", input.contract_id)
        .input("checklist_type", input.checklist_type)
        .input("conducted_date", input.conducted_date)
        .input("overall_condition", input.overall_condition)
        .input("notes", input.notes ?? null)
        .input("conducted_by", ctx.user.id)
        .query(`
          INSERT INTO lease.asset_handover_checklists
            (contract_id, checklist_type, conducted_date, overall_condition, notes, conducted_by, signed_off)
          OUTPUT INSERTED.checklist_id
          VALUES
            (@contract_id, @checklist_type, @conducted_date, @overall_condition, @notes, @conducted_by, 0)
        `);
      return { checklist_id: r.recordset[0]?.checklist_id, success: true };
    }),

  addItem: protectedProcedure
    .input(z.object({
      checklist_id: z.number(),
      asset_id: z.number(),
      condition_at_check: z.enum(["NEW","EXCELLENT","GOOD","FAIR","POOR","MISSING","DAMAGED"]),
      damage_description: z.string().optional(),
      repair_cost_estimate: z.number().optional(),
      deduct_from_deposit: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("checklist_id", input.checklist_id)
        .input("asset_id", input.asset_id)
        .input("condition_at_check", input.condition_at_check)
        .input("damage_description", input.damage_description ?? null)
        .input("repair_cost_estimate", input.repair_cost_estimate ?? null)
        .input("deduct_from_deposit", input.deduct_from_deposit ? 1 : 0)
        .query(`
          INSERT INTO lease.asset_checklist_items
            (checklist_id, asset_id, condition_at_check, damage_description, repair_cost_estimate, deduct_from_deposit)
          VALUES
            (@checklist_id, @asset_id, @condition_at_check, @damage_description, @repair_cost_estimate, @deduct_from_deposit)
        `);
      return { success: true };
    }),

  getItems: protectedProcedure
    .input(z.object({ checklist_id: z.number() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("id", input.checklist_id)
        .query(`
          SELECT ci.*, fa.asset_name, fa.asset_category, fa.brand, fa.model,
                 fa.condition_at_handover AS original_condition, fa.estimated_value
          FROM lease.asset_checklist_items ci
          JOIN lease.furnished_assets fa ON fa.asset_id = ci.asset_id
          WHERE ci.checklist_id = @id
          ORDER BY fa.asset_category, fa.asset_name
        `);
      return r.recordset;
    }),

  signOff: protectedProcedure
    .input(z.object({
      checklist_id: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.checklist_id)
        .input("notes", input.notes ?? null)
        .input("user", ctx.user.id)
        .query(`
          UPDATE lease.asset_handover_checklists SET
            signed_off = 1,
            signed_off_by = @user,
            signed_off_at = GETDATE(),
            notes = COALESCE(@notes, notes)
          WHERE checklist_id = @id
        `);
      return { success: true };
    }),
});
