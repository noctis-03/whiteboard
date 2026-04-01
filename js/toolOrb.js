// ═══════════════════════════════════════════════════
//  toolOrb.js — 포인터를 따라다니는 원(Orb)
//
//  FIX: 마크다운 코드 블록 오염 제거, 문법 오류 수정
// ═══════════════════════════════════════════════════

import { tool, pendingTool } from './state.js';
import { setTool, activatePending, revertToPan } from './tools.js';

const NO_ORB_TOOLS = new Set(['text', 'edit', 'pan', 'select']);

const ORB_SIZE     = 36;
const OFFSET_X     = -30;
const OFFSET_Y     = -28;
const LERP_RIGHT   = 0.35;
const DRAG_THRESH  = 28;
const DBLCLICK_MS  = 320;
const LONGPRESS_MS = 400;
const HIDE_DELAY   = 4000;
const MOVE_CANCEL_DIST = 12;

const TAP_MOVE_THRESH = 10;
const TAP_TIME_THRESH = 250;

export let orbLock = false;
export let toolActivated = false;

function getToolOrder() {
  const btns = document.querySelectorAll(
    '#tb-tools .tbtn[data-tool], #tb-tools .tbtn[data-tool-or-panel]'
  );
  const order = [];
  btns.forEach(btn => {
    const t = btn.dataset.tool || btn.dataset.toolOrPanel;
    if (t && !order.includes(t) && !NO_ORB_TOOLS.has(t)) order.push(t);
  });
  return order;
}

let orb, orbLabel;

let targetX = -200, targetY = -200;
let currentX = -200, currentY = -200;
let visible = false;
let hideTimer = null;

let orbLastDownTime = 0;
let orbLongPressTimer = null;

let orbHolding = false;
let orbRelocating = false;
let orbHoldStartX = 0;
let orbHoldStartY = 0;
let orbHoldOrbStartX = 0;
let orbHoldOrbStartY = 0;
let orbHoldPointerId = null;

let orbActive      = false;
let orbDragStartX  = 0;
let orbSteps       = 0;
let orbBaseIdx     = 0;
let orbPreviewTool = '';

let screenTapStartX = 0;
let screenTapStartY = 0;
let screenTapStartTime = 0;
let screenTapTracking = false;

export function notifyToolChanged(t) {
  updateLabel(t);
  toolActivated = false;
  if (orb) orb.classList.remove('orb-tool-active');
  if (NO_ORB_TOOLS.has(t)) {
    hideOrbNow();
  }
}

export function tryActivateByTap() {
  if (!pendingTool) return false;
  if (toolActivated) return true;

  activatePending();
  toolActivated = true;
  if (orb) orb.classList.add('orb-tool-active');
  scheduleHide(HIDE_DELAY);
  return true;
}

export function cancelTapActivation() {
  // placeholder for future use
}

export function initToolOrb() {
  orb = document.createElement('div');
  orb.id = 'tool-orb';
  orb.setAttribute('aria-hidden', 'true');

  orbLabel = document.createElement('span');
  orbLabel.id = 'tool-orb-label';
  orb.appendChild(orbLabel);

  document.body.appendChild(orb);

  orb.addEventListener('pointerdown', onOrbPointerDown);

  window.addEventListener('pointerdown', onGlobalDown, true);
  window.addEventListener('pointermove', onGlobalMove, true);
  window.addEventListener('pointerup',   onGlobalUp,   true);
  window.addEventListener('pointercancel', onGlobalUp,  true);

  animLoop();
  updateLabel(tool);
}

function onOrbPointerDown(e) {
  e.stopPropagation();
  e.preventDefault();

  const now = Date.now();

  if (now - orbLastDownTime < DBLCLICK_MS) {
    cancelOrbLongPress();
    cancelOrbHold();
    activateOrbDrag(e);
    orbLastDownTime = 0;
    return;
  }

  orbLastDownTime = now;

  orbHolding = true;
  orbRelocating = false;
  orbHoldStartX = e.clientX;
  orbHoldStartY = e.clientY;
  orbHoldOrbStartX = currentX;
  orbHoldOrbStartY = currentY;
  orbHoldPointerId = e.pointerId;

  try { orb.setPointerCapture(e.pointerId); } catch (_) {}

  cancelOrbLongPress();
  orbLongPressTimer = setTimeout(() => {
    orbLongPressTimer = null;
    if (orbHolding && !orbRelocating) {
      orbHolding = false;
      activateOrbDrag(e);
      orbLastDownTime = 0;
    }
  }, LONGPRESS_MS);
}

