import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean);
const tracked = new Set(files);
const errors = [];
const fail = (file, reason) => errors.push(`${file}: ${reason}`);
const read = (file) => readFileSync(resolve(root, file), 'utf8');

const required = [
  'README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'IMPLEMENTATION_PLAN.md',
  'package.json', 'package-lock.json', '.gitignore', '.nvmrc',
  '.github/workflows/repository-check.yml', 'state/REPOSITORY_SETUP.md',
  'spec/02_CONTRACTS.md', 'ops/01_TASK_GRAPH.md', 'ops/02_GATES_AND_TESTS.md',
];
for (const file of required) {
  if (!tracked.has(file) || !existsSync(resolve(root, file))) fail(file, 'required tracked file missing');
}

const secrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b/,
];
let markdownCount = 0;
let linkCount = 0;
for (const file of files) {
  const path = resolve(root, file);
  if (!existsSync(path)) { fail(file, 'tracked file missing from checkout'); continue; }
  if (/(^|\/)(\.flecto|node_modules|browser-profiles|user-data-dir)\//.test(file)
      || /(^|\/)(auth|credentials)\.json$/.test(file)
      || /(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.example')
      || /\.(?:db|sqlite3?)(?:-.*)?$/.test(file)
      || /\.(?:pem|key|p12|pfx)$/.test(file)) fail(file, 'local data or credentials must not be tracked');
  if (!/\.(?:md|mjs|json|yml|yaml|toml|txt)$/.test(file)) continue;
  if (statSync(path).size > 2_000_000) { fail(file, 'unexpected large text file'); continue; }
  const content = read(file);
  if (secrets.some((pattern) => pattern.test(content))) fail(file, 'possible credential found; value omitted');
  if (!file.endsWith('.md') || file.startsWith('archive/')) continue;
  markdownCount += 1;
  if (/\/Users\/[^\s`<>]+|\/home\/[^\s`<>]+/.test(content)) fail(file, 'personal absolute path in shared document');
  // Archived source links retain their original layout; only active docs are checked.
  const prose = content.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const match of prose.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) continue;
    const local = decodeURIComponent(target.split('#')[0].split('?')[0]);
    if (!local) continue;
    const resolved = resolve(dirname(path), local);
    const rel = relative(root, resolved).split(sep).join('/');
    if (rel.startsWith('../') || rel === '..') { fail(file, `link escapes repository: ${target}`); continue; }
    if (!existsSync(resolved)) { fail(file, `missing link target: ${target}`); continue; }
    if (statSync(resolved).isFile() && !tracked.has(rel)) fail(file, `link points to an untracked file: ${target}`);
    linkCount += 1;
  }
}

let archivedCount = 0;
for (const [, file, size, digest] of read('FILE_MANIFEST.md').matchAll(/\| `([^`]+)` \| (\d+) \| `([a-f0-9]{64})` \|/g)) {
  if (!file.startsWith('archive/')) continue;
  archivedCount += 1;
  if (!tracked.has(file) || !existsSync(resolve(root, file))) { fail(file, 'preserved source missing'); continue; }
  const data = readFileSync(resolve(root, file));
  if (data.length !== Number(size) || createHash('sha256').update(data).digest('hex') !== digest) {
    fail(file, 'preserved source differs from imported manifest');
  }
}
if (archivedCount !== 13) fail('FILE_MANIFEST.md', 'expected 13 preserved source entries');

const gates = read('ops/02_GATES_AND_TESTS.md');
for (const [prefix, count] of [['T', 40], ['OPER', 15]]) {
  const ids = [...gates.matchAll(new RegExp(`^\\| (${prefix}\\d{2}) \\|`, 'gm'))].map((m) => m[1]);
  const expected = Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);
  if (ids.length !== count || expected.some((id) => ids.filter((item) => item === id).length !== 1)) {
    fail('ops/02_GATES_AND_TESTS.md', `${prefix} requirement IDs missing or duplicated`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Repository checks passed: ${files.length} tracked files, ${markdownCount} active Markdown files, ${linkCount} local links, ${archivedCount} preserved sources.`);
  console.log('Product tests T01–T40 and operational tests OPER01–OPER15 are not executed by this check.');
}
