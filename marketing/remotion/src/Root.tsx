import React from 'react';
import {Composition} from 'remotion';
import {FlectoAd, flectoAdSchema} from './FlectoAd';
import {FlectoAdEnergetic} from './FlectoAdEnergetic';
import {AssetInspect, inspectSchema} from './Inspect';
import {FPS, HEIGHT, TOTAL_FRAMES, WIDTH} from './timeline';

const base = {
  voFile: 'audio/vo-sara-4-mix.wav', // made by scripts/prep-mix.sh from vo-sara-4.mp3
  musicFile: 'audio/music-1.mp3',
  sfxDir: 'audio',
  voOffsetFrames: 0,
  showCaptions: false,
  showFootnote: true,
  muted: false,
  story: 'insurance' as const,
};

// Energetic insurance cut. Audio files are placeholders until main delivers the Jubal VO and 122 BPM music;
// missing files are skipped. oneClick stays false until the one-click feature is confirmed.
const energetic = {
  ...base,
  voFile: 'audio/vo-jubal-bright-4-mix.wav', // leveled by scripts/prep-mix.sh
  musicFile: 'audio/music-bright-1.mp3',
  oneClick: true, // confirmed 15:50 KST for the insurance form only
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="FlectoAd30" component={FlectoAdEnergetic} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={energetic} />
    <Composition id="FlectoAd30Captions" component={FlectoAdEnergetic} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{...energetic, showCaptions: true}} />
    <Composition id="FlectoAd30Silent" component={FlectoAdEnergetic} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{...energetic, showCaptions: true, muted: true}} />
    <Composition id="FlectoAd30Calm" component={FlectoAd} schema={flectoAdSchema} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={base} />
    <Composition id="FlectoAd30Benefits" component={FlectoAd} schema={flectoAdSchema} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{...base, story: 'benefits' as const}} />
    <Composition id="AssetInspect" component={AssetInspect} schema={inspectSchema} durationInFrames={1} fps={FPS} width={1440} height={1100} defaultProps={{asset: '01-source-benefits'}} />
  </>
);
