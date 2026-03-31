// ═══════════════════════════════════════════════════
//  contextMenu.js — 우클릭/롱프레스 컨텍스트 메뉴
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { duplicateEl } from './elements.js';
import { updateMinimap } from './layout.js';

export function showCtxMenu(el, cx, cy) {
  S.setCtxEl(el);
  const m = document.getElementById('ctx');
  const mw = 150, mh = 160;
  let lx = cx, ly = cy;
  if (lx + mw > innerWidth) lx = innerWidth - mw - 8;
  if (ly + mh > innerHeight) ly = cy - mh - 8;
  if (lx < 4) lx = 4;
  if (ly < 4) ly = 4;
  m.style.left = lx + 'px'; m.style.top = ly + 'px'; m.style.display = 'block';
}

export function closeCtx() { document.getElementById('ctx').style.display = 'none'; }

export function ctxDo(a) {
  if (!S.ctxEl) return;
  closeCtx();
  if (a === 'del') {
    const targets = S.selectedEls.length > 0 ? [...S.selectedEls] : [S.ctxEl];
    targets.forEach(e => e.remove());
    S.setSelectedEls([]); S.setSelected(null); updateMinimap();
  }
  if (a === 'dup') duplicateEl(S.ctxEl);
  if (a === 'front') S.ctxEl.style.zIndex = S.nextZ();
  if (a === 'back') S.ctxEl.style.zIndex = 1;
}

export function startLongPress(target, cx, cy) {
  S.setLongPressTimer(setTimeout(() => {
    const el = target.closest('.el');
    if (el) showCtxMenu(el, cx, cy);
  }, 500));
}

export function cancelLongPress() {
  clearTimeout(S.longPressTimer);
  S.setLongPressTimer(null);
}

export function initContextMenu() {
  S.vp.addEventListener('contextmenu', e => {
    e.preventDefault();
    const el = e.target.closest('.el');
    if (el) showCtxMenu(el, e.clientX, e.clientY);
  });
  document.addEventListener('click', () => closeCtx());

  // 컨텍스트 메뉴 항목 이벤트
  document.querySelectorAll('#ctx .citem').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      ctxDo(item.dataset.action);
    });
  });
}
