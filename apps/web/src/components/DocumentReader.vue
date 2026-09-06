<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useApi } from '../composables/useApi.js';
import { documentText } from '../documentText.js';
import { splitSpeech } from '../speech.js';

const props = defineProps({ document: { type: Object, required: true } });
const { request } = useApi();
const synth = window.speechSynthesis;
const supported = !!synth && 'SpeechSynthesisUtterance' in window;
const text = ref('');
const loading = ref(false);
const error = ref('');
const state = ref('idle');
const voices = ref([]);
const voice = ref('');
const rate = ref(1);
const chunks = ref([]);
const position = ref(0);
let generation = 0;
let controller;
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
  const chosen = voices.value.find(item => item.voiceURI === voice.value);
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
  stop();
  state.value = 'playing';
  speakNext(generation);
}
function pause() { synth.pause(); state.value = 'paused'; }
function refreshVoices() { voices.value = synth.getVoices(); }

watch(() => props.document.id, async () => {
  controller?.abort();
  stop();
  const token = generation;
  controller = new AbortController();
  text.value = '';
  chunks.value = [];
  error.value = '';
  loading.value = true;
  try {
    const filename = props.document.filename;
    const bytes = await request(`/api/documents/${props.document.id}/content`, { binary: true, signal: controller.signal });
    const result = await documentText(bytes, filename);
    if (token !== generation) return;
    text.value = result;
    chunks.value = splitSpeech(result);
  } catch (e) {
    if (token === generation && e.name !== 'AbortError') error.value = e.message;
  } finally {
    if (token === generation) loading.value = false;
  }
}, { immediate: true });

onMounted(() => {
  if (!supported) return;
  refreshVoices();
  synth.addEventListener('voiceschanged', refreshVoices);
});
onBeforeUnmount(() => {
  controller?.abort();
  stop();
  synth?.removeEventListener('voiceschanged', refreshVoices);
});
</script>

<template>
  <section class="document-reader" aria-label="Read document aloud">
    <h3>Listen to this document</h3>
    <p v-if="!supported">Your browser does not support reading aloud. Try a browser with speech synthesis.</p>
    <p v-if="loading" role="status">Preparing document…</p>
    <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
    <template v-if="text && supported">
      <label for="reader-voice">Voice</label>
      <select id="reader-voice" v-model="voice" :disabled="state === 'playing' || state === 'paused'">
        <option value="">Device default</option>
        <option v-for="item in voices" :key="item.voiceURI" :value="item.voiceURI">{{ item.name }} ({{ item.lang }})</option>
      </select>
      <label for="reader-speed">Speed</label>
      <select id="reader-speed" v-model="rate" :disabled="state === 'playing' || state === 'paused'">
        <option v-for="speed in [0.5, 0.75, 1, 1.25, 1.5, 2]" :key="speed" :value="speed">{{ speed }}×</option>
      </select>
      <div class="reader-controls">
        <button v-if="state !== 'playing'" class="primary" @click="play">{{ state === 'paused' ? 'Resume' : state === 'finished' ? 'Read again' : 'Read aloud' }}</button>
        <button v-else @click="pause">Pause</button>
        <button :disabled="state === 'idle'" @click="stop">Stop</button>
      </div>
      <progress :value="position" :max="chunks.length" aria-label="Reading progress"></progress>
      <p role="status">{{ state === 'finished' ? 'Finished reading' : state === 'paused' ? 'Paused' : state === 'playing' ? `Reading part ${position + 1} of ${chunks.length}` : 'Ready to listen' }}</p>
      <p v-if="state === 'playing' || state === 'paused'" class="reader-passage">{{ chunks[position] }}</p>
    </template>
    <details v-if="text"><summary>Document text</summary><pre>{{ text }}</pre></details>
  </section>
</template>

<style scoped>
.document-reader { border-top: 1px solid var(--border, #ddd); padding-top: 16px; }
select, progress { width: 100%; margin: 4px 0 12px; }
.reader-controls { display: flex; gap: 8px; margin: 12px 0; }
.reader-passage { padding: 12px; background: #eef5ff; color: #172338; border-radius: 8px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 280px; overflow-y: auto; font: inherit; }
</style>
