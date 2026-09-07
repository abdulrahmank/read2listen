import { KokoroTTS, env } from 'kokoro-js';
import { generateBounded } from './generateLocalSamples.js';
import runtimeModule from '@speech-runtime/ort-wasm-simd-threaded.jsep.mjs?url';
import runtimeWasm from '@speech-runtime/ort-wasm-simd-threaded.jsep.wasm?url';

// Use the runtime shipped with the app instead of the library's CDN default.
env.wasmPaths = { mjs: new URL(runtimeModule, self.location.href).href, wasm: new URL(runtimeWasm, self.location.href).href };

let model;
let queue = Promise.resolve();
let currentRun = 0;
async function load() {
  if (!model) model = KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8', device: 'wasm',
    progress_callback: progress => self.postMessage({ progress })
  }).then(tts => {
    // The upstream generate() truncates long phoneme sequences silently. Detect
    // overflow before inference and split below instead of losing book text.
    const tokenizer = tts.tokenizer;
    tts.tokenizer = (phonemes, options) => {
      const result = tokenizer(phonemes, { ...options, truncation: false });
      if (result.input_ids.dims.at(-1) > 510) throw new RangeError('PHONEME_LIMIT');
      return result;
    };
    return tts;
  }).catch(error => { model = null; throw error; });
  return model;
}


self.onmessage = ({ data: { type, id, text, voice, speed, run } }) => {
  if (type === 'cancel') { currentRun = run; return; }
  currentRun = Math.max(currentRun, run);
  queue = queue.then(async () => {
    try {
      if (run !== currentRun) return;
      const tts = await load();
      if (run !== currentRun) return;
      self.postMessage({ progress: { status: 'synthesizing' } });
      const samples = await generateBounded(tts, text, voice, speed);
      if (run !== currentRun) return;
      self.postMessage({ id, samples }, [samples.buffer]);
    } catch (error) {
      self.postMessage({ id, error: error.message || 'Local speech generation failed.' });
    }
  });
};
