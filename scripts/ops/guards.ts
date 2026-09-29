import { spawn } from 'node:child_process';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runFile } from './common';

/** Paths no worker patch may touch without the lead (AGENTS.md, ops/04). Protected wins over allowed. */
export const DEFAULT_PROTECTED = [
  'package.json', 'package-lock.json', 'AGENTS.md', 'CLAUDE.md', '01_DECISIONS.md', 'packages/contracts/**', 'spec/**', 'ops/**',
  'state/**', 'archive/**', 'sources/**', 'scripts/system.ts', 'scripts/check-repository.mjs', '.github/**', 'node_modules', 'node_modules/**',
];

export function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '*' && pattern[i + 1] === '*') { out += '.*'; i++; if (pattern[i + 1] === '/') i++; }
    else if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else out += ch.replace(/[.+^$(){}|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + out + '$');
}
const matchesAny = (path: string, patterns: readonly string[]) => patterns.some((p) => globToRegExp(p).test(path));

export type FileChange = { status: string; path: string };
export type Violation = { path: string; reason: string };

/** OPER09: every changed path must be inside the lease scope and outside protected paths; tests may not be removed. */
export function scopeViolations(changes: FileChange[], allowed: readonly string[], protectedPaths: readonly string[] = DEFAULT_PROTECTED): Violation[] {
  const out: Violation[] = [];
  for (const c of changes) {
    if (matchesAny(c.path, protectedPaths)) out.push({ path: c.path, reason: 'protected path' });
    else if (!matchesAny(c.path, allowed)) out.push({ path: c.path, reason: 'outside lease scope' });
    if (c.status.startsWith('D') && /^tests\//.test(c.path)) out.push({ path: c.path, reason: 'test file removed' });
  }
  return out;
}

const FOCUS_OR_SKIP = /^\+(?!\+\+).*\b(?:it|test|describe)\.(?:only|skip|todo)\s*\(|^\+(?!\+\+).*\b(?:xit|xdescribe|fit|fdescribe)\s*\(/m;

/** OPER10 at patch level: added focused/skipped tests are rejected before integration. */
export function addedFocusOrSkip(diffText: string): boolean { return FOCUS_OR_SKIP.test(diffText); }

async function git(repo: string, args: string[], input?: string): Promise<string> {
  const r = await runFile('git', ['-C', repo, ...args], { timeoutMs: 30000, input });
  if (r.code !== 0) throw new Error('git ' + args[0] + ' failed');
  return r.stdout;
}

export async function changedFiles(repo: string, base: string, head: string): Promise<FileChange[]> {
  const out = await git(repo, ['diff', '--name-status', '--no-renames', '-z', base, head, '--']);
  const parts = out.split('\0').filter(Boolean);
  const changes: FileChange[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) changes.push({ status: parts[i]!, path: parts[i + 1]! });
  return changes;
}

/** Stable content identity of base..head, independent of commit metadata (OPER05). */
export async function patchId(repo: string, base: string, head: string): Promise<string | null> {
  const diff = await git(repo, ['diff', '--binary', base, head, '--']);
  if (!diff.trim()) return null;
  const id = (await git(repo, ['patch-id', '--stable'], diff)).trim().split(/\s+/)[0];
  return id || null;
}

async function withFileLock<T>(target: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const lockPath = target + '.lock';
  let handle;
  for (let attempt = 0; ; attempt++) {
    try { handle = await open(lockPath, 'wx', 0o600); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 100) throw new Error('ledger lock busy: ' + lockPath);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  try { return await fn(); } finally { await handle.close(); await unlink(lockPath).catch(() => {}); }
}
async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw new Error('unreadable ledger ' + path);
  }
}
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tmp = path + '.' + process.pid + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(tmp, path);
}

export type IntegrationEntry = { patchId: string; task: string; generation: number; head: string; at: string };
/** Records an integration; returns 'duplicate' without writing when the same patch content was already integrated. */
export async function recordIntegration(ledgerPath: string, entry: IntegrationEntry): Promise<'recorded' | 'duplicate'> {
  return withFileLock(ledgerPath, async () => {
    const ledger = await readJson<IntegrationEntry[]>(ledgerPath, []);
    if (ledger.some((e) => e.patchId === entry.patchId)) return 'duplicate';
    ledger.push(entry); await writeJsonAtomic(ledgerPath, ledger); return 'recorded';
  });
}
export async function isIntegrated(ledgerPath: string, id: string): Promise<boolean> {
  return (await readJson<IntegrationEntry[]>(ledgerPath, [])).some((e) => e.patchId === id);
}

export type Lease = { task: string; owner: string; generation: number; issuedAt: string; expiresAt: string; paths: string[] };
const leasePath = (dir: string, task: string) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(task)) throw new Error('invalid task id');
  return resolve(dir, task + '.json');
};
/** Issues a new lease generation; any older generation's handoff becomes stale (OPER04). */
export async function issueLease(dir: string, task: string, owner: string, paths: string[], ttlMs: number, now = new Date()): Promise<Lease> {
  const path = leasePath(dir, task);
  return withFileLock(path, async () => {
    const previous = await readJson<Lease | null>(path, null);
    const lease: Lease = { task, owner, generation: (previous?.generation ?? 0) + 1, issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttlMs).toISOString(), paths };
    await writeJsonAtomic(path, lease); return lease;
  });
}
export type HandoffCheck = { ok: true; lease: Lease } | { ok: false; reason: string };
export async function checkHandoff(dir: string, handoff: { task: string; generation: number; owner: string }, now = new Date()): Promise<HandoffCheck> {
  let lease: Lease | null;
  try { lease = await readJson<Lease | null>(leasePath(dir, handoff.task), null); } catch { return { ok: false, reason: 'lease unreadable' }; }
  if (!lease) return { ok: false, reason: 'no lease for task' };
  if (lease.generation !== handoff.generation) return { ok: false, reason: 'stale generation ' + handoff.generation + ' (current ' + lease.generation + ')' };
  if (lease.owner !== handoff.owner) return { ok: false, reason: 'owner mismatch' };
  if (Date.parse(lease.expiresAt) <= now.getTime()) return { ok: false, reason: 'lease expired' };
  return { ok: true, lease };
}

