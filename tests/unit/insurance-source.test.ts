import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { createBenefitsServer, type BenefitsServerOptions } from '../../apps/demo-benefits/src/server.js';

const fixture = { policyNumber: 'INS-2026-001', applicantName: '김하늘', phone: '01012345678', treatmentDate: '2026-09-01', claimType: '통원', hospitalName: '시연의원', claimAmount: '85000', paymentBank: '시연은행', accountHolder: '김하늘', accountNumber: '1002003004', privacyConsent: 'yes', accuracyConsent: 'yes' };
const expected = { ...fixture, privacyConsent: true, accuracyConsent: true };
function input(html: string, name: string): string {
  return html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))?.[1] ?? '';
}
function client(app: FastifyInstance) {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    set cookie(value: string) { cookie = value; },
    async request(url: string, fields?: Record<string, string>, headers: Record<string, string> = {}) {
      const result = await app.inject({ method: fields ? 'POST' : 'GET', url, headers: { cookie, ...fields ? { 'content-type': 'application/x-www-form-urlencoded' } : {}, ...headers }, ...fields ? { payload: new URLSearchParams(fields).toString() } : {} });
      const set = result.headers['set-cookie'];
      if (set) cookie = (Array.isArray(set) ? set[0]! : set).split(';')[0]!;
      return result;
    },
    async login() {
      const page = await this.request('/login');
      const result = await this.request('/login', { csrf: input(page.body, 'csrf'), username: 'demo', password: 'flecto2026!' });
      expect(result.statusCode).toBe(303);
      expect(result.headers.location).toBe('/');
    },
    async review(overrides: Record<string, string> = {}) {
      const page = await this.request('/insurance/apply');
      const result = await this.request('/insurance/apply', { ...fixture, ...overrides, csrf: input(page.body, 'csrf'), formToken: input(page.body, 'formToken') });
      expect(result.statusCode, result.body).toBe(303);
      expect(result.headers.location).toMatch(/^\/insurance\/review\?draft=/);
      const review = await this.request(result.headers.location!);
      expect(review.statusCode).toBe(200);
      expect(review.body).toContain('아직 접수되지 않았습니다');
      return { csrf: input(review.body, 'csrf'), draftId: input(review.body, 'draftId'), formToken: input(review.body, 'formToken') };
    },
  };
}

