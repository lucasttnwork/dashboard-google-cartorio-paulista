import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Vitest runs its own Vite instance and needs its own config to avoid
// TypeScript type conflicts between the root Vite 6 and the Vite version
// embedded inside Vitest. Keep Tailwind out of the test config to keep the
// test environment lightweight.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    css: false,
  },
})
