import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { insuranceLayout, insuranceCss, insuranceForm, insuranceDetails, insuranceNotice, insuranceBlank, insuranceEscape as escape, insuranceHidden as hidden, type InsuranceValues } from './insurance-views.js';

// Synthetic local source only. No insurer, payment, model, telemetry or cache client.
const REQUIREMENTS = 'insurance-v1:12-required:policy=INS-2026-NNN:types=통원,입원,약제비:banks=시연은행,가상은행';
const textFields = ['policyNumber', 'applicantName', 'phone', 'treatmentDate', 'claimType', 'hospitalName', 'claimAmount', 'paymentBank', 'accountHolder', 'accountNumber'] as const;
const labels: Record<typeof textFields[number], string> = { policyNumber: '증권번호', applicantName: '청구인 이름', phone: '휴대전화', treatmentDate: '진료일', claimType: '청구 유형', hospitalName: '병원명', claimAmount: '청구 금액', paymentBank: '은행', accountHolder: '예금주', accountNumber: '계좌번호' };
const nonce = () => randomBytes(24).toString('hex');
const digest = (value: string) => createHash('sha256').update(value).digest();
const equal = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
type Draft = { id: string; session_id: string; values_json: string; terms: string; requirements: string; receipt_id: string | null };
type Receipt = { id: string; session_id: string; values_json: string; noticeText: string; createdAt: string };
type Context = {
  db: DatabaseSync; namespace: 'QA' | 'DEMO'; sessionSecret: string;
  sessionOf(request: FastifyRequest): { id: string; csrf: string; authenticated: number };
  auth(request: FastifyRequest, reply: FastifyReply): boolean;
  bodyOf(request: FastifyRequest): Record<string, unknown>;
  field(body: Record<string, unknown>, key: string): string;
};

