# Lead-operated Chrome / LIVE manual QA

This harness is authored/typechecked separately; it is **not a completed T34, Korean IME, or 200% accessibility result**. The lead runs it after integrating the vision-capability UI and privacy fixes into a fresh build. Browser plugin execution is not used by this authoring task: the user explicitly requested a headed Playwright harness and lead-operated native Chrome/CUA validation.

## Start from the integrated checkout

Use the project's existing Node 24 environment (`source .flecto/env.sh` where already present). Do not install runtimes, copy personal browser profiles, recreate Codex authentication, or change global settings. Existing product Codex authentication and the existing Chromium installation are prerequisites. The normal system helper uses the approved product model/runtime; there is no fake provider or fallback.

```sh
npm run build
node --import tsx scripts/manual-qa.ts --vision
```

Default mode is `--vision`. For the normal benefits/login flow, stop the first run, then:

```sh
node --import tsx scripts/manual-qa.ts --benefits
```

`--no-proxy` connects directly to planner 4727 for diagnostics only: there is then **no request/image/response evidence**, so do not claim T34 positive. `--help` does not start anything. No package scripts or shared helpers are modified.

The harness owns planner **4727**, benefits **4583**, culture **4584**, and optional proxy **4728**, all literal `127.0.0.1`. Occupied ports or an existing manual run lock abort startup; it never kills another process. Each run uses a fresh private `.flecto/qa/manual/run-*/` directory with its own `profile/` and `system/`. The existing helper creates local QA service credentials there; it does not create a product Codex login. A stale lock after a hard crash needs lead inspection of its PID before manual removal; profiles/evidence are retained.

Chrome launches with `channel: chromium`, headed, viewport 1440×1100, installing the existing `dist/extension`. The actual options UI receives the local address/token and clicks **연결하기**, waits for success, then closes. No Chrome storage shortcut or broker test hook is used. Debug logging (`DEBUG`, `PWDEBUG`, `NODE_DEBUG`) must be disabled for this process because it may disclose filled tokens. Do not enable traces, HARs, request dumps, or screenshots of options.

## Native capture permission and LIVE T34 positive

1. Wait for `MANUAL QA READY`. Confirm the active tab is `http://127.0.0.1:4583/vision-qa` in the owned Chrome window, at 100% zoom with the complete form visible.
2. Through native Chrome/CUA, open the Extensions toolbar and click **FLECTO**, or press the registered macOS **Command+Shift+Y** shortcut. This user gesture grants real `activeTab`; `broker.activate` and synthetic JS events do not establish the capture permission. Record `activation pass` only after observing this gesture and the overlay.
3. In task selection, click **화면 배치 도움: 입력 내용 확인** directly. The ordinary **입력 내용 확인** task starts DOM-only planning; it is not the vision task. The control's availability depends on the integrated capability UI. If absent, record failure/unrun and return to the vision integration owner; do not activate a hidden method or bypass the guard.
4. Inspect the actual response and resulting usable UI. The proxy must observe `/v1/vision/plans`, successful status, `transport: VISION`, `mode: LIVE_CODEX`, matching request/snapshot IDs, no error, and a measured duration. A button click, waiting message, CACHE result, or successful image capture alone is insufficient. Enter `vision-ui pass` only for the observed usable result.
5. Open the recorded `vision-N-masked.png` privately. Blue public labels/notice must remain; both red private input areas must be black; the green unrelated area must be absent/white. The PNG census additionally requires zero red/green/transparent pixels, blue >20 and black >1000. Check geometry visually; a census alone does not prove correct masking everywhere.
6. Inspect the safe `checkpoint.json` and final artifact comparison after Ctrl+C. Retain failures as failures. The final storage audit scans only the owned planner's DB/log files for exact sent PNG/base64 bytes and checks for leftover temporary PNGs. `PASS_EXACT_BYTES_ONLY` is bounded evidence, not proof against other encodings or external runtime logging. Lead review must also confirm the current planner's no-image-cache/log behavior; this harness never saves an image into its own DB/log. Product temporary image cleanup remains the product implementation's responsibility.

