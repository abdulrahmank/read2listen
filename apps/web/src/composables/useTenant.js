import { ref } from 'vue';
import { useApi } from './useApi.js';

const tenant = ref(null);
const role = ref(null);

/**
 * Who the configured key belongs to. Shared module state: the whole app
 * agrees on the current tenant/role, and Settings refreshes it on key change.
 */
export function useTenant() {
  const { request } = useApi();

  async function refresh() {
    try {
      const data = await request('/api/tenant');
      tenant.value = data.tenant;
      role.value = data.role;
    } catch {
      tenant.value = null;
      role.value = null;
    }
    return tenant.value;
  }

  return { tenant, role, refresh, isAdmin: () => role.value === 'admin' };
}
