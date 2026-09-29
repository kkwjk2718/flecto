import { describe, expect, it } from 'vitest';
import { COLORS, FLECTO_CSS, FONT_SIZES, MIN_TARGET_PX, contrastRatio } from '@flecto/design-tokens';

describe('design tokens', () => {
  for (const [theme, c] of Object.entries(COLORS)) {
    it(theme + ' text pairs meet 4.5:1 and UI parts meet 3:1', () => {
      const text: Array<[string, string]> = [
        [c.text, c.bg], [c.text, c.surface], [c.text, c.surfaceAlt], [c.text, c.primarySoft], [c.muted, c.bg], [c.muted, c.surface],
        [c.muted, c.surfaceAlt], [c.primaryText, c.primary], [c.primaryText, c.primaryHover], [c.primary, c.surface], [c.primary, c.primarySoft],
        [c.danger, c.dangerSoft], [c.danger, c.surface], [c.success, c.successSoft], [c.warning, c.warningSoft], [c.warning, c.surface],
      ];
      for (const [fg, bg] of text) expect(contrastRatio(fg, bg), fg + ' on ' + bg).toBeGreaterThanOrEqual(4.5);
      for (const [fg, bg] of [[c.borderStrong, c.surface], [c.focus, c.bg], [c.focus, c.surface], [c.primary, c.bg]] as const) {
        expect(contrastRatio(fg, bg), fg + ' on ' + bg).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('stylesheet is self-contained and encodes the size rules', () => {
    expect(FONT_SIZES).toEqual([22, 26, 30]);
    expect(MIN_TARGET_PX).toBeGreaterThanOrEqual(56);
    expect(FLECTO_CSS).not.toMatch(/url\(|@import|@font-face|expression\(/i);
    for (const size of FONT_SIZES) expect(FLECTO_CSS).toContain('[data-font="' + size + '"]{--fl-f:' + size + 'px;}');
    expect(FLECTO_CSS).toContain('--fl-target:56px');
    expect(FLECTO_CSS).toMatch(/max-height: 620px[^}]*\.fl-footer\{position:static/);
    expect(FLECTO_CSS).toMatch(/:focus-visible\{outline:4px solid/);
  });
});

