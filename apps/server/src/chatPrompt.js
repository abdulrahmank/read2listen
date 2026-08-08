/**
 * Builds the prompt for one chat turn. The agent runs inside the tenant's
 * document directory; continuity comes from the chat's stored history,
 * passed verbatim as JSON (an empty array for a new chat).
 * Pure function: ChatService owns loading/persisting the history.
 */
export function buildChatPrompt({ tenantName, documents, history, userMessage }) {
  const docList = documents.length === 0
    ? '(the library is empty — answer from general knowledge and say no documents have been uploaded yet)'
    : documents
        .map((d) => `- ${d.filename} — ${d.name} (version ${d.version}, ${d.date}): ${d.use}`)
        .join('\n');

  const historyJson = JSON.stringify(
    history.map(({ role, content }) => ({ role, content }))
  );

  return `You are a chat assistant for "${tenantName}".

Answer the user's message using the documents in the current working directory.
AGENTS.md describes what every file in this directory is for. This conversation
concerns the following documents:
${docList}

Conversation so far, as JSON (empty array means this is a new chat):
${historyJson}

User message:
"""
${userMessage}
"""

Reply with the assistant's response text only — no JSON wrapper, no preamble.`;
}
