// ╔══════════════════════════════════════════════════════════╗
//  toolOrb.js — 포인터를 따라다니는 원(Orb)
//
//  · 입력 위치의 오른쪽 위에 부드럽게 떠다님
//  · Orb 위에서 꾹 누르기 또는 더블클릭+홀드 → 좌우 드래그로 도구 전환
//  · 드래그 중에는 캔버스 도구 동작 완전 차단
//  · 손을 떼면 해당 도구 확정
//
//  UPDATE: 왼쪽 이동 → 순간이동 / 오른쪽 이동 → 빠른 lerp
//          long press 판정 전 orb 위치 자유 이동
// ╔══════════════════════════════════════════════════════════╗

import { tool } from './state.js';
import { setTool } from './tools.js';

/* ── 설정 ── */
const ORB_SIZE     = 36;
const OFFSET_X     = -30;
const OFFSET_Y     = -28;
const LERP_RIGHT   = 0.35;          // ★ 오른쪽: 기존 0.15 → 0.35 (빠르게)
const DRAG_THRESH  = 28;
const DBLCLICK_MS  = 320;
const LONGPRESS_MS = 400;
const HIDE_DELAY   = 4000;
const MOVE_CANCEL_DIST = 12;

/* ── 전역 참조 플래그 ── */
export let orbLock = false;

/* ── 도구 순서 ── */
function getToolOrder() {
  const btns = document.querySelectorAll(
    '#tb-tools .tbtn[data-tool], #tb-tools .tbtn[data-tool-or-panel]'
  );
  const order = [];
  btns.forEach(btn => {
    const t = btn.dataset.tool || btn.dataset.toolOrPanel;
    if (t && !order.includes(t)) order.push(t);
  });
  return order;
}

/* ── DOM ── */
let orb, orbLabel;

/* ── 위치 상태 ── */
let targetX = -200, targetY = -200;
let currentX = -200, currentY = -200;
let visible = false;
let hideTimer = null;

/* ── Orb 위 더블클릭 감지 ── */
let orbLastDownTime = 0;

/* ── long press 감지 ── */
let orbLongPressTimer = null;

/* ── Orb 위치 이동(홀드) 상태 ── */
let orbHolding = false;
let orbRelocating = false;
let orbHoldStartX = 0;
let orbHoldStartY = 0;
let orbHoldOrbStartX = 0;
let orbHoldOrbStartY = 0;
let orbHoldPointerId = null;

/* ── 드래그 모드 (도구 전환) ── */
let orbActive      = false;
let orbDragStartX  = 0;
let orbSteps       = 0;
let orbBaseIdx     = 0;
let orbPreviewTool = '';

/* ╔══════════════════════════════════════════════════════════╗
   초기화
   ╚══════════════════════════════════════════════════════════╝ */
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

/* ╔══════════════════════════════════════════════════════════╗
   Orb 위 포인터 다운
   ╚══════════════════════════════════════════════════════════╝ */
function onOrbPointerDown(e) {
  e.stopPropagation();
  e.preventDefault();

  const now = Date.now();

  // ── 더블탭 판정 ──
  if (now - orbLastDownTime < DBLCLICK_MS) {
    cancelOrbLongPress();
    cancelOrbHold();
    activateOrbDrag(e);
    orbLastDownTime = 0;
    return;
  }

  orbLastDownTime = now;

  // ── 홀드 상태 시작 ──
  orbHolding = true;
  orbRelocating = false;
  orbHoldStartX = e.clientX;
  orbHoldStartY = e.clientY;
  orbHoldOrbStartX = currentX;
  orbHoldOrbStartY = currentY;
  orbHoldPointerId = e.pointerId;

  try { orb.setPointerCapture(e.pointerId); } catch (_) {}

  // ── long press 타이머 시작 ──
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

/* ── long press 타이머 취소 ── */
function cancelOrbLongPress() {
  if (orbLongPressTimer) {
    clearTimeout(orbLongPressTimer);
    orbLongPressTimer = null;
  }
}

/* ── 홀드/위치이동 상태 초기화 ── */
function cancelOrbHold() {
  orbHolding = false;
  orbRelocating = false;
  orbHoldPointerId = null;
}

/* ╔══════════════════════════════════════════════════════════╗
   전역 포인터 이벤트
   ╚══════════════════════════════════════════════════════════╝ */
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

  targetX = e.clientX + OFFSET_X;
  targetY = e.clientY + OFFSET_Y;
  showOrb();
}

