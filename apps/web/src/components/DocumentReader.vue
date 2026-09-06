<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { usePreparedDocument } from '../composables/usePreparedDocument.js';
import { useTenant } from '../composables/useTenant.js';
import { chooseVoice, loadVoicePreferences } from '../voicePreferences.js';
import { splitSpeech } from '../speech.js';
import { localVoice, narrationSegments, parsePronunciations } from '../localNarration.js';
import { LocalSpeech } from '../localSpeech.js';
import { chapterHeadings, passageRanges, passageAt, estimatedMinutes, durationLabel, progressKey, saveProgress, restoreProgress } from '../listeningProgress.js';

const props = defineProps({ document: { type: Object, required: true } });
const { tenant } = useTenant();
const synth = window.speechSynthesis;
const supported = !!synth && 'SpeechSynthesisUtterance' in window;
const text = ref('');
const pages = ref([]);
const error = ref('');
const state = ref('idle');
const voices = ref([]);
const savedVoice = loadVoicePreferences(localStorage, navigator.language || 'en-US');
const locale = ref(savedVoice.locale);
const gender = ref(savedVoice.gender);
const engine = ref('device');
const rate = ref(1);
try {
  const saved = JSON.parse(localStorage.getItem('read2listen.playback') || '{}');
  if (saved.engine === 'local') engine.value = 'local';
  if ([0.5, 0.75, 1, 1.25, 1.5, 2].includes(saved.rate)) rate.value = saved.rate;
} catch {}
const matchedVoice = computed(() => chooseVoice(voices.value, locale.value, gender.value));
const locales = computed(() => [...new Set([locale.value, 'en-US', 'en-GB', ...voices.value.map(voice => voice.lang.replace(/_/g, '-'))])].sort());
function localeLabel(code) {
  try { return new Intl.DisplayNames([navigator.language], { type: 'language' }).of(code); }
  catch { return code; }
}
const pronunciationText = ref('');
try { pronunciationText.value = localStorage.getItem('read2listen.pronunciations') || ''; } catch {}
const pronunciationError = ref('');
const localStatus = ref('');
const notice = ref('');
const localSupported = !!window.AudioContext && !!window.Worker && !!window.WebAssembly;
const selectedLocalVoice = computed(() => localVoice(locale.value, gender.value));
const active = computed(() => ['playing', 'paused', 'generating'].includes(state.value));
const readyVoice = computed(() => engine.value === 'local' ? selectedLocalVoice.value && localSupported : matchedVoice.value.voice && supported);
const local = new LocalSpeech(progress => {
  if (!active.value || engine.value !== 'local') return;
  if (progress.status === 'progress') localStatus.value = `Downloading voice model: ${Math.round(progress.progress || 0)}%`;
  else if (progress.status === 'ready') localStatus.value = 'Voice model ready.';
  else if (progress.status === 'synthesizing' && state.value === 'generating') localStatus.value = 'Preparing your next passage…';
});
const offset = ref(0);
const position = ref(0);
const ranges = ref([]);
const storageNotice = ref('');
const key = computed(() => progressKey(tenant.value?.id, props.document.id));
const chapters = computed(() => chapterHeadings(text.value));
const currentChapter = computed(() => chapters.value.filter(item => item.offset <= offset.value).at(-1));
const currentPage = computed(() => [...pages.value].filter(item => item.offset <= offset.value).sort((a, b) => a.offset - b.offset).at(-1));
const totalTime = computed(() => durationLabel(estimatedMinutes(text.value, Number(rate.value))));
const remainingTime = computed(() => durationLabel(estimatedMinutes(text.value.slice(offset.value), Number(rate.value))));
const progress = computed(() => text.value.length ? Math.round(offset.value / text.value.length * 100) : 0);
const startChoice = ref('beginning');
const pageInput = ref('');
const selectedOffset = computed(() => {
  if (startChoice.value === 'page') return pages.value.find(page => page.number === Number(pageInput.value))?.offset ?? null;
  if (startChoice.value === 'beginning') return 0;
  const chapter = chapters.value[Number(startChoice.value.replace('chapter-', ''))];
  return chapter?.offset ?? null;
});
const startPreview = computed(() => selectedOffset.value === null ? '' : text.value.slice(selectedOffset.value, selectedOffset.value + 260));
const sleepChoice = ref('0');
const sleepDeadline = ref(0);
const clock = ref(Date.now());
const sleepRemaining = computed(() => Math.max(0, Math.ceil((sleepDeadline.value - clock.value) / 60000)));
const optionsOpen = ref(!gender.value);
let audioContext, source, finishSource, utterance, interval;
let loadedKey = '';
let generation = 0;
let segments = [];
let devicePart = 0;

