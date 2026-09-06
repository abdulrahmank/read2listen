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
import { toDocumentDto } from '../models/document.model.js';

/**
 * Owns the tenant's document library: file bytes in the injected FileStore,
 * metadata in the repo, and the AGENTS.md that keeps Codex exec oriented.
 * Every mutation regenerates AGENTS.md so the directory is always
 * self-describing.
 *
 * Repos hand back stored docs; everything leaving this service is a wire DTO
 * (models/document.model.js) — routes never see `_id` or `tenantId`.
 */
export class DocumentService {
  constructor({ documentRepo, fileStore, readerService }) {
    this.documentRepo = documentRepo;
    this.fileStore = fileStore;
    this.readerService = readerService;
  }

  async create(tenant, meta = {}, file) {
    if (!file) {
      throw new HttpError(400, 'A document file is required');
    }

    // Drag-and-drop uploads arrive with no metadata: default everything so
    // the file lands immediately, and let the admin refine details afterwards
    // (PATCH /documents/:id) from the document sidebar.
    const stem = path.basename(file.originalname, path.extname(file.originalname));
    const defaults = {
      name: stem || file.originalname,
      version: '1',
      date: new Date().toISOString().slice(0, 10),
      use: 'General reference'
    };
    const fields = {};
    for (const key of ['name', 'version', 'date', 'use']) {
      const given = meta[key] !== undefined ? String(meta[key]).trim() : '';
      fields[key] = given || defaults[key];
    }

    assertWithinQuota(tenant, 'document.upload');

    await ensureTenantRoot(tenant.id);
    const filename = await this.uniqueFilename(tenant.id, sanitizeFilename(file.originalname));

    await this.fileStore.write(documentPath(tenant.id, filename), file.buffer);

    const document = await this.documentRepo.create(tenant.id, {
      filename,
      ...fields,
      size: file.buffer.length
    });

    await this.regenerateAgentsMd(tenant);
    logger.info(`Document uploaded: ${filename}`, { tenantId: tenant.id });
    this.readerService?.prepare(tenant.id, document._id).catch(error => logger.warn('Reader preparation could not start', { error: error.message }));
    return toDocumentDto(document);
  }

  /**
   * Metadata-only edit (name/version/date/use) — the file itself is
   * immutable; re-upload to change content. AGENTS.md is regenerated so the
   * agent always sees current descriptions.
   */
  async update(tenant, documentId, patch = {}) {
    const existing = await this.documentRepo.findById(tenant.id, documentId);
    if (!existing) {
      throw new HttpError(404, `Document ${documentId} not found`);
    }

    const fields = {};
    for (const key of ['name', 'version', 'date', 'use']) {
      if (patch[key] === undefined) continue;
      const value = String(patch[key]).trim();
      if (!value) {
        throw new HttpError(400, `Document ${key} cannot be empty`);
      }
      fields[key] = value;
    }
    if (Object.keys(fields).length === 0) {
      throw new HttpError(400, 'Nothing to update — provide name, version, date, or use');
    }

    const document = await this.documentRepo.update(tenant.id, documentId, fields);
    await this.regenerateAgentsMd(tenant);

    logger.info(`Document updated: ${existing.filename}`, { tenantId: tenant.id });
    return toDocumentDto(document);
  }

  async list(tenantId) {
    const documents = await this.documentRepo.list(tenantId);
    return documents.map(toDocumentDto);
  }

  async content(tenantId, documentId) {
    const document = await this.documentRepo.findById(tenantId, documentId);
    if (!document) throw new HttpError(404, 'Document not found');
    try {
      return await this.fileStore.read(documentPath(tenantId, document.filename));
    } catch (error) {
      if (error.code === 'ENOENT') throw new HttpError(404, 'Document file not found');
      throw error;
    }
  }

  async remove(tenant, documentId) {
    const document = await this.documentRepo.findById(tenant.id, documentId);
    if (!document) {
      throw new HttpError(404, `Document ${documentId} not found`);
    }

    await this.documentRepo.remove(tenant.id, documentId);
    await this.fileStore.remove(documentPath(tenant.id, document.filename));
    await this.regenerateAgentsMd(tenant);

    logger.info(`Document removed: ${document.filename}`, { tenantId: tenant.id });
    return toDocumentDto(document);
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
    await this.fileStore.write(path.join(root, AGENTS_FILENAME), renderAgentsMd(tenant.name, documents));
  }
}