function onGlobalMove(e) {
  // ── 도구 전환 드래그 모드 중 ──
  if (orbActive) {
    e.stopPropagation();
    e.preventDefault();
    handleOrbDrag(e);
    targetX = e.clientX + OFFSET_X;
    targetY = e.clientY + OFFSET_Y;
    return;
  }

  // ── Orb 홀드 중 (long press 대기 또는 위치 이동 모드) ──
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

  if (orbHolding || orbRelocating) {
    try { orb.releasePointerCapture(e.pointerId); } catch (_) {}
    orbHolding = false;
    orbRelocating = false;
    orbHoldPointerId = null;
    scheduleHide(HIDE_DELAY);
    return;
  }

  scheduleHide(HIDE_DELAY);
}

/* ╔══════════════════════════════════════════════════════════╗
   드래그 모드 (도구 전환)
   ╚══════════════════════════════════════════════════════════╝ */
function activateOrbDrag(e) {
  orbActive = true;
  orbLock   = true;
  orbDragStartX = e.clientX;
  orbSteps = 0;

  const order = getToolOrder();
  orbBaseIdx = order.indexOf(tool);
  if (orbBaseIdx === -1) orbBaseIdx = 0;
  orbPreviewTool = tool;

  orb.classList.add('orb-active');
  updateLabel(tool);

  const tb = document.getElementById('toolbar');
  if (tb) tb.classList.add('tb-orb-zoom');

  previewToolHighlight(tool);

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

  if (orbPreviewTool && orbPreviewTool !== tool) {
    setTool(orbPreviewTool);
  }

  clearPreviewHighlight();
  updateLabel(orbPreviewTool || tool);
  scheduleHide(HIDE_DELAY);
}

/* ── 미리보기 하이라이트 ── */
function previewToolHighlight(t) {
  clearPreviewHighlight();
  const btn = document.querySelector(
    `#tb-tools .tbtn[data-tool="${t}"], #tb-tools .tbtn[data-tool-or-panel="${t}"]`
  );
  if (btn) {
    btn.classList.add('orb-preview');
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

function clearPreviewHighlight() {
  document.querySelectorAll('.orb-preview').forEach(b => b.classList.remove('orb-preview'));
}

/* ╔══════════════════════════════════════════════════════════╗
   표시 / 숨기기 / 레이블
   ╚══════════════════════════════════════════════════════════╝ */
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

function scheduleHide(ms) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (orbActive) return;
    visible = false;
    orb.classList.remove('orb-visible');
    hideTimer = null;
  }, ms);
}

function updateLabel(t) {
  const map = {
    select: '⊹', edit: '✎', pan: '✋',
    pen: '✏️', highlight: '🖊️', eraser: '◻',
    text: 'T', rect: '□', circle: '○', arrow: '→',
  };
  orbLabel.textContent = map[t] || t.charAt(0).toUpperCase();
}

/* ╔══════════════════════════════════════════════════════════╗
   애니메이션 루프 — ★ 방향별 이동 속도 분리
   ╚══════════════════════════════════════════════════════════╝ */
function animLoop() {
  if (!orbRelocating) {
    const dx = targetX - currentX;
    const dy = targetY - currentY;

    if (dx < -0.5) {
      // ★ 왼쪽 이동 → 순간이동
      currentX = targetX;
    } else {
      // ★ 오른쪽 이동 (또는 제자리) → 빠른 lerp
      currentX += dx * LERP_RIGHT;
    }

    // Y축은 항상 빠른 lerp
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
