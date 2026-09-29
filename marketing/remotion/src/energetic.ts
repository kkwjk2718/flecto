// Energetic insurance cut (122 BPM, upbeat male VO). Every frame anchor lives here.
// Anchors are VO line starts (video frames @30fps). They are ESTIMATES until the Jubal VO is measured with
// scripts/analyze-audio.mjs; then replace ANCHORS/VO2_SEGMENTS with the measured values (one edit).
export const BPM = 122;
export const BEAT = (30 * 60) / BPM; // 14.754 frames

export const VO2_LINES = [
  '작은 글씨. 복잡한 보험금 청구.',
  '이제, 화면이 바뀔 차례!',
  '어르신을 위한 쉬운 화면, 플렉토.',
  '한 번 누르면, 복잡한 화면이 크고 간단하게.',
  '여기에 입력. 여기서 선택.',
  '바로 옆에서 알려주니까.',
  '입력도, 마지막 확인도 내 손으로.',
  '플렉토. 화면은 쉽게, 선택은 내가.',
];

// [start, end] of each VO line in video frames.
// Measured 15:49 KST from vo-jubal-bright-4.mp3 placed at 0.8s (scripts/analyze-audio.mjs, -40 dB gate,
// 180 ms gaps; 16 chunks grouped into the 8 script lines). VIDEO frames.
export const VO2_SEGMENTS: [number, number][] = [
  [28, 114],
  [140, 186],
  [196, 269],
  [282, 380],
  [393, 449],
  [462, 516],
  [529, 604],
  [621, 717],
];

// Frame offset of the POP peak inside sfx-transform-bright-1.mp3 (measured on arrival); the POP lands on A.hit.
export const TRANSFORM_POP_OFFSET = 15; // envelope: loud 0–0.55 s, drops after; pop ≈0.5 s

export const VO2_START = 24; // VO file starts at 0.8s

const seg = (i: number) => VO2_SEGMENTS[i];
export const A = {
  l1: seg(0)[0],
  l1b: 62,
  l2: seg(1)[0],
  l2b: 156,
  hit: seg(1)[1], // the transformation lands as "바뀔 차례!" ends
  l3: seg(2)[0],
  l3b: 222,
  l4: seg(3)[0],
  l5: seg(4)[0],
  l5b: 426, // "여기서 선택."
  l6: seg(5)[0],
  l6b: 486,
  l7: seg(6)[0],
  l7b: 545,
  l7success: 587, // "내 손으로."
  l8: seg(7)[0],
  l8b: 649,
  l8c: 680,
};
