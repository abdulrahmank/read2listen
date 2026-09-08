<script setup>
import { ref } from 'vue';
import AppIcon from './components/AppIcon.vue';
import { useSession } from './composables/useSession.js';
import { useTenant } from './composables/useTenant.js';
const { tenant, role } = useTenant();
const { session, logout } = useSession();
const logoutError = ref('');
async function signOut() {
  try {
    await logout();
    tenant.value = null;
    role.value = null;
    window.speechSynthesis?.cancel();
    window.location.assign('/login');
  } catch (error) { logoutError.value = error.message; }
}
</script>

<template>
  <div class="shell" :class="{ 'login-shell': $route.path === '/login' }">
    <header class="topbar">
      <router-link to="/" class="brand"><span class="brand-mark"><AppIcon name="headphones" :size="23" /></span><span class="brand-word">read<span>2listen</span></span></router-link>
      <nav v-if="$route.path !== '/login'">
        <router-link to="/" :class="{ 'router-link-active': $route.name === 'reader-document' }"><AppIcon name="headphones" />Listen</router-link>
        <router-link to="/chats"><AppIcon name="ask" />Ask</router-link>
        <router-link to="/documents"><AppIcon name="book" />My uploads</router-link>
        <router-link to="/settings"><AppIcon name="settings" />Settings</router-link>
      </nav>
      <div class="sidebar-note" v-if="$route.path !== '/login'"><AppIcon name="spark" :size="25" /><strong>One page at a time.<br />At your own pace.</strong><p>Big ideas fit into little moments.</p></div>
      <div class="tenant-badge" v-if="tenant && $route.path !== '/login'">
        <span class="avatar">{{ (session.user?.name || tenant.name || 'L').slice(0, 1).toUpperCase() }}</span><span>{{ session.user?.name || 'Your listening space' }}<small>Make time for you</small></span>
      </div>
      <button v-if="session.authenticated" @click="signOut">Sign out</button>
    </header>
    <div v-if="logoutError" class="error-banner" role="alert">{{ logoutError }}</div>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>
