// ═══════════════════════════════════════════════════
//  history.js — Undo / Redo (스냅샷 기반)
//
//  전략:
//    의미 있는 동작(드로잉 완료, 요소 추가/삭제/이동/리사이즈)이
//    끝날 때마다 pushState()를 호출하여 보드 전체를 JSON 스냅샷으로 저장.
//    Ctrl+Z → undo(),  Ctrl+Shift+Z / Ctrl+Y → redo()
//
//  스냅샷 내용:
//    - strokes: SVG 스트로크의 { kind, attrs }
//    - elements: 보드 위 .el 요소들의 outerHTML + 위치/크기
//
//  복원 시:
//    SVG를 재생성하고, DOM 요소를 다시 만든 뒤
//    이벤트 리스너를 재바인딩한다.
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { mkSvg, setAttrs } from './svg.js';
import { addHandles, attachSelectClick } from './elements.js';
import { deselectAll } from './selection.js';
import { updateMinimap } from './layout.js';
import { snack } from './utils.js';

const MAX_HISTORY = 60;

let undoStack = [];
let redoStack = [];
let restoring = false;   // 복원 중 플래그 (재귀 방지)

// ── 스냅샷 생성 ──
function takeSnapshot() {
  const snap = {
    strokes: S.strokes.map(s => ({ kind: s.kind, attrs: { ...s.attrs } })),
    elements: []
  };

  S.board.querySelectorAll('.el').forEach(el => {
    snap.elements.push({
      html: el.outerHTML,
      x: parseFloat(el.style.left),
      y: parseFloat(el.style.top),
      w: parseFloat(el.style.width),
      h: parseFloat(el.style.height),
      z: parseInt(el.style.zIndex) || 10
    });
  });

  return JSON.stringify(snap);
}

// ── 스냅샷 복원 ──
function restoreSnapshot(json) {
  restoring = true;

  deselectAll();

  const snap = JSON.parse(json);

  // SVG 스트로크 초기화 & 복원
  while (S.svgl.firstChild) S.svgl.removeChild(S.svgl.firstChild);
  S.setStrokes([]);

  if (snap.strokes) {
    snap.strokes.forEach(s => {
      let el;
      if (s.kind === 'rect') {
        el = mkSvg('rect');
        setAttrs(el, s.attrs);
      } else if (s.kind === 'ellipse') {
        el = mkSvg('ellipse');
        setAttrs(el, s.attrs);
      } else if (s.kind === 'arrow') {
        el = mkSvg('g');
        if (s.attrs.x1 !== undefined) {
          const line = mkSvg('line');
          setAttrs(line, {
            x1: s.attrs.x1, y1: s.attrs.y1,
            x2: s.attrs.x2, y2: s.attrs.y2,
            stroke: s.attrs.stroke,
            'stroke-width': s.attrs['stroke-width'],
            'stroke-linecap': 'round'
          });
          el.appendChild(line);
        }
        if (s.attrs.d) {
          const path = mkSvg('path');
          setAttrs(path, {
            d: s.attrs.d,
            stroke: s.attrs.stroke,
            'stroke-width': s.attrs['stroke-width'],
            'stroke-linecap': 'round',
            fill: 'none'
          });
          el.appendChild(path);
        }
      } else {
        // path, taper-path 등
        el = mkSvg('path');
        setAttrs(el, s.attrs);
      }
      S.svgl.appendChild(el);
      S.pushStroke({ kind: s.kind, attrs: s.attrs, svgEl: el });
    });
  }

  // DOM 요소 초기화 & 복원
  S.board.querySelectorAll('.el').forEach(el => el.remove());

  if (snap.elements) {
    snap.elements.forEach(data => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = data.html;
      const el = wrapper.firstElementChild;
      if (!el) return;

      // 기존 핸들 제거 (HTML에서 복원된 것은 이벤트가 없음)
      const oldHandles = el.querySelector('.el-handles');
      if (oldHandles) oldHandles.remove();

      // 위치/크기 보장
      el.style.left = data.x + 'px';
      el.style.top = data.y + 'px';
      el.style.width = data.w + 'px';
      el.style.height = data.h + 'px';
      el.style.zIndex = data.z;
      el.classList.remove('selected');

      S.board.appendChild(el);
      addHandles(el);
      attachSelectClick(el);

      // 포스트잇 내부 버튼 재바인딩
      rebindStickyEvents(el);
      // 카드 내부 버튼 재바인딩
      rebindCardEvents(el);
    });
  }

  updateMinimap();
  restoring = false;
}

// ── 포스트잇 내부 이벤트 재바인딩 ──
function rebindStickyEvents(el) {
  const stickyBody = el.querySelector('.sticky-body');
  if (!stickyBody) return;

  const STICKY_COLORS = ['#fef3c7', '#fce7f3', '#d1fae5', '#dbeafe', '#ede9fe', '#fee2e2', '#fef9c3'];
  let colorIdx = 0;

  // 현재 배경색과 가장 가까운 인덱스 찾기
  const currentBg = stickyBody.style.background || stickyBody.style.backgroundColor || '';
  STICKY_COLORS.forEach((c, i) => {
    if (currentBg.includes(c)) colorIdx = i;
  });

  const btns = stickyBody.querySelectorAll('.sticky-btn');
  btns.forEach(btn => {
    // 기존 이벤트 제거를 위해 복제-교체
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);

    if (clone.textContent.trim() === '🎨') {
      clone.addEventListener('click', e => {
        e.stopPropagation();
        colorIdx = (colorIdx + 1) % STICKY_COLORS.length;
        stickyBody.style.background = STICKY_COLORS[colorIdx];
      });
    }
    if (clone.textContent.trim() === '✕') {
      clone.addEventListener('click', e => {
        e.stopPropagation();
        el.remove();
        updateMinimap();
        pushState();
      });
    }
  });

  // textarea focus 이벤트
  const ta = stickyBody.querySelector('textarea');
  if (ta) {
    ta.addEventListener('focus', () => { el.style.zIndex = S.nextZ(); });
  }
}

