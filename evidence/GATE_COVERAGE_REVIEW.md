# Gate coverage review — source review only

**PATCH_READY. No tests, browser, build, provider, QA emitter or release command was run by this worker.** This is a reviewed mapping for future receipts, not a results report. `complete` describes assertion coverage; it is never an execution PASS.

- Owned checkout: `/Users/kkwjk2718/.codex/worktrees/flecto-options/kakao-ralphthon-main`.
- Reviewed HEAD: `f7af2f1346f15cd7687c06ac78a28215bad0e6a6`; clean on entry.
- Review began 2026-09-29 14:23 KST; checkpoint review 14:33 KST. Run settings template says PREPARE/UNSELECTED, while historical state says CONTEST/SESSION_LOOP. This source-only assignment changes neither and does not extend any deadline.
- Scope: only this file and `evidence/assertion-map.json`. No tests/spec/package/lock/runtime/state changes. Lead owns the final candidate and actual execution.
- Exact authority: `AGENTS.md`, `01_DECISIONS.md`, `ops/02_GATES_AND_TESTS.md`, `scripts/qa-report.ts`, `docs/OPERATIONS.md`. Prior state counts are not current acceptance results.

## Result of the assertion review

All **55 IDs** are explicit: **23 complete**, **32 partial**, **274 source-bound assertion references across 27 files**. Complete IDs:

T01, T02, T03, T05, T06, T07, T08, T09, T10, T11, T12, T13, T14, T15, T16, T17, T22, T23, T28, T31, T32, T35, T39.

All 15 OPER entries remain partial. Current orchestration is SESSION_LOOP; no MANAGED_TESTED claim follows from these tool/component tests. OPER03/07/13/15 explicitly label adjacent supporting controls; their original operational scenarios have no mapped proof. These supporting clauses are not replacements for the original gate conditions.

T27 and T30 remain partial despite useful regressions: zero POST does not directly prove zero source click/submit invocation; strict schema/executable-output checks do not replace an explicit arbitrary-URL action rejection case. T04 remains partial pending the Korean draft fix retest; T24's automated mapping remains partial even after the later lead-reported native 200% check below, because manual evidence is not ingested. T25 distinguishes worker restart from browser/profile restart. T18/T33 distinguish a new epoch for the same task from a genuinely different selected goal.

## Mapping and receipt contract

- Schema `flecto.qa-map.v1`; gate file SHA-256 `0b0c6d288257f1202c03588107a7ff6c0c16fe83cf70a7330637083c34394f44`.
- Only future run IDs `unit-final`, `fixture-final`, `live-final`. The lead's wrapper must use these exact IDs; output filenames can be unique. No old report paths, receipt hashes, reported PASS totals or artifact hashes are embedded in the JSON mapping.
- Each sourceSha256 is the whole current test file. Every assertion string was checked inside the selected test callback body. Helper implementations and invocation sites were also read, including source oracle access, worker lifecycle assertions, plan proxy, privacy sink audit and artifact attachment.
- Vitest titlePath is describe ancestry plus final title, without the filename. Playwright excludes its top file suite; its unnamed project is `""`. Parameterized names were expanded from literal source parameters, not guessed from T-number prefixes.
- Every LIVE reference uses `instances: 3`, matching `playwright.live.config.ts repeatEach: 3`, and requestedModel `gpt-6-luna`. T02 holds culture LIVE proof; T21 holds benefits cold/warm proof but remains partial for latest options. The emitter deduplicates repeated references to each physical result.
- T31 has two HTTP cases whose `%j` name is `{}` (undefined origin and undefined authorization). That exact title deliberately uses `instances: 2`; both actual instances must pass. Other non-LIVE references require one instance.
- Mixed unit/integration/installed-extension evidence is listed explicitly below. A gate's kind is the evidence scenario, not a claim that every component is an actual browser or remote-provider test. LIVE gates contain only LIVE references because the emitter demands a LIVE attachment for every mapped assertion.
- Final result resolution remains the emitter's responsibility: missing receipt/test/assertion or partial coverage -> NOT_RUN; FAIL/FLAKY/SKIP are retained. Even a complete mapping cannot turn a title, an authored test or an old run into PASS.
- This map does not ingest MANUAL01/02/03 or external manual vision JSON. `capabilities.vision` remains NOT_RUN in the current emitter. No automatic FULL_LIVE promotion.

The lead reports approximately 441 prior unit successes, a prior fixture run with 31/35 successful cases and independently diagnosed helper/UI-copy defects, and prior LIVE original-DB successes. Those are contextual reports only, not imported execution evidence. Fixed tests and the new worker-restart cases still need the final candidate run; retain earlier failed receipts rather than replacing them.

## Human review of all original gates

The original condition/pass wording is reproduced for comparison. Source locations are starting test declaration lines; exact titles, snippets and full-file hashes are in the JSON. Gaps are deliberately left as unmapped requirements. No row below asserts a current run status.

