# 출처·원문·새 설계의 구분

문서 정리 기준일: **2026-09-28**. 공식 문서 확인은 기능·정책의 제약을 파악하기 위한 것이며, 사용자 Mac에 설치된 버전이나 제품 성공을 검증한 것이 아니다. 외부 문서의 현재 예시 모델·버전을 고정값으로 복사하지 않는다.

## 1. 사용자 자료

현재 대화의 최신 결정이 우선한다. 제품 기준은 v4, 기존 Ralph 운영은 v5를 바탕으로 했다. 다음 원문은 바이트 그대로 보관했다.

| 보관 경로 | 원본 파일명 | SHA-256 |
|---|---|---|
| [archive/PRODUCT_v4_ORIGINAL.md](../archive/PRODUCT_v4_ORIGINAL.md) | `FLECTO_IMPLEMENTATION_SPEC_v4_KO.md` | `97ba8d98c4b8f463592f8c82bbd1d39cf0d7eee911538e189459b70efa247671` |
| [archive/RALPH_v5_ORIGINAL.md](../archive/RALPH_v5_ORIGINAL.md) | `FLECTO_RALPH_LOOP_v5_KO.md` | `173daebe592cb89779e1d18352dad1beb6633291d3d90362f46dfbc0d1cea91d` |
| [archive/TASKS_v5_ORIGINAL.md](../archive/TASKS_v5_ORIGINAL.md) | `02_TASK_CATALOG.md` | `a58f63a86e1af8aa0b0db5a52bb8e84952515371922eecf08aa3b3c85d6482f3` |

T01–T26 문구 대조에는 제공된 `Project_FLECTO_Ralph_Operations_v5.zip` 안의 `config/product-tests-v4.json`을 사용했다. ZIP의 실행기·인증·설정 파일을 새 패키지에서 실행하지 않았다. 원본 문서에 있는 과거 검증 주장은 그 작성 시점의 기록이지 v6의 실행 결과가 아니다.

## 2. v6 설계 제안

역할 기반 모델 선택, 처음 설치 절차, native/session 우선, 최소 감독, 독립 fixture 경로, 수정한 작업 의존성, 추가14개 테스트, UI 세부값·문구, 시간·자원 출발값은 이번에 구체화한 **설계 제안**이다. 원문에 이미 구현·실측된 내용처럼 취급하지 않는다. 자세한 변경은 [03_CHANGES_FROM_V5.md](../03_CHANGES_FROM_V5.md)에 있다.

## 3. 공식 기술·정책 근거

본문의 S01–S18은 아래 자료를 가리킨다. 공식 서비스 URL은 문서 이동으로 다른 공식 도메인으로 리디렉션될 수 있다. 실제 실행 전 선택 버전의 도움말·공식 안내와 작은 실행 시험으로 확인한다.

### S01 — AGENTS.md 프로젝트 지시