// ── 카드 내부 이벤트 재바인딩 ──
function rebindCardEvents(el) {
  const cardBody = el.querySelector('.card-body');
  if (!cardBody) return;

  // 카드 닫기 버튼
  const closeBtn = cardBody.querySelector('.card-close-btn');
  if (closeBtn) {
    const clone = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(clone, closeBtn);
    clone.addEventListener('click', e => {
      e.stopPropagation();
      el.remove();
      updateMinimap();
      pushState();
    });
  }

  // 서브 컨테이너 & "블록 추가" 버튼
  const subContainer = cardBody.querySelector('.card-sub-container');
  const addBlockBtn = cardBody.querySelector('.card-add-block-btn');
  if (addBlockBtn && subContainer) {
    const clone = addBlockBtn.cloneNode(true);
    addBlockBtn.parentNode.replaceChild(clone, addBlockBtn);
    clone.addEventListener('click', e => {
      e.stopPropagation();
      // 동적 임포트로 순환 참조 회피
      import('./card.js').then(mod => {
        if (mod._createSubBlock) mod._createSubBlock(subContainer);
      });
    });
  }

  // 기존 서브블록들의 버튼 재바인딩
  if (subContainer) {
    subContainer.querySelectorAll('.card-sub-block').forEach(block => {
      rebindSubBlockEvents(block, subContainer);
    });
  }
}

function rebindSubBlockEvents(block, container) {
  // 삭제 버튼
  const delBtn = block.querySelector('.card-sub-btn-del');
  if (delBtn) {
    const clone = delBtn.cloneNode(true);
    delBtn.parentNode.replaceChild(clone, delBtn);
    clone.addEventListener('click', e => { e.stopPropagation(); block.remove(); });
  }

  // 방향 전환 버튼
  const dirBtns = block.querySelectorAll('.card-sub-btn:not(.card-sub-btn-del)');
  dirBtns.forEach(btn => {
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', e => {
      e.stopPropagation();
      const cur = block.dataset.dir || 'vertical';
      block.dataset.dir = cur === 'vertical' ? 'horizontal' : 'vertical';
    });
  });

  // 드래그 핸들
  const dragHandle = block.querySelector('.card-sub-drag-handle');
  if (dragHandle) {
    const clone = dragHandle.cloneNode(true);
    dragHandle.parentNode.replaceChild(clone, dragHandle);
    clone.addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault();
      initSubDragForHistory(block, container, e.clientX, e.clientY);
    });
    clone.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      e.stopPropagation(); e.preventDefault();
      initSubDragForHistory(block, container, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
  }

  // 리사이즈 핸들
  const resizeHandle = block.querySelector('.card-sub-resize-handle');
  if (resizeHandle) {
    const clone = resizeHandle.cloneNode(true);
    resizeHandle.parentNode.replaceChild(clone, resizeHandle);
    clone.addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault();
      initSubResizeForHistory(block, e.clientX, e.clientY);
    });
    clone.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      e.stopPropagation(); e.preventDefault();
      initSubResizeForHistory(block, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
  }
}

// 간단한 서브블록 드래그 (history 복원용)
function initSubDragForHistory(block, container, startX, startY) {
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

// 간단한 서브블록 리사이즈 (history 복원용)
function initSubResizeForHistory(block, startX, startY) {
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
//  Public API
// ═══════════════════════════════════════════════════

/** 현재 상태를 히스토리에 저장 (의미 있는 동작이 끝날 때 호출) */
export function pushState() {
  if (restoring) return;           // 복원 중이면 스킵

  const snapshot = takeSnapshot();

  // 직전 스냅샷과 동일하면 저장하지 않음 (중복 방지)
  if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snapshot) return;

  undoStack.push(snapshot);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();

  // 새 동작이 들어오면 redo 스택 초기화
  redoStack = [];
}

/** Undo — 이전 상태로 복원 */
export function undo() {
  if (undoStack.length <= 1) {
    snack('더 이상 실행 취소할 수 없습니다');
    return;
  }

  // 현재 상태를 redo 스택에 저장
  redoStack.push(undoStack.pop());

  // 이전 상태 복원
  const prev = undoStack[undoStack.length - 1];
  restoreSnapshot(prev);
  snack('실행 취소');
}

/** Redo — 다음 상태로 복원 */
export function redo() {
  if (redoStack.length === 0) {
    snack('다시 실행할 수 없습니다');
    return;
  }

  const next = redoStack.pop();
  undoStack.push(next);
  restoreSnapshot(next);
  snack('다시 실행');
}

/** 히스토리 초기화 (전체 지우기, 파일 불러오기 시) */
export function clearHistory() {
  undoStack = [];
  redoStack = [];
  pushState();   // 새 초기 상태 저장
}

/** 초기 상태 기록 (앱 시작 시 호출) */
export function initHistory() {
  pushState();
}

/** 복원 중인지 확인 (외부에서 pushState 호출 판단에 사용) */
export function isRestoring() {
  return restoring;
}
