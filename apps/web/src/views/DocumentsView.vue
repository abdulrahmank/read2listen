<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useDocuments } from '../composables/useDocuments.js';
import { useTenant } from '../composables/useTenant.js';
import FileIcon from '../components/FileIcon.vue';
import BookCover from '../components/BookCover.vue';
import UploadBook from '../components/UploadBook.vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const { documents, loading, error, load, update, remove } = useDocuments();
const { isAdmin } = useTenant();

const actionError = ref('');

const selectedId = ref(null);
const selected = computed(() => documents.value.find((d) => d.id === selectedId.value) || null);

// The sidebar edits a draft; Save PATCHes it. Re-seed whenever the selection
// (or its server state) changes.
const draft = reactive({ name: '', version: '', date: '', use: '' });
const saving = ref(false);
const saved = ref(false);
watch(selected, (doc) => {
  if (doc) Object.assign(draft, { name: doc.name, version: doc.version, date: doc.date, use: doc.use });
  saved.value = false;
});

onMounted(load);

const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

async function uploaded(doc) { documents.value = [doc, ...documents.value.filter(item => item.id !== doc.id)]; await router.push({ name: 'reader-document', params: { documentId: doc.id } }); }

async function saveDetails() {
  if (!selected.value) return;
  actionError.value = '';
  saving.value = true;
  saved.value = false;
  try {
    await update(selected.value.id, { ...draft });
    saved.value = true;
  } catch (e) {
    actionError.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function removeSelected() {
  const doc = selected.value;
  if (!doc || !window.confirm(`Delete "${doc.name}" (${doc.filename})?`)) return;
  actionError.value = '';
  try {
    await remove(doc.id);
    selectedId.value = null;
  } catch (e) {
    actionError.value = e.message;
  }
}
</script>

<template>
  <div class="page wide">
    <p class="eyebrow">GOOD IDEAS BELONG HERE</p>
    <h1>My uploads</h1>
    <p class="library-intro">Your books. Your articles. All ready for a little listening time.</p>

    <p v-if="!isAdmin()" class="empty-state" style="text-align: left; padding: 0 0 16px">
      You're using a member key — uploads are read-only. Ask a tenant admin
      to add or remove uploads.
    </p>

    <div v-if="actionError" class="error-banner">{{ actionError }}</div>
    <div v-if="error" class="error-banner">{{ error }}</div>

    <div class="docs-layout">
      <div class="docs-main">
        <UploadBook v-if="isAdmin()" @uploaded="uploaded" />
        <h2 class="library-count">Your library <span>{{ documents.length }}</span></h2>
        <p v-if="loading" role="status">Loading your reads…</p>
        <div class="doc-grid">
          <article v-for="doc in documents" :key="doc.id" class="doc-card" :class="{ selected: doc.id === selectedId }">
            <router-link class="library-book-link" :to="{ name: 'reader-document', params: { documentId: doc.id } }" :aria-label="`Listen to ${doc.name}`"><BookCover :title="doc.name" compact /><h3>{{ doc.name }}</h3><span>{{ doc.filename.split('.').pop().toUpperCase() }} · {{ formatSize(doc.size) }}</span></router-link>
            <div class="book-actions"><router-link :to="{ name: 'reader-document', params: { documentId: doc.id } }">Listen now →</router-link><button @click="selectedId = doc.id === selectedId ? null : doc.id" :aria-label="`Details for ${doc.name}`">Details</button></div>
          </article>
          <div v-if="!loading && documents.length === 0" class="empty-state" style="grid-column: 1 / -1">
            No uploads yet{{ isAdmin() ? ' — drop a file above to get started.' : '.' }}
          </div>
        </div>
      </div>

      <aside v-if="selected" class="doc-sidebar panel">
        <header>
          <h2>Upload details</h2>
          <button class="close" @click="selectedId = null" aria-label="Close">✕</button>
        </header>

        <div class="doc-sidebar-file">
          <FileIcon :filename="selected.filename" :size="34" />
          <div>
            <div class="doc-file">{{ selected.filename }}</div>
            <div class="doc-meta">{{ formatSize(selected.size) }} · uploaded {{ selected.uploadedAt?.slice(0, 10) }}</div>
          </div>
        </div>

        <router-link :to="{ name: 'reader-document', params: { documentId: selected.id } }">Listen now</router-link>

        <template v-if="isAdmin()">
          <div>
            <label>Name</label>
            <input v-model="draft.name" placeholder="Employee Handbook" />
          </div>
          <div>
            <label>Version</label>
            <input v-model="draft.version" placeholder="1.0" />
          </div>
          <div>
            <label>Date</label>
            <input v-model="draft.date" type="date" />
          </div>
          <div>
            <label>Use</label>
            <textarea
              v-model="draft.use"
              rows="3"
              placeholder="What would you like to ask about this book or article?"
            ></textarea>
          </div>
          <button class="primary" :disabled="saving" @click="saveDetails">
            {{ saving ? 'Saving…' : 'Save details' }}
          </button>
          <span v-if="saved" class="saved-note">Saved ✓</span>
          <button class="danger" @click="removeSelected">Delete upload</button>
        </template>

        <dl v-else class="doc-details">
          <dt>Name</dt><dd>{{ selected.name }}</dd>
          <dt>Version</dt><dd>{{ selected.version }}</dd>
          <dt>Date</dt><dd>{{ selected.date }}</dd>
          <dt>Use</dt><dd>{{ selected.use }}</dd>
        </dl>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.library-intro { color: var(--muted); font-size: 14px; margin: -4px 0 30px; }.docs-layout { gap: 24px; }.doc-grid { grid-template-columns: repeat(auto-fill,minmax(175px,1fr)); gap: 20px; }.library-count { font-size: 20px; margin: 32px 0 18px; }.library-count span { font-size: 12px; background: #ecf2e3; color: var(--accent); padding: 4px 9px; border-radius: 8px; margin-left: 6px; }.doc-card { cursor: default; border-radius: 17px; padding: 15px; gap: 12px; }.library-book-link { text-decoration: none; color: var(--text); }.library-book-link h3 { font-size: 14px; line-height: 1.4; margin: 18px 0 5px; overflow-wrap: anywhere; }.library-book-link > span { font-size: 10px; color: var(--muted); }.book-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; }.book-actions a { font-size: 11px; color: var(--accent); font-weight: 700; text-decoration: none; }.book-actions button { background: none; border: 0; font-size: 10px; padding: 5px; color: var(--muted); }.doc-sidebar { top: 24px; width: 290px; }.doc-sidebar > a { color: var(--accent); }.doc-sidebar input,.doc-sidebar textarea { font-size: 13px; }
@media(max-width:1000px) { .docs-layout { flex-direction: column; }.doc-sidebar { width: 100%; position: static; order: -1; }.docs-main { width: 100%; } }
@media(max-width:460px) { .doc-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }.doc-card { padding: 10px; }.book-actions { gap: 4px; }.book-actions a { font-size: 10px; } }
</style>
