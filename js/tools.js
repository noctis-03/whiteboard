// ═══════════════════════════════════════════════════
//  tools.js — 도구, 색상, 선 굵기 전환
//
//  UPDATE: 터치 환경에서 도구 선택 시
//          pan을 기본으로, pendingTool에 예약
//          Orb 탭으로 활성화 / Orb 숨김으로 pan 복귀
// ═══════════════════════════════════════════════════

import { tool, pendingTool, setToolState, setColorState, setSwState, setPendingTool } from './state.js';
import { deselectAll } from './selection.js';
import { closeCtx } from './contextMenu.js';
import { closePenPanel, togglePenPanel } from './penPanel.js';
import { showColorBar, hideColorBar, isDrawTool } from './toolbar.js';
import { notifyToolChanged } from './toolOrb.js';

/* ── 터치 환경 판별 ── */
const isTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

/* ── 실제 내부 도구 적용 (state + body) ── */
function applyInternal(t) {
  setToolState(t);
  document.body.setAttribute('data-tool', t);
}

/* ── 툴바 버튼 시각적 active 표시 ── */
function applyVisual(t) {
  document.querySelectorAll('.tbtn[id^="t-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('t-' + t);
  if (btn) btn.classList.add('active');
}

/* ══════════════════════════════════════════════════════
   setTool — 도구 선택 (툴바 버튼 클릭 시)
   ══════════════════════════════════════════════════════ */
export function setTool(t) {
  const prev = tool;

  // ★ 터치 환경 & pan이 아닌 도구 → 예약만, 실제는 pan
  if (isTouch() && t !== 'pan') {
    setPendingTool(t);
    applyVisual(t);
    applyInternal('pan');
    notifyToolChanged(t);
    closeCtx();
    closePenPanel();
    if (isDrawTool(t)) showColorBar(); else hideColorBar();
    return;
  }

  // ── 마우스 환경 또는 pan 직접 선택 ──
  setPendingTool(null);
  applyInternal(t);
  applyVisual(t);
  notifyToolChanged(t);

  if (t !== 'select' && t !== 'edit') deselectAll();

  if (prev === 'edit' && t !== 'edit') {
    const active = document.activeElement;
    if (active && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      active.blur();
    }
  }

  closeCtx();
  closePenPanel();
  if (isDrawTool(t)) showColorBar(); else hideColorBar();
}

/* ══════════════════════════════════════════════════════
   ★ NEW: activatePending — 예약 도구를 실제 활성화
          (Orb 탭 시 호출)
   ══════════════════════════════════════════════════════ */
export function activatePending() {
  if (!pendingTool) return false;
  applyInternal(pendingTool);
  if (pendingTool !== 'select' && pendingTool !== 'edit') deselectAll();
  closeCtx();
  closePenPanel();
  if (isDrawTool(pendingTool)) showColorBar(); else hideColorBar();
  return true;
}

/* ══════════════════════════════════════════════════════
   ★ NEW: revertToPan — pan으로 복귀
          (Orb 숨김 시 / 도구 사용 완료 후 호출)
   ══════════════════════════════════════════════════════ */
export function revertToPan() {
  if (!pendingTool) return;
  applyInternal('pan');
  // 시각적으로는 pendingTool이 여전히 활성화 표시 (유저가 뭘 골랐는지 보여줌)
}

/* ══════════════════════════════════════════════════════ */
export function setToolOrPanel(t) {
  // 터치 환경에서 이미 같은 도구가 예약된 상태면 패널 토글
  if (isTouch() && pendingTool === t) {
    togglePenPanel(t);
    return;
  }
  if (tool === t) {
    togglePenPanel(t);
  } else {
    setTool(t);
  }
}

export function setColor(el) {
  document.querySelectorAll('#color-bar .cdot').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
  setColorState(el.dataset.c);
}

export function setStroke(el, v) {
  document.querySelectorAll('#color-bar .sbtn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  setSwState(v);
}
