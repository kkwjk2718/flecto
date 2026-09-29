import { css as baseCss } from './views.js';

export type InsuranceValues = {
  policyNumber: string;
  applicantName: string;
  phone: string;
  treatmentDate: string;
  claimType: string;
  hospitalName: string;
  claimAmount: string;
  paymentBank: string;
  accountHolder: string;
  accountNumber: string;
  privacyConsent: boolean;
  accuracyConsent: boolean;
};

export const insuranceClaimTypes = ['통원', '입원', '약제비'];
export const insuranceBanks = ['시연은행', '가상은행'];

export const insuranceEscape = (value: string): string => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const insuranceHidden = (name: string, value: string): string => `<input type="hidden" name="${insuranceEscape(name)}" value="${insuranceEscape(value)}">`;
export const insuranceBlank = (): InsuranceValues => ({ policyNumber: '', applicantName: '', phone: '', treatmentDate: '', claimType: '', hospitalName: '', claimAmount: '', paymentBank: '', accountHolder: '', accountNumber: '', privacyConsent: false, accuracyConsent: false });

export const insuranceNoticeText = '이 화면은 온담보험 시연센터의 로컬 시연용 보험금 청구서입니다. 실제 보험 청구·보험 계약·보험금 지급은 이루어지지 않습니다. 실제 개인정보, 진료 정보, 은행 계좌 정보는 입력하지 말고 안내된 시연 값만 사용해 주세요.';
export const insuranceNotice = (): string => `<section class="notice" aria-labelledby="insurance-notice"><h2 id="insurance-notice">청구 전 꼭 확인해 주세요</h2><p>${insuranceNoticeText}</p></section>`;

const nav: Array<[string, string]> = [['/insurance', '보험 홈'], ['/insurance/apply', '보험금청구'], ['/insurance/history', '청구 진행조회'], ['/insurance/guide', '청구 서류 안내']];

