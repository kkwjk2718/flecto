import React, { useEffect, useId, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, type UserSettings } from '@flecto/contracts';
import {
  CONNECTION_KEY, DEFAULT_PLANNER_URL, MESSAGES, SETTINGS_KEY, checkToken, getExtensionStorage, loadStored,
  normalizePlannerUrl, requestConnect, type ConnectInfo, type StorageArea, type StoredConnection,
} from './logic';
import { OPTIONS_CSS } from './styles';

type Status =
  | { kind: 'loading' }
  | { kind: 'preview' }
  | { kind: 'none' }
  | { kind: 'saved' }
  | { kind: 'checking' }
  | { kind: 'connected'; info: ConnectInfo }
  | { kind: 'failed'; message: string };

type FieldError = { field: 'url' | 'token'; message: string } | null;

const FONT_OPTIONS: { value: UserSettings['fontSize']; label: string }[] = [
  { value: 22, label: '보통' }, { value: 26, label: '크게 (기본)' }, { value: 30, label: '아주 크게' },
];
const CONTRAST_OPTIONS: { value: UserSettings['contrast']; label: string }[] = [
  { value: 'normal', label: '기본 색' }, { value: 'high', label: '더 선명하게' },
];
const EXPLAIN_OPTIONS: { value: UserSettings['explanation']; label: string }[] = [
  { value: 'brief', label: '짧게' }, { value: 'detailed', label: '자세히' },
];

function StatusBox({ status }: { status: Status }) {
  let tone = 'warn', title = '', body = '';
  switch (status.kind) {
    case 'loading': title = '저장된 설정을 불러오는 중이에요'; break;
    case 'preview': title = '아직 연결할 수 없어요'; body = MESSAGES.unavailable; break;
    case 'none': title = '아직 연결되지 않았어요'; body = '아래 세 단계를 따라 도우미와 연결해 주세요.'; break;
    case 'saved': title = '저장된 연결이 있어요'; body = '도우미가 켜져 있는지 보려면 ‘연결 확인’을 눌러 주세요.'; break;
    case 'checking': title = '도우미에 연결하는 중이에요'; body = '최대 5초 걸려요.'; break;
    case 'connected': tone = 'ok'; title = '✓ 도우미와 연결됐어요'; body = '이제 원래 사이트를 열고 FLECTO 버튼을 눌러 주세요.'; break;
    case 'failed': tone = 'err'; title = '연결하지 못했어요'; body = status.message; break;
  }
  return (
    <div className="fl-status" data-tone={tone} role="status" aria-live="polite">
      <strong>{title}</strong>
      {body && <span>{body}</span>}
    </div>
  );
}

