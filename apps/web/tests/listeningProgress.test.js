import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleReading, chapterHeadings, passageRanges, passageAt, estimatedMinutes, durationLabel, progressKey, saveProgress, restoreProgress } from '../src/listeningProgress.js';
const storage = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }; };

test('PDF pages preserve positions, skip empty pages and distinguish printed labels from file pages', () => {
  const reading = assembleReading([{ page: 1, text: 'Preface' }, { page: 2, text: '' }, { page: 3, text: 'Chapter 1\nPrinted page 1' }], true);
  assert.deepEqual(reading.pages.map(item => item.number), [1, 3]);
  assert.ok(reading.text.slice(reading.pages[1].offset).startsWith('Chapter 1'));
  assert.deepEqual(assembleReading([{ page: 1, text: 'Article' }]).pages, []);
});
test('headings identify chapters and markdown headings but reject common table-of-contents entries', () => {
  const text = 'Contents\nChapter 1 .... 12\nChapter 2    32\n\nChapter One: Begin\nA story.\n\n## A new idea\nMore text.\n\nEpilogue';
  const chapters = chapterHeadings(text);
  assert.deepEqual(chapters.map(item => item.title), ['Chapter One: Begin', 'A new idea', 'Epilogue']);
  assert.ok(text.slice(chapters[0].offset).startsWith('Chapter One: Begin'));
});
test('passages retain original source positions through whitespace, punctuation and Unicode', () => {
  const text = '  First sentence.\nA second sentence.\n\n' + 'abc😀'.repeat(100);
  const ranges = passageRanges(text, 40);
  assert.ok(ranges.every(range => text.slice(range.offset, range.end) === range.original && range.original.length <= 40));
  assert.equal(ranges.map(range => range.original).join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert.ok(ranges.every(range => !/[\uD800-\uDBFF]$/.test(range.original)));
  assert.equal(passageAt(ranges, ranges[2].offset), 2);
});
test('progress survives voice segmentation changes and is isolated by tenant and upload', () => {
  const store = storage();
  const text = 'An opening sentence. '.repeat(30);
  const offset = passageRanges(text, 220)[7].offset;
  const key = progressKey('tenant-a', 'book-a');
  saveProgress(store, key, text, offset);
  const saved = restoreProgress(store, key, text);
  assert.equal(saved.offset, offset);
  assert.ok(passageRanges(text, 1200)[passageAt(passageRanges(text, 1200), saved.offset)].offset <= offset);
  assert.equal(restoreProgress(store, progressKey('tenant-b', 'book-a'), text), null);
  assert.equal(restoreProgress(store, progressKey('tenant-a', 'book-b'), text), null);
  saveProgress(store, key, text, text.length, true);
  assert.equal(restoreProgress(store, key, text).finished, true);
});
test('changed text relocates unique anchors and rejects stale or corrupt progress', () => {
  const store = storage(); const key = 'book';
  const original = 'This chapter is long enough to identify uniquely. Some more words.';
  saveProgress(store, key, original, 0);
  assert.equal(restoreProgress(store, key, 'New preface.\n' + original).offset, 13);
  assert.equal(restoreProgress(store, key, 'An entirely different book.'), null);
  store.setItem(key, '{'); assert.equal(restoreProgress(store, key, original), null);
  assert.equal(saveProgress({ setItem() { throw new Error('Quota'); } }, key, original, 0), false);
});
test('duration estimates reflect speed and format full books', () => {
  assert.equal(estimatedMinutes('word '.repeat(90000)), 600);
  assert.equal(estimatedMinutes('word '.repeat(90000), 2), 300);
  assert.equal(durationLabel(600), '10 hr');
  assert.equal(durationLabel(75), '1 hr 15 min');
});
