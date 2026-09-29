# 구현 작업표 v6 — 40개, 모델 이름 없는 역할 배정

**티켓과 시간은 계획이다. 완료·실행 결과가 아니다.** 모든 의존성은 현재 계약과 실제 검사 근거를 요구한다. TASK의 O/OPS와 운영 검사의 OPER 접두사는 구분한다.

## v5의 불필요한 기다림 제거

G00은 실제 Codex 인증과 자체 supervisor 완성을 기다리지 않는다. Q02 첫 사이트 변형은 D02 문화센터 완료를 기다리지 않는다. 장시간 자동화 제작이나 선택 이미지 실패가 원본 연결을 막지 않는다. 두 번째 사이트는 실제 목표로 유지한다.

## 작업 선택 요약

첫 흐름: E00→E01→C01→(D01/X01/V01/U01/N01/PF01)→B01→I00→G00→(U02/N02/L01)→R01→G01.
확장: K01/Q02→I02→G02→B02/I03→G03.
Codex P01·운영 OPS·문화센터 D02·QA는 독립 준비가 가능한 만큼 병행한다.

| ID | 작업 | 선행 | 역할 |
|---|---|---|---|
| E00 | 읽기 점검과 승인 목록 | 없음 | lead |
| E01 | 승인된 최소 환경 준비 | E00 | setup |
| E02 | 개발 클라이언트 능력과 모델 연결 | E00 | lead |
| C01 | 타입·모듈 stub·빌드 계약 | E01 | contracts |
| OPS01 | 최소 루프·게이트·상태 관리 | E01, E02 | ops |
| OPS02 | 선택적 managed 복구 검증 | OPS01 | ops |
| Q01 | 26개 원본 검사와 추가 검사 등록 | C01 | qa |
| D01 | 구매 혜택 원본 서비스 | C01 | source_a |
| D02 | 문화센터 원본 서비스 뼈대 | C01 | source_b |
| X01 | 공개 snapshot·비공개 registry | C01 | extractor |
| V01 | 계획·DOM verifier | C01 | verifier |
| U01 | 여섯 템플릿·디자인 토큰 | C01 | templates |
| PF01 | fixture 계획 경로와 provider interface | C01 | provider |
| P01 | 제품 Codex 실제 연결과 모델 잠금 | PF01, E02 | provider |
| N01 | MV3 메시지·runtime 연결·탭 소유 | C01 | navigation |
| B01 | native 입력·선택·원본 실행 | X01, V01, D01 | binder |
| I00 | 가장 작은 fixture 원본 연결 | B01, U01, N01, PF01 | integrator |
| G00 | 최소 제품 연결 게이트 | I00, Q01 | qa |
| U02 | 집중형 shell·상태·오류·설정 | G00 | ui |
| N02 | full navigation·SPA·auth 복구 | G00, X01 | navigation |
| L01 | 전체 10초 deadline·중복·late result | N01, PF01 | deadline |
| R01 | 실제 값 검토·원본 결과 관찰 | U02, N02, B01 | integrator |
| G01 | 첫 사이트 전체 fixture 게이트 | R01, L01 | qa |
| K01 | 구조 캐시와 현재 요소 재연결 | G00, X01, V01, PF01 | cache |
| Q02 | 첫 사이트 구조 변형과 holdout | D01, Q01 | qa |
| I02 | B 범위 통합 | G01, K01, Q02 | integrator |
| G02 | B 변형 게이트 | I02 | qa |
| B02 | React controlled 입력과 최신 선택지 | B01, D02, G01 | binder |
| I03 | 문화센터 C 제품 연결 | G02, B02, D02 | integrator |
| G03 | 두 사이트 회귀 게이트 | I03 | qa |
| A01 | 준비 중 후원 카드·종료 독립성 | U02, L01 | ui_ads |
| M01 | 비개인 측정·mode·사용량 | L01, K01 | metrics |
| VIS01 | 제한된 시각 보완과 안전한 거부 | P01, X01, L01 | vision |
| UX01 | 실제 화면·키보드·IME 품질 | G01, A01 | ux_qa |
| SEC01 | 데이터 경계·보안 검토 | G01, N01 | reviewer |
| PERF01 | 한 병목씩 속도 개선 | G03, M01 | performance |
| DEMO01 | 검증 빌드 시작·초기화·프로필 | G01 | demo_ops |
| DOC01 | 발표·한계·기록 템플릿 | G01, DEMO01 | documentation |
| LIVE01 | 동일 release candidate 실제 전체 검증 | G03, P01, A01, M01, SEC01, UX01, DEMO01 | qa |
| REL01 | 등급·증거·정상본 패키지 | LIVE01, DOC01 | release |

