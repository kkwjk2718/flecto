import { test, expect } from './fixtures';
import { insuranceFlow } from './insurance-driver';
test('I01: insurance original handlers, explicit consents and verified receipt save exactly once', async ({ page, activate, system, consoleErrors }, info) => {
  await insuranceFlow(page, activate, system, info, 'FIXTURE');
  expect(consoleErrors).toEqual([]);
});
