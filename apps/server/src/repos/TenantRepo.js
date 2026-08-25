import crypto from 'crypto';
import { toTenantDto } from '../models/tenant.model.js';

/**
 * Tenants: { _id, name, plan, keys: [{ hash, role }], createdAt }.
 * Keys are stored hashed only; `plan` is the cloud-tier seam (unused in OSS).
 */
export class TenantRepo {
  constructor(db) {
    this.collection = db.collection('tenants');
  }

  async count() {
    return this.collection.countDocuments();
  }

  async create({ name, plan = 'free', keys }) {
    const tenant = {
      _id: crypto.randomUUID(),
      name,
      plan,
      keys,
      createdAt: new Date().toISOString()
    };
    await this.collection.insertOne(tenant);
    return tenant;
  }

  /**
   * Resolve an API-key hash to its tenant and the role that key carries.
   * Returns { tenant: { id, name, plan }, role } or null.
   */
  async findByKeyHash(hash) {
    const doc = await this.collection.findOne({ 'keys.hash': hash });
    if (!doc) return null;
    const key = doc.keys.find((k) => k.hash === hash);
    return { tenant: toTenantDto(doc), role: key.role };
  }
}
