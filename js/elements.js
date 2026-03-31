// ═══════════════════════════════════════════════════
//  elements.js — DOM 요소 생성, 핸들, 이벤트 바인딩
//
//  FIX: Shift/Ctrl 클릭으로 다중 선택이 안 되던 문제 수정
//  원인: attachSelectClick에서 additive 모드에서
//        deselectAll()이 불필요하게 호출됨
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { s2b } from './transform.js';
import { select, deselectAll } from './selection.js';
import { updateMinimap } from './layout.js';
import { startLongPress, cancelLongPress } from './contextMenu.js';

export function makeEl(x, y, w, h) {
  const el = document.createElement('div');
  el.className = 'el';
  el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${S.nextZ()};`;
  return el;
}

export function addHandles(el) {
  const hc = document.createElement('div');
  hc.className = 'el-handles';

  const mv = document.createElement('div');
  mv.className = 'h-move';

  function startMove(cx, cy) {
    if (S.tool !== 'select') return;
    if (!S.selectedEls.includes(el)) { deselectAll(); select(el); }
    el.style.zIndex = S.nextZ();
    const bp = s2b(cx, cy);
    if (S.selectedEls.length > 1) {
      S.setDragging({ els: S.selectedEls.map(e2 => ({ el: e2, ox: bp.x - parseFloat(e2.style.left), oy: bp.y - parseFloat(e2.style.top) })) });
    } else {
      S.setDragging({ el, ox: bp.x - parseFloat(el.style.left), oy: bp.y - parseFloat(el.style.top) });
    }
  }

  mv.addEventListener('mousedown', e => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); startMove(e.clientX, e.clientY); });
  mv.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; e.stopPropagation(); e.preventDefault(); startMove(e.touches[0].clientX, e.touches[0].clientY); cancelLongPress(); }, { passive: false });
  hc.appendChild(mv);

  ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(dir => {
    const rh = document.createElement('div');
    rh.className = `h-resize ${dir}`;

    function startResize(cx, cy) {
      const r0 = { x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
      S.setResizing({ el, dir, r0, m0: s2b(cx, cy) });
    }

    rh.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); startResize(e.clientX, e.clientY); });
    rh.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; e.stopPropagation(); e.preventDefault(); startResize(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    hc.appendChild(rh);
  });

  el.appendChild(hc);
}

export function attachSelectClick(el) {
  el.addEventListener('mousedown', e => {
    if (S.tool !== 'select') return;
    e.stopPropagation();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;

    if (additive) {
      // Shift/Ctrl: 기존 선택 유지하면서 추가/토글
      select(el, true);
    } else {
      // 일반 클릭: 이미 선택된 요소가 아니면 전체 해제 후 단일 선택
      if (!S.selectedEls.includes(el)) {
        deselectAll();
      }
      select(el, false);
    }

    el.style.zIndex = S.nextZ();
    const bp = s2b(e.clientX, e.clientY);
    if (S.selectedEls.length > 1) {
      S.setDragging({ els: S.selectedEls.map(e2 => ({ el: e2, ox: bp.x - parseFloat(e2.style.left), oy: bp.y - parseFloat(e2.style.top) })) });
    } else if (S.selectedEls.length === 1) {
      S.setDragging({ el: S.selectedEls[0], ox: bp.x - parseFloat(S.selectedEls[0].style.left), oy: bp.y - parseFloat(S.selectedEls[0].style.top) });
    }
    e.preventDefault();
  });

  el.addEventListener('touchstart', e => {
    if (S.tool !== 'select' || e.touches.length !== 1) return;
    const tag = e.target.tagName;
    const isEditable = e.target.isContentEditable || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'BUTTON';
    if (isEditable) return;

    e.stopPropagation();
    const t = e.touches[0];
    startLongPress(e.target, t.clientX, t.clientY);
    if (!S.selectedEls.includes(el)) deselectAll();
    select(el, false);
    el.style.zIndex = S.nextZ();
    const bp = s2b(t.clientX, t.clientY);
    if (S.selectedEls.length > 1) {
      S.setDragging({ els: S.selectedEls.map(e2 => ({ el: e2, ox: bp.x - parseFloat(e2.style.left), oy: bp.y - parseFloat(e2.style.top) })) });
    } else {
      S.setDragging({ el, ox: bp.x - parseFloat(el.style.left), oy: bp.y - parseFloat(el.style.top) });
    }
    e.preventDefault();
  }, { passive: false });
}

export function duplicateEl(el) {
  const clone = el.cloneNode(true);
  clone.style.left = (parseFloat(el.style.left) + 20) + 'px';
  clone.style.top = (parseFloat(el.style.top) + 20) + 'px';
  clone.style.zIndex = S.nextZ();
  clone.classList.remove('selected');
  const oldHandles = clone.querySelector('.el-handles');
  if (oldHandles) oldHandles.remove();
  S.board.appendChild(clone);
  addHandles(clone);
  attachSelectClick(clone);
  updateMinimap();
}
