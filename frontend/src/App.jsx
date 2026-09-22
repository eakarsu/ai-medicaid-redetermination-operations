import React, { useEffect, useMemo, useState } from 'react';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0));
const pretty = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

async function api(path, options = {}) {
  const token = localStorage.getItem('portfolio_token');
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({ error: 'Invalid server response' }));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status, data });
  return data;
}

function Login({ health, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState([]);
  useEffect(() => { api('/api/auth/demo-credentials').then(credentials => setAccounts(credentials.accounts || [])).catch(() => {}); }, []);
  async function fill(account) { const credentials = await api('/api/auth/demo-credentials'); setEmail(account.email); setPassword(credentials.password); setError(`${account.name} (${account.role}) credentials filled — sign in to continue.`); }
  async function submit(event) { event.preventDefault(); try { const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); localStorage.setItem('portfolio_token', result.token); onLogin(); } catch (failure) { setError(failure.message); } }
  return <div className="login"><section className="loginHero"><span className="eyebrow">React · PostgreSQL · OpenRouter</span><h1>{health?.title || 'Loading…'}</h1><p>{health?.tagline || 'Specialized operations intelligence'}</p></section><section className="loginPanel"><form className="loginCard" onSubmit={submit}><h2>Sign in</h2><p className="muted">Access the provisioned PostgreSQL demonstration workspace.</p><div className="demo"><strong>Demo access</strong><span className="muted">One click fills a provisioned local account. Roles demonstrate the RBAC matrix.</span><div className="roleFill">{accounts.map(account => <button type="button" key={account.role} onClick={() => fill(account)}><strong>{account.name}</strong><small>{account.role} · {account.email}</small></button>)}</div></div><label>Email</label><input className="input" type="email" value={email} onChange={event => setEmail(event.target.value)} required/><label>Password</label><input className="input" type="password" value={password} onChange={event => setPassword(event.target.value)} required/><button className="primary wide">Sign in securely</button>{error && <div className="error">{error}</div>}</form></section></div>;
}

function Modal({ title, children, onClose, actions }) { return <div className="modalBackdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h3>{title}</h3><div className="modalHeaderActions">{actions || <button className="ghost" onClick={onClose}>Cancel</button>}</div></header><div className="modalBody">{children}</div></div></div>; }
function DetailGrid({ item }) { return <div className="detailGrid">{Object.entries(item).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => <div className="detail" key={key}><small>{pretty(key)}</small><strong>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</strong></div>)}</div>; }
function InfoModal({ detail, onClose, actions }) {
  const [copyLabel, setCopyLabel] = useState('Copy details');
  async function copy() {
    try { await navigator.clipboard.writeText(JSON.stringify(detail.item, null, 2)); setCopyLabel('Copied'); }
    catch { setCopyLabel('Copy unavailable'); }
  }
  return <Modal title={detail.title} onClose={onClose} actions={<>{actions}<button className="secondary" onClick={copy}>{copyLabel}</button><button className="ghost" onClick={onClose}>Cancel</button></>}><DetailGrid item={detail.item}/></Modal>;
}

function openOnKey(event, open) {
  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    open();
  }
}
function PageTitle({ title, subtitle }) { return <div className="pageTitle"><h2>{title}</h2><p>{subtitle}</p></div>; }
function Metric({ label, value }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }

