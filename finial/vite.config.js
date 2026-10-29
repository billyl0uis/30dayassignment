import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5193 },
  // The vessel core is imported as @core from the app. Inside core, imports
  // stay relative (core/architecture.test.js checks), so core can be lifted
  // into the perfume bottle app as one folder.
  resolve: {
    alias: { '@core': fileURLToPath(new URL('./src/core', import.meta.url)) },
  },
})
