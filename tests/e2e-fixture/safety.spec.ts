import { test, expect, beginBenefits, openBenefits, fillBenefits, sourceReview, dialog, benefitsRecords,
  configureBenefits, countSourcePosts, assertPrivateSinksClean } from './qa-gates';

test('T03 T06 T27: required errors, explicit consent, and local-next never submit the source', async ({ page, activate, system, consoleErrors }) => {
  await beginBenefits(page, activate, system);
  const posts = countSourcePosts(page);
  const ui = dialog(page);
  await expect(page.locator('main input[name="consent"]')).not.toBeChecked();
  await ui.getByRole('button', { name: '다음', exact: true }).click();
  await expect(ui.getByLabel('주문번호', { exact: false })).toHaveAttribute('aria-invalid', 'true');
  await expect(ui.getByLabel('구매일', { exact: false })).toHaveAttribute('aria-invalid', 'true');
  const nativeError = await page.locator('main input[name="orderNumber"]').evaluate((input: HTMLInputElement) => input.validationMessage);
  expect(nativeError).not.toBe('');
  await expect(ui.locator('.fl-error').first()).toContainText(nativeError);
  expect(posts).toEqual([]);
  await ui.getByLabel('주문번호', { exact: false }).fill('FLECTO-2026-001');
  await ui.getByLabel('구매일', { exact: false }).fill('2026-09-01');
  await ui.getByRole('button', { name: '다음', exact: true }).click();
  await ui.getByRole('radio', { name: '가전', exact: true }).click();
  await ui.getByRole('button', { name: '다음', exact: true }).click();
  const consent = ui.getByRole('checkbox', { name: /위 신청 조건과 주문 정보 저장/ });
  await expect(consent).not.toBeChecked();
  await ui.getByRole('button', { name: '입력 내용 확인하기', exact: true }).click();
  await expect(consent).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('main input[name="consent"]')).not.toBeChecked();
  await consent.click();
  await expect(page.locator('main input[name="consent"]')).toBeChecked();
  await ui.getByRole('button', { name: '입력 내용 확인하기', exact: true }).click();
  await expect(ui).toHaveAttribute('data-phase', 'REVIEW');
  expect(posts).toEqual([]);
  expect((await benefitsRecords(system)).count).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('T08: source rejection never becomes success or an automatic resubmission', async ({ page, activate, system, consoleErrors }) => {
  await sourceReview(page, activate, system);
  await configureBenefits(system, { fault: 'rejection' });
  const posts = countSourcePosts(page);
  await dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true }).click();
  await expect(page.locator('body > main [role="alert"]')).toContainText('접수하지 못했습니다');
  await expect(dialog(page)).toHaveAttribute('data-phase', 'SOURCE_REJECTED');
  // A bounded observation checks the 200ms controller timer cannot retry a submit.
  await page.waitForTimeout(1200);
  expect(posts).toEqual(['/apply/submit']);
  expect((await benefitsRecords(system)).count).toBe(0);
  await expect(dialog(page)).not.toHaveAttribute('data-phase', 'SUCCESS');
  expect(consoleErrors).toEqual([]);
});

test('T08 partial: response lost after commit creates one record and never auto-replays', async ({ page, activate, system }) => {
  await sourceReview(page, activate, system);
  // Socket destruction can trigger Chromium's transport-level retry and deliver
  // the source's legitimate receipt. Instead, let the real submit commit exactly
  // once, then discard its 303 response before it reaches the browser.
  let intercepted = 0;
  await page.route('**/apply/submit', async route => {
    intercepted++;
    const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
    expect(response.status()).toBe(303);
    await route.abort('failed');
  });
  const posts = countSourcePosts(page);
  await dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true }).click();
  await expect.poll(async () => (await benefitsRecords(system)).count).toBe(1);
  await page.waitForTimeout(1200);
  expect(posts).toEqual(['/apply/submit']);
  expect(intercepted).toBe(1);
  expect((await benefitsRecords(system)).insertionCount).toBe(1);
  await expect(page.locator('#flecto-host [data-phase="SUCCESS"]')).toHaveCount(0);
  // Explicit user-directed recovery, not an extension retry or direct write API.
  await page.goto(`http://127.0.0.1:${system.ports.benefits}/history`);
  await expect(page.locator('body > main')).toContainText('FLECTO-2026-001');
});