| ID | Reviewed coverage / scenario | Original condition and acceptance criterion | Source test locations | Body-level finding / remaining gap |
|---|---|---|---|---|
| T01 | complete / FIXTURE | 구매 신청 정상 흐름: 원본 저장값·완료 화면 일치 | `tests/e2e-fixture/benefits.spec.ts:3`<br>`tests/e2e-fixture/regressions.spec.ts:44` | Normal installed-extension flow checks submitted values; rapid-input regression compares the actual source receipt number to the persisted row. |
| T02 | complete / LIVE_CODEX | 문화센터 정상 흐름: 선택 강좌·시간과 원본 결과 일치 | `tests/e2e-live/product.spec.ts:85` | LIVE culture selects yoga/10:00, asserts original select and exact DB course/time. Three successful repeated instances and matching LIVE attachments required. |
| T03 | complete / FIXTURE | 필수 항목 비움: 제출 안 됨, 해당 오류 안내 | `tests/e2e-fixture/safety.spec.ts:4` | Empty order/date and unchecked required consent exercised before any source POST. |
| T04 | partial / FIXTURE | 한국어 조합/붙여넣기: 문자 손실·커서 점프 없음 | `tests/e2e-fixture/regressions.spec.ts:270` | Synthetic DOM events/insertText only. Actual OS IME/clipboard MANUAL02 needs separate evidence.<br>Unmapped: 실제 Mac 한국어 입력기 및 OS 붙여넣기에서 문자 손실·커서 점프 없음 |
| T05 | complete / FIXTURE | React controlled field: 다음 렌더·제출 후에도 값 유지 | `tests/unit/core.test.ts:162`<br>`tests/e2e-fixture/culture.spec.ts:3` | Real React setter unit checks rerender/submit state; installed culture E2E checks input and DB. |
| T06 | complete / FIXTURE | 체크박스 동의: 사용자 선택 없이 변경 안 됨 | `tests/e2e-fixture/safety.spec.ts:4` | Unchecked source/overlay persists after local continuation; checked only after explicit consent click. |
| T07 | complete / FAULT_INJECTION | 중복 클릭/Enter 연타: 테스트 서버 결과 한 건 | `tests/e2e-fixture/regressions.spec.ts:44` | Both pointer-first/keyboard-first real input with delayed source response and bounded replay observation. |
| T08 | complete / FAULT_INJECTION | 응답 유실/오류: 거짓 성공·자동 재제출 없음 | `tests/e2e-fixture/safety.spec.ts:50` | Separate rejection and discarded real 303 cases; 1.2-second bounded replay observation. Later explicit history navigation is recovery. |
| T09 | complete / FIXTURE | 전체 페이지 이동: 재주입·상태 복구, 옛 ref 폐기 | `tests/e2e-fixture/benefits.spec.ts:3`<br>`tests/unit/background.test.ts:366` | Installed extension review/receipt navigation plus broker old-document rejection/new-instance acceptance. |
| T10 | complete / FIXTURE | SPA 이동/뒤로가기: 올바른 문서·단계 연결 | `tests/e2e-fixture/variants.spec.ts:85` | Real history URLs, step-specific controls, retained source time and distinct documentInstanceIds. |
| T11 | complete / FAULT_INJECTION | service worker 재시작: 비개인 상태 복구, 이전 동작 자동 재실행 없음 | `tests/e2e-fixture/worker-restart.spec.ts:147` | Two authored CDP stopWorker cases call helper requiring old-worker close/new-worker observation. NOT_RUN here; final execution must validate CDP support. Not a full browser/profile restart. |
| T12 | complete / FIXTURE | 필수 입력 추가: 오래된 계획 거부·재분석 | `tests/e2e-fixture/variants.spec.ts:4` | STALE_DOCUMENT/no write, second planner exchange, new required field and its error. |
| T13 | complete / FIXTURE | 동일 라벨 버튼 복수: 다른 form 버튼을 누르지 않음 | `tests/unit/core.test.ts:81`<br>`tests/e2e-fixture/variants.spec.ts:69` | Duplicate-form E2E exact POST endpoints/row plus verifier rejection of mixed forms. |
| T14 | complete / CACHE | 동의 원문 수정: 기존 notice cache 무효화 | `tests/e2e-fixture/variants.spec.ts:24`<br>`tests/integration/planner-security.test.ts:185` | DOM mutation plus real SQLite cache notice-change test; FIXTURE response is a cache miss, not LIVE inference. |
| T15 | complete / FAULT_INJECTION | 2.9초 완료: 광고 없음, 바로 READY | `tests/e2e-fixture/performance.spec.ts:27` | 2900ms transport hold, observed READY under 3000ms and editable input. Does not claim LIVE latency or an already-armed primary button. |
| T16 | complete / FAULT_INJECTION | 3.1초 이후 완료: 준비 중만 광고, 완료 즉시 종료 | `tests/e2e-fixture/performance.spec.ts:54` | 3600ms delayed response exercises the after-3.1s case; sampled ad states must all be PREPARING. This is not an exact 3100ms boundary measurement. |
| T17 | complete / FAULT_INJECTION | 10초 초과/11초 늦은 응답: 원본 선택 제공, 늦은 UI 적용 없음 | `tests/e2e-fixture/performance.spec.ts:81` | Actual held-response fixture with 9900–10500ms measurement tolerance and late-result release observation. |
| T18 | partial / FAULT_INJECTION | 사용자 취소·목표 변경·탭 변경: 이전 결과 적용·다른 탭 캡처 없음 | `tests/e2e-fixture/performance.spec.ts:101`<br>`tests/e2e-fixture/regressions.spec.ts:147` | Cancel/retry uses the same goal with a new epoch; tab test covers metadata binding, not an actual image capture race or semantically different goal.<br>Unmapped: 실제 다른 목표 선택과 캡처 경합에서도 다른 탭 캡처 안 됨 |
| T19 | partial / FAULT_INJECTION | 광고 누락·닫기: 준비 기능에 영향 없음 | `tests/e2e-fixture/performance.spec.ts:70` | Dismiss path covered. No deliberate absent/failed sponsor delivery end-to-end injection.<br>Unmapped: 광고 자체가 누락·실패한 상태에서도 동일한 준비 기능 유지 |
| T20 | partial / FIXTURE | 개인정보 sentinel: 프롬프트·DB·로그·광고에 유출 없음 | `tests/e2e-fixture/safety.spec.ts:75` | Body invokes assertPrivateSinksClean (transport/logs/planner bytes), but this map anchors direct storage assertions; active sponsor privacy path is absent. Original service DB intentionally stores user input and is not the prohibited planner/cache DB.<br>Unmapped: prompt·planner DB·로그 전체 sentinel 비유출; 광고가 실제 표시되는 동안에도 sentinel 비유출 |
| T21 | partial / LIVE_CODEX | 빈 캐시/따뜻한 캐시: 서로 구분된 측정, 최신 선택지 반영 | `tests/e2e-live/product.spec.ts:56` | LIVE benefits attaches separate cold/warm timing samples and checks no extra provider call on warm hit; latest-choice LIVE assertion is absent. Fixture capacity/cache cases exist under T37 and cannot become LIVE proofs. Both sites cold totals derive only from final attachments (T02/T21).<br>Unmapped: 따뜻한 cache의 최신 선택지 반영 |
| T22 | complete / FAULT_INJECTION | 현재 화면 AI 계획 경로 차단: 입력·수정·제출에 추가 계획 요청 없음 | `tests/e2e-fixture/safety.spec.ts:95` | Only plan endpoint is blocked after READY; correction followed by real review/submit and oracle checks. Not an offline-product claim. |
| T23 | complete / FIXTURE | 미지원 iframe/CAPTCHA: 우회 안 함, 원본에서 계속 | `tests/e2e-fixture/regressions.spec.ts:77` | Both installed-extension variants leave the obstruction untouched and original input editable; synthetic local CAPTCHA, no real CAPTCHA interaction. |
| T24 | partial / FIXTURE | Keyboard·Escape·200% 확대: 포커스·입력·원본 복귀 사용 가능 | `tests/e2e-fixture/regressions.spec.ts:218` | 720x550 CSS viewport is reflow only, not browser zoom. Actual MANUAL03 remains external/unrouted.<br>Unmapped: 실제 Google Chrome 200% 확대·설정·포커스 사용 가능 |
| T25 | partial / CACHE | 재시작: 설정·구조 캐시만 유지, 타인 입력 복구 없음 | `tests/e2e-fixture/worker-restart.spec.ts:94` | CDP worker stop is not Chrome/profile restart. New authored worker test requires final execution.<br>Unmapped: 브라우저·프로필 전체 재시작에서도 타인 입력 복원 없음 |
| T26 | partial / FIXTURE | holdout 변형: 숨은 정답 없이 새 구조와 오류에 대응 | `tests/e2e-fixture/variants.spec.ts:4` | Known required-field regression covers a mutation, not a fresh blind holdout campaign. No title-based holdout promotion.<br>Unmapped: 디버깅에 노출되지 않은 새 holdout에서 숨은 정답 없이 전체 대응 |
| T27 | partial / FIXTURE | LOCAL_NEXT와 source action 분리: 로컬 단계 이동이 원본 click/submit을 호출하지 않음 | `tests/unit/ui-templates.test.ts:216`<br>`tests/e2e-fixture/safety.spec.ts:4` | UI action list and E2E zero POST support separation; no direct source click/submit spy spans controller local progression. A click need not issue a POST, so do not equate them.<br>Unmapped: controller에서 원본 click/submit 호출 자체가 없음을 직접 검증 |
| T28 | complete / FIXTURE | 검토 후 값·중요조건 변경: 이전 review token 무효, 최신 실제값으로 다시 확인 | `tests/unit/core.test.ts:237`<br>`tests/e2e-fixture/variants.spec.ts:24` | Five explicit token revisions plus browser conflict refresh and changed notice rendered after reanalysis. |
| T29 | partial / FIXTURE | QA oracle 격리: extension/planner가 QA token·원본 DB·oracle에 접근 못 함 | `tests/integration/planner-security.test.ts:109` | Public-snapshot/provider boundary assertion only; QA helper owns tokens legitimately. Absence of a sentinel is not process/OS inability to access source DB.<br>Unmapped: extension/planner의 QA token·원본 DB·oracle 접근 불가를 실제 권한 경계에서 확인 |
| T30 | partial / FAULT_INJECTION | 모델 악성/잘못된 출력: unknown refs·HTML/JS·임의URL·필수누락 거부, plain text 렌더 | `tests/integration/planner-security.test.ts:259`<br>`tests/unit/contracts.test.ts:17`<br>`tests/unit/ui-templates.test.ts:88` | Schema extra-code/phantom-ref cases and literal HTML rendering are asserted. No explicit model-supplied arbitrary URL action case was found; strict-schema reasoning alone is not a direct assertion.<br>Unmapped: 임의 URL을 포함한 모델 action 출력의 직접 거부 사례 |
| T31 | complete / FAULT_INJECTION | loopback 접근·sender 위조: 미승인 Host/Origin/token/tab/document 요청 거부 | `tests/integration/planner-security.test.ts:69`<br>`tests/unit/background.test.ts:128` | HTTP injection tests use real Fastify and SQLite; broker sender tests use mocked Chrome identity, including actual-current-frame comparison. Two undefined-header variants render the same %j title {} and require instances=2. |
| T32 | complete / FAULT_INJECTION | FLECTO·광고·타이머 mutation: 자체 렌더가 snapshot 재추론 루프를 만들지 않음 | `tests/e2e-fixture/regressions.spec.ts:111` | Real delayed preparation, sponsor display/removal, font changes and source-looking host child mutations; 800ms tick/debounce observation, same single request. |
| T33 | partial / FAULT_INJECTION | 같은 요청 중복·목표 변경: singleflight와 새 epoch, 예전 결과를 새목표에 적용하지 않음 | `tests/integration/planner-security.test.ts:196`<br>`tests/e2e-fixture/performance.spec.ts:101` | Server duplicate/epoch tests plus installed-extension cancel/retry; browser retry selects same task, so different-goal scenario remains unproven.<br>Unmapped: 실제 서로 다른 목표를 선택하는 경합에서도 새 목표 유지 |
| T34 | partial / FIXTURE | 시각 보완 탭·가림·기한: 같은 합성 document만 가려 전송; 실패 시 전송 안 함; 시계 초기화 없음 | `tests/e2e-fixture/vision-capture.spec.ts:162`<br>`tests/unit/vision-transport.test.ts:183`<br>`tests/integration/vision-controller.test.ts:130` | Automated pixel fixture and stubbed integration only. Separate manual run-YSSUpl checkpoint now confirms bounded synthetic VISION/LIVE_CODEX upload, exact-byte storage audit and unchanged artifact; native rendering/source-value preservation are lead-reported. Checkpoint t34=LEAD_REVIEW_REQUIRED. Unsupported by emitter; automated mapping stays partial, vision NOT_RUN, no FULL promotion.<br>Unmapped: 실제 Chrome 허용 합성 document의 capture→remote model positive 경로 |
| T35 | complete / FAULT_INJECTION | fixture/LIVE/provider 실패 혼동: LIVE 실패를 fixture로 조용히 성공 처리하지 않음 | `tests/integration/planner-security.test.ts:247` | A failing provider tagged LIVE_CODEX is injected; real server returns typed 422 with zero cached plan. Not a successful remote Codex run. |
| T36 | partial / FAULT_INJECTION | READY와 광고 타이머 경합: READY 우선; 종료 광고 위치에서 오클릭·제출 발생 안 함 | `tests/e2e-fixture/performance.spec.ts:54`<br>`tests/unit/ui-templates.test.ts:362` | Sponsor timeline and unit primary-action guard exist; no browser pointer at the old sponsor location during READY race.<br>Unmapped: 종료된 광고의 실제 좌표에 입력해도 오클릭·제출 없음 |
| T37 | partial / CACHE | 여러 세션·cache·reset: 현재 값/정원 사용, 타인 입력 복구 없음, demo reset은 합성데이터만 | `tests/e2e-fixture/variants.spec.ts:138`<br>`tests/integration/planner-cache-performance.test.ts:81`<br>`tests/unit/ops-reset.test.ts:67` | Warm second-login browser flow, current capacity browser refresh and real QA reset CLI exist; actual DEMO run/concurrent multi-session campaign not established by these cases.<br>Unmapped: 실제 DEMO reset과 여러 동시 세션·cache 경합의 종합 확인 |
| T38 | partial / FIXTURE | 여러 창·탭·origin: 요청/연결이 해당 document에만 적용; 다른 origin 재활성화 | `tests/e2e-fixture/regressions.spec.ts:186` | Two tabs and two local origins are checked; separate actual windows are not exercised.<br>Unmapped: 여러 실제 브라우저 창 사이에서도 같은 격리 유지 |
| T39 | complete / FAULT_INJECTION | 제품 모델·prompt/version 교체: 근거·캐시 버전 분리, 이전 모델 LIVE 합산 금지 | `tests/integration/planner-security.test.ts:179`<br>`tests/unit/ops-qa-report.test.ts:94`<br>`tests/integration/planner-cache-performance.test.ts:128` | Real SQLite namespace/payload mutation tests plus emitter wrong-model rejection and runtime prompt-byte invalidation. Fake report fixtures test the evidence mechanism only; they are not LIVE results. |
| T40 | partial / FIXTURE | 로그인·OTP 등장·만료: 분석/캡처 pause, 비밀번호·OTP 값의 모델·로그·광고 전송 없음 | `tests/e2e-fixture/safety.spec.ts:112`<br>`tests/integration/controller-observation.test.ts:37` | Password/OTP appearance is covered; source-session expiry and active sponsor/capture cross-path sentinel audit are not end-to-end proven here.<br>Unmapped: 실제 인증 만료 전후 모델·로그·표시 중 광고·capture의 종합 비유출 |
| OPER01 | partial / FAULT_INJECTION | 동일 run 두 번 시작: 두 번째 실행이 lock과 작업 소유권을 얻지 못함 | `tests/unit/ops-process.test.ts:55` | Real launcher lock only; worker task ownership absent.<br>Unmapped: SESSION_LOOP 작업 소유권도 두 번째 실행에 부여하지 않음 |
| OPER02 | partial / FAULT_INJECTION | codeStop 도달: 신규 코딩 중단, 자기 child만 보존 후 종료 | `tests/unit/ops-process.test.ts:26` | Real bounded processes; no codeStop scheduling/checkpoint preservation.<br>Unmapped: codeStop에서 신규 코딩 차단 및 작업 보존 후 종료 |
| OPER03 | partial / FAULT_INJECTION | supervisor crash: ledger/실제 파일을 대조하고 정상본 보존 | `tests/unit/ops-runtime-hash.test.ts:37` | Adjacent manifest preservation only; no supervisor crash test.<br>Unmapped: 실제 supervisor crash 후 ledger·파일 대조 및 정상본 보존 |
| OPER04 | partial / FAULT_INJECTION | 옛 worker late handoff: lease generation 불일치 결과 격리 | `tests/unit/ops-guards.test.ts:62` | Temporary repo lease function, not live handoff.<br>Unmapped: 실제 worker late handoff 격리 및 통합 차단 |
| OPER05 | partial / FAULT_INJECTION | 동일 patch 재도착: 중복 통합 안 함 | `tests/unit/ops-guards.test.ts:46` | Real git/concurrent ledger write; no integration consumer.<br>Unmapped: 실제 통합 실행에서 재도착 patch 두 번 적용 안 함 |
| OPER06 | partial / FAULT_INJECTION | worker 진전 없음: 제한된 진단·종료, 무한 대기 안 함 | `tests/unit/ops-process.test.ts:26` | Real deadline cleanup; no progress detection/diagnostic policy.<br>Unmapped: 진전 없는 실제 worker 감지·제한 진단·종료 |
| OPER07 | partial / FAULT_INJECTION | rate/auth/quota: backoff와 승인차단 구분, 자동결제 없음 | `tests/unit/options.test.ts:41` | Adjacent options classification only; no scheduler quota/rate/billing scenario.<br>Unmapped: 실제 rate/auth/quota 주입에서 backoff·승인차단 구분 및 자동결제 없음 |
| OPER08 | partial / FAULT_INJECTION | PID 재사용·타인 포트: 소유확인 실패 process를 종료하지 않음 | `tests/unit/ops-process.test.ts:26`<br>`tests/unit/ops-doctor.test.ts:27` | Bystander protected; no PID reuse race. Foreign socket check added separately.<br>Unmapped: PID 재사용·타인 포트 소유확인 실패 시 비종료 |
| OPER09 | partial / FAULT_INJECTION | 보호파일·scope 수정: patch 거부, 실제 요구사항·gate 보존 | `tests/unit/ops-guards.test.ts:22` | Temporary real diff; no live supervisor rejection/preserved-gate check.<br>Unmapped: 실제 handoff 거부 후 요구사항·gate 바이트 보존 |
| OPER10 | partial / FAULT_INJECTION | missing/skip/flaky/가짜 report: 전체 PASS로 집계하지 않음 | `tests/unit/ops-qa-report.test.ts:85`<br>`tests/unit/ops-evidence.test.ts:37` | Grader/emitter mechanism fixtures only.<br>Unmapped: 실제 운영 run의 고장 보고서 주입에서 전체 PASS 차단 |
| OPER11 | partial / FAULT_INJECTION | 다른 artifact LIVE 증거: 현재 릴리스 근거로 인정하지 않음 | `tests/unit/ops-release.test.ts:103`<br>`tests/unit/ops-qa-report.test.ts:94` | Temporary actual packaging; no current-candidate operational injection.<br>Unmapped: 실제 릴리스 후보에 다른 artifact LIVE 근거 주입 차단 |
| OPER12 | partial / FAULT_INJECTION | gate 실패 상태에서 마감: 안전 정상본 또는 정직한 제한등급으로 정리 | `tests/unit/ops-qa-report.test.ts:105`<br>`tests/unit/ops-release.test.ts:103` | Grade policy only; deadline/last-good orchestration absent.<br>Unmapped: 실제 마감 시 gate 실패를 주입하고 안전 정상본/제한등급으로 종료 |
| OPER13 | partial / FIXTURE | 이미지 실패·late asset: 핵심 제품을 막지 않고 cutoff 이후 미반영 | `tests/integration/vision-controller.test.ts:155` | Adjacent product vision test, NOT creative asset failure/cutoff proof. Both actual operational asset conditions remain untested.<br>Unmapped: 생성 이미지 실패가 핵심 개발을 막지 않고 asset cutoff 이후 late asset 미반영 |
| OPER14 | partial / FAULT_INJECTION | 과거 정상본 안전 결함: REVOKED로 출고 후보에서 제외 | `tests/unit/ops-release.test.ts:96` | Real temporary revoke/pack refusal; actual supervisor candidate lifecycle absent.<br>Unmapped: 실제 과거 정상본 안전 결함 발견→철회→후보 제외 전체 과정 |
| OPER15 | partial / FAULT_INJECTION | STOP/정상/비정상 종료: STOP·정상 종료는 재시작하지 않음; crash만 제한 재개 | `tests/unit/ops-process.test.ts:37` | Exit/cleanup only; no STOP/normal/crash restart policy test.<br>Unmapped: STOP·정상 종료는 재시작 안 함; crash만 제한 재개 |

