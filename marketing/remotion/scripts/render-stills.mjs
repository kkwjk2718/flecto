// Renders QA keyframes to out/stills with one bundle. Usage: node scripts/render-stills.mjs [comp] [frames,comma,separated]
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const id = process.argv[2] ?? 'FlectoAd30';
const frames = (process.argv[3] ?? '24,100,150,172,190,240,300,312,378,432,470,530,592,640,665,700,740,800,872,899').split(',').map(Number);
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts')});
const composition = await selectComposition({serveUrl, id, inputProps: {}});
for (const frame of frames) {
  const output = path.join(root, 'out/stills', id + '-f' + String(frame).padStart(3, '0') + '.png');
  await renderStill({serveUrl, composition, frame, output, imageFormat: 'png', concurrency: 1});
  console.log(output);
}
