/**
 * Batch-generate AI business rules for core IFRS 16 screens.
 * Run: node scripts/generate-rules.mjs
 */
import 'dotenv/config';

const BASE = process.env.VITE_FRONTEND_FORGE_API_URL || process.env.BUILT_IN_FORGE_API_URL;
const KEY  = process.env.BUILT_IN_FORGE_API_KEY;

if (!BASE || !KEY) {
  console.error('Missing BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY');
  process.exit(1);
}

const SCREENS = [
  { screenId: 'VFLNEWLEA0001P001', screenTitle: 'New Lease — Initial Recognition (Day 1 Entry)',
    context: 'This screen handles IFRS 16 initial recognition. Calculates ROU Asset, Lease Liability, IDC, deposits. Generates Day-1 JV: Dr ROU Asset / Cr Lease Liability. Uses IBR discount rate, PV of lease payments, initial direct costs, lease incentives. Covers IFRS 16.22-28.' },
  { screenId: 'VFLAMORT0001P001', screenTitle: 'Amortisation Schedule — Monthly Entries',
    context: 'This screen computes and displays the IFRS 16 amortisation schedule. Monthly entries: Interest Expense (effective interest method on lease liability), Principal Reduction (lease payment minus interest), Depreciation (straight-line on ROU asset). Covers IFRS 16.31-38.' },
  { screenId: 'VFLRMSENG0001P001', screenTitle: 'Remeasurement Engine',
    context: 'This screen handles IFRS 16 remeasurement events. Triggers: CPI/index change, term extension/reduction, payment change. Recalculates lease liability at revised discount rate, adjusts ROU asset. Generates adjustment JV. Prospective only — old entries never reversed. Covers IFRS 16.39-46.' },
  { screenId: 'VFLLSMOD0001P001', screenTitle: 'Lease Modification',
    context: 'This screen handles IFRS 16 lease modifications. Determines if modification is separate lease or remeasurement. Scope increase/decrease, term change, payment change. Generates modification JV. Covers IFRS 16.44-46.' },
  { screenId: 'VFACC-PERDCLOSE-001', screenTitle: 'Period-End Close — Monthly Closing Entries',
    context: 'This screen handles IFRS 16 period-end closing. Generates monthly JVs for all active leases: depreciation, interest, payment. Validates all entries balance. Covers IFRS 16.49-52.' },
  { screenId: 'VFLLSECLS0001P001', screenTitle: 'Lease Classification',
    context: 'This screen handles IFRS 16 lease classification. Tests: transfer of ownership, purchase option, lease term > 75% of economic life, PV of payments > 90% of fair value, specialized nature. Determines finance vs operating lease. Covers IFRS 16.63-66.' },
  { screenId: 'VFLIFRDSC0001P001', screenTitle: 'IFRS 16 Disclosure Notes',
    context: 'This screen generates IFRS 16 disclosure notes. Maturity analysis, expense breakdown, ROU asset rollforward, lease liability rollforward, weighted average IBR, short-term/low-value exemptions. Covers IFRS 16.47-60.' },
];

async function generateRulesForScreen(screen) {
  const systemPrompt = `You are an IFRS 16 lease accounting expert. Generate structured business rules for the "${screen.screenTitle}" screen of an enterprise lease management system.

Context: ${screen.context}

Generate rules in these categories:
1. CALCULATION — formulas with variables (e.g., "lease_liability = PV(payments, IBR, term)")
2. VALIDATION — business validations (e.g., "discount_rate must be > 0 and < 100%")
3. JV_PATTERN — journal entry patterns (e.g., "Dr ROU Asset 10100 / Cr Lease Liability 20100")
4. STANDARD_REF — IFRS 16 paragraph references with brief explanation

Return a JSON array of rules. Each rule must have:
{
  "category_code": "CALCULATION" | "VALIDATION" | "JV_PATTERN" | "STANDARD_REF",
  "rule_name": "short descriptive name",
  "rule_description": "detailed explanation",
  "formula": "formula expression if applicable, else null",
  "jv_debit_account": "GL code if JV_PATTERN, else null",
  "jv_credit_account": "GL code if JV_PATTERN, else null",
  "ifrs_reference": "IFRS 16.XX or IAS XX reference",
  "priority": number 1-100
}

Generate 8-12 rules covering the key business logic for this screen.`;

  try {
    const resp = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate business rules for: ${screen.screenTitle}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'business_rules',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                rules: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      category_code: { type: 'string', enum: ['CALCULATION', 'VALIDATION', 'JV_PATTERN', 'STANDARD_REF'] },
                      rule_name: { type: 'string' },
                      rule_description: { type: 'string' },
                      formula: { type: ['string', 'null'] },
                      jv_debit_account: { type: ['string', 'null'] },
                      jv_credit_account: { type: ['string', 'null'] },
                      ifrs_reference: { type: 'string' },
                      priority: { type: 'integer' },
                    },
                    required: ['category_code', 'rule_name', 'rule_description', 'formula', 'jv_debit_account', 'jv_credit_account', 'ifrs_reference', 'priority'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['rules'],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`  ❌ API error for ${screen.screenId}: ${resp.status} ${text.substring(0, 200)}`);
      return null;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`  ❌ No content for ${screen.screenId}`);
      return null;
    }

    const parsed = JSON.parse(content);
    return parsed.rules || [];
  } catch (err) {
    console.error(`  ❌ Error for ${screen.screenId}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🔄 Generating AI business rules for 7 core IFRS 16 screens...\n');
  
  const allRules = {};
  
  for (const screen of SCREENS) {
    console.log(`📋 ${screen.screenTitle} (${screen.screenId})...`);
    const rules = await generateRulesForScreen(screen);
    if (rules) {
      allRules[screen.screenId] = { screenTitle: screen.screenTitle, rules };
      console.log(`  ✅ Generated ${rules.length} rules`);
    }
  }

  // Write output to a JSON file for import
  const outputPath = '/home/ubuntu/vodalease-enterprise/scripts/generated-rules.json';
  const fs = await import('fs');
  fs.writeFileSync(outputPath, JSON.stringify(allRules, null, 2));
  console.log(`\n✅ All rules saved to ${outputPath}`);
  
  // Summary
  let total = 0;
  for (const [sid, data] of Object.entries(allRules)) {
    total += data.rules.length;
    console.log(`  ${sid}: ${data.rules.length} rules`);
  }
  console.log(`\n📊 Total: ${total} rules across ${Object.keys(allRules).length} screens`);
}

main().catch(console.error);
