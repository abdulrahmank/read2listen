<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useDocuments } from '../composables/useDocuments.js';
import { useTenant } from '../composables/useTenant.js';
import FileIcon from '../components/FileIcon.vue';

const { documents, loading, error, load, create, update, remove } = useDocuments();
const { isAdmin } = useTenant();

const picker = ref(null);
const dragOver = ref(0);
const uploadingCount = ref(0);
const actionError = ref('');

const selectedId = ref(null);
const selected = computed(() => documents.value.find((d) => d._id === selectedId.value) || null);

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

async function uploadFiles(files) {
  if (!files.length) return;
  actionError.value = '';
  uploadingCount.value = files.length;
  let lastUploaded = null;
  try {
    for (const file of files) {
      lastUploaded = await create({ file });
      uploadingCount.value -= 1;
    }
    // Open the sidebar on the newest upload so its details get filled in.
    if (lastUploaded) selectedId.value = lastUploaded._id;
  } catch (e) {
    actionError.value = e.message;
  } finally {
    uploadingCount.value = 0;
  }
}

function onDrop(event) {
  dragOver.value = 0;
  if (!isAdmin()) return;
  uploadFiles([...event.dataTransfer.files]);
}

function onPick(event) {
  uploadFiles([...event.target.files]);
  event.target.value = '';
}

async function saveDetails() {
  if (!selected.value) return;
  actionError.value = '';
  saving.value = true;
  saved.value = false;
  try {
    await update(selected.value._id, { ...draft });
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
    await remove(doc._id);
    selectedId.value = null;
  } catch (e) {
    actionError.value = e.message;
  }
}
</script>

<template>
  <div class="page wide">
    <h1>Document library</h1>

    <p v-if="!isAdmin()" class="empty-state" style="text-align: left; padding: 0 0 16px">
      You're using a member key — documents are read-only. Ask a tenant admin
      to add or remove documents.
    </p>

    <div v-if="actionError" class="error-banner">{{ actionError }}</div>
    <div v-if="error" class="error-banner">{{ error }}</div>

    <div class="docs-layout">
      <div class="docs-main">
        <div
          v-if="isAdmin()"
          class="dropzone"
          :class="{ over: dragOver > 0, busy: uploadingCount > 0 }"
          @click="picker.click()"
          @dragenter.prevent="dragOver++"
          @dragover.prevent
          @dragleave.prevent="dragOver--"
          @drop.prevent="onDrop"
        >
          <input type="file" multiple hidden ref="picker" @change="onPick" />
          <template v-if="uploadingCount > 0">
            <strong>Uploading {{ uploadingCount }} file{{ uploadingCount === 1 ? '' : 's' }}…</strong>
          </template>
          <template v-else>
            <svg class="dropzone-icon" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3l5.5 5.5h-3.5V15h-4V8.5H6.5L12 3z" />
              <rect x="4" y="18" width="16" height="3" rx="1.5" />
            </svg>
            <strong>Drop files here</strong>
            <span>or click to browse — details can be filled in after</span>
          </template>
        </div>

        <div class="doc-grid">
          <div
            v-for="doc in documents"
            :key="doc._id"
            class="doc-card"
            :class="{ selected: doc._id === selectedId }"
            @click="selectedId = doc._id === selectedId ? null : doc._id"
          >
            <div class="doc-icon"><FileIcon :filename="doc.filename" /></div>
            <div class="doc-title">{{ doc.name }}</div>
            <div class="doc-file">{{ doc.filename }}</div>
            <div class="doc-meta">v{{ doc.version }} · {{ doc.date }}</div>
          </div>
          <div v-if="!loading && documents.length === 0" class="empty-state" style="grid-column: 1 / -1">
            No documents yet{{ isAdmin() ? ' — drop a file above to get started.' : '.' }}
          </div>
        </div>
      </div>

      <aside v-if="selected" class="doc-sidebar panel">
        <header>
          <h2>Document details</h2>
          <button class="close" @click="selectedId = null" aria-label="Close">✕</button>
        </header>

        <div class="doc-sidebar-file">
          <FileIcon :filename="selected.filename" :size="34" />
          <div>
            <div class="doc-file">{{ selected.filename }}</div>
            <div class="doc-meta">{{ formatSize(selected.size) }} · uploaded {{ selected.uploadedAt?.slice(0, 10) }}</div>
          </div>
        </div>

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
              placeholder="What should the assistant use this document for?"
            ></textarea>
          </div>
          <button class="primary" :disabled="saving" @click="saveDetails">
            {{ saving ? 'Saving…' : 'Save details' }}
          </button>
          <span v-if="saved" class="saved-note">Saved ✓</span>
          <button class="danger" @click="removeSelected">Delete document</button>
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
