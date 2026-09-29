import React from 'react';
import {Audio} from '@remotion/media';
import {Sequence, interpolate, staticFile} from 'remotion';
import {T, TOTAL_FRAMES, VO_SEGMENTS, VO_START} from './timeline';

const MUSIC_OPEN = 0.34; // gaps
const MUSIC_DUCKED = 0.21; // ~-4 dB under VO

/** 0..1 amount of ducking: 6f attack before speech, 18f release after. */
const duckAt = (f: number, offset: number) => {
  let d = 0;
  for (const [a0, b0] of VO_SEGMENTS) {
    const a = a0 + offset;
    const b = b0 + offset;
    const v = f < a ? 1 - (a - f) / 6 : f <= b ? 1 : 1 - (f - b) / 18;
    d = Math.max(d, Math.min(1, Math.max(0, v)));
  }
  return d;
};

export const musicVolume = (f: number, offset = 0) => {
  const base = MUSIC_OPEN + (MUSIC_DUCKED - MUSIC_OPEN) * duckAt(f, offset);
  const fadeIn = interpolate(f, [0, 15], [0.4, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fadeOut = interpolate(f, [822, 885], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return base * fadeIn * fadeOut;
};

const Sfx: React.FC<{at: number; file: string; volume: number}> = ({at, file, volume}) => (
  <Sequence from={at} durationInFrames={Math.max(1, TOTAL_FRAMES - 6 - at)} layout="none">
    <Audio src={staticFile(file)} volume={volume} />
  </Sequence>
);

export const Soundtrack: React.FC<{voFile: string; musicFile: string; sfxDir: string; voOffsetFrames: number; choiceChanges: boolean}> = ({voFile, musicFile, sfxDir, voOffsetFrames, choiceChanges}) => (
  <>
    <Sequence durationInFrames={TOTAL_FRAMES} layout="none">
      <Audio src={staticFile(musicFile)} volume={(f) => musicVolume(f, voOffsetFrames)} />
    </Sequence>
    <Sequence from={VO_START + voOffsetFrames} durationInFrames={TOTAL_FRAMES - 4 - VO_START - voOffsetFrames} layout="none">
      <Audio src={staticFile(voFile)} volume={1} />
    </Sequence>
    {/* The tick only plays when a real captured selection change is on screen. */}
    {choiceChanges ? <Sfx at={T.sfxSelect} file={sfxDir + '/sfx-select_tick-1.mp3'} volume={0.3} /> : null}
    <Sfx at={T.sfxPress} file={sfxDir + '/sfx-press_soft-1.mp3'} volume={0.22} />
    <Sfx at={T.sfxDone} file={sfxDir + '/sfx-done_soft-1.mp3'} volume={0.32} />
    <Sfx at={T.sfxBrand} file={sfxDir + '/sfx-brand_ending-1.mp3'} volume={0.45} />
  </>
);
