import { ref } from 'vue';
import { useApi } from './useApi.js';

/**
 * The tenant's document library: list, upload (multipart with metadata),
 * delete. Admin-only mutations are enforced server-side; the UI just
 * surfaces the 403 message when a member key tries.
 */
export function useDocuments() {
  const { request, upload } = useApi();
  const documents = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function load() {
    loading.value = true;
    error.value = '';
    try {
      documents.value = (await request('/api/documents')).documents;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function create({ file, name, version, date, use, refresh = true }) {
    const formData = new FormData();
    formData.append('file', file);
    // Metadata is optional — the server defaults anything omitted, and the
    // admin refines details from the document sidebar afterwards.
    for (const [key, value] of Object.entries({ name, version, date, use })) {
      if (value !== undefined && value !== '') formData.append(key, value);
    }
    const data = await upload('/api/documents', formData);
    if (refresh) await load();
    return data.document;
  }

  async function update(documentId, fields) {
    const data = await request(`/api/documents/${documentId}`, {
      method: 'PATCH',
      body: fields
    });
    await load();
    return data.document;
  }

  async function remove(documentId) {
    await request(`/api/documents/${documentId}`, { method: 'DELETE' });
    await load();
  }

  return { documents, loading, error, load, create, update, remove };
}
