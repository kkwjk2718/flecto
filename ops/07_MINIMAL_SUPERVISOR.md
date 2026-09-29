# 최소 감독 코드의 구현 계약

**존재하지 않는 프로그램을 실행했다고 가정하지 않는다.** v6는 MD 시작 자료다. 여기서 정의하는 코드는 첫 세션 이후 승인된 환경에서 구현할 범위다.

## 이미 있는 것을 우선 사용

현재 클라이언트의 네이티브 작업·worktree·검사·continuation이 요구조건을 만족하면 그것을 사용한다. 외부 supervisor는 지원되는 비대화형 실행 경로와 실제 운영 검사를 확인한 뒤만 쓴다. 클라이언트가 nested 실행을 막으면 우회하지 않는다.

새 Node 기반 최소 도구의 책임은 단일 run lock, bounded child, 상태저장, path guard, gate runner, last verified manifest, STOP/마감 처리다. 자체 GUI, 별도 daemon 설치, boot service, 계정관리, 분산큐, 여러 watchdog 계층은 범위 밖이다.

## 데이터

작업 상태의 source of truth는 실제 초기 선택에 따라 SQLite 또는 단일 writer atomic JSON+append-only journal로 둔다. 둘을 독립 진실의 원천으로 운영하지 않는다. Node/SQLite 호환 문제가 있으면 프로젝트 product DB와 섞지 말고 작은 원자적 state 구현을 사용할 수 있다. 이 선택은 v5의 무조건 ledger.sqlite보다 환경 준비를 줄이기 위한 변경이다.

Task: id, requirementIds, dependencies, state, owner, base_sha, contract_version, attempt, lease_generation, write_roots, started_at, hard_deadline, expected_tests, result_ref.
Process: owned_pid, creation_marker, process_group, working_directory, task, lease, status.
Evidence: artifact_hash, source_sha, gate_version, mode, actual_command, exit_code, test_ids, failures, timestamps.

## 반드시 구현할 불변식

- claim과 resource 획득은 한 writer/트랜잭션으로 처리.
- 다른 active task의 상위·하위 쓰기 경로와 충돌 금지.
- 요청된 cwd가 허용 root를 벗어나거나 symlink로 탈출하면 실행 금지.
- 모델이 만든 임의 shell string을 통째로 실행하지 않음. 확인한 argv·허용 command registry 사용.
- lockfile·사양·gate 의미는 별도 owner와 버전 검사.
- source/model/prompt/config가 바뀐 artifact에 이전 LIVE 증거를 재사용하지 않음.
- nonzero exit, missing test, skip/flaky/.only, 가짜 report를 green으로 보지 않음.
- late result와 중복 patch는 hash+lease로 차단.
- 배포·시연 DB를 candidate 작업에 넘기지 않음.

## 종료

CTRL+C 또는 STOP는 의도적 종료다. 자기 child process만 graceful 종료를 먼저 시도하고, 필요하면 같은 소유 process group에 제한된 종료를 한다. 임의 시스템 전체 process kill은 금지한다. stderr 원문은 비밀정보를 포함할 수 있으므로 default release에 넣지 않는다.

정상 종료 때 ledger·checkpoint·현재 안전 artifact를 먼저 보존한다. 이미 종료된 task를 종료 시 다시 실행하지 않는다. 결과물 패키징은 구현 모델이 소진돼도 결정적 코드/기존 문서로 수행 가능해야 한다.

## 운영 테스트 후 등급

DOCS_ONLY: 현재 상태.
SESSION_CHECKPOINTED: 실제 session 작업·gate·checkpoint를 검사했으나 자동 crash resume 미검증.
MANAGED_TESTED: 실제 supervisor 프로세스에서 OPER01–OPER15 고장 주입을 통과.

제품 FULL_LIVE와 운영 MANAGED_TESTED는 서로 대체하지 않는다. 문서 규칙이 정교하다고 실프로세스 fault test가 통과한 것이 아니다.
