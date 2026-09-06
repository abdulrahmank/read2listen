<script setup>
import { onMounted } from 'vue';
import { useTenant } from './composables/useTenant.js';
import { useSettings } from './composables/useSettings.js';

const { tenant, role, refresh } = useTenant();
const { settings } = useSettings();

onMounted(() => {
  if (settings.apiKey) refresh();
});
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <router-link to="/" class="brand">read<span>2listen</span></router-link>
      <nav>
        <router-link to="/" :class="{ 'router-link-active': $route.name === 'reader-document' }">Reader</router-link>
        <router-link to="/chats">Chats</router-link>
        <router-link to="/documents">Documents</router-link>
        <router-link to="/settings">Settings</router-link>
      </nav>
      <div class="tenant-badge" v-if="tenant">
        {{ tenant.name }} · {{ role }}
      </div>
    </header>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>
