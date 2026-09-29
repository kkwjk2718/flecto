// FLECTO design tokens and the shadow-DOM stylesheet.
// Values start from spec/05_UI_UX.md; contrast is checked in tests/unit/ui-tokens.test.ts.

export const FONT_SIZES = [22, 26, 30] as const;
export type FontSize = (typeof FONT_SIZES)[number];
export const MIN_TARGET_PX = 56;
export const READING_MAX_PX = 760;
export const LINE_HEIGHT = 1.5;

export type ColorTokens = {
  bg: string; surface: string; surfaceAlt: string; text: string; muted: string;
  border: string; borderStrong: string; primary: string; primaryHover: string; primaryText: string;
  primarySoft: string; danger: string; dangerSoft: string; success: string; successSoft: string;
  warning: string; warningSoft: string; focus: string; brand: string;
};

export const COLORS: { normal: ColorTokens; high: ColorTokens } = {
  normal: {
    bg: '#FAF7F0', surface: '#FFFFFF', surfaceAlt: '#F3EFE4', text: '#172033', muted: '#475467',
    border: '#D9D2C3', borderStrong: '#8A8272', primary: '#155EEF', primaryHover: '#0B4CC7', primaryText: '#FFFFFF',
    primarySoft: '#EAF1FE', danger: '#B42318', dangerSoft: '#FEF3F2', success: '#067647', successSoft: '#ECFDF3',
    warning: '#8A4B00', warningSoft: '#FFF6E0', focus: '#0B2A6B', brand: '#155EEF',
  },
  high: {
    bg: '#FFFFFF', surface: '#FFFFFF', surfaceAlt: '#F2F2F2', text: '#000000', muted: '#1F1F1F',
    border: '#000000', borderStrong: '#000000', primary: '#0033A0', primaryHover: '#00206B', primaryText: '#FFFFFF',
    primarySoft: '#E6ECFA', danger: '#8F1109', dangerSoft: '#FFFFFF', success: '#044D2E', successSoft: '#FFFFFF',
    warning: '#5C3200', warningSoft: '#FFFFFF', focus: '#000000', brand: '#0033A0',
  },
};

