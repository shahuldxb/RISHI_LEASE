/**
 * VodaLease Enterprise — GenAI Router
 * Handles OCR extraction, Text-to-SQL, AI commentary, and IFRS 16 computation
 */
import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { invokeLLM } from '../_core/llm';
import { execSPP, execSPPOne, sql, getPool } from '../db-sqlserver';
import { writeErrorLog, simpleAuditLog } from '../audit';
import { TRPCError } from '@trpc/server';
import { RulesEngine } from '../rulesEngine';

// ── IFRS 16 Computation (inline, no Python dependency) ──────────────────────
function computeIFRS16Schedule(params: {
  leaseLiability: number;
  monthlyPayment: number;
  ibr: number;
  termMonths: number;
  rouAssetValue: number;
  commencementDate: string;
}) {
  const { leaseLiability, monthlyPayment, ibr, termMonths, rouAssetValue, commencementDate } = params;
  const monthlyRate = ibr / 12;
  const monthlyDepr = rouAssetValue / termMonths;
  const schedule = [];
  let openingLiability = leaseLiability;
  let rouNBV = rouAssetValue;
  let cumulativeDepr = 0;
  const startDate = new Date(commencementDate);

  for (let i = 1; i <= termMonths; i++) {
    const periodDate = new Date(startDate);
    periodDate.setMonth(periodDate.getMonth() + i);
    const interestExpense = parseFloat((openingLiability * monthlyRate).toFixed(2));
    const principal = parseFloat((monthlyPayment - interestExpense).toFixed(2));
    const closingLiability = parseFloat((openingLiability - principal).toFixed(2));
    cumulativeDepr = parseFloat((cumulativeDepr + monthlyDepr).toFixed(2));
    rouNBV = parseFloat((rouAssetValue - cumulativeDepr).toFixed(2));

    schedule.push({
      period_date: periodDate.toISOString().split('T')[0],
      opening_liability: parseFloat(openingLiability.toFixed(2)),
      interest_expense: interestExpense,
      payment: monthlyPayment,
      principal: principal,
      closing_liability: Math.max(0, closingLiability),
      rou_nbv: Math.max(0, rouNBV),
      depreciation: parseFloat(monthlyDepr.toFixed(2)),
      cumulative_depr: cumulativeDepr,
    });
    openingLiability = Math.max(0, closingLiability);
  }
  return schedule;
}

function computePresentValue(monthlyPayment: number, ibr: number, termMonths: number): number {
  const monthlyRate = ibr / 12;
  if (monthlyRate === 0) return monthlyPayment * termMonths;
  const pv = monthlyPayment * (1 - Math.pow(1 + monthlyRate, -termMonths)) / monthlyRate;
  return parseFloat(pv.toFixed(2));
}

