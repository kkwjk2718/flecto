import { test, expect } from '../e2e-fixture/fixtures';
import { insuranceFlow } from '../e2e-fixture/insurance-driver';
test('LIVE insurance: current public form becomes accessible steps and source receipt', async ({ page, activate, system, consoleErrors }, info) => {
  await insuranceFlow(page, activate, system, info, 'LIVE_CODEX');
  expect(consoleErrors).toEqual([]);
});
