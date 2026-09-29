import type { Page } from '@playwright/test';
import { test, expect, openBenefits, dialog, benefitsRecords } from './qa-gates';

type Sample = { ms: number; phase: string | null; ad: boolean };
async function observePreparation(page: Page) {
  await page.evaluate(() => {
    const root = document.querySelector('#flecto-host')!.shadowRoot!;
    const start = performance.now();
    const samples: Array<{ ms: number; phase: string | null; ad: boolean }> = [];
    const record = () => samples.push({ ms: performance.now() - start,
      phase: root.querySelector('[data-phase]')?.getAttribute('data-phase') ?? null,
      ad: !!root.querySelector('.fl-sponsor'),
    });
    const observer = new MutationObserver(record);
    observer.observe(root, { subtree: true, attributes: true, childList: true }); record();
    (globalThis as unknown as { qaPreparation: { samples: typeof samples; observer: MutationObserver } }).qaPreparation = { samples, observer };
  });
  return async () => page.evaluate(() => {
    const state = (globalThis as unknown as { qaPreparation: { samples: Sample[]; observer: MutationObserver } }).qaPreparation;
    state.observer.disconnect(); return state.samples;
  });
}
async function prepare(page: Page) {
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
}

test('T15 T21 partial: 2.9s cold transport and warm cache record real readiness with no ad', async ({ page, activate, system, qa, consoleErrors }, info) => {
  await openBenefits(page, activate, system);
  qa.delayMs = 2900;
  const stopCold = await observePreparation(page);
  await prepare(page);
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toBeEditable();
  const cold = await stopCold();
  expect(cold.some(x => x.phase === 'PREPARING')).toBe(true);
  expect(cold.some(x => x.phase === 'READY')).toBe(true);
  expect(cold.some(x => x.ad)).toBe(false);
  expect(JSON.parse(qa.exchanges[0].response!).mode).toBe('FIXTURE');
  const coldReady = cold.find(x => x.phase === 'READY')!.ms - cold.find(x => x.phase === 'PREPARING')!.ms;
  expect(coldReady).toBeLessThan(3000);
  qa.delayMs = 0;
  await dialog(page).getByRole('button', { name: '원래 화면 보기', exact: true }).click();
  await page.reload(); await activate(page);
  const stopWarm = await observePreparation(page);
  await prepare(page);
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toBeEditable();
  const warm = await stopWarm();
  expect(JSON.parse(qa.exchanges.at(-1)!.response!).mode).toBe('CACHE');
  expect(warm.some(x => x.ad)).toBe(false);
  await info.attach('cold-warm-readiness', { body: JSON.stringify({ coldTransportDelayMs: 2900, cold, warm,
    scope: 'first editable input; full primary-action arm delay reported separately, not a LIVE inference benchmark' }), contentType: 'application/json' });
  expect(consoleErrors).toEqual([]);
});

test('T16 T36 partial: sponsor is present only during preparation, READY removes it without submitting', async ({ page, activate, system, qa, consoleErrors }, info) => {
  await openBenefits(page, activate, system); qa.delayMs = 3600;
  const stop = await observePreparation(page);
  await prepare(page);
  await expect(dialog(page).getByRole('complementary', { name: 'FLECTO 후원 광고' })).toBeVisible();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'PREPARING');
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toBeEditable();
  await expect(dialog(page).getByRole('complementary', { name: 'FLECTO 후원 광고' })).toHaveCount(0);
  const samples = await stop();
  expect(samples.some(x => x.ad)).toBe(true);
  expect(samples.filter(x => x.ad).every(x => x.phase === 'PREPARING')).toBe(true);
  expect((await benefitsRecords(system)).count).toBe(0);
  await info.attach('sponsor-timeline', { body: JSON.stringify(samples), contentType: 'application/json' });
  expect(consoleErrors).toEqual([]);
});

test('T19 partial: dismissing the sponsor preserves the same preparation request', async ({ page, activate, system, qa, consoleErrors }) => {
  await openBenefits(page, activate, system); qa.delayMs = 4600;
  await prepare(page);
  await dialog(page).getByRole('button', { name: '광고 닫기', exact: true }).click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'PREPARING');
  await expect(dialog(page).getByRole('complementary', { name: 'FLECTO 후원 광고' })).toHaveCount(0);
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toBeEditable();
  expect(qa.exchanges.length).toBe(1);
  expect(consoleErrors).toEqual([]);
});

