# 통합 문서 지도 — v7

## 먼저 읽는 네 가지 경로

**개발 시작:** README → 00_START_HERE → AGENTS → 01_DECISIONS → bootstrap → 담당 spec/ops.

**프로젝트 소개:** 통합 개요 → 동기·멘토링 → 차별화 → 기대효과·사업.

**발표 준비:** presentation/00_README → 12장 또는 8장 → 대본 → 데모 큐시트 → Q&A → 차트.

**최종 확인:** 제품 검증 등급 → 결과 입력 → 주장표·공개 점검 → 실제 발표 인계.

모든 파일을 모든 에이전트에게 한 번에 전달하지 않는다. archive는 과거 기록이다.

## 시작과 전체 파악

| 문서 | 내용 |
|---|---|
| [README.md](README.md) | Project FLECTO — 개발·운영·발표·홍보 통합 문서 v7 |
| [00_START_HERE.md](00_START_HERE.md) | 첫 세션 — 아직 아무것도 설치하지 않은 폴더에서 |
| [AGENTS.md](AGENTS.md) | FLECTO — 모든 개발 에이전트의 공통 규칙 |
| [CLAUDE.md](CLAUDE.md) | 클라이언트 호환 진입점 |
| [01_DECISIONS.md](01_DECISIONS.md) | 확정 선택과 변경 가능한 구현 기본값 |
| [04_MASTER_OVERVIEW.md](04_MASTER_OVERVIEW.md) | Project FLECTO — 전체 통합 개요 |
| [05_PACKAGE_CHANGELOG.md](05_PACKAGE_CHANGELOG.md) | v7 통합 편집 기록 — 기존 실행 사양과 홍보 초안을 섞지 않기 |
| [03_CHANGES_FROM_V5.md](03_CHANGES_FROM_V5.md) | v4·v5에서 v6로 — 유지·변경·추가 구분 |

## 동기·문제·차별화

| 문서 | 내용 |
|---|---|
| [project/00_MOTIVATION_AND_MENTORING.md](project/00_MOTIVATION_AND_MENTORING.md) | 동기·문제 정의·멘토링 반영 |
| [project/01_POSITIONING_AND_DIFFERENTIATION.md](project/01_POSITIONING_AND_DIFFERENTIATION.md) | 포지셔닝과 에이전트 질문에 대한 답 |

## 환경 시작

| 문서 | 내용 |
|---|---|
| [bootstrap/00_ZERO_START.md](bootstrap/00_ZERO_START.md) | ZERO 상태에서의 설치·환경 준비 |
| [bootstrap/01_CAPABILITIES_AND_MODELS.md](bootstrap/01_CAPABILITIES_AND_MODELS.md) | 모델 비종속 역할·도구 연결 |

## 제품·구성·UI/UX

| 문서 | 내용 |
|---|---|
| [spec/00_PRODUCT.md](spec/00_PRODUCT.md) | 제품 명세 — 현재 구현 기준 |
| [spec/01_ARCHITECTURE.md](spec/01_ARCHITECTURE.md) | 아키텍처·폴더·데이터 경계 |
| [spec/02_CONTRACTS.md](spec/02_CONTRACTS.md) | 단일 데이터 계약·버전 관리 |
| [spec/03_BROWSER_AND_BINDER.md](spec/03_BROWSER_AND_BINDER.md) | 브라우저 세션·원본 요소 연결·오류 복구 |
| [spec/04_PLANNER_CACHE_AND_DEADLINES.md](spec/04_PLANNER_CACHE_AND_DEADLINES.md) | Codex 계획·재사용·시각 보완·시간 제한 |
| [spec/05_UI_UX.md](spec/05_UI_UX.md) | UI/UX 상세 — 고령자를 먼저 고려한 안정적인 조작 |
| [spec/06_SOURCE_SITES.md](spec/06_SOURCE_SITES.md) | 독립 원본 테스트 서비스 두 개 |
| [spec/07_ADS_AND_PRIVACY.md](spec/07_ADS_AND_PRIVACY.md) | 광고·개인정보·보안 경계 |

## Ralph Loop·작업·검증·복구

