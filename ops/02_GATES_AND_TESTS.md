# 수용 게이트·증거 기준

**모든 시험 상태는 현재 NOT_RUN이다.** 문서 패키지의 정적 검사와 아래 제품·운영 시험은 다르다.

## 원본 v4의 T01–T26 — 의미와 문구 보존

| ID | 조건 | 통과 기준 | 현재 |
|---|---|---|---|
| T01 | 구매 신청 정상 흐름 | 원본 저장값·완료 화면 일치 | NOT_RUN |
| T02 | 문화센터 정상 흐름 | 선택 강좌·시간과 원본 결과 일치 | NOT_RUN |
| T03 | 필수 항목 비움 | 제출 안 됨, 해당 오류 안내 | NOT_RUN |
| T04 | 한국어 조합/붙여넣기 | 문자 손실·커서 점프 없음 | NOT_RUN |
| T05 | React controlled field | 다음 렌더·제출 후에도 값 유지 | NOT_RUN |
| T06 | 체크박스 동의 | 사용자 선택 없이 변경 안 됨 | NOT_RUN |
| T07 | 중복 클릭/Enter 연타 | 테스트 서버 결과 한 건 | NOT_RUN |
| T08 | 응답 유실/오류 | 거짓 성공·자동 재제출 없음 | NOT_RUN |
| T09 | 전체 페이지 이동 | 재주입·상태 복구, 옛 ref 폐기 | NOT_RUN |
| T10 | SPA 이동/뒤로가기 | 올바른 문서·단계 연결 | NOT_RUN |
| T11 | service worker 재시작 | 비개인 상태 복구, 이전 동작 자동 재실행 없음 | NOT_RUN |
| T12 | 필수 입력 추가 | 오래된 계획 거부·재분석 | NOT_RUN |
| T13 | 동일 라벨 버튼 복수 | 다른 form 버튼을 누르지 않음 | NOT_RUN |
| T14 | 동의 원문 수정 | 기존 notice cache 무효화 | NOT_RUN |
| T15 | 2.9초 완료 | 광고 없음, 바로 READY | NOT_RUN |
| T16 | 3.1초 이후 완료 | 준비 중만 광고, 완료 즉시 종료 | NOT_RUN |
| T17 | 30초 초과/31초 늦은 응답 (2026-09-29 16:07 사용자 대기 연장 지시; 기존 10초/11초) | 원본 선택 제공, 늦은 UI 적용 없음 | NOT_RUN |
| T18 | 사용자 취소·목표 변경·탭 변경 | 이전 결과 적용·다른 탭 캡처 없음 | NOT_RUN |
| T19 | 광고 누락·닫기 | 준비 기능에 영향 없음 | NOT_RUN |
| T20 | 개인정보 sentinel | 프롬프트·DB·로그·광고에 유출 없음 | NOT_RUN |
| T21 | 빈 캐시/따뜻한 캐시 | 서로 구분된 측정, 최신 선택지 반영 | NOT_RUN |
| T22 | 현재 화면 AI 계획 경로 차단 | 입력·수정·제출에 추가 계획 요청 없음 | NOT_RUN |
| T23 | 미지원 iframe/CAPTCHA | 우회 안 함, 원본에서 계속 | NOT_RUN |
| T24 | Keyboard·Escape·200% 확대 | 포커스·입력·원본 복귀 사용 가능 | NOT_RUN |
| T25 | 재시작 | 설정·구조 캐시만 유지, 타인 입력 복구 없음 | NOT_RUN |
| T26 | holdout 변형 | 숨은 정답 없이 새 구조와 오류에 대응 | NOT_RUN |

## v6 추가 검증 T27–T40

기존 검사를 대체하지 않는다. 경합·권한·리뷰 무효화·재사용 오염을 더 구체화했다.

