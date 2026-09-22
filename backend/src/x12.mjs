// x12.mjs — ASC X12 EDI for Medicaid eligibility interoperability.
// 270 (Eligibility Benefit Inquiry) / 271 (Eligibility Benefit Response) — 005010X279A1
// 834 (Benefit Enrollment and Maintenance) — 005010X220A1
// Element separator '*', segment terminator '~', component separator ':'. Zero dependencies.

const ELEMENT = '*';
const SEGMENT = '~';
const VERSION_270_271 = '005010X279A1';
const VERSION_834 = '005010X220A1';
const VERSION_837 = '005010X222A1';
const VERSION_835 = '005010X221A1';

function x12Date(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return {
    isaDate: `${String(date.getUTCFullYear()).slice(2)}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`,
    isaTime: `${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}`,
    gsDate: `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`,
    gsTime: `${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}`,
    full: `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`,
  };
}

function padControl(value, width) {
  return String(value).replace(/\D/g, '').padStart(width, '0').slice(-width);
}

function nameParts(fullName) {
  const parts = String(fullName || 'Demo Beneficiary').trim().split(/\s+/);
  return { last: (parts[0] || 'BENEFICIARY').toUpperCase(), first: (parts.slice(1).join(' ') || 'DEMO').toUpperCase() };
}

function envelope({ sender, receiver, gsFunctionalCode, version, controlNumber, segments, timestamp }) {
  const clock = x12Date(timestamp);
  const isaControl = padControl(controlNumber, 9);
  const gsControl = padControl(controlNumber, 6);
  const isa = ['ISA', '00', '          ', '00', '          ', 'ZZ', String(sender.id).padEnd(15).slice(0, 15), 'ZZ', String(receiver.id).padEnd(15).slice(0, 15), clock.isaDate, clock.isaTime, '^', '00501', isaControl, '0', 'P', ':'].join(ELEMENT);
  const gs = ['GS', gsFunctionalCode, String(sender.id).slice(0, 15), String(receiver.id).slice(0, 15), clock.gsDate, clock.gsTime, gsControl, 'X', version].join(ELEMENT);
  const stControl = padControl(controlNumber, 4);
  const st = segments.shift();
  const seCount = segments.length + 2;
  const stSegments = [st, ...segments, ['SE', String(seCount), stControl].join(ELEMENT)];
  return [
    `${isa}${SEGMENT}`,
    `${gs}${SEGMENT}`,
    ...stSegments.map(segment => `${segment}${SEGMENT}`),
    `GE*1*${gsControl}${SEGMENT}`,
    `IEA*1*${isaControl}${SEGMENT}`,
  ].join('');
}

// ---- 270: inquiry asking the state eligibility system whether a member is currently eligible ----
export function build270({ sender, receiver, member, traceNumber, controlNumber, timestamp = new Date() }) {
  const clock = x12Date(timestamp);
  const { last, first } = nameParts(member.name);
  const segments = [
    ['ST', '270', padControl(controlNumber, 4), VERSION_270_271].join(ELEMENT),
    ['BHT', '0022', '13', String(traceNumber || member.reference || 'TRACE1').slice(0, 50), clock.full, clock.gsTime].join(ELEMENT),
    ['HL', '1', '', '20', '1'].join(ELEMENT),
    ['NM1', 'PR', '2', (receiver.name || 'STATE MEDICAID AGENCY').toUpperCase().slice(0, 60), '', '', '', '', 'PI', '1'].join(ELEMENT),
    ['HL', '2', '1', '21', '1'].join(ELEMENT),
    ['NM1', '1P', '2', (sender.name || 'RENEWALCARE OPERATIONS').toUpperCase().slice(0, 60), '', '', '', '', 'FI', sender.taxId || '123456789'].join(ELEMENT),
    ['HL', '3', '2', '1'].join(ELEMENT),
    ['NM1', 'IL', '1', last, first, '', '', '', 'MI', String(member.memberId || member.reference || 'UNKNOWNMEMBER').slice(0, 80)].join(ELEMENT),
    ['REF', '0F', String(member.reference || member.memberId || '').slice(0, 50)].join(ELEMENT),
    ['DMG', 'D8', member.birthDate || '19800101'].join(ELEMENT),
    ['EQ', '1'].join(ELEMENT),
  ];
  return envelope({ sender, receiver, gsFunctionalCode: 'HS', version: VERSION_270_271, controlNumber, segments, timestamp });
}

