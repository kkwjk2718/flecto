// Prints the time (s) of the loudest 10 ms window of an audio file. Usage: node scripts/peak.mjs file
import {execFileSync} from 'node:child_process';
const wav = execFileSync('npx', ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', process.argv[2], '-map_metadata', '-1', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', '-'], {maxBuffer: 1 << 26});
const b = wav.subarray(wav.indexOf(Buffer.from('data')) + 8);
const pcm = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.length & ~1)));
let best = 0, at = 0;
for (let i = 0; i + 160 <= pcm.length; i += 160) { let s = 0; for (let j = i; j < i + 160; j++) s += pcm[j] * pcm[j]; if (s > best) { best = s; at = i; } }
console.log('duration', (pcm.length / 16000).toFixed(3), 'peak', (at / 16000).toFixed(3), 'frames', Math.round((at / 16000) * 30));
