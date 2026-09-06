/** Opaque session/state tokens are hashed before reaching this repository. */
export class SessionRepo {
  constructor(db) { this.collection = db.collection('authSessions'); }
  async create(record) { await this.collection.insertOne(record); }
  async find(id, kind) {
    return this.collection.findOne({ _id: id, kind, expiresAt: { $gt: new Date() } });
  }
  async consume(id, kind) {
    return this.collection.findOneAndDelete({ _id: id, kind, expiresAt: { $gt: new Date() } });
  }
  async remove(id) { await this.collection.deleteOne({ _id: id }); }
}
