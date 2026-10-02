import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Caddy serves the built viewer below /preview/. Keep the local Vite dev
  // server at / so its standalone diagnostic URLs remain unchanged.
  base: command === 'build' ? '/preview/' : '/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
}));