function cancelOrbLongPress() {
  if (orbLongPressTimer) {
    clearTimeout(orbLongPressTimer);
    orbLongPressTimer = null;
  }
}

function cancelOrbHold() {
  orbHolding = false;
  orbRelocating = false;
  orbHoldPointerId = null;
}

function onGlobalDown(e) {
  if (orbActive) {
    if (!orb.contains(e.target)) {
      e.stopPropagation();
      e.preventDefault();
    }
    return;
  }

  if (e.target.closest('#toolbar') ||
      e.target.closest('#pen-panel') ||
      e.target.closest('#color-bar') ||
      orb.contains(e.target)) return;

  const activeTool = pendingTool || tool;
  if (NO_ORB_TOOLS.has(activeTool)) return;

  targetX = e.clientX + OFFSET_X;
  targetY = e.clientY + OFFSET_Y;
  showOrb();
}

function onGlobalMove(e) {
  if (orbActive) {
    e.stopPropagation();
    e.preventDefault();
    handleOrbDrag(e);
    targetX = e.clientX + OFFSET_X;
    targetY = e.clientY + OFFSET_Y;
    return;
  }

  if (orbHolding || orbRelocating) {
    e.stopPropagation();
    e.preventDefault();

    const dx = e.clientX - orbHoldStartX;
    const dy = e.clientY - orbHoldStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!orbRelocating && dist > MOVE_CANCEL_DIST) {
      cancelOrbLongPress();
      orbRelocating = true;
    }

    if (orbRelocating) {
      const newX = orbHoldOrbStartX + dx;
      const newY = orbHoldOrbStartY + dy;
      targetX = newX;
      targetY = newY;
      currentX = newX;
      currentY = newY;
      applyPosition();
    }
    return;
  }

  if (e.target.closest('#toolbar') ||
      e.target.closest('#pen-panel') ||
      e.target.closest('#color-bar') ||
      orb.contains(e.target)) return;

  if (e.buttons > 0 || e.pointerType === 'touch') {
    const activeTool = pendingTool || tool;
    if (NO_ORB_TOOLS.has(activeTool)) return;
    targetX = e.clientX + OFFSET_X;
    targetY = e.clientY + OFFSET_Y;
    showOrb();
  }
}

function onGlobalUp(e) {
  cancelOrbLongPress();

  if (orbActive) {
    e.stopPropagation();
    e.preventDefault();
    finishOrbDrag();
    cancelOrbHold();
    return;
  }

  if (orbHolding && !orbRelocating) {
    try { orb.releasePointerCapture(e.pointerId); } catch (_) {}
    orbHolding = false;
    orbHoldPointerId = null;
    scheduleHide(HIDE_DELAY);
    return;
  }

  if (orbRelocating) {
    try { orb.releasePointerCapture(e.pointerId); } catch (_) {}
    orbHolding = false;
    orbRelocating = false;
    orbHoldPointerId = null;
    scheduleHide(HIDE_DELAY);
    return;
  }

  scheduleHide(HIDE_DELAY);
}

export function scheduleRevertAfterUse() {
  if (!pendingTool || !toolActivated) return;
  scheduleHide(HIDE_DELAY);
}

function activateOrbDrag(e) {
  orbActive = true;
  orbLock   = true;
  orbDragStartX = e.clientX;
  orbSteps = 0;

  const baseTool = pendingTool || tool;
  const order = getToolOrder();
  orbBaseIdx = order.indexOf(baseTool);
  if (orbBaseIdx === -1) orbBaseIdx = 0;
  orbPreviewTool = baseTool;

  orb.classList.add('orb-active');
  updateLabel(baseTool);

  const tb = document.getElementById('toolbar');
  if (tb) tb.classList.add('tb-orb-zoom');

  previewToolHighlight(baseTool);

  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
}

