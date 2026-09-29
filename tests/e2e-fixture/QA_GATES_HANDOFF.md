# QA-GATES handoff — 2026-09-29

PATCH_READY, not G4 / FULL. Authored and tested against clean `e11d9d6` in the
assigned flecto-core worktree. No product implementation, existing fixtures,
Playwright configuration, package/lock, or original T01–T26 requirements changed.
Lead patch `86a7820` was not cherry-picked. No push or external submission.

## Actual run

- Node 24.21.0; `npm run typecheck` and `npm run build` exited 0.
- Installed MV3 extension in test-owned Playwright Chromium profiles, 1440×1100.
  Browser plugin not available; user explicitly requested installed-extension
  Playwright gates. Real production broker activation, not a native toolbar click.
- One serial browser batch, 20 tests, 13 PASS / 7 FAIL / 0 skip / 0 flaky,
  exit 1, 132.743s, started 2026-09-29 13:52:38 KST.
- Owned servers and browser profiles closed after the batch; all four original
  listeners absent. Heavy slot returned to lead for main build / LIVE.
- Initial ports were 4527/4528/4383/4384. Committed helper now uses
  **4627 planner, 4628 fault proxy, 4483 benefits, 4484 culture**, because lead
  reserved 4527/4383/4384 for LIVE. Each process is started through `startSystem`
  rooted in this checkout. Shared `node_modules` is dependency reuse only.
- Original raw results retained locally at
  `.flecto/qa/qa-gates-e11d9d6-initial.json`; failure images and DOM evidence are in
  `.flecto/qa/test-results/`. Sanitized committed provenance is
  [qa-gates-e11d9d6.evidence.json](qa-gates-e11d9d6.evidence.json).

## Confirmed product failures on e11d9d6

The following four cases reached their required safe UI states, but emitted
unhandled page errors. Tests deliberately retain the zero-pageerror assertions.

| IDs | Reproduction | Expected | Actual |
|---|---|---|---|
| T12, T26 subset | Prepare benefits, complete local review, append a visible required labelled input, retry | Old plan rejected; new required field shown and validated; no unhandled exception | UI behavior and zero source submissions verified, then `pageerror: STALE_DOCUMENT` |
| T14 | Complete local review, change visible important notice, retry | Old notice cache invalidated, fresh notice shown, no exception | Fresh FIXTURE response/new notice verified, then `pageerror: STALE_DOCUMENT` |
| T21, T37 subset | Prepare culture, set synthetic yoga capacity to zero via QA-only endpoint, wait for real 20s source poll, retry | Closed option disabled and latest capacity used without exception | Native/overlay option disabled and marked closed, then `pageerror: STALE_DOCUMENT` |
| T40 subset | Activate on login; return to source/login; prepare benefits; introduce visible OTP field | Pause extraction and planning, keep private values out of sinks, no exception | AUTH_REQUIRED, no extra plan, sentinel checks passed, then `pageerror: AUTH_REQUIRED` |

Likely common path for lead diagnosis: controller `pollValues()` runs from its
200ms timer and calls `readControlValue()`, which calls `refreshRegistry()` and
can throw on stale/auth state. The timer does not catch that error in this base.
This is a source-reading diagnosis, not a confirmed stack trace. Gate version 2
now attaches browser error stacks for the integrated rerun. No product fix made.

## Initial test defects corrected in gate version 2 — rerun required

1. T03/T06/T27 test expected unused general copy `필수 항목` even though the native
   required-field message was visible. The corrected assertion checks both
   `aria-invalid` fields and the actual source input's `validationMessage`.
   Submission/consent assertions remain unchanged and must still run.
2. T08 response loss: source `connection-loss` socket destruction still delivered
   a real receipt in Chromium. The DB contained exactly one valid row and
   Playwright observed one POST, so this was not evidence of false success.
   Chromium transport retry is a possible explanation, not a proven diagnosis.
   The replacement route lets the original handler commit once with `route.fetch`
   (no retry, no redirect following), then aborts delivery of its actual 303.
   The test still requires one original record, one POST, no false success and
   manual history recovery. It never writes expected records through a QA API.
