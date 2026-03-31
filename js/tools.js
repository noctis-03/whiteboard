// ═══════════════════════════════════════════════════
//  tools.js — 도구, 색상, 선 굵기 전환
//
//  ADD: 편집(edit) 도구 추가
// ═══════════════════════════════════════════════════

import { tool, setToolState, setColorState, setSwState } from './state.js';
import { deselectAll } from './selection.js';
import { closeCtx } from './contextMenu.js';
import { closePenPanel, togglePenPanel } from './penPanel.js';

export function setTool(t) {
  const prev = tool;
  setToolState(t);
  document.body.setAttribute('data-tool', t);
  document.querySelectorAll('.tbtn[id^="t-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('t-' + t);
  if (btn) btn.classList.add('active');

  // edit 도구로 전환 시에도 기존 선택 유지
  // select, edit 사이 전환은 선택 해제하지 않음
  if (t !== 'select' && t !== 'edit') {
    deselectAll();
  }

  // edit 모드 해제 시 활성 편집 상태 blur
  if (prev === 'edit' && t !== 'edit') {
    const active = document.activeElement;
    if (active && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      active.blur();
    }
  }

  closeCtx();
  closePenPanel();
}

export function setToolOrPanel(t) {
  if (tool === t) {
    togglePenPanel(t);
  } else {
    setTool(t);
  }
}

export function setColor(el) {
  document.querySelectorAll('.cdot').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
  setColorState(el.dataset.c);
}

export function setStroke(el, v) {
  document.querySelectorAll('.sbtn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  setSwState(v);
}
