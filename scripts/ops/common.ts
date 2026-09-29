import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { relative, isAbsolute, sep } from 'node:path';

/** Repository root of this checkout (scripts/ops/ -> ../../). */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');

export type RunResult = { code: number | null; signal: string | null; stdout: string; stderr: string; spawnError?: string; timedOut: boolean };

/**
 * Runs a program with an argument vector (never a shell string). Output is returned to the caller;
 * callers decide what is safe to print.
 */
export function runFile(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number; input?: string; env?: NodeJS.ProcessEnv } = {}): Promise<RunResult> {
  return new Promise((done) => {
    const child = execFile(cmd, args, {
      cwd: opts.cwd, timeout: opts.timeoutMs ?? 15000, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8', env: opts.env ?? process.env,
    }, (error, stdout, stderr) => {
      const err = error as (NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: number | string }) | null;
      if (!err) { done({ code: 0, signal: null, stdout, stderr, timedOut: false }); return; }
      const numeric = typeof err.code === 'number' ? err.code : null;
      done({
        code: numeric, signal: err.signal ?? null, stdout: stdout ?? '', stderr: stderr ?? '', timedOut: !!err.killed && numeric === null,
        spawnError: typeof err.code === 'string' ? err.code : undefined,
      });
    });
    if (opts.input !== undefined) child.stdin?.end(opts.input); else child.stdin?.end();
  });
}

/** Streams stdin to a program (e.g. zip -@ file lists) with a hard deadline. */
export function runWithInput(cmd: string, args: string[], input: string, cwd: string, timeoutMs = 120000): Promise<RunResult> {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; }); child.stderr.on('data', (d) => { stderr += d; });
    child.once('error', (e) => { clearTimeout(timer); done({ code: null, signal: null, stdout, stderr, timedOut, spawnError: (e as NodeJS.ErrnoException).code ?? 'ERROR' }); });
    child.once('close', (code, signal) => { clearTimeout(timer); done({ code, signal, stdout, stderr, timedOut }); });
    child.stdin.end(input);
  });
}

export const sha256 = (data: string | Buffer | Uint8Array): string => createHash('sha256').update(data).digest('hex');
export const sha256File = async (path: string): Promise<string> => sha256(await readFile(path));

/** Deterministic JSON with sorted object keys, used for identity hashes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

/** True when child is the same as or inside parent (both already resolved through symlinks). */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel));
}

export async function realpathOrNull(path: string): Promise<string | null> {
  try { return await realpath(path); } catch { return null; }
}

/** Classifies a pid with signal 0 (no signal is delivered). */
export function pidState(pid: unknown): 'alive' | 'dead' | 'foreign' | 'invalid' {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 1) return 'invalid';
  try { process.kill(pid, 0); return 'alive'; } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ESRCH' ? 'dead' : code === 'EPERM' ? 'foreign' : 'invalid';
  }
}