## Manual T34 supplement — bounded synthetic page, outside the emitter

The user's newly supplied checkpoint was read from the explicitly provided main-checkout path only:

`/Users/kkwjk2718/Documents/kakao-ralphthon-main/.flecto/qa/manual/run-YSSUpl/checkpoint.json`

Observed checkpoint SHA-256: `4fd9c3c6aeac7cd9dac825fef9f4a392ec1c8d0999971c6bc31e3ce8b64d3121`. This is a human-review citation only, not an automated mapping source or a substitute receipt. Checkpoint updatedAt is `2026-09-29T05:32:58.988Z`; state STOPPED, exitReason OPERATOR_STOP.

| Evidence category | What is actually established |
|---|---|
| Checkpoint-observed native route | nativeCapture=NO_MOCK_OR_BROKER_ACTIVATION; activation/vision-ui/source-values are PASS_MANUAL_REPORTED. The worker did not independently operate Chrome. |
| Lead's visual observation | Native Chrome Cmd+Shift+Y activeTab capture on a plain synthetic page with two private fields; outbound masked image visually contained public text only; rendered READY; CUA return to original retained field values. These details are lead-reported, not encoded as automated assertion results. |
| Actual checkpoint exchange | One outbound exchange, HTTP 200, transport VISION, mode LIVE_CODEX, publicSnapshotSafe=true, candidateRefsMatch=true, responseMatchesRequest=true. Server duration 5764.809875ms; round trip 5803ms. controlsReadyMeasured=false, so neither is an end-to-end controls-ready measurement. |
| Actual pixel audit | 1552×636 PNG; red=0, green=0, transparent=0; blue=16713, black=226304. Image SHA-256 `7d7897bbb3cfa337302106f85383f0ede66a7e892cd9cb0a05f5e23e23029983`. Two private masks; three public regions. Counts apply to this image only. |
| Artifact binding | artifactBefore and artifactAfter match; artifactUnchanged=true. Extension `e40b799d7df8690f9304e35c61899873bf0d8ead84a8d188af949cceef1544dd`; runtime `b46a4f22d1b534ddbdc71eebfd7c26e48a32a0f13c4006089e2635f4c13a1b0f`; runtime input `cdbca1337e6c90b53c5c4e7897d246e86f0fdd10d26dfe92cc7daa750bd1566a`. No equivalence to a later final artifact is assumed. |
| Actual post-stop storage audit | PASS_EXACT_BYTES_ONLY, filesChecked=1, imageFound=false, temporaryImageFound=false. The checkpoint explicitly limits this to exact PNG/base64 matching in owned planner files, not other encodings or external logs. |
| Earlier attempts | Lead reports two pre-upload failures, no data sent, followed by third-attempt success after removing native viewport emulation without weakening the guard. This checkpoint records the single uploaded exchange, not all failed attempts; preserve their separate diagnostics. |
| Still unverified / unmapped | Checkpoint t34=LEAD_REVIEW_REQUIRED; ime/zoom/focus=NOT_RUN; submitted=false; sourcePostByHarness=false. General-web safety, actual OS IME/200% zoom and broader storage/log privacy do not follow from this bounded positive result. |

