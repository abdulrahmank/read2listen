import { KokoroTTS } from 'kokoro-js';
import { generateBounded } from './generateLocalSamples.js';

let model;
let queue = Promise.resolve();
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


self.onmessage = ({ data: { id, text, voice, speed } }) => {
  queue = queue.then(async () => {
    try {
      const tts = await load();
      self.postMessage({ progress: { status: 'synthesizing' } });
      const samples = await generateBounded(tts, text, voice, speed);
      self.postMessage({ id, samples }, [samples.buffer]);
    } catch (error) {
      self.postMessage({ id, error: error.message || 'Local speech generation failed.' });
    }
  });
};
