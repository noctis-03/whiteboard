// ═══════════════════════════════════════════════════
//  tools.js — 도구, 색상, 선 굵기 전환
//
//  ADD: 편집(edit) 도구, 색상 바 표시/숨김
// ═══════════════════════════════════════════════════

import { tool, setToolState, setColorState, setSwState } from './state.js';
import { deselectAll } from './selection.js';
import { closeCtx } from './contextMenu.js';
import { closePenPanel, togglePenPanel } from './penPanel.js';
import { showColorBar, hideColorBar, isDrawTool } from './toolbar.js';

export function setTool(t) {
  const prev = tool;
  setToolState(t);
  document.body.setAttribute('data-tool', t);
  document.querySelectorAll('.tbtn[id^="t-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('t-' + t);
  if (btn) btn.classList.add('active');

  if (t !== 'select' && t !== 'edit') {
    deselectAll();
  }

  if (prev === 'edit' && t !== 'edit') {
    const active = document.activeElement;
    if (active && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      active.blur();
    }
  }

  closeCtx();
  closePenPanel();

  // 색상 바: 그리기 도구면 표시, 아니면 숨김
  if (isDrawTool(t)) {
    showColorBar();
  } else {
    hideColorBar();
  }
}

export function setToolOrPanel(t) {
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
