export async function documentText(bytes, filename) {
  const extension = filename.split('.').pop().toLowerCase();
  if (extension === 'pdf') {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    GlobalWorkerOptions.workerSrc = workerUrl;
    const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
    try {
      const pdf = await task.promise;
      const pages = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str === undefined ? '' : item.str + (item.hasEOL ? '\n' : ' ')).join(''));
        page.cleanup();
      }
      const text = pages.join('\n\n').trim();
      if (!text) throw new Error('This PDF has no readable text. Scanned PDFs need OCR before listening.');
      return text;
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
  return text.trim();
}
