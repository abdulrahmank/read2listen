import crypto from 'crypto';

/**
 * In-memory implementations of the three repo interfaces. Tests exercise the
 * full HTTP + service stack without MongoDB; the Mongo repos are thin enough
 * that interface parity is maintained by inspection.
 */

export class InMemoryTenantRepo {
  constructor() {
    this.tenants = [];
  }

  async count() {
    return this.tenants.length;
  }

  async create({ name, plan = 'free', keys }) {
    const tenant = {
      _id: crypto.randomUUID(),
      name,
      plan,
      keys,
      createdAt: new Date().toISOString()
    };
    this.tenants.push(tenant);
    return tenant;
  }

  async findByKeyHash(hash) {
    for (const doc of this.tenants) {
      const key = doc.keys.find((k) => k.hash === hash);
      if (key) {
        return {
          tenant: { id: doc._id, name: doc.name, plan: doc.plan },
          role: key.role
        };
      }
    }
    return null;
  }
}

export class InMemoryDocumentRepo {
  constructor() {
    this.documents = [];
  }

  async create(tenantId, meta) {
    const doc = {
      _id: crypto.randomUUID(),
      tenantId,
      ...meta,
      uploadedAt: new Date().toISOString()
    };
    this.documents.push(doc);
    return doc;
  }

  async list(tenantId) {
    return this.documents.filter((d) => d.tenantId === tenantId);
  }

  async findById(tenantId, documentId) {
    return this.documents.find((d) => d._id === documentId && d.tenantId === tenantId) || null;
  }

  async findByIds(tenantId, documentIds) {
    return this.documents.filter((d) => d.tenantId === tenantId && documentIds.includes(d._id));
  }

  async existsWithFilename(tenantId, filename) {
    return this.documents.some((d) => d.tenantId === tenantId && d.filename === filename);
  }

  async remove(tenantId, documentId) {
    const before = this.documents.length;
    this.documents = this.documents.filter((d) => !(d._id === documentId && d.tenantId === tenantId));
    return this.documents.length < before;
  }
}

export class InMemoryChatRepo {
  constructor() {
    this.chats = [];
  }

  async create(tenantId, { title, documentIds = [] }) {
    const now = new Date().toISOString();
    const chat = {
      _id: crypto.randomUUID(),
      tenantId,
      title,
      documentIds: [...documentIds],
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    this.chats.push(chat);
    return chat;
  }

  async list(tenantId) {
    return this.chats
      .filter((c) => c.tenantId === tenantId)
      .map(({ messages, ...summary }) => summary);
  }

  async findById(tenantId, chatId) {
    return this.chats.find((c) => c._id === chatId && c.tenantId === tenantId) || null;
  }

  async appendMessages(tenantId, chatId, messages) {
    const chat = await this.findById(tenantId, chatId);
    if (chat) {
      chat.messages.push(...messages);
      chat.updatedAt = new Date().toISOString();
    }
  }

  async addDocuments(tenantId, chatId, documentIds) {
    const chat = await this.findById(tenantId, chatId);
    if (chat) {
      for (const id of documentIds) {
        if (!chat.documentIds.includes(id)) chat.documentIds.push(id);
      }
      chat.updatedAt = new Date().toISOString();
    }
    return chat;
  }

  async remove(tenantId, chatId) {
    const before = this.chats.length;
    this.chats = this.chats.filter((c) => !(c._id === chatId && c.tenantId === tenantId));
    return this.chats.length < before;
  }
}
