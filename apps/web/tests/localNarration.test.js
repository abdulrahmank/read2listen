import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePronunciations, applyPronunciations, localVoice, narrationSegments } from '../src/localNarration.js';
import { generateBounded } from '../src/generateLocalSamples.js';

test('pronunciations respect words, punctuation, Unicode and literal replacement text', () => {
  const entries = parsePronunciations('API = A P I\nC++ = see plus plus\nJosé = ho say\nprice = $&');
  assert.equal(applyPronunciations('api, APIS C++ José price', entries), 'A P I, APIS see plus plus ho say $&');
});
test('longest dictionary phrases win and substitutions do not cascade', () => {
  assert.equal(applyPronunciations('New York and York', parsePronunciations('York = town\nNew York = York')), 'York and town');
});
test('malformed and excessive dictionary entries are rejected', () => {
  for (const value of ['word', '= hello', 'word =', 'x'.repeat(101) + '= hi', 'a=b\n'.repeat(201)]) {
    assert.throws(() => parsePronunciations(value));
  }
});
test('narration preserves display text and paragraph pauses while correcting speech', () => {
  const text = 'The API is ready.\nPlease read it.\n\nNext chapter.';
  const segments = narrationSegments(text, 'API = A P I');
  assert.equal(segments[0].original, 'The API is ready.');
  assert.equal(segments[0].spoken, 'The A P I is ready.');
  assert.deepEqual(segments.map(item => item.pause), [0.08, 0.35, 0.35]);
  assert.equal(text, 'The API is ready.\nPlease read it.\n\nNext chapter.');
});
test('only explicit soft hyphenation is joined; meaningful hard hyphens survive', () => {
  assert.equal(narrationSegments('inter\u00ad\nnational well-\nknown.')[0].spoken, 'international well- known.');
});
test('automatic voice choice respects gender and supported accents', () => {
  assert.equal(localVoice('en-GB', 'male').id, 'bm_george');
  assert.equal(localVoice('en-US', 'female').id, 'af_heart');
  assert.equal(localVoice('en-IN', 'any').locale, 'en-US');
  assert.equal(localVoice('hi-IN', 'female'), null);
});

test('tokenizer overflow splits without dropping Unicode text, while other failures propagate', async () => {
  const generated = [];
  const tts = { async generate(text) {
    if (Array.from(text).length > 8) throw new RangeError('PHONEME_LIMIT');
    generated.push(text);
    return { audio: new Float32Array(Array.from(text, char => char.codePointAt(0))) };
  } };
  const input = 'abcdefgh😀ijklmnop😀qrstuv';
  const samples = await generateBounded(tts, input, 'af_heart', 1);
  assert.equal(generated.join(''), input);
  assert.equal(String.fromCodePoint(...samples), input);
  await assert.rejects(generateBounded({ generate: async () => { throw new Error('Download failed'); } }, 'hello'), /Download failed/);
});
