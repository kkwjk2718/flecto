import React, {useEffect, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, getStaticFiles, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {CAPTION_SCENE_SCALE, Captions} from './Captions';
import {Headline} from './Headline';
import {BrandLockup, Footnote} from './Lockup';
import {Crop, Geom, Layer, SLOT, Sheet, Zoom, fit, lerpGeom, toCanvas} from './Sheet';
import {Soundtrack} from './Soundtrack';
import {BENEFITS_REGIONS, INSURANCE_REGIONS, useRegions} from './regions';
import {C, FONT} from './theme';
import {T, TOTAL_FRAMES} from './timeline';
import {clamp01, enter, exit, move} from './ease';

export const flectoAdSchema = z.object({
  voFile: z.string(),
  musicFile: z.string(),
  sfxDir: z.string(),
  voOffsetFrames: z.number(),
  showCaptions: z.boolean(),
  showFootnote: z.boolean(),
  muted: z.boolean(),
  story: z.enum(['insurance', 'benefits']),
});

type Props = z.infer<typeof flectoAdSchema>;

const WEIGHTS: [string, string][] = [
  ['Regular', '400'],
  ['Medium', '500'],
  ['SemiBold', '600'],
  ['Bold', '700'],
  ['ExtraBold', '800'],
];

const useLocalFont = () => {
  const [handle] = useState(() => delayRender('Pretendard'));
  useEffect(() => {
    const names = new Set(getStaticFiles().map((f) => f.name));
    const loads = WEIGHTS.filter(([w]) => names.has('fonts/Pretendard-' + w + '.otf')).map(([w, weight]) => {
      const face = new FontFace('Pretendard', 'url(' + staticFile('fonts/Pretendard-' + w + '.otf') + ')', {weight});
      return face.load().then((f) => document.fonts.add(f));
    });
    Promise.allSettled(loads).then(() => continueRender(handle));
  }, [handle]);
};

const has = (name: string) => getStaticFiles().some((f) => f.name === 'assets/' + name + '.png');
const firstExisting = (names: string[]) => names.find(has);
/** Story asset if captured, else the benefits capture (preview only; final renders are checked for real assets). */
const pick = (names: string[], fallback: string) => firstExisting(names) ?? fallback;

const STORY = {
  benefits: {
    src: ['01-source-benefits'],
    input: ['02-flecto-input'],
    filled: ['02-flecto-input-filled', '02-filled'],
    choiceEmpty: ['03-flecto-choice-empty', '03-empty'],
    choice: ['03-flecto-choice'],
    consent: [] as string[],
    review: ['04-flecto-review'],
    success: ['05-flecto-success'],
    second: ['06-culture-success'],
    regions: BENEFITS_REGIONS,
  },
  insurance: {
    src: ['11-insurance-original'],
    input: ['12-insurance-input'],
    filled: ['12-insurance-input-filled'],
    choiceEmpty: ['13-insurance-choice-empty'],
    choice: ['13-insurance-choice'],
    consent: ['14-insurance-consent'],
    review: ['15-insurance-review'],
    success: ['16-insurance-success'],
    second: [] as string[],
    regions: INSURANCE_REGIONS,
  },
};

const chip = (label: string, tone: 'muted' | 'blue'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 18px',
  borderRadius: 999,
  fontSize: 28,
  fontWeight: tone === 'blue' ? 700 : 600,
  color: tone === 'blue' ? C.blue : C.muted,
  background: tone === 'blue' ? C.blueSoft : C.surface,
  border: '1px solid ' + (tone === 'blue' ? '#C7D7FD' : C.border),
  whiteSpace: 'nowrap',
});

