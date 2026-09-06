<script setup>
import { ref } from 'vue';
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
  <div class="shell">
    <header class="topbar">
      <router-link to="/" class="brand">read<span>2listen</span></router-link>
      <nav v-if="$route.path !== '/login'">
        <router-link to="/" :class="{ 'router-link-active': $route.name === 'reader-document' }">Reader</router-link>
        <router-link to="/chats">Chats</router-link>
        <router-link to="/documents">Documents</router-link>
        <router-link to="/settings">Settings</router-link>
      </nav>
      <div class="tenant-badge" v-if="tenant && $route.path !== '/login'">
        {{ tenant.name }} · {{ role }}
      </div>
      <button v-if="session.authenticated" @click="signOut">Sign out</button>
    </header>
    <div v-if="logoutError" class="error-banner" role="alert">{{ logoutError }}</div>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>
