import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const target = process.env.API_URL ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: false },
      '/uploads': { target, changeOrigin: false },
      '/socket.io': { target, ws: true, changeOrigin: false },
    },
  },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 800 },
});