export const FlectoAd: React.FC<Props> = (props) => {
  useLocalFont();
  const ins = props.story === 'insurance';
  const S = STORY[props.story];
  const aSrc = pick(S.src, '01-source-benefits');
  const aInput = pick(S.input, '02-flecto-input');
  const aFilled = firstExisting(S.filled);
  const aChoiceEmpty = firstExisting(S.choiceEmpty);
  const aChoice = pick(S.choice, '03-flecto-choice');
  const aConsent = pick(S.consent, aChoice);
  const aReview = pick(S.review, '04-flecto-review');
  const aSuccess = pick(S.success, '05-flecto-success');
  const aSecond = firstExisting(S.second);
  const RG = useRegions(S.regions, {source: aSrc, input: aInput, review: aReview});
  const f = useCurrentFrame();

  const gSrc = fit(SLOT.A, RG.sourceCrop);
  const gA = fit(SLOT.A, RG.flectoCrop);
  const gB = fit(SLOT.B, RG.flectoCrop);
  const gCL = fit(SLOT.CL, RG.flectoCrop);
  const gCR = fit(SLOT.CR, RG.flectoCrop);
  const gSideA = fit(SLOT.CL, RG.sourceCrop);

  // ---------- B1 push-in on A's small first field (real pixels only) ----------
  const SF = RG.sourceField;
  const DF = RG.flectoField;
  const MARGIN = 28;
  const sheetW = gSrc.cropW * gSrc.s;
  const visibleH = 1080 - gSrc.y;
  const fw = SF.w * gSrc.s;
  const fh = SF.h * gSrc.s;
  const cx = (SF.x - gSrc.cropX) * gSrc.s + fw / 2;
  const cy = SF.y * gSrc.s + fh / 2;
  const K = Math.max(1, Math.min(RG.sourceZoom, (sheetW - 2 * MARGIN) / fw, (visibleH - 2 * MARGIN) / fh));
  const clampTo = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const cxEnd = clampTo(cx, MARGIN + (fw * K) / 2, sheetW - MARGIN - (fw * K) / 2);
  const cyEnd = clampTo(cy, MARGIN + (fh * K) / 2, visibleH - MARGIN - (fh * K) / 2);
  const zq = move(f, T.b1ZoomFrom, T.b1ZoomTo - T.b1ZoomFrom);
  const zoom: Zoom = {k: 1 + (K - 1) * zq, tx: (cxEnd - cx * K) * zq, ty: (cyEnd - cy * K) * zq};

  // ---------- main sheet ----------
  let geom: Geom = gA;
  let sheetOpacity = 1;
  let sheetDy = 0;
  let sheetZoom: Zoom | undefined;
  const layers: Layer[] = [];
  const inputFinal = aFilled ?? aInput;

  if (f < T.b2RestOutEnd) {
    const inP = enter(f, T.b1SheetIn, 24);
    sheetOpacity = inP * (1 - clamp01((f - T.b2Start) / (T.b2RestOutEnd - T.b2Start)));
    sheetDy = (1 - inP) * 40;
    geom = gSrc;
    sheetZoom = zoom;
    layers.push({asset: aSrc, opacity: 1});
  } else if (f < T.b2RestInFrom) {
    sheetOpacity = 0;
  } else if (f < T.b3SlideFrom) {
    sheetOpacity = clamp01((f - T.b2RestInFrom) / (T.b2RestInTo - T.b2RestInFrom));
    layers.push({asset: aInput, opacity: 1});
    if (aFilled) layers.push({asset: aFilled, opacity: clamp01((f - T.b3FilledFrom) / (T.b3FilledTo - T.b3FilledFrom))});
  } else if (f < T.b4SlideFrom) {
    const p = move(f, T.b3SlideFrom, T.b3SlideTo - T.b3SlideFrom);
    layers.push({asset: inputFinal, opacity: 1 - p, dy: -40 * p});
    const choiceP = aChoiceEmpty ? clamp01((f - T.b3cChoiceXfade) / T.b3cChoiceXfadeLen) : 1;
    if (aChoiceEmpty) layers.push({asset: aChoiceEmpty, opacity: p, dy: 40 * (1 - p)});
    layers.push({asset: aChoice, opacity: p * choiceP, dy: 40 * (1 - p)});
  } else if (ins) {
    if (f < T.i4ReviewSlideFrom) {
      const p = move(f, T.b4SlideFrom, T.b4SlideTo - T.b4SlideFrom);
      geom = lerpGeom(gA, gB, p);
      if (p < 1) layers.push({asset: aChoice, opacity: 1 - p, dy: -40 * p});
      layers.push({asset: aConsent, opacity: p, dy: 40 * (1 - p)});
    } else {
      geom = gB;
      const p = move(f, T.i4ReviewSlideFrom, 18);
      if (p < 1) layers.push({asset: aConsent, opacity: 1 - p, dy: -40 * p});
      layers.push({asset: aReview, opacity: p, dy: 40 * (1 - p)});
      const x = clamp01((f - T.b5Xfade) / T.b5XfadeLen);
      if (x > 0) layers.push({asset: aSuccess, opacity: x});
      sheetOpacity = 1 - exit(f, T.iSideFrom, 16);
      sheetDy = 16 * exit(f, T.iSideFrom, 16);
    }
  } else if (f < T.b5ToLayoutC) {
    const p = move(f, T.b4SlideFrom, T.b4SlideTo - T.b4SlideFrom);
    geom = lerpGeom(gA, gB, p);
    if (p < 1) layers.push({asset: aChoice, opacity: 1 - p, dy: -40 * p});
    layers.push({asset: aReview, opacity: p, dy: 40 * (1 - p)});
    const x = clamp01((f - T.b5Xfade) / T.b5XfadeLen);
    if (x > 0) layers.push({asset: aSuccess, opacity: x});
  } else {
    const p = move(f, T.b5ToLayoutC, T.b5ToLayoutCEnd - T.b5ToLayoutC);
    geom = lerpGeom(gB, gCL, p);
    layers.push({asset: aSuccess, opacity: 1});
    sheetOpacity = 1 - exit(f, T.b6Out, 18);
    sheetDy = 16 * exit(f, T.b6Out, 18);
  }

  const drift = interpolate(f, [T.b5ToLayoutCEnd, T.b5HoldEnd], [1, 1.01], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const inLayoutC = !ins && f >= T.b5ToLayoutCEnd;

  // ---------- B2 morph: A's small field lifts out and grows into B's large field ----------
  let morph: React.ReactNode = null;
  if (f >= T.b2Start && f < T.b2RestInTo) {
    const sw = fw * K;
    const sh = fh * K;
    const sx = gSrc.x + cxEnd - sw / 2;
    const sy = gSrc.y + cyEnd - sh / 2;
    const [dx, dy] = toCanvas(gA, DF.x, DF.y);
    const dw = DF.w * gA.s;
    const dh = DF.h * gA.s;
    const p = move(f, T.b2MoveFrom, T.b2MoveTo - T.b2MoveFrom);
    const rect = {x: sx + (dx - sx) * p, y: sy + (dy - sy) * p, w: sw + (dw - sw) * p, h: sh + (dh - sh) * p};
    const in02 = clamp01((f - T.b2XfadeFrom) / 14);
    const out01 = clamp01((f - (T.b2XfadeFrom + 6)) / 10);
    morph = (
      <>
        <Crop asset={aSrc} crop={SF} rect={rect} opacity={1 - out01} />
        <Crop asset={aInput} crop={DF} rect={rect} opacity={in02} />
      </>
    );
  }

  // ---------- review underlines ----------
  const ulTimes = ins ? T.iUnderlines : T.b4Underlines;
  const underlines =
    f >= ulTimes[0] && f < T.b5Xfade + T.b5XfadeLen
      ? RG.reviewValues.slice(0, ulTimes.length).map((v, i) => {
          const p = move(f, ulTimes[i], 12);
          const fade = 1 - clamp01((f - T.b5Xfade) / 8);
          const [x, y] = toCanvas(gB, v.x, v.y + v.h + 7);
          return <div key={i} style={{position: 'absolute', left: x, top: y, width: v.w * gB.s * p, height: 2, background: C.ink, opacity: fade}} />;
        })
      : null;

  // ---------- second sheet(s) ----------
  const sideP = enter(f, T.iSideIn, 22);
  const sideOut = exit(f, T.b6Out, 18);
  const sideBySide =
    ins && f >= T.iSideIn && f < T.b6Out + 20 ? (
      <>
        <Sheet geom={gSideA} layers={[{asset: aSrc, opacity: 1}]} opacity={sideP * (1 - sideOut)} dx={-60 * (1 - sideP)} dy={16 * sideOut} scale={drift} />
        <Sheet geom={gCR} layers={[{asset: inputFinal, opacity: 1}]} opacity={sideP * (1 - sideOut)} dx={60 * (1 - sideP)} dy={16 * sideOut} scale={drift} />
        <div style={{position: 'absolute', left: gSideA.x, top: 276, opacity: enter(f, T.iSideIn + 8, 14) * (1 - sideOut)}}>
          <span style={chip('원본 화면', 'muted')}>원본 화면</span>
        </div>
        <div style={{position: 'absolute', left: gCR.x, top: 276, opacity: enter(f, T.iSideIn + 16, 14) * (1 - sideOut)}}>
          <span style={chip('쉬운 화면', 'blue')}>쉬운 화면 · FLECTO</span>
        </div>
      </>
    ) : null;

  const cultureP = enter(f, T.b5ToLayoutC + 6, 24);
  const culture =
    !ins && aSecond && f >= T.b5ToLayoutC + 6 && f < T.b6Out + 20 ? (
      <Sheet geom={gCR} layers={[{asset: aSecond, opacity: 1}]} opacity={cultureP * (1 - exit(f, T.b6Out, 18))} dx={80 * (1 - cultureP)} dy={16 * exit(f, T.b6Out, 18)} scale={drift} />
    ) : null;

  const capStyle: React.CSSProperties = {position: 'absolute', top: 290, fontSize: 28, fontWeight: 500, color: C.muted, lineHeight: 1.4, whiteSpace: 'nowrap'};
  const capOut = 1 - exit(f, T.b6Out, 18);

  // ---------- "원본 화면 → 쉬운 화면" tag over the opening sheet ----------
  let tag: React.ReactNode = null;
  if (ins && f >= T.b1SheetIn + 6 && f < T.b4SlideFrom + 10) {
    const o = enter(f, T.b1SheetIn + 6, 14) * (1 - exit(f, T.b4SlideFrom, 10)) * (f >= T.b2RestOutEnd && f < T.b2RestInFrom ? 1 : 1);
    const showArrow = f >= T.b2Start;
    const bOn = enter(f, T.b2Start + 4, 14);
    tag = (
      <div style={{position: 'absolute', right: 1920 - 1800, top: 268, display: 'flex', alignItems: 'center', gap: 14, opacity: o}}>
        <span style={{...chip('원본 화면', 'muted'), opacity: f >= T.b3SlideFrom ? 0.55 : 1}}>원본 화면</span>
        {showArrow ? (
          <>
            <span style={{fontSize: 34, fontWeight: 700, color: C.blue, opacity: bOn}}>→</span>
            <span style={{...chip('쉬운 화면', 'blue'), opacity: bOn}}>쉬운 화면</span>
          </>
        ) : null}
      </div>
    );
  }

  const disclaimer = ins ? '합성 시연 · 실제 보험 접수 아님' : '';

  return (
    <AbsoluteFill style={{background: C.paper, fontFamily: FONT, color: C.ink}}>
      <AbsoluteFill
        style={
          props.showCaptions
            ? {overflow: 'hidden', transform: 'scale(' + CAPTION_SCENE_SCALE + ')', transformOrigin: '50% 0%'}
            : {overflow: 'hidden'}
        }
      >
        {sheetOpacity > 0 && layers.length > 0 ? (
          <Sheet geom={geom} layers={layers} opacity={sheetOpacity} dy={sheetDy} scale={inLayoutC ? drift : 1} zoom={sheetZoom} />
        ) : null}
        {morph}
        {underlines}
        {culture}
        {sideBySide}
        {tag}
        {!ins && f >= T.b5CapLeft && f < T.b6Out + 20 ? (
          <>
            <div style={{...capStyle, left: gCL.x, opacity: enter(f, T.b5CapLeft, 14) * capOut}}>구매 혜택 신청 · 온담</div>
            <div style={{...capStyle, left: gCR.x, opacity: enter(f, T.b5CapRight, 14) * capOut}}>수강 신청 · 한빛 생활문화센터</div>
          </>
        ) : null}

        {ins ? (
          <>
            <Headline layout="A" lines={[{text: '보험금 청구, 하고 싶은 일은 하나.', at: T.b1L1}, {text: '화면은 먼저 복잡합니다.', at: T.b1L2}]} out={T.b2HeadOut} />
            <Headline layout="A" lines={[{text: '같은 청구서,', at: T.b2L1}, {text: '필요한 순서로.', at: T.b2L2}]} out={T.b3HeadOut} />
            <Headline layout="A" lines={[{text: '큰 글씨, 큰 버튼.', at: T.b3cL1}, {text: '한 번에 하나씩.', at: T.b3cL2}]} out={T.b4HeadOut} />
            <Headline layout="B" lines={[{text: '입력도, 선택도,', at: T.b4L1}, {text: '마지막 확인도', at: T.b4L2}, {text: '내 손으로.', at: T.b4L3}]} out={T.b5Xfade - 6} />
            <Headline layout="B" lines={[{text: '보험금 청구는', at: T.b5L1}, {text: '원래 사이트에서', at: T.b5L2}, {text: '그대로.', at: T.b5L3}]} out={T.iSideFrom - 6} />
            <Headline layout="C" lines={[{text: '원본 화면 → 쉬운 화면', at: T.iSideIn + 4}]} out={T.b6Out} />
          </>
        ) : (
          <>
            <Headline layout="A" lines={[{text: '하고 싶은 일은 하나.', at: T.b1L1}, {text: '화면은 먼저 복잡합니다.', at: T.b1L2}]} out={T.b2HeadOut} />
            <Headline layout="A" lines={[{text: '같은 화면,', at: T.b2L1}, {text: '필요한 순서로.', at: T.b2L2}]} out={T.b3HeadOut} />
            <Headline layout="A" lines={[{text: '큰 글씨, 큰 버튼.', at: T.b3cL1}, {text: '한 번에 하나씩.', at: T.b3cL2}]} out={T.b4HeadOut} />
            <Headline layout="B" lines={[{text: '입력도, 선택도,', at: T.b4L1}, {text: '마지막 확인도', at: T.b4L2}, {text: '내 손으로.', at: T.b4L3}]} out={T.b5Xfade - 6} />
            <Headline layout="B" lines={[{text: '신청은', at: T.b5L1}, {text: '원래 사이트에서', at: T.b5L2}, {text: '그대로.', at: T.b5L3}]} out={T.b5ColOut} />
            <Headline layout="C" lines={[{text: '신청은 원래 사이트에서 그대로.', at: T.b5TopLine}]} out={T.b6Out} />
          </>
        )}
        <Headline layout="END" lines={[{text: '사용자를 바꾸는 대신,', at: T.b6L1}, {text: '화면을 바꿉니다.', at: T.b6L2}]} out={TOTAL_FRAMES + 10} lift={move(f, T.b6LiftFrom, T.b6LiftTo - T.b6LiftFrom)} />

        {ins && f >= T.b1SheetIn && f < T.b6Out + 12 ? (
          <div style={{position: 'absolute', left: 120, top: 1026, fontSize: 22, fontWeight: 500, color: C.muted, opacity: enter(f, T.b1SheetIn, 14) * (1 - exit(f, T.b6Out, 10))}}>
            {disclaimer}
            {f >= T.b5Xfade ? ' · 일부 과정 축약' : ''}
          </div>
        ) : null}
        {!ins && f >= T.b5Xfade && f < T.b6Out + 12 ? (
          <div style={{position: 'absolute', left: 120, top: 1026, fontSize: 22, fontWeight: 400, color: C.muted, opacity: enter(f, T.b5Xfade, 14) * (1 - exit(f, T.b6Out, 10))}}>
            일부 과정 축약
          </div>
        ) : null}

        <BrandLockup />
        {props.showFootnote ? <Footnote story={props.story} /> : null}
      </AbsoluteFill>
      {props.showCaptions ? <Captions voOffsetFrames={props.voOffsetFrames} /> : null}
      {props.muted ? null : <Soundtrack {...props} choiceChanges={Boolean(aChoiceEmpty)} />}
    </AbsoluteFill>
  );
};