describe('synthetic insurance source / real Fastify + SQLite', () => {
  let app: FastifyInstance, options: BenefitsServerOptions, directory: string;
  const extra: FastifyInstance[] = [];
  beforeEach(() => {
    const root = resolve('apps/demo-benefits/.test-runs');
    mkdirSync(root, { recursive: true });
    directory = mkdtempSync(join(root, 'insurance-'));
    options = { dbPath: join(directory, 'insurance.sqlite'), sessionSecret: randomBytes(32).toString('hex'), namespace: 'QA', qaToken: randomBytes(32).toString('hex') };
    app = createBenefitsServer(options);
  });
  afterEach(async () => {
    await app.close();
    await Promise.all(extra.splice(0).map(server => server.close()));
    rmSync(directory, { recursive: true, force: true });
  });
  const qa = (url = '/__qa/insurance/records', payload?: object) => app.inject({ method: payload ? 'POST' : 'GET', url, headers: { 'x-flecto-qa-token': options.qaToken! }, ...payload ? { payload } : {} });
  const records = async () => (await qa()).json();

  it('keeps public native navigation, isolated CSS and no cache; private routes require existing authentication', async () => {
    const c = client(app);
    for (const path of ['/insurance', '/insurance/guide', '/insurance/assets/site.css']) {
      const page = await c.request(path);
      expect(page.statusCode).toBe(200);
      expect(page.headers['cache-control']).toBe('no-store');
      expect(page.body).not.toMatch(/<script|__qa|data-flecto/);
    }
    for (const path of ['/insurance/apply', '/insurance/review?draft=x', '/insurance/history', '/insurance/receipt/x']) expect((await c.request(path)).headers.location).toBe('/login');
    const login = await c.request('/login');
    for (const path of ['/insurance/apply', '/insurance/submit']) expect((await c.request(path, { csrf: input(login.body, 'csrf') })).headers.location).toBe('/login');
    await c.login();
    const page = await c.request('/insurance/apply');
    expect(page.body).not.toMatch(/type="(?:file|password)"|name="(?:ssn|otp|captcha)"| checked/);
    expect(page.body).toContain('/insurance/assets/site.css');
  });

  it('native review does not insert; final user POST saves exact 12 fields, renders receipt and is idempotent', async () => {
    const c = client(app); await c.login();
    const form = await c.review();
    expect(await records()).toMatchObject({ count: 0, insertionCount: 0 });
    const results = await Promise.all(Array.from({ length: 6 }, () => c.request('/insurance/submit', form)));
    expect(results.every(result => result.statusCode === 303)).toBe(true);
    expect(new Set(results.map(result => result.headers.location)).size).toBe(1);
    const saved = await records();
    expect(saved).toMatchObject({ count: 1, insertionCount: 1, namespace: 'QA' });
    expect(saved.records[0]).toMatchObject(expected);
    expect(saved.records[0].id).toMatch(/^INS-DEMO-/);
    expect(saved.records[0]).not.toHaveProperty('session_id');
    const receipt = await c.request(results[0]!.headers.location!);
    expect(receipt.body).toContain('<section role="status"');
    expect(receipt.body).toContain('<h1>보험금 청구서 접수(시연)</h1>');
    expect(receipt.body).toContain(`aria-label="접수번호">${saved.records[0].id}</output>`);
    for (const value of Object.values(fixture).filter(value => value !== 'yes')) expect(receipt.body).toContain(value);
    expect((await c.request('/insurance/history')).body).toContain(saved.records[0].id);
    expect((await qa('/__qa/records')).json()).toMatchObject({ count: 0, insertionCount: 0 });
    const db = new DatabaseSync(options.dbPath, { readOnly: true });
    expect(JSON.parse((db.prepare('SELECT values_json FROM insurance_records').get() as { values_json: string }).values_json)).toEqual(expected);
    expect(db.prepare('SELECT COUNT(*) AS n FROM records').get()?.n).toBe(0);
    db.close();
    const secondDraft = await c.review();
    expect((await c.request('/insurance/submit', secondDraft)).headers.location).toBe(results[0]!.headers.location);
    expect(await records()).toMatchObject({ count: 1, insertionCount: 1 });
  });

  it.each(Object.keys(fixture))('rejects missing required %s without inserting', async key => {
    const c = client(app); await c.login();
    const page = await c.request('/insurance/apply');
    const result = await c.request('/insurance/apply', { ...fixture, [key]: '', csrf: input(page.body, 'csrf'), formToken: input(page.body, 'formToken') });
    expect(result.statusCode).toBe(422);
    expect(result.body).toContain('role="alert"');
    expect(await records()).toMatchObject({ count: 0, insertionCount: 0 });
  });

  it.each([{ policyNumber: 'REAL-001' }, { phone: 'abc' }, { treatmentDate: '2026-02-30' }, { claimType: '임의' }, { claimAmount: '-1' }, { claimAmount: '1e3' }, { paymentBank: '실제은행' }, { accountNumber: 'abc' }, { privacyConsent: 'false' }, { accuracyConsent: 'on' }, { ssn: 'excluded' }])('validates input server side: %o', async invalid => {
    const c = client(app); await c.login();
    const page = await c.request('/insurance/apply');
    expect((await c.request('/insurance/apply', { ...fixture, ...invalid, csrf: input(page.body, 'csrf'), formToken: input(page.body, 'formToken') } as Record<string, string>)).statusCode).toBe(422);
    expect((await records()).insertionCount).toBe(0);
  });

  it('binds form and review tokens to terms, values, session and stage; enforces CSRF/origin', async () => {
    const c = client(app); await c.login();
    const page = await c.request('/insurance/apply');
    const fields = { ...fixture, csrf: input(page.body, 'csrf'), formToken: input(page.body, 'formToken') };
    expect((await c.request('/insurance/apply', { ...fields, csrf: 'wrong' })).statusCode).toBe(403);
    expect((await c.request('/insurance/apply', fields, { origin: 'https://other.invalid' })).statusCode).toBe(403);
    expect((await c.request('/insurance/apply', { ...fields, formToken: 'wrong' })).statusCode).toBe(409);
    const draft = await c.review();
    expect((await c.request('/insurance/submit', { ...draft, formToken: fields.formToken })).statusCode).toBe(409);
    expect((await c.request('/insurance/submit', { ...draft, claimAmount: '1' })).statusCode).toBe(409);
    const db = new DatabaseSync(options.dbPath);
    db.prepare('UPDATE insurance_drafts SET terms=? WHERE id=?').run('changed', draft.draftId);
    db.close();
    expect((await c.request('/insurance/submit', draft)).statusCode).toBe(409);
    expect((await records()).count).toBe(0);
  });

  it.each([{ claimAmount: '-1' }, { privacyConsent: false }, { accuracyConsent: false }, { paymentBank: '실제은행' }])('revalidates persisted draft at final submit: %o', async invalid => {
    const c = client(app); await c.login();
    const draft = await c.review();
    const db = new DatabaseSync(options.dbPath);
    db.prepare('UPDATE insurance_drafts SET values_json=? WHERE id=?').run(JSON.stringify({ ...expected, ...invalid }), draft.draftId);
    db.close();
    expect((await c.request('/insurance/submit', draft)).statusCode).toBe(409);
    expect((await records()).count).toBe(0);
  });

  it('edits preserve actual values and invalidate the old review; receipts and drafts are session isolated', async () => {
    const a = client(app), b = client(app); await a.login(); await b.login();
    const draft = await a.review();
    expect((await b.request(`/insurance/review?draft=${draft.draftId}`)).headers.location).toBe('/insurance/apply');
    expect((await b.request(`/insurance/apply?draft=${draft.draftId}`)).statusCode).toBe(404);
    const edit = await a.request(`/insurance/apply?draft=${draft.draftId}`);
    expect(edit.body).toContain('value="85000"');
    const next = await a.request('/insurance/apply', { ...fixture, claimAmount: '90000', editDraftId: input(edit.body, 'editDraftId'), csrf: input(edit.body, 'csrf'), formToken: input(edit.body, 'formToken') });
    expect(next.statusCode).toBe(303);
    expect((await a.request('/insurance/submit', draft)).statusCode).toBe(409);
    const review = await a.request(next.headers.location!);
    const submit = await a.request('/insurance/submit', { csrf: input(review.body, 'csrf'), draftId: input(review.body, 'draftId'), formToken: input(review.body, 'formToken') });
    expect(submit.statusCode).toBe(303);
    expect((await b.request(submit.headers.location!)).statusCode).toBe(404);
    expect((await b.request('/insurance/history')).body).not.toContain('INS-DEMO-');
    expect((await records()).records[0].claimAmount).toBe('90000');
  });

  it('protects QA, persists DB ownership through restart and reset clears both flows while preserving login', async () => {
    expect((await app.inject({ url: '/__qa/insurance/records' })).statusCode).toBe(404);
    const disabled = createBenefitsServer({ ...options, dbPath: join(directory, 'disabled.sqlite'), qaToken: undefined }); extra.push(disabled);
    expect((await disabled.inject({ url: '/__qa/insurance/records', headers: { 'x-flecto-qa-token': options.qaToken! } })).statusCode).toBe(404);
    const c = client(app); await c.login();
    const submit = await c.request('/insurance/submit', await c.review());
    const cookie = c.cookie;
    await app.close(); app = createBenefitsServer(options);
    const restored = client(app); restored.cookie = cookie;
    expect((await restored.request(submit.headers.location!)).statusCode).toBe(200);
    expect((await records()).count).toBe(1);
    expect((await qa('/__qa/reset', {})).statusCode).toBe(200);
    expect(await records()).toMatchObject({ records: [], count: 0, insertionCount: 0 });
    expect((await qa('/__qa/records')).json()).toMatchObject({ count: 0, insertionCount: 0 });
    expect((await restored.request('/insurance/apply')).statusCode).toBe(200);
    expect((await restored.request(submit.headers.location!)).statusCode).toBe(404);
    const db = new DatabaseSync(options.dbPath, { readOnly: true });
    expect(db.prepare('SELECT COUNT(*) AS n FROM insurance_drafts').get()?.n).toBe(0); db.close();
  });
});
