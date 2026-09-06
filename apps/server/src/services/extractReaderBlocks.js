import path from 'node:path';
import { HttpError } from '../errorHandler.js';
import { pdfTextBoxes, orderPdfText } from '../pdfReadingOrder.js';

export async function extractReaderBlocks(bytes, filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true });
    try {
      const pdf = await task.promise;
      const blocks = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const boxes = pdfTextBoxes(content.items, page.getViewport({ scale: 1 })).map((box, i) => ({
          ...box, id: `p${pageNumber}-b${i + 1}`, page: pageNumber
        }));
        blocks.push(...orderPdfText(boxes, true));
        page.cleanup();
        if (blocks.length > 20000) throw new HttpError(422, 'This PDF is too large to prepare. Split it into smaller documents.');
      }
      if (!blocks.length) throw new HttpError(422, 'This PDF has no readable text. Scanned PDFs need OCR first.');
      return blocks;
    } catch (error) {
      if (error.name === 'PasswordException') throw new HttpError(422, 'Unlock this PDF before uploading it.');
      throw error;
    } finally {
      await task.destroy();
    }
  }
  if (!['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.log'].includes(extension)) {
    throw new HttpError(422, 'Export this document as text or PDF before listening.');
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new HttpError(422, 'Save this document as UTF-8 text before listening.'); }
  if (text.includes('\0') || !text.trim()) throw new HttpError(422, 'This document has no readable text or contains binary data.');
  return text.split(/\n\s*\n/).filter(part => part.trim()).map((text, i) => ({ id: `p1-b${i + 1}`, page: 1, text }));
}
