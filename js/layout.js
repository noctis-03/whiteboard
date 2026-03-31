// ═══════════════════════════════════════════════════
//  layout.js — 레이아웃 동기화 & 미니맵
// ═══════════════════════════════════════════════════

import { vp, pCvs, board, svgl, T, strokes } from './state.js';
import { isMobile } from './utils.js';
import { updateGrid } from './transform.js';

export function syncLayout() {
  const tb = document.getElementById('toolbar');
  const mm = document.getElementById('minimap');
  const tbRect = tb.getBoundingClientRect();

  document.documentElement.style.setProperty('--tb-w', '0px');
  document.documentElement.style.setProperty('--tb-h', '0px');

  vp.style.cssText = `top:0;left:0;right:0;bottom:0;`;
  pCvs.style.cssText = `top:0;left:0;right:0;bottom:0;width:${window.innerWidth}px;height:${window.innerHeight}px;`;
  pCvs.width = window.innerWidth;
  pCvs.height = window.innerHeight;

  if (mm) {
    mm.style.bottom = isMobile() ? `${Math.ceil(tbRect.height) + 20}px` : '16px';
    mm.style.right = '16px';
  }

  updateGrid();
  updateMinimap();
}

export function updateMinimap() {
  const mm = document.getElementById('minimap');
  if (!mm) return;
  const ctx = mm.getContext('2d');
  const W = mm.width, H = mm.height;
  ctx.clearRect(0, 0, W, H);

  // 배경
  ctx.fillStyle = '#f5f2eb';
  ctx.fillRect(0, 0, W, H);

  // 모든 DOM 요소 수집
  const els = board.querySelectorAll('.el');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const rects = [];

  els.forEach(el => {
    const x = parseFloat(el.style.left) || 0;
    const y = parseFloat(el.style.top) || 0;
    const w = parseFloat(el.style.width) || 100;
    const h = parseFloat(el.style.height) || 60;
    rects.push({ x, y, w, h });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });

  // SVG 스트로크 바운딩 박스
  strokes.forEach(s => {
    try {
      const bb = s.svgEl.getBBox();
      minX = Math.min(minX, bb.x);
      minY = Math.min(minY, bb.y);
      maxX = Math.max(maxX, bb.x + bb.width);
      maxY = Math.max(maxY, bb.y + bb.height);
    } catch (e) { /* ignore */ }
  });

  if (minX === Infinity) { minX = 0; minY = 0; maxX = 1000; maxY = 700; }

  const pad = 100;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const bw = maxX - minX || 1, bh = maxY - minY || 1;
  const sc = Math.min(W / bw, H / bh);

  // 요소 그리기
  ctx.save();
  ctx.translate((W - bw * sc) / 2, (H - bh * sc) / 2);
  ctx.scale(sc, sc);
  ctx.translate(-minX, -minY);

  rects.forEach(r => {
    ctx.fillStyle = 'rgba(26,23,20,0.15)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
  });

  // 뷰포트 표시
  const vpR = vp.getBoundingClientRect();
  const tl = { x: (0 - T.x) / T.s, y: (0 - T.y) / T.s };
  const br = { x: (vpR.width - T.x) / T.s, y: (vpR.height - T.y) / T.s };
  ctx.strokeStyle = '#c84b2f';
  ctx.lineWidth = 2 / sc;
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

  ctx.restore();
}

export function initLayout() {
  window.addEventListener('resize', () => syncLayout());
  window.addEventListener('orientationchange', () => setTimeout(syncLayout, 250));
  syncLayout();
}
