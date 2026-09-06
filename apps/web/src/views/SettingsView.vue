<script setup>
import { ref } from 'vue';
import { useSession } from '../composables/useSession.js';
import { useRouter } from 'vue-router';
import { useSettings } from '../composables/useSettings.js';
import { useTenant } from '../composables/useTenant.js';

const { session } = useSession();
const router = useRouter();
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
  if (found) router.push('/');
}
</script>

<template>
  <div class="page">
    <h1>Settings</h1>

    <div v-if="session.authenticated" class="panel" style="padding: 24px">
      <p>Signed in as {{ session.user?.name }} ({{ session.user?.email }}).</p>
      <p>Your private library is connected. No API key is needed.</p>
    </div>
    <template v-else>
    <p><router-link to="/login">Sign in with Google</router-link> or connect using an API key.</p>
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
        <label>Server address (leave empty when this UI is served by read2listen itself)</label>
        <input v-model="settings.apiBase" placeholder="https://read2listen.com" />
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
    </template>
  </div>
</template>
