<script setup>
import { ref, computed, onMounted } from 'vue';
import { useDocuments } from '../composables/useDocuments.js';

const emit = defineEmits(['create', 'cancel']);

const { documents, load } = useDocuments();
const title = ref('');

onMounted(load);

const count = computed(() => documents.value.length);
const referenceNote = computed(() => {
  if (count.value === 0) {
    return 'No books or articles in the library yet — the assistant will answer from general knowledge.';
  }
  const noun = count.value === 1 ? 'upload' : 'uploads';
  return `All ${count.value} ${noun} in the library will be referenced.`;
});

// Empty documentIds = the whole library, resolved live at each turn — so the
// chat always reflects the current library, not a snapshot taken now.
function submit() {
  emit('create', { title: title.value, documentIds: [] });
}
</script>

<template>
  <form class="new-chat-form panel" @submit.prevent="submit">
    <label>Title (optional)</label>
    <input v-model="title" placeholder="e.g. Questions about my book" />

    <p class="doc-picker-hint">{{ referenceNote }}</p>

    <button class="primary" type="submit">Start asking</button>
    <button type="button" @click="emit('cancel')">Cancel</button>
  </form>
</template>
