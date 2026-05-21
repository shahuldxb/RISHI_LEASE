/**
 * Bulk Import Router — Server-side Excel parsing and import for:
 * 1. Lease Register
 * 2. Amortisation Schedule
 * 3. IBR Rates
 * 4. Invoices
 * 5. Lessor Contacts
 *
 * Also: Mass Remeasurement, Operation Log, Template Generation
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getPool, sql } from "../db-sqlserver";
import * as XLSX from "xlsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseExcelBase64(base64: string): XLSX.WorkSheet {
  const buf = Buffer.from(base64, "base64");
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  return wb.Sheets[sheetName];
}

function sheetToRows(sheet: XLSX.WorkSheet): Record<string, any>[] {
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

function fmtDate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Try DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function toNum(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

interface ImportResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
}

// ─── Stored Procedure: Log Bulk Operation ─────────────────────────────────────

async function logOperation(
  pool: any,
  opType: string,
  params: string,
  userId: number
): Promise<number> {
  const req = pool.request();
  req.input("op_type", sql.NVarChar(100), opType);
  req.input("params", sql.NVarChar(4000), params);
  req.input("user_id", sql.Int, userId);
  const r = await req.query(`
    INSERT INTO lease.bulk_operation_log (operation_type, parameters, status, initiated_by, started_at)
    OUTPUT INSERTED.bulk_op_id
    VALUES (@op_type, @params, 'RUNNING', @user_id, GETUTCDATE())
  `);
  return r.recordset[0]?.bulk_op_id;
}

async function completeOperation(
  pool: any,
  bulkOpId: number,
  total: number,
  success: number,
  errors: number,
  errorDetails?: string
): Promise<void> {
  const req = pool.request();
  req.input("id", sql.Int, bulkOpId);
  req.input("total", sql.Int, total);
  req.input("success", sql.Int, success);
  req.input("errors", sql.Int, errors);
  req.input("details", sql.NVarChar(sql.MAX), errorDetails || null);
  req.input("status", sql.NVarChar(50), errors > 0 && success > 0 ? "PARTIAL" : errors === 0 ? "COMPLETED" : "FAILED");
  await req.query(`
    UPDATE lease.bulk_operation_log
    SET status=@status, total_records=@total, success_count=@success, error_count=@errors,
        error_details=@details, completed_at=GETUTCDATE()
    WHERE bulk_op_id=@id
  `);
}

// ─── Import: Lease Register ───────────────────────────────────────────────────

async function importLeaseRegister(rows: Record<string, any>[], userId: number): Promise<ImportResult> {
  const pool = await getPool();
  const result: ImportResult = { totalRows: rows.length, successCount: 0, errorCount: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // Excel row (header is row 1)
    try {
      // Validate required fields
      const lessorName = r["Lessor Name"] || r["lessor_name"];
      const assetDesc = r["Asset Description"] || r["asset_description"];
      const commDate = fmtDate(r["Commencement Date"] || r["commencement_date"]);
      const expDate = fmtDate(r["Expiry Date"] || r["expiry_date"]);
      const monthlyPmt = toNum(r["Monthly Payment"] || r["monthly_payment"]);
      const ibr = toNum(r["IBR (%)"] || r["ibr"] || r["ibr_rate"]);
      const currency = r["Currency"] || r["currency"] || "QAR";
      const assetType = r["Asset Type"] || r["asset_type"] || "Property";
      const termMonths = toNum(r["Term (Months)"] || r["term_months"]);

      if (!lessorName) throw new Error("Missing Lessor Name");
      if (!commDate) throw new Error("Invalid Commencement Date");
      if (!expDate) throw new Error("Invalid Expiry Date");
      if (!monthlyPmt || monthlyPmt <= 0) throw new Error("Invalid Monthly Payment");
      if (!ibr || ibr <= 0) throw new Error("Invalid IBR rate");

      // Resolve or create lessor
      const lessorReq = pool.request();
      lessorReq.input("name", sql.NVarChar(200), lessorName);
      const lessorRes = await lessorReq.query(`
        SELECT lessor_id FROM lease.lessors WHERE legal_name = @name
      `);
      let lessorId: number;
      if (lessorRes.recordset.length > 0) {
        lessorId = lessorRes.recordset[0].lessor_id;
      } else {
        const createReq = pool.request();
        createReq.input("name", sql.NVarChar(200), lessorName);
        createReq.input("user_id", sql.Int, userId);
        const cr = await createReq.query(`
          INSERT INTO lease.lessors (lessor_ref, legal_name, country, currency, status, created_by, created_at)
          OUTPUT INSERTED.lessor_id
          VALUES (CONCAT('LSR-', FORMAT(GETDATE(),'yyyyMMdd'), '-', RIGHT('000'+CAST(NEXT VALUE FOR lease.seq_lessor_ref AS VARCHAR),3)), @name, 'QA', 'QAR', 'Active', @user_id, GETUTCDATE())
        `);
        lessorId = cr.recordset[0]?.lessor_id;
      }

      // Calculate term if not provided
      const calcTerm = termMonths || Math.round((new Date(expDate).getTime() - new Date(commDate).getTime()) / (30.44 * 24 * 3600 * 1000));

      // Calculate IFRS 16 values
      const monthlyRate = (ibr / 100) / 12;
      const n = calcTerm;
      const leaseLiability = monthlyRate > 0
        ? monthlyPmt * (1 - Math.pow(1 + monthlyRate, -n)) / monthlyRate
        : monthlyPmt * n;
      const idc = toNum(r["Initial Direct Costs"] || r["initial_direct_costs"]) || 0;
      const incentives = toNum(r["Lease Incentives"] || r["lease_incentives"]) || 0;
      const rouAsset = leaseLiability + idc - incentives;

      // Insert contract
      const insReq = pool.request();
      insReq.input("lessor_id", sql.Int, lessorId);
      insReq.input("asset_type", sql.VarChar(50), assetType);
      insReq.input("asset_desc", sql.NVarChar(500), assetDesc || "Imported Lease");
      insReq.input("comm_date", sql.Date, new Date(commDate));
      insReq.input("exp_date", sql.Date, new Date(expDate));
      insReq.input("term", sql.Int, calcTerm);
      insReq.input("monthly_pmt", sql.Decimal(18, 2), monthlyPmt);
      insReq.input("currency", sql.Char(3), currency);
      insReq.input("ibr", sql.Decimal(8, 4), ibr);
      insReq.input("rou", sql.Decimal(18, 2), rouAsset);
      insReq.input("liability", sql.Decimal(18, 2), leaseLiability);
      insReq.input("idc", sql.Decimal(18, 2), idc);
      insReq.input("incentives", sql.Decimal(18, 2), incentives);
      insReq.input("user_id", sql.Int, userId);
      await insReq.query(`
        INSERT INTO lease.contracts (
          contract_ref, lessor_id, asset_type, asset_description, commencement_date, expiry_date,
          term_months, monthly_payment, currency, ibr, rou_asset_value, lease_liability_commence,
          initial_direct_costs, lease_incentives, status, lifecycle_status, created_at
        ) VALUES (
          CONCAT('LSE-', FORMAT(GETDATE(),'yyyy'), '-', RIGHT('000000'+CAST(NEXT VALUE FOR lease.seq_contract_ref AS VARCHAR),6)),
          @lessor_id, @asset_type, @asset_desc, @comm_date, @exp_date,
          @term, @monthly_pmt, @currency, @ibr, @rou, @liability,
          @idc, @incentives, 'Active', 'Active', GETUTCDATE()
        )
      `);
      result.successCount++;
    } catch (err: any) {
      result.errorCount++;
      result.errors.push({ row: rowNum, message: err.message || "Unknown error" });
    }
  }
  return result;
}

// ─── Import: IBR Rates ────────────────────────────────────────────────────────

async function importIBRRates(rows: Record<string, any>[], userId: number): Promise<ImportResult> {
  const pool = await getPool();
  const result: ImportResult = { totalRows: rows.length, successCount: 0, errorCount: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;
    try {
      const currency = r["Currency"] || r["currency"] || "QAR";
      const termMin = toNum(r["Term Min (Months)"] || r["lease_term_min"]);
      const termMax = toNum(r["Term Max (Months)"] || r["lease_term_max"]);
      const rate = toNum(r["Rate (%)"] || r["rate_pct"] || r["ibr_rate"]);
      const effFrom = fmtDate(r["Effective From"] || r["effective_from"]);
      const source = r["Source"] || r["source"] || "Bulk Import";

      if (!rate || rate <= 0) throw new Error("Invalid Rate");
      if (termMin == null) throw new Error("Missing Term Min");
      if (termMax == null) throw new Error("Missing Term Max");
      if (!effFrom) throw new Error("Invalid Effective From date");

      const req = pool.request();
      req.input("currency", sql.Char(3), currency);
      req.input("term_min", sql.Int, termMin);
      req.input("term_max", sql.Int, termMax);
      req.input("rate", sql.Decimal(8, 4), rate);
      req.input("eff_from", sql.Date, new Date(effFrom));
      req.input("eff_to", sql.Date, r["Effective To"] || r["effective_to"] ? new Date(fmtDate(r["Effective To"] || r["effective_to"])!) : null);
      req.input("source", sql.NVarChar(200), source);
      req.input("user_id", sql.Int, userId);
      await req.query(`
        INSERT INTO lease.ibr_rates (currency, lease_term_min, lease_term_max, rate_pct, effective_from, effective_to, source, created_by, created_at, is_active)
        VALUES (@currency, @term_min, @term_max, @rate, @eff_from, @eff_to, @source, @user_id, GETUTCDATE(), 1)
      `);
      result.successCount++;
    } catch (err: any) {
      result.errorCount++;
      result.errors.push({ row: rowNum, message: err.message || "Unknown error" });
    }
  }
  return result;
}

// ─── Import: Invoices ─────────────────────────────────────────────────────────

async function importInvoices(rows: Record<string, any>[], userId: number): Promise<ImportResult> {
  const pool = await getPool();
  const result: ImportResult = { totalRows: rows.length, successCount: 0, errorCount: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;
    try {
      const invoiceNo = r["Invoice Number"] || r["invoice_number"];
      const contractRef = r["Contract Ref"] || r["contract_ref"] || r["Lease Reference"];
      const invoiceDate = fmtDate(r["Invoice Date"] || r["invoice_date"]);
      const dueDate = fmtDate(r["Due Date"] || r["due_date"]);
      const rentAmount = toNum(r["Rent Amount"] || r["rent_amount"]);
      const serviceCharge = toNum(r["Service Charge"] || r["service_charge"]) || 0;
      const vat = toNum(r["VAT"] || r["vat"]) || 0;
      const currency = r["Currency"] || r["currency"] || "QAR";
      const periodMonth = toNum(r["Period Month"] || r["period_month"]);
      const periodYear = toNum(r["Period Year"] || r["period_year"]);

      if (!invoiceNo) throw new Error("Missing Invoice Number");
      if (!invoiceDate) throw new Error("Invalid Invoice Date");
      if (!rentAmount || rentAmount <= 0) throw new Error("Invalid Rent Amount");

      // Resolve contract_id and lessor_id from contract_ref
      let contractId: number | null = null;
      let lessorId: number | null = null;
      if (contractRef) {
        const cReq = pool.request();
        cReq.input("ref", sql.VarChar(50), contractRef);
        const cRes = await cReq.query(`SELECT contract_id, lessor_id FROM lease.contracts WHERE contract_ref = @ref`);
        if (cRes.recordset.length > 0) {
          contractId = cRes.recordset[0].contract_id;
          lessorId = cRes.recordset[0].lessor_id;
        }
      }

      const total = rentAmount + serviceCharge + vat;
      const req = pool.request();
      req.input("invoice_ref", sql.VarChar(50), `INV-${Date.now()}-${i}`);
      req.input("lessor_id", sql.Int, lessorId);
      req.input("contract_id", sql.Int, contractId);
      req.input("invoice_number", sql.VarChar(100), invoiceNo);
      req.input("invoice_date", sql.Date, new Date(invoiceDate));
      req.input("period_month", sql.Int, periodMonth || new Date(invoiceDate).getMonth() + 1);
      req.input("period_year", sql.Int, periodYear || new Date(invoiceDate).getFullYear());
      req.input("rent_amount", sql.Decimal(18, 2), rentAmount);
      req.input("service_charge", sql.Decimal(18, 2), serviceCharge);
      req.input("vat", sql.Decimal(18, 2), vat);
      req.input("total", sql.Decimal(18, 2), total);
      req.input("currency", sql.Char(3), currency);
      req.input("due_date", sql.Date, dueDate ? new Date(dueDate) : null);
      req.input("status", sql.VarChar(30), "Pending");
      req.input("user_id", sql.Int, userId);
      await req.query(`
        INSERT INTO payables.invoices (
          invoice_ref, lessor_id, contract_id, invoice_number, invoice_date,
          period_month, period_year, rent_amount, service_charge, vat, total,
          currency, due_date, status, maker_id, created_at
        ) VALUES (
          @invoice_ref, @lessor_id, @contract_id, @invoice_number, @invoice_date,
          @period_month, @period_year, @rent_amount, @service_charge, @vat, @total,
          @currency, @due_date, @status, @user_id, GETUTCDATE()
        )
      `);
      result.successCount++;
    } catch (err: any) {
      result.errorCount++;
      result.errors.push({ row: rowNum, message: err.message || "Unknown error" });
    }
  }
  return result;
}

// ─── Import: Lessor Contacts ──────────────────────────────────────────────────

async function importLessorContacts(rows: Record<string, any>[], userId: number): Promise<ImportResult> {
  const pool = await getPool();
  const result: ImportResult = { totalRows: rows.length, successCount: 0, errorCount: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;
    try {
      const legalName = r["Legal Name"] || r["legal_name"] || r["Lessor Name"];
      const regNo = r["Registration No"] || r["registration_no"] || "";
      const taxNo = r["Tax No"] || r["tax_no"] || "";
      const country = r["Country"] || r["country"] || "QA";
      const currency = r["Currency"] || r["currency"] || "QAR";
      const contactName = r["Contact Name"] || r["contact_name"] || "";
      const contactEmail = r["Contact Email"] || r["contact_email"] || "";
      const contactPhone = r["Contact Phone"] || r["contact_phone"] || "";

      if (!legalName) throw new Error("Missing Legal Name");

      const contactJson = JSON.stringify({ name: contactName, email: contactEmail, phone: contactPhone });

      // Check if lessor already exists
      const chkReq = pool.request();
      chkReq.input("name", sql.NVarChar(200), legalName);
      const existing = await chkReq.query(`SELECT lessor_id FROM lease.lessors WHERE legal_name = @name`);

      if (existing.recordset.length > 0) {
        // Update contact info
        const updReq = pool.request();
        updReq.input("id", sql.Int, existing.recordset[0].lessor_id);
        updReq.input("contact", sql.NVarChar(sql.MAX), contactJson);
        updReq.input("reg_no", sql.VarChar(100), regNo);
        updReq.input("tax_no", sql.VarChar(100), taxNo);
        await updReq.query(`
          UPDATE lease.lessors SET contact_json=@contact, registration_no=@reg_no, tax_no=@tax_no, updated_at=GETUTCDATE()
          WHERE lessor_id=@id
        `);
      } else {
        // Create new lessor
        const insReq = pool.request();
        insReq.input("name", sql.NVarChar(200), legalName);
        insReq.input("reg_no", sql.VarChar(100), regNo);
        insReq.input("tax_no", sql.VarChar(100), taxNo);
        insReq.input("country", sql.Char(2), country.slice(0, 2));
        insReq.input("currency", sql.Char(3), currency);
        insReq.input("contact", sql.NVarChar(sql.MAX), contactJson);
        insReq.input("user_id", sql.Int, userId);
        await insReq.query(`
          INSERT INTO lease.lessors (lessor_ref, legal_name, registration_no, tax_no, country, currency, contact_json, status, created_by, created_at)
          VALUES (CONCAT('LSR-', FORMAT(GETDATE(),'yyyyMMdd'), '-', RIGHT('000'+CAST(NEXT VALUE FOR lease.seq_lessor_ref AS VARCHAR),3)), @name, @reg_no, @tax_no, @country, @currency, @contact, 'Active', @user_id, GETUTCDATE())
        `);
      }
      result.successCount++;
    } catch (err: any) {
      result.errorCount++;
      result.errors.push({ row: rowNum, message: err.message || "Unknown error" });
    }
  }
  return result;
}

// ─── Import: Amortisation Schedule ────────────────────────────────────────────

async function importAmortisation(rows: Record<string, any>[], userId: number): Promise<ImportResult> {
  const pool = await getPool();
  const result: ImportResult = { totalRows: rows.length, successCount: 0, errorCount: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;
    try {
      const contractRef = r["Contract Ref"] || r["contract_ref"] || r["Lease Reference"];
      const periodDate = fmtDate(r["Period Date"] || r["period_date"]);
      const openLiab = toNum(r["Opening Liability"] || r["opening_liability"]);
      const interest = toNum(r["Interest Expense"] || r["interest_expense"]);
      const payment = toNum(r["Payment"] || r["payment"]);
      const principal = toNum(r["Principal"] || r["principal"]);
      const closeLiab = toNum(r["Closing Liability"] || r["closing_liability"]);
      const rouNbv = toNum(r["ROU NBV"] || r["rou_nbv"]);
      const depreciation = toNum(r["Depreciation"] || r["depreciation"]);

      if (!contractRef) throw new Error("Missing Contract Ref");
      if (!periodDate) throw new Error("Invalid Period Date");
      if (openLiab == null) throw new Error("Missing Opening Liability");

      // Resolve contract_id
      const cReq = pool.request();
      cReq.input("ref", sql.VarChar(50), contractRef);
      const cRes = await cReq.query(`SELECT contract_id FROM lease.contracts WHERE contract_ref = @ref`);
      if (cRes.recordset.length === 0) throw new Error(`Contract ${contractRef} not found`);
      const contractId = cRes.recordset[0].contract_id;

      const req = pool.request();
      req.input("contract_id", sql.Int, contractId);
      req.input("period_date", sql.Date, new Date(periodDate));
      req.input("open_liab", sql.Decimal(18, 2), openLiab);
      req.input("interest", sql.Decimal(18, 2), interest || 0);
      req.input("payment", sql.Decimal(18, 2), payment || 0);
      req.input("principal", sql.Decimal(18, 2), principal || 0);
      req.input("close_liab", sql.Decimal(18, 2), closeLiab || 0);
      req.input("rou_nbv", sql.Decimal(18, 2), rouNbv || 0);
      req.input("depreciation", sql.Decimal(18, 2), depreciation || 0);
      req.input("cum_depr", sql.Decimal(18, 2), toNum(r["Cumulative Depreciation"] || r["cumulative_depr"]) || 0);
      await req.query(`
        INSERT INTO lease.amortisation_schedule (
          contract_id, period_date, opening_liability, interest_expense, payment,
          principal, closing_liability, rou_nbv, depreciation, cumulative_depr, posting_status
        ) VALUES (
          @contract_id, @period_date, @open_liab, @interest, @payment,
          @principal, @close_liab, @rou_nbv, @depreciation, @cum_depr, 'Pending'
        )
      `);
      result.successCount++;
    } catch (err: any) {
      result.errorCount++;
      result.errors.push({ row: rowNum, message: err.message || "Unknown error" });
    }
  }
  return result;
}

// ─── Template Generation ──────────────────────────────────────────────────────

function generateTemplate(type: string): string {
  const headers: Record<string, string[]> = {
    LEASE_REGISTER: ["Lessor Name", "Asset Description", "Asset Type", "Commencement Date", "Expiry Date", "Term (Months)", "Monthly Payment", "Currency", "IBR (%)", "Initial Direct Costs", "Lease Incentives"],
    AMORTISATION: ["Contract Ref", "Period Date", "Opening Liability", "Interest Expense", "Payment", "Principal", "Closing Liability", "ROU NBV", "Depreciation", "Cumulative Depreciation"],
    IBR_RATES: ["Currency", "Term Min (Months)", "Term Max (Months)", "Rate (%)", "Effective From", "Effective To", "Source"],
    INVOICES: ["Contract Ref", "Invoice Number", "Invoice Date", "Due Date", "Rent Amount", "Service Charge", "VAT", "Currency", "Period Month", "Period Year"],
    LESSOR_CONTACTS: ["Legal Name", "Registration No", "Tax No", "Country", "Currency", "Contact Name", "Contact Email", "Contact Phone"],
  };

  const cols = headers[type] || headers["LEASE_REGISTER"];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([cols]);
  // Set column widths
  ws["!cols"] = cols.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  return buf;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const bulkImportRouter = router({
  // Download template
  downloadTemplate: publicProcedure
    .input(z.object({ type: z.enum(["LEASE_REGISTER", "AMORTISATION", "IBR_RATES", "INVOICES", "LESSOR_CONTACTS"]) }))
    .query(({ input }) => {
      return { base64: generateTemplate(input.type), filename: `${input.type.toLowerCase()}_template.xlsx` };
    }),

  // Upload and import Excel file
  importFile: protectedProcedure
    .input(z.object({
      type: z.enum(["LEASE_REGISTER", "AMORTISATION", "IBR_RATES", "INVOICES", "LESSOR_CONTACTS"]),
      base64: z.string(),
      filename: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const bulkOpId = await logOperation(pool, `IMPORT_${input.type}`, JSON.stringify({ filename: input.filename }), ctx.user.id);

      try {
        const sheet = parseExcelBase64(input.base64);
        const rows = sheetToRows(sheet);

        if (rows.length === 0) {
          await completeOperation(pool, bulkOpId, 0, 0, 1, "Empty file — no data rows found");
          return { success: false, totalRows: 0, successCount: 0, errorCount: 1, errors: [{ row: 0, message: "Empty file" }] };
        }

        let result: ImportResult;
        switch (input.type) {
          case "LEASE_REGISTER":
            result = await importLeaseRegister(rows, ctx.user.id);
            break;
          case "AMORTISATION":
            result = await importAmortisation(rows, ctx.user.id);
            break;
          case "IBR_RATES":
            result = await importIBRRates(rows, ctx.user.id);
            break;
          case "INVOICES":
            result = await importInvoices(rows, ctx.user.id);
            break;
          case "LESSOR_CONTACTS":
            result = await importLessorContacts(rows, ctx.user.id);
            break;
          default:
            result = { totalRows: 0, successCount: 0, errorCount: 1, errors: [{ row: 0, message: "Unknown import type" }] };
        }

        const errorSummary = result.errors.slice(0, 50).map(e => `Row ${e.row}: ${e.message}`).join("\n");
        await completeOperation(pool, bulkOpId, result.totalRows, result.successCount, result.errorCount, errorSummary);
        return { success: result.errorCount === 0, ...result };
      } catch (err: any) {
        await completeOperation(pool, bulkOpId, 0, 0, 1, err.message);
        return { success: false, totalRows: 0, successCount: 0, errorCount: 1, errors: [{ row: 0, message: err.message }] };
      }
    }),

  // Validate file without importing (dry run)
  validateFile: protectedProcedure
    .input(z.object({
      type: z.enum(["LEASE_REGISTER", "AMORTISATION", "IBR_RATES", "INVOICES", "LESSOR_CONTACTS"]),
      base64: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        const sheet = parseExcelBase64(input.base64);
        const rows = sheetToRows(sheet);
        if (rows.length === 0) return { valid: false, rowCount: 0, columns: [], errors: ["Empty file"] };

        const columns = Object.keys(rows[0]);
        const requiredCols: Record<string, string[]> = {
          LEASE_REGISTER: ["Lessor Name", "Commencement Date", "Expiry Date", "Monthly Payment", "IBR (%)"],
          AMORTISATION: ["Contract Ref", "Period Date", "Opening Liability"],
          IBR_RATES: ["Rate (%)", "Term Min (Months)", "Term Max (Months)", "Effective From"],
          INVOICES: ["Invoice Number", "Invoice Date", "Rent Amount"],
          LESSOR_CONTACTS: ["Legal Name"],
        };

        const missing = (requiredCols[input.type] || []).filter(c => !columns.some(col => col.toLowerCase().replace(/[^a-z0-9]/g, "") === c.toLowerCase().replace(/[^a-z0-9]/g, "")));
        return {
          valid: missing.length === 0,
          rowCount: rows.length,
          columns,
          missingColumns: missing,
          errors: missing.length > 0 ? [`Missing required columns: ${missing.join(", ")}`] : [],
        };
      } catch (err: any) {
        return { valid: false, rowCount: 0, columns: [], errors: [err.message] };
      }
    }),

  // Operation history log
  operationLog: protectedProcedure.query(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT bl.*, u.username AS initiated_by_name
      FROM lease.bulk_operation_log bl
      LEFT JOIN security.users u ON u.user_id = bl.initiated_by
      ORDER BY bl.started_at DESC
    `);
    return r.recordset;
  }),

  // Mass Remeasurement
  massRemeasure: protectedProcedure
    .input(z.object({
      new_ibr: z.number().min(0.01).max(50),
      currency: z.string().default("QAR"),
      reason: z.string().min(1),
      contract_ids: z.array(z.number()).optional(), // If empty, apply to all active
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const bulkOpId = await logOperation(pool, "MASS_REMEASURE", JSON.stringify({ new_ibr: input.new_ibr, currency: input.currency, reason: input.reason }), ctx.user.id);

      let whereClause = `WHERE status='Active' AND currency=@currency`;
      const contractReq = pool.request();
      contractReq.input("currency", sql.Char(3), input.currency);
      if (input.contract_ids && input.contract_ids.length > 0) {
        whereClause += ` AND contract_id IN (${input.contract_ids.join(",")})`;
      }

      const contracts = await contractReq.query(`
        SELECT contract_id, lease_liability_commence, rou_asset_value, ibr, DATEDIFF(MONTH, GETDATE(), expiry_date) AS rem
        FROM lease.contracts ${whereClause}
      `);

      let success = 0, errors = 0;
      const errorList: string[] = [];

      for (const c of contracts.recordset) {
        try {
          const monthlyRate = input.new_ibr / 100 / 12;
          const n = Math.max(c.rem, 1);
          const payment = (c.lease_liability_commence || 0) / Math.max(n, 1);
          const newLiability = monthlyRate > 0 ? payment * (1 - Math.pow(1 + monthlyRate, -n)) / monthlyRate : payment * n;

          const req2 = pool.request();
          req2.input("contract_id", sql.Int, c.contract_id);
          req2.input("new_ibr", sql.Decimal(8, 4), input.new_ibr);
          req2.input("new_liability", sql.Decimal(18, 2), newLiability);
          req2.input("initiated_by", sql.Int, ctx.user.id);
          req2.input("reason", sql.NVarChar(500), input.reason);
          await req2.query(`
            INSERT INTO lease.remeasurement_events (
              contract_id, event_type, event_date, trigger_description,
              old_liability, old_rou_asset, old_ibr, old_remaining_term,
              new_liability, new_rou_asset, new_ibr, new_remaining_term,
              liability_adjustment, rou_adjustment, status, created_by
            ) VALUES (
              @contract_id, 'RATE_REVISION', GETDATE(), @reason,
              ${c.lease_liability_commence}, ${c.rou_asset_value}, ${c.ibr}, ${n},
              @new_liability, @new_liability, @new_ibr, ${n},
              @new_liability - ${c.lease_liability_commence}, @new_liability - ${c.rou_asset_value},
              'POSTED', @initiated_by
            )
          `);
          success++;
        } catch (err: any) {
          errors++;
          errorList.push(`Contract ${c.contract_id}: ${err.message}`);
        }
      }

      await completeOperation(pool, bulkOpId, contracts.recordset.length, success, errors, errorList.join("\n"));
      return { success: true, processed: contracts.recordset.length, successCount: success, errorCount: errors };
    }),

  // Import staging (for viewing staged data before commit)
  importStaging: protectedProcedure
    .input(z.object({ batchId: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const req = pool.request();
      let where = "WHERE 1=1";
      if (input.batchId) { req.input("batchId", sql.NVarChar(100), input.batchId); where += " AND batch_id=@batchId"; }
      const r = await req.query(`SELECT * FROM lease.import_staging ${where} ORDER BY row_number`);
      return r.recordset;
    }),
});
