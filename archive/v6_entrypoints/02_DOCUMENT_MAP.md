# 문서 지도와 역할별 읽기 순서

## 시작 파일

| 순서 | 파일 | 읽는 사람 |
|---|---|---|
| 1 | [README.md](README.md) | 사용자: 압축을 풀고 클라이언트에 전달하는 방법 |
| 2 | [00_START_HERE.md](00_START_HERE.md) | 첫 개발 세션: 설치0·승인·모드·첫 작업 |
| 3 | [AGENTS.md](AGENTS.md) | 모든 개발 작업자의 공통 짧은 규칙 |
| 4 | [01_DECISIONS.md](01_DECISIONS.md) | 리드: 사용자 결정과 구현 기본값 |
| 5 | [03_CHANGES_FROM_V5.md](03_CHANGES_FROM_V5.md) | 리드·검토자: 이전 계획과의 차이 |

`CLAUDE.md`는 선택적인 Claude Code 호환점이며 모델을 고정하지 않는다. 다른 클라이언트도 `AGENTS.md`와 시작 파일을 직접 읽으면 된다.

## 환경·구현·UI

[설치0에서 시작](bootstrap/00_ZERO_START.md) · [역할·모델·도구 확인](bootstrap/01_CAPABILITIES_AND_MODELS.md)

[제품 정의](spec/00_PRODUCT.md) · [아키텍처와 폴더](spec/01_ARCHITECTURE.md) · [데이터 계약](spec/02_CONTRACTS.md) · [브라우저·원본 연결](spec/03_BROWSER_AND_BINDER.md) · [Codex·캐시·기한](spec/04_PLANNER_CACHE_AND_DEADLINES.md) · [UI/UX 상세](spec/05_UI_UX.md) · [두 원본 사이트](spec/06_SOURCE_SITES.md) · [광고·개인정보](spec/07_ADS_AND_PRIVACY.md)

## Ralph Loop·검증·출고

[루프 본문](ops/00_RALPH_LOOP.md) · [40개 작업표](ops/01_TASK_GRAPH.md) · [40개 제품 검사·15개 운영 검사](ops/02_GATES_AND_TESTS.md) · [오류·재개](ops/03_RECOVERY.md) · [소유권·문맥](ops/04_OWNERSHIP_AND_CONTEXT.md) · [성능 개선](ops/05_PERFORMANCE.md) · [릴리스·데모](ops/06_RELEASE_AND_DEMO.md) · [최소 감독자 명세](ops/07_MINIMAL_SUPERVISOR.md)

## 역할별 프롬프트

[리드](prompts/LEAD.md) · [구현](prompts/WORKER.md) · [독립 검토](prompts/REVIEWER.md) · [QA](prompts/QA.md) · [UX 검사](prompts/UX_QA.md) · [에셋·출고](prompts/ASSETS_AND_RELEASE.md) · [새 세션 재개](prompts/RESUME.md)

## 앞으로 채울 실행 기록

[설정](templates/RUN_SETTINGS.md) · [승인](templates/APPROVALS.md) · [티켓·인계·변경](templates/TASK_HANDOFF_AND_CHANGES.md) · [검증·릴리스](templates/EVIDENCE_AND_RELEASE.md)

[현재 상태](state/STATUS.md) · [다음 작업](state/NEXT_ACTION.md) · [차단](state/BLOCKERS.md) · [결정 로그](state/DECISIONS.md)

## 자료 추적

[출처](sources/SOURCES.md) · [과거 원문 안내](archive/README.md) · [정적 검사 보고서](VALIDATION_REPORT.md) · [파일 해시 목록](FILE_MANIFEST.md)

## 문맥을 줄이는 규칙

리드는 공통결정·계약·루프·현재 체크포인트를 읽는다. 구현 작업자는 자기 티켓·관련 spec·기대검사만 읽는다. QA는 실제 requirement와 원본 서비스·diff·검사 근거를 우선 읽는다. UX 담당은 UI 명세와 실제 화면·콘솔·상태를 비교한다. 재개 세션은 과거 전체 대화 대신 체크포인트와 현재 파일을 대조한다. `archive/`는 필요할 때만 읽고 실행 지시로 import하지 않는다.
