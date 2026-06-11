import { defineConfig } from 'vite';

export default defineConfig({
  // Tell Vite about both HTML entry points
  build: {
    rollupOptions: {
      input: {
        main:  'index.html',
        track: 'track.html',
      },
    },
  },
  // In dev mode, proxy /api/* calls to the Node server so CORS is never an issue
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
