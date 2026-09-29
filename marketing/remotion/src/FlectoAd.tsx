import React, {useEffect, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, getStaticFiles, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {Captions} from './Captions';
import {Headline} from './Headline';
import {BrandLockup, Footnote} from './Lockup';
import {A, B, CL, CR, Crop, Geom, Layer, Sheet, lerpGeom, toCanvas} from './Sheet';
import {Soundtrack} from './Soundtrack';
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

// Field rects in asset coordinates (logical 1440x1100). 01 matches the brief; 02 and 04 were re-measured
// from the current captures (04 is captured scrolled ~30px so its value rows sit higher than the brief says).
const SRC_FIELD = {x: 247, y: 481, w: 600, h: 96};
const DST_FIELD = {x: 367, y: 322, w: 706, h: 122};
const REVIEW_VALUES = [
  {x: 367, y: 436, w: 237},
  {x: 367, y: 563, w: 154},
  {x: 367, y: 691, w: 45},
  {x: 367, y: 819, w: 68},
];

export const FlectoAd: React.FC<Props> = (props) => {
  useLocalFont();
  const f = useCurrentFrame();

  const filled = firstExisting(['02-flecto-input-filled', '02-filled']);
  const empty03 = firstExisting(['03-flecto-choice-empty', '03-empty']);

  // ---------- main sheet (01 -> 02 -> 03 -> 04 -> 05) ----------
  let geom: Geom = A;
  let sheetOpacity = 1;
  let sheetDy = 0;
  const layers: Layer[] = [];

  if (f < T.b2RestOutEnd) {
    const inP = enter(f, T.b1SheetIn, 24);
    sheetOpacity = inP * (1 - clamp01((f - T.b2Start) / (T.b2RestOutEnd - T.b2Start)));
    sheetDy = (1 - inP) * 40;
    const scroll = interpolate(f, [T.b1ScrollFrom, T.b1ScrollTo], [0, -60], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    geom = {...A, scroll};
    layers.push({asset: '01-source-benefits', opacity: 1});
  } else if (f < T.b2RestInFrom) {
    sheetOpacity = 0;
  } else if (f < T.b3SlideFrom) {
    sheetOpacity = clamp01((f - T.b2RestInFrom) / (T.b2RestInTo - T.b2RestInFrom));
    layers.push({asset: '02-flecto-input', opacity: 1});
    if (filled) layers.push({asset: filled, opacity: clamp01((f - T.b3FilledFrom) / (T.b3FilledTo - T.b3FilledFrom))});
  } else if (f < T.b4SlideFrom) {
    const p = move(f, T.b3SlideFrom, T.b3SlideTo - T.b3SlideFrom);
    layers.push({asset: filled ?? '02-flecto-input', opacity: 1 - p, dy: -40 * p});
    const choiceP = empty03 ? clamp01((f - T.b3cChoiceXfade) / 10) : 1;
    if (empty03) layers.push({asset: empty03, opacity: p, dy: 40 * (1 - p)});
    layers.push({asset: '03-flecto-choice', opacity: p * choiceP, dy: 40 * (1 - p)});
  } else if (f < T.b5ToLayoutC) {
    const p = move(f, T.b4SlideFrom, T.b4SlideTo - T.b4SlideFrom);
    geom = lerpGeom(A, B, p);
    if (p < 1) layers.push({asset: '03-flecto-choice', opacity: 1 - p, dy: -40 * p});
    layers.push({asset: '04-flecto-review', opacity: p, dy: 40 * (1 - p)});
    const x = clamp01((f - T.b5Xfade) / T.b5XfadeLen);
    if (x > 0) layers.push({asset: '05-flecto-success', opacity: x});
  } else {
    const p = move(f, T.b5ToLayoutC, T.b5ToLayoutCEnd - T.b5ToLayoutC);
    geom = lerpGeom(B, CL, p);
    layers.push({asset: '05-flecto-success', opacity: 1});
    sheetOpacity = 1 - exit(f, T.b6Out, 18);
    sheetDy = 16 * exit(f, T.b6Out, 18);
  }

  const drift = interpolate(f, [T.b5ToLayoutCEnd, T.b5HoldEnd], [1, 1.01], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const inLayoutC = f >= T.b5ToLayoutCEnd;

  // ---------- morph crop (B2) ----------
  let morph: React.ReactNode = null;
  if (f >= T.b2Start && f < T.b2RestInTo) {
    const srcGeom = {...A, scroll: -60};
    const [sx, sy] = toCanvas(srcGeom, SRC_FIELD.x, SRC_FIELD.y);
    const [dx, dy] = toCanvas(A, DST_FIELD.x, DST_FIELD.y);
    const p = move(f, T.b2MoveFrom, T.b2MoveTo - T.b2MoveFrom);
    const rect = {
      x: sx + (dx - sx) * p,
      y: sy + (dy - sy) * p,
      w: (SRC_FIELD.w + (DST_FIELD.w - SRC_FIELD.w) * p) * A.s,
      h: (SRC_FIELD.h + (DST_FIELD.h - SRC_FIELD.h) * p) * A.s,
    };
    // Short fade-through so the two labels never sit on top of each other for long.
    const out01 = clamp01((f - T.b2XfadeFrom) / 10);
    const in02 = clamp01((f - (T.b2XfadeFrom + 8)) / (T.b2XfadeTo - T.b2XfadeFrom - 8));
    morph = (
      <>
        <Crop asset="01-source-benefits" crop={SRC_FIELD} rect={rect} opacity={1 - out01} />
        <Crop asset="02-flecto-input" crop={DST_FIELD} rect={rect} opacity={in02} />
      </>
    );
  }

  // ---------- review underlines (B4b) ----------
  const underlines =
    f >= T.b4Underlines[0] && f < T.b5Xfade + T.b5XfadeLen
      ? REVIEW_VALUES.map((v, i) => {
          const p = move(f, T.b4Underlines[i], 12);
          const fade = 1 - clamp01((f - T.b5Xfade) / 8);
          const [x, y] = toCanvas(B, v.x, v.y + 7);
          return <div key={i} style={{position: 'absolute', left: x, top: y, width: v.w * B.s * p, height: 2, background: C.ink, opacity: fade}} />;
        })
      : null;

  // ---------- second site (B5b) ----------
  const cultureP = enter(f, T.b5ToLayoutC + 6, 24);
  const culture =
    f >= T.b5ToLayoutC + 6 && f < T.b6Out + 20 ? (
      <Sheet
        geom={CR}
        layers={[{asset: '06-culture-success', opacity: 1}]}
        opacity={cultureP * (1 - exit(f, T.b6Out, 18))}
        dx={80 * (1 - cultureP)}
        dy={16 * exit(f, T.b6Out, 18)}
        scale={drift}
      />
    ) : null;

  const capStyle: React.CSSProperties = {position: 'absolute', top: 290, fontSize: 28, fontWeight: 500, color: C.muted, lineHeight: 1.4, whiteSpace: 'nowrap'};
  const capOut = 1 - exit(f, T.b6Out, 18);

  return (
    <AbsoluteFill style={{background: C.paper, fontFamily: FONT, color: C.ink}}>
      {sheetOpacity > 0 && layers.length > 0 ? (
        <Sheet geom={geom} layers={layers} opacity={sheetOpacity} dy={sheetDy} scale={inLayoutC ? drift : 1} />
      ) : null}
      {morph}
      {underlines}
      {culture}
      {f >= T.b5CapLeft && f < T.b6Out + 20 ? (
        <>
          <div style={{...capStyle, left: CL.x, opacity: enter(f, T.b5CapLeft, 14) * capOut}}>구매 혜택 신청 · 온담</div>
          <div style={{...capStyle, left: CR.x, opacity: enter(f, T.b5CapRight, 14) * capOut}}>수강 신청 · 한빛 생활문화센터</div>
        </>
      ) : null}

      <Headline layout="A" lines={[{text: '하고 싶은 일은 하나.', at: T.b1L1}, {text: '화면은 먼저 복잡합니다.', at: T.b1L2}]} out={T.b2HeadOut} />
      <Headline layout="A" lines={[{text: '같은 화면,', at: T.b2L1}, {text: '필요한 순서로.', at: T.b2L2}]} out={T.b3HeadOut} />
      <Headline layout="A" lines={[{text: '큰 글씨, 큰 버튼.', at: T.b3cL1}, {text: '한 번에 하나씩.', at: T.b3cL2}]} out={T.b4HeadOut} />
      <Headline layout="B" lines={[{text: '입력도, 선택도,', at: T.b4L1}, {text: '마지막 확인도', at: T.b4L2}, {text: '내 손으로.', at: T.b4L3}]} out={T.b5Xfade - 6} />
      <Headline layout="B" lines={[{text: '신청은', at: T.b5L1}, {text: '원래 사이트에서', at: T.b5L2}, {text: '그대로.', at: T.b5L3}]} out={T.b5ColOut} />
      <Headline layout="C" lines={[{text: '신청은 원래 사이트에서 그대로.', at: T.b5TopLine}]} out={T.b6Out} />
      <Headline layout="END" lines={[{text: '사용자를 바꾸는 대신,', at: T.b6L1}, {text: '화면을 바꿉니다.', at: T.b6L2}]} out={TOTAL_FRAMES + 10} lift={move(f, T.b6LiftFrom, T.b6LiftTo - T.b6LiftFrom)} />

      {f >= T.b5Xfade && f < T.b6Out + 12 ? (
        <div style={{position: 'absolute', left: 120, top: 1026, fontSize: 22, fontWeight: 400, color: C.muted, opacity: enter(f, T.b5Xfade, 14) * (1 - exit(f, T.b6Out, 10))}}>
          일부 과정 축약
        </div>
      ) : null}

      <BrandLockup />
      {props.showFootnote ? <Footnote /> : null}
      {props.showCaptions ? <Captions voOffsetFrames={props.voOffsetFrames} /> : null}
      {props.muted ? null : <Soundtrack {...props} choiceChanges={Boolean(empty03)} />}
    </AbsoluteFill>
  );
};
