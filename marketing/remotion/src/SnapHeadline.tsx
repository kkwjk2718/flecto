import React from 'react';
import {spring, useCurrentFrame} from 'remotion';
import {C} from './theme';

type Line = {text: string; at: number; accent?: boolean};
type Layout = 'A' | 'B' | 'C' | 'END';

const STYLE: Record<Layout, {size: number; weight: number; left?: number; top: number; center?: boolean}> = {
  A: {size: 80, weight: 800, left: 120, top: 118},
  B: {size: 68, weight: 800, left: 120, top: 330},
  C: {size: 68, weight: 800, left: 120, top: 140},
  END: {size: 92, weight: 800, top: 214, center: true},
};

/** Spring-snapped headline: each line pops up with a small overshoot; exits fast. */
export const SnapHeadline: React.FC<{layout: Layout; lines: Line[]; out: number}> = ({layout, lines, out}) => {
  const f = useCurrentFrame();
  if (f < lines[0].at || f >= out + 7) return null;
  const st = STYLE[layout];
  const o = Math.min(1, Math.max(0, (f - out) / 6));
  return (
    <div
      style={{
        position: 'absolute',
        left: st.center ? 0 : st.left,
        width: st.center ? '100%' : undefined,
        top: st.top,
        textAlign: st.center ? 'center' : 'left',
        opacity: 1 - o,
        transform: 'translateY(' + -18 * o + 'px)',
      }}
    >
      {lines.map((l, i) => {
        const s = spring({frame: f - l.at, fps: 30, config: {damping: 13, stiffness: 230, mass: 0.6}});
        if (f < l.at) return <div key={i} style={{height: st.size * 1.15}} />;
        return (
          <div
            key={i}
            style={{
              fontSize: st.size,
              fontWeight: st.weight,
              lineHeight: st.size * 1.15 + 'px',
              letterSpacing: '-0.025em',
              color: l.accent ? C.blue : C.ink,
              whiteSpace: 'nowrap',
              opacity: Math.min(1, s * 1.8),
              transform: 'translateY(' + 40 * (1 - s) + 'px) scale(' + (0.9 + 0.1 * s) + ')',
              transformOrigin: st.center ? '50% 100%' : '0% 100%',
            }}
          >
            {l.text}
          </div>
        );
      })}
    </div>
  );
};
