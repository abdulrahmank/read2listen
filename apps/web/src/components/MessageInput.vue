<script setup>
import { ref } from 'vue';

const props = defineProps({
  disabled: { type: Boolean, default: false }
});
const emit = defineEmits(['send']);

const draft = ref('');

function submit() {
  const content = draft.value.trim();
  if (!content || props.disabled) return;
  emit('send', content);
  draft.value = '';
}
</script>

<template>
  <form class="composer" @submit.prevent="submit">
    <textarea
      v-model="draft"
      placeholder="Ask about the documents…"
      @keydown.enter.exact.prevent="submit"
    />
    <button class="primary" type="submit" :disabled="disabled || !draft.trim()">
      Send
    </button>
  </form>
</template>
