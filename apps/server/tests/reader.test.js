import { describe, test, expect, afterEach } from '@jest/globals';
import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createTestContext, cleanupTestContext, uploadDocument, KEYS } from './helpers.js';
import { ReaderService, validateOrder } from '../src/services/ReaderService.js';
import { FileStore } from '../src/FileStore.js';

const sourceBlocks = [{ id: 'p1-b1', page: 1, text: 'Original first paragraph.' }, { id: 'p1-b2', page: 1, text: 'Original second paragraph.' }];
const validExecutor = () => ({ calls: 0, async execute(prompt, options) {
  this.calls++; this.options = options;
  return { output: JSON.stringify({ order: ['p1-b2', 'p1-b1'] }) };
} });

describe('Cached reader preparation', () => {
  let ctx;
  afterEach(async () => { if (ctx) await cleanupTestContext(ctx); });
  async function setup(executor = validExecutor()) {
    ctx = await createTestContext({ reader: true, readerExecutor: executor, extract: async () => sourceBlocks });
    const uploaded = await uploadDocument(request, ctx.app, KEYS.acmeAdmin);
    const id = uploaded.body.document.id;
    await ctx.readerService.prepare(ctx.tenants.acme._id, id);
    await Promise.all([...ctx.readerService.jobs.values()].map(job => job.promise));
    return { id, executor, url: `/api/documents/${id}/reader` };
  }

  test('upload prepares and caches original text with only ID order changed', async () => {
    const { id, executor, url } = await setup();
    const result = await request(ctx.app).get(url).set('X-API-Key', KEYS.acmeMember);
    expect(result.status).toBe(200);
    expect(result.body.reader.status).toBe('ready');
    expect(result.body.reader.blocks).toEqual(sourceBlocks);
    expect(result.body.reader.order).toEqual(['p1-b2', 'p1-b1']);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(executor.options.sandboxMode).toBe('read-only');
    expect(JSON.parse(executor.options.stdin).blocks).toEqual(sourceBlocks);
    expect(executor.options.cwd).not.toContain(ctx.tenants.acme._id);
    await expect(fs.access(executor.options.cwd)).rejects.toThrow();
    await request(ctx.app).post(url).set('X-API-Key', KEYS.acmeMember).send({});
    const restarted = new ReaderService({ documentRepo: ctx.repos.documentRepo, fileStore: new FileStore(), executor });
    expect((await restarted.get(ctx.tenants.acme._id, id)).status).toBe('ready');
    expect(executor.calls).toBe(1);
  });

  test('rejects unauthorized and cross-tenant preparation and reads', async () => {
    const { url } = await setup();
    for (const method of ['get', 'post']) {
      expect((await request(ctx.app)[method](url)).status).toBe(401);
      expect((await request(ctx.app)[method](url).set('X-API-Key', KEYS.globexAdmin)).status).toBe(404);
    }
  });

  test('invalid model output falls back without dropping or rewriting text, then permits retry', async () => {
    const executor = { async execute() { return { output: '{"order":["invented"]}' }; } };
    const { url } = await setup(executor);
    let response = await request(ctx.app).get(url).set('X-API-Key', KEYS.acmeMember);
    expect(response.body.reader.status).toBe('fallback');
    expect(response.body.reader.order).toEqual(sourceBlocks.map(block => block.id));
    expect(response.body.reader.blocks).toEqual(sourceBlocks);
    executor.execute = async () => ({ output: '{"order":["p1-b1","p1-b2"]}' });
    await request(ctx.app).post(url).set('X-API-Key', KEYS.acmeMember).send({ retry: true });
    await Promise.all([...ctx.readerService.jobs.values()].map(job => job.promise));
    response = await request(ctx.app).get(url).set('X-API-Key', KEYS.acmeMember);
    expect(response.body.reader.status).toBe('ready');
  });

  test('changed source invalidates cache and deleted documents cannot expose cached content', async () => {
    const { id, url } = await setup();
    await fs.writeFile(path.join(ctx.dataDir, 'tenants', ctx.tenants.acme._id, 'handbook.md'), 'Changed source.');
    expect((await request(ctx.app).get(url).set('X-API-Key', KEYS.acmeMember)).body.reader.status).toBe('idle');
    await request(ctx.app).delete(`/api/documents/${id}`).set('X-API-Key', KEYS.acmeAdmin);
    expect((await request(ctx.app).get(url).set('X-API-Key', KEYS.acmeMember)).status).toBe(404);
  });

  test('concurrent preparations share one job and deletion during execution prevents saving', async () => {
    let finish;
    let called;
    const started = new Promise(resolve => { called = resolve; });
    const executor = { calls: 0, async execute() { this.calls++; called(); return new Promise(resolve => { finish = resolve; }); } };
    ctx = await createTestContext({ reader: true, readerExecutor: executor, extract: async () => sourceBlocks });
    const uploaded = await uploadDocument(request, ctx.app, KEYS.acmeAdmin);
    const id = uploaded.body.document.id;
    await started;
    const url = `/api/documents/${id}/reader`;
    await Promise.all([1, 2, 3].map(() => request(ctx.app).post(url).set('X-API-Key', KEYS.acmeMember).send({})));
    expect(executor.calls).toBe(1);
    await request(ctx.app).delete(`/api/documents/${id}`).set('X-API-Key', KEYS.acmeAdmin);
    finish({ output: '{"order":["p1-b1","p1-b2"]}' });
    await Promise.all([...ctx.readerService.jobs.values()].map(job => job.promise));
    expect(await ctx.repos.documentRepo.findById(ctx.tenants.acme._id, id)).toBeNull();
  });

  test('validation rejects duplicates, omissions and non-array orders', () => {
    for (const order of [['p1-b1', 'p1-b1'], ['p1-b1'], null, { order: [] }]) {
      expect(() => validateOrder(order, sourceBlocks)).toThrow();
    }
  });
});