const recordFields = module => [
  { key: 'reference', label: 'Reference', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Investigating', 'Review', 'Approved', 'Closed'] },
  { key: 'owner', label: 'Owner', type: 'text' },
  { key: 'risk', label: 'Risk', type: 'select', options: ['Low', 'Moderate', 'High', 'Critical'] },
  { key: 'due_date', label: 'Due date', type: 'date' },
  { key: 'amount', label: 'Amount', type: 'number' },
  ...module.columns.map(column => ({ ...column, key: column.dbKey })),
];
function recordForm(module, item, user) {
  return Object.fromEntries(recordFields(module).map(field => [field.key,
    item ? (field.type === 'date' ? String(item[field.key] || '').slice(0, 10) : String(item[field.key] ?? ''))
      : field.key === 'owner' ? user.name : field.key === 'status' ? 'Open' : field.key === 'risk' ? 'Moderate'
        : field.type === 'date' ? new Date().toISOString().slice(0, 10) : field.type === 'number' ? '0'
          : field.type === 'select' ? field.options[0] : '',
  ]));
}

function RegisterModal({ module, item, feature, user, initialMode, onClose, onChanged, notify }) {
  const [mode, setMode] = useState(initialMode || (item ? 'view' : 'new'));
  const [form, setForm] = useState(() => recordForm(module, item, user));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canEdit = ['admin', 'operator'].includes(user.role);
  const canDelete = user.role === 'admin';
  function changeMode(next) { setError(''); setForm(recordForm(module, next === 'new' ? null : item, user)); setMode(next); }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const isNew = mode === 'new';
      const result = await api(isNew ? `/api/operation-records/${module.id}` : `/api/operation-records/${module.id}/${item.id}`, {
        method: isNew ? 'POST' : 'PUT', body: JSON.stringify(form),
      });
      notify(result.message); await onChanged(); onClose();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try {
      const result = await api(`/api/operation-records/${module.id}/${item.id}`, { method: 'DELETE' });
      notify(result.message); await onChanged(); onClose();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function runAction(action) {
    setBusy(true); setError('');
    try {
      const result = await api(`/api/domain/${feature.id}/actions/${action.id}`, { method: 'POST', body: JSON.stringify({ moduleId: module.id, recordId: item.id }) });
      notify(`${result.message}. ${result.auditDetail}`); await onChanged(); onClose();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  const title = mode === 'new' ? `New ${module.title}` : `${module.title} · ${item.reference}`;
  const headerActions = mode === 'view' ? <>
    {canEdit && <><button className="secondary" onClick={() => changeMode('new')}>New</button><button className="secondary" onClick={() => changeMode('edit')}>Edit</button></>}
    {canDelete && <button className="danger" onClick={() => changeMode('delete')}>Delete</button>}
    <button className="ghost" onClick={onClose}>Cancel</button>
  </> : mode === 'delete' ? <>
    <button className="danger" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete record'}</button>
    <button className="ghost" onClick={() => changeMode('view')}>Cancel</button>
  </> : <>
    <button className="primary" disabled={busy} type="submit" form="registerRecordForm">{busy ? 'Saving…' : 'Save'}</button>
    <button className="ghost" onClick={() => item ? changeMode('view') : onClose()}>Cancel</button>
  </>;
  return <Modal title={title} onClose={onClose} actions={headerActions}>
    {mode === 'view' && <><p className="muted">{module.description}</p><DetailGrid item={item}/>{feature && canEdit && <><h4>Workflow actions</h4><div className="buttonRow">{feature.actions.map(action => <button className="primary" disabled={busy} key={action.id} onClick={() => runAction(action)}>{action.label}</button>)}</div></>}</>}
    {(mode === 'new' || mode === 'edit') && <form id="registerRecordForm" onSubmit={save}><div className="recordForm">{recordFields(module).map(field => <label key={field.key}><span>{field.label}</span>{field.type === 'textarea' ? <textarea className="input" required value={form[field.key]} onChange={event => setForm(current => ({ ...current, [field.key]: event.target.value }))}/> : field.type === 'select' ? <select className="input" required value={form[field.key]} onChange={event => setForm(current => ({ ...current, [field.key]: event.target.value }))}>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : <input className="input" required type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 'any' : undefined} value={form[field.key]} onChange={event => setForm(current => ({ ...current, [field.key]: event.target.value }))}/>}</label>)}</div></form>}
    {mode === 'delete' && <p>Delete <strong>{item.reference}</strong> from {module.title}? This removes the record from the register and writes an audit event.</p>}
    {error && <div className="error" role="alert">{error}</div>}
  </Modal>;
}

function RegisterRowActions({ user, onSelect }) {
  return <div className="rowActionButtons"><button className="secondary" onClick={event => { event.stopPropagation(); onSelect('view'); }}>View</button>{['admin', 'operator'].includes(user.role) && <button className="ghost" onClick={event => { event.stopPropagation(); onSelect('edit'); }}>Edit</button>}{user.role === 'admin' && <button className="ghost" onClick={event => { event.stopPropagation(); onSelect('delete'); }}>Delete</button>}</div>;
}

function RichText({ text, compact = false }) {
  const lines = String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
  return <div className={compact ? 'richText compact' : 'richText'}>{lines.map((line, index) => {
    const bullet = line.match(/^(?:[•*-]|\d+[.)])\s*(.+)$/);
    return bullet ? <div className="richBullet" key={index}><span>•</span><p>{bullet[1]}</p></div> : <p key={index}>{line}</p>;
  })}</div>;
}

function ProfessionalBrief({ result }) {
  const controlledFallback = result.presentation === 'professional-safe-fallback';
  return <article className="result decisionBrief">
    <header className="briefHeader">
      <div>
        <span className="briefEyebrow">{controlledFallback ? 'Controlled review brief' : 'Professional decision brief'}</span>
        <h2>{result.headline}</h2>
        <p className="briefSubtitle">Prepared for accountable human review and documented decision-making.</p>
      </div>
      <div className="briefStatus">
        <span className={`riskLevel risk-${String(result.risk).toLowerCase()}`}>{result.risk} risk</span>
        <span className="confidenceLevel">{result.confidence}% confidence</span>
      </div>
    </header>
    <section className="executiveSummary">
      <span className="sectionLabel">Executive summary</span>
      <RichText text={result.executiveSummary}/>
    </section>
    <section className="briefMetrics" aria-label="Decision metrics">
      {result.metrics.map((metric, index) => <Metric key={index} label={metric.label} value={metric.value}/>) }
    </section>
    <section className="briefSection">
      <div className="sectionHeading"><span>Analysis and findings</span><small>{result.sections.length} reviewed areas</small></div>
      <div className="findingGrid">{result.sections.map((section, index) => <div className="finding" key={index}><span className="findingNumber">{String(index + 1).padStart(2, '0')}</span><div><strong>{section.title}</strong><RichText text={section.detail} compact/></div></div>)}</div>
    </section>
    <section className="actionPlan">
      <div className="sectionHeading"><span>Recommended action plan</span><small>Prioritized next steps</small></div>
      <ol>{result.actions.map((action, index) => <li key={index}><span>{index + 1}</span><p>{action}</p></li>)}</ol>
    </section>
    {result.providerNote && <section className="assumption"><strong>Material assumption</strong><RichText text={result.providerNote} compact/></section>}
    <footer className="briefFooter"><span>OpenRouter · {result.model}</span><span>{result.disclaimer}</span></footer>
  </article>;
}

function Dashboard({ app, data, openCase, goAI }) {
  return <><PageTitle title={app.title} subtitle={app.tagline}/><div className="metrics"><Metric label="Custom AI features" value={data.workflowCount}/><Metric label="PostgreSQL domain tables" value={data.operationalTableCount}/><Metric label="Seeded domain records" value={data.recordCount + data.operationalRowCount}/><Metric label="Require attention" value={data.attentionCount}/><Metric label={app.valueLabel} value={app.value}/></div><div className="twoCol"><section className="panel"><h3>Specialized AI features</h3><div className="featureGrid">{app.workflows.slice(0, 6).map(workflow => <button className="featureCard" key={workflow.id} onClick={() => goAI(workflow.id)}><strong>{workflow.title}</strong><span>{workflow.description}</span></button>)}</div></section><section className="panel"><h3>Clickable priority work</h3>{data.recent.map(record => <button className="listRow" key={record.id} onClick={() => openCase(record)}><strong>{record.subject}</strong><span>{record.reference} · {record.owner} · {record.risk} · {record.state}</span></button>)}</section></div></>;
}

function DomainHome({ app, openModule }) {
  const [report, setReport] = useState(null);
  const [selected, setSelected] = useState(null);
  useEffect(() => { api('/api/reports').then(setReport); }, []);
  if (!report) return <p>Loading registers…</p>;
  const modules = app.operations.map(module => ({ ...module, ...report.modules.find(item => item.id === module.id) }));
  return <><PageTitle title={app.domainProduct.home} subtitle={app.domainProduct.context}/><div className="domainHero"><div><span className="eyebrow">{app.industry}</span><h3>Operational registers</h3><p>Select a register to review its records and take action.</p></div><div className="heroMetrics"><Metric label="Registers" value={modules.length}/><Metric label="Records under control" value={modules.reduce((sum, item) => sum + item.count, 0)}/><Metric label="Value represented" value={money(report.totalAmount)}/><Metric label="Need action" value={report.totalAttention}/></div></div><div className="domainGrid">{modules.map((module, index) => <button className="domainCard" key={module.id} onClick={() => setSelected(module)}><span className="domainIndex">{String(index + 1).padStart(2, '0')}</span><div><strong>{module.title}</strong><p>{module.description}</p><span className="domainStats">{module.count} records · {module.attention} require action · {money(module.amount)}</span></div><b>View details →</b></button>)}</div>{selected && <InfoModal detail={{ title: selected.title, item: selected }} onClose={() => setSelected(null)} actions={<button className="primary" onClick={() => { setSelected(null); openModule(selected.id); }}>Open register</button>}/>}</>;
}

function DomainCapability({ app, featureId, moduleId, notify }) {
  const [data, setData] = useState(null); const [selected, setSelected] = useState(null);
  async function load() { setData(await api(`/api/domain/${featureId}`)); }
  useEffect(() => { setData(null); setSelected(null); load(); }, [featureId, moduleId]);
  if (!data) return <p>Loading domain capability…</p>;
  const { feature } = data;
  const groups = data.groups.filter(group => group.module.id === moduleId);
  const module = groups[0]?.module;
  if (!module) return <p>Register unavailable.</p>;
  const allRows = groups.flatMap(group => group.items.map(item => ({ item, module: group.module })));
  const attention = allRows.filter(({ item }) => ['High','Critical'].includes(item.risk) || ['Investigating','Review'].includes(item.status)).length;
  const total = allRows.reduce((sum, { item }) => sum + Number(item.amount || 0), 0);
  const renderTable = group => <section className="domainSection" key={group.module.id}><div className="moduleTitle"><div><h3>{group.module.title}</h3><p>{group.module.description}</p></div><span className="badge">{group.items.length} records</span></div><div className="tableWrap"><table><thead><tr><th>Reference</th><th>Status</th><th>Risk</th><th>Owner</th><th>Due</th><th>Value</th>{group.module.columns.slice(0, 4).map(column => <th key={column.dbKey}>{column.label}</th>)}<th>Actions</th></tr></thead><tbody>{group.items.map(item => <tr className="clickable" key={item.id} onClick={() => setSelected({ module: group.module, item })}><td>{item.reference}</td><td><span className={`status status-${String(item.status).toLowerCase()}`}>{item.status}</span></td><td>{item.risk}</td><td>{item.owner}</td><td>{String(item.due_date).slice(0,10)}</td><td>{money(item.amount)}</td>{group.module.columns.slice(0,4).map(column => <td key={column.dbKey}>{String(item[column.dbKey])}</td>)}<td><RegisterRowActions user={app.user} onSelect={initialMode => setSelected({ module: group.module, item, initialMode })}/></td></tr>)}</tbody></table></div></section>;
  const board = <div className="kanban">{['Open','Investigating','Review','Approved','Closed'].map(status => <section key={status}><h4>{status}<span>{allRows.filter(({ item }) => item.status === status).length}</span></h4>{allRows.filter(({ item }) => item.status === status).slice(0,8).map(({ item, module }) => <button key={`${module.id}-${item.id}`} onClick={() => setSelected({ item, module })}><strong>{item.reference}</strong><span>{module.title}</span><small>{item.owner} · {item.risk}</small><small className="cardAction">View record →</small></button>)}</section>)}</div>;
  return <><PageTitle title={module.title} subtitle={module.description}/>{['admin', 'operator'].includes(app.user.role) && <div className="registerToolbar"><button className="primary" onClick={() => setSelected({ module, item: null })}>New record</button></div>}<div className="capabilityStrip"><Metric label="Controlled records" value={allRows.length}/><Metric label="Require action" value={attention}/><Metric label="Value represented" value={money(total)}/><div className="processNote"><strong>{feature.view === 'reconciliation' ? 'Reconciliation control' : feature.view === 'evidence' ? 'Evidence decision' : feature.view === 'deadline' ? 'Deadline governance' : feature.view === 'control' ? 'Preventive control' : 'Managed workflow'}</strong><span>Every action changes PostgreSQL state and writes an attributed audit event.</span></div></div>{feature.view === 'board' ? board : groups.map(renderTable)}{selected && <RegisterModal module={selected.module} item={selected.item} feature={feature} user={app.user} initialMode={selected.initialMode} onClose={() => setSelected(null)} onChanged={load} notify={notify}/>}</>;
}

function AIStudio({ app, initialId, notify }) {
  const [workflowId, setWorkflowId] = useState(initialId || app.workflows[0].id);
  const [preview, setPreview] = useState(null);
  const workflow = useMemo(() => app.workflows.find(item => item.id === workflowId), [app, workflowId]);
  const [form, setForm] = useState({}); const [result, setResult] = useState(null); const [analysisType, setAnalysisType] = useState('assess'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setForm({}); setResult(null); setError(''); }, [workflowId]);
  function fill(example) { setForm({ ...example.values }); setError(`${example.label} populated every field, including optional inputs.`); }
  function setField(key, value) { setForm(current => ({ ...current, [key]: value })); }
  async function analyze(type) { setBusy(true); setError(''); try { const response = await api('/api/ai/analyze', { method: 'POST', body: JSON.stringify({ workflowId, analysisType: type, inputs: form }) }); setResult(response); setAnalysisType(type); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  async function save() { const response = await api('/api/ai/save', { method: 'POST', body: JSON.stringify({ workflowId, analysisType, inputs: form, result }) }); notify(response.message); }
  async function createCase() { const response = await api('/api/records', { method: 'POST', body: JSON.stringify({ workflowId, subject: `${workflow.title} — analyst case`, inputs: form }) }); notify(`${response.message} #${response.id}`); }
  return <><PageTitle title="AI feature studio" subtitle="Each domain feature uses custom fields and calls OpenRouter from the Node backend."/><div className="aiLayout"><aside className="featureGrid">{app.workflows.map(item => <button className={`featureCard ${item.id === workflowId ? 'selected' : ''}`} key={item.id} onClick={() => setPreview(item)}><strong>{item.title}</strong><span>{item.description}</span><em>{item.fields.length} custom fields · {item.aiActions.length} AI actions</em><b>View feature →</b></button>)}</aside><section className="panel"><div className="providerLine"><span className={`provider ${app.ai.configured ? 'ready' : 'missing'}`}>{app.ai.configured ? `OpenRouter · ${app.ai.model}` : 'OpenRouter not configured'}</span></div><h3>{workflow.title}</h3><p className="muted">{workflow.description}</p><div className="buttonRow">{workflow.examples.map(example => <button className="secondary" key={example.id} onClick={() => fill(example)}>{example.label}</button>)}<button className="ghost" onClick={() => { setForm({}); setResult(null); setError(''); }}>Clear All Fields</button></div><div className="formGrid">{workflow.fields.map(field => <label className={field.type === 'textarea' ? 'full' : ''} key={field.key}><span>{field.label} {!field.required && <small>Optional · examples fill this</small>}</span>{field.type === 'select' ? <select className="input" value={form[field.key] || ''} onChange={event => setField(field.key, event.target.value)} required={field.required}><option value="">Select…</option>{field.options.map(option => <option key={option}>{option}</option>)}</select> : field.type === 'textarea' ? <textarea className="input" value={form[field.key] || ''} onChange={event => setField(field.key, event.target.value)} required={field.required}/> : <input className="input" type={['date','number'].includes(field.type) ? field.type : 'text'} value={form[field.key] || ''} onChange={event => setField(field.key, event.target.value)} required={field.required}/>}</label>)}</div><div className="buttonRow">{workflow.aiActions.map(action => <button className="primary" disabled={busy} key={action.id} onClick={() => analyze(action.id)}>{busy ? 'Preparing brief…' : action.label}</button>)}</div><div className="buttonRow"><button className="secondary" onClick={createCase}>Create Operational Case</button><button className="ghost" disabled={!result} onClick={save}>Save Analysis & Audit Event</button></div>{error && <div className={error.includes('populated') ? 'success' : 'error'}>{error}</div>}{result && <ProfessionalBrief result={result}/>}</section></div>{preview && <InfoModal detail={{ title: preview.title, item: { description: preview.description, fields: preview.fields.length, aiActions: preview.aiActions.map(action => action.label) } }} onClose={() => setPreview(null)} actions={<button className="primary" onClick={() => { setWorkflowId(preview.id); setPreview(null); }}>Open feature</button>}/>}</>;
}

function Queue({ onOpen }) { const [items, setItems] = useState([]); useEffect(() => { api('/api/records').then(data => setItems(data.items)); }, []); return <><PageTitle title="Workflow queue" subtitle="Click any row for complete evidence and state-transition controls."/><div className="tableWrap"><table><thead><tr><th>Reference</th><th>Subject</th><th>Owner</th><th>State</th><th>Risk</th><th>Due</th><th>Amount</th><th>Action</th></tr></thead><tbody>{items.map(item => <tr className="clickable" key={item.id} onClick={() => onOpen(item)}><td>{item.reference}</td><td>{item.subject}</td><td>{item.owner}</td><td>{item.state}</td><td>{item.risk}</td><td>{String(item.due_date).slice(0,10)}</td><td>{money(item.amount)}</td><td><button className="secondary tableAction" onClick={event => { event.stopPropagation(); onOpen(item); }}>View</button></td></tr>)}</tbody></table></div></>; }

function Operations({ app, moduleId, notify }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const module = app.operations.find(entry => entry.id === moduleId);
  async function load() { setItems((await api(`/api/operation-records?module=${encodeURIComponent(moduleId)}`)).items); }
  useEffect(() => { setItems([]); setSelected(null); load(); }, [moduleId]);
  if (!module) return <p>Register unavailable.</p>;
  return <><PageTitle title={module.title} subtitle={module.description}/><div className="registerToolbar"><span className="badge">{items.length} records</span>{['admin', 'operator'].includes(app.user.role) && <button className="primary" onClick={() => setSelected({ module, item: null })}>New record</button>}</div><div className="tableWrap"><table><thead><tr><th>Reference</th><th>Status</th><th>Owner</th><th>Risk</th><th>Due</th><th>Amount</th>{module.columns.map(column => <th key={column.dbKey}>{column.label}</th>)}<th>Actions</th></tr></thead><tbody>{items.map(item => <tr className="clickable" key={item.id} onClick={() => setSelected({ module, item })}><td>{item.reference}</td><td>{item.status}</td><td>{item.owner}</td><td>{item.risk}</td><td>{String(item.due_date).slice(0,10)}</td><td>{money(item.amount)}</td>{module.columns.map(column => <td key={column.dbKey}>{String(item[column.dbKey])}</td>)}<td><RegisterRowActions user={app.user} onSelect={initialMode => setSelected({ module, item, initialMode })}/></td></tr>)}</tbody></table></div>{selected && <RegisterModal module={selected.module} item={selected.item} user={app.user} initialMode={selected.initialMode} onClose={() => setSelected(null)} onChanged={load} notify={notify}/>}</>;
}

function Reports({ openModule }) { const [report, setReport] = useState(null); const [selected, setSelected] = useState(null); useEffect(() => { api('/api/reports').then(setReport); }, []); if (!report) return <p>Loading reports…</p>; const max = Math.max(...report.modules.map(item => item.amount)); return <><PageTitle title="Reports and analytics" subtitle="Click any report line to open its PostgreSQL source table."/><div className="metrics"><Metric label="Represented value" value={money(report.totalAmount)}/><Metric label="Attention records" value={report.totalAttention}/><Metric label="Domain modules" value={report.modules.length}/></div><section className="panel reportPanel">{report.modules.map(item => <button className="barRow" key={item.id} onClick={() => setSelected(item)}><strong>{item.title}</strong><span className="barTrack"><i style={{ width: `${Math.max(4, item.amount / max * 100)}%` }}/></span><span>{money(item.amount)} · View →</span></button>)}</section><div className="tableWrap"><table><thead><tr><th>Module</th><th>Rows</th><th>High/Critical</th><th>Value</th><th>Action</th></tr></thead><tbody>{report.modules.map(item => <tr className="clickable" key={item.id} tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setSelected(item))} onClick={() => setSelected(item)}><td>{item.title}</td><td>{item.count}</td><td>{item.attention}</td><td>{money(item.amount)}</td><td><button className="secondary tableAction" onClick={event => { event.stopPropagation(); openModule(item.id); }}>Open</button></td></tr>)}</tbody></table></div>{selected && <InfoModal detail={{ title: selected.title, item: selected }} onClose={() => setSelected(null)} actions={<button className="primary" onClick={() => { setSelected(null); openModule(selected.id); }}>Open register</button>}/>}</>; }

function Audit({ user, notify }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ objectType: '', reference: '', detail: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canAdd = ['admin', 'operator'].includes(user.role);
  async function load() { setItems((await api('/api/audit-events')).items); }
  useEffect(() => { load(); }, []);
  function newNote(item) { setSelected(null); setForm({ objectType: item?.object_type || '', reference: item?.object_reference || '', detail: '' }); setError(''); setCreating(true); }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api('/api/audit-events/note', { method: 'POST', body: JSON.stringify(form) });
      notify(result.message); await load(); setCreating(false);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <><PageTitle title="Audit trail" subtitle="Recorded events are permanent. Add an attributed note when context is needed."/>
    {canAdd && <div className="registerToolbar"><button className="primary" onClick={() => newNote(null)}>New audit note</button></div>}
    <div className="tableWrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Object</th><th>Reference</th><th>Detail</th><th>Actions</th></tr></thead><tbody>{items.map(item => <tr className="clickable" key={item.id} tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setSelected(item))} onClick={() => setSelected(item)}><td>{new Date(item.event_time).toLocaleString()}</td><td>{item.actor}</td><td>{item.action}</td><td>{item.object_type}</td><td>{item.object_reference}</td><td className="wrap">{item.detail}</td><td><div className="rowActionButtons"><button className="secondary" onClick={event => { event.stopPropagation(); setSelected(item); }}>View</button>{canAdd && <button className="ghost" onClick={event => { event.stopPropagation(); newNote(item); }}>New note</button>}</div></td></tr>)}</tbody></table></div>
    {selected && <InfoModal detail={{ title: `Audit event · ${selected.object_reference}`, item: selected }} onClose={() => setSelected(null)} actions={canAdd && <button className="secondary" onClick={() => newNote(selected)}>New note</button>}/>}
    {creating && <Modal title="New audit note" onClose={() => setCreating(false)} actions={<><button className="primary" type="submit" form="auditNoteForm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button className="ghost" onClick={() => setCreating(false)}>Cancel</button></>}><form id="auditNoteForm" onSubmit={save}><label><span>Object type</span><input className="input" required maxLength="200" value={form.objectType} onChange={event => setForm(current => ({ ...current, objectType: event.target.value }))}/></label><label><span>Reference</span><input className="input" required maxLength="200" value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))}/></label><label><span>Note</span><textarea className="input" required maxLength="4000" value={form.detail} onChange={event => setForm(current => ({ ...current, detail: event.target.value }))}/></label>{error && <div className="error" role="alert">{error}</div>}</form></Modal>}
  </>;
}

function Integrations({ notify }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  async function load() { setItems((await api('/api/integrations')).items); }
  useEffect(() => { load(); }, []);
  async function test(id) {
    setBusy(true);
    try {
      const result = await api('/api/integrations/test', { method: 'POST', body: JSON.stringify({ id }) });
      notify(result.message);
      const fresh = (await api('/api/integrations')).items;
      setItems(fresh);
      setSelected(current => current?.id === id ? fresh.find(item => item.id === id) || current : current);
    } catch (failure) { notify(failure.message); }
    finally { setBusy(false); }
  }
  return <><PageTitle title="Domain integrations" subtitle="Connection contracts are tested through the backend and written to the audit trail."/>
    <div className="integrationGrid">{items.map(item => <section className="integration clickableCard" key={item.id} tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setSelected(item))} onClick={() => setSelected(item)}><span className="badge">{item.status}</span><h3>{item.name}</h3><p>{item.category} · {item.mode}</p><small>Last tested: {item.last_tested ? new Date(item.last_tested).toLocaleString() : 'Not tested'}</small><div className="rowActionButtons"><button className="secondary" disabled={busy} onClick={event => { event.stopPropagation(); test(item.id); }}>Test connection</button><button className="ghost" onClick={event => { event.stopPropagation(); setSelected(item); }}>View details</button></div></section>)}</div>
    {selected && <Modal title={selected.name} onClose={() => setSelected(null)} actions={<><button className="primary" disabled={busy} onClick={() => test(selected.id)}>{busy ? 'Testing…' : 'Test connection'}</button><button className="ghost" onClick={() => setSelected(null)}>Cancel</button></>}><DetailGrid item={selected}/></Modal>}
  </>;
}

function Architecture({ notify }) {
  const [tab, setTab] = useState('mita');
  const [mita, setMita] = useState(null); const [compliance, setCompliance] = useState(null); const [catalog, setCatalog] = useState(null); const [stream, setStream] = useState(null);
  const [memberRef, setMemberRef] = useState(''); const [edi, setEdi] = useState(null); const [resource, setResource] = useState(null); const [busy, setBusy] = useState(false);
  const [mfaStatus, setMfaStatus] = useState(null); const [mfaEnroll, setMfaEnroll] = useState(null); const [mfaCode, setMfaCode] = useState('');
  const [secEvents, setSecEvents] = useState(null); const [accessReview, setAccessReview] = useState(null);
  const [noticeRef, setNoticeRef] = useState('OPS-03-001'); const [noticeTo, setNoticeTo] = useState(''); const [noticeResult, setNoticeResult] = useState(null); const [smtp, setSmtp] = useState(null);
  const [detail, setDetail] = useState(null);
  async function loadEvents() { const [items, stats] = await Promise.all([api('/api/events'), api('/api/events/stats')]); setStream({ ...stats, items: items.items, catalog: items.catalog }); }
  useEffect(() => { api('/api/mita').then(setMita); api('/api/members/masked').then(data => setMemberRef(data.items[0]?.reference || '')); }, []);
  useEffect(() => {
    if (tab === 'security' && !compliance) api('/api/compliance').then(setCompliance);
    if (tab === 'security') { api('/api/security/mfa/status').then(setMfaStatus).catch(() => {}); api('/api/security/events').then(data => setSecEvents(data.items)).catch(() => setSecEvents(null)); api('/api/security/access-review').then(setAccessReview).catch(() => setAccessReview(null)); }
    if (tab === 'interop' && !catalog) { api('/api/x12/catalog').then(setCatalog); api('/api/notices/smtp-status').then(setSmtp).catch(() => {}); }
    if (tab === 'events') loadEvents();
  }, [tab]);
  async function generate(set, extra = {}) {
    setBusy(true); try {
      const result = await api(`/api/x12/${set}`, { method: 'POST', body: JSON.stringify({ reference: memberRef, ...extra }) });
      setEdi({ title: `X12 ${set} · control ${result.controlNumber}`, raw: result.raw, parsed: result.parsed }); notify(result.message); loadEvents();
    } catch (failure) { notify(failure.message); } finally { setBusy(false); }
  }
  async function reparse() { try { const result = await api('/api/x12/parse', { method: 'POST', body: JSON.stringify({ raw: edi.raw }) }); notify(`Re-parsed ${result.segmentCount} segments into JSON.`); setEdi({ ...edi, parsed: result.parsed }); } catch (failure) { notify(failure.message); } }
  async function enrollMfa() { try { setMfaEnroll(await api('/api/security/mfa/enroll', { method: 'POST' })); setMfaCode(''); notify('TOTP secret provisioned — add it to your authenticator app and confirm a 6-digit code.'); } catch (failure) { notify(failure.message); } }
  async function activateMfa() { try { const result = await api('/api/security/mfa/activate', { method: 'POST', body: JSON.stringify({ token: mfaCode }) }); setMfaStatus({ enabled: true }); setMfaEnroll(null); setMfaCode(''); notify(result.message); } catch (failure) { notify(failure.message); } }
  async function disableMfa() { try { const result = await api('/api/security/mfa/disable', { method: 'POST' }); setMfaStatus({ enabled: false }); setMfaEnroll(null); notify(result.message); } catch (failure) { notify(failure.message); } }
  async function sendNotice() { setBusy(true); try { setNoticeResult(await api('/api/notices/send', { method: 'POST', body: JSON.stringify({ reference: noticeRef, ...(noticeTo ? { to: noticeTo } : {}) }) })); notify('Notice dispatched — see the audit trail and event stream.'); loadEvents(); } catch (failure) { notify(failure.message); } finally { setBusy(false); } }
  const ediView = edi && <div className="panel ediPanel"><div className="moduleTitle"><div><h3>{edi.title}</h3><p>Raw ASC X12 segment stream with parsed business content.</p></div><div className="buttonRow">{edi.parsed && <button className="secondary" onClick={reparse}>Re-parse to JSON</button>}<button className="ghost" onClick={() => setEdi(null)}>Close</button></div></div><pre className="ediBox">{edi.raw}</pre>{edi.parsed && <pre className="ediBox json">{JSON.stringify(edi.parsed, null, 2)}</pre>}</div>;
  const tabs = <div className="tabs">{[['mita', 'MITA Capability Map'], ['security', 'Security · HIPAA / NIST'], ['interop', 'Interoperability · X12 / FHIR'], ['events', 'Event Stream']].map(([id, label]) => <button className={tab === id ? 'primary' : 'ghost'} key={id} onClick={() => setTab(id)}>{label}</button>)}</div>;
  return <><PageTitle title="Enterprise architecture & compliance" subtitle="MITA alignment, HIPAA/NIST safeguards, standards-based interoperability, and the event-driven integration backbone."/>{tabs}
    {tab === 'mita' && (mita ? <>
      <div className="metrics"><Metric label="MITA capabilities mapped" value={mita.capabilities.length}/><Metric label="Current maturity (avg)" value={mita.assessment.currentMaturityAverage}/><Metric label="Target maturity (avg)" value={mita.assessment.targetMaturityAverage}/><Metric label="Modernization gaps" value={mita.assessment.gaps.length}/></div>
      <section className="panel mitaPrinciples"><h3>MITA principles in practice</h3><div className="principleGrid">{mita.principles.map(principle => <div className="principle" key={principle.id} tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: principle.name, item: principle }))} onClick={() => setDetail({ title: principle.name, item: principle })}><strong>{principle.name}</strong><span>{principle.evidence}</span><button className="secondary tableAction" onClick={() => setDetail({ title: principle.name, item: principle })}>View</button></div>)}</div><p className="muted"><strong>Business:</strong> {mita.perspectives.business}</p><p className="muted"><strong>Information:</strong> {mita.perspectives.information}</p><p className="muted"><strong>Technical:</strong> {mita.perspectives.technical}</p></section>
      <div className="mitaGrid">{mita.capabilities.map(capability => <section className={`mitaCard area-${String(capability.mitaArea).toLowerCase()}`} key={capability.id} tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: capability.name, item: capability }))} onClick={() => setDetail({ title: capability.name, item: capability })}><span className="badge">{capability.mitaArea}</span><h3>{capability.name}</h3><p>{capability.description}</p><div className="maturityBar"><span className={`maturity level-${capability.currentMaturity}`}>Level {capability.currentMaturity} · {capability.currentMaturityLabel}</span><span className="maturityTarget">→ Level {capability.targetMaturity} · {capability.targetMaturityLabel}</span></div><small><strong>Modules:</strong> {capability.mappedModules.join(', ') || 'Shared service'}</small><small><strong>Standards:</strong> {capability.standards.join(' · ')}</small><small className="next"><strong>Next:</strong> {capability.nextAction}</small><button className="secondary tableAction" onClick={() => setDetail({ title: capability.name, item: capability })}>View</button></section>)}</div>
      <div className="tableWrap"><table><thead><tr><th>Capability</th><th>Current</th><th>Target</th><th>Planned modernization action</th><th>Action</th></tr></thead><tbody>{mita.assessment.gaps.map(gap => <tr key={gap.capability} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: gap.capability, item: gap }))} onClick={() => setDetail({ title: gap.capability, item: gap })}><td>{gap.capability}</td><td>Level {gap.from}</td><td>Level {gap.to}</td><td className="wrap">{gap.plannedAction}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: gap.capability, item: gap })}>View</button></td></tr>)}</tbody></table></div>
    </> : <p>Loading MITA registry…</p>)}
    {tab === 'security' && (compliance ? <>
      <div className="metrics"><Metric label="Controls implemented" value={compliance.controls.filter(control => control.status === 'Implemented').length}/><Metric label="Controls planned" value={compliance.controls.filter(control => control.status !== 'Implemented').length}/><Metric label="RBAC permissions" value={compliance.rbac.length}/><Metric label="Frameworks" value={compliance.frameworks.length}/></div>
      <div className="tableWrap"><table><thead><tr><th>Control</th><th>Framework</th><th>Safeguard</th><th>Status</th><th>Evidence</th><th>Action</th></tr></thead><tbody>{compliance.controls.map(control => <tr key={control.id} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: control.name, item: control }))} onClick={() => setDetail({ title: control.name, item: control })}><td>{control.id} — {control.name}</td><td>{control.framework}</td><td>{control.safeguard}</td><td><span className={`status status-${control.status === 'Implemented' ? 'approved' : 'review'}`}>{control.status}</span></td><td className="wrap">{control.evidence}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: control.name, item: control })}>View</button></td></tr>)}</tbody></table></div>
      <div className="twoCol"><section className="panel"><h3>RBAC permission matrix (minimum necessary)</h3><div className="tableWrap plain"><table><thead><tr><th>Permission</th><th>Roles</th><th>Action</th></tr></thead><tbody>{compliance.rbac.map(entry => <tr key={entry.permission} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: entry.permission, item: entry }))} onClick={() => setDetail({ title: entry.permission, item: entry })}><td>{entry.permission}</td><td>{entry.roles.join(', ')}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: entry.permission, item: entry })}>View</button></td></tr>)}</tbody></table></div></section><section className="panel"><h3>Data classification & handling</h3><div className="tableWrap plain"><table><thead><tr><th>Data</th><th>Class</th><th>Handling</th><th>Action</th></tr></thead><tbody>{compliance.dataClassification.map(entry => <tr key={entry.label} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: entry.label, item: entry }))} onClick={() => setDetail({ title: entry.label, item: entry })}><td>{entry.label}</td><td><span className="badge">{entry.classification}</span></td><td className="wrap">{entry.handling}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: entry.label, item: entry })}>View</button></td></tr>)}</tbody></table></div><small className="muted">{compliance.apiAbuse.apiBucket} · {compliance.apiAbuse.loginWindow}</small></section></div>
      <section className="panel"><h3>Security operations — MFA · monitoring · access review</h3>
        <div className="twoCol"><section className="panel"><h4>Authenticator MFA (RFC 6238 TOTP)</h4><p className="muted">Works with Google Authenticator, Authy, and 1Password. Enrolled accounts require the 6-digit code at sign-in.</p>
          <div className="buttonRow"><button className="secondary" onClick={enrollMfa}>Enroll / re-enroll</button>{mfaStatus?.enabled && <button className="ghost" onClick={disableMfa}>Disable MFA</button>}</div>
          {mfaEnroll && <div className="mfaBox"><strong>Secret</strong><code>{mfaEnroll.secret}</code><strong>Add to app (otpauth URI)</strong><code className="wrap">{mfaEnroll.otpauth}</code><label><span>Enter the current 6-digit code</span><input className="input" inputMode="numeric" value={mfaCode} onChange={event => setMfaCode(event.target.value)} placeholder="123456"/></label><button className="primary" onClick={activateMfa}>Activate MFA</button></div>}
          {mfaStatus && <small className="muted">Status: {mfaStatus.enabled ? 'ACTIVE — sign-in requires your authenticator code' : 'not enrolled'}</small>}
        </section>
        <section className="panel"><h4>Automated access review (AC-2)</h4>{accessReview ? <div className="tableWrap plain"><table><thead><tr><th>Account</th><th>Role</th><th>MFA</th><th>Last login</th><th>Action</th></tr></thead><tbody>{accessReview.users.map(user => <tr key={user.id} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: user.email, item: user }))} onClick={() => setDetail({ title: user.email, item: user })}><td>{user.email}</td><td>{user.role}</td><td>{user.mfa}</td><td>{user.last_login ? new Date(user.last_login).toLocaleString() : 'never'}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: user.email, item: user })}>View</button></td></tr>)}</tbody></table></div> : <small className="muted">Access review requires the admin or reviewer role.</small>}</section></div>
        <h4>Security event stream (SI-4)</h4>{secEvents ? <div className="tableWrap plain"><table><thead><tr><th>Time</th><th>Type</th><th>Actor</th><th>IP</th><th>Detail</th><th>Action</th></tr></thead><tbody>{secEvents.map(item => <tr key={item.id} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: item.event_type, item: item }))} onClick={() => setDetail({ title: item.event_type, item: item })}><td>{new Date(item.event_time).toLocaleString()}</td><td><span className="badge">{item.event_type}</span></td><td>{item.actor || '—'}</td><td>{item.ip_address || '—'}</td><td className="wrap">{item.detail}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: item.event_type, item })}>View</button></td></tr>)}</tbody></table></div> : <small className="muted">Security events require the admin or reviewer role.</small>}
      </section>
    </> : <p>Loading compliance posture…</p>)}
    {tab === 'interop' && (catalog ? <>
      <PageTitle title="" subtitle=""/>
      <section className="panel"><h3>ASC X12 EDI exchange</h3><p className="muted">Sender {catalog.sender.name} ({catalog.sender.id}) → trading partner {catalog.tradingPartner.name} ({catalog.tradingPartner.id}). Generate real transaction sets against a beneficiary registry reference.</p>
        <div className="formGrid"><label><span>Beneficiary registry reference</span><input className="input" value={memberRef} onChange={event => setMemberRef(event.target.value)} placeholder="OPS-01-001"/></label></div>
        <div className="buttonRow"><button className="primary" disabled={busy || !memberRef} onClick={() => generate('270')}>Generate 270 Inquiry</button><button className="secondary" disabled={busy || !memberRef} onClick={() => generate('271')}>Simulate 271 Response</button><button className="secondary" disabled={busy || !memberRef} onClick={() => generate('834')}>Generate 834 Enrollment</button></div>
        <div className="tableWrap plain"><table><thead><tr><th>Set</th><th>Transaction</th><th>Version</th><th>Usage</th><th>Action</th></tr></thead><tbody>{catalog.items.map(item => <tr key={item.set} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: item.name, item: item }))} onClick={() => setDetail({ title: item.name, item: item })}><td><span className="badge">{item.set}</span></td><td>{item.name}</td><td>{item.version}</td><td className="wrap">{item.usage}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: item.name, item })}>View</button></td></tr>)}</tbody></table></div>
      </section>
      {ediView}
      <section className="panel fhirPanel"><h3>HL7 FHIR R4 resource facade</h3><p className="muted">Read the operational registers as FHIR resources. The CapabilityStatement declares the supported resources at /api/fhir/metadata.</p>
        <div className="buttonRow">{[['CapabilityStatement', '/api/fhir/metadata'], ['Patient searchset', '/api/fhir/Patient'], ['Patient read', '/api/fhir/Patient/member-1'], ['Coverage searchset', '/api/fhir/Coverage'], ['Task searchset', '/api/fhir/Task']].map(([label, path]) => <button className="secondary" key={path} onClick={() => api(path).then(data => setResource({ label, path, data }))}>{label}</button>)}</div>
        {resource && <div className="panel ediPanel"><div className="moduleTitle"><div><h3>{resource.label}</h3><p>GET {resource.path}</p></div><button className="ghost" onClick={() => setResource(null)}>Close</button></div><pre className="ediBox json">{JSON.stringify(resource.data, null, 2).slice(0, 6000)}</pre></div>}
      </section>
      <section className="panel"><h3>SMTP notice dispatch</h3><p className="muted">{smtp?.configured ? `Real SMTP server: ${smtp.host}:${smtp.port} (Mailpit web inbox: :8025)` : 'SMTP not configured — docker-compose starts Mailpit (a real SMTP server) on :1025 with a web inbox on :8025; sends are recorded until then.'}</p>
        <div className="formGrid"><label><span>Notice register reference</span><input className="input" value={noticeRef} onChange={event => setNoticeRef(event.target.value)} placeholder="OPS-03-001"/></label><label><span>Send to (optional — auto-addresses the beneficiary inbox)</span><input className="input" value={noticeTo} onChange={event => setNoticeTo(event.target.value)} placeholder="beneficiary.ops03001@inbox.renewalcare.example"/></label></div>
        <div className="buttonRow"><button className="primary" disabled={busy || !noticeRef} onClick={sendNotice}>Send renewal notice over SMTP</button></div>
        {noticeResult && <div className={`detail ${noticeResult.delivered ? 'noticeOk' : ''}`}><small>Result</small><strong>{noticeResult.delivered ? `Delivered via ${noticeResult.mode} — messageId ${noticeResult.messageId}` : noticeResult.detail}</strong><br/><small>{noticeResult.subject} → {noticeResult.to}</small></div>}
      </section>
    </> : <p>Loading interoperability contracts…</p>)}
    {tab === 'events' && (stream ? <>
      <div className="metrics"><Metric label="Events published" value={stream.byStatus.reduce((sum, row) => sum + row.count, 0)}/><Metric label="Pending delivery" value={stream.byStatus.find(row => row.status === 'pending')?.count || 0}/><Metric label="Published" value={stream.byStatus.find(row => row.status === 'published')?.count || 0}/><button className="primary dispatch" disabled={!stream.byStatus.find(row => row.status === 'pending')?.count} onClick={async () => { const result = await api('/api/events/dispatch', { method: 'POST' }); notify(`${result.dispatched} events delivered to the interoperability hub.`); loadEvents(); }}>Dispatch pending → hub</button></div>
      <section className="panel"><h3>Event catalog</h3><div className="tableWrap plain"><table><thead><tr><th>Event type</th><th>Trigger</th><th>Consumers</th><th>Action</th></tr></thead><tbody>{stream.catalog.map(item => <tr key={item.type} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: item.type, item: item }))} onClick={() => setDetail({ title: item.type, item: item })}><td>{item.type}</td><td className="wrap">{item.trigger}</td><td className="wrap">{item.consumers.join(' · ')}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: item.type, item })}>View</button></td></tr>)}</tbody></table></div></section>
      <div className="tableWrap"><table><thead><tr><th>Time</th><th>Event</th><th>Aggregate</th><th>Reference</th><th>Target</th><th>Status</th><th>Action</th></tr></thead><tbody>{stream.items.map(item => <tr key={item.id} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: item.event_type, item: item }))} onClick={() => setDetail({ title: item.event_type, item: item })}><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.event_type}</td><td>{item.aggregate_type}</td><td>{item.aggregate_id}</td><td>{item.delivery_target}</td><td><span className={`status status-${item.status === 'published' ? 'approved' : 'review'}`}>{item.status}</span></td><td><button className="secondary tableAction" onClick={() => setDetail({ title: item.event_type, item })}>View</button></td></tr>)}</tbody></table></div>
    </> : <p>Loading event stream…</p>)}
    {detail && <InfoModal detail={detail} onClose={() => setDetail(null)}/>}
  </>;
}

