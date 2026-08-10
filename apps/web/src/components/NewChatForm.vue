<script setup>
import { ref, computed, onMounted } from 'vue';
import { useDocuments } from '../composables/useDocuments.js';

const emit = defineEmits(['create', 'cancel']);

const { documents, load } = useDocuments();
const title = ref('');
const selected = ref([]);

// New chats cover the whole library by default; unchecking narrows scope.
onMounted(async () => {
  await load();
  selected.value = documents.value.map((d) => d._id);
});

const allSelected = computed(
  () => documents.value.length > 0 && selected.value.length === documents.value.length
);

function toggleAll() {
  selected.value = allSelected.value ? [] : documents.value.map((d) => d._id);
}

function submit() {
  emit('create', { title: title.value, documentIds: selected.value });
}
</script>

<template>
  <form class="new-chat-form panel" @submit.prevent="submit">
    <label>Title (optional)</label>
    <input v-model="title" placeholder="e.g. Handbook questions" />

    <div class="doc-picker-head">
      <label>Documents for this chat</label>
      <button
        v-if="documents.length > 0"
        type="button"
        class="link-btn"
        @click="toggleAll"
      >
        {{ allSelected ? 'Clear all' : 'Select all' }}
      </button>
    </div>
    <p class="doc-picker-hint">
      All documents are included by default — uncheck any to narrow this chat.
    </p>

    <div v-if="documents.length === 0" class="empty-state">
      No documents in the library yet.
    </div>
    <div v-for="doc in documents" :key="doc._id" class="doc-option">
      <input type="checkbox" :id="doc._id" :value="doc._id" v-model="selected" />
      <label :for="doc._id">{{ doc.name }} (v{{ doc.version }})</label>
    </div>

    <button class="primary" type="submit">Start chat</button>
    <button type="button" @click="emit('cancel')">Cancel</button>
  </form>
</template>