Human conclusion: the lead reports a positive native synthetic T34 path, and the checkpoint independently corroborates the successful masked LIVE exchange, unchanged artifact and limited storage audit. Keep this as a supplement requiring lead signoff and final-candidate artifact comparison. Automated T34 remains partial and `capabilities.vision` remains NOT_RUN until a supported evidence route exists; do not hand-edit an emitted result or enable FULL on the strength of this document.

## Lead update before commit — 2026-09-29 14:45 KST

These are new user/lead reports, not fresh executions by this worker. They supplement the earlier checkpoint snapshot; they do not rewrite its recorded NOT_RUN fields or promote automated gates.

- The main checkout's `tests/unit/ui-templates.test.ts` now includes a strict regression: an older ACK arriving after the latest ACK must not replace a focused Korean draft. The lead reports the new test first failed with `한` becoming `하`, then the focusedRef guard was fixed; full verification is pending. Existing mapped cases were reported unchanged. The map intentionally retains the reviewed worktree file hash `e93366d0f239403fc6c4c083838f3fdd0f93218be9b514e15bde5e647677f276`. **Before using the map on main, the lead must review the changed test file and refresh all its sourceSha256 references (T27, T30, T36), then collect receipts for the final candidate.** Do not silently update a hash or reuse old reports. The new regression is not yet mapped here.
- Native Chrome zoom was verified through the actual menu at 200%, with Tab/Shift+Tab wrap and Escape returning original focus/value reported PASS. This is a human MANUAL03/T24 supplement, distinct from the automated 720×550 viewport proxy. No artifact-bound new manual record was provided in this update, so the map's T24 remains partial.
- OS IME initially produced `하ㄴ` once during a rapid input-method switch, then stable Korean input passed. Preserve the anomalous attempt. T04 is not fully PASS until the focused Korean draft patch is retested, including the rapid sequence; a later stable attempt does not erase the earlier failure.

