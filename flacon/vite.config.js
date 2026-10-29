import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const core = fileURLToPath(new URL('../finial/src/core', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  // The built copy lives in play/ and is committed, so GitHub Pages can serve it as-is.
  build: { outDir: 'play', emptyOutDir: true },
  server: { port: 5194, fs: { allow: ['.', core] } },
  // The vessel core lives in the Finial (lidded jar) app and is shared, not
  // copied: @core points at it, the same alias Finial uses. Core's own
  // imports of React and three must resolve to this app's copies, or there
  // would be two Reacts on the page.
  resolve: {
    alias: { '@core': core },
    dedupe: ['react', 'react-dom', 'three'],
  },
})
