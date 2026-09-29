import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { applicationForm, categories, contactMethods, css, details, escape, hidden, layout, loginForm, notice, noticeFor, type Values, type Variant } from './views.js';
import { initializeInsuranceDatabase, registerInsuranceRoutes, resetInsuranceDatabase } from './insurance.js';

export interface BenefitsServerOptions {
  dbPath: string;
  qaToken?: string;
  sessionSecret: string;
  namespace: 'QA' | 'DEMO';
  variant?: string;
}
type Session = { id: string; csrf: string; authenticated: number; expires: number };
type Draft = Values & { id: string; session_id: string; terms: string; requirements: string; receipt_id: string | null };
type RecordRow = Values & { id: string; session_id: string; createdAt: string; noticeText: string };
type Fault = 'none' | 'rejection' | 'delayed' | 'connection-loss';
const variants: Variant[] = ['default', 'decorations', 'required', 'notice', 'duplicate-form'];
const faults: Fault[] = ['none', 'rejection', 'delayed', 'connection-loss'];
const COOKIE = 'flecto_benefits';
const TTL = 8 * 60 * 60 * 1000;
const blank = (): Values => ({ orderNumber: '', purchaseDate: '', category: '', contactMethod: '', consent: false });
const digest = (s: string): Buffer => createHash('sha256').update(s).digest();
const equal = (a: string, b: string): boolean => timingSafeEqual(digest(a), digest(b));
const nonce = (): string => randomBytes(24).toString('hex');

