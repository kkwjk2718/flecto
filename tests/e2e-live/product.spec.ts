import type { Page, TestInfo } from '@playwright/test';
import { test, expect, dialog, QA_PORTS, loginBenefits, benefitsRecords } from '../e2e-fixture/fixtures';
import { EXTENSION_ORIGIN } from '@flecto/contracts';
import type { RunningSystem } from '../../scripts/system';

type Timing = { source: 'benefits' | 'culture'; stage: string; mode: 'LIVE_CODEX' | 'CACHE'; controlsReadyMs: number };
async function diagnostics(system: RunningSystem) {
  const response = await fetch(`http://127.0.0.1:${system.ports.planner}/v1/diagnostics/cache`, {
    headers: { authorization: `Bearer ${system.credentials.plannerToken}`, origin: EXTENSION_ORIGIN },
  });
  expect(response.ok).toBeTruthy(); return response.json();
}
async function prepare(page: Page, label: string, source: string, timings: Timing[]) {
  const ui = dialog(page);
  await expect(ui).toHaveAttribute('data-phase', 'IDLE');
  const start = await page.evaluate(() => performance.now());
  await ui.getByRole('button', { name: label, exact: true }).click();
  await expect(ui).toHaveAttribute('data-phase', /^(READY|REVIEW)$/);
  await expect(ui.locator('.fl-footer .fl-btn-primary')).toBeEnabled();
  const end = await page.evaluate(() => performance.now());
  const mode = await ui.locator('.fl-tech').textContent() ?? '';
  expect(mode).toContain(source.endsWith('-warm') ? '(CACHE)' : '(LIVE_CODEX)');
  timings.push({ source: source.startsWith('benefits') ? 'benefits' : 'culture', stage: source,
    mode: source.endsWith('-warm') ? 'CACHE' : 'LIVE_CODEX', controlsReadyMs: end - start });
}
/** Drive the displayed controls, independent of the model's grouping/order. */
async function finishLocalSteps(page: Page, values: Record<string, string>, choice: RegExp, consent: RegExp) {
  const ui = dialog(page);
  for (let step = 0; step < 12; step++) {
    await expect(ui).toHaveAttribute('data-phase', /^(READY|REVIEW)$/);
    if (await ui.getAttribute('data-phase') === 'REVIEW') return;
    for (const [label, value] of Object.entries(values)) {
      const input = ui.getByLabel(label, { exact: false });
      if (await input.count() && await input.first().isVisible()) await input.first().fill(value);
    }
    const chosen = ui.getByRole('radio', { name: choice });
    if (await chosen.count()) { await chosen.first().click(); await expect(chosen.first()).toBeChecked(); }
    const check = ui.getByRole('checkbox', { name: consent });
    if (await check.count() && !await check.isChecked()) { await check.click(); await expect(check).toBeChecked(); }
    const before = await ui.locator('.fl-head').innerText();
    await ui.locator('.fl-footer .fl-btn-primary').click();
    await expect.poll(async () => `${await ui.getAttribute('data-phase')}|${await ui.locator('.fl-head').innerText()}`).not.toBe(`READY|${before}`);
  }
  throw new Error('The displayed plan did not reach review within the schema step limit');
}
function cacheDelta(before: Record<string, number>, after: Record<string, number>) {
  return Object.fromEntries(['exactHits', 'compatibleHits', 'misses', 'providerCalls'].map(key => [key, after[key] - before[key]]));
}
async function attachEvidence(info: TestInfo, timings: Timing[], cache: Record<string, number>, outcome: object) {
  await info.attach('live-source-evidence', { body: JSON.stringify({ mode: 'LIVE_CODEX', requestedModel: 'gpt-6-luna',
    coldNamespace: 'new QA system per repeat worker; site counters are the actual run delta', timings: timings.filter(t => t.mode === 'LIVE_CODEX'),
    cache, outcome }), contentType: 'application/json' });
  await info.attach('controls-ready-samples', { body: JSON.stringify(timings), contentType: 'application/json' });
}