export type BoundedResult = { code: number | null; signal: string | null; timedOut: boolean; stdoutTail: string; stderrTail: string; durationMs: number };
/**
 * Runs a command in its own process group with a hard deadline (OPER02/OPER06). On deadline, or if the
 * command leaves descendants behind, only that group is signalled (TERM, then KILL after graceMs).
 * Processes outside the group are never signalled (OPER08).
 */
export function runBounded(cmd: string, args: string[], opts: { deadlineMs: number; graceMs?: number; cwd?: string; env?: NodeJS.ProcessEnv; tailBytes?: number }): Promise<BoundedResult> {
  const started = Date.now(); const tail = opts.tailBytes ?? 64 * 1024; const grace = opts.graceMs ?? 1500;
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let timedOut = false; let finished = false;
    const keep = (s: string) => (s.length > tail ? s.slice(-tail) : s);
    child.stdout.on('data', (d) => { stdout = keep(stdout + d); }); child.stderr.on('data', (d) => { stderr = keep(stderr + d); });
    const group = child.pid;
    const signalGroup = (sig: NodeJS.Signals) => { if (group) { try { process.kill(-group, sig); } catch { /* group already gone */ } } };
    const groupAlive = () => { if (!group) return false; try { process.kill(-group, 0); return true; } catch { return false; } };
    const reap = async () => {
      if (!groupAlive()) return;
      signalGroup('SIGTERM');
      const until = Date.now() + grace;
      while (groupAlive() && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
      if (groupAlive()) signalGroup('SIGKILL');
    };
    const timer = setTimeout(() => { timedOut = true; void reap(); }, opts.deadlineMs);
    const closed = new Promise<void>((r) => child.once('close', () => r()));
    const finish = async (code: number | null, signal: string | null) => {
      if (finished) return; finished = true; clearTimeout(timer);
      // Descendants left in the group (possibly holding our pipes) are ours to stop.
      await reap();
      await Promise.race([closed, new Promise((r) => setTimeout(r, 1000))]);
      done({ code, signal, timedOut, stdoutTail: stdout, stderrTail: stderr, durationMs: Date.now() - started });
    };
    child.once('error', () => { void finish(null, null); });
    child.once('exit', (code, signal) => { void finish(code, signal); });
  });
}
