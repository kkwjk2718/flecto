import { DEFAULT_SETTINGS, UserSettingsSchema, type UserSettings } from '@flecto/contracts';

export const CONNECTION_KEY = 'flectoConnection';
export const SETTINGS_KEY = 'flectoSettings';
export const DEFAULT_PLANNER_URL = 'http://127.0.0.1:4317';
export const CONNECT_TIMEOUT_MS = 5000;

export type StoredConnection = { plannerUrl: string; token: string };
export type ConnectInfo = { mode: 'FIXTURE' | 'LIVE_CODEX'; model: string; version: string };
export type ConnectError = 'auth' | 'offline' | 'timeout' | 'server' | 'invalid_reply';
export type ConnectResult = { ok: true; info: ConnectInfo } | { ok: false; error: ConnectError };

/** Minimal promise-based subset of chrome.storage.local so tests can pass a fake. */
export type StorageArea = {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

/** Returns chrome.storage.local only inside a real extension page; null in a plain browser preview. */
export function getExtensionStorage(): StorageArea | null {
  const c = (globalThis as { chrome?: typeof chrome }).chrome;
  if (!c?.runtime?.id || !c.storage?.local) return null;
  return c.storage.local as unknown as StorageArea;
}

/** Accepts only http://127.0.0.1[:port][/] and returns the normalized origin, or null. */
export function normalizePlannerUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /[?#@\\\s]/.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return null;
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
  if (url.port !== '') {
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  }
  return url.origin;
}

export type TokenProblem = 'empty' | 'format';
/** Tokens travel in an HTTP header, so only visible ASCII without spaces is accepted. */
export function checkToken(token: string): TokenProblem | null {
  if (token.length === 0) return 'empty';
  if (token.length > 1024 || !/^[\x21-\x7E]+$/.test(token)) return 'format';
  return null;
}

export function parseConnectReply(body: unknown): ConnectInfo | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.ok !== true) return null;
  if (b.mode !== 'FIXTURE' && b.mode !== 'LIVE_CODEX') return null;
  if (typeof b.model !== 'string' || typeof b.version !== 'string') return null;
  return { mode: b.mode, model: b.model.slice(0, 120), version: b.version.slice(0, 60) };
}

export async function requestConnect(
  plannerUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = CONNECT_TIMEOUT_MS,
): Promise<ConnectResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetchImpl(plannerUrl + '/v1/connect', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'auth' };
    if (!res.ok) return { ok: false, error: 'server' };
    let body: unknown;
    try { body = await res.json(); } catch { return { ok: false, error: timedOut ? 'timeout' : 'invalid_reply' }; }
    const info = parseConnectReply(body);
    return info ? { ok: true, info } : { ok: false, error: 'invalid_reply' };
  } catch {
    return { ok: false, error: timedOut ? 'timeout' : 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

export function readSettings(value: unknown): UserSettings {
  const parsed = UserSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS };
}

export function readConnection(value: unknown): StoredConnection | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.plannerUrl !== 'string' || typeof v.token !== 'string') return null;
  const plannerUrl = normalizePlannerUrl(v.plannerUrl);
  if (!plannerUrl || checkToken(v.token)) return null;
  return { plannerUrl, token: v.token };
}

export async function loadStored(storage: StorageArea): Promise<{ connection: StoredConnection | null; settings: UserSettings }> {
  const data = await storage.get([CONNECTION_KEY, SETTINGS_KEY]);
  return { connection: readConnection(data[CONNECTION_KEY]), settings: readSettings(data[SETTINGS_KEY]) };
}

export const MESSAGES = {
  url: '도우미 주소는 http://127.0.0.1:포트 형식이어야 해요. 예: http://127.0.0.1:4317',
  empty: '연결 토큰을 입력해 주세요. 도우미 창에 보이는 값을 그대로 옮기면 돼요.',
  format: '연결 토큰에 빈칸이나 쓸 수 없는 글자가 있어요. 도우미 창의 값을 다시 복사해 주세요.',
  auth: '연결 토큰이 맞지 않아요. 도우미 창에 보이는 최신 토큰을 다시 입력해 주세요.',
  offline: '도우미 프로그램에 닿지 않아요. 1단계 명령으로 도우미를 켠 뒤 다시 눌러 주세요.',
  timeout: '도우미가 5초 안에 답하지 않았어요. 도우미 창이 켜져 있는지 보고 다시 눌러 주세요.',
  server: '도우미가 연결을 받지 못했어요. 도우미를 껐다 켠 뒤 다시 눌러 주세요.',
  invalid_reply: '도우미의 답을 알아볼 수 없어요. FLECTO 도우미가 맞는지 주소를 확인해 주세요.',
  storage: '연결은 확인했지만 저장하지 못했어요. 이 설정 화면을 닫았다가 다시 열어 주세요.',
  unavailable: '지금은 미리 보기 화면이에요. Chrome 확장 프로그램의 설정 화면에서 열면 연결하고 저장할 수 있어요.',
} as const;
