/**
 * Tenant model: the stored entity shape and the request-scoped DTO. Keys are
 * stored hashed only and must never be serialized outward.
 */

/**
 * @typedef {Object} TenantKey
 * @property {string} hash sha256 of the API key
 * @property {'admin'|'member'} role
 */

/**
 * Tenant as stored by TenantRepo. `plan` is the cloud-tier seam (unused in
 * OSS).
 * @typedef {Object} TenantDoc
 * @property {string} _id
 * @property {string} name
 * @property {string} plan
 * @property {TenantKey[]} keys
 * @property {string} createdAt ISO-8601
 */

/**
 * Tenant as carried on requests (`req.tenant`) and handed to services. Never
 * includes keys.
 * @typedef {Object} TenantDto
 * @property {string} id
 * @property {string} name
 * @property {string} plan
 */

/**
 * @param {TenantDoc | null} doc
 * @returns {TenantDto | null}
 */
export function toTenantDto(doc) {
  if (!doc) return null;
  return { id: doc._id, name: doc.name, plan: doc.plan };
}
