import { test as base, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startSystem, type RunningSystem } from '../../scripts/system';
import { EXTENSION_ID } from '@flecto/contracts';
import { readVerifiedArtifact } from '../../scripts/qa-report';

export const E2E_MODE = process.env.FLECTO_E2E_MODE === 'LIVE_CODEX' ? 'LIVE_CODEX' : 'FIXTURE';
export const QA_PORTS = E2E_MODE === 'LIVE_CODEX' ? { planner: 4527, benefits: 4383, culture: 4384 } : { planner: 4427, benefits: 4283, culture: 4284 };
type AppFixtures = { context: BrowserContext; worker: Worker; activate: (page: Page) => Promise<void>; consoleErrors: string[] };
type WorkerFixtures = { system: RunningSystem };
export const test = base.extend<AppFixtures, WorkerFixtures>({
  system: [async ({}, use) => {
    await mkdir('.flecto/qa', { recursive: true });
    const dataDir = await mkdtemp(resolve('.flecto/qa/e2e-'));
    const system = await startSystem({ mode: E2E_MODE, namespace: 'QA', dataDir, ports: QA_PORTS });
    try { await use(system); } finally { await system.close(); }
  }, { scope: 'worker' }],
  context: async ({ system }, use, testInfo) => {
    const artifact = await readVerifiedArtifact(process.cwd());
    for (const source of ['benefits', 'culture'] as const) {
      const token = source === 'benefits' ? system.credentials.benefitsToken : system.credentials.cultureToken;
      const headers = { 'x-flecto-qa-token': token, 'content-type': 'application/json' };
      const response = await fetch(`http://127.0.0.1:${system.ports[source]}/__qa/reset`, { method: 'POST', headers, body: '{}' });
      expect(response.ok).toBeTruthy();
      if (source === 'benefits') await fetch(`http://127.0.0.1:${system.ports[source]}/__qa/config`, { method: 'POST', headers, body: JSON.stringify({ variant: 'default', fault: 'none' }) });
    }
    const profile = await mkdtemp(resolve('.flecto/qa/browser-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: process.env.FLECTO_HEADED !== '1',
      viewport: { width: 1440, height: 1100 },
      args: [`--disable-extensions-except=${resolve('dist/extension')}`, `--load-extension=${resolve('dist/extension')}`],
    });
    try {
      const options = await context.newPage();
      await options.goto(`chrome-extension://${EXTENSION_ID}/options.html`);
      await options.locator('summary').filter({ hasText: '도우미 주소 바꾸기' }).click();
      await options.getByLabel('도우미 주소', { exact: true }).fill(`http://127.0.0.1:${system.ports.planner}`);
      await options.getByLabel('연결 토큰', { exact: true }).fill(system.credentials.plannerToken);
      await options.getByRole('button', { name: '연결하기', exact: true }).click();
      await expect(options.locator('.fl-status')).toContainText('도우미와 연결됐어요');
      await options.close();
      await use(context);
      expect(await readVerifiedArtifact(process.cwd())).toEqual(artifact);
      await testInfo.attach('artifact', { body: JSON.stringify({ ...artifact, extensionId: EXTENSION_ID, activation: 'production-broker-in-isolated-extension-worker', mode: E2E_MODE }), contentType: 'application/json' });
    } finally { await context.close(); }
  },
  worker: async ({ context }, use) => { await use(context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')); },
  page: async ({ context }, use, testInfo) => {
    const page = await context.newPage();
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
      const path = testInfo.outputPath('flecto-failure.png');
      await page.screenshot({ path });
      await testInfo.attach('flecto-failure', { path, contentType: 'image/png' });
      const ui = page.getByRole('dialog', { name: 'FLECTO 쉬운 화면' });
      if (await ui.count()) console.log('Failed FLECTO state:', await ui.innerText());
    }
    await page.close();
  },
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await use(errors); expect(errors).toEqual([]);
  },
  activate: async ({ worker }, use) => {
    await use(async (page) => {
      await page.bringToFront();
      // The installed extension's real action handler, in a test-owned trusted
      // worker. A native toolbar click is verified separately through computer use.
      await worker.evaluate(async (url) => {
        const tab = (await chrome.tabs.query({})).find((item) => item.url === url && item.active);
        if (!tab) throw new Error('Test source tab was not found');
        const broker = (globalThis as unknown as Record<symbol, { activate(tab: chrome.tabs.Tab): Promise<void> }>)[Symbol.for('flecto.background')];
        await broker.activate(tab);
      }, page.url());
      await expect(page.getByRole('dialog', { name: 'FLECTO 쉬운 화면' })).toBeVisible();
    });
  },
});
export { expect };
export const dialog = (page: Page) => page.getByRole('dialog', { name: 'FLECTO 쉬운 화면' });
export async function captureAsset(page: Page, name: string) {
  if (process.env.FLECTO_CAPTURE !== '1') return;
  await mkdir('.flecto/creative/assets', { recursive: true });
  await page.screenshot({ path: resolve('.flecto/creative/assets', name) });
}
export async function loginBenefits(page: Page) {
  await page.goto(`http://127.0.0.1:${QA_PORTS.benefits}/login`);
  await page.getByLabel('아이디', { exact: true }).fill('demo');
  await page.getByLabel('비밀번호', { exact: true }).fill('flecto2026!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:${QA_PORTS.benefits}/`);
}
export async function beginBenefits(page: Page, activate: (page: Page) => Promise<void>) {
  await loginBenefits(page); await page.goto(`http://127.0.0.1:${QA_PORTS.benefits}/apply`);
  await captureAsset(page, '01-source-benefits.png'); await activate(page);
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toBeVisible();
  await captureAsset(page, '02-flecto-input.png');
}
export async function fillBenefits(page: Page, order = 'FLECTO-2026-001') {
  const ui = dialog(page);
  await ui.getByLabel('주문번호', { exact: false }).fill(order);
  await ui.getByLabel('구매일', { exact: false }).fill('2026-09-01');
  await expect(page.locator('main input[name="orderNumber"]')).toHaveValue(order);
  await expect(page.locator('main input[name="purchaseDate"]')).toHaveValue('2026-09-01');
  await expect(ui.getByRole('button', { name: '다음', exact: true })).toBeEnabled();
  await ui.getByRole('button', { name: '다음', exact: true }).click();
  await expect(ui.getByRole('heading', { name: '원하시는 항목을 선택해 주세요', exact: true })).toBeVisible();
  await captureAsset(page, '03-flecto-choice.png');
  await ui.getByRole('radio', { name: '가전', exact: true }).click();
  await expect(ui.getByRole('radio', { name: '가전', exact: true })).toBeChecked();
  await expect(page.locator('main select[name="category"]')).toHaveValue('가전');
  await ui.getByRole('button', { name: '다음', exact: true }).click();
  await ui.getByRole('checkbox', { name: /위 신청 조건과 주문 정보 저장/ }).click();
  await expect(ui.getByRole('checkbox', { name: /위 신청 조건과 주문 정보 저장/ })).toBeChecked();
  await expect(page.locator('main input[name="consent"]')).toBeChecked();
  await ui.getByRole('button', { name: '입력 내용 확인하기', exact: true }).click();
  await expect(ui.getByRole('button', { name: '신청 내용 확인', exact: true })).toBeVisible();
  await captureAsset(page, '04-flecto-review.png');
}
export async function benefitsRecords(system: RunningSystem) {
  const response = await fetch(`http://127.0.0.1:${system.ports.benefits}/__qa/records`, { headers: { 'x-flecto-qa-token': system.credentials.benefitsToken } });
  expect(response.ok).toBeTruthy();
  return response.json() as Promise<{ records: Array<Record<string, unknown>>; count: number; insertionCount: number }>;
}