The intercepted **GET only** is a synthetic public source on the planner's permitted benefits origin. It contains two uniquely labelled required text/tel fields, actual DOM refs assigned by the product, and a form notice with no `aria-describedby` relation. Blue labels, red `PRIVATE_*` values, and a green unrelated block sit in the viewport; there are no images, shadows, pseudo content, or planner answers. Candidate refs come from the real snapshot, not hardcoded IDs. POST to this synthetic route returns 405; this test cannot demonstrate a source save.

Before forwarding vision, the proxy asserts no `PRIVATE_*` marker in snapshot/capture metadata and compares current product candidates. It decodes and checks the **already masked outbound PNG**, saves it only after passing, and forwards the real request unchanged. Failure blocks forwarding and records only a fixed error code. Authentication headers exist in memory during forwarding only. Persisted evidence contains bounded counts, safe snapshot hash, public DOM refs/capture geometry, image hash/dimensions, fixed status/error fields and timing; no headers, auth/token, original screenshot, full request/response, input values, or model plan. Other endpoints are forwarded without recording payloads. All evidence stays under the private run directory, outside release material.

## Native Korean IME, 200% zoom, and focus

Use `--benefits`, then manually log in to the synthetic service using its documented `demo` / `flecto2026!` account and open `http://127.0.0.1:4583/apply`. These are demo credentials only; never use a personal account. The harness neither logs in nor posts a source form.

1. Activate via the native toolbar/shortcut. Reach a text input in the actual overlay. Select the macOS Korean input source and physically type/compose Korean text (for example `한글입력검사`), including composition, backspace, recomposition and commit. CUA must deliver real OS key events; Playwright `fill`, clipboard paste, JS composition events and `insertText` do not prove OS IME.
2. Check the composed value is neither dropped nor duplicated and the original source input matches exactly. Switch **원본 보기** as needed and confirm re-entry preserves the value. Record `ime pass` and `source-values pass` only after these separate observations. Use synthetic text and do not copy entered values into evidence logs.
3. Set Chrome's actual page zoom to **200%** via its native menu and confirm the displayed percentage. CSS transforms, `deviceScaleFactor`, viewport resizing and OS display scaling do not count. Check enlarged controls/labels, reflow, scrolling, clipped content, and always-available original/exit actions. Record `zoom pass` only after this check.
4. At 200%, use Tab and Shift+Tab through the overlay, including back/original/exit, then return to source. Verify the visible focus ring, logical order, focus restoration, no unintended submission and no unusable trapped controls. Record `focus pass` only after testing. Do not submit the final source form automatically; any lead-operated save needs its own actual source evidence.

## Evidence, shutdown, and checkpoint

The terminal accepts only `activation|vision-ui|ime|zoom|focus|source-values pass|fail`, `checkpoint`, and `quit`. For example, `ime fail`. Unknown/free-text input is discarded. Markers are explicitly **MANUAL_REPORTED**, never automatic PASS; the default is NOT_RUN. With detached stdin, the lead can inspect the run and stop with SIGINT; unrecorded observations remain NOT_RUN.

Ctrl+C, SIGTERM, `quit`, closing this browser, or an owned service exiting closes only this run's browser/proxy/children and writes a safe final checkpoint. It does not kill by port or touch personal Chrome. SIGKILL/power loss cannot guarantee cleanup; recover by inspecting the recorded PID and owned run only. Request-level checkpoints preserve actual observed exchanges before normal shutdown. Preparation follows the product's existing 10-second budget; proxy transport timeout is 12 seconds only for transport cleanup, and response duration is **not** controls-ready latency.

`readVerifiedArtifact` runs before startup and after shutdown. Runtime hashes include this script, so rebuild after integrating or changing it. A changed/invalid final artifact invalidates same-build attribution. The harness intentionally does not edit `state/NEXT_ACTION.md` because this worker owns only these two files: lead's next action is to integrate, build, run vision, inspect actual evidence, run benefits IME/zoom/focus, then update project state and the claim ledger. External publication/submission is not performed. Do not promote this manual subset into all T01–T40 PASS.
