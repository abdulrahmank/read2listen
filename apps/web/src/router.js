import { createRouter, createWebHistory } from 'vue-router';
import LoginView from './views/LoginView.vue';
import { useSession } from './composables/useSession.js';
import { useTenant } from './composables/useTenant.js';
import ReaderView from './views/ReaderView.vue';
import ChatView from './views/ChatView.vue';
import DocumentsView from './views/DocumentsView.vue';
import SettingsView from './views/SettingsView.vue';
import { useSettings } from './composables/useSettings.js';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView },
    { path: '/', name: 'reader', component: ReaderView },
    { path: '/reader/:documentId', name: 'reader-document', component: ReaderView },
    { path: '/chats', component: ChatView },
    { path: '/chats/:chatId', component: ChatView, props: true },
    { path: '/documents', component: DocumentsView },
    { path: '/settings', component: SettingsView }
  ]
});

// Session cookies are checked with the API; a cookie's presence alone is not authentication.
router.beforeEach(async (to) => {
  const { settings } = useSettings();
  const { session, refreshSession } = useSession();
  if (!session.checked) await refreshSession();
  if (to.path === '/login' || to.path === '/settings') return;
  if (!session.authenticated && !settings.apiKey) return { path: '/login', query: { next: to.fullPath } };
  const { tenant, refresh } = useTenant();
  if (!tenant.value && !(await refresh())) return { path: '/login', query: { next: to.fullPath } };
});
