// security.mjs — Security & Compliance controls (HIPAA Security Rule technical safeguards,
// NIST Cybersecurity Framework functions). Zero-dependency: node:crypto only.
import crypto from 'node:crypto';

// ---- Startup guard: refuse a production run on a known-default or weak session secret ----
export function assertSessionSecret(env = process.env) {
  const secret = env.SESSION_SECRET || '';
  const production = env.NODE_ENV === 'production';
  if (production && (!secret || secret.length < 32 || secret.includes('change-before-production'))) {
    throw new Error('SESSION_SECRET must be at least 32 random characters outside local development.');
  }
  return { configured: secret.length >= 32, production };
}

// ---- Rate limiting: fixed-window counters keyed by ip + bucket (AC-4 / AU-2) ----
const rateBuckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 300, bucket = 'api' } = {}) {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    const now = Date.now();
    const key = `${bucket}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const entry = rateBuckets.get(key);
    if (!entry || entry.reset <= now) rateBuckets.set(key, { count: 1, reset: now + windowMs });
    else if (entry.count >= max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: 'Request rate exceeded. Throttled by the API abuse-control policy.' });
    } else entry.count += 1;
    if (rateBuckets.size > 10_000) for (const [key, value] of rateBuckets) if (value.reset <= now) rateBuckets.delete(key);
    return next();
  };
}

// ---- Login throttle / lockout: five failures locks the credential pair for 15 minutes ----
const loginFailures = new Map();
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60_000;

export function loginLocked(key, now = Date.now()) {
  const entry = loginFailures.get(key);
  return Boolean(entry && entry.count >= LOGIN_MAX_FAILURES && entry.lockedUntil > now);
}

export function recordLoginFailure(key, now = Date.now()) {
  const entry = loginFailures.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  entry.lockedUntil = entry.count >= LOGIN_MAX_FAILURES ? now + LOGIN_LOCK_MS : 0;
  loginFailures.set(key, entry);
  return entry.count;
}

export function clearLoginFailures(key) {
  loginFailures.delete(key);
}

// ---- PHI field-level protection: AES-256-GCM with an scrypt-derived key (§164.312(a)(2)(iv)) ----
function phiKey() {
  const secret = process.env.PHI_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'local-demo-phi-key';
  return crypto.scryptSync(secret, 'renewalcare-phi-salt-v1', 32);
}

export function encryptPhi(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', phiKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

export function decryptPhi(token) {
  const [version, iv, payload, tag] = String(token || '').split('.');
  if (version !== 'v1') throw new Error('Unrecognized PHI token format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', phiKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64url')), decipher.final()]).toString('utf8');
}

export function maskName(name) {
  const parts = String(name || '').split(/\s+/).filter(Boolean);
  return parts.map(part => `${part[0]}\u2022`.toUpperCase()).join(' ');
}

// ---- Security event monitoring (SI-4 / AU-6): SIEM-style feed of authentication and access events ----
export async function recordSecurityEvent(pool, type, actor, ip, detail) {
  try {
    await pool.query('INSERT INTO security_events(event_type,actor,ip_address,detail) VALUES($1,$2,$3,$4)', [type, actor || null, ip || null, detail]);
  } catch (error) {
    console.error(`security event write failed: ${error.message}`);
  }
}

export async function securityEventStream(pool, { limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  return (await pool.query('SELECT * FROM security_events ORDER BY event_time DESC,id DESC LIMIT $1', [safeLimit])).rows;
}

export async function accessReview(pool) {
  const users = (await pool.query('SELECT id, email, name, role, mfa_enabled, last_login, created_at FROM app_users ORDER BY id')).rows;
  return {
    reviewedAt: new Date().toISOString(),
    users: users.map(user => ({ ...user, mfa: user.mfa_enabled ? 'TOTP enrolled' : 'not enrolled' })),
    permissionMatrixCount: undefined,
    note: 'Automated access review (AC-2): accounts, roles, MFA enrollment, and last login.',
  };
}

// ---- Compliance posture: implemented controls with the endpoint/artifact that evidences them ----
export function compliancePosture() {
  const implemented = (
    id, name, framework, safeguard, status = 'Implemented', evidence = '',
  ) => ({ id, name, framework, safeguard, status, evidence });
  return {
    frameworks: [
      { id: 'HIPAA', name: 'HIPAA Security Rule', scope: 'ePHI confidentiality, integrity, availability', note: 'Demo uses synthetic beneficiary data; controls are production-shaped.' },
      { id: 'NIST', name: 'NIST Cybersecurity Framework', scope: 'Identify, Protect, Detect, Respond, Recover', note: 'Control families mapped below with live evidence.' },
    ],
    controls: [
      implemented('164.312(a)(1)', 'Access control — minimum necessary', 'HIPAA', 'Access Control', 'Implemented', 'RBAC permission matrix enforced per endpoint (backend/src/rbac.mjs); roles embedded in signed JWT'),
      implemented('164.312(a)(2)(i)', 'Unique user identification', 'HIPAA', 'Access Control', 'Implemented', 'app_users unique email identity; actor attribution on every audit row'),
      implemented('164.312(a)(2)(iv)', 'Encryption at rest (ePHI fields)', 'HIPAA', 'Protect', 'Implemented', 'AES-256-GCM field encryption via encryptPhi() (backend/src/security.mjs)'),
      implemented('164.312(b)', 'Audit controls', 'HIPAA', 'Detect', 'Implemented', 'audit_events written transactionally with every state change; /api/audit-events'),
      implemented('164.312(c)(1)', 'Integrity', 'HIPAA', 'Protect', 'Implemented', 'Transactional SQL (BEGIN/COMMIT) around decisions; integrity via PK/UNIQUE constraints'),
      implemented('164.312(d)', 'Person or entity authentication', 'HIPAA', 'Access Control', 'Implemented', 'bcrypt password hashing (cost 12), JWT (8h) bearer auth, login lockout after 5 failures, RFC 6238 TOTP MFA (backend/src/mfa.mjs)'),
      implemented('164.312(e)(1)', 'Transmission security', 'HIPAA', 'Protect', 'Implemented', 'Node TLS option (TLS_CERT/TLS_KEY); TLS terminated at the ingress (ALB/App Gateway) in the cloud reference (docs/architecture.md)'),
      implemented('IA-2(1)', 'Multi-factor authentication (TOTP)', 'NIST/FedRAMP', 'Access Control', 'Implemented', 'RFC 6238 TOTP enrollment + verification at /api/security/mfa (backend/src/mfa.mjs)'),
      implemented('SI-4', 'System monitoring', 'NIST/FedRAMP', 'Detect', 'Implemented', 'security_events stream (auth failures, lockouts, MFA faults) at /api/security/events'),
      implemented('AC-2', 'Account management', 'NIST/FedRAMP', 'Identify', 'Implemented', 'Automated access review (accounts, roles, MFA, last login) at /api/security/access-review'),
      implemented('PR.AC', 'Identity, credential and access management', 'NIST', 'Protect', 'Implemented', 'JWT + bcrypt + RBAC minimum-necessary matrix'),
      implemented('PR.DS', 'Data security — encryption', 'NIST', 'Protect', 'Implemented', 'Field-level AES-256-GCM for ePHI tokens; helmet response headers'),
      implemented('DE.CM', 'Continuous monitoring', 'NIST', 'Detect', 'Implemented', 'Rate limiting, login lockout counters, event_outbox stream + audit trail'),
      implemented('RS.MI', 'Mitigation', 'NIST', 'Respond', 'Implemented', '429 throttling with Retry-After; locked credentials auto-expire after 15 minutes'),
      implemented('RC.RP', 'Recovery planning', 'NIST', 'Recover', 'Planned', 'Managed PostgreSQL automated backups in the cloud reference architecture'),
    ],
    apiAbuse: { loginWindow: '15 min lock after 5 failures', apiBucket: '300 requests/minute per IP', bypassedInTest: true },
    dataClassification: [
      { label: 'Beneficiary identifiers', classification: 'PII', handling: 'Field-level encryption available; synthetic in demo' },
      { label: 'Eligibility determinations', classification: 'Program data', handling: 'Audit-attributed transitions' },
      { label: 'X12 270/271/834 payloads', classification: 'ePHI', handling: 'Full ledger retained in x12_transactions' },
      { label: 'FHIR resources', classification: 'ePHI', handling: 'Authenticated read via /api/fhir; synthetic in demo' },
    ],
  };
}
