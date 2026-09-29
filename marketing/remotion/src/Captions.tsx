import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C} from './theme';
import {VO_LINES, VO_SEGMENTS} from './timeline';

export const Captions: React.FC<{voOffsetFrames: number}> = ({voOffsetFrames}) => {
  const f = useCurrentFrame() - voOffsetFrames;
  const i = VO_SEGMENTS.findIndex(([a, b]) => f >= a - 3 && f < b + 8);
  if (i < 0) return null;
  return (
    <div style={{position: 'absolute', left: 0, width: '100%', top: 976, display: 'flex', justifyContent: 'center'}}>
      <div style={{fontSize: 32, fontWeight: 500, lineHeight: 1.4, color: C.ink, opacity: 0.8, background: 'rgba(250,247,240,0.92)', padding: '6px 20px', borderRadius: 10}}>
        {VO_LINES[i]}
      </div>
    </div>
  );
};