## Static validation performed

A read-only Node 24 / TypeScript AST inspection checked JSON shape, exact ordered 55 IDs, requirement membership, every complete requirement's nonempty mapping, every whole-file hash and snippet, exact describe/test title expansion, duplicate-title cardinality, final run IDs and LIVE instances/model. It **did not import or execute the test files** and did not invoke the QA emitter. Result: 55 IDs / 274 references / 27 source files; 23 complete / 32 partial.

Mapping byte SHA-256 at static validation: `ad01177471d536095fadd370d97cee39edeccff1196abbd038c997f7373753d6`. A later map edit requires repeating this check. No browser, provider, unit/integration/fixture/LIVE run or release status is claimed.

## Integration checkpoint / next action for lead

1. Review the JSON and partial gaps, integrate only these two files, then compare gate/test/helper/config bytes against the actual final candidate. In particular, review the new focused-Korean-draft regression and refresh all `ui-templates.test.ts` references only after that review. Source changes require renewed body review before replacing sourceSha256; never relabel an old report with new hashes.
2. Run the existing wrapper against the fresh verified build with IDs `unit-final`, `fixture-final`, `live-final`; keep unique output paths and all failed attempts. Fixture run includes both new worker-restart cases. LIVE still repeats each site three times.
3. Compare actual reporter titlePaths to the reviewed mapping, especially T31's duplicate `{}` cases. After any helper/source fix, rebuild and obtain new receipts; no report substitution.
4. Emit with this mapping only after receipts exist. Add the manual supplement through a supported evidence mechanism or keep it human-only; preserve checkpoint LEAD_REVIEW_REQUIRED until the lead signs off. Keep SESSION_LOOP separate from MANAGED_TESTED.
5. Copy this checkpoint into shared state/NEXT_ACTION.md if appropriate; that state path is outside this worker's two-file ownership and was not edited. No external submission or git push was performed.

