import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createCultureServer } from '../../apps/demo-culture/src/server';

const QA = 'qa-token-culture-0123456789';
const SECRET = 'culture-session-secret-0123456789';
let dir: string;
let app: FastifyInstance;

function build(extra: Partial<Parameters<typeof createCultureServer>[0]> = {}) {
  return createCultureServer({ dbPath: join(dir, 'culture.sqlite'), sessionSecret: SECRET, namespace: 'QA', qaToken: QA, assetsDir: join(dir, 'assets'), ...extra });
}

async function login(server = app): Promise<string> {
  const res = await server.inject({ method: 'POST', url: '/api/login', payload: { userId: 'demo', password: 'flecto2026!' } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'flecto_culture');
  expect(cookie?.httpOnly).toBe(true);
  expect(String(cookie?.sameSite).toLowerCase()).toBe('lax');
  return 'flecto_culture=' + cookie!.value;
}

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    submissionId: 'sub-' + Math.random().toString(36).slice(2, 12),
    courseId: 'painting', timeId: 'painting-wed-1400', applicantName: '김한빛', phone: '01012345678', consent: true,
    ...overrides,
  };
}

async function qaRecords(server = app) {
  const res = await server.inject({ method: 'GET', url: '/__qa/records', headers: { 'x-flecto-qa-token': QA } });
  expect(res.statusCode).toBe(200);
  return res.json() as { count: number; reservations: Array<Record<string, string>>; times: Array<{ timeId: string; capacity: number; remaining: number }> };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'culture-test-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'index.html'), '<!doctype html><div id="root"></div>');
  app = build();
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('culture source site (source B)', () => {
  it('importing the factory does not listen', async () => {
    await app.ready();
    expect(app.server.listening).toBe(false);
  });

  it('rejects a wrong password and requires login for reservations', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/login', payload: { userId: 'demo', password: 'nope' } });
    expect(bad.statusCode).toBe(401);
    expect(bad.cookies.length).toBe(0);
    const anon = await app.inject({ method: 'POST', url: '/api/reservations', payload: reservation() });
    expect(anon.statusCode).toBe(401);
    expect((await app.inject({ url: '/api/session' })).json()).toEqual({ authenticated: false, user: null });
  });

  it('stores the submitted course/time/applicant and returns the stored receipt (T02)', async () => {
    const cookie = await login();
    expect((await app.inject({ url: '/api/session', headers: { cookie } })).json().authenticated).toBe(true);
    const res = await app.inject({ method: 'POST', url: '/api/reservations', headers: { cookie }, payload: reservation({ applicantName: ' 김한빛 ', phone: '010-1234-5678' }) });
    expect(res.statusCode).toBe(201);
    const body = res.json().reservation;
    expect(body).toMatchObject({ courseId: 'painting', timeId: 'painting-wed-1400', applicantName: '김한빛', phone: '010-1234-5678', status: '접수 완료' });
    expect(body.receiptNo).toMatch(/^HB-\d{8}-\d{4}$/);
    const records = await qaRecords();
    expect(records.count).toBe(1);
    expect(records.reservations[0]).toMatchObject({ receiptNo: body.receiptNo, courseId: 'painting', timeId: 'painting-wed-1400', applicantName: '김한빛' });
    const mine = await app.inject({ url: '/api/reservations', headers: { cookie } });
    expect(mine.json().reservations.map((r: { receiptNo: string }) => r.receiptNo)).toEqual([body.receiptNo]);
    const courses = (await app.inject({ url: '/api/courses' })).json().courses;
    const time = courses.find((c: { id: string }) => c.id === 'painting').times.find((t: { id: string }) => t.id === 'painting-wed-1400');
    expect(time.remaining).toBe(7);
  });

  it('validates required fields and time/course pairing on the server', async () => {
    const cookie = await login();
    const missing = await app.inject({ method: 'POST', url: '/api/reservations', headers: { cookie }, payload: reservation({ consent: false, phone: '123', applicantName: '' }) });
    expect(missing.statusCode).toBe(400);
    expect(Object.keys(missing.json().error.fields).sort()).toEqual(['applicantName', 'consent', 'phone']);
    const mismatch = await app.inject({ method: 'POST', url: '/api/reservations', headers: { cookie }, payload: reservation({ courseId: 'yoga' }) });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json().error.code).toBe('TIME_NOT_FOUND');
    expect((await qaRecords()).count).toBe(0);
  });

  it('checks the latest capacity at submission instead of the value the page loaded (T37)', async () => {
    const cookie = await login();
    const listed = (await app.inject({ url: '/api/courses' })).json().courses;
    expect(listed.find((c: { id: string }) => c.id === 'yoga').times[0].remaining).toBe(12);
    const cap = await app.inject({ method: 'POST', url: '/__qa/capacity', headers: { 'x-flecto-qa-token': QA }, payload: { courseId: 'yoga', timeId: 'yoga-tue-thu-1000', capacity: 0 } });
    expect(cap.statusCode).toBe(200);
    const res = await app.inject({ method: 'POST', url: '/api/reservations', headers: { cookie }, payload: reservation({ courseId: 'yoga', timeId: 'yoga-tue-thu-1000' }) });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'CAPACITY_FULL', latest: { timeId: 'yoga-tue-thu-1000', remaining: 0 } });
    expect((await qaRecords()).count).toBe(0);
  });

  it('makes a retried submission idempotent and blocks a second booking of the same time', async () => {
    const cookie = await login();
    const payload = reservation();
    const first = await app.inject({ method: 'POST', url: '/api/reservations', headers: { cookie }, payload });
    const retry = await app.inject({ method: 'POST', url: '/api/reservations', headers: { cookie }, payload });
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({ duplicate: true, reservation: { receiptNo: first.json().reservation.receiptNo } });
    const reused = await app.inject({ method: 'POST', url: '/api/reservations', headers: { cookie }, payload: { ...payload, applicantName: '이다른' } });
    expect(reused.json().error.code).toBe('SUBMISSION_REUSED');
    const again = await app.inject({ method: 'POST', url: '/api/reservations', headers: { cookie }, payload: reservation() });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('ALREADY_RESERVED');
    expect((await qaRecords()).count).toBe(1);
  });

  it('keeps sessions separate and ends them on logout', async () => {
    const a = await login();
    const b = await login();
    expect(a).not.toBe(b);
    await app.inject({ method: 'POST', url: '/api/logout', headers: { cookie: a } });
    expect((await app.inject({ url: '/api/session', headers: { cookie: a } })).json().authenticated).toBe(false);
    expect((await app.inject({ url: '/api/session', headers: { cookie: b } })).json().authenticated).toBe(true);
    const forged = await app.inject({ url: '/api/session', headers: { cookie: 'flecto_culture=forged.value' } });
    expect(forged.json().authenticated).toBe(false);
  });

  it('hides QA routes without the token and disables them when no token is configured (T29)', async () => {
    for (const [method, url] of [['GET', '/__qa/records'], ['POST', '/__qa/reset'], ['POST', '/__qa/capacity']] as const) {
      const none = await app.inject({ method, url, payload: method === 'POST' ? {} : undefined });
      expect(none.statusCode).toBe(404);
      const wrong = await app.inject({ method, url, headers: { 'x-flecto-qa-token': 'wrong-token-000000000' }, payload: method === 'POST' ? {} : undefined });
      expect(wrong.statusCode).toBe(404);
      const cookie = await login();
      const withSession = await app.inject({ method, url, headers: { cookie }, payload: method === 'POST' ? {} : undefined });
      expect(withSession.statusCode).toBe(404);
    }
    const noQa = build({ qaToken: undefined, dbPath: join(dir, 'noqa.sqlite'), namespace: 'DEMO' });
    const res = await noQa.inject({ url: '/__qa/records', headers: { 'x-flecto-qa-token': QA } });
    expect(res.statusCode).toBe(404);
    await noQa.close();
  });

  it('reset clears synthetic reservations and restores capacity only', async () => {
    const cookie = await login();
    await app.inject({ method: 'POST', url: '/api/reservations', headers: { cookie }, payload: reservation() });
    await app.inject({ method: 'POST', url: '/__qa/capacity', headers: { 'x-flecto-qa-token': QA }, payload: { courseId: 'digital', timeId: 'digital-fri-1400', capacity: 1 } });
    const reset = await app.inject({ method: 'POST', url: '/__qa/reset', headers: { 'x-flecto-qa-token': QA } });
    expect(reset.statusCode).toBe(200);
    const records = await qaRecords();
    expect(records.count).toBe(0);
    expect(records.times.find((t) => t.timeId === 'digital-fri-1400')?.capacity).toBe(6);
    expect((await app.inject({ url: '/api/session', headers: { cookie } })).json().authenticated).toBe(true);
  });

  it('persists reservations across restarts and refuses a DB from another namespace', async () => {
    const cookie = await login();
    await app.inject({ method: 'POST', url: '/api/reservations', headers: { cookie }, payload: reservation() });
    await app.close();
    app = build();
    expect((await qaRecords()).count).toBe(1);
    expect(() => build({ namespace: 'DEMO' })).toThrow(/namespace/);
  });

  it('serves the SPA shell for client routes and JSON 404 for unknown API paths', async () => {
    for (const url of ['/', '/courses', '/apply/review', '/reservations/HB-20260929-0001']) {
      const res = await app.inject({ url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('id="root"');
    }
    const api = await app.inject({ url: '/api/unknown' });
    expect(api.statusCode).toBe(404);
    expect(api.headers['content-type']).toContain('application/json');
    const asset = await app.inject({ url: '/assets/missing.js' });
    expect(asset.statusCode).toBe(404);
  });
});

