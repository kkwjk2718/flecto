import React from 'react';
import {Img, staticFile} from 'remotion';
import {C, SHEET_SHADOW} from './theme';

// Captures are 1440x1100 logical CSS px (files may be 2x DPR; they are always drawn at 1440 CSS width).
export const ASSET_W = 1440;
export const ASSET_H = 1100;
export const CROP_X = 120;
export const CROP_W = 1200;

export type Geom = {x: number; y: number; s: number; scroll?: number};
export const A: Geom = {x: 720, y: 330, s: 0.9};
export const B: Geom = {x: 720, y: 90, s: 0.9};
export const CL: Geom = {x: 192, y: 330, s: 0.62};
export const CR: Geom = {x: 984, y: 330, s: 0.62};

export const lerpGeom = (a: Geom, b: Geom, p: number): Geom => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  s: a.s + (b.s - a.s) * p,
  scroll: (a.scroll ?? 0) + ((b.scroll ?? 0) - (a.scroll ?? 0)) * p,
});

/** Asset coordinate -> canvas coordinate. Overlays must use this, never hardcoded canvas numbers. */
export const toCanvas = (g: Geom, ax: number, ay: number): [number, number] => [g.x + (ax - CROP_X) * g.s, g.y + (g.scroll ?? 0) + ay * g.s];

export type Layer = {asset: string; opacity: number; dy?: number};

const src = (asset: string) => staticFile('assets/' + asset + '.png');

export const Sheet: React.FC<{geom: Geom; layers: Layer[]; opacity?: number; dx?: number; dy?: number; scale?: number}> = ({geom, layers, opacity = 1, dx = 0, dy = 0, scale = 1}) => {
  const w = CROP_W * geom.s;
  const h = ASSET_H * geom.s;
  return (
    <div
      style={{
        position: 'absolute',
        left: geom.x,
        top: geom.y,
        width: w,
        height: h,
        overflow: 'hidden',
        borderRadius: 16,
        border: '1px solid ' + C.border,
        background: C.surface,
        boxShadow: SHEET_SHADOW,
        opacity,
        transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')',
        transformOrigin: '50% 50%',
        boxSizing: 'border-box',
      }}
    >
      {layers.map((l, i) =>
        l.opacity <= 0 ? null : (
          <Img
            key={l.asset + i}
            src={src(l.asset)}
            style={{
              position: 'absolute',
              left: -CROP_X * geom.s - 1,
              top: (geom.scroll ?? 0) + (l.dy ?? 0) - 1,
              width: ASSET_W * geom.s,
              height: ASSET_H * geom.s,
              opacity: l.opacity,
            }}
          />
        ),
      )}
    </div>
  );
};

/** A crop of one capture drawn into a canvas rect with uniform scale (width-fit, vertically centred). */
export const Crop: React.FC<{asset: string; crop: {x: number; y: number; w: number; h: number}; rect: {x: number; y: number; w: number; h: number}; opacity: number}> = ({asset, crop, rect, opacity}) => {
  if (opacity <= 0) return null;
  const k = rect.w / crop.w;
  const drawnH = crop.h * k;
  return (
    <div style={{position: 'absolute', left: rect.x, top: rect.y + (rect.h - drawnH) / 2, width: rect.w, height: drawnH, overflow: 'hidden', opacity}}>
      <Img src={src(asset)} style={{position: 'absolute', left: -crop.x * k, top: -crop.y * k, width: ASSET_W * k, height: ASSET_H * k}} />
    </div>
  );
};
