import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: 'apps/demo-benefits/.cache',
  test: {
    include: ['tests/unit/benefits*.test.ts'],
    environment: 'node',
    pool: 'forks',
    maxWorkers: 1,
    testTimeout: 10000,
    allowOnly: false,
    passWithNoTests: false,
  },
});
