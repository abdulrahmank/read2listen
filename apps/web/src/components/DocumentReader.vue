<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { usePreparedDocument } from '../composables/usePreparedDocument.js';
import { chooseVoice, loadVoicePreferences } from '../voicePreferences.js';
import { splitSpeech } from '../speech.js';

const props = defineProps({ document: { type: Object, required: true } });
const synth = window.speechSynthesis;
const supported = !!synth && 'SpeechSynthesisUtterance' in window;
const text = ref('');
const error = ref('');
const state = ref('idle');
const voices = ref([]);
const savedVoice = loadVoicePreferences(localStorage, navigator.language || 'en-US');
const locale = ref(savedVoice.locale);
const gender = ref(savedVoice.gender);
const matchedVoice = computed(() => chooseVoice(voices.value, locale.value, gender.value));
const locales = computed(() => [...new Set([locale.value, ...voices.value.map(voice => voice.lang.replace(/_/g, '-'))])].sort());
function localeLabel(code) {
  try { return new Intl.DisplayNames([navigator.language], { type: 'language' }).of(code); }
  catch { return code; }
}
watch([locale, gender], () => {
  try { localStorage.setItem('read2listen.voice', JSON.stringify({ locale: locale.value, gender: gender.value })); } catch {}
});
const rate = ref(1);
const chunks = ref([]);
const position = ref(0);
let generation = 0;
let utterance;

function stop() {
  generation++;
  if (supported) synth.cancel();
  utterance = null;
  state.value = 'idle';
  position.value = 0;
}

function speakNext(token) {
  if (token !== generation) return;
  if (position.value >= chunks.value.length) {
    state.value = 'finished';
    utterance = null;
    return;
  }
  utterance = new SpeechSynthesisUtterance(chunks.value[position.value]);
  const chosen = matchedVoice.value.voice;
  if (chosen) { utterance.voice = chosen; utterance.lang = chosen.lang; }
  utterance.rate = Number(rate.value);
  utterance.onend = () => {
    if (token !== generation) return;
    position.value++;
    speakNext(token);
  };
  utterance.onerror = event => {
    if (token !== generation) return;
    stop();
    error.value = `Could not play audio (${event.error}). Try another voice or browser.`;
  };
  synth.speak(utterance);
}

function play() {
  error.value = '';
  if (state.value === 'paused') {
    state.value = 'playing';
    synth.resume();
    return;
  }
  if (!gender.value || !matchedVoice.value.voice) return;
  stop();
  synth.resume();
  state.value = 'playing';
  speakNext(generation);
}
function pause() { synth.pause(); state.value = 'paused'; }
function refreshVoices() { voices.value = synth.getVoices(); }

const { load: prepare, original, preparing: loading, preparationNotice, preparationError, canRetry } = usePreparedDocument(result => {
  stop();
  text.value = result;
  chunks.value = splitSpeech(result);
});
watch(() => props.document.id, () => {
  stop();
  text.value = '';
  chunks.value = [];
  error.value = '';
  prepare(props.document);
}, { immediate: true });
function retryPreparation() { stop(); prepare(props.document, true); }
function useOriginal() { stop(); original(); }

onMounted(() => {
  if (!supported) return;
  refreshVoices();
  synth.addEventListener('voiceschanged', refreshVoices);
});
onBeforeUnmount(() => {
  stop();
  synth?.removeEventListener('voiceschanged', refreshVoices);
});
</script>

<template>
  <section class="document-reader" aria-label="Read document aloud">
    <h3>Listening controls</h3>
    <p v-if="!supported">Your browser does not support reading aloud. Try a browser with speech synthesis.</p>
    <p v-if="loading" role="status">Preparing reading order… You can listen in the original order while this completes.</p>
    <p v-if="preparationNotice" class="voice-note">{{ preparationNotice }}</p>
    <p v-if="preparationError" class="error-banner" role="alert">{{ preparationError }}</p>
    <div v-if="loading || preparationError || preparationNotice" class="preparation-actions">
      <button v-if="!loading && canRetry" @click="retryPreparation">Retry preparation</button>
      <button @click="useOriginal">Use original reading order</button>
    </div>
    <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
    <template v-if="text && supported">
      <div class="voice-preferences">
        <div>
          <label for="reader-locale">Language and region</label>
          <select id="reader-locale" v-model="locale" :disabled="state === 'playing' || state === 'paused'">
            <option v-for="code in locales" :key="code" :value="code">{{ localeLabel(code) }}</option>
          </select>
        </div>
        <div>
          <label for="reader-gender">Voice preference</label>
          <select id="reader-gender" v-model="gender" :disabled="state === 'playing' || state === 'paused'">
            <option value="" disabled>Choose a voice preference</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="any">No preference</option>
          </select>
        </div>
      </div>
      <p v-if="gender && matchedVoice.voice" class="voice-note">Selected voice: {{ matchedVoice.voice.name }}</p>
      <p v-if="matchedVoice.notice" class="voice-note">{{ matchedVoice.notice }}</p>
      <label for="reader-speed">Speed</label>
      <select id="reader-speed" v-model="rate" :disabled="state === 'playing' || state === 'paused'">
        <option v-for="speed in [0.5, 0.75, 1, 1.25, 1.5, 2]" :key="speed" :value="speed">{{ speed }}×</option>
      </select>
      <div class="reader-controls">
        <button v-if="state !== 'playing'" class="primary" :disabled="!gender || !matchedVoice.voice || loading" @click="play">{{ state === 'paused' ? 'Resume' : state === 'finished' ? 'Read again' : 'Read aloud' }}</button>
        <button v-else @click="pause">Pause</button>
        <button :disabled="state === 'idle'" @click="stop">Stop</button>
      </div>
      <progress :value="position" :max="chunks.length" aria-label="Reading progress"></progress>
      <p role="status">{{ state === 'finished' ? 'Finished reading' : state === 'paused' ? 'Paused' : state === 'playing' ? `Reading part ${position + 1} of ${chunks.length}` : 'Ready to listen' }}</p>
      <p v-if="state === 'playing' || state === 'paused'" class="reader-passage">{{ chunks[position] }}</p>
    </template>
    <article v-if="text" class="reader-text" aria-label="Document text"><pre>{{ text }}</pre></article>
  </section>
</template>

<style scoped>
.voice-preferences { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
.voice-note { color: var(--muted); font-size: 13px; }
.preparation-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.document-reader h3 { margin-top: 0; }
select, progress { width: 100%; margin: 4px 0 12px; }
.reader-controls { display: flex; gap: 8px; margin: 12px 0; }
.reader-passage { padding: 12px; background: #eef5ff; color: #172338; border-radius: 8px; }
.reader-text { border-top: 1px solid var(--border); margin-top: 28px; padding-top: 28px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 20px/1.85 Georgia, serif; margin: 0; }
</style>
