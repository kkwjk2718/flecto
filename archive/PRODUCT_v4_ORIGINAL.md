# Project FLECTO — 세부 구현 명세 v4

작성일: 2026-09-28
상태: 구현 기준안. 이 문서를 작성하면서 제품 코드, 실계정 호출, 실기기 E2E를 구현·실행한 것은 아니다.

## 0. 기준과 결정

최신 대화에서 사용자가 선택한 조건을 우선한다. 기존 노션 v2/v3의 Windows 장비, 혼합 개발 모델, 단일 사이트에 한정한 목표는 이번 명세의 실행 기준으로 사용하지 않는다. 원본 DOM 보존·Codex 제품 런타임·구조 검증·사용자 직접 제출 원칙은 유지한다.

- 개발: Claude Code Opus 5.5 리드와 같은 모델의 독립 작업자. 모델 이름은 사용자 선택이며 계정에서의 실제 실행 가능 여부는 사전 점검한다.
- 개발 이미지: 필요한 에셋만 Codex의 Astra/Ultra 경로로 위임한다. 코딩 위임이 아니다. 이미지 생성 경로도 사전 검증한다.
- 제품 AI: 서버 측 TypeScript Codex SDK. 실제 모델 ID는 account model/list와 평가 결과로 고정한다.
- 장비: MacBook Pro 14형 M5 Pro, 24GB RAM, 1TB SSD. 제품·데모 서버·Chrome을 현장 Mac에서 실행한다.
- 제품: 원본 웹사이트 위의 집중형 큰 글씨·큰 버튼·쉬운 설명 화면. 사용자가 입력·동의·제출한다.
- 사이트 A: 가상 구매 혜택 신청. 기본형과 구조 변형 B를 먼저 완성한다.
- 사이트 B: 가상 문화센터 강좌 신청. 같은 행사 안에 두 번째 사이트 C로 확장한다.
- 로그인: 원본 로그인 폼에서 Chrome에 저장한 테스트 자격 증명 사용. FLECTO는 비밀번호나 인증정보를 읽지 않는다.
- 개인정보: 입력값·개인 선택 내용·세션·비밀번호는 모델 프롬프트와 공유 캐시에서 제외한다.
- 대기: 실제 조작 가능 화면까지 3초를 목표로 하되, 화면 준비 한 요청은 10초를 넘겨 대기시키지 않는다. 달성 실적이 아닌 목표와 정책이다.
- 광고: 실제 준비가 3초를 넘는 경우 구분된 시연용 후원 카드. 완료·취소·10초 만료 시 즉시 종료한다. 광고 때문에 준비를 늦추지 않는다.
- 체험자: 심사위원·주변 참가자. 고령자에게 검증된 효과라고 표현하지 않는다.

## 1. 제품 정의와 출고 조건

FLECTO는 HTML을 새로 생성하는 프로그램이 아니라, 이미 준비한 안전한 컴포넌트와 현재 페이지의 실제 요소 사이의 연결 설계를 생성·검증하는 시스템이다.

필수 출고 조건:
1. 두 테스트 사이트에서 첫 화면부터 실제 서버 저장·결과 확인까지 이어진다.
2. 첫 사이트의 메뉴·필수 필드·고지·DOM 참조 변경을 감지한다.
3. 준비된 현재 화면에서 추가 AI 계획 요청을 차단해도 허용된 입력·수정·제출이 작동한다.
4. 필수 항목 누락·자동 동의·잘못된 대상·중복 제출·미확인 성공 표시를 차단한다.
5. 3초 안내와 10초 종료, 취소 후 늦은 응답 폐기가 검사된다.
6. 원본 복귀·한국어 입력·키보드·확대 화면에서 사용할 수 있다.
7. 동일 릴리스의 실제 Codex 실행과 fixture 회귀 검증을 구분한다.

두 번째 사이트가 미완성이면 첫 사이트의 정상본은 보존하되, 이를 두 사이트 완성본으로 표시하지 않는다. 안전한 중단만 하는 시스템을 제품 성공으로 집계하지 않는다.

## 2. 지원 경계

지원 목표는 일반 HTML form/input/textarea/select/checkbox/radio/button/a, 같은 출처 내부 메뉴 이동, 검증된 React controlled input이다. 체크박스·라디오·select는 타입별 어댑터를 둔다.

file input, 비밀번호·OTP 입력, 결제, CAPTCHA, 접근 불가능한 cross-origin iframe, closed Shadow DOM, canvas-only 조작, isTrusted를 요구하는 동작은 기본 지원 범위에서 제외한다. 임의 사이트 지원을 선언하지 않는다. 시각 분석도 없는 실행 대상이나 권한을 만들어내지 않는다.

사이트 A는 일반 폼과 전체 페이지 이동, 사이트 B는 React controlled form과 SPA 이동을 사용해 서로 다른 동작 방식을 시험한다. AI에 숨겨진 정답 메타데이터나 사이트별 완성 FLECTO 화면을 제공하지 않는다.

