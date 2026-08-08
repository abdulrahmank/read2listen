<script setup>
import { ref } from 'vue';
import NewChatForm from './NewChatForm.vue';

defineProps({
  chats: { type: Array, required: true },
  activeChatId: { type: String, default: null }
});
const emit = defineEmits(['select', 'create', 'remove']);

const showNewChat = ref(false);

function create(payload) {
  showNewChat.value = false;
  emit('create', payload);
}
</script>

<template>
  <aside class="chat-sidebar">
    <button class="primary" @click="showNewChat = !showNewChat">
      {{ showNewChat ? 'Close' : '+ New chat' }}
    </button>

    <NewChatForm v-if="showNewChat" @create="create" @cancel="showNewChat = false" />

    <div class="chat-list">
      <div
        v-for="chat in chats"
        :key="chat._id"
        class="chat-list-item"
        :class="{ active: chat._id === activeChatId }"
        @click="emit('select', chat._id)"
      >
        <span class="title">{{ chat.title }}</span>
        <button class="delete" title="Delete chat" @click.stop="emit('remove', chat._id)">✕</button>
      </div>
      <div v-if="chats.length === 0 && !showNewChat" class="empty-state">
        No chats yet.
      </div>
    </div>
  </aside>
</template>
