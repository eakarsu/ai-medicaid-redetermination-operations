-- 004_security.sql
-- Technical control families (SOC 2 / FedRAMP-aligned, implemented in code):
-- IA-2(1) MFA: TOTP factors on app_users; SI-4 monitoring: security event stream.

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS security_events(
  id BIGSERIAL PRIMARY KEY,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  actor TEXT,
  ip_address TEXT,
  detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_events_time ON security_events(event_time DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, event_time DESC);
