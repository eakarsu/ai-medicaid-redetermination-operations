// fwa.mjs — Fraud, Waste, and Abuse (program integrity) rules engine.
// Evaluates the claims ledger against surveillance rules and opens register cases in op_fwa
// for investigation. Mirrors the MES "fraud, waste, and abuse detection" capability.

const RULES = [
  {
    id: 'FWA-DUP',
    name: 'Duplicate claim pattern',
    description: 'Same member, provider, procedure, and service date billed more than once.',
    threshold: 1,
    async evaluate(pool) {
      const result = await pool.query(`SELECT member_reference, provider_reference, procedure_code, service_date, COUNT(*)::int hits,
        STRING_AGG(icn, ', ' ORDER BY created_at) AS icns
        FROM mmis_claims GROUP BY member_reference, provider_reference, procedure_code, service_date HAVING COUNT(*) > 1`);
      return result.rows.map(row => ({
        rule: this.id, ruleName: this.name, severity: 'High',
        subject: `${row.member_reference} / ${row.provider_reference}`,
        summary: `${row.hits} claims for ${row.procedure_code} on ${row.service_date} (${row.icns}).`,
        score: Math.min(100, 60 + row.hits * 15),
        recommendation: 'Refer to investigation; recover duplicate payment if confirmed.',
      }));
    },
  },
  {
    id: 'FWA-OOR',
    name: 'Billed amount outliers',
    description: 'Billed amount exceeds the fee schedule rate by more than 150%.',
    threshold: 1.5,
    async evaluate() { return []; }, // evaluated by outlierFindings() with the adjudication fee schedule
  },
  {
    id: 'FWA-SUS',
    name: 'Billing by non-enrolled provider',
    description: 'Claims received from providers whose enrollment is suspended, pending, or retired.',
    threshold: 0,
    async evaluate(pool) {
      const result = await pool.query(`SELECT c.icn, c.provider_reference, c.total_billed, p."data_status" AS provider_status
        FROM mmis_claims c JOIN "op_provider_master" p ON p.reference = c.provider_reference
        WHERE p."data_status" <> 'Active'`);
      return result.rows.map(row => ({
        rule: this.id, ruleName: this.name, severity: row.provider_status === 'Suspended' ? 'Critical' : 'Moderate',
        subject: row.provider_reference,
        summary: `Claim ${row.icn} (${Number(row.total_billed).toFixed(2)}) billed by a provider with ${row.provider_status} enrollment.`,
        score: row.provider_status === 'Suspended' ? 95 : 55,
        recommendation: 'Suspend payments pending provider enrollment review.',
      }));
    },
  },
  {
    id: 'FWA-FREQ',
    name: 'Utilization frequency spike',
    description: 'Member with more than 2 claims across the ledger (synthetic small-population threshold).',
    threshold: 2,
    async evaluate(pool) {
      const result = await pool.query(`SELECT member_reference, COUNT(*)::int hits, STRING_AGG(DISTINCT procedure_code, ', ') AS procedures
        FROM mmis_claims GROUP BY member_reference HAVING COUNT(*) > $1`, [this.threshold]);
      return result.rows.map(row => ({
        rule: this.id, ruleName: this.name, severity: 'Moderate',
        subject: row.member_reference,
        summary: `${row.hits} claims submitted covering procedures ${row.procedures}.`,
        score: Math.min(100, 40 + row.hits * 10),
        recommendation: 'Review member utilization history for service abuse patterns.',
      }));
    },
  },
];

export function ruleCatalog() {
  return RULES.map(rule => ({ id: rule.id, name: rule.name, description: rule.description }));
}

export async function scan(pool, { rateFor }) {
  const findings = [];
  for (const rule of RULES) {
    const hits = rule.id === 'FWA-OOR'
      ? await outlierFindings(pool, rateFor)
      : await rule.evaluate(pool);
    findings.push(...hits.map(hit => ({ ...hit })));
  }
  return findings;
}

async function outlierFindings(pool, rateFor) {
  const result = await pool.query('SELECT icn, procedure_code, total_billed, provider_reference FROM mmis_claims');
  return result.rows
    .filter(row => rateFor(row.procedure_code) && Number(row.total_billed) > rateFor(row.procedure_code) * 1.5)
    .map(row => ({
      rule: 'FWA-OOR', ruleName: 'Billed amount outliers', severity: 'High',
      subject: row.provider_reference,
      summary: `Claim ${row.icn} billed ${Number(row.total_billed).toFixed(2)} for ${row.procedure_code} against a ${rateFor(row.procedure_code).toFixed(2)} fee schedule rate.`,
      score: Math.min(100, Math.round(Number(row.total_billed) / rateFor(row.procedure_code) * 40)),
      recommendation: 'Audit the provider billing profile and verify documented medical necessity.',
    }));
}
