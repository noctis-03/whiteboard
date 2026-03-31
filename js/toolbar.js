// ═══════════════════════════════════════════════════
//  toolbar.js — 드래그 이동 & 모서리 스냅 & 컬러바
// ═══════════════════════════════════════════════════

import { tool } from './state.js';

const SNAP_DIST  = 60;   // px — 이 거리 안이면 모서리로 끌려감
const SNAP_GAP   = 12;   // px — 모서리 / 가장자리와의 간격
const DRAW_TOOLS = ['pen','highlight','eraser','rectangle','circle','arrow'];

let tb, colorBar;
let isDragging = false;
let dragOX = 0, dragOY = 0;

/* ── 실제 렌더 크기 ─────────────────────────────── */
function tbSize() {
  const r = tb.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

/* ── 초기 위치 (하단 중앙) ────────────────────────── */
function setInitialPosition() {
  const { w, h } = tbSize();
  const x = Math.round((window.innerWidth  - w) / 2);
  const y = window.innerHeight - h - SNAP_GAP;
  tb.style.left = x + 'px';
  tb.style.top  = y + 'px';
}

/* ── 드래그 시작 ──────────────────────────────────── */
function startDrag(e) {
  const ev = e.touches ? e.touches[0] : e;
  const rect = tb.getBoundingClientRect();
  dragOX = ev.clientX - rect.left;
  dragOY = ev.clientY - rect.top;
  isDragging = true;
  tb.classList.add('tb-dragging');
  tb.classList.remove('tb-snapping');

  document.addEventListener('mousemove', moveTo);
  document.addEventListener('mouseup',   endDrag);
  document.addEventListener('touchmove', moveTo, {passive:false});
  document.addEventListener('touchend',  endDrag);
  e.preventDefault();
}

/* ── 이동 (뷰포트 안에 제한) ──────────────────────── */
function moveTo(e) {
  if (!isDragging) return;
  e.preventDefault();
  const ev = e.touches ? e.touches[0] : e;
  const { w, h } = tbSize();

  let x = ev.clientX - dragOX;
  let y = ev.clientY - dragOY;

  // 뷰포트 안으로 제한
  x = Math.max(0, Math.min(x, window.innerWidth  - w));
  y = Math.max(0, Math.min(y, window.innerHeight - h));

  tb.style.left = x + 'px';
  tb.style.top  = y + 'px';

  updateColorBarPosition();
}

/* ── 드래그 종료 → 스냅 ──────────────────────────── */
function endDrag() {
  isDragging = false;
  tb.classList.remove('tb-dragging');
  document.removeEventListener('mousemove', moveTo);
  document.removeEventListener('mouseup',   endDrag);
  document.removeEventListener('touchmove', moveTo);
  document.removeEventListener('touchend',  endDrag);

  snapToEdge();
  updateColorBarPosition();
}

/* ── 가장자리 / 중앙 스냅 ────────────────────────── */
function snapToEdge() {
  const { w, h } = tbSize();
  let x = parseFloat(tb.style.left) || 0;
  let y = parseFloat(tb.style.top)  || 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 수평 스냅
  const distL = x;
  const distR = vw - (x + w);
  const distCX = Math.abs(x + w/2 - vw/2);

  if (distL < SNAP_DIST)       x = SNAP_GAP;
  else if (distR < SNAP_DIST)  x = vw - w - SNAP_GAP;
  else if (distCX < SNAP_DIST) x = Math.round((vw - w) / 2);

  // 수직 스냅
  const distT = y;
  const distB = vh - (y + h);
  const distCY = Math.abs(y + h/2 - vh/2);

  if (distT < SNAP_DIST)       y = SNAP_GAP;
  else if (distB < SNAP_DIST)  y = vh - h - SNAP_GAP;
  else if (distCY < SNAP_DIST) y = Math.round((vh - h) / 2);

  tb.classList.add('tb-snapping');
  tb.style.left = x + 'px';
  tb.style.top  = y + 'px';

  setTimeout(() => tb.classList.remove('tb-snapping'), 300);

  updateTipDir(y);
}

/* ── 뷰포트 변경 시 위치 보정 ────────────────────── */
function clampPosition() {
  const { w, h } = tbSize();
  let x = parseFloat(tb.style.left) || 0;
  let y = parseFloat(tb.style.top)  || 0;

  x = Math.max(0, Math.min(x, window.innerWidth  - w));
  y = Math.max(0, Math.min(y, window.innerHeight - h));

  tb.style.left = x + 'px';
  tb.style.top  = y + 'px';
}

/* ── 툴팁 방향 ────────────────────────────────────── */
function updateTipDir(y) {
  const half = window.innerHeight / 2;
  tb.dataset.tipDir = y < half ? 'below' : 'above';
}

/* ── 컬러바 표시 / 숨기기 ────────────────────────── */
export function showColorBar() {
  if (!colorBar) return;
  colorBar.classList.add('visible');
  updateColorBarPosition();
}
export function hideColorBar() {
  if (!colorBar) return;
  colorBar.classList.remove('visible');
}

/* ── 컬러바 위치 갱신 ────────────────────────────── */
export function updateColorBarPosition() {
  if (!colorBar || !colorBar.classList.contains('visible')) return;

  const tr   = tb.getBoundingClientRect();
  const cr   = colorBar.getBoundingClientRect();
  const half = window.innerHeight / 2;

  let cx = tr.left + (tr.width - cr.width) / 2;
  let cy;

  if (tr.top + tr.height / 2 > half) {
    // 도구창이 아래쪽 → 컬러바는 위에
    cy = tr.top - cr.height - SNAP_GAP;
  } else {
    // 도구창이 위쪽 → 컬러바는 아래에
    cy = tr.bottom + SNAP_GAP;
  }

  // 화면 안으로 제한
  cx = Math.max(4, Math.min(cx, window.innerWidth  - cr.width  - 4));
  cy = Math.max(4, Math.min(cy, window.innerHeight - cr.height - 4));

  colorBar.style.left = cx + 'px';
  colorBar.style.top  = cy + 'px';
}

/* ── 그리기 도구 판별 ────────────────────────────── */
export function isDrawTool(t) {
  return DRAW_TOOLS.includes(t);
}

/* ── 초기화 ───────────────────────────────────────── */
export function initToolbar() {
  tb       = document.getElementById('toolbar');
  colorBar = document.getElementById('color-bar');

  if (!tb) return;

  // 드래그 핸들
  const handle = document.getElementById('tb-drag-handle');
  if (handle) {
    handle.addEventListener('mousedown',  startDrag);
    handle.addEventListener('touchstart', startDrag, {passive:false});
  }

  // 초기 위치를 레이아웃 완료 후 설정
  requestAnimationFrame(() => {
    setInitialPosition();
    updateColorBarPosition();
  });

  // 창 크기 변경 시 보정
  window.addEventListener('resize', () => {
    clampPosition();
    updateColorBarPosition();
  });
}