function Choice<T extends string | number>({ legend, name, options, value, onChange, hint }: {
  legend: string; name: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; hint?: string;
}) {
  const hintId = useId();
  return (
    <fieldset className="fl-group" aria-describedby={hint ? hintId : undefined}>
      <legend>{legend}</legend>
      {hint && <p id={hintId} className="fl-hint">{hint}</p>}
      <div className="fl-options">
        {options.map((o) => (
          <label key={String(o.value)} className="fl-option">
            <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
            {value === o.value && <span className="fl-check" aria-hidden="true">✓</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Preview({ settings }: { settings: UserSettings }) {
  const detailed = settings.explanation === 'detailed';
  return (
    <section className="fl-preview" aria-labelledby="fl-preview-title">
      <span className="fl-preview-tag">미리 보기 · 눌러도 동작하지 않아요</span>
      <h3 id="fl-preview-title">받는 분 이름을 적어 주세요</h3>
      <p>
        {detailed
          ? '상품을 받으실 분의 이름을 적어 주세요. 적은 이름은 원래 사이트의 ‘받는 분’ 칸에 그대로 들어가고, 신청은 마지막에 직접 누르셔야 해요.'
          : '상품을 받으실 분의 이름이에요.'}
      </p>
      <div className="fl-preview-box" aria-hidden="true">예: 김하나</div>
      <span className="fl-preview-btn" aria-hidden="true">다음 단계로</span>
      <p className="fl-hint">
        글자 {settings.fontSize}px · {settings.contrast === 'high' ? '더 선명한 색' : '기본 색'} · 설명 {detailed ? '자세히' : '짧게'} · 움직임 {settings.reducedMotion ? '줄임' : '보통'}
      </p>
    </section>
  );
}

export function OptionsApp({ storage = getExtensionStorage(), fetchImpl }: { storage?: StorageArea | null; fetchImpl?: typeof fetch }) {
  const [settings, setSettings] = useState<UserSettings>({ ...DEFAULT_SETTINGS });
  const [saved, setSaved] = useState<StoredConnection | null>(null);
  const [status, setStatus] = useState<Status>(storage ? { kind: 'loading' } : { kind: 'preview' });
  const [urlInput, setUrlInput] = useState(DEFAULT_PLANNER_URL);
  const [tokenInput, setTokenInput] = useState('');
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [settingsNote, setSettingsNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const tokenRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!storage) return;
    let alive = true;
    loadStored(storage).then(({ connection, settings: s }) => {
      if (!alive) return;
      setSettings(s);
      setSaved(connection);
      if (connection) setUrlInput(connection.plannerUrl);
      setStatus(connection ? { kind: 'saved' } : { kind: 'none' });
    }).catch(() => { if (alive) setStatus({ kind: 'none' }); });
    return () => { alive = false; };
  }, [storage]);

  function updateSettings(patch: Partial<UserSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (!storage) { setSettingsNote({ tone: 'err', text: '미리 보기에서는 저장되지 않아요.' }); return; }
    writeChain.current = writeChain.current
      .then(() => storage.set({ [SETTINGS_KEY]: next }))
      .then(() => setSettingsNote({ tone: 'ok', text: '✓ 바뀐 설정을 저장했어요.' }))
      .catch(() => setSettingsNote({ tone: 'err', text: '설정을 저장하지 못했어요. 이 화면을 닫았다가 다시 열어 주세요.' }));
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (!storage) { setStatus({ kind: 'preview' }); return; }
    const plannerUrl = normalizePlannerUrl(urlInput);
    if (!plannerUrl) { setFieldError({ field: 'url', message: MESSAGES.url }); urlRef.current?.focus(); return; }
    const typed = tokenInput.trim();
    const token = typed || (saved && saved.plannerUrl === plannerUrl ? saved.token : '');
    const problem = checkToken(token);
    if (problem) { setFieldError({ field: 'token', message: MESSAGES[problem] }); tokenRef.current?.focus(); return; }
    setFieldError(null);
    setStatus({ kind: 'checking' });
    const result = await requestConnect(plannerUrl, token, fetchImpl);
    if (!result.ok) { setStatus({ kind: 'failed', message: MESSAGES[result.error] }); return; }
    try {
      await storage.set({ [CONNECTION_KEY]: { plannerUrl, token } });
    } catch {
      setStatus({ kind: 'failed', message: MESSAGES.storage }); return;
    }
    setSaved({ plannerUrl, token });
    setUrlInput(plannerUrl);
    setTokenInput('');
    setStatus({ kind: 'connected', info: result.info });
  }

  async function forget() {
    if (!storage) return;
    try {
      await storage.remove(CONNECTION_KEY);
      setSaved(null);
      setTokenInput('');
      setStatus({ kind: 'none' });
    } catch {
      setStatus({ kind: 'failed', message: '저장된 연결을 지우지 못했어요. 이 화면을 닫았다가 다시 열어 주세요.' });
    }
  }

  const busy = status.kind === 'checking' || status.kind === 'loading';
  const tokenErr = fieldError?.field === 'token' ? fieldError.message : null;
  const urlErr = fieldError?.field === 'url' ? fieldError.message : null;
  const info = status.kind === 'connected' ? status.info : null;

  return (
    <div
      className="fl-page"
      data-contrast={settings.contrast}
      data-motion={settings.reducedMotion ? 'reduced' : 'normal'}
      style={{ ['--fs' as string]: settings.fontSize + 'px' }}
    >
      <style>{OPTIONS_CSS}</style>
      <main className="fl-wrap">
        <header className="fl-brand">
          <div className="fl-logo" aria-hidden="true">F</div>
          <div>
            <h1>FLECTO 시작하기</h1>
            <p>원래 사이트를 큰 글씨와 단계별 화면으로 도와드려요. 입력과 신청은 직접 하세요.</p>
          </div>
        </header>

        <section className="fl-card" aria-labelledby="fl-connect-title">
          <h2 id="fl-connect-title">도우미 연결</h2>
          <StatusBox status={status} />
          <ol className="fl-steps">
            <li><span>이 컴퓨터에서 도우미를 켜 주세요. 터미널에 <span className="fl-code">npm run demo:start</span> 를 입력하면 돼요.</span></li>
            <li><span>도우미 창에 보이는 <b>연결 토큰</b>을 아래 칸에 입력하고 ‘연결하기’를 눌러 주세요.</span></li>
            <li><span>원래 사이트를 열고, 브라우저 오른쪽 위의 <b>FLECTO</b> 버튼을 눌러 주세요.</span></li>
          </ol>

          <form onSubmit={connect} noValidate className="fl-card" style={{ padding: 0, border: 0, background: 'transparent' }}>
            <div className="fl-field">
              <label htmlFor="fl-token">연결 토큰</label>
              <input
                id="fl-token" ref={tokenRef} className="fl-input" type="password" name="flecto-token"
                autoComplete="off" autoCapitalize="off" spellCheck={false}
                value={tokenInput} onChange={(e) => setTokenInput(e.target.value)}
                placeholder={saved ? '저장된 토큰이 있어요. 바꿀 때만 입력하세요' : ''}
                aria-invalid={tokenErr ? true : undefined}
                aria-describedby={tokenErr ? 'fl-token-hint fl-token-err' : 'fl-token-hint'}
                disabled={!storage}
              />
              <span id="fl-token-hint" className="fl-hint">토큰은 이 컴퓨터의 확장 프로그램 안에만 저장되고 화면에 다시 보여주지 않아요.</span>
              {tokenErr && <span id="fl-token-err" className="fl-error">{tokenErr}</span>}
            </div>

            <details className="fl-details" open={urlErr ? true : undefined}>
              <summary>도우미 주소 바꾸기 (보통은 그대로 두세요)</summary>
              <div className="fl-field">
                <label htmlFor="fl-url">도우미 주소</label>
                <input
                  id="fl-url" ref={urlRef} className="fl-input" type="url" inputMode="url" autoComplete="off" spellCheck={false}
                  value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                  aria-invalid={urlErr ? true : undefined}
                  aria-describedby={urlErr ? 'fl-url-hint fl-url-err' : 'fl-url-hint'}
                  disabled={!storage}
                />
                <span id="fl-url-hint" className="fl-hint">이 컴퓨터(127.0.0.1)의 주소만 쓸 수 있어요. 기본값: {DEFAULT_PLANNER_URL}</span>
                {urlErr && <span id="fl-url-err" className="fl-error">{urlErr}</span>}
              </div>
            </details>

            <div className="fl-actions">
              <button type="submit" className="fl-btn fl-btn-primary" disabled={!storage || busy} aria-busy={status.kind === 'checking'}>
                {status.kind === 'checking' ? '연결하는 중…' : saved && !tokenInput ? '연결 확인' : '연결하기'}
              </button>
              {saved && (
                <button type="button" className="fl-btn fl-btn-secondary" onClick={forget} disabled={busy}>저장된 연결 지우기</button>
              )}
            </div>
          </form>

          <details className="fl-details">
            <summary>시연 정보</summary>
            <div>
              {info ? (
                <>
                  <dl className="fl-dl">
                    <dt>답변 방식</dt>
                    <dd>{info.mode === 'FIXTURE' ? '시연용 준비 답변 (실제 AI가 아니에요)' : '실제 AI 연결'}</dd>
                    <dt>모델</dt><dd>{info.model || '알 수 없음'}</dd>
                    <dt>도우미 버전</dt><dd>{info.version || '알 수 없음'}</dd>
                  </dl>
                  {info.mode === 'FIXTURE' && <p className="fl-hint">시연 모드에서는 미리 확인해 둔 화면 안내를 사용해요. 실제 신청은 여전히 원래 사이트에서 직접 해요.</p>}
                </>
              ) : (
                <p className="fl-hint">연결에 성공하면 도우미가 시연용 준비 답변을 쓰는지, 실제 AI를 쓰는지 여기에 보여 드려요.</p>
              )}
            </div>
          </details>
        </section>

        <section className="fl-card" aria-labelledby="fl-settings-title">
          <h2 id="fl-settings-title">보기 설정</h2>
          <p className="fl-muted">고르면 바로 저장되고 아래 미리 보기에 반영돼요. 도우미 연결 없이도 바꿀 수 있어요.</p>
          <Choice legend="글자 크기" name="fl-font" options={FONT_OPTIONS} value={settings.fontSize} onChange={(v) => updateSettings({ fontSize: v })} />
          <Choice legend="화면 색" name="fl-contrast" options={CONTRAST_OPTIONS} value={settings.contrast} onChange={(v) => updateSettings({ contrast: v })} hint="‘더 선명하게’는 흰 바탕에 검은 글씨로 보여 드려요." />
          <Choice legend="설명 길이" name="fl-explain" options={EXPLAIN_OPTIONS} value={settings.explanation} onChange={(v) => updateSettings({ explanation: v })} />
          <fieldset className="fl-group">
            <legend>움직임</legend>
            <label className="fl-option">
              <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => updateSettings({ reducedMotion: e.target.checked })} />
              <span>화면 움직임 줄이기</span>
              {settings.reducedMotion && <span className="fl-check" aria-hidden="true">✓</span>}
            </label>
          </fieldset>
          <p className="fl-live" data-tone={settingsNote?.tone} role="status" aria-live="polite">{settingsNote?.text ?? ''}</p>
          <Preview settings={settings} />
        </section>
      </main>
    </div>
  );
}
