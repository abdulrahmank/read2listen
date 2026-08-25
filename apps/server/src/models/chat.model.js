/**
 * Chat model: the stored entity shape and its wire DTO. Repos return stored
 * docs (Mongo `_id`); services serialize them through toChatDto so routes and
 * the SPA only ever see whitelisted fields keyed by `id`.
 */

/**
 * @typedef {Object} ChatMessage
 * @property {'user'|'assistant'} role
 * @property {string} content
 * @property {string} timestamp ISO-8601
 */

/**
 * Chat session as stored by ChatRepo. The messages array IS the conversation
 * history handed to the agent as JSON on every turn.
 * @typedef {Object} ChatDoc
 * @property {string} _id
 * @property {string} tenantId
 * @property {string} title
 * @property {string[]} documentIds
 * @property {ChatMessage[]} messages
 * @property {string} createdAt ISO-8601
 * @property {string} updatedAt ISO-8601
 */

/**
 * Chat as seen on the wire. `tenantId` never leaves the server; list
 * summaries omit `messages` entirely (the repo projects them away).
 * @typedef {Object} ChatDto
 * @property {string} id
 * @property {string} title
 * @property {string[]} documentIds
 * @property {ChatMessage[]} [messages]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/** @param {ChatMessage} message @returns {ChatMessage} */
export function toChatMessageDto({ role, content, timestamp }) {
  return { role, content, timestamp };
}

/**
 * @param {ChatDoc | null} doc
 * @returns {ChatDto | null}
 */
export function toChatDto(doc) {
  if (!doc) return null;
  const dto = {
    id: doc._id,
    title: doc.title,
    documentIds: doc.documentIds,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
  // List summaries have no messages field — keep it absent, not empty.
  if (doc.messages !== undefined) {
    dto.messages = doc.messages.map(toChatMessageDto);
  }
  return dto;
}
