// Manual launcher for local checks. The integrated launcher imports createCultureServer instead.
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCultureServer } from './server';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const namespace = process.env.CULTURE_NAMESPACE === 'QA' ? 'QA' : 'DEMO';
const port = Number(process.env.CULTURE_PORT ?? 4174);
const app = createCultureServer({
  namespace,
  dbPath: process.env.CULTURE_DB_PATH ?? resolve(repoRoot, '.flecto/data', 'culture-' + namespace.toLowerCase() + '.sqlite'),
  sessionSecret: process.env.CULTURE_SESSION_SECRET ?? randomBytes(32).toString('hex'),
  qaToken: process.env.CULTURE_QA_TOKEN || undefined,
  assetsDir: process.env.CULTURE_ASSETS_DIR,
});
await app.listen({ host: '127.0.0.1', port });
console.log('한빛 생활문화센터 (' + namespace + ') http://127.0.0.1:' + port);

