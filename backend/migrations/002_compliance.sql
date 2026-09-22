-- 002_compliance.sql
-- Medicaid Enterprise compliance layer: event-driven interoperability (X12/FHIR) and auditability.
-- Transactional outbox: domain decisions publish events in the same SQL transaction that
-- commits the state change, so consumers never miss or double-apply a business event.
CREATE TABLE IF NOT EXISTS event_outbox(
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  delivery_target TEXT NOT NULL DEFAULT 'interoperability-hub',
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_event_outbox_status ON event_outbox(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_outbox_type ON event_outbox(event_type, created_at DESC);

-- X12 EDI transaction ledger: every 270/271/834 exchanged with trading partners is retained
-- with its raw segment stream and parsed business content for HIPAA audit and reprocessing.
CREATE TABLE IF NOT EXISTS x12_transactions(
  id BIGSERIAL PRIMARY KEY,
  transaction_set TEXT NOT NULL,
  direction TEXT NOT NULL,
  control_number TEXT NOT NULL,
  trading_partner TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Generated',
  segment_count INTEGER NOT NULL DEFAULT 0,
  raw_content TEXT NOT NULL,
  parsed JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_x12_transactions_created ON x12_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_x12_transactions_set ON x12_transactions(transaction_set, created_at DESC);
