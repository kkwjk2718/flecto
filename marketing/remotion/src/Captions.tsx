import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C} from './theme';
import {VO_LINES, VO_SEGMENTS} from './timeline';

/** Caption variants shrink the scene to leave a reserved paper band, so captions never cover UI. */
export const CAPTION_BAND = 96;
export const CAPTION_SCENE_SCALE = (1080 - CAPTION_BAND) / 1080;

export const Captions: React.FC<{voOffsetFrames: number}> = ({voOffsetFrames}) => {
  const f = useCurrentFrame() - voOffsetFrames;
  const i = VO_SEGMENTS.findIndex(([a, b]) => f >= a - 3 && f < b + 8);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        width: '100%',
        top: 1080 - CAPTION_BAND,
        height: CAPTION_BAND,
        background: C.paper,
        borderTop: '1px solid ' + C.border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
    >
      {i < 0 ? null : <div style={{fontSize: 34, fontWeight: 500, lineHeight: 1.3, color: 'rgba(23,32,51,0.88)', whiteSpace: 'nowrap'}}>{VO_LINES[i]}</div>}
    </div>
  );
};
