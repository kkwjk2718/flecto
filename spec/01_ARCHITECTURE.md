# 아키텍처·폴더·데이터 경계

## 최소 스택

Node/TypeScript 제품 모노레포, React/Vite 집중형 UI, Fastify 제품 서버, SQLite 로컬 구조 캐시, Vitest와 Playwright. 버전은 설치 환경의 공식 요구조건을 확인해 lockfile로 고정한다. 별도 Redis·Docker·클라우드 DB·원격 개발 서버는 필수로 도입하지 않는다.

개발 감독은 모델 비종속이다. 새 환경에서 Python이 없으면 제품에 이미 필요한 Node로 얇은 제어 코드를 구현하는 안을 우선한다. 이미 검증된 Python 실행기 재사용은 가능하지만 이전 engine을 모델명만 바꿔 실행하지 않는다. [v6 개선]

## 향후 코드 배치

```text
apps/
  extension/src/
    background/       # sender·탭·요청 검증, planner 연결
    content/          # 원본 세션·controller·관찰·캡처
    ui/               # 집중형 shell, 상태, 설정 연결
    options/          # 사전 표시 설정, runtime 연결
  planner/src/
    routes/           # 제한된 로컬 HTTP
    provider/         # Codex 어댑터, fixture 구현은 명시적 분리
    cache/            # 검증된 비개인 blueprint
    privacy/          # payload 허용 스키마
    metrics/          # 비개인 상태·시간
  demo-benefits/      # 자체 로그인·DB·원본 폼
  demo-culture/       # React·정원·자체 DB
packages/
  contracts/
  core/{extractor,binder,verifier,fingerprint}/
  templates/
  design-tokens/
scripts/              # 승인 후 만들 doctor·test·demo 도구
runtime-control/      # 버전 관리 가능한 감독 소스, 고정 실행본은 .flecto/control
tests/
  unit/
  integration/
  e2e-fixture/
  e2e-live/
  holdout/
  ops/
```

테스트 경로는 `tests/unit`, `tests/integration`, `tests/e2e-fixture`, `tests/e2e-live`, `tests/holdout`, `tests/ops`다. source package에 provider 자격증명을 넣지 않는다. 실제 구현에서도 이 경로표와 공통 계약의 모듈 경계를 일치시킨다.

## 기본 통신

콘텐츠 스크립트 → 제한된 chrome.runtime 메시지 → 확장 background → 고정 loopback planner → Codex/캐시 → background → 같은 탭·문서·request → DOM 재검증 → UI.

planner는 `127.0.0.1`의 사전 확인한 포트에만 바인딩한다. 시작 예시는 4317, 원본 사이트는 4173/4174다. 점유 시 자기 테스트 프로세스인지 확인하며, 타인 프로세스를 강제 종료하지 않는다. 포트를 바꿨으면 manifest·설정·시험을 함께 갱신한다.

원본 사이트 A/B는 다른 origin이며 서로의 activeTab 승인을 물려주지 않는다. loopback의 다른 port를 쿠키 격리로 오해하지 않는다. 사이트별 쿠키 이름·DB를 분리하고 실제 계정 혼선을 검사한다.

## 네 가지 격리

1. **개발 / 제품 추론:** 코드 쓰기·개발 지시·작업 폴더를 제품 요청에 넘기지 않는다.
2. **제품 추론 / 원본 신청:** planner에는 submit endpoint와 원본 신청 DB 권한이 없다.
3. **QA / 시연:** 별도 DB·브라우저 프로필·포트 구성. QA reset이 심사위원의 상태를 바꾸지 않는다.
4. **분석 / 광고:** 광고 모듈에는 요청 상태와 노출 여부만 주고 페이지·사용자 정보는 주지 않는다.

## 권한과 로컬 서버

사용자 활성화 없는 페이지 수집 금지. activeTab/scripting/storage/webNavigation과 필요한 loopback host 권한의 최소 구성부터 실제 검증한다. background에서 sender.id, tab, frame, document, 활성 origin, request를 확인한다. 콘텐츠 스크립트를 임의 URL fetch 프록시로 만들지 않는다. [S07–S09]

loopback 서버도 아무 로컬 웹페이지가 호출해도 되는 서버가 아니다. Host·Origin·요청 토큰을 함께 검사한다. CORS만 인증으로 쓰지 않는다. 토큰은 trusted extension context에만 두고 content DOM·로그·프롬프트에 노출하지 않는다. 확장ID 변경·브라우저 프로필 초기화 시 연결 설정을 명확히 복구한다.

## 새로 구현해야 하는 명령의 역할

`doctor`: 실제 도구·포트·DB·모델 설정 상태 확인. 실제 모델 호출은 별도 probe로 분리.
`test:fixture`: 고정 응답으로 실제 확장·원본 동작 검사.
`test:live`: 실제 Codex로 동일 흐름 검사.
`demo:start`: 검증된 빌드와 별도 시연 DB 실행.
`demo:reset`: 합성 신청·예약만 초기화.
`release:pack`: 빌드 해시와 근거를 연결해 비밀정보 없는 결과물 작성.

지금 이 명령은 없다. 구현 후 실제 Command Registry에 확인된 명령으로 등록한다. HMR과 dev server에서만 되는 기능은 검증된 프로덕션 빌드와 구분한다.
