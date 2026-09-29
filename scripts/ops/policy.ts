import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Release allowlist. Only git-tracked files under these prefixes (or listed root files) are packaged,
 * and only when no deny rule matches. Build output is added separately from the verified build.
 */
export const SOURCE_PREFIXES = ['apps/', 'packages/', 'scripts/', 'tests/', 'spec/', 'ops/', 'docs/', 'evidence/'];
export const ROOT_FILES = ['package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts', 'playwright.live.config.ts', '.nvmrc', 'README.md', '01_DECISIONS.md'];

const DENY_SEGMENTS = new Set(['node_modules', '.flecto', '.git', '.local', '.cache', 'coverage', 'test-results', 'playwright-report', 'browser-profiles', 'user-data-dir', 'runtime', 'profiles', 'raw-prompts', 'rollouts', 'logs', 'state', 'dist']);
const DENY_NAMES = [
  /^\.env(\..+)?$/i, /^auth\.json$/i, /^credentials\.json$/i, /^private-config\.json$/i, /^connection\.txt$/i, /^run\.lock$/i,
  /^cookies?(\..*)?$/i, /^login data$/i, /^\.(npmrc|netrc|pypirc)$/i, /^id_(rsa|ed25519|ecdsa)(\.pub)?$/i,
  /\.(pem|key|p12|pfx|keychain|keychain-db)$/i, /\.(db|sqlite3?)(-.+)?$/i, /\.(log|jsonl)$/i, /prompt.*\.(txt|log|jsonl|raw)$/i,
];
const ALLOW_NAMES = [/^\.env(\..+)?\.example$/i];

/** Returns why a repo-relative path must never be packaged, or null. */
export function denyReason(path: string): string | null {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some((s) => s === '..' || s === '' || s === '.')) return 'unsafe path';
  const segments = path.split('/');
  const name = segments[segments.length - 1]!;
  for (const seg of segments.slice(0, -1)) if (DENY_SEGMENTS.has(seg.toLowerCase())) return 'denied directory ' + seg;
  if (ALLOW_NAMES.some((r) => r.test(name))) return null;
  for (const rule of DENY_NAMES) if (rule.test(name)) return 'denied file name';
  return null;
}

export function isAllowlistedSource(path: string): boolean {
  if (denyReason(path)) return false;
  return ROOT_FILES.includes(path) || SOURCE_PREFIXES.some((p) => path.startsWith(p));
}

const PATTERNS: Array<[string, RegExp]> = [
  ['private-key-block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['openai-key', /(?<![A-Za-z0-9_-])sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/],
  ['github-token', /(?<![A-Za-z0-9])(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/],
  ['github-pat', /github_pat_[A-Za-z0-9_]{50,}/],
  ['slack-token', /xox[abprs]-[A-Za-z0-9-]{20,}/],
  ['aws-access-key', /(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])/],
  ['oauth-token-field', /"(?:refresh_token|access_token|id_token)"\s*:\s*"[^"\s]{20,}"/],
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

/** Pattern names found in content. Never returns the matched values. */
export function secretFindings(content: Buffer | string, knownSecrets: readonly string[] = []): string[] {
  const text = typeof content === 'string' ? content : content.toString('latin1');
  const found: string[] = [];
  for (const [name, re] of PATTERNS) if (re.test(text)) found.push(name);
  if (knownSecrets.some((s) => s.length >= 16 && text.includes(s))) found.push('local-runtime-secret');
  return found;
}

const SECRETISH_ENV = /(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|AUTH|COOKIE|SESSION)/i;

/**
 * Collects exact local secret values, held in memory only, to scan packaged content for leaks:
 * values of .flecto/<dir>/private-config.json (one extra level deep) and secret-looking env values.
 */
export async function collectKnownSecrets(root: string, env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const values = new Set<string>();
  const addConfig = async (path: string) => {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8'));
      if (parsed && typeof parsed === 'object') for (const v of Object.values(parsed)) if (typeof v === 'string' && v.length >= 16) values.add(v);
    } catch { /* absent or unreadable config has no values to scan for */ }
  };
  const flecto = resolve(root, '.flecto');
  try {
    for (const entry of await readdir(flecto, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      await addConfig(resolve(flecto, entry.name, 'private-config.json'));
      try {
        for (const sub of await readdir(resolve(flecto, entry.name), { withFileTypes: true })) if (sub.isDirectory()) await addConfig(resolve(flecto, entry.name, sub.name, 'private-config.json'));
      } catch { /* not listable */ }
    }
  } catch { /* no runtime dir */ }
  for (const [key, value] of Object.entries(env)) if (SECRETISH_ENV.test(key) && typeof value === 'string' && value.length >= 16) values.add(value);
  return [...values];
}
