// mita.mjs — CMS Medicaid Information Technology Architecture (MITA) alignment registry.
// Maps this platform's modular capabilities to MITA business capabilities and maturity model,
// providing the State Self-Assessment style artifact required for Medicaid modernization programs.
// MITA maturity model: 1 Ad Hoc/Manual, 2 Automated, 3 Managed, 4 Standardized/Interoperable, 5 Optimized.

const MATURITY = [
  { level: 1, name: 'Ad Hoc / Manual', description: 'Processes executed manually with paper and spreadsheets.' },
  { level: 2, name: 'Automated', description: 'Core processes automated in a single system without shared services.' },
  { level: 3, name: 'Managed', description: 'Processes automated, measured, and managed with defined governance.' },
  { level: 4, name: 'Standardized / Interoperable', description: 'Shared services, standards-based exchange (X12/FHIR), modular components.' },
  { level: 5, name: 'Optimized', description: 'Continuous improvement, real-time analytics, and cross-program reuse.' },
];

const PRINCIPLES = [
  { id: 'modular', name: 'Modular', evidence: 'Each business capability is an independently governed module with its own PostgreSQL table, register, and API surface (config-driven in app.json).' },
  { id: 'interoperable', name: 'Interoperable', evidence: 'X12 270/271/834 and FHIR R4 endpoints (backend/src/x12.mjs, backend/src/fhir.mjs) plus a transactional event outbox (backend/src/events.mjs).' },
  { id: 'standards-based', name: 'Standards-based', evidence: 'HIPAA Security Rule safeguards, NIST CSF control mapping, ASC X12 v5010 transaction sets, FHIR R4 resources, JWT/OAuth-style bearer auth.' },
  { id: 'reusable', name: 'Reusable', evidence: 'Shared registers, master registries, and the audit/event services are consumed by every capability rather than duplicated.' },
  { id: 'service-oriented', name: 'Service-oriented', evidence: 'Domain capabilities, AI decision support, interoperability, and compliance are discrete services composed through the API layer.' },
];

