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
- 추적 파일이 커밋과 다르면 기존 doctor는 WARN을 출력한다. 현재 release는 아래 내용 해시로 검증하며 커밋 전후 자체는 등급을 낮추지 않는다.

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
- 빌드는 해시가 검증된 dist/extension 5개 파일과 dist/extension-hashes.json, dist/runtime-hashes.json, apps/demo-culture/dist 자산만 포함한다. 해시 불일치·자산 누락이면 거부한다.
- node_modules, .flecto, .git, state, runtime, profiles, logs 디렉터리와 .env*, auth.json, credentials.json, private-config.json, connection.txt, run.lock, 키·인증서, DB/SQLite, .log/.jsonl, 원시 prompt 파일은 추적되어 있어도 제외하고 manifest의 policy.trackedDenied에 경로만 남긴다.
- 포함할 모든 파일(근거 보고서 포함)의 내용을 비밀 패턴과 로컬 .flecto/*/private-config.json 실제 값, 비밀처럼 보이는 환경변수 값으로 검사한다. 발견되면 ZIP을 만들지 않고 경로와 패턴 이름만 보고한다. 심볼릭 링크와 checkout 밖으로 향하는 파일은 거부한다.
- zip -T로 무결성을 검사하고 실제 목록이 manifest와 정확히 같은지 확인한다.

등급 규칙:

- --evidence가 없으면 UNVERIFIED / 운영 DOCS_ONLY.
- 보고서는 schema flecto.evidence.v1, artifact.extensionBuildSha256, artifact.runtimeBuildSha256, artifact.runtimeInputSha256(현재 검증된 빌드와 모두 같아야 함), run.exitCode·startedAt·finishedAt, T01–T40과 OPER01–OPER15 전부의 results[ID].status, claimedGrade가 필요하다. PASS에는 kind(FIXTURE, LIVE_CODEX, FAULT_INJECTION, CACHE, REPLAY, MANUAL)가 필요하다.
- ID 누락, 다른 artifact, .only 실행, kind 없는 PASS는 보고서 전체를 거부해 UNVERIFIED로 둔다. SKIP·FLAKY·재시도된 PASS는 PASS로 세지 않는다. NOT_RUN은 허용되지만 PASS가 아니다.
- 산출 등급은 claimedGrade를 넘지 않는다. FIXTURE_ONLY는 exit 0·FAIL/SKIP/FLAKY 없음·T01 PASS, SINGLE_SITE_LIVE는 LIVE_CODEX PASS와 live.benefits.cold ≥ 3, LIMITED_LIVE는 추가로 live.culture.cold ≥ 3과 T01–T26 전부 PASS, FULL_LIVE는 T01–T40 전부 PASS와 capabilities.vision = PASS가 필요하다.
- 서버·프롬프트·소스·gate·테스트·lock 또는 생성 산출물이 dist/runtime-hashes.json과 다르면 패키징을 거부한다. 확장 해시만 있는 과거 증거는 UNVERIFIED다. 동일 바이트를 나중에 커밋해도 증거는 유지된다. revoked: true 보고서나 --revoke로 등록된 빌드는 패키지를 만들지 않는다(종료 코드 2).
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

## 런타임 해시 통합 — 리드가 build.mjs에 적용할 변경

이 패치는 루트 package/lock과 scripts/build.mjs를 변경하지 않는다. 리드는 기존 빌드에 다음을 연결해야 한다. 연결 전 빌드는 runtime manifest가 없으므로 release가 거부한다. 기존 빌드에 사후 해시만 덧씌우지 말고 전체 빌드를 다시 수행한다.

```js
import { tsImport } from 'tsx/esm/api';
const { captureRuntimeInputs, writeRuntimeManifest } =
  await tsImport('./ops/runtime-hash.ts', import.meta.url);
// root 결정 후, 첫 Vite build/산출물 변경 전에:
const runtimeInputs = await captureRuntimeInputs(root);
// 기존 extension + culture 빌드가 모두 성공한 직후:
await writeRuntimeManifest(root, runtimeInputs);
```

`dist/runtime-hashes.json`은 `flecto.runtime.v1`이며 정렬된 경로→SHA-256 입력/산출물 목록과 `runtimeInputSha256`, `runtimeBuildSha256`를 가진다. Git SHA·시각·절대 경로를 넣지 않아 커밋과 무관하게 내용으로 재현된다. Node 버전·OS·아키텍처도 묶는다. inputs는 apps/packages/scripts/tests의 파일(README/STATUS/NEXT_ACTION/기존 handoff 문서 제외), spec/ops의 gate 문서, package/lock/TS/검사 설정이다. 코드에 있는 planner prompt와 모델 설정도 포함한다. 비밀 파일·DB·의존성·생성 상태·진행 문서는 읽거나 해시하지 않는다. 외부 런타임의 모델/버전/안전한 설정은 리드가 `apps/planner/` 아래 공개 가능한 고정 JSON으로 기록하고 실제 실행 시 동일한 값인지 검증해야 한다. 비밀 환경변수 값이나 인증 파일은 여기에 넣지 않는다.

빌드 전후 입력 변경은 stamp를 거부한다. release는 입력/출력 전체를 재계산하고, ZIP에 실제 포함한 소스 바이트까지 같은지 확인한다. 새 런타임 입력은 빌드 시 발견하지만 출고 전 `git add`가 필요하다. staged/unstaged 수정은 내용이 같으면 허용한다. 원래의 PASS/FAIL/SKIP/FLAKY·LIVE/vision·revocation 등급 규칙은 그대로다.

OPS-EVIDENCE 체크포인트: 서버/프롬프트 변이, 수정 작업 트리→검사→후속 커밋, 해시 누락/불일치 단위 검증. 다음 단계는 리드의 build.mjs 연결 후 전체 재빌드와 QA 근거 생성이다. 브라우저·서버·제품 수용 게이트는 이 작업자의 실행 범위 밖이다. 공유 state/NEXT_ACTION.md 갱신은 리드가 이 체크포인트를 옮긴다.

## QA JSON 보고서와 실제 실행 receipt 생성

`qa-report.ts`는 실행 이전의 검증된 artifact, 실제 프로세스 종료값, 시작/종료 시각, JSON 보고서의 SHA-256을 `flecto.qa-run.v1` receipt로 기록한다. Node/runner 버전·정확한 테스트 인자·공개 가능한 FLECTO 모드/모델/화면/주입 설정의 invocation도 해시로 묶는다. 비밀·인증 환경변수는 기록하지 않는다. 실행 후 입력/산출물을 재검증하며 변하면 해당 receipt를 재사용할 수 없다. 나중에 현재 빌드를 해시해 오래된 JSON에 붙이는 기능은 없다.

통합 리드용 순서(이 작업자는 제품 build/브라우저/LIVE 실행하지 않음):

```sh
node --version # Node 24.x 환경에서 실행
# 위 build.mjs 연결과 모든 구현/테스트 소스 통합 후:
npm run build
npx tsx scripts/qa-report.ts run --runner vitest --id unit --out .flecto/qa/unit-01 -- --maxWorkers=2
npx tsx scripts/qa-report.ts run --runner playwright --id fixture --out .flecto/qa/fixture-01 -- --config=playwright.config.ts
npx tsx scripts/qa-report.ts run --runner playwright --id live --out .flecto/qa/live-01 -- --config=playwright.live.config.ts
npx tsx scripts/qa-report.ts emit --run .flecto/qa/unit-01.receipt.json --run .flecto/qa/fixture-01.receipt.json --run .flecto/qa/live-01.receipt.json --mapping .flecto/qa/assertion-map.json --claim FULL_LIVE --out .flecto/qa/evidence-01.json
npm run release:pack -- --evidence .flecto/qa/evidence-01.json
```

존재하는 출력 경로는 덮어쓰지 않는다. 재실행은 새 번호를 쓰고 실패 기록도 보존한다. 실패한 run은 receipt를 남기며 실제 비영 종료값을 반환하므로 `&&`로 이어서 실패 기록 생성을 건너뛰지 않는다. 없는 LIVE config를 만들어 놓았다고 가정하지 말고 리드의 최신 파일을 통합한 뒤 실행한다. Playwright의 `repeatEach: 3`은 config에 두고, 매핑의 해당 assertion에 `instances: 3`을 지정한다. 같은 테스트의 세 실행이 모두 PASS여야 한다.

Vitest의 기본 JSON은 retry 진단이 없으므로 이 wrapper의 추가 reporter가 필요하다. 기본 JSON만 주면 성공 제목이어도 NOT_RUN이다. FAIL·SKIP·재시도 FLAKY는 보존하며 expected-failure 테스트는 수용 PASS로 바꾸지 않는다. 브라우저 JSON은 suite/프로젝트/실행 결과/선택적 test.step을 읽는다. 같은 이름이 여러 번 나오는데 instances가 맞지 않으면 NOT_RUN이다. 보고서가 없거나 미완성인 실행은 성공으로 집계하지 않는다.

`--mapping`을 생략해도 55개 ID를 모두 NOT_RUN으로 출력한다. 제목에 T01/OPER01 등이 있어도 자동 매핑하지 않는다. 매핑은 **리드/QA가 원본 gate의 모든 요구 assertion을 실제 테스트 본문과 대조한 결과**다. sourceSha256은 해당 파일 전체 SHA-256, assertion은 실제 본문의 정확한 assertion 코드 조각이다. 요구사항 이름만 바꾸거나 제목만 보고 coverage를 complete로 올리지 않는다. 같은 assertion을 여러 요구사항에 붙일 때도 실제로 모두 입증하는지 검토한다.

최소 매핑 형식(아래는 작성용 예시이며 제품 PASS 근거가 아님):

```json
{
  "schema": "flecto.qa-map.v1",
  "gateFile": "ops/02_GATES_AND_TESTS.md",
  "gateSha256": "<gate 파일 전체 sha256>",
  "checks": {
    "T01": {
      "kind": "FIXTURE",
      "coverage": "partial",
      "requirements": ["원본 저장값 일치", "완료 화면 일치"],
      "assertions": [{
        "requirement": "원본 저장값 일치",
        "run": "fixture",
        "file": "tests/e2e-fixture/benefits.spec.ts",
        "sourceSha256": "<테스트 파일 전체 sha256>",
        "titlePath": ["<describe 이름이 있으면 앞에>", "<정확한 테스트 제목>"],
        "assertion": "<실제로 실행되는 assertion 코드 조각>",
        "project": "",
        "instances": 1
      }]
    }
  }
}
```

Playwright titlePath에는 파일 suite 이름을 제외한 describe/test 제목만 넣는다. Vitest는 JSON의 ancestorTitles와 title을 그대로 쓴다. Playwright 이름 있는 step을 요구하려면 `step: "상위 step > 하위 step"`을 추가한다. 모든 requirements에 assertion이 매핑되고 실제 결과가 PASS이며 coverage=complete여야 해당 ID가 PASS다. 하나라도 FAIL이면 FAIL, 재시도는 FLAKY, skip은 SKIP이다. 보고서/gate/test 소스 해시가 달라지면 emitter 자체가 거부된다.

### LIVE attachment API와 cold 집계

리드의 fixture/LIVE helper는 다음 API를 사용할 수 있다. 첫 snapshot은 서비스/브라우저 실행 전에 얻고 종료 때 다시 확인한다. wrapper의 전체 run 재검증도 함께 사용한다.

```ts
import { readVerifiedArtifact } from '../../scripts/qa-report';
const before = await readVerifiedArtifact(process.cwd());
// { extensionBuildSha256, runtimeBuildSha256, runtimeInputSha256 }
// ... 실제 테스트 실행 ...
expect(await readVerifiedArtifact(process.cwd())).toEqual(before);
await testInfo.attach('artifact', {
  contentType: 'application/json', body: JSON.stringify(before),
});
```

`live-source-evidence`는 JSON body attachment를 사용한다(파일 경로 attachment는 이 emitter가 읽지 않음). artifact를 payload 내부에 넣거나 같은 결과의 `artifact` attachment로 붙인다. 지원되는 형식:

```json
{
  "requestedModel": "gpt-6-luna",
  "timings": { "source": "benefits", "mode": "LIVE_CODEX", "controlsReadyMs": 2500 },
  "cache": { "providerCalls": 1, "misses": 1, "exactHits": 0, "compatibleHits": 0 },
  "outcome": { "sourceDatabaseCount": 1, "insertionCount": 1 }
}
```

수치는 형식 예시다. source는 benefits/culture, timings는 같은 source의 배열도 허용하며 전부 실제 LIVE_CODEX여야 한다. culture는 insertionCount를 요구하지 않는다. `reportedModel`을 넣는다면 requestedModel과 같아야 한다. 매핑의 LIVE_CODEX gate에는 `requestedModel: "gpt-6-luna"`를 명시한다. 캐시 진단은 해당 독립 실행의 실제 값으로 채운다. providerCalls와 misses가 양의 정수이고 exact/compatible hit가 모두 0일 때만 cold다. warm은 LIVE 자체가 입증되어도 cold 횟수에 넣지 않는다. 다른 빌드·다른 모델·FIXTURE/CACHE 모드·원본 결과 누락은 LIVE PASS가 아니다.

세 번 반복의 각 결과를 고유하게 집계하고 여러 assertion의 참조는 중복 집계하지 않는다. 여섯 cold 결과가 있다는 이유만으로 다른 T/OPER 항목이나 vision positive를 PASS로 채우지 않는다. 이 emitter는 positive vision과 수동 Chrome/IME를 NOT_RUN으로 유지하므로 자동 FULL_LIVE 승격을 만들지 않는다. 별도 positive assertion 근거가 추가되기 전에는 그 한계를 공개한다.

최종 OPS-EVIDENCE 전달: `5098dbd`의 빌드/출고 해시 패치와 후속 QA emitter 패치를 순서대로 통합한다. 최신 main의 새 LIVE spec/config도 자동으로 런타임 입력 해시에 포함된다. helper 변경 후 빌드를 다시 실행하고 최신 소스 해시에 맞는 assertion map을 작성한다. 이 작업의 결과는 PATCH_READY이며 실제 제품 T01–T40/OPER01–OPER15 전체 PASS 또는 출고 완료가 아니다.
