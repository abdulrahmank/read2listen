<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useDocuments } from '../composables/useDocuments.js';
import { useTenant } from '../composables/useTenant.js';

const { documents, loading, error, load, create, remove } = useDocuments();
const { isAdmin } = useTenant();

const form = reactive({ name: '', version: '', date: '', use: '' });
const fileInput = ref(null);
const submitting = ref(false);
const formError = ref('');

onMounted(load);

async function submit() {
  const file = fileInput.value?.files?.[0];
  formError.value = '';
  if (!file) {
    formError.value = 'Choose a file to upload.';
    return;
  }

  submitting.value = true;
  try {
    await create({ file, ...form });
    Object.assign(form, { name: '', version: '', date: '', use: '' });
    fileInput.value.value = '';
  } catch (e) {
    formError.value = e.message;
  } finally {
    submitting.value = false;
  }
}

async function removeDocument(doc) {
  if (!window.confirm(`Delete "${doc.name}" (${doc.filename})?`)) return;
  try {
    await remove(doc._id);
  } catch (e) {
    formError.value = e.message;
  }
}
</script>

<template>
  <div class="page">
    <h1>Document library</h1>

    <p v-if="!isAdmin()" class="empty-state" style="text-align: left; padding: 0 0 16px">
      You're using a member key — documents are read-only. Ask a tenant admin
      to add or remove documents.
    </p>

    <form v-if="isAdmin()" class="panel form-grid" @submit.prevent="submit">
      <div class="full">
        <label>File</label>
        <input type="file" ref="fileInput" />
      </div>
      <div>
        <label>Name</label>
        <input v-model="form.name" placeholder="Employee Handbook" required />
      </div>
      <div>
        <label>Version</label>
        <input v-model="form.version" placeholder="1.0" required />
      </div>
      <div>
        <label>Date</label>
        <input v-model="form.date" type="date" required />
      </div>
      <div>
        <label>Use</label>
        <input v-model="form.use" placeholder="What should the assistant use this for?" required />
      </div>
      <div class="full">
        <button class="primary" type="submit" :disabled="submitting">
          {{ submitting ? 'Uploading…' : 'Upload document' }}
        </button>
      </div>
    </form>

    <div v-if="formError" class="error-banner">{{ formError }}</div>
    <div v-if="error" class="error-banner">{{ error }}</div>

    <div class="panel" style="margin-top: 16px">
      <table>
        <thead>
          <tr>
            <th>Name</th><th>File</th><th>Version</th><th>Date</th><th>Use</th>
            <th v-if="isAdmin()"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in documents" :key="doc._id">
            <td>{{ doc.name }}</td>
            <td>{{ doc.filename }}</td>
            <td>{{ doc.version }}</td>
            <td>{{ doc.date }}</td>
            <td>{{ doc.use }}</td>
            <td v-if="isAdmin()">
              <button class="danger" @click="removeDocument(doc)">Delete</button>
            </td>
          </tr>
          <tr v-if="!loading && documents.length === 0">
            <td colspan="6" class="empty-state">No documents uploaded yet.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