test('T17: 30s timeout offers original and rejects the 31s late planner response', async ({ page, activate, system, qa, consoleErrors }, info) => {
  // The user explicitly extended preparation from 10s to 30s for rehearsal.
  // Preserve the original timeout/late-result/no-submission safety assertions.
  await openBenefits(page, activate, system); qa.delayMs = 31000;
  const stop = await observePreparation(page);
  await prepare(page);
  await expect(dialog(page)).toHaveAttribute('data-phase', 'TIMED_OUT', { timeout: 31500 });
  await expect(dialog(page).getByRole('button', { name: '원래 화면에서 계속하기', exact: true })).toBeEnabled();
  await expect(dialog(page).getByRole('complementary', { name: 'FLECTO 후원 광고' })).toHaveCount(0);
  await expect.poll(() => qa.exchanges[0]?.releasedAt).toBeTruthy();
  await page.waitForTimeout(300);
  await expect(dialog(page)).toHaveAttribute('data-phase', 'TIMED_OUT');
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toHaveCount(0);
  const samples = await stop();
  const elapsed = samples.find(x => x.phase === 'TIMED_OUT')!.ms - samples.find(x => x.phase === 'PREPARING')!.ms;
  expect(elapsed).toBeGreaterThanOrEqual(29900); expect(elapsed).toBeLessThan(30500);
  expect(samples.some(x => x.phase === 'READY')).toBe(false);
  await info.attach('deadline-timeline', { body: JSON.stringify({ elapsed, samples }), contentType: 'application/json' });
  expect((await benefitsRecords(system)).count).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('D30: an 11s cold plan remains usable within the user-approved 30s preparation budget', async ({ page, activate, system, qa, consoleErrors }) => {
  await openBenefits(page, activate, system); qa.delayMs = 11000;
  await prepare(page);
  await expect(dialog(page)).toHaveAttribute('data-phase', 'READY', { timeout: 15000 });
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toBeEditable();
  expect(qa.exchanges).toHaveLength(1);
  expect((await benefitsRecords(system)).count).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('T18 T33 partial: cancel followed by a new goal epoch rejects the first late result', async ({ page, activate, system, qa, consoleErrors }) => {
  await openBenefits(page, activate, system); qa.delayMs = 1800;
  await prepare(page);
  await expect.poll(() => qa.exchanges.length).toBe(1);
  await dialog(page).getByRole('button', { name: '준비 멈추기', exact: true }).click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'CANCELLED');
  qa.delayMs = 0;
  await dialog(page).getByRole('button', { name: '다시 준비하기', exact: true }).click();
  await prepare(page);
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toBeEditable();
  await dialog(page).getByLabel('주문번호', { exact: false }).fill('FLECTO-2026-009');
  await expect.poll(() => qa.exchanges[0]?.releasedAt).toBeTruthy();
  await page.waitForTimeout(300);
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toHaveValue('FLECTO-2026-009');
  const first = JSON.parse(qa.exchanges[0].request); const next = JSON.parse(qa.exchanges[1].request);
  expect(next.sessionEpoch).toBeGreaterThan(first.sessionEpoch);
  expect(next.snapshot.requestId).not.toBe(first.snapshot.requestId);
  expect(qa.exchanges.length).toBe(2);
  expect((await benefitsRecords(system)).count).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('T18 partial: cancel while sponsor is visible remains terminal after late response', async ({ page, activate, system, qa, consoleErrors }) => {
  await openBenefits(page, activate, system); qa.delayMs = 4600;
  await prepare(page);
  await expect(dialog(page).getByRole('complementary', { name: 'FLECTO 후원 광고' })).toBeVisible();
  await dialog(page).getByRole('button', { name: '준비 멈추기', exact: true }).click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'CANCELLED');
  await expect(dialog(page).getByRole('complementary', { name: 'FLECTO 후원 광고' })).toHaveCount(0);
  await expect.poll(() => qa.exchanges[0]?.releasedAt).toBeTruthy();
  await page.waitForTimeout(300);
  await expect(dialog(page)).toHaveAttribute('data-phase', 'CANCELLED');
  expect(qa.exchanges.length).toBe(1);
  expect(consoleErrors).toEqual([]);
});