function channel(hex: string, i: number): number {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function vars(c: ColorTokens): string {
  return Object.entries(c).map(([k, v]) => '--fl-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + v + ';').join('');
}

const FONT_STACK = "'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif";

// Injected into the extension shadow root. No url(), @import, or external fonts.
export const FLECTO_CSS = [
  ':host{all:initial;}',
  '.fl-root{' + vars(COLORS.normal) + '--fl-f:26px;--fl-target:' + MIN_TARGET_PX + 'px;--fl-read:' + READING_MAX_PX + 'px;--fl-radius:18px;',
  'position:fixed;inset:0;z-index:2147483647;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;',
  'display:flex;flex-direction:column;background:var(--fl-bg);color:var(--fl-text);',
  'font-family:' + FONT_STACK + ';font-size:var(--fl-f);line-height:' + LINE_HEIGHT + ';font-weight:400;letter-spacing:0;',
  'word-break:keep-all;overflow-wrap:anywhere;-webkit-text-size-adjust:100%;text-align:left;scroll-padding-bottom:160px;scroll-padding-top:16px;}',
  '.fl-root[data-font="22"]{--fl-f:22px;}.fl-root[data-font="26"]{--fl-f:26px;}.fl-root[data-font="30"]{--fl-f:30px;}',
  '.fl-root[data-contrast="high"]{' + vars(COLORS.high) + '}',
  '.fl-root *,.fl-root *::before,.fl-root *::after{box-sizing:border-box;}',
  '.fl-root :where(h1,h2,h3,p,dl,dd,ul,ol,fieldset,figure){margin:0;padding:0;}',
  '.fl-root :where(button,input,select,textarea){font:inherit;color:inherit;letter-spacing:inherit;}',
  '.fl-root :focus-visible{outline:4px solid var(--fl-focus);outline-offset:3px;box-shadow:0 0 0 7px var(--fl-surface);}',
  '.fl-root :focus:not(:focus-visible){outline:none;}',
  '.fl-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}',
  // header
  '.fl-header{background:var(--fl-surface);border-bottom:2px solid var(--fl-border);}',
  '.fl-header-in{max-width:1180px;margin:0 auto;padding:14px 24px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;}',
  '.fl-brand{display:flex;align-items:center;gap:12px;flex:1 1 auto;min-width:0;}',
  '.fl-mark{flex:none;width:1.5em;height:1.5em;}',
  '.fl-brand-text{display:flex;flex-direction:column;min-width:0;line-height:1.3;}',
  '.fl-brand-name{font-size:0.78em;font-weight:700;color:var(--fl-brand);letter-spacing:0.06em;}',
  '.fl-brand-title{font-size:0.9em;font-weight:700;}',
  '.fl-source{font-size:0.72em;color:var(--fl-muted);}',
  '.fl-source strong{color:var(--fl-text);font-weight:700;}',
  '.fl-header-actions{display:flex;flex-wrap:wrap;gap:10px;}',
  // main
  '.fl-main{flex:1 0 auto;width:100%;max-width:calc(var(--fl-read) + 2 * 24px);margin:0 auto;padding:28px 24px 32px;display:flex;flex-direction:column;gap:24px;}',
  '.fl-progress{font-size:0.72em;font-weight:700;color:var(--fl-muted);}',
  '.fl-title{font-size:1.36em;line-height:1.3;font-weight:800;color:var(--fl-text);}',
  '.fl-title:focus{outline:none;}',
  '.fl-title:focus-visible{outline:4px solid var(--fl-focus);outline-offset:6px;border-radius:6px;}',
  '.fl-intro{color:var(--fl-muted);font-size:0.86em;}',
  '.fl-head{display:flex;flex-direction:column;gap:10px;}',
  '.fl-section{background:var(--fl-surface);border:2px solid var(--fl-border);border-radius:var(--fl-radius);padding:24px;display:flex;flex-direction:column;gap:24px;}',
  '.fl-section-title{font-size:0.86em;font-weight:800;color:var(--fl-muted);}',
  // buttons
  '.fl-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:var(--fl-target);min-width:var(--fl-target);padding:10px 24px;border-radius:14px;border:2px solid var(--fl-border-strong);background:var(--fl-surface);color:var(--fl-text);font-weight:700;line-height:1.25;text-align:center;cursor:pointer;}',
  '.fl-btn:hover{background:var(--fl-surface-alt);}',
  '.fl-btn[disabled]{cursor:not-allowed;opacity:1;color:var(--fl-muted);background:var(--fl-surface-alt);border-style:dashed;}',
  '.fl-btn-primary{background:var(--fl-primary);border-color:var(--fl-primary);color:var(--fl-primary-text);}',
  '.fl-btn-primary:hover{background:var(--fl-primary-hover);border-color:var(--fl-primary-hover);}',
  '.fl-btn-small{font-size:0.78em;padding:8px 18px;}',
  '.fl-btn-quiet{border-color:transparent;background:transparent;color:var(--fl-primary);text-decoration:underline;text-underline-offset:4px;}',
  '.fl-btn-quiet:hover{background:var(--fl-primary-soft);}',
  // footer
  '.fl-footer{position:sticky;bottom:0;background:var(--fl-surface);border-top:2px solid var(--fl-border);box-shadow:0 -6px 18px rgba(23,32,51,0.08);}',
  '.fl-footer-in{max-width:calc(var(--fl-read) + 2 * 24px);margin:0 auto;padding:14px 24px;display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;}',
  '.fl-footer-in > .fl-spacer{flex:1 1 0;}',
  '.fl-footer-in .fl-btn-primary{flex:0 1 auto;min-width:min(100%, 9em);}',
  '@media (max-height: 620px), (max-width: 420px){.fl-footer{position:static;box-shadow:none;}.fl-root{scroll-padding-bottom:16px;}}',
  // fields
  '.fl-field{display:flex;flex-direction:column;gap:10px;border:0;min-width:0;}',
  '.fl-label{font-weight:700;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;}',
  '.fl-badge{display:inline-flex;align-items:center;min-height:1.6em;padding:0 0.55em;border-radius:999px;font-size:0.68em;font-weight:800;border:2px solid currentColor;line-height:1.2;}',
  '.fl-badge-required{color:var(--fl-danger);}',
  '.fl-badge-optional{color:var(--fl-muted);}',
  '.fl-input{width:100%;min-height:calc(var(--fl-target) + 8px);padding:10px 16px;border:2px solid var(--fl-border-strong);border-radius:12px;background:var(--fl-surface);color:var(--fl-text);}',
  'textarea.fl-input{min-height:5em;resize:vertical;}',
  '.fl-input[aria-invalid="true"]{border-color:var(--fl-danger);border-width:3px;}',
  '.fl-input[disabled]{background:var(--fl-surface-alt);color:var(--fl-muted);}',
  '.fl-help{font-size:0.8em;color:var(--fl-muted);white-space:pre-wrap;}',
  '.fl-error{display:flex;gap:8px;align-items:flex-start;font-size:0.84em;font-weight:700;color:var(--fl-danger);background:var(--fl-danger-soft);border-left:6px solid var(--fl-danger);padding:8px 14px;border-radius:8px;}',
  '.fl-notice{font-size:0.82em;white-space:pre-wrap;background:var(--fl-surface-alt);border-radius:12px;padding:14px 18px;border-left:6px solid var(--fl-border-strong);}',
  '.fl-notice[data-kind="warning"]{background:var(--fl-warning-soft);border-left-color:var(--fl-warning);}',
  '.fl-notice[data-kind="terms"]{background:var(--fl-surface);border:2px solid var(--fl-border);border-left:6px solid var(--fl-primary);}',
  '.fl-notice-label{display:block;font-size:0.86em;font-weight:800;color:var(--fl-muted);margin-bottom:4px;}',
  // choice cards
  '.fl-choices{display:flex;flex-direction:column;gap:12px;}',
  '.fl-card{position:relative;display:flex;align-items:center;gap:16px;min-height:calc(var(--fl-target) + 16px);padding:14px 20px;border:2px solid var(--fl-border-strong);border-radius:16px;background:var(--fl-surface);cursor:pointer;}',
  '.fl-card:hover{background:var(--fl-primary-soft);}',
  '.fl-card[data-checked="true"]{border:4px solid var(--fl-primary);background:var(--fl-primary-soft);padding:12px 18px;}',
  '.fl-card[data-disabled="true"]{cursor:not-allowed;background:var(--fl-surface-alt);color:var(--fl-muted);border-style:dashed;}',
  '.fl-card:focus-within{outline:4px solid var(--fl-focus);outline-offset:3px;}',
  '.fl-card input{flex:none;width:1.25em;height:1.25em;margin:0;accent-color:var(--fl-primary);}',
  '.fl-card-text{flex:1 1 auto;display:flex;flex-direction:column;gap:2px;min-width:0;}',
  '.fl-card-sub{font-size:0.78em;color:var(--fl-muted);}',
  '.fl-card-state{flex:none;font-size:0.78em;font-weight:800;color:var(--fl-primary);}',
  '.fl-check{display:flex;align-items:flex-start;gap:16px;min-height:var(--fl-target);padding:12px 18px;border:2px solid var(--fl-border-strong);border-radius:14px;background:var(--fl-surface);cursor:pointer;}',
  '.fl-check[data-checked="true"]{border-color:var(--fl-primary);background:var(--fl-primary-soft);}',
  '.fl-check:focus-within{outline:4px solid var(--fl-focus);outline-offset:3px;}',
  '.fl-check input{flex:none;width:1.3em;height:1.3em;margin:0.1em 0 0;accent-color:var(--fl-primary);}',
  '.fl-check-text{flex:1 1 auto;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-weight:700;}',
  '.fl-check-state{font-size:0.74em;font-weight:700;color:var(--fl-muted);}',
  // tasks
  '.fl-tasks{display:flex;flex-direction:column;gap:14px;}',
  '.fl-task{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:calc(var(--fl-target) + 24px);padding:18px 24px;border:2px solid var(--fl-border-strong);border-radius:18px;background:var(--fl-surface);color:var(--fl-text);text-align:left;cursor:pointer;}',
  '.fl-task:hover{border-color:var(--fl-primary);background:var(--fl-primary-soft);}',
  '.fl-task[disabled]{cursor:not-allowed;background:var(--fl-surface-alt);color:var(--fl-muted);border-style:dashed;}',
  '.fl-task-text{display:flex;flex-direction:column;gap:4px;min-width:0;}',
  '.fl-task-label{font-weight:800;}',
  '.fl-task-desc{font-size:0.8em;color:var(--fl-muted);font-weight:400;}',
  '.fl-task-arrow{flex:none;font-weight:800;color:var(--fl-primary);}',
  // review
  '.fl-review{display:flex;flex-direction:column;}',
  '.fl-review-row{display:flex;flex-direction:column;gap:2px;padding:16px 0;border-bottom:2px solid var(--fl-border);}',
  '.fl-review-row:first-child{padding-top:0;}.fl-review-row:last-child{border-bottom:0;padding-bottom:0;}',
  '.fl-review-row dt{font-size:0.8em;font-weight:700;color:var(--fl-muted);}',
  '.fl-review-label{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;}',
  '.fl-review-label .fl-btn{font-size:1em;color:var(--fl-primary);border-color:var(--fl-primary);}',
  '.fl-review-row dd{font-weight:800;white-space:pre-wrap;}',
  '.fl-review-empty{color:var(--fl-muted);font-weight:400;}',
  // status / result
  '.fl-status{display:flex;flex-direction:column;gap:16px;}',
  '.fl-tone{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;font-size:0.78em;font-weight:800;padding:4px 14px;border-radius:999px;border:2px solid currentColor;}',
  '.fl-tone[data-tone="success"]{color:var(--fl-success);background:var(--fl-success-soft);}',
  '.fl-tone[data-tone="danger"]{color:var(--fl-danger);background:var(--fl-danger-soft);}',
  '.fl-tone[data-tone="warning"]{color:var(--fl-warning);background:var(--fl-warning-soft);}',
  '.fl-tone[data-tone="info"]{color:var(--fl-primary);background:var(--fl-primary-soft);}',
  '.fl-quote{white-space:pre-wrap;background:var(--fl-surface);border:2px solid var(--fl-border);border-radius:14px;padding:16px 20px;}',
  '.fl-banner{display:flex;gap:10px;align-items:flex-start;font-weight:700;padding:14px 18px;border-radius:14px;background:var(--fl-warning-soft);color:var(--fl-warning);border:2px solid var(--fl-warning);}',
  '.fl-banner[data-tone="danger"]{background:var(--fl-danger-soft);color:var(--fl-danger);border-color:var(--fl-danger);}',
  // loading
  '.fl-loading{display:flex;align-items:flex-start;gap:18px;}',
  '.fl-dots{flex:none;display:inline-flex;gap:8px;padding-top:0.45em;}',
  '.fl-dots span{width:0.42em;height:0.42em;border-radius:50%;background:var(--fl-primary);opacity:0.35;animation:fl-pulse 1.4s ease-in-out infinite;}',
  '.fl-dots span:nth-child(2){animation-delay:0.2s;}.fl-dots span:nth-child(3){animation-delay:0.4s;}',
  '@keyframes fl-pulse{0%,100%{opacity:0.35;}50%{opacity:1;}}',
  '.fl-root[data-motion="reduce"] .fl-dots span{animation:none;opacity:0.8;}',
  '@media (prefers-reduced-motion: reduce){.fl-dots span{animation:none;opacity:0.8;}}',
  // sponsor
  '.fl-sponsor{border:2px dashed var(--fl-border-strong);border-radius:var(--fl-radius);background:var(--fl-surface);padding:18px 22px;display:flex;flex-direction:column;gap:8px;}',
  '.fl-sponsor-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;}',
  '.fl-sponsor-label{font-size:0.74em;font-weight:800;color:var(--fl-muted);letter-spacing:0.04em;}',
  '.fl-sponsor-note{font-size:0.74em;font-weight:700;color:var(--fl-warning);}',
  '.fl-sponsor-body{font-size:0.86em;}',
  // settings
  '.fl-settings{background:var(--fl-surface);border:2px solid var(--fl-primary);border-radius:var(--fl-radius);padding:20px 24px;display:flex;flex-direction:column;gap:20px;}',
  '.fl-seg{display:flex;flex-wrap:wrap;gap:10px;border:0;}',
  '.fl-seg legend{font-weight:800;margin-bottom:8px;padding:0;}',
  '.fl-seg label{display:inline-flex;align-items:center;gap:10px;min-height:var(--fl-target);padding:8px 18px;border:2px solid var(--fl-border-strong);border-radius:14px;cursor:pointer;background:var(--fl-surface);}',
  '.fl-seg label[data-checked="true"]{border:4px solid var(--fl-primary);background:var(--fl-primary-soft);font-weight:800;padding:6px 16px;}',
  '.fl-seg label:focus-within{outline:4px solid var(--fl-focus);outline-offset:3px;}',
  '.fl-seg input{width:1.1em;height:1.1em;margin:0;accent-color:var(--fl-primary);}',
  // tech
  '.fl-tech{font-size:0.7em;color:var(--fl-muted);border-top:2px dashed var(--fl-border);padding-top:12px;}',
  '.fl-tech summary{cursor:pointer;min-height:var(--fl-target);display:flex;align-items:center;font-weight:700;}',
  '.fl-tech dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;padding:8px 0;}',
  '.fl-tech dt{font-weight:700;}',
  '.fl-more{align-self:flex-start;}',
].join('\n');