function ClaimsStudio({ notify }) {
  const [tab, setTab] = useState('adjudicate');
  const [members, setMembers] = useState([]); const [providers, setProviders] = useState([]); const [rules, setRules] = useState(null);
  const [form, setForm] = useState({ memberReference: '', providerReference: '', procedureCode: '99213', billedAmount: 150, serviceDate: '2026-09-01' });
  const [result, setResult] = useState(null); const [claims, setClaims] = useState([]); const [busy, setBusy] = useState(false);
  const [fwa, setFwa] = useState(null); const [fwaCases, setFwaCases] = useState([]); const [batch, setBatch] = useState(null); const [batchChannel, setBatchChannel] = useState(null); const [tmsis, setTmsis] = useState(null); const [warehouse, setWarehouse] = useState(null);
  const [portalType, setPortalType] = useState('member'); const [portalRef, setPortalRef] = useState(''); const [portal, setPortal] = useState(null);
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    api('/api/members/masked').then(data => { setMembers(data.items); setForm(current => ({ ...current, memberReference: current.memberReference || data.items[0]?.reference || '' })); setPortalRef(previous => previous || data.items[0]?.reference || ''); });
    api('/api/operation-records?module=provider-master').then(data => { setProviders(data.items); setForm(current => ({ ...current, providerReference: current.providerReference || data.items[0]?.reference || '' })); });
    api('/api/claims/coverage-rules').then(setRules);
  }, []);
  async function loadClaims() { setClaims((await api('/api/claims')).items); }
  useEffect(() => {
    if (tab === 'adjudicate') loadClaims();
    if (tab === 'integrity' && !fwa) api('/api/fwa/rules').then(data => setFwa({ rules: data.items }));
    if (tab === 'batch') api('/api/batch/channel').then(setBatchChannel);
    if (tab === 'reporting') { if (!tmsis) api('/api/reporting/tmsis').then(setTmsis); if (!warehouse) api('/api/reporting/warehouse').then(setWarehouse); }
  }, [tab]);
  async function adjudicate(event) {
    event.preventDefault(); setBusy(true); setResult(null);
    try {
      const outcome = await api('/api/claims/adjudicate', { method: 'POST', body: JSON.stringify(form) });
      setResult(outcome); notify(`Claim ${outcome.claim.icn}: ${outcome.decision}${outcome.denialCode ? ` (${outcome.denialCode})` : ''}.`); loadClaims();
    } catch (failure) { notify(failure.message); } finally { setBusy(false); }
  }
  async function runScan() { setBusy(true); try { const scan = await api('/api/fwa/scan', { method: 'POST' }); setFwa(scan); setFwaCases((await api('/api/fwa/cases')).items); notify(scan.message); } catch (failure) { notify(failure.message); } finally { setBusy(false); } }
  async function buildBatch() { setBusy(true); try { const sent = await api('/api/batch/834', { method: 'POST', body: JSON.stringify({ limit: 3 }) }); setBatch(sent); notify(`834 batch uploaded to ${sent.transfer.remotePath}; awaiting partner 999 acknowledgments.`); } catch (failure) { notify(failure.message); } finally { setBusy(false); } }
  async function checkBatch() { if (!batch) return; setBusy(true); try { const received = await api(`/api/batch/${batch.manifest.batchId}/acknowledgments`); setBatch(current => ({ ...current, ...received })); notify(`${received.received} of ${received.expected} partner acknowledgments received.`); } catch (failure) { notify(failure.message); } finally { setBusy(false); } }
  async function openPortal() { setPortal(null); try { setPortal(await api(`/api/portal/${portalType}?reference=${encodeURIComponent(portalRef)}`)); } catch (failure) { notify(failure.message); } }
  function newClaim() { setForm({ memberReference: members[0]?.reference || '', providerReference: providers[0]?.reference || '', procedureCode: rules?.items?.[0]?.code || '99213', billedAmount: 150, serviceDate: new Date().toISOString().slice(0, 10) }); setResult(null); setTab('adjudicate'); }
  const tabs = <div className="tabs">{[['adjudicate', 'Adjudication Studio'], ['integrity', 'Program Integrity · FWA'], ['batch', 'Batch Exchange · 999'], ['reporting', 'Federal Reporting · T-MSIS'], ['portal', 'Member & Provider Portals']].map(([id, label]) => <button className={tab === id ? 'primary' : 'ghost'} key={id} onClick={() => setTab(id)}>{label}</button>)}</div>;
  return <><PageTitle title="MMIS claims & fiscal agent operations" subtitle="Claim adjudication across eligibility, enrollment, coverage, prior authorization, duplicates, and third-party liability — with payments, program integrity, batch exchange, and federal reporting."/>{tabs}
    {tab === 'adjudicate' && <>
      <div className="twoCol"><section className="panel"><div className="moduleTitle"><h3>Adjudicate a professional claim</h3><button className="secondary" onClick={newClaim}>New claim</button></div>{rules && <p className="muted">Fee schedule rates applied at 80/20 coinsurance; prior auth required for {rules.priorAuthProcedures.join(', ')}.</p>}
        <form onSubmit={adjudicate}><div className="formGrid">
          <label><span>Beneficiary</span><select className="input" value={form.memberReference} onChange={event => setForm({ ...form, memberReference: event.target.value })}>{members.map(member => <option key={member.reference} value={member.reference}>{member.reference} · {member.status}</option>)}</select></label>
          <label><span>Provider</span><select className="input" value={form.providerReference} onChange={event => setForm({ ...form, providerReference: event.target.value })}>{providers.map(provider => <option key={provider.reference} value={provider.reference}>{provider.reference} · {provider.status}</option>)}</select></label>
          <label><span>Procedure code</span><select className="input" value={form.procedureCode} onChange={event => setForm({ ...form, procedureCode: event.target.value })}>{(rules?.items || []).map(rule => <option key={rule.code} value={rule.code}>{rule.code} · {rule.rate} {rule.priorAuthRequired ? '· PA' : ''}</option>)}</select></label>
          <label><span>Billed amount ($)</span><input className="input" type="number" min="1" step="0.01" value={form.billedAmount} onChange={event => setForm({ ...form, billedAmount: event.target.value })} required/></label>
          <label><span>Service date</span><input className="input" type="date" value={form.serviceDate} onChange={event => setForm({ ...form, serviceDate: event.target.value })} required/></label>
        </div><div className="buttonRow"><button className="primary" disabled={busy}>Run adjudication (837 → engine → 835)</button></div></form>
      </section></div>
      {result && <section className="panel"><h3>{result.decision}{result.denialCode ? ` · ${result.denialCode}` : ''}</h3><div className="metrics resultMetrics"><Metric label="Allowed" value={money(result.allowed)}/><Metric label="Medicaid pays" value={money(result.paid)}/><Metric label="Member responsibility" value={money(result.patientResponsibility)}/></div><div className="traceList">{result.trace.map((entry, index) => <div className={`traceRow ${entry.result === 'Fail' ? 'fail' : entry.result === 'Reduce' || entry.result === 'Reduced' ? 'reduce' : 'pass'}`} key={index} tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: entry.step, item: entry }))} onClick={() => setDetail({ title: entry.step, item: entry })}><span>{entry.result}</span><div><strong>{entry.step}</strong><p>{entry.detail}</p></div><button className="secondary tableAction" onClick={() => setDetail({ title: entry.step, item: entry })}>View</button></div>)}</div></section>}
      </>}
      {result?.raw837 && <div className="panel ediPanel"><div className="moduleTitle"><h3>X12 837 claim submission</h3><button className="ghost" onClick={() => setResult({ ...result, showRaw: !result.showRaw })}>{result.showRaw ? 'Hide raw' : 'Show raw'}</button></div>{result.showRaw ? <pre className="ediBox">{result.raw837}</pre> : <p className="muted">005010X222A1 retained on the claim and the X12 ledger.</p>}{result.raw835 && <><h4>X12 835 remittance advice</h4><pre className="ediBox">{result.raw835}</pre></>}</div>}
      {tab === 'adjudicate' && <div className="tableWrap"><table><thead><tr><th>ICN</th><th>Member</th><th>Provider</th><th>Procedure</th><th>Service date</th><th>Billed</th><th>Allowed</th><th>Paid</th><th>Decision</th><th>Status</th><th>Action</th></tr></thead><tbody>{claims.map(claim => <tr key={claim.id} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: `Claim ${claim.icn}`, item: claim }))} onClick={() => setDetail({ title: `Claim ${claim.icn}`, item: claim })}><td>{claim.icn}</td><td>{claim.member_reference}</td><td>{claim.provider_reference}</td><td>{claim.procedure_code}</td><td>{String(claim.service_date).slice(0,10)}</td><td>{money(claim.total_billed)}</td><td>{money(claim.allowed)}</td><td>{money(claim.paid)}</td><td>{claim.decision}{claim.denial_code ? ` (${claim.denial_code})` : ''}</td><td><span className={`status status-${claim.status === 'paid' ? 'approved' : claim.status === 'denied' ? 'investigating' : 'review'}`}>{claim.status}</span></td><td><button className="secondary tableAction" onClick={() => setDetail({ title: `Claim ${claim.icn}`, item: claim })}>View</button></td></tr>)}</tbody></table></div>}
    {tab === 'integrity' && <>
      <section className="panel"><h3>Fraud, waste & abuse surveillance</h3><p className="muted">Rules run against the full claims ledger; hits open investigation cases in the FWA register with audit and event trails.</p><div className="buttonRow"><button className="primary" disabled={busy} onClick={runScan}>Run FWA scan</button></div>{fwa?.rules && <div className="tableWrap plain"><table><thead><tr><th>Rule</th><th>Description</th><th>Action</th></tr></thead><tbody>{fwa.rules.map(rule => <tr key={rule.id} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: `FWA rule ${rule.id}`, item: rule }))} onClick={() => setDetail({ title: `FWA rule ${rule.id}`, item: rule })}><td><span className="badge">{rule.id}</span></td><td className="wrap">{rule.description}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: `FWA rule ${rule.id}`, item: rule })}>View</button></td></tr>)}</tbody></table></div>}</section>
      {fwa?.findings && <><div className="metrics"><Metric label="Findings" value={fwa.findings.length}/><Metric label="Cases opened" value={fwa.casesOpened}/><Metric label="Rules evaluated" value={fwa.rulesEvaluated}/></div><div className="tableWrap"><table><thead><tr><th>Rule</th><th>Severity</th><th>Subject</th><th>Finding</th><th>Score</th><th>Recommendation</th><th>Action</th></tr></thead><tbody>{fwa.findings.map((finding, index) => <tr key={index} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: `FWA finding ${finding.rule}`, item: finding }))} onClick={() => setDetail({ title: `FWA finding ${finding.rule}`, item: finding })}><td>{finding.rule}</td><td>{finding.severity}</td><td>{finding.subject}</td><td className="wrap">{finding.summary}</td><td>{finding.score}</td><td className="wrap">{finding.recommendation}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: `FWA finding ${finding.rule}`, item: finding })}>View</button></td></tr>)}</tbody></table></div></>}
      {fwaCases.length > 0 && <div className="tableWrap"><table><thead><tr><th>Case</th><th>Status</th><th>Risk</th><th>Case type</th><th>Detection rule</th><th>Score</th><th>Notes</th><th>Action</th></tr></thead><tbody>{fwaCases.map(caseRow => <tr key={caseRow.id} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: `FWA case ${caseRow.reference}`, item: caseRow }))} onClick={() => setDetail({ title: `FWA case ${caseRow.reference}`, item: caseRow })}><td>{caseRow.reference}</td><td>{caseRow.status}</td><td>{caseRow.risk}</td><td>{caseRow.data_caseType}</td><td>{caseRow.data_detectionRule}</td><td>{caseRow.data_alertScore}</td><td className="wrap">{caseRow.data_investigationNotes}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: `FWA case ${caseRow.reference}`, item: caseRow })}>View</button></td></tr>)}</tbody></table></div>}
    </>}
    {tab === 'batch' && <>
      <section className="panel"><h3>SFTP batch gateway</h3><p className="muted">{batchChannel?.configured ? `Connected configuration: ${batchChannel.host}:${batchChannel.port}. Uploads go to ${batchChannel.outboundPath}; partner 999 files are read from ${batchChannel.inboundPath}.` : 'SFTP is not configured. Set the SFTP connection and key paths in the server environment.'}</p><div className="buttonRow"><button className="primary" disabled={busy || !batchChannel?.configured} onClick={buildBatch}>Upload 834 batch (3 members)</button>{batch && <button className="secondary" disabled={busy} onClick={checkBatch}>Check partner acknowledgments</button>}</div></section>
      {batch && <><div className="metrics"><Metric label="Batch ID" value={batch.manifest.batchId}/><Metric label="Transactions" value={batch.manifest.transactionCount}/><Metric label="Bytes uploaded" value={batch.transfer.bytes}/><Metric label="999 acknowledgments received" value={batch.acknowledgments.length}/></div><p className="muted">Remote file: {batch.transfer.remotePath} · SHA-256: {batch.transfer.sha256} · {batch.status}</p><div className="tableWrap plain"><table><thead><tr><th>Seq</th><th>Set</th><th>Control</th><th>Member</th><th>999 result</th><th>Action</th></tr></thead><tbody>{batch.manifest.files.map(file => { const ack = batch.acknowledgments.find(item => item.sequence === file.sequence); return <tr key={file.sequence} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: `Batch file ${file.sequence}`, item: { ...file, acknowledgment: ack || 'Pending' } }))} onClick={() => setDetail({ title: `Batch file ${file.sequence}`, item: { ...file, acknowledgment: ack || 'Pending' } })}><td>{file.sequence}</td><td>{file.transactionSet}</td><td>{file.controlNumber}</td><td>{file.memberReference}</td><td>{ack ? ack.parsed.accepted ? 'Accepted (AK5*A)' : 'Rejected' : 'Pending'}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: `Batch file ${file.sequence}`, item: { ...file, acknowledgment: ack || 'Pending' } })}>View</button></td></tr>; })}</tbody></table></div><div className="panel ediPanel"><h4>Batch payload</h4><pre className="ediBox">{batch.raw}</pre></div></>}
    </>}
    {tab === 'reporting' && (tmsis ? <>
      <div className="metrics"><Metric label="Submission period" value={tmsis.submissionPeriod}/><Metric label="Files" value={tmsis.files.length}/><Metric label="Total records" value={tmsis.totalRecords}/></div>
      <div className="tableWrap"><table><thead><tr><th>File</th><th>Name</th><th>Source table</th><th>Records</th><th>Status</th><th>Action</th></tr></thead><tbody>{tmsis.files.map(file => <tr key={file.file} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: `T-MSIS ${file.file}`, item: file }))} onClick={() => setDetail({ title: `T-MSIS ${file.file}`, item: file })}><td>{file.file}</td><td>{file.name}</td><td>{file.sourceTable}</td><td>{file.recordCount}</td><td><span className="status status-approved">{file.status}</span></td><td><button className="secondary tableAction" onClick={() => setDetail({ title: `T-MSIS ${file.file}`, item: file })}>View</button></td></tr>)}</tbody></table></div>
      {warehouse && <section className="panel"><h3>Warehouse rollup</h3><div className="tableWrap plain"><table><thead><tr><th>Decision</th><th>Claims</th><th>Billed</th><th>Paid</th><th>Member responsibility</th><th>Action</th></tr></thead><tbody>{warehouse.claimsByDecision.map(row => <tr key={row.decision} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: `Decision ${row.decision}`, item: row }))} onClick={() => setDetail({ title: `Decision ${row.decision}`, item: row })}><td>{row.decision}</td><td>{row.count}</td><td>{money(row.billed)}</td><td>{money(row.paid)}</td><td>{money(row.member)}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: `Decision ${row.decision}`, item: row })}>View</button></td></tr>)}</tbody></table></div><div className="tableWrap plain"><table><thead><tr><th>Renewal pipeline</th><th>Records</th><th>Action</th></tr></thead><tbody>{warehouse.renewalPipeline.map(row => <tr key={row.status} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: `Renewal ${row.status}`, item: row }))} onClick={() => setDetail({ title: `Renewal ${row.status}`, item: row })}><td>{row.status}</td><td>{row.count}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: `Renewal ${row.status}`, item: row })}>View</button></td></tr>)}</tbody></table></div></section>}
    </> : <p>Loading T-MSIS manifest…</p>)}
    {tab === 'portal' && <>
      <section className="panel"><div className="tabs">{[['member', 'Member portal'], ['provider', 'Provider portal']].map(([id, label]) => <button className={portalType === id ? 'primary' : 'ghost'} key={id} onClick={() => { setPortalType(id); setPortal(null); }}>{label}</button>)}</div>
        <div className="formGrid"><label><span>{portalType === 'member' ? 'Beneficiary registry reference' : 'Provider registry reference'}</span><input className="input" value={portalRef} onChange={event => setPortalRef(event.target.value)} placeholder={portalType === 'member' ? 'OPS-09-001' : 'OPS-21-001'}/></label></div>
        <div className="buttonRow"><button className="primary" onClick={openPortal}>Open {portalType} view</button></div></section>
      {portal && portalType === 'member' && <><div className="twoCol"><section className="panel clickableCard" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: portal.member.name, item: portal.member }))} onClick={() => setDetail({ title: portal.member.name, item: portal.member })}><h3>{portal.member.name}</h3><p className="muted">Identity masked per minimum-necessary policy.</p><DetailGrid item={{ ...portal.member }}/><small className="muted">FHIR resource: {portal.fhirPatient}</small><button className="secondary tableAction" onClick={() => setDetail({ title: portal.member.name, item: portal.member })}>View member</button></section><section className="panel"><h3>Upcoming renewals</h3><div className="tableWrap plain"><table><thead><tr><th>Reference</th><th>Status</th><th>Due</th><th>Action</th></tr></thead><tbody>{portal.upcomingRenewals.map(row => <tr key={row.reference} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: `Renewal ${row.reference}`, item: row }))} onClick={() => setDetail({ title: `Renewal ${row.reference}`, item: row })}><td>{row.reference}</td><td>{row.status}</td><td>{String(row.due_date).slice(0,10)}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: `Renewal ${row.reference}`, item: row })}>View</button></td></tr>)}</tbody></table></div></section></div>
        <div className="tableWrap"><table><thead><tr><th>ICN</th><th>Procedure</th><th>Service date</th><th>Billed</th><th>Paid</th><th>Decision</th><th>Action</th></tr></thead><tbody>{portal.claims.length ? portal.claims.map(claim => <tr key={claim.icn} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: `Claim ${claim.icn}`, item: claim }))} onClick={() => setDetail({ title: `Claim ${claim.icn}`, item: claim })}><td>{claim.icn}</td><td>{claim.procedure_code}</td><td>{String(claim.service_date).slice(0,10)}</td><td>{money(claim.total_billed)}</td><td>{money(claim.paid)}</td><td>{claim.decision}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: `Claim ${claim.icn}`, item: claim })}>View</button></td></tr>) : <tr><td colSpan="7">No claims on file for this member.</td></tr>}</tbody></table></div></>}
      {portal && portalType === 'provider' && <><section className="panel clickableCard" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: portal.provider.name, item: portal.provider }))} onClick={() => setDetail({ title: portal.provider.name, item: portal.provider })}><h3>{portal.provider.name}</h3><p className="muted">Enrollment status {portal.provider.enrollmentStatus} · effective {String(portal.provider.effectiveDate).slice(0,10)}</p><div className="metrics"><Metric label="Claims" value={portal.totals.claims}/><Metric label="Billed" value={money(portal.totals.billed)}/><Metric label="Medicaid paid" value={money(portal.totals.paid)}/></div><button className="secondary tableAction" onClick={() => setDetail({ title: portal.provider.name, item: portal.provider })}>View provider</button></section>
        <div className="tableWrap"><table><thead><tr><th>ICN</th><th>Member</th><th>Procedure</th><th>Service date</th><th>Billed</th><th>Paid</th><th>Decision</th><th>Action</th></tr></thead><tbody>{portal.claims.length ? portal.claims.map(claim => <tr key={claim.icn} className="clickable" tabIndex={0} role="button" onKeyDown={event => openOnKey(event, () => setDetail({ title: `Claim ${claim.icn}`, item: claim }))} onClick={() => setDetail({ title: `Claim ${claim.icn}`, item: claim })}><td>{claim.icn}</td><td>{claim.member_reference}</td><td>{claim.procedure_code}</td><td>{String(claim.service_date).slice(0,10)}</td><td>{money(claim.total_billed)}</td><td>{money(claim.paid)}</td><td>{claim.decision}</td><td><button className="secondary tableAction" onClick={() => setDetail({ title: `Claim ${claim.icn}`, item: claim })}>View</button></td></tr>) : <tr><td colSpan="8">No claims on file for this provider.</td></tr>}</tbody></table></div></>}
    </>}
    {detail && <InfoModal detail={detail} onClose={() => setDetail(null)} actions={detail.title.startsWith('Claim ') && <button className="primary" onClick={() => { setDetail(null); newClaim(); }}>New claim</button>}/>}
  </>;
}

