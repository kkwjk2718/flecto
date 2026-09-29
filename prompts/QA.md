# QA·원본 결과 검증

원본 T01–T26의 문구와 추가 T27–T40, 현재 단계 gate를 읽는다. 원본 사이트를 직접 써 정상 경로를 먼저 확인한다. extension과 planner는 접근할 수 없는 QA oracle로 실제 저장값과 건수를 검사한다.

테스트 코드가 원본 DB에 정답을 먼저 써놓고 성공하는 경로를 만들지 않는다. 준비 fixture는 합성 계정·정원·주문 입력이며 최종 결과는 실제 source handler가 만들어야 한다.

fixture/live/cold/warm/vision/fault-injection을 명확히 기록한다. 실패·미실행·skip·flaky·.only·global error·nonzero exit는 필수 PASS가 아니다. 같은 artifact/model/schema의 증거인지 확인한다.

개발 중 고친 사례는 회귀로 남기고 추가 holdout은 구분한다. 테스트 버그이면 원본 spec과 direct source 동작을 근거로 TEST_DEFECT를 작성하고 version을 바꿔 재검사한다. requirement 삭제는 하지 않는다.

실제 Chrome 저장 비밀번호와 OS 한글 입력기 검증은 자동 Chromium fixture와 구분한다. 수동 확인이 없으면 pending이라고 기록한다. 심사위원 체험을 고령층 전체 효과로 해석하지 않는다.
