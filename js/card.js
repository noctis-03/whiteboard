// ═══════════════════════════════════════════════════
//  card.js — 카드 창 & 서브 블록 (CSS Grid 스냅)
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { applyT }       from './transform.js';
import { makeEl, addHandles, attachSelectClick } from './elements.js';
import { cancelLongPress } from './contextMenu.js';
import { updateMinimap }   from './layout.js';

/* ────────────────────────────────────────────────
   서브 블록 생성
   - 더 이상 절대 위치(left/top)를 사용하지 않음
   - CSS Grid가 자동으로 셀에 배치
   - 리사이즈 시 grid-column/grid-row span을 조절
   ──────────────────────────────────────────────── */
function createSubBlock(container) {
  const sub = document.createElement('div');
  sub.className = 'card-sub-block';
  // 기본 span = 1×1
  sub.dataset.colSpan = '1';
  sub.dataset.rowSpan = '1';

  // ── 헤더 ──
  const header = document.createElement('div');
  header.className = 'sub-header';

  const dragH = document.createElement('span');
  dragH.className = 'sub-drag-handle';
  dragH.textContent = '⠿';

  const title = document.createElement('span');
  title.className = 'sub-title';
  title.contentEditable = 'true';
  title.spellcheck = false;
  title.textContent = '블록';

  // 방향(크기) 토글 버튼: 1×1 → 2×1 → 1×2 → 2×2 → 1×1 순환
  const dirBtn = document.createElement('button');
  dirBtn.className = 'sub-dir-btn';
  dirBtn.textContent = '⇲';
  dirBtn.title = '크기 순환 (1×1 → 2×1 → 1×2 → 2×2)';
  const sizeSteps = [
    [1,1],[2,1],[1,2],[2,2]
  ];
  let sizeIdx = 0;
  dirBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sizeIdx = (sizeIdx + 1) % sizeSteps.length;
    const [c, r] = sizeSteps[sizeIdx];
    sub.dataset.colSpan = String(c);
    sub.dataset.rowSpan = String(r);
    sub.style.gridColumn = c > 1 ? `span ${c}` : '';
    sub.style.gridRow    = r > 1 ? `span ${r}` : '';
    dirBtn.textContent = c === 1 && r === 1 ? '⇲'
                       : c === 2 && r === 1 ? '⇔'
                       : c === 1 && r === 2 ? '⇕'
                       : '⤡';
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'sub-del-btn';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sub.remove();
  });

  header.append(dragH, title, dirBtn, delBtn);

  // ── 콘텐츠 ──
  const content = document.createElement('div');
  content.className = 'sub-content';
  content.contentEditable = 'true';
  content.spellcheck = false;

  // ── 리사이즈 핸들 (드래그로 span 조절) ──
  const resizeH = document.createElement('div');
  resizeH.className = 'sub-resize';
  initSubResize(sub, resizeH, container);

  sub.append(header, content, resizeH);

  // ── 드래그로 순서 변경 ──
  initSubDrag(sub, dragH, container);

  container.appendChild(sub);
  return sub;
}

/* ────────────────────────────────────────────────
   서브 블록 리사이즈 (span 조절 방식)
   - 마우스 드래그 거리를 계산하여 grid span을 동적으로 변경
   ──────────────────────────────────────────────── */