| ID | 조건 | 통과 기준 | 현재 |
|---|---|---|---|
| T27 | LOCAL_NEXT와 source action 분리 | 로컬 단계 이동이 원본 click/submit을 호출하지 않음 | NOT_RUN |
| T28 | 검토 후 값·중요조건 변경 | 이전 review token 무효, 최신 실제값으로 다시 확인 | NOT_RUN |
| T29 | QA oracle 격리 | extension/planner가 QA token·원본 DB·oracle에 접근 못 함 | NOT_RUN |
| T30 | 모델 악성/잘못된 출력 | unknown refs·HTML/JS·임의URL·필수누락 거부, plain text 렌더 | NOT_RUN |
| T31 | loopback 접근·sender 위조 | 미승인 Host/Origin/token/tab/document 요청 거부 | NOT_RUN |
| T32 | FLECTO·광고·타이머 mutation | 자체 렌더가 snapshot 재추론 루프를 만들지 않음 | NOT_RUN |
| T33 | 같은 요청 중복·목표 변경 | singleflight와 새 epoch, 예전 결과를 새목표에 적용하지 않음 | NOT_RUN |
| T34 | 시각 보완 탭·가림·기한 | 같은 합성 document만 가려 전송; 실패 시 전송 안 함; 시계 초기화 없음 | NOT_RUN |
| T35 | fixture/LIVE/provider 실패 혼동 | LIVE 실패를 fixture로 조용히 성공 처리하지 않음 | NOT_RUN |
| T36 | READY와 광고 타이머 경합 | READY 우선; 종료 광고 위치에서 오클릭·제출 발생 안 함 | NOT_RUN |
| T37 | 여러 세션·cache·reset | 현재 값/정원 사용, 타인 입력 복구 없음, demo reset은 합성데이터만 | NOT_RUN |
| T38 | 여러 창·탭·origin | 요청/연결이 해당 document에만 적용; 다른 origin 재활성화 | NOT_RUN |
| T39 | 제품 모델·prompt/version 교체 | 근거·캐시 버전 분리, 이전 모델 LIVE 합산 금지 | NOT_RUN |
| T40 | 로그인·OTP 등장·만료 | 분석/캡처 pause, 비밀번호·OTP 값의 모델·로그·광고 전송 없음 | NOT_RUN |

## 실제 운영 검사 — v5 O01–O15의 명칭을 OPER01–OPER15로 정리

작업 티켓 OPS01/OPS02와 혼동하지 않게 표기만 분리했다. 실제 프로세스를 대상으로 수행해야 MANAGED_TESTED다.

| ID | 주입 상황 | 통과 기준 | 현재 |
|---|---|---|---|
| OPER01 | 동일 run 두 번 시작 | 두 번째 실행이 lock과 작업 소유권을 얻지 못함 | NOT_RUN |
| OPER02 | codeStop 도달 | 신규 코딩 중단, 자기 child만 보존 후 종료 | NOT_RUN |
| OPER03 | supervisor crash | ledger/실제 파일을 대조하고 정상본 보존 | NOT_RUN |
| OPER04 | 옛 worker late handoff | lease generation 불일치 결과 격리 | NOT_RUN |
| OPER05 | 동일 patch 재도착 | 중복 통합 안 함 | NOT_RUN |
| OPER06 | worker 진전 없음 | 제한된 진단·종료, 무한 대기 안 함 | NOT_RUN |
| OPER07 | rate/auth/quota | backoff와 승인차단 구분, 자동결제 없음 | NOT_RUN |
| OPER08 | PID 재사용·타인 포트 | 소유확인 실패 process를 종료하지 않음 | NOT_RUN |
| OPER09 | 보호파일·scope 수정 | patch 거부, 실제 요구사항·gate 보존 | NOT_RUN |
| OPER10 | missing/skip/flaky/가짜 report | 전체 PASS로 집계하지 않음 | NOT_RUN |
| OPER11 | 다른 artifact LIVE 증거 | 현재 릴리스 근거로 인정하지 않음 | NOT_RUN |
| OPER12 | gate 실패 상태에서 마감 | 안전 정상본 또는 정직한 제한등급으로 정리 | NOT_RUN |
| OPER13 | 이미지 실패·late asset | 핵심 제품을 막지 않고 cutoff 이후 미반영 | NOT_RUN |
| OPER14 | 과거 정상본 안전 결함 | REVOKED로 출고 후보에서 제외 | NOT_RUN |
| OPER15 | STOP/정상/비정상 종료 | STOP·정상 종료는 재시작하지 않음; crash만 제한 재개 | NOT_RUN |