// ---- 271: the state's response — eligibility status plus benefit detail (EB segments) ----
export function build271({ sender, receiver, member, eligibilityStatus = 'A', benefits, eligibilityBegin, traceNumber, controlNumber, timestamp = new Date() }) {
  const clock = x12Date(timestamp);
  const { last, first } = nameParts(member.name);
  const benefitRows = (benefits && benefits.length ? benefits : [{ code: eligibilityStatus, serviceType: '1', description: 'MEDICAL CARE' }])
    .map(benefit => ['EB', benefit.code || eligibilityStatus, '', benefit.serviceType || '1', '', benefit.description || 'MEDICAL CARE'].join(ELEMENT));
  const segments = [
    ['ST', '271', padControl(controlNumber, 4), VERSION_270_271].join(ELEMENT),
    ['BHT', '0022', '11', String(traceNumber || 'TRACE1').slice(0, 50), clock.full, clock.gsTime].join(ELEMENT),
    ['HL', '1', '', '20', '1'].join(ELEMENT),
    ['NM1', 'PR', '2', (sender.name || 'STATE MEDICAID AGENCY').toUpperCase().slice(0, 60), '', '', '', '', 'PI', '1'].join(ELEMENT),
    ['HL', '2', '1', '21', '1'].join(ELEMENT),
    ['NM1', '1P', '2', (receiver.name || 'RENEWALCARE OPERATIONS').toUpperCase().slice(0, 60), '', '', '', '', 'XX', receiver.npi || '1234567893'].join(ELEMENT),
    ['HL', '3', '2', '1', '0'].join(ELEMENT),
    ['TRN', '1', `1${padControl(controlNumber, 9)}`, String(traceNumber || '').slice(0, 50)].join(ELEMENT),
    ['NM1', 'IL', '1', last, first, '', '', '', 'MI', String(member.memberId || member.reference || 'UNKNOWNMEMBER').slice(0, 80)].join(ELEMENT),
    ['REF', '0F', String(member.reference || '').slice(0, 50)].join(ELEMENT),
    ['DMG', 'D8', member.birthDate || '19800101'].join(ELEMENT),
    ...benefitRows,
    ['DTP', '348', 'D8', (eligibilityBegin || clock.full).replace(/-/g, '')].join(ELEMENT),
  ];
  return envelope({ sender, receiver, gsFunctionalCode: 'HS', version: VERSION_270_271, controlNumber, segments, timestamp });
}

// ---- 834: enroll or maintain a member on Medicaid benefits (renewal outcome → state system) ----
export function build834({ sender, receiver, members, controlNumber, maintenanceType = '021', effectiveDate, timestamp = new Date() }) {
  const clock = x12Date(timestamp);
  const effective = (effectiveDate || clock.full).replace(/-/g, '');
  const body = [];
  (Array.isArray(members) ? members : [members]).forEach((member, index) => {
    const { last, first } = nameParts(member.name);
    const sequence = index + 1;
    body.push(
      ['INS', 'Y', '18', maintenanceType, 'A', '', '', member.employmentStatus || 'FT'].join(ELEMENT),
      ['REF', '0F', String(member.reference || member.memberId || '').slice(0, 50)].join(ELEMENT),
      ['NM1', 'IL', '1', last, first, '', '', '', 'MI', String(member.memberId || member.reference || 'UNKNOWNMEMBER').slice(0, 80)].join(ELEMENT),
      ['DMG', 'D8', member.birthDate || '19800101', member.gender || 'U'].join(ELEMENT),
      ['DTP', '348', 'D8', effective].join(ELEMENT),
      ['HD', maintenanceType, 'MED', 'Family Medicaid'].join(ELEMENT),
    );
  });
  const segments = [
    ['ST', '834', padControl(controlNumber, 4), VERSION_834].join(ELEMENT),
    ['BHT', '0019', '00', String(sender.name || 'RENEWALCARE').toUpperCase().slice(0, 50), clock.full, clock.gsTime].join(ELEMENT),
    ['REF', '38', String(sender.masterPolicyId || 'RENEWALCARE-MEDICAID').slice(0, 50)].join(ELEMENT),
    ...body,
  ];
  return envelope({ sender, receiver, gsFunctionalCode: 'BE', version: VERSION_834, controlNumber, segments, timestamp });
}

