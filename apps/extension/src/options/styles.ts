export const OPTIONS_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: #F7F9FC; }
.fl-page {
  --fs: 26px; --bg: #F7F9FC; --card: #FFFDF7; --card-line: #E4DFD2; --text: #172033; --muted: #3B4658;
  --primary: #155EEF; --primary-dark: #0B3FB0; --primary-soft: #E8EFFE; --ok: #0F6B3A; --ok-soft: #E6F4EC;
  --warn: #8A4B00; --warn-soft: #FFF3E0; --err: #A4161A; --err-soft: #FDECEC; --line: #C9D2E0; --focus: #0B3FB0;
  --ease: 160ms ease;
  min-height: 100vh; background: var(--bg); color: var(--text);
  font-family: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif;
  font-size: max(22px, var(--fs)); line-height: 1.5; word-break: keep-all; overflow-wrap: anywhere;
  padding: 32px 16px 64px;
}
.fl-page[data-contrast="high"] {
  --bg: #FFFFFF; --card: #FFFFFF; --card-line: #000000; --text: #000000; --muted: #000000;
  --primary: #0B3FB0; --primary-dark: #002A80; --primary-soft: #FFFFFF; --ok: #004D24; --ok-soft: #FFFFFF;
  --warn: #5C3000; --warn-soft: #FFFFFF; --err: #7A0000; --err-soft: #FFFFFF; --line: #000000; --focus: #000000;
}
.fl-page[data-motion="reduced"] { --ease: 0s linear; }
@media (prefers-reduced-motion: reduce) { .fl-page { --ease: 0s linear; } }
.fl-wrap { max-width: 760px; margin: 0 auto; display: grid; gap: 28px; }
.fl-brand { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.fl-logo { width: 56px; height: 56px; border-radius: 16px; background: var(--primary); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 30px; flex: none; }
.fl-brand h1 { margin: 0; font-size: calc(var(--fs) * 1.35); line-height: 1.25; }
.fl-brand p { margin: 4px 0 0; color: var(--muted); }
.fl-card { background: var(--card); border: 2px solid var(--card-line); border-radius: 22px; padding: 28px; display: grid; gap: 20px; }
.fl-card h2 { margin: 0; font-size: calc(var(--fs) * 1.15); line-height: 1.3; }
.fl-card p { margin: 0; }
.fl-muted { color: var(--muted); }
.fl-steps { margin: 0; padding: 0; list-style: none; display: grid; gap: 16px; counter-reset: step; }
.fl-steps li { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start; }
.fl-steps li::before { counter-increment: step; content: counter(step); width: 48px; height: 48px; border-radius: 50%; background: var(--primary-soft); color: var(--primary-dark); border: 2px solid var(--primary); display: grid; place-items: center; font-weight: 800; }
.fl-code { font-family: ui-monospace, "SF Mono", Menlo, monospace; background: var(--primary-soft); border: 1px solid var(--line); border-radius: 8px; padding: 2px 10px; white-space: nowrap; font-size: max(22px, 0.92em); }
.fl-status { border-radius: 16px; padding: 18px 20px; border: 2px solid var(--line); display: grid; gap: 6px; }
.fl-status strong { font-size: calc(var(--fs) * 1.05); }
.fl-status[data-tone="ok"] { background: var(--ok-soft); border-color: var(--ok); }
.fl-status[data-tone="ok"] strong { color: var(--ok); }
.fl-status[data-tone="warn"] { background: var(--warn-soft); border-color: var(--warn); }
.fl-status[data-tone="warn"] strong { color: var(--warn); }
.fl-status[data-tone="err"] { background: var(--err-soft); border-color: var(--err); }
.fl-status[data-tone="err"] strong { color: var(--err); }
.fl-field { display: grid; gap: 8px; }
.fl-field label { font-weight: 700; }
.fl-input { width: 100%; min-height: 60px; font: inherit; color: var(--text); background: #fff; border: 2px solid var(--line); border-radius: 12px; padding: 10px 16px; }
.fl-input[aria-invalid="true"] { border-color: var(--err); }
.fl-hint { color: var(--muted); font-size: max(22px, calc(var(--fs) * 0.9)); }
.fl-error { color: var(--err); font-weight: 700; }
.fl-actions { display: flex; flex-wrap: wrap; gap: 14px; }
.fl-btn { min-height: 56px; min-width: 56px; padding: 10px 26px; border-radius: 14px; font: inherit; font-weight: 700; cursor: pointer; border: 2px solid var(--primary); transition: background var(--ease), transform var(--ease); }
.fl-btn-primary { background: var(--primary); color: #fff; }
.fl-btn-primary:hover:not(:disabled) { background: var(--primary-dark); }
.fl-btn-secondary { background: transparent; color: var(--primary-dark); }
.fl-btn-secondary:hover:not(:disabled) { background: var(--primary-soft); }
.fl-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.fl-page :focus-visible { outline: 4px solid var(--focus); outline-offset: 3px; }
.fl-group { border: 0; margin: 0; padding: 0; display: grid; gap: 12px; min-width: 0; }
.fl-group legend { font-weight: 800; padding: 0; margin-bottom: 4px; }
.fl-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 12px; }
.fl-option { position: relative; display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 12px 16px; border: 2px solid var(--line); border-radius: 14px; background: #fff; cursor: pointer; overflow-wrap: normal; transition: border-color var(--ease), background var(--ease); }
.fl-option input { width: 28px; height: 28px; margin: 0; flex: none; accent-color: var(--primary); }
.fl-option:has(input:checked) { border-color: var(--primary); background: var(--primary-soft); box-shadow: inset 0 0 0 1px var(--primary); }
.fl-option:has(input:focus-visible) { outline: 4px solid var(--focus); outline-offset: 3px; }
.fl-option input:focus-visible { outline: none; }
.fl-check { margin-left: auto; font-weight: 800; color: var(--primary-dark); flex: none; }
.fl-preview { border: 2px dashed var(--primary); border-radius: 18px; padding: 22px; background: #fff; display: grid; gap: 14px; }
.fl-preview-tag { justify-self: start; font-size: 22px; font-weight: 700; background: var(--primary-soft); color: var(--primary-dark); border-radius: 999px; padding: 2px 14px; border: 1px solid var(--primary); }
.fl-preview h3 { margin: 0; font-size: calc(var(--fs) * 1.1); }
.fl-preview-box { min-height: 60px; border: 2px solid var(--line); border-radius: 12px; padding: 10px 16px; color: var(--muted); }
.fl-preview-btn { justify-self: start; min-height: 56px; padding: 10px 26px; border-radius: 14px; background: var(--primary); color: #fff; font-weight: 700; display: inline-flex; align-items: center; transition: transform var(--ease); }
.fl-preview:hover .fl-preview-btn { transform: translateY(-3px); }
.fl-page[data-motion="reduced"] .fl-preview:hover .fl-preview-btn { transform: none; }
.fl-details { border: 2px solid var(--line); border-radius: 14px; padding: 0 18px; background: #fff; }
.fl-details summary { min-height: 56px; display: flex; align-items: center; gap: 10px; cursor: pointer; font-weight: 700; list-style: none; }
.fl-details summary::-webkit-details-marker { display: none; }
.fl-details summary::before { content: "▸"; color: var(--primary-dark); flex: none; }
.fl-details[open] > summary::before { content: "▾"; }
.fl-details[open] { padding-bottom: 18px; }
.fl-details > div { display: grid; gap: 12px; }
.fl-dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; }
.fl-dl dt { font-weight: 700; }
.fl-dl dd { margin: 0; }
.fl-live { min-height: 1.5em; font-weight: 700; color: var(--ok); }
.fl-live[data-tone="err"] { color: var(--err); }
@media (max-width: 560px) {
  .fl-page { padding: 16px 10px 48px; }
  .fl-card { padding: 20px 16px; border-radius: 18px; }
  .fl-actions .fl-btn { flex: 1 1 100%; }
  .fl-dl { grid-template-columns: 1fr; }
  .fl-code { white-space: normal; }
}
`;
