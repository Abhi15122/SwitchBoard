import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The browser talks to one origin (:5173). These paths are passed through to
// the server, which is http://localhost:4000 unless VITE_API_ORIGIN says otherwise.
const server = process.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': server,
      '/auth': server,
      '/healthz': server,
      '/ws': { target: server, ws: true },
    },
  },
});
