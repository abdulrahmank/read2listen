import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createTestContext, cleanupTestContext, KEYS } from './helpers.js';

describe('Auth and roles', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  test('health endpoint is open', async () => {
    const res = await request(ctx.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  test('API rejects requests without a key', async () => {
    const res = await request(ctx.app).get('/api/chats');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Missing API key');
  });

  test('API rejects unknown keys', async () => {
    const res = await request(ctx.app).get('/api/chats').set('X-API-Key', 'nope');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid API key');
  });

  test('GET /api/tenant reports tenant and role for the key', async () => {
    const admin = await request(ctx.app).get('/api/tenant').set('X-API-Key', KEYS.acmeAdmin);
    expect(admin.status).toBe(200);
    expect(admin.body.tenant.name).toBe('acme');
    expect(admin.body.role).toBe('admin');

    const member = await request(ctx.app).get('/api/tenant').set('X-API-Key', KEYS.acmeMember);
    expect(member.body.role).toBe('member');
  });

  test('member keys cannot manage documents', async () => {
    const res = await request(ctx.app)
      .post('/api/documents')
      .set('X-API-Key', KEYS.acmeMember)
      .field('name', 'x')
      .attach('file', Buffer.from('hi'), 'x.txt');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Admin key required');
  });

  test('member keys can read documents and chats', async () => {
    const docs = await request(ctx.app).get('/api/documents').set('X-API-Key', KEYS.acmeMember);
    expect(docs.status).toBe(200);

    const chats = await request(ctx.app).get('/api/chats').set('X-API-Key', KEYS.acmeMember);
    expect(chats.status).toBe(200);
  });
});
