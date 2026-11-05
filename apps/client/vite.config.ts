import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
    // Em desenvolvimento, /api vai para a API local (npm run dev:api).
    proxy: { '/api': process.env.API_PROXY ?? 'http://localhost:8787' },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
