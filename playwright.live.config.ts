import { defineConfig } from '@playwright/test';
process.env.FLECTO_E2E_MODE = 'LIVE_CODEX';
export default defineConfig({
  testDir: './tests/e2e-live', fullyParallel: false, workers: 1, retries: 0, repeatEach: 3, forbidOnly: true,
  timeout: 120000, expect: { timeout: 12000 }, outputDir: '.flecto/qa/live-test-results',
  reporter: [['list'], ['json', { outputFile: '.flecto/qa/live-results.json' }]],
  use: { actionTimeout: 15000, trace: 'off', screenshot: 'only-on-failure' },
});
