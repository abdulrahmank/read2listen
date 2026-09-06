<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { usePreparedDocument } from '../composables/usePreparedDocument.js';
import { chooseVoice, loadVoicePreferences } from '../voicePreferences.js';
import { splitSpeech } from '../speech.js';
import { localVoice, narrationSegments, parsePronunciations, applyPronunciations } from '../localNarration.js';
import { LocalSpeech } from '../localSpeech.js';

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
const locales = computed(() => [...new Set([locale.value, 'en-US', 'en-GB', ...voices.value.map(voice => voice.lang.replace(/_/g, '-'))])].sort());
function localeLabel(code) {
  try { return new Intl.DisplayNames([navigator.language], { type: 'language' }).of(code); }
  catch { return code; }
}
watch([locale, gender], () => {
  try { localStorage.setItem('read2listen.voice', JSON.stringify({ locale: locale.value, gender: gender.value })); } catch {}
});
const engine = ref('device');
const pronunciationText = ref('');
try { pronunciationText.value = localStorage.getItem('read2listen.pronunciations') || ''; } catch {}
const pronunciationError = ref('');
const localStatus = ref('');
const localSupported = !!window.AudioContext && !!window.Worker && !!window.WebAssembly;
const selectedLocalVoice = computed(() => localVoice(locale.value, gender.value));
const active = computed(() => ['playing', 'paused', 'generating'].includes(state.value));
const readyVoice = computed(() => engine.value === 'local' ? selectedLocalVoice.value && localSupported : matchedVoice.value.voice && supported);
const local = new LocalSpeech(progress => {
  if (!active.value || engine.value !== 'local') return;
  if (progress.status === 'progress') localStatus.value = `Downloading voice model: ${Math.round(progress.progress || 0)}%`;
  else if (progress.status === 'ready') localStatus.value = 'Voice model ready.';
  else if (progress.status === 'synthesizing') localStatus.value = 'Generating speech on this device…';
});
let audioContext;
let source;
let finishSource;
let segments = [];
watch(pronunciationText, value => {
  try {
    parsePronunciations(value);
    pronunciationError.value = '';
    localStorage.setItem('read2listen.pronunciations', value);
  } catch (error) { pronunciationError.value = error.message; }
});
watch([engine, locale, gender, pronunciationText], () => stop());
async function clearAudio() {
  stop();
  try { await local.clearCache(); localStatus.value = 'Saved narration cleared from this device.'; }
  catch { error.value = 'Could not clear saved narration. Try clearing this site’s browser storage.'; }
}
const rate = ref(1);
const chunks = ref([]);
const position = ref(0);
let generation = 0;
let utterance;

function stop() {
  generation++;
  if (source) { source.onended = null; source.stop(); source = null; }
  finishSource?.();
  finishSource = null;
  if (active.value) local.dispose();
  localStatus.value = '';
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

async function playLocal() {
  if (state.value === 'paused') {
    const token = generation;
    try { await audioContext.resume(); if (token === generation) state.value = 'playing'; }
    catch (failure) { error.value = failure.message; }
    return;
  }
  stop();
  const token = generation;
  state.value = 'generating';
  localStatus.value = 'Loading local voice. The first download can take a few minutes.';
  try {
    audioContext ||= new AudioContext({ sampleRate: 24000 });
    await audioContext.resume(); // Unlock audio during the user's Play gesture.
    if (token !== generation) return;
    segments = narrationSegments(text.value, pronunciationText.value, locale.value);
    chunks.value = segments.map(segment => segment.original);
    const voice = selectedLocalVoice.value.id;
    const speed = Number(rate.value);
    const get = index => local.samples(segments[index].spoken, voice, speed)
      .then(samples => ({ samples }), failure => ({ failure }));
    let next = segments.length ? get(0) : null;
    for (let index = 0; index < segments.length; index++) {
      const { samples, failure } = await next;
      if (token !== generation) return;
      if (failure) throw failure;
      position.value = index;
      if (index + 1 < segments.length) next = get(index + 1);
      const buffer = audioContext.createBuffer(1, samples.length + Math.round(segments[index].pause * 24000), 24000);
      buffer.copyToChannel(samples, 0);
      if (state.value !== 'paused') state.value = 'playing';
      localStatus.value = '';
      await new Promise(resolve => {
        finishSource = resolve;
        source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.onended = resolve;
        source.start();
      });
      if (token !== generation) return;
      finishSource = null;
      source = null;
      position.value = index + 1;
      if (index + 1 < segments.length && state.value !== 'paused') state.value = 'generating';
    }
    state.value = 'finished';
  } catch (failure) {
    if (token !== generation) return;
    stop();
    error.value = `Local narration could not play: ${failure.message}. You can retry or select device voices.`;
  }
}
function play() {
  error.value = '';
  if (engine.value === 'local') { playLocal(); return; }
  if (state.value === 'paused') {
    state.value = 'playing';
    synth.resume();
    return;
  }
  if (!gender.value || !matchedVoice.value.voice) return;
  stop();
  try { chunks.value = splitSpeech(applyPronunciations(text.value, parsePronunciations(pronunciationText.value))); }
  catch (failure) { error.value = failure.message; return; }
  synth.resume();
  state.value = 'playing';
  speakNext(generation);
}
function pause() {
  if (engine.value === 'local') {
    state.value = 'paused';
    audioContext?.suspend().catch(failure => { error.value = failure.message; });
  } else { synth.pause(); state.value = 'paused'; }
}
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
  local.dispose();
  audioContext?.close();
  synth?.removeEventListener('voiceschanged', refreshVoices);
});
</script>

