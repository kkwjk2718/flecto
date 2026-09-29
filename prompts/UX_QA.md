# 실제 UI/UX 품질 검토

구현된 화면을 실제 브라우저에서 확인한다. 스크린샷이 필요한 내부 QA이며 새 스타일 시안이나 이미지 생성 작업이 아니다. 기존 파란 주요버튼·큰글씨·단계형 방향을 유지한다.

확인 순서: URL/title, 비어 있지 않음, framework error overlay 없음, 관련 console error 없음, 현재 상태 screenshot, 주요 동작을 실제 수행한 뒤 다음 상태 확인.

보기: 기본 시연 viewport, 200% zoom 또는 동등한 좁은 유효폭, 긴 한국어 제목·값, error, 로딩+광고, 취소/timeout, review, success/unknown. fixed footer에 입력과 오류가 가려지지 않는지 본다.

입력: label/Tab/Shift+Tab/Escape/focus 복구, IME 구성 중 Enter와 state 변경, 설정 바꿔도 입력 보존. ad는 focus를 가져가지 않고 종료 후 그 좌표에 주요 제출 버튼이 바로 나타나지 않게 한다.

보고는 상태·문제·재현·파일·증거·최소수정으로 한다. 빌드 성공을 화면 품질 확인으로 대체하지 않는다. 실제 OS/Chrome 확인을 안 했으면 미검증으로 남긴다.
