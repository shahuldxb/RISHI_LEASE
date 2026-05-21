import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getPool } from "../db-sqlserver";

// ─── Master Services Contract Router ─────────────────────────────────────────
// Governs vehicle fleets and residential home leases.
// Separate from individual IFRS 16 lease contracts.

export const masterContractsRouter = router({

  list: protectedProcedure
    .input(z.object({
      contract_type: z.enum(["FLEET","RESIDENTIAL","ALL"]).default("ALL"),
      status: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("type", input.contract_type === "ALL" ? null : input.contract_type)
        .input("status", input.status ?? null)
        .input("search", input.search ? `%${input.search}%` : null)
        .query(`
          SELECT mc.*,
            (SELECT COUNT(*) FROM msc.contract_assets ca WHERE ca.msc_id = mc.msc_id) AS asset_count,
            DATEDIFF(day, GETDATE(), mc.expiry_date) AS days_to_expiry
          FROM msc.master_contracts mc
          WHERE (@type IS NULL OR mc.contract_type = @type)
            AND (@status IS NULL OR mc.status = @status)
            AND (@search IS NULL OR mc.msc_ref LIKE @search OR mc.title_en LIKE @search OR mc.party_b_en LIKE @search)
          ORDER BY mc.created_at DESC
        `);
      return r.recordset;
    }),

  getById: protectedProcedure
    .input(z.object({ msc_id: z.number() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("id", input.msc_id)
        .query(`
          SELECT mc.*,
            (SELECT COUNT(*) FROM msc.contract_assets ca WHERE ca.msc_id = mc.msc_id) AS asset_count
          FROM msc.master_contracts mc
          WHERE mc.msc_id = @id
        `);
      return r.recordset[0] ?? null;
    }),

  create: protectedProcedure
    .input(z.object({
      contract_type: z.enum(["FLEET","RESIDENTIAL"]),
      title_en: z.string(),
      title_ar: z.string(),
      party_a_en: z.string(),
      party_a_ar: z.string(),
      party_b_en: z.string(),
      party_b_ar: z.string(),
      effective_date: z.string(),
      expiry_date: z.string(),
      contract_value: z.number().optional(),
      currency: z.string().default("AED"),
      payment_terms_en: z.string().optional(),
      payment_terms_ar: z.string().optional(),
      scope_en: z.string().optional(),
      scope_ar: z.string().optional(),
      governing_law_en: z.string().optional(),
      governing_law_ar: z.string().optional(),
      jurisdiction_en: z.string().optional(),
      jurisdiction_ar: z.string().optional(),
      termination_en: z.string().optional(),
      termination_ar: z.string().optional(),
      warranties_en: z.string().optional(),
      warranties_ar: z.string().optional(),
      signed_by_en: z.string().optional(),
      signed_by_ar: z.string().optional(),
      witness_en: z.string().optional(),
      witness_ar: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const year = new Date().getFullYear();
      const r = await pool.request()
        .input("contract_type", input.contract_type)
        .input("title_en", input.title_en)
        .input("title_ar", input.title_ar)
        .input("party_a_en", input.party_a_en)
        .input("party_a_ar", input.party_a_ar)
        .input("party_b_en", input.party_b_en)
        .input("party_b_ar", input.party_b_ar)
        .input("effective_date", input.effective_date)
        .input("expiry_date", input.expiry_date)
        .input("contract_value", input.contract_value ?? null)
        .input("currency", input.currency)
        .input("payment_terms_en", input.payment_terms_en ?? null)
        .input("payment_terms_ar", input.payment_terms_ar ?? null)
        .input("scope_en", input.scope_en ?? null)
        .input("scope_ar", input.scope_ar ?? null)
        .input("governing_law_en", input.governing_law_en ?? null)
        .input("governing_law_ar", input.governing_law_ar ?? null)
        .input("jurisdiction_en", input.jurisdiction_en ?? null)
        .input("jurisdiction_ar", input.jurisdiction_ar ?? null)
        .input("termination_en", input.termination_en ?? null)
        .input("termination_ar", input.termination_ar ?? null)
        .input("warranties_en", input.warranties_en ?? null)
        .input("warranties_ar", input.warranties_ar ?? null)
        .input("signed_by_en", input.signed_by_en ?? null)
        .input("signed_by_ar", input.signed_by_ar ?? null)
        .input("witness_en", input.witness_en ?? null)
        .input("witness_ar", input.witness_ar ?? null)
        .input("year", year)
        .input("created_by", ctx.user.id)
        .query(`
          DECLARE @seq INT;
          SELECT @seq = ISNULL(MAX(msc_id), 0) + 1 FROM msc.master_contracts;
          INSERT INTO msc.master_contracts (
            msc_ref, contract_type, title_en, title_ar,
            party_a_en, party_a_ar, party_b_en, party_b_ar,
            effective_date, expiry_date, contract_value, currency,
            payment_terms_en, payment_terms_ar, scope_en, scope_ar,
            governing_law_en, governing_law_ar, jurisdiction_en, jurisdiction_ar,
            termination_en, termination_ar, warranties_en, warranties_ar,
            signed_by_en, signed_by_ar, witness_en, witness_ar,
            status, created_by
          )
          OUTPUT INSERTED.msc_id, INSERTED.msc_ref
          VALUES (
            CONCAT('MSC-', @year, '-', RIGHT('000' + CAST(@seq AS VARCHAR), 3)),
            @contract_type, @title_en, @title_ar,
            @party_a_en, @party_a_ar, @party_b_en, @party_b_ar,
            @effective_date, @expiry_date, @contract_value, @currency,
            @payment_terms_en, @payment_terms_ar, @scope_en, @scope_ar,
            @governing_law_en, @governing_law_ar, @jurisdiction_en, @jurisdiction_ar,
            @termination_en, @termination_ar, @warranties_en, @warranties_ar,
            @signed_by_en, @signed_by_ar, @witness_en, @witness_ar,
            'DRAFT', @created_by
          )
        `);
      return { msc_id: r.recordset[0]?.msc_id, msc_ref: r.recordset[0]?.msc_ref, success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      msc_id: z.number(),
      title_en: z.string().optional(),
      title_ar: z.string().optional(),
      party_a_en: z.string().optional(),
      party_a_ar: z.string().optional(),
      party_b_en: z.string().optional(),
      party_b_ar: z.string().optional(),
      effective_date: z.string().optional(),
      expiry_date: z.string().optional(),
      contract_value: z.number().optional(),
      currency: z.string().optional(),
      payment_terms_en: z.string().optional(),
      payment_terms_ar: z.string().optional(),
      scope_en: z.string().optional(),
      scope_ar: z.string().optional(),
      governing_law_en: z.string().optional(),
      governing_law_ar: z.string().optional(),
      jurisdiction_en: z.string().optional(),
      jurisdiction_ar: z.string().optional(),
      termination_en: z.string().optional(),
      termination_ar: z.string().optional(),
      warranties_en: z.string().optional(),
      warranties_ar: z.string().optional(),
      signed_by_en: z.string().optional(),
      signed_by_ar: z.string().optional(),
      witness_en: z.string().optional(),
      witness_ar: z.string().optional(),
      status: z.enum(["DRAFT","ACTIVE","EXPIRED","TERMINATED"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.msc_id)
        .input("title_en", input.title_en ?? null)
        .input("title_ar", input.title_ar ?? null)
        .input("party_a_en", input.party_a_en ?? null)
        .input("party_a_ar", input.party_a_ar ?? null)
        .input("party_b_en", input.party_b_en ?? null)
        .input("party_b_ar", input.party_b_ar ?? null)
        .input("effective_date", input.effective_date ?? null)
        .input("expiry_date", input.expiry_date ?? null)
        .input("contract_value", input.contract_value ?? null)
        .input("currency", input.currency ?? null)
        .input("payment_terms_en", input.payment_terms_en ?? null)
        .input("payment_terms_ar", input.payment_terms_ar ?? null)
        .input("scope_en", input.scope_en ?? null)
        .input("scope_ar", input.scope_ar ?? null)
        .input("governing_law_en", input.governing_law_en ?? null)
        .input("governing_law_ar", input.governing_law_ar ?? null)
        .input("jurisdiction_en", input.jurisdiction_en ?? null)
        .input("jurisdiction_ar", input.jurisdiction_ar ?? null)
        .input("termination_en", input.termination_en ?? null)
        .input("termination_ar", input.termination_ar ?? null)
        .input("warranties_en", input.warranties_en ?? null)
        .input("warranties_ar", input.warranties_ar ?? null)
        .input("signed_by_en", input.signed_by_en ?? null)
        .input("signed_by_ar", input.signed_by_ar ?? null)
        .input("witness_en", input.witness_en ?? null)
        .input("witness_ar", input.witness_ar ?? null)
        .input("status", input.status ?? null)
        .query(`
          UPDATE msc.master_contracts SET
            title_en = COALESCE(@title_en, title_en),
            title_ar = COALESCE(@title_ar, title_ar),
            party_a_en = COALESCE(@party_a_en, party_a_en),
            party_a_ar = COALESCE(@party_a_ar, party_a_ar),
            party_b_en = COALESCE(@party_b_en, party_b_en),
            party_b_ar = COALESCE(@party_b_ar, party_b_ar),
            effective_date = COALESCE(@effective_date, effective_date),
            expiry_date = COALESCE(@expiry_date, expiry_date),
            contract_value = COALESCE(@contract_value, contract_value),
            currency = COALESCE(@currency, currency),
            payment_terms_en = COALESCE(@payment_terms_en, payment_terms_en),
            payment_terms_ar = COALESCE(@payment_terms_ar, payment_terms_ar),
            scope_en = COALESCE(@scope_en, scope_en),
            scope_ar = COALESCE(@scope_ar, scope_ar),
            governing_law_en = COALESCE(@governing_law_en, governing_law_en),
            governing_law_ar = COALESCE(@governing_law_ar, governing_law_ar),
            jurisdiction_en = COALESCE(@jurisdiction_en, jurisdiction_en),
            jurisdiction_ar = COALESCE(@jurisdiction_ar, jurisdiction_ar),
            termination_en = COALESCE(@termination_en, termination_en),
            termination_ar = COALESCE(@termination_ar, termination_ar),
            warranties_en = COALESCE(@warranties_en, warranties_en),
            warranties_ar = COALESCE(@warranties_ar, warranties_ar),
            signed_by_en = COALESCE(@signed_by_en, signed_by_en),
            signed_by_ar = COALESCE(@signed_by_ar, signed_by_ar),
            witness_en = COALESCE(@witness_en, witness_en),
            witness_ar = COALESCE(@witness_ar, witness_ar),
            status = COALESCE(@status, status),
            updated_at = GETDATE()
          WHERE msc_id = @id
        `);
      return { success: true };
    }),

  activate: protectedProcedure
    .input(z.object({ msc_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.msc_id)
        .query(`UPDATE msc.master_contracts SET status = 'ACTIVE', updated_at = GETDATE() WHERE msc_id = @id`);
      return { success: true };
    }),

  // ── Asset / Fleet Linking ─────────────────────────────────────────────────
  getLinkedAssets: protectedProcedure
    .input(z.object({ msc_id: z.number() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("id", input.msc_id)
        .query(`
          SELECT ca.*, mc.msc_ref
          FROM msc.contract_assets ca
          JOIN msc.master_contracts mc ON mc.msc_id = ca.msc_id
          WHERE ca.msc_id = @id
          ORDER BY ca.asset_type, ca.asset_ref
        `);
      return r.recordset;
    }),

  linkAsset: protectedProcedure
    .input(z.object({
      msc_id: z.number(),
      asset_type: z.enum(["VEHICLE","HOME","EQUIPMENT","OTHER"]),
      asset_ref: z.string(),
      asset_description: z.string(),
      make_model: z.string().optional(),
      plate_vin: z.string().optional(),
      location: z.string().optional(),
      linked_lease_id: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("msc_id", input.msc_id)
        .input("asset_type", input.asset_type)
        .input("asset_ref", input.asset_ref)
        .input("asset_description", input.asset_description)
        .input("make_model", input.make_model ?? null)
        .input("plate_vin", input.plate_vin ?? null)
        .input("location", input.location ?? null)
        .input("linked_lease_id", input.linked_lease_id ?? null)
        .query(`
          INSERT INTO msc.contract_assets
            (msc_id, asset_type, asset_ref, asset_description, make_model, plate_vin, location, linked_lease_id)
          VALUES
            (@msc_id, @asset_type, @asset_ref, @asset_description, @make_model, @plate_vin, @location, @linked_lease_id)
        `);
      return { success: true };
    }),

  unlinkAsset: protectedProcedure
    .input(z.object({ link_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.link_id)
        .query(`DELETE FROM msc.contract_assets WHERE link_id = @id`);
      return { success: true };
    }),
});
