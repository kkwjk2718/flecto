# 다음 행동

2026-09-29 12:02 KST. 사용자 명시 개발 시작, 오늘 16:00 완료. [실행 설정](RUN_SETTINGS.md)을 따른다.

현재 C01의 runtime schema·로컬 UI/action 계약·Node 24 의존성·최소 MV3 빌드 기준점을 검증했다. 계약 단위 검사 3개 PASS. 제품 원본 연결 G0는 아직 NOT_RUN이다.

다음: 별도 worktree의 원본 서비스·core 추출/검증/입력·Opus UI 작업을 배정한다. 리드는 extension controller/background와 planner 통합을 담당한다. 계약 버전 1.0.0, 루트 package/lock/contracts는 리드만 쓴다.

Fable 5.1은 제품 Codex 도구 제한·구조화 출력 경로를 읽기 전용으로 조사 중이다. 실제 모델 인증과 fixture 원본 연결을 분리한다.

설치·build·E2E는 한 번에 하나. 현재 시연/QA 데이터와 개인 Chrome 프로필을 분리한다. 다음 체크포인트에서 실제 base SHA·worker 임대·게이트 결과를 갱신한다.