3. T21/T37 second-session/reset test tried clicking source login behind the
   correctly restored authentication overlay. It now explicitly exits through
   the source-view button before the second login, as a real user would.

Also removed the imported happy-path helper's decorative heading dependency,
recorded actual product Git HEAD alongside build hashes, and added one **NOT_RUN**
T28 source-review `<dd>` mutation regression for lead's review-token fix.
The final authored suite has **21 cases**; do not transfer v1's PASS count to v2.

## Requirement accounting from the initial batch

PASS below is the stated synthetic installed-extension case, never LIVE or G4.

| IDs | Result | Exact scope / remaining work |
|---|---|---|
| T13 | PASS | Selected form among duplicate labels; full-navigation confirmation; original DB exactly one matching row |
| T15 | PASS, injected delay | 2900ms transport hold; READY/first editable input at 2914.1ms; no sponsor |
| T16 | PASS, injected delay | 3600ms response; sponsor only PREPARING, removed at READY |
| T17 | PASS, injected delay | Timeout at 9999.6ms; original action offered; 11s late response never becomes READY |
| T22 | PASS | Block only planning after READY; user input/correction/review/source submit succeeds with one original row and no extra plan |
| T28 | PASS for local values | Original input changed after local review; submission revoked; latest value reread. Source-review row mutation newly authored, NOT_RUN |
| T05, T10 | PARTIAL PASS | Actual SPA course → applicant → browser back → browser forward, correct controlled time and fresh document identities. No full-path/back/BFCache coverage |
| T09 | PARTIAL PASS | Full navigation restores extension and confirms original save in T13/T22; detached old-ref replay not explicitly attacked |
| T08 | PARTIAL PASS | Source rejection yields SOURCE_REJECTED, zero records, one POST, no auto-retry. Corrected post-commit response-loss case awaits rerun |
| T18, T33 | PARTIAL PASS | Cancellation before/after sponsor, retry with newer epoch/request ID, late first result cannot overwrite newer input. Distinct goals/tab switching/singleflight not tested |
| T19 | PARTIAL PASS | Sponsor dismissal preserves same preparation request. Missing creative not tested |
| T20, T29 | PARTIAL PASS | Synthetic input/hidden/cookie sentinels and QA tokens absent from planner transport, planner files, captured service logs and extension storage. No active-ad sentinel, LIVE prompt, hostile oracle access, or vision assertion |
| T21 | PARTIAL PASS + FAIL | Cold/warm distinguished (warm 12.8ms first editable); capacity case has above runtime error; corrected reset case awaits rerun |
| T24 | PARTIAL PASS | Escape returns to usable original and retains editable input. Keyboard loop/200%/OS IME not covered |
| T36 | PARTIAL PASS | No sponsor once READY, no source save. Same-tick boundary and coordinate misclick not tested |
| T12, T14 | FAIL | Safe behavior reached, unhandled STALE_DOCUMENT remains |
| T26, T37, T40 | FAIL for exercised subsets | Above runtime failures; not full requirement coverage |
| T03, T06, T27 | TEST FIX / RERUN | Initial case stopped at copy mismatch; subsequent assertions cannot be reported PASS |
| T01, T02, T04, T07, T11, T23, T25, T30, T31, T32, T34, T35, T38, T39 | NOT_RUN as dedicated gates | Existing happy tests were not rerun here. No service-worker restart, vision positive, LIVE, manual Chrome/IME/zoom claim |

Timing measures the first editable control after PREPARING. It excludes the
separate 500ms primary-action arm window and is not an end-to-end LIVE inference
benchmark. Readiness samples are attached to raw Playwright results.

## Integration rerun

Rebuild in the integrated checkout first. Then, with the heavy slot available:

```sh
E2E_MODE=FIXTURE node node_modules/@playwright/test/cli.js test --config playwright.config.ts safety.spec.ts variants.spec.ts performance.spec.ts --workers=1
```

Use the project's Node 24 PATH. No fixture/config change is needed. The new helper
overrides only the server fixture and preserves original extension installation,
source reset, activation and error handling. The proxy forwards real planner
traffic and holds responses; it never fabricates plans or source save results.
Keep failures and gate version separate when running against the lead/UI fixes.
No second browser batch was started while lead held the slot.
