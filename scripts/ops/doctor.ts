import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { DEFAULT_PORTS } from '@flecto/contracts';
import { inspectBuild } from './build-check';
import { pidState, runFile } from './common';

export type Level = 'OK' | 'INFO' | 'WARN' | 'FAIL';
export type Check = { id: string; level: Level; message: string };
export type DoctorOptions = { root: string; ports?: { planner: number; benefits: number; culture: number }; env?: NodeJS.ProcessEnv };

const BUNDLED_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';

/** Resolves true when something accepts TCP connections on 127.0.0.1:port. Read-only probe. */
export function portInUse(port: number, timeoutMs = 600): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (value: boolean) => { socket.destroy(); done(value); };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

export type LockInfo = { state: 'absent' | 'unreadable' | 'alive' | 'dead' | 'foreign' | 'invalid'; pid?: number; namespace?: string };
export async function readRunLock(dataDir: string): Promise<LockInfo> {
  let raw: string;
  try { raw = await readFile(resolve(dataDir, 'run.lock'), 'utf8'); } catch { return { state: 'absent' }; }
  try {
    const parsed = JSON.parse(raw) as { pid?: unknown; namespace?: unknown };
    const state = pidState(parsed.pid);
    return { state, pid: typeof parsed.pid === 'number' ? parsed.pid : undefined, namespace: typeof parsed.namespace === 'string' ? parsed.namespace : undefined };
  } catch { return { state: 'unreadable' }; }
}

/**
 * Read-only environment check. Never prints file contents, tokens, env values or auth state;
 * never starts, stops or signals processes.
 */
export async function runDoctor(options: DoctorOptions): Promise<Check[]> {
  const { root } = options;
  const env = options.env ?? process.env;
  const ports = options.ports ?? DEFAULT_PORTS;
  const checks: Check[] = [];
  const add = (id: string, level: Level, message: string) => checks.push({ id, level, message });

  const major = Number(process.versions.node.split('.')[0]);
  add('node.runtime', major === 24 ? 'OK' : 'FAIL', 'running on Node v' + process.versions.node + (major === 24 ? '' : ' (package engines require >=24 <25)'));
  const pathNode = await runFile('node', ['--version'], { timeoutMs: 8000 });
  if (pathNode.code !== 0) add('node.path', 'FAIL', 'node not found on PATH (source .flecto/env.sh or add the Node 24 toolchain bin)');
  else {
    const v = pathNode.stdout.trim();
    add('node.path', v.startsWith('v24.') ? 'OK' : 'FAIL', 'PATH node ' + v + (v.startsWith('v24.') ? '' : ' (npm scripts use PATH node; need v24)'));
  }
  const npm = await runFile('npm', ['--version'], { timeoutMs: 15000 });
  add('npm', npm.code === 0 ? 'OK' : 'FAIL', npm.code === 0 ? 'npm ' + npm.stdout.trim() : 'npm not runnable from PATH');

  const head = await runFile('git', ['-C', root, 'rev-parse', '--short=12', 'HEAD'], { timeoutMs: 8000 });
  if (head.code !== 0) add('git', 'FAIL', 'git missing or root is not a git checkout');
  else {
    const dirty = await runFile('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { timeoutMs: 15000 });
    const count = dirty.stdout.split('\n').filter(Boolean).length;
    add('git', count ? 'WARN' : 'OK', 'HEAD ' + head.stdout.trim() + (count ? ', ' + count + ' tracked file(s) modified (release grade is capped to UNVERIFIED while dirty)' : ', tracked tree clean'));
  }
  const zip = await runFile('zip', ['-v'], { timeoutMs: 8000 });
  add('zip', zip.code === 0 ? 'OK' : 'WARN', zip.code === 0 ? 'system zip available for release:pack' : 'zip not found; release:pack cannot create archives');

  const missingBins = ['tsx', 'vite', 'vitest'].filter((b) => !existsSync(resolve(root, 'node_modules/.bin', b)));
  if (!existsSync(resolve(root, 'node_modules'))) add('deps', 'FAIL', 'node_modules missing (npm ci)');
  else add('deps', missingBins.length ? 'FAIL' : 'OK', missingBins.length ? 'missing node_modules/.bin: ' + missingBins.join(', ') : 'node_modules present (tsx, vite, vitest)');

  for (const rel of ['.flecto/demo/private-config.json', '.flecto/demo/connection.txt']) {
    try {
      const info = await stat(resolve(root, rel));
      const broad = (info.mode & 0o077) !== 0;
      add('private.' + rel.split('/').pop(), broad ? 'FAIL' : 'OK', rel + (broad ? ' is readable by other users; run chmod 600 on it' : ' present, owner-only permissions') + ' (contents not read)');
    } catch { add('private.' + rel.split('/').pop(), 'INFO', rel + ' absent (created by npm run demo:start)'); }
  }

  const build = await inspectBuild(root);
  if (build.extension.ok) add('build.extension', 'OK', 'dist/extension matches dist/extension-hashes.json (build ' + build.extension.buildSha256!.slice(0, 12) + ', manifest v' + (build.extension.manifestVersion ?? '?') + ')');
  else add('build.extension', 'FAIL', build.extension.problems.join('; '));
  add('build.culture', build.culture.ok ? 'OK' : 'FAIL', build.culture.ok ? 'apps/demo-culture/dist has ' + build.culture.files.length + ' asset file(s)' : build.culture.problems.join('; '));

  const codex = env.FLECTO_CODEX_BIN || (existsSync(BUNDLED_CODEX) ? BUNDLED_CODEX : '');
  add('codex.binary', codex && existsSync(codex) ? 'OK' : 'WARN', codex && existsSync(codex) ? 'Codex CLI binary present (not executed; login state not checked)' : 'Codex CLI binary not found; only FIXTURE mode can run');

  const lock = await readRunLock(resolve(root, '.flecto/demo'));
  if (lock.state === 'dead') add('demo.lock', 'WARN', 'stale DEMO run.lock (pid ' + lock.pid + ' not running); demo:start recovers it');
  else if (lock.state === 'unreadable' || lock.state === 'invalid') add('demo.lock', 'WARN', 'DEMO run.lock cannot be verified; demo:start will refuse until it is inspected');
  else if (lock.state === 'foreign') add('demo.lock', 'WARN', 'DEMO run.lock pid ' + lock.pid + ' belongs to another user');
  else if (lock.state === 'alive') add('demo.lock', 'INFO', 'DEMO system running (pid ' + lock.pid + ')');
  for (const [role, port] of Object.entries(ports)) {
    const used = await portInUse(port);
    if (!used) add('port.' + role, lock.state === 'alive' ? 'WARN' : 'OK', port + (lock.state === 'alive' ? ' closed although DEMO lock is held' : ' free'));
    else if (lock.state === 'alive' && lock.namespace === 'DEMO') add('port.' + role, 'INFO', port + ' in use by the running DEMO system (lock pid ' + lock.pid + ')');
    else add('port.' + role, 'FAIL', port + ' is occupied by a process without a FLECTO DEMO lock; demo:start will fail. doctor does not stop other processes');
  }
  return checks;
}

export function formatChecks(checks: Check[]): string {
  const lines = checks.map((c) => '[' + c.level + ']' + ' '.repeat(5 - c.level.length) + c.id + ': ' + c.message);
  const fails = checks.filter((c) => c.level === 'FAIL').length; const warns = checks.filter((c) => c.level === 'WARN').length;
  lines.push('', fails ? 'doctor: ' + fails + ' FAIL, ' + warns + ' WARN' : 'doctor: no FAIL (' + warns + ' WARN)');
  return lines.join('\n');
}
