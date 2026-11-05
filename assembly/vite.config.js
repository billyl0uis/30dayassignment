import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // relative asset paths, so the build works from any folder or host
  server: { port: 5201, strictPort: true },
})
