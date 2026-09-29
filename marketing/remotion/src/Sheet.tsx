import React from 'react';
import {Img, staticFile} from 'remotion';
import type {CropSpec} from './regions';
import {C, SHEET_SHADOW} from './theme';

// Captures are 1440x1100 logical CSS px (files may be 2x DPR; they are always drawn at 1440 CSS width).
export const ASSET_W = 1440;
export const ASSET_H = 1100;

export type Geom = {x: number; y: number; s: number; scroll?: number; cropX: number; cropW: number};
type Slot = {x: number; y: number; w: number; maxH: number};
export const SLOT: Record<'A' | 'B' | 'CL' | 'CR', Slot> = {
  A: {x: 720, y: 330, w: 1080, maxH: Infinity}, // bleeds off the bottom
  B: {x: 720, y: 90, w: 1080, maxH: 990}, // footer visible
  CL: {x: 192, y: 330, w: 744, maxH: 682},
  CR: {x: 984, y: 330, w: 744, maxH: 682},
};

/** Fit a capture crop into a layout slot without stretching; narrower results are centred in the slot. */
export const fit = (slot: Slot, crop: CropSpec): Geom => {
  const s = Math.min(slot.w / crop.w, slot.maxH / ASSET_H);
  const w = crop.w * s;
  return {x: slot.x + (slot.w - w) / 2, y: slot.y, s, cropX: crop.x, cropW: crop.w};
};

export const lerpGeom = (a: Geom, b: Geom, p: number): Geom => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  s: a.s + (b.s - a.s) * p,
  scroll: (a.scroll ?? 0) + ((b.scroll ?? 0) - (a.scroll ?? 0)) * p,
  cropX: a.cropX + (b.cropX - a.cropX) * p,
  cropW: a.cropW + (b.cropW - a.cropW) * p,
});

/** Asset coordinate -> canvas coordinate. Overlays must use this, never hardcoded canvas numbers. */
export const toCanvas = (g: Geom, ax: number, ay: number): [number, number] => [g.x + (ax - g.cropX) * g.s, g.y + (g.scroll ?? 0) + ay * g.s];

export type Layer = {asset: string; opacity: number; dy?: number};
export type Zoom = {k: number; tx: number; ty: number}; // sheet-local: p' = p * k + t

const src = (asset: string) => staticFile('assets/' + asset + '.png');

export const Sheet: React.FC<{geom: Geom; layers: Layer[]; opacity?: number; dx?: number; dy?: number; scale?: number; zoom?: Zoom}> = ({geom, layers, opacity = 1, dx = 0, dy = 0, scale = 1, zoom}) => {
  const w = geom.cropW * geom.s;
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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: zoom ? 'translate(' + zoom.tx + 'px,' + zoom.ty + 'px) scale(' + zoom.k + ')' : undefined,
          transformOrigin: '0 0',
        }}
      >
        {layers.map((l, i) =>
          l.opacity <= 0 ? null : (
            <Img
              key={l.asset + i}
              src={src(l.asset)}
              style={{
                position: 'absolute',
                left: -geom.cropX * geom.s - 1,
                top: (geom.scroll ?? 0) + (l.dy ?? 0) - 1,
                width: ASSET_W * geom.s,
                height: ASSET_H * geom.s,
                opacity: l.opacity,
              }}
            />
          ),
        )}
      </div>
    </div>
  );
};

/** A crop of one capture drawn into a canvas rect with uniform scale (width-fit, vertically centred). */
export const Crop: React.FC<{asset: string; crop: {x: number; y: number; w: number; h: number}; rect: {x: number; y: number; w: number; h: number}; opacity: number}> = ({asset, crop, rect, opacity}) => {
  if (opacity <= 0) return null;
  const k = rect.w / crop.w;
  const drawnH = crop.h * k;
  return (
    <div style={{position: 'absolute', left: rect.x, top: rect.y + (rect.h - drawnH) / 2, width: rect.w, height: drawnH, overflow: 'hidden', opacity, background: C.surface, borderRadius: 6}}>
      <Img src={src(asset)} style={{position: 'absolute', left: -crop.x * k, top: -crop.y * k, width: ASSET_W * k, height: ASSET_H * k}} />
    </div>
  );
};