const registerLabels = {
  renewal: 'Renewal Population', exparte: 'Ex Parte Assessment', notice: 'Renewal Notices', documents: 'Document Intake',
  outreach: 'Beneficiary Outreach', termination: 'Termination Prevention', change: 'Circumstance Changes', appeal: 'Eligibility Appeals',
  provider: 'Provider Enrollment', claims: 'Claim Adjudication', payment: 'Provider Payments', priorauth: 'Prior Authorization',
  tpl: 'Third-Party Liability', pharmacy: 'Pharmacy Benefits', encounter: 'Managed Care Encounters', fwa: 'Program Integrity',
  'member-master': 'Beneficiaries & Households', 'program-master': 'Eligibility Programs', 'notice-master': 'Notice Templates',
  'verification-master': 'Verification Sources', 'provider-master': 'Provider Registry',
};
const registerGroups = [
  { heading: 'Eligibility & renewal', ids: ['renewal', 'exparte', 'notice', 'documents', 'outreach', 'termination', 'change', 'appeal'] },
  { heading: 'Claims & benefits', ids: ['provider', 'claims', 'payment', 'priorauth', 'tpl', 'pharmacy', 'encounter', 'fwa'] },
  { heading: 'Reference registers', ids: ['member-master', 'program-master', 'notice-master', 'verification-master', 'provider-master'] },
];

