/** Lead-operated LIVE QA. No broker hooks, source submission, auth setup, or raw capture. */
import { chromium, type BrowserContext } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, lstat, chmod, writeFile, rename, open, unlink, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { createInterface, type Interface } from 'node:readline';
import { EXTENSION_ID, ErrorCodeSchema } from '@flecto/contracts';
import { VisionPlannerRequestSchema, VisionPlannerResponseSchema, visualRelationCandidates } from '../apps/extension/src/background/validation';
import { startSystem, type RunningSystem } from './system';
import { readVerifiedArtifact } from './qa-report';

const PORTS = { planner: 4727, benefits: 4583, culture: 4584 };
const PROXY_PORT = 4728;
const benefitsOrigin = `http://127.0.0.1:${PORTS.benefits}`;
const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const PRIVATE_NAME = 'PRIVATE_MANUAL_QA_NAME_2026';
const PRIVATE_PHONE = 'PRIVATE_MANUAL_QA_PHONE_2026';

// A deliberately synthetic SOURCE, never a provider plan or an expected answer.
// No aria-describedby: the public form notice is unrelated to either field in DOM semantics.
const visionHtml = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>FLECTO 수동 시각 QA</title>
<style>
html,body{margin:0;background:#fff;color:#111;font:26px/1.4 sans-serif}
h1{margin:28px 40px;font-size:30px}form{position:relative;margin:30px 40px;width:860px;height:410px}
label,p{position:absolute;margin:0;color:#0000ff;background:#fff}
label{left:20px;width:300px;height:40px}#name-label{top:10px}#phone-label{top:145px}
input{position:absolute;left:20px;width:540px;height:48px;box-sizing:border-box;border:0;padding:6px;font:24px sans-serif;color:#ff0000;background:#ff0000}
#qa-name{top:60px}#qa-phone{top:195px}#notice{left:20px;top:270px;width:760px;height:42px}
#unrelated{position:absolute;left:650px;top:115px;width:100px;height:90px;background:#00ff00}
button{position:absolute;left:20px;top:340px;font:26px sans-serif;min-height:56px}
</style><body><h1>합성 공개 신청 양식 · 시각 관계 검사</h1>
<form id="manual-vision-form" action="/vision-qa" method="post">
<label id="name-label" for="qa-name">신청자 이름</label><input id="qa-name" name="applicant" type="text" required autocomplete="off" value="${PRIVATE_NAME}">
<label id="phone-label" for="qa-phone">연락 전화</label><input id="qa-phone" name="telephone" type="tel" required autocomplete="off" value="${PRIVATE_PHONE}">
<div id="unrelated" aria-hidden="true"></div><p id="notice">연락 안내는 입력한 전화번호로 전달됩니다.</p>
<button type="submit">입력 내용 확인</button></form></body></html>`;

/** Decode only bounded, non-interlaced 8-bit RGB/RGBA PNGs produced by Chrome canvas. */
function inspectMaskedPng(bytes: Buffer, width: number, height: number) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
      bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height ||
      bytes[24] !== 8 || ![2,6].includes(bytes[25]) || bytes[26] || bytes[27] || bytes[28]) throw new Error('PNG_UNSUPPORTED');
  const channels = bytes[25] === 6 ? 4 : 3, stride = width * channels;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (end > bytes.length) throw new Error('PNG_INVALID');
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') compressed.push(bytes.subarray(offset + 8, end - 4));
    offset = end;
  }
  const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: (stride + 1) * height });
  if (raw.length !== (stride + 1) * height) throw new Error('PNG_INVALID');
  const pixels = Buffer.alloc(stride * height);
  const counts = { red: 0, green: 0, blue: 0, black: 0, transparent: 0 };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('PNG_INVALID');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= channels ? pixels[i - channels] : 0;
      const b = y ? pixels[i - stride] : 0, c = y && x >= channels ? pixels[i - stride - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predict = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      pixels[i] = (raw[y * (stride + 1) + 1 + x] + predict) & 255;
    }
  }
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (channels === 4 && pixels[i + 3] !== 255) counts.transparent++;
    if (r > 180 && g < 90 && b < 90) counts.red++;
    if (g > 180 && r < 90 && b < 90) counts.green++;
    if (b > 150 && r < 110 && g < 110) counts.blue++;
    if (r < 20 && g < 20 && b < 20) counts.black++;
  }
  if (counts.red || counts.green || counts.transparent || counts.blue <= 20 || counts.black <= 1000) throw new Error('MASK_ASSERTION_FAILED');
  return counts;
}

type Observation = 'NOT_RUN' | 'PASS_MANUAL_REPORTED' | 'FAIL_MANUAL_REPORTED';
type Exchange = {
  sequence: number; receivedAt: string; publicSnapshotSafe: boolean; candidateRefsMatch: boolean;
  imageSha256?: string; imageFile?: string; width?: number; height?: number;
  pixelCounts?: ReturnType<typeof inspectMaskedPng>; controlCount?: number; noticeCount?: number;
  publicSnapshotSha256?: string;
  capture?: Pick<ReturnType<typeof VisionPlannerRequestSchema.parse>['request']['capturePlan'], 'refs' | 'crop' | 'publicRegions' | 'privateMasks' | 'viewport'>;
  status?: number; transport?: 'VISION'; mode?: 'LIVE_CODEX' | 'CACHE' | 'FIXTURE';
  durationMs?: number; roundTripMs?: number; error?: string; responseMatchesRequest?: boolean;
};

/** Inspect only this run's planner DB/log files after stopping its services; never open account files. */
async function auditPlannerStorage(directory: string, images: Buffer[]) {
  let filesChecked = 0, imageFound = false, incomplete = false, temporaryImageFound = false;
  const visit = async (path: string): Promise<void> => {
    for (const item of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, item.name);
      if (item.isSymbolicLink()) { incomplete = true; continue; }
      if (item.isDirectory()) { await visit(child); continue; }
      if (item.name.endsWith('.png')) temporaryImageFound = true;
      if (!/\.(?:sqlite(?:3)?|db)(?:-(?:wal|shm|journal))?$|\.(?:log|jsonl)$/i.test(item.name)) continue;
      if ((await lstat(child)).size > 64 * 1024 * 1024) { incomplete = true; continue; }
      const bytes = await readFile(child); filesChecked++;
      if (bytes.includes('data:image/png;base64,') || images.some(png => bytes.includes(png) || bytes.includes(png.toString('base64')))) imageFound = true;
    }
  };
  await visit(directory);
  if (!filesChecked) incomplete = true;
  return { filesChecked, imageFound, temporaryImageFound, status: incomplete ? 'INCOMPLETE' : imageFound || temporaryImageFound ? 'FAIL' : images.length ? 'PASS_EXACT_BYTES_ONLY' : 'NOT_RUN',
    scope: 'Owned planner files only; exact PNG/base64 matching does not prove absence under other encodings or external logging.' };
}

async function privateDirectory(path: string) {
  await mkdir(path, { recursive: false, mode: 0o700 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('UNSAFE_QA_DIRECTORY');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node --import tsx scripts/manual-qa.ts [--vision | --benefits] [--no-proxy]\nDefault: --vision, proxy enabled. Requires a fresh verified build and existing Codex login.\nTerminal: activation|vision-ui|ime|zoom|focus|source-values pass|fail; checkpoint; quit.');
    return;
  }
  if (args.some(arg => !['--vision','--benefits','--no-proxy'].includes(arg)) || (args.includes('--vision') && args.includes('--benefits'))) throw new Error('INVALID_ARGUMENTS');
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('NODE_24_REQUIRED');
  if (resolve(process.cwd()) !== resolve(root)) throw new Error('RUN_FROM_THIS_CHECKOUT');
  // Verbose Playwright diagnostics can print locator.fill(token); refuse them, never unset a user's settings.
  if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG) throw new Error('DISABLE_VERBOSE_DEBUG_FOR_PRIVATE_QA');
  process.umask(0o077);
  const mode = args.includes('--benefits') ? 'benefits' : 'vision', useProxy = !args.includes('--no-proxy');
  const artifact = await readVerifiedArtifact(root); // Runtime hash binds this script too; build AFTER integration.
  for (const path of ['.flecto', '.flecto/qa', '.flecto/qa/manual']) await privateDirectory(resolve(root, path));
  const base = resolve(root, '.flecto/qa/manual');
  await chmod(base, 0o700);
  // Refuse contention; never kill a port owner or remove another run's lock/profile.
  const lockPath = resolve(base, 'run.lock'), lock = await open(lockPath, 'wx', 0o600);
  await lock.writeFile(JSON.stringify({ pid: process.pid })); await lock.close();
  let system: RunningSystem | undefined, context: BrowserContext | undefined, proxy: Server | undefined, terminal: Interface | undefined;
  let runDir: string | undefined, ending = false;
  let finish!: () => void;
  const lifetime = new Promise<void>(done => { finish = done; });
  const stop = () => { ending = true; finish(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const exchanges: Exchange[] = [], pending = new Set<Promise<void>>(), controllers = new Set<AbortController>();
  const observations: Record<string, Observation> = Object.fromEntries(['activation','vision-ui','ime','zoom','focus','source-values'].map(key => [key, 'NOT_RUN']));
  let diagnostics: unknown = null;
  let state = 'STARTING', exitReason = 'OPERATOR_STOP', artifactAfter: typeof artifact | null = null;
  let storageAudit: Awaited<ReturnType<typeof auditPlannerStorage>> | null = null;
  let writes = Promise.resolve();
  function checkpoint() {
    if (!runDir) return Promise.resolve();
    const file = resolve(runDir, 'checkpoint.json');
    const contents = JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), mode, provider: 'LIVE_CODEX',
      state, exitReason, artifactBefore: artifact, artifactAfter, artifactUnchanged: artifactAfter ? JSON.stringify(artifact) === JSON.stringify(artifactAfter) : null,
      ports: PORTS, proxyPort: useProxy ? PROXY_PORT : null, observations, exchanges, storageAudit, diagnostics,
      t34: 'LEAD_REVIEW_REQUIRED', nativeCapture: 'NO_MOCK_OR_BROKER_ACTIVATION',
      sourcePostByHarness: false, controlsReadyMeasured: false, submitted: false,
      nextAction: 'Lead: inspect masked PNG and live response, verify native activation/rendering, OS Korean IME and 200% focus; do not promote NOT_RUN.' }, null, 2) + '\n';
    writes = writes.catch(() => {}).then(async () => { await writeFile(file + '.tmp', contents, { mode: 0o600 }); await rename(file + '.tmp', file); });
    return writes;
  }
  try {
    runDir = await mkdtemp(resolve(base, 'run-'));
    await checkpoint();
    // Preflight only our reserved ports. An occupied port aborts; there is no fallback to somebody else's server.
    for (const port of [...Object.values(PORTS), ...(useProxy ? [PROXY_PORT] : [])]) {
      const probe = createServer();
      await new Promise<void>((done, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', done); });
      await new Promise<void>(done => probe.close(() => done()));
    }
    if (ending) return;
    system = await startSystem({ mode: 'LIVE_CODEX', namespace: 'QA', dataDir: resolve(runDir, 'system'), ports: PORTS });
    for (const child of system.children) child.once('exit', () => { if (!ending) { exitReason = 'OWNED_SERVICE_EXITED'; stop(); } });
    if (ending) return;
    if (useProxy) {
      proxy = createServer((req, res) => {
        const task = (async () => {
          const started = performance.now(), controller = new AbortController(); controllers.add(controller);
          let exchange: Exchange | undefined;
          const timer = setTimeout(() => controller.abort(), 12000);
          res.once('close', () => { if (!res.writableEnded) controller.abort(); });
          try {
            const path = req.url ?? '';
            if (!/^\/(?:health|v1\/(?:connect|diagnostics\/cache|vision\/(?:capabilities|plans)|plans(?:\/[A-Za-z0-9_-]+)?|blueprints\/[A-Za-z0-9_-]+\/verify))$/.test(path)) { res.writeHead(404).end(); return; }
            // Reject unauthenticated callers before inspecting or saving their content.
            if (path !== '/health' && req.method !== 'OPTIONS' &&
                (req.headers.authorization !== `Bearer ${system!.credentials.plannerToken}` || req.headers.origin !== `chrome-extension://${EXTENSION_ID}`)) {
              res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"AUTH_REQUIRED"}'); return;
            }
            if (req.method === 'POST' && path === '/v1/vision/plans') {
              exchange = { sequence: exchanges.length + 1, receivedAt: new Date().toISOString(), publicSnapshotSafe: false, candidateRefsMatch: false };
              exchanges.push(exchange);
            }
            const chunks: Buffer[] = []; let length = 0;
            for await (const chunk of req) { length += chunk.length; if (length > 6 * 1024 * 1024) throw new Error('REQUEST_TOO_LARGE'); chunks.push(Buffer.from(chunk)); }
            const body = Buffer.concat(chunks);
            let requestIdentity: { requestId: string; snapshotId: string } | undefined;
            if (exchange) {
              const parsed = VisionPlannerRequestSchema.parse(JSON.parse(body.toString('utf8')));
              const snapshot = parsed.request.payload.snapshot;
              // Never persist a failing snapshot, validation exception, request headers or complete response.
              if (/PRIVATE_/i.test(JSON.stringify(parsed.request))) throw new Error('PRIVATE_SNAPSHOT_REJECTED');
              exchange.publicSnapshotSafe = true;
              if (snapshot.origin !== benefitsOrigin || JSON.stringify(visualRelationCandidates(snapshot, snapshot.goalRef)) !== JSON.stringify(parsed.request.capturePlan.refs)) throw new Error('CANDIDATE_ASSERTION_FAILED');
              exchange.candidateRefsMatch = true;
              const png = Buffer.from(parsed.image.dataUrl.slice(22), 'base64');
              exchange.pixelCounts = inspectMaskedPng(png, parsed.image.width, parsed.image.height);
              exchange.imageSha256 = sha256(png); exchange.width = parsed.image.width; exchange.height = parsed.image.height;
              exchange.controlCount = snapshot.controls.length; exchange.noticeCount = snapshot.notices.length;
              exchange.publicSnapshotSha256 = sha256(JSON.stringify(snapshot));
              const { refs, crop, publicRegions, privateMasks, viewport } = parsed.request.capturePlan;
              exchange.capture = { refs, crop, publicRegions, privateMasks, viewport };
              exchange.imageFile = `vision-${exchange.sequence}-masked.png`;
              await writeFile(resolve(runDir!, exchange.imageFile), png, { mode: 0o600, flag: 'wx' });
              requestIdentity = { requestId: snapshot.requestId, snapshotId: snapshot.snapshotId };
            }
            // Authentication and Origin are forwarded unchanged, in memory only.
            const headers = Object.fromEntries(Object.entries(req.headers).filter(([key, value]) =>
              !['host','connection','content-length','transfer-encoding','accept-encoding'].includes(key) && typeof value === 'string')) as Record<string, string>;
            const upstream = await fetch(`http://127.0.0.1:${PORTS.planner}${path}`, { method: req.method, headers,
              body: ['GET','HEAD'].includes(req.method ?? '') ? undefined : body, signal: controller.signal, redirect: 'error' });
            const result = await upstream.text();
            if (exchange) {
              exchange.status = upstream.status;
              let json: unknown; try { json = JSON.parse(result); } catch { /* fixed code below */ }
              const response = VisionPlannerResponseSchema.safeParse(json);
              if (response.success) {
                exchange.transport = response.data.transport; exchange.mode = response.data.mode; exchange.durationMs = response.data.durationMs;
                exchange.responseMatchesRequest = response.data.requestId === requestIdentity?.requestId && response.data.snapshotId === requestIdentity?.snapshotId;
                if (!exchange.responseMatchesRequest) exchange.error = 'RESPONSE_ID_MISMATCH';
                else if (response.data.mode !== 'LIVE_CODEX') exchange.error = 'LIVE_MODE_REQUIRED';
              } else {
                const error = ErrorCodeSchema.safeParse((json as { error?: unknown } | undefined)?.error);
                exchange.error = error.success ? error.data : 'INVALID_RESPONSE';
              }
            }
            for (const key of ['content-type','access-control-allow-origin','access-control-allow-methods','access-control-allow-headers','vary','cache-control']) {
              const value = upstream.headers.get(key); if (value) res.setHeader(key, value);
            }
            if (!res.destroyed) res.writeHead(upstream.status).end(result);
          } catch (error) {
            const safeCodes = ['PNG_UNSUPPORTED','PNG_INVALID','MASK_ASSERTION_FAILED','PRIVATE_SNAPSHOT_REJECTED','CANDIDATE_ASSERTION_FAILED','REQUEST_TOO_LARGE'];
            if (exchange) exchange.error = error instanceof Error && safeCodes.includes(error.message) ? error.message : controller.signal.aborted ? 'CANCELLED_OR_TIMEOUT' : 'PROXY_FAILED';
            if (!res.destroyed) { res.setHeader('access-control-allow-origin', `chrome-extension://${EXTENSION_ID}`); res.writeHead(502, { 'content-type': 'application/json' }).end('{"error":"PROVIDER_ERROR"}'); }
          } finally {
            clearTimeout(timer); controllers.delete(controller);
            if (exchange) { exchange.roundTripMs = Math.round(performance.now() - started); await checkpoint(); console.log(`Vision exchange ${exchange.sequence}: ${exchange.error ?? `${exchange.transport}/${exchange.mode}`} (${exchange.roundTripMs}ms).`); }
          }
        })();
        pending.add(task); void task.catch(() => { exitReason = 'EVIDENCE_WRITE_FAILED'; stop(); }).finally(() => pending.delete(task));
      });
      await new Promise<void>((done, reject) => { proxy!.once('error', reject); proxy!.listen(PROXY_PORT, '127.0.0.1', done); });
    }
    if (ending) return;
    context = await chromium.launchPersistentContext(resolve(runDir, 'profile'), {
      channel: 'chromium', headless: false, viewport: null,
      args: [`--disable-extensions-except=${resolve(root, 'dist/extension')}`, `--load-extension=${resolve(root, 'dist/extension')}`],
    });
    context.setDefaultTimeout(10000);
    context.setDefaultNavigationTimeout(15000);
    context.on('close', stop);
    const options = await context.newPage();
    await options.goto(`chrome-extension://${EXTENSION_ID}/options.html`);
    await options.locator('summary').filter({ hasText: '도우미 주소 바꾸기' }).click();
    await options.getByLabel('도우미 주소', { exact: true }).fill(`http://127.0.0.1:${useProxy ? PROXY_PORT : PORTS.planner}`);
    await options.getByLabel('연결 토큰', { exact: true }).fill(system.credentials.plannerToken);
    await options.getByRole('button', { name: '연결하기', exact: true }).click();
    await options.locator('.fl-status').filter({ hasText: '도우미와 연결됐어요' }).waitFor({ state: 'visible', timeout: 10000 });
    await options.close();
    const page = await context.newPage();
    if (mode === 'vision') await page.route(`${benefitsOrigin}/vision-qa`, async route => {
      if (route.request().method() !== 'GET') { await route.fulfill({ status: 405, body: 'Synthetic visual QA does not submit.' }); return; }
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'cache-control': 'no-store' }, body: visionHtml });
    });
    const url = `${benefitsOrigin}/${mode === 'vision' ? 'vision-qa' : 'login'}`;
    await page.goto(url); await page.bringToFront();
    state = 'READY_FOR_LEAD'; await checkpoint();
    console.log(`MANUAL QA READY (${mode}, LIVE_CODEX)\nSource: ${url}\nCulture: http://127.0.0.1:${PORTS.culture}\nEvidence: ${runDir}/checkpoint.json\nNative Chrome toolbar → FLECTO (or macOS Command+Shift+Y). Never broker.activate.\n${mode === 'vision' ? 'Select 화면 배치 도움: 입력 내용 확인 directly. Inspect masked PNG + VISION/LIVE_CODEX response and the rendered UI.' : 'Log in manually using the repository synthetic demo account; open /apply. Use the OS Korean IME and Chrome menu zoom 200%.'}\nTerminal markers: activation|vision-ui|ime|zoom|focus|source-values pass|fail; checkpoint; quit. Ctrl+C closes ONLY this run.`);
    terminal = createInterface({ input: process.stdin, terminal: false });
    terminal.on('line', line => {
      const value = line.trim();
      if (value === 'diagnostics') {
        void (async () => {
          const worker = context!.serviceWorkers()[0];
          // A literal evaluation avoids transpiler helper closures inside nested injected functions.
          diagnostics = await worker.evaluate(`(async () => {
            const broker = globalThis[Symbol.for('flecto.background')];
            const tab = (await chrome.tabs.query({})).find(t => t.url === ${JSON.stringify(page.url())});
            let content = null;
            if (tab && tab.id !== undefined) {
              const results = await chrome.scripting.executeScript({ target: { tabId: tab.id },
                func: function () { return globalThis.__flectoController?.lastVisionDiagnostic ?? null; } });
              content = results[0]?.result ?? null;
            }
            return { background: broker?.lastVisionDiagnostic ?? null, content };
          })()`);
          console.log(JSON.stringify(diagnostics)); await checkpoint();
        })().catch(() => console.log('Bounded diagnostics unavailable'));
        return;
      }
      if (value === 'quit') { stop(); return; }
      const match = /^(activation|vision-ui|ime|zoom|focus|source-values) (pass|fail)$/.exec(value);
      if (match) observations[match[1]] = match[2] === 'pass' ? 'PASS_MANUAL_REPORTED' : 'FAIL_MANUAL_REPORTED';
      if (match || value === 'checkpoint') void checkpoint().catch(() => { exitReason = 'EVIDENCE_WRITE_FAILED'; stop(); });
      else console.log('Use a listed marker or checkpoint/quit. Free text is not saved.');
    });
    // stdin EOF is not shutdown: a lead may operate a detached terminal through CUA.
    await lifetime;
  } catch {
    exitReason = 'STARTUP_OR_RUNTIME_FAILED'; process.exitCode = 1;
    console.error('Manual QA failed; no raw error/headers/body logged. Check Node 24, fresh build, reserved ports, existing product login, and installed Chromium.');
  } finally {
    ending = true; terminal?.close();
    await context?.close().catch(() => {});
    for (const controller of controllers) controller.abort();
    if (proxy) { proxy.closeAllConnections(); await new Promise<void>(done => proxy!.close(() => done())); }
    await Promise.allSettled([...pending]);
    await system?.close();
    if (system && runDir) {
      try {
        const images = await Promise.all(exchanges.filter(item => item.imageFile).map(item => readFile(resolve(runDir!, item.imageFile!))));
        storageAudit = await auditPlannerStorage(resolve(runDir, 'system/planner'), images);
      } catch { exitReason = 'STORAGE_AUDIT_FAILED'; }
    }
    try { artifactAfter = await readVerifiedArtifact(root); } catch { artifactAfter = null; }
    state = 'STOPPED'; await checkpoint();
    await unlink(lockPath);
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}

void main().catch((error: unknown) => {
  const known = ['INVALID_ARGUMENTS','NODE_24_REQUIRED','RUN_FROM_THIS_CHECKOUT','DISABLE_VERBOSE_DEBUG_FOR_PRIVATE_QA','UNSAFE_QA_DIRECTORY'];
  const reason = error instanceof Error && known.includes(error.message) ? error.message : 'PREREQUISITE_OR_CLEANUP_FAILED';
  console.error(`Manual QA: ${reason}. Check --help, fresh build and owned run lock; no raw errors or secrets logged.`);
  process.exitCode = 1;
});
