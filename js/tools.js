// ═══════════════════════════════════════════════════
//  tools.js — 도구, 색상, 선 굵기 전환
//
//  UPDATE: 터치 환경에서 도구 선택 시
//          pan을 기본으로 하고 pendingTool에 예약
// ═══════════════════════════════════════════════════

import { tool, setToolState, setColorState, setSwState, setPendingTool } from './state.js';
import { deselectAll } from './selection.js';
import { closeCtx } from './contextMenu.js';
import { closePenPanel, togglePenPanel } from './penPanel.js';
import { showColorBar, hideColorBar, isDrawTool } from './toolbar.js';
import { notifyToolChanged } from './toolOrb.js';

/* ── 터치 환경 판별 ── */
const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

/* ── pan 모드가 아닌 "실제 도구" 목록 ── */
const PAN_BYPASS = ['pan'];

export function setTool(t) {
  const prev = tool;

  // ★ 터치 환경 & pan이 아닌 도구 선택 시 → pan 유지 + 예약
  if (isTouchDevice() && !PAN_BYPASS.includes(t)) {
    setPendingTool(t);
    _applyToolVisual(t);          // 툴바 UI는 선택한 도구 표시
    _applyToolInternal('pan');    // 실제 동작은 pan
    notifyToolChanged(t);         // orb에 예약 도구 표시 알림
    closeCtx();
    closePenPanel();
    // 색상 바: 예약 도구가 그리기 도구면 미리 표시
    if (isDrawTool(t)) showColorBar(); else hideColorBar();
    return;
  }

  // ── 마우스 환경 또는 pan 직접 선택: 기존 동작 ──
  setPendingTool(null);
  _applyToolInternal(t);
  _applyToolVisual(t);
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

/**
 * ★ NEW: 예약된 도구를 실제로 활성화 (Orb 탭 시 호출)
 */
export function activatePendingTool() {
  const { pendingTool } = require_pending();
  if (!pendingTool) return false;

  _applyToolInternal(pendingTool);
  // 시각적으로는 이미 pendingTool이 활성화 표시됨
  if (pendingTool !== 'select' && pendingTool !== 'edit') deselectAll();

  closeCtx();
  closePenPanel();
  if (isDrawTool(pendingTool)) showColorBar(); else hideColorBar();
  return true;
}

/**
 * ★ NEW: 도구를 다시 pan으로 되돌림 (Orb 숨김 시 호출)
 */
export function deactivateToPan() {
  const { pendingTool } = require_pending();
  if (!pendingTool) return;
  _applyToolInternal('pan');
  // 툴바 시각은 pendingTool 유지
}

/* ── 내부 헬퍼: state.tool 설정 + body data-tool ── */
function _applyToolInternal(t) {
  setToolState(t);
  document.body.setAttribute('data-tool', t);
}

/* ── 내부 헬퍼: 툴바 버튼 active 시각 표시 ── */
function _applyToolVisual(t) {
  document.querySelectorAll('.tbtn[id^="t-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('t-' + t);
  if (btn) btn.classList.add('active');
}

/* ── pendingTool 접근 헬퍼 (순환 참조 회피) ── */
function require_pending() {
  // state.js에서 직접 import
  const S = await_state;
  return { pendingTool: S.pendingTool };
}
// 동기 접근을 위한 방법: 직접 import 사용
import { pendingTool } from './state.js';
function require_pending_sync() {
  return { pendingTool };
}

// 실제로는 위의 require_pending 대신 직접 사용
export function activatePendingToolDirect() {
  if (!pendingTool) return false;
  _applyToolInternal(pendingTool);
  if (pendingTool !== 'select' && pendingTool !== 'edit') deselectAll();
  closeCtx();
  closePenPanel();
  if (isDrawTool(pendingTool)) showColorBar(); else hideColorBar();
  return true;
}

export function deactivateToPanDirect() {
  if (!pendingTool) return;
  _applyToolInternal('pan');
}

export function setToolOrPanel(t) {
  if (tool === t || (pendingTool === t && isTouchDevice())) {
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
