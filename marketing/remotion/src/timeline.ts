// Every frame number used by the ad lives here. 30fps, 900 frames.
// Scene beats follow the measured VO segments of vo-sara-4 placed at 0.8s
// (production-manifest.json voiceSegmentsInVideo), not the brief's target frames.
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const TOTAL_FRAMES = 900;

const s = (sec: number) => Math.round(sec * FPS);

export const VO_SEGMENTS: [number, number][] = [
  [0.8, 4.3],
  [5.76, 9.62],
  [10.96, 13.7],
  [15.0, 18.3],
  [19.74, 22.62],
  [24.26, 28.26],
].map(([a, b]) => [s(a), s(b)] as [number, number]);

export const VO_START = 24; // 0.8s

export const VO_LINES = [
  '하고 싶은 일은 하나인데, 화면은 먼저 복잡합니다.',
  '플렉토는 그 화면을, 필요한 순서로 다시 보여줍니다.',
  '큰 글씨, 큰 버튼. 한 번에 하나씩.',
  '입력도 선택도, 마지막 확인도 내 손으로.',
  '신청은 원래 사이트에서 그대로 처리됩니다.',
  '사용자를 바꾸는 대신, 화면을 바꿉니다. 플렉토.',
];

export const T = {
  // B1 problem: source form
  b1SheetIn: 18,
  b1L1: 24,
  b1L2: 72,
  b1ScrollFrom: 60,
  b1ScrollTo: 140,
  // B2 morph: source field -> FLECTO field
  b2Start: 140,
  b2HeadOut: 140,
  b2RestOutEnd: 164,
  b2MoveFrom: 146,
  b2MoveTo: 182,
  b2XfadeFrom: 158,
  b2XfadeTo: 182,
  b2RestInFrom: 176,
  b2RestInTo: 200,
  b2L1: 176,
  b2L2: 206,
  // B3a input (real filled capture, if provided)
  b3FilledFrom: 236,
  b3FilledTo: 242, // 6f dissolve between two real captured states keeps ghosting minimal
  // B3b step slide 02 -> 03
  b3SlideFrom: 302,
  b3SlideTo: 320,
  b3HeadOut: 302,
  // B3c choice
  b3cL1: 332,
  b3cL2: 368,
  b3cChoiceXfade: 356, // empty -> chosen capture (6f), only if 03-empty exists
  b3cChoiceXfadeLen: 6,
  // B4 review (layout B)
  b4SlideFrom: 420,
  b4SlideTo: 442,
  b4HeadOut: 420,
  b4L1: 452,
  b4L2: 482,
  b4L3: 512,
  b4Underlines: [470, 488, 506, 524],
  // B5 result
  b5Xfade: 584,
  b5XfadeLen: 16,
  b5L1: 594,
  b5L2: 610,
  b5L3: 628,
  b5ColOut: 644,
  b5ToLayoutC: 650,
  b5ToLayoutCEnd: 680,
  b5TopLine: 658,
  b5CapLeft: 672,
  b5CapRight: 684,
  b5HoldEnd: 718,
  // B6 end card
  b6Out: 718,
  b6L1: 728,
  b6L2: 770,
  b6LiftFrom: 818,
  b6LiftTo: 836,
  b6Lockup: 824,
  b6Tagline: 846,
  b6Footnote: 852,
  // Sound effects
  sfxSelect: 356,
  sfxPress: 580,
  sfxDone: 604,
  sfxBrand: 840,
} as const;
