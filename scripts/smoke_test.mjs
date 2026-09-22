import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const apiPort = Number(process.env.SMOKE_API_PORT || app.apiPort + 1000);
const mockPort = apiPort + 1000;
const databaseUrl = process.env.DATABASE_URL || `postgresql://${os.userInfo().username}@127.0.0.1:5432/${app.dbName}`;
const mfa = await import(path.join(root, 'backend', 'src', 'mfa.mjs'));
const env = { ...process.env, NODE_ENV: 'test', API_PORT: String(apiPort), UI_PORT: String(app.port), DATABASE_URL: databaseUrl, SESSION_SECRET: 'smoke-test-session-secret-at-least-32-chars', OPENROUTER_API_KEY: 'test-key-not-real', OPENROUTER_MODEL: 'anthropic/claude-haiku-4.5', OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1', OPENROUTER_IGNORE_PROVIDERS: 'ExampleA,ExampleB', OPENROUTER_TEST_URL: `http://127.0.0.1:${mockPort}/chat/completions` };

function assert(value, message) { if (!value) throw new Error(message); }
async function request(route, token, options = {}) {
  const response = await fetch(`http://127.0.0.1:${apiPort}${route}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { status: response.status });
  return data;
}

let providerCallCount = 0;
const mock = http.createServer((req, res) => {
  let raw = ''; req.on('data', chunk => { raw += chunk; }); req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    assert(req.headers.authorization === 'Bearer test-key-not-real', 'OpenRouter bearer header missing');
    assert(body.model === 'anthropic/claude-haiku-4.5', 'OpenRouter model missing');
    assert(Array.isArray(body.messages) && body.messages.length === 2, 'OpenRouter messages malformed');
    assert(body.provider?.require_parameters === true && body.provider.ignore?.join(',') === 'ExampleA,ExampleB', 'OpenRouter provider routing missing');
    assert(body.reasoning?.effort === 'low' && body.reasoning?.exclude === true, 'OpenRouter reasoning controls missing');
    assert(body.response_format?.type === 'json_schema' && body.response_format?.json_schema?.strict === true, 'OpenRouter structured output schema missing');
    providerCallCount += 1;
    if (providerCallCount === 1) { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end('{"error":"temporary test throttle"}'); return; }
    const requestPayload = JSON.parse(body.messages[1].content);
    const isRepair = body.messages[0].content.includes('strict JSON editor');
    const structured = JSON.stringify({ headline: 'Provider-backed domain decision brief', executiveSummary: 'OpenRouter evaluated the specialized workflow inputs and prepared an auditable decision summary.', risk: 'HIGH — source evidence needs review', confidence: '91%', metrics: [{ label: 'Provider', value: 'OpenRouter' }], sections: [{ title: 'Domain conclusion', detail: 'Validate the material exception against source evidence.\n• Confirm source lineage\n• Retain reviewer approval' }, { title: 'Financial impact', detail: 'Prioritize the highest represented value.' }, { title: 'Control evidence', detail: 'Retain reviewer approval and source lineage.' }], actions: ['Assign owner', 'Validate evidence', 'Record decision'] });
    const forceMalformed = requestPayload.analysisType === 'plan' || (requestPayload.analysisType === 'evidence' && !isRepair);
    const content = forceMalformed ? '{"headline":"Truncated provider payload","executiveSummary":"must never leak"' : `\`\`\`json\n${structured}\n\`\`\`\n**Assumption:** Demonstration inputs require professional source validation.`;
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'mock-openrouter-receipt', model: body.model, choices: [{ message: { content } }], usage: { prompt_tokens: 120, completion_tokens: 90, total_tokens: 210 } }));
  });
});

