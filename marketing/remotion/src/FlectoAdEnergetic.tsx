import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Easing, Sequence, continueRender, delayRender, getStaticFiles, interpolate, spring, staticFile, useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';
import {CAPTION_BAND, CAPTION_SCENE_SCALE} from './Captions';
import {SnapHeadline} from './SnapHeadline';
import {BrandMark} from './Lockup';
import {Crop, Geom, Layer, SLOT, Sheet, Zoom, fit, lerpGeom, toCanvas} from './Sheet';
import {INSURANCE_REGIONS, useRegions} from './regions';
import {C, FONT} from './theme';
import {TOTAL_FRAMES} from './timeline';
import {A, TRANSFORM_POP_OFFSET, VO2_LINES, VO2_SEGMENTS, VO2_START} from './energetic';
import {clamp01} from './ease';
import {flectoAdSchema} from './FlectoAd';
import {z} from 'zod';

type Props = z.infer<typeof flectoAdSchema> & {oneClick?: boolean};

const has = (name: string) => getStaticFiles().some((f) => f.name === 'assets/' + name + '.png');
const pick = (name: string, fallback: string) => (has(name) ? name : fallback);

const snapEase = Easing.bezier(0.2, 0.9, 0.1, 1);
const p = (f: number, start: number, len: number, ease = snapEase) => interpolate(f, [start, start + len], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
const sp = (f: number, at: number, stiffness = 200) => spring({frame: f - at, fps: 30, config: {damping: 14, stiffness, mass: 0.7}});

const useFont = () => {
  const [h] = useState(() => delayRender('Pretendard'));
  useEffect(() => {
    const names = new Set(getStaticFiles().map((x) => x.name));
    const w: [string, string][] = [['Regular', '400'], ['Medium', '500'], ['SemiBold', '600'], ['Bold', '700'], ['ExtraBold', '800']];
    Promise.allSettled(
      w.filter(([n]) => names.has('fonts/Pretendard-' + n + '.otf')).map(([n, weight]) => new FontFace('Pretendard', 'url(' + staticFile('fonts/Pretendard-' + n + '.otf') + ')', {weight}).load().then((ff) => document.fonts.add(ff))),
    ).then(() => continueRender(h));
  }, [h]);
};

const chip = (tone: 'muted' | 'blue'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '10px 22px', borderRadius: 999, fontSize: 30, fontWeight: 800,
  color: tone === 'blue' ? '#fff' : C.ink, background: tone === 'blue' ? C.blue : C.surface,
  border: '2px solid ' + (tone === 'blue' ? C.blue : C.border), whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(23,32,51,0.10)',
});

