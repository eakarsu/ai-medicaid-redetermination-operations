import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const pg = require(path.join(root, 'backend', 'node_modules', 'pg'));
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const databaseUrl = process.env.DATABASE_URL || `postgresql://${os.userInfo().username}@127.0.0.1:5432/${app.dbName}`;

function assert(value, message) { if (!value) throw new Error(message); }

async function main() {
  assert(app.workflows.length === 10, 'expected 10 custom AI workflows');
  assert(app.operations.length === 21, 'expected 21 domain operational tables');
  assert(app.integrations.length >= 8, 'expected domain integrations');
  assert(app.domainProduct?.features?.length === 8, 'expected eight native domain capabilities');
  assert(new Set(app.domainProduct.features.map(feature => feature.title)).size === 8, 'domain capability titles must be unique');
  for (const feature of app.domainProduct.features) {
    assert(feature.modules.length >= 2, `${feature.id} must combine multiple domain data sources`);
    assert(feature.actions.length >= 2, `${feature.id} must expose domain decisions`);
    assert(feature.modules.every(id => app.operations.some(module => module.id === id)), `${feature.id} references a missing PostgreSQL module`);
  }
  for (const workflow of app.workflows) {
    assert(workflow.fields.length >= 4, `${workflow.id} field schema is shallow`);
    assert(workflow.examples.length === 3, `${workflow.id} needs three fillers`);
    assert(workflow.aiActions.length === 3, `${workflow.id} needs three OpenRouter actions`);
    const keys = workflow.fields.map(field => field.key).sort().join(',');
    assert(workflow.examples.every(example => Object.keys(example.values).sort().join(',') === keys), `${workflow.id} filler misses fields`);
    assert(workflow.examples.every(example => Object.values(example.values).every(value => value !== '' && value !== null)), `${workflow.id} filler leaves optional input empty`);
  }
  for (const relative of ['frontend/src/App.jsx','frontend/src/main.jsx','frontend/vite.config.mjs','backend/server.mjs','backend/migrations/001_schema.sql','backend/scripts/seed.mjs']) assert(fs.existsSync(path.join(root, relative)), `missing ${relative}`);
  assert(!fs.existsSync(path.join(root, 'database.sqlite')), 'SQLite artifact must not exist');
  assert(!fs.existsSync(path.join(root, 'app.py')), 'Python application server must not exist');
  const frontend = fs.readFileSync(path.join(root, 'frontend/src/App.jsx'), 'utf8');
  const backend = fs.readFileSync(path.join(root, 'backend/server.mjs'), 'utf8');
  assert(frontend.includes("from 'react'"), 'frontend is not React');
  assert(frontend.includes('onClick={() => onOpen(item)}'), 'audit/queue click handler missing');
  assert(frontend.includes('OpenRouter'), 'provider status missing from React');
  assert(frontend.includes('function RichText'), 'professional AI narrative renderer missing');
  assert(frontend.includes('Material assumption'), 'AI assumption callout missing');
  assert(frontend.includes('DomainCapability'), 'native domain capability UI missing');
  assert(frontend.includes('ClaimsStudio'), 'MMIS claims studio UI missing');
  assert(frontend.includes('Architecture'), 'MITA & compliance UI missing');
  assert(frontend.includes('Permitted {feature.title} actions'), 'domain decision controls missing');
  assert(backend.includes('/chat/completions'), 'OpenRouter backend request missing');
  assert(backend.includes('function extractJsonObject'), 'resilient OpenRouter JSON extraction missing');
  assert(!backend.includes("{ title: 'OpenRouter analysis'"), 'raw JSON fallback must not be rendered');
  assert(backend.includes("'/domain/:featureId/actions/:actionId'"), 'domain action API missing');
  assert(backend.includes('OPENROUTER_API_KEY'), 'OpenRouter credential boundary missing');
  assert(backend.includes("import pg from 'pg'"), 'PostgreSQL backend missing');
  assert(backend.includes('requirePermission'), 'RBAC enforcement missing from the API surface');
  for (const complianceModule of ['backend/src/rbac.mjs','backend/src/security.mjs','backend/src/x12.mjs','backend/src/fhir.mjs','backend/src/events.mjs','backend/src/mita.mjs','backend/src/adjudication.mjs','backend/src/fwa.mjs','backend/src/batch.mjs','backend/src/reporting.mjs','backend/src/mfa.mjs','backend/src/kafka.mjs','backend/src/mailer.mjs','backend/migrations/002_compliance.sql','backend/migrations/003_mmis.sql','backend/migrations/004_security.sql']) assert(fs.existsSync(path.join(root, complianceModule)), `missing ${complianceModule}`);
  const x12Module = fs.readFileSync(path.join(root, 'backend/src/x12.mjs'), 'utf8');
  assert(["'270'", "'271'", "'834'", "'837'", "'835'", "'999'"].every(set => x12Module.includes(set)), 'X12 270/271/834/837/835/999 transaction support missing');
  const mitaModule = fs.readFileSync(path.join(root, 'backend/src/mita.mjs'), 'utf8');
  assert(mitaModule.includes('targetMaturity'), 'MITA maturity assessment missing');
  const fhirModule = fs.readFileSync(path.join(root, 'backend/src/fhir.mjs'), 'utf8');
  assert(fhirModule.includes("resourceType: 'Patient'") && fhirModule.includes("resourceType: 'Coverage'"), 'FHIR R4 resource mapping missing');
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  assert(compose.includes('bitnami/kafka') && compose.includes('mailpit'), 'real Kafka broker and SMTP server missing from docker-compose');
  const mfaModule = fs.readFileSync(path.join(root, 'backend/src/mfa.mjs'), 'utf8');
  assert(mfaModule.includes('otpauth://totp/') && mfaModule.includes("createHmac('sha1'"), 'RFC 6238 TOTP MFA missing');
  const eventsModule = fs.readFileSync(path.join(root, 'backend/src/events.mjs'), 'utf8');
  assert(eventsModule.includes('event_outbox') && eventsModule.includes('publishToKafka'), 'transactional event outbox with Kafka producer wiring missing');
  const securityModule = fs.readFileSync(path.join(root, 'backend/src/security.mjs'), 'utf8');
  assert(securityModule.includes('aes-256-gcm'), 'ePHI field encryption missing');
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const tableRows = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    const tables = new Set(tableRows.rows.map(row => row.tablename));
    for (const required of ['app_users','workflow_cases','audit_events','saved_analyses','integration_state','event_outbox','x12_transactions','mmis_claims','security_events',...app.operations.map(module => module.table)]) assert(tables.has(required), `missing PostgreSQL table ${required}`);
    assert(Number((await pool.query('SELECT COUNT(*) count FROM app_users')).rows[0].count) === 3, 'demo users not seeded');
    assert(Number((await pool.query('SELECT COUNT(*) count FROM workflow_cases')).rows[0].count) === 150, 'workflow cases not seeded');
    let operationRows = 0;
    for (const module of app.operations) operationRows += Number((await pool.query(`SELECT COUNT(*) count FROM "${module.table}"`)).rows[0].count);
    assert(operationRows >= 315, `domain tables must contain the 315 seeded rows (found ${operationRows})`);
    assert(Number((await pool.query('SELECT COUNT(*) count FROM mmis_claims')).rows[0].count) >= 8, 'MMIS seed claims not seeded');
  } finally { await pool.end(); }
  console.log(`Validated ${app.id}: 8 native domain capabilities, 21 operational tables, 465 rows, X12/FHIR/MMIS compliance layer, React, OpenRouter`);
}

main().catch(error => { console.error(error.message); process.exit(1); });
