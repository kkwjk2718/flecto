# 함께 작업하기

현재는 제품 사양·구현 계획과 저장소 협업 기반이 준비된 상태다. 앱·서버·제품 검사는 아직 구현 전이다. `npm run check`는 저장소 문서와 보존 원문을 검사하며 제품 검사를 대신하지 않는다.

## 처음 참여할 때

1. [README](README.md), [구현 계획](IMPLEMENTATION_PLAN.md), [작업 현황](state/STATUS.md)을 읽는다.
2. [Issues](https://github.com/kkwjk2718/flecto/issues)에서 맡을 티켓과 수정 경로를 정한다. 선행 계약이 필요한 티켓은 먼저 기다린다.
3. 작업 시작 전에 이슈에 담당자와 수정 경로를 남긴다. 같은 파일을 동시에 고치지 않는다.
4. 에이전트도 함께 쓴다면 [AGENTS.md](AGENTS.md)를 읽히고, 해당 티켓·계약·관련 명세만 추가한다. 개인 로그인·API 키를 다른 팀원에게 넘기지 않는다.

## 개발 환경

공통 기준은 `.nvmrc`의 Node.js 24와 npm이다. Node 24는 현재 LTS다. [Node 공식 릴리스](https://nodejs.org/en/about/previous-releases)

이미 nvm을 사용 중이면 `nvm install` 후 `nvm use`를 실행한다. nvm은 필수가 아니며 다른 방식으로 같은 major 버전을 사용해도 된다. 초기 저장소는 외부 npm 의존성이 없다.

```bash
git clone https://github.com/kkwjk2718/flecto.git
cd flecto
npm ci --ignore-scripts
npm run check
```

아직 `dev`, `build`, `test:fixture`, `demo:start`는 없다. C01 이후 실제로 구현·검증한 명령만 README에 추가한다. 미구현 명령을 성공하는 빈 스크립트로 만들지 않는다.

## 브랜치와 PR

`main`은 공유 기준이다. 변경은 이슈 하나와 짧은 작업 브랜치 하나로 묶고 PR로 통합한다.

```bash
git switch main
git pull --ff-only
git switch -c feat/c01-contracts
# 파일 수정
npm run check
git add <수정한-파일>
git commit -m "feat(contracts): define public snapshot schema"
git push -u origin feat/c01-contracts
```

문서는 `docs/...`, 수정은 `fix/...`, 환경은 `chore/...`도 사용할 수 있다. 커밋에는 비밀번호·토큰·실제 입력·브라우저 프로필·개인 파일 경로를 넣지 않는다. 필요한 로컬 실행 자료는 무시되는 `.flecto/` 아래에 둔다.

PR에는 해결 문제, 변경 경로, 실제 검사 결과와 미실행 항목을 적는다. UI 변경은 실제 화면 캡처·한글 입력·확대·포커스 결과를 덧붙인다. 다른 팀원의 검토 뒤 squash merge하고 작업 브랜치를 삭제한다. 이 문서의 협업 규칙과 GitHub에서 강제되는 브랜치 보호 설정은 별개이며, 실제 적용 상태는 [저장소 설정 기록](state/REPOSITORY_SETUP.md)에 적는다.

공개 저장소는 누구나 읽을 수 있지만 push 권한은 자동으로 생기지 않는다. 초대받은 팀원은 초대를 수락하고 브랜치를 push한다. 초대 전에는 fork와 PR도 사용할 수 있다.

## 파일 소유권과 통합

| 범위 | 담당 방식 |
|---|---|
| root package/lock/config, `packages/contracts` | 리드가 통합. 계약 변경을 먼저 공유 |
| `packages/core`, extension background/content, planner | Astra 기반 핵심 구현, 티켓별 경로 분리 |
| design-tokens/templates, extension UI | Claude Opus 5.5 기반 UI/UX, 확정 계약 사용 |
| demo-benefits/demo-culture | 원본 서비스 담당. 제품에 정답 메타데이터·DB 권한 제공 금지 |
| `tests`와 gate 정의 | QA와 리드가 기준 관리. 구현에 맞춰 요구조건 약화 금지 |
| presentation/marketing/business/evidence | 발표·홍보 담당. 검증 빌드 근거가 있는 문구만 완료형 사용 |

모델은 개발 도구의 역할 배분이다. 실제 이슈 담당자와 최종 통합 담당자는 팀원이 정한다. 각자의 결제·로그인·OS 권한을 공유하거나 다른 팀원에게 자동 적용하지 않는다.

## 처음 할 작업

C01 계약/빌드 → D01 원본 서비스·U01 템플릿·Q01 검사 등록 → 코어 연결 → G0 실제 원본 저장 순서다. [전체 작업표](ops/01_TASK_GRAPH.md)와 [구현 계획](IMPLEMENTATION_PLAN.md)에 선행 조건과 완료 기준이 있다.

원본 사이트 첫 연결은 실제 제품 AI 인증이나 별도 감독자 완성을 기다리지 않는다. fixture/LIVE/cache를 구분한다. `archive/`는 보관 자료이고 현재 실행 지시가 아니다. 원문 해시는 보존한다.

## 공개 자료와 라이선스

이 저장소의 공개는 오픈소스 라이선스 부여를 뜻하지 않는다. 라이선스는 팀 결정 전까지 미지정이며 npm 배포도 비활성이다. 실제 서비스 배포·대회 제출·외부 계정 작업은 해당 요청과 근거를 별도로 확인한다.
