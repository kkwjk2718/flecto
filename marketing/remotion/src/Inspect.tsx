import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {z} from 'zod';

export const inspectSchema = z.object({asset: z.string()});

/** Dev-only: a capture at 1440x1100 logical px with a 50/100px grid, for measuring regions. */
export const AssetInspect: React.FC<z.infer<typeof inspectSchema>> = ({asset}) => {
  const lines = [];
  for (let x = 0; x <= 1440; x += 50) lines.push(<div key={'x' + x} style={{position: 'absolute', left: x, top: 0, width: 1, height: 1100, background: x % 100 ? 'rgba(255,0,0,0.18)' : 'rgba(255,0,0,0.5)'}} />);
  for (let y = 0; y <= 1100; y += 50) lines.push(<div key={'y' + y} style={{position: 'absolute', top: y, left: 0, height: 1, width: 1440, background: y % 100 ? 'rgba(0,0,255,0.18)' : 'rgba(0,0,255,0.5)'}} />);
  const labels = [];
  for (let x = 0; x < 1440; x += 100) labels.push(<div key={'lx' + x} style={{position: 'absolute', left: x + 2, top: 2, fontSize: 12, color: 'red', fontFamily: 'monospace', background: 'rgba(255,255,255,0.8)'}}>{x}</div>);
  for (let y = 100; y < 1100; y += 100) labels.push(<div key={'ly' + y} style={{position: 'absolute', left: 2, top: y + 2, fontSize: 12, color: 'blue', fontFamily: 'monospace', background: 'rgba(255,255,255,0.8)'}}>{y}</div>);
  return (
    <AbsoluteFill style={{background: '#fff'}}>
      <Img src={staticFile('assets/' + asset + '.png')} style={{position: 'absolute', left: 0, top: 0, width: 1440, height: 1100}} />
      {lines}
      {labels}
    </AbsoluteFill>
  );
};
