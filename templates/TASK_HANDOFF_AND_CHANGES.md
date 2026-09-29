# 티켓·인계·변경요청 양식

## 티켓

| 항목 | 값 |
|---|---|
| task_id / requirement IDs | 미정 |
| role / current approved model | 미정 |
| base_sha / contract_version | 미정 |
| attempt / lease_generation | 미정 |
| worktree / allowed write roots | 미정 |
| dependencies and their evidence | 미정 |
| goal and non-goals | 미정 |
| required tests / oracle | 미정 |
| deadline / heavy resources | 미정 |

## 작업자 인계

status: NOT_STARTED / PATCH_READY / BLOCKED / FAILED 중 실제 상태.
changed_files: 실제 목록.
commit_or_patch: 실제 참조.
checks_run: 명령·exit·증거 경로, 미실행이면 NOT_RUN.
known_risks: 남은 구체적 위험.
contract_request: 없으면 none.
next_action: 다음 하나의 실행 가능 작업.

완료 수락에는 task/attempt/lease/base/contract 일치가 필요하다. worker 로그만으로 통합 검증이 끝나지 않는다.

## CHANGE_REQUEST / TEST_DEFECT

유형, 문제 조건, 원문 requirement, 제안하는 최소 변경, 영향 모듈, 기존 의미 유지 여부, 필요한 버전 변경, 새 검증, 승인 owner, 근거를 작성한다. 요구조건 자체를 약화해야 한다면 사용자 결정이 필요하다. 단순 테스트 구현 결함은 독립 QA 검토를 거쳐 고칠 수 있다.

## 모델 교체 인계

requested/reported model, 교체 사유, 사용자의 승인 집합, capability probe, 새 lease, 유지할 제품 계약, 무효화할 모델·캐시·LIVE 근거를 기록한다. 현재 모델이 없다고 다른 청구 경로를 자동 사용하지 않는다.