// ---- Parsing utilities: split raw transmissions into segments and business objects ----
export function parseSegments(raw) {
  return String(raw || '')
    .split(SEGMENT)
    .map(segment => segment.replace(/^\s+/, ''))
    .filter(Boolean)
    .map(segment => segment.split(ELEMENT).map(element => element.trim()));
}

export function countSegments(raw) {
  return parseSegments(raw).length;
}

function detectTransactionSet(segments) {
  const st = segments.find(parts => parts[0] === 'ST');
  return st?.[1] || null;
}

function memberFromNm1Il(segments, startIndex) {
  const nm1 = segments[startIndex];
  const collected = { entityCode: nm1[1], last: nm1[3] || '', first: nm1[4] || '', qualifier: nm1[8] || '', memberId: nm1[9] || '' };
  for (let index = startIndex + 1; index < Math.min(startIndex + 8, segments.length); index += 1) {
    const parts = segments[index];
    if (parts[0] === 'NM1' && parts[1] === 'IL') break;
    if (parts[0] === 'REF') collected.reference = collected.reference || parts[2];
    if (parts[0] === 'DMG') collected.birthDate = parts[2] || '';
    if (parts[0] === 'TRN') collected.trace = parts[2] || '';
  }
  return collected;
}

export function parse271(raw) {
  const segments = parseSegments(raw);
  if (detectTransactionSet(segments) !== '271') throw new Error('Not a 271 eligibility benefit response (missing ST*271)');
  const result = { transactionSet: '271', version: segments.find(parts => parts[0] === 'ST')?.[3] || VERSION_270_271, controlNumber: '', traceNumber: '', member: null, eligibilityStatus: 'Unknown', benefits: [], beginDate: null, errors: [] };
  segments.forEach((parts, index) => {
    if (parts[0] === 'SE') result.controlNumber = parts[2] || result.controlNumber;
    if (parts[0] === 'TRN') result.traceNumber = parts[2] || '';
    if (parts[0] === 'NM1' && parts[1] === 'IL') result.member = result.member || memberFromNm1Il(segments, index);
    if (parts[0] === 'EB') result.benefits.push({ code: parts[1] || '', serviceType: parts[3] || '', description: parts[5] || parts[4] || '' });
    if (parts[0] === 'DTP' && parts[1] === '348') result.beginDate = parts[3] || null;
    if (parts[0] === 'AAA') result.errors.push({ code: parts[2] || '', message: parts[4] || '' });
  });
  const codes = result.benefits.map(benefit => benefit.code).filter(Boolean);
  result.eligibilityStatus = result.errors.length ? 'Rejected' : codes.includes('A') ? 'Active' : codes.length ? 'Inactive' : 'Unknown';
  return result;
}

export function parse834(raw) {
  const segments = parseSegments(raw);
  if (detectTransactionSet(segments) !== '834') throw new Error('Not an 834 enrollment transaction (missing ST*834)');
  const result = { transactionSet: '834', version: segments.find(parts => parts[0] === 'ST')?.[3] || VERSION_834, controlNumber: '', masterPolicyId: '', members: [] };
  let current = null;
  segments.forEach((parts, index) => {
    if (parts[0] === 'REF' && parts[1] === '38') result.masterPolicyId = parts[2] || '';
    if (parts[0] === 'SE') result.controlNumber = parts[2] || result.controlNumber;
    if (parts[0] === 'INS') {
      current = { memberIndicator: parts[1] || '', relationship: parts[2] || '', maintenanceType: parts[3] || '', employmentStatus: parts[7] || '' };
      result.members.push(current);
      return;
    }
    if (!current) return;
    if (parts[0] === 'NM1' && parts[1] === 'IL') Object.assign(current, memberFromNm1Il(segments, index));
    if (parts[0] === 'REF' && parts[1] === '0F') current.reference = parts[2] || '';
    if (parts[0] === 'DMG') { current.birthDate = parts[2] || ''; current.gender = parts[3] || ''; }
    if (parts[0] === 'DTP' && parts[1] === '348') current.effectiveDate = parts[3] || '';
    if (parts[0] === 'HD') current.planType = parts[2] || '';
  });
  return result;
}