<template>
  <section class="document-reader" aria-label="Listen to a book or article">
    <h3>Listening controls</h3>
    <p v-if="!supported && engine === 'device'">Device voices are unavailable in this browser. Select local narration or try another browser.</p>
    <p v-if="loading" role="status">Preparing reading order… You can listen in the original order while this completes.</p>
    <p v-if="preparationNotice" class="voice-note">{{ preparationNotice }}</p>
    <p v-if="preparationError" class="error-banner" role="alert">{{ preparationError }}</p>
    <div v-if="loading || preparationError || preparationNotice" class="preparation-actions">
      <button v-if="!loading && canRetry" @click="retryPreparation">Retry preparation</button>
      <button @click="useOriginal">Use original reading order</button>
    </div>
    <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
    <template v-if="text">
      <label for="reader-engine">Narration</label>
      <select id="reader-engine" v-model="engine" :disabled="active">
        <option value="device">Device voices</option>
        <option value="local" :disabled="!localSupported">Natural voice on this device · English</option>
      </select>
      <p v-if="engine === 'local'" class="voice-note">Downloads a voice model on first play. Speech is generated on this device without an API call. Saved audio uses up to 128 MB of browser storage. US and UK English are supported.</p>
      <p v-if="engine === 'local' && !selectedLocalVoice" class="voice-note">Choose English (United States or United Kingdom), or use device voices for this language.</p>
      <div class="voice-preferences">
        <div>
          <label for="reader-locale">Language and region</label>
          <select id="reader-locale" v-model="locale" :disabled="active">
            <option v-for="code in locales" :key="code" :value="code">{{ localeLabel(code) }}</option>
          </select>
        </div>
        <div>
          <label for="reader-gender">Voice preference</label>
          <select id="reader-gender" v-model="gender" :disabled="active">
            <option value="" disabled>Choose a voice preference</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="any">No preference</option>
          </select>
        </div>
      </div>
      <p v-if="engine === 'device' && gender && matchedVoice.voice" class="voice-note">Selected voice: {{ matchedVoice.voice.name }}</p>
      <p v-if="engine === 'device' && matchedVoice.notice" class="voice-note">{{ matchedVoice.notice }}</p>
      <p v-if="engine === 'local' && gender && selectedLocalVoice" class="voice-note">Selected voice: {{ selectedLocalVoice.name }} · {{ selectedLocalVoice.locale }}</p>
      <details class="pronunciations">
        <summary>Pronunciation dictionary</summary>
        <label for="reader-pronunciations">One correction per line: word = say it as</label>
        <textarea id="reader-pronunciations" v-model="pronunciationText" :disabled="active" rows="4" maxlength="60000" placeholder="SQL = sequel&#10;API = A P I"></textarea>
        <p class="voice-note">Applies to speech only. Corrections are saved on this browser and can be removed by deleting their lines.</p>
        <p v-if="pronunciationError" class="error-banner" role="alert">{{ pronunciationError }}</p>
      </details>
      <label for="reader-speed">Speed</label>
      <select id="reader-speed" v-model="rate" :disabled="active">
        <option v-for="speed in [0.5, 0.75, 1, 1.25, 1.5, 2]" :key="speed" :value="speed">{{ speed }}×</option>
      </select>
      <div class="reader-controls">
        <button v-if="state !== 'playing' && state !== 'generating'" class="primary" :disabled="!gender || !readyVoice || loading || !!pronunciationError" @click="play">{{ state === 'paused' ? 'Resume' : state === 'finished' ? 'Read again' : engine === 'local' ? 'Play natural voice' : 'Read aloud' }}</button>
        <button v-else @click="pause">Pause</button>
        <button :disabled="state === 'idle'" @click="stop">Stop</button>
      </div>
      <button v-if="engine === 'local'" :disabled="active" @click="clearAudio">Clear saved narration</button>
      <p v-if="localStatus" class="voice-note" role="status">{{ localStatus }}</p>
      <progress :value="position" :max="chunks.length" aria-label="Reading progress"></progress>
      <p role="status">{{ state === 'finished' ? 'Finished reading' : state === 'paused' ? 'Paused' : state === 'generating' ? `Preparing part ${position + 1} of ${chunks.length || '…'}` : state === 'playing' ? `Reading part ${position + 1} of ${chunks.length}` : 'Ready to listen' }}</p>
      <p v-if="active" class="reader-passage">{{ chunks[position] }}</p>
    </template>
    <article v-if="text" class="reader-text" aria-label="Book or article text"><pre>{{ text }}</pre></article>
  </section>
</template>

<style scoped>
textarea { box-sizing: border-box; width: 100%; margin-top: 8px; }
.pronunciations { margin: 16px 0; }
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
