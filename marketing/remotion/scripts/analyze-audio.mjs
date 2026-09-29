// Speech segments of a VO file via bundled ffmpeg decode + RMS gating.
// Usage: node scripts/analyze-audio.mjs public/audio/vo.mp3 [offsetSec=0.8] [gapMs=220] [thresholdDb=-38]
import {execFileSync} from 'node:child_process';
const [file, off = '0.8', gap = '220', thr = '-38'] = process.argv.slice(2);
const wav = execFileSync('npx', ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', file, '-map_metadata', '-1', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', '-'], {maxBuffer: 1 << 28});
const d = wav.indexOf(Buffer.from('data'));
const body = wav.subarray(d + 8);
const pcm = new Int16Array(body.buffer.slice(body.byteOffset, body.byteOffset + (body.length & ~1)));
const win = 160; // 10 ms
const thrLin = Math.pow(10, Number(thr) / 20) * 32768;
const active = [];
for (let i = 0; i + win <= pcm.length; i += win) {
  let s = 0;
  for (let j = i; j < i + win; j++) s += pcm[j] * pcm[j];
  active.push(Math.sqrt(s / win) > thrLin);
}
const segs = [];
let start = -1, lastOn = -1;
active.forEach((on, k) => {
  if (on) { if (start < 0) start = k; lastOn = k; }
  else if (start >= 0 && (k - lastOn) * 10 >= Number(gap)) { segs.push([start, lastOn]); start = -1; }
});
if (start >= 0) segs.push([start, lastOn]);
const o = Number(off);
console.log('duration', (pcm.length / 16000).toFixed(2));
for (const [a, b] of segs) {
  const s0 = a / 100 + o, s1 = (b + 1) / 100 + o;
  console.log(s0.toFixed(2), s1.toFixed(2), 'frames', Math.round(s0 * 30), Math.round(s1 * 30));
}
