// Browser tests: serve jbrowse-web + the built plugin and drive them in headless
// Chromium against the live HumanMine web service. Needs `npm run build` first.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.e2e.test.ts'],
    testTimeout: 400_000,
    hookTimeout: 300_000,
  },
})
