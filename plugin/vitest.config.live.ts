// Tests that call the live HumanMine web service through the adapters.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.live.test.ts'],
    testTimeout: 60_000,
  },
})
