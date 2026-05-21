/**
 * VodaLease Enterprise — Dynamic Business Rules Engine
 * Reads rules from DB, evaluates formulas, validates data, returns JV patterns.
 * All DB access via stored procedures. Audit + error logging on every execution.
 */
import { execSPP, execSPPOne, sql } from './db-sqlserver';
import { simpleAuditLog as writeAuditLog, simpleErrorLog as writeErrorLog } from './audit';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BusinessRule {
  rule_id: number;
  screen_id: string;
  screen_title: string | null;
  category_code: string;
  category_name: string;
  rule_name: string;
  rule_description: string | null;
  formula: string | null;
  formula_variables: string | null;
  jv_debit_account: string | null;
  jv_credit_account: string | null;
  jv_description: string | null;
  ifrs_reference: string | null;
  condition_expression: string | null;
  priority: number;
  is_active: boolean;
  version: number;
  created_by_ai: boolean;
  source_model: string | null;
  created_at: Date;
  updated_at: Date;
  updated_by: string | null;
}

export interface RuleExecutionResult {
  rule_id: number;
  rule_name: string;
  category_code: string;
  success: boolean;
  result: any;
  error?: string;
  execution_time_ms: number;
}

export interface JVPattern {
  rule_id: number;
  rule_name: string;
  debit_account: string;
  credit_account: string;
  description: string;
  ifrs_reference: string | null;
}

// ── Rules Engine ───────────────────────────────────────────────────────────────

export class RulesEngine {
  /**
   * Load all active rules for a screen from DB via SP
   */
  static async loadRules(screenId: string, activeOnly = true): Promise<BusinessRule[]> {
    try {
      const rules = await execSPP<BusinessRule>('sp_GetBusinessRules', [
        { name: 'screen_id', type: sql.NVarChar(100), value: screenId },
        { name: 'active_only', type: sql.Bit, value: activeOnly ? 1 : 0 },
      ]);
      return rules;
    } catch (err: any) {
      await writeErrorLog('RulesEngine.loadRules', err.message, 'rules_engine', { screenId });
      return [];
    }
  }

  /**
   * Load all rules across all screens (for management UI)
   */
  static async loadAllRules(): Promise<BusinessRule[]> {
    try {
      return await execSPP<BusinessRule>('sp_GetAllBusinessRules');
    } catch (err: any) {
      await writeErrorLog('RulesEngine.loadAllRules', err.message, 'rules_engine', {});
      return [];
    }
  }

  /**
   * Get rules summary per screen
   */
  static async getRulesSummary(): Promise<any[]> {
    try {
      return await execSPP('sp_GetBusinessRulesSummary');
    } catch (err: any) {
      await writeErrorLog('RulesEngine.getRulesSummary', err.message, 'rules_engine', {});
      return [];
    }
  }

  /**
   * Get all rule categories
   */
  static async getCategories(): Promise<any[]> {
    try {
      return await execSPP('sp_GetRuleCategories');
    } catch (err: any) {
      await writeErrorLog('RulesEngine.getCategories', err.message, 'rules_engine', {});
      return [];
    }
  }

  /**
   * Execute a calculation rule with given input parameters.
   * Evaluates the formula string by substituting variables.
   * Formula format: "result = opening_balance * (monthly_rate)" 
   * Variables are passed as key-value pairs.
   */
  static async executeCalculation(
    rule: BusinessRule,
    inputParams: Record<string, number>,
    userId?: string
  ): Promise<RuleExecutionResult> {
    const startTime = Date.now();
    try {
      if (!rule.formula) {
        throw new Error(`Rule ${rule.rule_id} has no formula defined`);
      }

      // Parse formula variables definition
      let variableDefs: Record<string, string> = {};
      if (rule.formula_variables) {
        try {
          variableDefs = JSON.parse(rule.formula_variables);
        } catch { /* ignore parse errors */ }
      }

      // Evaluate formula by substituting variables
      let expression = rule.formula;
      for (const [key, value] of Object.entries(inputParams)) {
        expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), String(value));
      }

      // Safe math evaluation (no eval — use Function constructor with restricted scope)
      const result = safeEvaluate(expression);
      const execTime = Date.now() - startTime;

      // Log execution
      await this.logExecution(rule.rule_id, rule.screen_id, inputParams, result, true, null, execTime, userId);