// ---- 837: professional claim submission (005010X222A1) ----
export function build837({ sender, receiver, claim, controlNumber, timestamp = new Date() }) {
  const clock = x12Date(timestamp);
  const { last, first } = nameParts(claim.memberName);
  const billingProvider = claim.billingProvider || { name: (sender.name || 'BILLING PROVIDER').toUpperCase(), npi: sender.npi || '1234567893', taxId: sender.taxId || '123456789' };
  const lines = (claim.lines && claim.lines.length ? claim.lines : [{ code: claim.procedureCode, charge: claim.totalBilled, units: 1 }]);
  const body = [];
  lines.forEach((line, index) => {
    body.push(
      ['LX', String(index + 1)].join(ELEMENT),
      ['SV1', `HC:${line.code}`, Number(line.charge || 0).toFixed(2), 'UN', String(line.units || 1), '', '', '1'].join(ELEMENT),
      ['DTP', '472', 'D8', String(claim.serviceDate).replace(/-/g, '')].join(ELEMENT),
    );
  });
  const segments = [
    ['ST', '837', padControl(controlNumber, 4), VERSION_837].join(ELEMENT),
    ['BHT', '0019', '00', String(claim.icn || 'CLAIM1').slice(0, 50), clock.full, clock.gsTime, 'CH'].join(ELEMENT),
    ['NM1', '41', '2', String(billingProvider.name).slice(0, 60), '', '', '', '', '46', String(billingProvider.taxId).slice(0, 30)].join(ELEMENT),
    ['HL', '1', '', '20', '1'].join(ELEMENT),
    ['PRV', 'BI', 'PXC', claim.billingProviderTaxonomy || '207Q00000X'].join(ELEMENT),
    ['NM1', '85', '2', String(billingProvider.name).slice(0, 60), '', '', '', '', 'XX', String(billingProvider.npi).slice(0, 15)].join(ELEMENT),
    ['HL', '2', '1', '22', '0'].join(ELEMENT),
    ['SBR', 'P', '18', '', '', '', '', '', 'MB'].join(ELEMENT),
    ['NM1', 'IL', '1', last, first, '', '', '', 'MI', String(claim.memberId || 'UNKNOWNMEMBER').slice(0, 80)].join(ELEMENT),
    ['REF', '0F', String(claim.memberReference || '').slice(0, 50)].join(ELEMENT),
    ['CLM', String(claim.icn || 'CLAIM1').slice(0, 38), Number(claim.totalBilled || 0).toFixed(2), '', '', '13:B:1', 'Y', 'A', 'Y', 'Y'].join(ELEMENT),
    ['DTP', '431', 'D8', String(claim.serviceDate).replace(/-/g, '')].join(ELEMENT),
    ...body,
  ];
  return envelope({ sender, receiver, gsFunctionalCode: 'HC', version: VERSION_837, controlNumber, segments, timestamp });
}

export function parse837(raw) {
  const segments = parseSegments(raw);
  if (detectTransactionSet(segments) !== '837') throw new Error('Not an 837 claim submission (missing ST*837)');
  const result = { transactionSet: '837', version: segments.find(parts => parts[0] === 'ST')?.[3] || VERSION_837, controlNumber: '', icn: '', billingProvider: null, subscriber: null, totalCharge: 0, lines: [] };
  segments.forEach((parts, index) => {
    if (parts[0] === 'SE') result.controlNumber = parts[2] || result.controlNumber;
    if (parts[0] === 'BHT') result.icn = parts[3] || '';
    if (parts[0] === 'NM1' && parts[1] === '85') result.billingProvider = { name: parts[3] || '', npi: parts[9] || '' };
    if (parts[0] === 'NM1' && parts[1] === 'IL') result.subscriber = memberFromNm1Il(segments, index);
    if (parts[0] === 'CLM') { result.claimNumber = parts[1] || ''; result.totalCharge = Number(parts[2] || 0); }
    if (parts[0] === 'SV1') result.lines.push({ code: String(parts[1] || '').split(':')[1] || '', charge: Number(parts[2] || 0), units: Number(parts[4] || 1) });
  });
  return result;
}

