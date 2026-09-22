// fhir.mjs — HL7 FHIR R4 interoperability for Medicaid renewal operations.
// Maps PostgreSQL operational registers into FHIR resources served under /api/fhir.
// FHIR is the modern information architecture layer complementing X12 batch transactions.

function resourceFromRow(row, dbKey) {
  return { recordId: row[dbKey.recordId], name: row[dbKey.name], status: row[dbKey.status], effectiveDate: row[dbKey.effectiveDate] };
}

export function toPatient(row) {
  const member = resourceFromRow(row, { recordId: 'data_recordId', name: 'data_name', status: 'data_status', effectiveDate: 'data_effectiveDate' });
  return {
    resourceType: 'Patient',
    id: `member-${row.id}`,
    identifier: [{ system: 'http://renewalcare.example/member-id', value: member.recordId }, { system: 'urn:renewalcare:registry-reference', value: row.reference }],
    active: member.status === 'Active',
    name: [{ use: 'official', text: member.name, family: String(member.name).split(/\s+/)[0] }],
    extension: [{ url: 'http://renewalcare.example/fhir/StructureDefinition/enrollment-status', valueString: member.status }, { url: 'http://renewalcare.example/fhir/StructureDefinition/enrollment-effective-date', valueDate: member.effectiveDate }],
  };
}

export function toCoverage(row) {
  const program = resourceFromRow(row, { recordId: 'data_recordId', name: 'data_name', status: 'data_status', effectiveDate: 'data_effectiveDate' });
  return {
    resourceType: 'Coverage',
    id: `program-${row.id}`,
    identifier: [{ system: 'http://renewalcare.example/program-id', value: program.recordId }],
    status: program.status === 'Active' ? 'active' : program.status === 'Suspended' ? 'suspended' : 'cancelled',
    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'PUBLICPOL', display: 'Public healthcare (Medicaid)' }] },
    beneficiary: { reference: 'Patient/member-registry', display: program.name },
    period: { start: program.effectiveDate },
    payor: [{ display: 'State Medicaid Agency' }],
    extension: [{ url: 'http://renewalcare.example/fhir/StructureDefinition/program-status', valueString: program.status }],
  };
}

export function toTask(row, moduleTitle) {
  const statusMap = { Open: 'requested', Investigating: 'in-progress', Review: 'on-hold', Approved: 'completed', Closed: 'completed' };
  return {
    resourceType: 'Task',
    id: `${row.reference.toLowerCase()}`,
    identifier: [{ system: 'http://renewalcare.example/task-reference', value: row.reference }],
    status: statusMap[row.status] || 'requested',
    intent: 'order',
    code: { coding: [{ system: 'http://renewalcare.example/fhir/CodeSystem/renewal-task', code: row.reference.split('-')[0], display: moduleTitle || 'Renewal task' }] },
    description: `${moduleTitle || 'Renewal'} — owner ${row.owner}, risk ${row.risk}, due ${row.due_date}`,
    authoredOn: new Date(row.created_at || Date.now()).toISOString(),
    restriction: { period: { end: row.due_date } },
    extension: [{ url: 'http://renewalcare.example/fhir/StructureDefinition/operational-risk', valueString: row.risk }],
  };
}

export function bundle(type, entries, baseUrl) {
  return {
    resourceType: 'Bundle',
    id: `bundle-${type}-${Date.now()}`,
    type,
    total: entries.length,
    link: [{ relation: 'self', url: baseUrl }],
    entry: entries.map(resource => ({ fullUrl: `${baseUrl}/${resource.resourceType}/${resource.id}`, resource })),
  };
}

export function operationOutcome(severity, code, diagnostics) {
  return { resourceType: 'OperationOutcome', issue: [{ severity, code, diagnostics }] };
}

// FHIR conformance statement — declares the resource endpoints this server exposes.
export function capabilityStatement(baseUrl) {
  const resource = (type, interactions) => ({ type, interaction: interactions.map(code => ({ code })), versioning: 'no-version' });
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString().slice(0, 10),
    publisher: 'RenewalCare Medicaid',
    kind: 'instance',
    software: { name: 'RenewalCare Medicaid Redetermination Operations' },
    implementation: { description: 'Medicaid eligibility renewal FHIR facade (synthetic demo data)', url: baseUrl },
    fhirVersion: '4.0.1',
    format: ['json'],
    rest: [{
      mode: 'server',
      security: { description: 'OAuth 2.0 bearer JWT (SMART on FHIR aligned); enforced by API middleware' },
      resource: [resource('Patient', ['read', 'search-type']), resource('Coverage', ['read', 'search-type']), resource('Task', ['search-type'])],
    }],
  };
}
