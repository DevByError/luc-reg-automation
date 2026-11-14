import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { portalBackend } from './server/plugin';

// The portal only listens on this computer (127.0.0.1), never on the network.
export default defineConfig({
  plugins: [react(), portalBackend()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    cors: false,
    watch: { ignored: ['**/students/**', '**/site-check/**', '**/logs/**'] },
  },
  preview: { host: '127.0.0.1', port: 4173, cors: false },
});
