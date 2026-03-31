// ═══════════════════════════════════════════════════
//  mouse.js — 마우스 이벤트 핸들링
//
//  FIX: 올가미(lasso) 선택 후 마우스를 놓으면 선택이
//       유지되지 않는 문제 수정
//  - mouseup에서 finalizeLasso 후 clearLassoHover 명시 호출
//  - 올가미 종료 후 선택 요소가 있으면 deselectAll 방지
//  - mousedown에서 올가미 시작 전 기존 lasso 잔여 상태 정리
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { applyT, getVpRect, s2b } from './transform.js';
import { closeCtx } from './contextMenu.js';
import { deselectAll, showSelRect, highlightLasso, finalizeLasso, hideSelRect, clearLassoHover, doResize } from './selection.js';
import { startDraw, continueDraw, commitFreehandStroke, previewShape, finalizeShape, eraseAt } from './drawing.js';
import { addText } from './text.js';
import { updateMinimap } from './layout.js';

// 올가미 직후 상태 추적 — mousedown에서 올가미 직후의
// 빈 공간 클릭을 구분하기 위한 플래그
let justFinishedLasso = false;

export function initMouseEvents() {
  // Wheel zoom
  S.vp.addEventListener('wheel', e => {
    e.preventDefault(); closeCtx();
    const f = e.deltaY < 0 ? 1.09 : 0.92;
    const ns = Math.min(8, Math.max(0.08, S.T.s * f));
    const r = getVpRect();
    const lx = e.clientX - r.left, ly = e.clientY - r.top;
    S.T.x = lx - (lx - S.T.x) * (ns / S.T.s);
    S.T.y = ly - (ly - S.T.y) * (ns / S.T.s);
    S.T.s = ns; applyT();
  }, { passive: false });

  // Mouse down
  S.vp.addEventListener('mousedown', e => {
    if (e.button === 2) return;
    closeCtx();

    if (e.button === 1 || S.tool === 'pan') {
      S.setPanning(true);
      const r = getVpRect();
      S.setPanOrigin({ x: e.clientX - r.left - S.T.x, y: e.clientY - r.top - S.T.y });
      document.body.classList.add('panning');
      e.preventDefault(); return;
    }

    const bp = s2b(e.clientX, e.clientY);

    if (S.tool === 'pen' || S.tool === 'highlight') { startDraw(bp); return; }
    if (S.tool === 'eraser') { S.setDrawing(true); eraseAt(bp); return; }
    if (S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') { S.setDrawing(true); S.setShapeA(bp); return; }
    if (S.tool === 'text') { addText(bp); return; }
    if (S.tool === 'select') {
      if (!e.target.closest('.el')) {
        // 잔여 lasso-hover 정리
        clearLassoHover();

        // 빈 공간 클릭 → 기존 선택 해제 후 올가미 시작
        deselectAll();
        S.setLasso({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
        showSelRect(S.lasso);
        e.preventDefault();
      }
    }
  });

  // Mouse move
  window.addEventListener('mousemove', e => {
    // 올가미 직후 플래그가 남아있으면 해제
    justFinishedLasso = false;

    if (S.panning) {
      const r = getVpRect();
      S.T.x = e.clientX - r.left - S.panOrigin.x;
      S.T.y = e.clientY - r.top - S.panOrigin.y;
      applyT(); return;
    }
    if (S.dragging) {
      const bp = s2b(e.clientX, e.clientY);
      if (S.dragging.els) {
        S.dragging.els.forEach(d => { d.el.style.left = (bp.x - d.ox) + 'px'; d.el.style.top = (bp.y - d.oy) + 'px'; });
      } else {
        S.dragging.el.style.left = (bp.x - S.dragging.ox) + 'px';
        S.dragging.el.style.top = (bp.y - S.dragging.oy) + 'px';
      }
      updateMinimap(); return;
    }
    if (S.resizing) { doResize(e.clientX, e.clientY); return; }
    if (S.lasso) {
      S.lasso.x1 = e.clientX; S.lasso.y1 = e.clientY;
      showSelRect(S.lasso); highlightLasso(S.lasso); return;
    }
    if (!S.drawing) return;
    const bp = s2b(e.clientX, e.clientY);
    if (S.tool === 'pen' || S.tool === 'highlight') continueDraw(bp);
    if (S.tool === 'eraser') eraseAt(bp);
    if ((S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') && S.shapeA) previewShape(S.shapeA, bp);
  });

  // Mouse up
  window.addEventListener('mouseup', e => {
    document.body.classList.remove('panning');
    if (S.panning) { S.setPanning(false); return; }
    if (S.dragging) { S.setDragging(null); updateMinimap(); return; }
    if (S.resizing) { S.setResizing(null); updateMinimap(); return; }
    if (S.lasso) {
      finalizeLasso(S.lasso);
      clearLassoHover();
      S.setLasso(null);
      hideSelRect();
      justFinishedLasso = true;
      return;
    }
    if (!S.drawing) return;
    S.setDrawing(false);
    S.pCtx.clearRect(0, 0, S.pCvs.width, S.pCvs.height);
    if (S.tool === 'pen' || S.tool === 'highlight') commitFreehandStroke();
    if ((S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') && S.shapeA) {
      const bp = s2b(e.clientX, e.clientY);
      if (Math.abs(bp.x - S.shapeA.x) > 4 || Math.abs(bp.y - S.shapeA.y) > 4) finalizeShape(S.shapeA, bp);
      S.setShapeA(null);
    }
  });
}
