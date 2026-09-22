// reporting.mjs — Federal reporting (T-MSIS style extract manifest) and warehouse rollups.
// T-MSIS (Transformed Medicaid Statistical Information System) is the CMS national data system;
// states submit beneficiary, provider, claim, and service files. This module produces the
// synthetic extract manifest the submission pipeline would package.

const T_MSIS_FILE_TYPES = [
  { file: 'TMSIS_ELGS', name: 'Eligible Beneficiary File', source: 'op_member_master' },
  { file: 'TMSIS_PRVS', name: 'Provider File', source: 'op_provider_master' },
  { file: 'TMSIS_CLMS', name: 'Claim Header/Line File', source: 'mmis_claims' },
  { file: 'TMSIS_RENL', name: 'Renewal & Redetermination File', source: 'op_renewal' },
  { file: 'TMSIS_MEDS', name: 'Pharmacy Utilization File', source: 'op_pharmacy' },
  { file: 'TMSIS_ENCT', name: 'Managed Care Encounter File', source: 'op_encounter' },
  { file: 'TMSIS_APEL', name: 'Appeals & Fair Hearing File', source: 'op_appeal' },
  { file: 'TMSIS_X12T', name: 'X12 Transaction Ledger Extract', source: 'x12_transactions' },
];

export async function tmsisManifest(pool) {
  const files = [];
  for (const definition of T_MSIS_FILE_TYPES) {
    const result = await pool.query(`SELECT COUNT(*)::int count FROM "${definition.source}"`);
    files.push({ file: definition.file, name: definition.name, sourceTable: definition.source, recordCount: result.rows[0].count, status: 'Ready (synthetic extract)' });
  }
  return {
    program: 'T-MSIS',
    description: 'CMS Transformed Medicaid Statistical Information System submission manifest with synthetic extract counts.',
    submissionPeriod: `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`,
    generatedAt: new Date().toISOString(),
    totalRecords: files.reduce((sum, file) => sum + file.recordCount, 0),
    files,
  };
}

export async function warehouseRollup(pool) {
  const [claims, payments, renewals] = await Promise.all([
    pool.query(`SELECT decision, COUNT(*)::int count, COALESCE(SUM(total_billed),0)::float billed, COALESCE(SUM(paid),0)::float paid, COALESCE(SUM(patient_responsibility),0)::float member FROM mmis_claims GROUP BY decision`),
    pool.query(`SELECT to_char(date_trunc('month', service_date), 'YYYY-MM') period, COUNT(*)::int claims, COALESCE(SUM(paid),0)::float paid FROM mmis_claims GROUP BY 1 ORDER BY 1`),
    pool.query(`SELECT status, COUNT(*)::int count FROM "op_renewal" GROUP BY status ORDER BY status`),
  ]);
  return {
    claimsByDecision: claims.rows,
    paymentsByPeriod: payments.rows,
    renewalPipeline: renewals.rows,
    generatedAt: new Date().toISOString(),
  };
}
