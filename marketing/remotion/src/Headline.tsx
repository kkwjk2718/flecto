import React from 'react';
import {useCurrentFrame} from 'remotion';
import {enter, exit} from './ease';
import {C} from './theme';

type Line = {text: string; at: number};
type Layout = 'A' | 'B' | 'C' | 'END';

const STYLE: Record<Layout, {size: number; weights: number[]; left?: number; top: number; center?: boolean}> = {
  A: {size: 72, weights: [700, 500], left: 120, top: 132},
  B: {size: 60, weights: [600, 600, 600], left: 120, top: 348},
  C: {size: 64, weights: [700], left: 120, top: 150},
  END: {size: 84, weights: [700, 700], top: 420, center: true},
};

export const Headline: React.FC<{layout: Layout; lines: Line[]; out: number; lift?: number}> = ({layout, lines, out, lift = 0}) => {
  const f = useCurrentFrame();
  if (f < lines[0].at || f >= out + 10) return null;
  const st = STYLE[layout];
  const o = exit(f, out, 10);
  const lineH = st.size * 1.2;
  return (
    <div
      style={{
        position: 'absolute',
        left: st.center ? 0 : st.left,
        width: st.center ? '100%' : undefined,
        top: st.top,
        textAlign: st.center ? 'center' : 'left',
        opacity: 1 - o,
        transform: 'translateY(' + (-8 * o - 60 * lift) + 'px) scale(' + (1 - 0.1 * lift) + ')',
        transformOrigin: '50% 0%',
      }}
    >
      {lines.map((l, i) => {
        const p = enter(f, l.at, 14);
        return (
          <div
            key={i}
            style={{
              fontSize: st.size,
              fontWeight: st.weights[i] ?? st.weights[0],
              lineHeight: lineH + 'px',
              letterSpacing: '-0.01em',
              color: C.ink,
              whiteSpace: 'nowrap',
              opacity: p,
              transform: 'translateY(' + 12 * (1 - p) + 'px)',
            }}
          >
            {l.text}
          </div>
        );
      })}
    </div>
  );
};
