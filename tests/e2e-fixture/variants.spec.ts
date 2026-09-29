import { test, expect, beginBenefits, fillBenefits, dialog, benefitsRecords, configureBenefits,
  countSourcePosts, openCulture, sourceReview } from './qa-gates';

test('T12 T26 partial: newly required holdout field invalidates the installed extension plan', async ({ page, activate, system, qa, consoleErrors }) => {
  await beginBenefits(page, activate, system); await fillBenefits(page);
  const posts = countSourcePosts(page);
  await page.evaluate(() => {
    const field = document.createElement('label'); field.textContent = '신청 구분 확인';
    const input = document.createElement('input'); input.required = true; input.name = 'qa-added-required';
    field.append(input); document.querySelector('main form')!.prepend(field);
  });
  await expect(dialog(page)).toHaveAttribute('data-phase', 'STALE_DOCUMENT');
  await expect(dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true })).toHaveCount(0);
  expect(posts).toEqual([]); expect((await benefitsRecords(system)).count).toBe(0);
  await dialog(page).getByRole('button', { name: '다시 준비하기', exact: true }).click();
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(dialog(page).getByLabel('신청 구분 확인', { exact: false })).toBeVisible();
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await expect(dialog(page).getByLabel('신청 구분 확인', { exact: false })).toHaveAttribute('aria-invalid', 'true');
  expect(qa.exchanges.length).toBe(2);
  expect(consoleErrors).toEqual([]);
});

test('T14: changed important notice rejects prior review and generates the new notice', async ({ page, activate, system, qa, consoleErrors }) => {
  await beginBenefits(page, activate, system); await fillBenefits(page);
  const posts = countSourcePosts(page);
  const updated = '신청 기한은 2026년 10월 2일 오후 2시입니다. 시연 포인트는 2,000점입니다. 실제 지급은 없습니다.';
  await page.locator('body > main .notice p').evaluate((node, text) => { node.textContent = text; }, updated);
  await expect(dialog(page)).toHaveAttribute('data-phase', 'STALE_DOCUMENT');
  expect(posts).toEqual([]);
  await dialog(page).getByRole('button', { name: '다시 준비하기', exact: true }).click();
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toBeVisible();
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await expect(dialog(page)).toContainText(updated);
  expect(qa.exchanges.length).toBe(2);
  expect(JSON.parse(qa.exchanges[1].response!).mode).toBe('FIXTURE');
  expect((await benefitsRecords(system)).count).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('T28: original value changes after review revoke submission until latest values are reviewed', async ({ page, activate, system, consoleErrors }) => {
  await beginBenefits(page, activate, system); await fillBenefits(page);
  const posts = countSourcePosts(page);
  await page.locator('body > main input[name="orderNumber"]').evaluate((input: HTMLInputElement) => {
    input.value = 'FLECTO-2026-002'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(dialog(page)).toHaveAttribute('data-phase', 'CONFLICT');
  await expect(dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true })).toHaveCount(0);
  expect(posts).toEqual([]);
  await dialog(page).getByRole('button', { name: '최신 내용으로 다시 확인하기', exact: true }).click();
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toHaveValue('FLECTO-2026-002');
  expect((await benefitsRecords(system)).count).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('T28 partial: source-rendered confirmation row changes revoke the old review', async ({ page, activate, system, consoleErrors }) => {
  await sourceReview(page, activate, system);
  const posts = countSourcePosts(page);
  await page.locator('body > main dl dd').first().evaluate(node => { node.textContent = 'FLECTO-2026-002'; });
  await expect(dialog(page)).toHaveAttribute('data-phase', /^(CONFLICT|STALE_DOCUMENT)$/);
  await expect(dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true })).toHaveCount(0);
  expect(posts).toEqual([]); expect((await benefitsRecords(system)).count).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('T13: duplicate-labelled actions remain in the selected form through full-navigation save', async ({ page, activate, system, consoleErrors }) => {
  // Existing context fixture resets to default before this per-test configuration.
  await configureBenefits(system, { variant: 'duplicate-form' });
  await beginBenefits(page, activate, system); await fillBenefits(page);
  const posts = countSourcePosts(page);
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/review\?draft=/);
  await expect(dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true })).toHaveCount(1);
  await dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true }).click();
  await expect(page).toHaveURL(/\/receipt\//);
  expect(posts).toEqual(['/apply', '/apply/submit']);
  const saved = await benefitsRecords(system);
  expect(saved.count).toBe(1); expect(saved.records[0]).toMatchObject({ orderNumber: 'FLECTO-2026-001' });
  expect(consoleErrors).toEqual([]);
});

