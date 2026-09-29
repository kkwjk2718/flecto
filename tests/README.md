# 제품·운영 검사 영역

`unit`, `integration`, `e2e-fixture`, `e2e-live`에 제품·운영 모듈 검사가 있다. 실제 확장 브라우저 검사는 격리 프로필·QA DB·별도 localhost 포트를 사용하고 원본 DB 저장값을 확인한다. LIVE는 실제 Codex를 호출하며 각 반복의 새 QA 캐시로 cold와 warm을 구분한다. 실패 시 자동 재시도하지 않는다.

[T01–T40와 OPER01–OPER15](../ops/02_GATES_AND_TESTS.md)는 실행해야 할 요구 목록이다. 현재 CI의 `npm run check`는 문서 링크·기본 저장소 구조·보관 원문·검사 ID 보존만 확인한다. 이를 제품 PASS나 전체 기능 완료로 집계하지 않는다.
