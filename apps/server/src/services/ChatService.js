import logger from '../logger.js';
import { HttpError } from '../errorHandler.js';
import { assertWithinQuota } from './quotas.js';
import { ensureTenantRoot } from '../tenantDir.js';
import { buildChatPrompt } from '../chatPrompt.js';

/**
 * The chat pipeline: load history from the repo (empty for a new chat) →
 * build the prompt → run the executor inside the tenant's directory →
 * persist both turns → return the reply.
 *
 * The executor is injected (any object with execute(prompt, {cwd})) — the
 * reasoning layer is pluggable; Codex exec is just the default.
 */
export class ChatService {
  constructor({ chatRepo, documentRepo, executor }) {
    this.chatRepo = chatRepo;
    this.documentRepo = documentRepo;
    this.executor = executor;
  }

  async create(tenant, { title, documentIds = [] }) {
    const documents = await this.resolveDocuments(tenant.id, documentIds);
    return this.chatRepo.create(tenant.id, {
      title: title?.trim() || this.defaultTitle(documents),
      documentIds
    });
  }

  async list(tenantId) {
    return this.chatRepo.list(tenantId);
  }

  async get(tenantId, chatId) {
    const chat = await this.chatRepo.findById(tenantId, chatId);
    if (!chat) {
      throw new HttpError(404, `Chat ${chatId} not found`);
    }
    return chat;
  }

  async remove(tenantId, chatId) {
    const removed = await this.chatRepo.remove(tenantId, chatId);
    if (!removed) {
      throw new HttpError(404, `Chat ${chatId} not found`);
    }
  }

  /**
   * Provision for growing conversations: attach more of the tenant's
   * documents to an existing chat at any point.
   */
  async addDocuments(tenantId, chatId, documentIds) {
    await this.get(tenantId, chatId);
    await this.resolveDocuments(tenantId, documentIds);
    return this.chatRepo.addDocuments(tenantId, chatId, documentIds);
  }

  async sendMessage(tenant, chatId, content, { onProgress } = {}) {
    const text = String(content ?? '').trim();
    if (!text) {
      throw new HttpError(400, 'Message content is required');
    }

    assertWithinQuota(tenant, 'chat.message');

    const chat = await this.get(tenant.id, chatId);
    // Attached documents narrow the conversation's scope; a chat with none
    // attached grounds on the tenant's whole uploaded library.
    const attached = await this.documentRepo.findByIds(tenant.id, chat.documentIds);
    const documents = attached.length > 0 ? attached : await this.documentRepo.list(tenant.id);

    const prompt = buildChatPrompt({
      tenantName: tenant.name,
      documents,
      history: chat.messages,
      userMessage: text
    });

    // cwd is the tenancy boundary: the agent sees this tenant's files only.
    const cwd = await ensureTenantRoot(tenant.id);
    const result = await this.executor.execute(prompt, { cwd, onProgress });
    const reply = result.output.trim();

    const now = new Date().toISOString();
    const turns = [
      { role: 'user', content: text, timestamp: now },
      { role: 'assistant', content: reply, timestamp: new Date().toISOString() }
    ];
    await this.chatRepo.appendMessages(tenant.id, chatId, turns);

    logger.info(`Chat turn completed`, { tenantId: tenant.id, chatId });
    return { reply, messages: [...chat.messages, ...turns] };
  }

  async resolveDocuments(tenantId, documentIds) {
    if (documentIds.length === 0) return [];
    const documents = await this.documentRepo.findByIds(tenantId, documentIds);
    if (documents.length !== documentIds.length) {
      throw new HttpError(400, 'One or more documents were not found in this tenant');
    }
    return documents;
  }

  defaultTitle(documents) {
    if (documents.length === 0) return 'New chat';
    const first = documents[0].name;
    return documents.length === 1 ? first : `${first} +${documents.length - 1}`;
  }
}