function remember(finished = state.value === 'finished') {
  if (!text.value) return;
  if (!saveProgress(localStorage, loadedKey || key.value, text.value, offset.value, finished)) storageNotice.value = 'Your browser could not save your place. Keep this page open to continue listening.';
}
function halt() {
  generation++;
  if (source) { source.onended = null; source.stop(); source = null; }
  finishSource?.(); finishSource = null;
  if (active.value) local.dispose();
  if (supported) synth.cancel();
  utterance = null;
  localStatus.value = '';
  remember();
  state.value = offset.value >= text.value.length && text.value ? 'finished' : 'idle';
}
function stop() { halt(); sleepChoice.value = '0'; sleepDeadline.value = 0; }
function moveTo(value) {
  halt();
  position.value = passageAt(ranges.value, value);
  offset.value = ranges.value[position.value]?.offset || 0;
  state.value = 'idle';
  notice.value = '';
  remember(false);
}
function skip(direction) {
  const wasPlaying = state.value === 'playing' || state.value === 'generating';
  const target = Math.max(0, Math.min(ranges.value.length - 1, position.value + direction));
  moveTo(ranges.value[target]?.offset || 0);
  if (wasPlaying) play();
}
function chooseStart() { if (selectedOffset.value !== null) moveTo(selectedOffset.value); }
function finished() {
  offset.value = text.value.length;
  position.value = ranges.value.length;
  state.value = 'finished';
  localStatus.value = '';
  sleepChoice.value = '0'; sleepDeadline.value = 0;
  remember(true);
}
function timerExpired() {
  clock.value = Date.now();
  if (sleepDeadline.value && clock.value >= sleepDeadline.value) {
    halt();
    sleepChoice.value = '0'; sleepDeadline.value = 0;
    notice.value = 'Sleep timer ended. Your place is saved.';
    return true;
  }
  return false;
}
watch(sleepChoice, value => {
  clock.value = Date.now();
  sleepDeadline.value = Number(value) ? clock.value + Number(value) * 60000 : 0;
});
function prepareSegments() {
  parsePronunciations(pronunciationText.value);
  segments = ranges.value;
  position.value = passageAt(ranges.value, offset.value);
  offset.value = ranges.value[position.value]?.offset || 0;
  devicePart = 0;
}
function spokenFor(index) { return narrationSegments(segments[index].original, pronunciationText.value, locale.value).map(item => item.spoken).join(' '); }
function speakNext(token) {
  if (token !== generation || timerExpired()) return;
  if (position.value >= segments.length) { finished(); return; }
  const segment = segments[position.value];
  const parts = splitSpeech(spokenFor(position.value));
  if (!parts.length) { position.value++; devicePart = 0; speakNext(token); return; }
  offset.value = segment.offset;
  remember(false);
  utterance = new SpeechSynthesisUtterance(parts[devicePart]);
  const chosen = matchedVoice.value.voice;
  if (chosen) { utterance.voice = chosen; utterance.lang = chosen.lang; }
  utterance.rate = Number(rate.value);
  utterance.onend = () => {
    if (token !== generation) return;
    if (++devicePart >= parts.length) { position.value++; devicePart = 0; }
    speakNext(token);
  };
  utterance.onerror = event => {
    if (token !== generation) return;
    halt();
    error.value = `Could not play audio (${event.error}). Try another voice or browser.`;
  };
  synth.speak(utterance);
}
async function playLocal(token) {
  state.value = 'generating';
  localStatus.value = 'Loading local voice. The first download can take a few minutes.';
  try {
    audioContext ||= new AudioContext({ sampleRate: 24000 });
    await audioContext.resume();
    if (token !== generation) return;
    const voice = selectedLocalVoice.value.id;
    const speed = Number(rate.value);
    const get = index => local.samples(spokenFor(index), voice, speed).then(samples => ({ samples }), failure => ({ failure }));
    let next = segments.length ? get(position.value) : null;
    for (let index = position.value; index < segments.length; index++) {
      const { samples, failure } = await next;
      if (token !== generation || timerExpired()) return;
      if (failure) throw failure;
      position.value = index;
      offset.value = segments[index].offset;
      remember(false);
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
      finishSource = null; source = null;
      position.value = index + 1;
      offset.value = segments[index + 1]?.offset ?? text.value.length;
      remember(index + 1 === segments.length);
      if (index + 1 < segments.length && state.value !== 'paused') state.value = 'generating';
    }
    finished();
  } catch (failure) {
    if (token !== generation) return;
    halt();
    error.value = `Local narration could not play: ${failure.message}. Retry or select device voices.`;
  }
}
async function play() {
  error.value = ''; notice.value = '';
  if (state.value === 'playing' || state.value === 'generating' || timerExpired() || !readyVoice.value || loading.value) return;
  if (!gender.value) { optionsOpen.value = true; notice.value = 'Choose your voice preference below to start listening.'; return; }
  if (state.value === 'paused') {
    const token = generation;
    try {
      if (engine.value === 'local') await audioContext.resume(); else synth.resume();
      if (token === generation) state.value = 'playing';
    } catch (failure) { error.value = failure.message; }
    return;
  }
  if (state.value === 'finished') moveTo(0);
  halt();
  try { prepareSegments(); } catch (failure) { error.value = failure.message; return; }
  const token = generation;
  if (engine.value === 'local') { playLocal(token); return; }
  synth.resume(); state.value = 'playing'; speakNext(token);
}
function pause() {
  if (!active.value) return;
  state.value = 'paused';
  remember(false);
  if (engine.value === 'local') audioContext?.suspend().catch(failure => { error.value = failure.message; });
  else synth.pause();
}
function refreshVoices() { voices.value = synth.getVoices(); }
function rebuildRanges() {
  const cuts = [...new Set([0, ...pages.value.map(page => page.offset), ...chapters.value.map(chapter => chapter.offset), text.value.length])].sort((a, b) => a - b);
  ranges.value = cuts.slice(0, -1).flatMap((start, index) => passageRanges(text.value.slice(start, cuts[index + 1]), engine.value === 'local' ? 1200 : 220).map(range => ({ ...range, offset: range.offset + start, end: range.end + start })));
  position.value = passageAt(ranges.value, offset.value);
}
watch([engine, locale, gender, rate, pronunciationText], () => {
  halt(); rebuildRanges();
  try {
    parsePronunciations(pronunciationText.value); pronunciationError.value = '';
    localStorage.setItem('read2listen.pronunciations', pronunciationText.value);
    localStorage.setItem('read2listen.voice', JSON.stringify({ locale: locale.value, gender: gender.value }));
    localStorage.setItem('read2listen.playback', JSON.stringify({ engine: engine.value, rate: Number(rate.value) }));
  } catch (failure) { pronunciationError.value = failure.message; }
});
async function clearAudio() {
  halt();
  try { await local.clearCache(); localStatus.value = 'Saved narration cleared from this device.'; }
  catch { error.value = 'Could not clear saved narration. Try clearing this site’s browser storage.'; }
}
const { load: prepare, original, preparing: loading, preparationNotice, preparationError, canRetry } = usePreparedDocument((result, reading) => {
  halt();
  loadedKey = key.value;
  text.value = result; pages.value = reading?.pages || [];
  const saved = restoreProgress(localStorage, key.value, result);
  offset.value = saved?.offset || 0;
  rebuildRanges();
  state.value = saved?.finished ? 'finished' : 'idle';
  if (navigator.mediaSession && window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({ title: props.document.name, artist: 'read2listen' });
});
watch(() => props.document.id, () => {
  stop(); text.value = ''; ranges.value = []; offset.value = 0; position.value = 0;
  error.value = ''; pages.value = []; startChoice.value = 'beginning'; pageInput.value = '';
  prepare(props.document);
}, { immediate: true });
function retryPreparation() { halt(); prepare(props.document, true); }
function useOriginal() { halt(); original(); }
function onVisibility() { timerExpired(); remember(); }
const mediaActions = { play, pause, stop, previoustrack: () => skip(-1), nexttrack: () => skip(1) };
watch(state, value => { if (navigator.mediaSession) navigator.mediaSession.playbackState = value === 'playing' ? 'playing' : value === 'paused' ? 'paused' : 'none'; });
onMounted(() => {
  if (supported) { refreshVoices(); synth.addEventListener('voiceschanged', refreshVoices); }
  interval = setInterval(timerExpired, 1000);
  window.addEventListener('pagehide', onVisibility);
  document.addEventListener('visibilitychange', onVisibility);
  if (navigator.mediaSession) for (const [action, handler] of Object.entries(mediaActions)) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
  }
});
onBeforeUnmount(() => {
  stop(); clearInterval(interval); local.dispose(); audioContext?.close();
  synth?.removeEventListener('voiceschanged', refreshVoices);
  window.removeEventListener('pagehide', onVisibility);
  document.removeEventListener('visibilitychange', onVisibility);
  if (navigator.mediaSession) {
    for (const action of Object.keys(mediaActions)) { try { navigator.mediaSession.setActionHandler(action, null); } catch {} }
    navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none';
  }
});
</script>

