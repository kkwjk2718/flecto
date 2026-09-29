import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@flecto/contracts';
import {
  CONNECTION_KEY, MESSAGES, SETTINGS_KEY, checkToken, loadStored, normalizePlannerUrl, requestConnect, type StorageArea,
} from '../../apps/extension/src/options/logic';

const TOKEN = 'SECRET_TOKEN_SENTINEL_123';

describe('options planner URL', () => {
  it('accepts only http on 127.0.0.1 with an optional valid port and root path', () => {
    expect(normalizePlannerUrl('http://127.0.0.1:4317')).toBe('http://127.0.0.1:4317');
    expect(normalizePlannerUrl(' http://127.0.0.1:4317/ ')).toBe('http://127.0.0.1:4317');
    expect(normalizePlannerUrl('http://127.0.0.1:65535')).toBe('http://127.0.0.1:65535');
    expect(normalizePlannerUrl('http://127.0.0.1:1')).toBe('http://127.0.0.1:1');
    for (const bad of [
      'https://127.0.0.1:4317', 'http://localhost:4317', 'http://127.0.0.2:4317', 'http://example.com',
      'http://127.0.0.1:4317/v1', 'http://127.0.0.1:4317/?', 'http://127.0.0.1:4317?x=1', 'http://127.0.0.1:4317#a',
      'http://user:pw@127.0.0.1:4317', 'http://127.0.0.1:0', 'http://127.0.0.1:65536', 'ftp://127.0.0.1', '', '127.0.0.1:4317',
    ]) expect(normalizePlannerUrl(bad), bad).toBeNull();
  });
  it('rejects tokens that cannot travel safely in a header', () => {
    expect(checkToken('')).toBe('empty');
    expect(checkToken('a b')).toBe('format');
    expect(checkToken('토큰')).toBe('format');
    expect(checkToken(TOKEN)).toBeNull();
  });
});

describe('options connect request', () => {
  it('posts an empty JSON body with the bearer token and parses the reply', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, mode: 'FIXTURE', model: 'fixture', version: '0.1.0' }), { status: 200 }));
    const result = await requestConnect('http://127.0.0.1:4317', TOKEN, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, info: { mode: 'FIXTURE', model: 'fixture', version: '0.1.0' } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:4317/v1/connect');
    expect(url).not.toContain(TOKEN);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' });
  });
  it('maps auth, server, offline, malformed and timeout failures', async () => {
    const reply = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await requestConnect('http://127.0.0.1:4317', TOKEN, reply(401))).toEqual({ ok: false, error: 'auth' });
    expect(await requestConnect('http://127.0.0.1:4317', TOKEN, reply(403))).toEqual({ ok: false, error: 'auth' });
    expect(await requestConnect('http://127.0.0.1:4317', TOKEN, reply(500))).toEqual({ ok: false, error: 'server' });
    expect(await requestConnect('http://127.0.0.1:4317', TOKEN, reply(200, { ok: true, mode: 'REAL_AI', model: 'x', version: '1' }))).toEqual({ ok: false, error: 'invalid_reply' });
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await requestConnect('http://127.0.0.1:4317', TOKEN, offline)).toEqual({ ok: false, error: 'offline' });
    const hang = ((_: string, init: RequestInit) => new Promise((_r, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    expect(await requestConnect('http://127.0.0.1:4317', TOKEN, hang, 30)).toEqual({ ok: false, error: 'timeout' });
  });
  it('never includes the token in any user message', () => {
    for (const message of Object.values(MESSAGES)) expect(message).not.toContain(TOKEN);
  });
});

describe('options storage', () => {
  const fake = (data: Record<string, unknown>): StorageArea => ({
    get: async () => data, set: async () => undefined, remove: async () => undefined,
  });
  it('falls back to defaults and ignores invalid stored values', async () => {
    const loaded = await loadStored(fake({ [SETTINGS_KEY]: { fontSize: 99 }, [CONNECTION_KEY]: { plannerUrl: 'http://evil.test', token: TOKEN } }));
    expect(loaded).toEqual({ connection: null, settings: DEFAULT_SETTINGS });
  });
  it('reads existing settings and connection', async () => {
    const settings = { fontSize: 30, contrast: 'high', explanation: 'detailed', reducedMotion: true };
    const loaded = await loadStored(fake({ [SETTINGS_KEY]: settings, [CONNECTION_KEY]: { plannerUrl: 'http://127.0.0.1:5000/', token: TOKEN } }));
    expect(loaded).toEqual({ connection: { plannerUrl: 'http://127.0.0.1:5000', token: TOKEN }, settings });
  });
});
