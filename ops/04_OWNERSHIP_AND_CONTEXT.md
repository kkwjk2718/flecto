# 파일 소유권·문맥·통합

## 최소 소유 영역

| 소유자 | 경로 |
|---|---|
| 계약 writer | packages/contracts, 루트 package/lock/config, 공통 command registry |
| extractor | packages/core/extractor + 자기 tests |
| binder | packages/core/binder + 자기 tests |
| verifier | packages/core/verifier + 자기 tests |
| templates | packages/templates, design-tokens + 자기 tests |
| extension shell | apps/extension/src/ui |
| navigation | apps/extension/src/background, apps/extension/src/content/session, apps/extension/src/options |
| integrator | apps/extension/src/content/controller, apps/planner/src/routes |
| provider | apps/planner/src/provider |
| cache | apps/planner/src/cache, packages/core/fingerprint |
| source A/B | 각각의 apps/demo-* |
| QA | tests/e2e-*, holdout, gate manifest의 검토된 변경 |
| operations | runtime-control, scripts/ops, 고정 실행제어본 |

하위 sponsor/vision/deadline 폴더도 상위 owner와 동시에 쓰지 않는다. 기본 owner가 scope를 좁히고 RELEASE한 뒤 독립 임대를 배정한다. 이 표는 협업 규칙이며 실제 권한 경계는 도구·OS 설정으로 별도 검증한다.

## 통합

변경은 job별 worktree, 통합은 단일 writer다. 작업 시작마다 base_sha를 고정하고 HEAD를 확인한다. native 작업공간의 기본 브랜치 동작만 믿지 않는다. [S03]

관련 변경을 후보에 모은 뒤 타입·단위·실제 E2E를 실행한다. 처음 작은 stub 단계마다 전체 제품이 끝나야 PASS라는 순환 의존성을 만들지 않는다. 반대로 모듈 단위 통과를 제품 전체 완료로 올리지 않는다.

현재 시연 artifact와 DB는 candidate repo와 분리한다. 원본 source DB·QA oracle·control 정책은 worker에 공개할 필요가 없는 경로다. 제품 worker는 evidence를 수정하지 않는다.

## 문맥 경로

리드: 시작→결정→현재 gate→task graph→필요한 세부 spec.
작업자: AGENTS 요약→자기 티켓→관련 계약·시험→최신 diff/실패.
리뷰어: 요구사항→diff→실제 실패 먼저. 작성자의 낙관적 완료 설명은 후순위.
QA: 요구사항·원본 직접 조작·oracle·테스트 결과. 모델 자기평가는 성공 기준이 아니다.

모든 문서를 일괄 import하지 않는다. ROOT AGENTS는 작게 유지한다. 과거 archive의 모델 고정 지시를 자동 실행 문맥에 넣지 않는다. 역할마다 필요한 정보만 제공한다. [S01–S02]

## 체크포인트

의미 있는 patch·gate·blocked·마감 전이·컨텍스트 압축 직전마다 state를 저장한다. 포함: 현재 SHA, active/queued tasks, leases, 계약 버전, 확인된 test IDs, 실패 서명, 승인 상태의 reference, 다음 하나의 작업. 민감 prompt/log 전체는 넣지 않는다.

직접 초안을 저장하더라도 supervisor ledger와 모순되면 자동 overwrite하지 말고 reconcile한다. 현 세션 내부 추론을 백업한다고 설명하지 않는다. 재시작에 필요한 사실과 파일만 남긴다.
