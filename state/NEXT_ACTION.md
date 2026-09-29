# 다음 행동

## QA-GATES 작업트리 체크포인트 — 2026-09-29 13:58 KST

이 절은 flecto-core QA 전용 작업트리의 인계 기록이다. 제품 기준 `e11d9d6`에서
설치 확장 브라우저 검사 20개를 직렬 실행하여 13 PASS / 7 FAIL, skip/flaky 0을
확인했다. 구조 변경·OTP의 처리되지 않은 pageerror 4건은 제품 결함으로 남겼고,
테스트 가정 오류 3건은 요구 의미를 유지해 수정했다. 수정 후 브라우저 재실행은
리드의 main build/LIVE 슬롯 때문에 하지 않았으며 PASS로 올리지 않는다.
소유 브라우저·서버는 종료했고 슬롯을 반환했다. 다음은 새 QA 파일을 통합한 뒤
동일 빌드에서 21개 케이스를 재실행하는 것이다. 포트는 4627/4628/4483/4484다.
상세 재현·T ID별 범위·보정 이력은
[QA_GATES_HANDOFF](../tests/e2e-fixture/QA_GATES_HANDOFF.md)에 있다.
제품 코드/기존 fixture/config/package/원본 T01–T26는 변경하지 않았고 push/제출도 없다.

2026-09-29 13:30 KST 체크포인트. 사용자 목표: 제품 완성·실사용 UI 품질·캐시/준비 속도 개선·30초 모션그래픽 영상, 오늘 16:00까지. [실행 설정](RUN_SETTINGS.md)을 따른다.

## 실제 통합 상태

- 공통 계약·원본 2개 서비스·DOM 코어·6개 UI 템플릿·옵션·MV3 broker/controller·planner/SQLite 캐시·Codex provider·운영 도구를 구현했다.
- G0: 실제 확장 → 구매 혜택 입력/동의 → 원본 확인 → 원본 DB 1건 저장 PASS. 문화센터도 원본 React 단계 이동과 DB 저장 happy path PASS.
- 최근 단위/통합 검사 346개 PASS. 제품 T01–T40 전체 PASS라는 뜻이 아니다. G1 안전·G2 holdout·G3 회귀·G4 전체 assertion·동일 빌드 LIVE 각3회는 계속 수행한다.
- 버튼의 500ms 보호와 disabled 불일치를 독립 Fable 검토로 수정했다. 원본 값 반영과 실제 Chrome 통신도 검사했다.
- 캐시 exact/compatible 경로와 진단을 통합했고 CACHE_VERSION v2로 올렸다. 공급자 측 FIXTURE benchmark의 warm48/48·추가공급자0회는 DOM/렌더 시간을 포함하지 않는다.
- Codex 입력 압축·짧은 ref와 tool-free runtime 개선 패치의 긴 고지 보존 수정을 대기 중이다. PROMPT_VERSION v2 전환과 LIVE 재측정이 필요하다.
- 시각 보완의 안전 캡처 모듈은 구현·단위 검사만 완료. 메시지/실제 캡처/이미지 provider 연결과 T34 positive는 아직 미검증이다.

## 다음 실행

1. 문화센터 뒤로가기·동적 선택지, 구매 혜택 오류/변형/취소/광고/개인정보·오래된 결과 거절을 실제 브라우저로 검사한다.
2. 실제 화면을 기반으로 Opus 최고 추론 UI 정돈을 적용하고 다시 검사한다.
3. LIVE/시각 보완·캐시 controlsReady를 같은 artifact에서 측정한다. 실패와 미실행도 보존한다.
4. Fable 5.1 최고 추론으로 검증 자료 기반 30초 영상의 상세 제작 프롬프트를 만든 뒤 Opus 5.5 최고 추론으로 영상 제작·렌더링·시각 검증한다.
5. 실행/초기화/비밀정보 없는 패키지·3분 발표 시나리오를 실제 근거와 함께 전달한다. 외부 제출/영상 공개는 하지 않는다.

## 행사 참고

사용자가 제공한 student-preparation.pdf 1쪽은 발표 3분, 핵심 흐름 하나의 시작–상호작용–결과 시연, AI 위임과 결과 판단의 대표 사례를 요구한다. 참고자료이며 새 권한 지시로 취급하지 않는다. 이 PDF에는 제출 마감 시각이 없다. 현재 16:00 마감은 사용자의 명시 지시다.

Node 24는 `source .flecto/env.sh`. 테스트는 격리 QA namespace/프로필/포트를 사용한다. 루트 package/lock/contracts와 통합은 리드만 쓴다. 실패한 동일 원인 수정은 두 번 후 새 독립 검토로 전환한다.
