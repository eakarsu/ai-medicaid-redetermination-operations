// mfa.mjs — RFC 6238 TOTP multi-factor authentication, implemented on node:crypto.
// Satisfies the IA-2(1) technical control family (NIST SP 800-53 / FedRAMP) and
// strengthens HIPAA §164.312(d) person/entity authentication. Compatible with any
// authenticator app (Google Authenticator, Authy, 1Password) via the otpauth:// URI.

import crypto from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(length = 20) {
  const bits = [...crypto.randomBytes(length)].map(byte => byte.toString(2).padStart(8, '0')).join('');
  let secret = '';
  for (let index = 0; index + 5 <= bits.length; index += 5) secret += BASE32[parseInt(bits.slice(index, index + 5), 2)];
  return secret;
}

function base32Decode(secret) {
  const clean = String(secret).toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const character of clean) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret, timeOffsetSeconds = 0) {
  const counter = Math.floor((Date.now() / 1000 + timeOffsetSeconds) / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]) % 1_000_000;
  return String(code).padStart(6, '0');
}

export function verifyTotp(secret, token, windowSteps = 1) {
  const candidate = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(candidate)) return false;
  for (let step = -windowSteps; step <= windowSteps; step += 1) {
    if (totpCode(secret, step * 30) === candidate) return true;
  }
  return false;
}

export function otpauthUri(secret, account, issuer = 'RenewalCare Medicaid') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
