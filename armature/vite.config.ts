import { defineConfig } from 'vite';

// `npm run build` writes the playable site to play/, which GitHub Pages serves
// as-is, so asset paths are relative.
export default defineConfig({
  base: './',
  build: { outDir: 'play', emptyOutDir: true },
  server: { port: 5214, strictPort: true },
});