// ---- 835: remittance advice returning adjudication and payment detail (005010X221A1) ----
export function build835({ sender, receiver, claim, controlNumber, timestamp = new Date() }) {
  const clock = x12Date(timestamp);
  const segments = [
    ['ST', '835', padControl(controlNumber, 4), VERSION_835].join(ELEMENT),
    ['BPR', 'I', Number(claim.paid || 0).toFixed(2), 'C', 'ACH', 'CCP', '01', '999999999', 'DA', '12345678', clock.full, clock.gsTime].join(ELEMENT),
    ['TRN', '1', String(claim.icn || 'CLAIM1').slice(0, 50), '12100000000'].join(ELEMENT),
    ['N1', 'PR', (sender.name || 'STATE MEDICAID AGENCY').toUpperCase().slice(0, 60)].join(ELEMENT),
    ['N1', 'PE', String(claim.providerName || (receiver.name || 'PROVIDER')).toUpperCase().slice(0, 60), 'XX', String(claim.providerNpi || receiver.npi || '1234567893').slice(0, 15)].join(ELEMENT),
    ['LX', '1'].join(ELEMENT),
    ['CLP', String(claim.icn || 'CLAIM1').slice(0, 38), claim.decision === 'Denied' ? '4' : '1', Number(claim.totalBilled || 0).toFixed(2), Number(claim.paid || 0).toFixed(2), Number(claim.patientResponsibility || 0).toFixed(2), 'MC', String(claim.claimNumber || claim.icn || '').slice(0, 50)].join(ELEMENT),
    ...(claim.denialCode ? [['CAS', 'CO', claim.denialCode.replace(/[^0-9A-Z-]/g, '').slice(0, 5) || '45', Number(claim.totalBilled || 0).toFixed(2)].join(ELEMENT)] : []),
    ['SVC', `HC:${claim.procedureCode}`, Number(claim.totalBilled || 0).toFixed(2), Number(claim.paid || 0).toFixed(2), '', '', Number(claim.units || 1)].join(ELEMENT),
    ['DTP', '472', 'D8', String(claim.serviceDate).replace(/-/g, '')].join(ELEMENT),
  ];
  return envelope({ sender, receiver, gsFunctionalCode: 'HP', version: VERSION_835, controlNumber, segments, timestamp });
}

export function parse835(raw) {
  const segments = parseSegments(raw);
  if (detectTransactionSet(segments) !== '835') throw new Error('Not an 835 remittance advice (missing ST*835)');
  const result = { transactionSet: '835', version: segments.find(parts => parts[0] === 'ST')?.[3] || VERSION_835, controlNumber: '', traceNumber: '', paymentMethod: '', payer: '', payee: '', claims: [] };
  let current = null;
  segments.forEach(parts => {
    if (parts[0] === 'SE') result.controlNumber = parts[2] || result.controlNumber;
    if (parts[0] === 'BPR') { result.paymentMethod = parts[4] || ''; result.totalPaid = Number(parts[2] || 0); }
    if (parts[0] === 'TRN') result.traceNumber = parts[2] || '';
    if (parts[0] === 'N1' && parts[1] === 'PR') result.payer = parts[2] || '';
    if (parts[0] === 'N1' && parts[1] === 'PE') result.payee = parts[2] || '';
    if (parts[0] === 'CLP') {
      current = { claimNumber: parts[1] || '', statusCode: parts[2] || '', status: { '1': 'Processed as Primary', '4': 'Denied' }[parts[2]] || 'Other', totalCharge: Number(parts[3] || 0), paid: Number(parts[4] || 0), patientResponsibility: Number(parts[5] || 0), adjustments: [], services: [] };
      result.claims.push(current);
      return;
    }
    if (!current) return;
    if (parts[0] === 'CAS') current.adjustments.push({ group: parts[1] || '', code: parts[2] || '', amount: Number(parts[3] || 0) });
    if (parts[0] === 'SVC') current.services.push({ code: String(parts[1] || '').split(':')[1] || '', charge: Number(parts[2] || 0), paid: Number(parts[3] || 0), units: Number(parts[6] || 1) });
  });
  return result;
}

