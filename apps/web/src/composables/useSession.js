import { reactive } from 'vue';
import { useSettings } from './useSettings.js';

const session = reactive({ authenticated: false, user: null, csrfToken: '', checked: false });
let pending;
export function useSession() {
  const { settings } = useSettings();
  async function refreshSession() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetch(`${settings.apiBase}/api/auth/session`, { credentials: 'include' });
        if (!response.ok) throw new Error('Session check failed');
        const data = await response.json();
        Object.assign(session, { authenticated: !!data.authenticated, user: data.user || null, csrfToken: data.csrfToken || '', checked: true });
        if (session.authenticated) settings.apiKey = '';
      } catch { Object.assign(session, { authenticated: false, user: null, csrfToken: '', checked: true }); }
      return session.authenticated;
    })().finally(() => { pending = null; });
    return pending;
  }
  async function logout() {
    const response = await fetch(`${settings.apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': session.csrfToken } });
    if (!response.ok) throw new Error('Could not sign out. Refresh the page and try again.');
    settings.apiKey = '';
    Object.assign(session, { authenticated: false, user: null, csrfToken: '', checked: true });
  }
  return { session, refreshSession, logout };
}
