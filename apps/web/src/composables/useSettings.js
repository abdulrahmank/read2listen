import { reactive, watch } from 'vue';

const STORAGE_KEY = 'read2listen.settings';

/**
 * Connection settings, persisted to localStorage. apiBase stays empty when
 * the SPA is served by the chatify server itself (same origin); set it only
 * when hosting the SPA elsewhere.
 */
const settings = reactive({
  apiKey: '',
  apiBase: '',
  ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
});

watch(settings, (value) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
});

export function useSettings() {
  return { settings };
}
