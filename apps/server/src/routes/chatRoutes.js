import express from 'express';
import { asyncHandler } from '../errorHandler.js';

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
    const { reply, messages } = await chatService.sendMessage(req.tenant, req.params.chatId, content);
    res.json({ success: true, reply, messages });
  }));

  router.post('/chats/:chatId/documents', asyncHandler(async (req, res) => {
    const { documentIds } = req.body || {};
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ success: false, error: 'documentIds must be a non-empty array' });
    }
    const chat = await chatService.addDocuments(req.tenant.id, req.params.chatId, documentIds);
    res.json({ success: true, chat });
  }));

  router.delete('/chats/:chatId', asyncHandler(async (req, res) => {
    await chatService.remove(req.tenant.id, req.params.chatId);
    res.json({ success: true, message: `Chat ${req.params.chatId} deleted` });
  }));

  return router;
}
