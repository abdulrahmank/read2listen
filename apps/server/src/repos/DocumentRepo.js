import crypto from 'crypto';

/**
 * Document metadata: { _id, tenantId, filename, name, version, date, use,
 * size, uploadedAt }. The file bytes live on disk in the tenant's directory;
 * this collection is the catalog AGENTS.md is rendered from.
 * Every method takes tenantId first — no cross-tenant reads.
 */
export class DocumentRepo {
  constructor(db) {
    this.collection = db.collection('documents');
  }

  async create(tenantId, meta) {
    const doc = {
      _id: crypto.randomUUID(),
      tenantId,
      ...meta,
      uploadedAt: new Date().toISOString()
    };
    await this.collection.insertOne(doc);
    return doc;
  }

  async list(tenantId) {
    return this.collection.find({ tenantId }).sort({ uploadedAt: 1 }).toArray();
  }

  async findById(tenantId, documentId) {
    return this.collection.findOne({ _id: documentId, tenantId });
  }

  async findByIds(tenantId, documentIds) {
    return this.collection.find({ tenantId, _id: { $in: documentIds } }).toArray();
  }

  async existsWithFilename(tenantId, filename) {
    const found = await this.collection.findOne({ tenantId, filename });
    return Boolean(found);
  }

  async update(tenantId, documentId, fields) {
    return this.collection.findOneAndUpdate(
      { _id: documentId, tenantId },
      { $set: fields },
      { returnDocument: 'after' }
    );
  }

  async remove(tenantId, documentId) {
    const { deletedCount } = await this.collection.deleteOne({ _id: documentId, tenantId });
    return deletedCount > 0;
  }
}
