// ═══════════════════════════════════════════════════
//  touch.js — 터치 이벤트 (1-finger, 핀치줌)
//
//  FIX: 마크다운 코드 블록 오염 제거
//  FIX: edit 도구 분기 중복 제거
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
import { orbLock, toolActivated, tryActivateByTap, scheduleRevertAfterUse } from './toolOrb.js';

const TAP_MOVE_THRESH = 12;
const TAP_TIME_THRESH = 250;

let tapStartX = 0;
let tapStartY = 0;
let tapStartTime = 0;
let tapPending = false;
let activatedThisTouch = false;

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

function startToolAction(touch) {
  const bp = s2b(touch.clientX, touch.clientY);

  if (S.tool === 'pen' || S.tool === 'highlight') {
    startDraw(bp);
    return true;
  }
  if (S.tool === 'eraser') {
    S.setDrawing(true);
    eraseAt(bp);
    return true;
  }
  if (S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') {
    S.setDrawing(true);
    S.setShapeA(bp);
    return true;
  }
  if (S.tool === 'text') {
    addText(bp);
    pushState();
    return true;
  }
  return false;
}

export function initTouchEvents() {
  S.vp.addEventListener('touchstart', e => {
    if (orbLock) { e.preventDefault(); return; }
    cancelLongPress();
    activatedThisTouch = false;

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

    // pendingTool 있고 아직 미활성화 → 탭 판정 추적 + pan 시작
    if (S.pendingTool && !toolActivated) {
      tapStartX = t.clientX;
      tapStartY = t.clientY;
      tapStartTime = Date.now();
      tapPending = true;

      const r = getVpRect();
      S.setTouchPanOrigin({ x: t.clientX - r.left - S.T.x, y: t.clientY - r.top - S.T.y });
      document.body.classList.add('panning');
      e.preventDefault();
      return;
    }

    // pendingTool 있고 이미 활성화 → 도구 동작 시작
    if (S.pendingTool && toolActivated) {
      if (S.tool === 'pen' || S.tool === 'highlight') { startDraw(s2b(t.clientX, t.clientY)); e.preventDefault(); return; }
      if (S.tool === 'eraser') { S.setDrawing(true); eraseAt(s2b(t.clientX, t.clientY)); e.preventDefault(); return; }
      if (S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') { S.setDrawing(true); S.setShapeA(s2b(t.clientX, t.clientY)); e.preventDefault(); return; }
      if (S.tool === 'text') { addText(s2b(t.clientX, t.clientY)); pushState(); e.preventDefault(); return; }
      if (S.tool === 'select') {
        if (!e.target.closest('.el')) {
          deselectAll();
          S.setTouchLasso({ x0: t.clientX, y0: t.clientY, x1: t.clientX, y1: t.clientY });
          startLongPress(e.target, t.clientX, t.clientY);
          showSelRect(S.touchLasso);
          e.preventDefault();
        }
        return;
      }
      if (S.tool === 'edit') {
        const elDiv = e.target.closest('.el');
        if (elDiv) focusEditableTouch(elDiv, t);
        else { const active = document.activeElement; if (active && active !== document.body) active.blur(); }
        return;
      }
      e.preventDefault();
      return;
    }

    // ── 기존 로직: pendingTool 없을 때 ──
    if (S.tool === 'pan') {
      const r = getVpRect();
      S.setTouchPanOrigin({ x: t.clientX - r.left - S.T.x, y: t.clientY - r.top - S.T.y });
      document.body.classList.add('panning');
      e.preventDefault(); return;
    }

    if (S.tool === 'edit') {
      const r = getVpRect();
      S.setTouchPanOrigin({ x: t.clientX - r.left - S.T.x, y: t.clientY - r.top - S.T.y });
      document.body.classList.add('panning');
      tapStartX = t.clientX;
      tapStartY = t.clientY;
      tapStartTime = Date.now();
      tapPending = true;
      e.preventDefault(); return;
    }

    const bp = s2b(t.clientX, t.clientY);
    if (S.tool === 'pen' || S.tool === 'highlight') { startDraw(bp); e.preventDefault(); return; }
    if (S.tool === 'eraser') { S.setDrawing(true); eraseAt(bp); e.preventDefault(); return; }
    if (S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') { S.setDrawing(true); S.setShapeA(bp); e.preventDefault(); return; }
    if (S.tool === 'text') { addText(bp); pushState(); e.preventDefault(); return; }

    if (S.tool === 'select') {
      if (!e.target.closest('.el')) {
        deselectAll();
        S.setTouchLasso({ x0: t.clientX, y0: t.clientY, x1: t.clientX, y1: t.clientY });
        startLongPress(e.target, t.clientX<span class="cursor">█</span>
