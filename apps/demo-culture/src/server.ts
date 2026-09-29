import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COURSE_SEED, DEMO_ACCOUNT } from './catalog';

export interface CultureServerOptions {
  dbPath: string;
  qaToken?: string;
  sessionSecret: string;
  namespace: 'QA' | 'DEMO';
  assetsDir?: string;
}

export const CULTURE_SESSION_COOKIE = 'flecto_culture';
export const CULTURE_QA_HEADER = 'x-flecto-qa-token';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_ASSETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

type ErrorCode =
  | 'LOGIN_REQUIRED' | 'LOGIN_FAILED' | 'VALIDATION' | 'COURSE_NOT_FOUND' | 'TIME_NOT_FOUND'
  | 'CAPACITY_FULL' | 'ALREADY_RESERVED' | 'SUBMISSION_REUSED' | 'NOT_FOUND';

interface SessionRow { id: string; user_id: string }
interface TimeRow { id: string; course_id: string; label: string; capacity: number; default_capacity: number; sort: number }
interface ReservationRow {
  id: number; receipt_no: string; submission_id: string; user_id: string; course_id: string; time_id: string;
  applicant_name: string; phone: string; created_at: string;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

function fail(reply: FastifyReply, status: number, code: ErrorCode, message: string, extra: Record<string, unknown> = {}) {
  return reply.code(status).send({ error: { code, message, ...extra } });
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^01[016789]\d{7,8}$/.test(digits)) return null;
  return digits.length === 11
    ? digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7)
    : digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
}

export function validateApplicantName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 20) return null;
  if (!/^[가-힣a-zA-Z ]+$/.test(name)) return null;
  return name;
}