[AGENTS.md 프로젝트 지시](https://developers.openai.com/codex/guides/agents-md)

공통 진입 파일의 검색·범위·크기 제약을 확인하는 근거. 이 패키지는 루트 지시를 짧게 두고 상세 문서는 필요할 때 읽는다.

### S02 — Claude Code 메모리 파일

[Claude Code 메모리 파일](https://code.claude.com/docs/en/memory)

CLAUDE.md에서 @경로 import를 사용하는 호환점의 근거. CLAUDE.md와 AGENTS.md를 별도 내용으로 중복 유지하지 않는다.

### S03 — Claude Code 서브에이전트

[Claude Code 서브에이전트](https://code.claude.com/docs/en/sub-agents)

역할별 모델·도구·worktree 설정은 클라이언트 기능이다. 실제 설치 버전과 base commit 동작은 현장에서 확인한다.

### S04 — Claude Code 권한

[Claude Code 권한](https://code.claude.com/docs/en/permissions)

권한 모드와 규칙은 무제한 승인이 아니다. 문서에 적힌 허용 범위와 실제 클라이언트 권한 설정을 함께 확인한다.

### S05 — Codex SDK

[Codex SDK](https://developers.openai.com/codex/sdk)

애플리케이션에서 Codex 작업을 제어하는 제품 연결점의 근거. 선택 모델 가중치를 자체 호스팅한다는 의미가 아니다.

### S06 — Codex App Server

[Codex App Server](https://developers.openai.com/codex/app-server)

model/list 등으로 실제 사용 가능 모델과 기능을 확인하는 근거. 모델 이름과 이미지 지원을 추측해 고정하지 않는다.

### S07 — Chrome activeTab

[Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)

사용자 동작에 따른 현재 탭 접근 권한을 설계할 때의 근거. 다른 사이트의 권한을 자동 승계한다고 가정하지 않는다.

### S08 — Chrome 콘텐츠 스크립트

[Chrome 콘텐츠 스크립트](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

DOM 상호작용·실행 환경·프레임별 접근을 확인하는 근거. 임의 페이지 내부 상태에 접근할 수 있다는 뜻이 아니다.

### S09 — Chrome 확장 네트워크 요청

[Chrome 확장 네트워크 요청](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

확장 권한과 요청 중계의 경계 근거. content script를 자유 URL 프록시로 만들지 않는다.

### S10 — Chrome service worker 생명주기

[Chrome service worker 생명주기](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)

service worker 종료·재시작을 고려해 상태를 전역 메모리만으로 관리하지 않는 근거.

### S11 — Playwright 확장 검사

[Playwright 확장 검사](https://playwright.dev/docs/chrome-extensions)

확장 자동 검사에서 번들 Chromium과 persistent context를 사용하는 근거. 실제 시연 Chrome은 추가 확인 대상이다.

### S12 — Playwright BrowserType

[Playwright BrowserType](https://playwright.dev/docs/api/class-browsertype)

전용 userDataDir와 프로필 소유권을 확인하는 근거. 개인 Chrome 기본 프로필을 자동 테스트에 연결하지 않는다.

### S13 — React input

[React input](https://react.dev/reference/react-dom/components/input)

제어형 입력의 상태·onChange 관계를 이해하는 근거. DOM 값만 바꿔 작동한다고 가정하지 않고 재렌더·제출 결과를 검사한다.

### S14 — pageshow 이벤트

[pageshow 이벤트](https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event)

뒤로가기·문서 복원 시 현재 문서와 참조를 재검사하는 근거.

### S15 — WCAG 대비

[WCAG 대비](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

텍스트 대비의 최소 조건을 확인하는 근거. 큰 글씨와 특정 색상만으로 접근성 전체를 보장하지 않는다.

### S16 — WAI 모달 대화상자 패턴

[WAI 모달 대화상자 패턴](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

포커스 이동·유지·복귀·닫기 동작을 설계하는 근거. 원본 DOM 입력 전달과의 상호작용도 별도로 검사한다.

### S17 — Chrome Web Store 광고

[Chrome Web Store 광고](https://developer.chrome.com/docs/webstore/program-policies/ads)

확장 내 AdSense 사용 제한, 광고 출처와 사용자 기능 간섭 등의 정책 검토 근거. 직접 후원이 자동 허용된다는 뜻은 아니다.

### S18 — Chrome Limited Use

[Chrome Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)

확장이 취득한 데이터의 이용·공유·개인화 광고 제한을 확인하는 근거. 시연 광고에는 페이지·개인 입력을 전달하지 않는다.

## 4. 이번 확인 범위

패키지 내부 파일·링크·작업 DAG·테스트 문구·예시 JSON·원문 해시를 정적으로 확인한다. 결과는 루트 `VALIDATION_REPORT.md`에 있다. 개발 CLI 설치, 실제 모델 호출, 사용자 Mac의 자동 복구, 브라우저 E2E, 시연 광고 정산은 확인한 범위가 아니다.
