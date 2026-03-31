// ═══════════════════════════════════════════════════
//  card.js — 카드 윈도우 & 서브블록
//
//  UPDATE: _createSubBlock export 추가 (history 복원용)
//  UPDATE: 서브블록 생성·드래그·리사이즈 후 pushState 호출
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { s2b } from './transform.js';
import { makeEl, addHandles, attachSelectClick } from './elements.js';
import { onTap } from './utils.js';
import { updateMinimap } from './layout.js';
import { pushState } from './history.js';

function createSubBlock(container, x = 10, y = 10) {
  const block = document.createElement('div');
  block.className = 'card-sub-block';
  block.style.cssText = `left:${x}px;top:${y}px;width:160px;height:100px;`;

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
  onTap(delBtn, () => { block.remove(); pushState(); });

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
  resizeHandle.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); initSubResize(block, e.clientX, e.clientY); });
  resizeHandle.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; e.stopPropagation(); e.preventDefault(); initSubResize(block, e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });

  // Sub-block drag
  dragHandle.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); initSubDrag(block, container, e.clientX, e.clientY); });
  dragHandle.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; e.stopPropagation(); e.preventDefault(); initSubDrag(block, container, e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });

  block.appendChild(header);
  block.appendChild(content);
  block.appendChild(resizeHandle);
  container.appendChild(block);

  pushState();
}

// history.js에서 카드 복원 시 서브블록 추가용
export { createSubBlock as _createSubBlock };

function initSubResize(block, startX, startY) {
  const w0 = block.offsetWidth, h0 = block.offsetHeight;
  block.classList.add('card-sub-resizing');

  function onMove(cx, cy) {
    block.style.width = Math.max(80, w0 + (cx - startX)) + 'px';
    block.style.height = Math.max(50, h0 + (cy - startY)) + 'px';
  }
  function onEnd() {
    block.classList.remove('card-sub-resizing');
    window.removeEventListener('mousemove', mm);
    window.removeEventListener('mouseup', mu);
    window.removeEventListener('touchmove', tm);
    window.removeEventListener('touchend', te);
    pushState();
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

function initSubDrag(block, container, startX, startY) {
  const ox = block.offsetLeft, oy = block.offsetTop;
  block.classList.add('card-sub-dragging');

  function onMove(cx, cy) {
    block.style.left = (ox + (cx - startX)) + 'px';
    block.style.top = (oy + (cy - startY)) + 'px';
  }
  function onEnd() {
    block.classList.remove('card-sub-dragging');
    window.removeEventListener('mousemove', mm);
    window.removeEventListener('mouseup', mu);
    window.removeEventListener('touchmove', tm);
    window.removeEventListener('touchend', te);
    pushState();
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
  onTap(closeBtn, () => { el.remove(); updateMinimap(); pushState(); });

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
  pushState();
}
