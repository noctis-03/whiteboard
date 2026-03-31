// ═══════════════════════════════════════════════════
//  main.js — 애플리케이션 진입점
//
//  ∞ Canvas 0.01 — Modular Architecture
// ═══════════════════════════════════════════════════

import { resetView, toggleGrid } from './transform.js';
import { initLayout } from './layout.js';
import { setTool, setToolOrPanel, setColor, setStroke } from './tools.js';
import { initPenPanel } from './penPanel.js';
import { initMouseEvents } from './mouse.js';
import { initTouchEvents } from './touch.js';
import { initKeyboard } from './keyboard.js';
import { initContextMenu } from './contextMenu.js';
import { initImageInput } from './image.js';
import { initPersistence, saveBoard, clearAll, autoSave, persistence } from './persistence.js';
import { addSticky } from './sticky.js';
import { addCardWindow } from './card.js';
import { createStartupWindow } from './startup.js';
import { mkSvg, setAttrs } from './svg.js';

// ── SVG 모듈을 persistence에 주입 (순환 참조 방지) ──
persistence._svg = { mkSvg, setAttrs };

// ── 초기화 ──
function init() {
  initLayout();
  initPenPanel();
  initMouseEvents();
  initTouchEvents();
  initKeyboard();
  initContextMenu();
  initImageInput();
  initPersistence();

  // ── 툴바 이벤트 바인딩 (data 속성 기반) ──

  // 줌 리셋
  document.getElementById('zoom-pill').addEventListener('click', resetView);

  // 도구 선택 버튼
  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  // 도구 또는 패널 토글 버튼
  document.querySelectorAll('[data-tool-or-panel]').forEach(btn => {
    btn.addEventListener('click', () => setToolOrPanel(btn.dataset.toolOrPanel));
  });

  // 액션 버튼
  const actions = {
    addSticky:   () => addSticky(),
    addCard:     () => addCardWindow(),
    addImage:    () => document.getElementById('img-in').click(),
    toggleGrid:  () => toggleGrid(),
    save:        () => saveBoard(),
    load:        () => document.getElementById('load-in').click(),
    clearAll:    () => clearAll(),
  };
  document.querySelectorAll('[data-action]').forEach(btn => {
    const fn = actions[btn.dataset.action];
    if (fn) btn.addEventListener('click', fn);
  });

  // 색상 선택
  document.querySelectorAll('.cdot').forEach(el => {
    el.addEventListener('click', () => setColor(el));
  });

  // 선 굵기 선택
  document.querySelectorAll('.sbtn').forEach(el => {
    el.addEventListener('click', () => setStroke(el, parseInt(el.dataset.sw)));
  });

  // ── 자동 저장 시작 ──
  autoSave();

  // ── 시작 윈도우 표시 ──
  createStartupWindow();

  console.log('∞ Canvas 0.01 — Modular loaded');
}

// DOM 준비 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