function handleOrbDrag(e) {
  const totalDx = e.clientX - orbDragStartX;
  const newSteps = Math.trunc(totalDx / DRAG_THRESH);

  if (newSteps !== orbSteps) {
    orbSteps = newSteps;
    const order = getToolOrder();
    let idx = Math.max(0, Math.min(orbBaseIdx + newSteps, order.length - 1));
    const newTool = order[idx];

    if (newTool !== orbPreviewTool) {
      orbPreviewTool = newTool;
      previewToolHighlight(newTool);
      updateLabel(newTool);
      if (navigator.vibrate) navigator.vibrate(8);
    }
  }
}

function finishOrbDrag() {
  if (!orbActive) return;
  orbActive = false;
  orbLock   = false;
  orb.classList.remove('orb-active');

  const tb = document.getElementById('toolbar');
  if (tb) tb.classList.remove('tb-orb-zoom');

  if (orbPreviewTool) {
    setTool(orbPreviewTool);
  }

  clearPreviewHighlight();
  updateLabel(orbPreviewTool || pendingTool || tool);
  toolActivated = false;
  if (orb) orb.classList.remove('orb-tool-active');
  scheduleHide(HIDE_DELAY);
}

let orbGhost = null;

function ensureGhost() {
  if (!orbGhost) {
    orbGhost = document.createElement('div');
    orbGhost.id = 'orb-preview-ghost';
    document.body.appendChild(orbGhost);
  }
  return orbGhost;
}

function previewToolHighlight(t) {
  clearPreviewHighlight();
  const btn = document.querySelector(
    `#tb-tools .tbtn[data-tool="${t}"], #tb-tools .tbtn[data-tool-or-panel="${t}"]`
  );
  if (!btn) return;

  const container = document.getElementById('tb-tools');
  if (container) {
    const btnLeft   = btn.offsetLeft;
    const btnWidth  = btn.offsetWidth;
    const contWidth = container.offsetWidth;
    const target    = btnLeft - (contWidth - btnWidth) / 2;
    container.scrollLeft = Math.max(0, target);
  }

  requestAnimationFrame(() => {
    const r = btn.getBoundingClientRect();
    if (r.right < 0 || r.left > window.innerWidth) return;

    const ghost = ensureGhost();
    ghost.textContent = btn.textContent;
    ghost.className   = btn.className + ' orb-preview-ghost-active';
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height / 2;
    ghost.style.left = cx + 'px';
    ghost.style.top  = cy + 'px';
    ghost.style.width  = r.width  + 'px';
    ghost.style.height = r.height + 'px';
  });
}

function clearPreviewHighlight() {
  document.querySelectorAll('.orb-preview').forEach(b => b.classList.remove('orb-preview'));
  if (orbGhost) {
    orbGhost.className = '';
    orbGhost.textContent = '';
  }
}

function showOrb() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (!visible) {
    visible = true;
    orb.classList.add('orb-visible');
    currentX = targetX;
    currentY = targetY;
    applyPosition();
  }
}

function hideOrbNow() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  visible = false;
  if (orb) {
    orb.classList.remove('orb-visible');
    orb.classList.remove('orb-tool-active');
  }
  clearPreviewHighlight();
}

function scheduleHide(ms) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (orbActive) return;
    visible = false;
    orb.classList.remove('orb-visible');
    orb.classList.remove('orb-tool-active');

    if (toolActivated) {
      revertToPan();
      toolActivated = false;
    }

    hideTimer = null;
  }, ms);
}

function updateLabel(t) {
  const map = {
    select: '⊹', edit: '✎', pan: '✋',
    pen: '✏️', highlight: '🖊️', eraser: '◻',
    text: 'T', rect: '□', circle: '○', arrow: '→',
  };
  if (!orbLabel) return;
  orbLabel.textContent = map[t] || t.charAt(0).toUpperCase();
}

function animLoop() {
  if (!orbRelocating) {
    const dx = targetX - currentX;
    const dy = targetY - currentY;

    if (dx < -0.5) {
      currentX = targetX;
    } else {
      currentX += dx * LERP_RIGHT;
    }

    currentY += dy * LERP_RIGHT;
  }
  applyPosition();
  requestAnimationFrame(animLoop);
}

function applyPosition() {
  const half = ORB_SIZE / 2;
  const x = Math.max(half, Math.min(currentX, window.innerWidth - half));
  const y = Math.max(half, Math.min(currentY, window.innerHeight - half));
  orb.style.transform = `translate(${x - half}px, ${y - half}px)`;
}