export const genaiRouter = router({

  // ── IFRS 16 Calculation ─────────────────────────────────
  computeIFRS16: protectedProcedure
    .input(z.object({
      monthlyPayment: z.number(),
      ibr: z.number(),
      termMonths: z.number(),
      commencementDate: z.string(),
      initialDirectCosts: z.number().default(0),
      leaseIncentives: z.number().default(0),
      makeGoodEstimate: z.number().default(0),
      depositAmount: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const leaseLiability = computePresentValue(input.monthlyPayment, input.ibr, input.termMonths);
      const rouAssetValue = parseFloat((
        leaseLiability + input.initialDirectCosts - input.leaseIncentives + input.makeGoodEstimate
      ).toFixed(2));
      const schedule = computeIFRS16Schedule({
        leaseLiability,
        monthlyPayment: input.monthlyPayment,
        ibr: input.ibr,
        termMonths: input.termMonths,
        rouAssetValue,
        commencementDate: input.commencementDate,
      });
      return { leaseLiability, rouAssetValue, schedule };
    }),

  // ── OCR Invoice Extraction ──────────────────────────────
  extractInvoiceOCR: protectedProcedure
    .input(z.object({
      imageUrl: z.string(),
      contractRef: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are a financial document OCR assistant for VodaLease Enterprise.
Extract invoice data from the provided image and return a JSON object with these fields:
invoice_number, invoice_date (YYYY-MM-DD), vendor_name, period_month (1-12), period_year,
rent_amount (number), service_charge (number), vat (number), total (number), currency (3-char ISO),
due_date (YYYY-MM-DD), line_items (array of {description, amount}).
If a field is not found, use null. Return ONLY valid JSON.`,
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: `Extract invoice data from this document${input.contractRef ? ` for lease ${input.contractRef}` : ''}.` },
                { type: 'image_url', image_url: { url: input.imageUrl, detail: 'high' } },
              ],
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'invoice_extraction',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  invoice_number: { type: ['string', 'null'] },
                  invoice_date: { type: ['string', 'null'] },
                  vendor_name: { type: ['string', 'null'] },
                  period_month: { type: ['number', 'null'] },
                  period_year: { type: ['number', 'null'] },
                  rent_amount: { type: ['number', 'null'] },
                  service_charge: { type: ['number', 'null'] },
                  vat: { type: ['number', 'null'] },
                  total: { type: ['number', 'null'] },
                  currency: { type: ['string', 'null'] },
                  due_date: { type: ['string', 'null'] },
                  line_items: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, amount: { type: 'number' } }, required: ['description', 'amount'], additionalProperties: false } },
                },
                required: ['invoice_number', 'invoice_date', 'vendor_name', 'period_month', 'period_year', 'rent_amount', 'service_charge', 'vat', 'total', 'currency', 'due_date', 'line_items'],
                additionalProperties: false,
              },
            },
          },
        });
        const content = response.choices?.[0]?.message?.content;
        return typeof content === 'string' ? JSON.parse(content) : content;
      } catch (err: any) {
        await writeErrorLog({ severity: 'Error', module: 'GenAI', message: err.message, stackTrace: err.stack, screenId: 'VFPAYINVNEW0001P001' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'OCR extraction failed: ' + err.message });
      }
    }),

  // ── OCR Lease Document Extraction ──────────────────────
  extractLeaseOCR: protectedProcedure
    .input(z.object({ imageUrl: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are a lease document OCR assistant. Extract key lease terms from the document image and return JSON with:
lessor_name, commencement_date (YYYY-MM-DD), expiry_date (YYYY-MM-DD), monthly_rent (number),
currency (3-char ISO), escalation_rate (decimal, e.g. 0.05 for 5%), notice_period_months (number),
renewal_option (boolean), purchase_option (boolean), asset_description, asset_address.
Return ONLY valid JSON.`,
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Extract lease terms from this document.' },
                { type: 'image_url', image_url: { url: input.imageUrl, detail: 'high' } },
              ],
            },
          ],
        });
        const content = response.choices?.[0]?.message?.content;
        return typeof content === 'string' ? JSON.parse(content) : content;
      } catch (err: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Lease OCR failed: ' + err.message });
      }
    }),

  // ── Text-to-SQL GenAI Query ─────────────────────────────
  naturalLanguageQuery: protectedProcedure
    .input(z.object({ question: z.string().min(5) }))
    .mutation(async ({ input }) => {
      // Schema context for the LLM
      const schemaContext = `
Database: SQL Server 2025, database: leasing
Tables available (read-only SELECT via views):
- lease.contracts (contract_id, contract_ref, status, asset_type, asset_description, monthly_payment, currency, commencement_date, expiry_date, term_months, rou_asset_value, lease_liability_commence, ifrs16_classification, is_lto, maintenance_responsibility)
- lease.lessors (lessor_id, lessor_ref, legal_name, country, currency)
- lease.amortisation_schedule (contract_id, period_date, opening_liability, interest_expense, payment, principal, closing_liability, rou_nbv, depreciation)
- payables.invoices (invoice_id, invoice_ref, lessor_id, contract_id, total, currency, due_date, status, period_month, period_year)
- payables.payment_runs (run_id, run_ref, run_date, total_amount, currency, status)
- finance.gl_journals (journal_id, journal_ref, transaction_date, period, source, description, status)
- compliance.audit_log (audit_no, timestamp_utc, username, module, action_type, outcome)
- security.users (user_id, username, email, role)
Rules: Only generate SELECT statements. No INSERT/UPDATE/DELETE. Always include TOP 1000 limit. Use proper schema prefixes.`;

      try {
        const sqlResponse = await invokeLLM({
          messages: [
            { role: 'system', content: `You are a SQL Server query generator for VodaLease Enterprise.\n${schemaContext}\nGenerate a single valid T-SQL SELECT query to answer the user's question. Return ONLY the SQL query, no explanation.` },
            { role: 'user', content: input.question },
          ],
        });

        const generatedSQL = (sqlResponse.choices?.[0]?.message?.content as string || '').trim();

        // Safety check: only allow SELECT
        if (!generatedSQL.toUpperCase().startsWith('SELECT')) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only SELECT queries are permitted.' });
        }

        // Execute the generated query
        const { getPool } = await import('../db-sqlserver');
        const pool = await getPool();
        const result = await pool.request().query(generatedSQL);
        const rows = result.recordset || [];

        // Generate AI commentary
        const commentaryResponse = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are a financial analyst for VodaLease Enterprise. Provide a concise 2-3 sentence insight about the query results.' },
            { role: 'user', content: `Question: "${input.question}"\nResults (${rows.length} rows): ${JSON.stringify(rows.slice(0, 5))}` },
          ],
        });
        const commentary = commentaryResponse.choices?.[0]?.message?.content as string || '';

        return { sql: generatedSQL, rows: rows.slice(0, 500), totalRows: rows.length, commentary };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        await writeErrorLog({ severity: 'Error', module: 'GenAI', message: err.message, stackTrace: err.stack, screenId: 'VFMISGENAI0001P001' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Query failed: ' + err.message });
      }
    }),

  // ── AI Dashboard Commentary ─────────────────────────────
  getDashboardInsights: protectedProcedure
    .input(z.object({ kpis: z.any() }))
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are a senior lease portfolio analyst for Vodafone. Provide 3-4 concise, actionable insights about the lease portfolio KPIs. Be specific with numbers. Format as a brief paragraph.' },
            { role: 'user', content: `Current KPIs: ${JSON.stringify(input.kpis)}` },
          ],
        });
        return { insights: response.choices?.[0]?.message?.content as string || '' };
      } catch (err: any) {
        return { insights: 'AI insights temporarily unavailable.' };
      }
    }),

  // ── Business Rules from AI ─────────────────────────────────
  getBusinessRules: protectedProcedure
    .input(z.object({ screenId: z.string() }))
    .query(async ({ input }) => {
      try {
        const pool = await getPool();
        const result = await pool.request()
          .input('screenId', sql.NVarChar(100), input.screenId)
          .query(`SELECT rules_json, generated_at, source_model FROM dbo.screen_business_rules WHERE screen_id = @screenId`);
        const row = result.recordset?.[0];
        if (!row) return { rules: null, generatedAt: null };
        try {
          return { rules: JSON.parse(row.rules_json), generatedAt: row.generated_at };
        } catch {
          return { rules: null, generatedAt: null };
        }
      } catch {
        return { rules: null, generatedAt: null };
      }
    }),

  generateBusinessRules: protectedProcedure
    .input(z.object({ screenId: z.string(), screenTitle: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { screenId, screenTitle } = input;

      // Get screen metadata from registry for context
      let screenMeta: any = null;
      try {
        const pool = await getPool();
        const metaResult = await pool.request()
          .input('screenId', sql.NVarChar(100), screenId)
          .query(`SELECT screen_name, module, sub_module, stored_procedures, db_tables, computation_techniques, accounting_standards FROM security.screen_registry WHERE screen_id = @screenId`);
        screenMeta = metaResult.recordset?.[0] || null;
      } catch { /* ignore */ }

      const contextInfo = screenMeta
        ? `\nScreen metadata:\n- Module: ${screenMeta.module}\n- Sub-module: ${screenMeta.sub_module}\n- Stored Procedures: ${screenMeta.stored_procedures}\n- DB Tables: ${screenMeta.db_tables}\n- Computation Techniques: ${screenMeta.computation_techniques}\n- Accounting Standards: ${screenMeta.accounting_standards}`
        : '';

      const response = await invokeLLM({
        messages: [
          {
            role: 'system',
            content: `You are a senior IFRS 16 / ASC 842 lease accounting expert and enterprise systems architect. Your task is to define the complete business rules, methodology, and validation logic for a specific screen in a lease management system (VodaLease Enterprise for Vodafone Qatar).\n\nReturn a structured JSON object with the following sections:\n- summary: A 2-3 sentence overview of what this screen does and its purpose\n- standards: Array of { reference, description } — applicable IFRS/ASC/IAS paragraphs\n- businessRules: Array of { rule, explanation } — specific business logic rules\n- calculationSteps: Array of { step, formula? } — calculation methodology if applicable\n- validationRules: Array of strings — data validation requirements\n- journalEntryPattern: String or object describing the typical JV pattern if applicable\n\nBe specific to Vodafone Qatar context (QAR currency, Qatar regulations, telecom industry leases).`,
          },
          {
            role: 'user',
            content: `Generate the complete business rules and methodology for this screen:\n\nScreen: ${screenTitle}\nScreen ID: ${screenId}${contextInfo}\n\nProvide comprehensive IFRS 16 business rules, calculation methodology, validation rules, and journal entry patterns specific to this screen's function.`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'business_rules',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Overview of screen purpose' },
                standards: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      reference: { type: 'string' },
                      description: { type: 'string' },
                    },
                    required: ['reference', 'description'],
                    additionalProperties: false,
                  },
                },
                businessRules: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      rule: { type: 'string' },
                      explanation: { type: 'string' },
                    },
                    required: ['rule', 'explanation'],
                    additionalProperties: false,
                  },
                },
                calculationSteps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      step: { type: 'string' },
                      formula: { type: 'string' },
                    },
                    required: ['step', 'formula'],
                    additionalProperties: false,
                  },
                },
                validationRules: {
                  type: 'array',
                  items: { type: 'string' },
                },
                journalEntryPattern: { type: 'string' },
              },
              required: ['summary', 'standards', 'businessRules', 'calculationSteps', 'validationRules', 'journalEntryPattern'],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content as string;
      let rulesJson: any;
      try {
        rulesJson = JSON.parse(content);
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to parse AI response as JSON' });
      }

      // Upsert into screen_business_rules (summary table)
      const pool = await getPool();
      await pool.request()
        .input('screenId', sql.NVarChar(100), screenId)
        .input('screenTitle', sql.NVarChar(255), screenTitle)
        .input('rulesJson', sql.NVarChar(sql.MAX), JSON.stringify(rulesJson))
        .input('summary', sql.NVarChar(sql.MAX), rulesJson.summary || '')
        .query(`MERGE dbo.screen_business_rules AS target
         USING (SELECT @screenId AS screen_id) AS source
         ON target.screen_id = source.screen_id
         WHEN MATCHED THEN
           UPDATE SET rules_json = @rulesJson, screen_title = @screenTitle, updated_at = GETUTCDATE(), source_model = 'gpt-4o'
         WHEN NOT MATCHED THEN
           INSERT (screen_id, screen_title, rules_json, summary, source_model)
           VALUES (@screenId, @screenTitle, @rulesJson, @summary, 'gpt-4o');`);

      // ── Also store individual rules in business_rules table for the Rules Engine ──
      // Delete existing rules for this screen first (regeneration)
      try {
        await RulesEngine.deleteRulesForScreen(screenId, ctx.user?.name || 'system');
      } catch { /* ignore if no rules existed */ }

      const userName = ctx.user?.name || 'system';
      let ruleCount = 0;

      // Store standards as STANDARD_REF rules
      if (rulesJson.standards) {
        for (const s of rulesJson.standards) {
          await RulesEngine.upsertRule({
            screen_id: screenId, screen_title: screenTitle,
            category_code: 'STANDARD_REF', rule_name: s.reference,
            rule_description: s.description, ifrs_reference: s.reference,
            priority: 10 + ruleCount, created_by_ai: true, source_model: 'gpt-4o', updated_by: userName,
          });
          ruleCount++;
        }
      }

      // Store business rules — map to appropriate categories
      if (rulesJson.businessRules) {
        for (const r of rulesJson.businessRules) {
          // Determine category based on rule content
          let category = 'VALIDATION';
          const lower = (r.rule + ' ' + r.explanation).toLowerCase();
          if (lower.includes('recogni')) category = 'RECOGNITION';
          else if (lower.includes('classif')) category = 'CLASSIFICATION';
          else if (lower.includes('modif') || lower.includes('remeasur')) category = 'MODIFICATION';
          else if (lower.includes('escalat') || lower.includes('cpi') || lower.includes('index')) category = 'ESCALATION';
          else if (lower.includes('terminat') || lower.includes('derecogni')) category = 'TERMINATION';
          else if (lower.includes('disclos')) category = 'DISCLOSURE';
          else if (lower.includes('impair')) category = 'IMPAIRMENT';
          else if (lower.includes('fx') || lower.includes('foreign') || lower.includes('exchange')) category = 'FX';
          else if (lower.includes('period') || lower.includes('close') || lower.includes('closing')) category = 'PERIOD_CLOSE';
          else if (lower.includes('measur') || lower.includes('depreci') || lower.includes('amortis')) category = 'MEASUREMENT';

          await RulesEngine.upsertRule({
            screen_id: screenId, screen_title: screenTitle,
            category_code: category, rule_name: r.rule,
            rule_description: r.explanation,
            priority: 50 + ruleCount, created_by_ai: true, source_model: 'gpt-4o', updated_by: userName,
          });
          ruleCount++;
        }
      }

      // Store calculation steps as CALCULATION rules
      if (rulesJson.calculationSteps) {
        for (const step of rulesJson.calculationSteps) {
          await RulesEngine.upsertRule({
            screen_id: screenId, screen_title: screenTitle,
            category_code: 'CALCULATION', rule_name: step.step,
            formula: step.formula || null,
            priority: 100 + ruleCount, created_by_ai: true, source_model: 'gpt-4o', updated_by: userName,
          });
          ruleCount++;
        }
      }

      // Store validation rules
      if (rulesJson.validationRules) {
        for (const v of rulesJson.validationRules) {
          await RulesEngine.upsertRule({
            screen_id: screenId, screen_title: screenTitle,
            category_code: 'VALIDATION', rule_name: v,
            condition_expression: v,
            priority: 200 + ruleCount, created_by_ai: true, source_model: 'gpt-4o', updated_by: userName,
          });
          ruleCount++;
        }
      }

      // Store journal entry pattern as JV_PATTERN rule
      if (rulesJson.journalEntryPattern) {
        await RulesEngine.upsertRule({
          screen_id: screenId, screen_title: screenTitle,
          category_code: 'JV_PATTERN',
          rule_name: `JV Pattern — ${screenTitle}`,
          rule_description: typeof rulesJson.journalEntryPattern === 'string'
            ? rulesJson.journalEntryPattern
            : JSON.stringify(rulesJson.journalEntryPattern),
          priority: 300, created_by_ai: true, source_model: 'gpt-4o', updated_by: userName,
        });
        ruleCount++;
      }

      await simpleAuditLog(
        'business_rules', 'AI_GENERATE', userName,
        `Generated ${ruleCount} business rules from AI for screen ${screenId} (${screenTitle})`,
        { screen_id: screenId, rule_count: ruleCount }
      );

      return { success: true, rules: rulesJson, ruleCount };
    }),
});
