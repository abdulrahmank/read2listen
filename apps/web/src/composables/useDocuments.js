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

  async function create({ file, name, version, date, use }) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('version', version);
    formData.append('date', date);
    formData.append('use', use);
    await upload('/api/documents', formData);
    await load();
  }

  async function remove(documentId) {
    await request(`/api/documents/${documentId}`, { method: 'DELETE' });
    await load();
  }

  return { documents, loading, error, load, create, remove };
}
