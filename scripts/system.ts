import { fork, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { DEFAULT_PORTS } from '@flecto/contracts';

export type SystemOptions = {
  mode: 'FIXTURE' | 'LIVE_CODEX'; namespace: 'QA' | 'DEMO'; dataDir: string;
  ports?: { planner: number; benefits: number; culture: number };
  model?: string; codexBinary?: string; faultDelayMs?: number; faultProviderError?: boolean;
};
type PrivateConfig = { plannerToken: string; benefitsToken: string; cultureToken: string; benefitsSecret: string; cultureSecret: string };
export type RunningSystem = {
  ports: typeof DEFAULT_PORTS | { planner: number; benefits: number; culture: number };
  credentials: PrivateConfig; children: ChildProcess[]; close(): Promise<void>;
};
const random = () => randomBytes(32).toString('hex');
export function codexBinary(): string {
  if (process.env.FLECTO_CODEX_BIN) return process.env.FLECTO_CODEX_BIN;
  const bundled = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
  return existsSync(bundled) ? bundled : 'codex';
}

export async function startSystem(options: SystemOptions): Promise<RunningSystem> {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dataDir = resolve(options.dataDir); await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const lockPath = resolve(dataDir, 'run.lock'); const lockNonce = random();
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch {
    let previous: { pid: number; nonce: string };
    try { previous = JSON.parse(await readFile(lockPath, 'utf8')); } catch { throw new Error('Run lock exists and cannot be safely verified'); }
    try { process.kill(previous.pid, 0); throw new Error('FLECTO is already running in this namespace'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    const unchanged = JSON.parse(await readFile(lockPath, 'utf8'));
    if (unchanged.nonce !== previous.nonce) throw new Error('Run lock changed during recovery');
    await unlink(lockPath); lock = await open(lockPath, 'wx', 0o600);
  }
  await lock.writeFile(JSON.stringify({ pid: process.pid, nonce: lockNonce, namespace: options.namespace })); await lock.close();
  const privatePath = resolve(dataDir, 'private-config.json');
  let credentials: PrivateConfig;
  if (existsSync(privatePath)) credentials = JSON.parse(await readFile(privatePath, 'utf8'));
  else {
    credentials = { plannerToken: random(), benefitsToken: random(), cultureToken: random(), benefitsSecret: random(), cultureSecret: random() };
    await writeFile(privatePath, JSON.stringify(credentials), { mode: 0o600 });
  }
  const ports = options.ports ?? DEFAULT_PORTS;
  const commonEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    LANG: process.env.LANG ?? 'en_US.UTF-8', FLECTO_NAMESPACE: options.namespace,
  };
  const children: ChildProcess[] = [];
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    await Promise.all(children.map((child) => new Promise<void>((done) => {
      if (child.exitCode !== null || child.signalCode !== null) { done(); return; }
      const timer = setTimeout(() => { child.kill('SIGKILL'); }, 2500); timer.unref();
      child.once('exit', () => { clearTimeout(timer); done(); }); child.kill('SIGTERM');
    })));
    try { const current = JSON.parse(await readFile(lockPath, 'utf8')); if (current.nonce === lockNonce) await unlink(lockPath); } catch { /* only our lock is removable */ }
  };
  try {
    for (const role of ['planner', 'benefits', 'culture'] as const) {
      const dir = resolve(dataDir, role); await mkdir(dir, { recursive: true, mode: 0o700 });
      const env: NodeJS.ProcessEnv = { ...commonEnv, FLECTO_DATA_DIR: dir, FLECTO_PORT: String(ports[role]) };
      if (role === 'planner') Object.assign(env, {
        CODEX_HOME: process.env.CODEX_HOME,
        FLECTO_TOKEN: credentials.plannerToken,
        FLECTO_PROVIDER: options.mode === 'LIVE_CODEX' ? 'codex' : 'fixture',
        FLECTO_MODEL: options.model ?? 'gpt-6-luna', FLECTO_CODEX_BIN: options.codexBinary ?? codexBinary(),
        FLECTO_SOURCE_ORIGINS: `http://127.0.0.1:${ports.benefits},http://127.0.0.1:${ports.culture}`,
        FLECTO_FAULT_DELAY_MS: String(options.faultDelayMs ?? 0), FLECTO_FAULT_PROVIDER_ERROR: options.faultProviderError ? '1' : '0',
      });
      else Object.assign(env, { FLECTO_SESSION_SECRET: role === 'benefits' ? credentials.benefitsSecret : credentials.cultureSecret,
        FLECTO_QA_TOKEN: role === 'benefits' ? credentials.benefitsToken : credentials.cultureToken });
      const child = fork(resolve(root, 'scripts/services.ts'), [role], {
        execPath: process.execPath, execArgv: ['--import', 'tsx'], env, cwd: root,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      children.push(child);
      // Service logs stay local and are not model prompts or release inputs.
      child.stdout?.on('data', () => {}); child.stderr?.on('data', () => {});
      await new Promise<void>((ready, reject) => {
        const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`${role} startup timed out`)); }, 15000);
        const onExit = (code: number | null) => { clearTimeout(timer); reject(new Error(`${role} startup failed (exit ${code ?? 'signal'})`)); };
        child.once('exit', onExit); child.once('error', reject);
        child.on('message', (message) => {
          if ((message as { type?: string }).type === 'ready') { clearTimeout(timer); child.removeListener('exit', onExit); ready(); }
        });
      });
    }
    await writeFile(resolve(dataDir, 'connection.txt'), `FLECTO ${options.mode}\nhttp://127.0.0.1:${ports.planner}\n${credentials.plannerToken}\n`, { mode: 0o600 });
    return { ports, credentials, children, close };
  } catch (error) { await close(); throw error; }
}
