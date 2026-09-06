import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSpeech } from '../src/speech.js';
import { documentText } from '../src/documentText.js';

const bytes = text => new TextEncoder().encode(text).buffer;

test('long documents preserve words and use bounded utterances', () => {
  const text = 'First sentence. A longer second sentence to listen to. '.repeat(100);
  const chunks = splitSpeech(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 220));
  assert.equal(chunks.join(' '), text.trim());
  assert.deepEqual(splitSpeech(' \n '), []);
});

test('unbroken Unicode text is bounded without splitting surrogate pairs', () => {
  const text = 'a' + '😀'.repeat(400);
  const chunks = splitSpeech(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every(chunk => chunk.length <= 220 && !/[\uD800-\uDBFF]$/.test(chunk)));
});

test('text extraction accepts Unicode and rejects empty, binary and unsupported documents', async () => {
  assert.equal(await documentText(bytes(' Hello नमस्ते '), 'book.TXT'), 'Hello नमस्ते');
  await assert.rejects(documentText(bytes(' \n '), 'book.md'), /no readable text/);
  await assert.rejects(documentText(bytes('abc\0'), 'book.txt'), /binary/);
  await assert.rejects(documentText(new Uint8Array([0xff]).buffer, 'book.txt'), /UTF-8/);
  await assert.rejects(documentText(bytes('abc'), 'book.docx'), /Export/);
});
