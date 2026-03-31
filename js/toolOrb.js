// ═══════════════════════════════════════════════════
//  toolOrb.js — 포인터 근처에 따라다니는 원(Orb)
//
//  기능: 입력(pointerdown) 위치의 오른쪽 위에 나타나서
//        부드럽게 따라다님. 더블클릭 후 홀드 → 좌우 드래그로
//        툴바의 현재 선택 도구를 좌/우로 전환.
//        손을 때면 해당 도구가 확정(선택)됨.
// ═══════════════════════════════════════════════════

import { tool } from './state.js';
import { setTool } from './tools.js';

/* ── 설정 ── */
const ORB_SIZE     = 36;       // 원 지름 (px)
const OFFSET_X     = 30;       // 포인터 대비 오른쪽 오프셋
const OFFSET_Y     = -28;      // 포인터 대비 위쪽 오프셋 (음수=위)
const LERP         = 0.15;     // 따라다니는 보간 계수 (0~1, 작을수록 느긋)
const DRAG_THRESH  = 28;       // 좌우 드래그 한 칸 전환에 필요한 px
const DBLCLICK_MS  = 300;      // 더블클릭 판정 시간
const DBLCLICK_RAD = 20;       // 더블클릭 판정 반경

/* ── 툴바 도구 순서 (separator/액션 제외, 순수 도구만) ── */
function getToolOrder() {
  const btns = document.querySelectorAll('#tb-tools .tbtn[data-tool], #tb-tools .tbtn[data-tool-or-panel]');
  const order = [];
  btns.forEach(btn => {
    const t = btn.dataset.tool || btn.dataset.toolOrPanel;
    if (t && !order.includes(t)) order.push(t);
  });
  return order;
}

/* ── DOM ── */
let orb;            // 원 엘리먼트
let orbLabel;       // 원 안 레이블

/* ── 상태 ── */
let targetX = -200, targetY = -200;   // 목표 위치 (화면 좌표)
let currentX = -200, currentY = -200; // 현재 보간 위치
let animId = null;
let visible = false;
let hideTimer = null;

// 더블클릭 감지
let lastDownTime = 0;
let lastDownX = 0, lastDownY = 0;

// 드래그 모드
let orbActive   = false;   // 더블클릭 후 홀드 중
let orbDragStartX = 0;     // 드래그 시작 X
let orbAccum    = 0;       // 누적 드래그 px (부호 포함)
let orbSteps    = 0;       // 현재까지 이동한 스텝 수 (부호)
let orbBaseIdx  = 0;       // 드래그 시작 시 도구 인덱스
let orbPreviewTool = '';   // 현재 미리보기 중인 도구

/* ═══════════════════════════════════════════════════
   초기화
═══════════════════════════════════════════════════ */
export function initToolOrb() {
  // DOM 생성
  orb = document.createElement('div');
  orb.id = 'tool-orb';
  orb.setAttribute('aria-hidden', 'true');

  orbLabel = document.createElement('span');
  orbLabel.id = 'tool-orb-label';
  orb.appendChild(orbLabel);

  document.body.appendChild(orb);

  // 이벤트: 포인터 이동 추적 (화면 어디서든)
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);

  // 애니메이션 루프
  animLoop();

  // 초기 레이블
  updateLabel(tool);
}

/* ═══════════════════════════════════════════════════
   포인터 이벤트
═══════════════════════════════════════════════════ */
function onPointerDown(e) {
  // 툴바/패널 위에서는 Orb 반응 안 함
  if (e.target.closest('#toolbar') || e.target.closest('#pen-panel') || e.target.closest('#color-bar')) return;

  const now = Date.now();
  const dx = e.clientX - lastDownX;
  const dy = e.clientY - lastDownY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // 더블클릭 판정
  if (now - lastDownTime < DBLCLICK_MS && dist < DBLCLICK_RAD) {
    // 더블클릭 → 홀드 모드 진입
    activateOrbDrag(e);
  }

  lastDownTime = now;
  lastDownX = e.clientX;
  lastDownY = e.clientY;

  // 목표 위치 갱신 (오른쪽 약간 위)
  targetX = e.clientX + OFFSET_X;
  targetY = e.clientY + OFFSET_Y;

  showOrb();
}

function onPointerMove(e) {
  if (orbActive) {
    // 드래그 모드: 좌우 이동량으로 도구 전환
    handleOrbDrag(e);
    // Orb 위치도 포인터 따라감
    targetX = e.clientX + OFFSET_X;
    targetY = e.clientY + OFFSET_Y;
    return;
  }

  // 일반 모드: 포인터 따라다님
  if (e.buttons > 0 || e.pointerType === 'touch') {
    targetX = e.clientX + OFFSET_X;
    targetY = e.clientY + OFFSET_Y;
    showOrb();
  }
}

