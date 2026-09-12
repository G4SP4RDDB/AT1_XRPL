/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Integration tests hit the custom hackathon Devnet and the chain shim. Run with `npm run test:integration`.
// They are kept out of `npm test` on purpose: they need network, the root `.env` seeds and a few minutes.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['integration/**/*.itest.ts'],
    globalSetup: ['./integration/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 300_000,
    reporters: ['verbose'],
  },
})
