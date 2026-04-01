// ╔══════════════════════════════════════════════════════════╗
//  toolOrb.js — 포인터를 따라다니는 원(Orb)
//
//  · 터치 환경: 도구 선택 → pan 기본 → Orb 탭 → 도구 활성화
//  · Orb 숨김 시 → pan 복귀
//  · 꾹 누르기/더블탭 → 좌우 드래그로 도구 전환
//  · 왼쪽 순간이동 / 오른쪽 빠른 lerp
//  · long press 판정 전 위치 이동 가능
// ╔══════════════════════════════════════════════════════════╗

import { tool, pendingTool } from './state.js';
import { setTool, activatePending, revertToPan } from './tools.js';

/* ── 설정 ── */
const ORB_SIZE     = 36;
const OFFSET_X     = -30;
const OFFSET_Y     = -28;
const LERP_RIGHT   = 0.35;
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

/* ── ★ 도구 활성화 상태 (터치) ── */
let toolActivated = false;     // 예약 도구가 현재 활성화 되어있는지

/* ╔══════════════════════════════════════════════════════════╗
   외부에서 호출: 도구 변경 알림 (tools.js → toolOrb.js)
   ╚══════════════════════════════════════════════════════════╝ */
export function notifyToolChanged(t) {
  updateLabel(t);
  toolActivated = false;    // 새 도구 선택 시 활성화 초기화
}

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

  // ── 더블탭 판정 → 도구 전환 드래그 모드 ──
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

  // ── long press 타이머 → 도구 전환 드래그 모드 ──
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

/* ── 홀드 상태 초기화 ── */
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

  // ── Orb 위에서 손 뗌 (홀드 중, 위치 이동 아님) → ★ 단일 탭 = 도구 활성화 ──
  if (orbHolding && !orbRelocating) {
    try { orb.releasePointerCapture(e.pointerId); } catch (_) {}
    orbHolding = false;
    orbHoldPointerId = null;

    // ★ 예약 도구가 있으면 활성화 토글
    if (pendingTool) {
      if (!toolActivated) {
        // 예약 도구 활성화
        activatePending();
        toolActivated = true;
        orb.classList.add('orb-tool-active');
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        // 도구 활성 중에는 Orb를 계속 표시하되, 일정 시간 후 자동 해제
        // (touchend에서 도구 사용 완료 후 스케줄됨)
      } else {
        // 이미 활성화 → 비활성화 (pan 복귀)
        revertToPan();
        toolActivated = false;
        orb.classList.remove('orb-tool-active');
        scheduleHide(HIDE_DELAY);
      }
    }
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

/* ╔══════════════════════════════════════════════════════════╗
   ★ NEW: 외부에서 호출 — 도구 사용 완료 후 pan 복귀 스케줄
          (touch.js에서 touchend 시 호출)
   ╚══════════════════════════════════════════════════════════╝ */
export function scheduleRevertAfterUse() {
  if (!pendingTool || !toolActivated) return;
  revertToPan();
  toolActivated = false;
  orb.classList.remove('orb-tool-active');
  // Orb는 계속 보이되 타이머 후 사라짐 → 사라지면 pan 유지
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

  // 드래그 전환 시 기준 도구: pendingTool이 있으면 그것, 아니면 tool
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
    setTool(orbPreviewTool);   // setTool이 터치 환경이면 자동으로 pendingTool에 예약
  }

  clearPreviewHighlight();
  updateLabel(orbPreviewTool || pendingTool || tool);
  toolActivated = false;
  orb.classList.remove('orb-tool-active');
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
    orb.classList.remove('orb-tool-active');

    // ★ Orb가 사라지면 → pan 복귀
    if (pendingTool && toolActivated) {
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

/* ╔══════════════════════════════════════════════════════════╗
   애니메이션 루프
   ╚══════════════════════════════════════════════════════════╝ */
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