## 3. 기술 선택과 폴더

구현 선택안: npm workspaces + TypeScript, React/Vite 확장 UI, Fastify 제품 서버, SQLite, Vitest 순수 로직 검사, Playwright 브라우저 검사. 의존성은 Mac에서 설치·실행 확인 후 lockfile로 고정한다. Node 버전은 선택한 Vite·SDK 지원 조건을 만족하는 설치 검증된 LTS 버전으로 고정한다. 당일 무차별 최신 업데이트는 하지 않는다.

```text
apps/
  extension/
    src/background/       # 메시지, 탭 활성 상태, 로컬 서버 요청
    src/content/          # 세션, 추출, DOM 연결, 원본 상태 관찰
    src/ui/               # 집중형 화면, 템플릿, 설정, 로딩/광고
    src/options/          # 최초 설정·로컬 런타임 연결
  planner/
    src/routes/           # HTTP 계약
    src/provider/         # Codex SDK adapter
    src/cache/            # SQLite candidate/verified/quarantined
    src/privacy/          # 전송 정보 재검사
  demo-benefits/          # 독립 원본 서비스
  demo-culture/           # 독립 원본 서비스
packages/
  contracts/              # 런타임 스키마와 TS 타입
  core/
    extractor/
    verifier/
    binder/
    fingerprint/
  templates/              # 여섯 개 제한된 템플릿
  design-tokens/
tests/
  unit/
  integration/
  e2e-fixture/
  e2e-live/
  holdout/
ops/                      # Opus 감독·사전 점검·종료·릴리스
```

테스트 사이트는 직접 방문해서 사용해도 동일하게 작동해야 한다. planner는 테스트 사이트의 신청 DB와 직접 연결되지 않는다.

## 4. 프로세스와 통신

출발 포트안: planner 127.0.0.1:4317, benefits 127.0.0.1:4173, culture 127.0.0.1:4174. 실제 포트는 사전 점검에서 사용 여부를 확인한 뒤 고정한다. 프로덕션 시연에서는 빌드된 정적 파일을 제공하고 HMR에 의존하지 않는다.

```text
Chrome 콘텐츠 스크립트
  → 타입이 제한된 chrome.runtime 메시지
확장 service worker
  → 고정된 localhost planner endpoint
Node planner
  → 캐시 조회 / Codex SDK / 스키마 검사
service worker
  → 같은 tabId·documentId·requestId에 결과 전달
콘텐츠 스크립트
  → 현재 DOM과 다시 검증 → UI 표시
```

콘텐츠 스크립트에 임의 URL fetch 프록시를 열어두지 않는다. 백그라운드가 sender와 활성 탭·문서·허용 origin을 검사한다. planner는 loopback에만 바인딩하고, 초기 연결에서 준비한 런타임 토큰과 Host/Origin 검사를 사용한다. CORS만 인증으로 삼지 않는다. 토큰은 페이지 DOM과 content script에 노출하지 않고 백그라운드에서 사용한다. personal home의 인증정보와 코드 작업 권한은 제품 runtime에서 분리한다.

기본 확장 권한안은 activeTab, scripting, storage, webNavigation과 localhost planner host permission이다. 일반 모든 사이트에 영구 쓰기 권한을 요청하지 않는다. 사용자 활성화 전에는 페이지 데이터를 수집하지 않는다. 활성 origin을 벗어나면 새 명시적 활성화가 필요하다. 정확한 manifest와 Chrome 동작은 실기기에서 검사한다.

## 5. 상태 관리

단일 상태 머신을 사용한다. 여기서 화살표는 구현할 상태 전이이며 이미 구현되었다는 뜻이 아니다.

```text
OFF → AUTH_PAUSED 또는 GOAL_SELECT
GOAL_SELECT → PREPARING
PREPARING → READY | UNSUPPORTED | TIMED_OUT | CANCELLED
READY → EDITING → REVIEWING
REVIEWING → SUBMITTING
SUBMITTING → SUCCESS | VALIDATION_ERROR | OUTCOME_UNKNOWN
페이지 이동/중요 구조 변경 → STALE → 새 스냅샷·검증
어느 단계든 사용자 종료 → ORIGINAL_MODE
```

광고는 제품 상태가 아니다. `PREPARING && elapsed >= 3000 && !shownThisGoal && !adDismissed`라는 보조 표시 조건이다. 준비 완료 후 광고 최소 표시 시간을 기다리지 않는다.

`tabId`, `documentId` 또는 document instance nonce, `requestId`, 활성 origin, 현재 goal, 상태를 구분한다. 원본 문서가 바뀌면 elementRef는 모두 만료한다. service worker의 전역 변수만으로 상태를 보존하지 않는다. 비개인 활성 상태·goal enum은 chrome.storage.session에 보존하고 재시작 때 실제 탭과 대조한다. 민감 입력값은 content 메모리에만 둔다. 자유 목표 문장에 개인정보가 포함될 가능성도 처리한다.

