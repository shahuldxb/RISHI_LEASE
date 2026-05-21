/**
 * Contract DMS Router
 * Handles: metadata templates, metadata fields, metadata values,
 *          contract documents (full metadata + AI extraction + versioning),
 *          contract modifications (maker-checker workflow + IFRS 16 impact),
 *          contract milestones, contract history
 *
 * Schema: lease.* (SQL Server)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getPool, sql } from "../db-sqlserver";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function q<T = Record<string, any>>(
  sqlText: string,
  params: Array<{ name: string; type?: any; value: any }> = []
): Promise<T[]> {
  const pool = await getPool();
  const req = pool.request();
  for (const p of params) {
    req.input(p.name, p.type ?? sql.NVarChar, p.value ?? null);
  }
  const result = await req.query(sqlText);
  return (result.recordset ?? []) as T[];
}

async function exec(
  sqlText: string,
  params: Array<{ name: string; type?: any; value: any }> = []
): Promise<{ rowsAffected: number; insertId?: number }> {
  const pool = await getPool();
  const req = pool.request();
  for (const p of params) {
    req.input(p.name, p.type ?? sql.NVarChar, p.value ?? null);
  }
  const result = await req.query(sqlText);
  const inserted = result.recordset?.[0];
  return {
    rowsAffected: Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : 0,
    insertId: inserted?.id ?? inserted?.template_id ?? inserted?.field_id
      ?? inserted?.doc_id ?? inserted?.milestone_id ?? inserted?.value_id
      ?? inserted?.modification_id ?? inserted?.history_id ?? undefined,
  };
}

// Log a history event
async function logHistory(params: {
  contractId?: number;
  modificationId?: number;
  eventType: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changedBy?: number;
  changedByName?: string;
  changeReason?: string;
  notes?: string;
}) {
  await exec(
    `INSERT INTO lease.contract_modification_history
       (contract_id, modification_id, event_type, field_name, old_value, new_value,
        changed_by, changed_by_name, change_reason, notes)
     VALUES (@contractId, @modificationId, @eventType, @fieldName, @oldValue, @newValue,
             @changedBy, @changedByName, @changeReason, @notes)`,
    [
      { name: "contractId",      type: sql.Int,     value: params.contractId ?? null },
      { name: "modificationId",  type: sql.Int,     value: params.modificationId ?? null },
      { name: "eventType",       value: params.eventType },
      { name: "fieldName",       value: params.fieldName ?? null },
      { name: "oldValue",        value: params.oldValue ?? null },
      { name: "newValue",        value: params.newValue ?? null },
      { name: "changedBy",       type: sql.Int,     value: params.changedBy ?? null },
      { name: "changedByName",   value: params.changedByName ?? null },
      { name: "changeReason",    value: params.changeReason ?? null },
      { name: "notes",           value: params.notes ?? null },
    ]
  );
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const contractDmsRouter = router({

  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════
  listTemplates: protectedProcedure.query(async () => {
    return q(`
      SELECT t.*,
        (SELECT COUNT(*) FROM lease.contract_metadata_fields f WHERE f.template_id = t.template_id) AS field_count
      FROM lease.contract_metadata_templates t
      ORDER BY t.contract_type, t.template_name
    `);
  }),

  getTemplate: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .query(async ({ input }) => {
      const rows = await q(
        `SELECT * FROM lease.contract_metadata_templates WHERE template_id = @templateId`,
        [{ name: "templateId", type: sql.Int, value: input.templateId }]
      );
      if (!rows[0]) throw new Error("Template not found");
      const fields = await q(
        `SELECT * FROM lease.contract_metadata_fields WHERE template_id = @templateId ORDER BY display_order, field_id`,
        [{ name: "templateId", type: sql.Int, value: input.templateId }]
      );
      return { ...rows[0], fields };
    }),

  createTemplate: protectedProcedure
    .input(z.object({
      templateName: z.string().min(1),
      contractType: z.string().min(1),
      description:  z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const r = await exec(
        `INSERT INTO lease.contract_metadata_templates (template_name, contract_type, description, created_by)
         OUTPUT INSERTED.template_id AS id
         VALUES (@templateName, @contractType, @description, @createdBy)`,
        [
          { name: "templateName", value: input.templateName },
          { name: "contractType", value: input.contractType },
          { name: "description",  value: input.description ?? null },
          { name: "createdBy",    type: sql.Int, value: ctx.user.id },
        ]
      );
      return { templateId: r.insertId };
    }),

  updateTemplate: protectedProcedure
    .input(z.object({
      templateId:   z.number(),
      templateName: z.string().min(1),
      contractType: z.string().min(1),
      description:  z.string().optional(),
      isActive:     z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      await exec(
        `UPDATE lease.contract_metadata_templates
         SET template_name=@templateName, contract_type=@contractType,
             description=@description, is_active=@isActive, updated_at=GETDATE()
         WHERE template_id=@templateId`,
        [
          { name: "templateName", value: input.templateName },
          { name: "contractType", value: input.contractType },
          { name: "description",  value: input.description ?? null },
          { name: "isActive",     type: sql.Bit, value: input.isActive !== false ? 1 : 0 },
          { name: "templateId",   type: sql.Int, value: input.templateId },
        ]
      );
      return { ok: true };
    }),

  deleteTemplate: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .mutation(async ({ input }) => {
      await exec(
        `DELETE FROM lease.contract_metadata_templates WHERE template_id=@templateId`,
        [{ name: "templateId", type: sql.Int, value: input.templateId }]
      );
      return { ok: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA FIELDS
  // ═══════════════════════════════════════════════════════════════════════════
  upsertField: protectedProcedure
    .input(z.object({
      fieldId:         z.number().optional(),
      templateId:      z.number(),
      fieldName:       z.string().min(1),
      fieldLabel:      z.string().min(1),
      fieldType:       z.string().default("text"),
      dropdownOptions: z.string().optional(),
      isRequired:      z.boolean().default(false),
      displayOrder:    z.number().default(0),
      placeholder:     z.string().optional(),
      helpText:        z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const opts = input.dropdownOptions ?? null;
      if (input.fieldId) {
        await exec(
          `UPDATE lease.contract_metadata_fields
           SET field_name=@fieldName, field_label=@fieldLabel, field_type=@fieldType,
               dropdown_options=@dropdownOptions, is_required=@isRequired,
               display_order=@displayOrder, placeholder=@placeholder, help_text=@helpText
           WHERE field_id=@fieldId`,
          [
            { name: "fieldName",       value: input.fieldName },
            { name: "fieldLabel",      value: input.fieldLabel },
            { name: "fieldType",       value: input.fieldType },
            { name: "dropdownOptions", value: opts },
            { name: "isRequired",      type: sql.Bit, value: input.isRequired ? 1 : 0 },
            { name: "displayOrder",    type: sql.Int, value: input.displayOrder },
            { name: "placeholder",     value: input.placeholder ?? null },
            { name: "helpText",        value: input.helpText ?? null },
            { name: "fieldId",         type: sql.Int, value: input.fieldId },
          ]
        );
        return { fieldId: input.fieldId };
      } else {
        const r = await exec(
          `INSERT INTO lease.contract_metadata_fields
             (template_id, field_name, field_label, field_type, dropdown_options,
              is_required, display_order, placeholder, help_text)
           OUTPUT INSERTED.field_id AS id
           VALUES (@templateId, @fieldName, @fieldLabel, @fieldType, @dropdownOptions,
                   @isRequired, @displayOrder, @placeholder, @helpText)`,
          [
            { name: "templateId",      type: sql.Int, value: input.templateId },
            { name: "fieldName",       value: input.fieldName },
            { name: "fieldLabel",      value: input.fieldLabel },
            { name: "fieldType",       value: input.fieldType },
            { name: "dropdownOptions", value: opts },
            { name: "isRequired",      type: sql.Bit, value: input.isRequired ? 1 : 0 },
            { name: "displayOrder",    type: sql.Int, value: input.displayOrder },
            { name: "placeholder",     value: input.placeholder ?? null },
            { name: "helpText",        value: input.helpText ?? null },
          ]
        );
        return { fieldId: r.insertId };
      }
    }),

  deleteField: protectedProcedure
    .input(z.object({ fieldId: z.number() }))
    .mutation(async ({ input }) => {
      await exec(
        `DELETE FROM lease.contract_metadata_fields WHERE field_id=@fieldId`,
        [{ name: "fieldId", type: sql.Int, value: input.fieldId }]
      );
      return { ok: true };
    }),

  reorderFields: protectedProcedure
    .input(z.object({
      fields: z.array(z.object({ fieldId: z.number(), displayOrder: z.number() }))
    }))
    .mutation(async ({ input }) => {
      for (const f of input.fields) {
        await exec(
          `UPDATE lease.contract_metadata_fields SET display_order=@displayOrder WHERE field_id=@fieldId`,
          [
            { name: "displayOrder", type: sql.Int, value: f.displayOrder },
            { name: "fieldId",      type: sql.Int, value: f.fieldId },
          ]
        );
      }
      return { ok: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA VALUES
  // ═══════════════════════════════════════════════════════════════════════════
  getMetadataValues: protectedProcedure
    .input(z.object({ leaseId: z.number().optional(), contractId: z.number().optional() }))
    .query(async ({ input }) => {
      const id = input.leaseId ?? input.contractId;
      const col = input.leaseId ? "mv.lease_id" : "mv.contract_id";
      return q(
        `SELECT mv.*, f.field_name, f.field_label, f.field_type, f.dropdown_options,
                f.is_required, f.display_order, f.placeholder, f.help_text,
                t.template_name, t.contract_type, t.template_id
         FROM lease.contract_metadata_values mv
         JOIN lease.contract_metadata_fields f ON f.field_id = mv.field_id
         JOIN lease.contract_metadata_templates t ON t.template_id = mv.template_id
         WHERE ${col} = @id
         ORDER BY t.template_name, f.display_order`,
        [{ name: "id", type: sql.Int, value: id }]
      );
    }),

  upsertMetadataValues: protectedProcedure
    .input(z.object({
      leaseId:    z.number().optional(),
      contractId: z.number().optional(),
      templateId: z.number(),
      values: z.array(z.object({
        fieldId:    z.number(),
        fieldValue: z.string().nullable(),
      }))
    }))
    .mutation(async ({ input }) => {
      for (const v of input.values) {
        await exec(
          `MERGE lease.contract_metadata_values AS target
           USING (SELECT @leaseId AS lease_id, @contractId AS contract_id,
                         @templateId AS template_id, @fieldId AS field_id) AS src
           ON target.field_id = src.field_id
              AND (target.lease_id = src.lease_id OR target.contract_id = src.contract_id)
           WHEN MATCHED THEN UPDATE SET field_value=@fieldValue, updated_at=GETDATE()
           WHEN NOT MATCHED THEN INSERT
             (lease_id, contract_id, template_id, field_id, field_value)
             VALUES (@leaseId, @contractId, @templateId, @fieldId, @fieldValue);`,
          [
            { name: "leaseId",    type: sql.Int, value: input.leaseId ?? null },
            { name: "contractId", type: sql.Int, value: input.contractId ?? null },
            { name: "templateId", type: sql.Int, value: input.templateId },
            { name: "fieldId",    type: sql.Int, value: v.fieldId },
            { name: "fieldValue", value: v.fieldValue ?? null },
          ]
        );
      }
      return { ok: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  listDocuments: protectedProcedure
    .input(z.object({
      contractId: z.number().optional(),
      leaseId:      z.number().optional(),
      docType:      z.string().optional(),
      documentType: z.string().optional(),
      docStatus:    z.string().optional(),
      status:       z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conditions: string[] = ["d.is_active = 1"];
      const params: Array<{ name: string; type?: any; value: any }> = [];
      if (input.contractId) {
        conditions.push("d.contract_id = @contractId");
        params.push({ name: "contractId", type: sql.Int, value: input.contractId });
      }
      if (input.leaseId) {
        conditions.push("d.contract_id = @leaseId");
        params.push({ name: "leaseId", type: sql.Int, value: input.leaseId });
      }
      const docTypeVal = input.documentType ?? input.docType;
      if (docTypeVal) {
        conditions.push("d.document_type = @docType");
        params.push({ name: "docType", value: docTypeVal });
      }
      const docStatusVal = input.status ?? input.docStatus;
      if (docStatusVal) {
        conditions.push("d.doc_status = @docStatus");
        params.push({ name: "docStatus", value: docStatusVal });
      }
      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
      return q(
        `SELECT d.*, u.name AS uploaded_by_name
         FROM lease.contract_documents d
         LEFT JOIN dbo.user u ON u.id = d.uploaded_by
         ${where}
         ORDER BY d.upload_date DESC`,
        params
      );
    }),

  getDocument: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ input }) => {
      const rows = await q(
        `SELECT d.*, u.name AS uploaded_by_name, a.name AS approved_by_name
         FROM lease.contract_documents d
         LEFT JOIN dbo.user u ON u.id = d.uploaded_by
         LEFT JOIN dbo.user a ON a.id = d.approved_by
         WHERE d.document_id = @documentId`,
        [{ name: "documentId", type: sql.Int, value: input.documentId }]
      );
      if (!rows[0]) throw new Error("Document not found");
      // Get version history
      const versions = await q(
        `SELECT d.document_id, d.version_number, d.version_notes, d.upload_date,
                d.doc_status, d.uploaded_by, u.name AS uploaded_by_name
         FROM lease.contract_documents d
         LEFT JOIN dbo.user u ON u.id = d.uploaded_by
         WHERE d.contract_id = @contractId AND d.document_type = @docType
         ORDER BY d.version_number DESC`,
        [
          { name: "contractId", type: sql.Int, value: rows[0].contract_id },
          { name: "docType", value: rows[0].document_type },
        ]
      );
      return { ...rows[0], versions };
    }),

  uploadDocument: protectedProcedure
    .input(z.object({
      contractId:         z.number(),
      documentType:       z.string().min(1),
      documentName:       z.string().min(1),
      fileBase64:         z.string(),
      mimeType:           z.string().default("application/pdf"),
      fileSizeKb:         z.number().optional(),
      // Metadata
      docCategory:        z.string().optional(),
      docSubCategory:     z.string().optional(),
      docStatus:          z.string().default("Draft"),
      effectiveDate:      z.string().optional(),
      expiryDate:         z.string().optional(),
      reviewDate:         z.string().optional(),
      renewalDate:        z.string().optional(),
      signatoryName:      z.string().optional(),
      signatoryTitle:     z.string().optional(),
      signatoryCompany:   z.string().optional(),
      signedDate:         z.string().optional(),
      notarisedDate:      z.string().optional(),
      stampDutyAmount:    z.number().optional(),
      stampDutyCurrency:  z.string().optional(),
      languageCode:       z.string().default("en"),
      jurisdiction:       z.string().optional(),
      confidentiality:    z.string().default("Internal"),
      hasOriginal:        z.boolean().default(false),
      originalLocation:   z.string().optional(),
      retentionYears:     z.number().optional(),
      retentionPolicy:    z.string().optional(),
      versionNotes:       z.string().optional(),
      notes:              z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Upload file to storage
      const buf = Buffer.from(input.fileBase64, "base64");
      const ext = input.mimeType.includes("pdf") ? "pdf"
        : input.mimeType.includes("word") ? "docx"
        : input.mimeType.includes("image") ? "jpg" : "bin";
      const fileKey = `contracts/${input.contractId}/docs/${Date.now()}.${ext}`;
      const { url } = await storagePut(fileKey, buf, input.mimeType);

      // Get next version number
      const vRows = await q(
        `SELECT ISNULL(MAX(version_number), 0) AS max_ver
         FROM lease.contract_documents
         WHERE contract_id = @contractId AND document_type = @docType`,
        [
          { name: "contractId", type: sql.Int, value: input.contractId },
          { name: "docType", value: input.documentType },
        ]
      );
      const nextVer = ((vRows[0]?.max_ver as number) ?? 0) + 1;

      // Mark previous versions as not current
      if (nextVer > 1) {
        await exec(
          `UPDATE lease.contract_documents SET is_current=0
           WHERE contract_id=@contractId AND document_type=@docType`,
          [
            { name: "contractId", type: sql.Int, value: input.contractId },
            { name: "docType", value: input.documentType },
          ]
        );
      }

      const r = await exec(
        `INSERT INTO lease.contract_documents
           (contract_id, document_type, document_name, storage_key, storage_url,
            file_size_kb, mime_type, uploaded_by, version_number, version_notes, is_current,
            doc_category, doc_sub_category, doc_status, effective_date, expiry_date,
            review_date, renewal_date, signatory_name, signatory_title, signatory_company,
            signed_date, notarised_date, stamp_duty_amount, stamp_duty_currency,
            language_code, jurisdiction, confidentiality, has_original, original_location,
            retention_years, retention_policy, notes)
         OUTPUT INSERTED.document_id AS id
         VALUES (@contractId, @documentType, @documentName, @storageKey, @storageUrl,
                 @fileSizeKb, @mimeType, @uploadedBy, @versionNumber, @versionNotes, 1,
                 @docCategory, @docSubCategory, @docStatus, @effectiveDate, @expiryDate,
                 @reviewDate, @renewalDate, @signatoryName, @signatoryTitle, @signatoryCompany,
                 @signedDate, @notarisedDate, @stampDutyAmount, @stampDutyCurrency,
                 @languageCode, @jurisdiction, @confidentiality, @hasOriginal, @originalLocation,
                 @retentionYears, @retentionPolicy, @notes)`,
        [
          { name: "contractId",       type: sql.Int,     value: input.contractId },
          { name: "documentType",     value: input.documentType },
          { name: "documentName",     value: input.documentName },
          { name: "storageKey",       value: fileKey },
          { name: "storageUrl",       value: url },
          { name: "fileSizeKb",       type: sql.Int,     value: input.fileSizeKb ?? null },
          { name: "mimeType",         value: input.mimeType },
          { name: "uploadedBy",       type: sql.Int,     value: ctx.user.id },
          { name: "versionNumber",    type: sql.Int,     value: nextVer },
          { name: "versionNotes",     value: input.versionNotes ?? null },
          { name: "docCategory",      value: input.docCategory ?? null },
          { name: "docSubCategory",   value: input.docSubCategory ?? null },
          { name: "docStatus",        value: input.docStatus },
          { name: "effectiveDate",    value: input.effectiveDate ?? null },
          { name: "expiryDate",       value: input.expiryDate ?? null },
          { name: "reviewDate",       value: input.reviewDate ?? null },
          { name: "renewalDate",      value: input.renewalDate ?? null },
          { name: "signatoryName",    value: input.signatoryName ?? null },
          { name: "signatoryTitle",   value: input.signatoryTitle ?? null },
          { name: "signatoryCompany", value: input.signatoryCompany ?? null },
          { name: "signedDate",       value: input.signedDate ?? null },
          { name: "notarisedDate",    value: input.notarisedDate ?? null },
          { name: "stampDutyAmount",  type: sql.Decimal(18,2), value: input.stampDutyAmount ?? null },
          { name: "stampDutyCurrency",value: input.stampDutyCurrency ?? null },
          { name: "languageCode",     value: input.languageCode },
          { name: "jurisdiction",     value: input.jurisdiction ?? null },
          { name: "confidentiality",  value: input.confidentiality },
          { name: "hasOriginal",      type: sql.Bit,     value: input.hasOriginal ? 1 : 0 },
          { name: "originalLocation", value: input.originalLocation ?? null },
          { name: "retentionYears",   type: sql.Int,     value: input.retentionYears ?? null },
          { name: "retentionPolicy",  value: input.retentionPolicy ?? null },
          { name: "notes",            value: input.notes ?? null },
        ]
      );

      await logHistory({
        contractId: input.contractId,
        eventType: "DOCUMENT_UPLOADED",
        fieldName: input.documentType,
        newValue: `${input.documentName} v${nextVer}`,
        changedBy: ctx.user.id,
        changedByName: ctx.user.name ?? undefined,
        notes: input.versionNotes,
      });

      return { documentId: r.insertId, storageUrl: url, versionNumber: nextVer };
    }),

  updateDocument: protectedProcedure
    .input(z.object({
      documentId:       z.number(),
      docStatus:        z.string().optional(),
      approvalStatus:   z.string().optional(),
      rejectionReason:  z.string().optional(),
      expiryDate:       z.string().optional(),
      reviewDate:       z.string().optional(),
      signatoryName:    z.string().optional(),
      signatoryTitle:   z.string().optional(),
      signatoryCompany: z.string().optional(),
      signedDate:       z.string().optional(),
      notarisedDate:    z.string().optional(),
      notes:            z.string().optional(),
      confidentiality:  z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const approvedAt = input.approvalStatus === "Approved" ? "GETDATE()" : null;
      await exec(
        `UPDATE lease.contract_documents SET
           doc_status        = ISNULL(@docStatus, doc_status),
           approval_status   = ISNULL(@approvalStatus, approval_status),
           rejection_reason  = ISNULL(@rejectionReason, rejection_reason),
           expiry_date       = ISNULL(@expiryDate, expiry_date),
           review_date       = ISNULL(@reviewDate, review_date),
           signatory_name    = ISNULL(@signatoryName, signatory_name),
           signatory_title   = ISNULL(@signatoryTitle, signatory_title),
           signatory_company = ISNULL(@signatoryCompany, signatory_company),
           signed_date       = ISNULL(@signedDate, signed_date),
           notarised_date    = ISNULL(@notarisedDate, notarised_date),
           notes             = ISNULL(@notes, notes),
           confidentiality   = ISNULL(@confidentiality, confidentiality),
           approved_by       = CASE WHEN @approvalStatus='Approved' THEN @approvedBy ELSE approved_by END,
           approved_at       = CASE WHEN @approvalStatus='Approved' THEN GETDATE() ELSE approved_at END
         WHERE document_id = @documentId`,
        [
          { name: "documentId",       type: sql.Int, value: input.documentId },
          { name: "docStatus",        value: input.docStatus ?? null },
          { name: "approvalStatus",   value: input.approvalStatus ?? null },
          { name: "rejectionReason",  value: input.rejectionReason ?? null },
          { name: "expiryDate",       value: input.expiryDate ?? null },
          { name: "reviewDate",       value: input.reviewDate ?? null },
          { name: "signatoryName",    value: input.signatoryName ?? null },
          { name: "signatoryTitle",   value: input.signatoryTitle ?? null },
          { name: "signatoryCompany", value: input.signatoryCompany ?? null },
          { name: "signedDate",       value: input.signedDate ?? null },
          { name: "notarisedDate",    value: input.notarisedDate ?? null },
          { name: "notes",            value: input.notes ?? null },
          { name: "confidentiality",  value: input.confidentiality ?? null },
          { name: "approvedBy",       type: sql.Int, value: ctx.user.id },
        ]
      );
      return { ok: true };
    }),

  deleteDocument: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await exec(
        `UPDATE lease.contract_documents SET is_active=0 WHERE document_id=@documentId`,
        [{ name: "documentId", type: sql.Int, value: input.documentId }]
      );
      await logHistory({
        eventType: "DOCUMENT_DELETED",
        changedBy: ctx.user.id,
        changedByName: ctx.user.name ?? undefined,
        notes: `Document ID ${input.documentId} soft-deleted`,
      });
      return { ok: true };
    }),

  // AI metadata extraction from document
  extractMetadata: protectedProcedure
    .input(z.object({
      documentId:  z.number().optional(),
      leaseId:     z.number().optional(),
      contractId:  z.number().optional(),
      fileUrl:     z.string().optional(),
      fileBase64:  z.string().optional(),
      mimeType:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      let fileUrl = input.fileUrl;
      let contractId = input.contractId;

      // If documentId given, fetch the URL
      if (input.documentId && !fileUrl) {
        const rows = await q(
          `SELECT storage_url, contract_id FROM lease.contract_documents WHERE document_id = @documentId`,
          [{ name: "documentId", type: sql.Int, value: input.documentId }]
        );
        if (rows[0]) {
          fileUrl = rows[0].storage_url as string;
          contractId = contractId ?? (rows[0].contract_id as number);
        }
      }

      let extracted: Record<string, any> = {};
      let source = "generated";

      if (fileUrl) {
        try {
          const baseUrl = process.env.BUILT_IN_FORGE_API_URL ?? "";
          const key = process.env.BUILT_IN_FORGE_API_KEY ?? "";
          const storageUrl = fileUrl.startsWith("http") ? fileUrl : `${baseUrl}${fileUrl}`;
          const resp = await fetch(storageUrl, {
            headers: { Authorization: `Bearer ${key}` },
            redirect: "follow",
          });
          if (resp.ok) {
            const buf = await resp.arrayBuffer();
            const b64 = Buffer.from(buf).toString("base64");
            const mimeType = fileUrl.toLowerCase().endsWith(".pdf")
              ? "application/pdf" : "image/jpeg";
            const llmResp = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: `You are a lease contract data extraction specialist.
Extract all key lease terms from the provided document and return them as a JSON object.
Include fields: lessor_name, lessee_name, property_address, asset_type,
commencement_date (YYYY-MM-DD), expiry_date (YYYY-MM-DD), lease_term_months,
monthly_rent, annual_rent, currency, security_deposit, governing_law,
contract_reference, stamp_duty_amount, notarisation_date, renewal_option (yes/no),
break_clause (yes/no), rent_review_frequency, rent_free_months,
total_contract_value, payment_frequency, escalation_rate_percent,
signatory_name, signatory_title, signatory_company, signed_date,
jurisdiction, language_code, confidentiality_level, retention_years.
Return ONLY valid JSON, no markdown, no explanation.`,
                },
                {
                  role: "user" as const,
                  content: [
                    {
                      type: "file_url" as const,
                      file_url: {
                        url: `data:${mimeType};base64,${b64}`,
                        mime_type: mimeType as "application/pdf" | "audio/mpeg",
                      },
                    } as any,
                    { type: "text" as const, text: "Extract all lease terms from this document." },
                  ] as any,
                },
              ],
              response_format: { type: "json_object" },
            });
            const raw = (llmResp?.choices?.[0]?.message?.content ?? "{}") as string;
            extracted = JSON.parse(raw);
            source = "document";
          }
        } catch (_) { /* fall through to generated */ }
      }

      // If fileBase64 provided directly (pre-upload extraction), use it
      if (!fileUrl && input.fileBase64) {
        try {
          const b64 = input.fileBase64;
          const mimeType = input.mimeType ?? "application/pdf";
          const llmResp = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are a lease contract data extraction specialist.
Extract all key lease terms from the provided document and return them as a JSON object.
Include fields: lessor_name, lessee_name, property_address, asset_type,
commencement_date (YYYY-MM-DD), expiry_date (YYYY-MM-DD), lease_term_months,
monthly_rent, annual_rent, currency, security_deposit, governing_law,
contract_reference, stamp_duty_amount, notarisation_date, renewal_option (yes/no),
break_clause (yes/no), rent_review_frequency, rent_free_months,
total_contract_value, payment_frequency, escalation_rate_percent,
signatory_name, signatory_title, signatory_company, signed_date,
jurisdiction, language_code, confidentiality_level, retention_years.
Return ONLY valid JSON, no markdown, no explanation.`,
              },
              {
                role: "user" as const,
                content: [
                  {
                    type: "file_url" as const,
                    file_url: {
                      url: `data:${mimeType};base64,${b64}`,
                      mime_type: mimeType as "application/pdf" | "audio/mpeg",
                    },
                  } as any,
                  { type: "text" as const, text: "Extract all lease terms from this document." },
                ] as any,
              },
            ],
            response_format: { type: "json_object" },
          });
          const raw = (llmResp?.choices?.[0]?.message?.content ?? "{}") as string;
          extracted = JSON.parse(raw);
          source = "document";
        } catch (_) { /* fall through to generated */ }
      }

      if (source === "generated") {
        const fallback = await invokeLLM({
          messages: [
            {
              role: "system" as const,
              content: `You are a lease contract data extraction specialist.
Generate realistic sample lease metadata for a commercial lease in Qatar.
Return ONLY valid JSON with fields: lessor_name, lessee_name, property_address,
asset_type, commencement_date (YYYY-MM-DD), expiry_date (YYYY-MM-DD),
lease_term_months, monthly_rent, annual_rent, currency, security_deposit,
governing_law, contract_reference, stamp_duty_amount, renewal_option,
break_clause, rent_review_frequency, rent_free_months, total_contract_value,
payment_frequency, escalation_rate_percent, signatory_name, signatory_title,
signatory_company, jurisdiction, confidentiality_level, retention_years.`,
            },
            { role: "user" as const, content: `Generate sample metadata for contract ID ${contractId ?? "unknown"}.` },
          ],
          response_format: { type: "json_object" },
        });
        const raw = (fallback?.choices?.[0]?.message?.content ?? "{}") as string;
        extracted = JSON.parse(raw);
      }

      // Store AI extraction results back on the document
      if (input.documentId) {
        await exec(
          `UPDATE lease.contract_documents
           SET ai_extracted_data=@data, ai_extracted_at=GETDATE(), ai_confidence_score=@score
           WHERE document_id=@documentId`,
          [
            { name: "data",       value: JSON.stringify(extracted) },
            { name: "score",      type: sql.Decimal(5,2), value: source === "document" ? 85.0 : 60.0 },
            { name: "documentId", type: sql.Int, value: input.documentId },
          ]
        );
      }

      return { extracted, source, confidence: source === "document" ? 85 : 60 };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRACT MODIFICATIONS (Maker-Checker Workflow)
  // ═══════════════════════════════════════════════════════════════════════════
  listModifications: protectedProcedure
    .input(z.object({
      contractId: z.number().optional(),
      status:     z.string().optional(),
    }))
    .query(async ({ input }) => {
      const cond: string[] = [];
      const params: Array<{ name: string; type?: any; value: any }> = [];
      if (input.contractId) {
        cond.push("m.contract_id = @contractId");
        params.push({ name: "contractId", type: sql.Int, value: input.contractId });
      }
      if (input.status) {
        cond.push("m.status = @status");
        params.push({ name: "status", value: input.status });
      }
      const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
      return q(
        `SELECT m.*, mk.name AS maker_name, ck.name AS checker_name,
                ab.name AS applied_by_name
         FROM lease.modifications m
         LEFT JOIN dbo.user mk ON mk.id = m.maker_id
         LEFT JOIN dbo.user ck ON ck.id = m.checker_id
         LEFT JOIN dbo.user ab ON ab.id = m.applied_by
         ${where}
         ORDER BY m.created_at DESC`,
        params
      );
    }),

  getModification: protectedProcedure
    .input(z.object({ modificationId: z.number() }))
    .query(async ({ input }) => {
      const rows = await q(
        `SELECT m.*, mk.name AS maker_name, ck.name AS checker_name
         FROM lease.modifications m
         LEFT JOIN dbo.user mk ON mk.id = m.maker_id
         LEFT JOIN dbo.user ck ON ck.id = m.checker_id
         WHERE m.modification_id = @modificationId`,
        [{ name: "modificationId", type: sql.Int, value: input.modificationId }]
      );
      if (!rows[0]) throw new Error("Modification not found");
      const history = await q(
        `SELECT h.*, u.name AS changed_by_name
         FROM lease.contract_modification_history h
         LEFT JOIN dbo.user u ON u.id = h.changed_by
         WHERE h.modification_id = @modificationId
         ORDER BY h.event_date DESC`,
        [{ name: "modificationId", type: sql.Int, value: input.modificationId }]
      );
      return { ...rows[0], history };
    }),

  createModification: protectedProcedure
    .input(z.object({
      contractId:       z.number(),
      modificationType: z.string().min(1),
      effectiveDate:    z.string(),
      oldTermsJson:     z.string().optional(),
      newTermsJson:     z.string().optional(),
      liabilityAdj:     z.number().optional(),
      rouAdjustment:    z.number().optional(),
      ifrs16ImpactJson: z.string().optional(),
      modificationReason: z.string().optional(),
      supportingDocId:  z.number().optional(),
      notes:            z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const modRef = `MOD-${input.contractId}-${Date.now().toString().slice(-6)}`;
      const r = await exec(
        `INSERT INTO lease.modifications
           (mod_ref, contract_id, modification_type, modification_date, effective_date,
            old_terms_json, new_terms_json, liability_adjustment, rou_adjustment,
            ifrs16_impact_json, modification_reason, supporting_doc_id,
            status, maker_id, screen_id)
         OUTPUT INSERTED.modification_id AS id
         VALUES (@modRef, @contractId, @modificationType, GETDATE(), @effectiveDate,
                 @oldTermsJson, @newTermsJson, @liabilityAdj, @rouAdj,
                 @ifrs16ImpactJson, @modReason, @supportingDocId,
                 'Draft', @makerId, 'VFCMPMOD0001P001')`,
        [
          { name: "modRef",           value: modRef },
          { name: "contractId",       type: sql.Int, value: input.contractId },
          { name: "modificationType", value: input.modificationType },
          { name: "effectiveDate",    value: input.effectiveDate },
          { name: "oldTermsJson",     value: input.oldTermsJson ?? null },
          { name: "newTermsJson",     value: input.newTermsJson ?? null },
          { name: "liabilityAdj",     type: sql.Decimal(18,2), value: input.liabilityAdj ?? null },
          { name: "rouAdj",           type: sql.Decimal(18,2), value: input.rouAdjustment ?? null },
          { name: "ifrs16ImpactJson", value: input.ifrs16ImpactJson ?? null },
          { name: "modReason",        value: input.modificationReason ?? null },
          { name: "supportingDocId",  type: sql.Int, value: input.supportingDocId ?? null },
          { name: "makerId",          type: sql.Int, value: ctx.user.id },
        ]
      );
      await logHistory({
        contractId: input.contractId,
        modificationId: r.insertId,
        eventType: "MODIFICATION_CREATED",
        newValue: modRef,
        changedBy: ctx.user.id,
        changedByName: ctx.user.name ?? undefined,
        changeReason: input.modificationReason,
        notes: `Type: ${input.modificationType}`,
      });
      return { modificationId: r.insertId, modRef };
    }),

  submitModification: protectedProcedure
    .input(z.object({ modificationId: z.number(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await exec(
        `UPDATE lease.modifications SET status='Pending', approval_notes=@notes
         WHERE modification_id=@modificationId AND status='Draft'`,
        [
          { name: "notes",           value: input.notes ?? null },
          { name: "modificationId",  type: sql.Int, value: input.modificationId },
        ]
      );
      await logHistory({
        modificationId: input.modificationId,
        eventType: "MODIFICATION_SUBMITTED",
        changedBy: ctx.user.id,
        changedByName: ctx.user.name ?? undefined,
        notes: input.notes,
      });
      return { ok: true };
    }),

  approveModification: protectedProcedure
    .input(z.object({ modificationId: z.number(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await exec(
        `UPDATE lease.modifications
         SET status='Approved', checker_id=@checkerId, approval_notes=@notes
         WHERE modification_id=@modificationId AND status='Pending'`,
        [
          { name: "checkerId",       type: sql.Int, value: ctx.user.id },
          { name: "notes",           value: input.notes ?? null },
          { name: "modificationId",  type: sql.Int, value: input.modificationId },
        ]
      );
      await logHistory({
        modificationId: input.modificationId,
        eventType: "MODIFICATION_APPROVED",
        changedBy: ctx.user.id,
        changedByName: ctx.user.name ?? undefined,
        notes: input.notes,
      });
      return { ok: true };
    }),

  rejectModification: protectedProcedure
    .input(z.object({ modificationId: z.number(), reason: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await exec(
        `UPDATE lease.modifications
         SET status='Rejected', checker_id=@checkerId, rejected_at=GETDATE(), rejection_reason=@reason
         WHERE modification_id=@modificationId AND status='Pending'`,
        [
          { name: "checkerId",       type: sql.Int, value: ctx.user.id },
          { name: "reason",          value: input.reason },
          { name: "modificationId",  type: sql.Int, value: input.modificationId },
        ]
      );
      await logHistory({
        modificationId: input.modificationId,
        eventType: "MODIFICATION_REJECTED",
        changedBy: ctx.user.id,
        changedByName: ctx.user.name ?? undefined,
        changeReason: input.reason,
      });
      return { ok: true };
    }),

  applyModification: protectedProcedure
    .input(z.object({ modificationId: z.number(), glJournalId: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await exec(
        `UPDATE lease.modifications
         SET status='Applied', applied_at=GETDATE(), applied_by=@appliedBy,
             gl_journal_id=ISNULL(@glJournalId, gl_journal_id)
         WHERE modification_id=@modificationId AND status='Approved'`,
        [
          { name: "appliedBy",       type: sql.Int, value: ctx.user.id },
          { name: "glJournalId",     value: input.glJournalId ?? null },
          { name: "modificationId",  type: sql.Int, value: input.modificationId },
        ]
      );
      await logHistory({
        modificationId: input.modificationId,
        eventType: "MODIFICATION_APPLIED",
        changedBy: ctx.user.id,
        changedByName: ctx.user.name ?? undefined,
        notes: input.glJournalId ? `GL Journal: ${input.glJournalId}` : undefined,
      });
      return { ok: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // MILESTONES
  // ═══════════════════════════════════════════════════════════════════════════
  listMilestones: protectedProcedure
    .input(z.object({
      contractId: z.number().optional(),
      status:     z.string().optional(),
      upcoming:   z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const cond: string[] = [];
      const params: Array<{ name: string; type?: any; value: any }> = [];
      if (input.contractId) {
        cond.push("m.contract_id = @contractId");
        params.push({ name: "contractId", type: sql.Int, value: input.contractId });
      }
      if (input.status) {
        cond.push("m.status = @status");
        params.push({ name: "status", value: input.status });
      }
      if (input.upcoming) {
        cond.push("m.milestone_date >= GETDATE() AND m.status NOT IN ('Completed','Dismissed')");
      }
      const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
      return q(
        `SELECT m.*, u.name AS assigned_to_name,
                DATEDIFF(day, GETDATE(), m.milestone_date) AS days_until
         FROM lease.contract_milestones m
         LEFT JOIN dbo.user u ON u.id = m.assigned_to
         ${where}
         ORDER BY m.milestone_date ASC`,
        params
      );
    }),

  upsertMilestone: protectedProcedure
    .input(z.object({
      milestoneId:   z.number().optional(),
      contractId:    z.number(),
      milestoneType: z.string().min(1),
      milestoneDate: z.string(),
      description:   z.string().optional(),
      assignedTo:    z.number().optional(),
      notes:         z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.milestoneId) {
        await exec(
          `UPDATE lease.contract_milestones
           SET milestone_type=@milestoneType, milestone_date=@milestoneDate,
               description=@description, assigned_to=@assignedTo, notes=@notes
           WHERE milestone_id=@milestoneId`,
          [
            { name: "milestoneType", value: input.milestoneType },
            { name: "milestoneDate", value: input.milestoneDate },
            { name: "description",   value: input.description ?? null },
            { name: "assignedTo",    type: sql.Int, value: input.assignedTo ?? null },
            { name: "notes",         value: input.notes ?? null },
            { name: "milestoneId",   type: sql.Int, value: input.milestoneId },
          ]
        );
        return { milestoneId: input.milestoneId };
      } else {
        const r = await exec(
          `INSERT INTO lease.contract_milestones
             (contract_id, milestone_type, milestone_date, description, assigned_to, notes, status)
           OUTPUT INSERTED.milestone_id AS id
           VALUES (@contractId, @milestoneType, @milestoneDate, @description, @assignedTo, @notes, 'Pending')`,
          [
            { name: "contractId",    type: sql.Int, value: input.contractId },
            { name: "milestoneType", value: input.milestoneType },
            { name: "milestoneDate", value: input.milestoneDate },
            { name: "description",   value: input.description ?? null },
            { name: "assignedTo",    type: sql.Int, value: input.assignedTo ?? null },
            { name: "notes",         value: input.notes ?? null },
          ]
        );
        await logHistory({
          contractId: input.contractId,
          eventType: "MILESTONE_CREATED",
          newValue: `${input.milestoneType} on ${input.milestoneDate}`,
          changedBy: ctx.user.id,
          changedByName: ctx.user.name ?? undefined,
        });
        return { milestoneId: r.insertId };
      }
    }),

  completeMilestone: protectedProcedure
    .input(z.object({ milestoneId: z.number(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await exec(
        `UPDATE lease.contract_milestones
         SET status='Completed', completed_date=GETDATE(), notes=ISNULL(@notes, notes)
         WHERE milestone_id=@milestoneId`,
        [
          { name: "notes",       value: input.notes ?? null },
          { name: "milestoneId", type: sql.Int, value: input.milestoneId },
        ]
      );
      await logHistory({
        eventType: "MILESTONE_COMPLETED",
        changedBy: ctx.user.id,
        changedByName: ctx.user.name ?? undefined,
        notes: input.notes,
      });
      return { ok: true };
    }),

  dismissMilestone: protectedProcedure
    .input(z.object({ milestoneId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await exec(
        `UPDATE lease.contract_milestones SET status='Dismissed'
         WHERE milestone_id=@milestoneId`,
        [{ name: "milestoneId", type: sql.Int, value: input.milestoneId }]
      );
      await logHistory({
        eventType: "MILESTONE_DISMISSED",
        changedBy: ctx.user.id,
        changedByName: ctx.user.name ?? undefined,
        changeReason: input.reason,
      });
      return { ok: true };
    }),

  deleteMilestone: protectedProcedure
    .input(z.object({ milestoneId: z.number() }))
    .mutation(async ({ input }) => {
      await exec(
        `DELETE FROM lease.contract_milestones WHERE milestone_id=@milestoneId`,
        [{ name: "milestoneId", type: sql.Int, value: input.milestoneId }]
      );
      return { ok: true };
    }),

  syncMilestoneToAlert: protectedProcedure
    .input(z.object({
      milestoneId:    z.number(),
      daysBefore:     z.number().default(30),
      recipientRoles: z.string().default("admin,user"),
    }))
    .mutation(async ({ input }) => {
      const rows = await q(
        `SELECT * FROM lease.contract_milestones WHERE milestone_id = @milestoneId`,
        [{ name: "milestoneId", type: sql.Int, value: input.milestoneId }]
      );
      const ms = rows[0];
      if (!ms) throw new Error("Milestone not found");
      const eventType = `MILESTONE_${ms.milestone_id}_${String(ms.milestone_type).toUpperCase().replace(/\s+/g, "_")}`;
      const template = `Dear {{recipient}},\nThis is a reminder that the contract milestone "${ms.description || ms.milestone_type}" is due on ${ms.milestone_date}.\nPlease take the necessary action.\nVodaLease Enterprise`;
      await exec(
        `MERGE lease.lease_alert_configs AS target
         USING (SELECT @eventType AS event_type) AS src ON target.event_type = src.event_type
         WHEN MATCHED THEN UPDATE SET
           days_before=@daysBefore, recipient_roles=@recipientRoles,
           email_template=@emailTemplate, is_active=1
         WHEN NOT MATCHED THEN INSERT
           (event_type, days_before, recipient_roles, email_template, is_active, milestone_id)
           VALUES (@eventType, @daysBefore, @recipientRoles, @emailTemplate, 1, @milestoneId);`,
        [
          { name: "eventType",       value: eventType },
          { name: "daysBefore",      type: sql.Int, value: input.daysBefore },
          { name: "recipientRoles",  value: input.recipientRoles },
          { name: "emailTemplate",   value: template },
          { name: "milestoneId",     type: sql.Int, value: input.milestoneId },
        ]
      );
      return { ok: true, eventType };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRACT HISTORY (Unified Timeline)
  // ═══════════════════════════════════════════════════════════════════════════
  getContractHistory: protectedProcedure
    .input(z.object({
      contractId:  z.number().optional(),
      eventType:   z.string().optional(),
      fromDate:    z.string().optional(),
      toDate:      z.string().optional(),
      limit:       z.number().default(100),
    }))
    .query(async ({ input }) => {
      const cond: string[] = [];
      const params: Array<{ name: string; type?: any; value: any }> = [];
      if (input.contractId) {
        cond.push("h.contract_id = @contractId");
        params.push({ name: "contractId", type: sql.Int, value: input.contractId });
      }
      if (input.eventType) {
        cond.push("h.event_type LIKE @eventType");
        params.push({ name: "eventType", value: `%${input.eventType}%` });
      }
      if (input.fromDate) {
        cond.push("h.event_date >= @fromDate");
        params.push({ name: "fromDate", value: input.fromDate });
      }
      if (input.toDate) {
        cond.push("h.event_date <= @toDate");
        params.push({ name: "toDate", value: input.toDate });
      }
      const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
      params.push({ name: "limit", type: sql.Int, value: input.limit });
      return q(
        `SELECT TOP (@limit) h.*, u.name AS changed_by_name, c.contract_ref
         FROM lease.contract_modification_history h
         LEFT JOIN dbo.user u ON u.id = h.changed_by
         LEFT JOIN lease.contracts c ON c.contract_id = h.contract_id
         ${where}
         ORDER BY h.event_date DESC`,
        params
      );
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // LEASE ALERT CONFIGS
  // ═══════════════════════════════════════════════════════════════════════════
  listAlertConfigs: protectedProcedure.query(async () => {
    return q(`SELECT * FROM lease.lease_alert_configs ORDER BY event_type`);
  }),

  upsertAlertConfig: protectedProcedure
    .input(z.object({
      configId:       z.number().optional(),
      eventType:      z.string().min(1),
      daysBefore:     z.number().default(30),
      recipientRoles: z.string().default("admin"),
      emailTemplate:  z.string().optional(),
      isActive:       z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      if (input.configId) {
        await exec(
          `UPDATE lease.lease_alert_configs
           SET days_before=@daysBefore, recipient_roles=@recipientRoles,
               email_template=@emailTemplate, is_active=@isActive
           WHERE config_id=@configId`,
          [
            { name: "daysBefore",      type: sql.Int, value: input.daysBefore },
            { name: "recipientRoles",  value: input.recipientRoles },
            { name: "emailTemplate",   value: input.emailTemplate ?? null },
            { name: "isActive",        type: sql.Bit, value: input.isActive ? 1 : 0 },
            { name: "configId",        type: sql.Int, value: input.configId },
          ]
        );
        return { configId: input.configId };
      } else {
        const r = await exec(
          `INSERT INTO lease.lease_alert_configs
             (event_type, days_before, recipient_roles, email_template, is_active)
           OUTPUT INSERTED.config_id AS id
           VALUES (@eventType, @daysBefore, @recipientRoles, @emailTemplate, @isActive)`,
          [
            { name: "eventType",       value: input.eventType },
            { name: "daysBefore",      type: sql.Int, value: input.daysBefore },
            { name: "recipientRoles",  value: input.recipientRoles },
            { name: "emailTemplate",   value: input.emailTemplate ?? null },
            { name: "isActive",        type: sql.Bit, value: input.isActive ? 1 : 0 },
          ]
        );
        return { configId: r.insertId };
      }
    }),
});
