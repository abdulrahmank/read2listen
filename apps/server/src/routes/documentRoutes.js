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

  router.delete('/documents/:documentId', requireAdmin, asyncHandler(async (req, res) => {
    const document = await documentService.remove(req.tenant, req.params.documentId);
    res.json({ success: true, message: `Document ${document.filename} deleted` });
  }));

  return router;
}
