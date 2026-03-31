// ═══════════════════════════════════════════════════
//  toolOrb.js — 포인터 근처에 따라다니는 원(Orb)
//
//  · 입력 위치의 오른쪽 위에 부드럽게 따라다님
//  · Orb 위에서 더블클릭+홀드 → 좌우 드래그로 도구 전환
//  · 드래그 중에는 캔버스 도구 동작 완전 차단
//  · 손을 때면 해당 도구 확정
// ═══════════════════════════════════════════════════

import { tool } from './state.js';
import { setTool } from './tools.js';

/* ── 설정 ── */
const ORB_SIZE     = 36;
const OFFSET_X     = 30;
const OFFSET_Y     = -28;
const LERP         = 0.15;
const DRAG_THRESH  = 28;
const DBLCLICK_MS  = 320;
const HIDE_DELAY   = 4000;   // 4초 유지 (기존 1.2초 → 대폭 연장)

/* ── 전역 차단 플래그 (외부에서 import하여 확인) ── */
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

/* ── 드래그 모드 ── */
let orbActive     = false;
let orbDragStartX = 0;
let orbSteps      = 0;
let orbBaseIdx    = 0;
let orbPreviewTool = '';

/* ═══════════════════════════════════════════════════
   초기화
═══════════════════════════════════════════════════ */
export function initToolOrb() {
  orb = document.createElement('div');
  orb.id = 'tool-orb';
  orb.setAttribute('aria-hidden', 'true');

  orbLabel = document.createElement('span');
  orbLabel.id = 'tool-orb-label';
  orb.appendChild(orbLabel);

  document.body.appendChild(orb);

  /* ── Orb 자체 이벤트 (pointer-events: all이므로 받을 수 있음) ── */
  orb.addEventListener('pointerdown', onOrbPointerDown);

  /* ── 캔버스 포인터 추적 (Orb 위치 갱신용, capture) ── */
  window.addEventListener('pointerdown', onGlobalDown, true);
  window.addEventListener('pointermove', onGlobalMove, true);
  window.addEventListener('pointerup',   onGlobalUp,   true);
  window.addEventListener('pointercancel', onGlobalUp,  true);

  animLoop();
  updateLabel(tool);
}

/* ═══════════════════════════════════════════════════
   Orb 위 포인터 다운 — 더블클릭 판정
═══════════════════════════════════════════════════ */
function onOrbPointerDown(e) {
  e.stopPropagation();   // 캔버스로 전파 차단
  e.preventDefault();

  const now = Date.now();

  if (now - orbLastDownTime < DBLCLICK_MS) {
    // ── 더블클릭+홀드 → 드래그 모드 진입 ──
    activateOrbDrag(e);
    orbLastDownTime = 0;  // 리셋
  } else {
    orbLastDownTime = now;
  }
}

/* ═══════════════════════════════════════════════════
   전역 포인터 이벤트
═══════════════════════════════════════════════════ */
function onGlobalDown(e) {
  // 드래그 모드 중이면 캔버스 입력 완전 차단
  if (orbActive) {
    if (!orb.contains(e.target)) {
      e.stopPropagation();
      e.preventDefault();
    }
    return;
  }

  // 툴바/패널 위에서는 Orb 위치 갱신 안 함
  if (e.target.closest('#toolbar') ||
      e.target.closest('#pen-panel') ||
      e.target.closest('#color-bar') ||
      orb.contains(e.target)) return;

  targetX = e.clientX + OFFSET_X;
  targetY = e.clientY + OFFSET_Y;
  showOrb();
}

function onGlobalMove(e) {
  // 드래그 모드
  if (orbActive) {
    e.stopPropagation();
    e.preventDefault();
    handleOrbDrag(e);
    // Orb도 포인터 따라감
    targetX = e.clientX + OFFSET_X;
    targetY = e.clientY + OFFSET_Y;
    return;
  }

  // 일반: 포인터 눌린 상태에서 위치 갱신
  if (e.target.closest('#toolbar') ||
      e.target.closest('#pen-panel') ||
      e.target.closest('#color-bar')) return;

  if (e.buttons > 0 || e.pointerType === 'touch') {
    targetX = e.clientX + OFFSET_X;
    targetY = e.clientY + OFFSET_Y;
    showOrb();
  }
}

function onGlobalUp(e) {
  if (orbActive) {
    e.stopPropagation();
    e.preventDefault();
    finishOrbDrag();
    return;
  }

  scheduleHide(HIDE_DELAY);
}

/* ═══════════════════════════════════════════════════
   드래그 모드
═══════════════════════════════════════════════════ */
function activateOrbDrag(e) {
  orbActive = true;
  orbLock   = true;           // ★ 전역 차단 ON
  orbDragStartX = e.clientX;
  orbSteps = 0;

  const order = getToolOrder();
  orbBaseIdx = order.indexOf(tool);
  if (orbBaseIdx === -1) orbBaseIdx = 0;
  orbPreviewTool = tool;

  orb.classList.add('orb-active');
  updateLabel(tool);

  // 숨김 타이머 취소
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
  orbLock   = false;          // ★ 전역 차단 OFF
  orb.classList.remove('orb-active');

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

/* ═══════════════════════════════════════════════════
   표시 / 숨김 / 레이블
═══════════════════════════════════════════════════ */
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
    if (orbActive) return;     // 드래그 중이면 숨기지 않음
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

/* ═══════════════════════════════════════════════════
   애니메이션 루프
═══════════════════════════════════════════════════ */
function animLoop() {
  currentX += (targetX - currentX) * LERP;
  currentY += (targetY - currentY) * LERP;
  applyPosition();
  requestAnimationFrame(animLoop);
}

function applyPosition() {
  const half = ORB_SIZE / 2;
  const x = Math.max(half, Math.min(currentX, window.innerWidth - half));
  const y = Math.max(half, Math.min(currentY, window.innerHeight - half));
  orb.style.transform = `translate(${x - half}px, ${y - half}px)`;
}
