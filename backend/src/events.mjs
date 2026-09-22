// events.mjs — Transactional outbox for event-driven integration (MITA service-oriented layer).
// Domain decisions INSERT business events into event_outbox inside the SAME SQL transaction as
// the state change; a dispatcher drains pending events, guaranteeing at-least-once delivery to
// downstream consumers (state eligibility system, federal hub, analytics) without dual writes.
// With KAFKA_BROKERS configured, drained events are produced to a real Kafka topic (kafkajs).

import { publishToKafka } from './kafka.mjs';

export async function publish(client, { type, aggregateType, aggregateId, payload = {}, deliveryTarget = 'interoperability-hub', correlationId = null }) {
  const result = await client.query(
    'INSERT INTO event_outbox(event_type,aggregate_type,aggregate_id,payload,delivery_target,correlation_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
    [type, aggregateType, String(aggregateId), JSON.stringify(payload), deliveryTarget, correlationId],
  );
  return result.rows[0].id;
}

export async function stream(pool, { limit = 100, status = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const query = status
    ? 'SELECT * FROM event_outbox WHERE status=$1 ORDER BY created_at DESC,id DESC LIMIT $2'
    : 'SELECT * FROM event_outbox ORDER BY created_at DESC,id DESC LIMIT $1';
  const result = status ? await pool.query(query, [status, safeLimit]) : await pool.query(query, [safeLimit]);
  return result.rows;
}

export async function stats(pool) {
  const [byStatus, byType] = await Promise.all([
    pool.query('SELECT status, COUNT(*)::int count FROM event_outbox GROUP BY status'),
    pool.query('SELECT event_type, COUNT(*)::int count FROM event_outbox GROUP BY event_type ORDER BY count DESC LIMIT 12'),
  ]);
  return { byStatus: byStatus.rows, byType: byType.rows };
}

// Drains one batch: produces each pending event to Kafka when configured (at-least-once;
// the outbox row remains the delivery unit of record), then marks it published.
export async function dispatchOnce(pool, batchSize = 50) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await client.query("SELECT * FROM event_outbox WHERE status='pending' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED", [batchSize]);
    if (!pending.rowCount) { await client.query('COMMIT'); return 0; }
    for (const event of pending.rows) await publishToKafka(event);
    const ids = pending.rows.map(row => row.id);
    await client.query('UPDATE event_outbox SET status=$1, published_at=NOW() WHERE id = ANY($2::bigint[])', ['published', ids]);
    await client.query('COMMIT');
    return pending.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function startDispatcher(pool, intervalMs = 10_000) {
  const timer = setInterval(() => {
    dispatchOnce(pool).catch(error => console.error(`event dispatcher: ${error.message}`));
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export function eventCatalog() {
  return [
    { type: 'renewal.population.approved', trigger: 'Domain action: Approve Renewal Population Management', consumers: ['State eligibility system (834)', 'Analytics warehouse'] },
    { type: 'renewal.case.escalated', trigger: 'Domain action: Escalate any capability', consumers: ['Operations queue', 'Federal reporting hub'] },
    { type: 'renewal.case.created', trigger: 'New workflow case created in the AI studio', consumers: ['Work queue', 'Audit service'] },
    { type: 'renewal.case.transitioned', trigger: 'Workflow case state change', consumers: ['Work queue', 'Audit service'] },
    { type: 'notice.dispatched', trigger: 'Renewal notice register transition', consumers: ['Omnichannel outreach connector'] },
    { type: 'appeal.status.changed', trigger: 'Appeal register transition', consumers: ['Fair hearing system connector'] },
    { type: 'integration.validated', trigger: 'Integration connection test', consumers: ['Operations dashboard'] },
    { type: 'x12.transaction.generated', trigger: '270/271/834 transmission', consumers: ['Interoperability hub', 'X12 ledger'] },
    { type: 'claims.adjudicated', trigger: 'Claim processed by the adjudication engine', consumers: ['Provider portal', 'T-MSIS claims file', 'Payment register'] },
    { type: 'claims.paid', trigger: '835 remittance generated for a paid claim', consumers: ['Provider portal', 'Financial reconciliation'] },
    { type: 'fwa.case.opened', trigger: 'Program integrity rule detected a pattern', consumers: ['FWA register', 'Investigation queue'] },
    { type: 'batch.exchanged', trigger: 'SFTP batch of 834/837 transactions delivered', consumers: ['Batch gateway', '999 acknowledgment ledger'] },
    { type: 'reporting.extracted', trigger: 'T-MSIS submission manifest generated', consumers: ['CMS submission pipeline', 'Audit service'] },
    { type: 'ai.analysis.saved', trigger: 'AI decision brief saved', consumers: ['Audit service', 'Analytics warehouse'] },
  ];
}
