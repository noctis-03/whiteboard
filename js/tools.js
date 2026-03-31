// ═══════════════════════════════════════════════════
//  tools.js — 도구, 색상, 선 굵기 전환
// ═══════════════════════════════════════════════════

import { tool, setToolState, setColorState, setSwState } from './state.js';
import { deselectAll } from './selection.js';
import { closeCtx } from './contextMenu.js';
import { closePenPanel, togglePenPanel } from './penPanel.js';

export function setTool(t) {
  setToolState(t);
  document.body.setAttribute('data-tool', t);
  document.querySelectorAll('.tbtn[id^="t-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('t-' + t);
  if (btn) btn.classList.add('active');
  deselectAll();
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
