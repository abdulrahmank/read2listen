import { pdfTextBoxes, orderPdfText } from './pdfReadingOrder.js';

export async function documentContent(bytes, filename) {
  const extension = filename.split('.').pop().toLowerCase();
  if (extension === 'pdf') {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    GlobalWorkerOptions.workerSrc = workerUrl;
    const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
    try {
      const pdf = await task.promise;
      const pages = [];
      const blocks = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const pageText = orderPdfText(pdfTextBoxes(content.items, page.getViewport({ scale: 1 })));
        pages.push(pageText);
        blocks.push({ text: pageText, page: number });
        page.cleanup();
      }
      const text = pages.join('\n\n').trim();
      if (!text) throw new Error('This PDF has no readable text. Scanned PDFs need OCR before listening.');
      return { text, blocks };
    } catch (error) {
      if (error.name === 'PasswordException') throw new Error('Unlock this PDF before uploading it to listen.');
      throw error;
    } finally {
      await task.destroy();
    }
  }
  if (!['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log'].includes(extension)) {
    throw new Error('Listening supports PDF, text, Markdown, CSV, TSV, JSON, and log files. Export this document as text or PDF first.');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Save this document as UTF-8 text before listening.');
  }
  if (text.includes('\0')) throw new Error('This file contains binary data. Export it as text or PDF first.');
  if (!text.trim()) throw new Error('This document has no readable text.');
  return { text: text.trim(), blocks: [{ text: text.trim(), page: 1 }] };
}

export async function documentText(bytes, filename) {
  return (await documentContent(bytes, filename)).text;
}