/** Creates an independent source service. The caller owns listen() and close(). */
export function createBenefitsServer(options: BenefitsServerOptions): FastifyInstance {
  if (!options.dbPath || !options.sessionSecret || options.sessionSecret.length < 32) throw new Error('A database path and session secret of at least 32 characters are required.');
  if (!['QA', 'DEMO'].includes(options.namespace)) throw new Error('Invalid namespace.');
  if (options.variant && !variants.includes(options.variant as Variant)) throw new Error('Invalid variant.');
  const db = new DatabaseSync(options.dbPath);
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    if (tables.length) {
      if (!tables.some(t => t.name === 'benefits_meta')) throw new Error('Refusing a database not owned by this synthetic service.');
      const marker = db.prepare("SELECT value FROM benefits_meta WHERE key='identity'").get() as { value: string } | undefined;
      if (marker?.value !== `ondam-benefits-synthetic-v1:${options.namespace}` || tables.some(t => !['benefits_meta', 'sessions', 'orders', 'drafts', 'records', 'insurance_meta', 'insurance_drafts', 'insurance_records'].includes(t.name))) throw new Error('Database namespace or ownership mismatch.');
    }
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS benefits_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, csrf TEXT NOT NULL, authenticated INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS orders(orderNumber TEXT PRIMARY KEY, purchaseDate TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, orderNumber TEXT NOT NULL, purchaseDate TEXT NOT NULL, category TEXT NOT NULL, contactMethod TEXT NOT NULL, consent INTEGER NOT NULL, terms TEXT NOT NULL, requirements TEXT NOT NULL, receipt_id TEXT);
      CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, orderNumber TEXT NOT NULL, purchaseDate TEXT NOT NULL, category TEXT NOT NULL, contactMethod TEXT NOT NULL, consent INTEGER NOT NULL CHECK(consent=1), noticeText TEXT NOT NULL, createdAt TEXT NOT NULL, UNIQUE(session_id,orderNumber));`);
    db.prepare('INSERT OR IGNORE INTO benefits_meta VALUES (?,?)').run('identity', `ondam-benefits-synthetic-v1:${options.namespace}`);
    db.prepare('INSERT OR IGNORE INTO benefits_meta VALUES (?,?)').run('insertions', '0');
    const seed = db.prepare('INSERT OR IGNORE INTO orders VALUES (?,?)');
    for (let i = 1; i <= 99; i++) seed.run(`FLECTO-2026-${String(i).padStart(3, '0')}`, '2026-09-01');
    initializeInsuranceDatabase(db);
  } catch (error) { db.close(); throw error; }

  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 });
  let variant: Variant = options.variant as Variant || 'default';
  let fault: Fault = 'none';
  let delayMs = 500;
  const sessions = new WeakMap<FastifyRequest, Session>();
  app.register(cookie, { secret: options.sessionSecret, hook: 'onRequest' });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    const entries = new URLSearchParams(body as string);
    const parsed: Record<string, string> = Object.create(null);
    for (const [key, value] of entries) {
      if (Object.hasOwn(parsed, key)) { done(Object.assign(new Error('Duplicate form field.'), { statusCode: 400 })); return; }
      parsed[key] = value;
    }
    done(null, parsed);
  });
  const bodyOf = (request: FastifyRequest): Record<string, unknown> => request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
  const field = (body: Record<string, unknown>, key: string): string => typeof body[key] === 'string' ? body[key] as string : '';
  const sessionOf = (request: FastifyRequest): Session => sessions.get(request)!;
  const setCookie = (reply: FastifyReply, id: string) => reply.setCookie(COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', signed: true, maxAge: TTL / 1000 });
  const createSession = (reply: FastifyReply, authenticated = 0): Session => {
    const session = { id: nonce(), csrf: nonce(), authenticated, expires: Date.now() + TTL };
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(session.id, session.csrf, authenticated, session.expires);
    setCookie(reply, session.id);
    return session;
  };
  const html = (request: FastifyRequest, reply: FastifyReply, title: string, content: string, code = 200) => {
    const session = sessionOf(request);
    return reply.code(code).type('text/html; charset=utf-8').send(layout(title, content, session?.csrf ?? '', !!session?.authenticated, variant));
  };
  const auth = (request: FastifyRequest, reply: FastifyReply): boolean => {
    const s = sessionOf(request);
    const current = s && db.prepare('SELECT authenticated,expires FROM sessions WHERE id=?').get(s.id) as Session | undefined;
    if (!current?.authenticated || current.expires <= Date.now()) { reply.redirect('/login', 303); return false; }
    return true;
  };
  const valuesOf = (body: Record<string, unknown>): Values => ({ orderNumber: field(body, 'orderNumber').slice(0, 80), purchaseDate: field(body, 'purchaseDate').slice(0, 32), category: field(body, 'category').slice(0, 40), contactMethod: field(body, 'contactMethod').slice(0, 80), consent: body.consent === 'yes' });
  const requirement = (): string => variant === 'required' ? 'contactMethod' : 'standard';
  const validate = (values: Values, sessionId: string): Record<string, string> => {
    const errors: Record<string, string> = {};
    const order = db.prepare('SELECT purchaseDate FROM orders WHERE orderNumber=?').get(values.orderNumber) as { purchaseDate: string } | undefined;
    if (!values.orderNumber) errors.orderNumber = '주문번호를 입력해 주세요.';
    else if (!order) errors.orderNumber = '확인할 수 없는 주문번호입니다. 시연 주문번호를 다시 확인해 주세요.';
    if (!values.purchaseDate) errors.purchaseDate = '구매일을 입력해 주세요.';
    else if (values.purchaseDate !== '2026-09-01' || (order && order.purchaseDate !== values.purchaseDate)) errors.purchaseDate = '구매일이 주문 정보와 다릅니다. 2026년 9월 1일을 확인해 주세요.';
    if (!categories.includes(values.category)) errors.category = '상품분류를 선택해 주세요.';
    if (variant === 'required' && !contactMethods.includes(values.contactMethod)) errors.contactMethod = '안내 수신 방법을 선택해 주세요.';
    if (!values.consent) errors.consent = '신청 조건과 주문 정보 저장에 직접 동의해 주세요.';
    if (db.prepare('SELECT id FROM records WHERE session_id=? AND orderNumber=?').get(sessionId, values.orderNumber)) errors.orderNumber = '이미 접수한 주문입니다. 접수 내역에서 확인해 주세요.';
    return errors;
  };
  const formToken = (request: FastifyRequest): string => createHmac('sha256', options.sessionSecret).update(JSON.stringify([sessionOf(request).csrf, noticeFor(variant), requirement()])).digest('hex');
  const renderForm = (request: FastifyRequest, values: Values, errors: Record<string, string> = {}): string => applicationForm(sessionOf(request).csrf, variant, values, errors, formToken(request));
  const getDraft = (request: FastifyRequest, id: string): Draft | undefined => db.prepare('SELECT * FROM drafts WHERE id=? AND session_id=?').get(id, sessionOf(request).id) as Draft | undefined;

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'same-origin').header('X-Content-Type-Options', 'nosniff').header('Content-Security-Policy', "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const path = request.url.split('?')[0]!;
    if (path.startsWith('/__qa/')) {
      const token = request.headers['x-flecto-qa-token'];
      if (!options.qaToken || typeof token !== 'string' || !equal(options.qaToken, token)) return reply.code(404).send({ error: 'Not found' });
      return;
    }
    if (path === '/assets/site.css') return;
    const signed = request.cookies[COOKIE];
    const unsigned = signed ? request.unsignCookie(signed) : null;
    let session = unsigned?.valid && unsigned.value ? db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(unsigned.value, Date.now()) as Session | undefined : undefined;
    if (!session) session = createSession(reply);
    sessions.set(request, session);
  });
  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST' || request.url.split('?')[0]!.startsWith('/__qa/')) return;
    const origin = request.headers.origin;
    const validOrigin = !origin || origin === `http://${request.headers.host}`;
    if (!validOrigin || !equal(field(bodyOf(request), 'csrf'), sessionOf(request).csrf)) return html(request, reply, '요청을 확인할 수 없습니다', '<section role="alert" class="error"><h1>요청을 확인할 수 없습니다</h1><p>페이지를 새로 열고 다시 진행해 주세요.</p><a href="/">홈으로</a></section>', 403);
  });
  app.addHook('onClose', async () => { db.close(); });
  app.setErrorHandler((_error, request, reply) => html(request, reply, '처리하지 못했습니다', '<section role="alert" class="error"><h1>처리하지 못했습니다</h1><p>완료 여부는 접수 내역에서 확인해 주세요. 자동으로 다시 제출하지 않습니다.</p><a href="/history">접수 내역 확인</a></section>', 500));

  app.get('/assets/site.css', (_request, reply) => reply.type('text/css; charset=utf-8').send(css));
  app.get('/login', (request, reply) => html(request, reply, '로그인', loginForm(sessionOf(request).csrf)));
  app.post('/login', (request, reply) => {
    const body = bodyOf(request);
    if (!equal(field(body, 'username'), 'demo') || !equal(field(body, 'password'), 'flecto2026!')) return html(request, reply, '로그인', loginForm(sessionOf(request).csrf, '아이디 또는 비밀번호를 확인해 주세요.'), 401);
    db.prepare('DELETE FROM sessions WHERE id=?').run(sessionOf(request).id);
    sessions.set(request, createSession(reply, 1));
    return reply.redirect('/', 303);
  });
  app.post('/logout', (request, reply) => {
    db.prepare('DELETE FROM sessions WHERE id=?').run(sessionOf(request).id);
    reply.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'lax' });
    return reply.redirect('/login', 303);
  });
  app.get('/', (request, reply) => html(request, reply, '홈', `<section class="hero"><h1>구매의 기쁨에<br>혜택을 더하세요.</h1><p>주문 정보를 확인하고 구매 혜택을 신청하세요. 신청한 내용은 언제든 접수 내역에서 확인할 수 있습니다.</p><a class="button" href="/apply">구매 혜택 신청하기</a></section><ul class="menu-list"><li><a href="/history">내 접수 내역 확인 →</a><p>접수 번호와 신청한 주문 정보를 확인하세요.</p></li><li><a href="/guide">이용 방법 알아보기 →</a><p>신청 절차와 자주 묻는 질문을 살펴보세요.</p></li><li><a href="/stores">매장 운영시간 확인 →</a><p>가상 온담 매장의 위치와 운영시간을 안내합니다.</p></li></ul>`));
  app.get('/guide', (request, reply) => html(request, reply, '이용 안내', '<div class="intro"><h1>이용 안내</h1><p>처음 신청하시나요? 순서대로 확인해 보세요.</p></div><section class="panel"><h2>구매 혜택 신청 방법</h2><ol class="steps"><li>제공받은 시연 계정으로 로그인합니다.</li><li>합성 주문번호, 구매일, 상품분류를 입력합니다.</li><li>신청 조건을 읽고 직접 동의합니다.</li><li>입력 내용을 검토한 후 신청을 제출합니다.</li></ol><h2>시연 주문 안내</h2><p>FLECTO-2026-001부터 FLECTO-2026-099까지 사용할 수 있습니다. 구매일은 2026년 9월 1일이며, 상품분류는 가전·생활·디지털 중 선택합니다.</p><h2>접수 여부가 확실하지 않아요</h2><p>다시 제출하기 전에 접수 내역을 확인해 주세요. 같은 로그인 세션에서 주문당 한 번만 접수됩니다.</p><a href="/history">접수 내역 확인</a></section>'));
  app.get('/stores', (request, reply) => html(request, reply, '매장 안내', '<div class="intro"><h1>매장 안내</h1><p>가상 매장의 운영시간을 확인하세요.</p></div><section class="panel"><h2>온담 시연점</h2><address>가상도시 온담로 100 · 실제 방문할 수 없는 시연 주소</address><dl class="details"><div><dt>운영시간</dt><dd>월–토 10:00–18:00</dd></div><div><dt>휴무일</dt><dd>일요일·공휴일</dd></div></dl><p>이 서비스는 실제 매장 예약이나 구매를 처리하지 않습니다.</p><a href="/guide">이용 안내</a></section>'));
  app.get('/apply', (request, reply) => {
    if (!auth(request, reply)) return;
    const draftId = field(request.query as Record<string, unknown>, 'draft');
    const draft = draftId ? getDraft(request, draftId) : undefined;
    const values = draft ? { ...draft, consent: draft.terms === noticeFor(variant) && draft.requirements === requirement() && !!draft.consent } : blank();
    return html(request, reply, '구매 혜택 신청', renderForm(request, values));
  });
  app.post('/apply', (request, reply) => {
    if (!auth(request, reply)) return;
    const values = valuesOf(bodyOf(request));
    if (variant !== 'required') values.contactMethod = '';
    if (!equal(field(bodyOf(request), 'formToken'), formToken(request))) return html(request, reply, '안내 변경', renderForm(request, { ...values, consent: false }, { form: '신청 조건이 변경되었거나 페이지가 만료되었습니다. 최신 내용을 확인하고 다시 동의해 주세요.' }), 409);
    const errors = validate(values, sessionOf(request).id);
    if (Object.keys(errors).length) return html(request, reply, '입력 확인', renderForm(request, values, errors), 422);
    const id = nonce();
    db.prepare('INSERT INTO drafts VALUES (?,?,?,?,?,?,?,?,?,NULL)').run(id, sessionOf(request).id, values.orderNumber, values.purchaseDate, values.category, values.contactMethod, 1, noticeFor(variant), requirement());
    return reply.redirect(`/apply/review?draft=${id}`, 303);
  });
  app.get('/apply/review', (request, reply) => {
    if (!auth(request, reply)) return;
    const draft = getDraft(request, field(request.query as Record<string, unknown>, 'draft'));
    if (!draft) return reply.redirect('/apply', 303);
    if (draft.receipt_id) return reply.redirect(`/receipt/${draft.receipt_id}`, 303);
    if (draft.terms !== noticeFor(variant) || draft.requirements !== requirement()) return html(request, reply, '안내 변경', renderForm(request, { ...draft, consent: false }, { form: '신청 조건이 변경되었습니다. 최신 내용을 확인하고 다시 동의해 주세요.' }), 409);
    return html(request, reply, '신청 내용 검토', `<div class="intro"><h1>신청 내용을 확인해 주세요</h1><p>아직 접수되지 않았습니다. 아래 내용이 맞으면 직접 제출해 주세요.</p></div><section class="panel"><h2>신청 정보</h2>${details(draft)}${notice(variant)}<p>위 신청 조건과 주문 정보 저장에 동의했습니다.</p><form method="post" action="/apply/submit">${hidden('csrf', sessionOf(request).csrf)}${hidden('draftId', draft.id)}<div class="actions"><button type="submit">혜택 신청 제출</button><a href="/apply?draft=${draft.id}">내용 수정</a></div></form></section>${variant === 'duplicate-form' ? '<aside class="panel secondary"><h2>신청 절차 안내</h2><p>신청 전 이용 안내를 확인하려면 아래 버튼을 선택하세요.</p><form method="get" action="/guide"><button class="secondary-button" type="submit">혜택 신청 제출</button></form></aside>' : ''}`);
  });
  app.post('/apply/submit', async (request, reply) => {
    if (!auth(request, reply)) return;
    const currentFault = fault;
    if (currentFault === 'delayed') await new Promise(resolve => setTimeout(resolve, delayMs));
    if (!auth(request, reply)) return;
    const draft = getDraft(request, field(bodyOf(request), 'draftId'));
    if (!draft) return html(request, reply, '검토 필요', '<section role="alert" class="error"><h1>신청 내용을 다시 확인해 주세요</h1><a href="/apply">신청서로 돌아가기</a></section>', 409);
    if (draft.receipt_id) return reply.redirect(`/receipt/${draft.receipt_id}`, 303);
    if (draft.terms !== noticeFor(variant) || draft.requirements !== requirement()) return html(request, reply, '안내 변경', renderForm(request, { ...draft, consent: false }, { form: '신청 조건이 변경되었습니다. 최신 내용을 확인하고 다시 동의해 주세요.' }), 409);
    const errors = validate({ ...draft, consent: !!draft.consent }, sessionOf(request).id);
    if (Object.keys(errors).length) return html(request, reply, '접수 확인', renderForm(request, draft, errors), 409);
    if (currentFault === 'rejection') return html(request, reply, '접수하지 못했습니다', '<section role="alert" class="error"><h1>서버에서 신청을 접수하지 못했습니다</h1><p>저장된 신청은 없습니다. 자동으로 다시 제출하지 않습니다.</p><a href="/history">접수 내역 확인</a></section>', 503);
    const id = `BEN-${randomBytes(8).toString('hex').toUpperCase()}`;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?)').run(id, draft.session_id, draft.orderNumber, draft.purchaseDate, draft.category, draft.contactMethod, 1, draft.terms, new Date().toISOString());
      db.prepare('UPDATE drafts SET receipt_id=? WHERE id=?').run(id, draft.id);
      db.prepare("UPDATE benefits_meta SET value=CAST(value AS INTEGER)+1 WHERE key='insertions'").run();
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    if (currentFault === 'connection-loss') { reply.hijack(); reply.raw.destroy(); return; }
    return reply.redirect(`/receipt/${id}`, 303);
  });
  app.get('/receipt/:id', (request, reply) => {
    if (!auth(request, reply)) return;
    const record = db.prepare('SELECT * FROM records WHERE id=? AND session_id=?').get(field(request.params as Record<string, unknown>, 'id'), sessionOf(request).id) as RecordRow | undefined;
    if (!record) return html(request, reply, '접수 내역 없음', '<h1>접수 내역을 찾을 수 없습니다</h1><a href="/history">내 접수 내역 확인</a>', 404);
    return html(request, reply, '접수 완료', `<section role="status" class="panel success"><h1>구매 혜택 신청이 접수되었습니다</h1><p>입력하신 주문 정보가 저장되었습니다.</p><p>접수 번호<br><output class="receipt" aria-label="접수 번호">${escape(record.id)}</output></p>${details(record)}<h2>동의한 신청 조건</h2><p>${escape(record.noticeText)}</p><div class="actions"><a class="button" href="/history">접수 내역 확인</a><a href="/">홈으로</a></div></section>`);
  });
  app.get('/history', (request, reply) => {
    if (!auth(request, reply)) return;
    const rows = db.prepare('SELECT * FROM records WHERE session_id=? ORDER BY createdAt DESC,id').all(sessionOf(request).id) as unknown as RecordRow[];
    return html(request, reply, '접수 내역', `<div class="intro"><h1>내 접수 내역</h1><p>현재 로그인 세션에서 접수한 신청만 표시됩니다.</p></div><section class="panel">${rows.length ? `<div class="table-wrap"><table><caption>접수한 신청 ${rows.length}건</caption><thead><tr><th scope="col">접수 번호</th><th scope="col">주문번호</th><th scope="col">상품분류</th></tr></thead><tbody>${rows.map(r => `<tr><td><a href="/receipt/${escape(r.id)}">${escape(r.id)}</a></td><td>${escape(r.orderNumber)}</td><td>${escape(r.category)}</td></tr>`).join('')}</tbody></table></div>` : '<p>아직 접수한 신청이 없습니다.</p>'}<div class="actions"><a href="/apply">새 혜택 신청하기</a></div></section>`);
  });
  app.get('/__qa/records', (_request, reply) => {
    const records = (db.prepare('SELECT * FROM records ORDER BY createdAt,id').all() as unknown as RecordRow[]).map(({ session_id, ...record }) => ({ ...record, consent: !!record.consent, sessionId: digest(session_id).toString('hex') }));
    const counter = db.prepare("SELECT value FROM benefits_meta WHERE key='insertions'").get() as { value: string };
    return reply.send({ records, count: records.length, insertionCount: Number(counter.value), namespace: options.namespace });
  });
  app.post('/__qa/reset', (_request, reply) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec("DELETE FROM records; DELETE FROM drafts; UPDATE benefits_meta SET value='0' WHERE key='insertions';");
      resetInsuranceDatabase(db);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return reply.send({ count: 0, insertionCount: 0, namespace: options.namespace, sessionsPreserved: true });
  });
  app.post('/__qa/config', (request, reply) => {
    const body = bodyOf(request);
    if (!Object.keys(body).length || Object.keys(body).some(k => !['variant', 'fault', 'delayMs'].includes(k)) || (body.variant !== undefined && !variants.includes(body.variant as Variant)) || (body.fault !== undefined && !faults.includes(body.fault as Fault)) || (body.delayMs !== undefined && (!Number.isInteger(body.delayMs) || (body.delayMs as number) < 0 || (body.delayMs as number) > 2000))) return reply.code(400).send({ error: 'Invalid config. Use variant, fault, delayMs (0–2000).' });
    if (body.variant !== undefined) variant = body.variant as Variant;
    if (body.fault !== undefined) fault = body.fault as Fault;
    if (body.delayMs !== undefined) delayMs = body.delayMs as number;
    return reply.send({ variant, fault, delayMs });
  });
  registerInsuranceRoutes(app, { db, namespace: options.namespace, sessionSecret: options.sessionSecret, sessionOf, auth, bodyOf, field });
  return app;
}
