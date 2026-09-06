// Bound utterances to avoid long-document stalls in speech engines.
export function splitSpeech(text, limit = 220) {
  const chunks = [];
  let remaining = text.replace(/\s+/g, ' ').trim();
  while (remaining.length > limit) {
    const prefix = remaining.slice(0, limit);
    const sentenceEnd = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('! '), prefix.lastIndexOf('? '));
    const wordEnd = prefix.lastIndexOf(' ');
    let end = sentenceEnd > limit / 3 ? sentenceEnd + 1 : wordEnd;
    if (end <= 0) end = limit;
    // Never split a UTF-16 surrogate pair.
    if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
