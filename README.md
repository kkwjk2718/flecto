# Project FLECTO

**복잡한 웹사이트를, 내가 직접 쓸 수 있는 큰 글씨·큰 버튼의 화면으로.**

Chrome 확장 프로그램이 현재 페이지의 입력·선택·동의 항목을 단계별로 보여줍니다. 입력과 최종 확인은 사용자가 직접 하고, 접수는 원래 사이트의 버튼·검증·서버를 통해 처리합니다.

현재는 **동작하는 개발 프로토타입**입니다. 구매 혜택(HTML)과 문화센터(React SPA)의 실제 원본 DB 저장을 확인했고, 추가 안전·LIVE·시각 검증을 진행 중입니다. 전체 웹사이트 지원이나 Chrome 웹스토어 배포를 뜻하지 않습니다. 최신 검증 상태는 [현재 상태](state/STATUS.md)와 [다음 작업](state/NEXT_ACTION.md)을 확인하세요.

## 팀원에게 전달할 링크

- [제품 개발 브랜치](https://github.com/kkwjk2718/flecto/tree/feat/flecto-product)
- [제품 코드 ZIP 다운로드](https://github.com/kkwjk2718/flecto/archive/refs/heads/feat/flecto-product.zip) — GitHub 로그인 없이 받을 수 있습니다.
- [공개 저장소](https://github.com/kkwjk2718/flecto) · [협업 방법](CONTRIBUTING.md) · [구현 계획](IMPLEMENTATION_PLAN.md)

## 실행하기

Node.js **24.x**와 Chrome이 필요합니다. macOS에서 개발·검증하고 있습니다.

```bash
git clone --branch feat/flecto-product https://github.com/kkwjk2718/flecto.git
cd flecto
npm ci
npm run build
npm run demo:start
```

ZIP을 받았다면 압축을 푼 폴더에서 `npm ci`부터 실행하세요.

1. Chrome의 `chrome://extensions`를 열고 개발자 모드를 켭니다.
2. **압축해제된 확장 프로그램을 로드합니다**에서 `dist/extension` 폴더를 선택합니다.
3. FLECTO의 확장 프로그램 옵션을 열고 `.flecto/demo/connection.txt`에 있는 개인 연결 토큰을 입력합니다. 주소 기본값은 `http://127.0.0.1:4317`입니다.
4. [구매 혜택](http://127.0.0.1:4173) 또는 [문화센터](http://127.0.0.1:4174)를 열어 합성 계정 `demo` / `flecto2026!`로 로그인합니다.
5. 신청 화면에서 Chrome 도구 막대의 **FLECTO**를 누릅니다. 원하는 작업을 선택하고 입력·선택·동의·확인을 진행합니다.

구매 혜택의 합성 주문 예시는 `FLECTO-2026-001`, 구매일은 `2026-09-01`, 상품분류는 `가전`입니다. 테스트 사이트에도 예시가 표시됩니다. 실제 구매·포인트 지급은 발생하지 않습니다.

터미널에서 Ctrl+C를 누르면 이번 실행의 서버가 종료됩니다. 연결 토큰과 `.flecto` 폴더는 팀원에게 보내지 마세요. 각 컴퓨터가 자체 토큰과 합성 DB를 만듭니다.

## 실제 Codex로 계획 만들기

기본 실행은 **FIXTURE**로 명시적으로 표시됩니다. 원래 DOM을 읽어 만드는 결정적 테스트 계획이며, 실제 AI 호출과 구분합니다. 기존 Codex 로그인과 지원 CLI가 준비된 컴퓨터에서는 다음처럼 실행합니다.

```bash
npm run demo:start -- --live
```

제품 계획 모델 기본값은 `gpt-6-luna`입니다. 개발용 Astra/Opus 모델과 별개입니다. 현재 Mac에서는 Codex 앱의 번들 CLI를 우선 사용합니다. 다른 환경에서는 `FLECTO_CODEX_BIN`으로 지원 바이너리 경로를 지정할 수 있습니다. LIVE 오류가 나면 그대로 오류를 표시하며 FIXTURE로 바꿔 성공 처리하지 않습니다.

## 검사와 운영

```bash
npm run check          # 문서·저장소 무결성
npm run typecheck
npm run test:unit      # 단위·통합 테스트
npm run build
npx playwright install chromium
npm run test:fixture   # 격리 Chrome + 두 원본 서버 + DB 결과
npm run test:live      # 실제 Codex, 별도 QA 캐시, 두 사이트 각 3회
npm run doctor
```

실행·초기화·출고 도구는 [운영 안내](docs/OPERATIONS.md), 원래 수용 조건은 [T01–T40 / OPER01–OPER15](ops/02_GATES_AND_TESTS.md)를 참고하세요. 모듈 테스트 통과와 제품 전체 검증, FIXTURE와 LIVE, 공급자 응답 시간과 실제 조작 가능 시간은 각각 구분합니다.

## 코드 구조

| 경로 | 내용 |
|---|---|
| `apps/extension` | Chrome MV3, 원본 DOM 연결, 큰 글씨 UI, 설정 |
| `apps/planner` | 인증된 localhost 계획 API, SQLite 구조 캐시, Codex 런타임 |
| `apps/demo-benefits` | 합성 구매 혜택 HTML 서비스와 원본 DB |
| `apps/demo-culture` | 합성 문화센터 React SPA와 원본 DB |
| `packages/` | 공통 계약, DOM 검증, 여섯 화면 템플릿, 디자인 토큰 |
| `tests/` | 단위·통합·실제 확장 브라우저 검사 |
| `spec/`, `ops/`, `state/` | 사양·Ralph Loop·실행 근거와 남은 작업 |
| `presentation/`, `marketing/`, `business/` | 발표·광고 제작·사업 가설 |
| `archive/` | 과거 원문 보존. 현재 구현 상태는 위 기록을 따릅니다. |

개발은 Astra Ultra가 코어·통합·검증, Opus 5.5가 UI/UX·영상, Fable 5.1이 독립 검토·광고 구성에 참여합니다. 라이선스는 팀 결정 전까지 미지정입니다.

---

## 원본 Master Pack v7 안내

**문서 기준일: 2026-09-28 / 형식: Markdown / 문서 준비: DOCUMENTS_READY / 제품·실제 운영: NOT_RUN**

복잡한 웹사이트를 사용자의 목적에 맞는 큰 글씨·큰 버튼의 단계형 인터페이스로 재구성한다. 사용자는 직접 입력·선택·동의·제출하고, 실제 처리는 원래 서비스에서 이루어진다.

> **Don’t bend the user. Bend the interface.**

이 패키지는 지금까지 합의한 제품, 빈 환경에서의 시작, 모델 비종속 Ralph Loop, 검증·복구·출고, 발표·차트·수익모델·로드맵을 한 폴더에 모은 것이다. **완성된 프로그램, 설치기, PPT, 실제 차트 이미지가 아니다.** 발표 문안과 제작 명세는 준비했지만 실측 결과·스크린샷·계약·실제 계정 연결은 아직 준비됐다고 가정하지 않는다.

## 바로 읽을 문서

| 목적 | 파일 |
|---|---|
| 전체 프로젝트를 한 번에 이해 | [통합 개요](04_MASTER_OVERVIEW.md) |
| 아무것도 설치하지 않은 상태에서 개발 시작 | [시작 파일](00_START_HERE.md) → [공통 에이전트 지시](AGENTS.md) |
| 확정사항 확인 | [결정 기록](01_DECISIONS.md) |
| 세부 구현·UI/UX | [제품](spec/00_PRODUCT.md) · [구조](spec/01_ARCHITECTURE.md) · [UI/UX](spec/05_UI_UX.md) |
| 사람 개입을 줄이는 개발 운영 | [Ralph Loop](ops/00_RALPH_LOOP.md) · [40개 작업표](ops/01_TASK_GRAPH.md) |
| 발표 준비 | [발표 안내](presentation/00_README.md) · [12장 문안](presentation/01_SLIDES_12.md) |
| 3·5·7분 말하기 | [시간별 대본](presentation/03_SCRIPTS_3_5_7.md) |
| 차트·도형 제작 | [A–H 차트 명세](presentation/06_CHART_STORYBOARDS.md) |
| 심사위원 질문 대응 | [예상 질문 20개](presentation/05_JUDGE_QA_20.md) |
| 후원·사업·발전 계획 | [수익모델](business/00_REVENUE_MODEL.md) · [진입·로드맵](business/01_GTM_AND_ROADMAP.md) |
| 실측·주장 상태 확인 | [주장 근거표](evidence/00_CLAIM_LEDGER.md) · [결과 입력 양식](evidence/01_RESULTS_TEMPLATE.md) |
| 모든 파일 찾기 | [문서 지도](02_DOCUMENT_MAP.md) |

## 시작 방법

1. 이 폴더를 새 전용 프로젝트 폴더로 압축 해제한다. 예전 폴더에 무조건 덮어쓰지 않는다.
2. 선택한 코딩 클라이언트를 정상적으로 설치·로그인한 뒤 이 폴더를 연다. 개발 회사·모델을 문서가 강제하지 않는다.
3. 아래 문장을 전달한다. 설치·로그인·권한·지출 승인을 이미 받았다고 처리하지 않는다.

```text
00_START_HERE.md와 AGENTS.md부터 읽어라. 아직 새 환경에 아무것도 설치·실행됐다고
가정하지 마라. 현재 폴더·도구·OS·권한을 먼저 확인하고, 내가 확인해야 하는 승인만
한 번에 정리하라. 사용자가 선택한 개발 모델을 사용하며 임의로 다른 모델·계정으로
전환하지 마라. 승인 범위에서 구현→검증→수정→출고를 이어가라.
발표·홍보는 presentation/과 evidence/의 규칙을 따르며, 개발 성공·사용성·속도·매출을
만들어 쓰지 마라. 제품 작업자는 모든 발표 문서를 읽을 필요가 없다.
```

**MD만으로 설치되지 않은 클라이언트가 켜지거나 대화 종료 후 개발이 계속되지는 않는다.** 실제 실행 환경·감독자·권한을 확인한 범위에서만 자율 진행한다.

## 이번 통합의 범위

기존 v6의 제품·UI/UX·작업표·테스트·복구 명세는 유지했다. 여기에 프로젝트 동기·멘토링, 발표 12장/8장 문안, 3·5·7분 대본, 차트 8종, 홍보 문구, 후원 구조, 기대효과와 측정, 발전 계획을 추가했다.

직전 홍보 초안의 일부 문장은 검증된 사실처럼 읽힐 수 있어 **원문 문구와 상태를 별도로 남기고** 발표 사용 문구를 구분했다. 예를 들어 이탈 퍼널은 실측 전에는 수치형 이탈 차트로 그리지 않고, 다른 에이전트의 통제권이 낮다고 일반화하지 않는다. 편집 내역은 [통합 변경 기록](05_PACKAGE_CHANGELOG.md)에 있다.

위 원본 패키지 통합 기록 당시 외부 링크를 재검증하지 않았으며 노션과 사용자 Mac을 변경하지 않았다. 이후 이 저장소를 준비하며 수행한 환경·문서·GitHub 확인은 [현재 상태](state/STATUS.md)와 [저장소 설정](state/REPOSITORY_SETUP.md)에 별도로 기록한다. FILE_MANIFEST.md는 원본 수입 시점의 목록으로 현재 작업 파일 전체의 해시 목록은 아니다.
