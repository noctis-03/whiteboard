// ═══════════════════════════════════════════════════
//  touch.js — 터치 이벤트 (1-finger, 핀치줌)
//
//  UPDATE: orbLock 활성 시 모든 도구 동작 차단
//  UPDATE: 도구 사용 완료 시 scheduleRevertAfterUse 호출
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { applyT, getVpRect, s2b } from './transform.js';
import { closeCtx, startLongPress, cancelLongPress } from './contextMenu.js';
import { deselectAll, showSelRect, highlightLasso, finalizeLasso, hideSelRect, clearLassoHover, doResize } from './selection.js';
import { startDraw, continueDraw, commitFreehandStroke, previewShape, finalizeShape, eraseAt, commitErase } from './drawing.js';
import { addText } from './text.js';
import { updateMinimap } from './layout.js';
import { focusEditableTouch } from './edit.js';
import { pushState } from './history.js';
import { orbLock, scheduleRevertAfterUse } from './toolOrb.js';

function cancelSingleFingerActions() {
  if (S.drawing) {
    S.setDrawing(false);
    if (S.livePth && S.livePth.parentNode) S.svgl.removeChild(S.livePth);
    S.setLivePth(null); S.setDrawPts([]); S.setShapeA(null);
    S.pCtx.clearRect(0, 0, S.pCvs.width, S.pCvs.height);
  }
  if (S.touchLasso) { S.setTouchLasso(null); hideSelRect(); clearLassoHover(); }
  if (S.touchPanOrigin) { S.setTouchPanOrigin(null); document.body.classList.remove('panning'); }
  if (S.dragging) S.setDragging(null);
  if (S.resizing) S.setResizing(null);
  cancelLongPress();
}

export function initTouchEvents() {
  S.vp.addEventListener('touchstart', e => {
    if (orbLock) { e.preventDefault(); return; }
    cancelLongPress();
    if (e.touches.length === 2) {
      cancelSingleFingerActions();
      const t0 = e.touches[0], t1 = e.touches[1];
      S.setPinchDist(Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY));
      S.setPinchMid({ x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 });
      S.setPinchActive(true);
      e.preventDefault();
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    closeCtx();

    if (S.tool === 'pan') {
      const r = getVpRect();
      S.setTouchPanOrigin({ x: t.clientX - r.left - S.T.x, y: t.clientY - r.top - S.T.y });
      document.body.classList.add('panning');
      e.preventDefault(); return;
    }

    const bp = s2b(t.clientX, t.clientY);
    if (S.tool === 'pen' || S.tool === 'highlight') { startDraw(bp); e.preventDefault(); return; }
    if (S.tool === 'eraser') { S.setDrawing(true); eraseAt(bp); e.preventDefault(); return; }
    if (S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') { S.setDrawing(true); S.setShapeA(bp); e.preventDefault(); return; }
    if (S.tool === 'text') { addText(bp); pushState(); e.preventDefault(); return; }

    if (S.tool === 'edit') {
      const elDiv = e.target.closest('.el');
      if (elDiv) {
        focusEditableTouch(elDiv, t);
      } else {
        const active = document.activeElement;
        if (active && active !== document.body) active.blur();
      }
      return;
    }

    if (S.tool === 'select') {
      if (!e.target.closest('.el')) {
        deselectAll();
        S.setTouchLasso({ x0: t.clientX, y0: t.clientY, x1: t.clientX, y1: t.clientY });
        startLongPress(e.target, t.clientX, t.clientY);
        showSelRect(S.touchLasso);
        e.preventDefault();
      }
    }
  }, { passive: false });

  window.addEventListener('touchmove', e => {
    if (orbLock) { e.preventDefault(); return; }

    if (e.touches.length === 2 && S.pinchActive) {
      e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      const newDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const newMid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      if (S.pinchMid) { S.T.x += newMid.x - S.pinchMid.x; S.T.y += newMid.y - S.pinchMid.y; }
      if (S.pinchDist && S.pinchDist > 0) {
        const ratio = newDist / S.pinchDist;
        const ns = Math.min(8, Math.max(0.08, S.T.s * ratio));
        const r = getVpRect();
        const mx = newMid.x - r.left, my = newMid.y - r.top;
        S.T.x = mx - (mx - S.T.x) * (ns / S.T.s);
        S.T.y = my - (my - S.T.y) * (ns / S.T.s);
        S.T.s = ns;
      }
      S.setPinchDist(newDist); S.setPinchMid(newMid);
      applyT(); return;
    }

    if (e.touches.length !== 1) return;
    cancelLongPress();
    const t = e.touches[0];

    if (S.tool === 'edit') return;

    if (S.touchPanOrigin) {
      const r = getVpRect();
      S.T.x = t.clientX - r.left - S.touchPanOrigin.x;
      S.T.y = t.clientY - r.top - S.touchPanOrigin.y;
      applyT(); e.preventDefault(); return;
    }
    if (S.dragging) {
      const bp = s2b(t.clientX, t.clientY);
      if (S.dragging.els) { S.dragging.els.forEach(d => { d.el.style.left = (bp.x - d.ox) + 'px'; d.el.style.top = (bp.y - d.oy) + 'px'; }); }
      else { S.dragging.el.style.left = (bp.x - S.dragging.ox) + 'px'; S.dragging.el.style.top = (bp.y - S.dragging.oy) + 'px'; }
      updateMinimap(); e.preventDefault(); return;
    }
    if (S.resizing) { doResize(t.clientX, t.clientY); updateMinimap(); e.preventDefault(); return; }
    if (S.touchLasso) {
      S.touchLasso.x1 = t.clientX; S.touchLasso.y1 = t.clientY;
      showSelRect(S.touchLasso); highlightLasso(S.touchLasso); e.preventDefault(); return;
    }
    if (!S.drawing) return;
    e.preventDefault();
    const bp = s2b(t.clientX, t.clientY);
    if (S.tool === 'pen' || S.tool === 'highlight') continueDraw(bp);
    if (S.tool === 'eraser') eraseAt(bp);
    if ((S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') && S.shapeA) previewShape(S.shapeA, bp);
  }, { passive: false });

  window.addEventListener('touchend', e => {
    if (orbLock) return;
    cancelLongPress();
    document.body.classList.remove('panning');

    if (e.touches.length === 0 && S.pinchActive) { S.setPinchActive(false); S.setPinchDist(null); S.setPinchMid(null); }
    if (S.touchPanOrigin) { S.setTouchPanOrigin(null); return; }
    if (S.dragging) { S.setDragging(null); updateMinimap(); pushState(); return; }
    if (S.resizing) { S.setResizing(null); updateMinimap(); pushState(); return; }
    if (S.touchLasso) { finalizeLasso(S.touchLasso); S.setTouchLasso(null); hideSelRect(); clearLassoHover(); return; }
    if (!S.drawing) return;
    S.setDrawing(false);
    S.pCtx.clearRect(0, 0, S.pCvs.width, S.pCvs.height);
    const lastT = e.changedTouches[0];
    if (S.tool === 'pen' || S.tool === 'highlight') commitFreehandStroke();
    if (S.tool === 'eraser') commitErase();
    if ((S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') && S.shapeA) {
      if (lastT) {
        const bp = s2b(lastT.clientX, lastT.clientY);
        if (Math.abs(bp.x - S.shapeA.x) > 4 || Math.abs(bp.y - S.shapeA.y) > 4) finalizeShape(S.shapeA, bp);
      }
      S.setShapeA(null);
    }

    // ★ 도구 사용 완료 → pan 복귀 스케줄
    scheduleRevertAfterUse();
  });
}
