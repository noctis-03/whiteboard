// ═══════════════════════════════════════════════════
//  layout.js — 레이아웃 동기화 & 미니맵
//
//  FIX: 미니맵이 제대로 표시되지 않던 버그 수정
//  원인: state.js에서 strokes를 let으로 선언하고 setStrokes()로
//        재할당하면, 기존 import된 바인딩이 갱신되긴 하지만
//        타이밍/캐싱 이슈 발생 가능.
//        → getter 함수 getStrokes() 사용으로 변경
//  추가: SVG 스트로크도 미니맵에 선으로 표시,
//        뷰포트 영역 표시 개선
// ═══════════════════════════════════════════════════

import { vp, pCvs, board, svgl, T } from './state.js';
import * as S from './state.js';
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
  if (!mm || isMobile()) return;
  const ctx = mm.getContext('2d');
  const W = mm.width, H = mm.height;
  ctx.clearRect(0, 0, W, H);

  // 배경
  ctx.fillStyle = '#f5f2eb';
  ctx.fillRect(0, 0, W, H);

  // 항상 최신 strokes를 state에서 직접 읽음
  const strokes = S.strokes;

  // ── 모든 콘텐츠의 바운딩 박스 계산 ──
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const elRects = [];
  const strokeRects = [];

  // DOM 요소
  board.querySelectorAll('.el').forEach(el => {
    const x = parseFloat(el.style.left) || 0;
    const y = parseFloat(el.style.top) || 0;
    const w = parseFloat(el.style.width) || 100;
    const h = parseFloat(el.style.height) || 60;
    elRects.push({ x, y, w, h });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });

  // SVG 스트로크
  if (strokes && strokes.length > 0) {
    strokes.forEach(s => {
      try {
        if (s.svgEl && typeof s.svgEl.getBBox === 'function') {
          const bb = s.svgEl.getBBox();
          if (bb.width > 0 || bb.height > 0) {
            strokeRects.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height });
            minX = Math.min(minX, bb.x);
            minY = Math.min(minY, bb.y);
            maxX = Math.max(maxX, bb.x + bb.width);
            maxY = Math.max(maxY, bb.y + bb.height);
          }
        }
      } catch (e) { /* 무시 */ }
    });
  }

  // 뷰포트 영역도 바운딩 박스에 포함
  const vpR = vp.getBoundingClientRect();
  const vpTL = { x: (0 - T.x) / T.s, y: (0 - T.y) / T.s };
  const vpBR = { x: (vpR.width - T.x) / T.s, y: (vpR.height - T.y) / T.s };
  minX = Math.min(minX, vpTL.x);
  minY = Math.min(minY, vpTL.y);
  maxX = Math.max(maxX, vpBR.x);
  maxY = Math.max(maxY, vpBR.y);

  // 아무 콘텐츠도 없을 때 기본 범위
  if (minX === Infinity) {
    minX = vpTL.x; minY = vpTL.y;
    maxX = vpBR.x; maxY = vpBR.y;
  }

  const pad = 150;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const bw = maxX - minX || 1, bh = maxY - minY || 1;
  const sc = Math.min(W / bw, H / bh);
  const offX = (W - bw * sc) / 2;
  const offY = (H - bh * sc) / 2;

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(sc, sc);
  ctx.translate(-minX, -minY);

  // DOM 요소 표시
  elRects.forEach(r => {
    ctx.fillStyle = 'rgba(26,23,20,0.18)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(26,23,20,0.25)';
    ctx.lineWidth = 1 / sc;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  });

  // SVG 스트로크 표시
  strokeRects.forEach(r => {
    ctx.fillStyle = 'rgba(200,75,47,0.12)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
  });

  // 뷰포트 영역 표시
  ctx.strokeStyle = '#c84b2f';
  ctx.lineWidth = Math.max(2 / sc, 1);
  ctx.setLineDash([6 / sc, 4 / sc]);
  ctx.strokeRect(vpTL.x, vpTL.y, vpBR.x - vpTL.x, vpBR.y - vpTL.y);
  ctx.setLineDash([]);

  // 뷰포트 내부 반투명 하이라이트
  ctx.fillStyle = 'rgba(200,75,47,0.06)';
  ctx.fillRect(vpTL.x, vpTL.y, vpBR.x - vpTL.x, vpBR.y - vpTL.y);

  ctx.restore();

  // 미니맵 테두리 표시
  ctx.strokeStyle = 'rgba(26,23,20,0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, W, H);
}

export function initLayout() {
  window.addEventListener('resize', () => syncLayout());
  window.addEventListener('orientationchange', () => setTimeout(syncLayout, 250));
  syncLayout();
}
