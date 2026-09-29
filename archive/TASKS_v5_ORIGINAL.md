# 작업별 상세 티켓 — 40개


**작업 시간은 한 시도의 자원 상한이며 완성 예측이 아니다. 실제 소유 경로·계약·검사는 감독자가 적용해야 한다.**


원본 수용 기준은 v4 T01–T26이다. gate 티켓의 쓰기 경로가 빈 것은 코드를 수정하지 않는 검사라는 뜻이다. lease/contract/빌드 근거가 없는 완료 보고는 accepted가 아니다.


## O01 — 기존 실행기 재사용 판단과 최소 감독자 골격

**종류/담당:** `feature` / `ops`

**선행:** 사전 승인·환경 확인 후 독립 시작

**쓰기 범위:** `ops/supervisor/`

**목표:** v2를 실행하지 않고 diff 검토; macOS 단일 실행 잠금·마감·진입 명령

**검사:** O01, O02, O15

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## O02 — 작업 ledger·lease·재시작 복구

**종류/담당:** `feature` / `ops`

**선행:** O01

**쓰기 범위:** `ops/supervisor/`

**목표:** SQLite 상태/세대 번호/lease와 중단된 작업 복구

**검사:** O03, O04, O05

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## O03 — 프로세스 감독·회로 차단·안전 종료

**종류/담당:** `feature` / `ops`

**선행:** O02

**쓰기 범위:** `ops/supervisor/`

**목표:** 허용된 프로세스만 시작·정리; 시간 제한·공급자 오류 분류

**검사:** O06, O07, O08

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## O04 — 통합·증거 검증·안전 릴리스 감독

**종류/담당:** `feature` / `ops`

**선행:** O03

**쓰기 범위:** `ops/supervisor/`

**목표:** 독립 QA report 판독과 stage별 last_green; offline supervisor tests

**검사:** O09, O10, O11, O12, O13, O14

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## C01 — 공통 계약·빌드·명령 고정

**종류/담당:** `feature` / `contracts`

**선행:** 사전 승인·환경 확인 후 독립 시작

