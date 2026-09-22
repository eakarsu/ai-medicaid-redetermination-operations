// adjudication.mjs — Deterministic Medicaid claim adjudication engine.
// Implements the MES decision chain from the architecture specification:
//   Is this person eligible? → Is this doctor enrolled? → Is the procedure covered?
//   → Was authorization required? → Is another insurer responsible first?
//   → Is the claim valid (duplicate)? → What rate should Medicaid pay? → What is paid?
// Every step is recorded in an auditable trace; outcomes follow CARC-style adjustment codes.

// Fee schedule: real CPT/HCPCS code set (descriptions per the AMA CPT / HCPCS naming).
// Rates are this demo's Medicaid FFS rates; production loads the state's published fee schedule.
const FEE_SCHEDULE = {
  '99202': { rate: 105, description: 'Office visit, new patient, straightforward' },
  '99203': { rate: 145, description: 'Office visit, new patient, low complexity' },
  '99204': { rate: 210, description: 'Office visit, new patient, moderate complexity' },
  '99213': { rate: 180, description: 'Office visit, established patient' },
  '99214': { rate: 240, description: 'Office visit, established patient, moderate complexity' },
  '99385': { rate: 195, description: 'Preventive visit, new patient 18-39' },
  '93000': { rate: 150, description: 'Electrocardiogram, routine with interpretation' },
  '70450': { rate: 320, description: 'CT head/brain without contrast' },
  '71046': { rate: 95, description: 'Chest X-ray, 2 views' },
  '80053': { rate: 45, description: 'Comprehensive metabolic panel' },
  '80061': { rate: 32, description: 'Lipid panel' },
  '85025': { rate: 28, description: 'Complete blood count with differential' },
  '81001': { rate: 18, description: 'Urinalysis, automated with microscopy' },
  '36415': { rate: 12, description: 'Venipuncture, routine' },
  '90471': { rate: 25, description: 'Immunization administration' },
  '90686': { rate: 24, description: 'Influenza vaccine, quadrivalent' },
  '20610': { rate: 120, description: 'Arthrocentesis, major joint injection', priorAuthRequired: true },
  '27447': { rate: 2200, description: 'Knee arthroplasty', priorAuthRequired: true },
  '29881': { rate: 1850, description: 'Knee arthroscopy with meniscectomy', priorAuthRequired: true },
  '45378': { rate: 940, description: 'Colonoscopy, diagnostic', priorAuthRequired: true },
  '47562': { rate: 2600, description: 'Laparoscopic cholecystectomy', priorAuthRequired: true },
  '11042': { rate: 165, description: 'Debridement, subcutaneous tissue' },
  'J1885': { rate: 8, description: 'Ketorolac tromethamine injection, 15 mg (HCPCS)' },
  'J3420': { rate: 9, description: 'Vitamin B-12 injection (HCPCS)' },
  'A0428': { rate: 485, description: 'Ambulance service, BLS emergency transport (HCPCS)' },
  'T1016': { rate: 22, description: 'Behavioral health case management, 15 minutes (HCPCS)' },
};

const COINSURANCE = 0.20; // Medicaid member liability share for covered services

export function feeSchedule() {
  return Object.entries(FEE_SCHEDULE).map(([code, entry]) => ({ code, rate: entry.rate, description: entry.description, priorAuthRequired: Boolean(entry.priorAuthRequired) }));
}

export function isPriorAuthRequired(code) {
  return Boolean(FEE_SCHEDULE[code]?.priorAuthRequired);
}

export function rateFor(code) {
  return FEE_SCHEDULE[code]?.rate ?? null;
}

function step(name, result, detail) {
  return { step: name, result, detail };
}