export function initializeInsuranceDatabase(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS insurance_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS insurance_drafts(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,values_json TEXT NOT NULL,terms TEXT NOT NULL,requirements TEXT NOT NULL,receipt_id TEXT);
    CREATE TABLE IF NOT EXISTS insurance_records(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,claim_key TEXT NOT NULL,values_json TEXT NOT NULL,noticeText TEXT NOT NULL,createdAt TEXT NOT NULL,UNIQUE(session_id,claim_key));
    INSERT OR IGNORE INTO insurance_meta VALUES ('insertions','0');`);
}
/** Called inside the source service's existing reset transaction. Sessions survive. */
export function resetInsuranceDatabase(db: DatabaseSync): void {
  db.exec("DELETE FROM insurance_records; DELETE FROM insurance_drafts; UPDATE insurance_meta SET value='0' WHERE key='insertions';");
}

function valuesOf(body: Record<string, unknown>): InsuranceValues {
  const values = insuranceBlank();
  for (const key of textFields) values[key] = typeof body[key] === 'string' ? body[key] as string : '';
  values.privacyConsent = body.privacyConsent === 'yes';
  values.accuracyConsent = body.accuracyConsent === 'yes';
  return values;
}
function validate(values: InsuranceValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of textFields) if (typeof values[key] !== 'string' || !values[key].trim() || values[key].length > 100 || /[\u0000-\u001f]/.test(values[key])) errors[key] = `${labels[key]} 항목을 100자 이내로 입력해 주세요.`;
  if (!/^INS-2026-\d{3}$/.test(values.policyNumber)) errors.policyNumber = '시연 증권번호 INS-2026-001 형식으로 입력해 주세요.';
  if (!/^01\d{8,9}$/.test(values.phone)) errors.phone = '휴대전화 번호를 숫자 10~11자리로 입력해 주세요.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.treatmentDate) || !Number.isFinite(Date.parse(values.treatmentDate)) || new Date(values.treatmentDate).toISOString().slice(0, 10) !== values.treatmentDate) errors.treatmentDate = '달력에 있는 진료일을 입력해 주세요.';
  if (!['통원', '입원', '약제비'].includes(values.claimType)) errors.claimType = '청구 유형을 선택해 주세요.';
  if (!/^\d{1,12}$/.test(values.claimAmount) || Number(values.claimAmount) <= 0) errors.claimAmount = '청구 금액을 1원 이상, 숫자 12자리 이내로 입력해 주세요.';
  if (!['시연은행', '가상은행'].includes(values.paymentBank)) errors.paymentBank = '시연용 은행을 선택해 주세요.';
  if (!/^\d{6,20}$/.test(values.accountNumber)) errors.accountNumber = '시연 계좌번호를 숫자 6~20자리로 입력해 주세요.';
  if (values.privacyConsent !== true) errors.privacyConsent = '시연 정보 저장 안내를 읽고 직접 동의해 주세요.';
  if (values.accuracyConsent !== true) errors.accuracyConsent = '작성한 시연 정보를 확인하고 직접 동의해 주세요.';
  return errors;
}

export function registerInsuranceRoutes(app: FastifyInstance, context: Context): void {
  const { db, namespace, sessionSecret, sessionOf, auth, bodyOf, field } = context;
  const html = (request: FastifyRequest, reply: FastifyReply, title: string, content: string, status = 200) => {
    const session = sessionOf(request);
    return reply.code(status).type('text/html; charset=utf-8').send(insuranceLayout(title, content, session.csrf, !!session.authenticated));
  };
  const formToken = (request: FastifyRequest, draft?: Draft) => createHmac('sha256', sessionSecret).update(JSON.stringify(['insurance', sessionOf(request).csrf, REQUIREMENTS, insuranceNotice(), draft?.id ?? '', draft?.values_json ?? ''])).digest('hex');
  const renderForm = (request: FastifyRequest, values: InsuranceValues, errors: Record<string, string> = {}, editing?: string) => {
    const form = insuranceForm(sessionOf(request).csrf, values, errors, formToken(request));
    return editing ? form.replace('</form>', `${hidden('editDraftId', editing)}</form>`) : form;
  };
  const getDraft = (request: FastifyRequest, id: string) => db.prepare('SELECT * FROM insurance_drafts WHERE id=? AND session_id=?').get(id, sessionOf(request).id) as Draft | undefined;
  const stale = (draft: Draft) => draft.terms !== insuranceNotice() || draft.requirements !== REQUIREMENTS;
  const changed = (request: FastifyRequest, reply: FastifyReply, values: InsuranceValues) => html(request, reply, '안내 확인', renderForm(request, { ...values, privacyConsent: false, accuracyConsent: false }, { form: '안내 또는 검토 내용이 변경되었습니다. 신청서를 다시 확인하고 직접 동의해 주세요.' }), 409);
  const claimKey = (values: InsuranceValues) => JSON.stringify([values.policyNumber, values.treatmentDate, values.claimType]);

  app.get('/insurance/assets/site.css', (_request, reply) => reply.type('text/css; charset=utf-8').send(insuranceCss));
  app.get('/insurance', (request, reply) => html(request, reply, '보험금 청구 시연', `<section class="hero"><h1>보험금 청구</h1><p>가상 정보로 청구서를 작성하고 접수 내역을 확인하는 시연입니다.</p><a class="button" href="/insurance/apply">보험금 청구하기</a></section><section class="panel"><h2>청구 서비스</h2><ul><li><a href="/insurance/guide">청구 방법과 시연 정보</a></li><li><a href="/insurance/history">내 청구서 접수 내역</a></li></ul>${insuranceNotice()}</section>`));
  app.get('/insurance/guide', (request, reply) => html(request, reply, '보험금 청구 안내', `<section class="panel"><h1>보험금 청구 안내</h1><ol><li>시연 계정 demo / flecto2026!로 로그인한 뒤 보험금 청구 화면을 엽니다.</li><li>청구인·진료·시연 계좌 정보를 입력합니다.</li><li>안내를 읽고 직접 동의합니다.</li><li>검토 화면에서 내용을 확인하고 직접 접수 버튼을 누릅니다.</li></ol><h2>공개된 가상 입력 예시</h2><p>INS-2026-001 / 김하늘 / 01012345678 / 2026-09-01 / 통원 / 시연의원 / 85000 / 시연은행 / 김하늘 / 1002003004</p><p>실제 개인정보 대신 위 가상 예시를 사용해 주세요. 접수는 이 시연 서버에만 저장되며 보험사 제출·승인·지급은 이루어지지 않습니다.</p>${insuranceNotice()}<a class="button" href="/insurance/apply">청구서 작성</a></section>`));
  app.get('/insurance/apply', (request, reply) => {
    if (!auth(request, reply)) return;
    const id = field(request.query as Record<string, unknown>, 'draft');
    const draft = id ? getDraft(request, id) : undefined;
    if (id && !draft) return html(request, reply, '신청서 없음', '<h1>신청서를 찾을 수 없습니다</h1><a href="/insurance/apply">새 청구서 작성</a>', 404);
    if (draft?.receipt_id) return reply.redirect(`/insurance/receipt/${draft.receipt_id}`, 303);
    const values = draft ? JSON.parse(draft.values_json) as InsuranceValues : insuranceBlank();
    if (draft && stale(draft)) { values.privacyConsent = false; values.accuracyConsent = false; }
    return html(request, reply, '보험금 청구서 작성', renderForm(request, values, {}, draft?.id));
  });
  app.post('/insurance/apply', (request, reply) => {
    if (!auth(request, reply)) return;
    const body = bodyOf(request), values = valuesOf(body);
    if (!equal(field(body, 'formToken'), formToken(request))) return changed(request, reply, values);
    const errors = validate(values);
    if (Object.keys(body).some(key => ![...textFields, 'privacyConsent', 'accuracyConsent', 'csrf', 'formToken', 'editDraftId'].includes(key))) errors.form = '지원하지 않는 입력 항목이 있습니다.';
    if (Object.keys(errors).length) return html(request, reply, '입력 확인', renderForm(request, values, errors, field(body, 'editDraftId')), 422);
    const editing = field(body, 'editDraftId');
    const previous = editing ? getDraft(request, editing) : undefined;
    if (editing && (!previous || previous.receipt_id)) return changed(request, reply, values);
    const id = nonce();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO insurance_drafts VALUES (?,?,?,?,?,NULL)').run(id, sessionOf(request).id, JSON.stringify(values), insuranceNotice(), REQUIREMENTS);
      if (previous) db.prepare('DELETE FROM insurance_drafts WHERE id=? AND session_id=?').run(previous.id, sessionOf(request).id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return reply.redirect(`/insurance/review?draft=${id}`, 303);
  });
  app.get('/insurance/review', (request, reply) => {
    if (!auth(request, reply)) return;
    const draft = getDraft(request, field(request.query as Record<string, unknown>, 'draft'));
    if (!draft) return reply.redirect('/insurance/apply', 303);
    if (draft.receipt_id) return reply.redirect(`/insurance/receipt/${draft.receipt_id}`, 303);
    const values = JSON.parse(draft.values_json) as InsuranceValues;
    if (stale(draft) || Object.keys(validate(values)).length) return changed(request, reply, values);
    return html(request, reply, '청구서 검토', `<section class="panel"><h1>보험금 청구 내용을 확인해 주세요</h1><p>아직 접수되지 않았습니다. 아래 내용이 맞으면 직접 접수 버튼을 눌러 주세요.</p>${insuranceDetails(values)}${insuranceNotice()}<p>시연 정보 저장과 작성 내용 확인에 동의했습니다.</p><form method="post" action="/insurance/submit">${hidden('csrf', sessionOf(request).csrf)}${hidden('draftId', draft.id)}${hidden('formToken', formToken(request, draft))}<div class="actions"><button type="submit">보험금 청구서 접수</button><a href="/insurance/apply?draft=${escape(draft.id)}">내용 수정</a></div></form></section>`);
  });
  app.post('/insurance/submit', (request, reply) => {
    if (!auth(request, reply)) return;
    const body = bodyOf(request);
    const draft = getDraft(request, field(body, 'draftId'));
    if (!draft) return html(request, reply, '검토 필요', '<section role="alert"><h1>청구서를 다시 검토해 주세요</h1><a href="/insurance/apply">청구서 작성</a></section>', 409);
    const values = JSON.parse(draft.values_json) as InsuranceValues;
    if (stale(draft) || Object.keys(validate(values)).length || !equal(field(body, 'formToken'), formToken(request, draft)) || Object.keys(body).some(key => !['csrf', 'draftId', 'formToken'].includes(key))) return changed(request, reply, values);
    if (draft.receipt_id) return reply.redirect(`/insurance/receipt/${draft.receipt_id}`, 303);
    // Synchronous transaction: no await between reading the draft and committing it.
    const existing = db.prepare('SELECT * FROM insurance_records WHERE session_id=? AND claim_key=?').get(sessionOf(request).id, claimKey(values)) as Receipt | undefined;
    if (existing && existing.values_json !== draft.values_json) return html(request, reply, '접수 내역 확인', '<section role="alert"><h1>이미 접수한 청구입니다</h1><p>같은 증권번호·진료일·청구 유형의 접수 내역을 확인해 주세요.</p><a href="/insurance/history">접수 내역 확인</a></section>', 409);
    const id = existing?.id ?? `INS-DEMO-${randomBytes(8).toString('hex').toUpperCase()}`;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!existing) {
        db.prepare('INSERT INTO insurance_records VALUES (?,?,?,?,?,?)').run(id, draft.session_id, claimKey(values), draft.values_json, draft.terms, new Date().toISOString());
        db.prepare("UPDATE insurance_meta SET value=CAST(value AS INTEGER)+1 WHERE key='insertions'").run();
      }
      db.prepare('UPDATE insurance_drafts SET receipt_id=? WHERE id=?').run(id, draft.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return reply.redirect(`/insurance/receipt/${id}`, 303);
  });
  app.get('/insurance/receipt/:id', (request, reply) => {
    if (!auth(request, reply)) return;
    const record = db.prepare('SELECT * FROM insurance_records WHERE id=? AND session_id=?').get(field(request.params as Record<string, unknown>, 'id'), sessionOf(request).id) as Receipt | undefined;
    if (!record) return html(request, reply, '접수 내역 없음', '<h1>접수 내역을 찾을 수 없습니다</h1><a href="/insurance/history">내 접수 내역</a>', 404);
    return html(request, reply, '청구서 접수', `<section role="status" class="panel success"><h1>보험금 청구서 접수(시연)</h1><p>시연 서버에 청구서가 저장되었습니다. 보험사 접수·심사 승인·보험금 지급이 아닙니다.</p><p>접수번호 <output aria-label="접수번호">${escape(record.id)}</output></p>${insuranceDetails(JSON.parse(record.values_json) as InsuranceValues)}<h2>동의한 시연 안내</h2>${record.noticeText}<div class="actions"><a class="button" href="/insurance/history">접수 내역 확인</a><a href="/insurance">홈으로</a></div></section>`);
  });
  app.get('/insurance/history', (request, reply) => {
    if (!auth(request, reply)) return;
    const records = db.prepare('SELECT * FROM insurance_records WHERE session_id=? ORDER BY createdAt DESC,id').all(sessionOf(request).id) as Receipt[];
    return html(request, reply, '내 청구서 접수 내역', `<section class="panel"><h1>내 청구서 접수 내역</h1><p>현재 로그인 세션의 시연 접수만 표시합니다. 실제 보험금 지급 내역이 아닙니다.</p>${records.length ? `<ul>${records.map(record => `<li><a href="/insurance/receipt/${escape(record.id)}">${escape(record.id)}</a> · ${escape((JSON.parse(record.values_json) as InsuranceValues).treatmentDate)}</li>`).join('')}</ul>` : '<p>접수한 청구서가 없습니다.</p>'}<a href="/insurance/apply">새 청구서 작성</a></section>`);
  });
  app.get('/__qa/insurance/records', (_request, reply) => {
    const records = (db.prepare('SELECT * FROM insurance_records ORDER BY createdAt,id').all() as Receipt[]).map(record => ({ ...JSON.parse(record.values_json) as InsuranceValues, id: record.id, createdAt: record.createdAt, noticeText: record.noticeText, sessionId: digest(record.session_id).toString('hex') }));
    const counter = db.prepare("SELECT value FROM insurance_meta WHERE key='insertions'").get() as { value: string };
    return reply.send({ records, count: records.length, insertionCount: Number(counter.value), namespace });
  });
}
