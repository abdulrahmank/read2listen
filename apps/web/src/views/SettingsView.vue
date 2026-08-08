<script setup>
import { ref } from 'vue';
import { useSettings } from '../composables/useSettings.js';
import { useTenant } from '../composables/useTenant.js';

const { settings } = useSettings();
const { tenant, role, refresh } = useTenant();

const status = ref('');
const checking = ref(false);

async function verify() {
  checking.value = true;
  status.value = '';
  const found = await refresh();
  status.value = found
    ? `Connected as tenant "${found.name}" (${role.value} key).`
    : 'Could not authenticate with that key — check the key and server address.';
  checking.value = false;
}
</script>

<template>
  <div class="page">
    <h1>Settings</h1>

    <div class="panel form-grid">
      <div class="full">
        <label>API key</label>
        <input
          v-model="settings.apiKey"
          type="password"
          placeholder="Tenant admin or member key (printed by the server on first boot)"
        />
      </div>
      <div class="full">
        <label>Server address (leave empty when this UI is served by chatify itself)</label>
        <input v-model="settings.apiBase" placeholder="https://chatify.example.com" />
      </div>
      <div class="full">
        <button class="primary" @click="verify" :disabled="checking || !settings.apiKey">
          {{ checking ? 'Checking…' : 'Verify connection' }}
        </button>
      </div>
      <div class="full" v-if="status">
        <p :class="tenant ? '' : 'error-banner'" style="margin: 0; font-size: 14px">{{ status }}</p>
      </div>
    </div>
  </div>
</template>