| 문서 | 내용 |
|---|---|
| [ops/00_RALPH_LOOP.md](ops/00_RALPH_LOOP.md) | Ralph Loop v6 — 모델 비종속, 제품 우선, 최소 개입 |
| [ops/01_TASK_GRAPH.md](ops/01_TASK_GRAPH.md) | 구현 작업표 v6 — 40개, 모델 이름 없는 역할 배정 |
| [ops/02_GATES_AND_TESTS.md](ops/02_GATES_AND_TESTS.md) | 수용 게이트·증거 기준 |
| [ops/03_RECOVERY.md](ops/03_RECOVERY.md) | 오류·중단·모델 변경·세션 재개 |
| [ops/04_OWNERSHIP_AND_CONTEXT.md](ops/04_OWNERSHIP_AND_CONTEXT.md) | 파일 소유권·문맥·통합 |
| [ops/05_PERFORMANCE.md](ops/05_PERFORMANCE.md) | 정확도를 유지하는 성능 반복 |
| [ops/06_RELEASE_AND_DEMO.md](ops/06_RELEASE_AND_DEMO.md) | 마감·정상본·시연·제출 |
| [ops/07_MINIMAL_SUPERVISOR.md](ops/07_MINIMAL_SUPERVISOR.md) | 최소 감독 코드의 구현 계약 |
| [ops/08_COMMUNICATION_WORKFLOW.md](ops/08_COMMUNICATION_WORKFLOW.md) | 제품 개발을 막지 않는 발표·홍보 작업 연결 |

## 발표·차트·시연·질의응답

| 문서 | 내용 |
|---|---|
| [presentation/00_README.md](presentation/00_README.md) | 발표 패키지 사용법 |
| [presentation/01_SLIDES_12.md](presentation/01_SLIDES_12.md) | 12장 표준 발표 — 슬라이드 문안·배치·발표자 메모 |
| [presentation/02_SLIDES_8.md](presentation/02_SLIDES_8.md) | 8장 압축 발표 문안 |
| [presentation/03_SCRIPTS_3_5_7.md](presentation/03_SCRIPTS_3_5_7.md) | 3분·5분·7분 발표 대본 |
| [presentation/04_DEMO_CUE_SHEET.md](presentation/04_DEMO_CUE_SHEET.md) | 데모 큐시트 — 원본 기능과 차별화 증거 |
| [presentation/05_JUDGE_QA_20.md](presentation/05_JUDGE_QA_20.md) | 심사위원 예상 질문 20개와 답변 |
| [presentation/06_CHART_STORYBOARDS.md](presentation/06_CHART_STORYBOARDS.md) | 차트·인포그래픽 A–H 제작 명세 |

## 브랜드·홍보·영상

| 문서 | 내용 |
|---|---|
| [marketing/00_BRAND_AND_COPY.md](marketing/00_BRAND_AND_COPY.md) | 브랜드·소개 문구 모음 |
| [marketing/01_ONEPAGER_AND_PROMO.md](marketing/01_ONEPAGER_AND_PROMO.md) | 한 장 소개서·부스 안내·홍보 문구 |
| [marketing/02_OPENING_VIDEO_PLAN.md](marketing/02_OPENING_VIDEO_PLAN.md) | 선택적 오프닝 영상 제작 명세 |

## 사업·효과·발전

| 문서 | 내용 |
|---|---|
| [business/00_REVENUE_MODEL.md](business/00_REVENUE_MODEL.md) | 수익구조 — 준비 시간의 비개인화 후원에서 시작 |
| [business/01_GTM_AND_ROADMAP.md](business/01_GTM_AND_ROADMAP.md) | 시장 진입과 추후 발전 방향 |
| [business/02_EXPECTED_EFFECTS_AND_KPI.md](business/02_EXPECTED_EFFECTS_AND_KPI.md) | 기대효과와 측정 계획 |

## 주장·실측·공개 전 확인

| 문서 | 내용 |
|---|---|
| [evidence/00_CLAIM_LEDGER.md](evidence/00_CLAIM_LEDGER.md) | 발표 주장·출처·검증 상태 표 |
| [evidence/01_RESULTS_TEMPLATE.md](evidence/01_RESULTS_TEMPLATE.md) | 실제 결과 입력 양식 — 비어 있는 칸을 0으로 채우지 않기 |
| [evidence/02_PUBLISH_CHECKLIST.md](evidence/02_PUBLISH_CHECKLIST.md) | 발표·홍보·출고 전 점검표 |
| [evidence/03_PLACEHOLDER_INDEX.md](evidence/03_PLACEHOLDER_INDEX.md) | 실측 자리표시자 지도 |

## 역할 프롬프트

| 문서 | 내용 |
|---|---|
| [prompts/ASSETS_AND_RELEASE.md](prompts/ASSETS_AND_RELEASE.md) | 선택 이미지·문서·릴리스 역할 |
| [prompts/COMMUNICATION_LEAD.md](prompts/COMMUNICATION_LEAD.md) | 발표·홍보 담당 시작 지시 — 모델 비종속 |
| [prompts/LEAD.md](prompts/LEAD.md) | 리드 에이전트 역할 |
| [prompts/QA.md](prompts/QA.md) | QA·원본 결과 검증 |
| [prompts/RESUME.md](prompts/RESUME.md) | 새 세션·다른 개발 모델에서 재개 |
| [prompts/REVIEWER.md](prompts/REVIEWER.md) | 독립 검토자 |
| [prompts/UX_QA.md](prompts/UX_QA.md) | 실제 UI/UX 품질 검토 |
| [prompts/WORKER.md](prompts/WORKER.md) | 구현 작업자 계약 |