      return {
        rule_id: rule.rule_id,
        rule_name: rule.rule_name,
        category_code: rule.category_code,
        success: true,
        result,
        execution_time_ms: execTime,
      };
    } catch (err: any) {
      const execTime = Date.now() - startTime;
      await this.logExecution(rule.rule_id, rule.screen_id, inputParams, null, false, err.message, execTime, userId);
      await writeErrorLog('RulesEngine.executeCalculation', err.message, 'rules_engine', {
        rule_id: rule.rule_id,
        inputParams,
      });

      return {
        rule_id: rule.rule_id,
        rule_name: rule.rule_name,
        category_code: rule.category_code,
        success: false,
        result: null,
        error: err.message,
        execution_time_ms: execTime,
      };
    }
  }

  /**
   * Execute a validation rule against provided data.
   * condition_expression format: "monthly_rent > 0 AND lease_term >= 1"
   */
  static async executeValidation(
    rule: BusinessRule,
    data: Record<string, any>,
    userId?: string
  ): Promise<RuleExecutionResult> {
    const startTime = Date.now();
    try {
      if (!rule.condition_expression) {
        throw new Error(`Rule ${rule.rule_id} has no condition expression defined`);
      }

      let expression = rule.condition_expression;
      for (const [key, value] of Object.entries(data)) {
        const strVal = typeof value === 'string' ? `"${value}"` : String(value);
        expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), strVal);
      }

      // Replace AND/OR with &&/||
      expression = expression.replace(/\bAND\b/gi, '&&').replace(/\bOR\b/gi, '||').replace(/\bNOT\b/gi, '!');

      const isValid = safeEvaluate(expression);
      const execTime = Date.now() - startTime;

      await this.logExecution(rule.rule_id, rule.screen_id, data, { isValid }, true, null, execTime, userId);

      return {
        rule_id: rule.rule_id,
        rule_name: rule.rule_name,
        category_code: rule.category_code,
        success: true,
        result: { isValid, expression: rule.condition_expression },
        execution_time_ms: execTime,
      };
    } catch (err: any) {
      const execTime = Date.now() - startTime;
      await this.logExecution(rule.rule_id, rule.screen_id, data, null, false, err.message, execTime, userId);

      return {
        rule_id: rule.rule_id,
        rule_name: rule.rule_name,
        category_code: rule.category_code,
        success: false,
        result: null,
        error: err.message,
        execution_time_ms: execTime,
      };
    }
  }

  /**
   * Get JV patterns for a screen (all active JV_PATTERN rules)
   */
  static async getJVPatterns(screenId: string): Promise<JVPattern[]> {
    const rules = await this.loadRules(screenId);
    return rules
      .filter((r) => r.category_code === 'JV_PATTERN' && r.jv_debit_account && r.jv_credit_account)
      .map((r) => ({
        rule_id: r.rule_id,
        rule_name: r.rule_name,
        debit_account: r.jv_debit_account!,
        credit_account: r.jv_credit_account!,
        description: r.jv_description || r.rule_name,
        ifrs_reference: r.ifrs_reference,
      }));
  }

  /**
   * Execute ALL active rules for a screen with given context data.
   * Returns results grouped by category.
   */
  static async executeAllRules(
    screenId: string,
    context: Record<string, any>,
    userId?: string
  ): Promise<{ calculations: RuleExecutionResult[]; validations: RuleExecutionResult[]; jvPatterns: JVPattern[] }> {
    const rules = await this.loadRules(screenId);
    const calculations: RuleExecutionResult[] = [];
    const validations: RuleExecutionResult[] = [];

    for (const rule of rules) {
      if (rule.category_code === 'CALCULATION' || rule.category_code === 'MEASUREMENT' || rule.category_code === 'RECOGNITION') {
        if (rule.formula) {
          const result = await this.executeCalculation(rule, context as Record<string, number>, userId);
          calculations.push(result);
        }
      } else if (rule.category_code === 'VALIDATION') {
        if (rule.condition_expression) {
          const result = await this.executeValidation(rule, context, userId);
          validations.push(result);
        }
      }
    }

    const jvPatterns = rules
      .filter((r) => r.category_code === 'JV_PATTERN' && r.jv_debit_account && r.jv_credit_account)
      .map((r) => ({
        rule_id: r.rule_id,
        rule_name: r.rule_name,
        debit_account: r.jv_debit_account!,
        credit_account: r.jv_credit_account!,
        description: r.jv_description || r.rule_name,
        ifrs_reference: r.ifrs_reference,
      }));

    return { calculations, validations, jvPatterns };
  }

  /**
   * Upsert a business rule via SP
   */
  static async upsertRule(params: {
    rule_id?: number;
    screen_id: string;
    screen_title?: string;
    category_code: string;
    rule_name: string;
    rule_description?: string;
    formula?: string;
    formula_variables?: string;
    jv_debit_account?: string;
    jv_credit_account?: string;
    jv_description?: string;
    ifrs_reference?: string;
    condition_expression?: string;
    priority?: number;
    is_active?: boolean;
    created_by_ai?: boolean;
    source_model?: string;
    updated_by?: string;
  }): Promise<{ rule_id: number; action: string } | null> {
    try {
      const result = await execSPPOne<{ rule_id: number; action: string }>('sp_UpsertBusinessRule', [
        { name: 'rule_id', type: sql.Int, value: params.rule_id ?? null },
        { name: 'screen_id', type: sql.NVarChar(100), value: params.screen_id },
        { name: 'screen_title', type: sql.NVarChar(255), value: params.screen_title ?? null },
        { name: 'category_code', type: sql.NVarChar(50), value: params.category_code },
        { name: 'rule_name', type: sql.NVarChar(300), value: params.rule_name },
        { name: 'rule_description', type: sql.NVarChar(sql.MAX), value: params.rule_description ?? null },
        { name: 'formula', type: sql.NVarChar(sql.MAX), value: params.formula ?? null },
        { name: 'formula_variables', type: sql.NVarChar(sql.MAX), value: params.formula_variables ?? null },
        { name: 'jv_debit_account', type: sql.NVarChar(200), value: params.jv_debit_account ?? null },
        { name: 'jv_credit_account', type: sql.NVarChar(200), value: params.jv_credit_account ?? null },
        { name: 'jv_description', type: sql.NVarChar(500), value: params.jv_description ?? null },
        { name: 'ifrs_reference', type: sql.NVarChar(200), value: params.ifrs_reference ?? null },
        { name: 'condition_expression', type: sql.NVarChar(sql.MAX), value: params.condition_expression ?? null },
        { name: 'priority', type: sql.Int, value: params.priority ?? 100 },
        { name: 'is_active', type: sql.Bit, value: params.is_active !== false ? 1 : 0 },
        { name: 'created_by_ai', type: sql.Bit, value: params.created_by_ai ? 1 : 0 },
        { name: 'source_model', type: sql.NVarChar(100), value: params.source_model ?? null },
        { name: 'updated_by', type: sql.NVarChar(200), value: params.updated_by ?? null },
      ]);

      // Audit log
      await writeAuditLog(
        'business_rules',
        result?.action === 'inserted' ? 'INSERT' : 'UPDATE',
        params.updated_by || 'system',
        `Rule ${result?.action}: ${params.rule_name} (${params.category_code}) for screen ${params.screen_id}`,
        { rule_id: result?.rule_id, screen_id: params.screen_id }
      );

      return result;
    } catch (err: any) {
      await writeErrorLog('RulesEngine.upsertRule', err.message, 'rules_engine', params);
      throw err;
    }
  }

  /**
   * Toggle rule active/inactive via SP
   */
  static async toggleRule(ruleId: number, isActive: boolean, updatedBy?: string): Promise<void> {
    try {
      await execSPPOne('sp_ToggleBusinessRule', [
        { name: 'rule_id', type: sql.Int, value: ruleId },
        { name: 'is_active', type: sql.Bit, value: isActive ? 1 : 0 },
        { name: 'updated_by', type: sql.NVarChar(200), value: updatedBy ?? null },
      ]);

      await writeAuditLog(
        'business_rules',
        'UPDATE',
        updatedBy || 'system',
        `Rule ${ruleId} ${isActive ? 'activated' : 'deactivated'}`,
        { rule_id: ruleId, is_active: isActive }
      );
    } catch (err: any) {
      await writeErrorLog('RulesEngine.toggleRule', err.message, 'rules_engine', { ruleId, isActive });
      throw err;
    }
  }

  /**
   * Delete all rules for a screen (before regeneration) via SP
   */
  static async deleteRulesForScreen(screenId: string, deletedBy?: string): Promise<number> {
    try {
      const result = await execSPPOne<{ deleted_count: number }>('sp_DeleteBusinessRulesByScreen', [
        { name: 'screen_id', type: sql.NVarChar(100), value: screenId },
      ]);

      await writeAuditLog(
        'business_rules',
        'DELETE',
        deletedBy || 'system',
        `Deleted ${result?.deleted_count || 0} rules for screen ${screenId} (regeneration)`,
        { screen_id: screenId }
      );

      return result?.deleted_count || 0;
    } catch (err: any) {
      await writeErrorLog('RulesEngine.deleteRulesForScreen', err.message, 'rules_engine', { screenId });
      throw err;
    }
  }

  /**
   * Get execution log for a screen
   */
  static async getExecutionLog(screenId: string, top = 100): Promise<any[]> {
    try {
      return await execSPP('sp_GetRuleExecutionLog', [
        { name: 'screen_id', type: sql.NVarChar(100), value: screenId },
        { name: 'top', type: sql.Int, value: top },
      ]);
    } catch (err: any) {
      await writeErrorLog('RulesEngine.getExecutionLog', err.message, 'rules_engine', { screenId });
      return [];
    }
  }

  /**
   * Log a rule execution via SP
   */
  private static async logExecution(
    ruleId: number,
    screenId: string,
    inputParams: any,
    outputResult: any,
    success: boolean,
    errorMessage: string | null,
    executionTimeMs: number,
    executedBy?: string
  ): Promise<void> {
    try {
      await execSPPOne('sp_LogRuleExecution', [
        { name: 'rule_id', type: sql.Int, value: ruleId },
        { name: 'screen_id', type: sql.NVarChar(100), value: screenId },
        { name: 'input_params', type: sql.NVarChar(sql.MAX), value: JSON.stringify(inputParams) },
        { name: 'output_result', type: sql.NVarChar(sql.MAX), value: outputResult ? JSON.stringify(outputResult) : null },
        { name: 'success', type: sql.Bit, value: success ? 1 : 0 },
        { name: 'error_message', type: sql.NVarChar(sql.MAX), value: errorMessage },
        { name: 'execution_time_ms', type: sql.Int, value: executionTimeMs },
        { name: 'executed_by', type: sql.NVarChar(200), value: executedBy ?? null },
      ]);
    } catch {
      // Silently fail logging — don't break rule execution
    }
  }

  // ── GL Code Management ──────────────────────────────────────────────────────

  /**
   * Lookup a GL code from the business_rules table.
   * If not found, auto-creates it from the Chart of Accounts (coa.accounts or accounting.gl_chart_of_accounts)
   * and stores it in the rules table for future lookups.
   *
   * @param screenId - The screen requesting the GL code
   * @param transactionType - e.g. 'ROU_INITIAL_RECOGNITION', 'DEPRECIATION', 'INTEREST_EXPENSE', 'CPI_ESCALATION'
   * @param entryType - 'DEBIT' or 'CREDIT'
   * @param fallbackDebit - Optional fallback debit GL code if auto-creation needed
   * @param fallbackCredit - Optional fallback credit GL code if auto-creation needed
   */
  static async lookupGLCode(
    screenId: string,
    transactionType: string,
    entryType: 'DEBIT' | 'CREDIT' = 'DEBIT',
    fallbackDebit?: string,
    fallbackCredit?: string
  ): Promise<{ glCode: string | null; ruleId: number | null; autoCreated: boolean }> {
    try {
      const result = await execSPPOne<{ rule_id: number | null; rule_name: string | null; gl_code: string | null; found: number }>(
        'sp_LookupGLCode',
        [
          { name: 'screen_id', type: sql.NVarChar(100), value: screenId },
          { name: 'transaction_type', type: sql.NVarChar(100), value: transactionType },
          { name: 'entry_type', type: sql.NVarChar(10), value: entryType },
        ]
      );

      if (result && result.found === 1 && result.gl_code) {
        return { glCode: result.gl_code, ruleId: result.rule_id, autoCreated: false };
      }

      // Not found — auto-create from fallback or Chart of Accounts
      const debitCode = fallbackDebit || await this.findGLFromChartOfAccounts(transactionType, 'Dr');
      const creditCode = fallbackCredit || await this.findGLFromChartOfAccounts(transactionType, 'Cr');

      if (debitCode || creditCode) {
        const created = await this.upsertGLCodeRule({
          screenId,
          transactionType,
          debitGLCode: debitCode || '',
          creditGLCode: creditCode || '',
          description: `Auto-created GL code for ${transactionType} on screen ${screenId}`,
          createdByAI: false,
          updatedBy: 'system-auto',
        });

        const glCode = entryType === 'DEBIT' ? debitCode : creditCode;
        return { glCode: glCode || null, ruleId: created?.rule_id || null, autoCreated: true };
      }

      return { glCode: null, ruleId: null, autoCreated: false };
    } catch (err: any) {
      await writeErrorLog('RulesEngine.lookupGLCode', err.message, 'rules_engine', { screenId, transactionType, entryType });
      return { glCode: null, ruleId: null, autoCreated: false };
    }
  }

  /**
   * Upsert a GL code rule into the business_rules table
   */
  static async upsertGLCodeRule(params: {
    screenId: string;
    transactionType: string;
    debitGLCode: string;
    creditGLCode: string;
    description?: string;
    ifrsReference?: string;
    priority?: number;
    createdByAI?: boolean;
    sourceModel?: string;
    updatedBy?: string;
  }): Promise<{ rule_id: number; action: string; debit_gl_code: string; credit_gl_code: string } | null> {
    try {
      const result = await execSPPOne<{ rule_id: number; action: string; debit_gl_code: string; credit_gl_code: string }>(
        'sp_UpsertGLCodeRule',
        [
          { name: 'screen_id', type: sql.NVarChar(100), value: params.screenId },
          { name: 'transaction_type', type: sql.NVarChar(100), value: params.transactionType },
          { name: 'debit_gl_code', type: sql.NVarChar(200), value: params.debitGLCode },
          { name: 'credit_gl_code', type: sql.NVarChar(200), value: params.creditGLCode },
          { name: 'description', type: sql.NVarChar(500), value: params.description ?? null },
          { name: 'ifrs_reference', type: sql.NVarChar(200), value: params.ifrsReference ?? null },
          { name: 'priority', type: sql.Int, value: params.priority ?? 100 },
          { name: 'created_by_ai', type: sql.Bit, value: params.createdByAI ? 1 : 0 },
          { name: 'source_model', type: sql.NVarChar(100), value: params.sourceModel ?? null },
          { name: 'updated_by', type: sql.NVarChar(200), value: params.updatedBy ?? null },
        ]
      );

      await writeAuditLog(
        'business_rules',
        result?.action === 'inserted' ? 'INSERT' : 'UPDATE',
        params.updatedBy || 'system',
        `GL Code Rule ${result?.action}: ${params.transactionType} for screen ${params.screenId} (Dr: ${params.debitGLCode}, Cr: ${params.creditGLCode})`,
        { rule_id: result?.rule_id, screen_id: params.screenId, transaction_type: params.transactionType }
      );

      return result;
    } catch (err: any) {
      await writeErrorLog('RulesEngine.upsertGLCodeRule', err.message, 'rules_engine', params);
      throw err;
    }
  }

  /**
   * Get all GL code rules (for management UI)
   */
  static async getAllGLCodeRules(): Promise<any[]> {
    try {
      return await execSPP('sp_GetAllGLCodeRules');
    } catch (err: any) {
      await writeErrorLog('RulesEngine.getAllGLCodeRules', err.message, 'rules_engine', {});
      return [];
    }
  }

  /**
   * Get GL code rules for a specific screen
   */
  static async getGLCodeRulesForScreen(screenId: string): Promise<any[]> {
    try {
      return await execSPP('sp_GetGLCodeRules', [
        { name: 'screen_id', type: sql.NVarChar(100), value: screenId },
        { name: 'transaction_type', type: sql.NVarChar(100), value: null },
      ]);
    } catch (err: any) {
      await writeErrorLog('RulesEngine.getGLCodeRulesForScreen', err.message, 'rules_engine', { screenId });
      return [];
    }
  }

  /**
   * Find a GL code from the Chart of Accounts based on transaction type.
   * Maps common transaction types to their corresponding GL accounts.
   */
  private static async findGLFromChartOfAccounts(
    transactionType: string,
    normalBalance: 'Dr' | 'Cr'
  ): Promise<string | null> {
    try {
      // Map transaction types to GL account search patterns
      const TRANSACTION_GL_MAP: Record<string, { drPattern: string; crPattern: string }> = {
        'ROU_INITIAL_RECOGNITION':     { drPattern: 'Right-of-Use Asset', crPattern: 'Lease Liabilit' },
        'DEPRECIATION':                { drPattern: 'Depreciation Expense', crPattern: 'Accum. Depreciation' },
        'INTEREST_EXPENSE':            { drPattern: 'Interest Expense', crPattern: 'Lease Liabilit' },
        'LEASE_PAYMENT':               { drPattern: 'Lease Liabilit', crPattern: 'Cash' },
        'CPI_ESCALATION':              { drPattern: 'Right-of-Use Asset', crPattern: 'Lease Liabilit' },
        'MODIFICATION_INCREASE':       { drPattern: 'Right-of-Use Asset', crPattern: 'Lease Liabilit' },
        'MODIFICATION_DECREASE':       { drPattern: 'Lease Liabilit', crPattern: 'Right-of-Use Asset' },
        'TERMINATION':                 { drPattern: 'Lease Liabilit', crPattern: 'Right-of-Use Asset' },
        'TERMINATION_GAIN':            { drPattern: 'Lease Liabilit', crPattern: 'Gain on' },
        'TERMINATION_LOSS':            { drPattern: 'Loss on', crPattern: 'Right-of-Use Asset' },
        'IMPAIRMENT':                  { drPattern: 'Impairment', crPattern: 'Right-of-Use Asset' },
        'SUBLEASE_INCOME':             { drPattern: 'Cash', crPattern: 'Sublease Income' },
        'SECURITY_DEPOSIT_PAID':       { drPattern: 'Security Deposit', crPattern: 'Cash' },
        'SECURITY_DEPOSIT_RECEIVED':   { drPattern: 'Cash', crPattern: 'Security Deposit' },
        'RENT_EXPENSE':                { drPattern: 'Rent Expense', crPattern: 'Accounts Payable' },
        'RENEWAL':                     { drPattern: 'Right-of-Use Asset', crPattern: 'Lease Liabilit' },
        'FX_REVALUATION':              { drPattern: 'Foreign Exchange', crPattern: 'Lease Liabilit' },
      };

      const mapping = TRANSACTION_GL_MAP[transactionType.toUpperCase()];
      if (!mapping) return null;

      const searchPattern = normalBalance === 'Dr' ? mapping.drPattern : mapping.crPattern;

      // Search in accounting.gl_chart_of_accounts first (QAR-based, more specific)
      const results = await execSPP<{ account_code: string; account_name: string }>(
        'sp_LookupGLFromCOA',
        [{ name: 'search_pattern', type: sql.NVarChar(200), value: searchPattern }]
      );

      if (results.length > 0) {
        return results[0].account_code;
      }

      return null;
    } catch {
      // If SP doesn't exist or fails, return null — caller handles gracefully
      return null;
    }
  }

  /**
   * Seed default GL code rules for common IFRS 16 transaction types.
   * Call this once to populate the rules table with standard GL mappings.
   */
  static async seedDefaultGLCodeRules(updatedBy = 'system-seed'): Promise<number> {
    const DEFAULT_GL_RULES = [
      { screen: 'GLOBAL', type: 'ROU_INITIAL_RECOGNITION', dr: '10100', cr: '20100', desc: 'Initial recognition of ROU asset and lease liability', ifrs: 'IFRS 16.22-25' },
      { screen: 'GLOBAL', type: 'DEPRECIATION_PROPERTY', dr: '50100', cr: '10200', desc: 'Monthly depreciation of ROU property asset', ifrs: 'IFRS 16.31-33' },
      { screen: 'GLOBAL', type: 'DEPRECIATION_VEHICLE', dr: '50110', cr: '10210', desc: 'Monthly depreciation of ROU vehicle asset', ifrs: 'IFRS 16.31-33' },
      { screen: 'GLOBAL', type: 'DEPRECIATION_EQUIPMENT', dr: '50120', cr: '10220', desc: 'Monthly depreciation of ROU equipment asset', ifrs: 'IFRS 16.31-33' },
      { screen: 'GLOBAL', type: 'DEPRECIATION_IT_INFRA', dr: '50130', cr: '10230', desc: 'Monthly depreciation of ROU IT infrastructure', ifrs: 'IFRS 16.31-33' },
      { screen: 'GLOBAL', type: 'DEPRECIATION_TOWER', dr: '50140', cr: '10240', desc: 'Monthly depreciation of ROU tower site asset', ifrs: 'IFRS 16.31-33' },
      { screen: 'GLOBAL', type: 'INTEREST_EXPENSE', dr: '60100', cr: '20100', desc: 'Interest expense on lease liability (unwinding)', ifrs: 'IFRS 16.36(b)' },
      { screen: 'GLOBAL', type: 'LEASE_PAYMENT', dr: '20100', cr: '10100', desc: 'Lease payment reducing liability (cash outflow)', ifrs: 'IFRS 16.36(a)' },
      { screen: 'GLOBAL', type: 'CPI_ESCALATION', dr: '10100', cr: '20100', desc: 'CPI escalation remeasurement — increase ROU and liability', ifrs: 'IFRS 16.39-43' },
      { screen: 'GLOBAL', type: 'MODIFICATION_INCREASE', dr: '10100', cr: '20100', desc: 'Lease modification — increase in scope', ifrs: 'IFRS 16.44-46' },
      { screen: 'GLOBAL', type: 'MODIFICATION_DECREASE', dr: '20100', cr: '10100', desc: 'Lease modification — decrease in scope', ifrs: 'IFRS 16.44-46' },
      { screen: 'GLOBAL', type: 'TERMINATION_GAIN', dr: '20100', cr: '70100', desc: 'Lease termination — gain on derecognition', ifrs: 'IFRS 16.B98' },
      { screen: 'GLOBAL', type: 'TERMINATION_LOSS', dr: '70200', cr: '10100', desc: 'Lease termination — loss on derecognition', ifrs: 'IFRS 16.B98' },
      { screen: 'GLOBAL', type: 'IMPAIRMENT', dr: '60200', cr: '10100', desc: 'Impairment of ROU asset', ifrs: 'IAS 36' },
      { screen: 'GLOBAL', type: 'SUBLEASE_INCOME', dr: '10100', cr: '40100', desc: 'Sub-lease rental income received', ifrs: 'IFRS 16.53' },
      { screen: 'GLOBAL', type: 'RENEWAL', dr: '10100', cr: '20100', desc: 'Lease renewal — remeasure ROU and liability', ifrs: 'IFRS 16.20-21' },
      { screen: 'GLOBAL', type: 'FX_REVALUATION', dr: '60300', cr: '20100', desc: 'Foreign exchange revaluation on lease liability', ifrs: 'IAS 21' },
      { screen: 'GLOBAL', type: 'SECURITY_DEPOSIT_PAID', dr: '11100', cr: '10100', desc: 'Security deposit paid to lessor', ifrs: 'N/A' },
      { screen: 'GLOBAL', type: 'RENT_PREPAYMENT', dr: '11200', cr: '10100', desc: 'Prepaid rent (short-term or low-value)', ifrs: 'IFRS 16.5-8' },
    ];

    let count = 0;
    for (const rule of DEFAULT_GL_RULES) {
      try {
        await this.upsertGLCodeRule({
          screenId: rule.screen,
          transactionType: rule.type,
          debitGLCode: rule.dr,
          creditGLCode: rule.cr,
          description: rule.desc,
          ifrsReference: rule.ifrs,
          priority: 50,
          createdByAI: false,
          updatedBy: updatedBy,
        });
        count++;
      } catch {
        // Continue seeding even if one fails
      }
    }
    return count;
  }
}

// ── Safe Math Evaluator ────────────────────────────────────────────────────────
// Evaluates mathematical expressions without using eval()
// Supports: +, -, *, /, **, %, (), Math functions, comparison operators

function safeEvaluate(expression: string): any {
  // Whitelist allowed tokens
  const sanitized = expression
    .replace(/Math\.(abs|ceil|floor|round|pow|sqrt|min|max|log|exp)/g, '$&') // allow Math functions
    .replace(/[^0-9+\-*/().%<>=!&|, Math.absceilflooroundpowsqrtminmaxlogexp\s]/g, ''); // strip dangerous chars

  try {
    // Use Function constructor with restricted scope (safer than eval)
    const fn = new Function('Math', `"use strict"; return (${sanitized});`);
    return fn(Math);
  } catch (err: any) {
    throw new Error(`Formula evaluation failed: ${err.message}. Expression: ${expression}`);
  }
}

export default RulesEngine;