## 상세 티켓

### E00 — 읽기 점검과 승인 목록

**종류 / 담당:** setup / lead

**선행:** 없음

**쓰기 경로:** `state/`

**산출물:** 실제 폴더·OS·도구·모드·기존 파일을 확인하고 필요한 승인만 묶음

**검사:** 권한 UNKNOWN을 승인으로 채우지 않음

**시간·재시도:** setup: 실제 승인 범위에서 진행. 설치 대화/다운로드를 무인 완료로 가정하지 않음. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### E01 — 승인된 최소 환경 준비

**종류 / 담당:** setup / setup

**선행:** E00

**쓰기 경로:** `project dependencies/approved local tools`

**산출물:** 현재 클라이언트·Git·Node·테스트 브라우저 중 실제 필요한 것만 준비

**검사:** Command Registry, 설치 실패·재시도 기록

**시간·재시도:** setup: 실제 승인 범위에서 진행. 설치 대화/다운로드를 무인 완료로 가정하지 않음. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### E02 — 개발 클라이언트 능력과 모델 연결

**종류 / 담당:** setup / lead

**선행:** E00

**쓰기 경로:** `state/capability records`

**산출물:** 현재 승인된 모델·네이티브 또는 비대화형 기능·격리·호출 제한 기록

**검사:** 요청 모델과 실제 보고 모델 구분; 미지원은 SERIAL_SAFE

**시간·재시도:** setup: 실제 승인 범위에서 진행. 설치 대화/다운로드를 무인 완료로 가정하지 않음. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### C01 — 타입·모듈 stub·빌드 계약

**종류 / 담당:** feature / contracts

**선행:** E01

**쓰기 경로:** `packages/contracts/; root package/lock/config; scripts/`

**산출물:** runtime schema·localNext와 original action 분리·typed stubs·실행 명령

**검사:** schema reject, typed stubs build, missing tests fail

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### OPS01 — 최소 루프·게이트·상태 관리

**종류 / 담당:** ops / ops

**선행:** E01, E02

**쓰기 경로:** `runtime-control/; scripts/ops/`

**산출물:** 검증된 현재 도구 우선; 단일 상태·시계·bounded test·last artifact

**검사:** OPER01, OPER02, OPER09, OPER10, OPER12

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** 제품 G00의 필수 의존성이 아니다. 미완료이면 SESSION_CHECKPOINTED 이하로 기록.

### OPS02 — 선택적 managed 복구 검증

**종류 / 담당:** ops_optional / ops

**선행:** OPS01

**쓰기 경로:** `runtime-control/; tests/ops/`

**산출물:** 지원 비대화형 경로에서 lease·crash·resume·watchdog 최소 구현

**검사:** OPER01–OPER15 실제 프로세스 시험

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** 제품 개발·FULL_LIVE의 선행조건이 아니다. 실패하면 자동 crash 복구를 주장하지 않는다.

### Q01 — 26개 원본 검사와 추가 검사 등록

**종류 / 담당:** feature / qa

**선행:** C01

**쓰기 경로:** `tests/manifest.json; tests/e2e-fixture/; tests/e2e-live/`

**산출물:** T01–T40 assertion 구조와 원본 oracle 계약

**검사:** 빈 test/skip을 PASS로 보지 않는 reporter

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### D01 — 구매 혜택 원본 서비스

**종류 / 담당:** feature / source_a

**선행:** C01

**쓰기 경로:** `apps/demo-benefits/`

**산출물:** 원본만으로 로그인·신청·동의·서버저장·내역조회

**검사:** T01 T03 T06 T07 T08 T09

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### D02 — 문화센터 원본 서비스 뼈대

**종류 / 담당:** feature / source_b

**선행:** C01

**쓰기 경로:** `apps/demo-culture/`

**산출물:** React 입력·강좌/시간·정원·서버저장·SPA 이동

**검사:** T02 T05 T10

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** 첫 사이트 변형 QA는 이 작업을 기다리지 않는다.

### X01 — 공개 snapshot·비공개 registry

**종류 / 담당:** feature / extractor

