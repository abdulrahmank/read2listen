import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalSpeech } from '../src/localSpeech.js';

test('worker failures reject pending audio and allow retry; cancellation rejects pending generation', async () => {
  const previous = globalThis.Worker;
  const workers = [];
  let notifySent;
  const sent = () => new Promise(resolve => { notifySent = resolve; });
  globalThis.Worker = class {
    constructor() { workers.push(this); }
    postMessage(message) { this.message = message; notifySent(); }
    terminate() { this.terminated = true; }
  };
  const speech = new LocalSpeech();
  try {
    let ready = sent();
    const first = speech.samples('One sentence.', 'af_heart', 1);
    const firstFailed = assert.rejects(first, /Could not start/);
    await ready;
    workers[0].onerror();
    await firstFailed;
    ready = sent();
    const second = speech.samples('Second sentence.', 'am_michael', 1);
    await ready;
    assert.equal(workers.length, 2);
    workers[1].onmessage({ data: { id: workers[1].message.id, samples: new Float32Array([0.2, 0.4]) } });
    assert.equal((await second).length, 2);
    ready = sent();
    const pending = speech.samples('Third sentence.', 'af_heart', 1);
    const cancelled = assert.rejects(pending, /stopped/);
    await ready;
    speech.dispose();
    await cancelled;
    assert.equal(speech.pending.size, 0);
    assert.equal(workers[1].terminated, true);
  } finally { speech.dispose(); globalThis.Worker = previous; }
});
