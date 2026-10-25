// Offline unit tests. Live (network) and e2e (browser) suites have their own configs.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'test/**/*.live.test.ts', 'test/**/*.e2e.test.ts'],
  },
})