function openDatabase(dbPath: string, namespace: 'QA' | 'DEMO'): DatabaseSync {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, summary TEXT NOT NULL,
      instructor TEXT NOT NULL, fee TEXT NOT NULL, period TEXT NOT NULL, place TEXT NOT NULL,
      audience TEXT NOT NULL, sort INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS course_times (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id), label TEXT NOT NULL,
      capacity INTEGER NOT NULL, default_capacity INTEGER NOT NULL, sort INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no TEXT NOT NULL UNIQUE,
      submission_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL REFERENCES courses(id),
      time_id TEXT NOT NULL REFERENCES course_times(id),
      applicant_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, time_id)
    );
  `);
  const existing = db.prepare('SELECT value FROM meta WHERE key = ?').get('namespace') as { value: string } | undefined;
  if (existing && existing.value !== namespace) {
    db.close();
    throw new Error('Culture DB namespace mismatch: file belongs to ' + existing.value + ', server started as ' + namespace);
  }
  if (!existing) db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('namespace', namespace);
  const upsertCourse = db.prepare(
    'INSERT INTO courses (id, title, category, summary, instructor, fee, period, place, audience, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET title = excluded.title, category = excluded.category, summary = excluded.summary, ' +
      'instructor = excluded.instructor, fee = excluded.fee, period = excluded.period, place = excluded.place, audience = excluded.audience, sort = excluded.sort',
  );
  const insertTime = db.prepare(
    'INSERT INTO course_times (id, course_id, label, capacity, default_capacity, sort) VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET label = excluded.label, default_capacity = excluded.default_capacity, sort = excluded.sort',
  );
  COURSE_SEED.forEach((course, index) => {
    upsertCourse.run(course.id, course.title, course.category, course.summary, course.instructor, course.fee, course.period, course.place, course.audience, index);
    course.times.forEach((time, timeIndex) => insertTime.run(time.id, course.id, time.label, time.capacity, time.capacity, timeIndex));
  });
  return db;
}

export function createCultureServer(options: CultureServerOptions): FastifyInstance {
  if (!options || typeof options.dbPath !== 'string' || !options.dbPath) throw new Error('createCultureServer: dbPath is required');
  if (options.namespace !== 'QA' && options.namespace !== 'DEMO') throw new Error('createCultureServer: namespace must be QA or DEMO');
  if (typeof options.sessionSecret !== 'string' || options.sessionSecret.length < 16) {
    throw new Error('createCultureServer: sessionSecret must be at least 16 characters');
  }
  if (options.qaToken !== undefined && options.qaToken.length < 16) throw new Error('createCultureServer: qaToken must be at least 16 characters');

  const namespace = options.namespace;
  const db = openDatabase(options.dbPath, namespace);
  const assetsDir = resolve(options.assetsDir ?? DEFAULT_ASSETS_DIR);
  const hasAssets = existsSync(resolve(assetsDir, 'index.html'));

  const app = Fastify({ logger: false, bodyLimit: 16 * 1024, trustProxy: false });
  app.addHook('onClose', async () => { db.close(); });
  app.register(fastifyCookie, { secret: options.sessionSecret });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    if (request.url.startsWith('/api/') || request.url.startsWith('/__qa/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  const stmt = {
    session: db.prepare('SELECT id_hash AS id, user_id FROM sessions WHERE id_hash = ? AND expires_at > ?'),
    insertSession: db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE id_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    courses: db.prepare('SELECT * FROM courses ORDER BY sort'),
    times: db.prepare(
      'SELECT t.*, (SELECT COUNT(*) FROM reservations r WHERE r.time_id = t.id) AS reserved FROM course_times t ORDER BY t.course_id, t.sort',
    ),
    course: db.prepare('SELECT * FROM courses WHERE id = ?'),
    time: db.prepare('SELECT * FROM course_times WHERE id = ?'),
    reservedCount: db.prepare('SELECT COUNT(*) AS n FROM reservations WHERE time_id = ?'),
    bySubmission: db.prepare('SELECT * FROM reservations WHERE submission_id = ?'),
    byUserTime: db.prepare('SELECT * FROM reservations WHERE user_id = ? AND time_id = ?'),
    insertReservation: db.prepare(
      'INSERT INTO reservations (receipt_no, submission_id, user_id, course_id, time_id, applicant_name, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ),
    setReceipt: db.prepare('UPDATE reservations SET receipt_no = ? WHERE id = ?'),
    byId: db.prepare('SELECT * FROM reservations WHERE id = ?'),
    userReservations: db.prepare('SELECT * FROM reservations WHERE user_id = ? ORDER BY id DESC'),
    allReservations: db.prepare('SELECT * FROM reservations ORDER BY id'),
    setCapacity: db.prepare('UPDATE course_times SET capacity = ? WHERE id = ?'),
  };

  function courseList() {
    const times = stmt.times.all() as unknown as Array<TimeRow & { reserved: number }>;
    return (stmt.courses.all() as unknown as Array<Record<string, string | number>>).map((c) => ({
      id: c.id, title: c.title, category: c.category, summary: c.summary, instructor: c.instructor,
      fee: c.fee, period: c.period, place: c.place, audience: c.audience,
      times: times.filter((t) => t.course_id === c.id).map((t) => ({
        id: t.id, label: t.label, capacity: t.capacity, reserved: t.reserved, remaining: Math.max(0, t.capacity - t.reserved),
      })),
    }));
  }

  function latestTime(timeId: string) {
    const time = stmt.time.get(timeId) as unknown as TimeRow | undefined;
    if (!time) return null;
    const reserved = (stmt.reservedCount.get(timeId) as { n: number }).n;
    return { timeId, capacity: time.capacity, reserved, remaining: Math.max(0, time.capacity - reserved) };
  }

  function toDto(row: ReservationRow) {
    const course = stmt.course.get(row.course_id) as { title: string } | undefined;
    const time = stmt.time.get(row.time_id) as unknown as TimeRow | undefined;
    return {
      receiptNo: row.receipt_no, courseId: row.course_id, courseTitle: course?.title ?? row.course_id,
      timeId: row.time_id, timeLabel: time?.label ?? row.time_id, applicantName: row.applicant_name,
      phone: row.phone, status: '접수 완료', createdAt: row.created_at,
    };
  }

  function currentSession(request: FastifyRequest): SessionRow | null {
    const raw = request.cookies[CULTURE_SESSION_COOKIE];
    if (!raw) return null;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return null;
    const row = stmt.session.get(sha256(namespace + ':' + unsigned.value).toString('hex'), Date.now()) as SessionRow | undefined;
    return row ?? null;
  }

  function cookieOptions() {
    return { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: false, signed: true };
  }

  app.post('/api/login', async (request, reply) => {
    const body = asRecord(request.body);
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const ok = safeEqual(userId, DEMO_ACCOUNT.userId) && safeEqual(password, DEMO_ACCOUNT.password);
    if (!ok) return fail(reply, 401, 'LOGIN_FAILED', '아이디 또는 비밀번호가 올바르지 않습니다.');
    stmt.purgeSessions.run(Date.now());
    const old = currentSession(request);
    if (old) stmt.deleteSession.run(old.id);
    const token = randomBytes(32).toString('base64url');
    stmt.insertSession.run(sha256(namespace + ':' + token).toString('hex'), DEMO_ACCOUNT.userId, new Date().toISOString(), Date.now() + SESSION_TTL_MS);
    reply.setCookie(CULTURE_SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_TTL_MS / 1000 });
    return { authenticated: true, user: { id: DEMO_ACCOUNT.userId, displayName: DEMO_ACCOUNT.displayName } };
  });

  app.post('/api/logout', async (request, reply) => {
    const session = currentSession(request);
    if (session) stmt.deleteSession.run(session.id);
    reply.clearCookie(CULTURE_SESSION_COOKIE, { path: '/' });
    return { authenticated: false };
  });

  app.get('/api/session', async (request) => {
    const session = currentSession(request);
    if (!session) return { authenticated: false, user: null };
    return { authenticated: true, user: { id: session.user_id, displayName: DEMO_ACCOUNT.displayName } };
  });

  app.get('/api/courses', async () => ({ courses: courseList(), checkedAt: new Date().toISOString() }));

  app.get('/api/reservations', async (request, reply) => {
    const session = currentSession(request);
    if (!session) return fail(reply, 401, 'LOGIN_REQUIRED', '로그인이 필요합니다.');
    const rows = stmt.userReservations.all(session.user_id) as unknown as ReservationRow[];
    return { reservations: rows.map(toDto) };
  });

  app.post('/api/reservations', async (request, reply) => {
    const session = currentSession(request);
    if (!session) return fail(reply, 401, 'LOGIN_REQUIRED', '로그인이 필요합니다. 다시 로그인한 뒤 신청해 주세요.');
    const body = asRecord(request.body);
    const str = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : '');
    const submissionId = str('submissionId');
    const courseId = str('courseId');
    const timeId = str('timeId');
    const fields: Record<string, string> = {};
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(submissionId)) fields.submissionId = '신청 식별값이 올바르지 않습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.';
    if (!courseId) fields.courseId = '강좌를 선택해 주세요.';
    if (!timeId) fields.timeId = '수업 시간을 선택해 주세요.';
    const applicantName = validateApplicantName(str('applicantName'));
    if (!applicantName) fields.applicantName = '신청자 이름을 한글 또는 영문 2~20자로 입력해 주세요.';
    const phone = normalizePhone(str('phone'));
    if (!phone) fields.phone = '휴대전화 번호를 010-1234-5678 형식으로 입력해 주세요.';
    if (body.consent !== true) fields.consent = '안내 사항 확인과 개인정보 수집·이용에 동의해 주세요.';

    if (/^[A-Za-z0-9_-]{8,80}$/.test(submissionId)) {
      const previous = stmt.bySubmission.get(submissionId) as unknown as ReservationRow | undefined;
      if (previous) {
        const same = previous.user_id === session.user_id && previous.course_id === courseId && previous.time_id === timeId &&
          previous.applicant_name === applicantName && previous.phone === phone;
        if (same) return reply.code(200).send({ reservation: toDto(previous), duplicate: true });
        return fail(reply, 409, 'SUBMISSION_REUSED', '이미 처리된 신청과 내용이 다릅니다. 신청 화면을 처음부터 다시 진행해 주세요.');
      }
    }
    if (Object.keys(fields).length > 0) return fail(reply, 400, 'VALIDATION', '입력 내용을 확인해 주세요.', { fields });

    const course = stmt.course.get(courseId);
    if (!course) return fail(reply, 400, 'COURSE_NOT_FOUND', '선택한 강좌를 찾을 수 없습니다.', { fields: { courseId: '강좌를 다시 선택해 주세요.' } });
    const time = stmt.time.get(timeId) as unknown as TimeRow | undefined;
    if (!time || time.course_id !== courseId) {
      return fail(reply, 400, 'TIME_NOT_FOUND', '선택한 강좌에 해당 수업 시간이 없습니다.', { fields: { timeId: '수업 시간을 다시 선택해 주세요.' } });
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const latest = latestTime(timeId)!;
      if (latest.remaining <= 0) {
        db.exec('ROLLBACK');
        return fail(reply, 409, 'CAPACITY_FULL', '선택하신 시간은 방금 정원이 마감되었습니다. 다른 시간을 선택해 주세요.', { latest });
      }
      if (stmt.byUserTime.get(session.user_id, timeId)) {
        db.exec('ROLLBACK');
        return fail(reply, 409, 'ALREADY_RESERVED', '이미 같은 강좌·시간으로 신청하셨습니다. 신청 내역에서 확인해 주세요.');
      }
      const now = new Date();
      const result = stmt.insertReservation.run('pending-' + submissionId, submissionId, session.user_id, courseId, timeId, applicantName!, phone!, now.toISOString());
      const id = Number(result.lastInsertRowid);
      const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
      stmt.setReceipt.run('HB-' + ymd + '-' + String(id).padStart(4, '0'), id);
      db.exec('COMMIT');
      const row = stmt.byId.get(id) as unknown as ReservationRow;
      return reply.code(201).send({ reservation: toDto(row), duplicate: false });
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
  });

  if (options.qaToken) {
    const qaToken = options.qaToken;
    const guard = async (request: FastifyRequest, reply: FastifyReply) => {
      const header = request.headers[CULTURE_QA_HEADER];
      if (typeof header !== 'string' || !safeEqual(header, qaToken)) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Not Found' } });
      }
    };
    app.get('/__qa/records', { preHandler: guard }, async () => {
      const rows = stmt.allReservations.all() as unknown as ReservationRow[];
      return {
        namespace,
        count: rows.length,
        reservations: rows.map((row) => ({ ...toDto(row), submissionId: row.submission_id, userId: row.user_id })),
        times: courseList().flatMap((c) => c.times.map((t) => ({ courseId: c.id, timeId: t.id, capacity: t.capacity, reserved: t.reserved, remaining: t.remaining }))),
      };
    });
    app.post('/__qa/reset', { preHandler: guard }, async () => {
      db.exec('BEGIN IMMEDIATE');
      db.exec('DELETE FROM reservations');
      db.exec('UPDATE course_times SET capacity = default_capacity');
      db.exec('COMMIT');
      return { ok: true, namespace };
    });
    app.post('/__qa/capacity', { preHandler: guard }, async (request, reply) => {
      const body = asRecord(request.body);
      const courseId = typeof body.courseId === 'string' ? body.courseId : typeof body.course === 'string' ? body.course : '';
      const timeId = typeof body.timeId === 'string' ? body.timeId : typeof body.time === 'string' ? body.time : '';
      const capacity = body.capacity;
      const time = stmt.time.get(timeId) as unknown as TimeRow | undefined;
      if (!time || time.course_id !== courseId) return fail(reply, 400, 'TIME_NOT_FOUND', 'unknown course/time');
      if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 0 || capacity > 500) {
        return fail(reply, 400, 'VALIDATION', 'capacity must be an integer 0..500');
      }
      stmt.setCapacity.run(capacity, timeId);
      return { ok: true, namespace, courseId, latest: latestTime(timeId) };
    });
  }

  const sendShell = (reply: FastifyReply) => {
    if (!hasAssets) {
      return reply.code(503).type('text/html; charset=utf-8')
        .send('<!doctype html><html lang="ko"><meta charset="utf-8"><title>준비 중</title><p>화면 파일이 아직 빌드되지 않았습니다.</p></html>');
    }
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html');
  };

  if (hasAssets) {
    app.register(fastifyStatic, { root: assetsDir, prefix: '/', index: false, wildcard: true, maxAge: 0 });
  }
  app.get('/', async (_request, reply) => sendShell(reply));

  app.setNotFoundHandler(async (request, reply) => {
    const path = request.url.split('?')[0] ?? '/';
    const isSpaRoute = (request.method === 'GET' || request.method === 'HEAD') &&
      !path.startsWith('/api/') && !path.startsWith('/__qa') && !/\.[a-z0-9]{1,6}$/i.test(path);
    if (!isSpaRoute) return fail(reply, 404, 'NOT_FOUND', '요청한 주소를 찾을 수 없습니다.');
    return sendShell(reply);
  });

  return app;
}
