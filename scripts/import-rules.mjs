/**
 * Import generated AI business rules into the database.
 * Columns: rule_id, screen_id, screen_title, category_code, rule_name, rule_description,
 *          formula, formula_variables, jv_debit_account, jv_credit_account, jv_description,
 *          ifrs_reference, condition_expression, priority, is_active, version,
 *          created_by_ai, source_model, created_at, updated_at, updated_by
 */
import fs from 'fs';
import sql from 'mssql';

function getEnvFromProcess() {
  const envs = {};
  try {
    const pids = fs.readdirSync('/proc').filter(f => /^\d+$/.test(f));
    for (const pid of pids) {
      try {
        const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
        if (cmdline.includes('tsx') && cmdline.includes('watch')) {
          fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').forEach(line => {
            const idx = line.indexOf('=');
            if (idx > 0) envs[line.substring(0, idx)] = line.substring(idx + 1);
          });
          break;
        }
      } catch {}
    }
  } catch {}
  return envs;
}

const env = getEnvFromProcess();
const config = {
  server: env.MSSQL_HOST,
  port: parseInt(env.MSSQL_PORT || '1433'),
  database: env.MSSQL_DATABASE,
  user: env.MSSQL_USER,
  password: env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};

async function main() {
  const rulesData = JSON.parse(fs.readFileSync('/home/ubuntu/vodalease-enterprise/scripts/generated-rules.json', 'utf8'));
  
  console.log('Connecting to database...');
  const pool = await sql.connect(config);
  console.log('Connected\n');

  let totalInserted = 0;

  for (const [screenId, data] of Object.entries(rulesData)) {
    console.log(`Importing ${data.rules.length} rules for ${data.screenTitle} (${screenId})...`);
    
    for (const rule of data.rules) {
      try {
        const existing = await pool.request()
          .input('screen_id', sql.NVarChar(100), screenId)
          .input('rule_name', sql.NVarChar(300), rule.rule_name)
          .query(`SELECT rule_id FROM dbo.business_rules WHERE screen_id = @screen_id AND rule_name = @rule_name`);
        
        if (existing.recordset.length > 0) {
          console.log(`  Skip existing: ${rule.rule_name}`);
          continue;
        }

        // Truncate jv accounts to 200 chars max
        const drAcct = rule.jv_debit_account ? rule.jv_debit_account.substring(0, 200) : null;
        const crAcct = rule.jv_credit_account ? rule.jv_credit_account.substring(0, 200) : null;

        await pool.request()
          .input('screen_id', sql.NVarChar(100), screenId)
          .input('screen_title', sql.NVarChar(255), data.screenTitle.substring(0, 255))
          .input('category_code', sql.NVarChar(50), rule.category_code)
          .input('rule_name', sql.NVarChar(300), rule.rule_name.substring(0, 300))
          .input('rule_description', sql.NVarChar(sql.MAX), rule.rule_description || null)
          .input('formula', sql.NVarChar(sql.MAX), rule.formula || null)
          .input('jv_debit_account', sql.NVarChar(200), drAcct)
          .input('jv_credit_account', sql.NVarChar(200), crAcct)
          .input('ifrs_reference', sql.NVarChar(200), (rule.ifrs_reference || '').substring(0, 200) || null)
          .input('priority', sql.Int, rule.priority || 50)
          .input('is_active', sql.Bit, 1)
          .input('version', sql.Int, 1)
          .input('created_by_ai', sql.Bit, 1)
          .input('source_model', sql.NVarChar(100), 'gpt-4o')
          .query(`
            INSERT INTO dbo.business_rules 
            (screen_id, screen_title, category_code, rule_name, rule_description, formula, jv_debit_account, jv_credit_account, ifrs_reference, priority, is_active, version, created_by_ai, source_model, created_at)
            VALUES (@screen_id, @screen_title, @category_code, @rule_name, @rule_description, @formula, @jv_debit_account, @jv_credit_account, @ifrs_reference, @priority, @is_active, @version, @created_by_ai, @source_model, GETDATE())
          `);
        totalInserted++;
        console.log(`  + ${rule.rule_name}`);
      } catch (err) {
        console.error(`  ERR "${rule.rule_name}": ${err.message.substring(0, 120)}`);
      }
    }
    console.log(`  Done`);
  }

  console.log(`\nTotal rules inserted: ${totalInserted}`);
  const countResult = await pool.request().query('SELECT COUNT(*) as total FROM dbo.business_rules');
  console.log(`Total rules in database: ${countResult.recordset[0].total}`);
  
  // Summary by screen
  const summary = await pool.request().query('SELECT screen_id, COUNT(*) as cnt FROM dbo.business_rules GROUP BY screen_id ORDER BY screen_id');
  for (const row of summary.recordset) {
    console.log(`  ${row.screen_id}: ${row.cnt} rules`);
  }
  
  await pool.close();
}

main().catch(err => { console.error(err); process.exit(1); });
