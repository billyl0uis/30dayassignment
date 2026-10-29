import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `npm run build` writes the playable site to play/, which GitHub Pages serves
// as-is, so asset paths are relative.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'play', emptyOutDir: true },
  server: { port: 5181 },
})
