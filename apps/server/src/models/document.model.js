/**
 * Document model: the stored entity shape and its wire DTO. Repos return
 * stored docs (Mongo `_id`); services serialize them through toDocumentDto so
 * routes and the SPA only ever see whitelisted fields keyed by `id`.
 */

/**
 * Document metadata as stored by DocumentRepo. The file bytes live on disk in
 * the tenant's directory; this is the catalog AGENTS.md is rendered from.
 * @typedef {Object} DocumentDoc
 * @property {string} _id
 * @property {string} tenantId
 * @property {string} filename sanitized, unique within the tenant dir
 * @property {string} name
 * @property {string} version
 * @property {string} date
 * @property {string} use what the document is good for (drives the agent)
 * @property {number} size bytes
 * @property {string} uploadedAt ISO-8601
 */

/**
 * Document as seen on the wire. `tenantId` never leaves the server.
 * @typedef {Object} DocumentDto
 * @property {string} id
 * @property {string} filename
 * @property {string} name
 * @property {string} version
 * @property {string} date
 * @property {string} use
 * @property {number} size
 * @property {string} uploadedAt
 */

/**
 * @param {DocumentDoc | null} doc
 * @returns {DocumentDto | null}
 */
export function toDocumentDto(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    filename: doc.filename,
    name: doc.name,
    version: doc.version,
    date: doc.date,
    use: doc.use,
    size: doc.size,
    uploadedAt: doc.uploadedAt
  };
}
