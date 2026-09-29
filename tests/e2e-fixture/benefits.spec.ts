import { test, expect, beginBenefits, fillBenefits, dialog, benefitsRecords, captureAsset } from './fixtures';

test('T01 T09: FLECTO source handlers and full-navigation confirmation reach the original database', async ({ page, activate, system, consoleErrors }) => {
  await beginBenefits(page, activate);
  await fillBenefits(page);
  await expect(page.locator('body > main input[name="orderNumber"]')).toHaveValue('FLECTO-2026-001');
  await expect(page.locator('body > main input[name="consent"]')).toBeChecked();
  expect((await benefitsRecords(system)).count).toBe(0);
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/review\?draft=/);
  await expect(dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true })).toBeVisible();
  await expect(dialog(page)).toContainText('FLECTO-2026-001');
  expect((await benefitsRecords(system)).count).toBe(0);
  await dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true }).click();
  await expect(page).toHaveURL(/\/receipt\//);
  await expect(dialog(page)).toContainText('접수 번호');
  const result = await benefitsRecords(system);
  expect(result.count).toBe(1); expect(result.insertionCount).toBe(1);
  expect(result.records[0]).toMatchObject({ orderNumber: 'FLECTO-2026-001', purchaseDate: '2026-09-01', category: '가전' });
  expect(consoleErrors).toEqual([]);
  await captureAsset(page, '05-flecto-success.png');
  await page.screenshot({ path: '/tmp/flecto-integration-shots/benefits-complete.png' });
});
