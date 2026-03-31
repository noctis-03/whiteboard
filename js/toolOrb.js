// ═══════════════════════════════════════════════════
//  toolOrb.js — 포인터 근처를 떠다니는 도구 전환 오브
//
//  v3: 필기 회피 메커니즘 + 더블클릭 도망 버그 수정
// ═══════════════════════════════════════════════════
import { tool }       from './state.js';
import { setTool }    from './tools.js';

/* ── constants ── */
const ORB_SIZE      = 36;
const ORBIT_RADIUS  = 52;   // 가상 원 반경 (입력점 중심)
const LERP          = 0.13;
const DRAG_THRESH   = 28;
const DBLCLICK_MS   = 320;
const DBLCLICK_RAD  = 20;
const HIDE_DELAY    = 4000;

/* ── state ── */
export let orbLock   = false;

let orb, orbLabel;
let orbX = -200, orbY = -200;      // 현재 렌더 위치
let targetX = -200, targetY = -200; // 목표 위치
let anchorX = 0, anchorY = 0;      // 입력점 (가상 원 중심)
let orbAngle = -Math.PI / 4;       // 현재 오브 각도 (기본: 오른쪽 위)
let targetAngle = -Math.PI / 4;

// 필기 방향 추적
let lastPointerX = 0, lastPointerY = 0;
let velX = 0, velY = 0;            // 이동 벡터 (smoothed)

let hideTimer   = 0;
let orbVisible  = false;
let orbActive   = false;           // 드래그 모드
let lastClickT  = 0, lastClickX = 0, lastClickY = 0;
let dragStartX  = 0;
let orbSteps    = 0;
let orbToolOrder = [];
let orbBaseIdx   = 0;
let previewIdx   = -1;

/* ── init ── */
export function initToolOrb () {
  orb = document.createElement('div');
  orb.id = 'tool-orb';
  orbLabel = document.createElement('span');
  orbLabel.id = 'tool-orb-label';
  orb.appendChild(orbLabel);
  document.body.appendChild(orb);

  /* 오브 위 더블클릭 감지 */
  orb.addEventListener('pointerdown', onOrbPointerDown, { passive: false });

  /* 전역 포인터 추적 */
  window.addEventListener('pointerdown', onGlobalDown, true);
  window.addEventListener('pointermove', onGlobalMove, true);
  window.addEventListener('pointerup',   onGlobalUp,   true);
  window.addEventListener('pointercancel', onGlobalUp, true);

  animLoop();
  updateLabel(tool());
}

/* ═══ 오브 위 pointerdown — 더블클릭 감지 ═══ */
function onOrbPointerDown (e) {
  e.stopPropagation();   // 캔버스 이벤트 차단
  e.preventDefault();

  const now = performance.now();
  const dx  = e.clientX - lastClickX;
  const dy  = e.clientY - lastClickY;
  const dist = Math.sqrt(dx*dx + dy*dy);

  if (now - lastClickT < DBLCLICK_MS && dist < DBLCLICK_RAD) {
    // 더블클릭 → 드래그 모드 진입
    activateOrbDrag(e);
  }
  lastClickT = now;
  lastClickX = e.clientX;
  lastClickY = e.clientY;
}

/* ═══ 전역 pointerdown ═══ */
function onGlobalDown (e) {
  if (orbActive) return;

  // 오브 자체 클릭이면 target 갱신 금지 (도망 방지)
  if (orb.contains(e.target)) return;

  // 툴바, 패널 등 UI 위면 무시
  const skip = e.target.closest('#toolbar, #pen-panel, #color-bar, #ctx-menu, .sys-window, #topbar');
  if (skip) return;

  // 앵커(입력점) 갱신
  anchorX = e.clientX;
  anchorY = e.clientY;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  velX = 0;
  velY = 0;

  // 오브 각도를 현재 값 유지 (자연스러운 전환)
  computeTargetFromAngle();

  showOrb();
  scheduleHide(HIDE_DELAY);
}

/* ═══ 전역 pointermove ═══ */
function onGlobalMove (e) {
  if (orbActive) {
    handleOrbDrag(e);
    return;
  }

  // 오브 위 hover면 무시
  if (orb.contains(e.target)) return;

  const skip = e.target.closest('#toolbar, #pen-panel, #color-bar, #ctx-menu, .sys-window, #topbar');
  if (skip) return;

  // 이동 벡터 업데이트 (smoothed)
  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;
  velX = velX * 0.6 + dx * 0.4;
  velY = velY * 0.6 + dy * 0.4;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;

  // 앵커 업데이트
  anchorX = e.clientX;
  anchorY = e.clientY;

  // 필기 방향 반대쪽으로 오브 회피
  computeAvoidanceAngle();
  computeTargetFromAngle();

  if (orbVisible) scheduleHide(HIDE_DELAY);
}

/* ═══ 전역 pointerup ═══ */
function onGlobalUp (e) {
  if (orbActive) {
    finishOrbDrag(e);
    return;
  }
}