test('T10 T05 partial: actual SPA back/forward rebinds the correct step and controlled time', async ({ page, activate, system, qa, consoleErrors }) => {
  await openCulture(page, activate, system);
  await dialog(page).getByRole('radio', { name: /10:00/ }).first().click();
  await dialog(page).getByRole('button', { name: '입력 내용 확인하기', exact: true }).click();
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/applicant/);
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await expect(dialog(page).getByLabel('신청자 이름', { exact: false })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/apply\/course/);
  await expect(dialog(page)).toHaveAttribute('data-phase', 'IDLE');
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await expect(dialog(page).getByRole('radio', { name: /10:00/ }).first()).toBeChecked();
  await expect(page.locator('main select[name="timeId"]')).toHaveValue('yoga-tue-thu-1000');
  await expect(dialog(page).getByLabel('신청자 이름', { exact: false })).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/\/apply\/applicant/);
  await expect(dialog(page)).toHaveAttribute('data-phase', 'IDLE');
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await expect(dialog(page).getByLabel('신청자 이름', { exact: false })).toBeVisible();
  const documents = qa.exchanges.map(x => JSON.parse(x.request).snapshot.documentInstanceId);
  expect(new Set(documents).size).toBe(documents.length);
  expect(consoleErrors).toEqual([]);
});

test('T21 T37 partial: warm plan plus synthetic reset does not restore a previous login session input', async ({ page, activate, system, qa, consoleErrors }) => {
  await beginBenefits(page, activate, system); await fillBenefits(page, 'FLECTO-2026-003');
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/review\?draft=/);
  await dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true }).click();
  await expect(page).toHaveURL(/\/receipt\//);
  expect((await benefitsRecords(system)).count).toBe(1);
  const reset = await fetch(`http://127.0.0.1:${system.ports.benefits}/__qa/reset`, {
    method: 'POST', headers: { 'x-flecto-qa-token': system.credentials.benefitsToken, 'content-type': 'application/json' }, body: '{}',
  });
  expect(reset.ok).toBeTruthy(); expect((await benefitsRecords(system)).count).toBe(0);
  // A real second login rotates the source session; extension storage/cache remain.
  await dialog(page).getByRole('button', { name: '원래 화면에서 내역 보기', exact: true }).click();
  await beginBenefits(page, activate, system);
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toHaveValue('');
  await expect(page.locator('main input[name="consent"]')).not.toBeChecked();
  expect(JSON.parse(qa.exchanges.at(-1)!.response!).mode).toBe('CACHE');
  await fillBenefits(page, 'FLECTO-2026-004');
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/review\?draft=/);
  await dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true }).click();
  await expect(page).toHaveURL(/\/receipt\//);
  const saved = await benefitsRecords(system);
  expect(saved.count).toBe(1); expect(saved.insertionCount).toBe(1);
  expect(saved.records[0]).toMatchObject({ orderNumber: 'FLECTO-2026-004' });
  expect(consoleErrors).toEqual([]);
});

test('T21 T37 partial: live source capacity refresh removes a closed option from a prepared plan', async ({ page, activate, system, consoleErrors }) => {
  await openCulture(page, activate, system);
  const response = await fetch(`http://127.0.0.1:${system.ports.culture}/__qa/capacity`, {
    method: 'POST', headers: { 'x-flecto-qa-token': system.credentials.cultureToken, 'content-type': 'application/json' },
    body: JSON.stringify({ courseId: 'yoga', timeId: 'yoga-tue-thu-1000', capacity: 0 }),
  });
  expect(response.ok).toBeTruthy();
  // The actual source polls every 20s. Do not replace its React state with a test oracle.
  await expect(page.locator('main select[name="timeId"] option[value="yoga-tue-thu-1000"]')).toBeDisabled({ timeout: 25000 });
  await expect(dialog(page)).toHaveAttribute('data-phase', 'STALE_DOCUMENT');
  await dialog(page).getByRole('button', { name: '다시 준비하기', exact: true }).click();
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await expect(dialog(page).getByRole('radio', { name: /10:00/ }).first()).toBeDisabled();
  await expect(dialog(page)).toContainText('마감');
  expect(consoleErrors).toEqual([]);
});