**선행:** C01

**쓰기 경로:** `packages/core/extractor/; tests/unit/extractor/`

**산출물:** 실제 ref·필수·고지·form 관계, 입력값/로그인/광고 제외

**검사:** T03 T12 T13 T20 T32 T40

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### V01 — 계획·DOM verifier

**종류 / 담당:** feature / verifier

**선행:** C01

**쓰기 경로:** `packages/core/verifier/; tests/unit/verifier/`

**산출물:** schema/ref/required/form/revision/notice 검사와 fail closed

**검사:** T03 T06 T12 T13 T14 T30

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### U01 — 여섯 템플릿·디자인 토큰

**종류 / 담당:** feature / templates

**선행:** C01

**쓰기 경로:** `packages/templates/; packages/design-tokens/`

**산출물:** 큰 글씨·버튼·실제 label·관련 입력 묶음·원문·결과 UI

**검사:** T24; source text readable, no generated HTML

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### PF01 — fixture 계획 경로와 provider interface

**종류 / 담당:** feature / provider

**선행:** C01

**쓰기 경로:** `apps/planner/src/provider/; tests/integration/provider/`

**산출물:** 제품 호출 seam과 명확한 fixture mode, schema를 같은 방식으로 검사

**검사:** T30 T35; fixture가 LIVE fallback이 아님

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### P01 — 제품 Codex 실제 연결과 모델 잠금

**종류 / 담당:** feature / provider

**선행:** PF01, E02

**쓰기 경로:** `apps/planner/src/provider/; tests/integration/provider/`

**산출물:** 승인된 실제 모델 목록·JSON probe·도구제약·cancel 확인

**검사:** 실제 연결 기록, T35 T39

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** 제품 auth 대기 중에도 PF01→I00→G00 fixture 경로는 계속한다.

### N01 — MV3 메시지·runtime 연결·탭 소유

**종류 / 담당:** feature / navigation

**선행:** C01

**쓰기 경로:** `apps/extension/src/background/; apps/extension/src/content/session/; apps/extension/src/options/`

**산출물:** sender/tab/document/nonce/HostOrigin/token, 최초설정과 활성화

**검사:** T11 T18 T20 T25 T31 T38

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### B01 — native 입력·선택·원본 실행

**종류 / 담당:** feature / binder

**선행:** X01, V01, D01

**쓰기 경로:** `packages/core/binder/; tests/integration/binder/`

**산출물:** type별 setter/event·한글조합·value 확인·중복 실행 차단

**검사:** T01 T03 T04 T06 T07 T08 T27

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### I00 — 가장 작은 fixture 원본 연결

**종류 / 담당:** feature / integrator

**선행:** B01, U01, N01, PF01

**쓰기 경로:** `apps/extension/src/content/controller/; apps/planner/src/routes/`

**산출물:** 작은 검증 plan으로 실제 입력과 원본 저장을 연결

**검사:** T01 관련 최소 흐름, T27, fixture 표시

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### G00 — 최소 제품 연결 게이트

**종류 / 담당:** gate / qa

**선행:** I00, Q01

**쓰기 경로:** `제품 쓰기 없음`

**산출물:** 원본 handler·DB를 통한 최소 정상 연결 증거

**검사:** G0: T01 최소 흐름, 잘못된 ref 거부

**시간·재시도:** gate: 관련 검사의 제한과 rollback 시간을 따로 예약. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** P01·OPS01·OPS02가 선행조건이 아니다.

### U02 — 집중형 shell·상태·오류·설정

**종류 / 담당:** feature / ui

**선행:** G00

**쓰기 경로:** `apps/extension/src/ui/; tests/unit/ui/`

**산출물:** 목표선택·review·pending·unknown·원본복귀·private drafts

**검사:** T04 T06 T07 T08 T24 T28

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### N02 — full navigation·SPA·auth 복구

**종류 / 담당:** feature / navigation

**선행:** G00, X01

**쓰기 경로:** `apps/extension/src/background/; apps/extension/src/content/session/`

**산출물:** 새 document ref 폐기, BFCache·SW·auth pause

**검사:** T09 T10 T11 T18 T25 T38 T40

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### L01 — 전체 10초 deadline·중복·late result

**종류 / 담당:** feature / deadline

**선행:** N01, PF01

**쓰기 경로:** `apps/extension/src/content/deadline/; apps/planner/src/deadline/`

