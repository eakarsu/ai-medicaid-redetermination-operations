import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const backendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const projectRoot = path.dirname(backendRoot);
const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const owners = ['Avery Morgan', 'Jordan Lee', 'Taylor Brooks', 'Morgan Chen', 'Riley Patel'];
const risks = ['Low', 'Moderate', 'High', 'Critical'];
const regions = ['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West'];
// Realistic persona pools for beneficiary records (synthetic by design — real beneficiary PHI
// is legally restricted; production loads state hub feeds). Providers use the real NPPES NPI
// check-digit algorithm; drugs use the FDA NDC 5-4-2 format (verify codes against the NDC directory).
const PERSONAS_FIRST = ['Maria', 'James', 'Aisha', 'Daniel', 'Sofia', 'Ethan', 'Priya', 'Marcus', 'Elena', 'Carlos', 'Grace', 'Omar', 'Nina', 'Victor', 'Lily', 'Hassan', 'Rosa', 'Kevin', 'Amara', 'Leo'];
const PERSONAS_LAST = ['Ramirez', 'Okafor', 'Nguyen', 'Patel', 'Kim', 'Johnson', 'Garcia', 'Chen', 'Ali', 'Novak', 'Brown', 'Davis', 'Silva', 'Cohen', 'Haddad', 'Lopez', 'Walker', 'Rossi', 'Mensah', 'Kowalski'];
const PRACTICES = ['Community Family Health Center', 'Lakeside Pediatrics', 'Riverbend Internal Medicine', 'Summit Orthopedics', 'Maple Cardiology', 'Harborview Family Practice', 'Cedar Grove Clinic', 'Northside Medical Group', 'Unity Community Health', 'Pioneer Medical Associates'];
const DRUGS = [
  ['0378-0525-01', 'Amoxicillin 500 mg capsule'],
  ['68180-0513-01', 'Lisinopril 10 mg tablet'],
  ['00378-3183-05', 'Metformin 500 mg tablet'],
  ['0071-0156-23', 'Atorvastatin 20 mg tablet'],
  ['0093-5207-67', 'Amlodipine 5 mg tablet'],
  ['59762-1239-01', 'Sertraline 50 mg tablet'],
  ['00173-0682-20', 'Albuterol HFA inhaler 90 mcg'],
  ['0517-1656-01', 'Ibuprofen 200 mg tablet'],
  ['0002-7535-10', 'Insulin glargine 100 unit/mL'],
  ['00185-0160-01', 'Omeprazole 20 mg capsule'],
];

// NPI Luhn check digit per the NPPES algorithm: prepend 80840 to the 9-digit base.
function npi(seedValue) {
  const base = String((seedValue * 7919 + 123456789) % 900000000 + 100000000).slice(0, 9);
  const digits = '80840'.split('').concat(base.split('')).map(Number).reverse();
  let sum = 0;
  digits.forEach((digit, position) => { if (position % 2 === 0) { digit *= 2; if (digit > 9) digit -= 9; } sum += digit; });
  return base + String((10 - (sum % 10)) % 10);
}

function identifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error('Unsafe SQL identifier');
  return `"${value}"`;
}

function isoDate(offset) {
  const value = new Date(Date.UTC(2026, 7, 1 + offset));
  return value.toISOString().slice(0, 10);
}

function seedValue(field, index) {
  if (field.options?.length) return field.options[index % field.options.length];
  if (field.type === 'date') return isoDate(index * 3);
  if (field.type === 'number') return (index + 3) * 17;
  if (field.type === 'currency') return (index + 1) * 18750;
  if (field.type === 'textarea') return `Evidence package ${index + 1} with source validation, exception rationale, financial context, and reviewer notes.`;
  return `${field.label} ${String(index + 1).padStart(2, '0')}`;
}

