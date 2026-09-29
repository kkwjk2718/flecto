# Project FLECTO

**복잡한 웹사이트를, 사용자가 직접 다룰 수 있는 큰 글씨·큰 버튼의 단계형 화면으로.**

현재 상태: **기획·구현 계획·GitHub 협업 기반 준비 / 제품 코드 구현 전**.

## 팀원에게 전달할 링크

- [공개 저장소](https://github.com/kkwjk2718/flecto)
- [ZIP 다운로드](https://github.com/kkwjk2718/flecto/archive/refs/heads/main.zip) — GitHub 로그인 없이 받을 수 있습니다.
- [구현 계획](IMPLEMENTATION_PLAN.md) · [협업 방법](CONTRIBUTING.md) · [할 일](https://github.com/kkwjk2718/flecto/issues)

GitHub 연결이나 Git 사용이 어려우면 ZIP을 받아 압축을 풀고 이 README부터 읽으면 됩니다. PR/브랜치로 코드를 함께 반영할 때에는 GitHub 계정과 저장소 쓰기 권한 또는 fork가 필요합니다.

## 먼저 읽기

1. [전체 개요](04_MASTER_OVERVIEW.md): 무엇을 만들고 누구를 위한 제품인지.
2. [구현 계획](IMPLEMENTATION_PLAN.md): 단계, 역할, 첫 실제 저장 검증.
3. [협업 방법](CONTRIBUTING.md): 환경, 브랜치/PR, 경로 소유권.
4. [현재 상태](state/STATUS.md)와 [다음 작업](state/NEXT_ACTION.md): 실제로 준비된 범위.

개발 역할은 **Astra 6 Ultra: 코어·통합·검증 / Claude Opus 5.5: UI/UX**를 기본으로 합니다. 팀원별 실제 이슈 담당자는 별도로 정합니다.

## 저장소 확인

Node.js 24와 npm을 기준으로 합니다. 외부 npm 의존성은 아직 없습니다.

```bash
git clone https://github.com/kkwjk2718/flecto.git
cd flecto
npm ci --ignore-scripts
npm run check
```

현재 검사는 문서·저장소 무결성 확인입니다. 앱 실행·빌드·제품 테스트 명령은 아직 없습니다. ZIP으로 받은 경우 문서 열람은 바로 가능하며, Git 기반 검사는 clone한 checkout에서 실행합니다.

## 작업 영역

| 경로 | 내용 |
|---|---|
| `apps/` | 확장·planner·두 원본 서비스의 예정 위치 |
| `packages/` | 계약·코어·템플릿·디자인 토큰의 예정 위치 |
| `tests/` | 제품·운영 검사의 예정 위치 |
| `spec/`, `ops/` | 현재 제품 사양·작업표·수용 조건 |
| `presentation/`, `marketing/`, `business/` | 발표·홍보·사업 문안 |
| `state/` | 검토·실행·저장소 설정 상태 |
| `archive/` | 보관 원문. 현재 실행 지시로 사용하지 않음 |

첫 작업은 **C01 계약/빌드 → 원본 서비스와 UI 병행 → G0 실제 원본 저장**입니다. [작업표](ops/01_TASK_GRAPH.md)의 선행 조건을 지키고 짧은 브랜치와 PR로 통합합니다.

공개 저장소의 라이선스는 팀 결정 전까지 미지정입니다. 실제 배포·계약·제품 검증 완료를 뜻하지 않습니다.

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
