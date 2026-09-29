// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CACHE_VERSION, EXTENSION_ORIGIN, PROMPT_VERSION, PlannerResponseSchema, type PublicPageSnapshot } from '@flecto/contracts';
import { extractPage, rebindBlueprint, structuralFingerprint, verifyPlan } from '@flecto/core';
import { createPlannerServer } from '../../apps/planner/src/server';
import { buildFixturePlan } from '../../apps/planner/src/provider/fixture';
import { compatibleKey, COMPATIBILITY_VERSION } from '../../apps/planner/src/cache/compatibility';

const token = 'cache-perf-fixture-pairing-123456789';
const headers = { host: '127.0.0.1:4317', origin: EXTENSION_ORIGIN, authorization: `Bearer ${token}` };
let serial = 0;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); document.body.innerHTML = ''; });
function page(options = false) {
  document.body.innerHTML = `<nav><a href="/home">홈</a><a href="/history?private=excluded">내역</a></nav>
    <form action="/logout" method="post"><button>로그아웃</button></form>
    <form id="apply" action="/apply" method="post"><h2>공개 신청</h2>
      <input type="hidden" value="PRIVATE_TOKEN_732194">
      <label for="name">이름</label><input id="name" required maxlength="30" value="PRIVATE_NAME_89127">
      <label for="course">강좌</label><select id="course" required>
        <option value="" disabled>선택하세요</option>
        <option value="PRIVATE_CHOICE_A" ${options ? 'disabled' : ''}>${options ? '요가 잔여 0석' : '요가 잔여 5석'}</option>
        <option value="PRIVATE_CHOICE_B">수영 잔여 3석</option>
      </select>
      <p id="terms">수강료 30,000원. 취소는 개강 하루 전까지.</p>
      <label><input type="checkbox" required aria-describedby="terms">약관 동의</label>
      <button>신청 확인</button></form>`;
  return current();
}
function current() {
  const initial = extractPage(document, { documentInstanceId: `cache_document_${++serial}` });
  const goalRef = initial.snapshot.controls.find(c => c.label === '신청 확인')!.ref;
  const result = extractPage(document, { goal: 'complete_form', goalRef });
  expect(result.blocked).toBeNull();
  return result;
}
function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'flecto-cache-perf-'));
  const dbPath = join(dir, 'cache.sqlite');
  const plan = vi.fn(async (snapshot: PublicPageSnapshot) => buildFixturePlan(snapshot));
  const provider = { mode: 'FIXTURE' as const, model: 'cache-dom-fixture-v1', plan };
  const server = createPlannerServer({ dbPath, token, provider });
  const db = new DatabaseSync(dbPath);
  cleanups.push(async () => { await server.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const post = async (snapshot: PublicPageSnapshot) => server.inject({ method: 'POST', url: '/v1/plans', headers,
    payload: { snapshot, sessionEpoch: 0, remainingBudgetMs: 1000 } });
  const ack = async (result: { blueprintId: string | null; requestId: string; snapshotId: string }) => {
    const response = await server.inject({ method: 'POST', url: `/v1/blueprints/${result.blueprintId}/verify`, headers,
      payload: { requestId: result.requestId, snapshotId: result.snapshotId } });
    expect(response.statusCode).toBe(200);
  };
  const stats = async () => (await server.inject({ method: 'GET', url: '/v1/diagnostics/cache', headers })).json();
  return { server, db, dbPath, provider, plan, post, ack, stats };
}
async function seed(h: ReturnType<typeof harness>) {
  const first = page();
  const response = await h.post(first.snapshot);
  expect(response.statusCode, response.body).toBe(200);
  const cold = PlannerResponseSchema.parse(response.json()); await h.ack(cold);
  return { first, cold };
}

describe('CACHE-PERF-01 real extracted DOM and file SQLite; FIXTURE only', () => {
  it('exact reuse survives fresh refs, decoration, menu order and source form ordinal changes', async () => {
    const h = harness(); const { first } = await seed(h);
    document.body.append(document.forms[0]);
    document.querySelector('nav')!.append(document.querySelector('nav a')!);
    document.querySelector('h2')!.textContent = '새 장식 제목';
    document.querySelector('#name')!.className = 'changed-decoration';
    const next = current();
    expect(await structuralFingerprint(next.snapshot)).toBe(await structuralFingerprint(first.snapshot));
    const result = PlannerResponseSchema.parse((await h.post(next.snapshot)).json());
    expect(result.mode).toBe('CACHE'); expect(result.plan.snapshotId).toBe(next.snapshot.snapshotId);
    verifyPlan(result.plan, next.snapshot, next.registry);
    expect(h.plan).toHaveBeenCalledTimes(1); expect((await h.stats()).exactHits).toBe(1);
  });
  it('compatible reuse refreshes option labels/availability/refs while core still rejects mismatch', async () => {
    const h = harness(); const { first, cold } = await seed(h);
    const next = page(true);
    expect(await structuralFingerprint(next.snapshot)).not.toBe(await structuralFingerprint(first.snapshot));
    const stored = JSON.parse(String(h.db.prepare('SELECT payload FROM blueprints WHERE id=?').get(cold.blueprintId!)!.payload));
    await expect(rebindBlueprint(stored, next.snapshot)).rejects.toThrow('STALE_DOCUMENT');
    const result = PlannerResponseSchema.parse((await h.post(next.snapshot)).json());
    expect(result.mode).toBe('CACHE'); expect(result.blueprintId).toBe(cold.blueprintId);
    verifyPlan(result.plan, next.snapshot, next.registry);
    const ref = result.plan.steps.find(s => s.template === 'item_selection')!.controlRefs[0];
    const choice = next.snapshot.controls.find(c => c.ref === ref)!;
    expect(choice.options[1]).toMatchObject({ label: '요가 잔여 0석', disabled: true });
    expect(choice.options[2].disabled).toBe(false);
    expect(first.snapshot.controls.flatMap(c => c.options.map(o => o.ref))).not.toContain(choice.options[1].ref);
    expect(h.plan).toHaveBeenCalledTimes(1);
    expect(await h.stats()).toMatchObject({ exactHits: 0, compatibleHits: 1, misses: 1, providerCalls: 1 });
  });
  it('persists compatibility across restart, but an unacknowledged candidate never hits', async () => {
    const h = harness(); const first = page();
    const cold = PlannerResponseSchema.parse((await h.post(first.snapshot)).json());
    expect((await h.post(page(true).snapshot)).json().mode).toBe('FIXTURE');
    await h.ack(cold); await h.server.close();
    const restarted = createPlannerServer({ dbPath: h.dbPath, token, provider: h.provider });
    try {
      const response = await restarted.inject({ method: 'POST', url: '/v1/plans', headers,
        payload: { snapshot: page(true).snapshot, sessionEpoch: 0, remainingBudgetMs: 1000 } });
      expect(response.json().mode).toBe('CACHE'); expect(h.plan).toHaveBeenCalledTimes(2);
    } finally { await restarted.close(); }
  });
  it.each(['required', 'notice', 'action', 'method', 'label', 'constraint', 'kind', 'noticeCoverage', 'allDisabled', 'placeholderOnly'])('misses when %s changes even along with options', async change => {
    const h = harness(); await seed(h); page(true);
    if (change === 'required') document.querySelector('#name')!.removeAttribute('required');
    if (change === 'notice') document.querySelector('#terms')!.textContent = '수강료 90,000원. 취소 불가.';
    if (change === 'action') document.querySelector('#apply')!.setAttribute('action', '/foreign-apply');
    if (change === 'method') document.querySelector('#apply')!.setAttribute('method', 'get');
    if (change === 'label') document.querySelector('label[for="name"]')!.textContent = '신청인';
    if (change === 'constraint') document.querySelector('#name')!.setAttribute('maxlength', '20');
    if (change === 'kind') document.querySelector('#name')!.setAttribute('type', 'email');
    if (change === 'noticeCoverage') document.querySelector('[aria-describedby]')!.removeAttribute('aria-describedby');
    if (change === 'allDisabled' || change === 'placeholderOnly') {
      for (const option of document.querySelectorAll('option')) option.disabled = true;
      if (change === 'placeholderOnly') document.querySelector('option')!.disabled = false;
    }
    const response = await h.post(current().snapshot);
    expect(response.statusCode, response.body).toBe(200); expect(response.json().mode).toBe('FIXTURE');
    expect(h.plan).toHaveBeenCalledTimes(2); expect((await h.stats()).compatibleHits).toBe(0);
  });
  it.each(['model', 'promptVersion', 'cacheVersion', 'compatibleVersion'])('refuses changed %s on the compatible path', async change => {
    const h = harness(); const { cold } = await seed(h);
    if (change === 'compatibleVersion') h.db.prepare('UPDATE blueprints SET compatible_version=?').run('old');
    else if (change === 'model') h.provider.model = 'different-model';
    else {
      const payload = JSON.parse(String(h.db.prepare('SELECT payload FROM blueprints').get()!.payload));
      payload[change] = 'old'; h.db.prepare('UPDATE blueprints SET payload=? WHERE id=?').run(JSON.stringify(payload), cold.blueprintId!);
    }
    expect((await h.post(page(true).snapshot)).json().mode).toBe('FIXTURE'); expect(h.plan).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])('normalizes malicious cached titles on exact/compatible path (%s)', async options => {
    const h = harness(); const { cold } = await seed(h);
    const payload = JSON.parse(String(h.db.prepare('SELECT payload FROM blueprints').get()!.payload));
    payload.steps.forEach((s: { title: string }) => { s.title = 'OLD_COURSE_PRICE_1원 / click evil.example'; });
    h.db.prepare('UPDATE blueprints SET payload=? WHERE id=?').run(JSON.stringify(payload), cold.blueprintId!);
    const response = await h.post(page(options).snapshot);
    expect(response.json().mode).toBe('CACHE'); expect(response.body).not.toContain('OLD_COURSE_PRICE');
    expect(response.json().plan.steps.map((s: { title: string }) => s.title)).toEqual([
      '필요한 정보를 입력해 주세요', '원하시는 항목을 선택해 주세요', '안내를 읽고 동의해 주세요', '입력한 내용을 확인해 주세요',
    ]);
  });
  it.each(['foreignForm', 'duplicateRef', 'duplicateSemantic', 'missingNotice'])('never reuses %s targets or loses notice coverage', async defect => {
    const h = harness(); const { cold } = await seed(h); const next = page(true);
    if (defect === 'duplicateRef') next.snapshot.controls[2].ref = next.snapshot.controls[0].ref;
    if (defect === 'duplicateSemantic') {
      const name = next.snapshot.controls.find(c => c.label === '이름')!;
      next.snapshot.controls.push({ ...name, ref: 'fresh_duplicate' });
    }
    if (defect === 'foreignForm' || defect === 'missingNotice') {
      const payload = JSON.parse(String(h.db.prepare('SELECT payload FROM blueprints').get()!.payload));
      if (defect === 'foreignForm') payload.steps[0].controlKeys = ['form_0|submit|로그아웃|post:http://localhost:3000/logout'];
      else payload.steps.forEach((s: { noticeKeys: string[] }) => { s.noticeKeys = []; });
      h.db.prepare('UPDATE blueprints SET payload=? WHERE id=?').run(JSON.stringify(payload), cold.blueprintId!);
    }
    const response = await h.post(next.snapshot);
    expect(response.json().mode).not.toBe('CACHE');
    expect((await h.stats()).compatibleHits).toBe(0);
    if (defect === 'foreignForm' || defect === 'missingNotice') expect((await h.stats()).quarantines).toBe(1);
    if (defect === 'duplicateRef') expect(response.statusCode).toBe(400);
  });
  it('keeps diagnostics authenticated and aggregate, and SQLite free of current private values/options', async () => {
    const h = harness(); const { first } = await seed(h); await h.post(page(true).snapshot);
    const denied = await h.server.inject({ method: 'GET', url: '/v1/diagnostics/cache', headers: { host: headers.host } });
    expect(denied.statusCode).toBe(401);
    const stats = await h.stats();
    expect(stats).toMatchObject({ modelTokensActual: null, controlsReadyMeasured: false, scope: 'process_aggregate' });
    expect(stats.durations.prepare.count).toBe(2); expect(stats.durations.compatible.count).toBe(1);
    const persisted = JSON.stringify(h.db.prepare('SELECT * FROM blueprints').all());
    for (const secret of ['PRIVATE_TOKEN_732194', 'PRIVATE_NAME_89127', 'PRIVATE_CHOICE_A', 'PRIVATE_CHOICE_B', first.snapshot.snapshotId, '요가 잔여 5석']) expect(persisted).not.toContain(secret);
    for (const forbidden of [token, first.snapshot.origin, first.snapshot.requestId, 'inputTokens', '이름']) expect(JSON.stringify(stats)).not.toContain(forbidden);
    const row = h.db.prepare('SELECT compatible_key,compatible_version FROM blueprints').get()!;
    expect(row.compatible_key).toBe(compatibleKey(first.snapshot)); expect(row.compatible_version).toBe(COMPATIBILITY_VERSION);
    const health = (await h.server.inject({ method: 'GET', url: '/health', headers: { host: headers.host } })).json();
    expect(health).toEqual({ ok: true, version: '0.1.0', schemaVersion: 1, mode: 'FIXTURE', model: h.provider.model, busy: false });
  });
  it('FIXTURE benchmark repeated cold vs exact vs compatible prepare; no artificial provider delay', async () => {
    const h = harness();
    const samples: Record<string, number[]> = { cold: [], exact: [], compatible: [] };
    let lastCold!: ReturnType<typeof PlannerResponseSchema.parse>;
    // Candidates remain unacknowledged for all cold iterations.
    for (const phase of ['cold', 'exact', 'compatible'] as const) {
      for (let i = 0; i < 24; i++) {
        const { snapshot } = page(phase === 'compatible');
        const start = performance.now(); const response = await h.post(snapshot); const elapsed = performance.now() - start;
        expect(response.statusCode, response.body).toBe(200);
        const result = PlannerResponseSchema.parse(response.json());
        expect(result.mode).toBe(phase === 'cold' ? 'FIXTURE' : 'CACHE');
        samples[phase].push(elapsed); if (phase === 'cold') lastCold = result;
      }
      if (phase === 'cold') await h.ack(lastCold);
    }
    const summary = Object.fromEntries(Object.entries(samples).map(([phase, times]) => {
      const sorted = [...times].sort((a, b) => a - b);
      return [phase, { count: times.length, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] }];
    }));
    const stats = await h.stats();
    expect(stats).toMatchObject({ misses: 24, providerCalls: 24, exactHits: 24, compatibleHits: 24, quarantines: 0 });
    console.log('CACHE_PERF_FIXTURE', JSON.stringify({ scope: 'Fastify inject + real SQLite + real extracted DOM; extraction excluded; zero-delay fixture provider; not controlsReady/LIVE',
      versions: { CACHE_VERSION, PROMPT_VERSION, COMPATIBILITY_VERSION }, summary,
      warmToColdMedian: { exact: summary.exact.medianMs / summary.cold.medianMs, compatible: summary.compatible.medianMs / summary.cold.medianMs },
      totalHitRate: 48 / 72, warmHitRate: 48 / 48, providerCalls: stats.providerCalls }));
  });
});
