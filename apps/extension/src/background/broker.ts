import {
  DEFAULT_SETTINGS, ErrorCodeSchema, EXTENSION_ORIGIN, FlectoError,
  PlannerErrorSchema, PlannerResponseSchema, PREPARE_DEADLINE_MS, UserSettingsSchema,
  type BackgroundReply, type ErrorCode, type PlannerRequest, type PlannerResponse,
} from '@flecto/contracts';
import { httpOrigin, MessageSchema, plannerOrigin, SessionSchema, sourceIdentity, type Session } from './validation';

type Reply = BackgroundReply | { ok: true; session: Pick<Session, 'active' | 'pendingSubmit'> };
type Connection = { plannerUrl: string; token: string };
type Owner = { tabId: number; documentId: string; session: Session; epoch: number; windowId: number };
type TrackedRequest = {
  owner: Owner; sender: chrome.runtime.MessageSender; payload: PlannerRequest; key: string;
  operation: Operation; promise: Promise<PlannerResponse>; delivered: PlannerResponse | null;
  connection?: Connection; sent: boolean; deleted: boolean;
  verifications: Set<Operation>;
};
type Navigation = { tabId: number; frameId: number; url: string; documentId?: string };

function fail(code: ErrorCode): never { throw new FlectoError(code); }
function errorReply(error: unknown): Reply {
  return { ok: false, error: error instanceof FlectoError ? error.code : 'PROVIDER_ERROR' };
}

// Every asynchronous step (including storage, sender validation and JSON reading)
// shares this monotonic budget. Abort alone does not settle a misbehaving fetch.
class Operation {
  readonly controller = new AbortController();
  readonly started = performance.now();
  readonly terminal: Promise<never>;
  reason: ErrorCode | null = null;
  private reject!: (error: FlectoError) => void;
  private timer: ReturnType<typeof setTimeout>;
  constructor(readonly budget: number) {
    this.terminal = new Promise((_, reject) => { this.reject = reject; });
    void this.terminal.catch(() => undefined);
    this.timer = setTimeout(() => this.cancel('DEADLINE_EXCEEDED'), budget);
  }
  remaining() {
    this.check();
    return Math.max(1, Math.floor(this.budget - (performance.now() - this.started)));
  }
  check() {
    if (!this.reason && performance.now() - this.started >= this.budget) this.cancel('DEADLINE_EXCEEDED');
    if (this.reason) fail(this.reason);
  }
  cancel(reason: ErrorCode) {
    if (this.reason) return;
    this.reason = reason;
    this.controller.abort();
    this.reject(new FlectoError(reason));
  }
  wait<T>(promise: Promise<T>): Promise<T> { return Promise.race([promise, this.terminal]); }
  dispose() { clearTimeout(this.timer); }
}

