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
    bg: '#F8F6F1', surface: '#FFFFFF', surfaceAlt: '#F2EFE8', text: '#172033', muted: '#475467',
    border: '#E2DCCF', borderStrong: '#8A8272', primary: '#155EEF', primaryHover: '#0B4CC7', primaryText: '#FFFFFF',
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
const SHADOW = '0 1px 2px rgba(23,32,51,0.05),0 8px 24px rgba(23,32,51,0.05)';
const HC = '.fl-root[data-contrast="high"]';

// Injected into the extension shadow root. No url(), @import, or external fonts.
export const FLECTO_CSS = [
  ':host{all:initial;}',
  '.fl-root{' + vars(COLORS.normal) + '--fl-f:26px;--fl-target:' + MIN_TARGET_PX + 'px;--fl-read:' + READING_MAX_PX + 'px;--fl-radius:20px;--fl-radius-sm:14px;--fl-shadow:' + SHADOW + ';--fl-ease:140ms ease;',
  'position:fixed;inset:0;z-index:2147483647;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;',
  'display:flex;flex-direction:column;background:var(--fl-bg);color:var(--fl-text);',
  'font-family:' + FONT_STACK + ';font-size:var(--fl-f);line-height:' + LINE_HEIGHT + ';font-weight:400;letter-spacing:0;',
  'word-break:keep-all;overflow-wrap:anywhere;-webkit-text-size-adjust:100%;text-align:left;scroll-padding-bottom:160px;scroll-padding-top:16px;-webkit-font-smoothing:antialiased;}',
  '.fl-root[data-font="22"]{--fl-f:22px;}.fl-root[data-font="26"]{--fl-f:26px;}.fl-root[data-font="30"]{--fl-f:30px;}',
  HC + '{' + vars(COLORS.high) + '--fl-shadow:none;}',
  '.fl-root[data-motion="reduce"]{--fl-ease:0s linear;}',
  '@media (prefers-reduced-motion: reduce){.fl-root{--fl-ease:0s linear;}}',
  '.fl-root *,.fl-root *::before,.fl-root *::after{box-sizing:border-box;}',
  '.fl-root :where(h1,h2,h3,p,dl,dd,ul,ol,fieldset,figure){margin:0;padding:0;}',
  '.fl-root :where(ul,ol){list-style:none;}',
  '.fl-root :where(button,input,select,textarea){font:inherit;color:inherit;letter-spacing:inherit;}',
  '.fl-root :focus-visible{outline:4px solid var(--fl-focus);outline-offset:3px;box-shadow:0 0 0 7px var(--fl-surface);}',
  '.fl-root :focus:not(:focus-visible){outline:none;}',
  '.fl-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}',
  '.fl-ico{flex:none;width:1em;height:1em;}',
  // header: brand on the left, three quiet exits on the right
  '.fl-header{background:var(--fl-surface);border-bottom:1px solid var(--fl-border);}',
  HC + ' .fl-header{border-bottom-width:2px;}',
  '.fl-header-in{max-width:1180px;margin:0 auto;padding:12px 24px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 20px;}',
  '.fl-brand{display:flex;align-items:center;gap:14px;flex:1 1 16em;min-width:0;}',
  '.fl-mark{flex:none;width:1.6em;height:1.6em;}',
  '.fl-brand-text{display:flex;flex-direction:column;gap:2px;min-width:0;line-height:1.3;}',
  '.fl-brand-line{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 10px;}',
  '.fl-brand-name{font-size:0.7em;font-weight:800;color:var(--fl-brand);letter-spacing:0.08em;}',
  '.fl-brand-title{font-size:0.9em;font-weight:800;}',
  '.fl-source{font-size:0.7em;color:var(--fl-muted);}',
  '.fl-source strong{color:var(--fl-text);font-weight:700;}',
  '.fl-header-actions{display:flex;flex-wrap:wrap;gap:8px;}',
  // main column and reading order: eyebrow, step, title, intro
  '.fl-main{flex:1 0 auto;width:100%;max-width:calc(var(--fl-read) + 2 * 24px);margin:0 auto;padding:40px 24px 40px;display:flex;flex-direction:column;gap:28px;}',
  '.fl-head{display:flex;flex-direction:column;align-items:flex-start;gap:12px;}',
  '.fl-progress{display:flex;flex-direction:column;gap:10px;width:100%;font-size:0.72em;font-weight:700;color:var(--fl-muted);}',
  '.fl-progress-bar{display:flex;gap:6px;width:100%;max-width:16em;}',
  '.fl-progress-bar span{flex:1 1 0;height:6px;border-radius:999px;background:var(--fl-border);}',
  '.fl-progress-bar span[data-state="done"],.fl-progress-bar span[data-state="current"]{background:var(--fl-primary);}',
  HC + ' .fl-progress-bar span{height:10px;background:transparent;border:2px solid var(--fl-border-strong);}',
  HC + ' .fl-progress-bar span[data-state="done"],' + HC + ' .fl-progress-bar span[data-state="current"]{background:var(--fl-primary);border-color:var(--fl-primary);}',
  '.fl-title{font-size:1.3em;line-height:1.3;font-weight:800;letter-spacing:-0.01em;color:var(--fl-text);}',
  // the heading only receives programmatic focus on a screen change; it is not a control
  '.fl-title:focus,.fl-title:focus-visible{outline:none;box-shadow:none;}',
  '.fl-intro{color:var(--fl-muted);font-size:0.86em;}',
  '.fl-section{background:var(--fl-surface);border:1px solid var(--fl-border);border-radius:var(--fl-radius);padding:28px;display:flex;flex-direction:column;gap:28px;box-shadow:var(--fl-shadow);}',
  HC + ' .fl-section{border-width:2px;}',
  '.fl-section-title{font-size:0.8em;font-weight:700;color:var(--fl-muted);}',
  // buttons
  '.fl-btn{display:inline-flex;align-items:center;justify-content:center;gap:0.4em;min-height:var(--fl-target);min-width:var(--fl-target);padding:10px 24px;border-radius:var(--fl-radius-sm);border:2px solid var(--fl-border-strong);background:var(--fl-surface);color:var(--fl-text);font-weight:700;line-height:1.25;text-align:center;cursor:pointer;transition:background-color var(--fl-ease),border-color var(--fl-ease),color var(--fl-ease);}',
  '.fl-btn:hover{background:var(--fl-surface-alt);}',
  '.fl-btn-primary{background:var(--fl-primary);border-color:var(--fl-primary);color:var(--fl-primary-text);}',
  '.fl-btn-primary:hover{background:var(--fl-primary-hover);border-color:var(--fl-primary-hover);}',
  '.fl-btn-small{font-size:0.76em;padding:8px 18px;}',
  '.fl-btn-soft{background:var(--fl-surface-alt);border-color:transparent;}',
  '.fl-btn-soft:hover{background:var(--fl-primary-soft);color:var(--fl-primary);}',
  '.fl-btn-soft[aria-expanded="true"]{background:var(--fl-primary-soft);color:var(--fl-primary);border-color:var(--fl-primary);}',
  HC + ' .fl-btn-soft{border-color:var(--fl-border-strong);}',
  '.fl-btn-edit{background:var(--fl-primary-soft);border-color:transparent;color:var(--fl-primary);flex:none;}',
  '.fl-btn-edit:hover{background:var(--fl-primary-soft);border-color:var(--fl-primary);}',
  HC + ' .fl-btn-edit{border-color:var(--fl-primary);}',
  // disabled stays calm and solid; high contrast adds a dashed edge so state never relies on color
  '.fl-root .fl-btn[disabled],.fl-root .fl-btn[disabled]:hover{cursor:not-allowed;color:var(--fl-muted);background:var(--fl-surface-alt);border-color:var(--fl-border);}',
  HC + ' .fl-btn[disabled]{border-style:dashed;border-color:var(--fl-border-strong);}',
  '.fl-more{align-self:flex-start;}',
  // footer: back on the left, the single primary action on the right
  '.fl-footer{position:sticky;bottom:0;background:var(--fl-surface);border-top:1px solid var(--fl-border);box-shadow:0 -8px 24px rgba(23,32,51,0.06);}',
  HC + ' .fl-footer{border-top-width:2px;box-shadow:none;}',
  '.fl-footer-in{max-width:calc(var(--fl-read) + 2 * 24px);margin:0 auto;padding:14px 24px;display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;}',
  '.fl-footer-in > .fl-spacer{flex:1 1 0;}',
  '.fl-footer-in .fl-btn-primary{flex:0 1 auto;min-width:min(100%, 9em);padding-left:28px;padding-right:28px;}',
  '@media (max-height: 620px), (max-width: 420px){.fl-footer{position:static;box-shadow:none;}.fl-root{scroll-padding-bottom:16px;}}',
  // fields
  '.fl-field{display:flex;flex-direction:column;gap:12px;border:0;min-width:0;}',
  '.fl-label{font-weight:700;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:0;}',
  '.fl-badge{display:inline-flex;align-items:center;min-height:1.7em;padding:0 0.6em;border-radius:999px;font-size:0.66em;font-weight:800;line-height:1.2;letter-spacing:0.02em;}',
  '.fl-badge-required{color:var(--fl-danger);background:var(--fl-danger-soft);}',
  '.fl-badge-optional{color:var(--fl-muted);background:var(--fl-surface-alt);}',
  HC + ' .fl-badge{border:2px solid currentColor;}',
  '.fl-input{width:100%;min-height:calc(var(--fl-target) + 8px);padding:10px 18px;border:2px solid var(--fl-border-strong);border-radius:var(--fl-radius-sm);background:var(--fl-surface);color:var(--fl-text);transition:border-color var(--fl-ease);}',
  '.fl-input:hover{border-color:var(--fl-text);}',
  '.fl-input:focus{border-color:var(--fl-primary);}',
  'textarea.fl-input{min-height:5em;resize:vertical;}',
  '.fl-input[aria-invalid="true"]{border-color:var(--fl-danger);border-width:3px;}',
  '.fl-input[disabled]{background:var(--fl-surface-alt);color:var(--fl-muted);}',
  '.fl-help{font-size:0.8em;color:var(--fl-muted);white-space:pre-wrap;}',
  '.fl-error{display:flex;gap:10px;align-items:flex-start;font-size:0.84em;font-weight:700;color:var(--fl-danger);background:var(--fl-danger-soft);padding:10px 16px;border-radius:12px;}',
  HC + ' .fl-error{border:2px solid var(--fl-danger);}',
  '.fl-error .fl-ico,.fl-banner .fl-ico,.fl-review-help .fl-ico{margin-top:0.25em;}',
  // original-site notices
  '.fl-notice{font-size:0.82em;white-space:pre-wrap;background:var(--fl-surface-alt);border-radius:var(--fl-radius-sm);padding:16px 20px;}',
  '.fl-notice[data-kind="warning"]{background:var(--fl-warning-soft);}',
  '.fl-notice[data-kind="terms"]{background:var(--fl-surface);border:1px solid var(--fl-border);box-shadow:inset 4px 0 0 var(--fl-primary);}',
  HC + ' .fl-notice{border:2px solid var(--fl-border);}',
  '.fl-notice-label{display:flex;align-items:center;gap:8px;font-size:0.9em;font-weight:800;color:var(--fl-muted);margin-bottom:6px;white-space:normal;}',
  '.fl-notice[data-kind="warning"] .fl-notice-label{color:var(--fl-warning);}',
  '.fl-notice[data-kind="terms"] .fl-notice-label{color:var(--fl-primary);}',
  // choice cards: the whole card is the target, the native radio stays visible
  '.fl-choices{display:flex;flex-direction:column;gap:12px;}',
  '.fl-card{position:relative;display:flex;align-items:center;gap:16px;min-height:calc(var(--fl-target) + 16px);padding:14px 20px;border:2px solid var(--fl-border-strong);border-radius:16px;background:var(--fl-surface);cursor:pointer;transition:background-color var(--fl-ease),border-color var(--fl-ease),box-shadow var(--fl-ease);}',
  '.fl-card:hover{border-color:var(--fl-primary);}',
  '.fl-card[data-checked="true"]{border-color:var(--fl-primary);background:var(--fl-primary-soft);box-shadow:inset 0 0 0 2px var(--fl-primary);}',
  '.fl-card[data-disabled="true"],.fl-card[data-disabled="true"]:hover{cursor:not-allowed;background:var(--fl-surface-alt);color:var(--fl-muted);border-style:dashed;border-color:var(--fl-border-strong);}',
  '.fl-card:has(input:focus-visible){outline:4px solid var(--fl-focus);outline-offset:3px;}',
  '.fl-card input{flex:none;width:1.25em;height:1.25em;margin:0;accent-color:var(--fl-primary);}',
  '.fl-card input:focus-visible,.fl-check input:focus-visible,.fl-seg input:focus-visible{outline:none;box-shadow:none;}',
  '.fl-card-text{flex:1 1 auto;display:flex;flex-direction:column;gap:2px;min-width:0;font-weight:600;}',
  '.fl-card-sub{font-size:0.78em;color:var(--fl-muted);font-weight:400;}',
  '.fl-card-state{flex:none;display:inline-flex;align-items:center;gap:6px;font-size:0.74em;font-weight:800;color:var(--fl-primary);}',
  '.fl-check{display:flex;align-items:flex-start;gap:16px;min-height:var(--fl-target);padding:16px 20px;border:2px solid var(--fl-border-strong);border-radius:16px;background:var(--fl-surface);cursor:pointer;transition:background-color var(--fl-ease),border-color var(--fl-ease),box-shadow var(--fl-ease);}',
  '.fl-check:hover{border-color:var(--fl-primary);}',
  '.fl-check[data-checked="true"]{border-color:var(--fl-primary);background:var(--fl-primary-soft);box-shadow:inset 0 0 0 2px var(--fl-primary);}',
  '.fl-check:has(input:focus-visible){outline:4px solid var(--fl-focus);outline-offset:3px;}',
  '.fl-check input{flex:none;width:1.3em;height:1.3em;margin:0.1em 0 0;accent-color:var(--fl-primary);}',
  '.fl-check-text{flex:1 1 auto;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-weight:700;}',
  '.fl-check-state{display:inline-flex;align-items:center;gap:6px;font-size:0.74em;font-weight:700;color:var(--fl-muted);}',
  '.fl-check[data-checked="true"] .fl-check-state{color:var(--fl-primary);}',
  // tasks
  '.fl-tasks{display:flex;flex-direction:column;gap:12px;}',
  '.fl-task{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:calc(var(--fl-target) + 24px);padding:18px 20px 18px 24px;border:2px solid var(--fl-border-strong);border-radius:18px;background:var(--fl-surface);color:var(--fl-text);text-align:left;cursor:pointer;transition:background-color var(--fl-ease),border-color var(--fl-ease);}',
  '.fl-task:hover{border-color:var(--fl-primary);background:var(--fl-primary-soft);}',
  '.fl-task[disabled],.fl-task[disabled]:hover{cursor:not-allowed;background:var(--fl-surface-alt);color:var(--fl-muted);border-style:dashed;border-color:var(--fl-border-strong);}',
  '.fl-task-text{display:flex;flex-direction:column;gap:4px;min-width:0;}',
  '.fl-task-label{font-weight:800;}',
  '.fl-task-desc{font-size:0.8em;color:var(--fl-muted);font-weight:400;}',
  '.fl-task-go{flex:none;display:inline-flex;align-items:center;justify-content:center;width:1.7em;height:1.7em;border-radius:999px;background:var(--fl-primary-soft);color:var(--fl-primary);transition:background-color var(--fl-ease),color var(--fl-ease);}',
  '.fl-task:hover .fl-task-go{background:var(--fl-primary);color:var(--fl-primary-text);}',
  '.fl-task[disabled] .fl-task-go{background:transparent;color:var(--fl-muted);}',
  // review: label above value, a compact edit on the value line
  '.fl-review{display:flex;flex-direction:column;}',
  '.fl-review-row{display:flex;flex-direction:column;gap:4px;padding:18px 0;border-bottom:1px solid var(--fl-border);}',
  HC + ' .fl-review-row{border-bottom-width:2px;}',
  '.fl-review-row:first-child{padding-top:0;}.fl-review-row:last-child{border-bottom:0;padding-bottom:0;}',
  '.fl-review-label{font-size:0.8em;font-weight:600;color:var(--fl-muted);}',
  '.fl-review-value{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;font-weight:800;white-space:pre-wrap;}',
  '.fl-review-value > span:first-child{flex:1 1 10em;min-width:0;}',
  '.fl-review-empty{color:var(--fl-muted);font-weight:400;}',
  '.fl-review-help{display:flex;gap:12px;align-items:flex-start;color:var(--fl-text);background:var(--fl-primary-soft);border-radius:var(--fl-radius-sm);padding:16px 20px;font-size:0.84em;}',
  '.fl-review-help .fl-ico{color:var(--fl-primary);}',
  HC + ' .fl-review-help{border:2px solid var(--fl-primary);}',
  // status and result
  '.fl-status{display:flex;flex-direction:column;gap:16px;}',
  '.fl-tone{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;font-size:0.76em;font-weight:800;padding:6px 14px 6px 12px;border-radius:999px;}',
  '.fl-tone[data-tone="success"]{color:var(--fl-success);background:var(--fl-success-soft);}',
  '.fl-tone[data-tone="danger"]{color:var(--fl-danger);background:var(--fl-danger-soft);}',
  '.fl-tone[data-tone="warning"]{color:var(--fl-warning);background:var(--fl-warning-soft);}',
  '.fl-tone[data-tone="info"]{color:var(--fl-primary);background:var(--fl-primary-soft);}',
  HC + ' .fl-tone{border:2px solid currentColor;}',
  '.fl-status-quote{display:flex;flex-direction:column;gap:8px;}',
  '.fl-quote{white-space:pre-wrap;background:var(--fl-surface);border:1px solid var(--fl-border);border-radius:var(--fl-radius-sm);padding:16px 20px;}',
  HC + ' .fl-quote{border-width:2px;}',
  '.fl-banner{display:flex;gap:12px;align-items:flex-start;font-weight:700;padding:16px 20px;border-radius:var(--fl-radius-sm);background:var(--fl-warning-soft);color:var(--fl-warning);}',
  '.fl-banner[data-tone="danger"]{background:var(--fl-danger-soft);color:var(--fl-danger);}',
  HC + ' .fl-banner{border:2px solid currentColor;}',
  '.fl-fix-list{gap:12px;}',
  '.fl-receipt{background:var(--fl-surface);border:1px solid var(--fl-border);border-radius:var(--fl-radius);padding:24px 28px;display:flex;flex-direction:column;gap:18px;box-shadow:var(--fl-shadow);}',
  HC + ' .fl-receipt{border-width:2px;}',
  '.fl-receipt-head{display:flex;gap:12px;align-items:flex-start;font-weight:800;font-size:1.04em;line-height:1.4;}',
  '.fl-receipt-head .fl-ico{color:var(--fl-success);width:1.2em;height:1.2em;margin-top:0.05em;}',
  '.fl-receipt-rows{display:flex;flex-direction:column;border-top:1px solid var(--fl-border);}',
  '.fl-receipt-row{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 24px;padding:14px 0;border-bottom:1px solid var(--fl-border);}',
  '.fl-receipt-row:last-child{border-bottom:0;padding-bottom:0;}',
  '.fl-receipt-row dt{font-size:0.82em;font-weight:600;color:var(--fl-muted);}',
  '.fl-receipt-row dd{margin-left:auto;font-weight:800;text-align:right;font-variant-numeric:tabular-nums;}',
  '.fl-receipt-row[data-key="true"] dd{font-size:1.08em;letter-spacing:0.02em;}',
  // preparing
  '.fl-loading{display:flex;align-items:flex-start;gap:20px;background:var(--fl-surface);border:1px solid var(--fl-border);border-radius:var(--fl-radius);padding:28px;box-shadow:var(--fl-shadow);}',
  HC + ' .fl-loading{border-width:2px;}',
  '.fl-loading .fl-status{gap:8px;}',
  '.fl-loading-line{font-weight:700;}',
  '.fl-dots{flex:none;display:inline-flex;gap:8px;padding-top:0.5em;}',
  '.fl-dots span{width:0.42em;height:0.42em;border-radius:50%;background:var(--fl-primary);opacity:0.35;animation:fl-pulse 1.4s ease-in-out infinite;}',
  '.fl-dots span:nth-child(2){animation-delay:0.2s;}.fl-dots span:nth-child(3){animation-delay:0.4s;}',
  '@keyframes fl-pulse{0%,100%{opacity:0.35;}50%{opacity:1;}}',
  '.fl-root[data-motion="reduce"] .fl-dots span{animation:none;opacity:0.8;}',
  '@media (prefers-reduced-motion: reduce){.fl-dots span{animation:none;opacity:0.8;}}',
  // sponsor: visibly separate from the product, never a link, never focused automatically
  '.fl-sponsor{border:2px dashed var(--fl-border-strong);border-radius:var(--fl-radius);background:var(--fl-surface);padding:20px 24px;display:flex;flex-direction:column;gap:10px;}',
  '.fl-sponsor-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;}',
  '.fl-sponsor-label{display:inline-flex;align-items:center;gap:8px;font-size:0.74em;font-weight:800;color:var(--fl-muted);letter-spacing:0.04em;}',
  '.fl-sponsor-note{font-size:0.74em;font-weight:700;color:var(--fl-warning);}',
  '.fl-sponsor-body{font-size:0.9em;}',
  // settings
  '.fl-settings{background:var(--fl-surface);border:1px solid var(--fl-border);border-radius:var(--fl-radius);padding:24px 28px;display:flex;flex-direction:column;gap:22px;box-shadow:var(--fl-shadow);}',
  HC + ' .fl-settings{border:2px solid var(--fl-primary);}',
  '.fl-settings-title{display:flex;align-items:center;gap:10px;font-size:1em;font-weight:800;}',
  '.fl-settings-title .fl-ico{color:var(--fl-primary);}',
  '.fl-seg{display:flex;flex-wrap:wrap;gap:10px;border:0;padding:0;min-width:0;}',
  '.fl-seg legend{font-weight:700;font-size:0.86em;color:var(--fl-muted);margin-bottom:10px;padding:0;}',
  '.fl-seg label{display:inline-flex;align-items:center;gap:10px;min-height:var(--fl-target);padding:8px 20px;border:2px solid var(--fl-border-strong);border-radius:var(--fl-radius-sm);cursor:pointer;background:var(--fl-surface);font-weight:600;transition:background-color var(--fl-ease),border-color var(--fl-ease);}',
  '.fl-seg label:hover{border-color:var(--fl-primary);}',
  '.fl-seg label[data-checked="true"]{border-color:var(--fl-primary);background:var(--fl-primary-soft);box-shadow:inset 0 0 0 2px var(--fl-primary);font-weight:800;}',
  '.fl-seg label:has(input:focus-visible){outline:4px solid var(--fl-focus);outline-offset:3px;}',
  '.fl-seg input{width:1.1em;height:1.1em;margin:0;accent-color:var(--fl-primary);}',
  // demo details stay small and out of the way
  '.fl-tech{font-size:0.7em;color:var(--fl-muted);}',
  '.fl-tech summary{cursor:pointer;min-height:var(--fl-target);display:inline-flex;align-items:center;gap:8px;font-weight:700;border-radius:10px;padding:0 4px;}',
  '.fl-tech dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;padding:8px 0 0;}',
  '.fl-tech dt{font-weight:700;}',
].join('\n');