/* ═══ 필기 회피 각도 계산 ═══ */
function computeAvoidanceAngle () {
  const speed = Math.sqrt(velX * velX + velY * velY);
  if (speed < 1.5) return; // 거의 정지 → 현재 각도 유지

  // 이동 방향의 반대편 + 약간 위쪽 선호
  let moveAngle = Math.atan2(velY, velX);
  let avoidAngle = moveAngle + Math.PI; // 반대

  // 위쪽 선호 보정 (weight towards upper-right)
  const preferAngle = -Math.PI / 4; // 오른쪽 위
  const blendFactor = Math.min(speed / 8, 1); // 빠를수록 회피 우선
  targetAngle = lerpAngle(preferAngle, avoidAngle, blendFactor * 0.7);
}

function computeTargetFromAngle () {
  targetX = anchorX + Math.cos(orbAngle) * ORBIT_RADIUS - ORB_SIZE / 2;
  targetY = anchorY + Math.sin(orbAngle) * ORBIT_RADIUS - ORB_SIZE / 2;
}

function lerpAngle (a, b, t) {
  // 각도 보간 (최단 경로)
  let diff = b - a;
  while (diff > Math.PI)  diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/* ═══ 드래그 모드 ═══ */
function activateOrbDrag (e) {
  orbActive = true;
  orbLock   = true;
  dragStartX = e.clientX;
  orbSteps   = 0;

  orbToolOrder = getToolOrder();
  const cur    = tool();
  orbBaseIdx   = orbToolOrder.indexOf(cur);
  if (orbBaseIdx < 0) orbBaseIdx = 0;
  previewIdx   = orbBaseIdx;

  orb.classList.add('orb-active');
  const tb = document.getElementById('toolbar');
  if (tb) tb.classList.add('tb-orb-zoom');

  previewToolHighlight(orbToolOrder[previewIdx]);
  updateLabel(orbToolOrder[previewIdx]);
}

function handleOrbDrag (e) {
  if (!orbActive) return;
  const dx = e.clientX - dragStartX;
  const raw = Math.round(dx / DRAG_THRESH);
  if (raw === orbSteps) return;
  orbSteps = raw;

  let idx = orbBaseIdx + orbSteps;
  idx = Math.max(0, Math.min(idx, orbToolOrder.length - 1));
  if (idx === previewIdx) return;
  previewIdx = idx;

  previewToolHighlight(orbToolOrder[previewIdx]);
  updateLabel(orbToolOrder[previewIdx]);

  if (navigator.vibrate) navigator.vibrate(8);
}

function finishOrbDrag () {
  if (!orbActive) return;
  const chosen = orbToolOrder[previewIdx] || tool();
  orbActive = false;
  orbLock   = false;

  orb.classList.remove('orb-active');
  const tb = document.getElementById('toolbar');
  if (tb) tb.classList.remove('tb-orb-zoom');

  clearPreviewHighlight();
  setTool(chosen);
  updateLabel(chosen);
  scheduleHide(HIDE_DELAY);
}

/* ═══ helpers ═══ */
function getToolOrder () {
  const btns = document.querySelectorAll('#toolbar .tbtn[data-tool]');
  return Array.from(btns).map(b => b.dataset.tool);
}

function previewToolHighlight (tid) {
  clearPreviewHighlight();
  const btn = document.querySelector(`#toolbar .tbtn[data-tool="${tid}"]`);
  if (btn) {
    btn.classList.add('orb-preview');
    btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }
}

function clearPreviewHighlight () {
  document.querySelectorAll('.tbtn.orb-preview').forEach(b => b.classList.remove('orb-preview'));
}

/* ── visibility ── */
function showOrb () {
  if (!orbVisible) {
    orbVisible = true;
    // 초기 위치를 즉시 점프
    orbX = targetX;
    orbY = targetY;
    applyPosition();
    orb.classList.add('orb-visible');
  }
}

function scheduleHide (ms) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (orbActive) return;
    orbVisible = false;
    orb.classList.remove('orb-visible');
  }, ms);
}

/* ── label ── */
function updateLabel (t) {
  const map = {
    select:'↖', edit:'✎', pan:'✋', pen:'🖊',
    highlight:'🖍', eraser:'⌫', sticky:'📒', card:'🗂',
    text:'T', rect:'▭', circle:'◯', arrow:'→', image:'🖼'
  };
  if (orbLabel) orbLabel.textContent = map[t] || '•';
}

/* ═══ animation loop ═══ */
function animLoop () {
  // 부드러운 각도 보간
  orbAngle = lerpAngle(orbAngle, targetAngle, 0.08);
  computeTargetFromAngle();

  // 위치 보간
  orbX += (targetX - orbX) * LERP;
  orbY += (targetY - orbY) * LERP;
  applyPosition();
  requestAnimationFrame(animLoop);
}

function applyPosition () {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x  = Math.max(0, Math.min(orbX, vw - ORB_SIZE));
  const y  = Math.max(0, Math.min(orbY, vh - ORB_SIZE));
  orb.style.transform = `translate(${x}px, ${y}px)`;
}