**산출물:** request epoch, 3초/10초, queue·cancel·late discard

**검사:** T15 T16 T17 T18 T33 T36

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### R01 — 실제 값 검토·원본 결과 관찰

**종류 / 담당:** feature / integrator

**선행:** U02, N02, B01

**쓰기 경로:** `apps/extension/src/content/controller/; apps/planner/src/routes/`

**산출물:** private actual values review, mutation invalidation, original receipt

**검사:** T01 T07 T08 T28 T37

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### G01 — 첫 사이트 전체 fixture 게이트

**종류 / 담당:** gate / qa

**선행:** R01, L01

**쓰기 경로:** `제품 쓰기 없음`

**산출물:** 첫 화면부터 실제 저장, 오류·동의·메뉴·기본 timeout

**검사:** T01 T03 T06 T07 T08 T09 T17

**시간·재시도:** gate: 관련 검사의 제한과 rollback 시간을 따로 예약. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** P01 준비 시 최초 LIVE도 별도로 실행하되 미준비는 FIXTURE_ONLY로 기록.

### K01 — 구조 캐시와 현재 요소 재연결

**종류 / 담당:** feature / cache

**선행:** G00, X01, V01, PF01

**쓰기 경로:** `apps/planner/src/cache/; packages/core/fingerprint/`

**산출물:** candidate/verified/quarantine, 최신 값/선택지, version 무효화

**검사:** T12 T14 T20 T21 T37

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### Q02 — 첫 사이트 구조 변형과 holdout

**종류 / 담당:** feature / qa

**선행:** D01, Q01

**쓰기 경로:** `tests/holdout/; tests/e2e-fixture/`

**산출물:** 필수·고지·동명이인 버튼·메뉴변형 independent oracle

**검사:** T12 T13 T14 T26

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** 문화센터 준비 여부와 무관하게 수행한다.

### I02 — B 범위 통합

**종류 / 담당:** feature / integrator

**선행:** G01, K01, Q02

**쓰기 경로:** `apps/extension/src/content/controller/; apps/planner/src/routes/`

**산출물:** 구조 변형 재분석·invalid cache 거부·정상 재사용

**검사:** T12 T13 T14 T21 T26

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### G02 — B 변형 게이트

**종류 / 담당:** gate / qa

**선행:** I02

**쓰기 경로:** `제품 쓰기 없음`

**산출물:** 원본이 변해도 지원범위에서 정확한 완료 또는 정직한 중단

**검사:** T12 T13 T14 T21 T26

**시간·재시도:** gate: 관련 검사의 제한과 rollback 시간을 따로 예약. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### B02 — React controlled 입력과 최신 선택지

**종류 / 담당:** feature / binder

**선행:** B01, D02, G01

**쓰기 경로:** `packages/core/binder/; tests/integration/binder/`

**산출물:** 재렌더 후 값, radio/select·정원변경·IME 유지

**검사:** T02 T04 T05 T10 T37

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### I03 — 문화센터 C 제품 연결

**종류 / 담당:** feature / integrator

**선행:** G02, B02, D02

**쓰기 경로:** `apps/extension/src/content/controller/; apps/planner/src/routes/`

**산출물:** 같은 템플릿·계약으로 두 번째 원본 처리

**검사:** T02 T05 T10; site-specific answer 금지

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### G03 — 두 사이트 회귀 게이트

**종류 / 담당:** gate / qa

**선행:** I03

**쓰기 경로:** `제품 쓰기 없음`

**산출물:** 문화센터 저장 확인과 구매혜택 회귀

**검사:** T01 T02 T05 T10 T22

**시간·재시도:** gate: 관련 검사의 제한과 rollback 시간을 따로 예약. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### A01 — 준비 중 후원 카드·종료 독립성

**종류 / 담당:** feature / ui_ads

**선행:** U02, L01

**쓰기 경로:** `apps/extension/src/ui/sponsor/; tests/unit/sponsor/`

**산출물:** 정적 demo card·1goal1회·즉시종료·닫기·무개인정보

**검사:** T15 T16 T17 T19 T20 T36

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** 상위 ui owner와 path lease가 겹치면 기다린다.

### M01 — 비개인 측정·mode·사용량

**종류 / 담당:** feature / metrics

**선행:** L01, K01

**쓰기 경로:** `apps/planner/src/metrics/; tests/unit/metrics/`

