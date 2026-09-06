import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  worker: { format: 'es' },
  server: {
    // Dev-only: the API runs separately on :3000. In production the server
    // serves this app's build, so everything is same-origin.
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000'
    }
  }
});
