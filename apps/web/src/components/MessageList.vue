<script setup>
import { ref, watch, nextTick } from 'vue';
import { renderMarkdown } from '../markdown.js';

const props = defineProps({
  messages: { type: Array, required: true },
  sending: { type: Boolean, default: false },
  streamingReply: { type: String, default: '' }
});

const scroller = ref(null);

watch(
  () => [props.messages.length, props.sending, props.streamingReply],
  async () => {
    await nextTick();
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' });
  }
);

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<template>
  <div class="messages" ref="scroller">
    <div v-if="messages.length === 0 && !sending" class="empty-state">
      Ask a question about this chat's documents to get started.
    </div>
    <div
      v-for="(message, index) in messages"
      :key="index"
      class="bubble"
      :class="message.role"
    >
      <div v-if="message.role === 'assistant'" class="md" v-html="renderMarkdown(message.content)"></div>
      <span v-else class="text">{{ message.content }}</span>
      <span class="meta">{{ formatTime(message.timestamp) }}</span>
    </div>
    <div v-if="sending && streamingReply" class="bubble assistant">
      <div class="md" v-html="renderMarkdown(streamingReply)"></div>
    </div>
    <div v-else-if="sending" class="typing">Assistant is reading the documents…</div>
  </div>
</template>