전체 페이지 이동은 webNavigation 이벤트와 재주입, SPA는 history 변경과 task 영역 mutation으로 감지한다. DOMContentLoaded만으로 뒤로가기 복원을 판정하지 말고 pageshow/BFCache도 고려한다. 비밀번호·OTP 폼이 나오면 분석·캡처를 멈추고 원본 로그인으로 넘긴다.

## 6. 데이터 계약

아래는 구현할 최소 계약의 설명이다. 실제 런타임 스키마를 단일 source of truth로 두고 타입과 검증을 맞춘다.

### PublicPageSnapshot: 모델 전송용
- requestId, snapshotId, schemaVersion
- 개인정보를 제외한 origin·route category
- 목표: 개인정보를 포함하지 않는 정제된 설명 또는 goal enum
- controls: ref, role, type, 공개 label, required, readOnly/disabled, form group, 제약 조건
- notices: ref, 허용된 원문, 중요도·연결 관계
- public options: 공개 강좌·시간 등 필요한 정보만. 개인 계좌·배송지 등은 전송하지 않는다.
- fingerprint: 개인정보를 포함하지 않는 구조·제약·고지 특징

### PrivateBindingRegistry: 브라우저 안에만 존재
- ref → 현재 실제 Element
- 필드 값·선택값·원본 오류·개인 결과 텍스트
- DOM identity와 document revision

### PagePlan: AI 또는 캐시에서 제안하는 구조
```json
{
  "schemaVersion": 1,
  "snapshotId": "s_12",
  "steps": [
    {
      "template": "grouped_form",
      "title": "주문 정보를 입력해 주세요",
      "controlRefs": ["e17", "e21"],
      "noticeRefs": ["n03"]
    },
    {
      "template": "consent",
      "title": "안내 내용을 확인해 주세요",
      "controlRefs": ["e24"],
      "noticeRefs": ["n04"]
    }
  ],
  "finalActionRef": "e29"
}
```

이 JSON은 구조 예시이지 완전한 검증 스키마가 아니다. 실제 스키마에는 unknown field 금지, template enum, 크기 제한, 참조 개수·중복 검사, 필요한 원문 참조를 추가한다.

중간 단계의 `다음`은 로컬 단계 이동이다. 현재 원본 화면을 넘기는 버튼과 최종 제출은 원본 action이다. 둘을 타입부터 분리한다. 모든 버튼에 명시적 type을 사용한다. AI에 action의 안전성을 최종 판정하게 하지 않는다.

### ActionReceipt: 동작 결과
- actionId, documentId, targetRef
- status: APPLIED / REJECTED / STALE / UNCONFIRMED
- 해당 동작 후 관찰 근거의 종류, 원본 오류가 있는지
- 값과 개인 정보는 로그로 반환하지 않는다.

APPLIED는 DOM에 반영됐다는 뜻이지 서버 저장 성공이 아니다. 최종 성공은 원본 결과 화면을 근거로 표시하고 QA는 원본 서버 상태까지 대조한다.

## 7. 추출기와 페이지 변화

label-for, wrapping label, aria-label/labelledby, fieldset/legend, aria-describedby, native required/type/min/max/pattern/maxlength를 우선 읽는다. 사용자에게 보이는 실제 요소와 연관된 안내를 수집한다. 원문 설명은 아무 주변 텍스트나 무한히 긁지 않는다.

FLECTO host subtree, 광고, script/style, hidden input, password/OTP, 비공개 계정 영역을 모델 전송에서 제외한다. 단순 정규식 개인정보 제거만으로 완벽히 안전하다고 주장하지 않는다. MVP에서는 합성 데이터의 허용된 페이지·영역만 전송한다.

너무 큰 페이지는 필수 항목을 잘라 토큰을 맞추지 않는다. 범위를 현재 확인된 작업 영역으로 좁히되 필수 정보 보존을 확인하지 못하면 unsupported로 원본을 제시한다.

변화는 세 종류로 구분한다.
- 개인 값 변경: 로컬 값 동기화. 모델·공유 캐시 대상 아님.
- 선택지·재고·오류 변경: 현재 원본을 다시 읽고 유효성 재검사.
- 필수 필드·동의·제출 대상·구조 변경: 기존 계획을 STALE로 만들고 재분석.

자체 UI의 렌더, 로딩 타이머, 광고 변경은 분석 재호출을 일으키지 않는다. 원본의 input.value 변화는 MutationObserver만으로 모두 감지한다고 가정하지 말고 input/change와 동작 후 재읽기를 함께 사용한다.

## 8. 원본 요소 연결: 가장 먼저 구현할 모듈

지원 타입별 bounded operation만 제공한다. `setText`, `setChoice`, `setCheckedFromUserIntent`, `invokeOriginalAction`처럼 제한된 명령이다. arbitrary selector, arbitrary JavaScript, eval, AI 생성 HTML은 허용하지 않는다.

