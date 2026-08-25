import express from 'express';
import { asyncHandler } from '../errorHandler.js';
import { createSseWriter } from '../http/sse.js';

/**
 * Chat session routes. All are tenant-scoped by the auth middleware; any
 * role may chat.
 */
export function createChatRoutes(chatService) {
  const router = express.Router();

  router.get('/chats', asyncHandler(async (req, res) => {
    const chats = await chatService.list(req.tenant.id);
    res.json({ success: true, chats, count: chats.length });
  }));

  router.post('/chats', asyncHandler(async (req, res) => {
    const { title, documentIds } = req.body || {};
    const chat = await chatService.create(req.tenant, {
      title,
      documentIds: Array.isArray(documentIds) ? documentIds : []
    });
    res.status(201).json({ success: true, chat });
  }));

  router.get('/chats/:chatId', asyncHandler(async (req, res) => {
    const chat = await chatService.get(req.tenant.id, req.params.chatId);
    res.json({ success: true, chat });
  }));

  router.post('/chats/:chatId/messages', asyncHandler(async (req, res) => {
    const { content } = req.body || {};

    // Clients that don't ask for SSE get the original blocking JSON reply.
    if (!(req.headers.accept || '').includes('text/event-stream')) {
      const { reply, messages } = await chatService.sendMessage(req.tenant, req.params.chatId, content);
      return res.json({ success: true, reply, messages });
    }

    // SSE headers are written lazily, on the first event: validation errors
    // (empty message, unknown chat) happen before the executor starts and
    // must still surface as ordinary 4xx JSON via the error middleware.
    const { sendEvent, isStreaming } = createSseWriter(res);

    try {
      const { reply, messages } = await chatService.sendMessage(req.tenant, req.params.chatId, content, {
        onProgress: ({ stream, chunk }) => {
          if (stream === 'stdout') sendEvent('chunk', { text: chunk });
        }
      });
      sendEvent('done', { reply, messages });
      res.end();
    } catch (error) {
      if (!isStreaming()) throw error; // headers not sent yet — normal error path
      sendEvent('error', { error: error.error || error.message || 'Chat failed' });
      res.end();
    }
  }));

  router.post('/chats/:chatId/documents', asyncHandler(async (req, res) => {
    const { documentIds } = req.body || {};
    const chat = await chatService.addDocuments(req.tenant.id, req.params.chatId, documentIds);
    res.json({ success: true, chat });
  }));

  router.delete('/chats/:chatId', asyncHandler(async (req, res) => {
    await chatService.remove(req.tenant.id, req.params.chatId);
    res.json({ success: true, message: `Chat ${req.params.chatId} deleted` });
  }));

  return router;
}