function onPointerUp(e) {
  if (orbActive) {
    finishOrbDrag();
    return;
  }

  // 포인터 업 → 잠시 뒤 숨김
  scheduleHide(1200);
}

/* ═══════════════════════════════════════════════════
   Orb 드래그 모드 (더블클릭 후 홀드)
═══════════════════════════════════════════════════ */
function activateOrbDrag(e) {
  orbActive = true;
  orbDragStartX = e.clientX;
  orbAccum = 0;
  orbSteps = 0;

  const order = getToolOrder();
  orbBaseIdx = order.indexOf(tool);
  if (orbBaseIdx === -1) orbBaseIdx = 0;

  orbPreviewTool = tool;

  orb.classList.add('orb-active');
  updateLabel(tool);
}

function handleOrbDrag(e) {
  const totalDx = e.clientX - orbDragStartX;
  const newSteps = Math.trunc(totalDx / DRAG_THRESH);

  if (newSteps !== orbSteps) {
    orbSteps = newSteps;
    const order = getToolOrder();
    let idx = orbBaseIdx + newSteps;
    // 클램프
    idx = Math.max(0, Math.min(idx, order.length - 1));
    const newTool = order[idx];

    if (newTool !== orbPreviewTool) {
      orbPreviewTool = newTool;
      // 시각적 미리보기: 툴바 버튼 하이라이트
      previewToolHighlight(newTool);
      updateLabel(newTool);
      // 진동 피드백 (지원 시)
      if (navigator.vibrate) navigator.vibrate(8);
    }
  }
}

function finishOrbDrag() {
  if (!orbActive) return;
  orbActive = false;
  orb.classList.remove('orb-active');

  // 미리보기 도구를 실제 선택
  if (orbPreviewTool && orbPreviewTool !== tool) {
    setTool(orbPreviewTool);
  }

  // 미리보기 하이라이트 제거 (setTool이 처리하지만 안전하게)
  clearPreviewHighlight();
  updateLabel(orbPreviewTool || tool);
  scheduleHide(800);
}

/* ── 미리보기 하이라이트 ── */
function previewToolHighlight(t) {
  // 기존 미리보기 하이라이트 제거
  clearPreviewHighlight();
  const btn = document.querySelector(`#tb-tools .tbtn[data-tool="${t}"], #tb-tools .tbtn[data-tool-or-panel="${t}"]`);
  if (btn) {
    btn.classList.add('orb-preview');
    // 스크롤 가시 영역으로
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

function clearPreviewHighlight() {
  document.querySelectorAll('.orb-preview').forEach(b => b.classList.remove('orb-preview'));
}

/* ═══════════════════════════════════════════════════
   Orb 표시 / 숨김 / 레이블
═══════════════════════════════════════════════════ */
function showOrb() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (!visible) {
    visible = true;
    orb.classList.add('orb-visible');
    // 즉시 위치 점프 (첫 등장 시 보간 없이)
    currentX = targetX;
    currentY = targetY;
    applyPosition();
  }
}

function scheduleHide(ms) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    visible = false;
    orb.classList.remove('orb-visible');
    hideTimer = null;
  }, ms);
}

function updateLabel(t) {
  // 도구에 맞는 아이콘/레이블
  const map = {
    select:    '⊹',
    edit:      '✎',
    pan:       '✋',
    pen:       '✏️',
    highlight: '🖊️',
    eraser:    '◻',
    text:      'T',
    rect:      '□',
    circle:    '○',
    arrow:     '→',
  };
  orbLabel.textContent = map[t] || t.charAt(0).toUpperCase();
}

/* ═══════════════════════════════════════════════════
   애니메이션 루프 (부드러운 따라다님)
═══════════════════════════════════════════════════ */
function animLoop() {
  // 선형 보간
  currentX += (targetX - currentX) * LERP;
  currentY += (targetY - currentY) * LERP;

  applyPosition();
  animId = requestAnimationFrame(animLoop);
}

function applyPosition() {
  // 화면 밖 방지
  const half = ORB_SIZE / 2;
  const x = Math.max(half, Math.min(currentX, window.innerWidth - half));
  const y = Math.max(half, Math.min(currentY, window.innerHeight - half));
  orb.style.transform = `translate(${x - half}px, ${y - half}px)`;
}