텍스트:
1. 사용자 입력은 FLECTO state에 동기적으로 보관한다.
2. 한국어 composition 중에는 문자열 정규화·단계 이동·강제 재렌더를 하지 않는다.
3. 검증된 native setter/event adapter로 원본 input에 반영한다.
4. 원본 재렌더 후 값이 유지되는지, validation/error가 생겼는지 확인한다.
5. 불일치 시 값을 넣었다고 간주하지 않는다.

체크박스·라디오·select:
- 텍스트 입력과 다른 어댑터를 사용한다.
- 동의는 실제 사용자 선택에서만 변경한다.
- 선택지는 최신 원본 DOM의 실제 option과 대조한다.
- 사라진 강좌나 마감된 시간은 선택 불가로 갱신한다.

실행 직전에는 목표 ref가 유일하고 연결된 실제 요소인지, document가 같은지, 올바른 form 소속인지, disabled가 아닌지 다시 검사한다. label만 같은 버튼 중 첫 번째를 누르지 않는다.

React 내부 객체나 프레임워크 private API를 읽는 방식은 기본 설계에서 제외한다. 표준 어댑터가 작동하지 않을 때만 검토된 정적 MAIN-world bridge를 고려하고, 범용 코드 실행 통로로 만들지 않는다. isTrusted를 위조하거나 인증을 우회하지 않는다.

## 9. 검증기와 제출

스키마·참조 검증은 서버에서, 현재 실제 DOM 검증은 브라우저에서 다시 수행한다.

- 원본 필수 입력과 필수 고지/동의가 누락되면 FAIL.
- 입력 타입·form 소속·페이지 버전이 틀리면 FAIL.
- 참조가 중복되거나 같은 조건의 대상이 여러 개면 FAIL.
- 숨겨진 대상·미지원 요소를 실행하려 하면 FAIL.
- 금액·기간·자격·동의의 핵심 원문은 수정하지 않고 확인 가능하게 유지한다.
- 쉬운 설명의 근거가 불충분하면 원문으로 돌아간다. 의미 동일성을 일반 코드만으로 완전히 증명한다고 주장하지 않는다.

최종 확인 화면은 모델이 아니라 현재 브라우저의 실제 값으로 구성한다. 확인 시점 이후 값이나 중요 조건이 바뀌면 이전 확인은 무효다.

제출 버튼 클릭 즉시 pending 상태로 바꾸고 반복 클릭을 차단한다. 원본 submit 버튼 경로를 사용해 native validation과 사이트 핸들러가 동작하도록 한다. form.submit()으로 이를 우회하지 않는다.

결과가 불분명하면 OUTCOME_UNKNOWN으로 표시한다. 자동 재제출하지 않는다. 사용자가 원본 신청 내역을 확인하도록 한다. 10초 화면 준비 정책과 원본 서버의 처리 성공을 혼동하지 않는다.

테스트 서버에는 정상 서비스에도 필요한 unique/idempotency 처리를 구현한다. 이것은 FLECTO가 모든 외부 서버에서 exactly-once를 보장한다는 뜻이 아니다.

## 10. 집중형 UI

여섯 템플릿: 작업 선택, 관련 입력 묶음, 항목 선택, 안내·동의, 최종 확인, 결과. 별도 오류/로딩/설정은 공통 shell에서 처리한다.

기본값 제안: 본문 26px, 사용자 선택 22/26/30px, 주요 버튼 최소 높이 56px, 한 단계 입력 2~3개. 밝은 배경·짙은 글씨·파란 주요 행동. system font 사용, 외부 폰트·장식 이미지가 제품 로딩을 막지 않는다.

FLECTO는 Shadow DOM에 mount해 CSS 충돌을 줄인다. Shadow DOM이 보안 경계는 아니다. 원본 DOM을 삭제·재생성하거나 원본 body 전체를 display:none 처리하지 않는다. 실제 이벤트 동작과 원본 복귀를 유지한다.

modal focus, Tab/Shift+Tab, Escape, 제목으로의 적절한 포커스 이동, 닫은 후 원본 포커스 복구를 구현한다. 원본 요소의 inert/aria-hidden 처리는 이벤트 어댑터와 충돌하지 않는 방식으로 보존·복구하고 검사한다. 입력 중 UI 순서를 재배치하지 않는다. 각 input에 실제 label을 연결하고 오류를 문장으로 알려준다.

원본 보기와 FLECTO 재개를 구분한다. 이미 반영한 값과 아직 반영하지 못한 초안을 구분하며 원본 복귀가 서버 작업 취소 기능인 것처럼 표시하지 않는다.

## 11. Codex provider