export function insuranceLayout(title: string, content: string, csrf: string, authenticated: boolean): string {
  const e = insuranceEscape;
  const account = authenticated
    ? `<span>시연 고객님</span><form method="post" action="/logout">${insuranceHidden('csrf', csrf)}<button class="quiet" type="submit">로그아웃</button></form>`
    : '<a href="/login">로그인</a>';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} · 온담보험 시연센터</title><link rel="stylesheet" href="/insurance/assets/site.css"></head>
  <body class="ins"><a class="skip" href="#main">본문 바로가기</a><header>
  <div class="util"><div class="util-inner"><span class="demo-badge">시연용 가상 보험사</span><span class="util-note">온담보험 시연센터는 FLECTO 시연을 위해 만든 가상 포털입니다. 실제 보험사·보험 상품·계약과 관련이 없습니다.</span><span class="util-links"><a href="/insurance/guide">청구 서류</a><a href="/insurance/history">진행조회</a><a href="/insurance">고객센터</a></span><div class="account">${account}</div></div></div>
  <div class="header-inner"><a class="brand" href="/insurance">온담보험<span>시연센터 · 가상 보험 포털</span></a><span class="brand-sub">보험금청구 <small>DEMO</small></span>
  <table class="head-status"><caption>청구 창구 정보</caption><tbody><tr><th scope="row">접수 방식</th><td>온라인 (시연)</td><th scope="row">상담시간</th><td>평일 09:00–18:00</td></tr><tr><th scope="row">처리 단계</th><td>사고·서류·계좌 → 심사</td><th scope="row">휴무일</th><td>주말·공휴일</td></tr></tbody></table></div>
  <nav aria-label="주 메뉴">${nav.map(([href, text]) => `<a href="${href}">${text}</a>`).join('')}</nav>
  <div class="gnb-sub"><div class="gnb-sub-inner"><span class="gnb-group"><b>청구</b><a href="/insurance/apply">실손 보험금청구</a><a href="/insurance/apply">통원·입원·약제비</a></span><span class="gnb-group"><b>조회</b><a href="/insurance/history">청구 진행상황</a><a href="/insurance/history">접수번호 확인</a></span><span class="gnb-group"><b>안내</b><a href="/insurance/guide">구비서류 안내</a><a href="/insurance/guide">청구 절차</a><a href="/insurance/guide">자주 묻는 질문</a></span><span class="gnb-group"><b>고객</b><a href="/insurance">시연센터 첫 화면</a><a href="/login">로그인</a></span></div></div></header>
  <aside class="lnb" aria-label="보험금청구 메뉴"><h2>보험금청구</h2><ul class="lnb-list"><li><a href="/insurance/apply">보험금 청구서 작성</a></li><li><a href="/insurance/history">청구 진행조회</a></li><li><a href="/insurance/guide">청구 서류 안내</a></li><li><a href="/insurance/guide">청구 절차 안내</a></li><li><a href="/insurance">보험 서비스 전체</a></li></ul>
  <h2>청구 유형</h2><table class="side-table"><thead><tr><th scope="col">유형</th><th scope="col">예시</th></tr></thead><tbody><tr><td>통원</td><td>외래 진료</td></tr><tr><td>입원</td><td>입원 치료</td></tr><tr><td>약제비</td><td>처방 조제</td></tr></tbody></table>
  <h2>고객 지원</h2><table class="side-table"><tbody><tr><th scope="row">상담</th><td>평일<br>09:00–18:00</td></tr><tr><th scope="row">휴무</th><td>주말·공휴일</td></tr><tr><th scope="row">문의</th><td>청구 서류 안내 참고</td></tr></tbody></table>
  <p class="side-foot">모든 증권·진료·계좌 정보는 시연용 합성 데이터입니다.</p></aside>
  <main id="main" tabindex="-1" class="content"><p class="loc"><a href="/insurance">보험 홈</a> <span aria-hidden="true">›</span> 보험금청구 <span aria-hidden="true">›</span> <strong>${e(title)}</strong></p>${content}</main>
  <footer><div class="foot-links"><a href="/insurance/guide">청구 서류 안내</a><a href="/insurance/history">청구 진행조회</a><a href="/insurance/apply">보험금청구 바로가기</a><a href="/insurance">시연센터 홈</a></div><strong>온담보험 시연센터</strong><p>가상 보험 청구 흐름을 체험하는 독립 시연 서비스입니다. 실제 보험 청구·계약·지급이 이루어지지 않습니다.</p><p class="foot-meta">가상도시 온담로 200 (시연 주소) · 온담보험 시연팀 · 실제 보험사 로고·상품·약관을 사용하지 않습니다.</p></footer></body></html>`;
}

type FieldSpec = { name: keyof InsuranceValues; label: string; hint: string; control: (attrs: string, value: string) => string };

export function insuranceForm(csrf: string, values: InsuranceValues, errors: Record<string, string>, formToken: string): string {
  const e = insuranceEscape;
  const describe = (name: string) => {
    const ids = [`${name}-hint`, ...(errors[name] ? [`${name}-error`] : [])];
    return ` aria-describedby="${ids.join(' ')}"${errors[name] ? ' aria-invalid="true"' : ''}`;
  };
  const error = (name: string) => errors[name] ? `<p class="field-error" id="${name}-error">${e(errors[name])}</p>` : '';
  const options = (list: string[], current: string) => `<option value="">선택해 주세요</option>${list.map(o => `<option value="${e(o)}"${current === o ? ' selected' : ''}>${e(o)}</option>`).join('')}`;
  const text = (name: string, extra = '') => (attrs: string, value: string) => `<input id="${name}" name="${name}" value="${e(value)}" required${extra}${attrs}>`;
  const field = (f: FieldSpec) => {
    const value = String(values[f.name] ?? '');
    return `<div class="field"><label for="${f.name}">${f.label}</label>${f.control(describe(f.name), value)}<p class="hint" id="${f.name}-hint">${f.hint}</p>${error(f.name)}</div>`;
  };
  const group = (legend: string, specs: FieldSpec[]) => `<fieldset><legend>${legend} <span class="muted">모두 필수 입력</span></legend>${specs.map(field).join('')}</fieldset>`;
  const personal: FieldSpec[] = [
    { name: 'policyNumber', label: '보험증권번호', hint: '시연 증권 예: INS-2026-001', control: text('policyNumber', ' maxlength="40" autocomplete="off" spellcheck="false"') },
    { name: 'applicantName', label: '청구인 이름', hint: '시연 청구인 예: 김하늘', control: text('applicantName', ' maxlength="40" autocomplete="off"') },
    { name: 'phone', label: '휴대전화 번호', hint: '숫자만 입력 · 시연 예: 01012345678', control: text('phone', ' type="tel" inputmode="numeric" maxlength="11" autocomplete="off"') },
  ];
  const incident: FieldSpec[] = [
    { name: 'treatmentDate', label: '진료일', hint: '시연 진료일: 2026년 9월 1일', control: text('treatmentDate', ' type="date"') },
    { name: 'claimType', label: '청구 유형', hint: '통원·입원·약제비 중 선택 · 시연 예: 통원', control: (attrs, value) => `<select id="claimType" name="claimType" required${attrs}>${options(insuranceClaimTypes, value)}</select>` },
    { name: 'hospitalName', label: '의료기관명', hint: '시연 의료기관 예: 시연의원', control: text('hospitalName', ' maxlength="60" autocomplete="off"') },
    { name: 'claimAmount', label: '청구 금액', hint: '원 단위 숫자 · 시연 예: 85000', control: text('claimAmount', ' type="number" min="1" step="1" inputmode="numeric"') },
  ];
  const account: FieldSpec[] = [
    { name: 'paymentBank', label: '수령 은행', hint: '시연 은행 중 선택 · 예: 시연은행', control: (attrs, value) => `<select id="paymentBank" name="paymentBank" required${attrs}>${options(insuranceBanks, value)}</select>` },
    { name: 'accountHolder', label: '예금주', hint: '청구인과 같은 이름 · 시연 예: 김하늘', control: text('accountHolder', ' maxlength="40" autocomplete="off"') },
    { name: 'accountNumber', label: '계좌번호', hint: '숫자만 입력 · 시연 예: 1002003004', control: text('accountNumber', ' inputmode="numeric" maxlength="20" autocomplete="off" spellcheck="false"') },
  ];
  const consent = (name: 'privacyConsent' | 'accuracyConsent', label: string, hint: string) => `<div class="consent"><input id="${name}" name="${name}" type="checkbox" value="yes" required${values[name] ? ' checked' : ''}${describe(name)}><label for="${name}">${label}</label></div><p class="hint" id="${name}-hint">${hint}</p>${error(name)}`;
  return `<div class="intro"><h1>보험금청구</h1><p>사고·진료 정보와 수령 계좌를 입력한 뒤 다음 화면에서 다시 검토할 수 있습니다. 온담보험 시연센터의 가상 청구서입니다.</p></div>
  <ol class="stepbar" aria-label="청구 단계"><li class="on"><b>1</b> 청구인·사고 정보</li><li><b>2</b> 서류 안내 확인</li><li><b>3</b> 수령 계좌 입력</li><li><b>4</b> 내용 검토·직접 제출</li></ol>
  <table class="svc"><caption>청구 서비스 정보</caption><tbody><tr><th scope="row">서비스명</th><td>실손 보험금청구 (시연)</td><th scope="row">처리 부서</th><td>온담보험 시연 청구팀</td></tr><tr><th scope="row">청구 방법</th><td>온라인 청구서 작성 후 검토·제출</td><th scope="row">진행 확인</th><td><a href="/insurance/history">청구 진행조회</a></td></tr><tr><th scope="row">구비 서류</th><td><a href="/insurance/guide">청구 유형별 안내</a> (시연에서는 제출 없음)</td><th scope="row">수수료</th><td>없음</td></tr></tbody></table>
  <div class="apply-layout"><div class="apply-main">
  ${Object.keys(errors).length ? `<section role="alert" class="error"><h2>입력 내용을 확인해 주세요</h2><ul>${Object.entries(errors).map(([key, message]) => `<li>${key === 'form' ? e(message) : `<a href="#${e(key)}">${e(message)}</a>`}</li>`).join('')}</ul></section>` : ''}
  <form class="panel" method="post" action="/insurance/apply">${insuranceHidden('csrf', csrf)}${insuranceHidden('formToken', formToken)}
  ${group('청구인 정보', personal)}${group('사고·진료 정보', incident)}
  <table class="docs"><caption>청구 유형별 필요 서류 안내 (시연에서는 서류를 제출하지 않습니다)</caption><thead><tr><th scope="col">청구 유형</th><th scope="col">일반적으로 필요한 서류</th><th scope="col">발급처</th><th scope="col">시연 처리</th></tr></thead><tbody><tr><td>통원</td><td>진료비 영수증, 진료비 세부내역서</td><td>진료받은 의료기관</td><td>제출 없음</td></tr><tr><td>입원</td><td>진료비 영수증, 진료비 세부내역서, 입·퇴원 확인서</td><td>입원한 의료기관</td><td>제출 없음</td></tr><tr><td>약제비</td><td>약제비 영수증 또는 처방 조제 내역</td><td>조제한 약국</td><td>제출 없음</td></tr></tbody></table>
  ${group('보험금 수령 계좌', account)}
  ${insuranceNotice()}
  ${consent('privacyConsent', '시연 정보 저장에 동의합니다 (필수)', '입력한 시연 값은 청구 접수 확인을 위해 이 로컬 시연 서비스에만 저장됩니다.')}
  ${consent('accuracyConsent', '입력한 시연 내용을 확인했습니다 (필수)', '다음 화면에서 모든 항목을 다시 검토한 뒤 직접 제출합니다.')}
  <div class="actions"><button type="submit">청구 내용 확인</button><a href="/insurance">다음에 청구하기</a></div></form></div>
  <div class="apply-rail"><table class="rail-table"><caption>청구 공지</caption><thead><tr><th scope="col">제목</th><th scope="col">게시일</th></tr></thead><tbody><tr><td><a href="/insurance/guide">[시연] 청구 유형별 서류 안내</a></td><td>09.01</td></tr><tr><td><a href="/insurance/history">[시연] 청구 진행조회 방법</a></td><td>09.08</td></tr><tr><td><a href="/insurance/guide">[시연] 수령 계좌 입력 안내</a></td><td>09.15</td></tr><tr><td><a href="/insurance">[시연] 상담시간 안내</a></td><td>09.22</td></tr></tbody></table>
  <table class="rail-table"><caption>청구 처리 단계</caption><thead><tr><th scope="col">단계</th><th scope="col">내용</th></tr></thead><tbody><tr><td>사고</td><td>청구인·진료 정보 입력</td></tr><tr><td>서류</td><td>유형별 필요 서류 확인</td></tr><tr><td>계좌</td><td>수령 은행·계좌 입력</td></tr><tr><td>심사</td><td>제출 후 접수번호 확인</td></tr></tbody></table>
  <table class="rail-table"><caption>입력 항목 형식</caption><tbody><tr><th scope="row">증권번호</th><td>영문·숫자·하이픈</td></tr><tr><th scope="row">휴대전화</th><td>숫자 11자리</td></tr><tr><th scope="row">진료일</th><td>연-월-일</td></tr><tr><th scope="row">청구 금액</th><td>원 단위 숫자</td></tr><tr><th scope="row">계좌번호</th><td>숫자만</td></tr></tbody></table></div></div>`;
}

export function insuranceDetails(values: InsuranceValues): string {
  const e = insuranceEscape;
  const rows: Array<[string, string]> = [
    ['보험증권번호', values.policyNumber], ['청구인 이름', values.applicantName], ['휴대전화 번호', values.phone], ['진료일', values.treatmentDate],
    ['청구 유형', values.claimType], ['의료기관명', values.hospitalName], ['청구 금액', values.claimAmount ? `${values.claimAmount}원` : ''],
    ['수령 은행', values.paymentBank], ['예금주', values.accountHolder], ['계좌번호', values.accountNumber],
    ['시연 정보 저장 동의', values.privacyConsent ? '동의함' : '동의하지 않음'], ['입력 내용 확인', values.accuracyConsent ? '확인함' : '확인하지 않음'],
  ];
  return `<dl class="details">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>`;
}

export const insuranceCss = baseCss + `
body.ins{--navy:#0f5a5a;--blue:#0b6a7a}
.ins nav a{border-right-color:#1d7070}.ins nav a:first-child{border-left-color:#1d7070}.ins nav a:hover{background:#177070}
.ins .brand-sub{color:#0f5a5a;font-size:16px}
.ins fieldset{margin-bottom:14px}
.docs{background:#fff;border-top:2px solid #5d6b80;margin:0 0 14px;font-size:12px}.docs caption{font-size:13px}.docs th{background:#f4f6f9;color:#3d4957;font-weight:600;font-size:12px;padding:6px 8px}.docs td{padding:6px 8px}
.ins .consent+.hint{margin:-6px 0 6px 10px}
`;
