import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseVoice, loadVoicePreferences, voiceGender } from '../src/voicePreferences.js';
const voices = [
  { name: 'Samantha', lang: 'en-US', localService: true },
  { name: 'Alex', lang: 'en-US', localService: true },
  { name: 'Google UK English Male', lang: 'en-GB' },
  { name: 'Google UK English Female', lang: 'en-GB' },
  { name: 'Unknown provider', lang: 'hi-IN' }
];
test('matches locale and gender without presenting a voice list', () => {
  assert.equal(chooseVoice(voices, 'en-US', 'female').voice.name, 'Samantha');
  assert.equal(chooseVoice(voices, 'en-GB', 'male').voice.name, 'Google UK English Male');
  assert.equal(chooseVoice(voices, 'en_US', 'male').voice.name, 'Alex');
  assert.equal(voiceGender(voices[4]), 'unknown');
});
test('preserves language, prioritizes exact locale and reports preference fallbacks', () => {
  assert.match(chooseVoice(voices, 'hi-IN', 'female').notice, /not identified/);
  assert.equal(chooseVoice(voices, 'fr-FR', 'female').voice, null);
  assert.match(chooseVoice(voices, 'en-AU', 'female').notice, /accent/);
  assert.equal(chooseVoice([voices[1], voices[3]], 'en-US', 'female').voice.name, 'Alex');
});
test('handles empty voices and malformed saved preferences', () => {
  assert.equal(chooseVoice([], 'en-US', 'any').voice, null);
  assert.deepEqual(loadVoicePreferences({ getItem: () => '{bad' }, 'en-IN'), { locale: 'en-IN', gender: '' });
  assert.deepEqual(loadVoicePreferences({ getItem: () => '{"locale":"en-GB","gender":"female"}' }, 'en-US'), { locale: 'en-GB', gender: 'female' });
});