**산출물:** ready/source time, cold/warm/vision/timeout, null usage

**검사:** T20 T21 T22 T35

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### VIS01 — 제한된 시각 보완과 안전한 거부

**종류 / 담당:** conditional / vision

**선행:** P01, X01, L01

**쓰기 경로:** `apps/extension/src/content/vision/; apps/planner/src/vision/`

**산출물:** 합성 영역 가림·정확한 탭·동일deadline·DOM 재검증

**검사:** T17 T18 T20 T23 T34

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** 미승인/미지원이면 disabled와 제한을 기록. 관련 실제 vision claim은 하지 않는다.

### UX01 — 실제 화면·키보드·IME 품질

**종류 / 담당:** feature / ux_qa

**선행:** G01, A01

**쓰기 경로:** `tests/e2e-fixture/; docs/qa/`

**산출물:** 짧은viewport/200%/긴한글/error/focus/IME 증거

**검사:** T04 T24 T28 T36; manual IME는 별도

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** 문화센터 통합 후 같은 체크를 다시 실행한다.

### SEC01 — 데이터 경계·보안 검토

**종류 / 담당:** feature / reviewer

**선행:** G01, N01

**쓰기 경로:** `docs/security/; tests/integration/security/`

**산출물:** leak sentinel·oracle·로컬서버·권한·주입 경로 검토

**검사:** T20 T23 T29 T30 T31 T38 T40

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** 이후 cache/vision/siteB 변경에도 impact 재검토한다.

### PERF01 — 한 병목씩 속도 개선

**종류 / 담당:** optimization / performance

**선행:** G03, M01

**쓰기 경로:** `docs/performance/; 변경은 원래 owner에게 배정`

**산출물:** 최대2 실험, 기존 검사와 holdout을 유지

**검사:** 정확도 회귀 없음; 실패 포함; cold/warm 분리

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### DEMO01 — 검증 빌드 시작·초기화·프로필

**종류 / 담당:** feature / demo_ops

**선행:** G01

**쓰기 경로:** `scripts/demo/; docs/demo/`

**산출물:** QA와 시연 분리, 합성데이터만 reset, manual checklist

**검사:** T25 T37, profile/token export 금지

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### DOC01 — 발표·한계·기록 템플릿

**종류 / 담당:** feature / documentation

**선행:** G01, DEMO01

**쓰기 경로:** `docs/presentation/`

**산출물:** 실제원본저장/AI차단/두사이트/무효화 대본, 수치 미확인 표시

**검사:** 실측 근거 연결, 광고 매출·고령자효과 과장 금지

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

### LIVE01 — 동일 release candidate 실제 전체 검증

**종류 / 담당:** gate / qa

**선행:** G03, P01, A01, M01, SEC01, UX01, DEMO01

**쓰기 경로:** `제품 쓰기 없음`

**산출물:** T01–T40 필요한 coverage와 두 사이트 실제 cold 각3회, warm 별도

**검사:** same artifact, original DB, actual provider trace

**시간·재시도:** gate: 관련 검사의 제한과 rollback 시간을 따로 예약. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** VISION 실제 미검증 여부와 수동 Chrome 점검은 별도 capability 표기. 결과 후 코드 변경하면 재검증.

### REL01 — 등급·증거·정상본 패키지

**종류 / 담당:** release / release

**선행:** LIVE01, DOC01

**쓰기 경로:** `제품 쓰기 없음`

**산출물:** 실제 등급·한계·빌드·근거·재현절차, 제출 false

**검사:** revocation/secret scan/artifact hash

**시간·재시도:** 일반 soft8/hard12분 출발값. 작은 repair7분. 남은 검사·복구 시간을 빼고 배정. 같은 원인의 수정은 초기 시도 뒤 두 번까지만.

**완료 증거:** task/attempt/lease/base/contract/version, 실제 diff·검사와 원본 결과. PATCH_READY는 완료 게이트가 아니다.

**주의:** 정상 DAG와 별도로 마감 시 언제든 emergency finalization. 선행 미충족을 성공으로 표시하지 않음.

## 실행 상태는 별도로
이 파일은 불변 작업 명세다. 상태를 여기서 PASS로 바꾸지 말고 ledger와 `state/STATUS.md`에 근거와 함께 기록한다. 마감 REL01은 의존성 미충족이어도 결과 보존을 수행할 수 있지만, 출고 등급을 올릴 권한은 없다.