async function main() {
  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT COUNT(*)::int count FROM app_users');
    if (existing.rows[0].count > 0 && process.env.SEED_FORCE !== '1') {
      console.log(`Seed already present for ${config.id}; preserving PostgreSQL data`);
      return;
    }
    await client.query('BEGIN');
    const operationTables = config.operations.map(module => identifier(module.table)).join(',');
    await client.query(`TRUNCATE ${operationTables},workflow_cases,saved_analyses,audit_events,integration_state,mmis_claims,app_users RESTART IDENTITY CASCADE`);
    const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD || 'LocalDemo!2026', 12);
    for (const [email, name, role] of [
      ['runtime-admin@example.com', 'Runtime Administrator', 'admin'],
      ['operations-lead@example.com', 'Operations Lead', 'operator'],
      ['reviewer@example.com', 'Independent Reviewer', 'reviewer'],
    ]) await client.query('INSERT INTO app_users(email,name,role,password_hash) VALUES($1,$2,$3,$4)', [email, name, role, passwordHash]);
    for (let workflowIndex = 0; workflowIndex < config.workflows.length; workflowIndex += 1) {
      const workflow = config.workflows[workflowIndex];
      for (let index = 0; index < 15; index += 1) {
        const payload = Object.fromEntries(workflow.fields.map(field => [field.key, seedValue(field, index)]));
        await client.query('INSERT INTO workflow_cases(workflow_id,reference,subject,owner,state,risk,due_date,amount,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [workflow.id, `${config.id.slice(0,5).toUpperCase()}-${String(workflowIndex + 1).padStart(2,'0')}-${String(index + 1).padStart(3,'0')}`, `${workflow.title} — ${regions[index % regions.length]} case ${index + 1}`, owners[index % owners.length], ['intake','analyzing','review','approved','closed'][index % 5], risks[index % 4], isoDate(index * 3 + workflowIndex), (index + 1) * (workflowIndex + 2) * 2750, payload]);
      }
    }
    for (let moduleIndex = 0; moduleIndex < config.operations.length; moduleIndex += 1) {
      const module = config.operations[moduleIndex];
      const names = ['reference','status','owner','risk','due_date','amount',...module.columns.map(column => column.dbKey)];
      const quoted = names.map(identifier).join(',');
      const parameters = names.map((_, index) => `$${index + 1}`).join(',');
      for (let index = 0; index < 15; index += 1) {
        const values = [`OPS-${String(moduleIndex + 1).padStart(2,'0')}-${String(index + 1).padStart(3,'0')}`, ['Open','Investigating','Review','Approved','Closed'][index % 5], owners[index % owners.length], risks[index % 4], isoDate(index * 2 + moduleIndex + 4), (index + 2) * (moduleIndex + 1) * 4100, ...module.columns.map(column => seedValue(column, index))];
        if (module.id === 'member-master') values[names.indexOf('data_name')] = `${PERSONAS_FIRST[(index * 7 + moduleIndex) % PERSONAS_FIRST.length]} ${PERSONAS_LAST[(index * 11 + moduleIndex) % PERSONAS_LAST.length]}`;
        if (module.id === 'provider-master') { values[names.indexOf('data_recordId')] = npi(moduleIndex * 17 + index + 3); values[names.indexOf('data_name')] = PRACTICES[(index + moduleIndex) % PRACTICES.length]; }
        if (module.id === 'pharmacy') { const [drugNdc, drugName] = DRUGS[index % DRUGS.length]; values[names.indexOf('data_ndcCode')] = drugNdc; values[names.indexOf('data_drugName')] = drugName; }
        await client.query(`INSERT INTO ${identifier(module.table)}(${quoted}) VALUES(${parameters})`, values);
      }
    }
    for (const integration of config.integrations) await client.query('INSERT INTO integration_state(id,name,category,mode,status) VALUES($1,$2,$3,$4,$5)', [integration.id, integration.name, integration.category, integration.mode, 'Configured']);
    for (let index = 0; index < 24; index += 1) await client.query('INSERT INTO audit_events(event_time,actor,action,object_type,object_reference,detail) VALUES($1,$2,$3,$4,$5,$6)', [new Date(Date.UTC(2026, 6, 23 + Math.floor(index / 8), 9 + index % 8, 15)), owners[index % owners.length], ['Reviewed','Assigned','Evidence attached','Status changed'][index % 4], ['AI workflow','Operational record','Control','Integration'][index % 4], `AUD-${String(index + 1).padStart(4,'0')}`, `Verified domain activity ${index + 1} with source evidence and reviewer attribution.`]);
    // Synthetic adjudicated claims exercising every MMIS path: paid, denied (duplicate,
    // prior-auth, non-enrolled provider), fee-schedule reduction, and an FWA outlier.
    const seededClaims = [
      ['ICN-SEED-0001', 'OPS-09-001', 'MED-1001', 'OPS-21-001', 'Community Family Practice', '99213', '2026-08-03', 150, 150, 120, 30, 'paid', 'Approved', null],
      ['ICN-SEED-0002', 'OPS-09-001', 'MED-1001', 'OPS-21-001', 'Community Family Practice', '99213', '2026-08-03', 150, 0, 0, 150, 'denied', 'Denied', 'DUP-01'],
      ['ICN-SEED-0003', 'OPS-09-001', 'MED-1001', 'OPS-21-001', 'Community Family Practice', '99214', '2026-08-10', 200, 200, 160, 40, 'paid', 'Approved', null],
      ['ICN-SEED-0004', 'OPS-09-004', 'MED-1004', 'OPS-21-001', 'Community Family Practice', '27447', '2026-08-12', 2500, 0, 0, 2500, 'denied', 'Denied', 'PA-01'],
      ['ICN-SEED-0005', 'OPS-09-004', 'MED-1004', 'OPS-21-003', ' Lakeside Orthopedics', '99213', '2026-08-20', 150, 0, 0, 150, 'denied', 'Denied', 'PRV-01'],
      ['ICN-SEED-0006', 'OPS-09-005', 'MED-1005', 'OPS-21-001', 'Community Family Practice', '99213', '2026-08-21', 700, 180, 144, 36, 'adjudicated', 'Partially Approved', 'CO-45'],
      ['ICN-SEED-0007', 'OPS-09-006', 'MED-1006', 'OPS-21-001', 'Community Family Practice', '80053', '2026-08-25', 45, 45, 36, 9, 'paid', 'Approved', null],
      ['ICN-SEED-0008', 'OPS-09-006', 'MED-1006', 'OPS-21-001', 'Community Family Practice', '80053', '2026-08-25', 45, 0, 0, 45, 'denied', 'Denied', 'DUP-01'],
    ];
    for (const [icn, memberRef, memberId, providerRef, providerName, procedure, serviceDate, billed, allowed, paid, patientResponsibility, status, decision, denial] of seededClaims) {
      await client.query(
        `INSERT INTO mmis_claims(icn,member_reference,member_id,provider_reference,provider_name,procedure_code,service_date,total_billed,allowed,paid,patient_responsibility,status,decision,denial_code,trace,actor)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'system-seed')`,
        [icn, memberRef, memberId, providerRef, providerName, procedure, serviceDate, billed, allowed, paid, patientResponsibility, status, decision, denial, JSON.stringify([{ step: 'Seeded adjudication', result: decision, detail: denial ? `Synthetic denial ${denial} retained for program-integrity demonstration.` : 'Synthetic adjudicated claim for claims-payment demonstration.' }])],
      );
    }
    await client.query('COMMIT');
    console.log(`Seeded ${config.id}: 3 users, 150 workflow cases, 315 operational rows, 8 MMIS claims`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
