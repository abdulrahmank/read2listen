import fs from 'fs/promises';
import path from 'path';
import logger from '../logger.js';
import { HttpError } from '../errorHandler.js';
import { assertWithinQuota } from './quotas.js';
import {
  ensureTenantRoot,
  documentPath,
  sanitizeFilename,
  AGENTS_FILENAME
} from '../tenantDir.js';
import { renderAgentsMd } from '../agentsMd.js';

/**
 * Owns the tenant's document library: file bytes on disk, metadata in the
 * repo, and the AGENTS.md that keeps Codex exec oriented. Every mutation
 * regenerates AGENTS.md so the directory is always self-describing.
 */
export class DocumentService {
  constructor({ documentRepo }) {
    this.documentRepo = documentRepo;
  }

  async create(tenant, { name, version, date, use }, file) {
    if (!file) {
      throw new HttpError(400, 'A document file is required');
    }
    for (const [field, value] of Object.entries({ name, version, date, use })) {
      if (!value || !String(value).trim()) {
        throw new HttpError(400, `Document ${field} is required`);
      }
    }

    assertWithinQuota(tenant, 'document.upload');

    await ensureTenantRoot(tenant.id);
    const filename = await this.uniqueFilename(tenant.id, sanitizeFilename(file.originalname));

    await fs.writeFile(documentPath(tenant.id, filename), file.buffer);

    const document = await this.documentRepo.create(tenant.id, {
      filename,
      name: String(name).trim(),
      version: String(version).trim(),
      date: String(date).trim(),
      use: String(use).trim(),
      size: file.buffer.length
    });

    await this.regenerateAgentsMd(tenant);
    logger.info(`Document uploaded: ${filename}`, { tenantId: tenant.id });
    return document;
  }

  async list(tenantId) {
    return this.documentRepo.list(tenantId);
  }

  async remove(tenant, documentId) {
    const document = await this.documentRepo.findById(tenant.id, documentId);
    if (!document) {
      throw new HttpError(404, `Document ${documentId} not found`);
    }

    await this.documentRepo.remove(tenant.id, documentId);
    await fs.rm(documentPath(tenant.id, document.filename), { force: true });
    await this.regenerateAgentsMd(tenant);

    logger.info(`Document removed: ${document.filename}`, { tenantId: tenant.id });
    return document;
  }

  /**
   * Keep the original filename readable for the agent, but never collide:
   * append -2, -3, … before the extension until the name is free.
   */
  async uniqueFilename(tenantId, filename) {
    const ext = path.extname(filename);
    const stem = filename.slice(0, filename.length - ext.length);

    let candidate = filename;
    for (let n = 2; await this.documentRepo.existsWithFilename(tenantId, candidate); n++) {
      candidate = `${stem}-${n}${ext}`;
    }
    return candidate;
  }

  async regenerateAgentsMd(tenant) {
    const documents = await this.documentRepo.list(tenant.id);
    const root = await ensureTenantRoot(tenant.id);
    await fs.writeFile(path.join(root, AGENTS_FILENAME), renderAgentsMd(tenant.name, documents));
  }
}
