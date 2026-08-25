import path from 'path';
import fs from 'fs';
import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { connectDb } from './db.js';
import { createApp } from './app.js';
import { CodexExecutor, logCodexVersion } from './CodexExecutor.js';
import { MockExecutor } from './MockExecutor.js';
import { FileStore } from './FileStore.js';
import { TenantRepo } from './repos/TenantRepo.js';
import { DocumentRepo } from './repos/DocumentRepo.js';
import { ChatRepo } from './repos/ChatRepo.js';
import { DocumentService } from './services/DocumentService.js';
import { ChatService } from './services/ChatService.js';
import { IntentGuard } from './services/intentGuard.js';
import { ensureDefaultTenant } from './services/bootstrap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

dotenv.config();

logCodexVersion();

const { db } = await connectDb();

const tenantRepo = new TenantRepo(db);
const documentRepo = new DocumentRepo(db);
const chatRepo = new ChatRepo(db);

const fileStore = new FileStore();
const documentService = new DocumentService({ documentRepo, fileStore });
// The reasoning layer is pluggable: swap the executor here to change backends.
// MOCK_EXECUTOR=true runs a local demo backend that needs no OpenAI account.
const executor = process.env.MOCK_EXECUTOR === 'true' ? new MockExecutor() : new CodexExecutor();
// Screens messages for escape/injection attempts before the agent runs.
const intentGuard = new IntentGuard({ executor });
const chatService = new ChatService({ chatRepo, documentRepo, executor, intentGuard });

await ensureDefaultTenant(tenantRepo);

const { app, finish } = createApp({ tenantRepo, documentService, chatService });

// Serve the built SPA when it exists (production / docker); in development
// the Vite dev server runs separately on its own port.
finish((a) => {
  if (!fs.existsSync(WEB_DIST)) return;
  a.use(express.static(WEB_DIST));
  a.get(/^\/(?!api\/|health$).*/, (req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.info(`chatify-by-f1 running on port ${PORT}`);
});

process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  server.close(() => process.exit(0));
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});
