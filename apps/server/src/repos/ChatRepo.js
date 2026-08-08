import crypto from 'crypto';

/**
 * Chat sessions: { _id, tenantId, title, documentIds, messages: [{ role,
 * content, timestamp }], createdAt, updatedAt }. The messages array IS the
 * conversation history handed to the agent as JSON on every turn.
 * Every method takes tenantId first — no cross-tenant reads.
 */
export class ChatRepo {
  constructor(db) {
    this.collection = db.collection('chats');
  }

  async create(tenantId, { title, documentIds = [] }) {
    const now = new Date().toISOString();
    const chat = {
      _id: crypto.randomUUID(),
      tenantId,
      title,
      documentIds,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    await this.collection.insertOne(chat);
    return chat;
  }

  async list(tenantId) {
    // Chat list view: summaries only, not full message histories.
    return this.collection
      .find({ tenantId }, { projection: { messages: 0 } })
      .sort({ updatedAt: -1 })
      .toArray();
  }

  async findById(tenantId, chatId) {
    return this.collection.findOne({ _id: chatId, tenantId });
  }

  async appendMessages(tenantId, chatId, messages) {
    await this.collection.updateOne(
      { _id: chatId, tenantId },
      {
        $push: { messages: { $each: messages } },
        $set: { updatedAt: new Date().toISOString() }
      }
    );
  }

  async addDocuments(tenantId, chatId, documentIds) {
    await this.collection.updateOne(
      { _id: chatId, tenantId },
      {
        $addToSet: { documentIds: { $each: documentIds } },
        $set: { updatedAt: new Date().toISOString() }
      }
    );
    return this.findById(tenantId, chatId);
  }

  async remove(tenantId, chatId) {
    const { deletedCount } = await this.collection.deleteOne({ _id: chatId, tenantId });
    return deletedCount > 0;
  }
}