export const FlectoAdEnergetic: React.FC<Props> = (props) => {
  useFont();
  const f = useCurrentFrame();
  const aSrc = pick('11-insurance-original', '01-source-benefits');
  const aInput = pick('12-insurance-input', '02-flecto-input');
  const aFilled = has('12-insurance-input-filled') ? '12-insurance-input-filled' : has('12-insurance-input') ? undefined : '02-flecto-input-filled';
  const aChoice = pick('13-insurance-choice', '03-flecto-choice');
  const aConsent = pick('14-insurance-consent', '03-flecto-choice');
  const aReview = pick('15-insurance-review', '04-flecto-review');
  const aSuccess = pick('16-insurance-success', '05-flecto-success');
  const RG = useRegions(INSURANCE_REGIONS, {source: aSrc, input: aInput, review: aReview});
  const filledOrInput = aFilled && has(aFilled) ? aFilled : aInput;

  const gSrc = fit(SLOT.A, RG.sourceCrop);
  const gA = fit(SLOT.A, RG.flectoCrop);
  const gB = fit(SLOT.B, RG.flectoCrop);
  const gSideA = fit(SLOT.CL, RG.sourceCrop);
  const gSideB = fit(SLOT.CR, RG.flectoCrop);

  // ----- push-in on A's first field -----
  const SF = RG.sourceField;
  const DF = RG.flectoField;
  const M = 28;
  const sheetW = gSrc.cropW * gSrc.s;
  const visH = 1080 - gSrc.y;
  const fw = SF.w * gSrc.s;
  const fh = SF.h * gSrc.s;
  const cx = (SF.x - gSrc.cropX) * gSrc.s + fw / 2;
  const cy = SF.y * gSrc.s + fh / 2;
  const K = Math.max(1, Math.min(RG.sourceZoom, (sheetW - 2 * M) / fw, (visH - 2 * M) / fh));
  const cl = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const cxE = cl(cx, M + (fw * K) / 2, sheetW - M - (fw * K) / 2);
  const cyE = cl(cy, M + (fh * K) / 2, visH - M - (fh * K) / 2);
  const zq = p(f, A.l1 + 8, A.hit - 14 - (A.l1 + 8), Easing.bezier(0.6, 0, 0.4, 1));
  const zoom: Zoom = {k: 1 + (K - 1) * zq, tx: (cxE - cx * K) * zq, ty: (cyE - cy * K) * zq};

  const HIT = A.hit;
  const punch = f >= HIT ? 1 + 0.045 * (1 - sp(f, HIT, 260)) : 1;

  // ----- main sheet state -----
  let geom: Geom = gA;
  let op = 1;
  let dy = 0;
  let scale = 1;
  let zoomState: Zoom | undefined;
  const layers: Layer[] = [];
  if (f < HIT - 2) {
    const s = sp(f, 0, 170);
    op = Math.min(1, s * 1.5) * (1 - clamp01((f - (HIT - 16)) / 5));
    dy = 90 * (1 - s);
    scale = 0.94 + 0.06 * s;
    geom = gSrc;
    zoomState = zoom;
    layers.push({asset: aSrc, opacity: 1});
  } else if (f < A.l4) {
    op = clamp01((f - (HIT - 2)) / 4) * (1 - clamp01((f - A.l4 + 8) / 8));
    scale = punch;
    layers.push({asset: aInput, opacity: 1});
  } else if (f < A.l5) {
    op = 0;
  } else if (f < A.l6) {
    const s = sp(f, A.l5, 220);
    op = Math.min(1, s * 1.6);
    dy = 60 * (1 - s);
    const q = p(f, A.l5b, 12);
    layers.push({asset: filledOrInput, opacity: 1 - q, dy: -50 * q});
    layers.push({asset: aChoice, opacity: q, dy: 50 * (1 - q)});
  } else if (f < A.l7) {
    const q = p(f, A.l6, 14);
    geom = lerpGeom(gA, gB, q);
    if (q < 1) layers.push({asset: aChoice, opacity: 1 - q, dy: -50 * q});
    layers.push({asset: aConsent, opacity: q, dy: 50 * (1 - q)});
  } else {
    geom = gB;
    const q = p(f, A.l7, 12);
    if (q < 1) layers.push({asset: aConsent, opacity: 1 - q, dy: -50 * q});
    layers.push({asset: aReview, opacity: q, dy: 50 * (1 - q)});
    const x = p(f, A.l7success, 8);
    if (x > 0) layers.push({asset: aSuccess, opacity: x});
    op = 1 - clamp01((f - A.l8) / 8);
    dy = -30 * clamp01((f - A.l8) / 8);
  }

  // ----- morph: A's small field snaps into B's large field -----
  let morph: React.ReactNode = null;
  if (f >= HIT - 14 && f < HIT + 4) {
    const sw = fw * K;
    const sh = fh * K;
    const sx = gSrc.x + cxE - sw / 2;
    const sy = gSrc.y + cyE - sh / 2;
    const [dx, dy2] = toCanvas(gA, DF.x, DF.y);
    const q = p(f, HIT - 14, 16);
    const rect = {x: sx + (dx - sx) * q, y: sy + (dy2 - sy) * q, w: sw + (DF.w * gA.s - sw) * q, h: sh + (DF.h * gA.s - sh) * q};
    const b = clamp01((f - (HIT - 12)) / 8);
    morph = (
      <>
        <Crop asset={aSrc} crop={SF} rect={rect} opacity={1 - clamp01((f - (HIT - 8)) / 6)} />
        <Crop asset={aInput} crop={DF} rect={rect} opacity={b} />
      </>
    );
  }

  // ----- review underlines -----
  const ul = RG.reviewValues.slice(0, 4).map((v, i) => {
    const t0 = A.l7 + 14 + i * 8;
    if (f < t0 || f >= A.l7success + 8) return null;
    const q = p(f, t0, 8);
    const [x, y] = toCanvas(gB, v.x, v.y + v.h + 6);
    return <div key={i} style={{position: 'absolute', left: x, top: y, width: v.w * gB.s * q, height: 4, borderRadius: 2, background: C.blue}} />;
  });

  // ----- side-by-side (line 4) -----
  const sideIn = sp(f, A.l4 + 2, 210);
  const sideOut = clamp01((f - (A.l5 - 8)) / 8);
  const side =
    f >= A.l4 && f < A.l5 ? (
      <>
        <Sheet geom={gSideA} layers={[{asset: aSrc, opacity: 1}]} opacity={Math.min(1, sideIn * 1.6) * (1 - sideOut)} dx={-120 * (1 - sideIn)} />
        <Sheet geom={gSideB} layers={[{asset: filledOrInput, opacity: 1}]} opacity={Math.min(1, sp(f, A.l4 + 10, 210) * 1.6) * (1 - sideOut)} dx={120 * (1 - sp(f, A.l4 + 10, 210))} scale={1 + 0.04 * (1 - sp(f, A.l4 + 10, 260))} />
        <div style={{position: 'absolute', left: gSideA.x, top: 262, opacity: (1 - sideOut) * clamp01((f - A.l4 - 6) / 4)}}><span style={chip('muted')}>원본 화면</span></div>
        <div style={{position: 'absolute', left: gSideB.x, top: 262, opacity: (1 - sideOut) * clamp01((f - A.l4 - 14) / 4)}}><span style={chip('blue')}>쉬운 화면 · FLECTO</span></div>
      </>
    ) : null;

  // ----- 원본 → 쉬운 화면 tag over the opening -----
  let tag: React.ReactNode = null;
  if (f >= 8 && f < A.l4) {
    const bOn = f >= HIT ? Math.min(1, sp(f, HIT, 260) * 1.5) : 0;
    const o = clamp01((f - 8) / 5) * (1 - clamp01((f - A.l4 + 8) / 6));
    tag = (
      <div style={{position: 'absolute', right: 120, top: 250, display: 'flex', alignItems: 'center', gap: 16, opacity: o}}>
        <span style={{...chip('muted'), opacity: f >= HIT ? 0.6 : 1}}>원본 화면</span>
        {bOn > 0 ? (
          <>
            <span style={{fontSize: 40, fontWeight: 800, color: C.blue, opacity: bOn}}>→</span>
            <span style={{...chip('blue'), transform: 'scale(' + (0.8 + 0.2 * bOn) + ')', opacity: bOn}}>쉬운 화면</span>
          </>
        ) : null}
      </div>
    );
  }

  // ----- end card -----
  const lock = f >= A.l8 ? sp(f, A.l8 + 2, 220) : 0;
  const endCard =
    f >= A.l8 ? (
      <>
        <div style={{position: 'absolute', left: 0, width: '100%', top: 486, display: 'flex', justifyContent: 'center', opacity: Math.min(1, lock * 1.6), transform: 'translateY(' + 40 * (1 - lock) + 'px) scale(' + (0.85 + 0.15 * lock) + ')'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 30}}>
            <BrandMark size={110} />
            <div style={{fontSize: 110, fontWeight: 800, color: C.blue, letterSpacing: '0.04em', lineHeight: 1}}>FLECTO</div>
          </div>
        </div>
        <div style={{position: 'absolute', left: 0, width: '100%', top: 640, textAlign: 'center', fontSize: 30, fontWeight: 600, color: C.muted, opacity: clamp01((f - A.l8 - 60) / 8)}}>
          Don’t bend the user. Bend the interface.
        </div>
        {props.showFootnote ? (
          <div style={{position: 'absolute', left: 0, width: '100%', top: 1004, textAlign: 'center', fontSize: 22, color: C.muted, opacity: clamp01((f - A.l8 - 70) / 8)}}>
            온담보험 시연센터는 가상의 기관입니다. 로컬 보험 시뮬레이션에서 확장 프로그램으로 캡처한 화면이며, 합성 데이터로 실제 보험 접수가 아닙니다.
          </div>
        ) : null}
      </>
    ) : null;

  const footer = f < A.l8 ? '로컬 보험 시뮬레이션 · 합성 데이터 · 실제 보험 접수 아님' + (f >= A.l7success ? ' · 일부 과정 축약' : '') : '';
  const cap = VO2_SEGMENTS.findIndex(([a, b]) => f >= a - 2 && f < b + 8);

  return (
    <AbsoluteFill style={{background: C.paper, fontFamily: FONT, color: C.ink}}>
      <AbsoluteFill style={props.showCaptions ? {overflow: 'hidden', transform: 'scale(' + CAPTION_SCENE_SCALE + ')', transformOrigin: '50% 0%'} : {overflow: 'hidden'}}>
        {op > 0 && layers.length ? <Sheet geom={geom} layers={layers} opacity={op} dy={dy} scale={scale} zoom={zoomState} /> : null}
        {morph}
        {ul}
        {side}
        {tag}
        <SnapHeadline layout="A" lines={[{text: '작은 글씨.', at: A.l1}, {text: '복잡한 보험금 청구.', at: A.l1b}]} out={A.l2 - 4} />
        <SnapHeadline layout="A" lines={[{text: '이제,', at: A.l2}, {text: '화면이 바뀔 차례!', at: A.l2b, accent: true}]} out={A.l3 - 4} />
        <SnapHeadline layout="A" lines={[{text: '어르신을 위한', at: A.l3}, {text: '쉬운 화면, FLECTO', at: A.l3b, accent: true}]} out={A.l4 - 4} />
        <SnapHeadline layout="C" lines={[{text: props.oneClick ? '한 번 누르면, 크고 간단하게.' : '복잡한 화면이, 크고 간단하게.', at: A.l4 + 4}]} out={A.l5 - 6} />
        <SnapHeadline layout="A" lines={[{text: '여기에 입력.', at: A.l5 + 2}, {text: '여기서 선택.', at: A.l5b, accent: true}]} out={A.l6 - 4} />
        <SnapHeadline layout="B" lines={[{text: '바로 옆에서', at: A.l6 + 2}, {text: '알려주니까.', at: A.l6b, accent: true}]} out={A.l7 - 4} />
        <SnapHeadline layout="B" lines={[{text: '입력도,', at: A.l7}, {text: '마지막 확인도', at: A.l7b}, {text: '내 손으로.', at: A.l7success, accent: true}]} out={A.l8 - 4} />
        <SnapHeadline layout="END" lines={[{text: '화면은 쉽게,', at: A.l8b}, {text: '선택은 내가.', at: A.l8c, accent: true}]} out={TOTAL_FRAMES + 10} />
        {endCard}
        {footer ? <div style={{position: 'absolute', left: 120, top: 1026, fontSize: 22, fontWeight: 600, color: C.muted}}>{footer}</div> : null}
      </AbsoluteFill>
      {props.showCaptions ? (
        <div style={{position: 'absolute', left: 0, width: '100%', top: 1080 - CAPTION_BAND, height: CAPTION_BAND, background: C.paper, borderTop: '1px solid ' + C.border, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          {cap >= 0 ? <div style={{fontSize: 34, fontWeight: 600, color: 'rgba(23,32,51,0.9)', whiteSpace: 'nowrap'}}>{VO2_LINES[cap]}</div> : null}
        </div>
      ) : null}
      {props.muted ? null : <EnergeticSound {...props} />}
    </AbsoluteFill>
  );
};

const duck = (f: number) => {
  let d = 0;
  for (const [a0, b0] of VO2_SEGMENTS) {
    const a = a0;
    const b = b0;
    const v = f < a ? 1 - (a - f) / 5 : f <= b ? 1 : 1 - (f - b) / 12;
    d = Math.max(d, clamp01(v));
  }
  return d;
};
// music-bright-1: -12.9 LUFS source. Gaps ≈ -16 LUFS (bright, no quiet intro), under VO ≈ -24 LUFS.
export const MUSIC_OPEN_E = 0.7;
export const MUSIC_DUCK_E = 0.28;
export const VO_GAIN_E = 1;

const EnergeticSound: React.FC<Props> = ({voFile, musicFile, sfxDir}) => {
  const sfx = (at: number, file: string, vol: number) =>
    has2(file) ? (
      <Sequence from={at} durationInFrames={Math.max(1, TOTAL_FRAMES - 6 - at)} layout="none">
        <Audio src={staticFile(file)} volume={vol} />
      </Sequence>
    ) : null;
  return (
    <>
      {has2(musicFile) ? (
        <Sequence durationInFrames={TOTAL_FRAMES} layout="none">
          <Audio src={staticFile(musicFile)} volume={(fr) => (MUSIC_OPEN_E + (MUSIC_DUCK_E - MUSIC_OPEN_E) * duck(fr)) * interpolate(fr, [0, 4, 850, 895], [0.6, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
        </Sequence>
      ) : null}
      {has2(voFile) ? (
        <Sequence from={VO2_START} durationInFrames={TOTAL_FRAMES - 4 - VO2_START} layout="none">
          <Audio src={staticFile(voFile)} volume={VO_GAIN_E} />
        </Sequence>
      ) : null}
      {has2(sfxDir + '/sfx-transform-bright-1.mp3') ? sfx(A.hit - TRANSFORM_POP_OFFSET, sfxDir + '/sfx-transform-bright-1.mp3', 0.5) : sfx(A.hit - 2, sfxDir + '/sfx-press_soft-1.mp3', 0.7)}
      {sfx(A.l5b, sfxDir + '/sfx-select_tick-1.mp3', 0.5)}
      {sfx(A.l7success, sfxDir + '/sfx-done_soft-1-mix.wav', 0.8)}
      {sfx(A.l8, sfxDir + '/sfx-brand_ending-1.mp3', 0.9)}
    </>
  );
};
const has2 = (file: string) => getStaticFiles().some((x) => x.name === file);
