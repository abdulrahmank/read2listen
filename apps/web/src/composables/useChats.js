import { ref } from 'vue';
import { useApi } from './useApi.js';

/**
 * The tenant's chat list (summaries only — messages live in useChat).
 */
export function useChats() {
  const { request } = useApi();
  const chats = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function load() {
    loading.value = true;
    error.value = '';
    try {
      chats.value = (await request('/api/chats')).chats;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function create({ title, documentIds }) {
    const data = await request('/api/chats', {
      method: 'POST',
      body: { title, documentIds }
    });
    await load();
    return data.chat;
  }

  async function remove(chatId) {
    await request(`/api/chats/${chatId}`, { method: 'DELETE' });
    await load();
  }

  return { chats, loading, error, load, create, remove };
}
