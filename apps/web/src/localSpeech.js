const CACHE = 'read2listen-audio-v1';
const MAX_CACHE_BYTES = 128 * 1024 * 1024;

export class LocalSpeech {
  constructor(onProgress) {
    this.worker = null;
    this.pending = new Map();
    this.nextId = 0;
    this.onProgress = onProgress;
    this.cacheEpoch = 0;
    this.runEpoch = 0;
  }
  startWorker() {
    if (this.worker) return;
    this.worker = new Worker(new URL('./localSpeech.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      if (data.progress) { this.onProgress?.(data.progress); return; }
      const request = this.pending.get(data.id);
      if (!request) return;
      this.pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.samples);
    };
    this.worker.onerror = () => this.dispose(new Error('Could not start local speech. Try device voices or a current browser.'));
  }
  async samples(text, voice, speed) {
    const epoch = this.cacheEpoch;
    const run = this.runEpoch;
    let cache, key;
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(['kokoro-v1-q8', text, voice, speed]));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      key = new URL(`/__local_audio__/${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`, location.origin).href;
      cache = await caches.open(CACHE);
      const hit = await cache.match(key);
      if (hit) return new Float32Array(await hit.arrayBuffer());
    } catch { /* Storage may be unavailable; inference still works. */ }
    if (run !== this.runEpoch) throw new Error('Local speech stopped.');
    this.startWorker();
    const samples = await new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, text, voice, speed });
    });
    if (cache && epoch === this.cacheEpoch && samples.byteLength <= MAX_CACHE_BYTES) {
      try {
        await cache.put(key, new Response(samples.buffer, { headers: { 'Content-Length': String(samples.byteLength) } }));
        const keys = await cache.keys();
        let size = 0;
        for (const request of keys.reverse()) {
          const response = await cache.match(request);
          size += Number(response.headers.get('Content-Length')) || 0;
          if (size > MAX_CACHE_BYTES) await cache.delete(request);
        }
      } catch { /* Quota failures do not prevent playback. */ }
    }
    return samples;
  }
  async clearCache() { this.cacheEpoch++; if (globalThis.caches) await caches.delete(CACHE); }
  dispose(error = new Error('Local speech stopped.')) {
    this.runEpoch++;
    this.worker?.terminate();
    this.worker = null;
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}
