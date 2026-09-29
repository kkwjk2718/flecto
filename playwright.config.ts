import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-fixture',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60000,
  expect: { timeout: 10000 },
  outputDir: '.flecto/qa/test-results',
  reporter: [['list'], ['json', { outputFile: '.flecto/qa/fixture-results.json' }]],
  use: { actionTimeout: 15000, trace: 'off', screenshot: 'only-on-failure' },
});
