import React from 'react';
import {Composition} from 'remotion';
import {FlectoAd, flectoAdSchema} from './FlectoAd';
import {FPS, HEIGHT, TOTAL_FRAMES, WIDTH} from './timeline';

const base = {
  voFile: 'audio/vo-sara-4-mix.wav', // made by scripts/prep-mix.sh from vo-sara-4.mp3
  musicFile: 'audio/music-1.mp3',
  sfxDir: 'audio',
  voOffsetFrames: 0,
  showCaptions: false,
  showFootnote: true,
  muted: false,
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="FlectoAd30" component={FlectoAd} schema={flectoAdSchema} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={base} />
    <Composition id="FlectoAd30Captions" component={FlectoAd} schema={flectoAdSchema} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{...base, showCaptions: true}} />
    <Composition id="FlectoAd30Silent" component={FlectoAd} schema={flectoAdSchema} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{...base, showCaptions: true, muted: true}} />
  </>
);
