import { createRouter, createWebHistory } from 'vue-router';
import ReaderView from './views/ReaderView.vue';
import ChatView from './views/ChatView.vue';
import DocumentsView from './views/DocumentsView.vue';
import SettingsView from './views/SettingsView.vue';
import { useSettings } from './composables/useSettings.js';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'reader', component: ReaderView },
    { path: '/reader/:documentId', name: 'reader-document', component: ReaderView },
    { path: '/chats', component: ChatView },
    { path: '/chats/:chatId', component: ChatView, props: true },
    { path: '/documents', component: DocumentsView },
    { path: '/settings', component: SettingsView }
  ]
});

// No key configured yet → everything except Settings is unusable.
router.beforeEach((to) => {
  const { settings } = useSettings();
  if (!settings.apiKey && to.path !== '/settings') {
    return '/settings';
  }
});
