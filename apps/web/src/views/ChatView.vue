<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useChats } from '../composables/useChats.js';
import { useChat } from '../composables/useChat.js';
import { useDocuments } from '../composables/useDocuments.js';
import ChatSidebar from '../components/ChatSidebar.vue';
import MessageList from '../components/MessageList.vue';
import MessageInput from '../components/MessageInput.vue';

const route = useRoute();
const router = useRouter();

const chatsStore = useChats();
const { chat, sending, error, streamingReply, load, send, addDocuments } = useChat();
const { documents, load: loadDocuments } = useDocuments();

const showAttach = ref(false);
const attachSelection = ref([]);

const activeChatId = computed(() => route.params.chatId || null);

const attachedDocs = computed(() =>
  (chat.value?.documentIds || [])
    .map((id) => documents.value.find((d) => d.id === id))
    .filter(Boolean)
);

const attachableDocs = computed(() =>
  documents.value.filter((d) => !(chat.value?.documentIds || []).includes(d.id))
);

onMounted(async () => {
  await Promise.all([chatsStore.load(), loadDocuments()]);
  if (activeChatId.value) await load(activeChatId.value);
});

watch(activeChatId, async (chatId) => {
  if (chatId) await load(chatId);
  else chat.value = null;
});

async function createChat(payload) {
  const created = await chatsStore.create(payload);
  router.push(`/chats/${created.id}`);
}

async function removeChat(chatId) {
  await chatsStore.remove(chatId);
  if (chatId === activeChatId.value) router.push('/');
}

async function attach() {
  await addDocuments(attachSelection.value);
  attachSelection.value = [];
  showAttach.value = false;
}

async function onSend(content) {
  await send(content);
  // Sending bumps the chat's updatedAt ordering; keep the sidebar fresh.
  chatsStore.load();
}
</script>

<template>
  <div class="chat-layout">
    <ChatSidebar
      :chats="chatsStore.chats.value"
      :active-chat-id="activeChatId"
      @select="(id) => router.push(`/chats/${id}`)"
      @create="createChat"
      @remove="removeChat"
    />

    <section class="chat-main" v-if="chat">
      <header class="chat-header">
        <h2>{{ chat.title }}</h2>
        <span v-for="doc in attachedDocs" :key="doc.id" class="doc-chip">
          {{ doc.name }}
        </span>
        <div class="attach-panel" v-if="attachableDocs.length > 0">
          <button @click="showAttach = !showAttach">+ Add documents</button>
          <div v-if="showAttach" class="attach-menu panel">
            <div v-for="doc in attachableDocs" :key="doc.id" class="doc-option">
              <input type="checkbox" :id="`attach-${doc.id}`" :value="doc.id" v-model="attachSelection" />
              <label :for="`attach-${doc.id}`">{{ doc.name }} (v{{ doc.version }})</label>
            </div>
            <button class="primary" :disabled="attachSelection.length === 0" @click="attach">
              Attach
            </button>
          </div>
        </div>
      </header>

      <div v-if="error" class="error-banner">{{ error }}</div>

      <MessageList :messages="chat.messages" :sending="sending" :streaming-reply="streamingReply" />
      <MessageInput :disabled="sending" @send="onSend" />
    </section>

    <section class="chat-main" v-else>
      <div class="empty-state" style="margin: auto">
        Select a chat or start a new one to talk to your documents.
      </div>
    </section>
  </div>
</template>
