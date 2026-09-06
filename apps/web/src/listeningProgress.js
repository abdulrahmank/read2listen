// Source offsets stay stable when playback speed, pronunciation or voice changes.
export function assembleReading(blocks, isPdf = false) {
  let text = '';
  const pages = [];
  const seen = new Set();
  blocks.forEach((block, index) => {
    const previous = blocks[index - 1];
    const sameLine = previous && block.page === previous.page && typeof block.y === 'number' && Math.abs(block.y - previous.y) < 3;
    if (index) text += sameLine ? ' ' : '\n\n';
    if (isPdf && !seen.has(block.page) && block.text.trim()) {
      pages.push({ number: block.page, offset: text.length });
      seen.add(block.page);
    }
    text += block.text;
  });
  return { text, pages: pages.sort((a, b) => a.number - b.number) };
}

export function chapterHeadings(text) {
  const chapters = [];
  const pattern = /^\s*(?:#{1,3}\s+.+|(?:chapter|part|book)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b.*|prologue|epilogue|preface|introduction|conclusion|acknowledgements|acknowledgments)\s*$/i;
  for (const match of text.matchAll(/[^\n]+/g)) {
    const title = match[0].trim();
    // Exclude common table-of-contents rows, which are not chapter starts.
    if (title.length <= 140 && !/\.{2,}|\s{2,}\d+\s*$/.test(match[0]) && pattern.test(title)) {
      chapters.push({ title: title.replace(/^#+\s*/, ''), offset: match.index + match[0].indexOf(title) });
    }
  }
  return chapters;
}

export function passageRanges(text, limit = 220) {
  const ranges = [];
  const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });
  for (const paragraph of text.matchAll(/\S[\s\S]*?(?=\n\s*\n|$)/g)) {
    for (const sentence of sentences.segment(paragraph[0])) {
      let start = paragraph.index + sentence.index;
      const end = start + sentence.segment.length;
      while (start < end) {
        while (start < end && /\s/.test(text[start])) start++;
        if (start >= end) break;
        let boundary = Math.min(start + limit, end);
        if (boundary < end) {
          const space = text.lastIndexOf(' ', boundary);
          if (space > start) boundary = space;
          if (/[\uD800-\uDBFF]/.test(text[boundary - 1])) boundary--;
        }
        const original = text.slice(start, boundary).trimEnd();
        if (original) ranges.push({ offset: start, end: start + original.length, original, pause: boundary >= end ? 0.12 : 0.04 });
        start = boundary;
      }
    }
    if (ranges.length) ranges[ranges.length - 1].pause = 0.35;
  }
  return ranges;
}

export function passageAt(ranges, offset) {
  if (!ranges.length) return 0;
  const index = ranges.findIndex(range => range.end > offset);
  return index < 0 ? ranges.length - 1 : index;
}
export function estimatedMinutes(text, rate = 1) {
  return Math.max(1, Math.ceil((text.trim().match(/\S+/g)?.length || 0) / (150 * rate)));
}
export function durationLabel(minutes) {
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}
export function progressKey(tenantId, documentId) { return `read2listen.progress:${tenantId || 'local'}:${documentId}`; }
export function saveProgress(storage, key, text, offset, finished = false) {
  const bounded = Math.max(0, Math.min(text.length, offset));
  try { storage.setItem(key, JSON.stringify({ version: 1, length: text.length, offset: bounded, anchor: text.slice(bounded, bounded + 100), finished, updatedAt: Date.now() })); return true; }
  catch { return false; }
}
export function restoreProgress(storage, key, text) {
  try {
    const value = JSON.parse(storage.getItem(key));
    if (value?.version !== 1 || !Number.isInteger(value.offset) || value.offset < 0) return null;
    if (value.length === text.length && value.offset <= text.length && text.slice(value.offset, value.offset + 100) === value.anchor) return value;
    // Reading-order preparation may move a paragraph. Relocate only an unambiguous anchor.
    if (typeof value.anchor === 'string' && value.anchor.length >= 20) {
      const offset = text.indexOf(value.anchor);
      if (offset >= 0 && text.indexOf(value.anchor, offset + 1) < 0) return { ...value, offset, finished: false };
    }
  } catch { /* Corrupt or unavailable storage starts at the beginning. */ }
  return null;
}