interface는 `plan(publicSnapshot, deadline, signal)`과 `planWithImage(sanitizedInput, deadline, signal)`로 제한한다. 프롬프트는 사용자 목표·정제한 현재 페이지·템플릿 목록·고정 스키마뿐이다. 제품에 개발 저장소·코딩 프롬프트·도구 사용 권한을 물려주지 않는다.

실제 product model은 설치 환경의 model/list와 동일한 8개 표본 평가로 결정한다. 후보 둘을 비교할 경우 각 2회 정도를 시작 시험으로 제안한다. 이 표본은 통계적 보장이 아니다. 필수 항목·동의·action 매핑 실패가 없는 후보 중 지연과 사용량을 보고 하나를 고정한다. 실제 모델명·effort·SDK/CLI 버전을 model-lock.json에 기록한다.

이미지 입력 미지원 모델은 텍스트 경로에만 사용한다. vision은 입력 지원을 확인한 별도 모델/동일 모델로 제한한다. API에서 공개됐다는 이유로 계정 Codex 가용성을 가정하지 않는다.

Node 서버는 계속 실행하되 `new Codex()`만 미리 만들면 실제 CLI/원격 추론이 모두 예열된다고 가정하지 않는다. SDK 시작 비용은 측정한다. 확인된 시작 비용이 병목이면 동일 Codex adapter 뒤에서 App Server 재사용을 검토하되, 행사 중 핵심 연결이 불안정한 상태에서 transport를 갈아엎지 않는다.

신규 계획 동시 실행은 시연용 1개로 시작한다. 같은 요청은 중복 실행하지 않는다. 긴 대기열을 두지 말고 다른 요청에는 BUSY 또는 명시적인 이전 요청 취소 정책을 적용한다. 10초는 큐·추출·모델·검증·화면 표시 전 과정을 포함한다.

SDK의 승인·샌드박스·사용 도구 제한을 실제 버전에서 검사한다. 읽기 전용만으로 프롬프트 주입과 개인정보 유출이 모두 해결되는 것은 아니다. 로컬 비밀 파일이 없는 전용 환경, 최소 도구, 최소 데이터, 로컬 로그 정책을 함께 적용한다.

## 12. 로딩·10초·vision

기준은 사용자가 목표 변환을 요청한 순간부터 검증된 조작 가능 화면까지다. FLECTO의 초기 빈 shell은 이 성능 지표의 완료가 아니다.

- 즉시: 가벼운 shell·취소·원본 보기.
- 3초 미만: 준비 안내. 광고를 위한 지연 없음.
- 3초 초과: 실제 작업에 맞는 설명과 후원 카드.
- 완료: 광고 표시 중이라도 즉시 READY.
- 10초 도달: TIMED_OUT, UI 광고 종료, cancel 시도, 늦은 응답 폐기.

클라이언트와 서버에 각각 deadline을 둔다. requestId·document identity·종료 상태·기한을 결과 적용 직전에 검사한다. 탭 복귀 때도 deadline을 다시 확인한다. 원격 취소의 성공과 UI 대기 종료는 별개다.

vision은 DOM이 존재하지만 시각적 관계만 부족한 경우에 한한다. authentication/permission/network/stale 문제에는 쓰지 않는다. 원본 DOM 대상이 없는 canvas 버튼을 좌표 클릭으로 대신 실행하지 않는다.

원본 캡처 시 FLECTO·광고 레이어를 제외하고, 현재 활성 탭·document를 앞뒤로 확인한다. 마스킹과 영역 제한은 서버 업로드 전에 기기 안에서 한다. 마스킹 안전성을 확인할 수 없으면 캡처를 보내지 않는다. 남은 시간에 캡처·추론·최종 검증이 들어갈 수 없으면 신규 vision 요청 없이 원본 복귀한다. 두 번째 호출을 시작하며 10초 시계를 초기화하지 않는다.

## 13. 재사용 저장

세 가지를 혼동하지 않는다.
1. 공통 템플릿: 코드로 사전 구현된 화면.
2. AI PagePlan: 현재 페이지 참조를 사용하는 일시 설계안.
3. CachedBlueprint: 현재 요소에 다시 연결할 수 있는 비개인 의미 구조.

DB 예시:
- blueprints: id, origin, task_kind, structure_hash, notice_hash, schema_version, model_version, prompt_version, safe_blueprint, state, created_at
- plan_runs: run_id, mode, model_id, elapsed_ms, validation_result, error_code, reported_usage
- sponsor_events: 집계 카운트. 페이지·신청 내용·사용자 ID와 결합하지 않음.

SQLite에 개인 입력·쿠키·비밀번호·계좌/주소 선택지·전체 캡처를 저장하지 않는다. 해시했다고 개인정보가 아닌 것으로 간주하지 않는다.

캐시 조회 → 현재 요소에 고유 재연결 → 필수 조건과 원문 고지 재검증 → 통과 시 사용. 모델 proposal은 CANDIDATE로만 저장하거나 메모리에 두고, 실제 DOM 검증을 통과한 뒤 VERIFIED로 승격한다. 검증 실패 후보는 QUARANTINED로 두어 다음 요청에서 반복 사용하지 않는다.

