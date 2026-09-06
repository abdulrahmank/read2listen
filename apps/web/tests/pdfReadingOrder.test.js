import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderPdfText, pdfTextBoxes } from '../src/pdfReadingOrder.js';

const box = (text, x, y, width = 200, extra = {}) => ({ text, x, y, width, height: 12, ...extra });
const columns = (start = 50, prefix = '') => [0, 1, 2, 3].flatMap(i => [
  box(`${prefix}Left ${i + 1}`, 40, start + i * 20),
  box(`${prefix}Right ${i + 1}`, 320, start + i * 20)
]);
const expected = prefix => [1, 2, 3, 4].map(i => `${prefix}Left ${i}`).join('\n') + '\n\n' +
  [1, 2, 3, 4].map(i => `${prefix}Right ${i}`).join('\n');

test('reads down columns even when PDF content is interleaved or reversed', () => {
  assert.equal(orderPdfText(columns()), expected(''));
  assert.equal(orderPdfText(columns().reverse()), expected(''));
});

test('keeps full-width title, middle heading, and footer between column sections', () => {
  const boxes = [box('Title', 40, 10, 480), ...columns(), box('Section two', 40, 150, 480),
    ...columns(190, 'Next '), box('Footer', 40, 300, 480)];
  assert.equal(orderPdfText(boxes), `Title\n\n${expected('')}\n\nSection two\n\n${expected('Next ')}\n\nFooter`);
});

test('single-column lines and fragmented words retain reading order', () => {
  assert.equal(orderPdfText([box('Second line', 40, 70), box('world', 95, 50, 50),
    box('Hello', 40, 50, 45)]), 'Hello world\nSecond line');
  assert.equal(orderPdfText([]), '');
});

test('list markers are not mistaken for a separate column', () => {
  const boxes = [0, 1, 2, 3].flatMap(i => [box(`${i + 1}.`, 40, i * 20, 10), box(`Item ${i + 1}`, 100, i * 20, 400)]);
  assert.equal(orderPdfText(boxes), '1.\nItem 1\n2.\nItem 2\n3.\nItem 3\n4.\nItem 4');
});

test('unequal column lengths and captions retain every text fragment', () => {
  const boxes = [...columns(), box('Left caption', 40, 140, 180), box('Last left line', 40, 160)];
  assert.equal(orderPdfText(boxes), 'Left 1\nLeft 2\nLeft 3\nLeft 4\nLeft caption\nLast left line\n\nRight 1\nRight 2\nRight 3\nRight 4');
});

test('right-to-left articles read the right column first', () => {
  const boxes = columns().map(item => ({ ...item, dir: 'rtl' }));
  assert.equal(orderPdfText(boxes), [1, 2, 3, 4].map(i => `Right ${i}`).join('\n') + '\n\n' +
    [1, 2, 3, 4].map(i => `Left ${i}`).join('\n'));
});

test('PDF viewport coordinates handle inverted page Y and rotated pages', () => {
  const items = [{ str: 'Text', transform: [12, 0, 0, 12, 40, 700], width: 100, height: 12, dir: 'ltr' }, { type: 'beginMarkedContent' }];
  assert.deepEqual(pdfTextBoxes(items, { transform: [1, 0, 0, -1, 0, 800] }),
    [box('Text', 40, 88, 100, { dir: 'ltr' })]);
  const rotated = [{ str: 'Rotated', transform: [0, -12, 12, 0, 700, 760], width: 100, height: 12, dir: 'ltr' }];
  assert.deepEqual(pdfTextBoxes(rotated, { transform: [0, 1, 1, 0, 0, 0] }),
    [box('Rotated', 660, 700, 100, { dir: 'ltr' })]);
});
