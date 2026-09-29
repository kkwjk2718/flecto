import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@flecto/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
      '@flecto/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@flecto/templates': fileURLToPath(new URL('./packages/templates/src/index.tsx', import.meta.url)),
      '@flecto/design-tokens': fileURLToPath(new URL('./packages/design-tokens/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
    pool: 'forks',
    maxWorkers: 2,
    allowOnly: false,
    passWithNoTests: false,
  },
});
