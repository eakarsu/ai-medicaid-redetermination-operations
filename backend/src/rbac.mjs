// rbac.mjs — Role-Based Access Control (HIPAA §164.312(a)(1) access control, minimum necessary).
// Roles are seeded in app_users and embedded in the JWT at login; every mutating endpoint
// declares the permissions that may execute it. Reviewers are read/assess; operators run the
// operational register; admins hold integration, attestation, and configuration rights.

export const ROLES = ['admin', 'operator', 'reviewer'];

export const PERMISSIONS = {
  'domain:action': ['admin', 'operator'],
  'records:create': ['admin', 'operator'],
  'records:transition': ['admin', 'operator'],
  'operations:transition': ['admin', 'operator'],
  'integrations:test': ['admin'],
  'ai:analyze': ['admin', 'operator', 'reviewer'],
  'ai:save': ['admin', 'operator'],
  'x12:read': ['admin', 'operator', 'reviewer'],
  'x12:generate': ['admin', 'operator'],
  'fhir:read': ['admin', 'operator', 'reviewer'],
  'events:read': ['admin', 'operator', 'reviewer'],
  'mita:read': ['admin', 'operator', 'reviewer'],
  'compliance:read': ['admin', 'operator', 'reviewer'],
  'compliance:attest': ['admin'],
  'claims:read': ['admin', 'operator', 'reviewer'],
  'claims:adjudicate': ['admin', 'operator'],
  'fwa:read': ['admin', 'operator', 'reviewer'],
  'fwa:scan': ['admin', 'operator'],
  'batch:manage': ['admin', 'operator'],
  'reporting:read': ['admin', 'operator', 'reviewer'],
  'portal:read': ['admin', 'operator', 'reviewer'],
  'security:read': ['admin', 'reviewer'],
  'security:mfa': ['admin', 'operator', 'reviewer'],
  'notices:send': ['admin', 'operator'],
};

export function can(role, permission) {
  return (PERMISSIONS[permission] || []).includes(role);
}

export function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !can(role, permission)) {
      return res.status(403).json({ error: `Role '${role || 'unknown'}' is not permitted to ${permission}. Minimum-necessary access is enforced.`, permission });
    }
    return next();
  };
}

export function permissionMatrix() {
  return Object.entries(PERMISSIONS).map(([permission, roles]) => ({ permission, roles }));
}