**쓰기 범위:** `packages/contracts/`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.fixture.config.ts`, `playwright.live.config.ts`, `scripts/`

**목표:** v4 PublicSnapshot/PagePlan/Receipt·로컬next/원본action 타입 분리; 모듈 stub; lockfile

**검사:** schema rejects unknown fields, all typed stubs compile, gate commands have missing-test failure

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** dependency_install

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## Q01 — 독립 수용 검사·원본 oracle

**종류/담당:** `feature` / `qa`

**선행:** C01

**쓰기 범위:** `tests/e2e-fixture/`, `tests/e2e-live/`, `tests/holdout/`, `tests/manifest.json`

**목표:** T01–T26를 원본 v4대로 등록; 서버 상태 oracle과 예상 assertion 정의

**검사:** T01-T26 mapped, no empty pass/skip, QA-only oracle unreachable from extension

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## D01 — 구매혜택 원본 서비스

**종류/담당:** `feature` / `benefits`

**선행:** C01

**쓰기 범위:** `apps/demo-benefits/`

**목표:** 원본만으로 로그인·주문입력·동의·실제 저장·신청 조회 가능

**검사:** T01, T03, T06, T07, T08, T09

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## D02 — 문화센터 원본 서비스

**종류/담당:** `feature` / `culture`

**선행:** C01

**쓰기 범위:** `apps/demo-culture/`

**목표:** React 폼·강좌/시간·정원 변경·신청 저장; UI 정답 메타데이터 금지

**검사:** T02, T05, T10

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## X01 — 공개 스냅샷·비공개 레지스트리 추출

**종류/담당:** `feature` / `extractor`

**선행:** C01

**쓰기 범위:** `packages/core/extractor/`, `tests/unit/extractor/`

**목표:** 실제 refs 부여; 필드값/로그인/광고 제외; 중요 안내 보존

**검사:** T03, T06, T12, T13, T20

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## V01 — 연결 검증기

**종류/담당:** `feature` / `verifier`

**선행:** C01

**쓰기 범위:** `packages/core/verifier/`, `tests/unit/verifier/`

**목표:** required/form/문서/ref/고지 검사; localNext와 submit 구별

**검사:** T03, T06, T12, T13, T14

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## U01 — 템플릿 6개·표시 설정

**종류/담당:** `feature` / `templates`

**선행:** C01

**쓰기 범위:** `packages/templates/`, `packages/design-tokens/`, `tests/unit/templates/`

**목표:** 밝은배경/큰글씨/큰버튼; 목표/입력/선택/동의/확인/결과

**검사:** T24, source text always reachable, review uses browser values

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## P01 — 실제 Codex 연결·모델 잠금

**종류/담당:** `feature` / `provider`

**선행:** C01

**쓰기 범위:** `apps/planner/src/provider/`, `tests/integration/provider/`

**목표:** 승인된 product runtime으로 schema 응답; text/vision capability 검사; 모델 증거

**검사:** actual Codex probe, schema validation, no tool or secret access, cancel path tested

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## N01 — MV3 메시지·로컬 연결 보안

**종류/담당:** `feature` / `navigation`

**선행:** C01

**쓰기 범위:** `apps/extension/src/background/`, `apps/extension/src/content/session/`, `apps/extension/src/options/`

**목표:** sender/tab/document/요청id 검사, runtime token은 background만 보유

**검사:** T11, T18, T20, T25

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## B01 — native 입력·사용자 동작 연결

**종류/담당:** `feature` / `binder`

**선행:** X01, V01, D01

**쓰기 범위:** `packages/core/binder/`, `tests/unit/binder/`, `tests/integration/binder/`

**목표:** 입력/선택/동의 어댑터, 값 확인, submit pending·unknown

**검사:** T01, T03, T04, T06, T07, T08

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## I00 — 첫 최소 연결과 모델 경로 통합

**종류/담당:** `feature` / `integrator`

**선행:** B01, U01, N01, P01

**쓰기 범위:** `apps/extension/src/content/controller/`, `apps/planner/src/routes/`, `scripts/integration/`

**목표:** AI없는 source roundtrip과 별도 live JSON을 작은 연결에서 확인

**검사:** T01 partial, no fixture called live

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## G00 — 최소 연결 확인

**종류/담당:** `gate` / `qa`

**선행:** I00, Q01, O04

**쓰기 범위:** 제품 쓰기 없음; 증거는 supervisor 소유 영역

**목표:** 소스 입력 저장/SDK probe 실제 보고서 확보

**검사:** G0

**시도 제한:** soft 8분 / hard 8분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** heavy

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## U02 — 집중형 shell·단계 state machine

**종류/담당:** `feature` / `ui`

**선행:** G00

**쓰기 범위:** `apps/extension/src/ui/`, `tests/unit/ui/`

**목표:** 설정/목표/단계/원본복귀/IME/REVIEWING/SUBMITTING

**검사:** T04, T06, T07, T08, T24

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## N02 — 전체 페이지·SPA·로그인 복구

**종류/담당:** `feature` / `navigation`

**선행:** G00, X01

**쓰기 범위:** `apps/extension/src/background/`, `apps/extension/src/content/session/`

**목표:** 문서 이동 ref 폐기, BFCache/SW 복구, auth 중 분석 중지

**검사:** T09, T10, T11, T18, T25

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## R01 — 최종확인·원본 결과 관찰

**종류/담당:** `feature` / `integrator`

**선행:** U02, N02, B01

**쓰기 범위:** `apps/extension/src/content/controller/`, `apps/planner/src/routes/`

**목표:** review 값이 변하면 무효; 원본 결과로만 success/unknown 표시

**검사:** T01, T07, T08

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## G01 — 첫 사이트 end-to-end

**종류/담당:** `gate` / `qa`

**선행:** R01

**쓰기 범위:** 제품 쓰기 없음; 증거는 supervisor 소유 영역

**목표:** 구매혜택 첫 메뉴부터 원본 기록까지 fixture 및 live 최소 1회

**검사:** T01, T03, T06, T07, T08, T09

**시도 제한:** soft 8분 / hard 8분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** heavy

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## K01 — 검증된 구조 캐시·최신 값 재연결

**종류/담당:** `feature` / `cache`

**선행:** G00, X01, V01

**쓰기 범위:** `apps/planner/src/cache/`, `packages/core/fingerprint/`, `tests/unit/cache/`

**목표:** SQLite candidate/verified/quarantined; 현재 refs·값·정원 새로 읽기

**검사:** T12, T14, T20, T21

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## Q02 — 구조변형·holdout·동적 정원

**종류/담당:** `feature` / `qa`

**선행:** D01, D02, Q01

**쓰기 범위:** `tests/holdout/`, `tests/e2e-fixture/`

**목표:** 미리 노출하지 않은 입력·고지·버튼변형; independent oracle

**검사:** T12, T13, T14, T26

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## L01 — 3초·10초 deadline·late result

**종류/담당:** `feature` / `deadline`

**선행:** U02, N02, P01

**쓰기 범위:** `apps/extension/src/content/deadline/`, `apps/planner/src/deadline/`, `tests/unit/deadline/`

**목표:** 단일 요청 전체시한; queue 포함; late result·탭 변경 폐기

**검사:** T15, T16, T17, T18

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## A01 — 분리된 로딩 후원카드

**종류/담당:** `feature` / `ads`

**선행:** U02, L01

**쓰기 범위:** `apps/extension/src/ui/sponsor/`, `tests/unit/sponsor/`

**목표:** local 정적 광고, 1goal 1회, 즉시 종료, 개인정보 입력 없음

**검사:** T15, T16, T17, T19, T20

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## I02 — 구조변형 B 통합

**종류/담당:** `feature` / `integrator`

**선행:** G01, K01, Q02, L01

**쓰기 범위:** `apps/extension/src/content/controller/`, `apps/planner/src/routes/`, `scripts/integration/`

**목표:** 변형 감지/재사용 통합; stale 실행 금지

**검사:** T12, T13, T14, T21, T26

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## G02 — B 범위 검증

**종류/담당:** `gate` / `qa`

**선행:** I02

**쓰기 범위:** 제품 쓰기 없음; 증거는 supervisor 소유 영역

**목표:** 첫 사이트 변형과 무효화 green

**검사:** T12, T13, T14, T21, T26

**시도 제한:** soft 8분 / hard 8분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** heavy

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## B02 — React 제어형 입력·최신 선택지

**종류/담당:** `feature` / `binder`

**선행:** B01, D02, G01

**쓰기 범위:** `packages/core/binder/`, `tests/integration/binder/`

**목표:** 한글조합·다음 렌더 값 보존·옵션 무효화 확인

**검사:** T02, T04, T05, T10

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## I03 — 문화센터 C 제품 연결

**종류/담당:** `feature` / `integrator`

**선행:** G02, B02, D02

**쓰기 범위:** `apps/extension/src/content/controller/`, `apps/planner/src/routes/`, `scripts/integration/`

**목표:** 사이트별 정답 분기 없이 기존 템플릿 연결

**검사:** T02, T05, T10

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## G03 — 두 번째 사이트 확인

**종류/담당:** `gate` / `qa`

**선행:** I03

**쓰기 범위:** 제품 쓰기 없음; 증거는 supervisor 소유 영역

**목표:** 문화센터 source DB 대조; 첫 사이트 회귀 검사

**검사:** T01, T02, T05, T10

**시도 제한:** soft 8분 / hard 8분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** heavy

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## P02 — 제한된 화면 보완 경로

**종류/담당:** `feature` / `vision`

**선행:** L01, P01, X01, G01

**쓰기 범위:** `apps/extension/src/content/vision/`, `apps/planner/src/vision/`, `tests/integration/vision/`

**목표:** 시각 관계 부족만 보완; 클라이언트 가림·동일deadline·대상 연결 검증

**검사:** T17, T18, T20, T23

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## M01 — 측정·광고집계 분리

**종류/담당:** `feature` / `metrics`

**선행:** L01, K01

**쓰기 범위:** `apps/planner/src/metrics/`, `tests/unit/metrics/`

**목표:** ready시간/실패횟수/model버전; 개인정보/광고정산 혼동 금지

**검사:** T15, T17, T20, T21, T22

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## S01 — 보안·개인정보 독립 검토

**종류/담당:** `feature` / `security`

**선행:** G03, A01, P02, M01

**쓰기 범위:** `docs/security/`

**목표:** 실행경로·전송·로그·cache sentinel·간접 submit 우회 검토

**검사:** T20, T23, report cites concrete files

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## Q03 — 사용환경·접근성·재시작 검증

**종류/담당:** `feature` / `qa`

**선행:** G03, A01, N02

**쓰기 범위:** `tests/e2e-fixture/`, `docs/qa/`

**목표:** IME, keyboard, zoom, SW재시작, 뒤로가기와 광고 오류

**검사:** T04, T11, T15, T16, T17, T18, T19, T24, T25

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## G04 — 26개 고정 검사 전체

**종류/담당:** `gate` / `qa`

**선행:** S01, Q03, M01, P02

**쓰기 범위:** 제품 쓰기 없음; 증거는 supervisor 소유 영역

**목표:** 현재 빌드에서 T01–T26 skip 없이 보고서 확보

**검사:** T01, T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T24, T25, T26

**시도 제한:** soft 8분 / hard 8분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** heavy

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## M02 — 병목 1개씩 속도 개선

**종류/담당:** `optimization` / `performance`

**선행:** G04, M01

**쓰기 범위:** `docs/performance/`

**목표:** 변경은 affected owner에게 repair ticket으로; raw 결과 비교; 최대 2실험

**검사:** no regression, failures included, holdout not tuned

**시도 제한:** soft 7분 / hard 7분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## D03 — 시연 시작·reset·replay 준비

**종류/담당:** `feature` / `demo_ops`

**선행:** G01

**쓰기 범위:** `ops/demo/`, `docs/demo/`

**목표:** 별도 QA/시연 profile·DB, 안정 빌드 실행, test data만 reset

**검사:** safe reset, cold/warm distinct, does not touch passwords

**시도 제한:** soft 8분 / hard 12분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## E01 — 발표 대본·한계 표·예비 영상 구성

**종류/담당:** `feature` / `documentation`

**선행:** G02, D03

**쓰기 범위:** `docs/presentation/`

**목표:** source/AI차단/두사이트/무효화 순서; metric 자리 비워두기

**검사:** no invented performance, ad is demo, no senior-effect claim

**시도 제한:** soft 7분 / hard 7분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** worker/경로 임대; 필요한 heavy test는 중앙 실행

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## IMG01 — 선택적 개발 에셋 요청

**종류/담당:** `asset` / `asset`

**선행:** U01

**쓰기 범위:** `assets/approved/`

**목표:** Claude가 필요한 때만 image broker로; placeholder 우선; 코드 위임 없음

**검사:** asset metadata, no source edits, real image decode

**시도 제한:** soft 3분 / hard 3분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** image

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## LIVE01 — 릴리스 후보 실제 Codex E2E

**종류/담당:** `gate` / `qa`

**선행:** G04, D03

**쓰기 범위:** 제품 쓰기 없음; 증거는 supervisor 소유 영역

**목표:** 같은 artifact hash에서 두 사이트 각 cold LIVE 3회 이상; warm별도

**검사:** actual trace, original DB values, no fixture as live

**시도 제한:** soft 8분 / hard 8분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** heavy, product

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.


## REL01 — 마감 강제 finalization

**종류/담당:** `release` / `release`

**선행:** LIVE01, E01

**쓰기 범위:** 제품 쓰기 없음; 증거는 supervisor 소유 영역

**목표:** 정상 경로는 deps 후 실행; 마감에는 deps 미충족이어도 available tier를 진실하게 보관

**검사:** artifact hash, revocation check, manifest, submitted false

**시도 제한:** soft 8분 / hard 8분. 남은 gate·rollback 시간을 빼고 배정한다.

**자원:** heavy

**handoff:** base SHA, contract version, attempt, lease generation, 변경 파일, 실행 검사, 남은 위험. 실제 검사·통합 이후에만 의존 작업이 수락한다.