test('LIVE benefits: cold original storage and separate warm controlsReady', async ({ page, activate, system, consoleErrors }, info) => {
  const timings: Timing[] = [];
  const initial = await diagnostics(system);
  await loginBenefits(page); await page.goto(`http://127.0.0.1:${QA_PORTS.benefits}/apply`); await activate(page);
  await prepare(page, '신청 내용 확인', 'benefits-cold', timings);
  expect((await diagnostics(system)).misses).toBeGreaterThan(0);
  await finishLocalSteps(page, { '주문번호': 'FLECTO-2026-001', '구매일': '2026-09-01' }, /^가전$/, /위 신청 조건과 주문 정보 저장/);
  await expect(page.locator('main input[name="orderNumber"]')).toHaveValue('FLECTO-2026-001');
  await expect(page.locator('main select[name="category"]')).toHaveValue('가전');
  expect((await benefitsRecords(system)).count).toBe(0);
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/review\?draft=/);
  await expect(dialog(page)).toContainText('FLECTO-2026-001');
  expect((await benefitsRecords(system)).count).toBe(0);
  await dialog(page).getByRole('button', { name: '혜택 신청 제출', exact: true }).click();
  await expect(page).toHaveURL(/\/receipt\//);
  const result = await benefitsRecords(system);
  expect(result.count).toBe(1); expect(result.insertionCount).toBe(1);
  expect(result.records[0]).toMatchObject({ orderNumber: 'FLECTO-2026-001', category: '가전', purchaseDate: '2026-09-01' });
  const before = await diagnostics(system);
  await page.goto(`http://127.0.0.1:${QA_PORTS.benefits}/apply`);
  await prepare(page, '신청 내용 확인', 'benefits-warm', timings);
  const after = await diagnostics(system);
  expect(after.providerCalls).toBe(before.providerCalls);
  expect(after.exactHits + after.compatibleHits).toBeGreaterThan(before.exactHits + before.compatibleHits);
  expect(consoleErrors).toEqual([]);
  await attachEvidence(info, timings, cacheDelta(initial, before), { sourceDatabaseCount: result.count, insertionCount: result.insertionCount });
});

test('LIVE culture: cold React-controlled application stores the selected course and time', async ({ page, activate, system, consoleErrors }, info) => {
  const timings: Timing[] = [];
  const initial = await diagnostics(system);
  await page.goto(`http://127.0.0.1:${QA_PORTS.culture}/login`);
  await page.getByLabel('아이디', { exact: true }).fill('demo'); await page.getByLabel('비밀번호', { exact: true }).fill('flecto2026!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('button', { name: /요가.*수강 신청/ }).click(); await activate(page);
  await prepare(page, '다음', 'culture-course-cold', timings);
  await finishLocalSteps(page, {}, /10:00/, /개인정보 수집/);
  await expect(page.locator('main select[name="timeId"]')).toHaveValue('yoga-tue-thu-1000');
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/applicant/);
  await prepare(page, '다음', 'culture-applicant-cold', timings);
  await finishLocalSteps(page, { '신청자 이름': '김하늘', '휴대전화 번호': '01012345678' }, /10:00/, /개인정보 수집/);
  await expect(page.locator('main input[name="applicantName"]')).toHaveValue('김하늘');
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/notice/);
  await prepare(page, '다음', 'culture-notice-cold', timings);
  await finishLocalSteps(page, {}, /10:00/, /개인정보 수집·이용에 동의/);
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/review/);
  await expect(dialog(page)).toContainText('김하늘');
  await dialog(page).getByRole('button', { name: /신청하기/ }).click();
  await expect(page).toHaveURL(/\/reservations\/HB-/);
  const response = await fetch(`http://127.0.0.1:${system.ports.culture}/__qa/records`, { headers: { 'x-flecto-qa-token': system.credentials.cultureToken } });
  const outcome = await response.json(); expect(outcome.count).toBe(1);
  expect(outcome.reservations[0]).toMatchObject({ courseId: 'yoga', timeId: 'yoga-tue-thu-1000', applicantName: '김하늘' });
  expect(consoleErrors).toEqual([]);
  await attachEvidence(info, timings, cacheDelta(initial, await diagnostics(system)), { sourceDatabaseCount: outcome.count });
});
