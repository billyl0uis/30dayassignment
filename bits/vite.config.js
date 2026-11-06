import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The vessel body is Jackline's: its profile, section and mass maths are
// imported, not copied, through @jackline (the same way Flacon shares
// Finial's core). Jackline's own imports of React and three must resolve to
// this app's copies, or there would be two of each on the page.
const jackline = fileURLToPath(new URL('../jackline/src', import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: './',
  // The built copy lives in play/ and is committed, so GitHub Pages can serve it as-is.
  build: { outDir: 'play', emptyOutDir: true },
  server: { port: 5195, fs: { allow: ['.', jackline] } },
  resolve: {
    alias: { '@jackline': jackline },
    dedupe: ['react', 'react-dom', 'three'],
  },
})
