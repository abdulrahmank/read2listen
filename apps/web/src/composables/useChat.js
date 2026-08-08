import { ref } from 'vue';
import { useApi } from './useApi.js';

/**
 * One open chat session: its messages, sending a turn (optimistic user
 * bubble + pending state while the agent works), and attaching more of the
 * tenant's documents mid-conversation.
 */
export function useChat() {
  const { request } = useApi();
  const chat = ref(null);
  const sending = ref(false);
  const error = ref('');

  async function load(chatId) {
    error.value = '';
    chat.value = null;
    try {
      chat.value = (await request(`/api/chats/${chatId}`)).chat;
    } catch (e) {
      error.value = e.message;
    }
  }

  async function send(content) {
    if (!chat.value || sending.value) return;
    error.value = '';
    sending.value = true;

    // Optimistic: show the user's message immediately; reconcile with the
    // server's authoritative history when the reply lands.
    chat.value.messages.push({
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    });

    try {
      const data = await request(`/api/chats/${chat.value._id}/messages`, {
        method: 'POST',
        body: { content }
      });
      chat.value.messages = data.messages;
    } catch (e) {
      chat.value.messages.pop();
      error.value = e.message;
    } finally {
      sending.value = false;
    }
  }

  async function addDocuments(documentIds) {
    if (!chat.value) return;
    const data = await request(`/api/chats/${chat.value._id}/documents`, {
      method: 'POST',
      body: { documentIds }
    });
    chat.value.documentIds = data.chat.documentIds;
  }

  return { chat, sending, error, load, send, addDocuments };
}
