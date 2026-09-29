import { createBenefitsServer } from '../apps/demo-benefits/src/server';
import { createCultureServer } from '../apps/demo-culture/src/server';
import { createPlannerServer } from '../apps/planner/src/server';
import { FixtureProvider } from '../apps/planner/src/provider/fixture';
import { CodexProvider } from '../apps/planner/src/provider/codex';
import { resolve } from 'node:path';

const role = process.argv[2];
const port = Number(process.env.FLECTO_PORT);
const dataDir = process.env.FLECTO_DATA_DIR;
const namespace = process.env.FLECTO_NAMESPACE;
if (!dataDir || !Number.isInteger(port) || port < 1024 || port > 65535 || !['QA', 'DEMO'].includes(namespace ?? '')) throw new Error('Invalid service configuration');

const server = role === 'planner' ? createPlannerServer({
  dbPath: resolve(dataDir, 'blueprints.sqlite'), token: process.env.FLECTO_TOKEN ?? '',
  provider: process.env.FLECTO_PROVIDER === 'codex' ? new CodexProvider({
    binary: process.env.FLECTO_CODEX_BIN ?? 'codex', model: process.env.FLECTO_MODEL ?? 'gpt-6-luna',
    runtimeDir: resolve(dataDir, 'runtime'), effort: 'low', serviceTier: 'fast',
  }) : process.env.FLECTO_PROVIDER === 'fixture' ? new FixtureProvider({
    delayMs: Number(process.env.FLECTO_FAULT_DELAY_MS ?? 0), fail: process.env.FLECTO_FAULT_PROVIDER_ERROR === '1',
  }) : (() => { throw new Error('Explicit product provider is required'); })(),
  allowedSourceOrigins: (process.env.FLECTO_SOURCE_ORIGINS ?? '').split(',').filter(Boolean),
}) : role === 'benefits' ? createBenefitsServer({
  dbPath: resolve(dataDir, 'source.sqlite'), sessionSecret: process.env.FLECTO_SESSION_SECRET ?? '',
  qaToken: process.env.FLECTO_QA_TOKEN, namespace: namespace as 'QA' | 'DEMO',
}) : role === 'culture' ? createCultureServer({
  dbPath: resolve(dataDir, 'source.sqlite'), sessionSecret: process.env.FLECTO_SESSION_SECRET ?? '',
  qaToken: process.env.FLECTO_QA_TOKEN, namespace: namespace as 'QA' | 'DEMO',
  assetsDir: resolve('apps/demo-culture/dist'),
}) : (() => { throw new Error('Unknown FLECTO service'); })();

await server.listen({ host: '127.0.0.1', port });
process.send?.({ type: 'ready', role, port });
let closing = false;
async function close() { if (closing) return; closing = true; await server.close(); process.exit(0); }
process.on('SIGTERM', () => { void close(); });
process.on('SIGINT', () => { void close(); });