## 단계별 게이트

G0: fixture로 실제 원본 입력·저장과 잘못된 ref 거부. 전체 제품 완성 등급 아님.
G1: 구매혜택의 전체 흐름+동의/중복/오류/원본복귀/기본 시간상한. 실제 Codex 미준비이면 fixture로 표시.
G2: 구매혜택 구조변형과 무효화. 문화센터 뼈대 완료에 불필요하게 의존하지 않음.
G3: 문화센터 원본 처리+구매혜택 회귀.
G4: T01–T40 전체 요구 assertion(미구현 positive 경로는 NOT_RUN으로 남김), 시각·privacy·state 경합, 원본서버 oracle, 실제 build.
LIVE: 같은 artifact에서 두 사이트 cold 각3회 이상과 원본 결과. warm은 별도. 실제 실패 횟수도 보존.

T34는 safe disabled path만 검사한 것과 실제 허용 crop의 positive 경로를 구분한다. vision 미준비이면 실패/미검증 부분을 그대로 남기고 '전체 시각보완 완료'라고 쓰지 않는다. fixture로 positive 동작을 검사했다고 원격 모델까지 검증한 것은 아니다.

## 자동화하지 못한 확인은 별도

MANUAL01: 시연 Google Chrome 프로필의 실제 저장 테스트 계정 자동완성/인증.
MANUAL02: Mac 한국어 입력기로 composition·수정·Enter 확인.
MANUAL03: 심사위원에게 넘길 200% 확대·설정·포커스 실제 화면 확인.

Playwright가 합성 composition 이벤트를 보냈다는 것과 실제 OS 입력기 검증은 다르다. 수동 미확인을 숨기지 않는다. CODE_FULL과 DEMO_READY 상태를 별개로 기록한다. 사용자에게 사전 묶음 점검으로 요청하고 반복 소액 확인 질문을 만들지 않는다.

## 진짜 PASS

process exit0, 올바른 test manifest, required ID 누락 없음, skip/flaky/.only 없음, actual artifact hash 일치, console/runtime 관련 오류 없음, 원본 저장값 확인. '완료' 텍스트만 찾는 E2E는 불충분하다. QA oracle에 기대값을 직접 넣고 성공시키지 않는다.

고장 주입 테스트는 FAULT_INJECTION, 실제 공급자는 LIVE_CODEX, fixture는 FIXTURE, 재사용은 CACHE, 영상은 REPLAY로 기록한다. 현재 화면의 AI 계획 endpoint만 차단하는 T22를 전체 오프라인 제품 주장으로 바꾸지 않는다.

## holdout과 테스트 수정

QA가 확인된 정상 범위에서 추가 구조 변형을 만든다. 회귀 디버깅에 사용한 holdout은 새 holdout 검증과 구분한다. 같은 모델의 리뷰어라 완전히 독립적인 실험이라고 과장하지 않는다.

테스트 버그는 원문 requirement와 원본 직접 동작을 비교한 독립 QA 검토 후 고친다. gate version을 바꾸고 영향을 받는 증거를 다시 수집한다. 제품을 고치기 어렵다고 기대조건을 약화하지 않는다.

## 검사 예산

초기 module tests와 stage gate를 분리해 제품 전체 미완성을 이유로 모든 모듈을 막지 않는다. 전체 E2E는 통합 후보에서 직렬 실행한다. 실패 후 우연히 통과한 run 하나만 골라 보고하지 않는다. 3회 반복은 소규모 출시 전 진단이지 통계적 신뢰성 보장 아니다.