전체 DOM의 class 순서·장식 배너·타이머는 구조 키에서 제외한다. 반면 필드 종류·필수 여부·동의·핵심 고지·action/form 관계는 포함한다. 개인값은 구조 키에서 제외하지만 최신 실제 값·선택지·가격·잔여 정원은 화면과 실행 전에 원본에서 다시 읽는다. 오래된 가격이나 정원을 캐시의 사실로 표시하지 않는다.

첫 단계에서는 동일 사이트·업무의 정확한 구조 일치를 우선한다. 서로 다른 사이트에 fuzzy 캐시를 바로 실행하지 않는다. 두 번째 사이트에서 공통인 것은 템플릿과 코드이고, 사이트 연결은 새로 검증한다.

## 14. 광고 구현

외부 광고 네트워크 SDK·실제 정산 연동을 MVP 필수에서 제외한다. 로컬 sponsor.json과 정적 파일로 시연용 비개인화 카드를 표시한다. 콘텐츠는 검토된 정적 데이터이며 실행 코드가 아니다.

함수 입력은 preparing 상태, elapsed, shownThisGoal, dismissed뿐이다. DOM·goal text·URL·개인 입력을 받지 않는다. FLECTO host와 광고는 extractor에서 제외한다.

표시 조건: 준비가 실제로 3초를 넘고, 동일 goal session에서 광고를 아직 표시하지 않았을 때. 닫아도 준비는 계속한다. 클릭 없는 후원형을 기본으로 한다. 원본 신청 버튼과 광고가 혼동되지 않게 출처와 시연 라벨을 표시한다.

광고 오류·누락은 제품 실패가 아니다. 표시 시간을 채우려고 READY를 지연시키지 않는다. 광고가 사라진 좌표에 제출 버튼을 즉시 배치하지 않는다. 이벤트는 시연 표시 횟수이지 광고 정산 실적이나 매출이 아니다.

Chrome 웹스토어 공개 배포 때는 광고·원본 기능 방해·사용 데이터의 제한적 이용 정책을 별도로 검토한다. 직접 후원이라 자동 승인되는 것은 아니다.

## 15. HTTP API 제안

이름은 구현 계약안이며 현재 실행되는 endpoint가 아니다.

| Endpoint | 역할 | 금지 |
|---|---|---|
| GET /health | 버전·서버 준비 상태 | 매 조회 실제 모델 호출, 비밀정보 출력 |
| POST /v1/plans | 공개 스냅샷으로 설계 요청 | 개인 필드값, 임의 URL/JS |
| DELETE /v1/plans/:requestId | 현재 요청 취소 | 다른 실행/시스템 전체 종료 |
| POST /v1/blueprints/:id/verify | 현재 스냅샷 검증 확인 | 원본 상태 없이 무조건 신뢰 |
| POST /v1/metrics | 허용된 비개인 측정치 | 입력값·전체 프롬프트·쿠키 |

핵심 오류 enum: AUTH_REQUIRED, UNSUPPORTED_CONTROL, REQUIRED_MISSING, AMBIGUOUS_TARGET, STALE_DOCUMENT, SCHEMA_INVALID, BUSY, DEADLINE_EXCEEDED, PROVIDER_ERROR, SOURCE_REJECTED, OUTCOME_UNKNOWN.

planner에는 원본 신청을 대신하는 submit endpoint를 만들지 않는다. 실제 신청은 항상 원본 사이트의 정상 사용자 경로를 사용한다.

## 16. 테스트 사이트 상세

### A: 구매 혜택 신청
첫 화면 → 혜택 목록/신청 진입 → 주문번호·구매일·상품 분류 입력 → 필수 안내와 사용자 동의 → 로컬 검토 → 원본 제출 → 원본 접수 결과.

테스트 계정만 Chrome에 저장한다. 필드 의미와 안내는 실제 원본 DOM에 정상적으로 노출한다. 첨부파일은 없다. 주문 정보는 합성 데이터다.

변형: 메뉴 순서 변경, CSS·자동 ID 변경, 필수 입력 추가, 안내 수정, 중복된 '다음' 버튼, 원본 오류. 기능은 실제 세션별 DB 저장으로 검증한다.

### B: 문화센터 강좌 신청
첫 화면 → 강좌 목록 → 강좌·시간 선택 → 신청자 테스트 정보 확인 → 동의·검토 → 원본 신청 → 신청 내역.

강좌 목록과 정원은 원본 서비스가 제공한다. 선택 후 정원이 사라지는 오류를 구현하고 원본 오류를 FLECTO에 반영한다. 복잡한 달력이나 drag-and-drop은 제외하고 select/radio 기반을 먼저 지원한다.