function initSubResize(sub, handle, container) {
  let startX, startY, startW, startH;

  function onDown(e) {
    e.stopPropagation();
    e.preventDefault();
    const ev = e.touches ? e.touches[0] : e;
    startX = ev.clientX;
    startY = ev.clientY;

    const rect = sub.getBoundingClientRect();
    startW = rect.width;
    startH = rect.height;

    sub.classList.add('card-sub-resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('touchend',  onUp);
  }

  function onMove(e) {
    e.preventDefault();
    const ev = e.touches ? e.touches[0] : e;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    // 컨테이너의 실제 열 너비와 행 높이를 계산
    const cStyle = getComputedStyle(container);
    const cols   = cStyle.gridTemplateColumns.split(' ');
    const rows   = cStyle.gridTemplateRows.split(' ');
    const colW   = parseFloat(cols[0]) || 120;
    const rowH   = parseFloat(rows[0]) || 80;
    const gap    = parseFloat(cStyle.gap) || 8;

    // 원래 크기 + 드래그 거리 → 필요 span 계산
    const newW = startW + dx;
    const newH = startH + dy;
    const cSpan = Math.max(1, Math.min(3, Math.round(newW / (colW + gap))));
    const rSpan = Math.max(1, Math.min(3, Math.round(newH / (rowH + gap))));

    sub.style.gridColumn = cSpan > 1 ? `span ${cSpan}` : '';
    sub.style.gridRow    = rSpan > 1 ? `span ${rSpan}` : '';
    sub.dataset.colSpan  = String(cSpan);
    sub.dataset.rowSpan  = String(rSpan);
  }

  function onUp() {
    sub.classList.remove('card-sub-resizing');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend',  onUp);
  }

  handle.addEventListener('mousedown',  onDown);
  handle.addEventListener('touchstart', onDown, {passive:false});
}

/* ────────────────────────────────────────────────
   서브 블록 드래그 (그리드 내 순서 변경)
   - 드래그 시 placeholder를 삽입하고 가장 가까운 셀로 이동
   ──────────────────────────────────────────────── */
function initSubDrag(sub, handle, container) {
  let placeholder = null;
  let dragging = false;
  let offsetX, offsetY;

  function onDown(e) {
    e.stopPropagation();
    cancelLongPress();
    const ev = e.touches ? e.touches[0] : e;
    const rect = sub.getBoundingClientRect();
    offsetX = ev.clientX - rect.left;
    offsetY = ev.clientY - rect.top;

    // 잠시 대기 후 드래그 시작 (실수 방지)
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('touchend',  onUp);
  }

  function startDrag() {
    dragging = true;
    sub.classList.add('card-sub-dragging');

    // placeholder 생성 (원래 위치 유지)
    placeholder = document.createElement('div');
    placeholder.className = 'card-sub-placeholder';
    if (sub.style.gridColumn) placeholder.style.gridColumn = sub.style.gridColumn;
    if (sub.style.gridRow)    placeholder.style.gridRow    = sub.style.gridRow;
    container.insertBefore(placeholder, sub);

    // 서브 블록을 절대 위치로 전환 (드래그 중)
    const rect = sub.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    sub.style.position = 'fixed';
    sub.style.left     = rect.left + 'px';
    sub.style.top      = rect.top  + 'px';
    sub.style.width    = rect.width + 'px';
    sub.style.height   = rect.height + 'px';
    sub.style.zIndex   = '1000';
    sub.style.pointerEvents = 'none';
    document.body.appendChild(sub);
  }

  function onMove(e) {
    e.preventDefault();
    const ev = e.touches ? e.touches[0] : e;

    if (!dragging) {
      startDrag();
    }

    sub.style.left = (ev.clientX - offsetX) + 'px';
    sub.style.top  = (ev.clientY - offsetY) + 'px';

    // placeholder 위치를 가장 가까운 형제 전으로 이동
    const children = [...container.querySelectorAll('.card-sub-block:not(.card-sub-dragging), .card-sub-placeholder')];
    let closest = null;
    let closestDist = Infinity;

    for (const child of children) {
      if (child === placeholder) continue;
      const r = child.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top  + r.height / 2;
      const dist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = child;
      }
    }

    if (closest) {
      const r = closest.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      if (ev.clientX < mid) {
        container.insertBefore(placeholder, closest);
      } else {
        container.insertBefore(placeholder, closest.nextSibling);
      }
    }
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend',  onUp);

    if (dragging) {
      // 그리드로 복귀
      sub.classList.remove('card-sub-dragging');
      sub.style.position = '';
      sub.style.left     = '';
      sub.style.top      = '';
      sub.style.width    = '';
      sub.style.height   = '';
      sub.style.zIndex   = '';
      sub.style.pointerEvents = '';

      if (placeholder && placeholder.parentNode) {
        container.insertBefore(sub, placeholder);
        placeholder.remove();
      } else {
        container.appendChild(sub);
      }
      placeholder = null;
      dragging = false;
    }
  }

  handle.addEventListener('mousedown',  onDown);
  handle.addEventListener('touchstart', onDown, {passive:false});
}

/* ────────────────────────────────────────────────
   카드 창 생성
   ──────────────────────────────────────────────── */
export function addCardWindow() {
  // 뷰포트 중앙 좌표 계산
  const vr = S.vp.getBoundingClientRect();
  const cx = (vr.width  / 2 - S.T.x) / S.T.scale;
  const cy = (vr.height / 2 - S.T.y) / S.T.scale;
  const w = 400, h = 360;

  const elDiv = makeEl(cx - w/2, cy - h/2, w, h);

  // ── 카드 창 바디 ──
  const card = document.createElement('div');
  card.className = 'card-window el-body';
  card.style.width  = '100%';
  card.style.height = '100%';

  // 헤더
  const hdr = document.createElement('div');
  hdr.className = 'card-header';

  const title = document.createElement('span');
  title.className = 'card-title';
  title.contentEditable = 'true';
  title.spellcheck = false;
  title.textContent = '새 창';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'card-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => {
    elDiv.remove();
    updateMinimap();
  });

  hdr.append(title, closeBtn);

  // 본문 (간단 설명)
  const body = document.createElement('div');
  body.className = 'card-content';
  body.contentEditable = 'true';
  body.spellcheck = false;

  // ★ 서브 블록 컨테이너 (CSS Grid)
  const subContainer = document.createElement('div');
  subContainer.className = 'card-sub-container';

  // + 블록 추가 버튼
  const addBtn = document.createElement('button');
  addBtn.className = 'card-add-sub';
  addBtn.textContent = '+ 블록 추가';
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    createSubBlock(subContainer);
  });

  card.append(hdr, body, subContainer, addBtn);
  elDiv.appendChild(card);

  // 핸들 & 선택
  addHandles(elDiv);
  attachSelectClick(elDiv);
  S.board.appendChild(elDiv);
  updateMinimap();
}