// ---- 999: functional acknowledgment accepting or rejecting a received transaction set (005010) ----
export function build999({ acknowledgedSet, acknowledgedControl, accepted = true, errors = [], controlNumber, timestamp = new Date() }) {
  const segments = [
    ['ST', '999', padControl(controlNumber, 4), '005010'].join(ELEMENT),
    ['AK1', 'HS', padControl(acknowledgedControl || controlNumber, 6)].join(ELEMENT),
    ['AK2', String(acknowledgedSet || '834'), padControl(acknowledgedControl || controlNumber, 4)].join(ELEMENT),
    ...errors.map(error => ['IK3', error.segment || '', error.position || '', error.code || '5'].join(ELEMENT)),
    ...(errors.length ? errors.slice(0, 1).map(error => ['IK4', '', error.element || '', error.elementCode || '6'].join(ELEMENT)) : []),
    ['AK5', accepted ? 'A' : 'R'].join(ELEMENT),
    ['AK9', accepted ? 'A' : 'R', '1', '1', accepted ? '0' : '1'].join(ELEMENT),
  ];
  return envelope({ sender: { id: 'STATEMEDICAID' }, receiver: { id: 'RENEWALCARE' }, gsFunctionalCode: 'AK', version: '005010', controlNumber, segments, timestamp });
}

export function parse999(raw) {
  const segments = parseSegments(raw);
  if (detectTransactionSet(segments) !== '999') throw new Error('Not a 999 functional acknowledgment (missing ST*999)');
  const result = { transactionSet: '999', controlNumber: '', acknowledgedFunctionalGroup: '', acknowledgedSet: '', acknowledgedControl: '', accepted: false, errors: [] };
  let transactionAccepted = false;
  let groupAccepted = false;
  segments.forEach(parts => {
    if (parts[0] === 'SE') result.controlNumber = parts[2] || result.controlNumber;
    if (parts[0] === 'AK1') result.acknowledgedFunctionalGroup = parts[2] || '';
    if (parts[0] === 'AK2') { result.acknowledgedSet = parts[1] || ''; result.acknowledgedControl = parts[2] || ''; }
    if (parts[0] === 'AK5') transactionAccepted = parts[1] === 'A';
    if (parts[0] === 'AK9') groupAccepted = parts[1] === 'A';
    if (parts[0] === 'IK3') result.errors.push({ segment: parts[1], position: parts[2], code: parts[3] });
  });
  result.accepted = transactionAccepted && groupAccepted;
  return result;
}

export function supportedTransactions() {
  return [
    { set: '270', name: 'Eligibility Benefit Inquiry', version: VERSION_270_271, usage: 'Ask the state eligibility system (MMIS) whether a beneficiary is active before renewal action.' },
    { set: '271', name: 'Eligibility Benefit Response', version: VERSION_270_271, usage: 'State response with eligibility status and benefit detail; parsed into JSON for workflow decisions.' },
    { set: '834', name: 'Benefit Enrollment and Maintenance', version: VERSION_834, usage: 'Transmit renewal outcomes (approvals, terminations, changes) to the state enrollment system.' },
    { set: '837', name: 'Professional Claim Submission', version: VERSION_837, usage: 'Submit provider claims to the MMIS claims engine for adjudication.' },
    { set: '835', name: 'Electronic Remittance Advice', version: VERSION_835, usage: 'Return adjudication decisions and payments to providers, including adjustment codes.' },
    { set: '999', name: 'Functional Acknowledgment', version: '005010', usage: 'Accept or reject received transaction sets with segment-level error detail.' },
  ];
}
