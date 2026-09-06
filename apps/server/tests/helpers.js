import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { GoogleLogin } from '../src/services/GoogleLogin.js';
import { createApp } from '../src/app.js';
import { hashKey } from '../src/auth.js';
import { FileStore } from '../src/FileStore.js';
import { ReaderService } from '../src/services/ReaderService.js';
import { DocumentService } from '../src/services/DocumentService.js';
import { ChatService } from '../src/services/ChatService.js';
import { IntentGuard } from '../src/services/intentGuard.js';
import { InMemoryTenantRepo, InMemoryDocumentRepo, InMemoryChatRepo } from './fakes/repos.js';
import { FakeExecutor } from './fakes/FakeExecutor.js';

export const KEYS = {
  acmeAdmin: 'acme-admin-key',
  acmeMember: 'acme-member-key',
  globexAdmin: 'globex-admin-key'
};

/**
 * Builds the whole app against in-memory repos, a fake executor, and a
 * throwaway DATA_DIR. Two tenants so isolation is testable.
 */
export async function createTestContext({ reader = false, readerExecutor = null, extract, loginOptions } = {}) {
  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'chatify-test-'));

  const tenantRepo = new InMemoryTenantRepo();
  const acme = await tenantRepo.create({
    name: 'acme',
    keys: [
      { hash: hashKey(KEYS.acmeAdmin), role: 'admin' },
      { hash: hashKey(KEYS.acmeMember), role: 'member' }
    ]
  });
  const globex = await tenantRepo.create({
    name: 'globex',
    keys: [{ hash: hashKey(KEYS.globexAdmin), role: 'admin' }]
  });

  const documentRepo = new InMemoryDocumentRepo();
  const chatRepo = new InMemoryChatRepo();
  const executor = new FakeExecutor();

  // The real FileStore against the throwaway DATA_DIR: tests assert on files
  // landing in (and vanishing from) the tenant directories.
  const readerService = reader ? new ReaderService({ documentRepo, fileStore: new FileStore(), executor: readerExecutor, extract }) : undefined;
  const documentService = new DocumentService({ documentRepo, fileStore: new FileStore(), readerService });
  // Heuristic-only in tests: deterministic, no model calls muddying the fake
  // executor's recorded prompts. The model pass is unit-tested separately.
  const intentGuard = new IntentGuard({ executor, mode: 'heuristic' });
  const chatService = new ChatService({ chatRepo, documentRepo, executor, intentGuard });

  const login = loginOptions ? new GoogleLogin({ ...loginOptions, tenantRepo }) : undefined;
  const { app, finish } = createApp({ tenantRepo, documentService, chatService, login });
  finish();

  return {
    app,
    login,
    readerService,
    executor,
    tenants: { acme, globex },
    repos: { tenantRepo, documentRepo, chatRepo },
    dataDir: process.env.DATA_DIR
  };
}

export async function cleanupTestContext(ctx) {
  if (ctx.readerService) await Promise.all([...ctx.readerService.jobs.values()].map(job => job.promise));
  await fs.rm(ctx.dataDir, { recursive: true, force: true });
}

/** Upload a document via the real multipart route; returns the created document. */
export async function uploadDocument(request, app, key, overrides = {}) {
  const fields = {
    name: 'Employee Handbook',
    version: '1.0',
    date: '2026-01-15',
    use: 'Answers HR policy questions',
    filename: 'handbook.md',
    content: '# Handbook\nBe kind.',
    ...overrides
  };

  const res = await request(app)
    .post('/api/documents')
    .set('X-API-Key', key)
    .field('name', fields.name)
    .field('version', fields.version)
    .field('date', fields.date)
    .field('use', fields.use)
    .attach('file', Buffer.from(fields.content), fields.filename);

  return res;
}
