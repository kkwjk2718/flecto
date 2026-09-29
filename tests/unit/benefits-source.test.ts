import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { createBenefitsServer, type BenefitsServerOptions } from '../../apps/demo-benefits/src/server.js';

function input(html: string, name: string): string {
  return html.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1] ?? '';
}
const fixture = { orderNumber: 'FLECTO-2026-001', purchaseDate: '2026-09-01', category: '가전', consent: 'yes' };
function client(app: FastifyInstance) {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    set cookie(value: string) { cookie = value; },
    async request(url: string, fields?: Record<string, string>, headers: Record<string, string> = {}) {
      const response = await app.inject({ method: fields ? 'POST' : 'GET', url, headers: { ...(cookie ? { cookie } : {}), ...(fields ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...headers }, ...(fields ? { payload: new URLSearchParams(fields).toString() } : {}) });
      const set = response.headers['set-cookie'];
      if (set) cookie = (Array.isArray(set) ? set[0]! : set).split(';')[0]!;
      return response;
    },
    async login() {
      const page = await this.request('/login');
      const response = await this.request('/login', { csrf: input(page.body, 'csrf'), username: 'demo', password: 'flecto2026!' });
      expect(response.statusCode).toBe(303);
      return response;
    },
    async review(values = fixture) {
      const page = await this.request('/apply');
      const response = await this.request('/apply', { csrf: input(page.body, 'csrf'), formToken: input(page.body, 'formToken'), ...values });
      expect(response.statusCode, response.body).toBe(303);
      const review = await this.request(response.headers.location!);
      expect(review.statusCode, review.body).toBe(200);
      return { csrf: input(review.body, 'csrf'), draftId: input(review.body, 'draftId') };
    },
  };
}

