import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const extension = resolve(root, 'dist/extension');
const alias = Object.fromEntries([
  ['contracts', 'index.ts'], ['core', 'index.ts'], ['templates', 'index.tsx'], ['design-tokens', 'index.ts'],
].map(([name, file]) => [`@flecto/${name}`, resolve(root, `packages/${name}/src/${file}`)]));
await mkdir(extension, { recursive: true });
for (const [name, entry, format] of [
  ['content', 'content/index.ts', 'iife'],
  ['background', 'background/index.ts', 'es'],
  ['options', 'options/index.tsx', 'iife'],
]) {
  await build({
    configFile: false, root, logLevel: 'warn', resolve: { alias },
    define: { 'process.env.NODE_ENV': '"production"' },
    esbuild: { jsx: 'automatic' },
    build: {
      outDir: extension, emptyOutDir: false, sourcemap: false, minify: true,
      lib: { entry: resolve(root, `apps/extension/src/${entry}`), name: `Flecto_${name}`, formats: [format], fileName: () => `${name}.js` },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
}
for (const name of ['manifest.json', 'options.html']) await copyFile(resolve(root, `apps/extension/${name}`), resolve(extension, name));
const files = ['manifest.json', 'content.js', 'background.js', 'options.html', 'options.js'];
const hashes = {};
for (const name of files) hashes[name] = createHash('sha256').update(await readFile(resolve(extension, name))).digest('hex');
await writeFile(resolve(root, 'dist/extension-hashes.json'), JSON.stringify(hashes, null, 2) + '\n');
await build({ configFile: resolve(root, 'apps/demo-culture/vite.config.ts'), logLevel: 'warn' });
console.log('Extension build complete: dist/extension (file hashes: dist/extension-hashes.json)');
