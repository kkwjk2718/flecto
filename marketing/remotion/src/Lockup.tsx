import React from 'react';
import {useCurrentFrame} from 'remotion';
import {enter} from './ease';
import {C} from './theme';
import {T} from './timeline';

export const BrandMark: React.FC<{size: number}> = ({size}) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    {/* Same geometry as packages/templates/src/app.tsx BrandMark */}
    <rect x="1" y="1" width="30" height="30" rx="9" fill={C.blue} />
    <rect x="9" y="8" width="15" height="4" rx="2" fill="#FFFFFF" />
    <rect x="9" y="14.5" width="10" height="4" rx="2" fill="#FFFFFF" />
    <rect x="9" y="8" width="4" height="16" rx="2" fill="#FFFFFF" />
  </svg>
);

export const BrandLockup: React.FC = () => {
  const f = useCurrentFrame();
  if (f < T.b6Lockup) return null;
  const p = enter(f, T.b6Lockup, 18);
  const t = enter(f, T.b6Tagline, 14);
  return (
    <div style={{position: 'absolute', left: 0, width: '100%', top: 596, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 28, opacity: p, transform: 'translateY(' + 12 * (1 - p) + 'px)'}}>
        <BrandMark size={96} />
        <div style={{fontSize: 96, fontWeight: 800, color: C.blue, letterSpacing: '0.04em', lineHeight: 1}}>FLECTO</div>
      </div>
      <div style={{marginTop: 36, fontSize: 28, fontWeight: 500, color: C.muted, opacity: t, transform: 'translateY(' + 12 * (1 - t) + 'px)'}}>
        Don’t bend the user. Bend the interface.
      </div>
    </div>
  );
};

export const Footnote: React.FC = () => {
  const f = useCurrentFrame();
  if (f < T.b6Footnote) return null;
  const p = enter(f, T.b6Footnote, 14);
  return (
    <div style={{position: 'absolute', left: 0, width: '100%', top: 1004, textAlign: 'center', fontSize: 22, fontWeight: 400, color: C.muted, opacity: p}}>
      화면은 시연용 사이트에서 설치된 확장 프로그램으로 캡처한 실제 화면이며, 접수 번호는 시연 데이터입니다.
    </div>
  );
};
