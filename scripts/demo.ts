import { startSystem } from './system';
import { resolve } from 'node:path';

const live = process.argv.includes('--live');
const system = await startSystem({ mode: live ? 'LIVE_CODEX' : 'FIXTURE', namespace: 'DEMO', dataDir: resolve('.flecto/demo') });
console.log(`FLECTO ${live ? 'LIVE_CODEX' : 'FIXTURE'} 실행 중`);
console.log(`구매 혜택: http://127.0.0.1:${system.ports.benefits}`);
console.log(`문화센터: http://127.0.0.1:${system.ports.culture}`);
console.log('확장: dist/extension · 개인 연결 정보: .flecto/demo/connection.txt (공유하지 마세요)');
console.log('합성 테스트 계정: demo / flecto2026! · Ctrl+C로 이 실행의 서버만 종료');
let closing = false;
const close = async () => { if (closing) return; closing = true; await system.close(); process.exit(0); };
process.on('SIGINT', () => { void close(); }); process.on('SIGTERM', () => { void close(); });
