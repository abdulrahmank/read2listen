import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from './logger.js';
import { createAuth } from './auth.js';
import { createDocumentRoutes } from './routes/documentRoutes.js';
import { createChatRoutes } from './routes/chatRoutes.js';
import { createTenantRoutes } from './routes/tenantRoutes.js';
import { errorHandler, notFoundHandler } from './errorHandler.js';

/**
 * Pure composition: every dependency is injected, so tests build the app
 * with in-memory repos and a stub executor. src/index.js does the real
 * wiring (Mongo, Codex exec, static SPA).
 */
export function createApp({ tenantRepo, documentService, chatService }) {
  const app = express();
  const auth = createAuth(tenantRepo);

  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-API-Key']
  }));
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  app.get('/health', (req, res) => {
    res.json({ success: true, status: 'healthy', uptime: process.uptime() });
  });

  app.use('/api', auth.authenticate);
  app.use('/api', createTenantRoutes());
  app.use('/api', createDocumentRoutes(documentService, auth));
  app.use('/api', createChatRoutes(chatService));

  return { app, finish: (fallback) => finishApp(app, fallback) };
}

/**
 * Terminal middleware goes on AFTER any static/SPA mounting index.js does —
 * split out so the 404 handler doesn't swallow the SPA fallback.
 */
function finishApp(app, fallback) {
  if (fallback) fallback(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
