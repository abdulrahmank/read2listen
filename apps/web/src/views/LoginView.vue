<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useSettings } from '../composables/useSettings.js';

const { settings } = useSettings();
const route = useRoute();
const loading = ref(true);
const enabled = ref(false);
const error = ref('');
const messages = { google_signin: 'Google sign-in did not complete. Please try again.', unavailable: 'Google sign-in is not available yet.' };
async function loadConfig() {
  loading.value = true;
  error.value = messages[route.query.error] || '';
  try {
    const response = await fetch(`${settings.apiBase}/api/auth/config`, { credentials: 'include' });
    if (!response.ok) throw new Error('Could not connect to the sign-in service.');
    enabled.value = !!(await response.json()).googleEnabled;
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
function signIn() {
  settings.apiKey = '';
  const next = typeof route.query.next === 'string' ? route.query.next : '/';
  window.location.assign(`${settings.apiBase}/api/auth/google?next=${encodeURIComponent(next)}`);
}
onMounted(loadConfig);
</script>

<template>
  <div class="login-page">
    <section class="login-card panel">
      <p class="login-eyebrow">YOUR DOCUMENTS, YOUR PACE</p>
      <h1>A little less screen.<br />A little more listening.</h1>
      <p class="login-description">Sign in to upload articles and PDFs, keep your own library, and listen with a voice that suits you.</p>
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <button class="google-signin" :disabled="loading || !enabled" @click="signIn">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.22c1.89-1.74 2.99-4.3 2.99-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.22-2.51c-.9.6-2.05.96-3.39.96-2.6 0-4.81-1.76-5.6-4.12H3.08v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.08a10 10 0 0 0 0 9.02l3.32-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.92 5.49l3.32 2.59A5.98 5.98 0 0 1 12 5.96Z"/></svg>
        {{ loading ? 'Connecting…' : 'Continue with Google' }}
      </button>
      <p v-if="!loading && !enabled" class="login-note">Google sign-in is not available on this server yet. <button class="text-button" @click="loadConfig">Try again</button></p>
      <p class="login-note">Your library is private to your account. We use your Google name and email to sign you in.</p>
      <router-link class="api-login" to="/settings">Use an API key instead</router-link>
    </section>
  </div>
</template>

<style scoped>
.login-page { min-height: calc(100dvh - 56px); display: grid; place-items: center; padding: 32px 20px; background: radial-gradient(ellipse at top, var(--accent-soft), var(--bg) 65%); }
.login-card { max-width: 520px; padding: 44px; text-align: center; box-shadow: 0 12px 48px #1c27330a; }
.login-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .16em; color: var(--accent); }
h1 { font: 600 36px/1.2 Georgia, serif; margin: 20px 0; }
.login-description { line-height: 1.7; color: var(--muted); margin-bottom: 28px; }
.google-signin { display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; min-height: 44px; font-weight: 500; }
.login-note { color: var(--muted); font-size: 13px; line-height: 1.6; margin: 20px 0; }
.api-login { color: var(--accent); font-size: 13px; }
.text-button { border: 0; padding: 0; color: var(--accent); }
@media(max-width: 540px) { .login-card { padding: 28px 22px; } h1 { font-size: 30px; } }
</style>
