<script setup>
import { ref, onMounted } from 'vue';
import { useDocuments } from '../composables/useDocuments.js';

const emit = defineEmits(['create', 'cancel']);

const { documents, load } = useDocuments();
const title = ref('');
const selected = ref([]);

onMounted(load);

function submit() {
  emit('create', { title: title.value, documentIds: selected.value });
}
</script>

<template>
  <form class="new-chat-form panel" @submit.prevent="submit">
    <label>Title (optional)</label>
    <input v-model="title" placeholder="e.g. Handbook questions" />

    <label>Documents for this chat</label>
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
