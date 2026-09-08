<script setup>
import { ref } from 'vue';
import { useDocuments } from '../composables/useDocuments.js';
import AppIcon from './AppIcon.vue';
const props = defineProps({ compact: Boolean });
const emit = defineEmits(['uploaded']);
const { create } = useDocuments();
const picker = ref(null);
const busy = ref(false);
const error = ref('');
const filename = ref('');
const over = ref(false);
async function upload(files) {
  over.value = false;
  if (busy.value || !files?.length) return;
  error.value = '';
  if (files.length > 1) { error.value = 'Choose one book or article at a time. You can add another after this upload.'; return; }
  const file = files[0];
  if (!/\.(pdf|txt|md|markdown|csv|tsv|json|log)$/i.test(file.name)) {
    error.value = 'Choose a PDF or text file. For EPUB or Word books, export a PDF first.'; return;
  }
  if (!file.size) { error.value = 'This file is empty. Please choose another copy.'; return; }
  busy.value = true; filename.value = file.name;
  try { const doc = await create({ file, refresh: false }); emit('uploaded', doc); }
  catch (failure) { error.value = failure.message || 'The upload didn’t finish. Please try again.'; }
  finally { busy.value = false; }
}
function pick(event) { upload(event.target.files); event.target.value = ''; }
</script>
<template>
  <div class="upload-book" :class="{ compact, over, busy }" @dragover.prevent="over = !busy" @dragleave.prevent="over = false" @drop.prevent="upload($event.dataTransfer.files)">
    <input ref="picker" type="file" accept=".pdf,.txt,.md,.markdown,.csv,.tsv,.json,.log" class="file-picker" aria-label="Choose a book or article to upload" @change="pick" :disabled="busy" />
    <template v-if="!compact">
      <div class="upload-symbol"><AppIcon name="upload" :size="28" /></div>
      <h2>{{ busy ? 'Making room for your next read…' : 'A book you’ve been meaning to read?' }}</h2>
      <p>{{ busy ? filename : 'Drop it here. We’ll turn your reading time into listening time.' }}</p>
    </template>
    <button class="primary upload-trigger" :disabled="busy" @click="picker.click()"><span v-if="busy" class="spinner"></span><AppIcon v-else name="plus" :size="20" />{{ busy ? 'Uploading…' : compact ? 'Upload a book' : 'Choose a book or article' }}</button>
    <span v-if="!compact" class="upload-formats">PDF, TXT or Markdown · No details to fill in</span>
    <p v-if="busy" role="status" class="upload-message">Uploading{{ compact ? ` ${filename}` : '' }}. Your player opens next.</p>
    <p v-if="error" role="alert" class="error-banner">{{ error }}</p>
  </div>
</template>
<style scoped>
.upload-book { border: 2px dashed #cbd6bd; border-radius: 22px; padding: 42px 28px; text-align: center; background: #f7faef; transition: background .2s; }.upload-book.over { background: #e5f2cc; border-color: var(--accent); }
.file-picker { display: none; }.upload-symbol { margin: 0 auto 18px; background: #e7f0d6; border-radius: 20px; width: 62px; height: 62px; display: grid; place-items: center; color: var(--accent); }
h2 { font-size: 23px; margin: 0 0 10px; letter-spacing: -.6px; }p { color: var(--muted); font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }.upload-trigger { display: inline-flex; justify-content: center; align-items: center; gap: 8px; min-height: 46px; font-weight: 700; }.upload-formats { display: block; color: var(--muted); font-size: 12px; margin-top: 16px; }.compact { padding: 0; border: 0; background: transparent; text-align: left; }.compact .error-banner,.compact .upload-message { max-width: 290px; font-size: 12px; }.spinner { width: 17px; height: 17px; border: 2px solid #ffffff66; border-top-color: white; border-radius: 50%; animation: spin .8s linear infinite; }@keyframes spin { to { transform: rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .spinner { animation: none; } }
</style>
