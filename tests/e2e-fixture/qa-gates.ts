import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test as existingTest, expect, dialog, benefitsRecords } from './fixtures';
import { startSystem, type RunningSystem } from '../../scripts/system';

// This helper deliberately leaves the shared fixture/config untouched. Each worker
// owns these servers, its synthetic DBs and a fresh installed-extension profile.
export const GATE_PORTS = { planner: 4627, benefits: 4483, culture: 4484 };
const PROXY_PORT = 4628;
type PlanExchange = { request: string; response?: string; receivedAt: number; releasedAt?: number; delayMs: number };
type Probe = {
  delayMs: number; blockPlans: boolean; exchanges: PlanExchange[]; logs: string[];
  dataDir: string; system: RunningSystem; close(): Promise<void>;
};

async function createProbe(): Promise<Probe> {
  await mkdir('.flecto/qa', { recursive: true });
  const dataDir = await mkdtemp(resolve('.flecto/qa/gates-'));
  const real = await startSystem({ mode: 'FIXTURE', namespace: 'QA', dataDir, ports: GATE_PORTS });
  const logs: string[] = [];
  for (const child of real.children) {
    child.stdout?.on('data', chunk => logs.push(String(chunk)));
    child.stderr?.on('data', chunk => logs.push(String(chunk)));
  }
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const probe: Probe = {
    delayMs: 0, blockPlans: false, exchanges: [], logs, dataDir,
    system: { ...real, ports: { ...GATE_PORTS, planner: PROXY_PORT } },
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      proxy.closeAllConnections();
      await new Promise<void>(done => proxy.close(() => done()));
      await real.close();
    },
  };
  // FAULT_INJECTION transport only: the unmodified planner produces every plan.
  // Holding its response lets the installed extension exercise real deadline and
  // cancellation handling; no model plan or source application answer is forged.
  const proxy = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      const isPlan = req.method === 'POST' && req.url === '/v1/plans';
      const exchange = isPlan ? { request: body, receivedAt: performance.now(), delayMs: probe.delayMs } as PlanExchange : null;
      if (exchange) probe.exchanges.push(exchange);
      if (isPlan && probe.blockPlans) { res.writeHead(503).end('{"error":"QA plan path blocked"}'); return; }
      const delayMs = isPlan ? probe.delayMs : 0;
      const headers = Object.fromEntries(Object.entries(req.headers)
        .filter(([key, value]) => !['host', 'connection', 'content-length', 'transfer-encoding'].includes(key) && typeof value === 'string')) as Record<string, string>;
      const upstream = await fetch(`http://127.0.0.1:${GATE_PORTS.planner}${req.url}`, {
        method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : body,
      });
      const result = await upstream.text();
      if (exchange) exchange.response = result;
      const release = () => {
        if (exchange) exchange.releasedAt = performance.now();
        if (!res.destroyed) res.writeHead(upstream.status, { 'content-type': 'application/json' }).end(result);
      };
      const remaining = exchange ? delayMs - (performance.now() - exchange.receivedAt) : 0;
      if (remaining > 0) {
        const timer = setTimeout(() => { timers.delete(timer); release(); }, remaining);
        timers.add(timer);
      } else release();
    } catch {
      if (!res.destroyed) res.writeHead(502).end('{"error":"QA proxy upstream failed"}');
    }
  });
  try {
    await new Promise<void>((done, reject) => { proxy.once('error', reject); proxy.listen(PROXY_PORT, '127.0.0.1', done); });
    return probe;
  } catch (error) { await real.close(); throw error; }
}

export const test = existingTest.extend<{ qa: Probe; gateEvidence: void }, { gateProbe: Probe }>({
  gateProbe: [async ({}, use) => {
    const probe = await createProbe();
    try { await use(probe); } finally { await probe.close(); }
  }, { scope: 'worker' }],
  system: [async ({ gateProbe }, use) => { await use(gateProbe.system); }, { scope: 'worker' }],
  qa: async ({ gateProbe }, use) => {
    gateProbe.delayMs = 0; gateProbe.blockPlans = false; gateProbe.exchanges = []; gateProbe.logs.length = 0;
    await use(gateProbe);
    gateProbe.delayMs = 0; gateProbe.blockPlans = false;
  },
  gateEvidence: [async ({ qa, page }, use, info) => {
    const browserErrors: Array<{ message: string; stack?: string }> = [];
    const onError = (error: Error) => browserErrors.push({ message: error.message, stack: error.stack });
    page.on('pageerror', onError);
    await use();
    page.off('pageerror', onError);
    await info.attach('qa-gate-provenance', {
      body: JSON.stringify({ testAuthoredAgainst: 'e11d9d6', gateVersion: 3,
        productCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        mode: qa.exchanges.some(x => x.delayMs > 0) ? 'FIXTURE / FAULT_INJECTION' : 'FIXTURE',
        extensionHashes: JSON.parse(await readFile('dist/extension-hashes.json', 'utf8')),
        ports: qa.system.ports, viewport: page.viewportSize(),
        activation: 'installed extension, production broker action (not a native toolbar click)',
        planRequests: qa.exchanges.length, browserErrors,
        exchanges: qa.exchanges.map(x => ({ receivedAt: x.receivedAt, releasedAt: x.releasedAt, delayMs: x.delayMs })),
      }), contentType: 'application/json',
    });
  }, { auto: true }],
});
export { expect, dialog, benefitsRecords };

