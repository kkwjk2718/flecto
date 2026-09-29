# FLECTO 운영 도구 — doctor · demo:reset · release:pack

이 문서는 실제로 구현된 명령만 설명한다. 명령 성공은 해당 도구가 동작했다는 뜻이지 제품 T01–T40이나 운영 OPER01–OPER15가 PASS라는 뜻이 아니다. 모든 명령은 저장소 루트에서 Node 24로 실행한다.

~~~sh
source .flecto/env.sh        # 프로젝트 Node 24 toolchain을 PATH에 추가
npm run doctor
~~~

## npm run doctor — 읽기 전용 점검

검사 항목: 실행 Node와 PATH Node가 v24인지, npm·git·zip, node_modules의 tsx/vite/vitest, dist/extension 파일을 다시 해시해 dist/extension-hashes.json과 비교, apps/demo-culture/dist 자산, .flecto/demo/private-config.json·connection.txt 권한(내용은 읽지 않음), Codex CLI 바이너리 존재(실행·로그인 확인 안 함), 포트 4317/4173/4174와 .flecto/demo/run.lock 소유자.

- FAIL이 하나라도 있으면 종료 코드 1. WARN은 0.
- 포트가 사용 중인데 살아 있는 DEMO lock이 없으면 FAIL. doctor는 어떤 프로세스도 종료·신호하지 않는다.
- 토큰·설정값·환경변수 값·auth 상태는 출력하지 않는다. --json으로 기계 판독 출력.
- 추적 파일이 커밋과 다르면 WARN과 함께 release 등급이 UNVERIFIED로 제한됨을 알린다.

## npm run demo:reset — 합성 원본 데이터만 초기화

~~~sh
npm run demo:start           # 다른 터미널에서 DEMO 실행 (.flecto/demo, 4317/4173/4174)
npm run demo:reset
~~~

- 대상은 고정: .flecto/demo와 127.0.0.1:4173(구매혜택), 4174(문화센터). DEMO에서 경로·포트 변경은 거부한다.
- 살아 있는 run.lock의 namespace가 DEMO여야 한다. 각 서비스에 private-config.json의 QA 토큰으로 GET /__qa/records를 먼저 보내 namespace가 일치하는지 모두 확인한 뒤에만 POST /__qa/reset을 보낸다. 하나라도 불일치·미응답이면 아무것도 초기화하지 않는다.
- 결과로 서비스별 레코드 수(before → after)만 출력한다. 로그인 세션, planner 캐시, Chrome 프로필, 파일은 건드리지 않는다.
- 연결 정보는 콘솔에 출력하지 않는다. 확장 옵션의 페어링 토큰은 .flecto/demo/connection.txt(0600)에서 직접 복사한다.

QA/테스트 전용 경로: --namespace QA --data-dir <OS 임시폴더 또는 .flecto/qa 하위> --benefits-port N --culture-port N. DEMO 포트와 .flecto/demo는 거부한다.

## npm run release:pack — 등급이 붙은 출고 후보 ZIP

~~~sh
npm run build
npm run release:pack                                   # 근거 없음 → UNVERIFIED
npm run release:pack -- --evidence path/to/report.json # 근거 보고서로 등급 산출
npm run release:pack -- --revoke <extensionBuildSha256> --reason "안전 결함 설명"
~~~

출력: .flecto/releases/flecto-<UTC시각>-<sha8>-<등급>.zip, 같은 이름의 .manifest.json, .zip.sha256. ZIP 안에는 RELEASE_MANIFEST.json이 있고 submitted는 항상 false다. ZIP 생성은 대회 제출이나 공개 배포가 아니다.

포함 규칙:

