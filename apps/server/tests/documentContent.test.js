import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import request from 'supertest';
import { createTestContext, cleanupTestContext, uploadDocument, KEYS } from './helpers.js';

describe('Document content for listening', () => {
  let ctx;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await cleanupTestContext(ctx); });

  test('admin and member can read exact document bytes without caching', async () => {
    const upload = await uploadDocument(request, ctx.app, KEYS.acmeAdmin);
    for (const key of [KEYS.acmeAdmin, KEYS.acmeMember]) {
      const response = await request(ctx.app).get(`/api/documents/${upload.body.document.id}/content`).set('X-API-Key', key);
      expect(response.status).toBe(200);
      expect(response.body.toString()).toBe('# Handbook\nBe kind.');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['content-type']).toMatch(/application\/octet-stream/);
    }
  });

  test('unauthenticated and cross-tenant reads cannot access content', async () => {
    const upload = await uploadDocument(request, ctx.app, KEYS.acmeAdmin);
    const url = `/api/documents/${upload.body.document.id}/content`;
    expect((await request(ctx.app).get(url)).status).toBe(401);
    expect((await request(ctx.app).get(url).set('X-API-Key', KEYS.globexAdmin)).status).toBe(404);
  });

  test('missing files and deleted documents return 404', async () => {
    const upload = await uploadDocument(request, ctx.app, KEYS.acmeAdmin);
    const doc = upload.body.document;
    await fs.rm(path.join(ctx.dataDir, 'tenants', ctx.tenants.acme._id, doc.filename));
    const url = `/api/documents/${doc.id}/content`;
    expect((await request(ctx.app).get(url).set('X-API-Key', KEYS.acmeAdmin)).status).toBe(404);
    await request(ctx.app).delete(`/api/documents/${doc.id}`).set('X-API-Key', KEYS.acmeAdmin);
    expect((await request(ctx.app).get(url).set('X-API-Key', KEYS.acmeAdmin)).status).toBe(404);
  });
});