export async function adjudicate({ pool, member, provider, claim }) {
  const trace = [];
  let allowed = 0;
  let paid = 0;
  let patientResponsibility = 0;
  let decision = 'Approved';
  let denialCode = null;

  // 1. Member eligibility (271-style status from the beneficiary registry)
  const eligible = member && member.data_status === 'Active';
  trace.push(step('Member eligibility', eligible ? 'Pass' : 'Fail', eligible ? `${member.reference} is an active Medicaid beneficiary.` : `${claim.memberReference} is not an active beneficiary (${member ? member.data_status : 'not found'}).`));
  if (!eligible) return { decision: 'Denied', denialCode: 'ELG-01', trace, allowed, paid, patientResponsibility: Number(claim.totalBilled) };

  // 2. Provider enrollment and credentialing
  const enrolled = provider && provider.data_status === 'Active';
  trace.push(step('Provider enrollment', enrolled ? 'Pass' : 'Fail', enrolled ? `${provider.reference} (${provider.data_name}) is enrolled and credentialed.` : `${claim.providerReference} is not an enrolled provider (${provider ? provider.data_status : 'not found'}).`));
  if (!enrolled) return { decision: 'Denied', denialCode: 'PRV-01', trace, allowed, paid, patientResponsibility: Number(claim.totalBilled) };

  // 3. Procedure covered under the Medicaid fee schedule
  const scheduleEntry = FEE_SCHEDULE[claim.procedureCode];
  const covered = Boolean(scheduleEntry);
  trace.push(step('Coverage determination', covered ? 'Pass' : 'Fail', covered ? `Procedure ${claim.procedureCode} (${scheduleEntry.description}) is covered; fee schedule rate ${scheduleEntry.rate}.` : `Procedure ${claim.procedureCode} is not on the Medicaid fee schedule.`));
  if (!covered) return { decision: 'Denied', denialCode: 'COV-01', trace, allowed, paid, patientResponsibility: Number(claim.totalBilled) };

  // 4. Prior authorization when required
  if (isPriorAuthRequired(claim.procedureCode)) {
    const auth = await pool.query("SELECT COUNT(*)::int count FROM \"op_priorauth\" WHERE \"data_procedureCode\"=$1 AND status='Approved'", [claim.procedureCode]);
    const authorized = auth.rows[0].count > 0;
    trace.push(step('Prior authorization', authorized ? 'Pass' : 'Fail', authorized ? `Approved prior authorization on file for ${claim.procedureCode}.` : `Procedure ${claim.procedureCode} requires prior authorization and none is approved.`));
    if (!authorized) return { decision: 'Denied', denialCode: 'PA-01', trace, allowed, paid, patientResponsibility: Number(claim.totalBilled) };
  } else {
    trace.push(step('Prior authorization', 'Not required', `Procedure ${claim.procedureCode} does not require prior authorization.`));
  }

  // 5. Duplicate detection (same member + provider + procedure + service date)
  const duplicate = await pool.query(
    'SELECT icn FROM mmis_claims WHERE member_reference=$1 AND provider_reference=$2 AND procedure_code=$3 AND service_date=$4 AND status <> $5 LIMIT 1',
    [claim.memberReference, claim.providerReference, claim.procedureCode, claim.serviceDate, 'denied'],
  );
  const isDuplicate = duplicate.rowCount > 0;
  trace.push(step('Duplicate validation', isDuplicate ? 'Fail' : 'Pass', isDuplicate ? `Duplicate of claim ${duplicate.rows[0].icn} for the same member, provider, procedure, and service date.` : 'No duplicate claim on file for this member/provider/procedure/date.'));
  if (isDuplicate) return { decision: 'Denied', denialCode: 'DUP-01', trace, allowed, paid, patientResponsibility: Number(claim.totalBilled) };

  // 6. Third-party liability: Medicaid is payer of last resort
  const tpl = await pool.query("SELECT \"data_otherPayer\", \"data_cobOrder\" FROM \"op_tpl\" WHERE status IN ('Open','Investigating','Review') AND \"data_cobOrder\"=1 LIMIT 1");
  const otherPayerPrimary = tpl.rowCount > 0;
  const billed = Number(claim.totalBilled);
  if (otherPayerPrimary) {
    allowed = Math.min(billed, scheduleEntry.rate);
    paid = Number((allowed * COINSURANCE).toFixed(2)); // cost-avoidance reduction while COB is unresolved
    patientResponsibility = Number((allowed - paid).toFixed(2));
    decision = 'Partially Approved';
    denialCode = 'TPL-01';
    trace.push(step('Third-party liability', 'Reduce', `Other payer ${tpl.rows[0].data_otherPayer} is primary (COB order 1); Medicaid reduced payment pending coordination of benefits.`));
  } else {
    trace.push(step('Third-party liability', 'Pass', 'Medicaid is the primary payer; no other responsible insurer on file.'));
  }

  // 7-8. Rate determination and payment calculation
  if (!otherPayerPrimary) {
    allowed = Math.min(billed, scheduleEntry.rate);
    paid = Number((allowed * (1 - COINSURANCE)).toFixed(2));
    patientResponsibility = Number((allowed - paid).toFixed(2));
    decision = billed > scheduleEntry.rate ? 'Partially Approved' : 'Approved';
    if (billed > scheduleEntry.rate) denialCode = 'CO-45';
    trace.push(step('Rate determination', billed > scheduleEntry.rate ? 'Reduced' : 'Pass', `Billed ${billed.toFixed(2)} vs fee schedule ${scheduleEntry.rate.toFixed(2)}: allowed ${allowed.toFixed(2)}${billed > scheduleEntry.rate ? ' (billed amount exceeded the fee schedule maximum).' : '.'}`));
    trace.push(step('Payment calculation', 'Pass', `Medicaid pays ${paid.toFixed(2)} (80% of allowed); member responsibility ${patientResponsibility.toFixed(2)} (20% coinsurance).`));
  }

  return { decision, denialCode, trace, allowed, paid, patientResponsibility };
}
