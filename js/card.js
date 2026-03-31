// ═══════════════════════════════════════════════════
//  card.js — 카드 윈도우 & 서브블록
//
//  UPDATE: 서브블록 생성·드래그·리사이즈 시
//          컨테이너 내부 그리드(20px)에 스냅
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { s2b } from './transform.js';
import { makeEl, addHandles, attachSelectClick } from './elements.js';
import { onTap } from './utils.js';
import { updateMinimap } from './layout.js';

// ── 그리드 스냅 설정 ──
const GRID = 20;                       // 스냅 단위 (px) — CSS background-size와 동일
const MIN_W = 80;                      // 서브블록 최소 너비
const MIN_H = 50;                      // 서브블록 최소 높이

/** 값을 GRID 단위로 반올림 */
function snap(v) {
  return Math.round(v / GRID) * GRID;
}

/** 컨테이너 안에서 블록이 넘치지 않도록 클램핑 + 스냅 */
function clampSnap(val, max) {
  return snap(Math.max(0, Math.min(val, max)));
}

function createSubBlock(container, x = 10, y = 10) {
  // ── 생성 좌표·크기도 그리드에 맞춤 ──
  const initW = snap(160);             // 160 → 160 (이미 정렬됨)
  const initH = snap(100);             // 100 → 100
  const sx = snap(x);
  const sy = snap(y);

  const block = document.createElement('div');
  block.className = 'card-sub-block';
  block.style.cssText = `left:${sx}px;top:${sy}px;width:${initW}px;height:${initH}px;`;

  const header = document.createElement('div');
  header.className = 'card-sub-header';

  const dragHandle = document.createElement('div');
  dragHandle.className = 'card-sub-drag-handle';
  dragHandle.textContent = '⠿';

  const title = document.createElement('div');
  title.className = 'card-sub-title';
  title.contentEditable = 'true';

  const actions = document.createElement('div');
  actions.className = 'card-sub-actions';

  const dirBtn = document.createElement('button');
  dirBtn.className = 'card-sub-btn';
  dirBtn.textContent = '⇄';
  onTap(dirBtn, () => {
    const cur = block.dataset.dir || 'vertical';
    block.dataset.dir = cur === 'vertical' ? 'horizontal' : 'vertical';
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'card-sub-btn card-sub-btn-del';
  delBtn.textContent = '✕';
  onTap(delBtn, () => block.remove());

  actions.appendChild(dirBtn);
  actions.appendChild(delBtn);
  header.appendChild(dragHandle);
  header.appendChild(title);
  header.appendChild(actions);

  const content = document.createElement('div');
  content.className = 'card-sub-content';
  content.contentEditable = 'true';
  content.dataset.placeholder = '내용을 입력하세요...';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'card-sub-resize-handle';

  // Sub-block resize
  resizeHandle.addEventListener('mousedown', e => {
    e.stopPropagation(); e.preventDefault();
    initSubResize(block, container, e.clientX, e.clientY);
  });
  resizeHandle.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    e.stopPropagation(); e.preventDefault();
    initSubResize(block, container, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  // Sub-block drag
  dragHandle.addEventListener('mousedown', e => {
    e.stopPropagation(); e.preventDefault();
    initSubDrag(block, container, e.clientX, e.clientY);
  });
  dragHandle.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    e.stopPropagation(); e.preventDefault();
    initSubDrag(block, container, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  block.appendChild(header);
  block.appendChild(content);
  block.appendChild(resizeHandle);
  container.appendChild(block);
}

// ═══════════════════════════════════════════════════
//  서브블록 리사이즈 — 드래그 중 자유 이동, 놓을 때 스냅
// ═══════════════════════════════════════════════════
function initSubResize(block, container, startX, startY) {
  const w0 = block.offsetWidth, h0 = block.offsetHeight;
  block.classList.add('card-sub-resizing');

  function onMove(cx, cy) {
    const rawW = Math.max(MIN_W, w0 + (cx - startX));
    const rawH = Math.max(MIN_H, h0 + (cy - startY));
    block.style.width  = rawW + 'px';
    block.style.height = rawH + 'px';
  }

  function onEnd() {
    // ── 놓을 때 그리드에 스냅 ──
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const bx = block.offsetLeft;

    let finalW = snap(Math.max(MIN_W, block.offsetWidth));
    let finalH = snap(Math.max(MIN_H, block.offsetHeight));

    // 컨테이너를 벗어나지 않도록 제한
    if (bx + finalW > cw) finalW = snap(Math.max(MIN_W, cw - bx));
    if (block.offsetTop + finalH > ch) finalH = snap(Math.max(MIN_H, ch - block.offsetTop));

    block.style.width  = finalW + 'px';
    block.style.height = finalH + 'px';

    block.classList.remove('card-sub-resizing');
    window.removeEventListener('mousemove', mm);
    window.removeEventListener('mouseup', mu);
    window.removeEventListener('touchmove', tm);
    window.removeEventListener('touchend', te);
  }

  const mm = e => onMove(e.clientX, e.clientY);
  const mu = () => onEnd();
  const tm = e => { if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY); };
  const te = () => onEnd();
  window.addEventListener('mousemove', mm);
  window.addEventListener('mouseup', mu);
  window.addEventListener('touchmove', tm, { passive: false });
  window.addEventListener('touchend', te);
}

// ═══════════════════════════════════════════════════
//  서브블록 드래그 — 드래그 중 자유 이동, 놓을 때 스냅
// ═══════════════════════════════════════════════════
function initSubDrag(block, container, startX, startY) {
  const ox = block.offsetLeft, oy = block.offsetTop;
  block.classList.add('card-sub-dragging');

  function onMove(cx, cy) {
    block.style.left = (ox + (cx - startX)) + 'px';
    block.style.top  = (oy + (cy - startY)) + 'px';
  }

  function onEnd() {
    // ── 놓을 때 그리드에 스냅 + 컨테이너 범위 제한 ──
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const bw = block.offsetWidth;
    const bh = block.offsetHeight;

    let finalX = snap(block.offsetLeft);
    let finalY = snap(block.offsetTop);

    // 음수 방지 & 컨테이너 밖으로 나가지 않게
    finalX = clampSnap(finalX, Math.max(0, cw - bw));
    finalY = clampSnap(finalY, Math.max(0, ch - bh));

    block.style.left = finalX + 'px';
    block.style.top  = finalY + 'px';

    block.classList.remove('card-sub-dragging');
    window.removeEventListener('mousemove', mm);
    window.removeEventListener('mouseup', mu);
    window.removeEventListener('touchmove', tm);
    window.removeEventListener('touchend', te);
  }

  const mm = e => onMove(e.clientX, e.clientY);
  const mu = () => onEnd();
  const tm = e => { if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY); };
  const te = () => onEnd();
  window.addEventListener('mousemove', mm);
  window.addEventListener('mouseup', mu);
  window.addEventListener('touchmove', tm, { passive: false });
  window.addEventListener('touchend', te);
}

export function addCardWindow() {
  const vr = S.vp.getBoundingClientRect();
  const bp = s2b(vr.left + vr.width / 2, vr.top + vr.height / 2);
  const el = makeEl(bp.x - 150, bp.y - 120, 300, 340);

  const body = document.createElement('div');
  body.className = 'el-body card-body';

  const header = document.createElement('div');
  header.className = 'card-header';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.contentEditable = 'true';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'card-close-btn';
  closeBtn.textContent = '✕';
  onTap(closeBtn, () => { el.remove(); updateMinimap(); });

  header.appendChild(title);
  header.appendChild(closeBtn);

  const content = document.createElement('div');
  content.className = 'card-content';
  content.contentEditable = 'true';
  content.dataset.placeholder = '본문을 입력하세요...';

  const subContainer = document.createElement('div');
  subContainer.className = 'card-sub-container';

  const addBlockBtn = document.createElement('button');
  addBlockBtn.className = 'card-add-block-btn';
  addBlockBtn.textContent = '+ 블록 추가';
  onTap(addBlockBtn, () => createSubBlock(subContainer));

  body.appendChild(header);
  body.appendChild(content);
  body.appendChild(subContainer);
  body.appendChild(addBlockBtn);
  el.appendChild(body);
  addHandles(el);
  attachSelectClick(el);
  S.board.appendChild(el);
  updateMinimap();
}
