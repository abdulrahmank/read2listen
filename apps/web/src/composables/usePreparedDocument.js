import { ref, onBeforeUnmount } from 'vue';
import { useApi } from './useApi.js';
import { documentText } from '../documentText.js';

export function usePreparedDocument(onText) {
  const { request } = useApi();
  const preparing = ref(false);
  const preparationNotice = ref('');
  const preparationError = ref('');
  const blocks = ref([]);
  const canRetry = ref(false);
  let controller;
  let timer;
  let version = 0;
  let current;
  function cancel() { version++; controller?.abort(); clearTimeout(timer); preparing.value = false; }
  async function load(doc, retry = false) {
    cancel(); current = doc;
    const token = version;
    controller = new AbortController();
    preparing.value = true;
    preparationError.value = '';
    preparationNotice.value = '';
    blocks.value = [];
    canRetry.value = false;
    const endpoint = `/api/documents/${doc.id}/reader`;
    const started = Date.now();
    const options = { signal: controller.signal };
    const poll = async (initial = false) => {
      try {
        let { reader } = await request(endpoint, initial && retry ? { ...options, method: 'POST', body: { retry: true } } : options);
        if (reader.status === 'idle') ({ reader } = await request(endpoint, { ...options, method: 'POST' }));
        if (token !== version) return;
        if (reader.status === 'ready' || reader.status === 'fallback') {
          const byId = new Map(reader.blocks.map(block => [block.id, block]));
          blocks.value = reader.order.map(id => byId.get(id));
          onText(blocks.value.map((block, i) => {
            const previous = blocks.value[i - 1];
            const sameLine = previous && block.page === previous.page && typeof block.y === 'number' && Math.abs(block.y - previous.y) < 3;
            return (i ? (sameLine ? ' ' : '\n\n') : '') + block.text;
          }).join(''));
          canRetry.value = reader.status === 'fallback';
          preparationNotice.value = reader.notice || 'Reading order prepared. Original wording preserved.';
          preparing.value = false;
        } else if (reader.status === 'error') throw new Error(reader.message);
        else {
          if (Date.now() - started > 660000) throw new Error('Preparation is taking longer than expected. Retry or use the original reading order.');
          timer = setTimeout(() => poll(), 1500);
        }
      } catch (error) {
        if (token !== version || error.name === 'AbortError') return;
        preparing.value = false;
        preparationError.value = error.message;
        canRetry.value = true;
      }
    };
    await poll(true);
  }
  async function original() {
    if (!current) return;
    cancel(); const token = version;
    controller = new AbortController();
    preparing.value = true;
    preparationError.value = '';
    try {
      const bytes = await request(`/api/documents/${current.id}/content`, { binary: true, signal: controller.signal });
      const text = await documentText(bytes, current.filename);
      if (token !== version) return;
      blocks.value = [];
      onText(text);
      preparationNotice.value = 'Using the original extracted reading order.';
      canRetry.value = true;
    } catch (error) {
      if (token === version && error.name !== 'AbortError') preparationError.value = error.message;
    } finally { if (token === version) preparing.value = false; }
  }
  onBeforeUnmount(cancel);
  return { load, original, preparing, preparationNotice, preparationError, blocks, canRetry };
}