test('T20 T29 partial: private values and QA tokens never enter planner transport, cache, or service logs', async ({ page, activate, system, qa, worker, consoleErrors }) => {
  await openBenefits(page, activate, system);
  await page.locator('main input[name="orderNumber"]').evaluate((node: HTMLInputElement) => { node.value = 'QA_PRIVATE_709134_ORDER'; });
  await page.evaluate(() => {
    document.cookie = 'qa_private=QA_COOKIE_718341_SECRET; SameSite=Lax';
    const hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = 'private-sentinel'; hidden.value = 'QA_HIDDEN_871341_SECRET';
    document.querySelector('main form')!.append(hidden);
  });
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toHaveValue('QA_PRIVATE_709134_ORDER');
  await dialog(page).getByLabel('주문번호', { exact: false }).fill('QA_EDIT_481731_PRIVATE');
  await expect(page.locator('main input[name="orderNumber"]')).toHaveValue('QA_EDIT_481731_PRIVATE');
  expect(qa.exchanges.length).toBe(1);
  await assertPrivateSinksClean(qa, ['QA_PRIVATE_709134_ORDER', 'QA_EDIT_481731_PRIVATE', 'QA_COOKIE_718341_SECRET', 'QA_HIDDEN_871341_SECRET', system.credentials.benefitsToken, system.credentials.cultureToken]);
  const storage = await worker.evaluate(async () => JSON.stringify({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }));
  for (const sentinel of ['QA_PRIVATE_709134_ORDER', 'QA_EDIT_481731_PRIVATE', 'QA_COOKIE_718341_SECRET', 'QA_HIDDEN_871341_SECRET']) expect(storage).not.toContain(sentinel);
  await expect(dialog(page).getByRole('complementary', { name: 'FLECTO 후원 광고' })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('T22: blocking only the plan endpoint after READY still permits input, correction, and source save', async ({ page, activate, system, qa, consoleErrors }) => {
  await beginBenefits(page, activate, system);
  const requestsAtReady = qa.exchanges.length;
  qa.blockPlans = true;
  await dialog(page).getByLabel('주문번호', { exact: false }).fill('FLECTO-2026-002');
  await fillBenefits(page, 'FLECTO-2026-001');
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/review\?draft=/);
  await dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true }).click();
  await expect(page).toHaveURL(/\/receipt\//);
  expect(qa.exchanges.length).toBe(requestsAtReady);
  const saved = await benefitsRecords(system);
  expect(saved.count).toBe(1); expect(saved.insertionCount).toBe(1);
  expect(saved.records[0]).toMatchObject({ orderNumber: 'FLECTO-2026-001', consent: true });
  expect(consoleErrors).toEqual([]);
});

test('T40 partial: visible login/password and later OTP pause extraction without planning', async ({ page, activate, system, qa, consoleErrors }) => {
  await page.goto(`http://127.0.0.1:${system.ports.benefits}/login`);
  await page.getByLabel('비밀번호', { exact: true }).fill('QA_PASSWORD_719481_PRIVATE');
  await activate(page);
  await expect(dialog(page)).toHaveAttribute('data-phase', 'AUTH_REQUIRED');
  expect(qa.exchanges.length).toBe(0);
  await dialog(page).getByRole('button', { name: '원래 화면에서 로그인하기', exact: true }).click();
  await beginBenefits(page, activate, system);
  const requestsAtReady = qa.exchanges.length;
  await page.evaluate(() => {
    const label = document.createElement('label'); label.textContent = '일회용 인증번호';
    const input = document.createElement('input'); input.name = 'otp'; input.autocomplete = 'one-time-code'; input.value = '731948';
    label.append(input); document.querySelector('main form')!.append(label);
  });
  await expect(dialog(page)).toHaveAttribute('data-phase', 'AUTH_REQUIRED');
  expect(qa.exchanges.length).toBe(requestsAtReady);
  await assertPrivateSinksClean(qa, ['QA_PASSWORD_719481_PRIVATE', '731948']);
  expect(consoleErrors).toEqual([]);
});

test('T24 partial: Escape restores the original form and retains entered value', async ({ page, activate, system, consoleErrors }) => {
  await beginBenefits(page, activate, system);
  await dialog(page).getByLabel('주문번호', { exact: false }).fill('FLECTO-2026-007');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('main input[name="orderNumber"]')).toHaveValue('FLECTO-2026-007');
  await page.locator('main input[name="orderNumber"]').fill('FLECTO-2026-008');
  await expect(page.locator('main input[name="orderNumber"]')).toHaveValue('FLECTO-2026-008');
  expect((await benefitsRecords(system)).count).toBe(0);
  expect(consoleErrors).toEqual([]);
});