세션 쿠키 이름과 데이터베이스를 사이트별로 분리한다. 테스트 서버의 unique/idempotency 처리는 원본 서비스 자체에 구현한다. QA만 접근하는 서버 검증 도구를 만들더라도 확장에 숨은 정답 접근 경로를 주지 않는다.

## 17. 테스트와 수용 기준

순수 로직은 Vitest, 실제 확장은 Playwright 번들 Chromium의 persistent context로 검사한다. 실제 시연은 별도 Google Chrome 프로필에서 추가 확인한다. 자동 테스트가 개인 기본 Chrome 프로필·저장 비밀번호를 가져다 쓰게 하지 않는다.

다음은 실행할 검사 목록이지 통과 기록이 아니다.

| ID | 조건 | 통과 기준 |
|---|---|---|
| T01 | 구매 신청 정상 흐름 | 원본 저장값·완료 화면 일치 |
| T02 | 문화센터 정상 흐름 | 선택 강좌·시간과 원본 결과 일치 |
| T03 | 필수 항목 비움 | 제출 안 됨, 해당 오류 안내 |
| T04 | 한국어 조합/붙여넣기 | 문자 손실·커서 점프 없음 |
| T05 | React controlled field | 다음 렌더·제출 후에도 값 유지 |
| T06 | 체크박스 동의 | 사용자 선택 없이 변경 안 됨 |
| T07 | 중복 클릭/Enter 연타 | 테스트 서버 결과 한 건 |
| T08 | 응답 유실/오류 | 거짓 성공·자동 재제출 없음 |
| T09 | 전체 페이지 이동 | 재주입·상태 복구, 옛 ref 폐기 |
| T10 | SPA 이동/뒤로가기 | 올바른 문서·단계 연결 |
| T11 | service worker 재시작 | 비개인 상태 복구, 이전 동작 자동 재실행 없음 |
| T12 | 필수 입력 추가 | 오래된 계획 거부·재분석 |
| T13 | 동일 라벨 버튼 복수 | 다른 form 버튼을 누르지 않음 |
| T14 | 동의 원문 수정 | 기존 notice cache 무효화 |
| T15 | 2.9초 완료 | 광고 없음, 바로 READY |
| T16 | 3.1초 이후 완료 | 준비 중만 광고, 완료 즉시 종료 |
| T17 | 10초 초과/11초 늦은 응답 | 원본 선택 제공, 늦은 UI 적용 없음 |
| T18 | 사용자 취소·목표 변경·탭 변경 | 이전 결과 적용·다른 탭 캡처 없음 |
| T19 | 광고 누락·닫기 | 준비 기능에 영향 없음 |
| T20 | 개인정보 sentinel | 프롬프트·DB·로그·광고에 유출 없음 |
| T21 | 빈 캐시/따뜻한 캐시 | 서로 구분된 측정, 최신 선택지 반영 |
| T22 | 현재 화면 AI 계획 경로 차단 | 입력·수정·제출에 추가 계획 요청 없음 |
| T23 | 미지원 iframe/CAPTCHA | 우회 안 함, 원본에서 계속 |
| T24 | Keyboard·Escape·200% 확대 | 포커스·입력·원본 복귀 사용 가능 |
| T25 | 재시작 | 설정·구조 캐시만 유지, 타인 입력 복구 없음 |
| T26 | holdout 변형 | 숨은 정답 없이 새 구조와 오류에 대응 |

fixture와 LIVE는 빌드/실행 모드와 로그를 분리한다. 단순히 텍스트 '완료'를 찾는 테스트만으로 통과시키지 않는다. 실제 source form handler와 서버 값까지 확인한다.

출고안: 필수 fixture 전체 통과, 두 사이트 각각 실제 Codex 흐름 3회 이상 통과, 타임아웃·무효화의 실제 브라우저 동작 확인. 이는 작은 출시 전 점검이며 통계적 신뢰도 보장이 아니다. 목표를 못 채우면 실패 범위와 실행 횟수를 그대로 보고한다.

## 18. 속도 평가

측정 구간: shell visible, controls ready, source completed. 3초 목표는 controls ready에 적용한다. 빈 캐시·검증 재사용·vision을 별도 집계한다. 최초 10초 만료도 전체 시도에 포함한다.

측정 항목: extraction_ms, cache_ms, provider_ms, verification_ms, ready_ms, reported input/output token usage, mode, model version, snapshot revision, outcome code. 개인값은 기록하지 않는다. 표본 수·최소/중앙/최대·실패수를 보고하고 소표본 p95는 대표 성능처럼 제시하지 않는다.

루프: 정확한 기준본 → 병목 측정 → 한 가지 개선 → 같은 테스트 → holdout 검사 → 개선 확인 시 채택. 안전 검증 삭제, 필수 고지 제거, 화면 먼저 열고 나중 검증, 광고 시간 확보를 위한 지연은 최적화로 인정하지 않는다.

## 19. 개발 단계와 병렬 배정

