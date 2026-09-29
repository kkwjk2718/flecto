import React from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SETTINGS } from '@flecto/contracts';

function Setup() {
  return <main><h1>FLECTO</h1><p>쉬운 화면 연결 설정을 준비하고 있어요.</p><p>기본 글자 크기 {DEFAULT_SETTINGS.fontSize}px</p></main>;
}
createRoot(document.getElementById('root')!).render(<Setup />);
