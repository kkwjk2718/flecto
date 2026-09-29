import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { canonicalJson, sha256 } from './common';
import { inspectRuntimeManifest } from './runtime-hash';

export const EXTENSION_FILES = ['manifest.json', 'content.js', 'background.js', 'options.html', 'options.js'] as const;
const CULTURE_ASSET_EXT = new Set(['.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.txt', '.webmanifest']);
const HEX64 = /^[0-9a-f]{64}$/;

export type BuildFile = { path: string; sha256: string; bytes: number };
export type BuildInspection = {
  extension: { ok: boolean; problems: string[]; files: BuildFile[]; buildSha256: string | null; manifestVersion: string | null };
  culture: { ok: boolean; problems: string[]; files: BuildFile[] };
  runtime: Awaited<ReturnType<typeof inspectRuntimeManifest>>;
};

async function regularFile(path: string): Promise<Buffer | 'missing' | 'not-regular'> {
  try {
    const info = await lstat(path);
    if (!info.isFile()) return 'not-regular';
    return await readFile(path);
  } catch { return 'missing'; }
}

/**
 * Recomputes the actual extension build hashes and compares them with dist/extension-hashes.json
 * written by scripts/build.mjs. buildSha256 identifies the build only when every file matches.
 */
export async function inspectBuild(root: string): Promise<BuildInspection> {
  const ext: BuildInspection['extension'] = { ok: false, problems: [], files: [], buildSha256: null, manifestVersion: null };
  let recorded: Record<string, unknown> | null = null;
  const raw = await regularFile(resolve(root, 'dist/extension-hashes.json'));
  if (raw === 'missing') ext.problems.push('dist/extension-hashes.json missing (run npm run build)');
  else if (raw === 'not-regular') ext.problems.push('dist/extension-hashes.json is not a regular file');
  else {
    try {
      const parsed = JSON.parse(raw.toString('utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) recorded = parsed; else ext.problems.push('dist/extension-hashes.json is not an object');
    } catch { ext.problems.push('dist/extension-hashes.json is not valid JSON'); }
  }
  if (recorded) {
    const keys = Object.keys(recorded).sort();
    if (canonicalJson(keys) !== canonicalJson([...EXTENSION_FILES].sort())) ext.problems.push('hash manifest lists unexpected file set: ' + keys.join(','));
    for (const name of EXTENSION_FILES) {
      const want = recorded[name];
      const body = await regularFile(resolve(root, 'dist/extension', name));
      if (body === 'missing') { ext.problems.push('dist/extension/' + name + ' missing'); continue; }
      if (body === 'not-regular') { ext.problems.push('dist/extension/' + name + ' is not a regular file'); continue; }
      const got = sha256(body);
      if (typeof want !== 'string' || !HEX64.test(want)) ext.problems.push('invalid recorded hash for ' + name);
      else if (want !== got) ext.problems.push('hash mismatch for dist/extension/' + name + ' (file changed after the build manifest)');
      ext.files.push({ path: 'dist/extension/' + name, sha256: got, bytes: body.length });
      if (name === 'manifest.json') {
        try {
          const manifest = JSON.parse(body.toString('utf8'));
          if (manifest.manifest_version !== 3) ext.problems.push('extension manifest is not MV3');
          ext.manifestVersion = typeof manifest.version === 'string' ? manifest.version : null;
        } catch { ext.problems.push('extension manifest.json is not valid JSON'); }
      }
    }
  }
  ext.ok = ext.problems.length === 0 && ext.files.length === EXTENSION_FILES.length;
  if (ext.ok) ext.buildSha256 = sha256(canonicalJson(Object.fromEntries(ext.files.map((f) => [f.path, f.sha256]))));

  const culture: BuildInspection['culture'] = { ok: false, problems: [], files: [] };
  const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
    if (depth > 4) { culture.problems.push('culture asset tree too deep at ' + rel); return; }
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { if (depth === 0) culture.problems.push('apps/demo-culture/dist missing (run npm run build)'); return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relPath = rel ? rel + '/' + entry.name : entry.name;
      const full = resolve(dir, entry.name);
      if (entry.isSymbolicLink()) { culture.problems.push('symlink in culture assets: ' + relPath); continue; }
      if (entry.isDirectory()) { await walk(full, relPath, depth + 1); continue; }
      if (!entry.isFile()) { culture.problems.push('non-regular culture asset: ' + relPath); continue; }
      if (!CULTURE_ASSET_EXT.has(extname(entry.name).toLowerCase())) { culture.problems.push('unexpected culture asset type: ' + relPath); continue; }
      if (culture.files.length >= 500) { culture.problems.push('too many culture assets'); return; }
      const body = await readFile(full);
      culture.files.push({ path: 'apps/demo-culture/dist/' + relPath, sha256: sha256(body), bytes: body.length });
    }
  };
  await walk(resolve(root, 'apps/demo-culture/dist'), '', 0);
  if (!culture.problems.length && !culture.files.some((f) => f.path === 'apps/demo-culture/dist/index.html')) culture.problems.push('apps/demo-culture/dist/index.html missing');
  culture.ok = culture.problems.length === 0;
  return { extension: ext, culture, runtime: await inspectRuntimeManifest(root) };
}
