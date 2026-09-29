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
      <div style={{fontSize: 32, fontWeight: 500, lineHeight: 1.4, color: 'rgba(23,32,51,0.85)', background: C.paper, border: '1px solid ' + C.border, boxShadow: '0 4px 12px rgba(23,32,51,0.08)', padding: '8px 24px', borderRadius: 12}}>
        {VO_LINES[i]}
      </div>
    </div>
  );
};
