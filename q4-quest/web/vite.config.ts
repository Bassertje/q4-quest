import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Relative base so every asset works behind Home Assistant Ingress.
  base: './',
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // The frontend shares pure helpers from ../game.
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:8099' },
  },
});