describe('independent benefits source / Fastify + real SQLite', () => {
  let app: FastifyInstance;
  let options: BenefitsServerOptions;
  let directory: string;
  let extra: FastifyInstance[];
  beforeEach(() => {
    const root = resolve('apps/demo-benefits/.test-runs');
    mkdirSync(root, { recursive: true });
    directory = mkdtempSync(join(root, 'run-'));
    options = { dbPath: join(directory, 'qa.sqlite'), namespace: 'QA', qaToken: randomBytes(32).toString('hex'), sessionSecret: randomBytes(32).toString('hex') };
    extra = [];
    app = createBenefitsServer(options);
  });
  afterEach(async () => {
    await Promise.all([app.close(), ...extra.map(a => a.close())]);
    rmSync(directory, { recursive: true, force: true });
  });
  const qa = async (app: FastifyInstance, options: BenefitsServerOptions, url: string, payload?: object) => app.inject({ method: payload ? 'POST' : 'GET', url, headers: { 'x-flecto-qa-token': options.qaToken! }, ...(payload ? { payload } : {}) });
  const records = async (app: FastifyInstance, options: BenefitsServerOptions) => (await qa(app, options, '/__qa/records')).json();

  it('does not listen on import or creation and exposes normal independent navigation', async () => {
    expect(app.server.listening).toBe(false);
    const c = client(app);
    const page = await c.request('/');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('href="/guide"');
    expect(page.body).toContain('href="/stores"');
    expect((await c.request('/guide')).body).toContain('신청 방법');
    expect((await c.request('/stores')).body).toContain('10:00–18:00');
    expect((await c.request('/assets/site.css')).statusCode).toBe(200);
    expect(page.body).not.toMatch(/data-flecto|PagePlan|sourceActionRef|__qa|<script/);
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.headers['referrer-policy']).toBe('same-origin');
  });

  it('T01/T09 saves through form POST, redirects, and renders the same original receipt', async () => {
    const c = client(app);
    await c.login();
    const form = await c.review();
    expect((await records(app, options)).count).toBe(0);
    const submitted = await c.request('/apply/submit', form);
    expect(submitted.statusCode).toBe(303);
    const result = await c.request(submitted.headers.location!);
    const saved = await records(app, options);
    expect(saved).toMatchObject({ count: 1, insertionCount: 1, namespace: 'QA' });
    expect(saved.records[0]).toMatchObject({ orderNumber: fixture.orderNumber, purchaseDate: fixture.purchaseDate, category: fixture.category, consent: true });
    expect(result.body).toContain('<section role="status"');
    expect(result.body).toContain(`aria-label="접수 번호">${saved.records[0].id}</output>`);
    expect((await c.request('/history')).body).toContain(saved.records[0].id);
    const db = new DatabaseSync(options.dbPath, { readOnly: true });
    expect(db.prepare('SELECT COUNT(*) AS total FROM records').get()?.total).toBe(1);
    expect(db.prepare('SELECT orderNumber,purchaseDate,category,consent FROM records').get()).toEqual({ orderNumber: fixture.orderNumber, purchaseDate: fixture.purchaseDate, category: fixture.category, consent: 1 });
    db.close();
  });

  it.each(['orderNumber', 'purchaseDate', 'category', 'consent'])('T03/T06 rejects a missing %s on the server', async key => {
    const c = client(app); await c.login();
    const page = await c.request('/apply');
    expect(page.body).not.toContain(' checked');
    const response = await c.request('/apply', { ...fixture, [key]: '', csrf: input(page.body, 'csrf'), formToken: input(page.body, 'formToken') });
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('role="alert"');
    expect(response.body).toContain('aria-invalid="true"');
    expect((await records(app, options)).count).toBe(0);
  });

  it('echoes invalid values escaped only in the local error page and never records them', async () => {
    const c = client(app); await c.login();
    const page = await c.request('/apply');
    const response = await c.request('/apply', { ...fixture, orderNumber: '<img src=x onerror=alert(1)>', csrf: input(page.body, 'csrf'), formToken: input(page.body, 'formToken') });
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(response.body).not.toContain('<img src=x');
    expect(response.body).toContain('value="2026-09-01"');
    expect(response.body).toContain('value="가전" selected');
    expect(JSON.stringify(await records(app, options))).not.toContain('onerror');
    const other = client(app); await other.login();
    expect((await other.request('/apply')).body).not.toContain('onerror');
  });

  it.each([{ purchaseDate: '2026-09-02' }, { category: '임의 분류' }, { orderNumber: 'FLECTO-2026-000' }])('validates actual order fixtures, dates and category: %o', async invalid => {
    const c = client(app); await c.login();
    const page = await c.request('/apply');
    expect((await c.request('/apply', { ...fixture, ...invalid, csrf: input(page.body, 'csrf'), formToken: input(page.body, 'formToken') })).statusCode).toBe(422);
    expect((await records(app, options)).insertionCount).toBe(0);
  });

  it('T07 concurrent duplicate final POST is idempotent; a new application for the order is blocked', async () => {
    const c = client(app); await c.login();
    const form = await c.review();
    const responses = await Promise.all(Array.from({ length: 6 }, () => c.request('/apply/submit', form)));
    expect(responses.every(r => r.statusCode === 303)).toBe(true);
    expect(new Set(responses.map(r => r.headers.location)).size).toBe(1);
    expect(await records(app, options)).toMatchObject({ count: 1, insertionCount: 1 });
    const page = await c.request('/apply');
    const duplicate = await c.request('/apply', { ...fixture, csrf: input(page.body, 'csrf'), formToken: input(page.body, 'formToken') });
    expect(duplicate.statusCode).toBe(422);
    expect(duplicate.body).toContain('이미 접수한 주문');
  });

  it('T37 isolates two sessions, draft access and receipts, while accepting the same order independently', async () => {
    const a = client(app), b = client(app); await a.login(); await b.login();
    const draft = await a.review();
    expect((await b.request(`/apply/review?draft=${draft.draftId}`)).headers.location).toBe('/apply');
    const response = await a.request('/apply/submit', draft);
    expect((await b.request(response.headers.location!)).statusCode).toBe(404);
    expect((await b.request('/history')).body).not.toContain(fixture.orderNumber);
    await b.request('/apply/submit', await b.review());
    const saved = await records(app, options);
    expect(saved.count).toBe(2);
    expect(new Set(saved.records.map((r: { sessionId: string }) => r.sessionId)).size).toBe(2);
    expect(JSON.stringify(saved)).not.toContain(decodeURIComponent(a.cookie.split('=')[1]!).split('.')[0]);
  });

  it('persists signed sessions and actual records across a server restart', async () => {
    const a = client(app); await a.login();
    const submit = await a.request('/apply/submit', await a.review());
    await app.close();
    app = createBenefitsServer(options);
    const restored = client(app); restored.cookie = a.cookie;
    expect((await restored.request(submit.headers.location!)).statusCode).toBe(200);
    expect((await records(app, options)).count).toBe(1);
  });

  it('T12 requires the added field and accepts a newly completed source form', async () => {
    const c = client(app); await c.login();
    await qa(app, options, '/__qa/config', { variant: 'required' });
    const page = await c.request('/apply');
    expect(page.body).toMatch(/name="contactMethod" required/);
    const missing = await c.request('/apply', { ...fixture, csrf: input(page.body, 'csrf'), formToken: input(page.body, 'formToken') });
    expect(missing.statusCode).toBe(422);
    const form = await c.review({ ...fixture, contactMethod: '접수 내역에서 확인' } as typeof fixture);
    await c.request('/apply/submit', form);
    expect((await records(app, options)).records[0].contactMethod).toBe('접수 내역에서 확인');
  });

  it.each(['notice', 'required'])('T12/T14 invalidates a previously rendered form and review on %s changes', async variant => {
    const c = client(app); await c.login();
    const page = await c.request('/apply');
    const review = await c.review();
    await qa(app, options, '/__qa/config', { variant });
    const staleForm = await c.request('/apply', { ...fixture, csrf: input(page.body, 'csrf'), formToken: input(page.body, 'formToken') });
    expect(staleForm.statusCode).toBe(409);
    expect(staleForm.body).not.toContain(' checked');
    const staleReview = await c.request('/apply/submit', review);
    expect(staleReview.statusCode).toBe(409);
    expect(staleReview.body).not.toContain(' checked');
    expect((await records(app, options)).count).toBe(0);
    if (variant === 'notice') {
      expect(staleReview.body).toContain('3,000점');
      const fresh = await c.review(); await c.request('/apply/submit', fresh);
      expect((await records(app, options)).records[0].noticeText).toContain('10월 5일');
    }
  });

  it('T13 unrelated same-label forms do not insert applications', async () => {
    const c = client(app); await c.login();
    await qa(app, options, '/__qa/config', { variant: 'duplicate-form' });
    const page = await c.request('/apply');
    expect(page.body.match(/>신청 내용 확인<\/button>/g)).toHaveLength(2);
    expect(page.body).toContain('<form action="/guide" method="get">');
    const form = await c.review();
    expect((await c.request(`/apply/review?draft=${form.draftId}`)).body.match(/>혜택 신청 제출<\/button>/g)).toHaveLength(2);
    await c.request('/guide');
    expect((await records(app, options)).count).toBe(0);
    await c.request('/apply/submit', form);
    expect((await records(app, options)).count).toBe(1);
  });

  it('T26 changes decoration IDs and navigation order while remaining independently usable', async () => {
    const c = client(app); await c.login();
    await qa(app, options, '/__qa/config', { variant: 'decorations' });
    const first = await c.request('/apply'), second = await c.request('/apply');
    expect(first.body.match(/id="entry-[^"]+-orderNumber"/)?.[0]).not.toBe(second.body.match(/id="entry-[^"]+-orderNumber"/)?.[0]);
    expect(first.body.indexOf('href="/stores"')).toBeLessThan(first.body.indexOf('href="/apply"'));
    await c.request('/apply/submit', await c.review());
    expect((await records(app, options)).count).toBe(1);
  });

  it('T08 rejects without saving or a false success; delayed repeated posts still save once', async () => {
    const c = client(app); await c.login();
    const form = await c.review();
    await qa(app, options, '/__qa/config', { fault: 'rejection' });
    const failed = await c.request('/apply/submit', form);
    expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toContain('<output');
    expect((await records(app, options)).count).toBe(0);
    await qa(app, options, '/__qa/config', { fault: 'delayed', delayMs: 30 });
    const start = Date.now();
    const responses = await Promise.all([c.request('/apply/submit', form), c.request('/apply/submit', form)]);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
    expect(responses.every(r => r.statusCode === 303)).toBe(true);
    expect(await records(app, options)).toMatchObject({ count: 1, insertionCount: 1 });
  });

  it('T08 connection loss after commit leaves one real record and a safe explicit replay', async () => {
    const c = client(app); await c.login();
    const form = await c.review();
    await qa(app, options, '/__qa/config', { fault: 'connection-loss' });
    await expect(c.request('/apply/submit', form)).rejects.toThrow();
    expect(await records(app, options)).toMatchObject({ count: 1, insertionCount: 1 });
    const history = await c.request('/history');
    expect(history.body).toContain(fixture.orderNumber);
    expect((await c.request('/apply/submit', form)).statusCode).toBe(303);
    expect((await records(app, options)).insertionCount).toBe(1);
  });

  it('T29 denies every QA endpoint without the exact secret and never publishes it', async () => {
    for (const url of ['/__qa/records', '/__qa/reset', '/__qa/config']) {
      for (const token of ['', 'wrong', options.qaToken!.slice(1)]) {
        const response = await app.inject({ method: url.endsWith('records') ? 'GET' : 'POST', url, headers: { 'x-flecto-qa-token': token }, ...(url.endsWith('records') ? {} : { payload: { variant: 'notice' } }) });
        expect(response.statusCode).toBe(404);
      }
    }
    const c = client(app); await c.login();
    for (const url of ['/', '/apply', '/login', '/guide', '/history']) {
      const page = await c.request(url);
      expect(page.body).not.toContain(options.qaToken);
      expect(page.body).not.toContain(options.sessionSecret);
      expect(page.body).not.toContain('__qa');
    }
    const disabled = createBenefitsServer({ ...options, dbPath: join(directory, 'disabled.sqlite'), qaToken: undefined }); extra.push(disabled);
    expect((await qa(disabled, options, '/__qa/records')).statusCode).toBe(404);
  });

  it('T37 reset clears only synthetic records/drafts, preserves sessions, and does not cross namespaces', async () => {
    const demoOptions = { ...options, namespace: 'DEMO' as const, dbPath: join(directory, 'demo.sqlite') };
    const demo = createBenefitsServer(demoOptions); extra.push(demo);
    const c = client(app), d = client(demo); await c.login(); await d.login();
    await c.request('/apply/submit', await c.review()); await d.request('/apply/submit', await d.review());
    const reset = await qa(app, options, '/__qa/reset', {});
    expect(reset.statusCode).toBe(200);
    expect(await records(app, options)).toMatchObject({ count: 0, insertionCount: 0 });
    expect((await c.request('/apply')).statusCode).toBe(200);
    expect((await records(demo, demoOptions)).count).toBe(1);
    expect(() => createBenefitsServer({ ...options, namespace: 'DEMO' })).toThrow('namespace');
    const unrelated = join(directory, 'unrelated.sqlite');
    const db = new DatabaseSync(unrelated); db.exec('CREATE TABLE untouched(value TEXT); INSERT INTO untouched VALUES (\'keep\');'); db.close();
    expect(() => createBenefitsServer({ ...options, dbPath: unrelated })).toThrow('not owned');
    const check = new DatabaseSync(unrelated); expect(check.prepare('SELECT value FROM untouched').get()?.value).toBe('keep'); check.close();
  });

  it('T40 protects authenticated routes, rotates login, expires sessions and never echoes passwords', async () => {
    const c = client(app);
    expect((await c.request('/apply')).headers.location).toBe('/login');
    const page = await c.request('/login');
    const anonymous = c.cookie;
    const bad = await c.request('/login', { csrf: input(page.body, 'csrf'), username: 'demo', password: 'SENTINEL_PASSWORD' });
    expect(bad.statusCode).toBe(401);
    expect(bad.body).not.toContain('SENTINEL_PASSWORD');
    const login = await c.login();
    expect(c.cookie).not.toBe(anonymous);
    expect(String(login.headers['set-cookie'])).toMatch(/flecto_benefits=.*HttpOnly; SameSite=Lax/);
    const original = c.cookie;
    c.cookie = original + 'tampered';
    expect((await c.request('/history')).headers.location).toBe('/login');
    c.cookie = original;
    const db = new DatabaseSync(options.dbPath); db.exec('UPDATE sessions SET expires=0'); db.close();
    expect((await c.request('/history')).headers.location).toBe('/login');
    await c.login();
    const home = await c.request('/');
    expect((await c.request('/logout', { csrf: input(home.body, 'csrf') })).statusCode).toBe(303);
    expect((await c.request('/history')).headers.location).toBe('/login');
  });

  it('rejects forged CSRF/cross-origin posts and bounds QA fault configuration', async () => {
    const c = client(app); await c.login();
    expect((await c.request('/apply', { ...fixture, csrf: 'wrong' })).statusCode).toBe(403);
    const form = await c.review();
    expect((await c.request('/apply/submit', form, { origin: 'https://unrelated.invalid' })).statusCode).toBe(403);
    expect((await records(app, options)).count).toBe(0);
    for (const config of [{ delayMs: 2001 }, { delayMs: -1 }, { variant: 'unknown' }, { fault: 'unknown' }, { fake: true }]) expect((await qa(app, options, '/__qa/config', config)).statusCode).toBe(400);
  });

  it('accepts an ordinary same-origin browser POST and uses only server-reviewed values', async () => {
    const c = client(app); await c.login();
    const form = await c.review();
    const submitted = await c.request('/apply/submit', { ...form, orderNumber: 'FLECTO-2026-002', category: '디지털' }, { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173' });
    expect(submitted.statusCode).toBe(303);
    expect((await records(app, options)).records[0]).toMatchObject({ orderNumber: fixture.orderNumber, category: '가전' });
  });

  it('two separately reviewed drafts for the same session/order can insert only once', async () => {
    const c = client(app); await c.login();
    const first = await c.review(), second = await c.review();
    const responses = await Promise.all([c.request('/apply/submit', first), c.request('/apply/submit', second)]);
    expect(responses.map(r => r.statusCode).sort()).toEqual([303, 409]);
    expect(await records(app, options)).toMatchObject({ count: 1, insertionCount: 1 });
  });

  it('reset during a delayed submit invalidates its draft without inserting after reset', async () => {
    const c = client(app); await c.login();
    const form = await c.review();
    await qa(app, options, '/__qa/config', { fault: 'delayed', delayMs: 60 });
    const pending = c.request('/apply/submit', form);
    await qa(app, options, '/__qa/reset', {});
    expect((await pending).statusCode).toBe(409);
    expect(await records(app, options)).toMatchObject({ count: 0, insertionCount: 0 });
  });
});
