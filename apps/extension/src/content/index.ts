// C01 build seam only; no source behavior or product success is claimed here.
if (!document.getElementById('flecto-host')) {
  const host = document.createElement('div');
  host.id = 'flecto-host';
  host.attachShadow({ mode: 'open' }).textContent = 'FLECTO 설치 연결 확인 — 제품 연결 구현 중';
  document.documentElement.append(host);
}
export {};
