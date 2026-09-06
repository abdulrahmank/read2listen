import express from 'express';
import multer from 'multer';
import { asyncHandler } from '../errorHandler.js';
import { maxUploadBytes } from '../env.js';

/**
 * Document library routes. Reading is open to any tenant key; mutating is
 * admin-only. Uploads are multipart: a `file` plus name/version/date/use.
 */
export function createDocumentRoutes(documentService, { requireAdmin }) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes() }
  });

  router.get('/documents/:documentId/content', asyncHandler(async (req, res) => {
    const content = await documentService.content(req.tenant.id, req.params.documentId);
    res.set('Cache-Control', 'no-store');
    res.set('Content-Disposition', 'attachment');
    res.type('application/octet-stream').send(content);
  }));

  router.get('/documents', asyncHandler(async (req, res) => {
    const documents = await documentService.list(req.tenant.id);
    res.json({ success: true, documents, count: documents.length });
  }));

  router.post(
    '/documents',
    requireAdmin,
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const document = await documentService.create(req.tenant, req.body, req.file);
      res.status(201).json({ success: true, document });
    })
  );

  router.patch('/documents/:documentId', requireAdmin, asyncHandler(async (req, res) => {
    const document = await documentService.update(req.tenant, req.params.documentId, req.body || {});
    res.json({ success: true, document });
  }));

  router.delete('/documents/:documentId', requireAdmin, asyncHandler(async (req, res) => {
    const document = await documentService.remove(req.tenant, req.params.documentId);
    res.json({ success: true, message: `Document ${document.filename} deleted` });
  }));

  if (documentService.readerService) {
    router.get('/documents/:documentId/reader', asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, reader: await documentService.readerService.get(req.tenant.id, req.params.documentId) });
    }));
    router.post('/documents/:documentId/reader', asyncHandler(async (req, res) => {
      const reader = await documentService.readerService.prepare(req.tenant.id, req.params.documentId, req.body?.retry === true);
      res.set('Cache-Control', 'no-store');
      res.status(reader.status === 'preparing' ? 202 : 200).json({ success: true, reader });
    }));
  }
  return router;
}