export default function App() {
  const [health, setHealth] = useState(null); const [app, setApp] = useState(null); const [page, setPage] = useState('domain-home'); const [dashboard, setDashboard] = useState(null); const [modal, setModal] = useState(null); const [notice, setNotice] = useState(''); const [aiId, setAiId] = useState(null);
  async function loadApp() { try { const data = await api('/api/app'); setApp(data); setDashboard(await api('/api/dashboard')); document.documentElement.style.setProperty('--accent', data.accent); } catch (error) { if (error.status === 401) { localStorage.removeItem('portfolio_token'); setApp(null); } } }
  useEffect(() => { api('/api/health').then(setHealth); if (localStorage.getItem('portfolio_token')) loadApp(); }, []);
  function notify(message) { setNotice(message); setTimeout(() => setNotice(''), 4500); }
  async function transitionCase(item, state) { const result = await api('/api/records/transition', { method: 'POST', body: JSON.stringify({ id: item.id, state }) }); setModal(null); notify(result.message); }
  if (!app) return <Login health={health} onLogin={loadApp}/>;
  const navigation = [
    { id: 'domain-home', label: 'Overview' },
    ...registerGroups.flatMap(group => [
      { id: `heading:${group.heading}`, label: group.heading, heading: true },
      ...group.ids.map(id => ({ id: `register:${id}`, label: registerLabels[id], title: app.operations.find(module => module.id === id)?.title })),
    ]),
    { id: 'heading:workspace', label: 'Workspace', heading: true },
    { id: 'ai', label: 'AI Copilot' }, { id: 'reports', label: 'Analytics' }, { id: 'audit', label: 'Audit Trail' },
    { id: 'integrations', label: 'Integrations' }, { id: 'claims', label: 'Claims Studio' }, { id: 'architecture', label: 'Architecture' },
  ];
  const currentLabel = navigation.find(item => item.id === page)?.label || app.domainProduct.home;
  return <div className="shell"><aside className="sidebar"><div className="brand"><span className="eyebrow">{app.industry}</span><h1>{app.title}</h1></div><nav aria-label="Main navigation">{navigation.map(item => item.heading ? <div className="navHeading" key={item.id}>{item.label}</div> : <button className={page === item.id ? 'active' : ''} key={item.id} title={item.title || item.label} onClick={() => setPage(item.id)}><span>{item.label}</span></button>)}</nav><div className="sideFoot"><button className="secondary wide" onClick={() => { localStorage.removeItem('portfolio_token'); setApp(null); }}>Sign out</button></div></aside><main><header className="topbar"><strong>{currentLabel}</strong><span className={`provider ${app.ai.configured ? 'ready' : 'missing'}`}>{app.ai.configured ? `OpenRouter · ${app.ai.model}` : 'OpenRouter configuration required'}</span></header><div className="content">{notice && <div className="success">{notice}</div>}{page === 'domain-home' && <DomainHome app={app} openModule={id => setPage(`register:${id}`)}/>} {page.startsWith('register:') && (app.domainProduct.features.find(feature => feature.modules.includes(page.slice(9))) ? <DomainCapability key={page} app={app} featureId={app.domainProduct.features.find(feature => feature.modules.includes(page.slice(9))).id} moduleId={page.slice(9)} notify={notify}/> : <Operations key={page} app={app} moduleId={page.slice(9)} notify={notify}/>)} {page === 'ai' && <AIStudio app={app} initialId={aiId} notify={notify}/>} {page === 'reports' && <Reports openModule={id => setPage(`register:${id}`)}/> } {page === 'audit' && <Audit user={app.user} notify={notify}/>} {page === 'integrations' && <Integrations notify={notify}/>}{page === 'claims' && <ClaimsStudio notify={notify}/>}{page === 'architecture' && <Architecture notify={notify}/>}</div></main>{modal?.type === 'case' && <Modal title={modal.item.subject} onClose={() => setModal(null)}><DetailGrid item={{ ...modal.item, ...modal.item.payload }}/><h4>Advance workflow</h4><div className="buttonRow">{['analyzing','review','approved','closed'].map(state => <button className="secondary" key={state} onClick={() => transitionCase(modal.item, state)}>{state}</button>)}</div></Modal>}</div>;
}
