import {Easing, interpolate} from 'remotion';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const outExpo = Easing.bezier(0.16, 1, 0.3, 1);
const inOut = Easing.bezier(0.65, 0, 0.35, 1);

const prog = (f: number, start: number, len: number, easing: (t: number) => number) =>
  interpolate(f, [start, start + len], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing});

/** Entrance progress 0..1 (brief: 14f, cubic-bezier(0.16,1,0.3,1)). */
export const enter = (f: number, start: number, len = 14) => prog(f, start, len, outExpo);
/** Exit progress 0..1 (brief: 10f). */
export const exit = (f: number, start: number, len = 10) => prog(f, start, len, inOut);
/** Move / scale progress (brief: cubic-bezier(0.65,0,0.35,1)). */
export const move = (f: number, start: number, len: number) => prog(f, start, len, inOut);
