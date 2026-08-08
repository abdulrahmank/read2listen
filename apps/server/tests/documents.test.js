import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import request from 'supertest';
import { createTestContext, cleanupTestContext, uploadDocument, KEYS } from './helpers.js';

describe('Document library', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  const tenantDirOf = (tenant) => path.join(ctx.dataDir, 'tenants', tenant._id);

  test('admin can upload a document; file lands in the tenant dir and AGENTS.md is generated', async () => {
    const res = await uploadDocument(request, ctx.app, KEYS.acmeAdmin);

    expect(res.status).toBe(201);
    const doc = res.body.document;
    expect(doc.filename).toBe('handbook.md');
    expect(doc.name).toBe('Employee Handbook');
    expect(doc.version).toBe('1.0');
    expect(doc.use).toBe('Answers HR policy questions');

    const dir = tenantDirOf(ctx.tenants.acme);
    const fileContent = await fs.readFile(path.join(dir, 'handbook.md'), 'utf-8');
    expect(fileContent).toContain('Be kind.');

    const agents = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('# Documents for acme');
    expect(agents).toContain('| handbook.md | Employee Handbook | 1.0 | 2026-01-15 | Answers HR policy questions |');
  });

  test('upload requires all metadata fields', async () => {
    const res = await request(ctx.app)
      .post('/api/documents')
      .set('X-API-Key', KEYS.acmeAdmin)
      .field('name', 'No use given')
      .field('version', '1')
      .field('date', '2026-01-01')
      .attach('file', Buffer.from('x'), 'x.txt');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('use is required');
  });

  test('upload requires a file', async () => {
    const res = await request(ctx.app)
      .post('/api/documents')
      .set('X-API-Key', KEYS.acmeAdmin)
      .field('name', 'n').field('version', 'v').field('date', 'd').field('use', 'u');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('file is required');
  });

  test('colliding filenames get a numeric suffix instead of overwriting', async () => {
    const first = await uploadDocument(request, ctx.app, KEYS.acmeAdmin, { content: 'v1' });
    const second = await uploadDocument(request, ctx.app, KEYS.acmeAdmin, { content: 'v2' });

    expect(first.body.document.filename).toBe('handbook.md');
    expect(second.body.document.filename).toBe('handbook-2.md');

    const dir = tenantDirOf(ctx.tenants.acme);
    expect(await fs.readFile(path.join(dir, 'handbook.md'), 'utf-8')).toBe('v1');
    expect(await fs.readFile(path.join(dir, 'handbook-2.md'), 'utf-8')).toBe('v2');
  });

  test('a file named AGENTS.md is renamed on upload, never clobbering the generated one', async () => {
    const res = await uploadDocument(request, ctx.app, KEYS.acmeAdmin, {
      filename: 'AGENTS.md',
      content: 'malicious agents file'
    });

    expect(res.status).toBe(201);
    expect(res.body.document.filename).toBe('document.md');

    const agents = await fs.readFile(path.join(tenantDirOf(ctx.tenants.acme), 'AGENTS.md'), 'utf-8');
    expect(agents).not.toContain('malicious');
    expect(agents).toContain('# Documents for acme');
  });

  test('deleting a document removes the file and updates AGENTS.md', async () => {
    const uploaded = await uploadDocument(request, ctx.app, KEYS.acmeAdmin);
    const docId = uploaded.body.document._id;

    const res = await request(ctx.app)
      .delete(`/api/documents/${docId}`)
      .set('X-API-Key', KEYS.acmeAdmin);
    expect(res.status).toBe(200);

    const dir = tenantDirOf(ctx.tenants.acme);
    await expect(fs.access(path.join(dir, 'handbook.md'))).rejects.toThrow();

    const agents = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('No documents have been uploaded yet');
  });

  test('tenants cannot see or delete each other\'s documents', async () => {
    const uploaded = await uploadDocument(request, ctx.app, KEYS.acmeAdmin);
    const docId = uploaded.body.document._id;

    const list = await request(ctx.app).get('/api/documents').set('X-API-Key', KEYS.globexAdmin);
    expect(list.body.documents).toHaveLength(0);

    const del = await request(ctx.app)
      .delete(`/api/documents/${docId}`)
      .set('X-API-Key', KEYS.globexAdmin);
    expect(del.status).toBe(404);

    // Files live in per-tenant directories.
    const acmeFiles = await fs.readdir(tenantDirOf(ctx.tenants.acme));
    expect(acmeFiles).toContain('handbook.md');
    await expect(fs.readdir(tenantDirOf(ctx.tenants.globex))).rejects.toThrow();
  });
});