<template>
  <section class="document-reader" aria-label="Listen to a book or article">
    <p v-if="loading" role="status">Getting your reading ready…</p>
    <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
    <p v-if="preparationError" class="error-banner" role="alert">{{ preparationError }}</p>
    <div v-if="loading || preparationError" class="preparation-actions">
      <button v-if="!loading && canRetry" @click="retryPreparation">Try again</button>
      <button @click="useOriginal">Listen in the original order</button>
    </div>
    <template v-if="text">
      <div class="listening-summary">
        <p class="duration">About {{ totalTime }} of listening <span>at {{ rate }}×</span></p>
        <p v-if="state === 'finished'">You’ve finished this read.</p>
        <p v-else-if="offset > 0">{{ progress }}% complete · About {{ remainingTime }} left</p>
        <p v-if="currentChapter || currentPage" class="voice-note">{{ currentChapter?.title }}{{ currentChapter && currentPage ? ' · ' : '' }}{{ currentPage ? `PDF page ${currentPage.number}` : '' }}</p>
      </div>
      <div class="reader-controls" aria-label="Playback controls">
        <button :disabled="!ranges.length || position === 0 || loading" @click="skip(-1)" aria-label="Previous passage">↶ Back</button>
        <button v-if="state !== 'playing' && state !== 'generating'" class="primary start-listening" :disabled="!readyVoice || loading || !!pronunciationError" @click="play">{{ state === 'paused' ? 'Resume listening' : state === 'finished' ? 'Listen again' : offset > 0 ? 'Continue listening' : 'Start listening' }}</button>
        <button v-else class="primary start-listening" @click="pause">Pause</button>
        <button :disabled="!ranges.length || position >= ranges.length - 1 || loading" @click="skip(1)" aria-label="Next passage">Forward ↷</button>
        <button v-if="active" @click="stop">Stop</button>
      </div>
      <progress :value="offset" :max="text.length" aria-label="Listening progress"></progress>
      <p role="status">{{ state === 'finished' ? 'Finished listening' : state === 'paused' ? 'Paused — your place is saved' : state === 'generating' ? 'Preparing audio…' : state === 'playing' ? `Listening to passage ${position + 1} of ${ranges.length}` : offset > 0 ? 'Your place is saved. Continue when you’re ready.' : 'Ready when you are.' }}</p>
      <p v-if="localStatus" class="voice-note" role="status">{{ localStatus }}</p>
      <p v-if="notice" class="voice-note" role="status">{{ notice }}</p>
      <p v-if="storageNotice" class="voice-note" role="status">{{ storageNotice }}</p>
      <p v-else class="voice-note">Your place is saved on this browser at the current passage.</p>
      <div class="quick-controls">
        <div>
          <label for="reader-speed">Speed</label>
          <select id="reader-speed" v-model="rate" :disabled="active">
            <option v-for="speed in [0.5, 0.75, 1, 1.25, 1.5, 2]" :key="speed" :value="speed">{{ speed }}×</option>
          </select>
        </div>
        <div>
          <label for="sleep-timer">Sleep timer</label>
          <select id="sleep-timer" v-model="sleepChoice">
            <option value="0">Off</option>
            <option v-for="minutes in [5, 15, 30, 60]" :key="minutes" :value="String(minutes)">{{ minutes }} minutes</option>
          </select>
        </div>
      </div>
      <p v-if="sleepDeadline" class="voice-note" role="status">Stops in about {{ sleepRemaining }} min.</p>
      <details class="start-location">
        <summary>Choose where to start</summary>
        <label for="start-location">Starting point</label>
        <select id="start-location" v-model="startChoice">
          <option value="beginning">Beginning</option>
          <option v-for="(chapter, index) in chapters" :key="chapter.offset" :value="`chapter-${index}`">{{ chapter.title }}</option>
          <option v-if="pages.length" value="page">A PDF page</option>
        </select>
        <p v-if="!chapters.length" class="voice-note">No chapter headings detected. {{ pages.length ? 'You can choose a PDF page below.' : 'Use Back and Forward to move between passages.' }}</p>
        <template v-if="startChoice === 'page'">
          <label for="start-page">PDF page number</label>
          <input id="start-page" v-model="pageInput" type="number" min="1" :max="Math.max(...pages.map(page => page.number))" step="1" placeholder="e.g. 12" />
          <p class="voice-note">Use the page number in the PDF file. Printed book page numbers may differ. Pages without readable text cannot be selected.</p>
          <p v-if="selectedOffset === null" role="status">Enter a PDF page with readable text.</p>
        </template>
        <p v-else-if="chapters.length" class="voice-note">Chapters are detected from headings. Check the preview before starting.</p>
        <blockquote v-if="startPreview" class="start-preview">{{ startPreview }}{{ startPreview.length === 260 ? '…' : '' }}</blockquote>
        <button :disabled="selectedOffset === null || loading" @click="chooseStart">Use this starting point</button>
      </details>
      <p v-if="active" class="reader-passage">{{ ranges[position]?.original }}</p>
      <details class="voice-settings" :open="optionsOpen" @toggle="optionsOpen = $event.target.open">
        <summary>Voice and pronunciation</summary>
        <p v-if="!gender" class="voice-note">Choose a voice preference once. We’ll remember it for your next read.</p>
        <p v-if="!supported && engine === 'device'" class="voice-note">Device voices are unavailable. Choose a local voice or try another browser.</p>
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
      <button v-if="engine === 'local'" :disabled="active" @click="clearAudio">Clear saved narration</button>
      </details>
      <details v-if="preparationNotice" class="preparation-details">
        <summary>Reading order</summary>
        <p class="voice-note">{{ preparationNotice }}</p>
        <button v-if="canRetry" @click="retryPreparation">Retry preparation</button>
        <button @click="useOriginal">Use original reading order</button>
      </details>
    </template>
    <details v-if="text" class="reader-text"><summary>Read along</summary><article aria-label="Book or article text"><pre>{{ text }}</pre></article></details>
  </section>
</template>

<style scoped>
.listening-summary .duration { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
.duration span { color: var(--muted); font-size: 14px; font-weight: 400; }
.start-listening { min-height: 48px; padding: 12px 24px; font-size: 17px; }
.quick-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
summary { cursor: pointer; font-weight: 600; padding: 12px 0; }
.start-location, .voice-settings, .preparation-details { border-top: 1px solid var(--border); margin-top: 16px; }
.start-preview { margin: 12px 0; padding: 14px; background: var(--accent-soft); border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }

textarea { box-sizing: border-box; width: 100%; margin-top: 8px; }
.pronunciations { margin: 16px 0; }
.voice-preferences { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
.voice-note { color: var(--muted); font-size: 13px; }
.preparation-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.document-reader h3 { margin-top: 0; }
select, progress { width: 100%; margin: 4px 0 12px; }
.reader-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0; }
.reader-passage { padding: 12px; background: #eef5ff; color: #172338; border-radius: 8px; }
.reader-text { border-top: 1px solid var(--border); margin-top: 28px; padding-top: 28px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 20px/1.85 Georgia, serif; margin: 0; }
</style>
