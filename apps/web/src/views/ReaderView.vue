<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDocuments } from '../composables/useDocuments.js';
import { useTenant } from '../composables/useTenant.js';
import DocumentReader from '../components/DocumentReader.vue';

const route = useRoute();
const router = useRouter();
const { documents, loading, error, load } = useDocuments();
const { isAdmin } = useTenant();
const selected = computed(() => route.params.documentId
  ? documents.value.find(doc => doc.id === route.params.documentId)
  : documents.value[0]);

function selectDocument(event) {
  router.push({ name: 'reader-document', params: { documentId: event.target.value } });
}
onMounted(load);
</script>

<template>
  <div class="page reader-page">
    <header class="reader-heading">
      <div>
        <h1>Listen to your books and articles</h1>
        <p>Your books and articles, ready to read and listen.</p>
      </div>
      <router-link v-if="isAdmin()" class="reader-upload" to="/documents">Upload a book or article</router-link>
    </header>

    <p v-if="loading" role="status">Loading your library…</p>
    <div v-else-if="error" class="error-banner" role="alert">
      {{ error }} <button @click="load">Try again</button>
    </div>
    <template v-else>
      <div v-if="documents.length" class="reader-selection">
        <label for="reader-document">Choose a book or article</label>
        <select id="reader-document" :value="selected?.id || ''" @change="selectDocument">
          <option v-if="!selected" value="" disabled>Select a book or article</option>
          <option v-for="doc in documents" :key="doc.id" :value="doc.id">{{ doc.name }}</option>
        </select>
      </div>
      <section v-if="selected" class="panel reading-desk">
        <header class="reading-title">
          <h2>{{ selected.name }}</h2>
          <p>{{ selected.filename }}</p>
        </header>
        <DocumentReader :key="selected.id" :document="selected" />
      </section>
      <section v-else-if="route.params.documentId" class="panel empty-state">
        <h2>Upload unavailable</h2>
        <p>This upload may have been removed or belong to another library.</p>
        <router-link to="/">Return to listening</router-link>
      </section>
      <section v-else class="panel empty-state">
        <h2>Your next read starts here</h2>
        <p v-if="isAdmin()">Upload a book or article. It will open here, ready for you to press Read aloud.</p>
        <p v-else>Your library is empty. Ask an admin to add a book or article, then come here to listen.</p>
        <router-link v-if="isAdmin()" class="reader-upload" to="/documents">Upload your first book or article</router-link>
      </section>
    </template>
  </div>
</template>

<style scoped>
.reader-page { max-width: 1040px; padding-top: 32px; }
.reader-heading { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 28px; }
.reader-heading h1 { font-size: 30px; margin-bottom: 8px; }
.reader-heading p, .reading-title p { color: var(--muted); margin: 0; }
.reader-upload { display: inline-block; background: var(--accent); color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-size: 14px; }
.reader-selection { max-width: 440px; margin-bottom: 24px; }
.reading-desk { padding: 32px; }
.reading-title { border-bottom: 1px solid var(--border); padding-bottom: 24px; margin-bottom: 24px; overflow-wrap: anywhere; }
.reading-title h2 { font: 600 32px/1.3 Georgia, serif; margin: 0 0 10px; }
@media (max-width: 600px) {
  .reader-heading { align-items: flex-start; flex-direction: column; }
  .reading-desk { padding: 20px 16px; }
  .reading-title h2 { font-size: 26px; }
}
</style>