export class BackgroundBroker {
  readonly ready: Promise<void>;
  private sessions = new Map<number, Session>();
  private documents = new Map<number, { documentId: string; instanceId?: string; clientEpoch?: number }>();
  private requests = new Map<string, TrackedRequest>();
  private usedIds = new Set<string>();
  private inflight: TrackedRequest | null = null;
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly api: typeof chrome, private readonly fetcher: typeof fetch = fetch) {
    this.ready = this.restore();
    // A failed access restriction is fail-closed; event/message calls still receive
    // the failure instead of exposing storage or injecting an unprotected context.
    void this.ready.catch(() => undefined);
  }

  private async restore() {
    await this.api.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    await this.api.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    const data = await this.api.storage.session.get('flectoSessions');
    if (!data.flectoSessions || typeof data.flectoSessions !== 'object') return;
    for (const [key, value] of Object.entries(data.flectoSessions)) {
      const parsed = SessionSchema.safeParse(value);
      if (/^(0|[1-9][0-9]*)$/.test(key) && Number.isSafeInteger(Number(key)) && parsed.success) {
        try {
          const tabId = Number(key);
          const [tab, frame] = await Promise.all([
            this.api.tabs.get(tabId), this.api.webNavigation.getFrame({ tabId, frameId: 0 }),
          ]);
          if (tab.id === tabId && frame && httpOrigin(frame.url) === parsed.data.origin) this.sessions.set(tabId, parsed.data);
        } catch { /* A closed tab cannot retain authorization. */ }
      }
    }
    await this.persist();
  }

  private persist() {
    // Capture immutable data at enqueue time; concurrent tabs cannot overwrite a
    // newer snapshot with an older storage completion.
    const flectoSessions = Object.fromEntries([...this.sessions].map(([id, session]) => [id, { ...session }]));
    const write = this.writes.catch(() => undefined).then(() => this.api.storage.session.set({ flectoSessions }));
    this.writes = write;
    return write;
  }

  private assertOwner(owner: Owner) {
    if (this.sessions.get(owner.tabId) !== owner.session || owner.session.epoch !== owner.epoch || !owner.session.active) fail('CANCELLED');
  }

  private async authorize(sender: chrome.runtime.MessageSender, allowInactive = false): Promise<Owner> {
    const identity = sourceIdentity(sender, this.api.runtime.id);
    if (!identity) fail('AUTH_REQUIRED');
    const session = this.sessions.get(identity.tabId);
    if (!session || session.origin !== identity.origin || (!allowInactive && !session.active)) fail('AUTH_REQUIRED');
    const epoch = session.epoch;
    const [frame, tab] = await Promise.all([
      this.api.webNavigation.getFrame({ tabId: identity.tabId, frameId: 0 }),
      this.api.tabs.get(identity.tabId),
    ]);
    if (!frame || frame.documentId !== identity.documentId || frame.documentLifecycle !== 'active' ||
        frame.errorOccurred || httpOrigin(frame.url) !== session.origin || tab.id !== identity.tabId) fail('STALE_DOCUMENT');
    if (this.sessions.get(identity.tabId) !== session || session.epoch !== epoch || (!allowInactive && !session.active)) fail('CANCELLED');
    return { ...identity, session, epoch, windowId: tab.windowId };
  }

  private bindDocument(owner: Owner, instanceId: string) {
    const existing = this.documents.get(owner.tabId);
    if (existing && (existing.documentId !== owner.documentId || (existing.instanceId && existing.instanceId !== instanceId))) fail('STALE_DOCUMENT');
    const document = { ...existing, documentId: owner.documentId, instanceId };
    this.documents.set(owner.tabId, document);
    return document;
  }

  private async current(owner: Owner, sender: chrome.runtime.MessageSender) {
    this.assertOwner(owner);
    const tab = await this.api.tabs.get(owner.tabId);
    this.assertOwner(owner);
    if (!tab.active) fail('CANCELLED');
    const actual = await this.authorize(sender);
    this.assertOwner(owner);
    if (actual.documentId !== owner.documentId) fail('STALE_DOCUMENT');
  }

  private cancelRecord(record: TrackedRequest, code: ErrorCode = 'CANCELLED') {
    record.delivered = null;
    record.operation.cancel(code);
    for (const verification of record.verifications) verification.cancel(code);
    if (this.inflight === record) this.inflight = null;
    this.deleteRemote(record);
  }

  private invalidate(tabId: number) {
    for (const [id, record] of this.requests) {
      if (record.owner.tabId === tabId) {
        this.cancelRecord(record);
        this.requests.delete(id);
      }
    }
    this.documents.delete(tabId);
  }

  private headers(connection: Connection) {
    return { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json', Origin: EXTENSION_ORIGIN };
  }

  private deleteRemote(record: TrackedRequest) {
    if (!record.sent || !record.connection || record.deleted) return;
    record.deleted = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    void this.fetcher(`${record.connection.plannerUrl}/v1/plans/${encodeURIComponent(record.payload.snapshot.requestId)}`, {
      method: 'DELETE', headers: this.headers(record.connection), signal: controller.signal,
      credentials: 'omit', redirect: 'error', cache: 'no-store',
    }).catch(() => undefined).finally(() => clearTimeout(timer));
  }

  private async connection(): Promise<Connection> {
    const data = await this.api.storage.local.get('flectoConnection');
    const value = data.flectoConnection as { plannerUrl?: unknown; token?: unknown } | undefined;
    const plannerUrl = plannerOrigin(value?.plannerUrl);
    if (!plannerUrl || typeof value?.token !== 'string' || !/^[\x21-\x7E]{1,4096}$/.test(value.token)) fail('AUTH_REQUIRED');
    return { plannerUrl, token: value.token };
  }

  private async response(response: Response): Promise<unknown> {
    let body: unknown;
    try { body = await response.json(); } catch { fail(response.ok ? 'SCHEMA_INVALID' : 'PROVIDER_ERROR'); }
    if (!response.ok) {
      const parsed = PlannerErrorSchema.safeParse(body);
      fail(parsed.success ? ErrorCodeSchema.parse(parsed.data.error) : response.status === 401 || response.status === 403 ? 'AUTH_REQUIRED' : 'PROVIDER_ERROR');
    }
    return body;
  }

  private async runPlan(record: TrackedRequest): Promise<PlannerResponse> {
    const { operation, owner, sender, payload } = record;
    try {
      record.connection = await operation.wait(this.connection());
      await operation.wait(this.current(owner, sender));
      operation.check();
      record.sent = true;
      const response = await operation.wait(this.fetcher(`${record.connection.plannerUrl}/v1/plans`, {
        method: 'POST', headers: this.headers(record.connection), signal: operation.controller.signal,
        credentials: 'omit', redirect: 'error', cache: 'no-store',
        body: JSON.stringify({ ...payload, remainingBudgetMs: operation.remaining() }),
      }));
      const parsed = PlannerResponseSchema.safeParse(await operation.wait(this.response(response)));
      if (!parsed.success) fail('SCHEMA_INVALID');
      const result = parsed.data;
      if (result.requestId !== payload.snapshot.requestId || result.snapshotId !== payload.snapshot.snapshotId ||
          result.plan.snapshotId !== payload.snapshot.snapshotId) fail('SCHEMA_INVALID');
      await operation.wait(this.current(owner, sender));
      operation.check();
      if (this.requests.get(payload.snapshot.requestId) !== record) fail('CANCELLED');
      record.delivered = result;
      return result;
    } finally {
      if (this.inflight === record) this.inflight = null;
      if (operation.reason) this.deleteRemote(record);
    }
  }

  private prepare(payload: PlannerRequest, owner: Owner, sender: chrome.runtime.MessageSender, operation: Operation) {
    this.assertOwner(owner);
    if (payload.snapshot.origin !== owner.session.origin) fail('AUTH_REQUIRED');
    const document = this.bindDocument(owner, payload.snapshot.documentInstanceId);
    if (document.clientEpoch !== undefined && payload.sessionEpoch < document.clientEpoch) fail('STALE_DOCUMENT');
    const key = JSON.stringify(payload);
    const existing = this.requests.get(payload.snapshot.requestId);
    if (existing) {
      if (existing.owner.tabId !== owner.tabId || existing.owner.documentId !== owner.documentId ||
          existing.owner.epoch !== owner.epoch || existing.key !== key) fail('STALE_DOCUMENT');
      existing.operation.check();
      return existing.promise;
    }
    if (this.usedIds.has(payload.snapshot.requestId)) fail('STALE_DOCUMENT');
    if (this.inflight && this.inflight.owner.tabId !== owner.tabId) fail('BUSY');
    document.clientEpoch = payload.sessionEpoch;
    // A new request replaces the old goal/snapshot in this document. No queue.
    for (const [id, record] of this.requests) {
      if (record.owner.tabId === owner.tabId) { this.cancelRecord(record); this.requests.delete(id); }
    }
    const record: TrackedRequest = {
      owner, sender, payload, key, operation, sent: false, deleted: false, delivered: null, verifications: new Set(),
      promise: undefined as unknown as Promise<PlannerResponse>,
    };
    this.requests.set(payload.snapshot.requestId, record);
    this.usedIds.add(payload.snapshot.requestId);
    this.inflight = record;
    record.promise = this.runPlan(record);
    return record.promise;
  }

  async handle(input: unknown, sender: chrome.runtime.MessageSender): Promise<Reply> {
    const parsed = MessageSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'SCHEMA_INVALID' };
    const message = parsed.data;
    const operation = new Operation(message.type === 'FLECTO_PREPARE' ? Math.min(PREPARE_DEADLINE_MS, message.payload.remainingBudgetMs) : PREPARE_DEADLINE_MS);
    try {
      return await operation.wait((async (): Promise<Reply> => {
        await operation.wait(this.ready);
        const owner = await operation.wait(this.authorize(sender, ['FLECTO_SESSION_GET', 'FLECTO_SETTINGS_GET', 'FLECTO_SETTINGS_SET'].includes(message.type)));
        operation.check();
        switch (message.type) {
          case 'FLECTO_SESSION_GET': return { ok: true, session: { active: owner.session.active, pendingSubmit: owner.session.pendingSubmit } };
          case 'FLECTO_SETTINGS_GET': {
            const stored = await operation.wait(this.api.storage.local.get('flectoSettings'));
            await operation.wait(this.authorize(sender, true));
            const settings = UserSettingsSchema.safeParse(stored.flectoSettings);
            return { ok: true, settings: settings.success ? settings.data : { ...DEFAULT_SETTINGS } };
          }
          case 'FLECTO_SETTINGS_SET':
            await operation.wait(this.api.storage.local.set({ flectoSettings: message.settings }));
            return { ok: true, settings: message.settings };
          case 'FLECTO_STATE':
            this.bindDocument(owner, message.documentInstanceId);
            owner.session.active = message.active;
            owner.session.pendingSubmit = message.pendingSubmit;
            if (!message.active) this.invalidate(owner.tabId);
            await operation.wait(this.persist());
            return { ok: true };
          case 'FLECTO_PREPARE':
            await operation.wait(this.current(owner, sender));
            return { ok: true, result: await operation.wait(this.prepare(message.payload, owner, sender, operation)) };
          case 'FLECTO_CANCEL': {
            const record = this.requests.get(message.requestId);
            if (!record || record.owner.tabId !== owner.tabId || record.owner.documentId !== owner.documentId ||
                record.owner.epoch !== owner.epoch || record.payload.snapshot.documentInstanceId !== message.documentInstanceId) fail('STALE_DOCUMENT');
            this.cancelRecord(record);
            return { ok: true };
          }
          case 'FLECTO_VERIFY': {
            const record = this.requests.get(message.requestId);
            if (!record || record.owner.tabId !== owner.tabId || record.owner.documentId !== owner.documentId ||
                record.owner.epoch !== owner.epoch || !record.delivered || record.delivered.snapshotId !== message.snapshotId ||
                record.delivered.blueprintId !== message.blueprintId || !record.connection) fail('STALE_DOCUMENT');
            record.verifications.add(operation);
            try {
              await operation.wait(this.current(owner, sender));
              // Cancellation/navigation during validation revokes the receipt.
              if (!record.delivered || this.requests.get(message.requestId) !== record) fail('CANCELLED');
              const response = await operation.wait(this.fetcher(`${record.connection.plannerUrl}/v1/blueprints/${encodeURIComponent(message.blueprintId)}/verify`, {
                method: 'POST', headers: this.headers(record.connection), signal: operation.controller.signal,
                credentials: 'omit', redirect: 'error', cache: 'no-store',
                body: JSON.stringify({ requestId: message.requestId, snapshotId: message.snapshotId }),
              }));
              if (!response.ok) await operation.wait(this.response(response));
              await operation.wait(this.current(owner, sender));
              if (!record.delivered) fail('CANCELLED');
              return { ok: true };
            } finally { record.verifications.delete(operation); }
          }
        }
      })());
    } catch (error) { return errorReply(error); }
    finally { operation.dispose(); }
  }

  async activate(tab: chrome.tabs.Tab) {
    await this.ready;
    const origin = httpOrigin(tab.url);
    if (tab.id === undefined || !origin) return;
    const tabId = tab.id;
    const frame = await this.api.webNavigation.getFrame({ tabId, frameId: 0 });
    if (!frame || frame.documentLifecycle !== 'active' || httpOrigin(frame.url) !== origin) return;
    const previous = this.sessions.get(tabId);
    this.invalidate(tabId);
    const session: Session = {
      origin, active: true, pendingSubmit: previous?.origin === origin ? previous.pendingSubmit : false,
      epoch: (previous?.epoch ?? 0) + 1,
    };
    this.sessions.set(tabId, session);
    this.documents.set(tabId, { documentId: frame.documentId });
    await this.persist();
    await this.inject(tabId, frame.documentId, session);
  }

  private async inject(tabId: number, documentId: string, session: Session) {
    if (this.sessions.get(tabId) !== session || !session.active) return;
    await this.api.scripting.executeScript({ target: { tabId, documentIds: [documentId] }, files: ['content.js'] });
    if (this.sessions.get(tabId) !== session || !session.active) return;
    const frame = await this.api.webNavigation.getFrame({ tabId, frameId: 0 });
    if (frame?.documentId !== documentId || httpOrigin(frame.url) !== session.origin) return;
    await this.api.tabs.sendMessage(tabId, { type: 'FLECTO_ACTIVATE', pendingSubmit: session.pendingSubmit }, { documentId, frameId: 0 });
  }

  async navigation(details: Navigation, history = false) {
    if (details.frameId !== 0) return;
    await this.ready;
    const session = this.sessions.get(details.tabId);
    if (!session) return;
    // Crossing an origin revokes activeTab even if another navigation has already
    // brought this tab back. Never resurrect that grant from an overtaken event.
    if (httpOrigin(details.url) !== session.origin) {
      this.invalidate(details.tabId);
      this.sessions.delete(details.tabId);
      await this.persist();
      return;
    }
    const frame = await this.api.webNavigation.getFrame({ tabId: details.tabId, frameId: 0 });
    if (this.sessions.get(details.tabId) !== session) return;
    // Ignore events overtaken by a later committed document.
    if (details.documentId && frame?.documentId !== details.documentId) return;
    if (!frame || httpOrigin(details.url) !== session.origin || httpOrigin(frame.url) !== session.origin) {
      this.invalidate(details.tabId);
      this.sessions.delete(details.tabId);
      await this.persist();
      return;
    }
    this.invalidate(details.tabId);
    const next = { ...session, epoch: session.epoch + 1 };
    this.sessions.set(details.tabId, next);
    this.documents.set(details.tabId, { documentId: frame.documentId });
    await this.persist();
    if (!next.active || this.sessions.get(details.tabId) !== next) return;
    if (history) {
      await this.api.tabs.sendMessage(details.tabId, { type: 'FLECTO_SOURCE_NAVIGATION' }, { documentId: frame.documentId, frameId: 0 });
    } else await this.inject(details.tabId, frame.documentId, next);
  }

  async remove(tabId: number) {
    await this.ready;
    this.invalidate(tabId);
    this.sessions.delete(tabId);
    await this.persist();
  }

  tabActivated(info: { tabId: number; windowId: number }) {
    for (const record of this.requests.values()) {
      if (record.owner.tabId !== info.tabId && record.owner.windowId === info.windowId && (!record.delivered || record.verifications.size)) this.cancelRecord(record);
    }
  }
}
