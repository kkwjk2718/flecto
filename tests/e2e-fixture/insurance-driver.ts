import type { Page, TestInfo } from '@playwright/test';
import { expect, dialog, captureAsset } from './fixtures';
import type { RunningSystem } from '../../scripts/system';

const inputs: Record<string, string> = {
  '보험증권번호': 'INS-2026-001', '청구인 이름': '김하늘', '휴대전화 번호': '01012345678',
  '진료일': '2026-09-01', '의료기관명': '시연의원', '청구 금액': '85000',
  '예금주': '김하늘', '계좌번호': '1002003004',
};
export async function insuranceRecords(system: RunningSystem) {
  const response = await fetch(`http://127.0.0.1:${system.ports.benefits}/__qa/insurance/records`, {
    headers: { 'x-flecto-qa-token': system.credentials.benefitsToken },
  });
  expect(response.ok).toBeTruthy(); return response.json();
}
export async function insuranceFlow(page: Page, activate: (page: Page, autoPrepare?: boolean) => Promise<void>, system: RunningSystem, info: TestInfo, mode: 'FIXTURE' | 'LIVE_CODEX') {
  const origin = `http://127.0.0.1:${system.ports.benefits}`;
  await page.goto(origin + '/login');
  await page.getByLabel('아이디', { exact: true }).fill('demo');
  await page.getByLabel('비밀번호', { exact: true }).fill('flecto2026!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.goto(origin + '/insurance/apply');
  await expect(page.getByRole('heading', { name: '보험금청구', level: 1, exact: true })).toBeVisible();
  await captureAsset(page, '11-insurance-original.png');
  const start = await page.evaluate(() => performance.now());
  await activate(page, true);
  const ui = dialog(page);
  await expect(ui).toHaveAttribute('data-phase', /^(READY|REVIEW)$/, { timeout: 12000 });
  await expect(ui.locator('.fl-footer .fl-btn-primary')).toBeEnabled();
  const controlsReadyMs = await page.evaluate(() => performance.now()) - start;
  expect(await ui.locator('.fl-tech').textContent()).toContain(mode);
  await captureAsset(page, '12-insurance-input.png');
  let gotInput = false, gotChoice = false, gotConsent = false;
  for (let step = 0; step < 12; step++) {
    await expect(ui).toHaveAttribute('data-phase', /^(READY|REVIEW)$/);
    if (await ui.getAttribute('data-phase') === 'REVIEW') break;
    let filled = false;
    for (const [label, value] of Object.entries(inputs)) {
      const control = ui.getByLabel(label, { exact: false });
      if (await control.count() && await control.first().isVisible()) { await control.first().fill(value); filled = true; }
    }
    if (filled && !gotInput) {
      await ui.locator('h1').click();
      await captureAsset(page, '12-insurance-input-filled.png'); gotInput = true;
    }
    const claimType = ui.getByRole('radio', { name: '통원', exact: true });
    if (await claimType.count()) {
      await claimType.click(); await expect(claimType).toBeChecked();
      await captureAsset(page, '13-insurance-choice.png'); gotChoice = true;
    }
    const bank = ui.getByRole('radio', { name: '시연은행', exact: true });
    if (await bank.count()) { await bank.click(); await expect(bank).toBeChecked(); }
    const consents = ui.locator('input[type="checkbox"][data-flecto-ref]');
    for (let i = 0; i < await consents.count(); i++) {
      const consent = consents.nth(i);
      if (!await consent.isChecked()) await consent.click();
      await expect(consent).toBeChecked(); gotConsent = true;
    }
    if (await consents.count()) await captureAsset(page, '14-insurance-consent.png');
    const before = `${await ui.getAttribute('data-phase')}|${await ui.locator('.fl-head').textContent()}`;
    await ui.locator('.fl-footer .fl-btn-primary').click();
    await expect.poll(async () => `${await ui.getAttribute('data-phase')}|${await ui.locator('.fl-head').textContent()}`).not.toBe(before);
  }
  expect(gotInput).toBe(true); expect(gotChoice).toBe(true); expect(gotConsent).toBe(true);
  await expect(ui).toHaveAttribute('data-phase', 'REVIEW');
  await expect(page.locator('main input[name="policyNumber"]')).toHaveValue('INS-2026-001');
  await expect(page.locator('main input[name="accountNumber"]')).toHaveValue('1002003004');
  await expect(page.locator('main input[name="privacyConsent"]')).toBeChecked();
  expect((await insuranceRecords(system)).count).toBe(0);
  await captureAsset(page, '15-insurance-review.png');
  await ui.locator('.fl-footer .fl-btn-primary').click();
  await expect(page).toHaveURL(/\/insurance\/review\?draft=/);
  await expect(ui).toHaveAttribute('data-phase', 'REVIEW');
  await expect(ui).toContainText('INS-2026-001');
  expect((await insuranceRecords(system)).count).toBe(0);
  await ui.locator('.fl-footer .fl-btn-primary').click();
  await expect(page).toHaveURL(/\/insurance\/receipt\//);
  await expect(ui).toHaveAttribute('data-phase', 'SUCCESS');
  const result = await insuranceRecords(system);
  expect(result.count).toBe(1); expect(result.insertionCount).toBe(1);
  expect(result.records[0]).toMatchObject({ policyNumber: 'INS-2026-001', applicantName: '김하늘', claimType: '통원', hospitalName: '시연의원', accountNumber: '1002003004' });
  await expect(ui).toContainText(String(result.records[0].id));
  await captureAsset(page, '16-insurance-success.png');
  await info.attach('insurance-source-evidence', { body: JSON.stringify({ mode, controlsReadyMs,
    originalRecords: result.count, insertionCount: result.insertionCount, scope: 'synthetic insurance claim receipt only; no real insurer or payout' }), contentType: 'application/json' });
}
