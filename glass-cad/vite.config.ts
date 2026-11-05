/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5191, strictPort: true },
  build: {
    rolldownOptions: {
      // GitHub Pages runs Jekyll, which drops files whose names start with "_".
      output: { chunkFileNames: (chunk) => `assets/${chunk.name.replace(/^_+/, '')}-[hash].js` },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
