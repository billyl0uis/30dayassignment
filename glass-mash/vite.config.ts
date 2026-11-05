import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5180, strictPort: true },
  // The built copy lives in play/ and is committed, so GitHub Pages can serve it as-is.
  build: { outDir: 'play', emptyOutDir: true },
});