- git이 추적하는 파일 중 apps/ packages/ scripts/ tests/ spec/ ops/ docs/ evidence/ 하위와 package.json, package-lock.json, tsconfig.json, vitest.config.ts, .nvmrc, README.md, 01_DECISIONS.md만 포함한다.
- 빌드는 해시가 검증된 dist/extension 5개 파일과 dist/extension-hashes.json, apps/demo-culture/dist 자산만 포함한다. 해시 불일치·자산 누락이면 거부한다.
- node_modules, .flecto, .git, state, runtime, profiles, logs 디렉터리와 .env*, auth.json, credentials.json, private-config.json, connection.txt, run.lock, 키·인증서, DB/SQLite, .log/.jsonl, 원시 prompt 파일은 추적되어 있어도 제외하고 manifest의 policy.trackedDenied에 경로만 남긴다.
- 포함할 모든 파일(근거 보고서 포함)의 내용을 비밀 패턴과 로컬 .flecto/*/private-config.json 실제 값, 비밀처럼 보이는 환경변수 값으로 검사한다. 발견되면 ZIP을 만들지 않고 경로와 패턴 이름만 보고한다. 심볼릭 링크와 checkout 밖으로 향하는 파일은 거부한다.
- zip -T로 무결성을 검사하고 실제 목록이 manifest와 정확히 같은지 확인한다.

등급 규칙:

- --evidence가 없으면 UNVERIFIED / 운영 DOCS_ONLY.
- 보고서는 schema flecto.evidence.v1, artifact.extensionBuildSha256(현재 빌드 manifest의 build.extensionBuildSha256와 같아야 함), run.exitCode·startedAt·finishedAt, T01–T40과 OPER01–OPER15 전부의 results[ID].status, claimedGrade가 필요하다. PASS에는 kind(FIXTURE, LIVE_CODEX, FAULT_INJECTION, CACHE, REPLAY, MANUAL)가 필요하다.
- ID 누락, 다른 artifact, .only 실행, kind 없는 PASS는 보고서 전체를 거부해 UNVERIFIED로 둔다. SKIP·FLAKY·재시도된 PASS는 PASS로 세지 않는다. NOT_RUN은 허용되지만 PASS가 아니다.
- 산출 등급은 claimedGrade를 넘지 않는다. FIXTURE_ONLY는 exit 0·FAIL/SKIP/FLAKY 없음·T01 PASS, SINGLE_SITE_LIVE는 LIVE_CODEX PASS와 live.benefits.cold ≥ 3, LIMITED_LIVE는 추가로 live.culture.cold ≥ 3과 T01–T26 전부 PASS, FULL_LIVE는 T01–T40 전부 PASS와 capabilities.vision = PASS가 필요하다.
- 추적 파일이 커밋과 다르면 UNVERIFIED로 제한한다. revoked: true 보고서나 --revoke로 등록된 빌드는 패키지를 만들지 않는다(종료 코드 2).
- 운영 등급 MANAGED_TESTED는 OPER01–OPER15가 모두 FAULT_INJECTION PASS인 보고서에서만 나온다. 이 저장소의 단위 테스트 통과만으로는 부여하지 않는다.

## 통합 전 patch 검사와 제한 실행 (OPS01 보조 도구)

~~~sh
npx tsx scripts/ops/check-patch.ts --base <rev> --head <rev> --allow 'scripts/ops/**' --allow 'tests/unit/ops*.test.ts' \
  [--task OPS-01 --generation 1 --owner worker-a] [--record]
npx tsx scripts/ops/run-bounded.ts --deadline-sec 600 -- npx vitest run
~~~

- check-patch는 실제 git diff로 lease 범위 밖 경로, 보호 경로(package/lock, packages/contracts, spec, ops, state, archive, sources, scripts/system.ts, AGENTS.md 등), 테스트 파일 삭제, 새로 추가된 .only/.skip/.todo를 거부한다. git patch-id로 같은 내용의 patch가 .flecto/ops/integrated.json에 이미 있으면 중복으로 거부한다. --task를 주면 .flecto/ops/leases/<task>.json의 generation·owner·만료를 확인해 늦게 도착한 이전 세대 결과를 거부한다. --record일 때만 ledger에 쓴다. 종료 코드 0=OK, 1=거부, 2=사용법/실행 오류.
- run-bounded는 명령을 자기 프로세스 그룹에서 실행하고 기한이 지나거나 명령이 끝난 뒤 남은 하위 프로세스가 있으면 그 그룹에만 TERM→KILL을 보낸다. 다른 프로세스에는 신호를 보내지 않는다. 기한 초과 124, 시작 실패 125.
- lease 발급(issueLease)은 모듈 함수로만 제공한다. 이 도구들은 스케줄러·데몬·agent 플랫폼이 아니며, 실제 supervisor에서 OPER01–OPER15 고장 주입을 수행한 것이 아니므로 MANAGED_TESTED 근거가 아니다.

## 검사 범위

tests/unit/ops-*.test.ts는 임시 git 저장소와 실제 zip/unzip, 실제 소켓, scripts/system.ts로 띄운 실제 QA 서비스 프로세스를 사용한다. 이 테스트는 도구의 동작을 검증한다. 제품 T01–T40, 운영 OPER01–OPER15의 실행 결과로 집계하지 않는다.