export async function fillBenefits(page: Page, order = 'FLECTO-2026-001') {
  const ui = dialog(page);
  await ui.getByLabel('주문번호', { exact: false }).fill(order);
  await ui.getByLabel('구매일', { exact: false }).fill('2026-09-01');
  await expect(page.locator('main input[name="orderNumber"]')).toHaveValue(order);
  await expect(page.locator('main input[name="purchaseDate"]')).toHaveValue('2026-09-01');
  await ui.getByRole('button', { name: '다음', exact: true }).click();
  const category = ui.getByRole('radio', { name: '가전', exact: true });
  await category.click();
  await expect(category).toBeChecked();
  await expect(page.locator('main select[name="category"]')).toHaveValue('가전');
  await ui.getByRole('button', { name: '다음', exact: true }).click();
  const consent = ui.getByRole('checkbox', { name: /위 신청 조건과 주문 정보 저장/ });
  // The controlled overlay updates after the async source event/readback. check()
  // asserts immediately after its click; use at most one real user action, then
  // await both DOMs. A saved draft's existing user consent must not be toggled off.
  if (!await consent.isChecked()) await consent.click();
  await expect(consent).toBeChecked();
  await expect(page.locator('main input[name="consent"]')).toBeChecked();
  await ui.getByRole('button', { name: '입력 내용 확인하기', exact: true }).click();
  await expect(ui).toHaveAttribute('data-phase', 'REVIEW');
}

export async function loginBenefits(page: Page, system: RunningSystem) {
  await page.goto(`http://127.0.0.1:${system.ports.benefits}/login`);
  await page.getByLabel('아이디', { exact: true }).fill('demo');
  await page.getByLabel('비밀번호', { exact: true }).fill('flecto2026!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:${system.ports.benefits}/`);
}
export async function openBenefits(page: Page, activate: (page: Page) => Promise<void>, system: RunningSystem) {
  await loginBenefits(page, system);
  await page.goto(`http://127.0.0.1:${system.ports.benefits}/apply`);
  await expect(page).toHaveTitle(/구매 혜택 신청/);
  await expect(page.locator('body > main')).toContainText('구매 혜택 신청');
  await activate(page);
}
export async function beginBenefits(page: Page, activate: (page: Page) => Promise<void>, system: RunningSystem) {
  await openBenefits(page, activate, system);
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).first().click();
  await expect(dialog(page).getByLabel('주문번호', { exact: false })).toBeVisible();
}
export async function sourceReview(page: Page, activate: (page: Page) => Promise<void>, system: RunningSystem) {
  await beginBenefits(page, activate, system); await fillBenefits(page);
  await dialog(page).getByRole('button', { name: '신청 내용 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/apply\/review\?draft=/);
  await expect(dialog(page)).toHaveAttribute('data-phase', 'REVIEW');
}
export async function configureBenefits(system: RunningSystem, body: Record<string, unknown>) {
  const response = await fetch(`http://127.0.0.1:${system.ports.benefits}/__qa/config`, {
    method: 'POST', headers: { 'x-flecto-qa-token': system.credentials.benefitsToken, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  expect(response.ok).toBeTruthy();
}
export function countSourcePosts(page: Page) {
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST' && /\/apply(?:\/submit)?$/.test(new URL(req.url()).pathname)) posts.push(new URL(req.url()).pathname); });
  return posts;
}
export async function assertPrivateSinksClean(qa: Probe, sentinels: string[]) {
  const payloads = qa.exchanges.map(x => x.request + (x.response ?? '')).join('\n') + qa.logs.join('\n');
  for (const sentinel of sentinels) expect(payloads, 'planner transport / local service logs').not.toContain(sentinel);
  // QA reads only the planner's owned data, never a personal profile or source DB.
  const plannerDir = resolve(qa.dataDir, 'planner');
  for (const entry of await readdir(plannerDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const bytes = await readFile(resolve(plannerDir, entry.name));
    for (const sentinel of sentinels) expect(bytes.includes(Buffer.from(sentinel)), `planner persisted sink ${entry.name}`).toBe(false);
  }
}
export async function openCulture(page: Page, activate: (page: Page) => Promise<void>, system: RunningSystem) {
  await page.goto(`http://127.0.0.1:${system.ports.culture}/login`);
  await page.getByLabel('아이디', { exact: true }).fill('demo');
  await page.getByLabel('비밀번호', { exact: true }).fill('flecto2026!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await page.getByRole('button', { name: /요가.*수강 신청/ }).click();
  await expect(page).toHaveURL(/\/apply\/course/);
  await activate(page);
  await dialog(page).getByRole('button', { name: '다음', exact: true }).click();
  await expect(dialog(page).getByRole('radiogroup', { name: /수업 시간/ })).toBeVisible();
}