## 실제 실행 뒤 채울 상태·양식

| 문서 | 내용 |
|---|---|
| [state/BLOCKERS.md](state/BLOCKERS.md) | 차단 기록 |
| [state/DECISIONS.md](state/DECISIONS.md) | 실행 중 결정 로그 |
| [state/NEXT_ACTION.md](state/NEXT_ACTION.md) | 다음 행동 |
| [state/PRESENTATION_STATUS.md](state/PRESENTATION_STATUS.md) | 발표·홍보 준비 상태 |
| [state/STATUS.md](state/STATUS.md) | 시작 상태 — 문서만 준비됨 |
| [templates/APPROVALS.md](templates/APPROVALS.md) | 권한·준비 승인 기록 양식 |
| [templates/EVIDENCE_AND_RELEASE.md](templates/EVIDENCE_AND_RELEASE.md) | 실제 근거·릴리스 기록 양식 |
| [templates/FINAL_PRESENTATION_HANDOFF.md](templates/FINAL_PRESENTATION_HANDOFF.md) | 최종 발표 인계 양식 |
| [templates/RUN_SETTINGS.md](templates/RUN_SETTINGS.md) | 실행 설정 양식 — 실제 실행 전에 채울 것 |
| [templates/TASK_HANDOFF_AND_CHANGES.md](templates/TASK_HANDOFF_AND_CHANGES.md) | 티켓·인계·변경요청 양식 |

## 출처·검사·파일 목록

| 문서 | 내용 |
|---|---|
| [sources/SOURCES.md](sources/SOURCES.md) | 출처·원문·새 설계의 구분 |
| [sources/CONVERSATION_AND_FILES.md](sources/CONVERSATION_AND_FILES.md) | 대화·제공 파일에 근거한 통합 기록 |
| [VALIDATION_REPORT.md](VALIDATION_REPORT.md) | 이번 통합 패키지의 정적 검사 결과 |
| [FILE_MANIFEST.md](FILE_MANIFEST.md) | 전체 파일과 SHA-256 (자기 자신 제외) |

## 보관용 과거 원문

| 문서 | 내용 |
|---|---|
| [archive/PRODUCT_v4_ORIGINAL.md](archive/PRODUCT_v4_ORIGINAL.md) | Project FLECTO — 세부 구현 명세 v4 |
| [archive/RALPH_v5_ORIGINAL.md](archive/RALPH_v5_ORIGINAL.md) | Project FLECTO — 상세 Ralph Loop 운영 명세 v5 |
| [archive/README.md](archive/README.md) | 과거 자료 보관 — 현재 실행 지시 아님 |
| [archive/TASKS_v5_ORIGINAL.md](archive/TASKS_v5_ORIGINAL.md) | 작업별 상세 티켓 — 40개 |
| [archive/v6_entrypoints/00_START_HERE.md](archive/v6_entrypoints/00_START_HERE.md) | 첫 세션 — 아직 아무것도 설치하지 않은 폴더에서 |
| [archive/v6_entrypoints/01_DECISIONS.md](archive/v6_entrypoints/01_DECISIONS.md) | 확정 선택과 변경 가능한 구현 기본값 |
| [archive/v6_entrypoints/02_DOCUMENT_MAP.md](archive/v6_entrypoints/02_DOCUMENT_MAP.md) | 문서 지도와 역할별 읽기 순서 |
| [archive/v6_entrypoints/AGENTS.md](archive/v6_entrypoints/AGENTS.md) | FLECTO — 모든 개발 에이전트의 공통 규칙 |
| [archive/v6_entrypoints/FILE_MANIFEST.md](archive/v6_entrypoints/FILE_MANIFEST.md) | 파일 목록과 SHA-256 |
| [archive/v6_entrypoints/NOTICE.md](archive/v6_entrypoints/NOTICE.md) | v6 원본 진입 파일 보관 |
| [archive/v6_entrypoints/README.md](archive/v6_entrypoints/README.md) | Project FLECTO — 빈 폴더에서 시작하는 개발 지침 v6 |
| [archive/v6_entrypoints/VALIDATION_REPORT.md](archive/v6_entrypoints/VALIDATION_REPORT.md) | 문서 패키지 정적 검사 보고서 |
| [archive/v6_entrypoints/sources/SOURCES.md](archive/v6_entrypoints/sources/SOURCES.md) | 출처·원문·새 설계의 구분 |
