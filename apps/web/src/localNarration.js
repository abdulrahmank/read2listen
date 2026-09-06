import { splitSpeech } from './speech.js';

// Pronunciation hints are spoken substitutions, never edits to the document.
export function parsePronunciations(value) {
  const entries = [];
  for (const line of value.split('\n').filter(line => line.trim())) {
    const index = line.indexOf('=');
    const word = line.slice(0, index).trim();
    const spoken = line.slice(index + 1).trim();
    if (index < 1 || !word || !spoken || word.length > 100 || spoken.length > 200) {
      throw new Error('Use one Word = spoken pronunciation per line (up to 100 characters for the word and 200 for its pronunciation).');
    }
    entries.push([word, spoken]);
  }
  if (entries.length > 200) throw new Error('Please use at most 200 pronunciation entries.');
  return entries;
}

export function applyPronunciations(text, entries) {
  if (!entries.length) return text;
  const dictionary = new Map(entries.map(([word, spoken]) => [word.toLowerCase(), spoken]));
  const alternatives = [...dictionary.keys()].sort((a, b) => b.length - a.length)
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // A single pass prevents replacements from cascading into other entries.
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'giu'),
    word => dictionary.get(word.toLowerCase()));
}

export function localVoice(locale, gender) {
  const language = locale.toLowerCase().replace('_', '-');
  if (!language.startsWith('en-') && language !== 'en') return null;
  return language === 'en-gb'
    ? { id: gender === 'male' ? 'bm_george' : 'bf_emma', name: gender === 'male' ? 'George' : 'Emma', locale: 'en-GB' }
    : { id: gender === 'male' ? 'am_michael' : 'af_heart', name: gender === 'male' ? 'Michael' : 'Heart', locale: 'en-US' };
}

export function narrationSegments(text, pronunciationText = '', locale = 'en-US') {
  const entries = parsePronunciations(pronunciationText);
  // Keep ambiguous hard hyphens intact. Remove only explicit soft hyphenation.
  const clean = text.replace(/\u00ad\s*\n\s*/g, '').replace(/\u00ad/g, '').replace(/\r\n?/g, '\n');
  const paragraphs = clean.split(/\n\s*\n/).map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const splitter = new Intl.Segmenter(locale, { granularity: 'sentence' });
  return paragraphs.flatMap(paragraph => {
    const sentences = [...splitter.segment(paragraph)].flatMap(({ segment }) => splitSpeech(segment, 1200));
    return sentences.map((original, index) => ({
      original,
      spoken: applyPronunciations(original, entries),
      pause: index === sentences.length - 1 ? 0.35 : 0.08
    }));
  });
}