Gate 0: 개발환경·모델 연결·공통 계약·AI 없는 원본 입력 저장. 동시에 provider 담당은 실제 Codex JSON 연결 시험을 진행해 막판에 인증 문제를 발견하지 않게 한다.
Gate 1: 첫 사이트 첫 화면부터 종료까지 실제 연결.
Gate 2: 필수항목·고지·참조 변경 등 B 범위 통과.
Gate 3: 문화센터 C 연결과 같은 템플릿 적용. 사이트 B 뼈대는 미리 독립 제작할 수 있다.
Gate 4: 시간 상한·캐시·광고·개인정보·UI 검사, 실제 Codex E2E.
Gate 5: 릴리스·재현 가능한 시연·영상·실제 측정 기록.

메인 Opus는 contracts·lockfile·통합을 소유한다. 나머지는 추출/연결, UI, planner/provider/cache, demo A/B, QA 등 독립 경로로 배정한다. 작업자 네 개로 시작하고 독립 대기 작업·모델 한도·메모리·통합 여유에 따라 늘린다. 브라우저 E2E는 한 개, 무거운 영상 렌더도 한 개만 실행하도록 별도 슬롯을 둔다. 24GB Mac에서 숫자만 보고 무조건 여덟 build/test를 동시에 실행하지 않는다.

같은 파일을 여러 작업자가 수정하지 않는다. 공통 인터페이스 변경은 메인에 요청한다. 고정 테스트를 약화해 통과시키지 않는다. 테스트 버그가 있으면 별도 검토·승인 변경으로 기록한다.

## 20. 내부 마감과 재현

기존 운영 기준을 유지한다: 13:30 신규 이미지 요청 중단, 14:45 기능 동결, 15:35 코드 동결, 16:05 패키지 확정, 16:30 제출 기준. 현장 공식 안내가 달라지면 실행 전에 조정한다.

각 기능 동결까지 두 번째 사이트와 원본 연결을 우선한다. late asset은 출고를 막지 않는다. 정상 버전과 미완성 확장 브랜치를 분리한다. 아직 안 된 기능은 숨겨서 성공으로 보이지 않게 한다.

구현할 운영 명령의 목표:
- doctor: 버전, 포트, DB, 고정 모델 접근, Chrome 연결 확인
- demo:start: 고정된 빌드로 서버 시작, 테스트 페이지 제공
- demo:reset: 테스트 신청·예약만 초기화. Chrome 비밀번호·로그인·개인 폴더는 건드리지 않음
- demo:cold / demo:warm: 캐시 조건을 명시적으로 선택
- test:fixture / test:live: 모드를 분리
- release: 검증 SHA, build, 실제 evidence, 모델/스키마 버전, 한계 목록 보존

이 명령은 작성할 스크립트의 명세다. 현재 파일이 존재하거나 실행됐다고 주장하지 않는다. 실제 외부 제출은 사람이 확인한다. 자동화는 대회 규정과 승인된 지출 범위 안에서만 동작한다.

## 21. 차별점 확인용 시연

1. 구매 혜택 원본 메뉴에서 FLECTO로 실제 신청.
2. 현재 화면의 AI 계획 endpoint만 차단하고 입력·수정·제출. 인터넷 전체를 끄지 않는다.
3. 문화센터에서 같은 조작 방식으로 강좌와 시간 선택.
4. 원본 필수 조건을 바꾸면 기존 연결을 거부.
5. 후원 카드는 실제 지연 때만 표시하고 완료 즉시 제거.

시연용 지연 주입은 fault-injection이라고 밝힌다. 광고 카드가 떴다는 사실을 매출로 기록하지 않는다. 심사위원 체험은 고령자 효과 검증으로 확대 해석하지 않는다.

## 22. 공식 문서 확인 근거

아래는 기술적 제약을 확인한 근거다. 위 구조·시간 배분·개발 게이트는 FLECTO에 대한 설계 제안이며 해당 문서가 제품 성공을 보장하는 것은 아니다.

- Codex SDK: https://developers.openai.com/codex/sdk
- Codex SDK 구조화 출력·이미지·환경 제어: https://github.com/openai/codex/blob/main/sdk/typescript/README.md
- Codex App Server model/list: https://developers.openai.com/codex/app-server
- Chrome cross-origin requests: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- Chrome activeTab: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- Chrome service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome webNavigation: https://developer.chrome.com/docs/extensions/reference/api/webNavigation
- Chrome storage: https://developer.chrome.com/docs/extensions/reference/api/storage
- React input: https://react.dev/reference/react-dom/components/input
- Synthetic event trust: https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted
- WAI modal dialog: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- WCAG contrast: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- Chrome Web Store ads: https://developer.chrome.com/docs/webstore/program-policies/ads
- Chrome Limited Use: https://developer.chrome.com/docs/webstore/program-policies/limited-use
- Playwright extension testing: https://playwright.dev/docs/chrome-extensions
- Vite: https://vite.dev/guide/
- Fastify validation: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
