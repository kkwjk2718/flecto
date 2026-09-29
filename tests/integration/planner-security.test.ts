import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  CACHE_VERSION, EXTENSION_ORIGIN, PROMPT_VERSION, PlannerResponseSchema,
  type PagePlan, type PlanProvider, type PublicControl, type PublicPageSnapshot,
} from '@flecto/contracts';
import { rebindBlueprint, structuralFingerprint } from '@flecto/core';
import { createPlannerServer } from '../../apps/planner/src/server';
import { FixtureProvider } from '../../apps/planner/src/provider/fixture';
import { buildPlanPrompt } from '../../apps/planner/src/provider/prompt';

// Independent public structure, using the extractor's real key format. No source
// application DB, expected submission result, QA token or private value is input.
function snapshot(id = 'first', ordinal = 1): PublicPageSnapshot {
  const form = `f_${id}`, key = `form_${ordinal}`;
  const control = (name: string, kind: PublicControl['kind'], label: string): PublicControl => ({
    ref: `e_${id}_${name}`, kind, label, formRef: form, required: kind !== 'submit', disabled: false,
    semanticKey: `${key}|${kind}|${label}${kind === 'submit' ? '|post:http://127.0.0.1:4173/apply' : ''}`,
    constraints: {}, options: [], noticeRefs: [], actionKind: kind === 'submit' ? 'submit' : 'none',
  });
  const order = control('order', 'text', '주문번호');
  const choice = control('choice', 'select', '상품분류');
  choice.options = [{ ref: `o_${id}`, label: '가전', disabled: false }];
  const consent = control('consent', 'checkbox', '조건에 동의합니다');
  consent.noticeRefs = [`n_${id}`];
  const action = control('apply', 'submit', '신청 내용 확인');
  const menu: PublicControl = { ...control('menu', 'link', ordinal ? '홈' : '내역'), formRef: null,
    required: false, actionKind: 'navigate', semanticKey: `page|link|${ordinal ? '홈' : '내역'}|get:http://127.0.0.1:4173/` };
  const logout: PublicControl = { ...control('logout', 'submit', '로그아웃'), formRef: `logout_${id}`,
    semanticKey: `form_${ordinal ? 0 : 1}|submit|로그아웃|post:http://127.0.0.1:4173/logout` };
  return { schemaVersion: 1, requestId: `r_${id}`, snapshotId: `s_${id}`, documentInstanceId: `d_${id}`,
    origin: 'http://127.0.0.1:4173', goal: 'complete_form', goalRef: action.ref,
    semanticRevision: 0, optionRevision: 0, controls: [menu, logout, order, choice, consent, action],
    notices: [{ ref: `n_${id}`, text: '공개 신청 조건', kind: 'terms', formRef: form, semanticKey: `${key}|notice|공개 신청 조건` }],
  };
}
function publicPlan(s: PublicPageSnapshot): PagePlan {
  const action = s.controls.find(c => c.ref === s.goalRef)!;
  const inputs = s.controls.filter(c => c.formRef === action.formRef && c.actionKind === 'none');
  return { schemaVersion: 1, snapshotId: s.snapshotId, sourceActionRef: action.ref, steps: [
    { id: 'details', template: 'grouped_form', title: '정보', controlRefs: inputs.filter(c => c.kind !== 'checkbox').map(c => c.ref), noticeRefs: [] },
    { id: 'consent', template: 'consent', title: '조건', controlRefs: inputs.filter(c => c.kind === 'checkbox').map(c => c.ref), noticeRefs: s.notices.map(n => n.ref) },
  ] };
}
const token = 'planner-qa-only-pairing-token-12345';
const headers = { host: '127.0.0.1:4317', origin: EXTENSION_ORIGIN, authorization: `Bearer ${token}` };
const privateSentinels = { value: 'PRIVATE_ORDER_97531', cookie: 'PRIVATE_COOKIE_86420', password: 'PRIVATE_PASSWORD_75319', qaToken: 'PRIVATE_QA_ORACLE_64208' };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function harness(implementation: PlanProvider['plan'] = async s => publicPlan(s), mode: PlanProvider['mode'] = 'FIXTURE', model = 'qa-public-v1') {
  const dir = mkdtempSync(join(tmpdir(), 'flecto-planner-qa-'));
  const dbPath = join(dir, 'cache.sqlite');
  const plan = vi.fn(implementation);
  const provider: PlanProvider = { mode, model, plan };
  const server = createPlannerServer({ dbPath, token, provider, allowedSourceOrigins: [snapshot().origin] });
  const db = new DatabaseSync(dbPath);
  cleanups.push(async () => { await server.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const post = (s = snapshot(), remainingBudgetMs = 1000, sessionEpoch = 0) => server.inject({ method: 'POST', url: '/v1/plans', headers, payload: { snapshot: s, remainingBudgetMs, sessionEpoch } });
  const ack = (id: string, s: PublicPageSnapshot) => server.inject({ method: 'POST', url: `/v1/blueprints/${id}/verify`, headers, payload: { requestId: s.requestId, snapshotId: s.snapshotId } });
  const rows = () => db.prepare('SELECT * FROM blueprints').all();
  return { server, db, dbPath, provider, plan, post, ack, rows };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

describe('PLANNER-QA-01 HTTP boundary and real SQLite (T20/T29/T31)', () => {
  it.each([
    { host: 'evil.example' }, { host: 'localhost:4317' }, { origin: 'https://evil.example' },
    { origin: 'null' }, { origin: undefined }, { authorization: undefined }, { authorization: 'Bearer wrong-token' },
  ])('rejects unauthenticated/forged access %j before provider or DB', async override => {
    const h = harness();
    const requestHeaders = Object.fromEntries(Object.entries({ ...headers, ...override }).filter((entry): entry is [string, string] => entry[1] !== undefined));
    const response = await h.server.inject({ method: 'POST', url: '/v1/plans', headers: requestHeaders, payload: { snapshot: snapshot(), remainingBudgetMs: 1000, sessionEpoch: 0 } });
    expect([401, 403]).toContain(response.statusCode); expect(response.json()).toEqual({ error: 'AUTH_REQUIRED' });
    expect(h.plan).not.toHaveBeenCalled(); expect(h.rows()).toHaveLength(0);
  });
  it('permits only extension CORS preflight and keeps health non-secret', async () => {
    const h = harness();
    const allowed = await h.server.inject({ method: 'OPTIONS', url: '/v1/plans', headers: { host: headers.host, origin: headers.origin } });
    expect(allowed.statusCode).toBe(204); expect(allowed.headers['access-control-allow-origin']).toBe(headers.origin);
    const denied = await h.server.inject({ method: 'OPTIONS', url: '/v1/plans', headers: { host: headers.host, origin: 'https://evil.example' } });
    expect(denied.statusCode).toBe(403); expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    const health = await h.server.inject({ method: 'GET', url: '/health', headers: { host: headers.host } });
    expect(health.statusCode).toBe(200); expect(health.body).not.toContain(token);
  });
  it.each(['request', 'snapshot', 'control', 'option', 'notice', 'constraints'])('rejects private extras at %s boundary', async level => {
    const h = harness(), s = snapshot();
    const body = { snapshot: s, remainingBudgetMs: 1000, sessionEpoch: 0 };
    const target = level === 'request' ? body : level === 'snapshot' ? s : level === 'notice' ? s.notices[0] : level === 'option' ? s.controls[3].options[0] : level === 'constraints' ? s.controls[2].constraints : s.controls[2];
    Object.assign(target, privateSentinels);
    const response = await h.server.inject({ method: 'POST', url: '/v1/plans', headers, payload: body });
    expect(response.statusCode).toBe(400); expect(response.json()).toEqual({ error: 'SCHEMA_INVALID' });
    expect(h.plan).not.toHaveBeenCalled(); expect(h.rows()).toHaveLength(0);
    for (const sentinel of Object.values(privateSentinels)) expect(response.body).not.toContain(sentinel);
  });
  it('rejects metric extras and treats accepted caller statistics only as telemetry', async () => {
    const h = harness();
    const metric = { schemaVersion: 1, requestId: 'qa_metric', mode: 'LIVE_CODEX', phase: 'source_result', durationMs: 1,
      result: 'PASS', error: null, sponsorShown: true, inputTokens: null, outputTokens: null, model: 'claimed-model', promptVersion: PROMPT_VERSION };
    const rejected = await h.server.inject({ method: 'POST', url: '/v1/metrics', headers, payload: { ...metric, ...privateSentinels } });
    expect(rejected.statusCode).toBe(400); expect(h.db.prepare('SELECT * FROM plan_runs').all()).toHaveLength(0);
    const accepted = await h.server.inject({ method: 'POST', url: '/v1/metrics', headers, payload: metric });
    expect(accepted.json()).toEqual({ ok: true }); expect(h.rows()).toHaveLength(0); expect(h.plan).not.toHaveBeenCalled();
    expect(h.db.prepare('SELECT * FROM plan_runs').all()).toHaveLength(1);
    expect(h.db.prepare('SELECT impressions FROM sponsor_aggregate').get()?.impressions).toBe(1);
  });
  it('validates coverage and sends only public snapshot to provider/prompt/cache', async () => {
    const fixture = new FixtureProvider();
    const h = harness(fixture.plan.bind(fixture)), s = snapshot();
    const response = await h.post(s); expect(response.statusCode).toBe(200);
    const result = PlannerResponseSchema.parse(response.json());
    expect(result.plan.sourceActionRef).toBe(s.goalRef);
    expect(result.plan.steps.flatMap(step => step.controlRefs).sort()).toEqual(s.controls.filter(c => c.required).map(c => c.ref).sort());
    expect(result.plan.steps.flatMap(step => step.noticeRefs)).toContain(s.notices[0].ref);
    expect(h.plan.mock.calls[0][0]).toEqual(s); expect(h.rows()[0].status).toBe('CANDIDATE');
    const persisted = String(h.rows()[0].payload);
    const prompt = buildPlanPrompt(h.plan.mock.calls[0][0]);
    for (const sentinel of Object.values(privateSentinels)) { expect(prompt).not.toContain(sentinel); expect(persisted).not.toContain(sentinel); }
    for (const ref of [s.requestId, s.snapshotId, s.documentInstanceId, ...s.controls.map(c => c.ref), ...s.notices.map(n => n.ref)]) expect(persisted).not.toContain(ref);
  });
  it('rejects an unapproved source origin', async () => {
    const h = harness(); expect((await h.post({ ...snapshot(), origin: 'https://outside.example' })).statusCode).toBe(403); expect(h.plan).not.toHaveBeenCalled();
  });
});

describe('candidate ACK and semantic cache (T21/T37/T39)', () => {
  it('binds ACK to request/snapshot/blueprint; candidates never hit and a fresh document rebinds', async () => {
    const h = harness(), first = snapshot(), second = snapshot('second');
    const one = (await h.post(first)).json();
    expect((await h.post(second)).json().mode).toBe('FIXTURE'); expect(h.plan).toHaveBeenCalledTimes(2);
    expect((await h.ack(one.blueprintId, second)).statusCode).toBe(409);
    expect((await h.ack(one.blueprintId, { ...first, snapshotId: 'wrong' })).statusCode).toBe(409);
    expect((await h.ack('unknown', first)).statusCode).toBe(409);
    expect(h.rows().every(row => row.status === 'CANDIDATE')).toBe(true);
    expect((await h.ack(one.blueprintId, first)).statusCode).toBe(200);
    expect((await h.ack(one.blueprintId, first)).statusCode).toBe(409);
    const current = snapshot('third'), warm = (await h.post(current)).json();
    expect(warm.mode).toBe('CACHE'); expect(h.plan).toHaveBeenCalledTimes(2);
    expect(warm.plan).toEqual(publicPlan(current));
  });
  it('reuses selected-form cache after form ordinal/menu/document ID changes, using core rebinding', async () => {
    const h = harness(), first = snapshot(), current = snapshot('moved', 0);
    expect(await structuralFingerprint(first)).toBe(await structuralFingerprint(current));
    const cold = (await h.post(first)).json(); await h.ack(cold.blueprintId, first);
    const blueprint = JSON.parse(String(h.rows()[0].payload));
    const corePlan = await rebindBlueprint(blueprint, current);
    expect(corePlan).toEqual(publicPlan(current));
    const warm = (await h.post(current)).json(); expect(warm.mode).toBe('CACHE'); expect(warm.plan).toEqual(corePlan);
    expect(h.plan).toHaveBeenCalledTimes(1); expect(h.rows()).toHaveLength(1);
  });
  it.each(['same', 'mode', 'model'])('persists cache across server restart, partitioned by %s identity', async identity => {
    const h = harness(), first = snapshot(); const cold = (await h.post(first)).json(); await h.ack(cold.blueprintId, first);
    await h.server.close();
    const plan = vi.fn(async (s: PublicPageSnapshot) => publicPlan(s));
    const provider: PlanProvider = { mode: identity === 'mode' ? 'LIVE_CODEX' : 'FIXTURE', model: identity === 'model' ? 'new-model' : h.provider.model, plan };
    const restarted = createPlannerServer({ dbPath: h.dbPath, token, provider });
    try {
      const current = snapshot('restart', 0);
      const response = await restarted.inject({ method: 'POST', url: '/v1/plans', headers, payload: { snapshot: current, remainingBudgetMs: 1000, sessionEpoch: 0 } });
      expect(response.statusCode).toBe(200); expect(response.json().mode).toBe(identity === 'same' ? 'CACHE' : provider.mode);
      expect(plan).toHaveBeenCalledTimes(identity === 'same' ? 0 : 1); expect(response.json().plan).toEqual(publicPlan(current));
    } finally { await restarted.close(); }
  });
  it('cancellation revokes an outstanding candidate receipt', async () => {
    const h = harness(), s = snapshot(); const response = (await h.post(s)).json();
    await h.server.inject({ method: 'DELETE', url: `/v1/plans/${s.requestId}`, headers });
    expect((await h.ack(response.blueprintId, s)).statusCode).toBe(409); expect(h.rows()[0].status).toBe('CANDIDATE');
  });
  it.each(['model', 'promptVersion', 'cacheVersion', 'status', 'origin', 'fingerprint', 'schemaVersion'])('quarantines mismatched payload %s even if index metadata is current', async field => {
    const h = harness(), first = snapshot(); const cold = (await h.post(first)).json(); await h.ack(cold.blueprintId, first);
    const payload = JSON.parse(String(h.rows()[0].payload));
    payload[field] = field === 'schemaVersion' ? 2 : field === 'status' ? 'CANDIDATE' : 'stale-version';
    h.db.prepare('UPDATE blueprints SET payload=? WHERE id=?').run(JSON.stringify(payload), cold.blueprintId);
    const next = await h.post(snapshot('next')); expect(next.statusCode).toBe(200); expect(next.json().mode).toBe('FIXTURE');
    expect(h.plan).toHaveBeenCalledTimes(2); expect(h.rows().find(r => r.id === cold.blueprintId)?.status).toBe('QUARANTINED');
  });
  it.each(['model', 'version'])('does not mix different indexed %s namespaces', async field => {
    const h = harness(), first = snapshot(); const cold = (await h.post(first)).json(); await h.ack(cold.blueprintId, first);
    if (field === 'model') h.db.prepare('UPDATE blueprints SET model=?').run('LIVE_CODEX:other-model');
    else h.db.prepare('UPDATE blueprints SET version=?').run(`old-prompt:${CACHE_VERSION}`);
    expect((await h.post(snapshot('next'))).json().mode).toBe('FIXTURE'); expect(h.plan).toHaveBeenCalledTimes(2);
  });
  it.each(['required', 'notice', 'option'])('does not reuse a changed %s structure', async change => {
    const h = harness(), first = snapshot(); const cold = (await h.post(first)).json(); await h.ack(cold.blueprintId, first);
    const current = snapshot('changed');
    if (change === 'required') current.controls[2].required = false;
    if (change === 'notice') current.notices[0].text = '새 공개 조건';
    if (change === 'option') current.controls[3].options[0].disabled = true;
    expect((await h.post(current)).json().mode).toBe('FIXTURE'); expect(h.plan).toHaveBeenCalledTimes(2);
  });
});

describe('singleflight, cancellation and provider integrity (T33/T35)', () => {
  it('shares exact requests once; rejects changed payload/epoch and a different request as BUSY', async () => {
    const gate = deferred<PagePlan>(), started = deferred<void>();
    const h = harness(async () => { started.resolve(); return gate.promise; });
    const s = snapshot(), first = h.post(s).then(r => r); await started.promise;
    const duplicate = h.post(s).then(r => r);
    expect((await h.post({ ...s, snapshotId: 'changed' })).json().error).toBe('STALE_DOCUMENT');
    expect((await h.post(s, 1000, 1)).json().error).toBe('STALE_DOCUMENT');
    expect((await h.post(s, 900)).json().error).toBe('STALE_DOCUMENT');
    expect((await h.post(snapshot('other'))).json().error).toBe('BUSY');
    gate.resolve(publicPlan(s)); const results = await Promise.all([first, duplicate]);
    expect(results.map(r => r.statusCode)).toEqual([200, 200]); expect(results[0].json()).toEqual(results[1].json());
    expect(h.plan).toHaveBeenCalledTimes(1); expect(h.rows()).toHaveLength(1);
  });
  it.each(['cancel', 'deadline'])('discards a late provider response after %s and retains the occupied slot', async reason => {
    const gate = deferred<PagePlan>(), started = deferred<void>(); let signal!: AbortSignal;
    const h = harness(async (_s, _budget, sig) => { signal = sig; started.resolve(); return gate.promise; });
    const s = snapshot(), pending = h.post(s, reason === 'deadline' ? 40 : 1000).then(r => r); await started.promise;
    if (reason === 'cancel') await h.server.inject({ method: 'DELETE', url: `/v1/plans/${s.requestId}`, headers });
    const response = await pending; expect(response.statusCode).toBe(reason === 'cancel' ? 499 : 504);
    expect(response.json().error).toBe(reason === 'cancel' ? 'CANCELLED' : 'DEADLINE_EXCEEDED'); expect(signal.aborted).toBe(true);
    expect((await h.post(snapshot('other'))).json().error).toBe('BUSY');
    // Reusing the cancelled id must not bypass the provider occupancy guard.
    const retry = await h.post(s, 50); gate.resolve(publicPlan(s));
    expect(retry.json().error).toBe('BUSY');
    expect(h.plan).toHaveBeenCalledTimes(1); expect(h.rows()).toHaveLength(0);
    expect((await h.ack('invented', s)).statusCode).toBe(409);
  });
  it.each(['cancel', 'deadline'])('honors %s during asynchronous fingerprinting before provider start', async reason => {
    const gate = deferred<void>(), entered = deferred<void>(); const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => { entered.resolve(); await gate.promise; return digest(algorithm, data); });
    const h = harness(), s = snapshot(), pending = h.post(s, reason === 'deadline' ? 40 : 1000).then(r => r); await entered.promise;
    if (reason === 'cancel') await h.server.inject({ method: 'DELETE', url: `/v1/plans/${s.requestId}`, headers });
    try { expect((await pending).statusCode).toBe(reason === 'cancel' ? 499 : 504); }
    finally { gate.resolve(); await new Promise(resolve => setImmediate(resolve)); }
    expect(h.plan).not.toHaveBeenCalled(); expect(h.rows()).toHaveLength(0);
  });
  it.each(['cancel', 'deadline'])('discards cache rebind after %s without a new provider call or ACK', async reason => {
    const h = harness(), first = snapshot(), cold = (await h.post(first)).json(); await h.ack(cold.blueprintId, first);
    const gate = deferred<void>(), entered = deferred<void>(), digest = crypto.subtle.digest.bind(crypto.subtle);
    let calls = 0;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      if (++calls === 2) { entered.resolve(); await gate.promise; }
      return digest(algorithm, data);
    });
    const current = snapshot('warm'), pending = h.post(current, reason === 'deadline' ? 40 : 1000).then(r => r); await entered.promise;
    if (reason === 'cancel') await h.server.inject({ method: 'DELETE', url: `/v1/plans/${current.requestId}`, headers });
    try { expect((await pending).statusCode).toBe(reason === 'cancel' ? 499 : 504); }
    finally { gate.resolve(); await new Promise(resolve => setImmediate(resolve)); }
    expect(h.plan).toHaveBeenCalledTimes(1); expect((await h.ack(cold.blueprintId, current)).statusCode).toBe(409);
    expect(h.rows()).toHaveLength(1); expect(h.rows()[0].status).toBe('VERIFIED');
  });
  it('does not fall back to fixture on LIVE provider failure or leak its error', async () => {
    const h = harness(async () => { throw new Error(privateSentinels.password); }, 'LIVE_CODEX');
    const result = await h.post(); expect(result.statusCode).toBe(422); expect(result.json().error).toBe('PROVIDER_ERROR');
    expect(result.body).not.toContain(privateSentinels.password); expect(h.rows()).toHaveLength(0); expect(h.plan).toHaveBeenCalledTimes(1);
  });
  it('releases provider occupancy even when a provider throws synchronously', async () => {
    const h = harness(() => { throw new Error('synchronous provider failure'); }, 'LIVE_CODEX');
    expect((await h.post()).json().error).toBe('PROVIDER_ERROR');
    expect((await h.post(snapshot('retry'))).json().error).toBe('PROVIDER_ERROR');
    expect(h.plan).toHaveBeenCalledTimes(2); expect(h.rows()).toHaveLength(0);
    expect((await h.server.inject({ method: 'GET', url: '/health', headers: { host: headers.host } })).json().busy).toBe(false);
  });
  it.each(['unknownRef', 'missingRequired', 'missingNotice', 'wrongSnapshot', 'extraCode', 'wrongForm', 'duplicate', 'wrongConsent'])('rejects malformed model plan %s before SQLite writes', async defect => {
    const h = harness(async s => {
      const plan = publicPlan(s);
      if (defect === 'unknownRef') plan.steps[0].controlRefs.push('unknown');
      if (defect === 'missingRequired') plan.steps[0].controlRefs.shift();
      if (defect === 'missingNotice') plan.steps[1].noticeRefs = [];
      if (defect === 'wrongSnapshot') plan.snapshotId = 'stale';
      if (defect === 'extraCode') Object.assign(plan, { code: 'fetch("https://evil.example")' });
      if (defect === 'wrongForm') plan.steps[0].controlRefs.push(s.controls[1].ref);
      if (defect === 'duplicate') plan.steps[1].controlRefs.push(plan.steps[0].controlRefs[0]);
      if (defect === 'wrongConsent') plan.steps[1].template = 'grouped_form';
      return plan;
    }, 'LIVE_CODEX');
    const response = await h.post(); expect(response.statusCode).toBe(422); expect(h.rows()).toHaveLength(0);
  });
});