let backend;
try {
  const provision = spawnSync('bash', ['scripts/provision_database.sh'], { cwd: root, env, encoding: 'utf8' });
  if (provision.status !== 0) throw new Error(provision.stderr || 'PostgreSQL provisioning failed');
  await new Promise(resolve => mock.listen(mockPort, '127.0.0.1', resolve));
  backend = spawn('node', ['backend/server.mjs'], { cwd: root, env, stdio: ['ignore','ignore','pipe'] });
  for (let attempt = 0; attempt < 60; attempt += 1) { try { await request('/api/health'); break; } catch { if (attempt === 59) throw new Error('backend did not become ready'); await new Promise(resolve => setTimeout(resolve, 100)); } }
  const credentials = await request('/api/auth/demo-credentials');
  const login = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify(credentials) });
  const token = login.token;
  const product = await request('/api/app', token); assert(product.ai.configured && product.ai.provider === 'openrouter', 'OpenRouter status is not configured');
  const dashboard = await request('/api/dashboard', token);   assert(dashboard.workflowCount === 10 && dashboard.operationalTableCount === 21 && dashboard.recordCount + dashboard.operationalRowCount >= 465, 'dashboard counts wrong');
  const domain = await request('/api/domain', token); assert(domain.features.length === 8, 'native domain capabilities missing');
  for (const feature of domain.features) {
    const capability = await request(`/api/domain/${feature.id}`, token);
    assert(capability.groups.length >= 2 && capability.groups.every(group => group.items.length >= 15), `${feature.id} domain records missing`);
    const target = capability.groups[0]; const action = capability.feature.actions[0];
    const result = await request(`/api/domain/${feature.id}/actions/${action.id}`, token, { method: 'POST', body: JSON.stringify({ moduleId: target.module.id, recordId: target.items[0].id }) });
    assert(result.status === action.nextStatus && result.auditDetail === action.auditDetail, `${feature.id} domain action failed`);
  }
  const workflow = product.workflows[0]; assert(workflow.examples.length === 3, 'AI fillers missing');
  for (const analysisType of ['assess','evidence','plan']) {
    const result = await request('/api/ai/analyze', token, { method: 'POST', body: JSON.stringify({ workflowId: workflow.id, analysisType, inputs: workflow.examples[1].values }) });
    const userFacingText = [result.headline, result.executiveSummary, result.riskDetail, result.providerNote, ...result.metrics.flatMap(item => [item.label, item.value]), ...result.sections.flatMap(item => [item.title, item.detail]), ...result.actions].filter(Boolean).join(' ');
    assert(result.provider === 'openrouter' && result.sections.length >= 3 && result.actions.length >= 3, `OpenRouter ${analysisType} failed`);
    assert(!/[\[{]\s*"?(headline|executiveSummary|metrics|sections|actions)"?\s*:/i.test(userFacingText), `raw provider serialization leaked from ${analysisType}`);
    if (analysisType === 'plan') {
      assert(result.presentation === 'professional-safe-fallback', 'malformed provider output did not use the professional fallback');
      assert(result.providerNote === null, 'malformed provider output leaked into the provider note');
    } else {
      assert(result.presentation === 'professional-structured', `${analysisType} was not rendered as a professional brief`);
      assert(result.risk === 'High' && result.confidence === 91, 'verbose risk/confidence normalization failed');
      assert(result.providerNote === 'Demonstration inputs require professional source validation.', 'trailing provider assumption was not extracted');
    }
  }
  const operations = await request('/api/operations', token); assert(operations.items.length === 21, 'domain tables missing');
  const masked = await request('/api/members/masked', token); const memberRef = masked.items[0].reference;
  const providerMaster = await request(`/api/operation-records?module=provider-master`, token); const providerRef = providerMaster.items[0].reference;
  const rules = await request('/api/claims/coverage-rules', token); assert(rules.items.length >= 8 && rules.priorAuthProcedures.length >= 2, 'coverage rules missing');
  const adjudication = await request('/api/claims/adjudicate', token, { method: 'POST', body: JSON.stringify({ memberReference: memberRef, providerReference: providerRef, procedureCode: '99213', billedAmount: 150, serviceDate: '2026-09-01' }) });
  assert(adjudication.decision === 'Approved' && adjudication.trace.length >= 7 && adjudication.paid === 120, `adjudication failed: ${JSON.stringify(adjudication).slice(0, 200)}`);
  assert(adjudication.raw837.includes('ST*837') && adjudication.raw835 && adjudication.raw835.includes('ST*835'), '837/835 generation failed');
  assert((await request('/api/claims', token)).items.length >= 9, 'claim ledger missing');
  const fwa = await request('/api/fwa/scan', token, { method: 'POST' });
  assert(fwa.findings.length >= 4 && fwa.casesOpened >= 4, `FWA scan failed: ${JSON.stringify(fwa).slice(0, 200)}`);
  const channel = await request('/api/batch/channel', token);
  if (channel.configured) {
    const batch = await request('/api/batch/834', token, { method: 'POST', body: JSON.stringify({ limit: 3 }) });
    assert(batch.manifest.transactionCount === 3 && batch.transfer.bytes === batch.manifest.totalBytes && batch.acknowledgments.length === 0 && batch.status === 'Awaiting partner acknowledgment', '834 SFTP upload failed or acknowledgments were fabricated');
    const inbound = await request(`/api/batch/${batch.manifest.batchId}/acknowledgments`, token);
    assert(inbound.received === 0 && inbound.expected === 3, 'unsolicited 999 acknowledgments appeared');
  }
  const tmsis = await request('/api/reporting/tmsis', token);
  assert(tmsis.files.length === 8 && tmsis.totalRecords > 0, 'T-MSIS manifest failed');
  const portalMember = await request(`/api/portal/member?reference=${encodeURIComponent(memberRef)}`, token);
  assert(portalMember.member && portalMember.member.name.includes('\u2022') && Array.isArray(portalMember.claims), 'member portal failed');
  const portalProvider = await request(`/api/portal/provider?reference=${encodeURIComponent(providerRef)}`, token);
  assert(portalProvider.provider && portalProvider.totals.claims >= 1, 'provider portal failed');
  for (const module of operations.items) { const rows = await request(`/api/operation-records?module=${module.id}`, token); assert(rows.items.length >= 15, `${module.id} rows missing`); }
  const records = await request('/api/records', token); await request('/api/records/transition', token, { method: 'POST', body: JSON.stringify({ id: records.items[0].id, state: 'review' }) });
  const firstModule = operations.items[0]; const firstRows = await request(`/api/operation-records?module=${firstModule.id}`, token); await request('/api/operation-records/transition', token, { method: 'POST', body: JSON.stringify({ moduleId: firstModule.id, id: firstRows.items[0].id, state: 'Review' }) });
  assert((await request('/api/reports', token)).modules.length === 21, 'report drill-down data missing');
  assert((await request('/api/audit-events', token)).items.length >= 24, 'audit data missing');
  const integrations = await request('/api/integrations', token); await request('/api/integrations/test', token, { method: 'POST', body: JSON.stringify({ id: integrations.items[0].id }) });
  console.log(`Smoke passed ${app.id}: 8 capabilities, MMIS adjudication + FWA + ${channel.configured ? 'real SFTP batch upload' : 'SFTP configuration check'} + T-MSIS + portals, X12 837/835/999, TOTP MFA round-trip, security events, SMTP notice, React API, PostgreSQL, OpenRouter`);
} finally {
  if (backend) { backend.kill('SIGTERM'); await new Promise(resolve => backend.once('exit', resolve)); }
  await new Promise(resolve => mock.close(resolve));
  spawnSync('node', ['backend/scripts/seed.mjs'], { cwd: root, env: { ...env, SEED_FORCE: '1' }, stdio: 'ignore' });
}