const CAPABILITIES = [
  {
    id: 'member-management',
    mitaArea: 'Business',
    name: 'Member Management',
    description: 'Maintain beneficiary identity, household registry, and eligibility program participation.',
    mappedModules: ['member-master', 'program-master'],
    mappedFeatures: ['renewal-command', 'exparte-command'],
    workflows: ['renewal', 'exparte', 'change'],
    standards: ['FHIR R4 Patient/Coverage', 'X12 834'],
    currentMaturity: 3,
    targetMaturity: 4,
    nextAction: 'Publish member registry changes to the interoperability hub via the 834 maintenance transactions.',
  },
  {
    id: 'eligibility-determination',
    mitaArea: 'Business',
    name: 'Eligibility Determination & Redetermination',
    description: 'Execute renewals, ex parte reviews, change-in-circumstance processing, and procedural termination prevention.',
    mappedModules: ['renewal', 'exparte', 'change', 'termination'],
    mappedFeatures: ['renewal-command', 'exparte-command'],
    workflows: ['renewal', 'exparte', 'termination', 'change'],
    standards: ['X12 270/271', 'Event outbox'],
    currentMaturity: 3,
    targetMaturity: 4,
    nextAction: 'Automate 270 eligibility verification before every non-ex-parte renewal decision.',
  },
  {
    id: 'appeal-support',
    mitaArea: 'Business',
    name: 'Appeal Support',
    description: 'Manage fair hearing requests, appeal tracking, and due-process timelines for adverse determinations.',
    mappedModules: ['appeal'],
    mappedFeatures: [],
    workflows: ['appeal'],
    standards: ['Fair hearing system connector', 'Event outbox'],
    currentMaturity: 2,
    targetMaturity: 3,
    nextAction: 'Bi-directional fair hearing system exchange for hearing schedules and decisions.',
  },
  {
    id: 'customer-communication',
    mitaArea: 'Business',
    name: 'Customer / Member Communications',
    description: 'Deliver renewal notices, language-access templates, and multichannel beneficiary outreach.',
    mappedModules: ['notice', 'notice-master', 'outreach'],
    mappedFeatures: ['notice-command', 'outreach-command'],
    workflows: ['notice', 'outreach'],
    standards: ['Notice template library', 'Omnichannel connector'],
    currentMaturity: 3,
    targetMaturity: 4,
    nextAction: 'Event-driven notice dispatch triggered by eligibility determination events.',
  },
  {
    id: 'verification-documents',
    mitaArea: 'Information',
    name: 'Verification & Document Exchange',
    description: 'Intake, validate, and retain verification documents supporting eligibility evidence.',
    mappedModules: ['documents', 'verification-master'],
    mappedFeatures: ['documents-command'],
    workflows: ['documents'],
    standards: ['Document imaging connector', 'FHIR R4 Task/DocumentReference'],
    currentMaturity: 2,
    targetMaturity: 3,
    nextAction: 'Expose verification status as FHIR Task resources for caseworker portability.',
  },
  {
    id: 'decision-support',
    mitaArea: 'Technical',
    name: 'Decision Support & Analytics',
    description: 'AI-assisted decision briefs, operational reports, risk analytics, and federal reporting feeds.',
    mappedModules: ['renewal', 'exparte', 'notice', 'documents', 'outreach', 'termination', 'change', 'appeal'],
    mappedFeatures: ['renewal-command', 'exparte-command', 'notice-command', 'documents-command', 'outreach-command'],
    workflows: [],
    standards: ['OpenRouter AI with structured output', 'Reports API', 'Event stream'],
    currentMaturity: 3,
    targetMaturity: 4,
    nextAction: 'Feed the event stream into the analytics warehouse for near-real-time program dashboards.',
  },
  {
    id: 'security-compliance',
    mitaArea: 'Technical',
    name: 'Security & Compliance Services',
    description: 'HIPAA/NIST safeguards: RBAC, encryption, audit controls, transmission security.',
    mappedModules: [],
    mappedFeatures: [],
    workflows: [],
    standards: ['HIPAA §164.312', 'NIST CSF', 'RBAC', 'AES-256-GCM'],
    currentMaturity: 3,
    targetMaturity: 4,
    nextAction: 'TLS termination at ingress plus managed-service encryption and backup recovery (see cloud reference architecture).',
  },
  {
    id: 'interoperability-hub',
    mitaArea: 'Technical',
    name: 'Interoperability & Integration Services',
    description: 'Standards-based exchange with the state eligibility system, federal hub, and partner agencies.',
    mappedModules: [],
    mappedFeatures: [],
    workflows: [],
    standards: ['X12 270/271/834', 'FHIR R4', 'Transactional outbox'],
    currentMaturity: 3,
    targetMaturity: 4,
    nextAction: 'Promote the outbox dispatcher to durable queue infrastructure (Kafka/EventBridge) in the cloud target state.',
  },
];

export function registry() {
  return { maturityModel: MATURITY, principles: PRINCIPLES, capabilities: CAPABILITIES };
}

export function maturityLabel(level) {
  return MATURITY.find(entry => entry.level === level)?.name || String(level);
}

export function selfAssessment() {
  const scored = CAPABILITIES.map(capability => ({ id: capability.id, name: capability.name, current: capability.currentMaturity, target: capability.targetMaturity }));
  const average = scores => scores.length ? Number((scores.reduce((sum, value) => sum + value.current, 0) / scores.length).toFixed(2)) : 0;
  return {
    scoredCapabilities: scored,
    currentMaturityAverage: average(scored),
    targetMaturityAverage: scored.length ? Number((scored.reduce((sum, value) => sum + value.target, 0) / scored.length).toFixed(2)) : 0,
    gaps: scored.filter(entry => entry.target > entry.current).map(entry => ({ capability: entry.name, from: entry.current, to: entry.target, plannedAction: CAPABILITIES.find(capability => capability.id === entry.id)?.nextAction })),
  };
}

// Perspective summary across the three MITA architecture views referenced by CMS guidance.
export function perspectives() {
  return {
    business: 'Enroll, renew, notice, verify, appeal: the business capabilities each module delivers (registry above, Business rows).',
    information: 'Beneficiary, program, verification, and decision data exchanged as X12 transactions and FHIR R4 resources; every transition emits an auditable event.',
    technical: 'React + Node/Express modular services over PostgreSQL, JWT + RBAC security, transactional outbox with dispatcher, Docker/cloud target state.',
  };
}
