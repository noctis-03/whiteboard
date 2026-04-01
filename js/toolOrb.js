// ╔══════════════════════════════════════════════════════════╗
//  toolOrb.js — 포인터를 따라다니는 원(Orb)
//
//  ★ 변경: Orb 탭이 아니라 화면 아무 곳 탭으로 도구 활성화
//  · 터치 환경: 도구 선택 → pan 기본 → 화면 탭 → 도구 활성화
//  · 활성화 후 한 번 사용하면 자동 pan 복귀
//  · Orb 표시 중: 탭 = 도구 활성화, 드래그 = pan 이동
//  · Orb 사라진 후: 탭 = 도구 활성화, 드래그 = pan 이동
//  · 꾹 누르기/더블탭 (Orb 위) → 좌우 드래그로 도구 전환
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

/* ── 탭 판정용 상수 ── */
const TAP_MOVE_THRESH = 10;   // 이 거리 이상 움직이면 탭이 아님
const TAP_TIME_THRESH = 250;  // 이 시간(ms) 이내에 떼야 탭

/* ── 전역 참조 플래그 ── */
export let orbLock = false;

/* ── 도구 활성화 상태 (외부에서 참조) ── */
export let toolActivated = false;

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

/* ── ★ 화면 탭 감지용 상태 ── */
let screenTapStartX = 0;
let screenTapStartY = 0;
let screenTapStartTime = 0;
let screenTapTracking = false;

/* ╔══════════════════════════════════════════════════════════╗
   외부에서 호출: 도구 변경 알림 (tools.js → toolOrb.js)
   ╚══════════════════════════════════════════════════════════╝ */
export function notifyToolChanged(t) {
  updateLabel(t);
  toolActivated = false;
}

/* ╔══════════════════════════════════════════════════════════╗
   ★ 외부에서 호출: 화면 탭으로 도구 활성화 시도
      (touch.js의 touchstart에서 호출)
      true를 반환하면 도구가 활성화됨 → touch.js에서 도구 동작 시작
      false를 반환하면 활성화 안 됨 → pan 동작
   ╚══════════════════════════════════════════════════════════╝ */
export function tryActivateByTap() {
  if (!pendingTool) return false;
  if (toolActivated) return true; // 이미 활성화 상태

  // 활성화!
  activatePending();
  toolActivated = true;
  if (orb) orb.classList.add('orb-tool-active');
  // 도구를 사용하지 않아도 Orb가 사라지도록 타이머 유지
  scheduleHide(HIDE_DELAY);
  return true;
}

/* ╔══════════════════════════════════════════════════════════╗
   ★ 외부에서 호출: 화면 탭이 아닌 것으로 판명 (드래그 시작)
      → 도구 활성화 취소, pan 유지
   ╚══════════════════════════════════════════════════════════╝ */
export function cancelTapActivation() {
  // 이번 터치에서 도구가 활성화됐지만 아직 그리기 시작 전이면 취소
  // (실제로는 touch.js에서 드래그로 판명 시 호출)
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

  // ── Orb 위에서 손 뗌 (홀드 중, 위치 이동 아님) → Orb 탭 (도구 전환용은 아님) ──
  if (orbHolding && !orbRelocating) {
    try { orb.releasePointerCapture(e.pointerId); } catch (_) {}
    orbHolding = false;
    orbHoldPointerId = null;
    // Orb 탭은 이제 도구 활성화에 사용하지 않음 (화면 탭이 대신함)
    // 대신 Orb 탭 → 아무 동작 없음 (또는 향후 기능 추가 가능)
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

/* ╔══════════════════════════════════════════════════════════╗
   ★ 외부에서 호출 — 도구 사용 완료 후 처리
      (touch.js에서 touchend 시 호출)
      ★ 변경: 사용 후 즉시 pan 복귀하지 않고,
             Orb 타이머만 리셋. Orb가 사라질 때 pan 복귀.
   ╚══════════════════════════════════════════════════════════╝ */
export function scheduleRevertAfterUse() {
  if (!pendingTool || !toolActivated) return;
  // 도구는 활성 상태 유지 — Orb 타이머만 리셋
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

/* ── 미리보기 고스트 오버레이 ── */
let orbGhost = null;

function ensureGhost() {
  if (!orbGhost) {
    orbGhost = document.createElement('div');
    orbGhost.id = 'orb-preview-ghost';
    document.body.appendChild(orbGhost);
  }
  return orbGhost;
}

/* ── 미리보기 하이라이트 ── */
function previewToolHighlight(t) {
  clearPreviewHighlight();
  const btn = document.querySelector(
    `#tb-tools .tbtn[data-tool="${t}"], #tb-tools .tbtn[data-tool-or-panel="${t}"]`
  );
  if (!btn) return;

  // 1. #tb-tools를 정상 스크롤로 버튼을 뷰 안으로 이동
  const container = document.getElementById('tb-tools');
  if (container) {
    const btnLeft   = btn.offsetLeft;
    const btnWidth  = btn.offsetWidth;
    const contWidth = container.offsetWidth;
    const target    = btnLeft - (contWidth - btnWidth) / 2;
    container.scrollLeft = Math.max(0, target);
  }

  // 2. 버튼 위치를 실제 화면 좌표로 읽어 고스트 오버레이 배치
  //    (스크롤 후 한 프레임 뒤에 읽어야 정확)
  requestAnimationFrame(() => {
    const r = btn.getBoundingClientRect();
    // 버튼이 실제로 화면 안에 있는 경우에만 고스트 표시
    if (r.right < 0 || r.left > window.innerWidth) return;

    const ghost = ensureGhost();
    ghost.textContent = btn.textContent;
    ghost.className   = btn.className + ' orb-preview-ghost-active';
    // 버튼 중앙에 고스트를 배치하고 scale은 CSS에서
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

    // Orb가 사라져도 pendingTool은 유지 (화면 탭으로 다시 활성화 가능)
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
