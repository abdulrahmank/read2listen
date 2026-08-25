import logger from '../logger.js';
import { HttpError } from '../errorHandler.js';
import { assertWithinQuota } from './quotas.js';
import {
  ensureTenantRoot,
  writeChatHistory,
  removeChatHistory
} from '../tenantDir.js';
import { buildChatPrompt } from '../chatPrompt.js';
import { toChatDto } from '../models/chat.model.js';

/**
 * The chat pipeline: load history from the repo (empty for a new chat) →
 * build the prompt → run the executor inside the tenant's directory →
 * persist both turns → return the reply.
 *
 * Repos hand back stored docs; everything leaving this service is a wire DTO
 * (models/chat.model.js) — routes never see `_id` or `tenantId`.
 *
 * The executor is injected (any object with execute(prompt, {cwd})) — the
 * reasoning layer is pluggable; Codex exec is just the default.
 */
export class ChatService {
  constructor({ chatRepo, documentRepo, executor, intentGuard }) {
    this.chatRepo = chatRepo;
    this.documentRepo = documentRepo;
    this.executor = executor;
    // Optional: screens messages before the agent runs. Absent = allow all.
    this.intentGuard = intentGuard;
  }

  async create(tenant, { title, documentIds = [] }) {
    const documents = await this.resolveDocuments(tenant.id, documentIds);
    const chat = await this.chatRepo.create(tenant.id, {
      title: title?.trim() || this.defaultTitle(documents),
      documentIds
    });
    return toChatDto(chat);
  }

  async list(tenantId) {
    const chats = await this.chatRepo.list(tenantId);
    return chats.map(toChatDto);
  }

  async get(tenantId, chatId) {
    const chat = await this.chatRepo.findById(tenantId, chatId);
    if (!chat) {
      throw new HttpError(404, `Chat ${chatId} not found`);
    }
    return toChatDto(chat);
  }

  async remove(tenantId, chatId) {
    const removed = await this.chatRepo.remove(tenantId, chatId);
    if (!removed) {
      throw new HttpError(404, `Chat ${chatId} not found`);
    }
    await removeChatHistory(tenantId, chatId);
  }

  /**
   * Provision for growing conversations: attach more of the tenant's
   * documents to an existing chat at any point.
   */
  async addDocuments(tenantId, chatId, documentIds) {
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      throw new HttpError(400, 'documentIds must be a non-empty array');
    }
    await this.get(tenantId, chatId);
    await this.resolveDocuments(tenantId, documentIds);
    const chat = await this.chatRepo.addDocuments(tenantId, chatId, documentIds);
    return toChatDto(chat);
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

    // cwd is the tenancy boundary: the agent sees this tenant's files only.
    const cwd = await ensureTenantRoot(tenant.id);

    // Screen intent before the agent runs. Blocked messages never reach the
    // executor and are not persisted to history.
    if (this.intentGuard) {
      const verdict = await this.intentGuard.assess(text, { cwd });
      if (!verdict.allow) {
        logger.warn('Chat message blocked by intent guard', {
          tenantId: tenant.id, chatId, stage: verdict.stage, reason: verdict.reason
        });
        throw new HttpError(422, `Message blocked: ${verdict.reason}`);
      }
    }

    // Full history lives in a file the agent can read on demand; the prompt
    // carries only the path and the last few turns, so it stays small no
    // matter how long the conversation gets.
    const historyPath = await writeChatHistory(
      tenant.id,
      chatId,
      chat.messages.map(({ role, content, timestamp }) => ({ role, content, timestamp }))
    );

    const prompt = buildChatPrompt({
      tenantName: tenant.name,
      documents,
      history: chat.messages,
      historyPath,
      userMessage: text
    });
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