## Reviewed test source hashes

| File | SHA-256 |
|---|---|
| `tests/e2e-fixture/benefits.spec.ts` | `9cf5481b6afda0ff235a0c0939ca1c853339735c5e8281ad6e87f786b6b1bab9` |
| `tests/e2e-fixture/culture.spec.ts` | `d3f99e4a63bc5fb4034ecb8c8b616f311dece6ae39af5485396caf08ebee4b92` |
| `tests/e2e-fixture/performance.spec.ts` | `ffcedd734ee6d2eab797f910f79a8b5c75e28f1f5e74cc5da2ed9c40235233aa` |
| `tests/e2e-fixture/regressions.spec.ts` | `56a307a6ad8d93be0661842e07dddb8ef5a63c54fce477a9fa8f786610860d54` |
| `tests/e2e-fixture/safety.spec.ts` | `130d5f95d36b5796f88f59986a50202ea394712bfb27de3dbcdb1e9401d34b69` |
| `tests/e2e-fixture/variants.spec.ts` | `9f6c802b01a818a72d233d345f9876ca1d98d35fa6689b7b82dd58e48d509a89` |
| `tests/e2e-fixture/vision-capture.spec.ts` | `dc63b78b92f91717703435a426fb914f39130d2ca7ec95100fd7d7c1fb323563` |
| `tests/e2e-fixture/worker-restart.spec.ts` | `bd647d8c97bbf11cdff1bbe91337680c0e7fa6a3dc258eb00a8d67a66fae4245` |
| `tests/e2e-live/product.spec.ts` | `7275bd793668290999e6aaafef9ed752dfe11417986fe4fbdee0b3993f5399c2` |
| `tests/integration/controller-observation.test.ts` | `3a4c1523f40312b8808c16de0e1a01e4b9a19ec7f188f1a61925ed052ed21bc8` |
| `tests/integration/planner-cache-performance.test.ts` | `47e425aeed7b63b0405fdc33dcde6a7475c8e1719435c72c47e1d7c0a0145295` |
| `tests/integration/planner-security.test.ts` | `d986f503365d1a172ec1e60cd0158bb3a7d26323ee0659fb9b03079d4e037909` |
| `tests/integration/vision-controller.test.ts` | `bd46b25606c7e33a12b156d3d084de7bbc1329270cd6dc5b0dffd6660bc98794` |
| `tests/unit/background.test.ts` | `c8626ceebf886be16b8d3de0a95d3582564b89db427207db3f67d8473c61d47e` |
| `tests/unit/contracts.test.ts` | `6cf24bf99313657ecd203e01b10de0408479c22f36040994bf80e988486a10af` |
| `tests/unit/core.test.ts` | `c972590a1dbac89095ea25719430b27df8901463f7b718f7f399db3d5097f9db` |
| `tests/unit/ops-doctor.test.ts` | `31fc529f9f73c2a05f97f8e334290bc507f1a4f061fcbcfb1b6af2f71ddd745a` |
| `tests/unit/ops-evidence.test.ts` | `90977a769f588e11d20b9d48ecc3d84cb3d2f6efb5288aa57695f53bf8eb2a0d` |
| `tests/unit/ops-guards.test.ts` | `3355accfd9a75150872f5be2a8f28696502789c813892857122f52e389f2ac45` |
| `tests/unit/ops-process.test.ts` | `71a044c7580673659538469a5723169c3f6ce238934e99f40339ce0ac1b6db1a` |
| `tests/unit/ops-qa-report.test.ts` | `102bbd7a1794341a98bfbb35828e0ec405a8936690ce31a76d5b6a5cb4298cef` |
| `tests/unit/ops-release.test.ts` | `63573b51cc05d2465f340df057fa70bd936298d4af0bfadb86fc192777b1bf76` |
| `tests/unit/ops-reset.test.ts` | `221ccf8c5f8fcc51d61aa8a94611ed36c49f2c65fa1c62396e3505d26494b392` |
| `tests/unit/ops-runtime-hash.test.ts` | `0f26148f624c21ea32294e9c800dd7106cc8b430ad85969cc2d9e71bdd588690` |
| `tests/unit/options.test.ts` | `36ebc38bf97d33860ed1304815c6d4c1eb1e5c4a1e291d7168a733cf66d6bec6` |
| `tests/unit/ui-templates.test.ts` | `e93366d0f239403fc6c4c083838f3fdd0f93218be9b514e15bde5e647677f276` |
| `tests/unit/vision-transport.test.ts` | `a2ff78bde1f6824a2c4ed139c5d7dff64e7c34231f6d1c58e1d44d324bf27403` |

## Lead supplemental review — 2026-09-29 14:58 KST

Commit `1586195` adds direct source submit-button click and form-submit counters across local next/back, and two explicit external-URL malicious-output cases requiring SCHEMA_INVALID, no cache and no fetch. Existing assertions remain unchanged. These close the specific T27/T30 assertion gaps above: the current mapping is **25 complete / 30 partial**, still not execution PASS. The additive focused-Korean-draft regression changed the UI test file hash; existing mapped snippets were rechecked unchanged before refreshing hashes. Final receipts determine execution results.

Native Korean composition after the focused-draft fix and Chrome's actual 200% zoom, focus wrap and source return were observed in `run-FamJXD`, with unchanged build and zero original saved records. The earlier split-syllable failure is retained in `run-OjY2Fj`. These remain separate manual evidence rather than automatic FULL promotion.
