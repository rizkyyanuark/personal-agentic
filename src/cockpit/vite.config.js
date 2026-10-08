import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  publicDir: '../frontend/public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: false,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/client/mount.js', import.meta.url)),
      formats: ['es'],
      fileName: 'cockpit'
    },
    rollupOptions: { external: (id) => id === 'three' || id.startsWith('three/') }
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: process.env.COCKPIT_API_URL || 'http://localhost:18766',
        changeOrigin: true
      }
    }
  },
  preview: { host: '127.0.0.1' }
});
